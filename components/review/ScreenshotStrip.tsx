'use client'

import * as React from 'react'

import { SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import type { ReviewPhoto } from '@/lib/review/loadReview'

/**
 * The evidence, always on screen.
 *
 * R-45 resolved provenance **by section, not per field**: a value's source is the photo whose
 * `kind` matches the section it belongs to — no bounding boxes, no coordinates from the model, no
 * new column. This strip is the top-level expression of that, and `sourcePhotosFor` below is the
 * resolver every correction sheet uses.
 *
 * The photos are shown at all, and shown first, because a review screen with no screenshot on it
 * is asking the runner to proofread from memory.
 */

/**
 * Which photos back a given section, in the order to show them.
 *
 * The matching-`kind` photo comes first when it exists. When it does not — and it often does not,
 * because `/upload` accepts one to three screenshots — **the fallback is every photo that does
 * exist, in `sort_order`** (R-45 as amended 2026-08-21). A reviewer with something imperfect to
 * check against is strictly better off than a reviewer looking at a blank panel, which is what a
 * strict `kind` match would give them on the common one-screenshot upload.
 */
export function sourcePhotosFor(photos: ReviewPhoto[], section: ScreenKind): ReviewPhoto[] {
  const exact = photos.filter((p) => p.kind === section)
  return exact.length > 0 ? exact : photos
}

export function ScreenshotStrip({ photos }: { photos: ReviewPhoto[] }) {
  const [viewing, setViewing] = React.useState<number | null>(null)
  if (photos.length === 0) return null

  return (
    <>
      <div className="-mx-5 overflow-x-auto px-5 pb-1">
        <ul className="flex gap-2">
          {photos.map((photo, index) => (
            <li key={photo.url}>
              <button
                type="button"
                onClick={() => setViewing(index)}
                className="block overflow-hidden rounded-field bg-paper-2 shadow-card"
                aria-label={`View the ${SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? photo.kind} screenshot full screen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
                    dimensions, and already compressed to ~55 KB by the client before upload
                    (F04 §3). next/image would re-optimise a file that is already at its target
                    size, on a paid transform quota, for no gain. */}
                <img
                  src={photo.url}
                  alt=""
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  className="h-[104px] w-auto object-cover"
                />
                <span className="block px-2 py-1.5 text-[10px] font-semibold text-ink-3">
                  {SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? photo.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {viewing !== null && photos[viewing] && (
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}

/**
 * Full-screen, pinch-zoomable.
 *
 * The zoom is the browser's own, not a gesture library: `touch-action: pinch-zoom` on a scroll
 * container gives native two-finger zoom and momentum panning, which is what an iPhone user's
 * hands already know. A JS pinch handler here would be a worse copy of a thing the platform does
 * perfectly, and it would fight VoiceOver.
 */
function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: ReviewPhoto[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const photo = photos[index]!

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onIndex(Math.min(index + 1, photos.length - 1))
      if (event.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0))
    }
    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [index, photos.length, onIndex, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? photo.kind} screenshot`}
      className="fixed inset-0 z-60 flex flex-col bg-ink/95"
    >
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3">
        <span className="text-[13px] font-semibold text-card">
          {SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? photo.kind}
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

      <div className="min-h-0 flex-1 touch-pinch-zoom overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- see the strip above. */}
        <img src={photo.url} alt="" className="mx-auto block h-auto w-full max-w-[900px]" />
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-2 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
          {photos.map((p, i) => (
            <button
              key={p.url}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`Show the ${SCREEN_KIND_LABEL[p.kind as ScreenKind] ?? p.kind} screenshot`}
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

/**
 * The sheet's pinned evidence panel — R-45's "stacked, not side-by-side".
 *
 * At 414 px nothing legible fits beside an input, so the source screenshot sits **above** the
 * fields it was read from. That is "the value next to the screenshot it came from" in the only
 * orientation a phone actually supports, and it is why this is a wide short strip rather than a
 * column: the reviewer needs to find one row in a table, then look down at one input.
 */
export function SheetSource({ photos, section }: { photos: ReviewPhoto[]; section: ScreenKind }) {
  const sources = sourcePhotosFor(photos, section)
  const [expanded, setExpanded] = React.useState<number | null>(null)
  if (sources.length === 0) return null

  const exact = sources[0]!.kind === section

  return (
    <>
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold text-ink-3">
            {exact
              ? `From your ${SCREEN_KIND_LABEL[section]} screenshot`
              : 'Not in the screenshots you uploaded — here is what you did upload'}
          </span>
          <span className="text-[10px] font-medium text-ink-3">tap to zoom</span>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
          {sources.map((photo, i) => (
            <button
              key={photo.url}
              type="button"
              onClick={() => setExpanded(i)}
              className="shrink-0 overflow-hidden rounded-field bg-paper-2"
              aria-label="Open this screenshot full screen"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see the strip above. */}
              <img src={photo.url} alt="" className="h-[168px] w-auto object-cover" />
            </button>
          ))}
        </div>
      </div>

      {expanded !== null && sources[expanded] && (
        <PhotoViewer
          photos={sources}
          index={expanded}
          onIndex={setExpanded}
          onClose={() => setExpanded(null)}
        />
      )}
    </>
  )
}
