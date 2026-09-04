'use client'

import * as React from 'react'

import { SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { decideSwipe, stepIndex, type SwipeGesture } from '@/lib/photos/gallery'

/**
 * The one full-screen image overlay in the authenticated app.
 *
 * ── WHY IT LIVES HERE AND NOT IN components/review ─────────────────────────────────────────────
 * It used to be a module-private function inside `components/review/ScreenshotStrip.tsx`, typed to
 * that file's `ReviewPhoto`. That is why card #8's four requests were really one: "let the shared-
 * page rows zoom", "make the review strip swipeable" and "make the sheet panels swipeable" were
 * all blocked on the same overlay being unreachable from outside one file. Lifting it out and
 * widening its prop type to `ViewerPhoto` collapses them into a single implementation, which is
 * also the only way the swipe stays identical on all three surfaces instead of drifting.
 *
 * Three callers: `ScreenshotStrip` and `SheetSource` (the correction screen) and
 * `PhotoInclusionList` (the run-detail sharing control). The **public** shared page is not one of
 * them and must not become one — `app/(public)/s/[token]/page.tsx` is a Server Component with
 * plain links and no lightbox on purpose, so a viewer gets the platform's own image viewer with
 * real pinch-zoom, real save and real back.
 *
 * ── THE ZOOM IS THE BROWSER'S, NOT OURS ────────────────────────────────────────────────────────
 * `touch-action: pinch-zoom` on the scroll container below gives native two-finger zoom and
 * momentum panning, which is what an iPhone user's hands already know. A JS pinch handler here
 * would be a worse copy of a thing the platform does perfectly, and it would fight VoiceOver.
 *
 * That decision is what shapes the swipe: see `onTouchEnd`.
 */

/**
 * The minimum a photo needs to be shown here — the URL, and a `kind` to name it.
 *
 * Deliberately narrower than `ReviewPhoto`, which also carries `width`/`height` this component
 * never reads. Structural typing means `ReviewPhoto[]` still assigns to `readonly ViewerPhoto[]`
 * with no adapter at the review call sites; `PhotoInclusionList` maps, because its field is called
 * `blobUrl`.
 */
export interface ViewerPhoto {
  url: string
  kind: string
  /**
   * What to call this photo, when `kind` is not a `ScreenKind`. F33's album and chat gallery pass
   * a human phrase here; the review surfaces pass nothing and keep `SCREEN_KIND_LABEL`.
   *
   * Without it the header renders `SCREEN_KIND_LABEL[kind] ?? kind`, which for an album photo is
   * the literal word `avatar` and for one of her selfies the literal word `generated` — and the
   * dot row then announces "generated screenshot".
   */
  label?: string
}

export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  subject = 'screenshot',
}: {
  photos: readonly ViewerPhoto[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  /**
   * The noun in the dialog's accessible name. `'screenshot'` for the three review surfaces,
   * `'foto'` for F33's album and gallery — "avatar screenshot" is not a thing.
   */
  subject?: string
}) {
  const photo = photos[index]!
  /**
   * The one place a photo is named. Both new props are defaulted and both reduce to the expression
   * that was already here when they are absent, so `ScreenshotStrip`, `SheetSource` and
   * `PhotoInclusionList` are byte-identical in behaviour.
   */
  const nameOf = (p: ViewerPhoto) => p.label ?? SCREEN_KIND_LABEL[p.kind as ScreenKind] ?? p.kind
  const panRef = React.useRef<HTMLDivElement | null>(null)

  /**
   * The in-flight gesture. A ref and not state: it is written on every `touchmove` and read once
   * on `touchend`, so putting it in state would re-render the overlay mid-drag for no reader.
   */
  const drag = React.useRef<{
    x: number
    y: number
    touches: number
    canPanHorizontally: boolean
  } | null>(null)

  /**
   * Paging goes through `stepIndex`, so the arrow keys wrap exactly as the swipe does. Before F18
   * these clamped (`Math.min(index + 1, photos.length - 1)`), which is the opposite of circular —
   * and clamping here while the swipe wrapped would have been the same bug wearing a keyboard.
   */
  const page = React.useCallback(
    (delta: number) => onIndex(stepIndex(index, delta, photos.length)),
    [index, onIndex, photos.length],
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') page(1)
      if (event.key === 'ArrowLeft') page(-1)
    }
    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [page, onClose])

  /**
   * A new photo starts at the top. Without this, paging away from a screenshot scrolled halfway
   * down lands on the next one already scrolled halfway down — the reader sees a band of pixels
   * from the middle of an image they have not looked at yet.
   */
  React.useEffect(() => {
    panRef.current?.scrollTo({ top: 0, left: 0 })
  }, [index])

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    if (!touch) return
    const el = panRef.current
    drag.current = {
      x: touch.clientX,
      y: touch.clientY,
      touches: event.touches.length,
      canPanHorizontally: el ? el.scrollWidth > el.clientWidth + 1 : false,
    }
  }

  /**
   * This handler's only job is the touch count, and it is the reason rule 1 of `decideSwipe`
   * works: a pinch whose second finger lands *after* the first would look single-fingered at
   * `touchend`, and would page the photo away in the middle of a zoom.
   */
  function onTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (!drag.current) return
    drag.current.touches = Math.max(drag.current.touches, event.touches.length)
  }

  /**
   * ── WHY NOTHING HERE CALLS preventDefault ────────────────────────────────────────────────────
   * Because paging is a discrete state change with no follow-the-finger transform, these handlers
   * only ever *read* the gesture and let the browser do whatever it was going to do — so the
   * native pinch-zoom, the momentum panning and the vertical scroll of a 1600 px-tall screenshot
   * all keep working, unaware this listener exists.
   *
   * A transform-based carousel would have to `preventDefault` on `touchmove` to stop the container
   * scrolling under the drag, and that is precisely the regression card #8 forbids. The whole
   * design follows from not needing that one call.
   */
  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = drag.current
    // Only when the last finger has left: a pinch releasing one finger at a time fires touchend
    // with a touch still down, and that is mid-gesture, not the end of one.
    if (!start || event.touches.length > 0) return
    drag.current = null
    const touch = event.changedTouches[0]
    if (!touch) return
    const gesture: SwipeGesture = {
      dx: touch.clientX - start.x,
      dy: touch.clientY - start.y,
      touches: start.touches,
      canPanHorizontally: start.canPanHorizontally,
      zoomScale: window.visualViewport?.scale ?? 1,
    }
    const decision = decideSwipe(gesture)
    if (decision === 'next') page(1)
    else if (decision === 'prev') page(-1)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${nameOf(photo)} ${subject}`}
      className="fixed inset-0 z-60 flex flex-col bg-ink/95"
    >
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3">
        <span className="text-[13px] font-semibold text-card">
          {nameOf(photo)}
          {photos.length > 1 && (
            <span className="ml-2 font-medium opacity-60">
              {index + 1} / {photos.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-pill text-[19px] font-semibold text-card"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div
        ref={panRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="min-h-0 flex-1 touch-pinch-zoom overflow-auto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
            dimensions, and already compressed to ~55 KB by the client before upload (F04 §3).
            next/image would re-optimise a file that is already at its target size, on a paid
            transform quota, for no gain. */}
        <img src={photo.url} alt="" className="mx-auto block h-auto w-full max-w-[900px]" />
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-2 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
          {photos.map((p, i) => (
            <button
              key={p.url}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`Show the ${nameOf(p)} ${subject}`}
              aria-current={i === index}
              className={
                i === index
                  ? 'h-1.5 w-6 rounded-pill bg-card'
                  : 'h-1.5 w-1.5 rounded-pill bg-card/40'
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
