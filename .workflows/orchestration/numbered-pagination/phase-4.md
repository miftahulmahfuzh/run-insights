# Phase 4: `/admin/image-generation` + the job anchor picker

**Plan set:** `NUMBERED_PAGINATION_PLAN.md`
**Analysis:** `20261001-124300-P4G1_code_analyzer.md` (§A2, Impact Points 8 and 9)
**Satisfies:** R1 — *"change every pagination system … remove the current pagination UI"*, for the
two surfaces that mount `PhotoReferencePicker`: `/admin/image-generation` and
`/nina/jobs/[id]/anchor`.
**Depends on:** Phase 1 (`components/ui/Pagination.tsx` + its re-export from
`components/ui/index.ts`)
**Difficulty:** NORMAL
**Package:** `components/admin`

---

## Goal

After this phase, the photo-reference picker's `Previous` / `Next` `ButtonLink` pair is gone and a
row of every page number sits under the grid, with the current page drawn as a non-interactive
`aria-current="page"` cell. From page 1 of 3 a runner reaches page 3 in one tap instead of two, on
both routes that mount the component, because the component is shared and its props do not change.
Everything else about the picker — the status line, `Clear reference`, the `scrollIntoView` effect,
the prefetch hints, the `view.missing` paragraph, and both `collapsible` mount shapes — survives
byte-for-byte or with only its prose updated.

## Interface Contract

**Deletes:**
- the `Previous` `ButtonLink` (`components/admin/PhotoReferencePicker.tsx:353-357`)
- the `Next` `ButtonLink` (`components/admin/PhotoReferencePicker.tsx:358-362`)
- the right-hand `<div className="flex flex-wrap items-center gap-2">` cluster wrapper
  (`components/admin/PhotoReferencePicker.tsx:352,373`) — it held exactly those two links plus
  `Clear reference`, and with the links gone it wraps a single child

**Renames:** none.

**Creates:** no new exported symbol. One new JSX element inside `PhotoReferencePicker`'s `body`:
`<Pagination page={page} pageCount={pageCount} label="Photo reference pages" hrefForPage={(n) => `?page=${n}`} scroll={false} className="mt-2" />`.

**Signature changes:** none. `PhotoReferencePicker`'s prop object
(`components/admin/PhotoReferencePicker.tsx:117-181`) is unchanged — same eleven props, same types,
same JSDoc field set. **Verified by reading both call sites, not assumed:**
- `components/admin/ImageGenPanel.tsx:1076-1087` passes
  `items total page pageCount preloadUrls value selectedId onChange fullViewHref collapsible`
- `components/nina/NinaJobAnchorPicker.tsx:83-94` passes the same ten, with
  `fullViewHref={null}` and `collapsible={false}`

Neither needs an edit, and neither is touched by this phase.

**Requires (from earlier phases):**
- `export { Pagination } from './Pagination'` exists in `components/ui/index.ts` (Phase 1). Today
  `components/ui/index.ts` ends at line 45 with `export { ZoneBar } from './ZoneBar'` and there is
  no `Pagination` anywhere in the repo (grep over `components/ lib/ app/ tests/` returns nothing) —
  this phase does not build until Phase 1 lands.
- `Pagination` returns `null` when `pageCount <= 1` (Phase 1 contract). The one-page case in this
  component renders no pager at all and the plan's own test asserts that; this phase does **not**
  guard the call site with its own `pageCount > 1 &&`, because a second guard would be a second
  opinion about the same rule.

  *Reconciled 2026-10-01:* phase 2 **does** keep an outer `pageCount <= 1` guard on `/nina/about`,
  and that is correct there and wrong here. The difference is what the guard would also withhold:
  on `/nina/about` it withholds the count line, which `NinaAboutScreen.test.tsx:218` pins as absent
  on a single-page collection; here the count line is pinned as **present** —
  `components/admin/PhotoReferencePicker.test.tsx:191-196` (`'offers neither Previous nor Next when
  the whole collection is one page'`) asserts `getByText(/page 1 of 1/)`, and Step 7b's rewrite
  keeps that assertion. An outer guard here would turn that test red and change behaviour nobody
  asked to change. Index `## Decisions`, fork 8.

