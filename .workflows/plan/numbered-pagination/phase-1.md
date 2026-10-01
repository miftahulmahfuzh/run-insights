# Phase 1: The shared numbered `Pagination` control

**Plan set:** `NUMBERED_PAGINATION_PLAN.md`
**Analysis:** `20261001-124300-P4G1_code_analyzer.md`
**Satisfies:** R2 — render **every** page number as its own cell (`1 2 3 4 5 6`), highlight the active page, and let a tap jump straight to that page
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `components/ui`

---

## Goal

After this phase the repo has exactly one numbered pagination control, `components/ui/Pagination.tsx`,
re-exported through the UI barrel and covered by seventeen component tests. It serves both
mechanism families through a discriminated union — `hrefForPage` for the four URL-driven surfaces,
`onPage` for `/nina/about`'s client fetch — carries no `'use client'`, no hook and no effect, and
imports only `next/link` and `@/lib/cn`. **No existing pager is edited here**; the component ships
with no production caller, which phases 2-5 land concurrently in the same wave.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Phases 2-5 are writing call
sites against exactly this and must not widen it.

**Deletes:** none.
**Renames:** none.
**Creates:**
- `components/ui/Pagination.tsx` (new file) exporting:
  - `export type PaginationProps` — the discriminated union below
  - `export function Pagination(props: PaginationProps): React.JSX.Element | null`
  - *(module-private, NOT exported: `PaginationBase`, `CELL`, `ACTIVE`, `INACTIVE`)*
- `components/ui/Pagination.test.tsx` (new file) — 17 tests, happy-dom pragma.
- `components/ui/index.ts:44` — one added line: `export { Pagination } from './Pagination'`.
  **`PaginationProps` is deliberately NOT re-exported through the barrel**: the barrel's own header
  (lines 10-13) says only names a screen actually pulls through it get re-exported, and "the
  Button/Field prop types have no external consumer — so none of them are re-exported". No phase
  2-5 call site needs the type name; they pass props inline.

**The exact exported signature** — copy it, do not retype it:

```tsx
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

**Rendered DOM, verbatim** (what phases 2-5 write assertions against):

```html
<nav aria-label="{label}" class="{className ?? ''}">
  <ul class="flex flex-wrap items-center justify-center gap-1">
    <li><a   class="{CELL} {INACTIVE}" href="{hrefForPage(1)}">1</a></li>
    <li><span class="{CELL} {ACTIVE}" aria-current="page">2</span></li>
    ...
  </ul>
</nav>
```

On the `onPage` arm the `<a>` is `<button type="button" class="{CELL} {INACTIVE} disabled:pointer-events-none disabled:opacity-50" disabled={busy}>`.

**The exact class strings** (siblings may assert on these tokens):

| Const | Value |
|---|---|
| `CELL` | `inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-2 text-[13px] font-semibold tabular-nums` |
| `ACTIVE` | `bg-ink text-card` |
| `INACTIVE` | `bg-paper-2 text-ink transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none` |
| button extra | `disabled:pointer-events-none disabled:opacity-50` |
| `<ul>` | `flex flex-wrap items-center justify-center gap-1` |

**Behaviour phases 2-5 may rely on:**
- Returns `null` when `pageCount <= 1`. A one-page collection renders nothing at all (the `<nav>` is
  absent, not empty), so **no caller needs a guard to keep the numbered row off a one-page
  collection**.
  *Reconciled 2026-10-01:* this says nothing about a caller's own surrounding block. Phase 2 keeps
  an outer `pageCount <= 1` guard inside `NinaAboutPager` **deliberately**, because that guard also
  withholds the `Halaman … dari … · … foto` count line, which `components/nina/NinaAboutScreen.test.tsx:218`
  pins as absent on a single-page collection. Phases 3, 4 and 5 add no outer guard, because their
  count lines render at `pageCount === 1` today. See the index's `## Decisions`, fork 8.
- Renders every page `1 … pageCount` ascending, one `<li>` each. No ellipsis, no window, ever.
- The active cell is a `<span aria-current="page">`. It is **not** in the accessibility tree as a
  link or a button: `getByRole('link', { name: '3' })` on the current page returns null. A sibling
  test that wants "the current page is not clickable" asserts exactly that.
