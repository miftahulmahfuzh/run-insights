import {
  estimateFromCharts,
  type ChartEstimate,
  type ChartEstimateInput,
  type EstimatedSplit,
  type RgbImage,
} from '@/lib/extract/chart/estimate'
import type { DetailsPrinted, EstimatedValues } from '@/lib/schema/detailsPrinted'
import { RawExtractedSession, type ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * How a Workout Details reading and its chart estimate enter an extraction's parsed session.
 *
 * PURE MODULE — no I/O, no `server-only`. The rules are the analysis's assumptions, in order:
 *
 *  - A7  Values the details screen PRINTS that another screen also prints (duration, distance,
 *        elevation gain, average HR, average pace) only fill a null the other screens left.
 *  - A1  A SPLITS screenshot wins outright: no estimate is even attempted (R1.2).
 *  - A2  A transcribed distance (Summary, or printed on the details screen) is handed to the
 *        estimator as `knownDistanceKm`, which scales its splits to it; the distance is then not
 *        estimated, the splits are.
 *        Otherwise the estimated distance fills the null `distanceKm` (R2.3).
 *  - Estimated splits fill an EMPTY splits array only.
 *
 * Every number written here was produced by `lib/extract/chart/*` or transcribed from a screen;
 * nothing is computed by a model (invariant 3).
 */

export interface MergeInput {
  session: ExtractedSession
  printed: DetailsPrinted | null
  image: RgbImage | null
  /** From OUR upload records: was a `splits` screenshot part of this extraction? */
  hasSplitsScreen: boolean
}

interface Merged {
  session: ExtractedSession
  estimate: EstimatedValues | null
}

/** A7: printed values fill nulls only. Returns a fresh session; arrays are copied. */
export function fillFromPrinted(
  session: ExtractedSession,
  printed: DetailsPrinted | null,
): ExtractedSession {
  const out: ExtractedSession = {
    ...session,
    splits: session.splits.map((s) => ({ ...s })),
    hrZones: session.hrZones.map((z) => ({ ...z })),
    postWorkoutHr: session.postWorkoutHr.map((p) => ({ ...p })),
  }
  if (printed === null) return out
  out.durationSec ??= printed.durationSec
  out.distanceKm ??= printed.distanceKm
  out.elevationGainM ??= printed.elevationGainM
  out.avgHrBpm ??= printed.avgHrBpm
  out.avgPaceSecPerKm ??= printed.avgPaceSecPerKm
  return out
}

/**
 * The estimator's input, or null when no estimate may or can be made: a splits screenshot exists
 * (A1), the reading failed, or the duration or the printed pace range is missing (R2.4).
 *
 * The duration prefers the details screen's own figure — it is the end label of the very time axis
 * the chart spans — and falls back to the Summary's.
 */
export function estimateInputFor(
  session: ExtractedSession,
  printed: DetailsPrinted | null,
  hasSplitsScreen: boolean,
): ChartEstimateInput | null {
  if (hasSplitsScreen || printed === null) return null
  const durationSec = printed.durationSec ?? session.durationSec
  const { paceSlowestSecPerKm, paceFastestSecPerKm } = printed
  if (durationSec === null || paceSlowestSecPerKm === null || paceFastestSecPerKm === null) {
    return null
  }
  return {
    durationSec,
    paceSlowestSecPerKm,
    paceFastestSecPerKm,
    hrMinBpm: printed.hrMinBpm,
    hrMaxBpm: printed.hrMaxBpm,
    knownDistanceKm: session.distanceKm,
  }
}

/**
 * The estimator's rows in the stored split shape: integer seconds, an HR outside the schema's
 * 40–230 band dropped to null, cadence null. Any unusable row voids the whole table — a table with a
 * hole is worse than none, and the reviewer can still type rows by hand.
 */
function toExtractedSplits(rows: readonly EstimatedSplit[]): ExtractedSession['splits'] {
  const out = rows.map((row) => {
    const hr = row.hrBpm === null ? null : Math.round(row.hrBpm)
    return {
      km: row.km,
      timeSec: Math.round(row.timeSec),
      paceSecPerKm: Math.round(row.paceSecPerKm),
      hrBpm: hr !== null && hr >= 40 && hr <= 230 ? hr : null,
      cadenceSpm: null,
      partial: row.partial,
    }
  })
  const usable = out.every(
    (r) => Number.isInteger(r.km) && r.km > 0 && r.timeSec > 0 && r.paceSecPerKm > 0,
  )
  return usable ? out : []
}

/** A2 + R2.3: write the estimate into the empty slots, and record exactly what was written. */
export function applyEstimate(session: ExtractedSession, estimate: ChartEstimate | null): Merged {
  if (estimate === null) return { session, estimate: null }
  const out: ExtractedSession = { ...session }

  let distanceKm: number | null = null
  if (out.distanceKm === null && estimate.distanceWasEstimated) {
    out.distanceKm = estimate.distanceKm
    distanceKm = estimate.distanceKm
  }

  let splits = false
  if (out.splits.length === 0) {
    const rows = toExtractedSplits(estimate.splits)
    if (rows.length > 0) {
      out.splits = rows
      splits = true
    }
  }

  if (distanceKm === null && !splits) return { session: out, estimate: null }
  return { session: out, estimate: { distanceKm, splits } }
}

/**
 * The whole merge. The result is re-checked against the session schema — the review screen and
 * `GET /api/extract/[id]` read `parsedSession` as already validated — and an estimate the schema
 * refuses is dropped rather than stored (invariant 4: never the reason an extraction is worse).
 */
export function mergeWorkoutDetails(input: MergeInput): Merged {
  const filled = fillFromPrinted(input.session, input.printed)
  const chartInput = estimateInputFor(filled, input.printed, input.hasSplitsScreen)
  const chart =
    input.image !== null && chartInput !== null ? estimateFromCharts(input.image, chartInput) : null
  const merged = applyEstimate(filled, chart)
  if (RawExtractedSession.safeParse(merged.session).success) return merged
  return RawExtractedSession.safeParse(filled).success
    ? { session: filled, estimate: null }
    : { session: input.session, estimate: null }
}
