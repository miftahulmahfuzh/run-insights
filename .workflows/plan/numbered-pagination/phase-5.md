# Phase 5: `/admin/photoshop` and `/admin/error-logs`

**Plan set:** `NUMBERED_PAGINATION_PLAN.md`
**Analysis:** `20261001-124300-P4G1_code_analyzer.md` (§A3, §A4)
**Satisfies:** R1 — *change every pagination system so each one uses the new control and the
Previous/Next UI is gone.* These are the last two surfaces; after this phase no hand-rolled pager
survives anywhere in the repo.
**Depends on:** Phase 1 (`components/ui/Pagination.tsx` + its `components/ui/index.ts` re-export)
**Difficulty:** EASY
**Package:** `components/admin`, `app/admin`

---

## Goal

The two leftover pagers — `/admin/photoshop`'s hand-rolled `Previous` / `Next` `<Link>` pair and
`/admin/error-logs`' hand-copied `‹ Newer` / `Older ›` row — are replaced by the shared
`<Pagination>` from phase 1. After this phase every paginated surface in the app renders every page
number, both surfaces keep their existing URL grammar byte-for-byte, and `grep -r 'Newer\|Older'`
over `app/` and `components/` returns only `SearchResultsGrid`'s negative assertion and this plan
set's own prose. Neither page gains a `'use client'`, a hook, or a byte of new client JavaScript.

## Interface Contract

**Deletes:**
- the two `<Link href={`/admin/photoshop?page=${page ± 1}`}>` controls and the `<div
  className="flex flex-wrap items-center gap-2">` that wrapped them
  (`components/admin/PhotoshopPickerGrid.tsx:65-82`)
- the whole `‹ Newer` / count / `Older ›` three-child row, including both greyed `<span>` ends and
  both `rel="prev"` / `rel="next"` attributes (`app/admin/error-logs/page.tsx:119-151`)
- the `TOUCH_ICON` **import binding** on `app/admin/error-logs/page.tsx:4` (the symbol itself is
  untouched; `components/admin/touch.ts` is not edited, and `TOUCH_TARGET` stays imported)

**Renames:** none.

**Creates:** no new symbol, no new file, no new export.

**Signature changes:** none. `PhotoshopPickerGrid`'s prop object
(`items`, `total`, `page`, `pageCount`) is unchanged, so `app/admin/photoshop/page.tsx:28-33` needs
no edit. `AdminErrorLogsPage`'s `PageProps<'/admin/error-logs'>` is unchanged.

**Requires (from earlier phases):**
- `Pagination` is exported from `components/ui/index.ts` as `export { Pagination } from
  './Pagination'` (Phase 1), with the exact union in the index's `## The Pagination contract`:
  `{ page, pageCount, label, busy?, scroll?, className? }` + exactly one of `hrefForPage` /
  `onPage`. This phase uses the **`hrefForPage` arm only**, and passes neither `busy` nor `scroll`.
- `components/ui/Pagination.tsx` carries **no `'use client'`** (index invariant 4). This phase's
  correctness depends on it — see Step 0.
- `Pagination` returns `null` when `pageCount <= 1`.

**Two set-wide conventions this phase is bound by (reconciled 2026-10-01):**

1. **No outer `pageCount <= 1` guard on either file.** `Pagination` withholds itself; both count
   lines (`Showing … of … · page … of …` and `{first}–{last} of {listed.total}`) render today at
   `pageCount === 1` and must keep doing so — verified in the worktree: neither
   `PhotoshopPickerGrid.tsx:61-83` nor `app/admin/error-logs/page.tsx:119-151` has a guard, the
   two `<Link>`s simply go absent. Phase 2 *does* keep an outer guard on `/nina/about`; that is
   driven by a test pinning its count line as absent on a single-page collection and does not
   generalise here. Index `## Decisions`, fork 8.
2. **The `label` strings are fixed:** `label="Photo pages"` on `PhotoshopPickerGrid` and
   `label="Error log pages"` on the error-logs page, exactly as written in Steps 1 and 2b. The
   set's convention is a short noun phrase naming the collection the nav walks, in that surface's
   own language — English `<Collection> pages` on the four admin surfaces, Indonesian
   `Halaman <koleksi>` on `/nina/about`. Index `## Decisions`, fork 9. Note `Error log pages` is
   deliberately distinct from `TabStrip`'s existing `aria-label="Error log category"`: two
   landmarks on one page, two names.

**Leaves alone (owned by others):**
- `components/ui/Pagination.tsx`, `components/ui/Pagination.test.tsx`, `components/ui/index.ts` —
  Phase 1
- `components/nina/NinaAboutScreen.tsx` + `components/nina/NinaAboutScreen.test.tsx` — Phase 2.
  (Corrected by the reconciler: phase 2's second file is the co-located `.test.tsx`, not a
  `tests/nina.about*` suite. `tests/nina.aboutPhoto.test.ts` exists but **no** phase edits it —
  phase 2 must keep it green untouched.)
