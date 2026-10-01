# Phase 3: `/admin/nina` — the album and media grids

**Plan set:** `NUMBERED_PAGINATION_PLAN.md`
**Analysis:** `20261001-124300-P4G1_code_analyzer.md`
**Satisfies:** R1 — *"change every pagination system … remove the current pagination UI"*, on the
two arms of `/admin/nina` (the album folder grid and Media)
**Depends on:** Phase 1 — `components/ui/Pagination.tsx` and its re-export from
`components/ui/index.ts` must already exist
**Difficulty:** EASY
**Package:** `components/admin/explorer`

---

## Goal

`/admin/nina`'s photo grid — both the album arm and the Media arm, since one component draws
both — pages by a row of numbers instead of a two-ended `‹ Newer` / `Older ›` stepper. Page 7 is
one tap from page 1 on a 980-row album at `NINA_ADMIN_PAGE_SIZE = 120`, where it used to be six.
The `{first}–{last} of {page.total}` count line, the `border-t border-rule pt-3` rule it hangs
under, and the whole empty-page `EmptyState` branch with its "Go to the first page" `ButtonLink`
are all untouched — only the navigation control is replaced.

## Interface Contract

**Deletes:**

- the `‹ Newer` `<Link rel="prev">` / `<span>` pair and the `Older ›` `<Link rel="next">` /
  `<span>` pair in `PhotoGrid.tsx` (`components/admin/explorer/PhotoGrid.tsx:180-214`). No
  exported symbol is deleted.
- the `import Link from 'next/link'` and `import { TOUCH_ICON } from '@/components/admin/touch'`
  lines (`PhotoGrid.tsx:3`, `:5`) — both existed only for that pager. **Verified by grep:** `Link`
  occurs only at `:182` and `:202`; `TOUCH_ICON` only at `:184`, `:192`, `:204`, `:210`. `cn` stays
  (still used at `:152` on the tile `<img>`).
- `tests/admin.photoGrid.test.ts:141-146`'s test body — its `rel="prev"` / `rel="next"`
  assertions describe exactly the markup being removed.

**Renames:** local `const lastPage` -> local `const pageCount` (`PhotoGrid.tsx:81`). Function-local,
not exported, not referenced outside this file — grep shows the only other `lastPage` in the repo is
`app/admin/error-logs/page.tsx:78`, which is **phase 5's**, independently declared, and unaffected.

**Creates:** no new symbol, no new file. One new call site:
`<Pagination page pageCount hrefForPage label />` inside `PhotoGrid`.

**Signature changes:** none. `PhotoGrid`'s props are byte-for-byte unchanged, `hrefForPage: (page:
number) => string` included — which is exactly why `components/admin/FileExplorer.tsx` needs no
edit. Confirmed by reading `FileExplorer.tsx:291-298` (the `hrefForPage` `useCallback` dispatching
on `view` to `hrefForMediaView` / `hrefForFolder`) and `:689-710` (the two grammar functions). The
new control calls that callback with `1 … pageCount`; the old pager called it with `page ± 1`. Both
are "some integer in range", so the grammar is exercised identically.

**Requires (from earlier phases):**

- `export { Pagination } from './Pagination'` present in `components/ui/index.ts` (Phase 1).
- `Pagination` accepts the `hrefForPage` arm of the union: `{ page, pageCount, label, hrefForPage }`
  with `scroll` and `busy` both optional and omitted here.
- `Pagination` returns `null` when `pageCount <= 1`.
- `Pagination` renders `<nav aria-label={label}>` > `<ul>` > one `<li>` per page, the active page a
  `<span aria-current="page">` and every other page a `<Link>`.

**Two set-wide conventions this phase is bound by (reconciled 2026-10-01):**

1. **No outer `pageCount <= 1` guard here.** `Pagination` withholds itself; the
   `{first}–{last} of {page.total}` count line renders today at `pageCount === 1` and must keep
   doing so. Verified in the worktree: `PhotoGrid.tsx:180-214`'s row has no guard — at
   `pageCount === 1` both ends simply render as greyed `<span>`s and the count line shows. Phase 2
   *does* keep an outer guard on `/nina/about`; that is a per-surface decision driven by a test
   that pins the count line as absent there, and it does not generalise to this file. Index
   `## Decisions`, fork 8.
