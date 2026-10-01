/**
 * `/admin/nina`'s deep links: "open the explorer with THIS photograph selected".
 *
 * ── WHY A MODULE FOR THESE FIVE NAMES ───────────────────────────────────────────────────────
 * Because the writer and the reader of a URL parameter sit on opposite sides of the client
 * boundary, and a parameter spelled in two places is a parameter that will one day be spelled two
 * ways. `components/admin/explorer/SearchResultsGrid.tsx` (a `'use client'` module) and the
 * viewer's copy-admin-link control MINT these links; `app/admin/nina/page.tsx` (a Server
 * Component) READS them and resolves an id into the page it is on. That is exactly the split
 * `NINA_MEDIA_VIEW_PARAM` / `readExplorerView` already keeps in `lib/admin/filetree/mediaView.ts`,
 * kept the same way.
 *
 * ── WHY NOT IN `lib/admin/filetree` ─────────────────────────────────────────────────────────
 * That barrel's runtime surface is FROZEN by `tests/admin.filetreeBarrel.test.ts` at the 35 names
 * the pre-split single file had — no fewer, and explicitly no more, because a barrel that lazily
 * grows would undo the 2026-09-11 dead-export audit through the back door. So the deep link gets
 * its own module rather than a 36th name there — and, since 2026-09-17, so does the media arm's
 * view link, for the same reason and in the same file.
 *
 * ── TWO IMPORTS, AND BOTH ARE THE RULE RATHER THAN EXCEPTIONS TO IT ──────────────────────────
 * This module was written with zero imports, under `lib/admin/filetree/`'s purity rule: a client
 * component and a Server Component both import it, so it may not reach anything server-only. That
 * rule is intact.
 *
 * The first import is the two `?view=media` constants from `lib/admin/filetree` — the import-pure
 * grammar directory, checked as such by `tests/admin.filetreeBarrel.test.ts`'s purity half — and
 * taking them from there is what the rule is FOR: the builders below write the parameter that
 * `readExplorerView` reads, and a grammar that re-spelled the key or the value here would be
 * exactly the drift this header opens by arguing against.
 *
 * The second is `PhotoPointerKind` from `@/lib/photos/pointer`, and it is a TYPE-ONLY import: it
 * is erased at build, so it cannot drag anything into either bundle even in principle. That module
 * is pure by its own header's statement ("No database, no `server-only`, one import" — and that
 * one is `@/lib/id`, which has none), and it is already read by a client component and the server
 * alike. It is imported rather than re-declared because `'shot' | 'avatar' | 'image'` is the
 * repo's existing vocabulary for "which of the three image tables an id addresses", and the
 * minter's whole job is to answer that question with a URL.
 *
 * The id's SHAPE check is deliberately NOT here — `ADMIN_AVATAR_ID_RE` (`lib/admin/avatars.ts`) is
 * applied by the page, beside the `?folder=` and `?page=` validation that already lives there, so
 * this module stays a grammar and never becomes a validator.
 */

import { NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE } from '@/lib/admin/filetree'
import type { PhotoPointerKind } from '@/lib/photos/pointer'

/**
 * `?avatar=<id>` — "load whichever folder and page this photograph is on, and select it".
 *
 * A parameter of its own rather than a third spelling of `?folder=`/`?page=`: the link is minted
 * from a search result, which knows the row id and nothing at all about where the row is filed.
 * Turning the id into a folder and a page is a database read, and the only place that can run is
 * the server.
 */
export const NINA_AVATAR_PARAM = 'avatar'

/**
 * The link the viewer's header control points at.
 *
 * Deliberately carries NO `folder`/`page`: both are derived from the id server-side, and a stale
 * pair travelling beside the id would be two opinions about where the photograph is — the one that
 * loses is the id, and the operator lands in the wrong folder. The id is a `newId()` nanoid(12)
 * over `A-Za-z0-9_-`, none of which `encodeURIComponent` touches; it is applied anyway, because a
 * function that builds a URL out of an argument and trusts that argument's alphabet is one
 * refactor away from being wrong.
 */
export function hrefForAvatar(id: string): string {
  return `/admin/nina?${NINA_AVATAR_PARAM}=${encodeURIComponent(id)}`
}

