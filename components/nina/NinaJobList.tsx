'use client'

import Link from 'next/link'

import { cn } from '@/lib/cn'
import { formatJobLatency, ninaJobTitle, type NinaJobListItem } from '@/lib/nina/jobview'
import { NinaJobActions } from './NinaJobActions'
import { NinaJobElapsed } from './NinaJobElapsed'

/**
 * **R1's job list — and PHASE 5 RENDERS THIS EXACT COMPONENT.**
 *
 * ── WHY IT IS A CLIENT COMPONENT, AND WHY THAT IS NOT NEGOTIABLE ──────────────────────────────
 * `components/nina/NinaAboutScreen.tsx` is `'use client'` (it holds the photo viewer's state and
 * calls `useRouter`), and phase 5 puts this list inside it, directly below the Media section. A
 * Server Component cannot be rendered from a client component except through a `children` slot, so
 * a server-side list would force phase 5 to either duplicate this markup or re-plumb
 * `app/nina/about/page.tsx` around a slot — and the plan is explicit that phase 5 must not write a
 * second implementation of anything. A client component taking only serializable props is the one
 * shape both a Server Component page and a client screen can render unchanged.
 *
 * Every prop is therefore a string, a number, a boolean or null. `createdAtMs` is epoch
 * milliseconds and not a `Date` for the same reason `NinaJobElapsed` takes `nowMs`: a number is a
 * thing the two halves cannot disagree about.
 *
 * ── WHAT IT DOES NOT DECIDE ───────────────────────────────────────────────────────────────────
 * The ORDER. `listNinaImageJobs` already ordered these newest-first in SQL, and this component
 * maps rather than sorts — `planSessionList`'s rule one screen over, for its stated reason.
 *
 * The STAGE and the ERROR WORDS. Both come out of `lib/nina/jobview.ts`, pre-resolved on whichever
 * side built the items, so the list on `/nina/jobs` and the section on `/nina/about` cannot name
 * the same stage two ways.
 *
 * ── NO EMPTY-STATE COMPONENT ──────────────────────────────────────────────────────────────────
 * `EmptyState` is a dashed card with a title and an action, which is the right shape for a whole
 * screen and the wrong one for a section inside somebody else's page. So absence is one sentence,
 * worded by the CALLER: `/nina/jobs` says something different from a section under Media, and a
 * component that hard-coded either would be a component phase 5 has to fork.
 *
 * ── AND WHY THE CONTROLS ARE A PROP RATHER THAN ALWAYS THERE ──────────────────────────────────
 * **This component has two callers and only one of them is a console.** `app/nina/jobs/page.tsx`
 * is the "Proses foto" screen the user asked to improve; `components/nina/NinaAboutScreen.tsx:317`
 * renders the same rows as a SUMMARY under Media, with a "Semua" link to the real screen. Putting
 * a redo button on both would put a mutation on a page nobody asked to mutate from.
 *
 * So `actions` is absent by default and set by `/nina/jobs` alone — and when it is absent the
 * markup below is byte for byte what it was before this phase: `<li>` gets `className={undefined}`
 * (React omits the attribute entirely), the `<a>` gets the same class string in the same order, and
 * `{false && …}` renders nothing. That equality is the plan set's invariant 5 and it is checked by
 * reading this diff, because there is no DOM test in this repo to check it for us.
 *
 * A RENDER-PROP would have been the more flexible shape — `renderActions?: (item) => ReactNode` —
 * and it is impossible here: `app/nina/jobs/page.tsx` is a Server Component, and a function is not
 * a serialisable prop across that boundary. A boolean is what the seam supports.
 */
export function NinaJobList({
  items,
  nowMs,
  emptyText,
  actions,
  className,
}: {
  /** Already ordered newest-first by `listNinaImageJobs`. Never re-sorted below this line. */
  items: readonly NinaJobListItem[]
  /** The server's clock at render. See `NinaJobElapsed`. */
  nowMs: number
  /** What absence says on this surface. */
  emptyText: string
  /**
   * Draw the per-row mutation controls (R1's redo; phase 2's delete).
   *
   * **Absent by default, and only `app/nina/jobs/page.tsx` sets it.** See the header. Optional
   * rather than required precisely so `NinaAboutScreen` compiles untouched — the read-only surface
   * is the one that should need no edit.
   */
  actions?: boolean
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p
        className={cn(
          'rounded-field border border-dashed border-rule px-4 py-6 text-center text-[12px] font-medium text-ink-2',
          className,
        )}
      >
        {emptyText}
      </p>
    )
  }

  const withActions = actions === true

  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => {
        /* `Card.tsx`'s one surface for a row that is still doing something; bare paper for a row
           that has finished. `SessionRow` makes the same distinction the same way. It moves from
           the `<a>` to the `<li>` ONLY in actions mode, so the card wraps the controls instead of
           stopping short of them — and so the read-only surface's markup is untouched. */
        const surface = item.open ? 'bg-card shadow-card' : 'bg-transparent'

        return (
          <li
            key={item.id}
            className={
              withActions
                ? cn('flex flex-wrap items-center gap-x-1 rounded-card pr-1', surface)
                : undefined
            }
          >
            <Link
              href={item.href}
              className={cn(
                'block rounded-card px-3 py-2.5',
                withActions ? 'min-w-0 flex-1' : surface,
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] leading-[1.35] font-semibold text-ink">
                  {ninaJobTitle(item)}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-ink-2 tabular-nums">
                  {item.open ? (
                    <NinaJobElapsed startedAtMs={item.createdAtMs} nowMs={nowMs} running />
                  ) : (
                    formatJobLatency(item.latencyMs)
                  )}
                </span>
              </span>

              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-ink-3">
                <span className={item.stage === 'failed' ? 'font-semibold text-red' : undefined}>
                  {item.stageLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span>{item.purpose === 'avatar' ? 'Foto profil' : 'Selfie'}</span>
                {item.attempts > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.attempts}x dicoba</span>
                  </>
                )}
              </span>

              {item.errorLabel !== null && (
                <span className="mt-1 block max-w-[54ch] text-[12px] leading-[1.45] font-medium text-red">
                  {item.errorLabel}
                </span>
              )}
            </Link>

            {withActions && <NinaJobActions item={item} />}
          </li>
        )
      })}
    </ul>
  )
}
