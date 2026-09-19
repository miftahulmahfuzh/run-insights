# Phase 1: Pure crop-math module + exported ratio enum

**Plan set:** `PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md`
**Analysis:** `20260919-134412-K7Q2_code_analyzer.md`
**Satisfies:** R1 — the optional aspect-ratio crop step; this phase supplies the arithmetic every
other phase depends on, and nothing user-visible.
**Depends on:** none
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

After this phase, `NINA_IMAGE_ASPECT_RATIOS` is the repo's one exported source of truth for
OpenRouter's `aspect_ratio` enum (with a label -> numeric lookup beside it), and
`lib/nina/photoshopCrop.ts` exists: a zero-import module that does for a **rectangle at an arbitrary
target aspect ratio** what `lib/nina/crop.ts` does for a square — resolve, clamp, pan, zoom, nudge,
and map to CSS — plus the capability `crop.ts` never needed, `photoshopCropBox`, which turns a
resolved crop into an **integer pixel rectangle** for `sharp().extract()` that can never fall outside
the source image's own bounds. Nothing calls either yet; the phase is pure arithmetic and its test
suite.

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:**

- `lib/nina/imagerecipe.ts`
  - `NINA_IMAGE_ASPECT_RATIOS` — the existing module-private const, now `export`ed. Type unchanged:
    `ReadonlyArray<{ label: string; ratio: number }>`, 23 entries, order unchanged.
  - `ninaImageAspectRatioValue(label: string): number | null` — the label -> numeric-ratio lookup.
    `null` for any label not in the enum, which doubles as the closed-set membership test.
- `lib/nina/photoshopCrop.ts` (new file, **zero imports**)
  - types: `NinaPhotoshopCrop`, `NinaPhotoshopCropInput`, `NinaPhotoshopSourceSize`,
    `NinaPhotoshopCropSpan`, `NinaPhotoshopCropStyle`, `NinaPhotoshopCropBox`
  - constants: `NINA_PHOTOSHOP_CROP_MIN_SCALE` (1), `NINA_PHOTOSHOP_CROP_MAX_SCALE` (4),
    `NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET` (200_000), `NINA_PHOTOSHOP_CROP_KEY_STEP` (10),
    `NINA_PHOTOSHOP_CROP_IDENTITY`
  - functions: `resolvePhotoshopCrop`, `photoshopCropSpanPct`, `maxPhotoshopCropOffset`,
    `clampPhotoshopCrop`, `panPhotoshopCrop`, `zoomPhotoshopCrop`, `nudgePhotoshopCrop`,
    `ninaPhotoshopCropStyle`, `photoshopCropBox`, `isFullFramePhotoshopCropBox`
- `tests/nina.photoshopCrop.test.ts` (new file)

**Signature changes:** none. `nearestNinaImageAspectRatio` is untouched.

**Requires (from earlier phases):** nothing.

**Leaves alone (owned by others):**

