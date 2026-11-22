import { isRedAt, isTealAt, isUsableImage, type RgbImage } from './pixels'

/**
 * Find the Pace bar chart and the Heart Rate chart on a Workout Details screenshot by what they
 * look like, never by fixed rows. Pure.
 *
 * ── WHAT ELSE IS TEAL OR RED ON THAT SCREEN ─────────────────────────────────────────────────
 *   · the route map's line (teal): wide and very tall (~380 px at 739 px);
 *   · "Average: 7'39"/KM" (teal) and "Average: 169BPM" (red): narrow, a handful of runs per row;
 *   · the Cadence chart (teal), BELOW the pace chart: the same bar shape, cut by the bottom edge
 *     of the screen or by the home indicator (2026-11-20-details.png).
 * The pace chart is the first band, top to bottom, of rows holding many thin teal runs across
 * most of the width, short, with a clean gap under its baseline and a bar in nearly every one of
 * its 90 slots. The HR chart is the first cluster of red rows above it that spans most of the
 * width.
 *
 * Every threshold is a fraction of the image width, so the 739 px original and the 560 px JPEG
 * the browser actually uploads pass the same code.
 */

/** Where the pace chart is, and how tall each pixel column's bar is. */
export interface PaceChartBand {
  /** The lowest row of the bars (they all stand on it). */
  baseline: number
  /** The highest row any bar reaches. */
  top: number
  /** First column holding a bar. */
  x0: number
  /** One past the last column holding a bar. */
  x1: number
  /** Bar height, in px, of every image column (0 where no bar stands). Length = image width. */
  columnHeights: number[]
}

/** The rows the heart-rate marks occupy. The printed HR range maps onto [bottom, top]. */
export interface HrChartBand {
  /** Highest red row — the printed maximum HR. */
  top: number
  /** Lowest red row — the printed minimum HR. */
  bottom: number
}

/** Apple draws a workout as this many equal time slots. */
export const SLOT_COUNT = 90
/** Bars must stand in at least this many of the 90 slots. */
const MIN_BAR_SLOTS = 81
/** Bar rows need at least this many thin runs (the chart has 90 bars). */
const MIN_BAR_RUNS = 45
/** A bar band spans at least this fraction of the width (measured: 0.91). */
const MIN_SPAN_FRACTION = 0.8
/** A bar band is at most this fraction of the width tall (measured: 0.12). */
const MAX_BAND_HEIGHT_FRACTION = 0.15
/** A "thin" run is at most this fraction of the width wide (bars are 2-4 px at 739). */
const THIN_RUN_FRACTION = 0.015
/**
 * Below the real baseline there is a clean gap ("0:00:00" is grey) of at least this fraction of
 * the width. The Cadence chart, cut by the screen edge or by the home indicator, has none.
 */
const CLEAN_GAP_FRACTION = 0.04
/** Rows right under the baseline that JPEG may smear teal into (measured: 1 at 560 px). */
const BASELINE_SMEAR_ROWS = 2
/** A row under the baseline with this many thin runs means bars continue — not a baseline. */
const MAX_RUNS_IN_GAP = 15
/** Rows of red allowed to be missing inside the HR marks (measured ≤ 4 at 560 px). */
const HR_GAP_FRACTION = 0.0125
/** The HR marks span at least this fraction of the width (the red "Average" text spans 0.3). */
const MIN_HR_SPAN_FRACTION = 0.7
/** How far above the pace chart the HR chart may sit (measured: 0.19 of the width). */
const HR_SEARCH_FRACTION = 0.45

interface RowStats {
  thinRuns: number
  minX: number
  maxX: number
}

function tealRowStats(image: RgbImage, y: number, thinMax: number): RowStats {
  let thinRuns = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = -1
  let start = -1
  for (let x = 0; x <= image.width; x++) {
    const on = x < image.width && isTealAt(image, x, y)
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      if (x - start <= thinMax) {
        thinRuns++
        if (start < minX) minX = start
        maxX = x - 1
      }
      start = -1
    }
  }
  return { thinRuns, minX, maxX }
}

/**
 * Height of the teal bar standing on `baseline` in column `x`: walk up, tolerating one missing
 * row at a time (JPEG blurs the baseline and nicks thin bars), stopping at `maxHeight`. The
 * "Average" text sits ≥ 10 rows above the tallest bar, so the walk never reaches it.
 */
function barHeightAt(image: RgbImage, x: number, baseline: number, maxHeight: number): number {
  let top = -1
  let misses = 0
  const limit = Math.max(0, baseline - maxHeight + 1)
  for (let y = baseline; y >= limit; y--) {
    if (isTealAt(image, x, y)) {
      top = y
      misses = 0
    } else {
      misses++
      if (misses > 1) break
    }
  }
  return top < 0 ? 0 : baseline - top + 1
}

