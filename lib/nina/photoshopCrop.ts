/**
 * The rectangle-frame crop, as pure arithmetic — and the one place a crop becomes REAL PIXELS.
 *
 * ── WHY THIS IS NOT `lib/nina/crop.ts` ───────────────────────────────────────────────────────
 * `crop.ts` is documented, repeatedly and on purpose, as square-frame-only and display-only: a
 * circle is inscribed in a square box, so `top: N%` and `left: N%` resolve against the same length
 * and one stored offset unit can position both axes; and its output is a CSS style object that
 * never touches a byte of the file. Three live surfaces depend on both of those properties (the
 * avatar preview, the chat header avatar, the typing-row avatar). This feature needs a frame at an
 * ARBITRARY aspect ratio and needs actual cropped bytes to send to the model, so widening that
 * module's contract would put three shipped surfaces behind a change none of them asked for. A
 * sibling module is the decision; `crop.ts` is not edited by this plan set at all.
 *
 * ── WHY THIS FILE IMPORTS NOTHING ────────────────────────────────────────────────────────────
 * Same rule and same reason as `imagerecipe.ts` and `imageprefs.ts`: `scripts/photoshop.ts` and
 * `scripts/nina-image-worker/generate.ts` load their `lib/nina/` dependencies by relative path under
 * `node --experimental-strip-types`, which resolves neither `server-only` nor the `@/` alias. A
 * module with zero imports can never be the reason a future CLI caller cannot load this arithmetic.
 * That is also why the TARGET RATIO arrives as a NUMBER: the label -> number lookup is
 * `ninaImageAspectRatioValue` in `imagerecipe.ts`, next to the enum it reads, and the caller does
 * that step.
 *
 * ── THE STORED CONVENTION, AND THE ONE WAY IT DIFFERS FROM `crop.ts` ─────────────────────────
 * `scale` is a multiple of the COVER fit **for the target-ratio frame**: `1.000` is the smallest
 * scale that still fills the frame, `1.500` is 50% further in. `x` / `y` are the image centre's
 * offset from the frame centre, positive x right, positive y down — but `x` is in thousandths of
 * the frame's WIDTH and `y` is in thousandths of the frame's HEIGHT. `crop.ts` uses the frame's
 * width for BOTH, which is only legal because its frame is square; here the frame is a rectangle,
 * so each axis carries its own unit. Every function below is written around that, and it is the
 * thing a copy-paste from `crop.ts` gets wrong.
 *
 * All values NULL means "no crop" — the caller does not call this module at all, and the job runs
 * exactly as it does without the crop step. That convention lives in the job row (phase 2) and in
 * the Server Action (phase 4); `resolvePhotoshopCrop` only guarantees that a partial or garbage
 * triple degrades to the identity rather than throwing.
 *
 * ── WHAT `photoshopCropBox` IS FOR ───────────────────────────────────────────────────────────
 * The capability `crop.ts` never needed: a resolved crop plus the source's natural pixel size,
 * turned into an integer `{ left, top, width, height }` for `sharp().extract(...)`, rounded and
 * clamped so it can never name a region outside the file. An off-by-one here crops the wrong
 * pixels in production with nothing failing anywhere, so it is the function with the heaviest
 * test coverage in `tests/nina.photoshopCrop.test.ts`.
 */

/** The resolved crop: never null, always usable. */
export interface NinaPhotoshopCrop {
  /** Multiple of the cover fit for the TARGET-RATIO frame. >= NINA_PHOTOSHOP_CROP_MIN_SCALE. */
  scale: number
  /** Thousandths of the frame's WIDTH, positive = image moves right. Integer. */
  x: number
  /** Thousandths of the frame's HEIGHT, positive = image moves down. Integer. */
  y: number
}

/** What the job row hands back: any of the three may be NULL. */
export interface NinaPhotoshopCropInput {
  scale: number | null
  x: number | null
  y: number | null
}

/** The source image's intrinsic pixel size. Both columns are nullable, hence the union. */
export interface NinaPhotoshopSourceSize {
  width: number | null
  height: number | null
}

/** The rendered image's size as a percentage of the frame, per axis, before offsets. Both >= 100. */
export interface NinaPhotoshopCropSpan {
  widthPct: number
  heightPct: number
}

/**
 * The inline style for the `<img>` inside an `overflow-hidden` box whose CSS aspect ratio IS the
 * target ratio. A plain object of strings rather than `React.CSSProperties`, so this module keeps
 * its zero imports and stays assertable with `toEqual` — `crop.ts`'s reasoning, unchanged.
 */
