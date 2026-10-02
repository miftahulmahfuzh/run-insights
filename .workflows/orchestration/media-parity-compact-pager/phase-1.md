# Phase 1: Media page size binds to the read's ceiling

**Plan set:** `MEDIA_PARITY_COMPACT_PAGER_PLAN.md`
**Analysis:** `20261002-141559-M3K8_code_analyzer.md`
**Satisfies:** R1 — `/nina/about`'s Media tab must show exactly the same photographs as `/admin/nina?view=media`
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (+ `app/nina/about`, `components/nina`, `tests/`)

---

## Goal

`/nina/about`'s Media tab asks `listNinaMediaPhotos` for 99 rows, is silently handed 48 (the read
clamps to `NINA_CHAT_PHOTO_PAGE_SIZE`), and then strides its offset by 99 — so rows 48…98 of every
window are fetched by no page, and `ceil(total / 99)` does not even draw a page number that would
reach them. Measured on production 2026-10-02: 596 Media rows, 13 pages on `/admin/nina?view=media`
and 7 on `/nina/about`, **260 photographs unreachable**.

After this phase the Media stride is a constant *defined as* the ceiling the read enforces
(`NINA_ABOUT_MEDIA_PAGE_SIZE = NINA_CHAT_PHOTO_PAGE_SIZE`), so limit and stride cannot disagree by
construction; the Media cookie's name carries that size so the stale `nina-about-mpage-99` cookie is
orphaned rather than reinterpreted; and two new tests — one on the constants, one on the SQL the
fake driver actually receives — pin invariant 4 so the mismatch cannot come back as a comment-only
promise. Foto profil is untouched: `listNinaAvatarsPage`'s ceiling already *is* `NINA_ABOUT_PAGE_SIZE`,
so its limit and stride already agree.

## Interface Contract

**Deletes:** nothing.

**Renames:** the *value* of `NINA_ABOUT_MEDIA_PAGE_COOKIE` (`lib/nina/album.ts:454`):
`nina-about-mpage-99` -> `nina-about-mpage-48`. The exported **symbol** name is unchanged; only the
cookie string it evaluates to moves. This is a deliberate orphaning of a browser-side cookie, argued
at `lib/nina/album.ts:436-452` (plan invariant 5).

**Creates:**
- `NINA_ABOUT_MEDIA_PAGE_SIZE` (`lib/nina/album.ts`, immediately after `NINA_ABOUT_PAGE_SIZE`) —
  `export const NINA_ABOUT_MEDIA_PAGE_SIZE = NINA_CHAT_PHOTO_PAGE_SIZE` (value 48, by construction,
  never spelled as the literal).
- `tests/nina.aboutMediaPage.test.ts` — the driver-level half of the invariant-4 guard.
- a `describe('the /nina/about page sizes', …)` block in `lib/nina/album.test.ts` — the constant-level
  half.

**Signature changes:** none. `listNinaMediaPhotos(userId, { limit?, offset? })` and
`fetchNinaMediaPage(page)` keep their exact signatures; only the *arguments* the two Media call sites
pass change.

**Value changes (no symbol moves):**
- `app/nina/about/page.tsx:92-95` — the `listNinaMediaPhotos` leg's `limit`/`offset` switch from
  `NINA_ABOUT_PAGE_SIZE` to `NINA_ABOUT_MEDIA_PAGE_SIZE`.
- `lib/nina/aboutPageActions.ts:70-73` — same switch inside `fetchNinaMediaPage`.
- `components/nina/NinaAboutScreen.tsx:310` — `galleryPageCount` divides by
  `NINA_ABOUT_MEDIA_PAGE_SIZE`. `albumPageCount` (`:309`) keeps `NINA_ABOUT_PAGE_SIZE`.

**Requires (from earlier phases):** none. This phase has no `depends_on`.

**Leaves alone (owned by others, or deliberately out of scope):**
- `components/ui/Pagination.tsx`, `components/ui/Pagination.test.tsx`,
  `components/ui/.workflows/package_readme.md`, `docs/architecture.md` — **Phase 2**. This phase
  asserts nothing about cell size, shape, padding or class tokens anywhere, so phase 2's 30.8 px
  circular cell lands under it for free and the two file sets stay disjoint.
- `lib/nina/queries/images.ts` (`listNinaMediaPhotos`, `countNinaMediaPhotos`,
  `mediaCollectionScope`, `isOriginalPhoto`) and `lib/nina/queries/avatars.ts`
  (`listNinaAvatarsPage`) — **read only**. The reads are correct; the defect is in what the caller
  asks for. No query edit, no new query, no second count (plan invariant 3).
- `app/admin/nina/page.tsx` — the reference surface, unchanged.
- The **values** `NINA_ABOUT_PAGE_SIZE = 99` and `NINA_CHAT_PHOTO_PAGE_SIZE = 48`.
- `NINA_ABOUT_PROFILE_PAGE_COOKIE` — the profile page size did not move, so its cookie must not
  either; orphaning it would log every device out of its remembered Foto profil page for nothing.