**Label (reconciled 2026-10-01):** `label="Photo reference pages"`, exactly as written in Step 6 —
the string this phase chose is the one the set adopted. The convention it now stands for: a short
noun phrase naming the collection the nav walks, in that surface's own language — English
`<Collection> pages` on the four admin surfaces, Indonesian `Halaman <koleksi>` on `/nina/about`
(which is an Indonesian-language screen). The final strings are `Halaman foto profil` /
`Halaman media` (phase 2), `Media pages` / `Folder pages` (phase 3), `Photo reference pages`
(this phase), `Photo pages` / `Error log pages` (phase 5). Index `## Decisions`, fork 9.
- `Pagination` honours `scroll` by forwarding it to every `<Link>` (Phase 1 contract). Invariant 5
  depends on this: `scroll={false}` is what the `scrollIntoView` effect below exists to compensate
  for.
- `Pagination` renders `<nav aria-label={label}>` (Phase 1 contract). The rewritten tests address
  the pager through `getByRole('navigation', { name: 'Photo reference pages' })`.

**Leaves alone (owned by others):**
- `components/admin/ImageGenPanel.tsx`, `components/nina/NinaJobAnchorPicker.tsx`,
  `app/admin/image-generation/page.tsx`, `app/nina/jobs/[id]/anchor/page.tsx`,
  `components/admin/photoReferenceModel.ts`, `lib/nina/imageprefs.ts`
  (`NINA_PHOTO_REF_PAGE_SIZE = 99` stays)
- `tests/admin.photoReference.test.ts` — read, not edited; see **Source-scan audit** below
- `components/ui/Pagination.tsx` and `components/ui/index.ts` (Phase 1)
- `components/nina/NinaAboutScreen.tsx` (Phase 2),
  `components/admin/explorer/PhotoGrid.tsx` (Phase 3),
  `components/admin/PhotoshopPickerGrid.tsx` and `app/admin/error-logs/page.tsx` (Phase 5)

## The URL grammar does not change

The new control emits `?page=1`, `?page=2`, … — a **bare query string**, no path. That is this
component's existing grammar, not a new one: today's `Previous` link on page 2 already emits
`?page=1` (`href={`?page=${page - 1}`}`, line 354). The bare query is what lets one component serve
two different routes — `/admin/image-generation` and `/nina/jobs/[id]/anchor` — and page 1 is
spelled `?page=1` here, **not** as the absence of `?page=`. The plan index's "page 1 is the absence
of `?page=`" note is about `FileExplorer.tsx`'s `hrefForPage` (Phase 3's neighbourhood), and does
not apply to this file. Nothing in this phase makes `?page=1` reachable that was not reachable
before; it only makes it reachable from page 5 as well as from page 2.

## Where the pieces sit afterwards

The footer today is one `justify-between` row: a left-hand status paragraph and a right-hand
cluster of `Previous` / `Next` / `Clear reference`.

After this phase:

1. **The status paragraph stays exactly where it is** — first child of the same
   `mt-2 flex flex-wrap items-center justify-between gap-2` row, same classes, same text. Plan
   `## Decisions` fork 1: the count line is not the pagination UI being removed.
2. **`Clear reference` stays on that row**, now as its direct second child. It is an *action on the
   selection*, not navigation — it belongs beside the line that names the selection, and
   `justify-between` keeps it pinned right exactly where it renders today. Its own test
   (`PhotoReferencePicker.test.tsx:230-235`) and the missing-reference test's
   `getByRole('button', { name: 'Clear reference' })` (line 132) both keep passing unchanged.
3. **The numbered row is its own full-width line below**, because `Pagination` centres itself
   (`justify-center`, Phase 1 contract) and a centred row cannot share a `justify-between` line
   with a left-aligned paragraph without one of the two lying about its alignment.

## Files

| File | Action | What changes |
|---|---|---|
| `components/admin/PhotoReferencePicker.tsx` | modify | import `Pagination`; new header docblock section; three prose paragraphs rewritten (they name `Previous`/`Next`); the two pager `ButtonLink`s and their wrapper `<div>` replaced by one `<Pagination>` |
| `components/admin/PhotoReferencePicker.test.tsx` | modify | import `within`; three pager tests rewritten against the numbered row; one new jump test added |

## Source-scan audit — `tests/admin.photoReference.test.ts`

