# Plan: One numbered pager for every paginated surface

**Slug:** numbered-pagination
**Date:** 2026-10-01 12:43:00 +07
**Analysis:** `20261001-124300-P4G1_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/numbered-pagination`
**Branch:** `feature/numbered-pagination` (base: `origin/main` @ `b32d662`)
**Phases:** 5
**Status:** reconciled
**Coordinator:** —

---

## Why

The user's rationale, verbatim:

```
in /nina/about , /admin/nina Image collection, and other places.
change every pagination system .
remove the current pagination UI.
make it so we show every button number. e.g:
1 2 3 4 5 6
and highlight the active page.
i prefer to show it this way as this is simple, yet i can jump directly to specific page whenever i want
```

The operative sentence is the last one. The control being asked for is not an improvement on the
stepper — it replaces it, because the stepper's defect is exactly that page 7 is six taps from
page 1. "and other places" is an instruction to sweep, not a hedge: the analysis document's
Reference List is what that phrase resolves to.

## Requirements

Final after reconciliation. No requirement moved between phases, and no `R` is unowned.

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Change **every** pagination system in the app — `/nina/about`, `/admin/nina` (the "Image collection" nav label), and every other paginated surface — so each one uses the new control, and the current Previous/Next pagination UI is gone from all of them | 2, 3, 4, 5 |
| R2 | The control itself: render **every** page number as its own button (`1 2 3 4 5 6`), highlight the active page, and let a tap jump straight to that page | 1 |

Phase 3's third file (`tests/admin.photoGrid.test.ts`) serves R1 like the rest of that phase — it is
the gate that proves the old control is gone from `/admin/nina`, so no `Satisfies` line widened to
take it. No step moved between phases during reconciliation, so no `R` moved with one.

## Scope

**In scope** — exactly the **twelve** files in the analysis document's Impact Points table:

- a new `components/ui/Pagination.tsx` + its test + one line in `components/ui/index.ts`
- `components/nina/NinaAboutScreen.tsx` (+ `NinaAboutScreen.test.tsx`) — `/nina/about`, both tabs
- `components/admin/explorer/PhotoGrid.tsx` (+ `PhotoGrid.test.tsx` **+ `tests/admin.photoGrid.test.ts`**)
  — `/admin/nina` album and media
- `components/admin/PhotoReferencePicker.tsx` (+ `PhotoReferencePicker.test.tsx`) —
  `/admin/image-generation`, `/nina/jobs/[id]/anchor`
- `components/admin/PhotoshopPickerGrid.tsx` — `/admin/photoshop`
- `app/admin/error-logs/page.tsx` — `/admin/error-logs`

> **Reconciled 2026-10-01: this was eleven files and undercounted phase 3.**
> `tests/admin.photoGrid.test.ts:141-146` asserts `rel="prev"` and `rel="next"` — the exact two
> attributes phase 3 removes — so it goes red on phase 3's first edit and invariant 1 forces phase 3
> to own it. It was missing from the analysis document's Impact Points table; the reconciler added
> it there as row 12 and to the Reference List.
>
> **Each of the two scanned surfaces has BOTH kinds of test, and all four files exist on `b32d662`**
> (measured, not assumed): a co-located rendering test under happy-dom
> (`components/admin/explorer/PhotoGrid.test.tsx`, 194 lines;
> `components/admin/PhotoReferencePicker.test.tsx`, 385 lines) **and** a separate `readRepoCode`
> source-scan suite (`tests/admin.photoGrid.test.ts`, 147 lines;
> `tests/admin.photoReference.test.ts`, 273 lines). No phase creates, duplicates or deletes any of
> them. Phase 4 reads `tests/admin.photoReference.test.ts` and leaves it byte-for-byte unchanged.

**Out of scope, and why:**

- **Every page-size constant.** `NINA_ADMIN_PAGE_SIZE` (120), `NINA_CHAT_PHOTO_PAGE_SIZE` (48),
  `NINA_ABOUT_PAGE_SIZE` (99), `NINA_PHOTO_REF_PAGE_SIZE` (99) and `ADMIN_ERROR_LOG_PAGE_SIZE`
  (25) all stay. The user asked to change the control that walks the pages, not how big a page is.
- **Every URL grammar.** `hrefForFolder` / `hrefForMediaView` / `hrefForPage`
  (`components/admin/FileExplorer.tsx:689-710`), `errorLogHref`, and the bare `?page=` the picker
  uses, all unchanged — including "page 1 is the absence of `?page=`".
  `components/admin/FileExplorer.test.tsx:414-461` pins that grammar and must stay green untouched.
- **Every query, Server Action and route `?page=` parser.** `PAGE_CEILING`, `readPage`,
  `pageOfOffset`, `listNinaPhotoReferences`, `fetchNinaAlbumPage` / `fetchNinaMediaPage`: no edits.
- **`components/trends/ScopeSwitcher.tsx`'s `Previous period` / `Next period`.** A calendar walk
  with no page count, no total and no last page — "every number" has no referent. Not pagination.
- **`components/admin/explorer/SearchResultsGrid.tsx`.** Deliberately unpaginated
  (*"a ranked list has no page two"*), pinned by `tests/admin.photoSearch.test.ts:117-119`, which
  asserts the file contains neither `Newer` nor `Older`. That assertion stays true by construction.
