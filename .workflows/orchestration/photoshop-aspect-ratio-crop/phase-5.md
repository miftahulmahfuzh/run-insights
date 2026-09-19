# Phase 5: Crop UI + PhotoshopDetail wiring

**Plan set:** `PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md`
**Analysis:** `20260919-134412-K7Q2_code_analyzer.md`
**Satisfies:** R1 — the admin can pick an exact OpenRouter `aspect_ratio` and pan/zoom the source
inside a rectangle at that ratio, on `/admin/photoshop/[source]/[id]`, in both Anchor and Edit mode,
and skipping the step leaves today's behaviour untouched.
**Depends on:** Phase 1 (`lib/nina/photoshopCrop.ts`, exported `NINA_IMAGE_ASPECT_RATIOS`),
Phase 4 (`runPhotoshopJobAction`'s crop input shape, the page's `sourceWidth`/`sourceHeight` props)
**Difficulty:** HARD
**Package:** `components/admin`

---

## Goal

After this phase `/admin/photoshop/[source]/[id]` carries an optional, collapsible **Aspect ratio
crop** step, offered identically in Anchor and Edit mode. Opening it shows a rectangle frame at a
chosen catalogued ratio (defaulting to `nearestNinaImageAspectRatio`'s pick) that the admin pans and
zooms with pointer, pinch, wheel, slider and arrow keys; running the job then sends the four crop
fields to `runPhotoshopJobAction`. Leaving the step closed sends all four as `null`, which is the
"no crop, behave as today" value every other phase already agreed on.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.
**Renames:** none.
**Creates:**
- `components/admin/PhotoshopCropStudio.tsx` — `PhotoshopCropStudio` (component),
  `PhotoshopCropSelection` (interface: `{ ratioLabel: string; crop: NinaPhotoshopCrop }`).
- `components/admin/PhotoshopCropStudio.test.tsx` (new suite, 22 cases).
- `components/admin/PhotoshopDetail.test.tsx` (new suite, 6 cases — confirmed by search that no
  such file exists today; `components/admin/` has `CropStudio.test.tsx`, `ImageGenPanel.test.tsx`
  etc. but nothing for `PhotoshopDetail`).

**Signature changes:**
- `PhotoshopDetail` props: `{ sourceKind, sourceId, sourceUrl }` ->
  `{ sourceKind, sourceId, sourceUrl, sourceWidth: number | null, sourceHeight: number | null }`
  (`components/admin/PhotoshopDetail.tsx:33-41` on `main`). **Both new props are REQUIRED**, so the
  page that renders it must pass them. **RECONCILED (round 1): the two prop-type MEMBERS are
  written by Phase 4** (its Step 5), in the same commit as its `page.tsx` edit, so Phase 4 ends
  green on its own. By the time this phase starts, `PhotoshopDetail` already declares both and the
  page already passes both; this phase's Step 2 rewrites that whole signature block to add the
  destructuring and the body that reads them. Quote the file as Phase 4 leaves it, not as `main`
  has it — Phase 4 inserts ~6 lines (two members plus a docstring) at `:36-40`, so every line number
  below in `PhotoshopDetail.tsx` shifts by that much.
- `runPhotoshopJobAction`'s call site in `PhotoshopDetail.execute()` gains four arguments:
  `cropRatioLabel`, `cropScale`, `cropX`, `cropY` — always present, `null` when the step was
  skipped (`components/admin/PhotoshopDetail.tsx:88-95` on `main`).

**Requires (from earlier phases):**

*From Phase 1 — `lib/nina/photoshopCrop.ts`. **RECONCILED (round 1): this block now states Phase 1's
ACTUAL committed contract**, not this phase's draft assumption. Two things differed and every call
site in this plan file has been corrected: the CSS function is named `ninaPhotoshopCropStyle` (not
`photoshopCropStyle`, matching `crop.ts`'s `ninaCropStyle`), and every function takes its arguments
**source, TARGET RATIO, crop** — the ratio comes SECOND, before the crop, not last:*

```ts
export interface NinaPhotoshopCrop { scale: number; x: number; y: number }
/** What this phase passes as `natural`; structurally identical to the draft's `Natural`. */
export interface NinaPhotoshopSourceSize { width: number | null; height: number | null }

/** Literal-typed like `NinaCropStyle` in `lib/nina/crop.ts:73-80`, so it is assignable to
 *  React's `style` prop without a cast. */
export interface NinaPhotoshopCropStyle {
  position: 'absolute'
  width: string
  height: string
  left: string
  top: string
  objectFit: 'cover'
}

export const NINA_PHOTOSHOP_CROP_MIN_SCALE: number      // 1  — cover fit of the target rectangle
export const NINA_PHOTOSHOP_CROP_MAX_SCALE: number      // 4
export const NINA_PHOTOSHOP_CROP_KEY_STEP: number       // 10 — one arrow press, in stored units
export const NINA_PHOTOSHOP_CROP_IDENTITY: NinaPhotoshopCrop  // { scale: 1, x: 0, y: 0 }

type Src = NinaPhotoshopSourceSize

export function clampPhotoshopCrop(s: Src, targetRatio: number, c: NinaPhotoshopCrop): NinaPhotoshopCrop
export function panPhotoshopCrop(s: Src, targetRatio: number, c: NinaPhotoshopCrop, dxPx: number, dyPx: number, frameWidthPx: number): NinaPhotoshopCrop
export function zoomPhotoshopCrop(s: Src, targetRatio: number, c: NinaPhotoshopCrop, factor: number): NinaPhotoshopCrop
export function nudgePhotoshopCrop(s: Src, targetRatio: number, c: NinaPhotoshopCrop, dx: number, dy: number): NinaPhotoshopCrop
export function ninaPhotoshopCropStyle(s: Src, targetRatio: number, c: NinaPhotoshopCrop): NinaPhotoshopCropStyle
```

*Also from Phase 1 — `ninaImageAspectRatioValue(label: string): number | null`
(`lib/nina/imagerecipe.ts`), the label -> numeric-ratio lookup. **RECONCILED (round 1):** this
phase's local `ratioFor` helper now calls it instead of doing its own `.find(...)` over the table.*

*`zoomFactorForWheel` stays imported from `@/lib/nina/crop`, directly — **confirmed correct against
Phase 1's contract (round 1)**. It is ratio-agnostic (`deltaY -> factor`) and Phase 1 deliberately
does NOT re-export it through `photoshopCrop.ts`, because that module has literally zero imports by
design (it must load under `node --experimental-strip-types`). `lib/nina/crop.ts` is not modified by
this plan set at all.*

Three semantic requirements on top of the signatures, all of which this phase's expected test
values are computed from (see **Phase 1 semantics** below):

1. `panPhotoshopCrop` takes only the frame's measured **width** in CSS px (`frameWidthPx`) and derives
   the frame's height itself as `framePx / targetRatio` — the frame IS the target ratio, so the
   component measures one number, exactly as `CropStudio` does today. A signature that demanded a
   separate frame height would force arithmetic into the component and break the division of labour
   `lib/nina/crop.ts`'s header states.
2. `x` is in thousandths of the frame's **width**, `y` in thousandths of the frame's **height** —
   per-axis, because the frame is no longer square (this is the one place the square-frame
   convention documented at `lib/nina/crop.ts:22-28` cannot survive generalisation). The component
   never converts; it only reports pixel deltas and the measured frame width.
3. At `targetRatio === 1` every function must reduce exactly to its `lib/nina/crop.ts` twin. This
   is Phase 1's business to assert, and it is why this phase's expected values for square-ish cases
   match `CropStudio.test.tsx`'s line for line.

*From Phase 1 — `lib/nina/imagerecipe.ts`:*
`export const NINA_IMAGE_ASPECT_RATIOS: ReadonlyArray<{ label: string; ratio: number }>` (today
module-private at `lib/nina/imagerecipe.ts:128`). `nearestNinaImageAspectRatio` is already exported
(`lib/nina/imagerecipe.ts:167`) and needs no change.

*From Phase 4 — `lib/admin/photoshopActions.ts`:* `runPhotoshopJobAction`'s input type must accept
**nullable** crop fields, i.e.

```ts
cropRatioLabel?: string | null
cropScale?: number | null
cropX?: number | null
cropY?: number | null
```

This phase always sends all four, with `null` for "skipped". **CONFIRMED (reconciler, round 1):
Phase 4 typed all four exactly this way** (`cropRatioLabel?: string | null`, etc.), and its
`coercePhotoshopCrop` narrows on `typeof`, so four explicit `null`s land on `PHOTOSHOP_NO_CROP`
without failing the run. No widening was needed; nothing in either plan changed for this item.

*From Phase 4 — `app/admin/photoshop/[source]/[id]/page.tsx`:* renders
`<PhotoshopDetail … sourceWidth={photo.width} sourceHeight={photo.height} />`.
**Landing-order hazard — RESOLVED by the reconciler (round 1): option (a).** Phase 4 owns BOTH the
`page.tsx` edit and the two type-only members on `PhotoshopDetail`'s props, in the same commit, so
Phase 4 typechecks at the end of its own phase (Invariant 1). **This phase does NOT edit
`page.tsx`** and does not write those two members for the first time — it rewrites the whole
signature/props block (Step 2), reproducing them verbatim alongside the destructuring it adds.
Option (b) is discarded; the fallback snippet formerly kept in **Handoffs** is no longer a branch to
take.

**Leaves alone (owned by others):**
- `lib/nina/photoshopCrop.ts`, `lib/nina/imagerecipe.ts` (Phase 1).
- `lib/db/schema/nina/photoshop.ts`, `lib/nina/photoshopJobs.ts`, `scripts/photoshop.ts` (Phase 2).
- `lib/nina/imagecall.ts`, `lib/nina/photoshopRun.ts` (Phase 3) — this phase's UI never calls the
  server-side pixel-crop path; it only stores the parameters Phase 3 reads back.
- `lib/admin/photoshopActions.ts`'s validation body, `app/admin/photoshop/[source]/[id]/page.tsx`
  (Phase 4).
- `lib/nina/crop.ts` and `components/admin/CropStudio.tsx` — **untouched**. The avatar studio keeps
  its square frame and its module; this phase copies the interaction pattern, not the code, and
  imports exactly one thing from `crop.ts` (`zoomFactorForWheel`, which is already exported and is
  ratio-agnostic by construction).

## Files

| File | Action | What changes |
|---|---|---|
| `components/admin/PhotoshopCropStudio.tsx` | create | the whole rectangle-frame pan/zoom studio + ratio `<select>` |
| `components/admin/PhotoshopCropStudio.test.tsx` | create | 22 cases, mirroring `CropStudio.test.tsx`'s structure for a non-square, ratio-selectable frame |
| `components/admin/PhotoshopDetail.tsx` | modify | imports (`:3-21`), props (`:33-41`), crop state + toggle (after `:52`), `execute()`'s payload (`:88-95`), the collapsible crop step in JSX (inserted after the instruction block that ends at `:316`). **Line numbers are `main`'s; Phase 4 lands first and inserts ~6 lines into the props literal, so everything from `:36` down shifts. Phase 4 owns the two prop-type members only — this phase owns every other line of the file.** |
| `components/admin/PhotoshopDetail.test.tsx` | create | 6 cases: crop step offered in both modes, hidden when dimensions unknown, skip sends four nulls, open sends the auto-pick, adjust sends the adjusted quadruple, re-closing drops back to four nulls |

## Phase 1 semantics (the arithmetic every expected value below is computed from)

Phase 1's plan file did not exist when this was written (checked:
`.workflows/plan/photoshop-aspect-ratio-crop/` was empty), so these were assumptions.
**VERIFIED by the reconciler (round 1): every rule below matches Phase 1's shipped implementation
exactly, and every expected value in Steps 5 and 6 was re-derived against it and holds.** Only the
function NAME (`ninaPhotoshopCropStyle`) and the ARGUMENT ORDER (source, ratio, crop) differed from
the draft, and both are corrected throughout this file. The components remain on trial for WIRING
(which event reaches which function with which delta), not for arithmetic — exactly the posture
`CropStudio.test.tsx:8-18` states.

With source `w x h`, source ratio `s = w/h`, target ratio `r`, and `scale` a multiple of the cover
fit of the target rectangle:

- **Spans.** `s >= r` (source wider than the frame): `heightPct = 100*scale`,
  `widthPct = 100*scale*(s/r)`. `s < r`: `widthPct = 100*scale`, `heightPct = 100*scale*(r/s)`.
- **Offset limits.** `|x| <= floor(5*widthPct - 500)`, `|y| <= floor(5*heightPct - 500)`, both
  floored at 0 — the frame must stay fully covered, `lib/nina/crop.ts:188-194`'s derivation with
  each axis measured against its own edge.
- **Scale** is clamped into `[1, 4]` and rounded to three decimals BEFORE the offsets are clamped
  (`lib/nina/crop.ts:201-214`'s stated ordering), and offsets are `Math.round`ed.
- **Pan.** `dx units = dxPx * 1000 / frameWidthPx`, `dy units = dyPx * 1000 / (frameWidthPx / r)`.
- **Zoom** multiplies `scale`, `x` and `y` by the factor, then clamps
  (`lib/nina/crop.ts:249-253`).
- **Style.** `left = 50 + x/10 - widthPct/2`, `top = 50 + y/10 - heightPct/2`, every percentage
  rounded to 4 decimals (`lib/nina/crop.ts:293-305`).

## Implementation Steps

### Step 1: The rectangle crop studio

**File:** `components/admin/PhotoshopCropStudio.tsx` (new)
**Change:** A controlled component holding, in `CropStudio`'s own words, "two pointer positions and
a subtraction" — every bound, clamp and CSS mapping is Phase 1's module. The differences from
`CropStudio` are exactly four: the frame is a rectangle at the chosen ratio rather than
`aspect-square rounded-pill`; the ratio is part of the controlled value; every math call takes the
target ratio; and a ratio `<select>` sits above the frame.

**Code:**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
/* `zoomFactorForWheel` comes straight from `crop.ts` and NOT through `photoshopCrop.ts`: it is
 * ratio-agnostic and already correct, and Phase 1 deliberately did not re-export it, because
 * `photoshopCrop.ts` has zero imports by design so it can load under `--experimental-strip-types`.
 * This is the plan set's only import from `crop.ts`, and `crop.ts` itself is never modified. */
import { zoomFactorForWheel } from '@/lib/nina/crop'
import { NINA_IMAGE_ASPECT_RATIOS, ninaImageAspectRatioValue } from '@/lib/nina/imagerecipe'
import {
  clampPhotoshopCrop,
  NINA_PHOTOSHOP_CROP_KEY_STEP,
  NINA_PHOTOSHOP_CROP_MAX_SCALE,
  NINA_PHOTOSHOP_CROP_MIN_SCALE,
  ninaPhotoshopCropStyle,
  nudgePhotoshopCrop,
  panPhotoshopCrop,
  zoomPhotoshopCrop,
  type NinaPhotoshopCrop,
  type NinaPhotoshopSourceSize,
} from '@/lib/nina/photoshopCrop'

/**
 * Pick one of OpenRouter's exact `aspect_ratio` values, then drag and zoom the source photograph
 * inside a rectangle at that ratio until the part worth keeping is inside it. The job then sends
 * the model those pixels, at that ratio, and the stretch this feature exists to kill is gone by
 * construction rather than by a nearest-bucket guess.
 *
 * ── WHY THIS IS NOT `CropStudio`, AND NOT A GENERALISATION OF IT ────────────────────────────
 * `components/admin/CropStudio.tsx` frames a FACE in a CIRCLE. Its frame is asserted square
 * everywhere (`lib/nina/crop.ts:22-28`), and that squareness is load-bearing: it is the only
 * reason one stored offset unit — thousandths of the frame's WIDTH — can position both axes, and
 * three shipped surfaces (the avatar preview, the chat header avatar, the typing-row avatar) read
 * crops written under that assumption. Widening it would put all three at risk for a feature that
 * needs a different capability entirely: REAL cropped bytes, not a CSS transform. So this is a
 * sibling, and it copies the interaction pattern rather than the code.
 *
 * ── THE DIVISION OF LABOUR IS STILL THE POINT ───────────────────────────────────────────────
 * `vitest.config.ts` runs `environment: 'node'`: no jsdom, no `PointerEvent`, no
 * `getBoundingClientRect`. So the clamping, the aspect fit, the delta conversion and the CSS
 * mapping are all `lib/nina/photoshopCrop.ts` and are all unit-tested there. This file holds two
 * pointer positions, a subtraction, `Math.hypot` over one such subtraction for pinch, and a
 * label-to-ratio lookup in a 23-entry table. Nothing about a crop is decided here.
 *
 * ── ONE MEASURED NUMBER, NOT TWO ────────────────────────────────────────────────────────────
 * The frame IS the target ratio, so its height is its width over that ratio and the pure module
 * derives it. That is why `panPhotoshopCrop` takes `frameWidthPx` and a ratio rather than a width
 * and a height: a second measurement would be a second source of truth for the same fact, and the
 * two would disagree by a sub-pixel the first time the browser rounded a layout.
 *
 * ── THE ARGUMENT ORDER IS SOURCE, RATIO, CROP ───────────────────────────────────────────────
 * Every `photoshopCrop.ts` function takes the source size first, the TARGET RATIO second and the
 * crop third. The ratio sits with the source because together they are the geometry; the crop is
 * the thing being transformed. Getting the order wrong typechecks nowhere (two of the three are
 * objects of different shapes) except where it does — so it is stated here once rather than
 * re-derived at each of the ten call sites below.
 *
 * ── CONTROLLED, AND THE RATIO IS PART OF THE VALUE ──────────────────────────────────────────
 * `PhotoshopDetail` owns the selection because `execute()` has to read it at the moment the job is
 * opened, and because "the admin never opened this step" is a fact only the parent can know. The
 * ratio travels WITH the crop in one value rather than as a second prop and a second callback:
 * changing the ratio changes the frame's shape, which invalidates the offsets, so the two always
 * move together and a caller that could set one without the other could set an impossible pair.
 *
 * ── WHY THE WHEEL LISTENER IS REGISTERED BY HAND ────────────────────────────────────────────
 * React attaches `wheel` at the root as a PASSIVE listener, so `event.preventDefault()` inside an
 * `onWheel` prop logs an "Unable to preventDefault inside passive event listener" warning and the
 * page scrolls anyway. A direct `addEventListener(…, { passive: false })` is the only way to get
 * the default suppressed. Verbatim the reason `CropStudio` does the same.
 *
 * ── TOUCH ───────────────────────────────────────────────────────────────────────────────────
 * The same four carriers as `CropStudio`, for the same reason (the operator opens every admin
 * screen on an iPhone): `touch-none` on the frame, every pointer tracked by id so lifting either
 * finger ends a pinch instead of silently re-pairing, `select-none` +
 * `[-webkit-touch-callout:none]` so a press-and-hold does not raise iOS's Copy/Share sheet
 * mid-drag, and 44 px of hit area on both the zoom slider and the ratio select.
 */

/** The controlled value: which catalogued ratio, and where the photo sits inside it. */
export interface PhotoshopCropSelection {
  ratioLabel: string
  crop: NinaPhotoshopCrop
}

export function PhotoshopCropStudio({
  src,
  natural,
  value,
  onChange,
  disabled = false,
}: {
  src: string
  natural: NinaPhotoshopSourceSize
  value: PhotoshopCropSelection
  onChange: (next: PhotoshopCropSelection) => void
  disabled?: boolean
}) {
  const crop = value.crop
  const ratio = ratioFor(value.ratioLabel)

  const frameRef = useRef<HTMLDivElement | null>(null)
  const [framePx, setFramePx] = useState(0)
  const [dragging, setDragging] = useState(false)

  /**
   * Every pointer currently down on the frame, keyed by `pointerId`. A ref because it must not
   * re-render, and a `Map` because the identity of the SECOND contact matters as much as the
   * first: a pinch is the span between two specific pointers, and lifting either one has to end
   * that pinch rather than quietly re-pair with whatever is left down.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  /** The span between the pinching pointers as of the last event, or `null` when not pinching. */
  const pinchSpan = useRef<number | null>(null)

  /** A new crop under the SAME ratio — every gesture's one exit. */
  const emit = useCallback(
    (next: NinaPhotoshopCrop) => onChange({ ratioLabel: value.ratioLabel, crop: next }),
    [onChange, value.ratioLabel],
  )

  /** The frame's rendered WIDTH, measured — the one number the pure module needs from the DOM. */
  useEffect(() => {
    const element = frameRef.current
    if (element == null) return
    const measure = () => setFramePx(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /*
   * The four values the hand-registered wheel listener reads, mirrored into refs so it never
   * closes over a stale one. Written in an effect with NO dependency array rather than during
   * render: `react-hooks/refs` forbids the render-time write, and a wheel event can only arrive
   * after the commit that ran this, so the mirror is never behind by the time it is read.
   */
  const cropRef = useRef(crop)
  const naturalRef = useRef(natural)
  const ratioRef = useRef(ratio)
  const emitRef = useRef(emit)

  useEffect(() => {
    cropRef.current = crop
    naturalRef.current = natural
    ratioRef.current = ratio
    emitRef.current = emit
  })

  useEffect(() => {
    const element = frameRef.current
    if (element == null || disabled) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      emitRef.current(
        zoomPhotoshopCrop(
          naturalRef.current,
          ratioRef.current,
          cropRef.current,
          zoomFactorForWheel(event.deltaY),
        ),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [disabled])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      /*
       * `button !== 0` rejects a right-click and a mouse's middle button. A touch contact and a
       * pen contact both report button 0, so this excludes neither.
       */
      if (disabled || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      /*
       * The second contact starts a pinch and ends the pan, and the span is seeded HERE rather
       * than on the first move — so the very first `pointermove` after two fingers land already
       * has a previous span to divide by and the photo does not jump on frame one.
       */
      pinchSpan.current = pointers.current.size >= 2 ? spanOf(pointers.current) : null
      setDragging(true)
    },
    [disabled],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      const previous = pointers.current.get(event.pointerId)
      // A move from a pointer that never went down on this element — or that has already been
      // released — is not this component's business.
      if (previous == null) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.current.size >= 2) {
        // PINCH. The ratio of this frame's span to the previous one, handed to `zoomPhotoshopCrop`
        // as the same kind of factor the wheel produces. A missing or zero previous span means
        // there is nothing to divide by, so that move only re-seeds and changes nothing.
        const span = spanOf(pointers.current)
        const last = pinchSpan.current
        pinchSpan.current = span
        if (span == null || last == null || last === 0) return
        emit(zoomPhotoshopCrop(natural, ratio, crop, span / last))
        return
      }

      // PAN. The other arithmetic in this file, and it is a subtraction.
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      emit(panPhotoshopCrop(natural, ratio, crop, dx, dy, framePx))
    },
    [crop, disabled, emit, framePx, natural, ratio],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // `Map.delete` returns false for a pointer that was never tracked.
    if (!pointers.current.delete(event.pointerId)) return
    /*
     * Dropping below two pointers ends the pinch. It deliberately does NOT re-seed a pan origin:
     * the surviving pointer's last position is already in the map, so the next `pointermove`
     * measures its delta from where that finger actually is, and the photograph does not jump when
     * the second finger comes off.
     */
    if (pointers.current.size < 2) pinchSpan.current = null
    if (pointers.current.size === 0) setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const step = event.shiftKey
        ? NINA_PHOTOSHOP_CROP_KEY_STEP * 5
        : NINA_PHOTOSHOP_CROP_KEY_STEP
      switch (event.key) {
        case 'ArrowLeft':
          emit(nudgePhotoshopCrop(natural, ratio, crop, -step, 0))
          break
        case 'ArrowRight':
          emit(nudgePhotoshopCrop(natural, ratio, crop, step, 0))
          break
        case 'ArrowUp':
          emit(nudgePhotoshopCrop(natural, ratio, crop, 0, -step))
          break
        case 'ArrowDown':
          emit(nudgePhotoshopCrop(natural, ratio, crop, 0, step))
          break
        case '+':
        case '=':
          emit(zoomPhotoshopCrop(natural, ratio, crop, 1.1))
          break
        case '-':
        case '_':
          emit(zoomPhotoshopCrop(natural, ratio, crop, 1 / 1.1))
          break
        default:
          return
      }
      event.preventDefault()
    },
    [crop, disabled, emit, natural, ratio],
  )

  return (
    <div>
      <label className="block max-w-[420px]">
        <span className="mb-1 block text-[12px] font-semibold text-ink-2">Aspect ratio</span>
        <select
          aria-label="Crop aspect ratio"
          value={value.ratioLabel}
          disabled={disabled}
          onChange={(event) => {
            const label = event.target.value
            /*
             * Re-clamped against the NEW frame shape in the same emission. A ratio change can
             * invalidate an offset that was legal a moment ago — going from 2:1 to 3:4 shrinks the
             * vertical slack — and an unclamped pair would render a sliver of background inside the
             * frame, which is precisely what the crop box must never contain.
             */
            onChange({ ratioLabel: label, crop: clampPhotoshopCrop(natural, ratioFor(label), crop) })
          }}
          /* `h-11` is the 44 px tap target, on the control rather than a wrapper. */
          className="h-11 w-full rounded-field bg-paper-2 px-3 text-[14px] font-medium text-ink"
        >
          {NINA_IMAGE_ASPECT_RATIOS.map((entry) => (
            <option key={entry.label} value={entry.label}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      <div
        ref={frameRef}
        role="application"
        aria-label={`Crop to ${value.ratioLabel} — drag to move, pinch or scroll or use the slider to zoom, arrow keys to nudge`}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        /* The frame's shape is the CHOSEN RATIO, written from the label rather than from the
           float: `aspect-ratio: 5 / 4` is exact where `1.25` is a rounding, and every catalogued
           label is already `a:b` with plain numbers on both sides. */
        style={{ aspectRatio: cssAspectRatio(value.ratioLabel) }}
        className={cn(
          'relative mt-3 w-full max-w-[420px] touch-none overflow-hidden rounded-field bg-paper-2 outline-none',
          'ring-1 ring-rule select-none [-webkit-touch-callout:none]',
          'focus-visible:ring-2 focus-visible:ring-accent',
          disabled ? 'cursor-default opacity-60' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the crop transform owns every
            positioning property `next/image fill` would set; same exemption as CropStudio. */}
        <img src={src} alt="" draggable={false} style={ninaPhotoshopCropStyle(natural, ratio, crop)} />
        {/* The centring crosshair. Purely decorative, and the reason the operator can tell
            "middle of the frame" from "roughly middle". */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-pill border border-white/70 mix-blend-difference"
        />
      </div>

      <label className="mt-4 block max-w-[420px]">
        <span className="mb-1 block text-[12px] font-semibold text-ink-2">
          Zoom &middot; {crop.scale.toFixed(2)}&times;
        </span>
        <input
          type="range"
          min={NINA_PHOTOSHOP_CROP_MIN_SCALE * 1000}
          max={NINA_PHOTOSHOP_CROP_MAX_SCALE * 1000}
          step={10}
          value={Math.round(crop.scale * 1000)}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value) / 1000
            // Expressed as a factor so the frame centre holds still, exactly as the wheel does.
            emit(zoomPhotoshopCrop(natural, ratio, crop, next / crop.scale))
          }}
          className="h-11 w-full touch-none accent-accent"
        />
      </label>

      <p className="mt-2 max-w-[420px] text-[12px] font-medium text-ink-3">
        Drag the photo to move it and pinch to zoom. With a pointer: scroll to zoom, arrow keys to
        nudge (hold shift for a bigger step). Stored as {value.ratioLabel}, scale{' '}
        {crop.scale.toFixed(3)}&times;, offset {crop.x}/{crop.y}.
      </p>
    </div>
  )
}

/**
 * A catalogued label's numeric ratio. Phase 1's `ninaImageAspectRatioValue` does the lookup — the
 * same function the Server Action's closed-set check asks, so the picker and the boundary can never
 * disagree about which labels exist. An unknown label cannot arrive from the `<select>` (its options
 * ARE the table) and falls back to 1 rather than `NaN`, so a future caller passing a stale stored
 * label renders a square frame instead of a blank one.
 */
function ratioFor(label: string): number {
  return ninaImageAspectRatioValue(label) ?? 1
}

/** `'5:4'` -> `'5 / 4'`, the CSS `aspect-ratio` spelling of the same label. */
function cssAspectRatio(label: string): string {
  return label.replace(':', ' / ')
}

/**
 * The distance between the first two pointers in the map, in CSS pixels — one subtraction and one
 * `Math.hypot`, and the entire arithmetic budget the header grants this file for pinch.
 *
 * Module scope and not a closure over the ref: it takes what it reads, so it can be named in
 * `onPointerDown`'s and `onPointerMove`'s bodies without joining either `useCallback`'s dependency
 * array and re-creating both handlers on every render.
 */
function spanOf(pointers: ReadonlyMap<number, { x: number; y: number }>): number | null {
  const [a, b] = [...pointers.values()]
  if (a === undefined || b === undefined) return null
  return Math.hypot(b.x - a.x, b.y - a.y)
}
```

**Impact:** a new client component with no callers yet. `npm run knip` stays clean only once Step 2
imports it — land both steps in one commit.

---

### Step 2: `PhotoshopDetail` accepts the source's shape and owns the crop selection

**File:** `components/admin/PhotoshopDetail.tsx:1-52` (as `main` numbers it; **read it as Phase 4
leaves it** — Phase 4 has already added `sourceWidth`/`sourceHeight` to the props type literal with
a docstring, shifting these lines down by about six).
**Change:** three new imports, the two already-declared props now DESTRUCTURED and read, two new
pieces of state, one toggle function. The props type below reproduces Phase 4's two members
verbatim (with a shorter docstring now that the body actually reads them) — it is a rewrite of a
block Phase 4 already changed, not a competing second write of the same two lines.

**Code — replace lines 1-52 (the import block through the `router`/`aliveRef` declaration) with:**

```tsx
'use client'

import * as React from 'react'

import { useRouter } from 'next/navigation'

import { PhotoshopCropStudio, type PhotoshopCropSelection } from '@/components/admin/PhotoshopCropStudio'
import { Button } from '@/components/ui'
import {
  readPhotoshopJobAction,
  resolvePhotoshopJobAction,
  runPhotoshopJobAction,
  type PhotoshopJobView,
} from '@/lib/admin/photoshopActions'
import type { NinaPhotoshopMode, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import { nearestNinaImageAspectRatio } from '@/lib/nina/imagerecipe'
import {
  NINA_PHOTOSHOP_INSTRUCTION_MAX,
  NINA_PHOTOSHOP_PRESETS,
  photoshopModelIdsFor,
  photoshopModelSpecFor,
  photoshopPresetText,
} from '@/lib/nina/photoshopPresets'
import { NINA_PHOTOSHOP_CROP_IDENTITY } from '@/lib/nina/photoshopCrop'

const POLL_INTERVAL_MS = 3_000

/**
 * The photoshop tab's one screen: mode, model, the improvement field (the Facial Expression
 * pattern — free text plus a non-sticky preset `<select>` that fills it), the OPTIONAL aspect-ratio
 * crop step, the execute button, and — once a job lands — the before/after with Replace / Add as
 * new / Cancel.
 *
 * A sequential `setTimeout` poll, not `setInterval` — `ImageGenTestPanel`'s own shape, so a slow
 * response cannot stack a second poll on top of the first.
 *
 * ── THE CROP STEP IS OPTIONAL, AND THE DEFAULT IS STILL "OFF" ───────────────────────────────
 * `cropOpen` starts false and `cropSelection` starts null, so a run that never touches the step
 * sends four explicit `null`s and the job behaves exactly as it does without this feature — the
 * whole "skipping it leaves today's behaviour unchanged" contract, held in one boolean. Closing the
 * step again after opening it returns to that payload too: the selection is kept (so re-opening
 * does not lose the framing) but it is not SENT unless the step is open.
 *
 * ── IT IS OFFERED IDENTICALLY IN BOTH MODES, ON PURPOSE ─────────────────────────────────────
 * Nothing below reads `mode` to decide whether to render the crop step. `buildImageRequestBody`
 * sends `aspect_ratio` and `input_references` identically regardless of mode, so once a crop box
 * exists there is nothing mode-specific left to differ about; the only mode-specific behaviour is
 * the NO-crop fallback, which lives on the server and is untouched here.
 *
 * ── WHY IT HIDES WHEN THE SOURCE'S DIMENSIONS ARE UNKNOWN ───────────────────────────────────
 * `getPhotoshopSourcePhoto` returns `width`/`height` as `number | null` — a row predating dimension
 * tracking has neither. Without them there is no source aspect to fit the frame to, no honest
 * preview to draw, and nothing for the server to compute a pixel box from. Offering a control that
 * could only lie is worse than not offering it, so the step is absent and the job runs exactly as
 * it does today.
 */
export function PhotoshopDetail({
  sourceKind,
  sourceId,
  sourceUrl,
  sourceWidth,
  sourceHeight,
}: {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceUrl: string
  /** The source photo's natural pixel size, straight off `getPhotoshopSourcePhoto`. */
  sourceWidth: number | null
  sourceHeight: number | null
}) {
  const [mode, setMode] = React.useState<NinaPhotoshopMode>('edit')
  const [model, setModel] = React.useState<string>('bytedance-seed/seedream-4.5')
  const [instruction, setInstruction] = React.useState(photoshopPresetText('bigger_boobs') ?? '')
  const [presetSelect, setPresetSelect] = React.useState('')
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [job, setJob] = React.useState<PhotoshopJobView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  const [resolving, setResolving] = React.useState<'replace' | 'add' | 'discard' | null>(null)
  const [cropOpen, setCropOpen] = React.useState(false)
  const [cropSelection, setCropSelection] = React.useState<PhotoshopCropSelection | null>(null)

  const cropAvailable =
    sourceWidth != null && sourceHeight != null && sourceWidth > 0 && sourceHeight > 0
  /** What the server would pick on its own if no crop is supplied — the step's default, and the
   *  number the "off" hint quotes so the trade-off is stated rather than implied. */
  const autoRatio = cropAvailable ? nearestNinaImageAspectRatio(sourceWidth, sourceHeight) : null

  const router = useRouter()
  const aliveRef = React.useRef(true)
  React.useEffect(
    () => () => {
      aliveRef.current = false
    },
    [],
  )

  /**
   * Open or close the crop step. The first open seeds the selection with the auto-picked ratio and
   * an identity crop — so opening the step and running with no further adjustment sends the SAME
   * `aspect_ratio` the server would have chosen by itself, and differs only in that the pixels now
   * genuinely have that shape instead of being stretched into it.
   */
  function toggleCrop() {
    if (sourceWidth == null || sourceHeight == null) return
    if (cropOpen) {
      setCropOpen(false)
      return
    }
    if (cropSelection == null) {
      setCropSelection({
        ratioLabel: nearestNinaImageAspectRatio(sourceWidth, sourceHeight),
        crop: { ...NINA_PHOTOSHOP_CROP_IDENTITY },
      })
    }
    setCropOpen(true)
  }
```

**Impact:** `PhotoshopDetail` now has two required props; the only renderer is
`app/admin/photoshop/[source]/[id]/page.tsx`, which Phase 4 already updated (see the landing-order
hazard in **Interface Contract**). `changeMode`, `applyPreset`, `pollJob` and everything after line
61 in the current file are unchanged by this step.

---

### Step 3: `execute()` sends the four crop fields

**File:** `components/admin/PhotoshopDetail.tsx:82-113`
**Change:** the payload gains four always-present fields. Everything else in the function is
byte-identical to today.

**Code — replace the whole `execute` function:**

```tsx
  async function execute() {
    setError(null)
    setJob(null)
    setJobId(null)
    setRunning(true)
    try {
      /*
       * `null` unless the step is OPEN. A selection kept from an earlier open-then-close is
       * deliberately not sent: "the admin closed the crop step" and "the admin never opened it"
       * have to produce the same job, or the skip contract is decided by history rather than by
       * what is on screen.
       */
      const selection = cropOpen ? cropSelection : null
      const result = await runPhotoshopJobAction({
        sourceKind,
        sourceId,
        mode,
        model,
        presetKey: presetSelect === '' ? null : presetSelect,
        instruction,
        cropRatioLabel: selection?.ratioLabel ?? null,
        cropScale: selection?.crop.scale ?? null,
        cropX: selection?.crop.x ?? null,
        cropY: selection?.crop.y ?? null,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setJobId(result.jobId)
      setJob({
        jobId: result.jobId,
        status: 'pending',
        stale: false,
        errorCode: null,
        resultUrl: null,
        resolvedAction: null,
      })
      pollJob(result.jobId, 0)
    } finally {
      setRunning(false)
    }
  }
```

**Impact:** `??` and not `||` is load-bearing — `cropX` of `0` is a legitimate centred crop and
`||` would send it as `null`.

---

### Step 4: the collapsible crop step in the JSX

**File:** `components/admin/PhotoshopDetail.tsx` — inserted between the "What should change" block
(which ends with `</div>` at line 316 today) and the `{error != null && …}` line at 318.
**Change:** a disclosure button plus the studio. It reads `cropAvailable`, `cropOpen`,
`cropSelection` and `autoRatio` — and deliberately never reads `mode`.

**Code — insert verbatim:**

```tsx
          {cropAvailable && (
            <div>
              {/*
                A button with `aria-expanded`, not `<details>`. The two disclosures already in
                `components/admin/` (`ImageGenPanel.tsx:1106`, `CharacterPanel.tsx:594`) are
                `<details>` because nothing outside them cares whether they are open. Here the open
                state IS the payload — `execute()` sends a crop only while the step is open — and a
                `<details>`'s openness lives in the DOM, not in React state, so it would have to be
                mirrored back with an `onToggle` handler and could drift from the thing it decides.
              */}
              <button
                type="button"
                onClick={toggleCrop}
                aria-expanded={cropOpen}
                aria-controls="photoshop-crop-step"
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-field bg-paper-2 px-3 py-2 text-left text-[13px] font-semibold text-ink"
              >
                <span>Aspect ratio crop</span>
                <span className="text-[12px] font-medium text-ink-3">
                  {cropOpen ? 'Skip it' : 'Optional'}
                </span>
              </button>
              <p className="mt-1.5 max-w-[70ch] text-[12px] font-medium text-ink-3">
                {cropOpen
                  ? 'The model is sent exactly these pixels, at exactly this ratio — nothing is stretched to fit.'
                  : `Off: the whole photo goes to the model on its nearest catalogued canvas (${autoRatio}), which can read a little wide or narrow.`}
              </p>
              {cropOpen && cropSelection != null && (
                <div id="photoshop-crop-step" className="mt-3">
                  <PhotoshopCropStudio
                    src={sourceUrl}
                    natural={{ width: sourceWidth, height: sourceHeight }}
                    value={cropSelection}
                    onChange={setCropSelection}
                    disabled={running || job?.status === 'pending'}
                  />
                </div>
              )}
            </div>
          )}
```

**Impact:** the step sits inside the existing `{!showResult && (<>…</>)}` fragment, so it disappears
once a result is on screen, alongside mode/model/instruction — which is correct: a finished job's
inputs are no longer editable.

---

### Step 5: `PhotoshopCropStudio.test.tsx`

**File:** `components/admin/PhotoshopCropStudio.test.tsx` (new)
**Change:** `CropStudio.test.tsx`'s 22-case structure, adapted for a non-square, ratio-selectable
frame. The fixture is a **600x800 portrait source in a 2:1 frame**, chosen so that (a) the two axes
convert by DIFFERENT divisors — a square-frame implementation would fail the pan case — and (b) at a
400 px frame width the frame height is exactly 200 px, so every expected number is exact rather than
a rounding.

**Code:**

```tsx
// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotoshopCropStudio, type PhotoshopCropSelection } from './PhotoshopCropStudio'
import { NINA_IMAGE_ASPECT_RATIOS } from '@/lib/nina/imagerecipe'

/*
 * Same division of labour as `CropStudio.test.tsx`, and the same posture: every bound lives in
 * `lib/nina/photoshopCrop.ts`, so these cases drive the gestures (select, wheel, pointer pan,
 * pinch, keys, slider) with known inputs and pin `onChange`'s output against HAND-COMPUTED results
 * from the pure module. The component is on trial for WIRING — which event reaches which function
 * with which delta and which target ratio — not for arithmetic.
 *
 * THE FIXTURE, and why it is not square: a 600x800 source (ratio 0.75) in a 2:1 frame. The source
 * is narrower than the frame, so the WIDTH is the binding edge: widthPct = 100*scale and
 * heightPct = 100*scale*(2/0.75) = 266.667*scale. The frame is measured at 400 px wide, so it is
 * 200 px tall, and a pointer delta converts at 1000/400 on x and 1000/200 on y — two different
 * divisors. A square-frame implementation passes every other case in this file and fails that one.
 *
 * happy-dom natively has PointerEvent, WheelEvent and setPointerCapture; `getBoundingClientRect`
 * returns zeros, so the frame's 400 px width is patched and pushed in through the ResizeObserver
 * callback, exactly the way a real layout change would arrive.
 */

let fireResize: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries?: unknown[]) => void) {
        fireResize = () => callback([])
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const NATURAL = { width: 600, height: 800 }

function studio(
  value: PhotoshopCropSelection = { ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } },
  disabled = false,
) {
  const onChange = vi.fn()
  const view = render(
    <PhotoshopCropStudio
      src="https://blob.example/her.png"
      natural={NATURAL}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />,
  )
  const frame = view.container.querySelector('[role="application"]')!
  // Measure the frame at 400 px wide, the way layout would. Height follows from the 2:1 ratio.
  frame.getBoundingClientRect = () =>
    ({ width: 400, height: 200, x: 0, y: 0, top: 0, right: 400, bottom: 200, left: 0 }) as DOMRect
  act(() => {
    fireResize()
  })
  return { onChange, frame, view }
}

function down(frame: Element, pointerId: number, x: number, y: number, button = 0) {
  fireEvent.pointerDown(frame, { pointerId, clientX: x, clientY: y, button })
}
function move(frame: Element, pointerId: number, x: number, y: number) {
  fireEvent.pointerMove(frame, { pointerId, clientX: x, clientY: y })
}
function up(frame: Element, pointerId: number) {
  fireEvent.pointerUp(frame, { pointerId })
}

describe('PhotoshopCropStudio', () => {
  it('is an application landmark naming the chosen ratio and the full instruction', () => {
    const { frame } = studio()
    expect(
      screen.getByRole('application', {
        name: 'Crop to 2:1 — drag to move, pinch or scroll or use the slider to zoom, arrow keys to nudge',
      }),
    ).toBe(frame)
    expect(frame).toHaveAttribute('tabindex', '0')
    expect(frame.querySelector('span[aria-hidden]')).toBeInTheDocument()
  })

  it('shapes the frame from the LABEL, not the float — `aspect-ratio: 2 / 1`', () => {
    const { frame } = studio()
    expect(frame.getAttribute('style')).toContain('aspect-ratio: 2 / 1')
    // Not the circle: this frame is a rectangle and must never inherit CropStudio's pill.
    expect(frame).not.toHaveClass('aspect-square')
    expect(frame).not.toHaveClass('rounded-pill')
  })

  it('renders the photo through the one crop-to-CSS mapping, undraggable', () => {
    const { view } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: -50 } })
    const img = view.container.querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://blob.example/her.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('draggable', 'false')
    // 600x800 in a 2:1 frame at scale 2: widthPct 200, heightPct 533.3333.
    // x=100 → left = 50 + 10 - 100 = -40%; y=-50 → top = 50 - 5 - 266.6667 = -221.6667%.
    expect(img).toHaveStyle({
      width: '200%',
      height: '533.3333%',
      left: '-40%',
      top: '-221.6667%',
    })
  })

  it('states the ratio and the stored values in operator terms under the frame', () => {
    studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: -50 } })
    expect(screen.getByText(/Stored as 2:1, scale 2\.000×, offset 100\/-50\./)).toBeInTheDocument()
  })

  it('offers every catalogued ratio, and nothing else — the enum is the single source of truth', () => {
    studio()
    const select = screen.getByRole('combobox', { name: 'Crop aspect ratio' }) as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(
      NINA_IMAGE_ASPECT_RATIOS.map((entry) => entry.label),
    )
    expect(select).toHaveValue('2:1')
  })

  it('re-clamps the crop against the NEW frame shape when the ratio changes', () => {
    // y=1000 is legal at 2:1 (heightPct 533.33 → |y| ≤ 2166). At 3:4 the source ratio equals the
    // frame ratio, both spans are 200% at scale 2, and the limit collapses to ±500.
    const { onChange } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 1000 } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Crop aspect ratio' }), {
      target: { value: '3:4' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ratioLabel: '3:4',
      crop: { scale: 2, x: 100, y: 500 },
    })
  })

  it('shows the zoom readout and wires the slider in thousandths, holding the ratio', () => {
    const { onChange } = studio()
    expect(screen.getByText(/Zoom · 2\.00×/)).toBeInTheDocument()
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider).toHaveAttribute('min', '1000')
    expect(slider).toHaveAttribute('max', '4000')
    expect(slider).toHaveAttribute('step', '10')
    expect(slider).toHaveValue('2000')
    expect(slider).toHaveClass('h-11')

    fireEvent.change(slider, { target: { value: '3000' } })
    // next/scale = 3/2 = 1.5, as a factor — so the frame centre holds still.
    expect(onChange).toHaveBeenCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 3, x: 0, y: 0 },
    })
  })

  it('zooms on the wheel — deltaY -400 is the 2x cap, +400 the 0.5 floor', () => {
    const { onChange, frame } = studio()
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 4, x: 0, y: 0 },
    })

    fireEvent.wheel(frame, { deltaY: 400 })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 1, x: 0, y: 0 },
    })
  })

  it('registers the wheel listener by hand with passive:false — the only way preventDefault counts', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    studio()
    const wheelCalls = spy.mock.calls.filter(([type]) => type === 'wheel')
    expect(wheelCalls).not.toHaveLength(0)
    expect(wheelCalls.some(([, , options]) => JSON.stringify(options) === '{"passive":false}')).toBe(
      true,
    )
    spy.mockRestore()
  })

  it('never scrolls the page while zooming — the wheel handler calls preventDefault', () => {
    const { frame } = studio()
    const event = new WheelEvent('wheel', { deltaY: -120, cancelable: true })
    expect(frame.dispatchEvent(event)).toBe(false) // false = a preventDefault happened
  })

  it('does not register the wheel zoom at all while disabled', () => {
    const { onChange, frame } = studio(
      { ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } },
      true,
    )
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('nudges by 10 stored units per arrow key, 50 with shift', () => {
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 100 } })
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 110, y: 100 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 110 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 90, y: 100 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 90 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 150, y: 100 },
    })
  })

  it('zooms from the keyboard: + and = in, - and _ out, by 1.1x', () => {
    // CONTROLLED: every press recomputes from the prop value, so each alias is asserted against
    // its own call rather than compounded on the previous one.
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 0 } })
    fireEvent.keyDown(frame, { key: '=' })
    expect(onChange).toHaveBeenNthCalledWith(1, {
      ratioLabel: '2:1',
      crop: { scale: 2.2, x: 110, y: 0 },
    })
    fireEvent.keyDown(frame, { key: '-' })
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ratioLabel: '2:1',
      crop: { scale: 1.818, x: 91, y: 0 },
    })
    fireEvent.keyDown(frame, { key: '+' })
    expect(onChange).toHaveBeenNthCalledWith(3, {
      ratioLabel: '2:1',
      crop: { scale: 2.2, x: 110, y: 0 },
    })
    fireEvent.keyDown(frame, { key: '_' })
    expect(onChange).toHaveBeenNthCalledWith(4, {
      ratioLabel: '2:1',
      crop: { scale: 1.818, x: 91, y: 0 },
    })
  })

  it('ignores keys it does not own', () => {
    const { onChange, frame } = studio()
    fireEvent.keyDown(frame, { key: 'a' })
    fireEvent.keyDown(frame, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('converts a pointer delta PER AXIS — 400 px wide, 200 px tall, two divisors', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 100, 100)
    move(frame, 1, 140, 130) // dx 40 → ×(1000/400) = +100; dy 30 → ×(1000/200) = +150
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 150 },
    })
  })

  it('returns the crop untouched for a move measured before the frame has any width', () => {
    // No rect patch, no resize fire: framePx is 0, and a divide-by-zero must not move the photo.
    const onChange = vi.fn()
    render(
      <PhotoshopCropStudio
        src="s"
        natural={NATURAL}
        value={{ ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } }}
        onChange={onChange}
      />,
    )
    const frame = screen.getByRole('application')
    down(frame, 1, 100, 100)
    move(frame, 1, 500, 500)
    expect(onChange).toHaveBeenCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 0, y: 0 },
    })
  })

  it('ignores a move from a pointer that never went down', () => {
    const { onChange, frame } = studio()
    move(frame, 99, 10, 10)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores anything but the primary button — a right-click does not start a drag', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 100, 100, 2)
    move(frame, 1, 140, 130)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pinches on two pointers: the span ratio drives the zoom, seeded on the second contact', () => {
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 50 } })
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0) // seed span 100
    move(frame, 1, 50, 0) // span 50 → ratio 0.5
    // scale 1, x 50, y 25. At scale 1 the width spans exactly 100% of the frame, so x has NO
    // slack; the height still spans 266.67%, so y keeps ±833 — the asymmetry a naive both-axes
    // clamp misses, here driven by the FRAME's shape and not just the photo's.
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 1, x: 0, y: 25 },
    })
  })

  it('zooms IN when the pinch span grows', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0)
    move(frame, 1, -100, 0) // span 200 → ratio 2
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 4, x: 0, y: 0 },
    })
  })

  it('ends the pinch when EITHER finger lifts, and the survivor pans without a jump', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0)
    move(frame, 1, -100, 0) // pinch in
    up(frame, 2)
    onChange.mockClear()
    // The survivor's stored position is (-100, 0); a 40 px move is a PAN of +100 units. The pan
    // derives from the PROP value — controlled, so the mock's earlier zoom is invisible here.
    move(frame, 1, -60, 0)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 0 },
    })
  })

  it('shows the grabbing cursor only while a pointer is down, and releases cleanly', () => {
    const { frame } = studio()
    down(frame, 1, 0, 0)
    expect(frame).toHaveClass('cursor-grabbing')
    up(frame, 1)
    expect(frame).toHaveClass('cursor-grab')
    expect(frame).not.toHaveClass('cursor-grabbing')
  })

  it('survives an up event for a pointer it never knew', () => {
    const { frame } = studio()
    expect(() => up(frame, 42)).not.toThrow()
    expect(frame).toHaveClass('cursor-grab')
  })

  it('goes inert while disabled: no pointer, no keys, no ratio change — dimmed and unfocusable', () => {
    const { onChange, frame } = studio(
      { ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } },
      true,
    )
    expect(frame).toHaveClass('opacity-60', 'cursor-default')
    expect(frame).toHaveAttribute('tabindex', '-1')

    down(frame, 1, 0, 0)
    move(frame, 1, 40, 30)
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Crop aspect ratio' })).toBeDisabled()
  })
})
```

**Impact:** none on shipped code. Note the two cases that would NOT have caught a square-frame
regression in `CropStudio`'s clothing: *"converts a pointer delta PER AXIS"* and *"re-clamps the
crop against the NEW frame shape"*.

---

### Step 6: `PhotoshopDetail.test.tsx`

**File:** `components/admin/PhotoshopDetail.test.tsx` (new — confirmed absent today)
**Change:** six cases on the wiring this phase adds. The studio is stubbed at its import boundary
(it has its own suite, one step above) down to a button that fires its `onChange` contract — the
precedent is `ImageGenPanel.test.tsx:39-57`, which stubs `PhotoReferencePicker` the same way. The
Server Action module is mocked whole, as every other action-driven suite in this directory does.

**Code:**

```tsx
// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotoshopDetail } from './PhotoshopDetail'
import { runPhotoshopJobAction } from '@/lib/admin/photoshopActions'
import { photoshopPresetText } from '@/lib/nina/photoshopPresets'

