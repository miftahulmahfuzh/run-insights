import type * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * The one shape absence takes in this app: a dashed outline, a title, one sentence, and at most one
 * action.
 *
 * **Dashed, not a card.** The v2 design has no borders on surfaces — a real surface is a white
 * card with a soft shadow. So an empty state deliberately looks like the *outline of a card that
 * has nothing in it yet*, which reads as "this will fill up" rather than as an error. The same
 * dashed vocabulary marks the splits table's partial row (§3.3) and F10's locked badge tiles: in
 * all three cases it means "a different kind of thing", never "something went wrong".
 *
 * Zero client JS and zero chart imports. §9's first row is explicit that a brand-new user with no
 * runs must not download Recharts to be told they have no runs.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-dashed border-rule px-6 py-8 text-center',
        className,
      )}
    >
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] font-medium text-ink-2">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/**
 * The same absence, one line high, for a slot inside a card that already has a heading — a run
 * with no heart-rate data, a distance band with no runs in it.
 *
 * §9 is emphatic about the difference this component protects: a zone bar with no data must render
 * this, never five 0% segments. Five zeros is not "no data", it is a claim that the run was
 * effortless.
 */
export function EmptySlot({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-field border border-dashed border-rule px-4 py-6 text-center text-[12px] font-medium text-ink-2">
      {children}
    </p>
  )
}