export interface NinaPhotoshopCropStyle {
  position: 'absolute'
  width: string
  height: string
  left: string
  top: string
  objectFit: 'cover'
}

/** An integer pixel rectangle in the SOURCE image's own coordinates, for `sharp().extract()`. */
export interface NinaPhotoshopCropBox {
  left: number
  top: number
  width: number
  height: number
}

/** `1.000` is cover. Below it the crop frame would not be filled, so it is the floor. */
export const NINA_PHOTOSHOP_CROP_MIN_SCALE = 1

/**
 * 4x cover, the same ceiling `crop.ts` chose, for the same kind of reason measured against this
 * feature's own sources: a photoshop source is typically 832-2048 px on its short edge, so 4x cover
 * hands the model a 200-500 px window to re-render at 1K or 2K. Past that the admin is not framing a
 * crop, he is feeding the model mush and paying 2K prices for it.
 */
export const NINA_PHOTOSHOP_CROP_MAX_SCALE = 4

/** `numeric(5,3)` — three decimals is what phase 2's column stores, so it is what we round to. */
const NINA_PHOTOSHOP_CROP_SCALE_DECIMALS = 3

/** Offsets are thousandths of the frame's own dimension on that axis. */
const NINA_PHOTOSHOP_CROP_OFFSET_UNITS_PER_FRAME = 1000

/**
 * A coarse "not garbage" ceiling the Server Action can apply BEFORE it knows the source's size.
 * `clampPhotoshopCrop` is the exact bound and is applied again inside `photoshopCropBox`, so this
 * only has to reject absurdity, not be tight.
 *
 * Derived, not guessed: the legitimate bound is `5 * widthPct - 500`, and `widthPct` maxes at
 * `100 * MAX_SCALE * (sourceAspect / targetAspect)`. The worst realistic mismatch is a ~12:1
 * panorama against the catalogue's narrowest 1:8 — 96x — giving `100 * 4 * 96 = 38_400` and a bound
 * of 191_500. Rounded up to 200_000.
 */
export const NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET = 200_000

/** One arrow-key press: 10 thousandths = 1% of the frame on that axis. `crop.ts`'s step, kept. */
export const NINA_PHOTOSHOP_CROP_KEY_STEP = 10

