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

describe('getMonthlyTotals', () => {
  it('groups by to_char in the SELECT while still range-scanning in the WHERE', async () => {
    fake.enqueue([])
    await q.getMonthlyTotals('u1', 6, '2026-08')
    const { sql, params } = fake.only()
    const whereClause = sql.slice(sql.indexOf('where'), sql.indexOf('group by'))
    expect(whereClause).not.toContain('to_char')
    expect(sql).toContain('group by')
    expect(params).toContain('2026-03-01') // six months back, inclusive
    expect(params).toContain('2026-09-01')
  })

  it('maps every aggregate through Number — SUM(integer) arrives as a STRING over the wire', async () => {
    // This is the gotcha integer columns do NOT protect you from: Postgres widens SUM(int) to
    // bigint, and @neondatabase/serverless hands bigint back as a string. Without .mapWith,
    // '10670' + '5330' is '106705330'.
    fake.enqueue([['2026-08', '2', '16000', '7200']])
    const totals = await q.getMonthlyTotals('u1', 1, '2026-08')
    expect(totals).toEqual([{ month: '2026-08', runCount: 2, distanceM: 16000, durationSec: 7200 }])
    expect(typeof totals[0]!.distanceM).toBe('number')
  })

  it('zero-fills a month with no runs instead of dropping it', async () => {
    fake.enqueue([['2026-08', '1', '10670', '4716']])
    const totals = await q.getMonthlyTotals('u1', 3, '2026-08')
    expect(totals.map((t) => t.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(totals[0]).toEqual({ month: '2026-06', runCount: 0, distanceM: 0, durationSec: 0 })
    expect(totals[2]!.distanceM).toBe(10670)
  })

  it('validates the window instead of building an unbounded query', async () => {
    await expect(q.getMonthlyTotals('u1', 0, '2026-08')).rejects.toThrow(RangeError)
    await expect(q.getMonthlyTotals('u1', 61, '2026-08')).rejects.toThrow(RangeError)
    await expect(q.getMonthlyTotals('u1', 1.5, '2026-08')).rejects.toThrow(RangeError)
    expect(fake.queries).toHaveLength(0)
  })
})

describe('fillZeroMonths (pure)', () => {
  it('returns exactly N entries, oldest to newest, anchored inclusively', () => {
    const out = q.fillZeroMonths([], '2026-01', 3)
    expect(out.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('keeps supplied months and zeroes the rest', () => {
    const out = q.fillZeroMonths(
      [{ month: '2026-01', runCount: 4, distanceM: 40000, durationSec: 18000 }],
      '2026-02',
      2,
    )
    expect(out).toEqual([
      { month: '2026-01', runCount: 4, distanceM: 40000, durationSec: 18000 },
      { month: '2026-02', runCount: 0, distanceM: 0, durationSec: 0 },
    ])
  })

  it('ignores rows outside the window rather than misplacing them', () => {
    const out = q.fillZeroMonths(
      [{ month: '2025-01', runCount: 9, distanceM: 1, durationSec: 1 }],
      '2026-02',
      2,
    )
    expect(out.every((r) => r.runCount === 0)).toBe(true)
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

describe('getObservedMaxHr', () => {
  it('returns a number when a max exists', async () => {
    fake.enqueue([['189']])
    await expect(q.getObservedMaxHr('u1')).resolves.toBe(189)
  })

  it('returns null — never 0 — when no run has an HR, so the caller can degrade', async () => {
    // Roadmap §4.4: "no birth_year and no observed max -> null; the caller must degrade, not
    // default". A 0 here would silently become a divide-by-zero %HRmax.
    fake.enqueue([[null]])
    await expect(q.getObservedMaxHr('u1')).resolves.toBeNull()
  })
})
