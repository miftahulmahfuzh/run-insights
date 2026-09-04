'use client'

import * as React from 'react'

/**
 * A square photo grid that opens a viewer — F33 R17.
 *
 * ── WHY ONE COMPONENT FOR THE ALBUM AND THE GALLERY ───────────────────────────────────────────
 * They differ in exactly two ways: the album rings its current photo, and the gallery shows two
 * parties. Everything else — three columns, `aspect-square`, `object-cover`, a `<button>` per cell,
 * the tap target — is identical, and two components would be two chances for them to drift the way
 * `ScreenshotStrip`'s arrows and its swipe drifted before F18 unified them.
 *
 * ── `bg-ink-3/20`, NOT `bg-paper-2` ──────────────────────────────────────────────────────────
 * Phase 6 settled this after phases 4, 7 and 8 argued it: `ink-3` is a mid-grey in BOTH schemes, so
 * an alpha of it composites correctly over `bg-ink` and `bg-card` alike, where `bg-paper-2`
 * inverts. Adopted here rather than re-litigated.
 *
 * ── `alt=""` ON EVERY CELL ───────────────────────────────────────────────────────────────────
 * Phase 6's argument holds for both sections: the only description that exists for a chat photo is
 * `glm-4.6v`'s, which is private, and the only one for an avatar is `nina_avatars.description`,
 * which is her memory and not a caption. The `<button>` carries the accessible name instead, which
 * is where a screen reader wants it.
 */

export interface NinaGridCell {
  id: string
  url: string
  /** The button's accessible name. */
  label: string
  /** Draws the current-photo ring. The album sets it; the gallery never does. */
  isCurrent?: boolean
}

export function NinaPhotoGrid({
  cells,
  onOpen,
}: {
  cells: readonly NinaGridCell[]
  onOpen: (index: number) => void
}) {
  if (cells.length === 0) return null

  return (
    <ul className="grid grid-cols-3 gap-1">
      {cells.map((cell, i) => (
        <li key={cell.id} className="overflow-hidden rounded-field bg-ink-3/20">
          <button
            type="button"
            onClick={() => onOpen(i)}
            aria-label={cell.label}
            className={
              cell.isCurrent === true ? 'block w-full ring-2 ring-ink ring-inset' : 'block w-full'
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
                dimensions, already compressed by whoever wrote the row. `next/image` would
                re-optimise finished files on a paid transform quota, three at a time. */}
            <img src={cell.url} alt="" className="block aspect-square w-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  )
}