- `tests/nina.avatarsPage.test.ts` — stays green, unedited.
- No migration, no `drizzle/`, no `lib/db/schema/`, no `db:migrate`. The one database is production.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/album.ts` | modify | `:427-434` `NINA_ABOUT_PAGE_SIZE`'s docstring narrows to Foto profil; new `NINA_ABOUT_MEDIA_PAGE_SIZE` after it; `:436-452` cookie docstring re-argued per-tab; `:454` media cookie name binds to the new constant |
| `app/nina/about/page.tsx` | modify | `:7-23` import; `:32-74` docstring gains the two-page-sizes paragraph; `:92-95` the media leg's `limit`/`offset` |
| `lib/nina/aboutPageActions.ts` | modify | `:5-14` import; `:18-35` header gains the asymmetry note; `:70-73` `fetchNinaMediaPage`'s `limit`/`offset` |
| `components/nina/NinaAboutScreen.tsx` | modify | `:23-36` import; `:94` + `:100` + `:108-109` prop docstrings; `:309-310` `galleryPageCount`; `:989-1011` `NinaAboutPager` header |
| `components/nina/NinaPhotoGrid.tsx` | modify | `:14-18` the one stale docstring paragraph |
| `components/nina/NinaAboutScreen.test.tsx` | modify | `:77-84` import; `:330-344` the Media-tab test's totals move to the media constant |
| `lib/nina/album.test.ts` | modify | `:3-16` import; new `describe` at the tail — the constant-level invariant-4 guard |
| `tests/nina.aboutMediaPage.test.ts` | **create** | the driver-level invariant-4 guard: `fetchNinaMediaPage(N)` binds limit 48 / offset 48·(N−1) |
| `components/nina/.workflows/package_readme.md` | modify | `:394` the one sentence that says both pagers fetch one `NINA_ABOUT_PAGE_SIZE` page |

Nine files. The index's Phase 1 row says "7" — it counted the six impact points plus "a new guard
test" as one. The two extras are `lib/nina/album.test.ts` (the cheap half of the guard the phase
scope asks for *both* halves of) and the one-sentence `components/nina/.workflows/package_readme.md`
correction. Both stay inside this phase's packages; neither touches anything phase 2 owns.

> **Reconciled 2026-10-02.** Every line range and every quoted "before" in the steps below was
> opened against the worktree at `origin/main` @ `9010c11` and matched byte-for-byte, with one
> correction: Step 6's replace range was `330-343` and the test's closing `  })` is line **344**.
> Fixed above and in the step. `lib/nina/album.ts` 427-454, `app/nina/about/page.tsx` 7-23 / 87-97
> (media leg 92-95) and the 55↔57 docstring seam, `lib/nina/aboutPageActions.ts` 5-14 / 34-35 /
> 60-75, `NinaAboutScreen.tsx` 23-36 / 94 / 100 / 108-109 / 309-310 / 989-1011,
> `NinaPhotoGrid.tsx` 14-18, `NinaAboutScreen.test.tsx` 77-84, `lib/nina/album.test.ts` 3-16 and
> tail-at-205, and `components/nina/.workflows/package_readme.md` 394 are all exact. Step 8's
> collaborators check out too: `tests/support/fakeDb.ts` exports `installFakeDb`/`uninstallFakeDb`/
> `FakeDb` with `queries`/`reset()`/`{ sql, params }`, answers an unqueued statement with `[]`, and
> `countNinaMediaPhotos` ends `counted[0]?.total ?? 0` — so the suite's deliberate no-enqueue is
> safe. `renderScreen`'s default `albumTotal` leaves the album pager at one page, so Step 6's new
> `getByText(/Halaman 1 dari 2/)` and `getByRole('navigation')` are unambiguous.

---

## Implementation Steps

### Step 1: `NINA_ABOUT_MEDIA_PAGE_SIZE`, defined as the ceiling — and the cookie that must follow it

**File:** `lib/nina/album.ts:427-454`
**Change:** Narrow `NINA_ABOUT_PAGE_SIZE`'s docstring to the tab it still serves; add
`NINA_ABOUT_MEDIA_PAGE_SIZE` immediately below it, *defined as* `NINA_CHAT_PHOTO_PAGE_SIZE` rather
than respelled as 48; re-argue the cookie docstring per-tab and re-point the media cookie's name at
the new constant. `NINA_CHAT_PHOTO_PAGE_SIZE` is declared at `:105`, well above this block, so the
reference resolves at module-evaluation time with no reordering.

**Code:** replace lines 427-454 in full with:

```ts
/**
 * How many photographs one page of **Foto profil** holds — 33 columns x 3 rows on desktop, 3 x 33
 * on phones, the same tiling `NINA_PHOTO_REF_PAGE_SIZE` (the photo-reference picker,
 * `lib/nina/imageprefs.ts`) already settled on for the identical grid shape. A separate constant
 * rather than a shared import: that module is deliberately zero-import (its header) so it stays
 * loadable from the image-generation worker, and this page is not part of that boundary.
 *
 * ── IT IS THE PROFILE TAB'S NUMBER ONLY, SINCE media-parity-compact-pager (2026-10-02) ────────
 * It used to be spelled for BOTH tabs, and that was the bug. 99 is correct here because it is
 * `listNinaAvatarsPage`'s own default AND ceiling, so what this page asks for is what Postgres is
 * told. It was never correct for Media, whose read ceilings at `NINA_CHAT_PHOTO_PAGE_SIZE` —
 * see `NINA_ABOUT_MEDIA_PAGE_SIZE` directly below, which is the fix and the argument for it.
 */
export const NINA_ABOUT_PAGE_SIZE = 99

/**
 * How many photographs one page of **Media** holds.
 *
 * ── IT IS DEFINED AS `NINA_CHAT_PHOTO_PAGE_SIZE`, NOT SPELLED AS 48, AND THAT IS THE POINT ────
 * `listNinaMediaPhotos` (`lib/nina/queries/images.ts`) does not merely default to
 * `NINA_CHAT_PHOTO_PAGE_SIZE` — it CEILINGS at it: `Math.min(opts.limit ?? 48, 48)`. A caller that
 * asks for more is handed 48 and told nothing. So the page SIZE a caller strides its offset by and
 * the row count the read will actually return are two numbers that must never be allowed to
 * disagree, and the only way to make that true by construction rather than by vigilance is to
 * derive one from the other. Writing `= 48` here would restore exactly the shape that failed.
 *
 * What failed, measured against production on 2026-10-02 before the fix: `/nina/about` passed
 * `limit: NINA_ABOUT_PAGE_SIZE` (99), was clamped to 48, and stepped `offset` by 99 anyway. Rows
 * 48…98 of every 99-row window were fetched by no page, and `galleryPageCount = ceil(total / 99)`
 * drew only 7 pages where `ceil(total / 48)` draws 13 — so no page number existed that would have
 * reached them either. Of 596 Media rows, 336 were reachable and **260 were not**.
 *
 * ── WHY MEDIA DOES NOT SIMPLY GET 99 LIKE FOTO PROFIL ─────────────────────────────────────────
 * Because `NINA_CHAT_PHOTO_PAGE_SIZE`'s own docstring (:80-104) already made the argument and it
 * applies here unchanged: `nina_avatars` has `thumb_url`, so a 99-tile profile page is 99 derived
 * 256 px JPEGs. `nina_message_images` has NO thumbnail column, so every Media tile loads the full
 * original — hers are 768x1024 PNGs on the order of a megabyte each. Raising this to 99 would
 * roughly double a page's payload on the surface that is *mobile*, to fix a pagination bug that
 * does not need payload to fix it. The number travels with the cost, not with the screen.
 *
 * ── AND IT IS WHAT MAKES THE TWO SURFACES THE SAME SURFACE ────────────────────────────────────
 * `/admin/nina?view=media` strides by `NINA_CHAT_PHOTO_PAGE_SIZE` over the identical read and the
 * identical predicate (`mediaCollectionScope`) in the identical order
 * (`coalesce(last_replaced_at, created_at) desc, id desc`). Binding this constant to that one is
 * therefore not merely "a size that fits under the ceiling" — it makes Media page N on `/nina/about`
 * literally the same row set as Media page N on the admin surface, which is the request R1 spells:
 * *"make sure /nina/about Media show exactly the same photos as admin page's …?view=media"*.
 *
 * Well under `NINA_GALLERY_LIMIT` (200), so `galleryPhotos`'s slice stays the no-op it has been.
 */
