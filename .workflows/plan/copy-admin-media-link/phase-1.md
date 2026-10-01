# Phase 1: The admin-link URL grammar

**Plan set:** `COPY_ADMIN_MEDIA_LINK_PLAN.md`
**Analysis:** `20261001-104938-K7P2_code_analyzer.md`
**Satisfies:** R1 (the clipboard carries an absolute admin link to *that* photograph), R2 (the link names `?view=media` + the row, so the page can select it)
**Depends on:** none
**Difficulty:** EASY
**Package:** `lib/admin`

---

## Goal

`lib/admin/albumDeepLink.ts` stops being an album-only grammar. After this phase it also names the
parameter key that addresses one `nina_message_images` row on `/admin/nina?view=media`, builds the
path that carries it, and exposes **one absolute-link minter** keyed on `PhotoPointerKind` that
phase 3's button calls — `'avatar'` routed to the shipped `hrefForAvatar`, `'image'` to the new
media path, and `'shot'` **refused with `null`** because `run_photos` is in neither admin
collection. Nothing imports the new exports yet; phases 2 and 3 do.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**

- `NINA_MEDIA_PHOTO_PARAM = 'image'` — `const`, `lib/admin/albumDeepLink.ts`. **The parameter KEY
  phase 2 must import rather than re-spell.** Value chosen as `'image'` because it is already
  `PhotoPointerKind`'s word for `nina_message_images` (`lib/photos/pointer.ts:35`), which makes the
  two admin links read as the pointer union does — `?avatar=<id>` and `?image=<id>`. It collides
  with none of the four keys `/admin/nina` already knows: `view` (`lib/admin/filetree/mediaView.ts:28`),
  `folder`, `page` (`app/admin/nina/page.tsx:128-129`, `:159`) and `avatar`
  (`NINA_AVATAR_PARAM`, `albumDeepLink.ts:43`). The CONSTANT's name is `NINA_MEDIA_PHOTO_PARAM`
  because `components/admin/.workflows/package_readme.md:272` already pre-named it that when it
  described the precise twin this phase builds.
- `hrefForMediaPhoto(id: string): string` — `lib/admin/albumDeepLink.ts`. Returns
  `'/admin/nina?view=media&image=<id>'`. Carries the view pair spelled through
  `NINA_MEDIA_VIEW_PARAM` / `NINA_MEDIA_VIEW_VALUE`, never re-typed. Carries **no** `?page=` and no
  `?folder=`.
- `adminPhotoLink(kind: PhotoPointerKind, id: string, origin: string): string | null` —
  `lib/admin/albumDeepLink.ts`. **The one minter, and the exact signature phase 3 builds against.**
  Returns `'<origin without trailing slash>' + hrefForAvatar(id)` for `'avatar'`,
  `… + hrefForMediaPhoto(id)` for `'image'`, and **`null` for `'shot'`**. Positional, in that order.

**Signature changes:** none. `hrefForAvatar(id)` and `hrefForMediaView()` keep their exact
signatures **and their exact return strings** — `components/admin/explorer/SearchResultsGrid.tsx:195`
calls both and `tests/admin.photoSearch.test.ts:160` pins the literal `hrefForAvatar(photo.id)`.

**New import added to this module:** `import type { PhotoPointerKind } from '@/lib/photos/pointer'`
— a **type-only** import, so it erases entirely at build and the module's purity rule is
strengthened rather than bent. (`lib/photos/pointer.ts` imports only `@/lib/id`, which is
zero-import.) No `server-only`, no database, no `NEXT_PUBLIC_`.

**Requires (from earlier phases):** nothing. This phase is the root of the set.

**Leaves alone (owned by others):**

- `lib/nina/queries/images.ts`, `lib/nina/queries.ts`, `app/admin/nina/page.tsx`,
  `components/admin/FileExplorer.tsx` (Phase 2)
- `components/ui/PhotoViewer.tsx`, `components/ui/CopyAdminLinkButton.tsx` (Phase 3)
- `components/nina/*`, `components/photo/*`, `app/nina/*`, `app/photo/*`,
  `lib/nina/chatphotos.ts`, and the `server-only` admin-origin resolver (Phase 4)
