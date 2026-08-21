import {
  addDays,
  isoWeekKeyOf,
  isoWeekRange,
  monthKey,
  monthRange,
  type DateISO,
  type MonthKey,
} from '@/lib/date/ranges'
import type { ChartRun, MonthWeekBucket } from './types'

/**
 * §3.4 / §6 — the weeks-in-month algorithm, and the one invariant on this screen a reader will
 * mentally re-add:
 *
 *     sum(weeksInMonth(month, runs).map(b => b.distanceM)) === the month's own total
 *
 * **Why that falls out for free rather than needing a reconciliation step.** The buckets are
 * consecutive, non-overlapping 7-day windows starting on the Monday on or before the 1st. Clipping
 * only ever SHRINKS a bucket's range to the month's own days — it never moves a day from one
 * bucket into another's territory. So every calendar day in the month belongs to exactly one
 * clipped range, and summing over the buckets is summing over a strict partition of the month.
 * Get the clipping right and the total is right by construction. `tests/charts.weeksInMonth.test.ts`
 * asserts it against three real months including both single-day-bucket boundary cases.
 *
 * **Do not import this into `volumeTrend.ts`.** The 12-week rolling window has no month boundary
 * to respect; sharing the clipping logic between them would be a bug waiting for a month that
 * starts on a Sunday.
 */
export function monthWeekBucketRanges(
  month: MonthKey,
  todayISO: DateISO,
): Omit<MonthWeekBucket, 'distanceM' | 'runCount'>[] {
  const { startISO: monthStart, endExclusiveISO } = monthRange(month)
  const monthEnd = addDays(endExclusiveISO, -1)
  const currentMonth = monthKey(todayISO) === month

  const out: Omit<MonthWeekBucket, 'distanceM' | 'runCount'>[] = []
  // The Monday on or before the 1st, taken from F03's ISO-week arithmetic rather than a local
  // day-of-week walk, so "which Monday owns this day" has exactly one implementation.
  let bucketStart = isoWeekRange(isoWeekKeyOf(monthStart)).startISO

  // `bucketStart > monthEnd` is the termination condition from §6 step 3 — not `bucketEnd`, which
  // would drop a final bucket whose Monday is the last day of the month.
  while (bucketStart <= monthEnd) {
    const bucketEnd = addDays(bucketStart, 6)
    out.push({
      // Every day in a 7-day window resolves to the same ISO week, so the Monday decides it.
      isoWeekKey: isoWeekKeyOf(bucketStart),
      clippedStartISO: bucketStart < monthStart ? monthStart : bucketStart,
      clippedEndISO: bucketEnd > monthEnd ? monthEnd : bucketEnd,
      isPartial: bucketStart < monthStart || bucketEnd > monthEnd,
      isCurrent: currentMonth && todayISO >= bucketStart && todayISO <= bucketEnd,
    })
    bucketStart = addDays(bucketStart, 7)
  }
  return out
}

/**
 * The ranges above, with each bucket's runs summed into it.
 *
 * Runs are matched against the **clipped** range, never the unclipped week — that single choice is
 * what makes a week straddling two months produce one correctly-smaller bar in each month's chart
 * instead of a doubled or a dropped kilometre.
 */
export function weeksInMonth(
  month: MonthKey,
  runs: readonly ChartRun[],
  todayISO: DateISO,
): MonthWeekBucket[] {
  return monthWeekBucketRanges(month, todayISO).map((bucket) => {
    const inBucket = runs.filter(
      (r) => r.occurredOn >= bucket.clippedStartISO && r.occurredOn <= bucket.clippedEndISO,
    )
    return {
      ...bucket,
      distanceM: inBucket.reduce((sum, r) => sum + r.distanceM, 0),
      runCount: inBucket.length,
    }
  })
}