export const NINA_ABOUT_MEDIA_PAGE_SIZE = NINA_CHAT_PHOTO_PAGE_SIZE

/**
 * Where the last page a runner viewed is remembered across a reload — one cookie per tab, written
 * by the fetch action that serves each page (`lib/nina/aboutPageActions.ts`) and read on the
 * server render that seeds the first page. Non-sensitive: a page number, not a credential.
 *
 * ── EACH NAME CARRIES ITS OWN TAB'S PAGE SIZE ───────────────────────────────────────────────────
 * A bare page NUMBER is only meaningful against the page SIZE it was recorded under. Bump the
 * constant (30x3, then 33x3, both this same sitting) and a phone that had wandered to, say, page 3
 * under the old size lands on a DIFFERENT, often near-empty offset window under the new one — the
 * exact bug reported 2026-09-19: Foto profil showing a single photograph on one device (a stale
 * cookie from before the bump) while a browser with no cookie yet, or one still on page 1, looked
 * completely normal. Folding the size into the cookie's NAME means a size change orphans the old
 * cookie outright — read as absent, which `clampNinaAboutPage` already treats as "start over on
 * page 1" — rather than silently reinterpreting its number against new math. The 30-day `maxAge` on
 * a page number cookie was already accepted as disposable; this just makes "disposable" include
 * "across a resize" too.
 *
 * ── WHICH IS WHY THE TWO NAMES NO LONGER CARRY THE SAME NUMBER ──────────────────────────────────
 * media-parity-compact-pager (2026-10-02) moved Media from 99 to `NINA_ABOUT_MEDIA_PAGE_SIZE` (48)
 * and the profile tab not at all. That is a resize of exactly one tab, so exactly one cookie is
 * orphaned: a device sitting on Media page 6 under the old 99-stride does NOT get reinterpreted as
 * page 6 of 13 under the new 48-stride — it reads as absent and starts over on page 1, which is
 * both correct and the cheapest possible answer. `nina-about-ppage-99` keeps its name and its
 * remembered page, because nothing about Foto profil changed. Interpolating each tab's OWN size is
 * what makes that fall out automatically instead of needing to be remembered.
 */
export const NINA_ABOUT_PROFILE_PAGE_COOKIE = `nina-about-ppage-${NINA_ABOUT_PAGE_SIZE}`
export const NINA_ABOUT_MEDIA_PAGE_COOKIE = `nina-about-mpage-${NINA_ABOUT_MEDIA_PAGE_SIZE}`
```

**Impact:** `NINA_ABOUT_MEDIA_PAGE_COOKIE` now evaluates to `nina-about-mpage-48`. Every device
holding `nina-about-mpage-99` silently restarts the Media tab on page 1 — the intended, argued-for
behaviour, not a regression. Nothing reads the old name, so no cleanup is possible or needed; it
expires on its own 30-day `maxAge`. `NINA_ABOUT_PAGE_SIZE`'s value and `NINA_ABOUT_PROFILE_PAGE_COOKIE`
are byte-identical to before.

---

### Step 2: the server render's Media leg asks for what it will get

**File:** `app/nina/about/page.tsx:7-23` (import) and `:92-95` (the call)
**Change:** import the new constant and use it for the `listNinaMediaPhotos` leg only. The profile
leg at `:88-91` is correct and must not be touched.

**Code — the import block, lines 7-23, in full:**

```ts
import {
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  NINA_ABOUT_RETURN_PARAM,
  NINA_ABOUT_TAB_PARAM,
  aboutAlbumIdOutsideGallery,
  aboutPhotoIdOutsideGallery,
  albumPhotos,
  clampNinaAboutPage,
  decodeAboutReturnTo,
  decodeAboutTab,
  galleryPhotos,
  ninaAvatarView,
  type NinaAlbumPhoto,
} from '@/lib/nina/album'
```

**Code — the `Promise.all`, lines 87-97, in full:**

```ts
  const [avatarPage, mediaPageResult, currentRow] = await Promise.all([
    listNinaAvatarsPage(userId, {
      limit: NINA_ABOUT_PAGE_SIZE,
      offset: (profilePage - 1) * NINA_ABOUT_PAGE_SIZE,
    }),
    listNinaMediaPhotos(userId, {
      limit: NINA_ABOUT_MEDIA_PAGE_SIZE,
      offset: (mediaPage - 1) * NINA_ABOUT_MEDIA_PAGE_SIZE,
    }),
    getCurrentNinaAvatar(userId),
  ])
```

**Code — the docstring. Insert this paragraph immediately after the `── WHICH PAGE OF EACH TAB`
block (i.e. between line 55's `as page 1, never an error.` and line 57's
`── THE HERO'S CURRENT-AVATAR RESOLVER` heading), so the file reads:**

```ts
 * ── WHICH PAGE OF EACH TAB — THE COOKIE, NOT ALWAYS PAGE 1 ────────────────────────────────────
 * A runner who left off on Media page 3 should not land back on page 1 every time they reopen
 * this screen — "so we don't keep reloading everything from zero every time" was the ask. The two
 * fetch actions (`lib/nina/aboutPageActions.ts`) write a cookie on every page change; this render
 * reads it back to seed the FIRST fetch. A missing or garbled cookie (`clampNinaAboutPage`) reads
 * as page 1, never an error.
 *
 * ── THE TWO TABS PAGE AT DIFFERENT SIZES, AND EACH ONE IS ITS READ'S OWN CEILING ──────────────
 * `NINA_ABOUT_PAGE_SIZE` (99) for Foto profil, `NINA_ABOUT_MEDIA_PAGE_SIZE` (48) for Media. Not a
 * styling preference: each read CEILINGS the limit it is handed, and a caller that strides its
 * offset by a number larger than the ceiling skips rows that no page number can then reach. This
 * page passed 99 to both legs until 2026-10-02 (media-parity-compact-pager), and because
 * `listNinaMediaPhotos` clamps to `NINA_CHAT_PHOTO_PAGE_SIZE`, the Media leg received 48 rows and
 * advanced by 99 — 260 of the user's 596 photographs were unreachable from this screen while
 * `/admin/nina?view=media`, striding 48 over the identical read, listed all of them across 13
 * pages. Binding the Media stride to that same constant is what makes page N here the same row set
 * as page N there. `lib/nina/album.ts`'s two constants carry the full argument; `tests/nina.aboutMediaPage.test.ts`
 * pins it against the SQL the driver actually receives.
 *
 * ── THE HERO'S CURRENT-AVATAR RESOLVER (pagination's one correctness cost) ───────────────────
```

