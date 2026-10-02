# Code Analysis: `/nina/about` Media parity + compact circular pagination

**Type:** Bug Investigation (R1) + Feature Update (R2)
**Date:** 2026-10-02 14:15:59 WIB
**Session ID:** 20261002-141559-M3K8
**Plan:** `MEDIA_PARITY_COMPACT_PAGER_PLAN.md` (2 phases)
**Worktree:** `~/.worktrees/run-insights/media-parity-compact-pager` — `feature/media-parity-compact-pager`, base `origin/main` @ `9010c11`

---

## User Input

### Original User Request

```
1. make sure /nina/about Media show exactly the same photos as admin page's https://runins.site/admin/nina?view=media
2. the pagination button is too big (in Media, we have 13 pages now). reduce their size, and make it circular. make sure the circular button is 30% smaller than the current button. apply to every pagination in the system
```

### User-Provided Context

- A live URL as the reference surface: `https://runins.site/admin/nina?view=media`.
- A measured scale claim: *"in Media, we have 13 pages now"*. Verified against production below —
  13 pages is what `/admin/nina?view=media` draws today (596 rows ÷ 48 per page = 12.42 → 13).
  `/nina/about`'s Media tab draws **7** (596 ÷ 99 = 6.02 → 7), which is the first visible symptom
  of R1 rather than a second request.

### User-Provided Files

None (`@`-less prose invocation).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | `/nina/about`'s Media tab must show exactly the same photographs as `/admin/nina?view=media` |
| R2 | Pagination cells: smaller, circular, 30% smaller than today's — applied to every pagination in the system |

---

## Detailed Requirements Understanding

### R1 — Problem statement

Both surfaces already read **one** function over **one** predicate, so the *scope* is not the
problem and no new query is needed:

- `/admin/nina?view=media` → `listNinaMediaPhotos(userId, { offset: (page-1) * NINA_CHAT_PHOTO_PAGE_SIZE })`
- `/nina/about` Media → `listNinaMediaPhotos(userId, { limit: NINA_ABOUT_PAGE_SIZE, offset: (page-1) * NINA_ABOUT_PAGE_SIZE })`

The defect is an **offset/limit mismatch inside the second call**:

```
listNinaMediaPhotos:  limit = min(opts.limit ?? 48, NINA_CHAT_PHOTO_PAGE_SIZE /* 48 */)
/nina/about passes:   limit  = NINA_ABOUT_PAGE_SIZE  = 99   ->  silently clamped to 48
                      offset = (page - 1) * 99
```

The caller asks for 99 rows and is handed 48, but it steps the window by 99. **Rows 48…98 of every
99-row window are never fetched by any page**, and `galleryPageCount` (`ceil(total / 99)`) draws
only enough pages to cover the 99-stride, so no page number exists that would reach them either.

Measured against production (`DATABASE_URL`, read-only count, 2026-10-02):

| Fact | Value |
|---|---|
| `nina_message_images` rows, all users | 655 |
| Media scope rows (`source_avatar_id IS NULL AND source_image_id IS NULL`), the real user | **596** |
| `/admin/nina?view=media` page count (÷48) | **13** — matches the user's "13 pages" |
| `/nina/about` Media page count (÷99) | 7 |
| Photographs `/nina/about` can actually reach | 7 × 48 = **336** |
| Photographs unreachable on `/nina/about` | **260** |

The Foto profil tab is **not** affected: `listNinaAvatarsPage`'s ceiling *is* `NINA_ABOUT_PAGE_SIZE`
(99), so limit and stride agree there. R1 is the Media arm alone.

**Success criteria:** every row `/admin/nina?view=media` lists is reachable from `/nina/about`'s
Media tab, in the same order, with no page-number arithmetic that can outrun the read's ceiling again.

**Key considerations:**

- `NINA_CHAT_PHOTO_PAGE_SIZE = 48` is a *cost* constant, argued at `lib/nina/album.ts:80-104`:
  `nina_message_images` has **no thumbnail column**, so every Media tile loads a full ~1 MB original.
  48 is both the default and the ceiling for exactly this reason. Widening it to 99 would double a
  mobile page's payload on the surface that is *mobile*.
- `NINA_ABOUT_PROFILE_PAGE_COOKIE` / `NINA_ABOUT_MEDIA_PAGE_COOKIE` carry the page size **in the
  cookie name**, by an explicit in-code argument (`lib/nina/album.ts:436-452`) recording a measured
  2026-09-19 bug: a page number is only meaningful against the size it was recorded under, so a
  resize must orphan the old cookie rather than reinterpret its number. Any change to the media
  page size therefore *must* move the media cookie's name.