/**
 * `/admin/nina?view=media` — the Media collection, page one, with nothing pre-selected.
 *
 * The COLLECTION, deliberately, even though `hrefForMediaPhoto` below can now name a single row.
 * The two are for different questions and both are kept. This one is the answer to "where does
 * this photograph live?" — the destination of the search sheet's header link, where the hit being
 * paged through is the operator's own search result and the honest promise is the collection
 * rather than a row (`components/admin/explorer/SearchResultsGrid.tsx`, whose accessible name
 * says "Open Media, where this photo lives" for exactly this reason). `hrefForMediaPhoto` is the
 * answer to "open THIS one, selected", which is a different promise and a different caller.
 *
 * When this was written there was no `locateNinaMediaPhoto`, so the collection was the only
 * destination that could be honoured at all; that is no longer the reason it exists, and the
 * reason above is. Returning the row link from here instead would silently re-point the search
 * sheet at a selection the operator did not ask for.
 *
 * No `?page=`, for `FileExplorer`'s `hrefForMediaView(1)`'s reason: page 1 is the ABSENCE of the
 * parameter, so the canonical `/admin/nina?view=media` and a navigated-back-to first page are one
 * URL rather than two that mean the same thing.
 */
export function hrefForMediaView(): string {
  const params = new URLSearchParams()
  params.set(NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE)
  return `/admin/nina?${params.toString()}`
}

/**
 * `?image=<id>` — "open the Media collection on whichever page this photograph is on, and select
 * it". `NINA_AVATAR_PARAM`'s twin, one collection over.
 *
 * ── WHY `'image'` AND NOT `'media'`, `'photo'` OR `'id'` ─────────────────────────────────────
 * Because `'image'` is already this repo's word for `nina_message_images` when an id has to say
 * which table it addresses: `PhotoPointerKind` (`lib/photos/pointer.ts`) is `'shot' | 'avatar' |
 * 'image'`, and `lib/nina/attach.ts`'s `?photo=<kind>:<id>` grammar spells the same two Nina
 * tables the same two ways. So `/admin/nina?avatar=<id>` and `/admin/nina?view=media&image=<id>`
 * read as the union does, and the minter below needs no translation table between the kind it is
 * handed and the key it writes.
 *
 * It collides with nothing `/admin/nina` already reads — `view`, `folder`, `page` and `avatar` are
 * the four, and a fifth key is the only way to add a parameter that cannot be mistaken for one of
 * them. `'media'` was rejected because `?view=media&media=<id>` reads as a repetition of the view
 * rather than as a row; `'photo'` because `/nina/about` already means something else by it
 * (`?photo=<section>.<id>`), and two routes using one word for two grammars is the drift this
 * module's header opens by arguing against.
 *
 * The constant is named for the COLLECTION it addresses rather than for its own value, matching
 * the name `components/admin/.workflows/package_readme.md` reserved for it when it described this
 * exact twin as "the precise one, if it is ever wanted".
 */
export const NINA_MEDIA_PHOTO_PARAM = 'image'

/**
 * `/admin/nina?view=media&image=<id>` — the Media collection, open on this photograph, selected.
 *
 * ── THE VIEW IS NOT OPTIONAL ────────────────────────────────────────────────────────────────
 * It is the FIRST thing `app/admin/nina/page.tsx` reads, and it decides which table the page reads
 * at all — that file's own comment says so. A link carrying `?image=<id>` without `?view=media`
 * would land on the album arm, which holds no `nina_message_images` row to select, and the
 * parameter would be dropped in silence. So the pair travels with the id, spelled through
 * `NINA_MEDIA_VIEW_PARAM` / `NINA_MEDIA_VIEW_VALUE` and never re-typed here, which is the whole
 * reason this module imports them.
 *
 * ── AND NO `?page=` ─────────────────────────────────────────────────────────────────────────
 * `hrefForAvatar`'s argument, unchanged: the page is DERIVED from the id on the server, and a page
 * number travelling beside the id would be a second opinion about where the row is — the one that
 * loses is the id, and the operator lands on the wrong page with nothing selected. The Media
 * collection makes that worse than the album does, because `listNinaMediaPhotos` orders by
 * `coalesce(last_replaced_at, created_at) DESC`: a REPLACED photograph is exactly the row whose
 * page moves, and replacing one is exactly what this link is minted for.
 *
 * `URLSearchParams` rather than a template string, for `hrefForMediaView`'s reason and one more:
 * it escapes the id. `newId()` is nanoid(12) over `A-Za-z0-9_-` and needs no escaping today, but a
 * builder that trusts its argument's alphabet is one refactor away from being wrong.
 */
