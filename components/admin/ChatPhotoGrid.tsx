'use client'

import Link from 'next/link'
import { useState } from 'react'

import { ChatPhotoDetail } from '@/components/admin/ChatPhotoDetail'
import { ButtonLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { ChatPhoto, ChatPhotoPageInfo } from './chatPhotoModel'

/**
 * `/admin/photos` — every photograph Nina has put in the conversation, as one collection.
 *
 * ── "JUST PUT THEM INTO A FOLDER OR SOMETHING" ──────────────────────────────────────────────
 * R2's own words, and the honest reading of them is a NAMED COLLECTION, not a tree. `nina_avatars`
 * has a real `folder` column and a `nina_folders` table, which is what earns `/admin/nina` a
 * `FolderTree`. This table has neither, invariant 10 of the plan forbids the migration that would
 * add them, and a second folder-path grammar over a set the user described as one bucket would be
 * a vocabulary nobody asked for. So: one folder row at the top, one grid under it, no nesting.
 *
 * The line borrows `FileExplorer.tsx:216-238`'s breadcrumb LOOK on purpose — the two admin photo
 * surfaces should read as one product — and imports nothing from `components/admin/explorer/`.
 *
 * ── THE GRID LOADS ORIGINALS, KNOWINGLY ─────────────────────────────────────────────────────
 * There is no `thumb_url` on `nina_message_images`, so `photo.url` is all there is.
 * `components/nina/NinaPhotoGrid.tsx:56-58` ruled `next/image` out for Blob-hosted photos — it
 * re-optimises finished files on a paid transform quota — and this follows that precedent rather
 * than re-opening it. `loading="lazy"` plus `NINA_CHAT_PHOTO_PAGE_SIZE` (48, argued at its
 * declaration) is the whole mitigation, and it is a known cost, not an oversight.
 *
 * ── READ-ONLY, THIS PHASE ───────────────────────────────────────────────────────────────────
 * Nothing here writes. No Server Action is imported, no form is submitted, no `useTransition`
 * exists. Phase 3 adds replace / remove in `ChatPhotoDetail` and add at the SEAM below.
 */

/** The collection's name, spelled once. The folder row and the page heading both read it. */
export const CHAT_PHOTO_COLLECTION_LABEL = 'Nina generated'

/**
 * The only search parameter this route has. Built here rather than passed in as a `hrefForPage`
 * prop the way `PhotoGrid` takes one: the explorer needs the page's help because its links also
 * carry `?folder=`, and this one has nothing to carry.
 */
function hrefForPage(page: number): string {
  return page <= 1 ? '/admin/photos' : `/admin/photos?page=${page}`
}

export function ChatPhotoGrid({
  photos,
  page,
  userId,
}: {
  photos: readonly ChatPhoto[]
  page: ChatPhotoPageInfo
  /**
   * SEAM — PHASE 3. The signed-in admin's `user.id`, straight from the server page's
   * `requireAdmin()`. **Phase 2 renders it nowhere**; it exists so phase 3's Add and Replace can
   * build `adminChatPhotoPathname(userId, id)` without a client-side session read — a user id that
   * ends up inside a Blob pathname has to come from the server. `app/admin/nina/page.tsx:57-59`
   * threads `shareOrigin` into `FileExplorer` the same way and for the same class of reason.
   */
  userId: string
}) {
  /*
   * The ONE piece of state on this screen, and there is deliberately no optimistic copy of the
   * rows: `SelectionPane`'s docstring calls that *"the one class of bug this screen could plausibly
   * have shipped"*, and the same defence applies here for the same reason — the page is
   * `force-dynamic`, so the rows arrive from the server on every render and there is nothing to
   * keep in sync.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /*
   * One sentence about the last removal, held HERE rather than in the rail.
   *
   * SEAM — PHASE 3, and the reason it is at this level: phase 3's remove action can answer *"the
   * file is still used elsewhere, so it was kept in the store"* (its D5 — a Blob object shared with
   * another row or with her avatar must not be deleted). The rail unmounts the moment
   * `revalidatePath`'s RSC payload arrives without the removed row, so a note rendered inside the
   * rail is destroyed before it can be read. This component does not unmount, so the note survives.
   *
   * Empty and unwritten in phase 2 — nothing here removes anything — and rendered under the
   * collection header below so the layout does not move when phase 3 starts writing it.
   */
  const [notice, setNotice] = useState<string | null>(null)

  /*
   * Resolved against THIS page's rows, so a selection made before a pager click simply falls away
   * rather than pointing at a row that is no longer on screen. `FileExplorer` behaves the same way
   * and for the same reason.
   */
  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))

  return (
    <div>
      {/*
       * THE FOLDER ROW. One node, always current, never a link — there is nowhere else to go.
       *
       * SEAM — PHASE 3. "Add a photo" belongs here, at the right of this row, beside the count: it
       * is a collection-level action and needs nothing from a selection. Its handler mints the
       * `nina_messages` + `nina_message_images` pair `finishSelfie` writes; nothing about this row
       * has to change to hold a button.
       */}
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-rule pb-3">
        <nav aria-label="Collection" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
            <li className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="text-ink-3">
                &#128193;
              </span>
              <span className="truncate font-semibold text-ink" aria-current="page">
                {CHAT_PHOTO_COLLECTION_LABEL}
              </span>
            </li>
          </ol>
        </nav>
        <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
          {page.total} photo{page.total === 1 ? '' : 's'}
        </span>
      </div>

      {/* SEAM — PHASE 3. The notice line. Never rendered in phase 2 (`notice` is always null), so
          it costs nothing and moves nothing until phase 3's Remove writes it. */}
      {notice !== null && <p className="mb-4 text-[12px] font-medium text-ink-2">{notice}</p>}

      <div
        className={cn(
          'grid items-start gap-5',
          selected != null ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'lg:grid-cols-1',
        )}
      >
        {/* `min-w-0` is load-bearing on any track holding a wide grid — `app/admin/layout.tsx:172`
            makes the same note about the layout's own main column. */}
        <div className="min-w-0">
          {photos.length === 0 ? (
            <EmptyState
              title={page.page > 1 ? 'Nothing on this page' : 'She has not sent a photo yet'}
              description={
                page.page > 1
                  ? 'The collection is not that long any more.'
                  : 'Every photo Nina generates in the chat lands here automatically.'
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
          ) : (
            <>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {photos.map((photo) => {
                  const isSelected = photo.id === selectedId
                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : photo.id)}
                        aria-pressed={isSelected}
                        title={photo.pathname}
                        className={cn(
                          'block w-full rounded-chip border p-1 text-left transition-[opacity,transform] active:scale-[0.985]',
                          isSelected
                            ? 'border-accent bg-accent-soft'
                            : 'border-rule bg-card hover:bg-paper-2',
                        )}
                      >
                        <span className="relative block aspect-[3/4] overflow-hidden rounded-[6px] bg-paper-2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted,
                              deliberately un-transformed, and this table has no thumbnail column;
                              see the header. */}
                          <img
                            src={photo.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className="size-full object-cover"
                          />
                        </span>
                        <span className="mt-1 block truncate text-[10px] font-medium text-ink-3 tabular-nums">
                          {photo.createdAt.slice(0, 10)}
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
            </>
          )}
        </div>

        {selected != null && (
          <ChatPhotoDetail
            photo={selected}
            userId={userId}
            onClose={() => setSelectedId(null)}
            onRemoved={(note) => {
              setSelectedId(null)
              setNotice(note)
            }}
          />
        )}
      </div>
    </div>
  )
}
