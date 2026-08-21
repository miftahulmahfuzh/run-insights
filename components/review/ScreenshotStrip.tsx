'use client'

import * as React from 'react'

import { PhotoViewer } from '@/components/ui/PhotoViewer'
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
 *
 * The overlay both halves of this file open is `components/ui/PhotoViewer`. It used to be a
 * private function here, which is why card #8's request to make the shared-page rows zoomable was
 * really a request to move it; see its doc comment.
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

/**
 * The tile is 104 px wide because it has to be *told* a width.
 *
 * ── THE BUG THIS FIXES (card #8 item 4) ────────────────────────────────────────────────────────
 * The tile used to have no width of its own: it is a flex item sized by its widest child, and its
 * two children disagreed. The image was `w-auto` — about 48 px, a 739 × 1600 phone screenshot
 * scaled to 104 px tall — while the caption was a variable-length `SCREEN_KIND_LABEL` plus
 * padding, about 70 px. The caption always won, and that produced both reported symptoms at once:
 *
 *   - the three tiles were **different widths**, because "Summary" is a wider word than "Splits";
 *   - the image sat against the left edge with ~22 px of `bg-paper-2` showing to its right, which
 *     read as the thumbnail having slipped sideways in its box.
 *
 * `object-cover` was already on the image and did nothing, because cover needs a constrained box
 * to cover. Giving the tile a width is therefore the whole fix, and it fixes both symptoms.
 *
 * `object-top` rather than the default centre: cover on a 739 × 1600 screenshot in a 104 px square
 * scales to width and shows about 46 % of the height, and anchored at the top that band is the
 * screen's title plus the chart, the first split rows, or the workout-details stats — the part
 * that makes each screenshot recognisable at 104 px. Centred, the titles are the first thing
 * cropped away. The full uncropped image is one tap away regardless.
 */
const TILE = 'block w-[104px] overflow-hidden rounded-field bg-paper-2 shadow-card'
const TILE_IMAGE = 'size-[104px] object-cover object-top'
const TILE_CAPTION = 'block truncate px-2 py-1.5 text-center text-[10px] font-semibold text-ink-3'

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
                className={TILE}
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
                  className={TILE_IMAGE}
                />
                <span className={TILE_CAPTION}>
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
 * The sheet's pinned evidence panel — R-45's "stacked, not side-by-side".
 *
 * At 414 px nothing legible fits beside an input, so the source screenshot sits **above** the
 * fields it was read from. That is "the value next to the screenshot it came from" in the only
 * orientation a phone actually supports, and it is why this is a wide short strip rather than a
 * column: the reviewer needs to find one row in a table, then look down at one input.
 *
 * ── WHY THESE THUMBNAILS ARE *NOT* SQUARED OFF LIKE THE STRIP ABOVE ────────────────────────────
 * Card #8 asked whether they need the same treatment. They do not, on two counts. There is no bug
 * here to fix: this panel renders no caption, so the tile *is* the image width — nothing disagrees
 * about the width, so there is neither a gutter nor an uneven row. And the treatment would be
 * actively harmful: this is the panel a reviewer reads a heart-rate number or a split time off,
 * and cropping half of it away to make a square would remove the thing it exists to show. A
 * free-scrolling strip at full aspect is the point.
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
