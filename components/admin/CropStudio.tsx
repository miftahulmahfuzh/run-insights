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
 * Drag to move, wheel or slider to zoom, until her face sits in the middle of the circle. F33 R23.
 *
 * ── THE DIVISION OF LABOUR IS THE POINT ─────────────────────────────────────────────────────
 * `vitest.config.ts` runs `environment: 'node'`: no jsdom, no `PointerEvent`, no
 * `getBoundingClientRect`. So this component contains **no arithmetic beyond subtracting two
 * pointer positions**; the clamping, the aspect fit, the delta conversion and the CSS mapping are
 * all `lib/nina/crop.ts` and are all unit-tested there. Invariant 6, and the precedent is exact:
 * `lib/photos/gallery.ts` was carved out of `PhotoViewer.tsx` for this reason.
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
 * ── TOUCH ───────────────────────────────────────────────────────────────────────────────────
 * `touch-none` on the frame, so a drag on a touch device pans the image instead of scrolling the
 * page. Pinch-to-zoom is NOT implemented: R23 says "this UI is for desktop", the slider covers
 * every zoom a touch user needs, and a second pointer's worth of gesture arithmetic for a screen
 * nobody will open on a phone is scope this phase does not need. Named here rather than left as an
 * unexplained gap.
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

  /** The last pointer position, per active pointer. A ref because it must not re-render. */
  const last = useRef<{ id: number; x: number; y: number } | null>(null)

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
      if (disabled || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      last.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      setDragging(true)
    },
    [disabled],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = last.current
      if (start == null || start.id !== event.pointerId) return
      // The only arithmetic in this file, and it is a subtraction.
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      last.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      onChange(panCrop(natural, crop, dx, dy, framePx))
    },
    [crop, framePx, natural, onChange],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (last.current?.id !== event.pointerId) return
    last.current = null
    setDragging(false)
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
        aria-label="Frame her face — drag to move, scroll or use the slider to zoom, arrow keys to nudge"
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'relative aspect-square w-full max-w-[420px] touch-none overflow-hidden rounded-pill bg-paper-2 outline-none',
          'ring-1 ring-rule focus-visible:ring-2 focus-visible:ring-accent',
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

      <label className="mt-4 block">
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
          className="w-full max-w-[420px] accent-accent"
        />
      </label>

      <p className="mt-2 max-w-[420px] text-[12px] font-medium text-ink-3">
        Drag the photo, scroll to zoom, arrow keys to nudge (hold shift for a bigger step). Stored
        as scale {crop.scale.toFixed(3)}&times;, offset {crop.x}/{crop.y} thousandths of the frame.
      </p>
    </div>
  )
}