- `components/admin/explorer/PhotoGrid.tsx` + `tests/admin.photoGrid.test.ts` — Phase 3. This
  phase's error-logs row is a hand-copy of *that* file's pager; each phase edits only its own copy.
- `components/admin/PhotoReferencePicker.tsx` + `tests/admin.photoReference.test.ts` — Phase 4.
  `PhotoshopPickerGrid`'s row was copied from that picker's; same split.
- `app/admin/photoshop/page.tsx`, `lib/nina/imageprefs.ts` (`NINA_PHOTO_REF_PAGE_SIZE` = 99),
  `lib/nina/queries.ts`
- `lib/admin/errorLogModel.ts` in its entirety — `ADMIN_ERROR_LOG_PAGE_SIZE` = 25 and
  `errorLogHref`'s body both unchanged
- `components/admin/ErrorLogList.tsx`, the `TabStrip` function at the foot of the error-logs page
  (lines 158-199), and both `EmptyState` branches including their `ButtonLink href={errorLogHref(category, 1)}`
- `components/admin/touch.ts` — not edited; only one import binding on one consumer is dropped

## Files

| File | Action | What changes |
|---|---|---|
| `components/admin/PhotoshopPickerGrid.tsx` | modify | `:1` import `Pagination` from the ui barrel; `:65-82` the two hand-rolled `<Link>` controls become one `<Pagination hrefForPage={…} />`. `Link` stays — the tiles at `:40` use it. |
| `app/admin/error-logs/page.tsx` | modify | `:4` drop `TOUCH_ICON` from the touch import; `:116-151` the three-child pager row becomes the count line + `<Pagination hrefForPage={…} />` under the same `border-t border-rule pt-3` rule. |

Two files. No test file is added or edited — see **Verification**.

## Implementation Steps

### Step 0: Confirm the server-component invariant before writing a line

**Files:** `components/ui/Pagination.tsx` (read-only), `app/admin/error-logs/page.tsx` (read-only),
`components/admin/PhotoshopPickerGrid.tsx` (read-only)

**Change:** none — this is a precondition check, and it is the one thing in this phase that can go
wrong silently.

`app/admin/error-logs/page.tsx` is an **async Server Component**. It has no `'use client'` on
`origin/main` @ `b32d662`, it `await requireAdmin()`s on its first statement, and it must not gain
one: a `'use client'` here would make `requireAdmin` / `listNinaErrorLogs` unreachable and break the
build outright. `components/admin/PhotoshopPickerGrid.tsx` is likewise a plain (non-async) Server
Component with no `'use client'`, rendered by the Server Component `app/admin/photoshop/page.tsx`.

Before editing, run:

```bash
cd /home/miftah/.worktrees/run-insights/numbered-pagination
head -1 components/ui/Pagination.tsx
grep -c "use client" components/ui/Pagination.tsx app/admin/error-logs/page.tsx components/admin/PhotoshopPickerGrid.tsx
```

All three counts must be `0`. If `components/ui/Pagination.tsx` opens with `'use client'`, **stop
and escalate to the reconciler** — phase 1 broke index invariant 4 and this phase would start
shipping a React client bundle for a pager on a read-only admin page.

The precedent is spelled out in `components/ui/Button.tsx:6-10`, verbatim:

> *Deliberately NOT marked 'use client'. Nothing here uses a hook or an effect, so the module
> compiles into whichever graph imports it: a client screen gets an interactive button, and F11's
> public share page gets a `ButtonLink` with no React shipped at all.*

That is exactly the `hrefForPage` arm's shape: `<nav>` / `<ul>` / `<li>` / `<Link>` / `<span>`, no
hook, no effect, no event handler. `app/admin/error-logs/page.tsx` **already imports `ButtonLink`
from that same barrel** (line 5, `import { ButtonLink, EmptyState } from '@/components/ui'`) and
already renders `next/link` `<Link>`s from `TabStrip`, so neither the barrel import nor the `<Link>`
is new to this page's graph. The numbered row therefore renders server-side as plain `<a>`s and one
`<span aria-current="page">`, and this phase adds **zero** client JS to either route.

**Impact:** none on its own. It converts a silent regression (a server page quietly becoming a
client-JS shipper) into a one-command check.

---

### Step 1: `/admin/photoshop` — replace the two hand-rolled `<Link>` controls

**File:** `components/admin/PhotoshopPickerGrid.tsx:1` (import) and `:61-83` (the row)

**Change:** add `Pagination` to the existing `@/components/ui` import, and replace the
`<div className="flex flex-wrap items-center gap-2">…</div>` holding the two conditional `<Link>`s
with a single `<Pagination>`.

Three things stay exactly as they are:

