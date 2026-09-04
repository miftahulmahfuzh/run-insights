/**
 * The circular-frame transform (R23), as pure arithmetic.
 *
 * ── WHY THIS IS A MODULE AND NOT A COMPONENT ─────────────────────────────────────────────────
 * `/admin/nina` is the only free-form direct-manipulation UI in this repo, and `vitest.config.ts`
 * runs `environment: 'node'`: no jsdom, no `PointerEvent`, no `getBoundingClientRect`. So the
 * clamping, the aspect fit, the gesture conversion and the CSS mapping all live here where they
 * can be proven, and `components/admin/CropStudio.tsx` is left holding two pointer positions and
 * a subtraction. This is the same carve-out as `lib/photos/gallery.ts` out of `PhotoViewer.tsx`
 * and `lib/photos/resizeTarget.ts` out of `compressForExtraction.ts`, for the same stated reason.
 *
 * Zero imports, so a `'use client'` component, a Server Action, a Server Component and the unit
 * suite can all read it — the `lib/extract/constants.ts` rule.
 *
 * ── THE STORED CONVENTION (phase 1 owns it; this module implements it) ───────────────────────
 * `nina_avatars.crop_scale` is a multiple of the **cover** fit: `1.000` is the smallest scale that
 * still fills the circle, `1.500` is 50% further in. `crop_x` / `crop_y` are the image centre's
 * offset from the frame centre in **thousandths of the frame's width**, positive x right, positive
 * y down. All three NULL means "no transform" — render `object-cover`, centred. A partial triple
 * reads a missing scale as 1 and missing offsets as 0 rather than throwing.
 *
 * ── WHY THE FRAME IS ASSUMED SQUARE ──────────────────────────────────────────────────────────
 * A circle is inscribed in a square box, so frame width == frame height at every call site, and
 * `top: N%` (which resolves against the containing block's HEIGHT) is therefore the same unit as
 * `left: N%` (which resolves against its WIDTH). That equality is what lets one stored offset unit
 * — thousandths of the frame's *width* — position both axes. **Every caller must render the frame
 * in a square box** (`size-7`, `size-11`, `h-[512px] w-[512px]`, `aspect-square`); a non-square
 * box would silently stretch the y offset. `CircleFrame` is the component that guarantees it.
 *
 * ── WHY PERCENTAGES AND NOT `transform: translate()` ─────────────────────────────────────────
 * A percentage `translate()` resolves against the ELEMENT's own box, not its container's — so a
 * translate-based mapping would need the frame's pixel size at every call site, and the 28 px
 * bubble avatar and the 512 px studio frame would each have to know their own size to agree. With
 * `width`/`height`/`left`/`top` all expressed as percentages of the frame, the same three stored
 * numbers are correct at any size, with no measurement anywhere. That property is the reason the
 * admin preview and the chat header cannot drift.
 */

/** The resolved transform: never null, always usable. */
export interface NinaCrop {
  /** Multiple of the cover fit. >= NINA_CROP_MIN_SCALE. */
  scale: number
  /** Thousandths of the frame's width, positive = image moves right. Integer. */
  x: number
  /** Thousandths of the frame's width, positive = image moves down. Integer. */
  y: number
}

/** What the database hands back: any of the three may be NULL. */
export interface NinaCropInput {
  scale: number | null
  x: number | null
  y: number | null
}

/** The image's intrinsic pixel size. `nina_avatars.width`/`height` may be NULL, hence the union. */
export interface NinaNaturalSize {
  width: number | null
  height: number | null
}

/** The rendered image's size in frame-widths, before offsets. Both >= 100. */
export interface NinaCropSpan {
  widthPct: number
  heightPct: number
}

/**
 * The inline style for the `<img>` inside a square, `overflow-hidden`, `rounded-pill` box.
 * Deliberately a plain object of strings rather than `React.CSSProperties`, so this module keeps
 * its zero imports and stays assertable with `toEqual`.
 */
export interface NinaCropStyle {
  position: 'absolute'
  width: string
  height: string
  left: string
  top: string
  objectFit: 'cover'
}

/** `1.000` is cover. Below it the image would not fill the circle, so it is the floor. */
export const NINA_CROP_MIN_SCALE = 1

/**
 * 4x cover. Chosen against the real source: the anchor is 1792x2400, so 4x cover renders a
 * 1792 px-wide face into a 512 px studio frame at 448 px of source per 128 px of screen — still
 * sharp. A higher ceiling only offers the operator a way to make her face a blur.
 */
export const NINA_CROP_MAX_SCALE = 4

/** `numeric(5,3)` — three decimals is what the column stores, so it is what we round to. */
export const NINA_CROP_SCALE_DECIMALS = 3

/** Offsets are thousandths of the frame's width. Phase 1's column comment, as a constant. */
export const NINA_CROP_OFFSET_UNITS_PER_FRAME = 1000

