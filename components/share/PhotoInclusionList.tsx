'use client'

import * as React from 'react'

import { setPhotoSharingAction } from '@/app/actions/share'
import { Card, Eyebrow } from '@/components/ui/Card'
import { PhotoViewer } from '@/components/ui/PhotoViewer'
import { SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { SHARE_PHOTO_WARNING } from '@/lib/share/config'
import {
  PHOTOS_NOTE,
  PHOTOS_TITLE,
  PHOTO_EXCLUDED,
  PHOTO_INCLUDED,
  PHOTO_TOGGLE_FAILED,
  PHOTO_ZOOM_HINT,
} from '@/lib/share/copy'

export interface InclusionPhoto {
  id: string
  blobUrl: string
  kind: string
  excludedFromShare: boolean
}

/**
 * Per-photo opt-out (§3.3.2). One row per screenshot, a checkbox, and one warning above the list.
 *
 * ── WHY PER-PHOTO AND NOT ALL-OR-NOTHING ───────────────────────────────────────────────────────
 * Because the risk is genuinely per-photo. The *splits* screenshot usually carries none of the
 * exposure the *summary* screenshot does: no location string, no start-and-end clock time, and — the
 * one with no structured equivalent anywhere in this schema — no iOS status bar, no notification
 * banner that happened to fire while the runner was taking the shot. A runner who is happy to share
 * two of three screenshots needs a lever finer than "everything or nothing".
 *
 * **Default: all included.** The author's stated requirement is that photos are shared; the common
 * case should cost zero taps.
 *
 * ── WHY THE WARNING IS HERE AND NOT IN A SETTINGS PAGE ─────────────────────────────────────────
 * Because this is the moment the decision is made. Once a screenshot ships, hiding the matching
 * structured fields is close to theatre — Apple prints "Tangerang" and "05:12" in its own type
 * inside the pixels, and no CSS crop stops the bytes serving them (§3.3.2's demoted idea). The
 * actual privacy lever is this checkbox, so the sentence explaining what is at stake sits directly
 * above it, once, not repeated per row.
 *
 * ── OPTIMISTIC, WITH A REAL ROLLBACK ──────────────────────────────────────────────────────────
 * The checkbox flips immediately and flips back if the write fails. A control that waits 200 ms per
 * tap reads as broken, and a control that lies about a privacy setting is worse than one that is
 * slow — so the failure path restores the true value *and* says so.
 *
 * ── TWO TARGETS PER ROW, NOT ONE (card #8) ────────────────────────────────────────────────────
 * The row used to be a single `<label>` wrapping the thumbnail, the text and the checkbox — which
 * is exactly *why* a tap anywhere toggled inclusion, and why there was no way to look at the
 * screenshot you were deciding about. It is now two sibling targets: the left region opens the
 * full-screen viewer, the right 72 px toggles.
 *
 * The `<label>` had to stop wrapping the row rather than merely shrink, because **HTML forbids a
 * `<button>` inside a `<label>`** — a nested interactive control there has no defined activation
 * behaviour, so "tap the thumbnail to zoom" was unreachable without this restructuring. The label
 * still *wraps its own input*, which keeps the implicit association and means the whole 72 px
 * column activates the checkbox with no `htmlFor`/`id` pair to keep in sync.
 *
 * The padding moved off the `<li>` and onto the button, so the label stretches to the row's full
 * height instead of leaving a 10 px border belonging to neither target: a 72 × ~57 px toggle, past
 * the 44 pt minimum, and a size that does not change with the length of the label text.
 */
export function PhotoInclusionList({
  runId,
  photos,
}: {
  runId: string
  photos: readonly InclusionPhoto[]
}) {
  const [excluded, setExcluded] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(photos.map((p) => [p.id, p.excludedFromShare])),
  )
  const [error, setError] = React.useState<string | null>(null)
  const [viewing, setViewing] = React.useState<number | null>(null)

  /**
   * The viewer's photo list is **every** row, not the tapped one, which is what makes the swipe
   * worth having here — and it includes the excluded ones, because every row is listed and so
   * every row should be reachable. `blobUrl` is mapped to `url`: the only reason this component
   * needs an adapter at all is the field name.
   */
  const viewerPhotos = React.useMemo(
    () => photos.map((p) => ({ url: p.blobUrl, kind: p.kind })),
    [photos],
  )

  if (photos.length === 0) return null

  async function toggle(photoId: string, nextIncluded: boolean) {
    setError(null)
    setExcluded((prev) => ({ ...prev, [photoId]: !nextIncluded }))
    const result = await setPhotoSharingAction(photoId, nextIncluded, runId)
    if (!result.ok) {
      setExcluded((prev) => ({ ...prev, [photoId]: nextIncluded }))
      setError(PHOTO_TOGGLE_FAILED)
    }
  }

  return (
    <Card className="p-5">
      <Eyebrow className="mb-2">{PHOTOS_TITLE}</Eyebrow>
      <p className="text-[12px] leading-[1.55] font-medium text-ink-2">{SHARE_PHOTO_WARNING}</p>
      <p className="mt-1.5 text-[11px] leading-[1.5] font-medium text-ink-3">{PHOTOS_NOTE}</p>

      <ul className="mt-4 space-y-2">
        {photos.map((photo, index) => {
          const isExcluded = excluded[photo.id] ?? photo.excludedFromShare
          const label = SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? `Screenshot ${index + 1}`
          return (
            <li key={photo.id} className="flex items-stretch rounded-field bg-paper-2">
              <button
                type="button"
                onClick={() => setViewing(index)}
                className="flex min-w-0 flex-1 items-center gap-3 p-2.5 text-left"
                aria-label={`Open ${label} full screen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, already
                    compressed to ~55 KB by the client before upload (F04 §3). next/image would
                    re-optimise a file that is already at its target size, on a paid transform
                    quota, for no gain. Same waiver as components/review/ScreenshotStrip.tsx. */}
                <img
                  src={photo.blobUrl}
                  alt=""
                  className={`h-[52px] w-[38px] shrink-0 rounded-[8px] object-cover ${
                    isExcluded ? 'opacity-40' : ''
                  }`}
                />
                <span className="min-w-0 flex-1">
                  {/* A filename-free label. The pathname is a random string with no meaning to a
                      reader, and the kind is what they actually recognise. */}
                  <span className="block text-[13px] font-semibold text-ink">{label}</span>
                  <span className="block text-[11px] font-medium text-ink-3">
                    {isExcluded ? PHOTO_EXCLUDED : PHOTO_INCLUDED} · {PHOTO_ZOOM_HINT}
                  </span>
                </span>
              </button>
              <label className="flex w-[72px] shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={(e) => toggle(photo.id, e.currentTarget.checked)}
                  className="size-6 accent-[var(--accent)]"
                  aria-label={`Include ${label} in the shared page`}
                />
              </label>
            </li>
          )
        })}
      </ul>

      {error && <p className="mt-3 text-[12px] font-semibold text-red">{error}</p>}

      {viewing !== null && viewerPhotos[viewing] && (
        <PhotoViewer
          photos={viewerPhotos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </Card>
  )
}