- `components/admin/explorer/SearchResultsGrid.tsx` — a caller, unchanged here.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/albumDeepLink.ts` | modify | header rewritten (`:1-31`), `hrefForMediaView`'s docblock rewritten (`:59-71`), one type-only import added (`:33`), three exports appended after `:76` |
| `lib/admin/albumDeepLink.test.ts` | modify | three new `describe` blocks appended after `:29`; the existing four cases stay byte-identical |

Both are co-located under `lib/`, which is this repo's convention for a pure grammar module and
its suite — `vitest.config.ts:41` includes `lib/**/*.test.ts`, and `lib/admin/albumDeepLink.test.ts`
is the suite that already owns this module. No file under `tests/` is touched.

## Implementation Steps

### Step 1: Rewrite the module header and the `hrefForMediaView` docblock, add the type import

**File:** `lib/admin/albumDeepLink.ts:1-76` — the whole file is rewritten below, so the edit is a
replacement rather than three surgical patches. Steps 2 and 3 append to it.

**Change:** Three prose edits and one import.

1. `:4` — "WHY A MODULE FOR TWO EXPORTS" is now false (five exports). Retitle, and name the second
   minting site so the split the paragraph argues for is still describable.
2. `:19-26` — "ONE IMPORT, AND IT IS THE RULE RATHER THAN AN EXCEPTION TO IT" becomes two imports.
   The purity rule is unchanged and the new import *strengthens* it: `PhotoPointerKind` is a type,
   erased at build.
3. `:62-66` — **the paragraph plan invariant 11 names.** It currently reads *"An album hit can be
   deep-linked to the row because `locateNinaAvatar` turns an id into a folder and an offset; there
   is no such read for `nina_message_images`, and adding one is a query-layer change rather than a
   URL grammar. So this names the COLLECTION…"*. Phase 2 adds exactly that read, so the sentence
   must stop asserting it does not exist. `hrefForMediaView()` itself does **not** change: it stays
   the collection-level link, and the docblock now says *why it is kept* beside its precise twin
   rather than *why the twin is impossible*.

**Code** — the file from line 1 through the end of `hrefForMediaView`, complete:

```ts
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
```

**Impact:** No behaviour change at all. `hrefForAvatar` and `hrefForMediaView` are byte-identical in
body; only prose moved. `tests/admin.photoSearch.test.ts` and
`components/admin/explorer/SearchResultsGrid.tsx` are untouched and stay green. Plan invariant 11 is
satisfied for this module — `components/admin/FileExplorer.tsx:240`'s comment is **Phase 2's** half
of the same invariant and is explicitly not touched here.

---

### Step 2: The media photograph's parameter key and path builder

**File:** `lib/admin/albumDeepLink.ts` — appended immediately after `hrefForMediaView` (end of file,
after the Step 1 content above).

**Change:** The `?image=` key, and the path that carries it beside `?view=media`.

**Code:**

```ts
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
```

**Impact:** Two new exports, no importers yet. `URLSearchParams` preserves insertion order, so the
view pair is always written before the id — cosmetic for parsing, load-bearing for a human reading
a pasted link and deciding whether it is a media link at a glance.

---

### Step 3: The one absolute-link minter

**File:** `lib/admin/albumDeepLink.ts` — appended after `hrefForMediaPhoto` (end of file).

**Change:** The function phase 3's button calls. One kind in, one absolute URL or `null` out.

**Code:**

```ts
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
```

**Impact:** One new export, no importers yet. Phase 3's `CopyAdminLinkButton` calls exactly this
signature; phase 4 supplies the `origin` argument from the nullable admin-origin prop. Nothing in
this phase reads `shareOrigin()` — this module stays importable from a `'use client'` file.

---

### Step 4: Extend the suite

**File:** `lib/admin/albumDeepLink.test.ts:29` — appended after the existing
`describe('the album deep link', …)` block, which is left byte-identical.

**Change:** Three `describe` blocks: the media key, the media path, and the minter over all three
kinds — including the refusal and the argument order.

**Code** — appended to the end of the file:

```ts
/**
 * The media photograph's deep link, pinned from both ends the way the album's is. The page that
 * reads this parameter is phase 2's edit and cannot be asserted against this builder without a
 * running app, so the grammar itself is what keeps the pair honest.
 */
describe('the media photograph deep link', () => {
  it('names a parameter that collides with none of the four the page already reads', () => {
    expect(NINA_MEDIA_PHOTO_PARAM).toBe('image')
    const taken = [NINA_MEDIA_VIEW_PARAM, 'folder', 'page', NINA_AVATAR_PARAM]
    expect(taken).not.toContain(NINA_MEDIA_PHOTO_PARAM)
  })

  it('carries the view, because the view decides which table the page reads at all', () => {
    const href = hrefForMediaPhoto('Rm2NGabc1234')
    expect(href).toBe('/admin/nina?view=media&image=Rm2NGabc1234')
    expect(new URL(href, 'https://x.test').searchParams.get(NINA_MEDIA_VIEW_PARAM)).toBe(
      NINA_MEDIA_VIEW_VALUE,
    )
  })

  it('carries no page and no folder — the server derives the page from the id', () => {
    const href = hrefForMediaPhoto('Rm2NGabc1234')
    expect(href).not.toContain('page=')
    expect(href).not.toContain('folder=')
  })

  it('escapes an id outside the alphabet we mint rather than trusting it', () => {
    const href = hrefForMediaPhoto('a b&c')
    expect(href).not.toContain('a b&c')
    expect(new URL(href, 'https://x.test').searchParams.get(NINA_MEDIA_PHOTO_PARAM)).toBe('a b&c')
  })

  it('leaves the collection-level link alone — it answers a different question', () => {
    expect(hrefForMediaView()).toBe('/admin/nina?view=media')
  })
})