/** The crop that takes the largest centred rectangle at the target ratio. */
export const NINA_PHOTOSHOP_CROP_IDENTITY: NinaPhotoshopCrop = {
  scale: NINA_PHOTOSHOP_CROP_MIN_SCALE,
  x: 0,
  y: 0,
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * A stored triple (or nothing at all) as usable numbers.
 *
 * A partial triple reads as "the parts that are missing are the identity's" rather than as an
 * error, and NaN, Infinity and a below-cover scale all fold into the identity too — this data has
 * a browser upstream of it, and a renderer that throws on bad data shows the operator a broken
 * page instead of a photograph.
 */
export function resolvePhotoshopCrop(
  input: NinaPhotoshopCropInput | null | undefined,
): NinaPhotoshopCrop {
  if (input == null) return { ...NINA_PHOTOSHOP_CROP_IDENTITY }
  return {
    scale: Math.max(
      NINA_PHOTOSHOP_CROP_MIN_SCALE,
      finiteOr(input.scale, NINA_PHOTOSHOP_CROP_MIN_SCALE),
    ),
    x: Math.round(finiteOr(input.x, 0)),
    y: Math.round(finiteOr(input.y, 0)),
  }
}

/**
 * How much of the frame the rendered image spans, per axis, in percent — the aspect fit, for a
 * frame whose own aspect ratio is `targetRatio` (width ÷ height).
 *
 * At `scale = 1` exactly one axis is 100% (that is what "cover" means) and the other overflows by
 * the mismatch between the source's aspect and the frame's:
 *
 *   · source wider than the frame (`w / h >= targetRatio`): the HEIGHT fits, the width overflows
 *     by `(w / h) / targetRatio`.
 *   · source narrower: the WIDTH fits, the height overflows by `targetRatio / (w / h)`.
 *
 * `w >= h * targetRatio` is that comparison without a division, so a source that matches the target
 * exactly lands on the first branch and gets `{100, 100}` rather than a float epsilon either side of
 * it. An unknown or implausible size, or an unusable ratio, degrades to `{100 * scale, 100 * scale}`
 * — plain `object-cover`, the honest answer when we do not know the shape of the file.
 *
 * Divide LAST, for `crop.ts`'s measured reason: `(w / short) * scale * 100` rounds three times and
 * lands a bit off the exact ratio, and the preview and the stored box then disagree in the last
 * digit.
 */
export function photoshopCropSpanPct(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
): NinaPhotoshopCropSpan {
  const w = finiteOr(source.width, 0)
  const h = finiteOr(source.height, 0)
  const t = finiteOr(targetRatio, 0)
  const scale = finiteOr(crop.scale, NINA_PHOTOSHOP_CROP_MIN_SCALE)
  if (w <= 0 || h <= 0 || t <= 0) return { widthPct: 100 * scale, heightPct: 100 * scale }
  if (w >= h * t) return { widthPct: (w * scale * 100) / (h * t), heightPct: 100 * scale }
  return { widthPct: 100 * scale, heightPct: (h * t * scale * 100) / w }
}

/**
 * The furthest the image centre may sit from the frame centre, per axis, in stored units — the
 * clamp that makes dragging the frame off the photograph impossible.
 *
 * The frame must stay fully covered, so on the x axis the image's left edge may not cross 0% and
 * its right edge may not cross 100%:
 *
 *     left  = 50 + x/10 - widthPct/2 <= 0     ->  x <=  10 * (widthPct/2 - 50)
 *     right = 50 + x/10 + widthPct/2 >= 100   ->  x >= -10 * (widthPct/2 - 50)
 *
 * so `|x| <= 5 * widthPct - 500`, and the identical algebra on y against `heightPct` — which is
 * only symmetric BECAUSE y is stored in thousandths of the frame's height. At `scale = 1` the
 * fitting axis gets exactly 0, which is correct: there is nowhere to slide along an axis that
 * already fits, and allowing a sliver there is the bug this function exists to prevent.
 */
export function maxPhotoshopCropOffset(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
): { x: number; y: number } {
  const { widthPct, heightPct } = photoshopCropSpanPct(source, targetRatio, crop)
  return {
    x: Math.max(0, Math.floor(widthPct * 5 - 500)),
    y: Math.max(0, Math.floor(heightPct * 5 - 500)),
  }
}

/**
 * The only way a crop becomes valid. Scale into `[MIN, MAX]` and rounded to the column's three
 * decimals FIRST, because the offset bounds depend on it — clamping offsets against the old scale
 * and then changing the scale is how a zoom-out leaves a corner of background showing.
 */
export function clampPhotoshopCrop(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
): NinaPhotoshopCrop {
  const scale = round(
    Math.min(
      NINA_PHOTOSHOP_CROP_MAX_SCALE,
      Math.max(NINA_PHOTOSHOP_CROP_MIN_SCALE, finiteOr(crop.scale, 1)),
    ),
    NINA_PHOTOSHOP_CROP_SCALE_DECIMALS,
  )
  const limit = maxPhotoshopCropOffset(source, targetRatio, { ...crop, scale })
  /* `+ 0` normalises negative zero, for `crop.ts`'s reason: `Math.max(-0, -900)` is `-0`, which
   * compares equal to `0` everywhere and which `Object.is` — and therefore `toEqual` — tells apart.
   * NaN is folded to 0 explicitly, but +-Infinity is left alone: `Math.max`/`Math.min` already
   * clamp an infinite value to the bound correctly, and routing it through `finiteOr` first would
   * zero it instead of clamping it — the wrong answer for "as far as you can drag it". */
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(max, Math.max(-max, Number.isNaN(value) ? 0 : value))) + 0
  return { scale, x: clamp(crop.x, limit.x), y: clamp(crop.y, limit.y) }
}

/**
 * A drag: pointer deltas in CSS px against a frame `frameWidthPx` wide, converted to stored units
 * and clamped. The image follows the pointer, so a rightward drag increases x.
 *
 * Only the frame's WIDTH is measured, because the frame's height is `frameWidthPx / targetRatio` by
 * construction — the component renders the box with a CSS aspect ratio, so asking it for a second
 * measurement would invite the two to disagree by a subpixel and the y axis to drift against the
 * stored unit. `frameWidthPx <= 0` returns the crop untouched rather than dividing by zero: a
 * component can be asked for a pointer move before layout has measured the frame.
 */