**Impact:** the first paint of the Media tab now fetches 48 rows at `48 · (mediaPage − 1)`. For a
device whose cookie survives (there is none — step 1 orphaned it) this would have changed which
window it lands on; in practice every device starts at page 1. The deep-link miss path
(`aboutPhotoIdOutsideGallery` -> `getNinaMessageImage`) fires slightly more often against the
smaller window, which is precisely what it exists for — no change needed there.

---

### Step 3: the client page fetch strides by the same constant

**File:** `lib/nina/aboutPageActions.ts:5-14` (import), `:18-35` (header), `:70-73` (the call)
**Change:** the same substitution inside `fetchNinaMediaPage`. `fetchNinaAlbumPage` at `:53-56` is
correct and must not be touched.

**Code — the import block, lines 5-14, in full:**

```ts
import {
  albumPhotos,
  clampNinaAboutPage,
  galleryPhotos,
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  type NinaAlbumPhoto,
  type NinaGalleryPhoto,
} from './album'
```

**Code — `fetchNinaMediaPage`, lines 60-75, in full:**

```ts
export async function fetchNinaMediaPage(page: number): Promise<NinaAboutPage<NinaGalleryPhoto>> {
  const userId = await requireUserId()
  const safePage = clampNinaAboutPage(page)

  const cookieStore = await cookies()
  cookieStore.set(NINA_ABOUT_MEDIA_PAGE_COOKIE, String(safePage), {
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })

  const { rows, total } = await listNinaMediaPhotos(userId, {
    limit: NINA_ABOUT_MEDIA_PAGE_SIZE,
    offset: (safePage - 1) * NINA_ABOUT_MEDIA_PAGE_SIZE,
  })
  return { items: galleryPhotos(rows), total, page: safePage }
}
```

**Code — append this paragraph to the module header, immediately before the closing `*/` of the
`── WHY TWO FUNCTIONS AND NOT ONE WITH A `section` PARAMETER` block (i.e. after line 34's
`functions cost less than one that reintroduces the branch its caller already resolved.`):**

```ts
 *
 * ── AND WHY EACH ONE SPELLS ITS OWN PAGE SIZE ────────────────────────────────────────────────
 * `NINA_ABOUT_PAGE_SIZE` here, `NINA_ABOUT_MEDIA_PAGE_SIZE` there, and they are different numbers
 * (99 and 48) because the two reads ceiling at different numbers. A shared `section` parameter
 * would have had to carry the size as a third thing to get right; two functions each name theirs
 * beside the read it belongs to. That is not hypothetical tidiness: until 2026-10-02 this file
 * passed 99 to BOTH, `listNinaMediaPhotos` clamped the Media leg to 48 and said nothing, and the
 * offset went on advancing by 99 — 260 of 596 photographs unreachable from the Media tab.
 * `lib/nina/album.ts` carries the argument; `tests/nina.aboutMediaPage.test.ts` pins this function's
 * half of it against the bound parameters Postgres would receive.
```

**Impact:** every page tap in the Media tab now fetches the 48-row window its number names.
`NinaAboutScreen`'s per-mount `galleryCache` is keyed by page number, so no stale 99-row entry can
survive the change — the cache is rebuilt on every mount.

---

### Step 4: `galleryPageCount` divides by the stride it actually uses

**File:** `components/nina/NinaAboutScreen.tsx:23-36` (import), `:94`/`:100`/`:108-109` (prop
docstrings), `:309-310` (the arithmetic), `:989-1011` (`NinaAboutPager`'s header)

**Change:** `galleryPageCount` must divide by the same number the fetch strides by, or the pager
draws page numbers that reach nothing (or stops short of rows that exist). `albumPageCount` keeps
`NINA_ABOUT_PAGE_SIZE`.

**Code — the import block, lines 23-36, in full:**

```ts
import {
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ABOUT_TAB_PARAM,
  NINA_ATTACH_MAX_CHARS,
  aboutViewerLists,
  decodeAboutPhoto,
  encodeAboutPhoto,
  type NinaAboutTab,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
  type NinaViewerSection,
} from '@/lib/nina/album'
```

**Code — the page-count pair. Replace lines 309-310 with:**

```ts
  /*
   * ── TWO DIVISORS, BECAUSE THE TWO TABS STRIDE DIFFERENTLY ────────────────────────────────────
   * Each count must divide by the SAME number its fetch offsets by, or the row of page numbers
   * stops describing the collection. Until 2026-10-02 both lines divided by `NINA_ABOUT_PAGE_SIZE`
   * while `fetchNinaMediaPage` was being handed 48 rows per call: the Media pager drew
   * `ceil(596 / 99) = 7` buttons over a collection that needs `ceil(596 / 48) = 13`, so the 260
   * photographs between them had no button to be reached by. The divisor is not a display choice —
   * it is the stride, and `lib/nina/album.ts` is where each stride is bound to its read's ceiling.
   */
  const albumPageCount = Math.max(1, Math.ceil(albumTotal / NINA_ABOUT_PAGE_SIZE))
  const galleryPageCount = Math.max(1, Math.ceil(galleryTotal / NINA_ABOUT_MEDIA_PAGE_SIZE))
```

**Code — the `album` prop docstring. Replace line 94 with:**

```ts
  /** The Foto profil tab's LOADED page — 99 at a time (`NINA_ABOUT_PAGE_SIZE`), not the album. */
```

**Code — the `gallery` prop docstring. Replace line 100 with:**

```ts
  /**
   * The Media tab's LOADED page — the same pagination shape as `album` over the conversation's
   * photographs, but a SMALLER page: `NINA_ABOUT_MEDIA_PAGE_SIZE` (48), not `NINA_ABOUT_PAGE_SIZE`
   * (99). The read ceilings there (`nina_message_images` has no thumbnail column, so every tile is
   * a full original); `galleryPageCount` below divides by the same constant so the pager and the
   * fetch cannot disagree about how wide a page is.
   */
```

**Code — the `resolvedPhoto` docstring. Replace lines 108-109 with:**

```ts
   * `?photo=chat.<id>` opens only when the id sits inside the LOADED page of `gallery` — 48 rows,
   * narrower now that the Media tab paginates than the 200-row window it used to be — so a
```

**Code — `NinaAboutPager`'s header. Replace lines 989-1011 (the whole block between `}` of `toCell`
and `function NinaAboutPager({`) with:**

