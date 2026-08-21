/**
 * The one calculation the compression module exists to get right. Pure, zero imports, and split
 * out from `compressForExtraction.ts` for exactly one reason: **it is the whole of the bug**, and
 * a pure function is the only version of it a Node test runner can prove.
 *
 * ── THE TRAP (plan §3.1) ─────────────────────────────────────────────────────────────────────
 *
 * The measured recipe is "560 px WIDE, JPEG q80", scored 108/108. But
 * `browser-image-compression`'s only sizing knob is `maxWidthOrHeight`, which clamps whichever
 * dimension is **LARGER**. Apple Fitness screenshots are portrait — the canonical fixture is
 * 739 × 1600, so height is the long edge.
 *
 * Passing `maxWidthOrHeight: 560` on that image therefore scales the 1600 px HEIGHT down to 560
 * and produces a **259 px-wide** image. That is not a smaller version of the tested recipe; it is
 * outside the measured envelope entirely (the smallest width ever scored was 460 px). The
 * extraction would very likely still "succeed" — clear the token floor, return valid JSON — while
 * quietly degrading exactly the fiddly cells that need legible pixels: the comma decimal in
 * "10,67KM", the small-print resting-HR footnote, the splits table's smallest type. A one-line,
 * silent, accuracy-only regression with no error anywhere in the pipeline.
 *
 * The fix is to compute the long-edge value that lands the SHORT edge on the target, and pass
 * that. The formula is symmetric in orientation, so a screen-rotated landscape capture (which
 * should not happen, but can) still comes out with its short edge at the target rather than being
 * blown up to a 560-tall postage stamp.
 */

/**
 * Given a source image's dimensions, the value to pass as `maxWidthOrHeight` so that the
 * resulting image's SHORT edge is `shortEdgeTarget`.
 *
 * Never upscales: an image already at or below the target is returned at its own long edge, so a
 * small source is left alone rather than interpolated up to a size it has no detail for.
 */
export function longEdgeTargetFor(width: number, height: number, shortEdgeTarget: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`longEdgeTargetFor: implausible source dimensions ${width}x${height}`)
  }
  const shortEdge = Math.min(width, height)
  const longEdge = Math.max(width, height)
  if (shortEdge <= shortEdgeTarget) return Math.round(longEdge)
  return Math.round(shortEdgeTarget * (longEdge / shortEdge))
}

/** The short edge an output of these dimensions actually has — what the QA assertion checks. */
export function shortEdgeOf(width: number, height: number): number {
  return Math.min(width, height)
}