- `busy` only disables `<button>`s. On a `hrefForPage` mount it is accepted and inert — phases 3,
  4 and 5 should simply not pass it.
- `scroll` is forwarded straight to every `<Link>` and leaves no DOM trace. Phase 4 passes
  `scroll={false}`; it cannot be asserted in the DOM, only that the row still renders.
- `className` lands on the `<nav>`, applied last. **Whether a caller passes its wrapper classes
  through `className` or keeps its own wrapper `<div>` is the caller's call, not this phase's.**
  *Reconciled 2026-10-01 against what phases 3-5 actually wrote:* phase 3 keeps its
  `border-t border-rule pt-3` `<div>` and passes no `className`; phase 4 passes `className="mt-2"`;
  phase 5 keeps the error-logs `<div>` and passes `className="mt-2"`, and passes none on
  `PhotoshopPickerGrid`. All four are legal against this contract.
- `label` is required on every mount. The set's convention, settled by the reconciler: **a short
  noun phrase naming the collection the nav walks, in that surface's own language** — English
  `<Collection> pages` on the four admin surfaces, Indonesian `Halaman <koleksi>` on `/nina/about`.
  The exact strings are fixed per surface in the index's `## Decisions`, fork 9.
- Passing **both** `hrefForPage` and `onPage`, or **neither**, is a type error. This is deliberate.

**Requires (from earlier phases):** nothing. This phase has no `depends_on`.

**Leaves alone (owned by others):** `components/nina/NinaAboutScreen.tsx` (Phase 2),
`components/admin/explorer/PhotoGrid.tsx` (Phase 3), `components/admin/PhotoReferencePicker.tsx`
(Phase 4), `components/admin/PhotoshopPickerGrid.tsx` + `app/admin/error-logs/page.tsx` (Phase 5).
Also untouched by anyone: `components/admin/touch.ts`, `components/admin/FileExplorer.tsx`,
`lib/cn.ts`, `app/globals.css`, `tests/share.bundle.test.ts`.

## Files

| File | Action | What changes |
|---|---|---|
| `components/ui/Pagination.tsx` | create | the whole control — the only new implementation in the plan set |
| `components/ui/Pagination.test.tsx` | create | 17 component tests under happy-dom |
| `components/ui/index.ts` | modify (insert at line 44) | one re-export line, between `./Flag` and `./SplitsTable` |

## Pre-flight: what was verified before this plan was written

Every one of these was measured in the worktree, not assumed. Do not re-litigate them.

- **Design tokens all exist in `app/globals.css`**: `--ink` (line 27) / `--color-ink` (114),
  `--card` (25) / `--color-card` (112), `--paper-2` (24) / `--color-paper-2` (111),
  `--accent` (34) / `--color-accent` (121), `--accent-soft` (35) / `--color-accent-soft` (122),
  and `--radius-field: 14px` (137), which is what makes `rounded-field` a real utility —
  `components/ui/Button.tsx:37` already uses it.
- **Prettier accepts both files exactly as written below.** `.prettierrc` loads
  `prettier-plugin-tailwindcss` with `tailwindStylesheet: ./app/globals.css`, which re-sorts class
  lists **inside `className` attributes**. The literal `<ul className="flex flex-wrap items-center
  justify-center gap-1">` below is already in the plugin's sorted order; `npx prettier --check` on
  the probe reported "All matched files use Prettier code style". The `CELL` / `ACTIVE` /
  `INACTIVE` strings are module consts and `cn(...)` is not in `tailwindFunctions`, so neither is
  re-sorted — which is also why `Button.tsx` keeps its `BASE`/`SIZES`/`VARIANTS` consts.
- **`npm run typecheck` is clean** with these files in place (a bare `tsc --noEmit` without
  `next typegen` first reports 20 pre-existing `Cannot find name 'PageProps'` errors across
  `app/**` — that is the missing-typegen artefact, not this phase).