1. **The absolute href.** `hrefForPage={(n) => `/admin/photoshop?page=${n}`}` — an absolute path, as
   this file has always written it (analysis §A3: *"an **absolute** path, unlike A2's bare
   `?page=`"*). Phase 4's picker uses a bare `?page=`; that difference is deliberate and the two
   phases must not converge it. Page 1 is spelled `?page=1`, not the absence of the param, which is
   also what today's `Previous` link from page 2 produces — so no bookmark changes meaning and
   `app/admin/photoshop/page.tsx:13`'s `Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)`
   parses it identically.
2. **The count paragraph** `Showing {items.length} of {total} · page {page} of {pageCount}` — index
   `## Decisions` fork 1.
3. **The `items.length === 0` `EmptyState` early return** at `:23-30`.

`import Link from 'next/link'` **stays**: each tile at `:40` is a `<Link>` to
`/admin/photoshop/${routeKind}/${item.id}`. Verified by grep — `Link` appears at lines 1, 40 and 54.

**Code (the complete file after the edit):**

```tsx
import Link from 'next/link'

import { EmptyState, Pagination } from '@/components/ui'
import type { NinaPhotoRef } from '@/lib/nina/imageprefs'

/**
 * The photoshop tab's entry grid — every Nina photo, deduplicated, exactly the union
 * `PhotoReferencePicker` already draws (`listNinaPhotoReferences`). Visually the same iOS-Photos
 * sheet; behaviourally different, because this one NAVIGATES instead of selecting a value into a
 * draft — each tile is a `<Link>` to that photo's photoshop detail page, not a toggle button.
 */
export function PhotoshopPickerGrid({
  items,
  total,
  page,
  pageCount,
}: {
  items: readonly NinaPhotoRef[]
  total: number
  page: number
  pageCount: number
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No photos yet"
        description="Her profile album and her chat photographs are both empty. Add a photo to her album or let her generate one, and it will appear here."
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-field lg:overflow-x-auto">
        <ul className="grid grid-cols-3 gap-[3px] sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))] lg:grid-cols-[repeat(33,minmax(92px,1fr))]">
          {items.map((item) => {
            const routeKind = item.source === 'album' ? 'avatar' : 'message_image'
            return (
              <li key={`${item.source}:${item.id}`} className="relative aspect-square bg-ink-3/20">
                <Link
                  href={`/admin/photoshop/${routeKind}/${item.id}`}
                  className="block size-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, deliberately
                   * un-transformed; see PhotoReferencePicker's own header for the precedent. */}
                  <img
                    src={item.thumbUrl ?? item.blobUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* The count line answers "how many are there"; the numbered row answers "take me to page 7".
          Different questions, so both stay — see the plan set's `## Decisions`, fork 1. The href is
          ABSOLUTE on purpose: this grid is mounted by one route and has always spelled it that way,
          unlike `PhotoReferencePicker`'s bare `?page=`. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-ink-3 tabular-nums sm:text-[12px]">
          Showing {items.length} of {total} &middot; page {page} of {pageCount}
        </p>
        <Pagination
          page={page}
          pageCount={pageCount}
          label="Photo pages"
          hrefForPage={(n) => `/admin/photoshop?page=${n}`}
        />
      </div>
    </>
  )
}
```

**Impact:** `/admin/photoshop` pages by number. The flex row keeps `justify-between`, so on a
single-page collection — where `Pagination` returns `null` — the count paragraph sits at the left
edge, which is where it already sits today (the two `<Link>`s are both absent at `pageCount === 1`
and the empty wrapper `<div>` collapses to zero width). `flex-wrap` on the container plus
`flex-wrap` inside the `<nav>` means a long number row drops to its own line at 375px rather than
overflowing. No test file reads this component on `origin/main` (grep for `PhotoshopPickerGrid`
across `**/*.ts`/`**/*.tsx` returns only `app/admin/photoshop/page.tsx` and two prose comments in
`components/admin/explorer/MediaPane.tsx:250` and `SelectionPane.tsx:327`), so nothing goes red.

---

### Step 2: `/admin/error-logs` — replace the inline `‹ Newer` / `Older ›` row

**File:** `app/admin/error-logs/page.tsx:4` (import) and `:116-151` (the row)

**Change:** two edits in one file.

**2a — the import block, line 4.** Drop `TOUCH_ICON`, keep `TOUCH_TARGET`:

```tsx
import { TOUCH_TARGET } from '@/components/admin/touch'
```

Grep says this is the only safe deletion of the three the orchestration brief flagged:

| Import | Other uses after the pager is gone | Verdict |
|---|---|---|
| `Link` (`next/link`, line 1) | `TabStrip` at `:182` | **keep** |
| `cn` (`@/lib/cn`, line 17) | `TabStrip` at `:185` | **keep** |
| `TOUCH_TARGET` (line 4) | `TabStrip` at `:186` | **keep** |
| `TOUCH_ICON` (line 4) | none — only `:123`, `:129`, `:141`, `:147`, all inside the row being deleted | **drop** |
| `ButtonLink`, `EmptyState` (line 5) | the empty branch at `:95`/`:106` | **keep** |

`ButtonLink` and `EmptyState` are joined by `Pagination` on line 5:

```tsx
import { ButtonLink, EmptyState, Pagination } from '@/components/ui'
```

The string `TOUCH_ICON` still appears once more in the file, at `:164`, inside `TabStrip`'s docblock
(*"`TOUCH_TARGET` … rather than `TOUCH_ICON`: these are text pills"*). That is prose contrasting the
two exports of `components/admin/touch.ts` and it stays true with the import gone — **do not edit
it**; the `TabStrip` block is out of scope. No CI guard or test greps for the identifier (checked:
no file under `scripts/` names `TOUCH_ICON`, `error-logs` or `PhotoshopPickerGrid`; the two
`scripts/` hits for "photoshop" are the CLI harnesses `scripts/photoshop.ts` and
`scripts/pull-photoshop-job.mjs`).

**2b — the pager row, lines 116-151.** The `border-t border-rule pt-3` rule and the
`{first}–{last} of {listed.total}` count line both stay; the three-child `justify-between` layout
becomes a two-row stack, because a numbered row has no natural left and right end to anchor.

**The stale citation on line 116 goes with it (reconciled 2026-10-01 — this is a required part of
the step, not a nicety).** The comment being replaced opens:

```tsx
          {/* `PhotoGrid.tsx:177-211`'s pager, with this page's grammar. The disabled end keeps the
              same box, so the row does not resize and the live control does not move under a thumb
              when the page changes. */}
