'use client'

import { ButtonLink, EmptyState, Pagination } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { ExplorerView } from '@/lib/admin/filetree'
import type { ExplorerPageInfo, ExplorerPhoto } from './model'

/**
 * One folder's page of photographs.
 *
 * ── THE BORDERLESS SHEET IS `PhotoReferencePicker`'s RECIPE, BORROWED WHOLE ───────────────────
 * R4: *"buat tampilan foto-fotonya ini lebih clean. buat supaya foto-fotonya ini borderless kaya
 * di Photo reference di Image generation page."* So the grid is the picker's idiom
 * (`components/admin/PhotoReferencePicker.tsx:151-193`), which R10 argued for and
 * `tests/admin.photoReference.test.ts` pins THERE — this file mirrors it and that suite must stay
 * green untouched. One sheet of touching squares: `gap-[3px]`, a single `overflow-hidden
 * rounded-field` on the `<ul>`, `aspect-square` tiles on a `bg-ink-3/20` bed, no per-tile border,
 * radius or padding; and a selection drawn as a slight inset (`scale-[0.9]`) plus a `bg-ink
 * text-card` check badge rather than a coloured frame around a padded card. (`bg-ink`/`text-card`
 * and not `bg-accent`: `components/ui/Button.tsx:46-54` measured white type on the cyan accent at
 * near 2:1, well under WCAG's 4.5:1, where ink-on-card is ~14:1 and inverts correctly in dark
 * mode.) `focus-visible:ring-inset` is what makes a focus ring visible at all inside a sheet whose
 * corners are clipped by that one `overflow-hidden`. The tile floor stays `minmax(88px,1fr)` —
 * this grid's own density, dialed when it was a file manager first — where the picker's
 * `PHOTO_REFERENCE_MIN_TILE_PX` is its own dial for its own page.
 *
 * ── THE FILENAME LEFT THE TILE, AND WHERE IT WENT ────────────────────────────────────────────
 * The sheet carries no captions, and a text label under every tile is what broke it. The name is
 * not lost: it is the button's `aria-label` — the accessible name, the picker's
 * `aria-label={tile.label}` is the precedent — and its `title`, so a pointing cursor still answers
 * *"which file is this"*, and the selection pane prints it as its heading (`SelectionPane.tsx:151`)
 * the moment a tile is tapped. `CircleFrame` moved to that pane for the same reason once: the pane
 * is where questions about one photograph get answered.
 *
 * ── "HERS" IS A CORNER BADGE NOW ─────────────────────────────────────────────────────────────
 * The ribbon was a full-width strip across the tile's bottom edge — a caption, in the idiom this
 * sheet borrows. It becomes a small pill badge in the top-left corner, the check badge's twin
 * (bottom-right), so one tile can wear both without collision. It stays real text, because which
 * photograph is her face is information and not decoration. But an `aria-label` OVERRIDES a
 * button's subtree text, so the visible badge alone would be silent to a screen reader — the
 * label spells it out instead: `${photo.filename} — her current profile picture` when
 * `photo.isCurrent`, the bare filename otherwise.
 *
 * ── THE GRID NEVER LOADS AN ORIGINAL ────────────────────────────────────────────────────────
 * `photo.thumbUrl ?? photo.url` is the one expression that makes *"hundreds of profile pics"*
 * survivable, and the fallback half of it is not defensive padding: album rows written before the
 * thumbnail column existed have none, and the Media folder's rows (`nina_message_images`) have no
 * thumbnail column at all, so those tiles load originals. `loading="lazy"` is the other half —
 * fetched as tiles approach the viewport, which is what makes the page size a question about
 * bytes rather than about layout.
 *
 * ── A PLAIN `<img>`, FOR THE REASON THIS REPO HAS ALREADY RULED ─────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rejects `next/image` for Blob-hosted photos outright —
 * it would re-optimise finished files on a paid transform quota. `PhotoReferencePicker` makes the
 * same call. The derived thumbnail is this repo's answer to image optimisation for these blobs,
 * and it is written at upload time rather than bought per request.
 *
 * ── THE PAGER IS THE SHARED NUMBERED CONTROL ────────────────────────────────────────────────
 * `components/ui/Pagination.tsx` draws it: one cell per page, every number, the active one a
 * non-interactive `aria-current="page"` rather than a link. It replaced a `‹ Newer` / `Older ›`
 * stepper this file wrote by hand and `app/admin/error-logs/page.tsx` then copied by hand — which
 * is how five surfaces ended up with three copy grammars, and the runner's own reason for the
 * change was that page 7 of an album was six taps from page 1.
 *
 * The 44 px tap floor comes from the control's own class string and NOT from
 * `@/components/admin/touch`: the UI barrel is a client-safe bundle boundary and `ui` importing
 * `admin` inverts the dependency, so the two modules carry the same utilities on purpose. What did
 * NOT change is the count line under the sheet — a row of numbers says where you can go, not how
 * many rows there are, and this grid has answered both questions since it was a file manager.
 */