/** Column range [start, end) of slot `i` of `slots` equal slots across [x0, x1). Never empty. */
export function slotColumns(x0: number, x1: number, i: number, slots: number): [number, number] {
  const start = Math.floor(x0 + ((x1 - x0) * i) / slots)
  const end = Math.max(Math.floor(x0 + ((x1 - x0) * (i + 1)) / slots), start + 1)
  return [start, end]
}

/** The pace chart, or null when no band on the image has its shape. */
export function locatePaceChart(image: RgbImage): PaceChartBand | null {
  if (!isUsableImage(image)) return null
  const width = image.width
  const thinMax = Math.max(3, Math.round(THIN_RUN_FRACTION * width))
  const minSpan = MIN_SPAN_FRACTION * width
  const maxBandHeight = Math.round(MAX_BAND_HEIGHT_FRACTION * width)
  const gapRows = Math.round(CLEAN_GAP_FRACTION * width)

  const thinRuns: number[] = []
  const isBarRow: boolean[] = []
  for (let y = 0; y < image.height; y++) {
    const s = tealRowStats(image, y, thinMax)
    thinRuns.push(s.thinRuns)
    isBarRow.push(s.thinRuns >= MIN_BAR_RUNS && s.maxX - s.minX + 1 >= minSpan)
  }

  let y = 0
  while (y < image.height) {
    if (!isBarRow[y]) {
      y++
      continue
    }
    const first = y
    let last = y
    // One missing row inside a band is JPEG noise, not the end of the band.
    while (last + 1 < image.height && (isBarRow[last + 1] || isBarRow[last + 2])) {
      last += isBarRow[last + 1] ? 1 : 2
    }
    y = last + 1

    if (last - first + 1 > maxBandHeight) continue // the route map, or anything else tall
    // No room for the clean gap = cut by the screen edge (the Cadence chart, 2026-11-20).
    if (last + gapRows >= image.height) continue
    let barsContinue = false
    for (let g = last + 1 + BASELINE_SMEAR_ROWS; g <= last + gapRows; g++) {
      if (thinRuns[g]! >= MAX_RUNS_IN_GAP) barsContinue = true
    }
    if (barsContinue) continue // cut by the home indicator, bars resume below it

    const baseline = last
    const columnHeights: number[] = []
    let x0 = -1
    let x1 = -1
    let tallest = 0
    for (let x = 0; x < width; x++) {
      const h = barHeightAt(image, x, baseline, maxBandHeight)
      columnHeights.push(h)
      if (h > 0) {
        if (x0 < 0) x0 = x
        x1 = x + 1
        if (h > tallest) tallest = h
      }
    }
    if (x0 < 0 || x1 - x0 < minSpan) continue
    let filledSlots = 0
    for (let i = 0; i < SLOT_COUNT; i++) {
      const [start, end] = slotColumns(x0, x1, i, SLOT_COUNT)
      if (columnHeights.slice(start, end).some((h) => h > 0)) filledSlots++
    }
    if (filledSlots < MIN_BAR_SLOTS) continue
    return { baseline, top: baseline - tallest + 1, x0, x1, columnHeights }
  }
  return null
}

/**
 * The HR chart: the first cluster of red rows above the pace chart (top row `paceTop`) that
 * spans most of the width. null when there is none.
 */
export function locateHrChart(image: RgbImage, paceTop: number): HrChartBand | null {
  if (!isUsableImage(image)) return null
  const width = image.width
  const gapTolerance = Math.max(2, Math.round(HR_GAP_FRACTION * width))
  const searchFloor = Math.max(0, paceTop - Math.round(HR_SEARCH_FRACTION * width))

  let bottom = -1
  let top = -1
  let minX = Number.POSITIVE_INFINITY
  let maxX = -1
  let gap = 0
  for (let y = paceTop - 1; y >= searchFloor; y--) {
    let rowMin = -1
    let rowMax = -1
    for (let x = 0; x < width; x++) {
      if (isRedAt(image, x, y)) {
        if (rowMin < 0) rowMin = x
        rowMax = x
      }
    }
    if (rowMin < 0) {
      if (bottom >= 0) {
        gap++
        if (gap > gapTolerance) break
      }
      continue
    }
    if (bottom < 0) bottom = y
    top = y
    gap = 0
    if (rowMin < minX) minX = rowMin
    if (rowMax > maxX) maxX = rowMax
  }
  if (bottom < 0 || bottom - top < 2) return null
  if (maxX - minX + 1 < MIN_HR_SPAN_FRACTION * width) return null
  return { top, bottom }
}
