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