```ts
/**
 * The numbered page row under each grid — one page of the tab's own size, so every photograph in
 * the collection is reachable rather than only the render-capped newest batch. Renders nothing for
 * a single-page collection, the common case: most albums and most conversations do not yet hold a
 * full page.
 *
 * ── THE TWO TABS DO NOT PAGE AT THE SAME SIZE, AND THIS COMPONENT NEVER LEARNS WHICH IS WHICH ──
 * It is handed `pageCount` and `total` and divides nothing itself, which is why one component can
 * serve Foto profil's 99-row pages and Media's 48-row ones with no branch. Its caller
 * (`albumPageCount` / `galleryPageCount` above) owns the divisor, and each divisor is the constant
 * its own fetch strides by. Do not reintroduce a page-size import here to "simplify": a second
 * place that knows the size is a second place that can disagree with the read's ceiling, which is
 * exactly the 2026-10-02 defect — 7 buttons drawn over a 13-page Media collection, 260 photographs
 * with no number that reached them.
 *
 * `onPage` is `goToAlbumPage`/`goToMediaPage` — a client fetch, never a navigation (the runner's
 * own choice over a `?page=` link): the page shell never remounts and `busy` is this tap's own
 * flight, not the attach strip's. Those two callbacks already took an arbitrary page number, so
 * a jump to page 5 is one call with `5` and neither of them needed a line changed for this.
 *
 * ── EVERY NUMBER, THEN THE COUNT LINE ────────────────────────────────────────────────────────
 * The two chevron `Button`s are gone. A `Sebelumnya`/`Berikutnya` pair makes page 5 four taps from
 * page 1, and the runner's ask was a row of numbers precisely so that it is one:
 * *"i can jump directly to specific page whenever i want"*. `components/ui/Pagination.tsx` is that
 * row — the one implementation, shared with the four admin surfaces — and it marks the active page
 * itself, so the line below is no longer the only thing saying where you are. The line stays
 * anyway, for the half a row of numbers cannot express: how many photographs there are.
 *
 * The `pageCount <= 1` guard is kept even though `Pagination` already returns `null` in that case.
 * It is not redundant here: it is what also keeps the count line off a single-page collection,
 * which is what this screen has always done and what its test pins.
 */
```

**Impact:** the Media pager now draws `ceil(total / 48)` buttons — 13 for today's 596 rows, matching
`/admin/nina?view=media` exactly. The count line below it (`Halaman {page} dari {pageCount}`) follows
automatically. Nothing about markup, roles, `aria-current`, or the `pageCount <= 1` guard moves, so
phase 2's cell restyle applies underneath with no interaction.

---

### Step 5: the one stale docstring in the grid

**File:** `components/nina/NinaPhotoGrid.tsx:14-18`
**Change:** the grid's header claims `NinaAboutScreen` pages *both* grids at 99. It pages one of
them at 48 now, and the "divisible by 3 and 33" tiling argument only ever applied to the 99.

**Code — replace lines 14-18 with:**

```ts
 * ── 3 COLUMNS ON A PHONE, 33 ON DESKTOP (nina-about-pagination) ────────────────────────────────
 * `NinaAboutScreen` pages Foto profil at `NINA_ABOUT_PAGE_SIZE` (99) — the same number
 * `components/admin/PhotoReferencePicker.tsx` settled on for the identical reason: 99 is divisible
 * by both 3 and 33, so a full page tiles as a clean sheet with no trailing gap on either
 * breakpoint. Only the collection's last (partial) page can ever leave a row short.
 *
 * Media pages at `NINA_ABOUT_MEDIA_PAGE_SIZE` (48) instead, and it does NOT tile cleanly at 33
 * columns — 48 = 16 rows of 3 on a phone, and one row of 33 plus a row of 15 on desktop. That
 * trailing short row is accepted deliberately (media-parity-compact-pager, 2026-10-02): 48 is the
 * ceiling `listNinaMediaPhotos` enforces because `nina_message_images` has no thumbnail column and
 * every tile here is a full original, and a stride wider than the read's ceiling is what made 260
 * of 596 photographs unreachable from the Media tab in the first place. A clean sheet is a nicety;
 * a reachable collection is the requirement. This grid draws whatever array it is handed either
 * way — the divisor lives in `NinaAboutScreen`, never here.
```

**Impact:** documentation only. No rendered output changes; the grid has always drawn `cells.length`
tiles without knowing the page size.

---

### Step 6: the Media-tab test builds its totals from the Media constant

**File:** `components/nina/NinaAboutScreen.test.tsx:77-84` (import) and `:330-344`
**Change:** the Media pager test currently derives its `galleryTotal` from `NINA_ABOUT_PAGE_SIZE`.
After step 4 that total (198) produces `ceil(198 / 48) = 5` pages rather than the 2 the test's
narrative assumes — it would still pass by accident (button "2" exists), which is worse than
failing. It must use the constant the Media arm actually strides by. **The album tests at `:237-410`
stay on `NINA_ABOUT_PAGE_SIZE` and stay green, unedited.**

**Code — the import block, lines 77-84, in full (verified against `9010c11`; only
`NINA_ABOUT_MEDIA_PAGE_SIZE` is added, as the first member):**

```ts
import {
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ATTACH_MAX_CHARS,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'
```

**Code — replace the `'the Media tab pages independently through fetchNinaMediaPage'` test (lines
330-344 — line 330 is the `it(` and line **344** is its closing `  })`; the replacement below
carries its own closing `  })`, so slicing 330-343 instead would leave a stray brace and the file
would not parse) in full with:**

```ts
  it('the Media tab pages independently through fetchNinaMediaPage, at its OWN page size', async () => {
    /* The totals here are built from `NINA_ABOUT_MEDIA_PAGE_SIZE`, not `NINA_ABOUT_PAGE_SIZE`:
     * `galleryPageCount` divides by the Media stride, and a test that spells the profile tab's
     * number would be asserting against arithmetic the screen does not do. That mismatch WAS the
     * 2026-10-02 bug — 99 in the caller, 48 at the read — so the suite must not reproduce it. */
    fetchNinaMediaPage.mockResolvedValue({
      items: [galleryPhoto('c9', 'his')],
      total: NINA_ABOUT_MEDIA_PAGE_SIZE * 2,
      page: 2,
    })
    renderScreen({ galleryTotal: NINA_ABOUT_MEDIA_PAGE_SIZE * 2 })
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))

    // Its own landmark, naming its own collection.
    const nav = screen.getByRole('navigation', { name: 'Halaman media' })
    expect(nav).toBeInTheDocument()
    // Exactly two pages for exactly two pages' worth of rows — the pager's divisor is the Media
    // stride. Under the old shared 99 this same total drew one page and the control vanished.
    expect(nav.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText(/Halaman 1 dari 2/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(fetchNinaMediaPage).toHaveBeenCalledWith(2)
    expect(fetchNinaAlbumPage).not.toHaveBeenCalled()
  })
```