- **The per-surface count lines** ("Showing 99 of 412", "1–120 of 980", "Halaman 2 dari 5 · 412
  foto"). See `## Decisions`, fork 1.
- **The "Go to the first page" `ButtonLink`s** inside the two `EmptyState` branches
  (`PhotoGrid.tsx:103-110`, `app/admin/error-logs/page.tsx:103-110`). They live on the
  *empty-page* branch, where no pager renders at all, so the numbered row cannot replace them.

## Invariants

Every phase must hold all of these. They are the contract, and they outrank any phase plan's own
prose.

1. **The tree builds and every gate passes at the end of each phase**, independently:
   `npm run typecheck && npm test && npm run lint && npm run format:check && npm run build`,
   plus the seven CI guards.
2. **One control, five surfaces.** After phase 5 there is exactly one pagination control
   implementation in the repo — `components/ui/Pagination.tsx`. No phase ships a second one, and
   no phase hand-rolls a numbered row locally.
3. **No page-size constant, query, Server Action, `?page=` parser or URL-grammar helper changes.**
   A phase that needs one to change has mis-read its scope.
4. **`components/ui/index.ts` stays a client-safe bundle boundary.** `Pagination` carries no
   `'use client'` directive, no hook and no effect — `components/ui/Button.tsx:6-10`'s rule,
   verbatim — so it compiles into whichever graph imports it. It imports `next/link` and
   `@/lib/cn` and nothing else. **It must not import `components/admin/touch.ts`**: that module's
   own header argues it is admin-scoped, and `ui` → `admin` is an inverted dependency.
   `tests/share.bundle.test.ts:71` must stay green.
5. **No navigation mechanism changes.** A surface that paged by `<Link>` still pages by `<Link>`;
   `/nina/about` still pages by client fetch with no navigation at all. `PhotoReferencePicker`
   keeps `scroll={false}` and keeps its `scrollIntoView` effect keyed on the `page` prop
   (`PhotoReferencePicker.tsx:187-209`) and its `preloadUrls` prefetch links.
6. **Every page number is rendered.** No ellipsis, no window, no "…" truncation, no collapsing of
   long ranges. This is the literal ask and the reason the user gave for it. The row wraps
   (`flex-wrap`) rather than overflowing.
7. **The active page carries `aria-current="page"`** and is visually distinct. It is not a link or
   a button — there is nowhere to go.
8. **Every number is a 44 px tap target minimum**, the app's iOS floor
   (`components/ui/Button.tsx:13`, `components/admin/touch.ts`).
9. **No `Previous`, `Next`, `Newer`, `Older`, `Sebelumnya` or `Berikutnya` pager control survives**
   on any migrated surface, in any language, as a word or as a glyph.

   **How each surface proves it (reconciled 2026-10-01 — read this before assuming CI covers it):**

   | Surface | Phase | Proof |
   |---|---|---|
   | `/nina/about` | 2 | a committed test — the rewritten `no Sebelumnya / Berikutnya control survives` case, plus the exit-criterion grep over `components/nina/` |
   | `/admin/nina` | 3 | a committed test — `tests/admin.photoGrid.test.ts`'s rewritten case asserts `codeLines(grid)` contains neither `Newer` nor `Older` |
   | image-gen + anchor picker | 4 | a committed test — the rewritten pager cases assert `queryByRole('link', { name: 'Previous'/'Next' })` is null |
   | `/admin/photoshop` | 5 | **grep only.** No suite reads `PhotoshopPickerGrid.tsx` |
   | `/admin/error-logs` | 5 | **grep only.** No suite reads `app/admin/error-logs/page.tsx` |

   The last two are an accepted, named gap, not an oversight: the sweep test that would close them
   must read four concurrently-owned files and would serialise the wave. See `## Decisions`, fork 10.

## The `Pagination` contract

Phase 1 owns this file. Phases 2–5 consume exactly this signature and must not widen it.

```tsx
// components/ui/Pagination.tsx — NO 'use client' (invariant 4)

interface PaginationBase {
  /** 1-based. The page currently being shown. */
  page: number
  /** How many pages exist — `Math.max(1, Math.ceil(total / pageSize))`, always >= 1. */
  pageCount: number
  /** The <nav>'s accessible name. Required: every mount says which collection it walks. */
  label: string
  /** Disables every control while a page is in flight. Family B (`onPage`) only. */
  busy?: boolean
  /** Forwarded to every `<Link>`. `hrefForPage` mounts only. */
  scroll?: boolean
  className?: string
}

export type PaginationProps =
  | (PaginationBase & { hrefForPage: (page: number) => string; onPage?: never })
  | (PaginationBase & { onPage: (page: number) => void; hrefForPage?: never })

export function Pagination(props: PaginationProps): React.JSX.Element | null
```

Behaviour:

- Returns `null` when `pageCount <= 1`. A one-page collection has nothing to jump to.
- Renders `<nav aria-label={label}>` wrapping a `<ul className="flex flex-wrap items-center
  justify-center gap-1">`, one `<li>` per page `1 … pageCount` in ascending order.
- The **active** page renders as a `<span aria-current="page">` with `bg-ink text-card` — the
  repo's measured contrast choice over `bg-accent` (`components/ui/Button.tsx:46-54`: white on
  the cyan accent lands near 2:1, ink-on-card ~14:1 and it inverts correctly in dark mode).
- Every **other** page renders as a `<Link href={hrefForPage(n)} scroll={scroll}>` on the
  `hrefForPage` mount, or a `<button type="button" onClick={() => onPage(n)} disabled={busy}>`
  on the `onPage` mount.
- Each cell: `inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-2
  text-[13px] font-semibold tabular-nums` (invariant 8), inactive cells
  `bg-paper-2 text-ink hover:bg-accent-soft`, plus
  `focus-visible:ring-2 focus-visible:ring-accent`.
- `className` is applied **last** on the `<nav>`, per `lib/cn.ts`'s own documented rule.

Exported through `components/ui/index.ts` as `export { Pagination } from './Pagination'`.

### The outer `pageCount <= 1` guard is PER SURFACE — do not generalise it

`Pagination` returning `null` at `pageCount <= 1` withholds **only the numbered row**. Whether a
caller ALSO wraps its own block in a guard is a separate question with a different answer per
surface, because what else that block holds differs. Every phase's answer is fixed here; no phase
session should re-derive it.