- `lib/nina/crop.ts` — **not modified in any way.** `zoomFactorForWheel` is reused from it by
  Phase 5's component importing it directly from `@/lib/nina/crop`; it is deliberately **not**
  re-exported through `photoshopCrop.ts` (see Step 2's note and Handoffs).
- `lib/db/schema/nina/photoshop.ts`, `lib/nina/photoshopJobs.ts`, `scripts/photoshop.ts` (Phase 2)
- `lib/nina/imagecall.ts`, `lib/nina/photoshopRun.ts` (Phase 3)
- `lib/admin/photoshopActions.ts`, `app/admin/photoshop/[source]/[id]/page.tsx` (Phase 4)
- `components/admin/CropStudio.tsx`, `components/admin/PhotoshopDetail.tsx`,
  `components/admin/PhotoshopCropStudio.tsx` (Phase 5)
- `buildImageRequestBody` and every other symbol in `imagerecipe.ts` — this phase adds one `export`
  keyword and one function to that file and changes no existing behavior.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagerecipe.ts` | modify | line 128: `const NINA_IMAGE_ASPECT_RATIOS` -> `export const`; after line 180 (end of `nearestNinaImageAspectRatio`): new `ninaImageAspectRatioValue` |
| `lib/nina/photoshopCrop.ts` | create | the whole rectangle/ratio-aware crop-math module, incl. `photoshopCropBox` |
| `tests/nina.photoshopCrop.test.ts` | create | full suite: zero-import assertion, span/clamp/pan/zoom/style, the pixel box by table, and a 23-ratio property sweep |

---

## Implementation Steps

### Step 1: Export the aspect-ratio enum and add a label -> ratio lookup

**File:** `lib/nina/imagerecipe.ts:121-180`

**Change:** Add the `export` keyword to `NINA_IMAGE_ASPECT_RATIOS` (line 128) and extend its
docstring to say it now has two readers beyond this file. Then add `ninaImageAspectRatioValue`
immediately after `nearestNinaImageAspectRatio` (which currently ends at line 180). One function
serves two consumers: Phase 4's closed-set validation of an untrusted label (`!= null` is the
membership test) and Phase 5's need for the numeric ratio to feed `photoshopCrop.ts`.

Nothing else in the file moves. `nearestNinaImageAspectRatio` keeps reading the same const.

**Code:** replace lines 121-180 (the enum's docstring, the enum, and
`nearestNinaImageAspectRatio`) with exactly this — the only edits are the `export` keyword, two new
docstring paragraphs, and the new function at the end:

```ts
/**
 * **The full `aspect_ratio` enum this provider accepts**, verified against OpenRouter's own image
 * generation API reference (2026-09-19) — not a guessed subset. Every entry needs a numeric `ratio`
 * (width ÷ height) to compare against, so `'auto'` — "let the provider choose", and never documented
 * to look at a reference image's own shape — is deliberately left out of this table rather than
 * given a fake ratio.
 *
 * **Exported because the photoshop crop step needs the same list** (`lib/nina/photoshopCrop.ts`'s
 * plan set, R1): the admin's ratio picker, the Server Action's closed-set validation of the label
 * it gets back, and `nearestNinaImageAspectRatio`'s default pick must all read ONE list. A second
 * copy in a `<select>` is a list that drifts from the one on the wire, silently, the first time
 * this table is corrected — which is the whole reason this is a table and not a literal.
 */
export const NINA_IMAGE_ASPECT_RATIOS: ReadonlyArray<{ label: string; ratio: number }> = [
  { label: '1:1', ratio: 1 / 1 },
  { label: '1:2', ratio: 1 / 2 },
  { label: '1:4', ratio: 1 / 4 },
  { label: '1:8', ratio: 1 / 8 },
  { label: '2:1', ratio: 2 / 1 },
  { label: '2:3', ratio: 2 / 3 },
  { label: '2.35:1', ratio: 2.35 / 1 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '4:1', ratio: 4 / 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '5:2', ratio: 5 / 2 },
  { label: '5:4', ratio: 5 / 4 },
  { label: '8:1', ratio: 8 / 1 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:19.5', ratio: 9 / 19.5 },
  { label: '19.5:9', ratio: 19.5 / 9 },
  { label: '9:20', ratio: 9 / 20 },
  { label: '20:9', ratio: 20 / 9 },
  { label: '9:21', ratio: 9 / 21 },
  { label: '21:9', ratio: 21 / 9 },
]

/**
 * **The 2026-09-19 edit-mode aspect fix.** `attemptPhotoshopOnce` (`lib/nina/photoshopRun.ts`) and
 * `scripts/photoshop.ts` always sent `aspect_ratio: NINA_IMAGE_ASPECT` — a hardcoded `'3:4'` —
 * regardless of the source photo's own shape, which a runner caught live: a 832x938 (0.887) source
 * edited by `bytedance-seed/seedream-4.5` came back 1664x2218 (0.750), stretched onto a fixed 3:4
 * canvas rather than kept at the photo's own proportions. Edit mode is documented to keep the rest
 * of the photo as it is; a canvas shape the source never had breaks that promise.
 *
 * Picks the catalogued ratio closest to `width/height` by LOG distance, not raw difference —
 * ratio comparison is multiplicative (2:1 and 4:1 are as far apart as 1:1 and 2:1), so a linear
 * distance would favour the extreme entries. Falls back to `NINA_IMAGE_ASPECT` for a source with
 * no usable dimensions (`0`, negative, `NaN`) rather than dividing by zero.
 */
export function nearestNinaImageAspectRatio(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return NINA_IMAGE_ASPECT
  const target = width / height
  let best = NINA_IMAGE_ASPECT_RATIOS[0]!
  let bestDelta = Number.POSITIVE_INFINITY
  for (const candidate of NINA_IMAGE_ASPECT_RATIOS) {
    const delta = Math.abs(Math.log(candidate.ratio / target))
    if (delta < bestDelta) {
      bestDelta = delta
      best = candidate
    }
  }
  return best.label
}

/**
 * A catalogued label as the number `lib/nina/photoshopCrop.ts` needs, or `null` for anything not in
 * the table.
 *
 * `null` is the closed-set membership test as well as the miss: the crop label arrives from a
 * browser, so "is this one of the provider's 23 values" and "what is it numerically" are the same
 * question asked twice, and one function answering both is one place to be wrong. Exact string
 * match, deliberately — no trimming, no case folding: the label goes on the wire verbatim as
 * `aspect_ratio`, so a value this function accepts must be a value the provider accepts.
 */
export function ninaImageAspectRatioValue(label: string): number | null {
  for (const candidate of NINA_IMAGE_ASPECT_RATIOS) {
    if (candidate.label === label) return candidate.ratio
  }
  return null
}
```

**Impact:** Additive only. No existing caller of `nearestNinaImageAspectRatio` changes, no request
body changes, and `imagerecipe.ts` keeps its zero-import property (nothing was imported to add
these). `npm run knip` may report `ninaImageAspectRatioValue` as an unused export until Phase 4
lands — knip is not part of CI (CI is: the 7 guards, `format:check`, `lint`, `typecheck`, `test`,
`build`), and the new test file imports it, which gives knip a real consumer edge either way.

---

### Step 2: The pure crop-math module

**File:** `lib/nina/photoshopCrop.ts` (new)

**Change:** Create the file with the content below, in full.

Four design decisions this code makes, and why, because they are the ones a reviewer will question:

1. **Offsets are per-axis units, unlike `crop.ts`.** `crop.ts` stores both `x` and `y` in
   thousandths of the frame's *width*, and says in its header that this is only legal *because the
   frame is square*. The frame here is not square, so `x` is thousandths of the frame's **width**
   and `y` is thousandths of the frame's **height**. That is what keeps the CSS mapping symmetric
   (`left: N%` resolves against the containing block's width, `top: N%` against its height), keeps
   the clamp symmetric, and keeps the pixel box symmetric. It is the single most important
   difference between the two modules and the one a copy-paste from `crop.ts` would get wrong.
2. **`targetRatio` is a number, not a label.** This module imports nothing at all — not even the
   zero-import `imagerecipe.ts`. `scripts/photoshop.ts` imports its sibling modules by relative path
   with an explicit `.ts` extension under `node --experimental-strip-types`; a module with literally
   no imports can never be blocked by a resolution rule a future CLI caller trips over. The label
   -> number step is Step 1's `ninaImageAspectRatioValue`, called by the consumer.
3. **`zoomFactorForWheel` is not re-exported here.** It is ratio-agnostic (`deltaY -> factor`) and
   already correct, so it must not be duplicated — but re-exporting it would cost this module its
   zero-import property for a function that has nothing to do with aspect ratios. Phase 5's
   component imports it straight from `@/lib/nina/crop`, which is where it lives and stays.
4. **`photoshopCropBox` returns `null` rather than a wrong-ratio box.** If the requested window is
   under one pixel on either axis (a 3x2 source asked for 1:8), no integer rectangle at that ratio
   exists, and returning a 1x1 box would be a silently wrong crop — exactly the failure the whole
   feature exists to remove. `null` means "this crop is not expressible; fall back to no crop."

**Code:**

```ts
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
   * compares equal to `0` everywhere and which `Object.is` — and therefore `toEqual` — tells apart. */
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(max, Math.max(-max, finiteOr(value, 0)))) + 0
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
```

**Impact:** A new file with no importers yet. `npm test`, `tsc --noEmit` and `lint` are unaffected
by its existence; Step 3's suite is what proves it. `npm run knip` will report the module's exports
as consumed only by the test file until Phases 3-5 land — expected, and not a CI gate.

---

### Step 3: The test suite

**File:** `tests/nina.photoshopCrop.test.ts` (new)

**Change:** Create the file with the content below. There is no `lib/nina/crop.ts` suite to mirror
(confirmed again in this worktree: `resolveCrop`/`clampCrop`/`ninaCropStyle` appear in
`tests/admin.chatPhotoAdoption.test.ts` and `tests/nina.chatAvatar.test.ts` only incidentally), so
this is written from first principles at `tests/nina.imagerecipe.test.ts`'s rigor. The zero-import
assertion copies `tests/nina.imageprefs.test.ts:55-73`'s exact shape, which is this repo's existing
way of proving that property.

Every expected number below was computed from the derivation in Step 2 and verified numerically
before this plan was written; the 852-case sweep in the last `describe` passed with zero violations.

**Code:**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  NINA_IMAGE_ASPECT_RATIOS,
  nearestNinaImageAspectRatio,
  ninaImageAspectRatioValue,
} from '@/lib/nina/imagerecipe'
import {
  clampPhotoshopCrop,
  isFullFramePhotoshopCropBox,
  maxPhotoshopCropOffset,
  NINA_PHOTOSHOP_CROP_IDENTITY,
  NINA_PHOTOSHOP_CROP_KEY_STEP,
  NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET,
  NINA_PHOTOSHOP_CROP_MAX_SCALE,
  NINA_PHOTOSHOP_CROP_MIN_SCALE,
  ninaPhotoshopCropStyle,
  nudgePhotoshopCrop,
  panPhotoshopCrop,
  photoshopCropBox,
  photoshopCropSpanPct,
  resolvePhotoshopCrop,
  zoomPhotoshopCrop,
  type NinaPhotoshopCrop,
} from '@/lib/nina/photoshopCrop'

/**
 * The rectangle crop's arithmetic. R1 of the photoshop-aspect-ratio-crop plan set.
 *
 * `photoshopCropBox` gets the heaviest scrutiny in here on purpose: it is the one function whose
 * being wrong is invisible — an off-by-one crops the wrong region, the model happily re-renders it,
 * and nothing anywhere fails.
 */

const IDENTITY: NinaPhotoshopCrop = { ...NINA_PHOTOSHOP_CROP_IDENTITY }

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')
}

describe('the module stays loadable from a client component and from a strip-types script', () => {
  it('has no imports at all, and nothing server-only', () => {
    // `tests/nina.imageprefs.test.ts`'s assertion, for the same reason: `scripts/photoshop.ts` and
    // the image worker load lib/nina modules by relative path under --experimental-strip-types,
    // which resolves neither `server-only` nor the `@/` alias.
    const source = readSource('lib/nina/photoshopCrop.ts')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('server-only')
    expect(code).not.toContain('@/lib/')
    expect(code).not.toContain('require(')
  })

  it('imagerecipe.ts keeps its own zero-import property after the export', () => {
    const source = readSource('lib/nina/imagerecipe.ts')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
  })
})

describe('ninaImageAspectRatioValue — one enum, two questions', () => {
  it('resolves every catalogued label to its own ratio', () => {
    expect(NINA_IMAGE_ASPECT_RATIOS.length).toBe(23)
    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      expect(ninaImageAspectRatioValue(entry.label)).toBe(entry.ratio)
    }
  })

  it('spells the ratios the provider spells', () => {
    expect(ninaImageAspectRatioValue('5:4')).toBe(1.25)
    expect(ninaImageAspectRatioValue('16:9')).toBe(16 / 9)
    expect(ninaImageAspectRatioValue('2.35:1')).toBe(2.35)
  })

  it('is null for anything not in the table, including near misses', () => {
    // Exact match only: the label goes on the wire verbatim as `aspect_ratio`, so anything this
    // accepts must be something the provider accepts. This is also phase 4's closed-set check.
    expect(ninaImageAspectRatioValue('auto')).toBeNull()
    expect(ninaImageAspectRatioValue('5:4 ')).toBeNull()
    expect(ninaImageAspectRatioValue('5x4')).toBeNull()
    expect(ninaImageAspectRatioValue('')).toBeNull()
    expect(ninaImageAspectRatioValue('1:3')).toBeNull()
  })

  it('agrees with the default the crop step opens on', () => {
    // Phase 5 opens the picker on `nearestNinaImageAspectRatio`'s pick; that label must therefore
    // always be one this function can price.
    expect(ninaImageAspectRatioValue(nearestNinaImageAspectRatio(832, 732))).toBe(1.25)
    expect(ninaImageAspectRatioValue(nearestNinaImageAspectRatio(768, 1024))).toBe(0.75)
    for (const [w, h] of [
      [832, 732],
      [4000, 3000],
      [1080, 1920],
      [5000, 417],
    ] as const) {
      expect(ninaImageAspectRatioValue(nearestNinaImageAspectRatio(w, h))).not.toBeNull()
    }
  })
})

describe('resolvePhotoshopCrop — a row, however partial, becomes a usable crop', () => {
  it('reads nothing at all as the identity', () => {
    expect(resolvePhotoshopCrop(null)).toEqual(IDENTITY)
    expect(resolvePhotoshopCrop(undefined)).toEqual(IDENTITY)
    expect(resolvePhotoshopCrop({ scale: null, x: null, y: null })).toEqual(IDENTITY)
  })

  it('reads a partial triple as the identity in the missing parts', () => {
    expect(resolvePhotoshopCrop({ scale: 2, x: null, y: null })).toEqual({ scale: 2, x: 0, y: 0 })
    expect(resolvePhotoshopCrop({ scale: null, x: 120, y: -40 })).toEqual({
      scale: NINA_PHOTOSHOP_CROP_MIN_SCALE,
      x: 120,
      y: -40,
    })
  })

  it('folds garbage into the identity rather than throwing', () => {
    expect(resolvePhotoshopCrop({ scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: -0.4 })).toEqual(
      { scale: NINA_PHOTOSHOP_CROP_MIN_SCALE, x: 0, y: -0 },
    )
    expect(resolvePhotoshopCrop({ scale: 0.25, x: 0, y: 0 }).scale).toBe(
      NINA_PHOTOSHOP_CROP_MIN_SCALE,
    )
  })

  it('rounds offsets to the integer the column stores', () => {
    expect(resolvePhotoshopCrop({ scale: 1, x: 12.4, y: -7.6 })).toEqual({ scale: 1, x: 12, y: -8 })
  })
})

describe('photoshopCropSpanPct — the aspect fit against a RECTANGLE', () => {
  it('is exactly {100, 100} when the source already is the target ratio', () => {
    expect(photoshopCropSpanPct({ width: 768, height: 1024 }, 0.75, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(photoshopCropSpanPct({ width: 1000, height: 1000 }, 1, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })

  it('overflows the wide axis when the source is wider than the frame', () => {
    // 4000x3000 into a square: the height fits, the width overflows by 4/3. Divided once, so it is
    // exactly 400/3 and the preview and the pixel box agree in the last digit.
    expect(photoshopCropSpanPct({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      widthPct: 400 / 3,
      heightPct: 100,
    })
  })

  it('overflows the tall axis when the source is narrower than the frame', () => {
    // The runner's live source, 832x732 (1.137), into 5:4 (1.25): the width fits, the height
    // overflows by 1.25 / 1.137.
    expect(photoshopCropSpanPct({ width: 832, height: 732 }, 1.25, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: (732 * 1.25 * 100) / 832,
    })
  })

  it('scales both axes with the scale', () => {
    expect(photoshopCropSpanPct({ width: 4000, height: 3000 }, 1, { scale: 2, x: 0, y: 0 })).toEqual(
      { widthPct: 800 / 3, heightPct: 200 },
    )
  })

  it('degrades to plain cover for an unknown size or an unusable ratio', () => {
    expect(photoshopCropSpanPct({ width: null, height: null }, 1, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(photoshopCropSpanPct({ width: 800, height: 600 }, 0, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(photoshopCropSpanPct({ width: 800, height: 600 }, Number.NaN, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })
})

describe('maxPhotoshopCropOffset — the axis that already fits cannot slide', () => {
  it('gives zero slack on the fitting axis and real slack on the overflowing one', () => {
    expect(maxPhotoshopCropOffset({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      x: 166,
      y: 0,
    })
    expect(maxPhotoshopCropOffset({ width: 832, height: 732 }, 1.25, IDENTITY)).toEqual({
      x: 0,
      y: 49,
    })
  })

  it('gives slack on both axes once zoomed past cover', () => {
    expect(
      maxPhotoshopCropOffset({ width: 4000, height: 3000 }, 1, { scale: 2, x: 0, y: 0 }),
    ).toEqual({ x: 833, y: 500 })
  })

  it('is zero on both axes for a source that already is the target ratio', () => {
    expect(maxPhotoshopCropOffset({ width: 768, height: 1024 }, 0.75, IDENTITY)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('never exceeds the Server Action’s dimension-free ceiling for a catalogued ratio', () => {
    // Phase 4 bounds an untrusted offset before it knows the source's size; that bound must not be
    // tighter than anything this module can legitimately produce.
    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      const limit = maxPhotoshopCropOffset({ width: 5000, height: 417 }, entry.ratio, {
        scale: NINA_PHOTOSHOP_CROP_MAX_SCALE,
        x: 0,
        y: 0,
      })
      expect(limit.x).toBeLessThanOrEqual(NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET)
      expect(limit.y).toBeLessThanOrEqual(NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET)
    }
  })
})

describe('clampPhotoshopCrop — the only way a crop becomes valid', () => {
  const source = { width: 4000, height: 3000 }

  it('holds the scale inside [MIN, MAX] and rounds it to the column’s three decimals', () => {
    expect(clampPhotoshopCrop(source, 1, { scale: 0.2, x: 0, y: 0 }).scale).toBe(
      NINA_PHOTOSHOP_CROP_MIN_SCALE,
    )
    expect(clampPhotoshopCrop(source, 1, { scale: 99, x: 0, y: 0 }).scale).toBe(
      NINA_PHOTOSHOP_CROP_MAX_SCALE,
    )
    expect(clampPhotoshopCrop(source, 1, { scale: 1.23456, x: 0, y: 0 }).scale).toBe(1.235)
  })

  it('clamps the offsets against the NEW scale, not the old one', () => {
    // Zooming out to cover must pull the offsets back in the same call, or the frame shows a corner
    // of background while the stored triple still looks legal.
    expect(clampPhotoshopCrop(source, 1, { scale: 1, x: 800, y: 400 })).toEqual({
      scale: 1,
      x: 166,
      y: 0,
    })
  })

  it('clamps symmetrically in the negative direction and never stores -0', () => {
    const clamped = clampPhotoshopCrop(source, 1, { scale: 1, x: -800, y: -400 })
    expect(clamped).toEqual({ scale: 1, x: -166, y: 0 })
    expect(Object.is(clamped.y, -0)).toBe(false)
  })

  it('folds non-finite input into something storable', () => {
    expect(
      clampPhotoshopCrop(source, 1, {
        scale: Number.NaN,
        x: Number.POSITIVE_INFINITY,
        y: Number.NaN,
      }),
    ).toEqual({ scale: 1, x: 166, y: 0 })
  })
})

describe('pan, zoom and nudge all land on the same clamp', () => {
  const source = { width: 4000, height: 3000 }

  it('converts a pointer drag into stored units per axis', () => {
    // A 500 px-wide frame at 1:1 is 500 px tall, so 50 px is 100 thousandths on either axis.
    expect(panPhotoshopCrop(source, 1, IDENTITY, 50, 50, 500)).toEqual({ scale: 1, x: 100, y: 0 })
  })

  it('uses the frame’s HEIGHT for the y unit, which is what makes the rectangle work', () => {
    // A 500 px-wide frame at 2:1 is 250 px tall, so the same 50 px drag is 200 thousandths of the
    // frame's height. A module that used the frame's width for y (crop.ts's convention, which is
    // only legal for a square) would say 100 here and the preview would drift from the pixel box.
    const panned = panPhotoshopCrop({ width: 1000, height: 1000 }, 2, IDENTITY, 0, 50, 500)
    expect(panned.y).toBe(200)
  })

  it('returns the crop untouched before the frame has been measured', () => {
    expect(panPhotoshopCrop(source, 1, IDENTITY, 50, 50, 0)).toEqual(IDENTITY)
    expect(panPhotoshopCrop(source, 1, IDENTITY, 50, 50, Number.NaN)).toEqual(IDENTITY)
    expect(panPhotoshopCrop(source, 0, IDENTITY, 50, 50, 500)).toEqual(IDENTITY)
  })

  it('zooms about the frame centre, carrying the offsets with the scale', () => {
    const zoomed = zoomPhotoshopCrop(source, 1, { scale: 1, x: 100, y: 0 }, 2)
    expect(zoomed).toEqual({ scale: 2, x: 200, y: 0 })
  })

  it('never zooms below cover or above the ceiling', () => {
    expect(zoomPhotoshopCrop(source, 1, IDENTITY, 0.1).scale).toBe(NINA_PHOTOSHOP_CROP_MIN_SCALE)
    expect(zoomPhotoshopCrop(source, 1, { scale: 3, x: 0, y: 0 }, 10).scale).toBe(
      NINA_PHOTOSHOP_CROP_MAX_SCALE,
    )
    expect(zoomPhotoshopCrop(source, 1, IDENTITY, 0)).toEqual(IDENTITY)
    expect(zoomPhotoshopCrop(source, 1, IDENTITY, Number.NaN)).toEqual(IDENTITY)
  })

  it('nudges by the key step and stops at the clamp', () => {
    expect(nudgePhotoshopCrop(source, 1, IDENTITY, NINA_PHOTOSHOP_CROP_KEY_STEP, 0)).toEqual({
      scale: 1,
      x: 10,
      y: 0,
    })
    // The y axis already fits at cover: an arrow press there is a no-op, not a sliver of background.
    expect(nudgePhotoshopCrop(source, 1, IDENTITY, 0, NINA_PHOTOSHOP_CROP_KEY_STEP)).toEqual(
      IDENTITY,
    )
    expect(nudgePhotoshopCrop(source, 1, { scale: 1, x: 160, y: 0 }, 100, 0).x).toBe(166)
  })
})

describe('ninaPhotoshopCropStyle — the preview the operator frames against', () => {
  it('is plain centred cover for a source that already is the target ratio', () => {
    expect(ninaPhotoshopCropStyle({ width: 768, height: 1024 }, 0.75, IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      objectFit: 'cover',
    })
  })

  it('centres the overflow of a wider source in a square frame', () => {
    expect(ninaPhotoshopCropStyle({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      position: 'absolute',
      width: '133.3333%',
      height: '100%',
      left: '-16.6667%',
      top: '0%',
      objectFit: 'cover',
    })
  })

  it('moves the image by a tenth of a percent per stored unit, per axis', () => {
    const style = ninaPhotoshopCropStyle({ width: 4000, height: 3000 }, 1, {
      scale: 1,
      x: 100,
      y: 0,
    })
    expect(style.left).toBe('-6.6667%')
  })

  it('agrees with the pixel box on the same window', () => {
    // The property that stops the operator framing one rectangle and the model receiving another:
    // the left edge the CSS puts on screen, read back as a fraction of the image, is the left edge
    // the pixel box names.
    const source = { width: 4000, height: 3000 }
    const crop: NinaPhotoshopCrop = { scale: 2, x: 300, y: -200 }
    const style = ninaPhotoshopCropStyle(source, 1, crop)
    const box = photoshopCropBox(source, 1, crop)!
    const widthPct = Number.parseFloat(style.width)
    const leftPct = Number.parseFloat(style.left)
    expect(Math.round((source.width * -leftPct) / widthPct)).toBe(box.left)
    expect(Math.round((source.width * 100) / widthPct)).toBe(box.width)
  })
})

describe('photoshopCropBox — the function whose being wrong is invisible', () => {
  it('takes the largest centred rectangle at the target ratio, identity crop', () => {
    // 4000x3000 to a square: 3000x3000, centred horizontally, both edges inside the file.
    expect(photoshopCropBox({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    })
  })

  it('is the whole file when the source already is the target ratio', () => {
    const source = { width: 768, height: 1024 }
    const box = photoshopCropBox(source, 0.75, IDENTITY)!
    expect(box).toEqual({ left: 0, top: 0, width: 768, height: 1024 })
    expect(isFullFramePhotoshopCropBox(source, box)).toBe(true)
  })

  it('crops the runner’s live source to an exact 5:4, which is the whole point', () => {
    // 832x732 (1.137) is the source that came back ~10% wide through the nearest-bucket path.
    // 832 / 1.25 = 665.6, so the box is 832x666 at the top of the frame's vertical slack.
    const source = { width: 832, height: 732 }
    const box = photoshopCropBox(source, 1.25, IDENTITY)!
    expect(box).toEqual({ left: 0, top: 33, width: 832, height: 666 })
    expect(isFullFramePhotoshopCropBox(source, box)).toBe(false)
    expect(Math.abs(box.width / box.height - 1.25)).toBeLessThan(0.002)
  })

  it('shrinks the window around the frame centre as the scale grows', () => {
    // Zoom 2x on a square frame: half the window, still centred on the image's own centre.
    expect(photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 2, x: 0, y: 0 })).toEqual({
      left: 1250,
      top: 750,
      width: 1500,
      height: 1500,
    })
    expect(photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 4, x: 0, y: 0 })).toEqual({
      left: 1625,
      top: 1125,
      width: 750,
      height: 750,
    })
  })

  it('moves the window with the offsets, in the opposite direction to the image', () => {
    // The image moves right when x grows, so the WINDOW moves left over the source.
    const right = photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 2, x: 200, y: 0 })!
    const left = photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 2, x: -200, y: 0 })!
    expect(right.left).toBeLessThan(1250)
    expect(left.left).toBeGreaterThan(1250)
    expect(right.width).toBe(1500)
    expect(left.width).toBe(1500)
  })

  it('stays inside the file at the extreme of the pan, on both sides', () => {
    // The clamp's own limit, driven past on purpose. This is the case that throws inside
    // sharp().extract() if the arithmetic is a pixel out.
    const source = { width: 4000, height: 3000 }
    const far = photoshopCropBox(source, 1, { scale: 1, x: 9_999, y: 9_999 })!
    const near = photoshopCropBox(source, 1, { scale: 1, x: -9_999, y: -9_999 })!
    expect(far).toEqual({ left: 2, top: 0, width: 3000, height: 3000 })
    expect(near).toEqual({ left: 998, top: 0, width: 3000, height: 3000 })
    expect(far.left + far.width).toBeLessThanOrEqual(source.width)
    expect(near.left + near.width).toBeLessThanOrEqual(source.width)
  })

  it('crops the other axis for a portrait target, and an odd source size', () => {
    expect(photoshopCropBox({ width: 1001, height: 1001 }, 21 / 9, IDENTITY)).toEqual({
      left: 0,
      top: 286,
      width: 1001,
      height: 429,
    })
    expect(photoshopCropBox({ width: 1001, height: 1001 }, 9 / 21, IDENTITY)).toEqual({
      left: 286,
      top: 0,
      width: 429,
      height: 1001,
    })
  })

  it('floors a fractional natural size rather than naming a row that is not there', () => {
    expect(photoshopCropBox({ width: 4000.7, height: 3000.9 }, 1, IDENTITY)).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    })
  })

  it('is null when there is nothing to crop', () => {
    expect(photoshopCropBox({ width: null, height: null }, 1, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 0, height: 100 }, 1, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 100, height: -5 }, 1, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 100, height: 100 }, 0, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 100, height: 100 }, Number.NaN, IDENTITY)).toBeNull()
  })

  it('is null rather than a wrong-ratio box when the window is under a pixel', () => {
    // A 3x2 thumbnail cannot hold an 8:1 rectangle. Returning a 1x1 box would be a crop at the
    // wrong ratio, which is the exact failure this whole feature exists to remove; the caller
    // treats null as "no crop" and the job runs as it does today.
    expect(photoshopCropBox({ width: 3, height: 2 }, 8, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 1, height: 1 }, 8, IDENTITY)).toBeNull()
  })

  it('clamps a crop it was handed unclamped', () => {
    // Phase 3 reads these numbers out of a row a browser wrote days earlier. The box must be the
    // same whether or not the caller remembered to clamp first.
    const source = { width: 4000, height: 3000 }
    const wild: NinaPhotoshopCrop = { scale: 99, x: 50_000, y: -50_000 }
    expect(photoshopCropBox(source, 1, wild)).toEqual(
      photoshopCropBox(source, 1, clampPhotoshopCrop(source, 1, wild)),
    )
  })
})

describe('photoshopCropBox holds its two invariants across the whole enum', () => {
  const sources = [
    [832, 732],
    [4000, 3000],
    [1001, 999],
    [768, 1024],
    [1920, 1080],
    [100, 100],
    [2048, 2048],
    [5000, 417],
    [417, 5000],
  ] as const
  const crops: readonly NinaPhotoshopCrop[] = [
    { scale: 1, x: 0, y: 0 },
    { scale: 1.5, x: 200, y: -300 },
    { scale: 4, x: 9_999, y: -9_999 },
    { scale: 2.75, x: -50, y: 75 },
  ]

  it('never names a region outside the source, for any catalogued ratio', () => {
    for (const [width, height] of sources) {
      for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
        for (const crop of crops) {
          const box = photoshopCropBox({ width, height }, entry.ratio, crop)
          if (box == null) continue
          const where = `${width}x${height} @${entry.label} ${JSON.stringify(crop)}`
          expect(Number.isInteger(box.left), where).toBe(true)
          expect(Number.isInteger(box.top), where).toBe(true)
          expect(Number.isInteger(box.width), where).toBe(true)
          expect(Number.isInteger(box.height), where).toBe(true)
          expect(box.left, where).toBeGreaterThanOrEqual(0)
          expect(box.top, where).toBeGreaterThanOrEqual(0)
          expect(box.width, where).toBeGreaterThanOrEqual(1)
          expect(box.height, where).toBeGreaterThanOrEqual(1)
          expect(box.left + box.width, where).toBeLessThanOrEqual(width)
          expect(box.top + box.height, where).toBeLessThanOrEqual(height)
        }
      }
    }
  })

  it('lands within half a pixel of the target ratio on the derived axis', () => {
    // An integer rectangle cannot hit every ratio exactly (832 px at 5:4 wants 665.6 px). The bound
    // the rounding guarantees is half a pixel on the derived axis; this states it as a ratio.
    for (const [width, height] of sources) {
      for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
        for (const crop of crops) {
          const box = photoshopCropBox({ width, height }, entry.ratio, crop)
          if (box == null) continue
          const where = `${width}x${height} @${entry.label} ${JSON.stringify(crop)}`
          const error = Math.abs(box.width / box.height - entry.ratio)
          expect(error, where).toBeLessThanOrEqual(entry.ratio / Math.min(box.width, box.height))
        }
      }
    }
  })

  it('is a no-op box exactly when the source already is the target ratio', () => {
    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      // A source built to BE this ratio, at the identity crop, must come back as the whole file.
      const width = 2000
      const height = Math.round(width / entry.ratio)
      const box = photoshopCropBox({ width, height }, entry.ratio, IDENTITY)!
      expect(isFullFramePhotoshopCropBox({ width, height }, box), entry.label).toBe(true)
    }
  })
})

describe('isFullFramePhotoshopCropBox', () => {
  it('is false as soon as any edge has moved', () => {
    const source = { width: 4000, height: 3000 }
    expect(isFullFramePhotoshopCropBox(source, { left: 0, top: 0, width: 4000, height: 3000 })).toBe(
      true,
    )
    expect(isFullFramePhotoshopCropBox(source, { left: 1, top: 0, width: 3999, height: 3000 })).toBe(
      false,
    )
    expect(isFullFramePhotoshopCropBox(source, { left: 0, top: 0, width: 4000, height: 2999 })).toBe(
      false,
    )
  })

  it('is false when the source size is unknown', () => {
    expect(
      isFullFramePhotoshopCropBox({ width: null, height: null }, {
        left: 0,
        top: 0,
        width: 4000,
        height: 3000,
      }),
    ).toBe(false)
  })
})
```

**Impact:** ~60 assertions over the module plus the two new `imagerecipe.ts` behaviors. The
`it('is a no-op box exactly when the source already is the target ratio')` case is the one that
would catch a regression in the binding-axis choice, and the two sweep cases are what catch an
off-by-one that only shows up at one of the 23 ratios.

> **Note for the implementer on one assertion:** the `2000 / entry.ratio` source in the last sweep
> case rounds the height to an integer, so the constructed source is within half a pixel of the
> ratio rather than exactly on it. That is deliberate — it is the realistic case (no real file is
> exactly 21:9) and it is precisely where a naive implementation returns a 1999-px-wide box. It was
> verified to hold for all 23 entries before this plan was written; if one entry fails after the
> module is written, the module is wrong, not the test.

---

## Verification

> **Environment note (reconciler, round 1):** this worktree has **no `node_modules`** and the
> shell's default Node is **v20.11.1**, below `package.json`'s `"engines": { "node": ">=22" }` —
> Vitest 4 cannot boot on it (`node:util` has no `styleText`). Run `npm ci` in the worktree under a
> Node >= 22 binary before any command below. This is one-off environment setup for the whole plan
> set, not work belonging to this phase.

**Build:** `npm run build` (not the real gate — see below)

**Tests:**

```bash
npx vitest run tests/nina.photoshopCrop.test.ts
npx vitest run tests/nina.imagerecipe.test.ts     # regression: the enum export changed nothing
npm test
```

**Typecheck / lint / format (the real gates):**

```bash
npm run typecheck        # next typegen && tsc --noEmit
npm run lint
npm run format:check
```

**Guards** (none of them should be affected, asserted rather than assumed):

```bash
npm run ci:openrouter-guard     # no API key literal is introduced
npm run ci:data-layer-guard     # the new module imports no db, no Drizzle value
npm run ci:llm-payload-guard
```

**Manual check:** open `lib/nina/photoshopCrop.ts` and confirm there is not one `import` line in
it — the suite asserts this, but it is the property the whole module's placement depends on and it
is worth seeing.

**Exit criteria:**

- `NINA_IMAGE_ASPECT_RATIOS` is exported and `ninaImageAspectRatioValue` resolves all 23 labels and
  nothing else.
- `lib/nina/photoshopCrop.ts` exists, imports nothing, and `photoshopCropBox` returns an integer
  rectangle that is inside the source for every catalogued ratio at every tested crop, or `null`.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` all pass; no runtime
  behavior anywhere in the app has changed, because nothing calls the new module yet.

## Handoffs

> **Reconciler note (round 1): Phase 1 is the DEFINER and was not changed.** Phases 3, 4 and 5 were
> drafted in parallel against assumed spellings and have been edited to match this file's Interface
> Contract exactly. The three mismatches that existed, all now fixed in the consuming plans:
> `photoshopCropBox`'s argument order is **(source, targetRatio, crop)** and its return is
> **`NinaPhotoshopCropBox | null`** (Phase 3 assumed `(natural, crop, ratio)` and non-nullable);
> the CSS function is **`ninaPhotoshopCropStyle`** and every mutator also takes **(source,
> targetRatio, crop)** (Phase 5 assumed `photoshopCropStyle` and ratio-last); and
> **`ninaImageAspectRatioValue`** is the one label->ratio/membership lookup, now used by Phases 3,
> 4 and 5 instead of three separate `.find()`/`.some()` calls over the table. Phase 5 already
> imported `zoomFactorForWheel` from `@/lib/nina/crop` correctly — no change was needed there.

- **Phase 5 imports `zoomFactorForWheel` from `@/lib/nina/crop`, not from `photoshopCrop.ts`.** It
  is ratio-agnostic and must not be duplicated, but re-exporting it would cost this module the
  zero-import property that decides where it can be loaded from. `lib/nina/crop.ts` is not modified
  by this plan set at all. Phase 5 should also use `NINA_PHOTOSHOP_CROP_MIN_SCALE` /
  `NINA_PHOTOSHOP_CROP_MAX_SCALE` / `NINA_PHOTOSHOP_CROP_KEY_STEP` from this module, not
  `crop.ts`'s square-frame constants.
- **Phase 5's crop frame must carry the target ratio as its CSS aspect ratio** and must measure only
  its WIDTH (`panPhotoshopCrop` derives the height). `ninaPhotoshopCropStyle`'s docstring spells the
  markup. Rendering the frame in a box whose CSS ratio is not `targetRatio` silently stretches the
  y offset — the rectangle analogue of `crop.ts`'s square requirement.
- **Phase 4's validation bounds** are `NINA_PHOTOSHOP_CROP_MIN_SCALE`/`MAX_SCALE` for the scale and
  `NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET` for `|x|`/`|y|`, plus
  `ninaImageAspectRatioValue(label) != null` as the closed-set label check. The coarse offset
  ceiling is deliberately loose; `photoshopCropBox` re-clamps exactly, so phase 4 only has to reject
  absurdity.
- **Phase 3 gets `null` from `photoshopCropBox` for an unusable source/ratio pair** and must treat
  that as "no crop" — fall back to today's `nearestNinaImageAspectRatio` path rather than failing
  the job. `isFullFramePhotoshopCropBox` is there so Phase 3 can skip the `sharp().extract()`
  round-trip when the box is the whole file (which happens for any source whose own ratio already
  matches the chosen one at the identity crop); using it is Phase 3's call, and the suite asserts it
  either way.
- **Phase 2's column types must match this module's output:** `scale` is rounded to 3 decimals
  (`numeric(5,3)` as planned) and `x`/`y` are always integers, so `integer` columns are right. No
  further coordination is needed.
- **No "crop for write" helper is provided**, deliberately. The all-four-or-none storage convention
  is Phase 4/5's boundary ("the admin opened the step" is the condition, not "the crop is
  non-identity"), and a helper here would be guessing at their rule. `crop.ts`'s `cropForWrite`
  exists because the avatar's Reset button needs it; nothing in this feature does.

## Rollback

`git revert` the phase's commit, or by hand:

1. Delete `lib/nina/photoshopCrop.ts` and `tests/nina.photoshopCrop.test.ts`.
2. In `lib/nina/imagerecipe.ts`, drop the `export` keyword from `NINA_IMAGE_ASPECT_RATIOS` (line
   128) and delete `ninaImageAspectRatioValue`.

Nothing else in the tree references either change, so the revert cannot break a caller. If Phases
3-5 have already landed, they are the ones that reference this module and the revert must go in
reverse phase order.