/**
 * The minter, which is the interface the viewer's copy control is built against: a pointer kind, a
 * row id and a server-resolved origin in, one absolute URL out — or `null` for the kind that has no
 * admin destination.
 */
describe('the absolute admin link', () => {
  const ORIGIN = 'https://runins.site'

  it('routes an album photograph through the shipped ?avatar= grammar', () => {
    expect(adminPhotoLink('avatar', 'Rm2NGabc1234', ORIGIN)).toBe(
      'https://runins.site/admin/nina?avatar=Rm2NGabc1234',
    )
  })

  it('routes a conversation photograph through the media grammar, view and all', () => {
    expect(adminPhotoLink('image', 'Rm2NGabc1234', ORIGIN)).toBe(
      'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234',
    )
  })

  it('REFUSES a run screenshot rather than minting a link that resolves to nothing', () => {
    expect(adminPhotoLink('shot', 'Rm2NGabc1234', ORIGIN)).toBeNull()
  })

  it('agrees with the path builders, so the two can never drift apart', () => {
    expect(adminPhotoLink('avatar', 'Rm2NGabc1234', ORIGIN)).toBe(
      `${ORIGIN}${hrefForAvatar('Rm2NGabc1234')}`,
    )
    expect(adminPhotoLink('image', 'Rm2NGabc1234', ORIGIN)).toBe(
      `${ORIGIN}${hrefForMediaPhoto('Rm2NGabc1234')}`,
    )
  })

  it('is absolute, so it survives being pasted into another app on another device', () => {
    for (const kind of ['avatar', 'image'] as const) {
      const link = adminPhotoLink(kind, 'Rm2NGabc1234', ORIGIN)
      if (link === null) throw new Error(`expected a link for ${kind}`)
      const parsed = new URL(link)
      expect(parsed.origin).toBe(ORIGIN)
      expect(parsed.pathname).toBe('/admin/nina')
    }
  })

  it('joins a trailing-slashed origin without doubling the slash', () => {
    expect(adminPhotoLink('image', 'Rm2NGabc1234', 'https://runins.site/')).toBe(
      'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234',
    )
    expect(adminPhotoLink('avatar', 'Rm2NGabc1234', 'https://runins.site///')).toBe(
      'https://runins.site/admin/nina?avatar=Rm2NGabc1234',
    )
  })

  it('takes (kind, id, origin) in that order — a transposition is a broken link', () => {
    const link = adminPhotoLink('image', 'Rm2NGabc1234', ORIGIN)
    if (link === null) throw new Error('expected a link')
    // The origin is the PREFIX and the id is the VALUE. Swapping the two string arguments still
    // typechecks, so the only thing that can catch it is an assertion about which is where.
    expect(link.startsWith(`${ORIGIN}/`)).toBe(true)
    expect(new URL(link).searchParams.get(NINA_MEDIA_PHOTO_PARAM)).toBe('Rm2NGabc1234')
  })

  it('covers every kind in the union, so a fourth one cannot be forgotten', () => {
    const answered = PHOTO_POINTER_KINDS.map((kind) => adminPhotoLink(kind, 'Rm2NGabc1234', ORIGIN))
    expect(answered.filter((link) => link === null)).toHaveLength(1)
    expect(answered.filter((link) => link !== null)).toHaveLength(2)
  })
})
```

And the file's import block at `:1-3` becomes:

```ts
import { describe, expect, it } from 'vitest'

import { NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE } from '@/lib/admin/filetree'
import { PHOTO_POINTER_KINDS } from '@/lib/photos/pointer'