Read in full before planning. It never renders; it asserts over source text. Its `codeLines()`
transform (line 50-63) drops every line whose trimmed form starts with `//`, `*`, `/*` or `{/*`.
Assertion by assertion, and why each still holds:

| Assertion | Line | Still true because |
|---|---|---|
| `picker.startsWith("'use client'")` | 228 | line 1 is untouched |
| `tileRaw` contains `eslint-disable-next-line @next/next/no-img-element` | 252 | `tileRaw = picker.slice(picker.indexOf('<li key={tile.key}'), picker.indexOf('</li>'))` — lines 304-342, entirely outside every edit in this phase |
| `tileRaw` contains `'no thumbnail'` | 253 | same slice, untouched |
| `codeLines(picker)` has no `next/image` | 254 | the only import added is `Pagination`, onto the existing `@/components/ui` line |
| `codeLines(picker)` has no `@/lib/db` | 259 | no import added but `Pagination` |
| `codeLines(picker)` has no `@/lib/nina/queries` | 260 | same |
| `codeLines(picker)` has no `'use server'` | 261 | same |
| `codeLines(picker)` has no `Action(` | 262 | no new call of any kind; the new JSX calls only `hrefForPage`'s own arrow |
| the `ImageGenPanel` mount assertions | 267-272 | `components/admin/ImageGenPanel.tsx` is not touched |
| the model assertions (`PhotoReferenceItem`'s three fields, `PHOTO_REFERENCE_MIN_TILE_PX`, `photoReferenceView`) | 84-209, 242-246 | `components/admin/photoReferenceModel.ts` is not touched |

Line 154's `'draws every item handed to it — there is no page-size concept left in this module'`
is an assertion about `photoReferenceView` in the **model**. This phase introduces no page-size
concept anywhere: `pageCount` is still computed by the two pages and handed in as a prop, and the
picker still draws `view.tiles` in full.

**Two mechanical rules this phase must obey so the scan keeps working:**

- Every continuation line of every block/JSX comment must start with `*` after trimming, or
  `codeLines` will stop stripping it and the file's own explanatory prose becomes assertable text.
  All three rewritten paragraphs and the new header section below follow that.
- Nothing may be added inside the `<li key={tile.key}> … </li>` slice. Nothing in this phase is.

## Implementation Steps

### Step 1: Import `Pagination` from the UI barrel
**File:** `components/admin/PhotoReferencePicker.tsx:6`
**Change:** add `Pagination` to the existing `@/components/ui` import. `Button` and `ButtonLink`
both stay — `Button` is `Clear reference` (line 364) and `ButtonLink` is `fullViewButton`
(line 259), neither of which this phase touches.
**Code:** replace line 6

```tsx
import { Button, ButtonLink, EmptyState } from '@/components/ui'
```

with

```tsx
import { Button, ButtonLink, EmptyState, Pagination } from '@/components/ui'
```

**Impact:** nothing compiles until Phase 1 has landed `components/ui/Pagination.tsx` and its
re-export. Import order is unchanged (same module specifier, same position), so
`npm run lint`'s import-order rule and `format:check` are unaffected.

---

### Step 2: Record the decision in the header docblock
**File:** `components/admin/PhotoReferencePicker.tsx:104-106`
**Change:** insert a new section between the `collapsible` section's last line (104) and the
`THE "FULL VIEW" BUTTON DOES NOT PARSE `key`` heading (106). House style: this component argues
every piece of itself, and the pager is now a piece worth arguing.
**Code:** replace

```tsx
 * `NinaJobAnchorPicker.tsx` mounts this as the ENTIRE content of its own dedicated
 * `/nina/jobs/[id]/anchor` page — there `collapsible` is `false`, because a grid that is the whole
 * reason the page exists must not open collapsed; a runner who lands here should see photographs,
 * not a closed disclosure they have to know to tap.
 *
 * ── THE "FULL VIEW" BUTTON DOES NOT PARSE `key` (2026-09-20) ────────────────────────────────────
```

with

```tsx
 * `NinaJobAnchorPicker.tsx` mounts this as the ENTIRE content of its own dedicated
 * `/nina/jobs/[id]/anchor` page — there `collapsible` is `false`, because a grid that is the whole
 * reason the page exists must not open collapsed; a runner who lands here should see photographs,
 * not a closed disclosure they have to know to tap.
 *
 * ── THE PAGER IS A ROW OF NUMBERS, NOT A STEPPER (2026-10-01) ───────────────────────────────────
 * `Previous`/`Next` are gone. The shared `components/ui/Pagination.tsx` draws one cell per page —
 * `1 2 3 4 5 6`, every number, no window and no ellipsis — and the current page is a
 * non-interactive `aria-current="page"` cell rather than a link to where you already are. The
 * reason is the defect the stepper had and could not be tuned out of: page 6 was five taps from
 * page 1, and `NINA_PHOTO_REF_PAGE_SIZE` is 99, so a runner hunting one photograph in a
 * five-hundred-row union walked past four pages to reach the fifth. A tap is now a jump.
 *
 * The href is a BARE query (`?page=3`), not an absolute path, and that is load-bearing rather than
 * incidental: this one component is mounted on two different routes — `/admin/image-generation`
 * and `/nina/jobs/[id]/anchor` — and a bare query is the only spelling that is correct on both.
 * `PhotoshopPickerGrid.tsx` is a near-copy of this footer and keeps its own absolute-path grammar
 * for the opposite reason: it has exactly one route. Do not unify the two.
 *
 * `scroll={false}` is forwarded to every cell, for the same reason the old `ButtonLink`s carried
 * it — see the `scrollIntoView` effect below, which is what pays for turning Next's scroll-to-top
 * off. The pager renders nothing at all when `pageCount <= 1`; the `page N of M` line beside
 * `Clear reference` still does, because a row of numbers cannot say how many photographs exist.
 *
 * ── THE "FULL VIEW" BUTTON DOES NOT PARSE `key` (2026-09-20) ────────────────────────────────────
```

**Impact:** documentation only. Every inserted line begins with `*` after trimming, so
`codeLines()` strips the whole block and none of this prose reaches the source-scan assertions.

---

### Step 3: Rewrite the `preloadUrls` prop doc, which names the removed controls
**File:** `components/admin/PhotoReferencePicker.tsx:142-147`
**Change:** the paragraph says the hints exist "so a `Previous`/`Next` click finds its images
already warming". Those words name controls that no longer exist. Rewrite the paragraph rather
than leave a stale one, and say the thing the numbered row makes newly worth saying: the read still
computes only the two neighbours, and that is now a *likelihood* bet rather than a *reachability*
one.
**Code:** replace

```tsx
  /**
   * Thumbnail (or original) URLs for the page either side of `page` — `listNinaPhotoReferences`'s
   * `preloadUrls`, rendered below as `<link rel="prefetch">` hints so a `Previous`/`Next` click
   * finds its images already warming in the browser instead of starting cold.
   */
  preloadUrls: readonly string[]
```

with

```tsx
  /**
   * Thumbnail (or original) URLs for the page either side of `page` — `listNinaPhotoReferences`'s
   * `preloadUrls`, rendered below as `<link rel="prefetch">` hints so a tap on an adjacent number
   * in the pager finds its images already warming in the browser instead of starting cold.
   *
   * Still exactly the two neighbours, unchanged by the 2026-10-01 numbered pager: every page is
   * now one tap away, but the pages either side of this one are still the likely next stop, and
   * warming all of them would mean prefetching the whole collection on every render. This is a
   * bet on where the runner goes next, not a claim about where they CAN go.
   */
  preloadUrls: readonly string[]
```

**Impact:** documentation only; `preloadUrls`' type and every caller are unchanged. The
`renders a prefetch hint for every preload URL` and `renders no prefetch hints` tests
(`PhotoReferencePicker.test.tsx:216-228`) are untouched and keep passing.

---

### Step 4: Rewrite the `scrollIntoView` effect's comment — the effect itself does not change
**File:** `components/admin/PhotoReferencePicker.tsx:191-207`
**Change:** the comment names `Previous`/`Next` and `ButtonLink`'s `scroll={false}`. The *effect*
is correct as written and must not be touched: it is keyed on the `page` **prop**, not on a click,
which is exactly why it survives a change to how the page is chosen. Only the prose moves.
**Code:** replace lines 191-207

```tsx
  /*
   * `Previous`/`Next` swap the whole page's RSC payload (`?page=` is a real navigation, not local
   * state), and `ButtonLink`'s `scroll={false}` below turns off Next's default scroll-to-top for
   * it — so without this effect the viewport would just stay wherever it was, which on a page
   * taller than the grid is usually still scrolled past the top. Scrolling the section itself into
   * view puts the first row back under the pointer instead. Skipped on mount: the section is
   * already in view on first load, and the component instance (and its `sectionRef`) persists
   * across the `page`-prop change a Previous/Next click causes, so the effect fires exactly on
   * that change.
   */
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    sectionRef.current?.scrollIntoView?.({ block: 'start' })
  }, [page])
```

with

```tsx
  /*
   * A pager cell swaps the whole page's RSC payload (`?page=` is a real navigation, not local
   * state), and the `scroll={false}` this file hands `Pagination` below turns off Next's default
   * scroll-to-top for it — so without this effect the viewport would just stay wherever it was,
   * which on a page taller than the grid is usually still scrolled past the top. Scrolling the
   * section itself into view puts the first row back under the pointer instead. Skipped on mount:
   * the section is already in view on first load, and the component instance (and its
   * `sectionRef`) persists across the `page`-prop change a pager tap causes, so the effect fires
   * exactly on that change.
   *
   * Keyed on the PROP and not on a click, which is why the 2026-10-01 swap from `Previous`/`Next`
   * to a row of numbers did not have to touch a line of it: the effect never knew what the runner
   * tapped, only that `page` is now something else. A jump from 1 to 6 scrolls exactly as a step
   * from 1 to 2 did.
   */
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    sectionRef.current?.scrollIntoView?.({ block: 'start' })
  }, [page])
```

**Impact:** none at runtime. `sectionRef`, `setSectionRef`, `mountedRef` and the dependency array
are all unchanged.

---

### Step 5: Rewrite the `view.missing` JSX comment, which also names the removed controls
**File:** `components/admin/PhotoReferencePicker.tsx:278-292`
**Change:** the comment says a photograph on another page is "only a `Previous`/`Next` tap away".
That is now understated as well as stale — it is one tap away, from anywhere. The rendered
`<p>` sentence below it is **not** changed: "Choose another photo, page through to find it, or
clear it" is still exactly true, and
`PhotoReferencePicker.test.tsx:124-128` matches it by regex.
**Code:** replace lines 278-292

```tsx
      {view.missing && (
        /*
         * The saved reference is not on THIS page. Two causes, both real and indistinguishable
         * from here: the row was deleted (`/admin/photos` can remove a chat photograph and the
         * album manager can delete an album row), or it is simply on a different page — the picker
         * now reaches every photograph, so nothing is ever permanently out of reach any more, only
         * a `Previous`/`Next` tap away. Nothing is drawn as selected, and `onChange` is deliberately
         * NOT called — see the file's Decisions entry: self-healing in an effect would mark the
         * operator's draft dirty on mount.
         */
        <p className="mb-2 max-w-[70ch] text-[13px] font-medium text-ink-2">
          The saved reference is not on this page &mdash; it was deleted, or it is on a different
          page. Choose another photo, page through to find it, or clear it.
        </p>
      )}
```

with

```tsx
      {view.missing && (
        /*
         * The saved reference is not on THIS page. Two causes, both real and indistinguishable
         * from here: the row was deleted (`/admin/photos` can remove a chat photograph and the
         * album manager can delete an album row), or it is simply on a different page — the picker
         * now reaches every photograph, so nothing is ever permanently out of reach any more, and
         * since 2026-10-01 every page is one tap on its own number rather than a walk through the
         * ones in between. Nothing is drawn as selected, and `onChange` is deliberately NOT called
         * — see the file's Decisions entry: self-healing in an effect would mark the operator's
         * draft dirty on mount.
         */
        <p className="mb-2 max-w-[70ch] text-[13px] font-medium text-ink-2">
          The saved reference is not on this page &mdash; it was deleted, or it is on a different
          page. Choose another photo, page through to find it, or clear it.
        </p>
      )}
```

**Impact:** documentation only. Every continuation line still starts with `*`, so the `{/*`-opened
JSX comment is still stripped by `codeLines()`.

---

### Step 6: Replace the pager
**File:** `components/admin/PhotoReferencePicker.tsx:347-374`
**Change:** drop the two `ButtonLink`s and the cluster `<div>` that wrapped them; keep the status
paragraph and `Clear reference` on the existing `justify-between` row; add the numbered row below
it.
**Code:** replace lines 347-374

```tsx
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-ink-3 tabular-nums sm:text-[12px]">
              {selectedId !== '' && <>selected #{selectedId} &middot; </>}
              Showing {items.length} of {total} &middot; page {page} of {pageCount}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {page > 1 && (
                <ButtonLink href={`?page=${page - 1}`} scroll={false} size="md" variant="secondary">
                  Previous
                </ButtonLink>
              )}
              {page < pageCount && (
                <ButtonLink href={`?page=${page + 1}`} scroll={false} size="md" variant="secondary">
                  Next
                </ButtonLink>
              )}
              {value !== PHOTO_REFERENCE_NONE && (
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() => onChange(PHOTO_REFERENCE_NONE)}
                >
                  Clear reference
                </Button>
              )}
            </div>
          </div>
```

with

```tsx
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-ink-3 tabular-nums sm:text-[12px]">
              {selectedId !== '' && <>selected #{selectedId} &middot; </>}
              Showing {items.length} of {total} &middot; page {page} of {pageCount}
            </p>
            {/*
             * `Clear reference` stays on the count line rather than joining the numbered row
             * below: it acts on the SELECTION, not on which window of the collection is drawn, and
             * the line it sits beside is the one that names that selection. `justify-between`
             * keeps it pinned right, exactly where the old three-control cluster put it.
             */}
            {value !== PHOTO_REFERENCE_NONE && (
              <Button
                type="button"
                size="md"
                variant="ghost"
                onClick={() => onChange(PHOTO_REFERENCE_NONE)}
              >
                Clear reference
              </Button>
            )}
          </div>

          {/*
           * Its own full-width line, because `Pagination` centres itself and a centred row cannot
           * share a `justify-between` line with a left-aligned paragraph without one of the two
           * lying about its alignment. Renders nothing when `pageCount <= 1`, so the `mt-2` goes
           * with it and a one-page collection keeps the footer it has today.
           */}
          <Pagination
            page={page}
            pageCount={pageCount}
            label="Photo reference pages"
            hrefForPage={(n) => `?page=${n}`}
            scroll={false}
            className="mt-2"
          />
```

**Impact:**

- `Previous` and `Next` no longer exist on either route. Invariant 9 holds for this surface in
  every language — the file's only remaining occurrence of either word is inside a stripped comment
  explaining what was removed.
- `ButtonLink` keeps exactly one use in the file (`fullViewButton`, line 259), so the import stays
  and `lint`'s unused-import rule is not tripped.
- `Button` keeps exactly one use (`Clear reference`), likewise.
- `PHOTO_REFERENCE_NONE` is still read here (the `Clear reference` guard) and still imported.
- `page` and `pageCount` are still read by the status line, so the props stay live even on the
  one-page path where `Pagination` renders `null`.

---

### Step 7: Rewrite the three pager tests and add the jump test
**File:** `components/admin/PhotoReferencePicker.test.tsx:2` and `:176-197`
**Change:** `within` is needed to scope assertions to the pager `<nav>`; the three
`Previous`/`Next` tests are rewritten; one new test is added that the stepper could not have
expressed.

**7a — the import.** Replace line 2

```tsx
import { render, screen } from '@testing-library/react'
```

with

```tsx
import { render, screen, within } from '@testing-library/react'
```

**7b — the tests.** The test at lines 166-174 (`draws every tile on the page — there is no reveal
step any more`) is **kept exactly as written**: it asserts tile count, `Showing 50 of 120`, and the
absence of a `Show more` link, none of which this phase changes. Replace only lines 176-197:

```tsx
  it('offers Next but no Previous on the first page of several', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 1, pageCount: 3 })
    expect(screen.getByText(/page 1 of 3/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '?page=2')
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
  })

  it('offers Previous but no Next on the last page', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 3, pageCount: 3 })
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '?page=2')
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('offers neither Previous nor Next when the whole collection is one page', () => {
    picker()
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 1/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })
```

with

```tsx
  it('links to every other page from the first, and draws page 1 as the current cell', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 1, pageCount: 3 })
    expect(screen.getByText(/page 1 of 3/)).toBeInTheDocument()

    const pager = screen.getByRole('navigation', { name: 'Photo reference pages' })
    expect(within(pager).getByRole('link', { name: '2' })).toHaveAttribute('href', '?page=2')
    expect(within(pager).getByRole('link', { name: '3' })).toHaveAttribute('href', '?page=3')
    // The page you are on is not a link — there is nowhere to go — and it says so in ARIA.
    expect(within(pager).queryByRole('link', { name: '1' })).not.toBeInTheDocument()
    expect(within(pager).getByText('1')).toHaveAttribute('aria-current', 'page')

    // The stepper is gone, in both words, from the whole render and not just from the pager.
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('links back to every earlier page from the last, and draws page 3 as the current cell', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 3, pageCount: 3 })

    const pager = screen.getByRole('navigation', { name: 'Photo reference pages' })
    // `?page=1` and not a bare `?` — page 1 is a real query value in this component's grammar,
    // exactly as the old `Previous` link already spelled it from page 2.
    expect(within(pager).getByRole('link', { name: '1' })).toHaveAttribute('href', '?page=1')
    expect(within(pager).getByRole('link', { name: '2' })).toHaveAttribute('href', '?page=2')
    expect(within(pager).queryByRole('link', { name: '3' })).not.toBeInTheDocument()
    expect(within(pager).getByText('3')).toHaveAttribute('aria-current', 'page')
  })

  it('puts every page one tap from page 1 — the jump the stepper could not express', () => {
    // The user's own reason for the change: *"i can jump directly to specific page whenever i
    // want"*. With six pages a stepper reached page 6 in five taps. Asserted as the full href
    // list, in order, so this also pins "every number, ascending, no ellipsis and no window".
    const items = Array.from({ length: 50 }, (_, i) => item(`k${i}`))
    picker({ items, total: 300, page: 1, pageCount: 6 })

    const pager = screen.getByRole('navigation', { name: 'Photo reference pages' })
    const hrefs = within(pager)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['?page=2', '?page=3', '?page=4', '?page=5', '?page=6'])
  })

  it('renders no pager at all when the whole collection is one page — but still counts it', () => {
    // Plan `## Decisions` fork 1: the count line is not the pagination UI being removed. It is
    // the only thing left that answers "how many photographs are there", so it outlives the pager
    // on exactly the page where the pager has nothing to offer.
    picker()
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 1/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })
```

**Impact and the two query choices worth defending:**

- `getByRole('navigation', { name: 'Photo reference pages' })` addresses the pager through the
  Phase 1 contract's own `<nav aria-label={label}>` and nothing narrower, so it does not couple
  these tests to Phase 1's internal markup. It also proves the `label` prop is wired, which no
  other assertion in this file would.
- `within(pager).getByText('1')` is unambiguous: Testing Library's `getNodeText` joins only a
  node's **direct** text-node children, so the `<li>` wrapping the active `<span>` does not also
  match, and the status paragraph's own text (`Showing 50 of 120 · page 1 of 3`) is not the exact
  string `1`. Scoping to `pager` makes it independent of that reasoning anyway.
- `next/link` is **not** mocked in this repo's component harness (`vitest.config.ts` aliases only
  `server-only`), and renders a real `<a href>` — which is why the existing
  `getByRole('link', { name: 'Next' })` assertions worked at all. The role query will keep working
  on `Pagination`'s `<Link>` cells for the same reason.
- `queryByRole('navigation')` is safe as an unnamed query in the one-page test: the picker renders
  a `<div>`/`<details>`/`<section>` tree with no other landmark in it.

Every other test in the file is untouched and must stay green, in particular the ones that would
notice a footer regression: `offers "Clear reference" only when something is chosen…` (230),
`prints the selected id in the footer…` (199), `omits the "selected #" segment entirely…` (204),
`still prints the selected id when the reference is not on this page…` (209), and the two
`<details>` / full-view-button tests (237, 258, 297) that pin both mount shapes.

## Verification

**Build:**

```bash
cd /home/miftah/.worktrees/run-insights/numbered-pagination
npm run typecheck          # next typegen && tsc --noEmit — vitest does NOT typecheck
npm run build
```

**Tests:**

```bash
npx vitest run components/admin/PhotoReferencePicker.test.tsx
npx vitest run tests/admin.photoReference.test.ts     # the source-scan suite — must be green UNEDITED
npm test                                               # full unit sweep
```

**Lint and format:**

```bash
npm run lint
npm run format:check
```

**Guards** (all seven are source scans; none of them reads this file for a pagination pattern, but
run the chain because that is the phase's own exit gate):

```bash
npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:openrouter-guard \
  && npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f11-guard \
  && npm run ci:schema-drift-guard
