import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The reviewed-data invariant (roadmap D16 / R-13), asserted query by query.
 *
 * This file exists because of the shape of the failure it guards. Forgetting
 * `reviewed_at is not null` on the eleventh rollup does not crash and does not look wrong: it
 * produces a plausible number that is quietly too high, and it stays wrong until somebody adds
 * up their own runs by hand. Every reviewed-only function is therefore named here explicitly,
 * and adding a new rollup without adding it to this list is the mistake this test is for.
 */

type Queries = typeof import('@/lib/db/queries')

let fake: FakeDb
let q: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  q = await import('@/lib/db/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('reviewed-only queries', () => {
  it('listRuns filters on reviewed_at', async () => {
    fake.enqueue([])
    await q.listRuns('u1')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('listRunsWithPhotoCounts filters on reviewed_at — the list read, with its join', async () => {
    fake.enqueue([])
    await q.listRunsWithPhotoCounts('u1')
    const { sql } = fake.only()
    expect(sql).toContain('"reviewed_at" is not null')
    // The LEFT JOIN to run_photos must not have loosened the predicate: the count is per RUN, and
    // the run is still the thing being filtered.
    expect(sql).toContain('left join "run_photos"')
    expect(sql).toContain('group by')
  })

  it('getRunsInIsoWeek filters on reviewed_at', async () => {
    fake.enqueue([])
    await q.getRunsInIsoWeek('u1', '2026-W34')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getRunsInMonth filters on reviewed_at', async () => {
    fake.enqueue([])
    await q.getRunsInMonth('u1', '2026-08')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getRunsBetween filters on reviewed_at', async () => {
    fake.enqueue([])
    await q.getRunsBetween('u1', '2026-07-24', '2026-08-21')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getMonthlyTotals filters on reviewed_at', async () => {
    fake.enqueue([])
    await q.getMonthlyTotals('u1', 6, '2026-08')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getAllTimeTotals filters on reviewed_at', async () => {
    fake.enqueue([[0, 0, 0, null, null]])
    await q.getAllTimeTotals('u1')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getObservedMaxHr filters on reviewed_at — a hallucinated 210 must never become a ceiling', async () => {
    fake.enqueue([[null]])
    await q.getObservedMaxHr('u1')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getObservedMaxHrExcludingRun filters on reviewed_at and excludes the run', async () => {
    fake.enqueue([[null]])
    await q.getObservedMaxHrExcludingRun('u1', 'r1')
    const { sql, params } = fake.only()
    expect(sql).toContain('"reviewed_at" is not null')
    expect(sql).toContain('<>')
    expect(params).toContain('r1')
  })

  it('getObservedMaxHrRun filters on reviewed_at — F02’s resolver reads this one, not the max()', async () => {
    fake.enqueue([])
    await q.getObservedMaxHrRun('u1')
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })

  it('getObservedMaxHrRun compares against the estimate in SQL and takes the highest, singly', async () => {
    fake.enqueue([])
    await q.getObservedMaxHrRun('u1', { minBpm: 187 })
    const { sql, params } = fake.only()
    expect(sql).toContain('"runs"."max_hr" > $')
    expect(sql).toContain('order by "runs"."max_hr" desc')
    expect(sql).toContain('limit $')
    expect(params).toContain(187)
  })

  it('getObservedMaxHrRun adds the asOf cutoff only when asked for one', async () => {
    fake.enqueue([])
    await q.getObservedMaxHrRun('u1')
    expect(fake.only().sql).not.toContain('"occurred_on" <=')

    fake.reset()
    fake.enqueue([])
    await q.getObservedMaxHrRun('u1', { asOf: '2026-08-19' })
    expect(fake.only().sql).toContain('"runs"."occurred_on" <= $')
  })

  it('getReviewedRunsWithChildren filters reviewed_at on the run AND on both child reads', async () => {
    // Three statements in one batch. The children carry no user_id and no reviewed_at of their
    // own, so each proves BOTH through a correlated EXISTS back to `runs` — miss it on the splits
    // read and an unreviewed run's kilometres feed the record recompute anyway.
    fake.enqueue([], [], [])
    await q.getReviewedRunsWithChildren('u1')
    expect(fake.batches).toEqual([3])
    for (let i = 0; i < 3; i++) {
      expect(fake.sqlAt(i)).toContain('"reviewed_at" is not null')
      expect(fake.sqlAt(i)).toContain('"runs"."user_id" = $')
    }
    expect(fake.sqlAt(1)).toContain('"run_splits"')
    expect(fake.sqlAt(2)).toContain('"run_zones"')
  })

  it('getPreviousReviewedRun filters on reviewed_at and takes the nearest earlier day', async () => {
    fake.enqueue([])
    await q.getPreviousReviewedRun('u1', '2026-08-20')
    const { sql, params } = fake.only()
    expect(sql).toContain('"reviewed_at" is not null')
    expect(sql).toContain('"runs"."occurred_on" < $')
    expect(sql).toContain('order by "runs"."occurred_on" desc')
    expect(sql).toContain('limit $')
    expect(params).toContain('2026-08-20')
  })

  it('getReviewedRunWindow filters reviewed_at, orders by the R-5 position, and limits', async () => {
    fake.enqueue([['r1', '2026-08-20', '07:07:00', 10_670, 4716, 173, 442]], [])
    const window = await q.getReviewedRunWindow(
      'u1',
      { occurredOn: '2026-08-20', startedAt: '07:07:00' },
      4,
    )
    expect(window).toEqual([
      {
        id: 'r1',
        occurredOn: '2026-08-20',
        startedAt: '07:07:00',
        distanceM: 10_670,
        durationSec: 4716,
        avgHr: 173,
        avgPaceSec: 442,
        splits: [],
      },
    ])

    const first = fake.sqlAt(0)
    expect(first).toContain('"reviewed_at" is not null')
    // The row-value comparison is the same total order the R-5 dedupe index imposes, so "before
    // this run" means one thing across the codebase — and a NULL start time sorts as midnight
    // rather than dropping the row.
    expect(first).toContain('coalesce')
    expect(first).toContain('limit $')
    // The splits read is scoped through the run's OWNER and restricted to the ids the reviewed-only
    // statement above just returned. It does not repeat `reviewed_at`, and does not need to: an id
    // that reached this list has already passed that filter.
    expect(fake.sqlAt(1)).toContain('"run_splits"."run_id" in')
    expect(fake.sqlAt(1)).toMatch(/"runs"\."user_id" = \$\d/)
  })

  it('getReviewedRunWindow refuses an unbounded limit', async () => {
    await expect(
      q.getReviewedRunWindow('u1', { occurredOn: '2026-08-20', startedAt: null }, 0),
    ).rejects.toThrow(RangeError)
  })

  it('getReviewedRunWindow issues no second statement when the window is empty', async () => {
    fake.enqueue([])
    expect(
      await q.getReviewedRunWindow('u1', { occurredOn: '2026-08-20', startedAt: null }, 4),
    ).toEqual([])
    expect(fake.queries).toHaveLength(1)
  })

  it('getReviewedRunsBefore filters reviewed_at, EXCLUDES the run itself, and limits', async () => {
    fake.enqueue([['r1', '2026-08-14', 8020, 3300, 411, 168, 'easy']], [])
    const before = await q.getReviewedRunsBefore(
      'u1',
      { occurredOn: '2026-08-22', startedAt: '06:12:00' },
      8,
    )
    expect(before).toEqual([
      {
        id: 'r1',
        occurredOn: '2026-08-14',
        distanceM: 8020,
        durationSec: 3300,
        avgPaceSec: 411,
        avgHr: 168,
        intent: 'easy',
        zones: [],
      },
    ])

    const first = fake.sqlAt(0)
    expect(first).toContain('"reviewed_at" is not null')
    // STRICTLY `<`, where getReviewedRunWindow is `<=`. The run being narrated must not appear in
    // its own history — it would be in the payload twice and could be quoted as precedent for
    // itself. A `<=` here would be silent: the array would just be one row longer.
    expect(first).toMatch(/coalesce\([^)]*\) *\) < \(/)
    expect(first).not.toContain(') <= (')
    expect(first).toContain('limit $')
  })

  it('getReviewedRunsBefore reads zones, not splits, and scopes them through the owner', async () => {
    fake.enqueue(
      [
        ['r1', '2026-08-14', 8020, 3300, 411, 168, 'easy'],
        ['r2', '2026-08-07', 10_050, 4100, 408, 171, null],
      ],
      [
        ['r1', 3, 1800],
        ['r1', 4, 1500],
        ['r2', 2, 4100],
      ],
    )
    const before = await q.getReviewedRunsBefore(
      'u1',
      { occurredOn: '2026-08-22', startedAt: null },
      8,
    )
    expect(before.map((r) => r.zones)).toEqual([
      [
        { zone: 3, durationSec: 1800 },
        { zone: 4, durationSec: 1500 },
      ],
      [{ zone: 2, durationSec: 4100 }],
    ])

    const second = fake.sqlAt(1)
    expect(second).toContain('"run_zones"."run_id" in')
    expect(second).not.toContain('run_splits')
    expect(second).toMatch(/"runs"\."user_id" = \$\d/)
  })

  it('getReviewedRunsBefore refuses an unbounded limit', async () => {
    await expect(
      q.getReviewedRunsBefore('u1', { occurredOn: '2026-08-22', startedAt: null }, 0),
    ).rejects.toThrow(RangeError)
  })

  it('getReviewedRunsBefore issues no second statement when there is no earlier run', async () => {
    fake.enqueue([])
    expect(
      await q.getReviewedRunsBefore('u1', { occurredOn: '2026-08-22', startedAt: null }, 8),
    ).toEqual([])
    expect(fake.queries).toHaveLength(1)
  })

  it('countReviewedRunsStartedBefore filters reviewed_at and compares as a time', async () => {
    // A mapped select comes back positionally from the driver — see tests/support/fakeDb.ts.
    fake.enqueue([['3']])
    expect(await q.countReviewedRunsStartedBefore('u1', '06:00:00')).toBe(3)
    const { sql, params } = fake.only()
    expect(sql).toContain('"reviewed_at" is not null')
    expect(sql).toContain('::time')
    expect(params).toContain('06:00:00')
  })

  it('hasOtherReviewedRunAtLocation filters reviewed_at and excludes the run itself', async () => {
    fake.enqueue([])
    expect(await q.hasOtherReviewedRunAtLocation('u1', 'Tangerang', 'r1')).toBe(false)
    const { sql, params } = fake.only()
    expect(sql).toContain('"reviewed_at" is not null')
    expect(sql).toContain('<>')
    expect(params).toContain('Tangerang')
    expect(params).toContain('r1')
  })

  it('every reviewed-only query is also user-scoped', async () => {
    const calls: Array<() => Promise<unknown>> = [
      () => q.listRuns('u1'),
      () => q.listRunsWithPhotoCounts('u1'),
      () => q.getRunsInIsoWeek('u1', '2026-W34'),
      () => q.getRunsInMonth('u1', '2026-08'),
      () => q.getRunsBetween('u1', '2026-08-01', '2026-08-08'),
      () => q.getMonthlyTotals('u1', 3, '2026-08'),
      () => q.countReviewedRunsStartedBefore('u1', '06:00:00'),
      () => q.hasOtherReviewedRunAtLocation('u1', 'Tangerang', 'r1'),
    ]
    for (const call of calls) {
      fake.reset()
      fake.enqueue([])
      await call()
      expect(fake.only().sql).toMatch(/"runs"\."user_id" = \$\d/)
    }
  })
})