/**
 * A hard cap the server can apply WITHOUT knowing the image's dimensions.
 * `clampCrop` is exact when `width`/`height` are known; this is the fallback for a row whose
 * dimension columns are NULL, and it is generous on purpose — at the 4x ceiling a 1:6 panorama's
 * legitimate x range is +/-4900.
 */
export const NINA_CROP_MAX_ABS_OFFSET = 5_000

/** One arrow-key press: 10 thousandths = 1% of the frame. Fine enough to centre an eye. */
export const NINA_CROP_KEY_STEP = 10

/** Wheel sensitivity: `deltaY` of 400 (about three notches) is one e-fold of zoom. */
export const NINA_CROP_WHEEL_DIVISOR = 400

/** No single wheel event may more than double or halve the scale — trackpads emit huge deltas. */
export const NINA_CROP_WHEEL_MAX_FACTOR = 2

/** "No transform", as the value every pre-phase-15 row means. */
export const NINA_CROP_IDENTITY: NinaCrop = { scale: NINA_CROP_MIN_SCALE, x: 0, y: 0 }

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
 * The partial-triple rule is phase 1's, quoted: *"A renderer must treat a partial triple (scale
 * set, offsets NULL) as offsets of zero rather than as an error."* NaN, Infinity and a
 * below-cover scale are all folded into the identity too — a renderer that throws on bad data
 * shows the user a broken page, and this data has three writers.
 */
export function resolveCrop(input: NinaCropInput | null | undefined): NinaCrop {
  if (input == null) return { ...NINA_CROP_IDENTITY }
  return {
    scale: Math.max(NINA_CROP_MIN_SCALE, finiteOr(input.scale, NINA_CROP_MIN_SCALE)),
    x: Math.round(finiteOr(input.x, 0)),
    y: Math.round(finiteOr(input.y, 0)),
  }
}

/** True when this crop renders exactly as plain centred `object-cover`. */
export function isIdentityCrop(crop: NinaCrop): boolean {
  return crop.scale === NINA_CROP_MIN_SCALE && crop.x === 0 && crop.y === 0
}

/**
 * How much of the frame the rendered image spans, per axis, in percent — the aspect fit.
 *
 * At `scale = 1` the SHORT edge is exactly 100% (that is what "cover" means) and the long edge
 * overflows by the aspect ratio. An unknown or implausible natural size degrades to a square:
 * `{100, 100}` renders as plain `object-cover`, which is the honest answer when we do not know
 * the shape of the file.
 */
export function cropSpanPct(natural: NinaNaturalSize, crop: NinaCrop): NinaCropSpan {
  const w = finiteOr(natural.width, 0)
  const h = finiteOr(natural.height, 0)
  if (w <= 0 || h <= 0) return { widthPct: 100 * crop.scale, heightPct: 100 * crop.scale }
  const short = Math.min(w, h)
  /* Divide LAST. `(w / short) * scale * 100` rounds three times and lands a bit off the exact
   * ratio — a 4000x3000 source came out 133.33333333333331 where `400 / 3` is
   * 133.33333333333334. One rounding instead of three makes the two agree, which is what the
   * suite asserts and what keeps the admin preview and the chat header on the same number. */
  return {
    widthPct: (w * crop.scale * 100) / short,
    heightPct: (h * crop.scale * 100) / short,
  }
}

/**
 * The furthest the image centre may sit from the frame centre, per axis, in stored units —
 * i.e. **the clamp that makes dragging the image off its frame impossible.**
 *
 * The frame must stay fully covered, so the image's left edge may not cross 0% and its right edge
 * may not cross 100%:
 *
 *     left  = 50 + x/10 - widthPct/2 <= 0     ->  x <=  10 * (widthPct/2 - 50)
 *     right = 50 + x/10 + widthPct/2 >= 100   ->  x >= -10 * (widthPct/2 - 50)
 *
 * so `|x| <= 5 * widthPct - 500`. At `scale = 1` on a portrait image that is exactly 0 for x — the
 * width already fits the frame precisely, so there is nowhere to slide horizontally, which is
 * correct and is the case a naive implementation gets wrong by allowing a sliver of background.
 *
 * `Math.max(0, ...)` guards the sub-cover case, which `resolveCrop` already prevents.
 */
export function maxCropOffset(natural: NinaNaturalSize, crop: NinaCrop): { x: number; y: number } {
  const { widthPct, heightPct } = cropSpanPct(natural, crop)
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
export function clampCrop(natural: NinaNaturalSize, crop: NinaCrop): NinaCrop {
  const scale = round(
    Math.min(NINA_CROP_MAX_SCALE, Math.max(NINA_CROP_MIN_SCALE, finiteOr(crop.scale, 1))),
    NINA_CROP_SCALE_DECIMALS,
  )
  const limit = maxCropOffset(natural, { ...crop, scale })
  /* `+ 0` normalises negative zero. `Math.round(-0)` is `-0`, and a pinned portrait clamped from
   * a leftward drag produces exactly that: `Math.max(-0, -900)` is `-0`. It compares equal to `0`
   * everywhere in this module, but `Object.is` — and therefore `toEqual` — tells them apart, and a
   * stored `-0` round-trips through `numeric` as `0` anyway. One sign, always. */
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(max, Math.max(-max, finiteOr(value, 0)))) + 0
  return { scale, x: clamp(crop.x, limit.x), y: clamp(crop.y, limit.y) }
}

