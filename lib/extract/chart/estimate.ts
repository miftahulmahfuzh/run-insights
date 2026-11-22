import { SLOT_COUNT, locateHrChart, locatePaceChart } from './locate'
import { measureHrSlots, measurePaceSlots } from './measure'
import type { RgbImage } from './pixels'

/**
 * **The Workout Details chart estimator** — distance and per-kilometre splits from the pixels of
 * Apple Fitness's Pace and Heart Rate charts, for a run whose watch produced no split table.
 *
 * PURE: no `sharp`, no `server-only`, no I/O, no model. "The LLM never computes" (CLAUDE.md):
 * the vision model only transcribes the printed duration, pace range and HR range; every number
 * below is arithmetic on those and on bar heights. `./decode.ts` turns bytes into an
 * {@link RgbImage}; the extraction job calls this (WORKOUT_DETAILS_ESTIMATE_PLAN phase 3).
 *
 * ── THE METHOD (calibrated on the 2026-11-20 run, truth 6.04 km) ────────────────────────────
 *   1. The pace chart is 90 equal time slots; a slot's value is its tallest teal bar.
 *   2. The shortest bar is the slowest printed pace, the tallest the fastest, and height is
 *      linear in SPEED (1/pace): 6.07 km at 739 px, 6.08 km at 560 px JPEG q80. Linear in pace
 *      gave 5.99 km and worse splits.
 *   3. Distance = Σ speed × slot duration. Each whole-km boundary is interpolated inside the slot
 *      whose cumulative distance crosses it; a remainder > 0.05 km is the final partial row (the
 *      review screen's CHK-4 rule), a smaller one is folded away.
 *   4. HR per slot = midpoint of its red marks mapped onto the printed HR range; empty slots are
 *      interpolated; a split's HR is the time-weighted mean of the slots it covers.
 *   5. A transcribed distance, when there is one, wins: speeds are scaled so they total it.
 *
 * Every failure is `null`, never a throw, so the caller can always finish the extraction without
 * an estimate (R2.4).
 */

/** @public A decoded RGB image — consumed by `lib/llm/runExtractionJob.ts` (phase 3). */
export type { RgbImage }

/** @public What the details screen printed — built by the extraction job (phase 3). */
export interface ChartEstimateInput {
  /** Printed workout duration. */
  durationSec: number
  /** Printed pace range, left value (e.g. 9'12" -> 552). */
  paceSlowestSecPerKm: number
  /** Printed pace range, right value (e.g. 6'47" -> 407). */
  paceFastestSecPerKm: number
  /** Printed HR range, low. */
  hrMinBpm: number | null
  /** Printed HR range, high. */
  hrMaxBpm: number | null
  /** A transcribed distance; when set, speeds are scaled to total exactly this. */
  knownDistanceKm: number | null
}

/** @public One estimated split row — the shape of `ExtractedSplit` (lib/schema/extractedSession.ts). */
export interface EstimatedSplit {
  km: number
  timeSec: number
  paceSecPerKm: number
  hrBpm: number | null
  cadenceSpm: null
  partial: boolean
}

/** @public The estimate — consumed by `lib/llm/runExtractionJob.ts` (phase 3). */
export interface ChartEstimate {
  /** 2 decimals; equals knownDistanceKm when that was given. */
  distanceKm: number
  /** false when knownDistanceKm was given. */
  distanceWasEstimated: boolean
  /**
   * Full km rows, then one partial row when the 2-decimal remainder is > 0.05 km. A smaller
   * remainder is folded away: no row, and its seconds join no full row.
   */
  splits: EstimatedSplit[]
  /** 90. */
  slotCount: number
}

/**
 * The smallest remainder that earns its own partial row, tested exactly as CHK-4 does
 * (`lib/review/checks.ts` `partialConsistency`: `round2(remainder) > PARTIAL_MIN_KM`, strict), so
 * an estimate never draws the review screen's "marked partial, but … no part-kilometre" advisory.
 */
const MIN_PARTIAL_KM = 0.05

