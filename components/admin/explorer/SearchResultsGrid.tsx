'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/ui'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { hrefForAvatar } from '@/lib/admin/albumDeepLink'
import { NINA_FOLDER_ROOT_LABEL } from '@/lib/admin/filetree'

import type { AdminSearchHit } from '@/lib/admin/ninaAlbumActions'

/**
 * The ranked answer to a search — R1's *"we output similar images"*, drawn as one sheet.
 *
 * ── THE SAME BORDERLESS RECIPE, THREE DELIBERATE DIFFERENCES ────────────────────────────────
 * `PhotoGrid.tsx:115-178` is the idiom and this mirrors it exactly: `gap-[3px]`, one
 * `overflow-hidden rounded-field` on the `<ul>` and nowhere else, `aspect-square` tiles on a
 * `bg-ink-3/20` bed, no per-tile border or radius or padding, the `Hers` pill in the top-left
 * corner, `focus-visible:ring-inset` (a ring outside the clip is a ring nobody sees), a plain
 * `<img>` on `thumbUrl ?? url` with `loading="lazy"`. `tests/admin.photoSearch.test.ts` pins the
 * mirror the way `tests/admin.photoGrid.test.ts` pins the original, and neither suite may edit the
 * other's file.
 *
 * What is NOT mirrored, and why:
 *
 *   1. **No pager.** A ranked list has no page 2 — rank 121 is not "older", it is "worse", and a
 *      Newer/Older row would invite the operator to walk into noise. The list IS the top N, capped
 *      by the Server Action.
 *   2. **No selection, and no `SelectionPane`.** A tile click opens the full-screen overlay
 *      instead — the mid-turn addendum, verbatim: *"if admin click one of the result, it will pop
 *      up the full screen image view"*. The plan's Scope keeps the pane's verbs (make current,
 *      delete, move, share) out of the result set on purpose; browsing is where a photograph gets
 *      operated on, and Clear is one button away. There is also no `data-photo-id` here — that
 *      attribute is `FileExplorer`'s pane-close focus hook (`FileExplorer.tsx:189-198`) and this
 *      grid opens no pane.
 *   3. **The folder is in the accessible name.** *"i am struggling to see the image i want"* is a
 *      complaint about not knowing where a photograph is filed, and the search answers it — so the
 *      tile says `<filename> in 2026/bali`, and the root says `Album` (`NINA_FOLDER_ROOT_LABEL`,
 *      the same string the breadcrumb and the tree print). It stays out of the VISIBLE tile for
 *      `PhotoGrid`'s own reason: a text label under every tile is what broke the sheet.
 *
 * ── THE OVERLAY IS SCOPED TO THE RESULTS, AND THAT IS WHY IT LIVES IN THIS FILE ─────────────
 * `components/ui/PhotoViewer` is the app's one full-screen overlay and this is its second caller
 * under `components/admin/` (`ErrorLogList.tsx:167-175` is the first, and this file follows its
 * shape). Holding `viewerIndex` HERE means the index a tile hands over and the list the overlay
 * pages through are derived from one array — so a swipe or an arrow key moves between search
 * results and can never wander into the folder the operator happened to be browsing.
 */
