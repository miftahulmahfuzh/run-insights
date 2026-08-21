'use client'

import * as React from 'react'

import { setPhotoSharingAction } from '@/app/actions/share'
import { Card, Eyebrow } from '@/components/ui/Card'
import { SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { SHARE_PHOTO_WARNING } from '@/lib/share/config'
import {
  PHOTOS_NOTE,
  PHOTOS_TITLE,
  PHOTO_EXCLUDED,
  PHOTO_INCLUDED,
  PHOTO_TOGGLE_FAILED,
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
          return (
            <li key={photo.id}>
              <label className="flex items-center gap-3 rounded-field bg-paper-2 p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, already
                    compressed to ~55 KB by the client before upload (F04 §3). next/image would
                    re-optimise a file that is already at its target size, on a paid transform
                    quota, for no gain. Same waiver as components/review/ScreenshotStrip.tsx. */}
                <img
                  src={photo.blobUrl}
                  alt=""
                  className={`h-[52px] w-[38px] rounded-[8px] object-cover ${
                    isExcluded ? 'opacity-40' : ''
                  }`}
                />
                <span className="min-w-0 flex-1">
                  {/* A filename-free label. The pathname is a random string with no meaning to a
                      reader, and the kind is what they actually recognise. */}
                  <span className="block text-[13px] font-semibold text-ink">
                    {SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? `Screenshot ${index + 1}`}
                  </span>
                  <span className="block text-[11px] font-medium text-ink-3">
                    {isExcluded ? PHOTO_EXCLUDED : PHOTO_INCLUDED}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={(e) => toggle(photo.id, e.currentTarget.checked)}
                  className="size-6 accent-[var(--accent)]"
                  aria-label={`Include the ${
                    SCREEN_KIND_LABEL[photo.kind as ScreenKind] ?? `screenshot ${index + 1}`
                  } in the shared page`}
                />
              </label>
            </li>
          )
        })}
      </ul>

      {error && <p className="mt-3 text-[12px] font-semibold text-red">{error}</p>}
    </Card>
  )
}
