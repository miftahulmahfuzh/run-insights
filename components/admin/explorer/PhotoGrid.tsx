'use client'

import Link from 'next/link'

import { ButtonLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { ExplorerPageInfo, ExplorerPhoto } from './model'

/**
 * One folder's page of photographs.
 *
 * ── WHY THE TILE IS A SQUARE AND NOT `CircleFrame` ──────────────────────────────────────────
 * `AlbumManager.tsx:214-220` drew every album entry through `CircleFrame` at `size-24`, because that
 * screen's only question about a photo was *"what does she look like in it"* — its own docstring
 * says so. A file manager asks a different question first: *"which file is this"*. So the tile is a
 * square `object-cover` crop with the filename under it, and `CircleFrame` moves to the selection
 * pane, where framing is what is actually being decided and where it still draws at the 44 px and
 * 28 px the app really uses. Nothing about `CircleFrame` changes; it changes location.
 *
 * ── THE GRID NEVER LOADS AN ORIGINAL ────────────────────────────────────────────────────────
 * `photo.thumbUrl ?? photo.url` is the one expression that makes *"hundreds of profile pics"*
 * survivable, and the fallback half of it is not defensive padding: every row written before phase
 * 1 added the column has no thumbnail, so the album as it exists today renders entirely through the
 * fallback and gets faster one upload at a time. `loading="lazy"` is the other half — 120 tiles a
 * page (`NINA_ADMIN_PAGE_SIZE`), fetched as they approach the viewport, which is what makes the
 * page size a question about bytes rather than about layout.
 *
 * ── A PLAIN `<img>`, FOR THE REASON THIS REPO HAS ALREADY RULED ─────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rejects `next/image` for Blob-hosted photos outright —
 * it would re-optimise finished files on a paid transform quota. `CircleFrame` makes the same call.
 * The derived thumbnail is this repo's answer to image optimisation for these blobs, and it is
 * written at upload time rather than bought per request.
 */

export function PhotoGrid({
  photos,
  page,
  selectedId,
  onSelect,
  hrefForPage,
}: {
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  selectedId: string | null
  onSelect: (id: string) => void
  hrefForPage: (page: number) => string
}) {
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))

  if (photos.length === 0) {
    return (
      <EmptyState
        title={page.page > 1 ? 'Nothing on this page' : 'Nothing in this folder yet'}
        description={
          page.page > 1
            ? 'This folder is not that long any more.'
            : 'Drop a folder from Explorer, or add photos with the buttons above.'
        }
        action={
          page.page > 1 ? (
            /* `ButtonLink`, not a `Button` inside a `Link`: a <button> nested in an <a> is
               invalid HTML and the barrel exports this exact component for this exact case. */
            <ButtonLink href={hrefForPage(1)} size="md" variant="secondary">
              Go to the first page
            </ButtonLink>
          ) : undefined
        }
      />
    )
  }

  return (
    <div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
        {photos.map((photo) => {
          const selected = photo.id === selectedId
          return (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => onSelect(photo.id)}
                aria-pressed={selected}
                title={photo.filename}
                className={cn(
                  'block w-full rounded-chip border p-1 text-left transition-[opacity,transform] active:scale-[0.985]',
                  selected
                    ? 'border-accent bg-accent-soft'
                    : 'border-rule bg-card hover:bg-paper-2',
                )}
              >
                <span className="relative block aspect-square overflow-hidden rounded-[6px] bg-paper-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and
                      deliberately un-transformed; see the header. */}
                  <img
                    src={photo.thumbUrl ?? photo.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                  {photo.isCurrent && (
                    <span className="absolute inset-x-0 bottom-0 bg-accent px-1 py-0.5 text-center text-[9px] font-semibold tracking-[0.04em] text-card uppercase">
                      Hers
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-[10px] font-medium text-ink-3">
                  {photo.filename}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-3">
        {page.page > 1 ? (
          <Link
            href={hrefForPage(page.page - 1)}
            className="text-[12px] font-semibold text-accent"
            rel="prev"
          >
            &lsaquo; Newer
          </Link>
        ) : (
          <span className="text-[12px] font-semibold text-ink-3">&lsaquo; Newer</span>
        )}

        <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
          {first}&ndash;{last} of {page.total}
        </span>

        {page.page < lastPage ? (
          <Link
            href={hrefForPage(page.page + 1)}
            className="text-[12px] font-semibold text-accent"
            rel="next"
          >
            Older &rsaquo;
          </Link>
        ) : (
          <span className="text-[12px] font-semibold text-ink-3">Older &rsaquo;</span>
        )}
      </div>
    </div>
  )
}
