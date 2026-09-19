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
 * sibling, and it copies the interaction pattern, not the code.
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
      const step = event.shiftKey ? NINA_PHOTOSHOP_CROP_KEY_STEP * 5 : NINA_PHOTOSHOP_CROP_KEY_STEP
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
            onChange({
              ratioLabel: label,
              crop: clampPhotoshopCrop(natural, ratioFor(label), crop),
            })
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
        <img
          src={src}
          alt=""
          draggable={false}
          style={ninaPhotoshopCropStyle(natural, ratio, crop)}
        />
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