2. **The `label` strings are fixed:** `label={view === 'media' ? 'Media pages' : 'Folder pages'}`,
   exactly as written in Step 5. The set's convention is a short noun phrase naming the collection
   the nav walks, in that surface's own language — English `<Collection> pages` on the four admin
   surfaces, Indonesian `Halaman <koleksi>` on `/nina/about`. Do not rename these to match another
   phase's string; the shape is shared, the nouns are not. Index `## Decisions`, fork 9.

**Leaves alone (owned by others):**

- `components/ui/Pagination.tsx`, `components/ui/Pagination.test.tsx`, `components/ui/index.ts`
  (Phase 1)
- `components/nina/NinaAboutScreen.tsx` + test (Phase 2)
- `components/admin/PhotoReferencePicker.tsx` + test (Phase 4)
- `components/admin/PhotoshopPickerGrid.tsx`, `app/admin/error-logs/page.tsx` (Phase 5)
- `components/admin/FileExplorer.tsx`, `components/admin/FileExplorer.test.tsx`,
  `app/admin/nina/page.tsx`, `components/admin/explorer/model.ts`,
  `components/admin/explorer/SearchResultsGrid.tsx`, `components/admin/touch.ts`,
  `tests/admin.photoSearch.test.ts` (owned by nobody in this set; unchanged)

## Files

| File | Action | What changes |
|---|---|---|
| `components/admin/explorer/PhotoGrid.tsx` | modify | imports (`:1-10`), header docblock (`:56-61`), the `view` prop's docblock line (`:73`), `lastPage` -> `pageCount` (`:81`), the pager row (`:180-214`) |
| `components/admin/explorer/PhotoGrid.test.tsx` | modify | `within` added to the RTL import (`:2`); the two stepper tests (`:163-193`) become three numbered-row tests |
| `tests/admin.photoGrid.test.ts` | modify | the `keeps the pager and the empty state working` test (`:141-146`) — it asserts `rel="prev"` / `rel="next"`, the exact markup this phase removes, so it goes red unless rewritten |