export function panPhotoshopCrop(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
  dxPx: number,
  dyPx: number,
  frameWidthPx: number,
): NinaPhotoshopCrop {
  const t = finiteOr(targetRatio, 0)
  if (!Number.isFinite(frameWidthPx) || frameWidthPx <= 0 || t <= 0) return crop
  const perUnitX = NINA_PHOTOSHOP_CROP_OFFSET_UNITS_PER_FRAME / frameWidthPx
  const perUnitY = (NINA_PHOTOSHOP_CROP_OFFSET_UNITS_PER_FRAME * t) / frameWidthPx
  return clampPhotoshopCrop(source, t, {
    scale: crop.scale,
    x: crop.x + finiteOr(dxPx, 0) * perUnitX,
    y: crop.y + finiteOr(dyPx, 0) * perUnitY,
  })
}

/**
 * A zoom about the FRAME CENTRE, which is where the subject is being aimed.
 *
 * The offsets scale too, for `crop.ts`'s reason: the image point under the frame centre sits at
 * some image-relative position `p`, its frame position is `imageCentre + p * s`, and holding it
 * still while the scale becomes `s * k` requires the centre offset to become `k` times what it was.
 * That holds per axis under this module's per-axis units as well, because neither frame dimension
 * changes when the image is scaled. Leaving x and y alone instead makes the picture slide away from
 * the crosshair as you zoom in — the single most common bug in a crop widget.
 */
export function zoomPhotoshopCrop(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
  factor: number,
): NinaPhotoshopCrop {
  const k = finiteOr(factor, 1)
  if (k <= 0) return crop
  return clampPhotoshopCrop(source, targetRatio, {
    scale: crop.scale * k,
    x: crop.x * k,
    y: crop.y * k,
  })
}

/** An arrow-key nudge, in stored units. The keyboard path to the same clamp. */
export function nudgePhotoshopCrop(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
  dx: number,
  dy: number,
): NinaPhotoshopCrop {
  return clampPhotoshopCrop(source, targetRatio, {
    scale: crop.scale,
    x: crop.x + finiteOr(dx, 0),
    y: crop.y + finiteOr(dy, 0),
  })
}

/**
 * **THE ONE CROP-TO-CSS MAPPING FOR THE RECTANGLE FRAME.** The admin's crop studio previews the
 * crop through this and the server crops through `photoshopCropBox`; the suite asserts the two agree
 * on the same window, which is what stops the operator framing one rectangle and the model
 * receiving another.
 *
 * Usage — the box MUST be `relative`, `overflow-hidden`, and carry the TARGET RATIO as its CSS
 * aspect ratio (`style={{ aspectRatio: targetRatio }}`), which is what makes `top: N%` resolve
 * against the same length the stored y unit is expressed in:
 *
 *     <span className="relative block w-full overflow-hidden" style={{ aspectRatio: targetRatio }}>
 *       <img src={url} alt="" style={ninaPhotoshopCropStyle(source, targetRatio, crop)} />
 *     </span>
 */
export function ninaPhotoshopCropStyle(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
): NinaPhotoshopCropStyle {
  const { widthPct, heightPct } = photoshopCropSpanPct(source, targetRatio, crop)
  const offsetPct = (units: number) => units / (NINA_PHOTOSHOP_CROP_OFFSET_UNITS_PER_FRAME / 100)
  const pct = (value: number) => `${round(value, 4)}%`
  return {
    position: 'absolute',
    width: pct(widthPct),
    height: pct(heightPct),
    left: pct(50 + offsetPct(crop.x) - widthPct / 2),
    top: pct(50 + offsetPct(crop.y) - heightPct / 2),
    objectFit: 'cover',
  }
}