| Surface | Outer guard? | What the guard would also withhold | Pinned by |
|---|---|---|---|
| `/nina/about` — `NinaAboutPager` (phase 2) | **KEEP it** | the `Halaman … dari … · … foto` count line | `components/nina/NinaAboutScreen.test.tsx:218` asserts `queryByText(/Halaman/)` is **absent** on a single-page collection |
| `/admin/nina` — `PhotoGrid` (phase 3) | **NONE** | the `{first}–{last} of {page.total}` line, which renders at `pageCount === 1` today | measured: `PhotoGrid.tsx:180-214` has no guard |
| `PhotoReferencePicker` (phase 4) | **NONE** | the `Showing … of … · page … of …` line | `components/admin/PhotoReferencePicker.test.tsx:191-196` asserts `page 1 of 1` **is shown** |
| `PhotoshopPickerGrid` (phase 5) | **NONE** | the same `Showing … of …` line | measured: `PhotoshopPickerGrid.tsx:61-83` has no guard |
| `/admin/error-logs` (phase 5) | **NONE** | the `{first}–{last} of {total}` line | measured: `app/admin/error-logs/page.tsx:119-151` has no guard |

Adding a guard on the four admin surfaces would hide a count line that renders today; dropping it on
`/nina/about` would start rendering `Halaman 1 dari 1` under every small album. Both are behaviour
changes nothing in the user's ask calls for, in opposite directions. See `## Decisions`, fork 8.

### The `label` convention — one shape, five nouns, two languages

Every mount passes a `label`. The convention, settled across the four consuming phases: **a short
noun phrase naming the collection the nav walks, in that surface's own language.** No route name,
no verb, no "Pagination".

| Surface | Phase | `label`, verbatim |
|---|---|---|
| `/nina/about` — profile album | 2 | `Halaman foto profil` |
| `/nina/about` — Media tab | 2 | `Halaman media` |
| `/admin/nina` — album arm | 3 | `Folder pages` |
| `/admin/nina` — Media arm | 3 | `Media pages` |
| `/admin/image-generation`, `/nina/jobs/[id]/anchor` | 4 | `Photo reference pages` |
| `/admin/photoshop` | 5 | `Photo pages` |
| `/admin/error-logs` | 5 | `Error log pages` |