```

`PhotoGrid.tsx:177-211` is **the exact range phase 3 deletes** — not moves, deletes. Phase 3 flagged
it and correctly refused to chase it into a file it does not own; this phase owns the file and
retires the citation while it is in there anyway. The replacement comment written below carries **no
line-numbered citation into another phase's file**, which is the point: a hand-copy that cites its
source by line is how this comment went stale in the first place, and the two surfaces now share
`components/ui/Pagination.tsx` rather than a copied block. Do not repoint it at a new range — drop
it, as the code below already does.

*Audited in the other direction too, so this is not asserted as uniquely broken:* the reconciler
grepped every line-numbered cross-file citation into the six files this set edits. Thirteen others
exist (`SearchResultsGrid.tsx:17` → `PhotoGrid.tsx:115-178`, `photoReferenceModel.ts:127` →
`PhotoGrid.tsx:22-28`, `ErrorLogList.tsx:115` → `PhotoGrid.tsx:133`, `PhotoGrid.tsx:18` →
`PhotoReferencePicker.tsx:151-193`, `PhotoViewer.tsx:68,159` and `CopyAdminLinkButton.tsx:19,187`
→ `NinaAboutScreen.tsx`, and others). **Every one of them points at content that survives and
merely drifts by 3-22 lines.** This line 116 is the only citation in the repo that points at
content a phase in this set removes, which is why it is the only one being edited.

All three derived values at `:76-78` are still needed and none is dropped: `first` and `last` feed
the count line, and `lastPage` is now `Pagination`'s `pageCount`. The derivation is byte-identical
to today's.

**Code (the complete `AdminErrorLogsPage` return body — replaces lines 112-153; everything above
line 112 and the whole `TabStrip` below line 157 is unchanged except the two import lines in 2a):**

```tsx
      ) : (
        <>
          <ErrorLogList items={items} />

          {/* Every page number, because the operator chasing a streak wants page 7 in one tap, not
              six. The count line stays above it: a row of numbers cannot say how many rows exist.
              `errorLogHref` keeps the `?tab=` category and still spells page 1 as the ABSENCE of
              `?page=`, so every link this row emits is a URL that already worked. No 'use client'
              is involved — `Pagination`'s `hrefForPage` arm is `<nav>`/`<ul>`/`<Link>`/`<span>`
              with no hook, exactly `components/ui/Button.tsx:6-10`'s rule, so this Server
              Component stays one. */}
          <div className="mt-4 border-t border-rule pt-3">
            <p className="text-center text-[12px] font-semibold text-ink-2 tabular-nums">
              {first}&ndash;{last} of {listed.total}
            </p>
            <Pagination
              page={page}
              pageCount={lastPage}
              label="Error log pages"
              hrefForPage={(n) => errorLogHref(category, n)}
              className="mt-2"
            />
          </div>
        </>
      )}
```

**Code (the complete file after both edits, for an unambiguous apply):**

```tsx
import Link from 'next/link'