/**
 * **THE CROP, AS REAL PIXELS.** A resolved crop and the source's natural size, as the integer
 * rectangle `sharp().extract({ left, top, width, height })` takes — in the SOURCE image's own
 * coordinates, guaranteed inside its bounds.
 *
 * ── THE DERIVATION ───────────────────────────────────────────────────────────────────────────
 * `ninaPhotoshopCropStyle` puts the image at `left% = 50 + x/10 - widthPct/2` spanning `widthPct`,
 * inside a frame that is 0%..100%. So the visible slice of the image, as a fraction of the image,
 * starts at `-left% / widthPct` and is `100 / widthPct` wide. In source pixels:
 *
 *     width  = w * 100 / widthPct
 *     height = h * 100 / heightPct
 *     left   = w * (widthPct / 2 - 50 - x / 10) / widthPct
 *     top    = h * (heightPct / 2 - 50 - y / 10) / heightPct
 *
 * ── THE ROUNDING, WHICH IS THE WHOLE RISK ────────────────────────────────────────────────────
 * Those four are floats and `sharp` takes integers. Rounding all four independently can produce a
 * box whose ratio is off by more than a pixel, or one that names a row past the last row of the
 * file — and `sharp().extract()` throws on the second, failing a job the admin will read as "the
 * model refused". So: round the two SIZES, pick the axis that binds (the one whose rounded size
 * already fits inside the other's ratio-implied size), derive the other axis FROM it so the ratio
 * survives rounding on exactly one axis, and only then clamp the origin into `[0, w - width]` /
 * `[0, h - height]`. Near the boundary both branches agree, which is why the comparison is safe.
 *
 * **An integer rectangle cannot hit every ratio exactly** — 832 px wide at 5:4 wants 665.6 px of
 * height — so the box's ratio can differ from the target by at most half a pixel on the derived
 * axis: `|width/height - targetRatio| <= targetRatio / min(width, height)`, asserted in the suite
 * over all 23 catalogued ratios. That is under 0.2% on any window above 350 px, against the ~10%
 * stretch this feature exists to remove.
 *
 * Returns `null` when the source size or the ratio is unusable, or when the requested window is
 * under a pixel on either axis (a 3x2 thumbnail asked for 1:8) — no integer rectangle at that ratio
 * exists, and a 1x1 box at the wrong ratio would be a silently wrong crop, which is the exact
 * failure mode this feature was built to remove. The caller treats `null` as "no crop".
 */
export function photoshopCropBox(
  source: NinaPhotoshopSourceSize,
  targetRatio: number,
  crop: NinaPhotoshopCrop,
): NinaPhotoshopCropBox | null {
  const w = Math.floor(finiteOr(source.width, 0))
  const h = Math.floor(finiteOr(source.height, 0))
  const t = finiteOr(targetRatio, 0)
  if (!(w >= 1) || !(h >= 1) || !(t > 0)) return null

  /* Clamped here as well as at every mutator, because this function is the last thing between a
   * number that came from a browser three days ago and a region of a file. */
  const resolved = clampPhotoshopCrop({ width: w, height: h }, t, crop)
  const { widthPct, heightPct } = photoshopCropSpanPct({ width: w, height: h }, t, resolved)

  const exactWidth = (w * 100) / widthPct
  const exactHeight = (h * 100) / heightPct
  if (!(exactWidth >= 1) || !(exactHeight >= 1)) return null

  const exactLeft = (w * (widthPct / 2 - 50 - resolved.x / 10)) / widthPct
  const exactTop = (h * (heightPct / 2 - 50 - resolved.y / 10)) / heightPct

  const fitWidth = Math.min(w, Math.max(1, Math.round(exactWidth)))
  const fitHeight = Math.min(h, Math.max(1, Math.round(exactHeight)))

  let width: number
  let height: number
  if (fitWidth <= fitHeight * t) {
    /* The width is the binding axis: deriving the height from it lands inside the source, because
     * `width / t <= fitHeight <= h`. The `min` is belt and braces against float drift. */
    width = fitWidth
    height = Math.min(h, Math.max(1, Math.round(width / t)))
  } else {
    height = fitHeight
    width = Math.min(w, Math.max(1, Math.round(height * t)))
  }

  /* `max` first, `min` last: `w - width` is never negative, so this cannot produce a negative
   * origin, and it cannot produce one whose far edge is past the last column of the file. */
  const left = Math.min(w - width, Math.max(0, Math.round(exactLeft)))
  const top = Math.min(h - height, Math.max(0, Math.round(exactTop)))

  return { left, top, width, height }
}

/**
 * True when the box is the whole source image — the case where cropping is a no-op and a `sharp`
 * round-trip would re-encode the file for nothing. It is reachable in ordinary use: a source whose
 * own ratio already matches the chosen one, at the identity crop, produces exactly this.
 */
export function isFullFramePhotoshopCropBox(
  source: NinaPhotoshopSourceSize,
  box: NinaPhotoshopCropBox,
): boolean {
  const w = Math.floor(finiteOr(source.width, 0))
  const h = Math.floor(finiteOr(source.height, 0))
  return box.left === 0 && box.top === 0 && box.width === w && box.height === h
}