- **All 17 tests pass** (`npx vitest run components/ui/Pagination.test.tsx` → 17 passed).
- **`tests/share.bundle.test.ts` stays green** (19 passed) with the barrel line added.
- **All seven CI guards pass** with the files in place.
- **`npx eslint` on all three files is silent.**

## Implementation Steps

### Step 1: Create the control
**File:** `components/ui/Pagination.tsx` (new file, 112 lines)
**Change:** Write the file exactly as below. Nothing in it is optional — the comment blocks carry
the three decisions (no `'use client'`, no `TOUCH_ICON` import, every number) that the plan set's
invariants 4, 6 and 8 turn on, and a later reader who deletes them will re-make the mistakes.

Two points the implementer must not "simplify":

1. `const hrefForPage = props.hrefForPage` / `const onPage = props.onPage` read **both** arms off
   the union before any branching, instead of narrowing it. Each member declares the other key as
   optional `never`, so both reads are legal and each yields `T | undefined`; the union itself
   guarantees exactly one is present at runtime, which is what makes `onPage?.(n)` sound. Writing
   `if (props.hrefForPage) … else props.onPage(n)` relies on truthiness narrowing of a
   non-literal discriminant and is the fragile version.
2. The `pageCount <= 1` early return sits **after** those two reads, not before them. It is after
   the destructure and before any JSX, and there is no hook anywhere in the file, so an early
   return is unconditionally safe here.

**Code:**
```tsx
import type * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/cn'

/*
 * Deliberately NOT marked 'use client', for `components/ui/Button.tsx:6-10`'s reason: nothing here
 * uses a hook or an effect, so the module compiles into whichever graph imports it. A client screen
 * gets interactive buttons; `app/admin/error-logs/page.tsx` is a Server Component and gets plain
 * anchors with no React shipped for them. This matters beyond taste — `components/ui/index.ts` is a
 * client-safe bundle boundary that thirty-plus `'use client'` files import, and
 * `tests/share.bundle.test.ts:71` asserts the barrel never reaches `/s/[token]`.
 *
 * Imports are `next/link` and `@/lib/cn` and nothing else. In particular NOT
 * `components/admin/touch.ts`'s `TOUCH_ICON`, whose own header argues it is admin-scoped: `ui`
 * importing `admin` is an inverted dependency. The 44 px string is spelled locally in `CELL`
 * instead. The duplication is the cheaper of the two.
 *
 * ── EVERY NUMBER, ALWAYS ────────────────────────────────────────────────────────────────────
 * No ellipsis, no window, no truncation. The whole point of this control is that page 7 is one tap
 * from page 1, and a window is the thing being removed. A long range wraps onto more lines
 * (`flex-wrap`) rather than collapsing or scrolling sideways. The page sizes in use (25-120 rows)
 * bound the real counts; `PAGE_CEILING` is a defence against a hand-typed `?page=`, not a
 * collection size.
 */

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

/**
 * Two mechanisms, one control. A surface that pages by URL passes `hrefForPage` and gets
 * `<Link>`s; `/nina/about`, which pages by client fetch with no navigation at all, passes `onPage`
 * and gets `<button>`s. The union makes passing both a type error, so a call site cannot be
 * ambiguous about which mechanism it is on.
 */
export type PaginationProps =
  | (PaginationBase & { hrefForPage: (page: number) => string; onPage?: never })
  | (PaginationBase & { onPage: (page: number) => void; hrefForPage?: never })

/**
 * `min-h-11 min-w-11` and not `h-11 w-11`: a minimum cannot fight a wrapped row's line height, and
 * a four-digit page number needs to be allowed to be wider than it is tall. 44 px is the app's iOS
 * floor (`components/ui/Button.tsx:13`).
 */
const CELL =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-2 ' +
  'text-[13px] font-semibold tabular-nums'

/**
 * `bg-ink text-card` for the active page and not `bg-accent`: `components/ui/Button.tsx:46-54`
 * records white-on-cyan at near 2:1 against WCAG's 4.5:1, where ink-on-card is ~14:1 and inverts
 * correctly in dark mode. `PhotoGrid` and `PhotoReferencePicker` both already made this call for
 * their selection badges.
 */
const ACTIVE = 'bg-ink text-card'

const INACTIVE =
  'bg-paper-2 text-ink transition-colors hover:bg-accent-soft ' +
  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'

export function Pagination(props: PaginationProps): React.JSX.Element | null {
  const { page, pageCount, label, busy = false, scroll, className } = props
  /*
   * Read both arms off the union rather than narrowing it. Each member declares the other key as
   * optional `never`, so both reads are legal and each yields `T | undefined` — and the union
   * itself guarantees that exactly one of them is present at runtime.
   */
  const hrefForPage = props.hrefForPage
  const onPage = props.onPage

  // A one-page collection has nowhere to jump to, so there is nothing to draw.
  if (pageCount <= 1) return null

  return (
    <nav aria-label={label} className={cn(className)}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            {n === page ? (
              /* Not a link and not a button: there is nowhere to go, and a disabled button would
                 still be announced as a control. `aria-current="page"` is the announced state. */
              <span aria-current="page" className={cn(CELL, ACTIVE)}>
                {n}
              </span>
            ) : hrefForPage ? (
              <Link href={hrefForPage(n)} scroll={scroll} className={cn(CELL, INACTIVE)}>
                {n}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onPage?.(n)}
                disabled={busy}
                className={cn(CELL, INACTIVE, 'disabled:pointer-events-none disabled:opacity-50')}
              >
                {n}
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

**Impact:** Adds one module to `components/ui`. Nothing imports it yet, so nothing changes at
runtime. `knip` would call `Pagination` unused for the duration of this phase — that is expected
and does not fail CI (`package.json`'s CI chain is the seven guards, `format:check`, `lint`,
`typecheck`, `test`, `build`; `knip` is a manual sweep). Phases 2-5 land the production callers.

### Step 2: Create the test
**File:** `components/ui/Pagination.test.tsx` (new file, 219 lines)
**Change:** Write the file exactly as below.

The `// @vitest-environment happy-dom` pragma on **line 1** is mandatory and is the only reason
this file gets a DOM: `vitest.config.ts` sets `environment: 'node'` globally and includes
`components/**/*.test.tsx`, so a missing pragma fails with "document is not defined" rather than
anything that names the cause. This is the same harness `components/ui/Button.test.tsx` uses —
real `next/link`, real `userEvent`, `cleanup()` from `tests/support/setup.ts`. **Do not add a
`vi.mock('next/link')`**: no component test in this repo mocks it, and the href assertions below
are testing the real anchor the browser gets.

