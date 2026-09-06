'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import {
  NINA_CROP_KEY_STEP,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
  ninaCropStyle,
  nudgeCrop,
  panCrop,
  zoomCrop,
  zoomFactorForWheel,
  type NinaCrop,
} from '@/lib/nina/crop'

/**
 * Drag to move, pinch or scroll or slide to zoom, until her face sits in the middle of the circle.
 * F33 R23.
 *
 * ── THE DIVISION OF LABOUR IS STILL THE POINT ───────────────────────────────────────────────
 * `vitest.config.ts` runs `environment: 'node'`: no jsdom, no `PointerEvent`, no
 * `getBoundingClientRect`. So the clamping, the aspect fit, the delta conversion and the CSS
 * mapping are all `lib/nina/crop.ts` and are all unit-tested there. Invariant 6, and the precedent
 * is exact: `lib/photos/gallery.ts` was carved out of `PhotoViewer.tsx` for this reason.
 *
 * The rule used to read *"no arithmetic beyond subtracting two pointer positions"*. Pinch adds
 * exactly two operations to that and no third: a `Math.hypot` over one such subtraction, and the
 * RATIO of this frame's span to the previous frame's. The ratio goes to `zoomCrop` unchanged — the
 * same shape of factor `zoomFactorForWheel` returns — so every bound, every clamp and every
 * re-centring still happens in the tested module. Nothing about a crop is decided in this file.
 * `spanOf` at the bottom is the whole of the addition and it is three lines.
 *
 * ── CONTROLLED, NOT STATEFUL ────────────────────────────────────────────────────────────────
 * The crop lives in `components/admin/explorer/SelectionPane.tsx`, because "Save framing" and
 * "Reset framing" and the dirty marker are all its business and a component that owned the value
 * would have to tell it anyway.
 *
 * ── WHY THE WHEEL LISTENER IS REGISTERED BY HAND ────────────────────────────────────────────
 * React attaches `wheel` at the root as a PASSIVE listener, so `event.preventDefault()` inside an
 * `onWheel` prop logs an "Unable to preventDefault inside passive event listener" warning and the
 * page scrolls anyway — which on this screen means the studio zooms *and* the page jumps. A direct
 * `addEventListener(…, { passive: false })` is the only way to get the default suppressed.
 *
 * ── TOUCH: THE DEFERRAL IS SPENT ────────────────────────────────────────────────────────────
 * This file used to say pinch was *"scope this phase does not need"* because *"R23 says this UI is
 * for desktop"* and *"a screen nobody will open on a phone"*. R1 of the admin-responsive plan set
 * is the operator saying he opens every one of these screens on an iPhone XS Max, so the premise
 * is gone and the gap closes here. Four things carry it:
 *
 *   1. `touch-none` on the frame, so a drag pans the image instead of scrolling the page — and so
 *      Safari does not claim a two-finger gesture as a page pinch before the second pointer
 *      reaches this component. It was already here, and it is what makes the rest possible.
 *   2. Every pointer is tracked by id in `pointers`, not just the first. One pointer pans, two
 *      pinch, and lifting either one ends the pinch rather than silently re-pairing. The old
 *      single `last` ref had a real bug in it: a second `pointerdown` overwrote the id, so landing
 *      a thumb mid-drag and lifting it again stranded the first finger — its moves no longer
 *      matched the stored id and the photograph froze under it.
 *   3. `select-none` and `[-webkit-touch-callout:none]`. Without them a press-and-hold over the
 *      photograph raises iOS's Copy / Share callout in the middle of a drag, and a drag that ends
 *      in a system sheet is a drag the operator cannot finish. `draggable={false}` only ever
 *      answered the desktop half of this.
 *   4. `h-11` on the zoom slider — 44 px of hit area on the input itself. A range input's tap
 *      target IS its box, and Safari draws the track vertically centred in whatever height it is
 *      given, so the control looks unchanged and is twice as easy to grab.
 *
 * The slider stays, and not as a fallback for a missing gesture: it is the only control here that
 * reports the number actually stored, and it is how a scale is set exactly rather than approached.
 */