export function hrefForMediaPhoto(id: string): string {
  const params = new URLSearchParams()
  params.set(NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE)
  params.set(NINA_MEDIA_PHOTO_PARAM, id)
  return `/admin/nina?${params.toString()}`
}

/**
 * **THE ONE PLACE A PHOTOGRAPH BECOMES AN ABSOLUTE ADMIN LINK.** A pointer kind, a row id and an
 * origin in; `https://runins.site/admin/nina?…` out, or `null` when that kind has no destination.
 *
 *     adminPhotoLink('avatar', 'Rm2NGabc1234', 'https://runins.site')
 *       -> 'https://runins.site/admin/nina?avatar=Rm2NGabc1234'
 *     adminPhotoLink('image',  'Rm2NGabc1234', 'https://runins.site')
 *       -> 'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234'
 *     adminPhotoLink('shot',   'Rm2NGabc1234', 'https://runins.site')
 *       -> null
 *
 * ── WHY ABSOLUTE, WHEN EVERY OTHER BUILDER HERE RETURNS A PATH ──────────────────────────────
 * Because this link's whole purpose is to LEAVE the device it was minted on: it is copied to the
 * clipboard, pasted into WhatsApp and opened on a desktop later. A path would paste as text that
 * nothing can open. The origin is an ARGUMENT rather than a call to `shareOrigin()` for the reason
 * `lib/share/origin.ts` is `server-only` and roadmap §4.1 forbids a `NEXT_PUBLIC_`: the origin is
 * resolved on the server and threaded down as a prop, never read from `window.location`, whose
 * per-deployment preview hostname would die at the next push — with the link already sent.
 *
 * ── WHY `'shot'` IS REFUSED AND NOT MAPPED ──────────────────────────────────────────────────
 * `/admin/nina` holds two collections, `nina_avatars` and `nina_message_images`. `run_photos` is in
 * NEITHER, so there is no row for a `'shot'` link to select and no page for it to land on. Folding
 * it into the media arm would mint a URL that resolves to nothing and says nothing — the worst
 * possible failure for a link whose only feedback is a tick in a clipboard. `null` instead, so the
 * caller must decide what an absent link looks like: the run-screenshot surfaces render no control
 * at all, which is what makes "Nina photographs only" structural rather than a convention somebody
 * remembers.
 *
 * The `switch` is exhaustive over `PhotoPointerKind` with a declared `string | null` return, so a
 * fourth kind added to that union fails `tsc` here rather than falling through to a silent
 * `undefined`. That is the point of importing the union instead of taking a `string`.
 *
 * ── THE TRAILING SLASH ──────────────────────────────────────────────────────────────────────
 * `shareOrigin()` strips one today (`lib/share/origin.ts:27`, `:33`), and this function does not
 * depend on that: `'https://runins.site/' + '/admin/nina?…'` is a double slash, which some proxies
 * normalise and some do not, and a link that works from one host and 404s from another is not a
 * failure anybody debugs from a WhatsApp message. Stripped here as well, so the join is correct
 * whatever the caller hands over.
 *
 * An EMPTY origin is deliberately not a second refusal: `null` means exactly one thing here — "this
 * kind has no admin destination" — and a caller that conflated it with "no origin configured" would
 * have two reasons and no way to tell them apart. A non-empty origin is the caller's contract, and
 * phase 4 meets it by threading `shareOrigin()` or nothing at all.
 */
export function adminPhotoLink(kind: PhotoPointerKind, id: string, origin: string): string | null {
  const base = origin.replace(/\/+$/, '')
  switch (kind) {
    case 'avatar':
      return `${base}${hrefForAvatar(id)}`
    case 'image':
      return `${base}${hrefForMediaPhoto(id)}`
    case 'shot':
      return null
  }
}
