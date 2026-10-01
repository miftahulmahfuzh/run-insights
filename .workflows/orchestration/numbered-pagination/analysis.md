# Code Analysis: the app's pagination controls

**Type:** Refactoring
**Date:** 2026-10-01 12:43:00 +07
**Session ID:** 20261001-124300-P4G1
**Plan:** `NUMBERED_PAGINATION_PLAN.md` (5 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/numbered-pagination` — branch `feature/numbered-pagination`, base `origin/main` @ `b32d662`

---

## User Input

### Original User Request

```
in /nina/about , /admin/nina Image collection, and other places.
change every pagination system .
remove the current pagination UI.
make it so we show every button number. e.g:
1 2 3 4 5 6
and highlight the active page.
i prefer to show it this way as this is simple, yet i can jump directly to specific page whenever i want
```

### User-Provided Context

No error messages, no logs. The rationale is the last line and it is the specification for the
control's shape: *simple*, and *jump directly to a specific page whenever I want*. "and other
places" is an explicit instruction that the two named routes are examples, not the list — the
sweep below is what turns that phrase into a reference list.

### User-Provided Files

None marked with `@`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Change **every** pagination system in the app — `/nina/about`, `/admin/nina` (the "Image collection" nav label), and every other paginated surface — so each one uses the new control, and the current Previous/Next pagination UI is gone from all of them |
| R2 | The control itself: render **every** page number as its own button (`1 2 3 4 5 6`), highlight the active page, and let a tap jump straight to that page |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

This app paginates five distinct surfaces with five separately-written controls. Every one of them
is a *stepper*: the only reachable destinations from page 3 are page 2 and page 4. Three different
copy grammars are in play (`‹ Newer` / `Older ›`, `Previous` / `Next`, and a pair of chevron icons
labelled `Sebelumnya` / `Berikutnya`), and three different interaction mechanisms (a Next `<Link>`
navigation, a `ButtonLink` to a bare `?page=` query, and a client-side `onPage` callback that
fetches through a Server Action without navigating).

The requirement is to replace all five with one control that renders the full page range as
individually-clickable numbers with the current page visually marked — so page 7 of 9 is one tap
from page 1 instead of six.

**Success Criteria**

1. Every paginated surface in the app draws a numbered page row.
2. No `Previous`, `Next`, `Newer`, `Older`, `Sebelumnya` or `Berikutnya` pager control survives on
   any of them.
3. The active page is visually distinct and carries `aria-current="page"`.
4. A tap on any number reaches that page — through whatever mechanism that surface already uses
   (a `<Link>` navigation on four of them, the client fetch on `/nina/about`), unchanged.
5. `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` and the seven CI guards stay
   green.

**Key Considerations**

- **Two interaction shapes, not one.** Four surfaces page by URL (`?page=N`) and one pages by
  client fetch with no navigation at all. A single shared control has to serve both or the
  `/nina/about` surface keeps its own implementation and R1 is not met.
- **Page counts are bounded but not small.** `PAGE_CEILING` is 1000 in `app/admin/nina/page.tsx`
  and `app/admin/image-generation/page.tsx`, but that is a defence against a hand-typed `?page=`,
  not a real collection size. Real page counts today: album at 120/page, chat media at 48/page,
  photo references and `/nina/about` at 99/page, error logs at 25/page. A row of numbers has to
  wrap rather than overflow.
- **`components/ui/index.ts` is a load-bearing bundle boundary.** Its own header records that
  thirty-plus client components import it, so everything reachable through it must be safe in a
  browser bundle, and `tests/share.bundle.test.ts:71` asserts `/s/[token]`'s graph never reaches
  it. A new export there must be hook-free and server-safe, the way `Button.tsx` is
  (`components/ui/Button.tsx:6-10` states the rule explicitly).
- **`components/admin/touch.ts` is admin-scoped by design.** Its header argues the case for *not*
  being in the UI barrel. A shared control living in `components/ui/` must not import it — that
  would invert the dependency (`ui` → `admin`).
- **Source-scan tests exist over two of these files.** `tests/admin.photoReference.test.ts`
  asserts over `codeLines(picker)` (comments stripped) and `tests/admin.photoSearch.test.ts:118`
  asserts `SearchResultsGrid` contains neither `Newer` nor `Older`. The latter stays true by
  construction; the former must be re-read before editing the picker.

**Assumptions stated**

- The per-surface **count line** ("Showing 99 of 412", "1–120 of 980", "Halaman 2 dari 5 · 412
  foto") is *not* the pagination UI being removed — it is a different statement (how many rows
  exist) that the numbered row cannot carry. It stays. See `## Decisions` in the plan index.
- `components/trends/ScopeSwitcher.tsx`'s `Previous period` / `Next period` arrows are **not**
  pagination: there is no page count, no range and no total, and "every number" has no meaning for
  an unbounded calendar walk. Out of scope, stated as such.

---

## Analysis Scope

### Explicitly Mentioned Files

None. `/nina/about` and `/admin/nina` were named as *routes*; the files below were discovered from
them.

### Discovered Related Files

| File | How reached |
|---|---|
| `components/nina/NinaAboutScreen.tsx` | rendered by `app/nina/about/page.tsx` |
| `lib/nina/aboutPageActions.ts` | the Server Actions `NinaAboutScreen`'s pager calls |
| `components/admin/explorer/PhotoGrid.tsx` | rendered by `components/admin/FileExplorer.tsx:644` |
| `components/admin/FileExplorer.tsx` | rendered by `app/admin/nina/page.tsx:474`; owns `hrefForPage` |
| `components/admin/PhotoReferencePicker.tsx` | rendered by `components/admin/ImageGenPanel.tsx` and `components/nina/NinaJobAnchorPicker.tsx` |
| `components/admin/PhotoshopPickerGrid.tsx` | rendered by `app/admin/photoshop/page.tsx:28` |
| `app/admin/error-logs/page.tsx` | its pager is inline in the page, not a component |
| `components/ui/Button.tsx`, `components/ui/index.ts` | the barrel a shared control would join |
| `components/admin/touch.ts` | `TOUCH_ICON`, the 44 px tap-target string two pagers borrow |
| `lib/cn.ts` | `cn()`, the class joiner every component here uses |

---

## Current Dataflow

There are **five** pagination controls across **seven** mount points. They fall into two mechanism
families.

### Family A — URL-driven (`?page=N` is a real navigation)

#### A1. `/admin/nina` — the album and media grids

**Location:** `components/admin/explorer/PhotoGrid.tsx:177-215`
**Trigger:** a `<Link>` click; Next navigates, the Server Component re-reads, the grid re-renders.
**Input:** `page: ExplorerPageInfo` (`{ folder, page, pageSize, total }`,
`components/admin/explorer/model.ts:211-221`) and `hrefForPage: (page: number) => string`.
**Derivation,** `PhotoGrid.tsx:79-81`:

```ts
const first = (page.page - 1) * page.pageSize + 1
const last = Math.min(page.page * page.pageSize, page.total)
const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))
```

**Rendered UI:** a `flex items-center justify-between` row under a `border-t border-rule pt-3`,
holding `‹ Newer` (a `<Link rel="prev">` when `page.page > 1`, otherwise a greyed `<span>` of the
same box), the range line `{first}–{last} of {page.total}`, and `Older ›` (`<Link rel="next">` /
greyed `<span>`). Both ends carry `TOUCH_ICON`.
**`hrefForPage` comes from `FileExplorer.tsx:294-297`:**

```ts
const hrefForPage = useCallback(
  (next: number) => (view === 'media' ? hrefForMediaView(next) : hrefForFolder(folder, next)),
  [folder, view],
)
```

`hrefForFolder` / `hrefForMediaView` (`FileExplorer.tsx:689-710`) spell the URL grammar: the root
folder is the ABSENCE of `?folder=` and page 1 is the ABSENCE of `?page=`.
**Page sizes:** album `NINA_ADMIN_PAGE_SIZE = 120` (`lib/nina/album.ts:78`), media
`NINA_CHAT_PHOTO_PAGE_SIZE = 48` (`lib/nina/album.ts:105`). `app/admin/nina/page.tsx:535` divides
an offset by the right one of the two in `pageOfOffset`.
**Empty-page branch:** `PhotoGrid.tsx:83-117` renders an `EmptyState` with a
`ButtonLink href={hrefForPage(1)}` "Go to the first page" when `page.page > 1` — a second,
separate paging affordance that is not part of the pager row.

#### A2. `/admin/image-generation` and `/nina/jobs/[id]/anchor` — the photo-reference picker

**Location:** `components/admin/PhotoReferencePicker.tsx:353-362` (the `Previous` / `Next`
`ButtonLink`s), inside the footer row at `:347-374`. *(Corrected 2026-10-01 by the plan-reconciler:
first written as `:345-366`, measured off by eight.)*
**Trigger:** `ButtonLink href={`?page=${page ± 1}`} scroll={false}`.
**Input:** `page: number`, `pageCount: number`, `total: number`, `items`, `selectedId`.
`pageCount` is computed by each page (`app/admin/image-generation/page.tsx:130`,
`app/nina/jobs/[id]/anchor/page.tsx:65`) as `Math.max(1, Math.ceil(total / NINA_PHOTO_REF_PAGE_SIZE))`.
**Rendered UI:** `mt-2 flex flex-wrap items-center justify-between gap-2` — a left-hand status
paragraph `selected #<id> · Showing {items.length} of {total} · page {page} of {pageCount}` and a
right-hand button cluster holding `Previous` (when `page > 1`), `Next` (when `page < pageCount`)
and `Clear reference` (when a value is set).
**Coupled behaviour, `PhotoReferencePicker.tsx:187-209`:** a `useEffect` keyed on `page` calls
`sectionRef.current?.scrollIntoView({ block: 'start' })` on every page change but the first,
because `scroll={false}` turns off Next's scroll-to-top. This is keyed on the **prop**, not on the
click, so it survives any change to how the page is chosen.
**Prefetch:** `preloadUrls` (from `listNinaPhotoReferences`) renders as `<link rel="prefetch">`
hints for the pages either side of the current one — `PhotoReferencePicker.tsx:211-216`.
**Page size:** `NINA_PHOTO_REF_PAGE_SIZE = 99` (`lib/nina/imageprefs.ts:413`), chosen because 99
divides by both 3 and 33, the two grid column counts.

#### A3. `/admin/photoshop` — the photoshop entry grid

**Location:** `components/admin/PhotoshopPickerGrid.tsx:63-85`
**Trigger:** `<Link href={`/admin/photoshop?page=${page ± 1}`}>` — an **absolute** path, unlike A2's
bare `?page=`.
**Rendered UI:** byte-for-byte A2's row shape (`mt-2 flex flex-wrap items-center justify-between
gap-2`, the same `Showing … of … · page … of …` paragraph) but the two controls are hand-rolled
`<Link>`s carrying `rounded-field bg-card px-3 py-2 text-[14px] font-semibold text-ink
hover:bg-accent-soft` rather than `ButtonLink`s.
**Page size:** `NINA_PHOTO_REF_PAGE_SIZE` (99), same read (`listNinaPhotoReferences`) as A2.
**No test file exists for this component.**

#### A4. `/admin/error-logs` — the failure list

**Location:** `app/admin/error-logs/page.tsx:117-150` — inline in the page, not extracted.
**Trigger:** `<Link href={errorLogHref(category, page ± 1)}>`; `errorLogHref` keeps the `?tab=`
category and spells page 1 as the absence of `?page=`.
**Rendered UI:** A1's row, verbatim — the file's own comment at line 115 says
*"`PhotoGrid.tsx:177-211`'s pager, with this page's grammar"*. `‹ Newer` / `{first}–{last} of
{total}` / `Older ›`, `TOUCH_ICON` on both ends, greyed `<span>` at the disabled end.
**Empty-page branch:** the same `ButtonLink href={errorLogHref(category, 1)}` "Go to the first
page" inside an `EmptyState`.
**Page size:** `ADMIN_ERROR_LOG_PAGE_SIZE = 25` (`lib/admin/errorLogModel.ts:49`), which is also
the ceiling the query enforces.

### Family B — client-fetch (no navigation at all)

#### B1. `/nina/about` — the profile album and the Media tab

**Location:** `components/nina/NinaAboutScreen.tsx:1001-1042` (`NinaAboutPager`), mounted twice at
lines 706-712 (album) and 731-737 (media).
**Trigger:** `onClick={() => onPage(page ± 1)}` — `goToAlbumPage` / `goToMediaPage`
(`NinaAboutScreen.tsx:269-307`), which `await fetchNinaAlbumPage(page)` /
`fetchNinaMediaPage(page)` (`lib/nina/aboutPageActions.ts`), write into a per-tab
`React.useRef<Map<number, …>>` cache, and `setAlbumPage` / `setGalleryPage`. **No navigation
happens** — the page shell never remounts.
**Input:** `page`, `pageCount`, `total`, `busy`, `onPage`.
`albumPageCount` / `galleryPageCount` are derived at `NinaAboutScreen.tsx:309-310`:
`Math.max(1, Math.ceil(total / NINA_ABOUT_PAGE_SIZE))`.
**Rendered UI:** `mt-2 flex items-center justify-center gap-3` — a `Button size="md"
variant="secondary"` carrying `<ChevronLeftIcon />` and `aria-label="Sebelumnya"`, then
`Halaman {page} dari {pageCount} · {total} foto`, then the mirrored `Berikutnya` button. Both
carry `disabled={busy || <at the end>}`.
**Early return:** `if (pageCount <= 1) return null` — the whole row is absent for a single-page
collection, which the docblock says is the common case.
**The icons:** `ChevronLeftIcon` / `ChevronRightIcon` are inlined Lucide SVGs defined at the foot
of the same file, inside a shared docblock covering six glyphs
(`NinaAboutScreen.tsx:1044-1073`). Their paragraph names them specifically as *the pager's pair*.
**Page size:** `NINA_ABOUT_PAGE_SIZE = 99` (`lib/nina/album.ts:434`), with cookies
`NINA_ABOUT_PROFILE_PAGE_COOKIE` / `NINA_ABOUT_MEDIA_PAGE_COOKIE` (`album.ts:453-454`) carrying the
remembered page across reloads — read by `app/nina/about/page.tsx` and handed in as
`albumPage` / `galleryPage` props.
**State reset:** `NinaAboutScreen.tsx:243-267` — two effects that reset page state and rebuild the
cache from props whenever a fresh server render lands, so a stale cached page is dropped rather
than trusted.

### Data Persistence

No pagination control persists anything. The one piece of pagination state that outlives a request
is the `/nina/about` page cookie pair, written by `app/nina/about/page.tsx` and never touched by
`NinaAboutPager`.

### Exit Points

- Family A: a Next client-side navigation to the same route with a different `?page=`.
- Family B: two Server Action calls (`fetchNinaAlbumPage`, `fetchNinaMediaPage`), no navigation.

---

## Key Data Structures

### `ExplorerPageInfo`

**Location:** `components/admin/explorer/model.ts:211-221`
**Fields:** `folder: string`, `page: number` (1-based, clamped by the page), `pageSize: number`,
`total: number`.
**Used In:** `FileExplorer` (prop `page`), `PhotoGrid` (prop `page`), `app/admin/nina/page.tsx`
(constructed at lines 291 and 407 with the arm's own page size).

### `NinaPhotoRefPage`

**Location:** `lib/nina/imageprefs.ts` (shape `{ rows, total, offset, limit, preloadUrls }`)
**Used In:** `app/admin/image-generation/page.tsx:128`, `app/admin/photoshop/page.tsx:15`,
`app/nina/jobs/[id]/anchor/page.tsx:62`. Each divides `total` by `NINA_PHOTO_REF_PAGE_SIZE` itself.

### The page-size constants

| Constant | Value | Location | Surface |
|---|---|---|---|
| `NINA_ADMIN_PAGE_SIZE` | 120 | `lib/nina/album.ts:78` | `/admin/nina` album |
| `NINA_CHAT_PHOTO_PAGE_SIZE` | 48 | `lib/nina/album.ts:105` | `/admin/nina` media |
| `NINA_ABOUT_PAGE_SIZE` | 99 | `lib/nina/album.ts:434` | `/nina/about`, both tabs |
| `NINA_PHOTO_REF_PAGE_SIZE` | 99 | `lib/nina/imageprefs.ts:413` | image-gen, photoshop, anchor |
| `ADMIN_ERROR_LOG_PAGE_SIZE` | 25 | `lib/admin/errorLogModel.ts:49` | `/admin/error-logs` |

None of these changes. The page **size** is settled; only the control that walks the pages changes.

---

## Dependencies

### Configuration / Environment

None. Pagination reads no env var and no config key.

### Shared modules a new control would touch

- `lib/cn.ts` — `cn()`, the class joiner (not `clsx`/`tailwind-merge`, by that file's own argument).
- `components/ui/Button.tsx` — `Button`, `ButtonLink`, `buttonClasses`. **No `'use client'`**
  (lines 6-10): "nothing here uses a hook or an effect, so the module compiles into whichever graph
  imports it". A shared pager should follow this.
- `components/ui/index.ts` — the barrel. Its header: only names screens actually pull through it
  get re-exported.
- `components/admin/touch.ts` — `TOUCH_ICON` = `inline-flex min-h-11 min-w-11 items-center
  justify-center`. Admin-scoped by its own header's argument; a `components/ui/` module must not
  import it.

---

## Reference List

Every site that touches a pagination control today.

| Symbol / string | File:line | Kind | Package |
|---|---|---|---|
| `NinaAboutPager` (definition) | `components/nina/NinaAboutScreen.tsx:1001` | def | `components/nina` |
| `<NinaAboutPager>` album mount | `components/nina/NinaAboutScreen.tsx:706-712` | call | `components/nina` |
| `<NinaAboutPager>` media mount | `components/nina/NinaAboutScreen.tsx:731-737` | call | `components/nina` |
| `goToAlbumPage` / `goToMediaPage` | `components/nina/NinaAboutScreen.tsx:269-307` | def | `components/nina` |
| `albumPageCount` / `galleryPageCount` | `components/nina/NinaAboutScreen.tsx:309-310` | def | `components/nina` |
| `ChevronLeftIcon` / `ChevronRightIcon` | `components/nina/NinaAboutScreen.tsx` (foot) | def | `components/nina` |
| the pager docblock | `components/nina/NinaAboutScreen.tsx:984-1000` | doc | `components/nina` |
| `Sebelumnya` / `Berikutnya` / `Halaman … dari …` | `components/nina/NinaAboutScreen.tsx:1019-1038` | impl | `components/nina` |
| pager tests (`Sebelumnya`/`Berikutnya`/`Halaman`) | `components/nina/NinaAboutScreen.test.tsx:218-370` | test | `components/nina` |
| `fetchNinaAlbumPage` / `fetchNinaMediaPage` | `lib/nina/aboutPageActions.ts` | impl | `lib/nina` |
| pager row (`‹ Newer` / `Older ›`) | `components/admin/explorer/PhotoGrid.tsx:177-215` | impl | `components/admin/explorer` |
| `first` / `last` / `lastPage` | `components/admin/explorer/PhotoGrid.tsx:79-81` | def | `components/admin/explorer` |
| `hrefForPage` prop | `components/admin/explorer/PhotoGrid.tsx:69,77` | def | `components/admin/explorer` |
| "Go to the first page" (empty state) | `components/admin/explorer/PhotoGrid.tsx:103-110` | impl | `components/admin/explorer` |
| `TOUCH_ICON` import | `components/admin/explorer/PhotoGrid.tsx:5` | impl | `components/admin/explorer` |
| pager tests (`Newer`/`Older`) | `components/admin/explorer/PhotoGrid.test.tsx:163-193` | test | `components/admin/explorer` |
| source scan over the grid (`rel="prev"` / `rel="next"`) | `tests/admin.photoGrid.test.ts:141-146` | test | `tests` |
| `hrefForPage` construction | `components/admin/FileExplorer.tsx:294-297` | def | `components/admin` |
| `hrefForFolder` / `hrefForMediaView` | `components/admin/FileExplorer.tsx:689-710` | def | `components/admin` |
| URL-grammar tests over `hrefForPage` | `components/admin/FileExplorer.test.tsx:414-461` | test | `components/admin` |
| `Previous` / `Next` `ButtonLink`s | `components/admin/PhotoReferencePicker.tsx:353-362` | impl | `components/admin` |
| the footer row holding them | `components/admin/PhotoReferencePicker.tsx:347-374` | impl | `components/admin` |
| `page` / `pageCount` props | `components/admin/PhotoReferencePicker.tsx:120-121,137-140` | def | `components/admin` |
| `scrollIntoView` effect keyed on `page` | `components/admin/PhotoReferencePicker.tsx:187-209` | impl | `components/admin` |
| `preloadUrls` prefetch links | `components/admin/PhotoReferencePicker.tsx:142-147,211-216` | impl | `components/admin` |
| pager tests (`Previous`/`Next`/`page N of M`) | `components/admin/PhotoReferencePicker.test.tsx:166-196` | test | `components/admin` |
| source scans over the picker | `tests/admin.photoReference.test.ts:239-263` | test | `tests` |
| `Previous` / `Next` `<Link>`s | `components/admin/PhotoshopPickerGrid.tsx:63-85` | impl | `components/admin` |
| `page` / `pageCount` props | `components/admin/PhotoshopPickerGrid.tsx:17-22` | def | `components/admin` |
| pager row (`‹ Newer` / `Older ›`) | `app/admin/error-logs/page.tsx:117-150` | impl | `app/admin` |
| `first` / `last` / `lastPage` | `app/admin/error-logs/page.tsx:76-78` | def | `app/admin` |
| `errorLogHref` | `app/admin/error-logs/page.tsx` (foot) | def | `app/admin` |
| `pageCount` computation | `app/admin/image-generation/page.tsx:130` | call | `app/admin` |
| `pageCount` computation | `app/admin/photoshop/page.tsx:18` | call | `app/admin` |
| `pageCount` computation | `app/nina/jobs/[id]/anchor/page.tsx:65` | call | `app/nina` |
| `photoPage` / `photoPageCount` pass-through | `components/admin/ImageGenPanel.tsx` | call | `components/admin` |
| `page` / `pageCount` pass-through | `components/nina/NinaJobAnchorPicker.tsx` | call | `components/nina` |
| `TOUCH_ICON` (the 44 px string two pagers borrow) | `components/admin/touch.ts:38` | def | `components/admin` |
| "no pager" source assertion | `tests/admin.photoSearch.test.ts:117-119` | test | `tests` |

**Deliberately NOT on this list** (and therefore out of scope):

| Symbol | File:line | Why it is not pagination |
|---|---|---|
| `Previous period` / `Next period` | `components/trends/ScopeSwitcher.tsx:67,76` | A calendar walk. No page count, no total, no last page — "every number" has no referent. |
| `SearchResultsGrid` | `components/admin/explorer/SearchResultsGrid.tsx:28` | Deliberately unpaginated: "a ranked list has no page two", pinned by `tests/admin.photoSearch.test.ts:117`. |
| `MessageList` / `CHAT_HISTORY_LIMIT` | `app/nina/page.tsx:114` | A render cap on one conversation, not a pager; there is no second page to reach. |

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `components/ui/Pagination.tsx` *(new)* | the shared numbered control both mechanism families use | 1 |
| 2 | `components/ui/Pagination.test.tsx` *(new)* | its unit test | 1 |
| 3 | `components/ui/index.ts` | re-export `Pagination` through the barrel | 1 |
| 4 | `components/nina/NinaAboutScreen.tsx` | `NinaAboutPager` body replaced; the two chevron glyphs and their docblock paragraph become dead | 2 |
| 5 | `components/nina/NinaAboutScreen.test.tsx` | the `Sebelumnya` / `Berikutnya` / `Halaman` assertions move to the numbered row | 2 |
| 6 | `components/admin/explorer/PhotoGrid.tsx` | the `‹ Newer` / `Older ›` row replaced | 3 |
| 7 | `components/admin/explorer/PhotoGrid.test.tsx` | the `Newer` / `Older` pager assertions | 3 |
| 8 | `components/admin/PhotoReferencePicker.tsx` | the `Previous` / `Next` `ButtonLink`s replaced | 4 |
| 9 | `components/admin/PhotoReferencePicker.test.tsx` | the `Previous` / `Next` assertions | 4 |
| 10 | `components/admin/PhotoshopPickerGrid.tsx` | the hand-rolled `Previous` / `Next` `<Link>`s replaced | 5 |
| 11 | `app/admin/error-logs/page.tsx` | the inline `‹ Newer` / `Older ›` row replaced | 5 |
| 12 | `tests/admin.photoGrid.test.ts` | its `:141-146` test asserts `rel="prev"` / `rel="next"`, the exact markup impact point 6 removes — **added 2026-10-01 by the plan-reconciler; the table shipped with eleven rows and undercounted phase 3** | 3 |

**No file outside this table changes.** In particular: no page-size constant, no query, no Server
Action, no `hrefForPage` / `errorLogHref` grammar, and no route's `?page=` parsing.

**This document describes. The plan files prescribe.**