/** null = the pace chart could not be located / measured, or the inputs are unusable. Never throws. */
export function estimateFromCharts(
  image: RgbImage,
  input: ChartEstimateInput,
): ChartEstimate | null {
  try {
    if (!inputsUsable(input)) return null
    const pace = locatePaceChart(image)
    if (pace === null) return null
    const heights = measurePaceSlots(pace)

    let hrSlots: number[] | null = null
    const { hrMinBpm: hrMin, hrMaxBpm: hrMax } = input
    const hrUsable =
      hrMin !== null && hrMax !== null && Number.isFinite(hrMin) && Number.isFinite(hrMax)
    if (hrUsable && hrMin > 0 && hrMax > hrMin) {
      const hr = locateHrChart(image, pace.top)
      if (hr !== null) hrSlots = measureHrSlots(image, pace, hr, hrMin, hrMax)
    }
    return estimateFromHeights(heights, hrSlots, input)
  } catch {
    return null
  }
}

/** The boundary check: the printed values the estimate is scaled by must make sense. */
function inputsUsable(input: ChartEstimateInput): boolean {
  const { durationSec, paceSlowestSecPerKm: slow, paceFastestSecPerKm: fast } = input
  return (
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    Number.isFinite(slow) &&
    Number.isFinite(fast) &&
    fast > 0 &&
    slow > fast
  )
}

/** The arithmetic, on the 90 measured slot heights (and HR per slot, when the HR chart read). */
function estimateFromHeights(
  heights: readonly number[],
  hrSlots: readonly number[] | null,
  input: ChartEstimateInput,
): ChartEstimate | null {
  const lo = Math.min(...heights)
  const hi = Math.max(...heights)
  if (!(hi > lo)) return null // a flat chart has no scale

  const T = input.durationSec
  const dt = T / SLOT_COUNT
  const slowSpeed = 1 / input.paceSlowestSecPerKm // km per second
  const fastSpeed = 1 / input.paceFastestSecPerKm
  let speeds = heights.map((h) => slowSpeed + (fastSpeed - slowSpeed) * ((h - lo) / (hi - lo)))
  let total = speeds.reduce((sum, v) => sum + v * dt, 0)

  const known = input.knownDistanceKm
  const useKnown = known !== null && Number.isFinite(known) && known > 0
  if (useKnown) {
    const scale = known / total
    speeds = speeds.map((v) => v * scale)
    total = known
  }
  if (!Number.isFinite(total) || total <= 0) return null

  // Whole-km crossing times, interpolated inside the slot that crosses each boundary.
  const crossings: number[] = []
  let cum = 0
  speeds.forEach((v, i) => {
    const d = v * dt
    while (cum + d >= crossings.length + 1 - 1e-9 && crossings.length + 1 <= total + 1e-9) {
      crossings.push(i * dt + (crossings.length + 1 - cum) / v)
    }
    cum += d
  })

  const hrBetween = (from: number, to: number): number | null => {
    if (hrSlots === null || !(to > from)) return null
    let weighted = 0
    hrSlots.forEach((bpm, i) => {
      const overlap = Math.min(to, (i + 1) * dt) - Math.max(from, i * dt)
      if (overlap > 0) weighted += bpm * overlap
    })
    return Math.round(weighted / (to - from))
  }

  // Boundaries are rounded once and differenced, so the rows sum to the rounded duration.
  const splits: EstimatedSplit[] = []
  let previousBoundary = 0
  let previousExact = 0
  crossings.forEach((t, index) => {
    const boundary = Math.round(t)
    const timeSec = boundary - previousBoundary
    if (timeSec > 0) {
      splits.push({
        km: index + 1,
        timeSec,
        paceSecPerKm: timeSec,
        hrBpm: hrBetween(previousExact, t),
        cadenceSpm: null,
        partial: false,
      })
    }
    previousBoundary = boundary
    previousExact = t
  })

  const remainderKm = total - crossings.length
  const partialTime = Math.round(T) - previousBoundary
  // Folded away when it is CHK-4's "rounding", not a part-kilometre: no row, and its seconds are
  // NOT added to the last full row (that row's time must stay one kilometre's time).
  const remainderShownKm = Math.round(remainderKm * 100) / 100
  if (remainderShownKm > MIN_PARTIAL_KM && partialTime > 0) {
    splits.push({
      km: crossings.length + 1,
      timeSec: partialTime,
      paceSecPerKm: Math.round(partialTime / remainderKm),
      hrBpm: hrBetween(previousExact, T),
      cadenceSpm: null,
      partial: true,
    })
  }

  return {
    distanceKm: Math.round(total * 100) / 100,
    distanceWasEstimated: !useKnown,
    splits,
    slotCount: SLOT_COUNT,
  }
}