> **Settled by the reconciler, 2026-10-01 — this phase owns three files, not two.** The draft index
> listed it as **2**; the index now says **3** and names `tests/admin.photoGrid.test.ts` in this
> phase's `Owns`. Re-verified in the worktree: that suite's only subject is
> `components/admin/explorer/PhotoGrid.tsx` (`tests/admin.photoGrid.test.ts:29`,
> `const grid = read('components/admin/explorer/PhotoGrid.tsx')`), it is 147 lines, and its last
> test (`:141-146`, `'keeps the pager and the empty state working'`) asserts `rel="prev"` and
> `rel="next"` — the exact two attributes Step 5 deletes. **No other phase claims it:** phase 5's
> `Leaves alone` already assigns it here, and phases 1, 2 and 4 never name it. Invariant 1 ("every
> gate passes at the end of each phase, independently") leaves no alternative — leaving it to a
> follow-up would land this phase red.
>
> Note also that `tests/admin.photoGrid.test.ts` was **missing from the analysis document's Impact
> Points table**, which is why the draft index undercounted. The reconciler added it there as
> impact point 12 and to the Reference List.

## Implementation Steps

### Step 1: Swap the imports — `Pagination` in, `next/link` and `TOUCH_ICON` out

**File:** `components/admin/explorer/PhotoGrid.tsx:1-10`

**Change:** `Link` and `TOUCH_ICON` were imported solely for the stepper. The numbered row's own
`<Link>`s and its 44 px tap floor both live inside `components/ui/Pagination.tsx` — the plan's
`## Decisions` fork 5 settled that the tap-target string is spelled locally there rather than
borrowed from `components/admin/touch`, because `ui` -> `admin` is an inverted dependency
(invariant 4). Removing the `next/link` import empties the external-import group entirely; there is
no `import/order` or `simple-import-sort` rule in `eslint.config.mjs` and no import-sorting prettier
plugin (`.prettierrc` loads `prettier-plugin-tailwindcss` only), so the remaining two groups just
close up.

**Code:** replace lines 1-10 in full with:

```tsx
'use client'

import { ButtonLink, EmptyState, Pagination } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { ExplorerView } from '@/lib/admin/filetree'
import type { ExplorerPageInfo, ExplorerPhoto } from './model'
```

**Impact:** the file drops three lines. Everything below shifts up by 3, which is why the header
docblock in Step 2 is quoted by content rather than by line number. `cn` is still imported and still
used once, at the tile `<img>`'s `className` — do not remove it.

---

### Step 2: Record the swap in the header docblock

**File:** `components/admin/explorer/PhotoGrid.tsx:56-61` (the `── A PLAIN <img> …` section, the
last one before the docblock closes)

**Change:** append one section to the file's header, in its existing `── TITLE ───` idiom, so the
next reader learns why the tap floor is not `TOUCH_ICON` here without having to find the plan.

**Code:** find the docblock's final lines, which read exactly:

```
 * ── A PLAIN `<img>`, FOR THE REASON THIS REPO HAS ALREADY RULED ─────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rejects `next/image` for Blob-hosted photos outright —
 * it would re-optimise finished files on a paid transform quota. `PhotoReferencePicker` makes the
 * same call. The derived thumbnail is this repo's answer to image optimisation for these blobs,
 * and it is written at upload time rather than bought per request.
 */
```

and replace them with:

```
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
```

**Impact:** comment only. Every continuation line starts with `*`, so
`tests/admin.photoGrid.test.ts`'s `codeLines()` strips the whole block — the words `Newer` and
`Older` appearing here cannot trip that suite's negative assertions (Step 6 relies on this, and the
same rule is why `tests/admin.photoSearch.test.ts:117-119` already tolerates
`SearchResultsGrid.tsx:28`'s identical mention).

---

### Step 3: The `view` prop now feeds the pager's accessible name too

**File:** `components/admin/explorer/PhotoGrid.tsx:73` (pre-edit numbering; `:70` after Step 1)

**Change:** the prop's docblock says *"Only the EMPTY copy branches on it."* That stops being true:
one component draws both arms of `/admin/nina`, and the `Pagination` contract requires a `label`
that says which collection a `<nav>` walks. Branching the label on `view` is the only way to honour
that for a shared grid, so the comment is corrected rather than left lying.

**Code:** replace this one line

```tsx
  /** Phase 1's: which collection this grid is. Only the EMPTY copy branches on it. */
```

with

```tsx
  /** Phase 1's: which collection this grid is. The EMPTY copy and the pager label branch on it. */
```

**Impact:** comment only. 99 characters at this indent, inside `printWidth: 100`.

---

### Step 4: `lastPage` becomes `pageCount`

**File:** `components/admin/explorer/PhotoGrid.tsx:79-81` (pre-edit numbering; `:76-78` after
Step 1)

**Change:** the expression is already exactly the contract's `pageCount`
(`Math.max(1, Math.ceil(total / pageSize))`); only the name changes, so the prop it feeds reads as
the prop it is. `first` and `last` stay — the count line still needs both, and the plan's
`## Decisions` fork 1 keeps that line.

**Code:** replace

```tsx
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))
```

with

```tsx
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  /* The control's own definition of the word, verbatim: always >= 1, so an empty folder still has
     a page 1 — and `Pagination` renders nothing at all when it is exactly 1. */
  const pageCount = Math.max(1, Math.ceil(page.total / page.pageSize))
```

**Impact:** `pageCount` is read once, in Step 5. The `photos.length === 0` branch below never read
`first`, `last` or `lastPage` and still does not — leave lines 83-113 (the whole `EmptyState`
branch, `ButtonLink href={hrefForPage(1)}` included) exactly as they are.

---

### Step 5: Replace the stepper row with the numbered control

**File:** `components/admin/explorer/PhotoGrid.tsx:180-214` (pre-edit numbering; `:177-211` after
Step 1 — note this is the exact range `app/admin/error-logs/page.tsx:116` cites as the thing it
copied by hand, which is phase 5's problem, not this one's)

**Change:** the four-element `justify-between` line — disabled-or-live `‹ Newer`, count,
disabled-or-live `Older ›` — collapses to a stacked column: the count line, then the numbered row.
Stacked rather than `justify-between` because the numbers `flex-wrap` (invariant 6: no ellipsis, no
window), and a wrapping child inside a `justify-between` line drags the count line sideways as the
page count changes — the same "the live control does not move under a thumb" concern the old
disabled-end comment was written for, answered a different way now that the control is a block.

**Code:** replace the whole `<div className="mt-4 flex items-center justify-between …">` element —
lines 180 through 214 inclusive, i.e. everything from `<div className="mt-4` down to and including
the `</div>` that closes it, leaving the outer `</div>` and `)` and `}` alone — with:

```tsx
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
```

**Impact:**

- `rel="prev"` / `rel="next"` leave the file. That is what breaks
  `tests/admin.photoGrid.test.ts:141-146`; Step 6 fixes it.
- `Link` and `TOUCH_ICON` lose their last uses, which is what makes Step 1's import removal legal.
- `tests/admin.photoGrid.test.ts`'s `sheet` slice is `grid.slice(grid.indexOf('<ul'),
  grid.indexOf('</ul>'))` and its `tileRaw` slice runs `'<li key={photo.id}'` to the first
  `'</li>'`. Both bound the `<ul>` sheet above this row, and nothing here adds a `<ul` or a `<li`
  to this file — `Pagination` owns those tags in its own file. Both slices are unmoved, so the
  tile-scoped assertions at `:62-130` (including `expect(tile).not.toContain('hover:')`, which the
  control's `hover:bg-accent-soft` would otherwise have threatened had it been written here) stay
  green untouched.
- The class strings above are in `prettier-plugin-tailwindcss` order already: `flex flex-col
  items-center` is the sorted form (precedent in-repo), and `… gap-2 border-t border-rule pt-3` is
  the order the plugin produced for this very line before the edit. Run `npm run format` anyway.

---

### Step 6: Rewrite the source-scan suite's pager test

**File:** `tests/admin.photoGrid.test.ts:141-146`

**Change:** this suite reads `components/admin/explorer/PhotoGrid.tsx` as text and asserts over it.
Its last test pins `rel="prev"` and `rel="next"` — the two attributes Step 5 deletes — so it goes
red on this phase's first edit. It is rewritten to pin the new property instead: the stepper is gone
in both words and both glyphs, the numbered row is the shared control rather than a second
hand-rolled one (invariant 2), and the rule plus the count line and the empty state all survived.

Negative assertions use `codeLines(grid)` and not `grid`, for this file's standing reason: the
header docblock *cites* the stepper it replaced, and a comment must never be able to satisfy or trip
a source assertion. This is the same rule `:122` already applies to `next/image` and
`tests/admin.photoSearch.test.ts:117-119` applies to `SearchResultsGrid.tsx:28`.

**Code:** replace

```ts
  it('keeps the pager and the empty state working', () => {
    expect(grid).toContain('rel="prev"')
    expect(grid).toContain('rel="next"')
    expect(grid).toContain('<EmptyState')
    expect(grid).toContain('<ButtonLink')
  })