export function CropStudio({
  src,
  natural,
  crop,
  onChange,
  disabled = false,
}: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCrop
  onChange: (next: NinaCrop) => void
  disabled?: boolean
}) {
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

  /** The frame's rendered size, measured — the one number the pure module needs from the DOM. */
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
   * The three values the hand-registered wheel listener reads, mirrored into refs so it never
   * closes over a stale one. Written in an effect with NO dependency array rather than during
   * render: `react-hooks/refs` forbids the render-time write, and a wheel event can only arrive
   * after the commit that ran this, so the mirror is never behind by the time it is read.
   */
  const cropRef = useRef(crop)
  const naturalRef = useRef(natural)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    cropRef.current = crop
    naturalRef.current = natural
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const element = frameRef.current
    if (element == null || disabled) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      onChangeRef.current(
        zoomCrop(naturalRef.current, cropRef.current, zoomFactorForWheel(event.deltaY)),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [disabled])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      /*
       * `button !== 0` rejects a right-click and a mouse's middle button. A touch contact and a
       * pen contact both report button 0, so this excludes neither — which is why it can stay
       * exactly as it was written for a mouse.
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
        // PINCH. The ratio of this frame's span to the previous one, handed to `zoomCrop` as the
        // same kind of factor the wheel produces. A missing or zero previous span means there is
        // nothing to divide by, so that move only re-seeds and changes nothing.
        const span = spanOf(pointers.current)
        const last = pinchSpan.current
        pinchSpan.current = span
        if (span == null || last == null || last === 0) return
        onChange(zoomCrop(natural, crop, span / last))
        return
      }

      // PAN. The other arithmetic in this file, and it is a subtraction.
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      onChange(panCrop(natural, crop, dx, dy, framePx))
    },
    [crop, disabled, framePx, natural, onChange],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // `Map.delete` returns false for a pointer that was never tracked, which is the guard the old
    // `last.current?.id !== event.pointerId` check was doing by hand.
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
      const step = event.shiftKey ? NINA_CROP_KEY_STEP * 5 : NINA_CROP_KEY_STEP
      switch (event.key) {
        case 'ArrowLeft':
          onChange(nudgeCrop(natural, crop, -step, 0))
          break
        case 'ArrowRight':
          onChange(nudgeCrop(natural, crop, step, 0))
          break
        case 'ArrowUp':
          onChange(nudgeCrop(natural, crop, 0, -step))
          break
        case 'ArrowDown':
          onChange(nudgeCrop(natural, crop, 0, step))
          break
        case '+':
        case '=':
          onChange(zoomCrop(natural, crop, 1.1))
          break
        case '-':
        case '_':
          onChange(zoomCrop(natural, crop, 1 / 1.1))
          break
        default:
          return
      }
      event.preventDefault()
    },
    [crop, disabled, natural, onChange],
  )

  return (
    <div>
      <div
        ref={frameRef}
        role="application"
        aria-label="Frame her face — drag to move, pinch or scroll or use the slider to zoom, arrow keys to nudge"
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'relative aspect-square w-full max-w-[420px] touch-none overflow-hidden rounded-pill bg-paper-2 outline-none',
          'ring-1 ring-rule select-none [-webkit-touch-callout:none]',
          'focus-visible:ring-2 focus-visible:ring-accent',
          disabled ? 'cursor-default opacity-60' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see CircleFrame's header: the
            crop transform owns every positioning property `next/image fill` would set. */}
        <img src={src} alt="" draggable={false} style={ninaCropStyle(natural, crop)} />
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
          min={NINA_CROP_MIN_SCALE * 1000}
          max={NINA_CROP_MAX_SCALE * 1000}
          step={10}
          value={Math.round(crop.scale * 1000)}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value) / 1000
            // Expressed as a factor so the frame centre holds still, exactly as the wheel does.
            onChange(zoomCrop(natural, crop, next / crop.scale))
          }}
          /* `h-11` is the 44 px tap target, on the input rather than on a wrapper: the hit area of
             a range input IS its box. `touch-none` so a slightly diagonal drag on the thumb is not
             claimed by the page's scroll halfway through the gesture — Safari handles the range's
             own dragging itself and does not need the pan-y it would otherwise keep. */
          className="h-11 w-full touch-none accent-accent"
        />
      </label>

      <p className="mt-2 max-w-[420px] text-[12px] font-medium text-ink-3">
        Drag the photo to move it and pinch to zoom. With a pointer: scroll to zoom, arrow keys to
        nudge (hold shift for a bigger step). Stored as scale {crop.scale.toFixed(3)}&times;, offset{' '}
        {crop.x}/{crop.y} thousandths of the frame.
      </p>
    </div>
  )
}

/**
 * The distance between the first two pointers in the map, in CSS pixels — one subtraction and one
 * `Math.hypot`, and the entire arithmetic budget the header grants this file for pinch.
 *
 * Module scope and not a closure over the ref: it takes what it reads, so it can be named in
 * `onPointerDown`'s and `onPointerMove`'s bodies without joining either `useCallback`'s dependency
 * array and re-creating both handlers on every render.
 *
 * `>= 2` is checked by the callers; this returns `null` for anything else, which is the same
 * "there is no pinch in progress" signal `pinchSpan` carries.
 */
function spanOf(pointers: ReadonlyMap<number, { x: number; y: number }>): number | null {
  const [a, b] = [...pointers.values()]
  if (a === undefined || b === undefined) return null
  return Math.hypot(b.x - a.x, b.y - a.y)
}