/*
 * What is under test is the CROP WIRING, and nothing else: the step is offered in both modes and
 * hidden when the source's shape is unknown, a skipped step sends four nulls, an opened step sends
 * the auto-picked ratio and an identity crop, and an adjusted step sends what the studio reported.
 * The studio itself is stubbed (`PhotoshopCropStudio.test.tsx` owns it) and the Server Actions are
 * mocked.
 */
vi.mock('@/lib/admin/photoshopActions', () => ({
  runPhotoshopJobAction: vi.fn().mockResolvedValue({ ok: true, jobId: 'job000000001' }),
  /* Never driven by name here — the poll fires 3 s after a run, well past the end of any case —
   * but a resolved default keeps a stray tick from surfacing an unhandled rejection. */
  readPhotoshopJobAction: vi.fn().mockResolvedValue(null),
  resolvePhotoshopJobAction: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/components/admin/PhotoshopCropStudio', async () => {
  const React = await import('react')
  return {
    PhotoshopCropStudio: (props: {
      value: { ratioLabel: string; crop: { scale: number; x: number; y: number } }
      onChange: (next: {
        ratioLabel: string
        crop: { scale: number; x: number; y: number }
      }) => void
    }) =>
      React.createElement(
        'button',
        {
          'data-testid': 'crop-studio',
          onClick: () =>
            props.onChange({ ratioLabel: '16:9', crop: { scale: 1.5, x: 20, y: -30 } }),
        },
        `${props.value.ratioLabel}@${props.value.crop.scale}/${props.value.crop.x}/${props.value.crop.y}`,
      ),
  }
})

const runAction = vi.mocked(runPhotoshopJobAction)

/** 832x732 is the live repro from the analysis: ratio 1.137, nearest catalogued value 5:4. */
function panel(sourceWidth: number | null = 832, sourceHeight: number | null = 732) {
  return render(
    <PhotoshopDetail
      sourceKind="avatar"
      sourceId="abcdefghijkl"
      sourceUrl="https://blob.example/source.png"
      sourceWidth={sourceWidth}
      sourceHeight={sourceHeight}
    />,
  )
}

const cropToggle = () => screen.getByRole('button', { name: /Aspect ratio crop/ })

async function run() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Run photoshop' }))
  })
}