**Code:**
```tsx
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Pagination } from './Pagination'

/**
 * Component tests for the one numbered pager. What is pinned here is the *contract* phases 2-5
 * consume — every number rendered, the active cell non-interactive, the two mechanism arms — and
 * the two class tokens that were argued for rather than picked (`bg-ink text-card`, `min-h-11
 * min-w-11`). The rest of the class list is not asserted, which would make this a snapshot of the
 * string rather than a test of the choice.
 */

/** Every number in the row, in document order, as the user reads them. */
function cellLabels(): string[] {
  const nav = screen.getByRole('navigation')
  return Array.from(nav.querySelectorAll('li')).map((li) => li.textContent ?? '')
}

describe('Pagination', () => {
  it('renders nothing at all when there is one page or fewer', () => {
    const { container, rerender } = render(
      <Pagination page={1} pageCount={1} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )
    expect(container).toBeEmptyDOMElement()

    rerender(
      <Pagination page={1} pageCount={0} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the nav with the required label', () => {
    render(
      <Pagination page={2} pageCount={6} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    expect(screen.getByRole('navigation', { name: 'Album pages' })).toBeInTheDocument()
  })

  it('renders every page number in ascending order, with no ellipsis', () => {
    render(
      <Pagination page={3} pageCount={6} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    expect(cellLabels()).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(screen.getByRole('navigation').textContent).not.toContain('…')
    expect(screen.getByRole('navigation').textContent).not.toContain('...')
  })

  it('still renders every number for a long range — no window, no truncation', () => {
    // 37 pages is past where a windowed pager would have collapsed. The row wraps instead.
    render(
      <Pagination page={19} pageCount={37} label="Media pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    const labels = cellLabels()
    expect(labels).toHaveLength(37)
    expect(labels[0]).toBe('1')
    expect(labels[36]).toBe('37')
    expect(screen.getByRole('navigation').querySelector('ul')).toHaveClass('flex-wrap')
  })

  it('the active page is a non-interactive span carrying aria-current, not a link or a button', () => {
    render(
      <Pagination page={3} pageCount={6} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    const active = screen.getByText('3')
    expect(active.tagName).toBe('SPAN')
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: '3' })).toBeNull()
    expect(screen.queryByRole('button', { name: '3' })).toBeNull()
    // Exactly one cell is current, whichever arm is mounted.
    expect(screen.getByRole('navigation').querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('styles the active cell bg-ink/text-card — the measured contrast choice over bg-accent', () => {
    render(
      <Pagination page={2} pageCount={4} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    const active = screen.getByText('2')
    expect(active).toHaveClass('bg-ink', 'text-card')
    expect(active).not.toHaveClass('bg-accent')
  })

  it('gives every cell a 44px tap-target floor', () => {
    render(
      <Pagination page={1} pageCount={3} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    for (const label of ['1', '2', '3']) {
      expect(screen.getByText(label)).toHaveClass('min-h-11', 'min-w-11')
    }
  })

  describe('hrefForPage mount', () => {
    it('renders one link per inactive page at exactly the href the callback returns', () => {
      render(
        <Pagination
          page={2}
          pageCount={4}
          label="Error log pages"
          hrefForPage={(n) => `/admin/error-logs?category=vision&page=${n}`}
        />,
      )

      const links = screen.getAllByRole('link')
      expect(links.map((a) => a.textContent)).toEqual(['1', '3', '4'])
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/admin/error-logs?category=vision&page=1',
        '/admin/error-logs?category=vision&page=3',
        '/admin/error-logs?category=vision&page=4',
      ])
    })

    it('renders no button at all — this arm never calls back', () => {
      render(
        <Pagination page={1} pageCount={4} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
      )

      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('accepts scroll={false} and still renders the hrefs — the picker mount', () => {
      // `scroll` leaves no DOM trace; what this pins is that the prop is accepted and the row
      // still renders, which is the mount `PhotoReferencePicker` makes.
      render(
        <Pagination
          page={1}
          pageCount={3}
          label="Reference pages"
          hrefForPage={(n) => `?page=${n}`}
          scroll={false}
        />,
      )

      expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
        '?page=2',
        '?page=3',
      ])
    })

    it('ignores busy — it disables buttons, and this arm has none', () => {
      render(
        <Pagination
          page={1}
          pageCount={3}
          label="Album pages"
          hrefForPage={(n) => `?page=${n}`}
          busy
        />,
      )

      expect(screen.getAllByRole('link')).toHaveLength(2)
    })
  })

  describe('onPage mount', () => {
    it('calls back with the clicked page number — a jump of more than one page', async () => {
      const user = userEvent.setup()
      const onPage = vi.fn()
      render(<Pagination page={1} pageCount={6} label="Halaman album" onPage={onPage} />)

      await user.click(screen.getByRole('button', { name: '5' }))

      expect(onPage).toHaveBeenCalledTimes(1)
      expect(onPage).toHaveBeenCalledWith(5)
    })

    it('renders buttons of type="button" and no links', () => {
      render(<Pagination page={2} pageCount={4} label="Halaman album" onPage={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons.map((b) => b.textContent)).toEqual(['1', '3', '4'])
      for (const button of buttons) {
        expect(button).toHaveAttribute('type', 'button')
      }
      expect(screen.queryAllByRole('link')).toHaveLength(0)
    })

    it('busy disables every button', () => {
      render(<Pagination page={2} pageCount={4} label="Halaman album" onPage={vi.fn()} busy />)

      for (const button of screen.getAllByRole('button')) {
        expect(button).toBeDisabled()
      }
    })

    it('a disabled button does not call back', async () => {
      const user = userEvent.setup()
      const onPage = vi.fn()
      render(<Pagination page={1} pageCount={4} label="Halaman album" onPage={onPage} busy />)

      await user.click(screen.getByRole('button', { name: '3' }))

      expect(onPage).not.toHaveBeenCalled()
    })

    it('is enabled by default — busy is opt-in', () => {
      render(<Pagination page={1} pageCount={3} label="Halaman album" onPage={vi.fn()} />)

      for (const button of screen.getAllByRole('button')) {
        expect(button).toBeEnabled()
      }
    })
  })

  it('applies a caller className to the nav', () => {
    render(
      <Pagination
        page={1}
        pageCount={3}
        label="Album pages"
        hrefForPage={(n) => `?page=${n}`}
        className="mt-4 border-t border-rule pt-3"
      />,
    )

    expect(screen.getByRole('navigation')).toHaveClass('mt-4', 'border-t', 'pt-3')
  })
})
```