/**
 * A drag: pointer deltas in CSS px against a frame of `framePx` px, converted to stored units and
 * clamped. The image follows the pointer, so a rightward drag increases x.
 *
 * `framePx <= 0` returns the crop untouched rather than dividing by zero — a component can be
 * asked for a pointer move before layout has measured the frame.
 */
export function panCrop(
  natural: NinaNaturalSize,
  crop: NinaCrop,
  dxPx: number,
  dyPx: number,
  framePx: number,
): NinaCrop {
  if (!Number.isFinite(framePx) || framePx <= 0) return crop
  const perUnit = NINA_CROP_OFFSET_UNITS_PER_FRAME / framePx
  return clampCrop(natural, {
    scale: crop.scale,
    x: crop.x + finiteOr(dxPx, 0) * perUnit,
    y: crop.y + finiteOr(dyPx, 0) * perUnit,
  })
}

/**
 * A zoom about the FRAME CENTRE, which is where the face is being aimed.
 *
 * ── WHY THE OFFSETS SCALE TOO ────────────────────────────────────────────────────────────────
 * The image point currently under the frame centre sits at some image-relative position `p`; its
 * frame position is `imageCentre + p * s`. Holding it still while the scale becomes `s * k`
 * requires the centre offset to become `k` times what it was. Leaving x and y alone instead —
 * the obvious implementation — makes the picture appear to slide away from the crosshair as you
 * zoom in, which is the single most common bug in a crop widget.
 */
export function zoomCrop(natural: NinaNaturalSize, crop: NinaCrop, factor: number): NinaCrop {
  const k = finiteOr(factor, 1)
  if (k <= 0) return crop
  return clampCrop(natural, { scale: crop.scale * k, x: crop.x * k, y: crop.y * k })
}

/**
 * A wheel/trackpad `deltaY` as a multiplicative zoom factor. Up (negative delta) zooms in.
 * Exponential, so zoom feels linear per notch at every scale, and hard-capped both ways because a
 * momentum trackpad can emit a `deltaY` of several hundred in one event.
 */
export function zoomFactorForWheel(deltaY: number): number {
  const raw = Math.exp(-finiteOr(deltaY, 0) / NINA_CROP_WHEEL_DIVISOR)
  return Math.min(NINA_CROP_WHEEL_MAX_FACTOR, Math.max(1 / NINA_CROP_WHEEL_MAX_FACTOR, raw))
}

/** An arrow-key nudge, in stored units. The keyboard path to the same clamp. */
export function nudgeCrop(
  natural: NinaNaturalSize,
  crop: NinaCrop,
  dx: number,
  dy: number,
): NinaCrop {
  return clampCrop(natural, { scale: crop.scale, x: crop.x + dx, y: crop.y + dy })
}

/**
 * **THE ONE CROP-TO-CSS MAPPING IN THE REPO.** The admin studio's preview, the album grid's
 * thumbnails, the chat header's 44 px avatar and the typing row's 28 px avatar must all render
 * through this function. Two implementations of it means a crop that looks centred in the tool and
 * off-centre in the app, with nothing failing anywhere — the exact silent failure R23 exists to
 * prevent.
 *
 * Usage — the box MUST be square, `relative` and `overflow-hidden`:
 *
 *     <span className="relative block size-11 overflow-hidden rounded-pill bg-paper-2">
 *       <img src={url} alt="" style={ninaCropStyle({ width, height }, resolveCrop(row))} />
 *     </span>
 *
 * The identity crop returns `{100%, 100%, 0%, 0%}` for a square image and a correctly
 * cover-centred box for any other aspect ratio, so a row with NULL crop columns renders exactly as
 * `object-cover` did before this phase existed. That equality is asserted in the test suite and is
 * what makes the whole album safe to leave un-backfilled.
 */
export function ninaCropStyle(natural: NinaNaturalSize, crop: NinaCrop): NinaCropStyle {
  const { widthPct, heightPct } = cropSpanPct(natural, crop)
  const offsetPct = (units: number) => units / (NINA_CROP_OFFSET_UNITS_PER_FRAME / 100)
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
 * What to persist. An identity crop is written as three NULLs, so the "Reset framing" button and
 * "Save framing" are one code path and one query — phase 1's `updateNinaAvatarCrop` docstring
 * makes exactly that promise, and this is the function that keeps it.
 */
export function cropForWrite(crop: NinaCrop): NinaCropInput {
  if (isIdentityCrop(crop)) return { scale: null, x: null, y: null }
  return { scale: crop.scale, x: crop.x, y: crop.y }
}