/** Everything `execute()` has always sent, unchanged by this feature. */
const BASE_PAYLOAD = {
  sourceKind: 'avatar',
  sourceId: 'abcdefghijkl',
  mode: 'edit',
  model: 'bytedance-seed/seedream-4.5',
  presetKey: null,
  instruction: photoshopPresetText('bigger_boobs'),
}

beforeEach(() => {
  runAction.mockClear()
})

describe('PhotoshopDetail — the optional crop step', () => {
  it('offers the step in BOTH modes — nothing about it is mode-conditional', () => {
    panel()
    expect(cropToggle()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Anchor' }))
    expect(cropToggle()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(cropToggle()).toBeInTheDocument()
  })

  it('does not offer the step at all when the source photo has no recorded dimensions', () => {
    panel(null, null)
    expect(screen.queryByRole('button', { name: /Aspect ratio crop/ })).not.toBeInTheDocument()
  })

  it("skipping the step sends four nulls — today's job, byte for byte", async () => {
    panel()
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })
  })

  it("opening it defaults to the auto-picked ratio and an identity crop — the server's own choice", async () => {
    panel()
    fireEvent.click(cropToggle())
    expect(cropToggle()).toHaveAttribute('aria-expanded', 'true')
    // 832/732 = 1.137; the closest catalogued value by log distance is 5:4.
    expect(screen.getByTestId('crop-studio')).toHaveTextContent('5:4@1/0/0')
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: '5:4',
      cropScale: 1,
      cropX: 0,
      cropY: 0,
    })
  })

  it('sends whatever the studio last reported, in all four fields', async () => {
    panel()
    fireEvent.click(cropToggle())
    fireEvent.click(screen.getByTestId('crop-studio'))
    expect(screen.getByTestId('crop-studio')).toHaveTextContent('16:9@1.5/20/-30')
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: '16:9',
      cropScale: 1.5,
      cropX: 20,
      cropY: -30,
    })
  })

  it('closing the step again drops straight back to the skipped payload', async () => {
    panel()
    fireEvent.click(cropToggle())
    fireEvent.click(screen.getByTestId('crop-studio'))
    fireEvent.click(cropToggle())
    expect(screen.queryByTestId('crop-studio')).not.toBeInTheDocument()
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })
  })
})
```

**Impact:** none on shipped code. The `BASE_PAYLOAD` spread is the regression guard the plan index
asks for: any accidental change to the five fields `execute()` has always sent fails every case.

---

## Verification

> **Environment note (reconciler, round 1):** this worktree has **no `node_modules`** and the
> shell's default Node is **v20.11.1**, below `package.json`'s `"engines": { "node": ">=22" }` —
> Vitest 4 cannot boot on it (`node:util` has no `styleText`). Run `npm ci` in the worktree under a
> Node >= 22 binary before any command below. One-off setup for the whole plan set, not this
> phase's work.

**Build:** `npm run build`
**Typecheck (the real gate):** `npm run typecheck`
**Lint/format:** `npm run lint && npm run format:check`
**Tests:**
```
npx vitest run components/admin/PhotoshopCropStudio.test.tsx
npx vitest run components/admin/PhotoshopDetail.test.tsx
npm test
```
**Guards:** `npm run ci:client-secret-guard` (this phase adds a `'use client'` module; it names no
secret, and `lib/nina/imagerecipe.ts` holds none either — its exports are endpoint URLs, model ids,
timeouts and the ratio table) and `npm run knip` (`PhotoshopCropStudio` and `PhotoshopCropSelection`
both have a real importer once Step 2 lands — do not commit Step 1 alone).

**Manual check:** `npm run dev`, open `/admin/photoshop/avatar/<id>` for a photo whose ratio falls
between two catalogued buckets (the analysis's 832x732 case is ideal). Confirm: the crop step is
present in both Anchor and Edit; opening it shows `5:4` pre-selected and a 5:4 rectangle; dragging
moves the photo and never reveals background inside the frame at any zoom or ratio; changing the
ratio reshapes the frame and the photo stays fully covering; the step is absent for a photo whose
row has no width/height.

**Exit criteria:** the crop step renders identically in Anchor and Edit mode; a run with the step
closed calls `runPhotoshopJobAction` with the five fields it has always sent plus four `null`s; a
run with the step open calls it with a complete, well-formed quadruple that Phase 4's validation
accepts; `npm run typecheck`, `npm run lint`, `npm test` all pass.

## Handoffs

- **`app/admin/photoshop/[source]/[id]/page.tsx` (Phase 4, R1) — SETTLED, round 1.** Phase 4 owns
  that page edit AND the two type-only members on `PhotoshopDetail`'s props, in one commit, so
  Phase 4 typechecks on its own. **This phase must not edit `page.tsx`.** By the time this phase
  starts the page already renders:
  ```tsx
    return (
      <PhotoshopDetail
        sourceKind={source}
        sourceId={id}
        sourceUrl={photo.blobUrl}
        sourceWidth={photo.width}
        sourceHeight={photo.height}
      />
    )
  ```
  which is what Step 2's props block must keep satisfying. Quoted here only as the state to build
  ON, not as work for this phase to do.
- **Server-side consumption of the four fields (Phase 3, R1).** This phase stores intent; nothing
  here calls `photoshopCropBox` or `sharp`. A crop sent by this UI does nothing observable until
  Phase 3 lands, and that is the correct decoupling — Phase 5 depends on 1 and 4 only.
- **"No-op" is about the RATIO, not the pixels.** Opening the step and running with no adjustment
  sends the same `aspect_ratio` label the server would have picked by itself — but the bytes are
  now genuinely that shape instead of being stretched into it. That is the feature working, not a
  regression; anyone reading the exit criteria as "byte-identical to a skipped run" is reading it
  wrong.
- **A curated short list of common ratios** in the `<select>` (the full 23 entries may prove
  unwieldy on a phone). Explicitly out of scope per the plan index; a follow-up if the operator
  asks, and it would change only `PhotoshopCropStudio`'s option list, never the enum.
- **Persisting the last-used ratio** across visits. Not requested; the auto-pick is per-photo and
  is the right default anyway.
- **A rule-of-thirds overlay** on the rectangle frame. `CropStudio`'s centre crosshair is what this
  copies; thirds guides are a design change nobody asked for.

## Rollback

`git revert` this phase's commit. The three new files disappear, `PhotoshopDetail.tsx` returns to
its five-field payload, and — because the four crop fields are nullable everywhere downstream —
every other phase keeps building and behaving exactly as it did.

**The revert must keep Phase 4's two prop-type members and Phase 4's `page.tsx` edit.** Those two
lines and the page that feeds them are Phase 4's commit, not this one, and reverting to a
three-prop `PhotoshopDetail` while the page still passes five props fails the typecheck. Revert
this phase to the state Phase 4 left: a `PhotoshopDetail` that DECLARES `sourceWidth`/
`sourceHeight` and does not read them. To back out the props entirely, revert Phase 4 as well, in
reverse phase order.