**Impact:** 17 new tests, ~5 s. No existing test file changes.

### Step 3: Re-export through the barrel
**File:** `components/ui/index.ts:44` — insert one line between the existing line 43
(`export { FlagList } from './Flag'`) and the existing line 44
(`export { SplitsTable } from './SplitsTable'`), keeping the list alphabetical by module.
**Change:** Add exactly one line. Do not add a `PaginationProps` type export (see the Interface
Contract's note on the barrel header's own rule), and do not touch either of the two comment
blocks above the export list.

**Code — the full export list after the edit** (lines 38-46):
```ts
export { Button, ButtonLink, LoadingDots, buttonClasses } from './Button'
export { Card, Eyebrow, Stat } from './Card'
export { CHIP_CLASS } from './Chip'
export { EmptyState } from './EmptyState'
export { CONTROL_CLASS, Field, NumberInput } from './Field'
export { FlagList } from './Flag'
export { Pagination } from './Pagination'
export { SplitsTable } from './SplitsTable'
export { ZoneBar } from './ZoneBar'
```

**Impact:** `import { Pagination } from '@/components/ui'` becomes the import phases 2-5 write.
The barrel stays client-safe — `Pagination.tsx` has no `'use client'`, no hook, no effect and no
server-only reach, so nothing new enters any bundle graph. `tests/share.bundle.test.ts` was run
with this line in place and reported 19 passed; its line-71 assertion
(`expect(graph).not.toContain('components/ui/index.ts')`) is about `/s/[token]` not importing the
barrel at all and is unaffected either way.

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (NOT a bare `tsc --noEmit` — without `next typegen` first it
reports 20 pre-existing `Cannot find name 'PageProps'` errors that have nothing to do with this
phase)
**Tests:**
```bash
npx vitest run components/ui/Pagination.test.tsx   # expect: 1 file, 17 tests, all passing
npx vitest run tests/share.bundle.test.ts          # expect: 19 passing — the barrel is still client-safe
npm test                                           # the full unit sweep
```
**Lint / format:** `npm run lint && npm run format:check`
**Guards:** all seven (`ci:data-layer-guard`, `ci:f08-guard`, `ci:openrouter-guard`,
`ci:client-secret-guard`, `ci:llm-payload-guard`, `ci:f11-guard`, `ci:schema-drift-guard`) — all
verified PASS against these exact files.