- `galleryPhotos` slices at `NINA_GALLERY_LIMIT = 200`; 48 is well under it, so it stays a no-op.
- Ordering already matches on both surfaces: `coalesce(last_replaced_at, created_at) DESC, id DESC`.
- The `?photo=chat.<id>` deep-link miss path (`aboutPhotoIdOutsideGallery` → `getNinaMessageImage`)
  is defined over *the loaded page* and needs no change — a smaller window just fires it slightly
  more often, which is what it exists for.

### R2 — Problem statement

Every paginated surface in the app already renders the single shared control
`components/ui/Pagination.tsx` (verified exhaustively below — five call sites, no hand-written
stepper survives). Its cell is `min-h-11 min-w-11 rounded-field px-2 text-[13px]`: a 44 px
rounded-rectangle. At 13 pages the row is visually heavy on a phone.

**Success criteria:** the cell is a circle, 30 % smaller than 44 px (→ **30.8 px**), and the change
lands in the one shared component so it reaches all five surfaces at once.

**Key considerations / assumption stated:**

- 44 px is the app's deliberate iOS touch-target floor (`components/ui/Button.tsx:13`), cited by
  name in `Pagination.tsx`'s own docstring. 30.8 px is below it. **The user asked for this
  explicitly and with a number, so it is implemented as asked**, with the floor's loss recorded in
  the docstring rather than silently dropped — the next reader must not "fix" it back.
- `min-h` / `min-w` (not `h`/`w`) is load-bearing and stays: a minimum cannot fight a wrapped row's
  line height, and a 4-digit page must be allowed to be wider than it is tall.
- `components/ui/Pagination.test.tsx:96` pins `min-h-11 min-w-11` as an argued-for token. It is the
  one test that must move with the change.

---

## Analysis Scope

### Explicitly Mentioned Files

None. Targets inferred from the two routes named in the prose.

### Discovered Related Files

| File | Why it is in scope |
|---|---|
| `app/nina/about/page.tsx` | seeds both tabs' first page; passes the mismatched `limit`/`offset` |
| `lib/nina/aboutPageActions.ts` | `fetchNinaMediaPage` — same mismatch on every client page tap |
| `lib/nina/album.ts` | `NINA_ABOUT_PAGE_SIZE`, `NINA_CHAT_PHOTO_PAGE_SIZE`, both page cookies, `galleryPhotos` |
| `components/nina/NinaAboutScreen.tsx` | `galleryPageCount = ceil(total / 99)`; `NinaAboutPager` |
| `lib/nina/queries/images.ts` | `listNinaMediaPhotos`, `mediaCollectionScope`, `countNinaMediaPhotos`, `isOriginalPhoto` — **read only, no edit** |
| `app/admin/nina/page.tsx` | the reference surface; `NINA_CHAT_PHOTO_PAGE_SIZE` stride — **read only, no edit** |
| `components/ui/Pagination.tsx` | the one pager — R2's whole implementation |
| `components/ui/Pagination.test.tsx` | pins the cell's class tokens |
| `components/nina/NinaAboutScreen.test.tsx` | pins the pager's behaviour against `NINA_ABOUT_PAGE_SIZE` |
| `tests/nina.avatarsPage.test.ts` | pins the *avatar* page ceiling (unaffected, must stay green) |
| `docs/architecture.md` §8 | "Pagination — one control, five surfaces" |
| `components/ui/.workflows/package_readme.md` | records `min-h-11 min-w-11` as a decision |

---

## Current Dataflow

### Entry Point A: `GET /nina/about` (Server Component)

**Location:** `app/nina/about/page.tsx:79`
**Trigger:** navigation from the chat header avatar, or a `?photo=` deep link
**Input:** `searchParams` (`photo`, `return`, `tab`), plus two cookies

**Validation:** `clampNinaAboutPage(cookie)` — garbage/absent → page 1, never an error.

**Transform:**

1. `Promise.all([ listNinaAvatarsPage(…99/99…), listNinaMediaPhotos(…99/99…), getCurrentNinaAvatar() ])`
   — **the media leg is where R1 lives**: `limit: 99` is clamped to 48 inside the read, `offset`
   steps by 99.
2. `albumPhotos(rows)` / `galleryPhotos(rows)` — strip `description`, map to client shapes.
3. Deep-link miss resolvers (`aboutPhotoIdOutsideGallery`, `aboutAlbumIdOutsideGallery`).
4. `resolveAdminLinkOrigin()`.

**Exit:** `<NinaAboutScreen album gallery albumTotal galleryTotal albumPage galleryPage … />`