export function SearchResultsGrid({ hits }: { hits: readonly AdminSearchHit[] }) {
  /** An index into `hits`, or `null` for "no overlay". `ErrorLogList.tsx:45`'s shape. */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  /**
   * The overlay's list, 1:1 with the sheet so the indices agree by construction. `kind` is the
   * row's `source` and `label` is its filename — without the label the header would read the
   * literal word `avatar` (`PhotoViewer.tsx:50-58`).
   *
   * `meta` carries the hit's row id and similarity score into the header — the ONE place a score
   * is allowed on this screen. `PhotoSearchBar`'s header rules a cosine number out of the tiles,
   * where it would decorate a ranking the operator cannot act on; in the open viewer they CAN act
   * on it, because citing "id X scored 0.302" is exactly how a result gets argued about in a
   * tuning session (`scripts/album-search-probe.mjs` reads the same column back). Three decimals:
   * the threshold band the probe measured is 0.18–0.25, which two decimals cannot resolve.
   */
  const photos = useMemo<ViewerPhoto[]>(
    () =>
      hits.map((hit) => ({
        /* The row id as a FIELD, beside the printed `meta` line below that also carries it. The
         * header control builds a link out of this one; parsing the id back out of `#id · score`
         * would make a display format load-bearing (`PhotoViewer.tsx`'s `id` note). */
        id: hit.id,
        url: hit.url,
        kind: hit.source,
        label: hit.filename,
        meta: `#${hit.id} · ${hit.score.toFixed(3)}`,
      })),
    [hits],
  )

  if (hits.length === 0) {
    return (
      <EmptyState
        title="Nothing matched"
        description="Try fewer words, a different photo, or both together. A photo can only be matched once it has been described."
      />
    )
  }

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-[3px] overflow-hidden rounded-field">
        {hits.map((hit, index) => {
          const where = hit.folder === '' ? NINA_FOLDER_ROOT_LABEL : hit.folder
          return (
            <li key={hit.id} className="relative aspect-square bg-ink-3/20">
              <button
                type="button"
                onClick={() => setViewerIndex(index)}
                aria-label={
                  hit.isCurrent
                    ? `${hit.filename} in ${where} — her current profile picture`
                    : `${hit.filename} in ${where}`
                }
                title={`${hit.filename} · ${where} · #${hit.id}`}
                className="block size-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and
                 * deliberately un-transformed; `PhotoGrid.tsx:56-60`'s standing ruling. */}
                <img
                  src={hit.thumbUrl ?? hit.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="size-full object-cover"
                />
                {hit.isCurrent && (
                  <span className="absolute top-1 left-1 rounded-pill bg-ink px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] text-card uppercase">
                    Hers
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {/* `photos[viewerIndex] != null` and not just a non-null index: `PhotoViewer` opens with
          `photos[index]!` (`PhotoViewer.tsx:96`), so a list that shrank under an open overlay
          would call `nameOf(undefined)`. `ErrorLogList.tsx:167`'s guard, for the same reason.
          `subject="foto"` for the reason that file and `NinaAboutScreen` both give: "avatar
          screenshot" is not a thing. */}
      {viewerIndex !== null && photos[viewerIndex] != null && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          subject="foto"
          /*
           * R1. The way out of *"saya liat search result irrelevant, saya bisa langsung ke
           * deskripsinya"*: a link, in the header, to the panel where this photograph's
           * description is read and edited.
           *
           * A `<Link>` and not a `router.push` button, which is the split `FileExplorer` already
           * keeps: a folder OPERATION needs a navigator because it learns where to go only once
           * the server answers, and this one knows its destination up front. So the operator also
           * gets middle-click and open-in-new-tab — which on this screen is worth having, because
           * a new tab keeps the ranked result set alive in this one while the description gets
           * fixed in the other.
           *
           * `photo.id == null` is unreachable from this file (every hit has one) and is still
           * checked, because `ViewerPhoto.id` is optional for the review surfaces and a `!` here
           * would be an assertion about a shared type this file does not own.
           *
           * The overlay is closed on the way out for IMMEDIATE feedback. It is not the guarantee:
           * the landing clears the search (`FileExplorer`'s deep-link effect), which unmounts this
           * whole component and the overlay with it. Both, so the lightbox is never left hanging
           * over the page the link just opened during the navigation.
           */
          headerAction={(photo) =>
            photo.id == null ? null : (
              <Link
                href={hrefForAvatar(photo.id)}
                onClick={() => setViewerIndex(null)}
                aria-label="Open this photo's description"
                title="Open this photo's description"
                className="grid size-11 place-items-center rounded-pill text-card"
              >
                <FileTextIcon className="size-5" />
              </Link>
            )
          }
        />
      )}
    </>
  )
}

/*
 * The header control's glyph, inlined rather than imported — `FileExplorer.tsx:640-649`'s standing
 * ruling for this screen's icons, which `PhotoSearchBar.tsx` and `ErrorLogList.tsx` both follow:
 * **Lucide** (lucide-static, ISC), `file-text`, copied verbatim with Lucide's `class`/`width`/
 * `height` dropped and `stroke-width` normalised to `strokeWidth` on the root `svg`, where the
 * `stroke*` presentation attributes inherit to every child. `aria-hidden`, because the accessible
 * name is the link's `aria-label` and never the picture.
 *
 * A document with lines on it, and not a pencil: the destination is the panel where the
 * description is READ as well as edited, and the operator goes there to look before they type.
 */
function FileTextIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}