**Manual check:** none available in this phase by design — the component has no production caller
until phase 2 lands, so there is no URL to open. The test file is the only consumer. Do **not**
add a temporary mount somewhere to look at it; that would touch a file this phase does not own.

**Exit criteria:**
1. `components/ui/Pagination.tsx` exists, carries no `'use client'`, no `useState`/`useEffect`/any
   hook, and its import list is exactly `next/link` + `@/lib/cn` + the `React` type import.
   `grep -n "use client\|from 'react'\|touch" components/ui/Pagination.tsx` shows only the
   `import type * as React from 'react'` line.
2. `grep -c "components/admin" components/ui/Pagination.tsx` is 0 — no inverted dependency.
3. `components/ui/Pagination.test.tsx` runs 17 passing tests under happy-dom.
4. `components/ui/index.ts` has exactly one new line and the whole gate chain is green.
5. No file outside those three has changed: `git status --porcelain` lists exactly
   `components/ui/Pagination.tsx`, `components/ui/Pagination.test.tsx`, `components/ui/index.ts`.

## Handoffs

Everything below was found while planning this phase and is deliberately left to its owner. None
of it is phase 1's to do, and all of it serves **R1**, which is not in this phase's `satisfies`.

- **Phase 2 (`/nina/about`)** — `components/nina/NinaAboutScreen.tsx:1001`'s `NinaAboutPager` is
  the only `onPage` consumer in the set. It should pass `onPage={goToAlbumPage}` /
  `onPage={goToMediaPage}`, `busy={...}` and `label="Halaman foto profil"` / `label="Halaman media"`.
  *(A line here originally told phase 2 not to keep its own `pageCount <= 1` guard. The reconciler
  struck it: that guard also withholds the count line, which `NinaAboutScreen.test.tsx:218` pins as
  absent on a single-page collection, so phase 2 keeps it and is right to. Phase 1 could not see
  that from `components/ui`.)* `ChevronLeftIcon` / `ChevronRightIcon` (file foot)
  and the docblock paragraph naming them become dead once the chevron `Button`s go; removing them
  is phase 2's call, not mine. The `Halaman … dari … · … foto` count line stays (plan `Decisions`,
  fork 1).