import {
  adminPhotoLink,
  hrefForAvatar,
  hrefForMediaPhoto,
  hrefForMediaView,
  NINA_AVATAR_PARAM,
  NINA_MEDIA_PHOTO_PARAM,
} from './albumDeepLink'
```

**Impact:** The existing four album cases are untouched and still pass. `PHOTO_POINTER_KINDS`
(`lib/photos/pointer.ts:38`) is the union as a value and already exists for exactly this — it is
imported rather than re-listed so the last case is a real exhaustiveness check and not a copy of
the union that would rot beside it.

---

## Verification

**Build:** `npm run typecheck` (in `/home/miftah/.worktrees/run-insights/copy-admin-media-link`)
**Tests:** `npx vitest run lib/admin/albumDeepLink.test.ts`, then the full `npm test`
**Also:** `npm run lint` and `npm run format:check` — prettier is `printWidth: 100`, `semi: false`,
`singleQuote: true`, `trailingComma: "all"`; every code line above is inside 100 columns, but run
`npm run format` if the implementer reflows a comment.

Guards worth a spot-check even though nothing here should move them, because they are source scans
rather than conventions: `npm run ci:client-secret-guard` (no `NEXT_PUBLIC_` is introduced) and
`npm run ci:data-layer-guard` (no `db`/Drizzle import is introduced).

**Manual check:** none — nothing renders in this phase. Read the finished
`lib/admin/albumDeepLink.ts` once end to end and confirm the `hrefForMediaView` docblock no longer
contains the sentence *"there is no such read for `nina_message_images`"*; that is plan invariant
11's half for this module, and it is prose, so no test catches it:

```
grep -c "there is no such read" lib/admin/albumDeepLink.ts   # expect 0
```

**Exit criteria:**

- `NINA_MEDIA_PHOTO_PARAM`, `hrefForMediaPhoto` and `adminPhotoLink` are exported from
  `lib/admin/albumDeepLink.ts`, and nothing in the repo imports them yet (expected — phases 2–4 do).
- `adminPhotoLink('shot', …)` returns `null`; `'avatar'` and `'image'` return absolute
  `https://…/admin/nina?…` strings that agree with the two path builders.
- `hrefForMediaView()` still returns exactly `'/admin/nina?view=media'`, and
  `components/admin/explorer/SearchResultsGrid.tsx` is unmodified.
- `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check` all green.

## Handoffs

- **Phase 2 (R2)** must import `NINA_MEDIA_PHOTO_PARAM` from `@/lib/admin/albumDeepLink` for the
  media arm's `params[...]` read — the constant, never the literal `'image'` — exactly as
  `app/admin/nina/page.tsx:9` already imports `NINA_AVATAR_PARAM`. `hrefForMediaPhoto` is also what
  `components/admin/FileExplorer.tsx`'s landing effect could `history.replaceState` to when
  `view === 'media'`. **Phase 2 has since made that call and chose the other option:** it spends the
  parameter through that file's own module-private `hrefForMediaView(page)` (`FileExplorer.tsx:688`),
  dropping the id so the canonical URL is `?view=media[&page=N]` — the album arm's `hrefForFolder`
  behaviour, one collection over. `hrefForMediaPhoto` therefore has exactly one caller in this set,
  phase 1's own `adminPhotoLink`, and nothing in `components/admin` imports it. The id shape check on
  the incoming parameter belongs to phase 2 as well — this module is a grammar and deliberately never
  a validator (its header says so, and that sentence is preserved verbatim above); phase 2 uses
  `isValidId` (`lib/id.ts`) there rather than `ADMIN_AVATAR_ID_RE`, and argues why in its Step 4b.
- **Phase 3 (R1)** calls `adminPhotoLink(kind, id, origin)` and must handle the `null`: an absent
  link renders no control. The signature above is the contract.
- **Phase 4 (R1, R3, R4)** supplies `origin` from its `server-only` admin-origin resolver. This
  phase deliberately does **not** call `shareOrigin()`, because doing so would put a `server-only`
  import into a module a `'use client'` file imports.
- **`npm run knip` is not in CI** (CLAUDE.md's CI order is the seven guards, `format:check`, `lint`,
  `typecheck`, `test`, `build`) and is not part of this phase's gate. If someone runs it between
  this phase and phase 3 it will report three unused exports; that is the expected intermediate
  state of the set, not a defect, and it clears when phases 2 and 3 land.
- **Documentation drift, deliberately left:** `components/admin/.workflows/package_readme.md:265-273`
  still describes `hrefForMediaView()` as the destination chosen because `locateNinaMediaPhoto`
  "does not exist", and `:1084-1091` still lists this module's surface as two names. Updating a
  package readme is the `readme-updater` subagent's job at the end of the set, not a drive-by edit
  inside a phase that owns two files — and the paragraph only becomes fully false once phase 2
  lands the query. Flagged here so the set's completion handler does not miss it.

## Rollback

`git revert` the phase's single commit, or `git checkout HEAD~1 -- lib/admin/albumDeepLink.ts
lib/admin/albumDeepLink.test.ts`. The phase is purely additive source plus prose: no schema change,
no migration, no database write, no blob write, no env change. Because nothing imports the three new
exports until phases 2 and 3 land, reverting this phase alone leaves a green tree — but it will
break phases 2 and 3 if they have already landed, so revert them first or together.