`/nina/about` is Indonesian and the other four are English **by verification, not by assumption**:
that screen's own pager copy is `Halaman … dari …` / `Sebelumnya` / `Berikutnya`, and
`components/nina/` pins Indonesian accessible names throughout — `NinaAboutScreen.tsx:639,662,878,906,917,935,959`
("Lihat foto profil Nina ukuran penuh", "Bagian Nina", "Kirim ke chat", "Unduh foto", "Hapus
foto"), plus `NinaSidebar.tsx`, `SessionRow.tsx`, `NinaJobDetail.tsx`, `NinaSearchField.tsx`. An
English label there would be the only English accessible name on the screen. The admin surfaces are
uniformly English. See `## Decisions`, fork 9, and `MEMORY.md`'s *"Kosongkan clear-button idiom is
repo-wide"*.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | The shared numbered `Pagination` control | R2 | `components/ui` | 3 | — | NORMAL | `.workflows/plan/numbered-pagination/phase-1.md` | — | — |
| 2 | `/nina/about` — both tabs page by number | R1 | `components/nina` | 2 | 1 | NORMAL | `.workflows/plan/numbered-pagination/phase-2.md` | — | — |
| 3 | `/admin/nina` — the album and media grids | R1 | `components/admin/explorer`, `tests` | 3 | 1 | EASY | `.workflows/plan/numbered-pagination/phase-3.md` | — | — |
| 4 | `/admin/image-generation` + the job anchor picker | R1 | `components/admin` | 2 | 1 | NORMAL | `.workflows/plan/numbered-pagination/phase-4.md` | — | — |
| 5 | `/admin/photoshop` and `/admin/error-logs` | R1 | `components/admin`, `app/admin` | 2 | 1 | EASY | `.workflows/plan/numbered-pagination/phase-5.md` | — | — |

Phases 2, 3, 4 and 5 touch **disjoint file sets** and share no edge with each other. They run
concurrently once phase 1 lands. **Re-verified after reconciliation** — the twelve files, one owner
each, no overlap:

| Phase | Files owned |
|---|---|
| 1 | `components/ui/Pagination.tsx`, `components/ui/Pagination.test.tsx`, `components/ui/index.ts` |
| 2 | `components/nina/NinaAboutScreen.tsx`, `components/nina/NinaAboutScreen.test.tsx` |
| 3 | `components/admin/explorer/PhotoGrid.tsx`, `components/admin/explorer/PhotoGrid.test.tsx`, `tests/admin.photoGrid.test.ts` |
| 4 | `components/admin/PhotoReferencePicker.tsx`, `components/admin/PhotoReferencePicker.test.tsx` |
| 5 | `components/admin/PhotoshopPickerGrid.tsx`, `app/admin/error-logs/page.tsx` |

**The reconciliation pass added no edge between 2, 3, 4 and 5.** The one change that would have —
assigning `tests/admin.pagerSweep.test.ts` to a phase, which must read four concurrently-owned
files — was deliberately refused and carded instead (`## Decisions`, fork 10). Every other fix was
confined to the one phase that owns the file in question.

### Phase 1 — The shared numbered `Pagination` control
**Satisfies:** R2
**Owns:** `components/ui/Pagination.tsx` (new), `components/ui/Pagination.test.tsx` (new), and the
one re-export line in `components/ui/index.ts`.
**Does not touch:** any caller, and **no phase 2-5 behaviour**. Phase 1's handoff list is advisory;
where it disagreed with a consuming phase the reconciler struck the handoff, not the phase — see
`## Reconciliation Log` rows 1 and 3. No existing pager is edited in this phase — the component ships
unused, which is legal: `knip` is not in the CI chain (`package.json`'s CI order is the seven
guards, `format:check`, `lint`, `typecheck`, `test`, `build`), and phases 2–5 land its callers.
**Exit criteria:** the contract above compiles and is exercised by `Pagination.test.tsx` — null at
`pageCount <= 1`; all N numbers rendered at `pageCount = 6` with no ellipsis; the active cell is a
non-interactive `aria-current="page"`; a `hrefForPage` mount produces one `<Link>` per inactive
page at the href the callback returns; an `onPage` mount calls back with the clicked number;
`busy` disables every button. `components/ui/index.ts` re-exports it and
`tests/share.bundle.test.ts` is still green.

### Phase 2 — `/nina/about` — both tabs page by number
**Satisfies:** R1
**Owns:** `components/nina/NinaAboutScreen.tsx` and `components/nina/NinaAboutScreen.test.tsx`.
**Does not touch:** `lib/nina/aboutPageActions.ts`, `NINA_ABOUT_PAGE_SIZE`, the two page cookies,
`app/nina/about/page.tsx`, `goToAlbumPage` / `goToMediaPage` (their bodies and the per-tab cache
are unchanged — only who calls them changes), or any other file.
**Exit criteria:** `NinaAboutPager` renders `<Pagination onPage={…} busy={…} label={…} />` under
each grid and nothing else of its old self; the `Halaman … dari … · … foto` count line is kept, the
two chevron `Button`s are gone; **`NinaAboutPager` keeps its own `if (pageCount <= 1) return null`
guard** (see the contract's per-surface table and `## Decisions` fork 8 — this is deliberate, and
phase 1's handoff saying otherwise was struck); the two mounts pass `label="Halaman foto profil"`
and `label="Halaman media"` verbatim; `ChevronLeftIcon` / `ChevronRightIcon` and the paragraph
naming them in the six-glyph docblock are removed if and only if they have no other caller left in
the file; the test file's pager block asserts the numbered row, a jump of more than one page, and
the cache/reset behaviour it already pins; `grep -rn "Sebelumnya\|Berikutnya\|Chevron"
components/nina/` returns nothing.

### Phase 3 — `/admin/nina` — the album and media grids
**Satisfies:** R1
**Owns:** `components/admin/explorer/PhotoGrid.tsx`,
`components/admin/explorer/PhotoGrid.test.tsx`, **and `tests/admin.photoGrid.test.ts`** — three
files. The third is the source-scan suite whose only subject is `PhotoGrid.tsx`
(`tests/admin.photoGrid.test.ts:29`); its `:141-146` test asserts the `rel="prev"` / `rel="next"`
attributes this phase deletes, so the phase cannot be green without owning it. No other phase reads
or writes it.
**Does not touch:** `components/admin/FileExplorer.tsx` (the `hrefForPage` prop's type and
contract are unchanged, so nothing there needs editing), `components/admin/FileExplorer.test.tsx`,
`app/admin/nina/page.tsx`, `components/admin/explorer/model.ts`,
`components/admin/explorer/SearchResultsGrid.tsx`, `tests/admin.photoSearch.test.ts`,
`components/admin/touch.ts`, or the `EmptyState` branch's "Go to the first page" link.
**Exit criteria:** the `‹ Newer` / `Older ›` row is replaced by `<Pagination hrefForPage={…} />`
under the same `border-t border-rule pt-3` rule, with **no outer `pageCount <= 1` guard** (contract
table above); the `{first}–{last} of {page.total}` line is kept and still renders at
`pageCount === 1`; `lastPage` is renamed to `pageCount` and `first` / `last` stay; `TOUCH_ICON` and
`next/link` are dropped from the import list (both verified to have no other use once the row is
gone); the two `label` values are `'Media pages'` / `'Folder pages'` verbatim;
`PhotoGrid.test.tsx`'s two stepper tests become three numbered-row tests; and
`tests/admin.photoGrid.test.ts:141-146` is rewritten against `codeLines(grid)` so the header
docblock's citation of the removed stepper cannot trip its own negative assertions.

### Phase 4 — `/admin/image-generation` + the job anchor picker
**Satisfies:** R1
**Owns:** `components/admin/PhotoReferencePicker.tsx` and
`components/admin/PhotoReferencePicker.test.tsx`.
**Does not touch:** `components/admin/ImageGenPanel.tsx`, `components/nina/NinaJobAnchorPicker.tsx`,
`app/admin/image-generation/page.tsx`, `app/nina/jobs/[id]/anchor/page.tsx`,
`components/admin/photoReferenceModel.ts`, `NINA_PHOTO_REF_PAGE_SIZE`, or
`tests/admin.photoReference.test.ts` — that suite's assertions are over `codeLines(picker)` for
`'use client'`, `next/image`, `@/lib/db`, `@/lib/nina/queries`, `'use server'` and `Action(`, none
of which this change introduces. **Re-read it before editing and confirm that, rather than
assuming it.**
**Exit criteria:** the `Previous` / `Next` `ButtonLink`s — at
`components/admin/PhotoReferencePicker.tsx:353-362`, inside the footer row at `:347-374`
(**measured; the analysis document and phase 1's handoff both first said `:345-366`, off by eight,
and the reconciler corrected both**) — are replaced by
`<Pagination hrefForPage={(n) => `?page=${n}`} scroll={false} label="Photo reference pages" className="mt-2" />`
with **no outer `pageCount <= 1` guard**, so `page 1 of 1` keeps rendering and
`PhotoReferencePicker.test.tsx:191-196` stays true; the `Clear reference` button
and the `selected #… · Showing … of … · page … of …` status paragraph both stay exactly where
they are; the `scrollIntoView` effect keyed on `page` and the `preloadUrls` prefetch links are
untouched; both mounts (`collapsible` true and false) still render; the test file's four
`Previous`/`Next` tests assert the numbered row.

### Phase 5 — `/admin/photoshop` and `/admin/error-logs`
**Satisfies:** R1
**Owns:** `components/admin/PhotoshopPickerGrid.tsx` and `app/admin/error-logs/page.tsx`.
**Does not touch:** `app/admin/photoshop/page.tsx`, `lib/admin/errorLogModel.ts`,
`components/admin/ErrorLogList.tsx`, `errorLogHref`'s body, the `TabStrip`, or either
`EmptyState` branch.
**Exit criteria:** `PhotoshopPickerGrid`'s two hand-rolled `<Link>`s are replaced by
`<Pagination hrefForPage={(n) => `/admin/photoshop?page=${n}`} label="Photo pages" />` with its
`Showing … of … · page … of …` line kept; `app/admin/error-logs/page.tsx`'s inline
`‹ Newer` / `Older ›` row is replaced by
`<Pagination hrefForPage={(n) => errorLogHref(category, n)} label="Error log pages" className="mt-2" />`
under the same `border-t border-rule pt-3` rule with its `{first}–{last} of {total}` line kept;
neither surface gains an outer `pageCount <= 1` guard; **`TOUCH_ICON` is dropped from the error-logs
import and `cn`, `Link`, `TOUCH_TARGET`, `ButtonLink` and `EmptyState` all stay** (verified: each
still has a use in `TabStrip` or the `EmptyState` branch — `cn` at `:185`, `Link` at `:182`,
`TOUCH_TARGET` at `:186`); **the stale `PhotoGrid.tsx:177-211` citation on `app/admin/error-logs/page.tsx:116`
is dropped** — phase 3 deletes exactly that range, and it is the only citation in the repo pointing
at content this set removes (`## Reconciliation Log`, row 7); and
`grep -n 'Newer\|Older\|Previous\|Next\|Sebelumnya\|Berikutnya'` over both files prints nothing —
which for these two files is **invariant 9's only check**, since neither is read by any suite and
the set deliberately does not create one (`## Decisions`, fork 10).

## Reconciliation Log

Round 1. Thirteen conflicts found, thirteen resolved. **Every resolution was written into the plan
files**, not only recorded here. No fix added an edge between phases 2, 3, 4 and 5 — the one that
would have (row 11) was refused and carded instead.

| # | Class | Conflict | Resolution (and where it landed) |
|---|---|---|---|
| 1 | Contract drift / behavioural fork | Phase 1's handoff told phase 2 it *"must **not** add its own `pageCount<=1` guard"*. Phase 2 deliberately keeps it. | **Phase 2 is right; phase 1's line is struck.** `NinaAboutPager`'s guard also withholds the `Halaman … dari … · … foto` count line, and `components/nina/NinaAboutScreen.test.tsx:218` pins that a single-page collection shows no `/Halaman/` at all — verified in the worktree. Dropping it would render "Halaman 1 dari 1" under every small album. Phase 1 could not see this from `components/ui`, where the count line is invisible. **Edited:** `phase-1.md`'s handoff line struck and its contract bullet rewritten; `phase-2.md` gains a *"Kept deliberately"* block in its Interface Contract; the index gains the per-surface table under `## The Pagination contract` and `## Decisions` fork 8. |
| 2 | Requirement creep / over-generalisation | The same guard question, asked of phases 3, 4 and 5 — nothing in the set said whether they get one. | **They do not.** Measured: `PhotoGrid.tsx:180-214`, `PhotoshopPickerGrid.tsx:61-83` and `app/admin/error-logs/page.tsx:119-151` have no guard and their count lines render at `pageCount === 1`; `components/admin/PhotoReferencePicker.test.tsx:191-196` asserts `page 1 of 1` **is shown**. A guard there would be the same unasked-for change in reverse. **Edited:** a bound convention block in each of `phase-3.md`, `phase-4.md`, `phase-5.md`; the index's per-surface table. |
| 3 | Gap / undercount | Phase 3 owns **three** files, not the two the draft index listed. `tests/admin.photoGrid.test.ts:141-146` asserts `rel="prev"` / `rel="next"` — exactly the markup phase 3 deletes. | **Assigned to phase 3** (rule 5: the phase that already owns the package). Re-verified: that suite's only subject is `PhotoGrid.tsx` (`:29`), and no other phase reads or writes it — phase 5's `Leaves alone` already assigned it there. **Edited:** index Phases table `2` → `3`, index phase-3 `Owns` and `Exit criteria`, index `## Scope` eleven → twelve, `phase-3.md`'s reconciler note settled, and the analysis document's Impact Points gains row 12 + a Reference List row. |
| 4 | False alarm (withdrawn) | `phase-5.md` warned of an *"INDEX SLIP"* — that `PhotoGrid.test.tsx` / `PhotoReferencePicker.test.tsx` do not exist on `b32d662` and phases 3/4 risk creating duplicates. | **Wrong; withdrawn.** All four files exist, measured: `components/admin/explorer/PhotoGrid.test.tsx` (194 lines) and `components/admin/PhotoReferencePicker.test.tsx` (385) are rendering tests under happy-dom; `tests/admin.photoGrid.test.ts` (147) and `tests/admin.photoReference.test.ts` (273) are separate `readRepoCode` source scans. Each surface has **both**. **Edited:** the handoff is struck through in place in `phase-5.md` (so a session that remembers it finds the correction) with the measured table; the index `## Scope` records the two-kinds-of-test structure. No phase creates or deletes any of the four. |
| 5 | Stale citation | Phase 4's `Previous`/`Next` `ButtonLink`s were cited at `PhotoReferencePicker.tsx:345-366` in the analysis document (§A2 and the Reference List) and in `phase-1.md`'s handoff. | **Off by eight.** Measured in the worktree: the `ButtonLink`s are at `:353-362`, inside the footer row at `:347-374`. **Edited:** both analysis sites corrected (with a Reference List row added for the footer row), `phase-1.md`'s handoff corrected, and the index's phase-4 exit criteria now carry the measured numbers. The plan index itself carried no such citation — nothing to correct there. `phase-4.md` already had the right numbers and was not changed. |
| 6 | Unsettled convention | Phase 4 chose `label="Photo reference pages"` and asked for a cross-surface convention; nothing fixed the other six strings. | **Convention settled and all seven strings written into the plans verbatim.** Shape: a short noun phrase naming the collection the nav walks, in that surface's own language. `/nina/about` takes Indonesian — confirmed against the files, not assumed: its own copy is `Halaman … dari …` / `Sebelumnya` / `Berikutnya`, and `NinaAboutScreen.tsx:639,662,878,906,917,935,959` plus `NinaSidebar.tsx`, `SessionRow.tsx`, `NinaJobDetail.tsx`, `NinaSearchField.tsx` all pin Indonesian accessible names. The four admin surfaces stay English. **Edited:** a label block in each of `phase-2.md`, `phase-3.md`, `phase-4.md`, `phase-5.md`; a bullet in `phase-1.md`'s contract; the index's label table and `## Decisions` fork 9. No string changed value — the four planners happened to agree on the shape; what was missing was the rule. |
| 7 | Deleted-then-cited | `app/admin/error-logs/page.tsx:116`'s comment cites *"`PhotoGrid.tsx:177-211`'s pager"* — a range **phase 3 deletes**, not merely moves. | **Phase 5 drops the citation**, in the file it already owns, in the same edit that replaces the row. Not repointed: the hand-copy-by-line-citation is how it went stale, and the two surfaces now share `components/ui/Pagination.tsx`. No cross-phase edge — phase 5 touches only its own file. **Edited:** `phase-5.md` Step 2b gains a required sub-step; index phase-5 exit criteria. |
| 8 | Stale citation, audited the other way | Row 7 claimed to be the only one. Checked. | **It is.** Every line-numbered cross-file citation into the six edited files was grepped: thirteen others exist (`SearchResultsGrid.tsx:17`→`PhotoGrid.tsx:115-178`, `photoReferenceModel.ts:127`→`PhotoGrid.tsx:22-28`, `ErrorLogList.tsx:115`→`PhotoGrid.tsx:133`, `PhotoGrid.tsx:18`→`PhotoReferencePicker.tsx:151-193`, `PhotoViewer.tsx:68,159` and `CopyAdminLinkButton.tsx:19,187`→`NinaAboutScreen.tsx`, and more). **All point at surviving content and drift by 3-22 lines only.** None is chased: they live in files no phase owns, and chasing them is scope creep across four phase boundaries. **Edited:** recorded in `phase-5.md` Step 2b so the claim is auditable; `phase-3.md`'s handoff 1 already listed them and stands. |
| 9 | Contract drift | `phase-1.md`'s contract asserted *"Phases 3 and 5 pass their existing `mt-4 border-t border-rule pt-3` wrapper classes through `className` rather than wrapping the component in another `<div>`"*. None of 3, 4, 5 does that — and phase 1's own handoff to phase 3 says *"either works; phase 3 owns that shape"*, contradicting itself. | **Phase 1's contract bullet rewritten to match what the callers wrote** (rule 4: later phases are not retro-fitted to an upstream phase's guess). Phase 3 keeps its `<div>` and passes no `className`; phase 4 passes `className="mt-2"`; phase 5 keeps the error-logs `<div>` with `className="mt-2"` and passes none on `PhotoshopPickerGrid`. All four are legal against the union. No consuming phase changed. |
| 10 | Mis-named file in a contract | `phase-5.md`'s `Leaves alone` listed phase 2's files as `components/nina/NinaAboutScreen.tsx + tests/nina.about*.test.tsx`. Phase 2's second file is the co-located `NinaAboutScreen.test.tsx`. | **Corrected in `phase-5.md`**, with the note that `tests/nina.aboutPhoto.test.ts` exists but **no phase edits it** — phase 2 must keep it green untouched (it is one of the four `readRepoCode` suites scanning `NinaAboutScreen.tsx`). |
| 11 | Gap, refused rather than forced | Phase 5 proposed `tests/admin.pagerSweep.test.ts` to pin invariant 9 across all five surfaces and correctly refused to write it during the planning wave. `/admin/photoshop` and `/admin/error-logs` have no test coverage at all, so a surviving `Newer` there is caught by nothing. | **Carded as a follow-up; NOT assigned to a phase.** Assigning it would give its owner a dependency on phases 2, 3 and 4 — and there is no "last phase" to hang it on, because 2-5 are concurrent peers, not a chain. Serialising four phases to buy one grep-equivalent assertion is the worse trade. **The cost is stated plainly** rather than hidden: invariant 9 on those two surfaces is verified by grep at commit time, not by a CI gate — see invariant 9's own proof table and `## Decisions`, fork 10. **Edited:** `phase-5.md`'s handoff rewritten from a question into a settled decision; phase-5 exit criterion 5 makes the grep load-bearing and non-skippable; index invariant 9 and `## Decisions` fork 10. |
| 12 | Potential duplicate work (cleared) | Phase 2 imports `@/components/ui/Pagination` by path; phases 3, 4 and 5 import from the `@/components/ui` barrel. Two conventions for one symbol. | **Both stand; no conflict.** `components/nina/NinaAboutScreen.tsx` imports every UI primitive by file path today (`@/components/ui/Button`, `@/components/ui/PhotoViewer`) and phase 2 follows its own file's convention; the three admin files already import from the barrel. **Only phase 1 edits `components/ui/index.ts`**, so there is no collision on it, and phase 2 explicitly must not add the barrel line. Verified in the worktree: `components/ui/index.ts`'s export list runs `:38-45`, `FlagList` at `:43` and `SplitsTable` at `:44`, so phase 1's "insert at line 44" is correct. |
| 13 | Ordering / build-green (cleared) | Phase 1 ships `Pagination` with no production caller; phases 2-5 each import it. | **No violation.** Dependencies point backward only (every phase depends on 1; none on each other). `knip` is not in the CI chain, and `Pagination.test.tsx` is a real caller for the test run — already recorded in `## Decisions` fork 7. Each of phases 2-5 compiles and gates green on its own once phase 1 lands. |

**Invariant check after the edits.** Dependencies point backward only (1 ← 2, 3, 4, 5; no edge among
2-5). No deleted-then-used symbol: the only deletions are module-private (`ChevronLeftIcon` /
`ChevronRightIcon`, phase 2's file), local (`lastPage` → `pageCount`, phase 3's file), or JSX in a
file one phase owns; `TOUCH_ICON` is *un-imported* by phases 3 and 5 but never deleted —
`components/admin/touch.ts` is untouched and keeps its other consumers. Every impact point and
Reference List entry has exactly one owner. Both requirement ids are served. Every phase builds
green alone.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Does *"remove the current pagination UI"* also remove the per-surface count line ("1–120 of 980", "Halaman 2 dari 5 · 412 foto", "Showing 99 of 412")? | **Keep every count line.** Replace only the navigation control. | 5: the user's raw input. The sentence that states the *reason* — *"i can jump directly to specific page whenever i want"* — is about reaching a page, and a row of numbers cannot say how many rows exist. The count line answers a different question and nothing in the ask displaces it. |
| Does "show every button number" need an ellipsis / windowing fallback for a large `pageCount`? | **No. Every number, always, wrapping onto more lines.** | 5: the user's raw input, which says *"show every button number"* and gives *"this is simple"* as the reason. A window is the thing being removed. Real page counts are bounded by the page sizes in use (25–120 rows/page); `PAGE_CEILING = 1000` is a defence against a hand-typed `?page=`, not a collection size. |
| One shared component, or a per-surface rewrite? | **One: `components/ui/Pagination.tsx`.** | 6: surrounding convention. Five hand-written steppers in three copy grammars is exactly how the current drift happened, and `/admin/error-logs`' own comment already says it copied `PhotoGrid.tsx:177-211` by hand. |
| The shared control serves two mechanisms (`<Link>` navigation, and `/nina/about`'s client fetch). One component or two? | **One component, a discriminated union of `hrefForPage` / `onPage`.** | 1: invariant 2 ("one control, five surfaces") and invariant 5 ("no navigation mechanism changes") together — two components would re-open the drift invariant 2 exists to close, and a single mechanism would violate invariant 5 on whichever family lost. |
| Where does the 44 px tap-target string come from — `components/admin/touch.ts`'s `TOUCH_ICON`, or spelled locally? | **Spelled locally in `Pagination.tsx`.** | 1: invariant 4. `components/admin/touch.ts`'s own header argues it is admin-scoped and must not join the UI barrel on the strength of one phase; `ui` importing `admin` would invert the dependency. The two files may carry the same utilities; that is cheaper than the inversion. |
| Active-cell colour — `bg-accent` or `bg-ink text-card`? | **`bg-ink text-card`.** | 6: surrounding convention, measured. `components/ui/Button.tsx:46-54` records white-on-cyan at near 2:1 against WCAG's 4.5:1, where ink-on-card is ~14:1 and inverts correctly in dark mode. `PhotoGrid.tsx` and `PhotoReferencePicker.tsx` both already made this exact call for their selection badges. |
| Phase 1 ships an export with no caller. Does that fail a gate? | **No — land it anyway.** | 2: phase exit criteria. `knip` is a manual sweep, not part of CI (`package.json`'s chain is the seven guards, `format:check`, `lint`, `typecheck`, `test`, `build`), and `Pagination.test.tsx` is a real caller for the test run. Phases 2–5 land the production callers in the same wave. |
| **(8, reconciler)** Does a caller keep its own `pageCount <= 1` guard, now that `Pagination` returns `null` there itself? Phase 1's handoff said no; phase 2 kept one. | **Per surface, and the answer is not uniform. `/nina/about` KEEPS its guard; the four admin surfaces get NONE.** The full table is under `## The Pagination contract`. | 2: phase exit criteria, plus a pre-existing pinned behaviour the ask does not touch. `NinaAboutPager`'s guard also withholds the `Halaman … dari … · … foto` count line, and `components/nina/NinaAboutScreen.test.tsx:218` pins a single-page collection as showing no `/Halaman/` at all — so dropping it would start rendering "Halaman 1 dari 1" under every small album. The four admin count lines render at `pageCount === 1` today (measured), and `components/admin/PhotoReferencePicker.test.tsx:191-196` pins `page 1 of 1` as shown — so adding a guard there is the same unasked-for change in reverse. Phase 1 could not see either, reasoning from `components/ui` where no count line exists. Its handoff line was struck from `phase-1.md`. |
| **(9, reconciler)** What shape is `Pagination`'s required `label`, and what language is each one in? | **A short noun phrase naming the collection the nav walks, in that surface's own language.** English `<Collection> pages` on the four admin surfaces; Indonesian `Halaman <koleksi>` on `/nina/about`. All seven exact strings are fixed in the label table above and written verbatim into phases 2-5. | 6: surrounding convention, verified against the files rather than assumed. `/nina/about`'s own pager copy is `Halaman … dari …` / `Sebelumnya` / `Berikutnya`, and `components/nina/` pins Indonesian accessible names throughout (`NinaAboutScreen.tsx:639,662,878,906,917,935,959`, plus `NinaSidebar.tsx`, `SessionRow.tsx`, `NinaJobDetail.tsx`, `NinaSearchField.tsx`) — an English label there would be the only English accessible name on the screen. `MEMORY.md`'s *"Kosongkan clear-button idiom is repo-wide"* records the same rule for this package. The admin surfaces are uniformly English. |
| **(10, reconciler)** Phase 5 proposed `tests/admin.pagerSweep.test.ts` to pin invariant 9 across all five surfaces, and refused to write it. Assign it to a phase, or card it? | **Card it as a follow-up. No phase writes it in this set, and the index says plainly that invariant 9 on `/admin/photoshop` and `/admin/error-logs` is verified by grep rather than by a CI gate.** | 1: a stated invariant of the set — *"phases 2, 3, 4 and 5 touch disjoint file sets and share no edge"*, which is what lets them run as one concurrent wave. The sweep must read four files owned by phases running **at the same time**, so whichever phase wrote it would take a dependency on 2, 3 and 4; and there is no "last phase in dependency order" to hang it on, because 2-5 are peers, not a chain. A sixth terminal phase was considered and rejected: it changes the set's shape for one assertion whose content is a grep. The trade is named rather than hidden — invariant 9's proof table says which three surfaces land a committed test and which two do not, and phase 5's exit criterion 5 makes its grep load-bearing and non-skippable. Reversible: the card writes one new file with one owner, against the post-migration tree, and no code moves. |
| **(11, reconciler)** Should the four `hrefForPage` grammars be unified while every call site is being rewritten? | **No. All four stay exactly as they are.** `/admin/photoshop` keeps the absolute `/admin/photoshop?page=N`; `PhotoReferencePicker` keeps the bare `?page=N`; `/admin/nina` keeps `hrefForPage` with page 1 as the ABSENCE of `?page=`; `/admin/error-logs` keeps `errorLogHref(category, n)`. | 1: invariant 3, which forbids changing any URL-grammar helper. Each difference is load-bearing and argued in its own file: the picker's bare query is the only spelling correct on **both** routes that mount it, where `PhotoshopPickerGrid` serves exactly one route; `FileExplorer`'s absent-`?page=` page 1 is pinned by `components/admin/FileExplorer.test.tsx:414-461`. Both phase 4 and phase 5 flagged a reconciler "tidying" these as their top risk — recorded here so the answer outlives this pass. No shared `hrefForPage` factory and no extracted footer component is created across any two surfaces; the only thing they share is `Pagination` itself. |

## Open Questions

**None.** Every fork above was decided on a stated rung and written into the plan files, not merely
logged. Nothing in this set writes to a database, changes a schema, runs a migration, touches Blob
storage, calls an LLM or rewrites published history, so no branch of any fork was irreversible —
`git revert` is the whole of the undo. Both requirement ids have owners (R1 → phases 2, 3, 4, 5;
R2 → phase 1), so there is no unowned `R` to park here either.

## Follow-ups (carded after the set lands — in no phase's scope)

Surfaced during reconciliation and deliberately left out, each with its reason:

1. **`tests/admin.pagerSweep.test.ts`** — one `readRepoCode` source scan asserting, across all
   migrated surfaces, that `codeLines(source)` holds none of `Newer` / `Older` / `Previous` /
   `Next` / `Sebelumnya` / `Berikutnya` and that each pager file contains `<Pagination`. Not in this
   set because it must read four concurrently-owned files (`## Decisions`, fork 10). Write it
   against the **post-migration tree**, one file, one owner — and positive-control the include list,
   per `MEMORY.md`'s *"Adopted plan copies trip string guards"*.
2. **`components/admin/touch.ts`'s `TOUCH_ICON` vs `Pagination.tsx`'s `CELL`** now share the
   substring `inline-flex min-h-11 min-w-11 items-center justify-center`. `touch.ts`'s own header
   pre-authorises the eventual move into the UI barrel *"when a runner-facing control needs the same
   string"* — after this set, `Pagination` is that control. Not here: it edits a file no phase owns
   and churns `DialSlider.tsx` / `UserPicker.tsx` / `PhotoGrid.tsx` / `app/admin/error-logs/page.tsx`
   imports across phase boundaries (`## Decisions`, fork 5 chose the duplication for this set).
3. **`components/admin/explorer/model.ts:207`**'s `ExplorerPageInfo` docblock argues for offsets
   because *"a file manager's pager says '121–240 of 314' and offers Newer as well as Older"*. The
   first half stays true; the second names a control that no longer exists. Historical rationale, no
   test reads it, `model.ts` is out of every phase's scope.
4. **Thirteen line-numbered cross-file citations drift by 3-22 lines** (listed in
   `## Reconciliation Log`, row 8). All point at surviving content. Chasing them would mean editing
   four files no phase owns.
5. **A `docs/architecture.md` pagination note and the `CHANGELOG.md` entry** — close-out tasks for
   the coordinator, not phase steps.

## Rollback

**Per phase:** every phase is one commit touching two or three files; `git revert` of that commit
restores the surface's previous pager with no cross-phase effect, because phases 2–5 share no file.
Phase 3 is the only three-file phase (`PhotoGrid.tsx`, `PhotoGrid.test.tsx`,
`tests/admin.photoGrid.test.ts`) and its revert restores the stepper, the two imports and both test
bodies together. Reverting phase 1 requires reverting 2–5 first (they import it).

**As a whole:** `git branch -D feature/numbered-pagination` before it merges, or revert the merge
commit after. Nothing in this plan writes to the database, changes a schema, calls an LLM, touches
Blob storage, or alters a URL that an existing bookmark depends on — every `?page=` link that
worked before still works, because no URL grammar changes (invariant 3).

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NUMBERED_PAGINATION_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NUMBERED_PAGINATION_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NUMBERED_PAGINATION_PLAN.md
