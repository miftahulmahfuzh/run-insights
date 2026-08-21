import Link from 'next/link'

import { cn } from '@/lib/cn'

/**
 * §2.3's segmented control, and the period chevrons beside it.
 *
 * **Links, not a client component.** F08's plan lists `ScopeSwitcher` as client, but switching scope
 * or paging a month changes *which rows the server queries* — so it is a URL change either way, and
 * an `<a>` does that with no JavaScript, no hydration wait, prefetching for free, and a working
 * middle-click. The plan's own §7 draws exactly this line ("the scope switcher DOES need a query
 * param and a server re-fetch, unlike the pace-trend filter"); expressing it as a link is that rule
 * taken to its conclusion. The one genuinely client-stateful control in the feature stays the
 * pace-trend band filter.
 */
export function ScopeSwitcher({
  scope,
  weekKey,
  monthKey,
}: {
  scope: 'week' | 'month'
  /** Where the WEEK tab goes — the week currently being viewed, or the current one. */
  weekKey: string
  monthKey: string
}) {
  const tab = (target: 'week' | 'month', key: string, label: string) => (
    <Link
      href={`/trends?scope=${target}&key=${key}`}
      aria-current={scope === target ? 'page' : undefined}
      className={cn(
        'flex h-9 flex-1 items-center justify-center rounded-pill text-[12px] font-semibold tracking-[0.04em] uppercase',
        scope === target ? 'bg-card text-ink shadow-card' : 'text-ink-2',
      )}
    >
      {label}
    </Link>
  )

  return (
    <div className="mb-5 flex gap-1 rounded-pill bg-paper-2 p-1">
      {tab('week', weekKey, 'Week')}
      {tab('month', monthKey, 'Month')}
    </div>
  )
}

/**
 * `‹  Week of 10 Aug 2026  ›` — the period header, mirroring the sibling app's `MonthHeader`.
 *
 * **The forward chevron disappears at the present rather than being disabled.** There is no next
 * week to look at, and a greyed control that never becomes usable is a promise the app cannot keep;
 * the absence is self-explanatory where a disabled arrow is a puzzle.
 */
export function PeriodNav({
  label,
  previousHref,
  nextHref,
}: {
  label: string
  previousHref: string
  nextHref: string | null
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link
        href={previousHref}
        aria-label="Previous period"
        className="grid size-11 place-items-center rounded-pill text-[17px] font-semibold text-accent"
      >
        ‹
      </Link>
      <h2 className="text-[15px] font-semibold text-ink">{label}</h2>
      {nextHref ? (
        <Link
          href={nextHref}
          aria-label="Next period"
          className="grid size-11 place-items-center rounded-pill text-[17px] font-semibold text-accent"
        >
          ›
        </Link>
      ) : (
        /* Keeps the title centred without claiming there is somewhere to go. */
        <span className="size-11" aria-hidden="true" />
      )}
    </div>
  )
}
