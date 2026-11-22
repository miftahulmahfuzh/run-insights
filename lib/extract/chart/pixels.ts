/**
 * The pixel vocabulary of the Workout Details chart estimator: the image shape every module in
 * `lib/extract/chart/` reads, and the two colour predicates that decide what a chart mark is.
 *
 * Pure: no I/O, no `sharp`, no `server-only`. `decode.ts` is the only file in this directory that
 * touches a codec; everything else works on an {@link RgbImage} it is handed.
 */

/** A decoded image: RGB, 3 bytes per pixel, row-major, no padding, no alpha. */
export interface RgbImage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Apple Fitness's pace-chart teal, ~(70, 230, 228) — and the Cadence chart's, and the
 * "Average: …/KM" text's; the locator, not this predicate, tells those apart.
 *
 * Measured on the 739 px PNGs and their 560 px JPEG q80 re-encodes (2026-11-22):
 *   · no red ceiling: JPEG chroma subsampling lightens a 2 px bar to ~(141, 214, 220), so the
 *     analysis's `r < 130` dropped whole bars and moved the 560 px Friday estimate to 6.12 km;
 *   · `|g − b| < 40` instead keeps out the Elevation chart's green, whose anti-aliased edges
 *     ~(159, 232, 140) otherwise pass and get picked as a bar band.
 */
export function isTealAt(image: RgbImage, x: number, y: number): boolean {
  const i = (y * image.width + x) * 3
  const r = image.data[i]!
  const g = image.data[i + 1]!
  const b = image.data[i + 2]!
  return g > 130 && b > 130 && g - r > 50 && Math.abs(g - b) < 40
}

/**
 * The heart-rate chart's red marks (and the "Average: …BPM" text above them). Measured at both
 * sizes: at 560 px JPEG the marks thin out, and the empty slots are interpolated.
 */
export function isRedAt(image: RgbImage, x: number, y: number): boolean {
  const i = (y * image.width + x) * 3
  const r = image.data[i]!
  const g = image.data[i + 1]!
  const b = image.data[i + 2]!
  return r > 170 && g < 110 && b < 90
}

/** True when `image` is a non-empty, internally consistent RGB buffer. */
export function isUsableImage(image: RgbImage): boolean {
  return (
    Number.isInteger(image.width) &&
    Number.isInteger(image.height) &&
    image.width > 0 &&
    image.height > 0 &&
    image.data.length === image.width * image.height * 3
  )
}
