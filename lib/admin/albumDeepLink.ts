/**
 * The album's one deep link: "open `/admin/nina` with THIS photograph selected".
 *
 * ── WHY A MODULE FOR TWO EXPORTS ────────────────────────────────────────────────────────────
 * Because the writer and the reader of a URL parameter sit on opposite sides of the client
 * boundary, and a parameter spelled in two places is a parameter that will one day be spelled two
 * ways. `components/admin/explorer/SearchResultsGrid.tsx` (a `'use client'` module) MINTS the
 * link; `app/admin/nina/page.tsx` (a Server Component) READS it and resolves the id into a folder
 * and a page. That is exactly the split `NINA_MEDIA_VIEW_PARAM` / `readExplorerView` already keeps
 * in `lib/admin/filetree/mediaView.ts`, kept the same way.
 *
 * ── WHY NOT IN `lib/admin/filetree` ─────────────────────────────────────────────────────────
 * That barrel's runtime surface is FROZEN by `tests/admin.filetreeBarrel.test.ts` at the 35 names
 * the pre-split single file had — no fewer, and explicitly no more, because a barrel that lazily
 * grows would undo the 2026-09-11 dead-export audit through the back door. So the deep link gets
 * its own module rather than a 36th name there.
 *
 * ── ZERO IMPORTS, WHICH IS THE RULE THIS FILE INHERITS ──────────────────────────────────────
 * `lib/admin/filetree/`'s purity rule, restated for one file: a client component and a Server
 * Component both import this, so it may not reach anything server-only. The id's SHAPE check is
 * deliberately NOT here — `ADMIN_AVATAR_ID_RE` (`lib/admin/avatars.ts`) is applied by the page,
 * beside the `?folder=` and `?page=` validation that already lives there, so this module stays a
 * grammar and never becomes a validator.
 */

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