**Impact:** the test now fails if `galleryPageCount`'s divisor drifts from the Media stride in either
direction — under the old 99 it would draw `ceil(96 / 99) = 1` page, `NinaAboutPager`'s guard would
return `null`, and `getByRole('navigation', …)` would throw. That is the regression this case now
guards.

---

### Step 7: the constant-level half of the invariant-4 guard

**File:** `lib/nina/album.test.ts:3-16` (import) and the tail of the file (after line 205)
**Change:** the cheap half — a pure assertion that the Media stride can never exceed the ceiling
`listNinaMediaPhotos` enforces, and that the two cookie names cannot collide across a one-tab
resize. No driver, no mocks, microseconds.

**Code — the import block, lines 3-16, in full:**

```ts
import { MAX_RUNNER_MESSAGE_CHARS } from './schema'
import {
  albumPhotos,
  describeSubjectForSide,
  galleryPhotos,
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  NINA_ALBUM_MAX,
  NINA_ATTACH_MAX_CHARS,
  NINA_AVATAR_FALLBACK_SRC,
  NINA_CHAT_PHOTO_PAGE_SIZE,
  NINA_GALLERY_LIMIT,
  ninaAvatarView,
  photoSideOf,
  type AvatarLike,
  type ImageLike,
} from './album'
```

**Code — append to the end of the file:**

```ts
/**
 * ── INVARIANT 4: NO PAGE STRIDE MAY EXCEED ITS READ'S OWN CEILING ──────────────────────────────
 * The cheap half of the guard media-parity-compact-pager exists to install. The expensive half
 * (`tests/nina.aboutMediaPage.test.ts`) proves what the driver is actually told; this one proves
 * the constants cannot be arranged into the bug again in the first place, and it costs nothing.
 *
 * What it guards, measured on production 2026-10-02: `/nina/about`'s Media tab passed
 * `NINA_ABOUT_PAGE_SIZE` (99) to `listNinaMediaPhotos`, which ceilings at `NINA_CHAT_PHOTO_PAGE_SIZE`
 * (48) and returns 48 rows without complaining — and then strode its offset by 99 anyway. Of 596
 * Media rows, 336 were reachable and 260 were not, across a pager that drew 7 page numbers where
 * `/admin/nina?view=media` drew 13.
 */
describe('/nina/about page sizes — each stride is its read\'s ceiling', () => {
  it('the Media stride never exceeds what listNinaMediaPhotos will return', () => {
    // The relation, not the number: if `NINA_CHAT_PHOTO_PAGE_SIZE` moves for cost reasons, the
    // Media stride must move with it, and `= NINA_CHAT_PHOTO_PAGE_SIZE` is what makes that free.
    expect(NINA_ABOUT_MEDIA_PAGE_SIZE).toBeLessThanOrEqual(NINA_CHAT_PHOTO_PAGE_SIZE)
    // And it is DEFINED as it, not merely equal to it today. A literal `48` here would pass the
    // line above and still be the defect, one `NINA_CHAT_PHOTO_PAGE_SIZE` edit later.
    expect(NINA_ABOUT_MEDIA_PAGE_SIZE).toBe(NINA_CHAT_PHOTO_PAGE_SIZE)
  })

  it('matches /admin/nina?view=media exactly — same read, same predicate, same stride', () => {
    // R1 in one assertion: the admin surface strides by `NINA_CHAT_PHOTO_PAGE_SIZE` over
    // `listNinaMediaPhotos`. Equal strides over one ordered read make page N the same row set.
    expect(NINA_ABOUT_MEDIA_PAGE_SIZE).toBe(NINA_CHAT_PHOTO_PAGE_SIZE)
  })

  it('the profile stride is unchanged, and the two tabs are no longer one number', () => {
    expect(NINA_ABOUT_PAGE_SIZE).toBe(99)
    expect(NINA_ABOUT_MEDIA_PAGE_SIZE).not.toBe(NINA_ABOUT_PAGE_SIZE)
  })

  it('a Media page still fits inside galleryPhotos\' render cap, so the slice stays a no-op', () => {
    expect(NINA_ABOUT_MEDIA_PAGE_SIZE).toBeLessThanOrEqual(NINA_GALLERY_LIMIT)
  })

  it('each cookie name carries its OWN size, so a one-tab resize orphans one cookie', () => {
    expect(NINA_ABOUT_MEDIA_PAGE_COOKIE).toBe(`nina-about-mpage-${NINA_ABOUT_MEDIA_PAGE_SIZE}`)
    expect(NINA_ABOUT_PROFILE_PAGE_COOKIE).toBe(`nina-about-ppage-${NINA_ABOUT_PAGE_SIZE}`)
    // The profile tab did not resize, so its remembered page must survive this change untouched.
    expect(NINA_ABOUT_PROFILE_PAGE_COOKIE).toBe('nina-about-ppage-99')
    // Two tabs, two keys — a shared name would let one tab's page number be read as the other's.
    expect(NINA_ABOUT_MEDIA_PAGE_COOKIE).not.toBe(NINA_ABOUT_PROFILE_PAGE_COOKIE)
  })
})
```

**Impact:** `lib/nina/album.test.ts` gains five assertions and no new dependency — it stays the pure,
import-light suite its `NINA_ATTACH_MAX_CHARS` block's docstring argues for (no `'use server'`
module, no next-auth, no driver).

---

### Step 8: the driver-level half — what Postgres is actually told

**File:** `tests/nina.aboutMediaPage.test.ts` (**new**)
**Change:** `fetchNinaMediaPage` is the one function a page tap calls, and the clamp that caused this
bug is invisible to a `vi.fn()` spy — it happens *inside* the read, after the spy would have
recorded the call. So the assertion has to be on the SQL and the bound parameters, which is exactly
the pattern `tests/nina.avatarsPage.test.ts` set for the avatar ceiling against this same recording
fake driver.

Two collaborators have to be mocked at the edges: `requireUserId` (next-auth) and `next/headers`
(`cookies()` is unavailable outside a request). Neither is this suite's subject. `lib/nina/queries`
is **not** mocked — it is the thing under test, reached through the fake driver.