```

with

```ts
  it('pages by the one shared numbered control, and keeps the count line and the empty state', () => {
    const code = codeLines(grid)
    // The stepper is gone in every spelling it had: the words, the `rel` hints that made them a
    // prev/next pair, and the admin-only tap-target string it borrowed. `codeLines` and not
    // `grid`, because the header docblock cites all three in order to record what replaced them.
    expect(code).not.toContain('Newer')
    expect(code).not.toContain('Older')
    expect(code).not.toContain('rel="prev"')
    expect(code).not.toContain('rel="next"')
    expect(code).not.toContain('TOUCH_ICON')
    expect(code).not.toContain("from 'next/link'")
    // One control, not a second hand-rolled row: the numbers, their hrefs and `aria-current` all
    // live in `components/ui/Pagination.tsx`, which is the whole point of having it.
    expect(code).toContain('<Pagination')
    expect(code).not.toContain('aria-current')
    // What survived the swap: the rule, the range above it, and the empty-page branch's way back.
    expect(code).toContain('border-t border-rule pt-3')
    expect(code).toContain('of {page.total}')
    expect(grid).toContain('<EmptyState')
    expect(grid).toContain('<ButtonLink')
  })
```

**Impact:** the suite's other nine tests are untouched and unaffected — every one of them is scoped
to `tile`, `tileRaw`, `sheet`, or to properties this phase does not change (`'use client'`,
`next/image`, `@/lib/db`, `'use server'`, `useEffect`). Note `:72-83`'s comment, which says *"the
pager below the sheet keeps its `border-t` rule"*: still true, and now asserted above.

---

### Step 7: Rewrite the component suite's two stepper tests

**File:** `components/admin/explorer/PhotoGrid.test.tsx:2` and `:163-193`

**Change:** `within` joins the RTL import so each assertion can be scoped to the pager `<nav>` — the
count line and the numbered row both contain bare digits, and an unscoped `getByText('1')` would be
ambiguous the moment a page count reaches two digits. Then the two stepper tests become three: the
numbered row on page 1, the five-page jump the stepper could not express, and the Media arm with the
active page in the middle of the range.

**Code (a):** replace line 2

```tsx
import { render, screen } from '@testing-library/react'
```

with

```tsx
import { render, screen, within } from '@testing-library/react'
```

**Code (b):** replace lines 163-193 — the two tests `'renders the Newer/Older pager range and
disables the ends'` and `'disables Older on the last page'`, from `  it('renders the Newer/Older`
down to the `})` that closes the second one, leaving the file's final `})` alone — with:

```tsx
  it('renders every page as its own number, with the active page marked and not a link', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 1, pageSize: 60, total: 120 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    // The count line is NOT the pagination UI that went: it answers "how many rows are there",
    // which a row of numbers cannot.
    expect(screen.getByText('1–60 of 120')).toBeInTheDocument()

    const pager = screen.getByRole('navigation', { name: 'Folder pages' })
    // Page 1 is where we already are, so it is a marked span with nowhere to navigate to.
    const current = within(pager).getByText('1')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.tagName).toBe('SPAN')
    expect(within(pager).getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '/explorer?page=2',
    )
    // No stepper survives anywhere on the surface, as a word or as a glyph.
    expect(screen.queryByText(/Newer|Older/)).not.toBeInTheDocument()
  })

  it('reaches the last of five pages in one tap, with no window and no ellipsis', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 1, pageSize: 60, total: 300 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    const pager = screen.getByRole('navigation', { name: 'Folder pages' })
    // The ask, literally — `1 2 3 4 5`, all of them — and the reason for it: page 5 is one tap
    // from page 1, where the stepper this replaced made it four.
    expect(within(pager).getAllByRole('listitem')).toHaveLength(5)
    expect(within(pager).getByRole('link', { name: '5' })).toHaveAttribute(
      'href',
      '/explorer?page=5',
    )
    expect(within(pager).queryByText('…')).not.toBeInTheDocument()
  })

  it('marks whichever page we are on, and names the Media arm as its own collection', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 2, pageSize: 60, total: 120 })}
        view="media"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    // One grid draws both arms of /admin/nina, so the pager has to say which one it walks.
    const pager = screen.getByRole('navigation', { name: 'Media pages' })
    expect(within(pager).getByText('2')).toHaveAttribute('aria-current', 'page')
    expect(within(pager).getByRole('link', { name: '1' })).toHaveAttribute(
      'href',
      '/explorer?page=1',
    )
    expect(within(pager).queryByRole('link', { name: '2' })).not.toBeInTheDocument()
  })