### Entry Point B: `fetchNinaMediaPage(page)` (Server Function)

**Location:** `lib/nina/aboutPageActions.ts:60`
**Trigger:** a tap on a page number in the Media tab (client fetch — never a navigation)

1. `requireUserId()`
2. `clampNinaAboutPage(page)`
3. `cookies().set(NINA_ABOUT_MEDIA_PAGE_COOKIE, page, { maxAge: 30d, sameSite: 'lax' })`
4. `listNinaMediaPhotos(userId, { limit: 99, offset: (page-1) * 99 })` — **the same R1 mismatch**
5. returns `{ items: galleryPhotos(rows), total, page }`

### Entry Point C: `GET /admin/nina?view=media` (Server Component — the reference)

**Location:** `app/admin/nina/page.tsx:225-294`
**Read:** `listNinaMediaPhotos(userId, { offset: (page - 1) * NINA_CHAT_PHOTO_PAGE_SIZE })` —
limit defaulted to 48, stride 48. **Limit and stride agree; every row is reachable.**

### The read both surfaces share

**Location:** `lib/nina/queries/images.ts:714`

```ts
const limit  = Math.max(1, Math.min(opts.limit ?? NINA_CHAT_PHOTO_PAGE_SIZE, NINA_CHAT_PHOTO_PAGE_SIZE))
const offset = Math.max(0, Math.trunc(opts.offset ?? 0))
// where mediaCollectionScope(userId)  ==  user_id = $1 AND source_avatar_id IS NULL AND source_image_id IS NULL
// order by coalesce(last_replaced_at, created_at) desc, id desc
```

`mediaCollectionScope` has **no `kind` arm** — generated *and* uploads — and `countNinaMediaPhotos`
runs the identical predicate, so the list and the total cannot disagree. Neither function needs a
change: the defect is entirely in what `/nina/about` asks it for.

### Entry Point D: `Pagination` (shared, no directive)

**Location:** `components/ui/Pagination.tsx:72`
**Trigger:** rendered by five surfaces
**Mechanism:** discriminated union — `hrefForPage` (`<Link>`) XOR `onPage` (`<button>`)
**Render:** `<nav><ul>` of `pageCount` `<li>`, active cell a `<span aria-current="page">`
**Exit:** returns `null` when `pageCount <= 1`

---

## Key Data Structures

### `NinaAboutPage<T>` — `lib/nina/aboutPageActions.ts:38`
`{ items: T[]; total: number; page: number }` — the Server Function's return for both tabs.

### `NinaMediaPage` — `lib/nina/queries/images.ts`
`{ rows: NinaImageRow[]; total: number }` — `listNinaMediaPhotos`'s return; `total` is the whole
collection's count, not the page's.

### `PaginationProps` — `components/ui/Pagination.tsx:50`
`PaginationBase & ({ hrefForPage } | { onPage })` — `page`, `pageCount`, `label` required;
`busy`, `scroll`, `className` optional.

### Cell class constants — `components/ui/Pagination.tsx:55-69`

| Const | Value today |
|---|---|
| `CELL` | `inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-2 text-[13px] font-semibold tabular-nums` |
| `ACTIVE` | `bg-ink text-card` |
| `INACTIVE` | `bg-paper-2 text-ink transition-colors hover:bg-accent-soft focus-visible:ring-2 …` |

---

## Dependencies

**Configuration:** `--radius-field: 14px`, `--radius-pill: 999px` (`app/globals.css:136-139`).
Tailwind v4.3.3, no config file — `@theme inline` in `globals.css`; arbitrary values are available.

**Environment:** `DATABASE_URL` (one production Neon database; the counts above were a read-only
`SELECT count(*)`). No schema change, no migration, in either phase.

**External services:** none touched.

---

## Reference List

### R1 — every site that spells a `/nina/about` page size or cookie

