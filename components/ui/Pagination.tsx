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
