'use client'

import Link from 'next/link'

import { cn } from '@/lib/cn'
import { formatJobLatency, type NinaJobListItem } from '@/lib/nina/jobview'
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
 */
export function NinaJobList({
  items,
  nowMs,
  emptyText,
  className,
}: {
  /** Already ordered newest-first by `listNinaImageJobs`. Never re-sorted below this line. */
  items: readonly NinaJobListItem[]
  /** The server's clock at render. See `NinaJobElapsed`. */
  nowMs: number
  /** What absence says on this surface. */
  emptyText: string
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

  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className={cn(
              'block rounded-card px-3 py-2.5',
              /* `Card.tsx`'s one surface for a row that is still doing something; bare paper for a
                 row that has finished. `SessionRow` makes the same distinction the same way. */
              item.open ? 'bg-card shadow-card' : 'bg-transparent',
            )}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] leading-[1.35] font-semibold text-ink">
                {item.scene ?? (item.purpose === 'avatar' ? 'Foto profil' : 'Selfie')}
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
        </li>
      ))}
    </ul>
  )
}