| Symbol / key | File:line | Kind | Phase |
|---|---|---|---|
| `NINA_ABOUT_PAGE_SIZE = 99` | `lib/nina/album.ts:434` | def | 1 (docstring only — value unchanged) |
| `NINA_CHAT_PHOTO_PAGE_SIZE = 48` | `lib/nina/album.ts:105` | def | 1 (read; the new media size binds to it) |
| `NINA_ABOUT_PROFILE_PAGE_COOKIE` | `lib/nina/album.ts:453` | def | — (unchanged: profile size unchanged) |
| `NINA_ABOUT_MEDIA_PAGE_COOKIE` | `lib/nina/album.ts:454` | def | **1 — name must carry the new size** |
| `NINA_ABOUT_PAGE_SIZE` (media leg) | `app/nina/about/page.tsx:93-94` | call | 1 |
| `NINA_ABOUT_PAGE_SIZE` (profile leg) | `app/nina/about/page.tsx:89-90` | call | — (correct already) |
| `NINA_ABOUT_PAGE_SIZE` (media leg) | `lib/nina/aboutPageActions.ts:71-72` | call | 1 |
| `NINA_ABOUT_PAGE_SIZE` (profile leg) | `lib/nina/aboutPageActions.ts:54-55` | call | — |
| `galleryPageCount` | `components/nina/NinaAboutScreen.tsx:310` | call | 1 |
| `albumPageCount` | `components/nina/NinaAboutScreen.tsx:309` | call | — |
| `NinaAboutPager` docstring | `components/nina/NinaAboutScreen.tsx:989-1011` | doc | 1 |
| `NINA_ABOUT_PAGE_SIZE` note | `components/nina/NinaPhotoGrid.tsx:15` | doc | 1 |
| `listNinaMediaPhotos` ceiling | `lib/nina/queries/images.ts:714-727` | def | **read only — no edit** |
| `listNinaAvatarsPage` ceiling | `lib/nina/queries/avatars.ts:1150-1169` | def | **read only — no edit** |
| media-tab test | `components/nina/NinaAboutScreen.test.tsx:330-343` | test | 1 |
| album-tab tests | `components/nina/NinaAboutScreen.test.tsx:237-410` | test | 1 (must stay green) |
| avatar-ceiling test | `tests/nina.avatarsPage.test.ts:53-57` | test | — (must stay green) |

### R2 — every pagination in the system

| Surface | File:line | Mechanism | Phase |
|---|---|---|---|
| **the one control** | `components/ui/Pagination.tsx:55` (`CELL`) | — | **2 — the only implementation edit** |
| `/nina/about` both tabs | `components/nina/NinaAboutScreen.tsx:1030` | `onPage` | 2 (inherits; no edit) |
| `/admin/nina` (album + media) | `components/admin/explorer/PhotoGrid.tsx:203` | `hrefForPage` | 2 (inherits; no edit) |
| `/admin/photoshop` | `components/admin/PhotoshopPickerGrid.tsx:69` | `hrefForPage` | 2 (inherits; no edit) |
| photo-reference picker | `components/admin/PhotoReferencePicker.tsx:406` | `hrefForPage` | 2 (inherits; no edit) |
| `/admin/error-logs` | `app/admin/error-logs/page.tsx:134` | `hrefForPage` | 2 (inherits; no edit) |
| barrel re-export | `components/ui/index.ts:44` | export | — |
| class-token test | `components/ui/Pagination.test.tsx:96` | test | 2 |
| decision record | `components/ui/.workflows/package_readme.md:375` | doc | 2 |
| architecture note | `docs/architecture.md:318-336` | doc | 2 |

**Exhaustiveness:** a repo-wide sweep for `Previous`/`Next`/`Sebelumnya`/`Berikutnya`/`?page=` over
`app/` and `components/` returns no hand-written pager. Every match is either a call site of the
shared control, a docstring describing one, or a `?page=` URL reader. R2 is genuinely one file.

---

## Impact Points (files that WILL need changes)

1. `lib/nina/album.ts` — add `NINA_ABOUT_MEDIA_PAGE_SIZE` bound to `NINA_CHAT_PHOTO_PAGE_SIZE`;
   re-point `NINA_ABOUT_MEDIA_PAGE_COOKIE`'s name at it. **Phase 1.**
2. `app/nina/about/page.tsx` — media leg's `limit`/`offset` use the new constant. **Phase 1.**
3. `lib/nina/aboutPageActions.ts` — `fetchNinaMediaPage`'s `limit`/`offset`. **Phase 1.**
4. `components/nina/NinaAboutScreen.tsx` — `galleryPageCount` divides by the new constant; the
   two docstrings that say "both tabs page at 99". **Phase 1.**
5. `components/nina/NinaAboutScreen.test.tsx` — the Media-tab test's totals. **Phase 1.**
6. a new guard test — the media page stride can never exceed the read's ceiling again. **Phase 1.**
7. `components/nina/NinaPhotoGrid.tsx` — one stale docstring line. **Phase 1.**
8. `components/ui/Pagination.tsx` — `CELL`: 30.8 px, `rounded-full`, tightened padding/type.
   **Phase 2.**
9. `components/ui/Pagination.test.tsx` — the pinned class tokens. **Phase 2.**
10. `components/ui/.workflows/package_readme.md` + `docs/architecture.md` — the sizing decision and
    the loss of the 44 px floor. **Phase 2.**

**This document describes. The plan files prescribe.**