export function PhotoGrid({
  photos,
  page,
  view,
  selectedId,
  onSelect,
  hrefForPage,
}: {
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  /** Phase 1's: which collection this grid is. The EMPTY copy and the pager label branch on it. */
  view: ExplorerView
  selectedId: string | null
  onSelect: (id: string) => void
  hrefForPage: (page: number) => string
}) {
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  /* The control's own definition of the word, verbatim: always >= 1, so an empty folder still has
     a page 1 — and `Pagination` renders nothing at all when it is exactly 1. */
  const pageCount = Math.max(1, Math.ceil(page.total / page.pageSize))

  if (photos.length === 0) {
    /* Phase 1's empty state, byte for byte — the media arm's copy is view-aware. */
    const onFirstPage = page.page <= 1
    return (
      <EmptyState
        title={
          onFirstPage
            ? view === 'media'
              ? 'Nothing in Media yet'
              : 'Nothing in this folder yet'
            : 'Nothing on this page'
        }
        description={
          onFirstPage
            ? view === 'media'
              ? 'Photographs from the conversation land here — hers and his, newest first.'
              : 'Drop a folder from Explorer, or add photos with the buttons above.'
            : 'This folder is not that long any more.'
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
      {/*
       * One sheet, one pair of rounded corners: `overflow-hidden rounded-field` sits HERE and
       * nowhere else, so the `gap-[3px]` gutters read as hairlines cut into one surface. Every
       * JSX comment in this file starts its continuation lines with `*` — the same
       * load-bearing detail `tests/admin.photoReference.test.ts`'s `codeLines` records, so a
       * comment can never satisfy (or trip) a source assertion.
       */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-[3px] overflow-hidden rounded-field">
        {photos.map((photo) => {
          const selected = photo.id === selectedId
          return (
            <li key={photo.id} className="relative aspect-square bg-ink-3/20">
              <button
                type="button"
                onClick={() => onSelect(photo.id)}
                aria-pressed={selected}
                aria-label={
                  photo.isCurrent
                    ? `${photo.filename} — her current profile picture`
                    : photo.filename
                }
                title={photo.filename}
                /* The hook `FileExplorer`'s pane-close focus restoration queries by. Invisible
                 * to everything else; ids are server-minted and need no escaping. */
                data-photo-id={photo.id}
                className="block size-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and
                 * deliberately un-transformed; see the header. */}
                <img
                  src={photo.thumbUrl ?? photo.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className={cn(
                    'size-full object-cover transition-transform',
                    selected && 'scale-[0.9]',
                  )}
                />
                {photo.isCurrent && (
                  <span className="absolute top-1 left-1 rounded-pill bg-ink px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] text-card uppercase">
                    Hers
                  </span>
                )}
                {/*
                 * `bg-ink text-card` and not `bg-accent`: see the header. `aria-hidden` because
                 * `aria-pressed` on the button is already the announced state.
                 */}
                {selected && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-pill bg-ink text-[11px] font-bold text-card"
                  >
                    &#10003;
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {/*
       * One pager, two arms: `Pagination` returns null at `pageCount <= 1`, so a single-page
       * folder gets the count line and nothing under it, and the `gap-2` collapses with it.
       * `hrefForPage` is handed straight through — `FileExplorer` already decides there whether
       * a page link carries `?view=media` or `?folder=`, and this component has never known.
       */}
      <div className="mt-4 flex flex-col items-center gap-2 border-t border-rule pt-3">
        <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
          {first}&ndash;{last} of {page.total}
        </span>

        <Pagination
          page={page.page}
          pageCount={pageCount}
          hrefForPage={hrefForPage}
          label={view === 'media' ? 'Media pages' : 'Folder pages'}
        />
      </div>
    </div>
  )
}