```

**Impact:**

- The eight tests above (`:36-161`) are untouched and stay green. Six of them pass `total: 1`,
  which is `pageCount === 1`, so `Pagination` returns `null` and they render no pager at all —
  previously they rendered a fully-disabled stepper that none of them asserted on. The two
  `EmptyState` tests at `:119-161` take the `photos.length === 0` branch, which never reaches the
  pager; `:147-161`'s `getByRole('link', { name: 'Go to the first page' })` is the `ButtonLink`,
  untouched.
- `next/link` is not mocked in this file and never was — the existing `:163-193` already queried
  `getByRole('link')` against a real `next/link` render under happy-dom, so the control's `<Link>`
  cells resolve to `<a href>` the same way.
- The `view="media"` test renders a non-empty `photos` array, so it takes the grid branch and not
  the media `EmptyState` branch.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit` — vitest does not typecheck), then
`npm run build`

**Tests:**

```bash
npx vitest run components/admin/explorer/PhotoGrid.test.tsx
npx vitest run tests/admin.photoGrid.test.ts
# the two suites that must stay green WITHOUT being edited:
npx vitest run components/admin/FileExplorer.test.tsx
npx vitest run tests/admin.photoSearch.test.ts
npm test
```

**Lint / format:** `npm run lint && npm run format` then `npm run format:check`.
`prettier-plugin-tailwindcss` owns class order; let it rewrite rather than hand-tuning.