import { ErrorLogList } from '@/components/admin/ErrorLogList'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { ButtonLink, EmptyState, Pagination } from '@/components/ui'
import {
  ADMIN_ERROR_CATEGORIES,
  ADMIN_ERROR_CATEGORY_LABEL,
  ADMIN_ERROR_LOG_PAGE_SIZE,
  buildErrorLogItems,
  errorLogHref,
  readErrorCategory,
  readErrorLogPage,
  type AdminErrorCategory,
} from '@/lib/admin/errorLogModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { cn } from '@/lib/cn'
import { listNinaErrorLogs } from '@/lib/nina/errorlogs'

/**
 * `/admin/error-logs` — R2: *"tolong buat satu tab baru di admin page: Error logs, bagi jadi 3:
 * Text / Multimodal / Image generation"*, each *"log setiap failure call to LLM"* with timestamp,
 * full input, full LLM error message and model name (plus an image link on the last two).
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*`, so this call and the layout's are the only gates;
 * `app/admin/layout.tsx`'s header explains why both exist rather than one. This page has no
 * Server Action of its own — it is read-only, which is the third place that argument usually
 * lands.
 *
 * ── `force-dynamic`, AND ITS REASON HERE ────────────────────────────────────────────────────
 * Not `searchParams` (reading that already opts a page into dynamic rendering). The log table is
 * written by background work — `after()` turns, the vision describe path, the GitHub Actions image
 * backstop — none of which calls `revalidatePath`, so a cached render of this page would show an
 * operator a stale "no failures" while the streak he is chasing is still being written.
 *
 * ── WHY THE TABS ARE LINKS AND NOT CLIENT STATE ─────────────────────────────────────────────
 * `?tab=` is this repo's navigation idiom (`?view=`, `?folder=`, `?page=`, `?user=`), and the tab
 * a link carries is a tab the operator can bookmark, reload into and send to himself. There is no
 * `Tabs` component in `components/ui/` to reuse and `TabBar.tsx` is not one: it is the RUNNER's
 * five-cell bottom navigation, which `app/admin/layout.tsx` already refuses for this subtree on
 * the grounds that *"an admin tool that borrows it invites the runner to tap into it"*.
 *
 * ── ROW -> PROP HAPPENS HERE ────────────────────────────────────────────────────────────────
 * `buildErrorLogItems` turns every `Date` into two strings and drops the columns a browser has no
 * use for. `app/admin/shortcuts/page.tsx:63` and `app/admin/nina/page.tsx:193` make the same call
 * for the same reason: the client component receives plain serializable props and names no
 * `server-only` module.
 *
 * ── AND IT IS STILL A SERVER COMPONENT ──────────────────────────────────────────────────────
 * `components/ui/Pagination` is imported through the barrel and carries no `'use client'` — the
 * same rule `components/ui/Button.tsx:6-10` states for `ButtonLink`, which this file has always
 * pulled from the same place. The numbered pager is therefore rendered here, server-side, as
 * `<a>`s and one `<span aria-current="page">`; it ships no React to the browser and does not make
 * this page a client module.
 */

export const dynamic = 'force-dynamic'

