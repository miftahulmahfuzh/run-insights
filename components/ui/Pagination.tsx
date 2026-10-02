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
 * importing `admin` is an inverted dependency. `CELL` spells its own geometry instead — and since
 * 2026-10-02 it is not even the same geometry, because the pager cell is a deliberate 30.8 px
 * exception to the 44 px floor `TOUCH_ICON` exists to enforce. Read `CELL`'s docstring before
 * reconciling the two: they are supposed to disagree now.
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
 * ── 30.8 px, AND YES, THAT IS BELOW THE TAP FLOOR ────────────────────────────────
 * `1.925rem` is 44 × 0.7. It is spelled in rem, not px, so it tracks the root font scale exactly
 * the way the `min-h-11` it replaces did (`11` = `calc(var(--spacing) * 11)` = 2.75rem = 44 px);
 * a reader who scales text up still gets a proportionally bigger target.
 *
 * The repo owner asked for this on 2026-10-02, with the number in hand — "reduce their size, and
 * make it circular, make sure the circular button is 30% smaller" — after `/nina/about`'s Media
 * tab went from 7 pages to 13 and a row of thirteen 44 px slabs ate the screen. So this is the
 * ONE place in the app that goes under the 44 px iOS minimum (`components/ui/Button.tsx:13`,
 * `docs/design-brief.md:174`, `components/admin/touch.ts`), and it does so knowingly. Do not
 * "restore" the floor here: you would be reverting a request, not fixing a regression. What makes
 * it survivable is that the cells are separated by `gap-1` and that a mis-tap lands on a
 * NEIGHBOURING PAGE NUMBER — one tap to undo, nothing destructive, no state written. If the floor
 * is ever re-imposed on this control it has to be re-imposed by whoever asked for the exception.
 *
 * ── `min-h`/`min-w`, NEVER `h`/`w` ─────────────────────────────────────────────
 * Unchanged from the 44 px era, for the same two reasons: a minimum cannot fight a wrapped row's
 * line height, and a long page number must be allowed to be wider than it is tall.
 *
 * ── WHY `px-1` AND `text-[11px]` MOVED WITH THE BOX ─────────────────────────────
 * A 30.8 px *minimum* box means a short label sits inside a CIRCLE and a long one stretches it
 * into a pill. Stretching is correct — it is what `min-w` is for — but it should start as late as
 * possible. `px-1` spends 4 px a side INSIDE the 30.8 (preflight makes every box `border-box`),
 * leaving a 22.8 px content budget.
 *
 * **Poppins' digits are PROPORTIONAL, and `tabular-nums` does nothing here.** Measured from the
 * exact `wght@600` latin subset `next/font` self-hosts (fontTools, unitsPerEm 1000): `1` is 362
 * units and `4` is 661 — a 1.83x spread — and the face ships an EMPTY GSUB feature list, so there
 * is no `tnum` for `font-variant-numeric` to switch on. The class is kept only because the
 * fallback stack honours it during `display: 'swap'`; no arithmetic here may lean on it, and a
 * fit computed from an "average digit" is wrong. The budget has to be checked against the WIDEST
 * string, which is all-`4`s at 661 u a digit:
 *
 *     1 digit    661 u  ->  7.27 px + 8 = 15.27  ->  min-w wins; a 30.8 x 30.8 circle
 *     2 digits  1322 u  -> 14.54 px + 8 = 22.54  ->  circle, 0.26 px to spare
 *     3 digits  1983 u  -> 21.81 px + 8 = 29.81  ->  circle, 0.99 px to spare
 *     4 digits  2644 u  -> 29.08 px + 8 = 37.08  ->  FIRST to stretch: a 37.1 x 30.8 pill
 *
 * Four digits is therefore the stated breaking point, and it is stated rather than discovered.
 * **11 px is the only size that earns that sentence**: at 12 px the worst three-digit page is
 * 23.80 px against a 22.8 px budget and stretches — roughly half of all three-digit numbers do —
 * so the breaking point would silently be three. Keeping the old `px-2` + `text-[13px]` would
 * have stretched at TWO digits (`44` = 17.2 + 16 = 33.2 > 30.8) — page 10 of today's thirteen —
 * which is why the padding and the type are part of this change and not a later tidy-up.
 *
 * Legibility survives the drop because the GLYPH-TO-CELL ratio goes UP, not down: 13 px in a
 * 44 px cell is 0.295, 11 px in a 30.8 px cell is 0.357, so the number reads 21 % larger relative
 * to its button than it did before. 11 px also matches the `Halaman ... dari ...` caption rendered
 * directly beneath this row (`components/nina/NinaAboutScreen.tsx`), and the 16 px rule in
 * `app/globals.css` is an INPUT rule (Safari zooms on focusing a small form control) that a span,
 * an anchor and a button never trip.
 *
 * ── `rounded-pill` AND NOT `rounded-full` ───────────────────────────────────
 * They render identically here — 999 px and `calc(infinity * 1px)` both clamp to half of a 30.8 px
 * box — so this is a vocabulary call, and the vocabulary is settled. `app/globals.css`'s
 * `@theme inline` ships a four-step radius ladder mirrored from `docs/design/tokens.css` (chip 8 /
 * field 14 / card 22 / pill 999), and every round CONTROL in the app spells `rounded-pill`:
 * `Composer.tsx`'s size-11 buttons, `Sheet.tsx`'s close, `Chip.tsx`, `CircleFrame.tsx`. Tailwind's
 * own `rounded-full` survives only on decorative 1-3 px dots. A pager cell is a control, and
 * `rounded-field` — the thing it replaces — is from the same ladder, so the diff stays inside one
 * vocabulary instead of straddling two.
 */
const CELL =
  'inline-flex min-h-[1.925rem] min-w-[1.925rem] items-center justify-center rounded-pill px-1 ' +
  'text-[11px] font-semibold tabular-nums'

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
