import Link from 'next/link'

import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/format'

/**
 * A day inside a detail panel: a link to the run it happened on, or plain text — F24, card #23.
 *
 * ── `runId` NULLABLE IS THE POINT, NOT AN EDGE CASE ─────────────────────────────────────────
 * `lib/badges/types.ts` on `StoredBadge.runId`: "Null for a period badge, or a session badge whose
 * run was deleted." Every week, month and lifetime badge is in that first group — `century_club`
 * was not earned by one run, so there is no run for its date to open — and the second group
 * happens whenever a runner deletes a run a badge remembers. A badge earned a dozen times can be a
 * mix of both (#26). So the text branch is the ordinary case for a whole class of dates, and it
 * must not look tappable: no underline, no accent, nothing that invites a thumb at a dead end.
 *
 * ── THE PRIMITIVE OWNS THE AFFORDANCE, THE CALLER OWNS THE TYPE ─────────────────────────────
 * `className` sets size, weight and colour, which differ between a badge panel and a record panel;
 * the underline and its offset are fixed here so the two panels cannot end up disagreeing about
 * what a tappable date looks like. `formatDay` either way — R-23, every date in the app goes
 * through `lib/format.ts`, so `/me` and the share page cannot render the same day two ways.
 *
 * `-my-1 py-1` on the link only: it grows the touch target vertically past the 11–12px type these
 * panels set dates in, without moving the line it sits on. The text branch needs no target and
 * takes no padding, so the two branches still occupy the same line box.
 */
export function RunDateLink({
  day,
  runId,
  className,
}: {
  /** A `DateISO` day, as stored — never a wall-clock instant. */
  day: string
  /** The run to open, or null when this day has none. */
  runId: string | null
  className?: string
}) {
  const label = formatDay(day)

  if (runId === null) return <span className={className}>{label}</span>

  return (
    <Link
      href={`/r/${runId}`}
      className={cn('-my-1 inline-block py-1 underline underline-offset-2', className)}
    >
      {label}
    </Link>
  )
}