export default async function AdminErrorLogsPage(props: PageProps<'/admin/error-logs'>) {
  /*
   * The gate, and NOTHING is destructured off it. `requireAdmin()` returns the admin's own
   * `userId`, but this page never uses one: `listNinaErrorLogs` takes no user parameter because the
   * error log is an operator's cross-user diagnostic read, not a runner's conversation. Binding an
   * unused `userId` here would be a lint error and, worse, would read as though the list were
   * scoped when it is not. See `lib/nina/errorlogs.ts`'s module header for the whole argument.
   */
  await requireAdmin()

  const params = await props.searchParams
  const category = readErrorCategory(params.tab)
  const page = readErrorLogPage(params.page)

  /* `limit` is ALSO Phase 1's ceiling (25). Asking for more returns 25 anyway, so a page size above
   * it would advance the offset past rows that were never rendered — see the constant's docblock. */
  const listed = await listNinaErrorLogs(category, {
    limit: ADMIN_ERROR_LOG_PAGE_SIZE,
    offset: (page - 1) * ADMIN_ERROR_LOG_PAGE_SIZE,
  })

  const items = buildErrorLogItems(listed.rows)
  const first = (page - 1) * ADMIN_ERROR_LOG_PAGE_SIZE + 1
  const last = Math.min(page * ADMIN_ERROR_LOG_PAGE_SIZE, listed.total)
  const lastPage = Math.max(1, Math.ceil(listed.total / ADMIN_ERROR_LOG_PAGE_SIZE))

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Error logs</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every LLM call that failed, newest first — the z.ai attempt and its OpenRouter retry are
          separate rows, because either can be the one that broke. The two icons open the full
          request and the full provider error; the timeout the call was given is the error
          text&rsquo;s first line.
        </p>
      </header>

      <TabStrip current={category} />

      {items.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'Nothing on this page' : 'No failures logged'}
          description={
            page > 1
              ? 'This tab is not that long any more.'
              : 'Nothing has failed in this category since the log table started recording. That is the state you want.'
          }
          action={
            page > 1 ? (
              /* `ButtonLink`, not a `Button` inside a `Link`: a <button> nested in an <a> is
                 invalid HTML and the barrel exports this exact component for this exact case. */
              <ButtonLink href={errorLogHref(category, 1)} size="md" variant="secondary">
                Go to the first page
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <ErrorLogList items={items} />

          {/* Every page number, because the operator chasing a streak wants page 7 in one tap, not
              six. The count line stays above it: a row of numbers cannot say how many rows exist.
              `errorLogHref` keeps the `?tab=` category and still spells page 1 as the ABSENCE of
              `?page=`, so every link this row emits is a URL that already worked. No 'use client'
              is involved — `Pagination`'s `hrefForPage` arm is `<nav>`/`<ul>`/`<Link>`/`<span>`
              with no hook, exactly `components/ui/Button.tsx:6-10`'s rule, so this Server
              Component stays one. */}
          <div className="mt-4 border-t border-rule pt-3">
            <p className="text-center text-[12px] font-semibold text-ink-2 tabular-nums">
              {first}&ndash;{last} of {listed.total}
            </p>
            <Pagination
              page={page}
              pageCount={lastPage}
              label="Error log pages"
              hrefForPage={(n) => errorLogHref(category, n)}
              className="mt-2"
            />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The three sub-tabs. Every tab links to page 1 of its own category — a page 3 of Text has no
 * meaning in Image generation, and `errorLogHref` spells that in one place so the strip and the
 * pager cannot disagree.
 *
 * `TOUCH_TARGET` (a 44px FLOOR, not a fixed height — `components/admin/touch.ts:11-13` explains
 * why a minimum and not `h-11`) rather than `TOUCH_ICON`: these are text pills, so only the
 * vertical axis needs the rule and the width comes from the label. The active pill is
 * `bg-accent-soft text-ink`, the same treatment `AdminNavLinks.tsx` gives its active cell at `lg`,
 * with `aria-current="page"` as the accessible half.
 *
 * `overflow-x-auto` on the row and `shrink-0` on each cell: the three labels measure ~285px at
 * 375px against 343px of `<main>`, so it never scrolls on the target device — but a shell that
 * *"does not clip its own overflow"* (`app/admin/layout.tsx`, pinned by `tests/admin.shell.test.ts`)
 * makes a child that could exceed its track responsible for scrolling inside itself.
 */
function TabStrip({ current }: { current: AdminErrorCategory }) {
  return (
    <nav aria-label="Error log category" className="mb-4">
      <ul className="flex gap-1 overflow-x-auto">
        {ADMIN_ERROR_CATEGORIES.map((category) => {
          const active = category === current
          return (
            <li key={category} className="shrink-0">
              <Link
                href={errorLogHref(category, 1)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  TOUCH_TARGET,
                  'flex items-center rounded-field px-3 text-[12px] font-semibold transition-colors',
                  active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-card hover:text-ink',
                )}
              >
                {ADMIN_ERROR_CATEGORY_LABEL[category]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

**Impact:**

- `/admin/error-logs?tab=image_generation&page=4` still resolves to the same rows; every link the
  new row emits comes out of the untouched `errorLogHref`, so page 1 is still `/admin/error-logs`
  with no `?page=`, and `?tab=text` is still omitted.
- Two `<nav>` elements now exist on the page: `aria-label="Error log category"` (the `TabStrip`) and
  `aria-label="Error log pages"` (the pager). Distinct accessible names, which is exactly what the
  contract's required `label` is for.
- Two `aria-current="page"` elements now exist on the page — the active tab pill and the active page
  number. That is correct and not a conflict: `aria-current` is scoped to its own navigation
  landmark, and the pattern already ships this way on `/admin` (`AdminNavLinks.tsx`) alongside a
  paginated child.
- The disabled-end `<span>`s that existed *"so the row does not resize and the live control does not
  move under a thumb"* are gone with the row they stabilised. The numbered row has no disabled ends
  — the active cell is always present and always the same size as every other cell — so the concern
  it answered no longer exists.

---

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (`next typegen && tsc --noEmit` — this is the real gate;
`PageProps<'/admin/error-logs'>` needs typegen to have run, so do not substitute a bare `tsc`)
**Lint:** `npm run lint` — this is what catches a `TOUCH_ICON` left behind in the import list
**Format:** `npm run format:check` — `prettier-plugin-tailwindcss` owns class order in both edited
class lists
**Tests:** `npm test` (full sweep, fake DB driver, no network)
**Guards:** `npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:openrouter-guard &&
npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f11-guard &&
npm run ci:schema-drift-guard` — none of the seven reads either file (checked: nothing under
`scripts/` names `TOUCH_ICON`, `error-logs` or `PhotoshopPickerGrid`), but the index's invariant 1
requires them green.

**Manual check** (`npm run dev`, admin session):
1. `/admin/photoshop` — the row of numbers sits to the right of `Showing 99 of …`; tapping `4`
   lands on `/admin/photoshop?page=4` and `4` is the ink-filled, non-clickable cell. At 375px the
   numbers wrap onto a second line rather than scrolling the page sideways.
2. `/admin/error-logs?tab=image_generation` — the count line is centered above the numbers under the
   same hairline rule; tapping `3` lands on `/admin/error-logs?tab=image_generation&page=3`; tapping
   `1` lands on `/admin/error-logs?tab=image_generation` with **no** `?page=`.
3. A category with ≤ 25 rows shows the count line and **no** numbered row at all (`pageCount <= 1`
   → `null`).
4. DevTools → Network, hard reload `/admin/error-logs`: no new JS chunk attributable to the pager,
   and the page's HTML already contains every `<a>` of the number row.

**Why no new test file.** Neither file is read by any suite on `origin/main` @ `b32d662`, and
nothing in `tests/` would go red or green from this change:

- `tests/nina.errorlogs.test.ts` was read in full. It is 232 lines over `lib/nina/errorlogs.ts`
  only — `logNinaError`, `clampNinaErrorText`, `listNinaErrorLogs`, `getNinaErrorLog` — against the
  fake DB driver. It never imports the page, never renders a component, and contains the strings
  `Newer`, `Older`, `pager` and `Pagination` zero times. **It does not touch the pager at all.**
- `grep -rn PhotoshopPickerGrid` across `**/*.ts` + `**/*.tsx` returns `app/admin/photoshop/page.tsx`
  (the import and the mount) and two prose mentions in `components/admin/explorer/MediaPane.tsx:250`
  and `components/admin/explorer/SelectionPane.tsx:327`. No test.
- `tests/admin.shell.test.ts:132` names `/admin/error-logs` only inside the nav-href list, and
  asserts that `app/admin/error-logs/page.tsx` *exists*. Unaffected.
- `tests/admin.photoshopActions.test.ts` is a mocked Server Action suite over
  `lib/admin/photoshopActions.ts`; it does no source reading.

**No existing suite is a home for a source-scan assertion here.** The repo's three source-scan
pager suites are each deliberately scoped by their `read()` paths to exactly one component —
`tests/admin.photoGrid.test.ts` (Phase 3's file), `tests/admin.photoReference.test.ts` (Phase 4's),
and `tests/admin.photoSearch.test.ts` (`SearchResultsGrid`, out of scope, and its `Newer`/`Older`
assertion at `:117-119` stays true by construction). `tests/admin.shell.test.ts` reads `globals.css`,
`app/admin/layout.tsx`, `AdminNav.tsx`, `AdminNavLinks.tsx` and `photoIcons.tsx` — adding my two
files to it would widen a responsive-shell suite into a pager suite and give the shell test a second
subject. So the gates above **are** the verification for this phase, and that is enough here
because, unlike a Tailwind class list or a media query, everything this phase changes is visible to
a gate: the deleted `TOUCH_ICON` binding is a `no-unused-vars` lint error, the `Pagination` props are
typechecked against phase 1's discriminated union (a missing `label`, or passing both `hrefForPage`
and `onPage`, fails `tsc`), and a `'use client'` creeping onto the error-logs page fails `next
build` outright because `requireAdmin` is `server-only`. The one thing no gate sees — did a `Newer`
survive — is settled by a one-line grep at commit time:

```bash
grep -n 'Newer\|Older\|Previous\|Next\|Sebelumnya\|Berikutnya' \
  components/admin/PhotoshopPickerGrid.tsx app/admin/error-logs/page.tsx
```

Must print nothing. (It is listed as an exit criterion, not as a test, because a committed test
asserting it would belong to no existing suite — see **Handoffs**.)

**Exit criteria:**
1. `components/admin/PhotoshopPickerGrid.tsx` contains no `Previous` and no `Next`; it renders
   exactly one `<Pagination … hrefForPage={(n) => `/admin/photoshop?page=${n}`} />`; the
   `Showing … of … · page … of …` paragraph and the `EmptyState` early return are byte-identical to
   `b32d662`; `import Link from 'next/link'` is still present and still used by the tiles.
2. `app/admin/error-logs/page.tsx` contains no `Newer` and no `Older`; it renders exactly one
   `<Pagination … hrefForPage={(n) => errorLogHref(category, n)} />` inside a `<div className="mt-4
   border-t border-rule pt-3">`; `first`, `last`, `lastPage` are all still derived and all still
   used; `TOUCH_ICON` is no longer imported while `TOUCH_TARGET`, `Link`, `cn`, `ButtonLink` and
   `EmptyState` all still are; the file still has no `'use client'`; `TabStrip` and the `EmptyState`
   branch are byte-identical to `b32d662`.
3. `git diff --stat b32d662` for this phase touches exactly those two files and no others.
4. Every command under **Build / Typecheck / Lint / Format / Tests / Guards** is green.
5. **The invariant-9 grep above prints nothing.** Reconciled 2026-10-01: this grep is *load-bearing*
   for this phase in a way it is not for phases 2, 3 and 4. They each land a committed assertion in
   their own suite; these two files have no suite and the set deliberately does not create one (see
   **Handoffs** and index `## Decisions`, fork 10). Run it and paste the empty result into the
   phase's close-out — do not skip it as a formality.
6. `app/admin/error-logs/page.tsx` contains no `PhotoGrid.tsx:177-211` citation, and no
   line-numbered citation into any other phase's file (Step 2b).

## Handoffs

- **A source-scan suite pinning invariant 9 across all five surfaces —
  `tests/admin.pagerSweep.test.ts`. SETTLED BY THE RECONCILER (2026-10-01): it is a follow-up card,
  not a step in this plan set. Do not write it in this phase.**

  The reasoning this phase gave for refusing it is correct and survives reconciliation: a sweep
  asserting over all five surfaces reads four files owned by phases that run **concurrently with
  this one**, and whichever phase wrote it would acquire a dependency edge on phases 2, 3 and 4.
  The plan set's load-bearing property is that phases 2-5 touch disjoint file sets and share no
  edge — serialising four concurrent phases to buy one grep-equivalent assertion is a bad trade,
  and the set has no "last phase" to hang it on because 2-5 are peers, not a chain.

  **What this costs, stated plainly rather than hidden:** invariant 9 on
  `components/admin/PhotoshopPickerGrid.tsx` and `app/admin/error-logs/page.tsx` is verified by
  **grep at commit time** (this phase's exit-criterion grep below), not by a committed gate. The
  other three surfaces each land a real assertion in their own suite. This phase's two files are
  the only ones in the set whose "no `Newer` survived" claim is not machine-checked in CI.
  Everything else this phase changes *is* visible to a gate — see **Verification**.

  Note for whoever writes the card: this repo's plan copies live under `.workflows/` and the repo
  root, not under `lib/`, so a path-keyed scan is safe — but positive-control the include list
  anyway (see `MEMORY.md`, *"Adopted plan copies trip string guards"*), and write it against the
  **post-migration tree**, after all five phases have landed.

  Index `## Decisions`, fork 10.
- ~~**INDEX SLIP: the plan index names phase 3's and phase 4's tests `PhotoGrid.test.tsx` /
  `PhotoReferencePicker.test.tsx`; on `b32d662` they are `tests/admin.photoGrid.test.ts` and
  `tests/admin.photoReference.test.ts` — co-located `.test.tsx` files do not exist for them.**~~
  **WITHDRAWN by the reconciler, 2026-10-01 — this was a false alarm.** All four files exist on
  `b32d662`, measured in the worktree:

  | File | Lines | Kind |
  |---|---|---|
  | `components/admin/explorer/PhotoGrid.test.tsx` | 194 | rendering component test (happy-dom) |
  | `tests/admin.photoGrid.test.ts` | 147 | source scan (`readFileSync` + `codeLines`) |
  | `components/admin/PhotoReferencePicker.test.tsx` | 385 | rendering component test (happy-dom) |
  | `tests/admin.photoReference.test.ts` | 273 | source scan |

  Each of those two surfaces has **both** a co-located rendering test and a separate
  `tests/admin.*.test.ts` source-scan suite. The index was naming the rendering tests; phase 3
  additionally owns its source-scan suite (see phase 3's Files table). **No phase creates,
  duplicates or deletes any of the four.** This handoff is left in place, struck through, so a
  phase session that remembers reading it finds the correction rather than acting on it.
- **`components/ui/index.ts`'s docblock** names the primitive set and explains which components are
  re-exported and which are not. Phase 1 adds `Pagination` to the export list; whether that docblock
  gains a sentence is phase 1's call, not mine.
- **`docs/architecture.md`** has no pagination section to update today; if the set wants one, it is
  a close-out task for the coordinator, not a phase.

## Rollback

`git revert <phase-5 commit>` — one commit, two files, both in packages no other phase touches
(`components/admin/PhotoshopPickerGrid.tsx` and `app/admin/error-logs/page.tsx` appear in no other
phase's Files table). The revert restores both hand-rolled pagers and re-adds the `TOUCH_ICON`
import; nothing else moves. No database write, no schema change, no URL grammar change, no
page-size constant change, so there is no state to unwind and every `?page=` bookmark that worked
before the phase still works after the revert.

Reverting phase 5 alone is safe while phases 1–4 remain landed: `Pagination` simply loses two of its
callers, and the index's own `## Decisions` fork ("Phase 1 ships an export with no caller. Does that
fail a gate? — No") records why an under-called export passes CI. Reverting phase 1 requires
reverting this phase first.
