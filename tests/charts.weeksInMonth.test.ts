import { describe, expect, it } from 'vitest'

import type { ChartRun } from '@/lib/charts'
import { monthWeekBucketRanges, weeksInMonth } from '@/lib/charts'
import { addDays, monthRange } from '@/lib/date/ranges'

/**
 * §11's "one invariant that must never regress":
 *
 *     sum(weeksInMonth(month).map(b => b.distanceM)) === the month's own total
 *
 * Tested against three real months, including both boundary cases §6 names by hand: a month whose
 * first day is a Sunday (February 2026 — so the first bucket is a single day) and a month whose
 * last day is a Monday (August 2026 — so the last bucket is a single day too).
 */

/** One run per day of the month, 1 km each, so the total is trivially re-derivable by hand. */
function oneRunPerDay(month: string): ChartRun[] {
  const { startISO, endExclusiveISO } = monthRange(month)
  const out: ChartRun[] = []
  for (let day = startISO; day < endExclusiveISO; day = addDays(day, 1)) {
    out.push({
      runId: `run_${day}`,
      occurredOn: day,
      distanceM: 1000,
      durationSec: 400,
      avgPaceSec: 400,
      zones: [],
    })
  }
  return out
}

describe('the sum invariant — every kilometre in the month, in exactly one bucket', () => {
  for (const month of ['2026-02', '2026-08', '2026-11']) {
    it(`holds for ${month} with a run on every single day`, () => {
      const runs = oneRunPerDay(month)
      const buckets = weeksInMonth(month, runs, '2026-08-21')
      const bucketTotal = buckets.reduce((sum, b) => sum + b.distanceM, 0)
      const monthTotal = runs.reduce((sum, r) => sum + r.distanceM, 0)

      expect(bucketTotal).toBe(monthTotal)
      expect(buckets.reduce((sum, b) => sum + b.runCount, 0)).toBe(runs.length)
    })
  }

  it('never counts a neighbouring month’s run, however close to the boundary', () => {
    // 31 Jul and 1 Sep both sit inside the ISO weeks that August's first and last buckets belong
    // to. Clipping is what keeps them out, and this is the assertion that clipping happened.
    const runs: ChartRun[] = [
      {
        runId: 'jul',
        occurredOn: '2026-07-31',
        distanceM: 9000,
        durationSec: 1,
        avgPaceSec: 1,
        zones: [],
      },
      {
        runId: 'aug',
        occurredOn: '2026-08-01',
        distanceM: 5000,
        durationSec: 1,
        avgPaceSec: 1,
        zones: [],
      },
      {
        runId: 'sep',
        occurredOn: '2026-09-01',
        distanceM: 7000,
        durationSec: 1,
        avgPaceSec: 1,
        zones: [],
      },
    ]
    const buckets = weeksInMonth('2026-08', runs, '2026-08-21')
    expect(buckets.reduce((sum, b) => sum + b.distanceM, 0)).toBe(5000)
  })
})

describe('February 2026 — a month that starts on a Sunday', () => {
  const buckets = monthWeekBucketRanges('2026-02', '2026-08-21')

  it('produces a single-day first bucket, clipped to the 1st', () => {
    expect(buckets[0]).toMatchObject({
      clippedStartISO: '2026-02-01',
      clippedEndISO: '2026-02-01',
      isPartial: true,
    })
  })

  it('runs to the 28th and stops', () => {
    expect(buckets).toHaveLength(5)
    expect(buckets[4]).toMatchObject({ clippedStartISO: '2026-02-23', clippedEndISO: '2026-02-28' })
  })
})

describe('August 2026 — a month that ends on a Monday', () => {
  const buckets = monthWeekBucketRanges('2026-08', '2026-08-21')

  it('does not drop the final bucket, whose Monday IS the last day of the month', () => {
    // The §6 loop condition is `bucketStart <= monthEnd`, not `bucketEnd <= monthEnd`. Getting that
    // wrong silently loses 31 August from the chart while the hero number still counts it.
    expect(buckets).toHaveLength(6)
    expect(buckets[5]).toMatchObject({
      clippedStartISO: '2026-08-31',
      clippedEndISO: '2026-08-31',
      isPartial: true,
    })
  })

  it('labels the fixture’s own week as the current one, and only in the current month', () => {
    // 21 Aug 2026 falls in the 17–23 Aug bucket.
    expect(buckets.map((b) => b.isCurrent)).toEqual([false, false, false, true, false, false])
    expect(monthWeekBucketRanges('2026-08', '2026-09-04').some((b) => b.isCurrent)).toBe(false)
  })

  it('marks only the two boundary weeks partial', () => {
    expect(buckets.map((b) => b.isPartial)).toEqual([true, false, false, false, false, true])
  })
})