describe('draft-visible queries', () => {
  it('getRunIdForExtraction does NOT filter reviewed_at — it resolves a redirect target', async () => {
    fake.enqueue([])
    await q.getRunIdForExtraction('u1', 'x1')
    expect(fake.only().sql).not.toContain('"reviewed_at" is not null')
  })

  it('getRun does NOT filter reviewed_at — "show me this row" is not an aggregate', async () => {
    fake.enqueue([])
    await q.getRun('u1', 'r1')
    const { sql, params } = fake.only()
    expect(sql).not.toContain('"reviewed_at" is not null')
    expect(sql).toContain('"runs"."user_id" = $')
    expect(params).toContain('r1')
  })

  it('getRunDetail does NOT filter reviewed_at', async () => {
    fake.enqueue([], [], [], [])
    await q.getRunDetail('u1', 'r1')
    // The column appears in the SELECT list of a full-table read; what must be absent is the
    // PREDICATE.
    expect(fake.sqlAt(0)).not.toContain('"reviewed_at" is not null')
  })
})

describe('the invariant is complete', () => {
  it('names every rollup-shaped export, so a new one cannot be added silently', async () => {
    // If this list and the module diverge, one of two things happened: a new aggregate was added
    // without a reviewed_at assertion above, or one was renamed. Both need a human.
    const exportedRollups = Object.keys(q)
      .filter((name) =>
        /^(list|get)Runs|^getReviewedRun|^getMonthlyTotals$|^getAllTimeTotals$|^getObservedMaxHr|^countReviewedRuns|^hasOtherReviewedRun/.test(
          name,
        ),
      )
      .sort()
    expect(exportedRollups).toEqual([
      'countReviewedRunsStartedBefore',
      'getAllTimeTotals',
      'getMonthlyTotals',
      'getObservedMaxHr',
      'getObservedMaxHrExcludingRun',
      'getObservedMaxHrRun',
      'getReviewedRunWindow',
      'getReviewedRunsBefore',
      'getReviewedRunsWithChildren',
      'getRunsBetween',
      'getRunsInIsoWeek',
      'getRunsInMonth',
      'hasOtherReviewedRunAtLocation',
      'listRuns',
      'listRunsWithPhotoCounts',
    ])
  })
})