**Code — the complete file:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  NINA_CHAT_PHOTO_PAGE_SIZE,
} from '@/lib/nina/album'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **`fetchNinaMediaPage` — R1's guard, asserted against the SQL the driver receives.**
 *
 * `/nina/about`'s Media tab must show exactly the photographs `/admin/nina?view=media` shows. Both
 * surfaces already read ONE function over ONE predicate (`listNinaMediaPhotos` /
 * `mediaCollectionScope`), so parity is not a question of scope — it is a question of whether the
 * caller's stride matches the read's ceiling. Until 2026-10-02 it did not:
 *
 *     listNinaMediaPhotos:  limit = min(opts.limit ?? 48, NINA_CHAT_PHOTO_PAGE_SIZE /* 48 *\/)
 *     /nina/about passed:   limit  = NINA_ABOUT_PAGE_SIZE = 99   ->  silently clamped to 48
 *                           offset = (page - 1) * 99
 *
 * 48 rows handed back, 99 stepped over. Rows 48…98 of every window were fetched by no page, and
 * `ceil(total / 99)` drew no page number that would have reached them: of 596 Media rows, 336
 * reachable and **260 not**, over 7 drawn pages against the admin surface's 13.
 *
 * ── WHY THE DRIVER AND NOT A SPY ─────────────────────────────────────────────────────────────
 * The clamp happens INSIDE the read, after any `vi.fn()` on `listNinaMediaPhotos` would already
 * have recorded a perfectly innocent-looking `{ limit: 99, offset: 99 }`. The only witness that
 * cannot be fooled is the bound parameter list Postgres would receive, which is what
 * `tests/support/fakeDb` records — the same argument `tests/nina.avatarsPage.test.ts` makes for the
 * avatar ceiling, against the same fake, in the same shape.
 *
 * ── WHAT IS MOCKED, AND WHY ONLY THIS MUCH ───────────────────────────────────────────────────
 * `requireUserId` (next-auth) and `next/headers` (`cookies()` throws outside a request) are edges,
 * not subject. `lib/nina/queries` is deliberately NOT mocked: it IS the subject's other half. A
 * `'use server'` directive is an inert string under vitest, so the action module imports normally —
 * the note `tests/nina.galleryDelete.test.ts` already records for this same family of modules.
 */

const { cookieJar, requireUserId } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  requireUserId: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value)
    },
  }),
}))

type Actions = typeof import('@/lib/nina/aboutPageActions')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const USER = 'usrAAAAAAAAA'

let fake: FakeDb
let actions: Actions