**Guards:** `npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:openrouter-guard &&
npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f11-guard &&
npm run ci:schema-drift-guard`. None of the seven has a stake in this change — no `db` import, no
Recharts, no `yAxisId`, no OpenRouter call, no secret, no LLM payload, no schema — but invariant 1
asks for all seven per phase.

**Manual check:** `npm run dev`, then

- `/admin/nina` with a folder holding more than 120 rows: a wrapping row of numbers under the
  count line, the current one filled `bg-ink text-card`, every other one a link. Tap the highest
  number and land there in one navigation, URL `?folder=<f>&page=N` (and plain `/admin/nina` for
  page 1 — the grammar did not change).
- `/admin/nina?view=media` with more than 48 message images: the same row, and every link keeps
  `view=media`.
- A folder with one page: count line only, no pager.
- Navigate past the end by hand (`?page=99`): the `EmptyState` with "Go to the first page" still
  renders and still works.
- At 414 px: numbers wrap onto a second line rather than overflowing; each cell is ≥ 44 px square.

**Exit criteria:** `PhotoGrid.tsx` contains no `Newer`, `Older`, `rel="prev"`, `rel="next"`,
`TOUCH_ICON` or `next/link` outside its header comment; it renders exactly one
`<Pagination hrefForPage={hrefForPage} />` under the unchanged `border-t border-rule pt-3` rule with
the `{first}–{last} of {page.total}` line above it; all three suites named above pass, and
`FileExplorer.test.tsx` and `tests/admin.photoSearch.test.ts` pass **without having been edited**.

## Handoffs

1. **Stale cross-file line citations.** This phase shortens `PhotoGrid.tsx` by ~20 lines, so five
   docblocks elsewhere that cite it by line drift: `components/admin/PhotoReferencePicker.tsx:31`
   (`PhotoGrid.tsx:79-105`), `components/admin/explorer/SearchResultsGrid.tsx:17`
   (`PhotoGrid.tsx:115-178`), `components/admin/photoReferenceModel.ts:127`
   (`PhotoGrid.tsx:22-28`), `components/admin/ErrorLogList.tsx:115` (`PhotoGrid.tsx:133`), and
   `app/admin/error-logs/page.tsx:116` (`PhotoGrid.tsx:177-211`'s pager — which this phase does not
   merely move but deletes). Four of those files belong to nobody in this set and one
   (`app/admin/error-logs/page.tsx`) is **phase 5's**. Deliberately not chased: chasing them is
   scope creep into four files I do not own, and `PhotoReferencePicker.tsx` is phase 4's live
   editing surface. **Phase 5** should drop or repoint its `PhotoGrid.tsx:177-211` citation while it
   is in that file anyway, since the thing cited no longer exists.
2. **`components/admin/explorer/model.ts:207`.** Its `ExplorerPageInfo` docblock argues for offsets
   over a keyset cursor because *"a file manager's pager says '121–240 of 314' and offers Newer as
   well as Older"*. The first half stays true (the count line is kept); the second half names a
   control that no longer exists. `model.ts` is explicitly out of this phase's scope, the sentence
   is a historical rationale rather than a live claim, and no test reads it. Left as found — a
   follow-up card, not a phase edit.
3. **Nothing here serves R2.** The numbered row's markup, its `aria-current`, its 44 px floor and
   its null-at-one-page rule are all phase 1's. If an implementer finds themselves writing a `<li>`
   or an `aria-current` inside `PhotoGrid.tsx`, they have crossed into phase 1's requirement and
   broken invariant 2 — stop and consume the control instead.

## Rollback

`git revert` this phase's single commit. It touches three files in two packages, shares no file
with phases 2, 4 or 5, and the revert restores the `‹ Newer` / `Older ›` stepper, the two imports,
and both test bodies together. No URL changes, so every existing `/admin/nina?folder=…&page=N`
bookmark works identically before and after the revert in either direction. No database write, no
migration, no schema change, no network call.

Reverting phase 1 requires reverting this phase first — `PhotoGrid.tsx` imports `Pagination` from
the barrel after this lands.