```

**Manual check (optional, local dev only — note that `.env.local`'s `DATABASE_URL` is production,
so do not run a migration or a backfill for this):**

- `/admin/image-generation` — open **Photo reference**. The summary line still reads the current
  selection with the disclosure closed; the full-view icon button is still outside the `<details>`;
  under the grid, `Showing 99 of N · page 1 of M` sits left with `Clear reference` right, and a
  wrapping row of every page number sits centred below. Tap a far number: the window changes and
  the section scrolls itself back to its top (the `scrollIntoView` effect, with Next's own
  scroll-to-top still off).
- `/nina/jobs/[id]/anchor` — the same row, on a `<section>` that is open on arrival, with no
  full-view button. The href written into the address bar is `…/anchor?page=3`, which is what
  proves the bare-query grammar still resolves correctly on the second route.

**Exit criteria:**

1. `grep -n 'Previous\|Next' components/admin/PhotoReferencePicker.tsx` returns only lines inside
   block comments (the three rewritten paragraphs and the new header section).
2. `components/admin/PhotoReferencePicker.tsx` renders `<Pagination … hrefForPage={(n) => `?page=${n}`} scroll={false} />`
   and nothing else in the file draws a page control.
3. `tests/admin.photoReference.test.ts` is byte-for-byte unchanged and green.
4. `components/admin/ImageGenPanel.tsx`, `components/nina/NinaJobAnchorPicker.tsx` and both
   `page.tsx` files are byte-for-byte unchanged, and both mounts still render.
5. The full gate chain above passes.

## Handoffs

- **Phase 1 owns the control.** This phase consumes `PaginationProps`' `hrefForPage` arm exactly as
  the plan index spells it and does not widen it. If Phase 1 lands a different active-cell element
  or a different `<nav>` shape, the two `within(pager).getByText(…)` assertions are the only lines
  here that need reconciling — they are deliberately the file's single point of contact with Phase
  1's internals.
- **Phase 5 owns `components/admin/PhotoshopPickerGrid.tsx`,** which is a near-copy of this footer
  (analysis §A3: *"byte-for-byte A2's row shape"*). It keeps its own **absolute** `/admin/photoshop?page=N`
  grammar because it serves one route; this file keeps the bare query because it serves two. No
  helper, no shared `hrefForPage` factory and no extracted footer component should be created
  across the two — the only thing they share is `Pagination` itself. The new header section in
  Step 2 says so in the source, for the next reader who notices the similarity.
- **Not done here, deliberately:** `lib/nina/imageprefs.ts`'s `listNinaPhotoReferences` still
  computes `preloadUrls` for exactly the two neighbouring pages. With every page one tap away there
  is an argument for warming nothing, or for warming differently — but that is a query change, and
  invariant 3 forbids one in this plan set. Step 3's rewritten paragraph records the reasoning in
  place rather than acting on it. If it is ever worth revisiting it is a new R, not R1.
- **Not done here, deliberately:** the count line's `sm:` responsive size step
  (`text-[10px] … sm:text-[12px]`) and the `tabular-nums` on it are untouched drive-by candidates.
  Out of scope.

## Rollback

`git revert <this phase's commit>`. It touches two files in one package and shares no file with
phases 2, 3 or 5, so the revert is self-contained: the `Previous`/`Next` `ButtonLink`s and the four
original pager tests come back, the three rewritten docblocks come back, and nothing else in the
tree notices. The only ordering constraint is the plan index's: this phase must be reverted (along
with 2, 3 and 5) *before* Phase 1, because it imports `Pagination`.

No database write, no schema change, no migration, no LLM call, no Blob write, and no URL grammar
change — every `?page=N` link that worked before this phase still works after it, and after a
revert.
