import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

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

describe('range predicates, not functional ones', () => {
  it('getRunsInMonth scans a half-open date range so the index can be used', async () => {
    fake.enqueue([])
    await q.getRunsInMonth('u1', '2026-08')
    const { sql, params } = fake.only()
    expect(sql).toContain('>=')
    expect(sql).toContain('<')
    // to_char(occurred_on, ...) = '2026-08' returns the same rows and cannot use
    // runs_user_occurred_idx at all — a full scan that grows with the account's lifetime.
    expect(sql).not.toContain('to_char')
    expect(params).toContain('2026-08-01')
    expect(params).toContain('2026-09-01')
  })

  it('getRunsInIsoWeek resolves the Monday..Monday window', async () => {
    fake.enqueue([])
    await q.getRunsInIsoWeek('u1', '2026-W34')
    const { sql, params } = fake.only()
    expect(sql).not.toContain('to_char')
    expect(params).toContain('2026-08-17')
    expect(params).toContain('2026-08-24')
  })

  it('rejects a malformed scope key before it reaches the database', async () => {
    await expect(q.getRunsInMonth('u1', '2026-8')).rejects.toThrow(RangeError)
    await expect(q.getRunsInIsoWeek('u1', '2026-W99')).rejects.toThrow(RangeError)
    expect(fake.queries).toHaveLength(0)
  })

  it('orders week and month reads oldest-first, which is chart order', async () => {
    fake.enqueue([])
    await q.getRunsInIsoWeek('u1', '2026-W34')
    expect(fake.only().sql).toMatch(/order by "runs"\."occurred_on" asc/)
  })
})

describe('getAllTimeTotals', () => {
  it('returns numbers and date strings, with null dates for an empty account', async () => {
    fake.enqueue([['0', '0', '0', null, null]])
    const totals = await q.getAllTimeTotals('u1')
    expect(totals).toEqual({
      runCount: 0,
      distanceM: 0,
      durationSec: 0,
      firstRunOn: null,
      lastRunOn: null,
    })
  })

  it('coalesces the sums so an empty account is 0 and not null', async () => {
    fake.enqueue([])
    const totals = await q.getAllTimeTotals('u1')
    expect(totals.distanceM).toBe(0)
    expect(fake.only().sql).toContain('coalesce')
  })
})

describe('aggregateRunMetric — the one parameterised aggregate', () => {
  it('scans a half-open range and aggregates in SQL, returning no rows', async () => {
    fake.enqueue([['2843.6666', '11', '11']])
    const result = await q.aggregateRunMetric('u1', {
      metric: 'durationSec',
      agg: 'avg',
      startISO: '2026-07-04',
      endExclusiveISO: '2026-09-04',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('avg(')
    expect(sql).toContain('>=')
    expect(sql).toContain('<')
    expect(sql).not.toContain('to_char')
    expect(params).toContain('2026-07-04')
    expect(params).toContain('2026-09-04')
    // numeric comes back from the driver as a string; Number() happens once, after a null check.
    expect(result).toEqual({ value: 2843.6666, n: 11, runCount: 11 })
  })

  it('is userId-scoped and reviewed-only, like every other rollup', async () => {
    fake.enqueue([[null, '0', '0']])
    await q.aggregateRunMetric('u1', {
      metric: 'elevationM',
      agg: 'sum',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"user_id"')
    expect(sql).toContain('"reviewed_at" is not null')
    expect(params).toContain('u1')
  })

  it('names the metric COLUMN in the SQL and never binds it as a parameter', async () => {
    fake.enqueue([['151', '9', '14']])
    await q.aggregateRunMetric('u1', {
      metric: 'avgHr',
      agg: 'avg',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"avg_hr"')
    // The closed map is the injection boundary: nothing a caller names becomes a bound string.
    expect(params).not.toContain('avgHr')
    expect(params).not.toContain('avg_hr')
  })

  it('adds no intent predicate when no intent is asked for', async () => {
    fake.enqueue([['0', '0', '0']])
    await q.aggregateRunMetric('u1', {
      metric: 'distanceM',
      agg: 'sum',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    expect(fake.only().sql).not.toContain('"intent"')
  })

  it('filters on intent when one is asked for', async () => {
    fake.enqueue([['12400', '4', '4']])
    await q.aggregateRunMetric('u1', {
      metric: 'distanceM',
      agg: 'max',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
      intent: 'long',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"intent"')
    expect(params).toContain('long')
  })

  it('counts NON-NULL readings, so a nullable metric can be asked how many runs have it', async () => {
    fake.enqueue([['9', '9', '14']])
    const result = await q.aggregateRunMetric('u1', {
      metric: 'elevationM',
      agg: 'count',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    // `n` is count(column) and `runCount` is count(*) — 9 of 14 runs recorded an elevation gain.
    expect(result.n).toBe(9)
    expect(result.runCount).toBe(14)
    expect(fake.only().sql).toContain('count(*)')
  })

  it('returns null and NOT zero when nothing in the range has a reading', async () => {
    fake.enqueue([[null, '0', '6']])
    const result = await q.aggregateRunMetric('u1', {
      metric: 'activeKcal',
      agg: 'avg',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    // Number(null) is 0, which is the one wrong answer this function must never give.
    expect(result.value).toBeNull()
    expect(result.runCount).toBe(6)
  })
})