beforeEach(async () => {
  vi.resetModules()
  cookieJar.clear()
  requireUserId.mockReset().mockResolvedValue(USER)
  fake = installFakeDb()
  actions = await import('@/lib/nina/aboutPageActions')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/**
 * The page-of-rows statement, found by the clause that only it carries. `listNinaMediaPhotos` runs
 * its rows select and `countNinaMediaPhotos` concurrently in one `Promise.all`, and which of the
 * two the driver sees first is an implementation detail of that array's evaluation order — not
 * something this suite should pin. Nothing is enqueued: the fake answers an unqueued statement with
 * `[]`, which makes the count 0 and the page empty, and this suite asserts on neither.
 */
function rowsQuery(): { sql: string; params: unknown[] } {
  const found = fake.queries.find((query) => query.sql.includes(' limit '))
  if (!found) throw new Error(`no limited statement recorded:\n${fake.queries.map((q) => q.sql).join('\n')}`)
  return found
}

describe('fetchNinaMediaPage — the stride Postgres is told equals the stride the pager draws', () => {
  it('page 1 asks for exactly NINA_ABOUT_MEDIA_PAGE_SIZE rows, and no offset at all', async () => {
    await actions.fetchNinaMediaPage(1)

    expect(fake.queries).toHaveLength(2)
    const rows = rowsQuery()
    // drizzle omits `offset` entirely at 0 — the avatar suite records the same behaviour.
    expect(rows.sql).not.toContain('offset $')
    expect(rows.params).toEqual([USER, NINA_ABOUT_MEDIA_PAGE_SIZE])
  })

  it('every later page offsets by exactly one page, never by a stride the read will clamp', async () => {
    /* 13 is the real top of today's collection: 596 rows / 48 = 12.42 -> 13 pages, the number
     * `/admin/nina?view=media` draws and the number the user quoted ("in Media, we have 13 pages
     * now"). Under the old 99-stride, page 13 would have asked for offset 1188 over a 596-row
     * table — a page that could only ever have been empty, if it had been drawn at all. */
    for (const page of [2, 3, 13]) {
      fake.reset()
      await actions.fetchNinaMediaPage(page)

      const rows = rowsQuery()
      expect(rows.params, `page ${page}`).toEqual([
        USER,
        NINA_ABOUT_MEDIA_PAGE_SIZE,
        NINA_ABOUT_MEDIA_PAGE_SIZE * (page - 1),
      ])
    }
  })

  it('the limit it asks for survives the read unclamped — the whole of the 2026-10-02 defect', async () => {
    await actions.fetchNinaMediaPage(2)

    const [, boundLimit, boundOffset] = rowsQuery().params
    // The number bound is the number the caller named. Under the old code the caller named 99 and
    // the driver was bound 48, while the offset went on advancing by 99.
    expect(boundLimit).toBe(NINA_ABOUT_MEDIA_PAGE_SIZE)
    expect(boundLimit).toBe(NINA_CHAT_PHOTO_PAGE_SIZE)
    expect(boundOffset).toBe(boundLimit)
    expect(boundLimit).not.toBe(NINA_ABOUT_PAGE_SIZE)
  })

  it('remembers the page under the MEDIA cookie, whose name carries the media size', async () => {
    await actions.fetchNinaMediaPage(4)

    expect(cookieJar.get(NINA_ABOUT_MEDIA_PAGE_COOKIE)).toBe('4')
    expect(NINA_ABOUT_MEDIA_PAGE_COOKIE).toContain(String(NINA_ABOUT_MEDIA_PAGE_SIZE))
    // The profile tab did not resize, so its cookie must not be touched or renamed by this action.
    expect(cookieJar.has(NINA_ABOUT_PROFILE_PAGE_COOKIE)).toBe(false)
  })

  it('a garbage page number still starts over at page 1 rather than erroring', async () => {
    // `clampNinaAboutPage` is the one sanitizer; this pins that the new stride did not bypass it.
    await actions.fetchNinaMediaPage(Number.NaN)

    expect(rowsQuery().params).toEqual([USER, NINA_ABOUT_MEDIA_PAGE_SIZE])
  })
})

describe('the ceiling that made the old stride silently wrong is still there', () => {
  it('listNinaMediaPhotos still clamps an over-asking caller — it just no longer has one', async () => {
    /* A read-only assertion on `lib/nina/queries/images.ts`, which this phase does not edit. It is
     * what makes the constant-binding in `lib/nina/album.ts` load-bearing rather than decorative:
     * ask for the profile tab's 99 here and Postgres is still told 48, with nothing logged. */
    const queries = await import('@/lib/nina/queries')
    await queries.listNinaMediaPhotos(USER, { limit: NINA_ABOUT_PAGE_SIZE, offset: 0 })

    const rows = rowsQuery()
    expect(rows.params).toEqual([USER, NINA_CHAT_PHOTO_PAGE_SIZE])
    expect(rows.params).not.toContain(NINA_ABOUT_PAGE_SIZE)
  })
})
```

**Note for the implementer:** the escaped `*\/` inside the module docstring's code sample is
deliberate — an unescaped `*/` inside a block comment closes it. Keep it, or respell that line
without the inline comment.

**Impact:** a new unit suite (node environment, fake driver, no network, no database, no LLM). It
fails loudly if either Media call site drifts back to `NINA_ABOUT_PAGE_SIZE`, if the constant is
re-spelled as a literal that later diverges from the ceiling, or if the cookie name stops carrying
the media size.

---

### Step 9: the package readme sentence that says both pagers fetch one 99-row page

**File:** `components/nina/.workflows/package_readme.md:394`
**Change:** one clause. The bullet describing `NinaAboutPager` says `onPage` is "a client fetch of
one `NINA_ABOUT_PAGE_SIZE` page" for both tabs, which is now false for Media.

**Code — replace line 394 (`  client fetch of one \`NINA_ABOUT_PAGE_SIZE\` page, never a navigation, so the shell does not`)
with:**

```markdown
  client fetch of one page — `NINA_ABOUT_PAGE_SIZE` (99) for Foto profil, `NINA_ABOUT_MEDIA_PAGE_SIZE`
  (48) for Media, each bound to the ceiling its own read enforces — never a navigation, so the shell does not
```

**Impact:** documentation only. Keeps the readme from re-teaching the exact assumption this phase
removes. `lib/nina/.workflows/package_readme.md:943` already describes the admin surfaces' two page
sizes correctly and needs no edit.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`) — the real gate; `npm run build`
is not, and vitest does not typecheck.

**Tests, narrowest first:**

```bash
npx vitest run components/nina/NinaAboutScreen.test.tsx
npx vitest run lib/nina/album.test.ts
npx vitest run tests/nina.aboutMediaPage.test.ts
npx vitest run tests/nina.avatarsPage.test.ts   # must stay green, unedited
npm test
npm run typecheck
npm run lint
npm run format:check
```

`npm run format:check` is listed because every file in this phase gains prose at 100 columns; run
`npm run format` if it complains rather than reflowing by hand.

**Manual check (optional, read-only, no writes):** with `.env.local`'s `DATABASE_URL`, a single
`SELECT count(*) FROM nina_message_images WHERE user_id = $1 AND source_avatar_id IS NULL AND
source_image_id IS NULL` should return 596 (as of 2026-10-02). `ceil(596 / 48) = 13` is then the
page count both `/nina/about`'s Media tab and `/admin/nina?view=media` must draw. Do not run any
write, migration, or backfill — the one database is production.

**Exit criteria:**
- `/nina/about`'s Media tab draws `ceil(total / NINA_ABOUT_MEDIA_PAGE_SIZE)` pages — 13 today, the
  same number `/admin/nina?view=media` draws — and page N fetches 48 rows at offset `48 · (N − 1)`,
  so page N is the same row set on both surfaces. Zero unreachable photographs.
- `NINA_ABOUT_MEDIA_PAGE_COOKIE` evaluates to `nina-about-mpage-48`; the stale
  `nina-about-mpage-99` on existing devices reads as absent and starts the tab at page 1.
- `NINA_ABOUT_PAGE_SIZE` is still `99`, `NINA_ABOUT_PROFILE_PAGE_COOKIE` is still
  `nina-about-ppage-99`, and `tests/nina.avatarsPage.test.ts` passes unedited.
- `lib/nina/queries/images.ts`, `lib/nina/queries/avatars.ts` and `app/admin/nina/page.tsx` show no
  diff: `git diff --stat` names none of them.
- All eight commands above are green.

## Handoffs

- **R2 / pagination appearance — Phase 2.** The 30.8 px circular cell lives entirely in
  `components/ui/Pagination.tsx`'s `CELL` string, with its test (`Pagination.test.tsx:96`), its
  decision record (`components/ui/.workflows/package_readme.md:375`) and `docs/architecture.md` §8.
  This phase edits none of them and asserts no cell dimension, class token, radius or padding
  anywhere — step 6's new assertions count `<li>` elements and read `aria-current`, both of which
  phase 2 leaves alone by its own exit criteria. The two phases are order-independent.
- **`docs/architecture.md` — Phase 2 owns it this set**, purely to keep the file sets disjoint. The
  architecture doc's §5/§8 do not currently spell `/nina/about`'s Media page size, so nothing there
  is made stale by this phase; if the reconciler decides a line should record the two-size split, it
  belongs in phase 2's `docs/architecture.md` edit or in the set's close-out, not here.
- **Not taken, deliberately — a `thumb_url` column for `nina_message_images`.** It is the only thing
  that would make a 99-row Media page as cheap as a 99-row profile page, and
  `NINA_CHAT_PHOTO_PAGE_SIZE`'s docstring already rules it out: it is a migration, and this plan's
  invariant 7 forbids one. Noted so the next reader does not re-derive it.
- **Not taken — the `?page=` URL parameter for `/nina/about`.** The admin surface pages by href and
  `/nina/about` pages by client fetch plus a cookie; unifying them is a real design question and a
  different requirement, and R1 does not need it. Left exactly as it is.
- **Not taken — ellipsis/windowing in the shared pager.** 13 Media buttons is now the common case
  rather than 7, which is the first time the no-window rule is under real pressure. Phase 2's
  smaller cell is the answer the user asked for; if it is still too wide afterwards, that is a new
  requirement, not a drive-by.
- **Stale `30`s elsewhere.** `NinaAboutScreen.tsx:94` and `:108` said "30" long before this set (the
  constant has been 99 since the 33x3 bump). Steps 4 fixes exactly those two because this phase is
  already rewriting both docstrings for the real reason; no other "30" is hunted for.

## Rollback

`git revert` the phase's single commit. Nothing else is required and nothing is left behind:

- **No data was written.** No migration, no `drizzle/` file, no schema change, no backfill — the
  phase touches no table and runs no `db:migrate`.
- **The one persisted artefact is a cookie NAME.** Reverting restores
  `NINA_ABOUT_MEDIA_PAGE_COOKIE = 'nina-about-mpage-99'`, and devices that still hold that cookie
  (30-day `maxAge`, written before the change) simply start being read again. Devices that wrote
  `nina-about-mpage-48` in the meantime are then orphaned instead — read as absent, Media starts on
  page 1. Both directions are the exact behaviour `lib/nina/album.ts:436-452` argues for; neither
  loses anything but a remembered page number.
- **No cross-phase entanglement.** Phase 2 edits a disjoint file set, so reverting this phase alone
  leaves phase 2's commit applying cleanly, and vice versa.