- **Phase 3 (`PhotoGrid`)** — the `‹ Newer` / `Older ›` row at
  `components/admin/explorer/PhotoGrid.tsx:177-215`. Pass the existing
  `mt-4 flex … border-t border-rule pt-3` wrapper's classes via `className` on the `<nav>` rather
  than keeping the `<div>`, or keep the `<div>` and give `Pagination` no `className` — either
  works; phase 3 owns that shape. `TOUCH_ICON` (imported at line 5) loses its pager use there;
  whether it has another is phase 3's to check.
- **Phase 4 (`PhotoReferencePicker`)** — the `Previous`/`Next` `ButtonLink`s at lines **353-362**
  (inside the footer row at 347-374). *(Measured in the worktree by the reconciler; `345-366` as
  first written here and in the analysis document was off by eight.)*
  It is the only mount that needs `scroll={false}`. The `scrollIntoView` effect keyed on `page`
  (lines 187-209) and the `preloadUrls` prefetch links are untouched by anything here.
- **Phase 5 (`PhotoshopPickerGrid`, `app/admin/error-logs/page.tsx`)** — the error-logs page is a
  Server Component, which is exactly why `Pagination` carries no `'use client'`; it can render
  `<Pagination hrefForPage={(n) => errorLogHref(category, n)} />` directly with no client boundary
  and no React shipped for the anchors.
- **A possible later cleanup, for nobody in this set:** `components/admin/touch.ts:38`'s
  `TOUCH_ICON` and this file's `CELL` now share the substring
  `inline-flex min-h-11 min-w-11 items-center justify-center`. The plan's `Decisions` table
  ("Where does the 44 px tap-target string come from") settled on the duplication as cheaper than
  the `ui` → `admin` inversion, and `touch.ts`'s own header pre-authorises the eventual fix — "it
  is one rename plus one line in the barrel" — *when a runner-facing control needs the same
  string*. After phases 2-5, `Pagination` is that control. **Do not do it in this plan set**: it
  would edit `components/admin/touch.ts`, which no phase owns, and would churn
  `DialSlider.tsx` / `UserPicker.tsx` / `PhotoGrid.tsx` / `app/admin/error-logs/page.tsx` imports
  across phase boundaries. Card it afterwards.

## Rollback

This phase is one commit touching three files, two of which are new and have no importer until
phases 2-5 land.

```bash
git revert <phase-1 commit>
```

If phases 2-5 have already landed, they import `Pagination` and must be reverted first (the plan
index's Rollback section says the same). Nothing here writes to the database, touches a schema,
calls an LLM, writes Blob storage, or changes a URL — there is no state to undo, only three files.
