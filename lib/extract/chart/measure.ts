import { SLOT_COUNT, slotColumns, type HrChartBand, type PaceChartBand } from './locate'
import { isRedAt, type RgbImage } from './pixels'

/**
 * Turn located chart bands into per-slot numbers. Pure.
 *
 * Apple draws the whole workout as 90 equal time slots across the chart's x-extent. The bars are
 * 2-4 px wide at a ~7.45 px pitch (739 px image), so the slot grid is computed from the extent,
 * never from detected bar edges — JPEG splits and merges bars, the grid does not move.
 */

/** The tallest bar in each slot, in px. Length {@link SLOT_COUNT}. */
export function measurePaceSlots(band: PaceChartBand): number[] {
  const heights: number[] = []
  for (let i = 0; i < SLOT_COUNT; i++) {
    const [start, end] = slotColumns(band.x0, band.x1, i, SLOT_COUNT)
    let tallest = 0
    for (let x = start; x < end; x++) {
      const h = band.columnHeights[x] ?? 0
      if (h > tallest) tallest = h
    }
    heights.push(tallest)
  }
  return heights
}

/**
 * Heart rate per slot: the midpoint of the slot's red marks, mapped linearly from
 * [hr.bottom, hr.top] onto [hrMin, hrMax]. The HR chart shares the pace chart's time axis, so the
 * slot grid is the pace chart's. Slots with no mark are filled by linear interpolation between
 * their nearest marked neighbours (the nearest one at either end). null when no slot has a mark.
 */
export function measureHrSlots(
  image: RgbImage,
  pace: PaceChartBand,
  hr: HrChartBand,
  hrMin: number,
  hrMax: number,
): number[] | null {
  const span = hr.bottom - hr.top
  if (span <= 0) return null
  const raw: Array<number | null> = []
  for (let i = 0; i < SLOT_COUNT; i++) {
    const [start, end] = slotColumns(pace.x0, pace.x1, i, SLOT_COUNT)
    let minY = -1
    let maxY = -1
    for (let x = start; x < end; x++) {
      for (let y = hr.top; y <= hr.bottom; y++) {
        if (isRedAt(image, x, y)) {
          if (minY < 0 || y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (minY < 0) {
      raw.push(null)
      continue
    }
    const mid = (minY + maxY) / 2
    raw.push(hrMin + ((hr.bottom - mid) / span) * (hrMax - hrMin))
  }
  return fillGaps(raw)
}

/** Linear interpolation over nulls; ends take the nearest value. null when every entry is null. */
function fillGaps(values: ReadonlyArray<number | null>): number[] | null {
  const known: number[] = []
  values.forEach((v, i) => {
    if (v !== null) known.push(i)
  })
  if (known.length === 0) return null
  return values.map((v, i) => {
    if (v !== null) return v
    const after = known.find((k) => k > i)
    const before = known.findLast((k) => k < i)
    if (before === undefined) return values[after!]!
    if (after === undefined) return values[before]!
    const a = values[before]!
    const b = values[after]!
    return a + ((b - a) * (i - before)) / (after - before)
  })
}
