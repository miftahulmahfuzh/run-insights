import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * Records and badges are written with deliberately OPPOSITE shapes, and both halves matter:
 *
 *   - a record is a statement about the current best, so a correction must be able to REMOVE one
 *     → full replace (D7 / R-10)
 *   - a badge is a fact about the past, never revoked by a later correction to a different run
 *     → per-key upsert that only ever increments
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

describe('replaceRecords', () => {
  it('is DELETE then INSERT in one batch — never an UPDATE', async () => {
    fake.enqueue([], [])
    await q.replaceRecords('u1', [
      { key: 'longest_distance', runId: 'r1', value: 10670, achievedOn: '2026-08-20' },
    ])

    expect(fake.batches).toEqual([2])
    expect(fake.sqlAt(0)).toMatch(/^delete from "records"/)
    expect(fake.sqlAt(1)).toMatch(/^insert into "records"/)
    expect(fake.queries.some((x) => x.sql.startsWith('update "records"'))).toBe(false)
  })

  it('scopes the delete to the user — a bare DELETE here would empty the table', async () => {
    fake.enqueue([], [])
    await q.replaceRecords('u1', [
      { key: 'longest_distance', runId: 'r1', value: 1, achievedOn: '2026-08-20' },
    ])
    expect(fake.sqlAt(0)).toContain('"user_id" = $')
  })

  it('deletes only, with no INSERT, when nothing qualifies any more', async () => {
    // The case a per-key upsert cannot express: the run holding fastest_pace_10k was corrected
    // down and no run now qualifies. The record must vanish, not linger pointing at that run.
    fake.enqueue([])
    await q.replaceRecords('u1', [])
    expect(fake.queries).toHaveLength(1)
    expect(fake.sqlAt(0)).toMatch(/^delete from "records"/)
  })

  it('stamps every row with the caller’s userId, ignoring anything in the payload', async () => {
    fake.enqueue([], [])
    await q.replaceRecords('u1', [
      { key: 'most_kcal', runId: 'r1', value: 646, achievedOn: '2026-08-20' },
      { key: 'highest_max_hr', runId: 'r1', value: 189, achievedOn: '2026-08-20' },
    ])
    const insert = fake.queries[1]!
    expect(insert.params.filter((p) => p === 'u1')).toHaveLength(2)
  })
})

describe('upsertBadge', () => {
  it('inserts count = 1 and increments on conflict — never overwrites the count', async () => {
    fake.enqueue([])
    await q.upsertBadge('u1', 'early_bird', {
      runId: 'r1',
      scopeKey: null,
      earnedOn: '2026-08-20',
    })
    const { sql } = fake.only()
    expect(sql).toMatch(/on conflict \("user_id","key"\) do update/)
    expect(sql).toContain('"count" = "badges"."count" + 1')
  })

  it('moves earned_on forward and re-points run_id on a re-earn', async () => {
    fake.enqueue([])
    await q.upsertBadge('u1', 'redline_republic', {
      runId: 'r2',
      scopeKey: null,
      earnedOn: '2026-09-01',
    })
    const { sql } = fake.only()
    expect(sql).toContain('"earned_on" = ')
    expect(sql).toContain('"run_id" = ')
  })

  it('accepts a period badge with a scope key and no run', async () => {
    fake.enqueue([])
    await q.upsertBadge('u1', 'century_club', {
      runId: null,
      scopeKey: '2026-08',
      earnedOn: '2026-08-31',
    })
    expect(fake.only().params).toContain('2026-08')
  })
})

describe('reads', () => {
  it('getRecords and getBadges are user-scoped and stably ordered', async () => {
    fake.enqueue([])
    await q.getRecords('u1')
    expect(fake.only().sql).toMatch(/where "records"\."user_id" = \$1 order by "records"\."key"/)

    fake.reset()
    fake.enqueue([])
    await q.getBadges('u1')
    expect(fake.only().sql).toMatch(/where "badges"\."user_id" = \$1 order by "badges"\."key"/)
  })
})

describe('profile', () => {
  it('upsertProfile inserts or updates the single row keyed by user_id', async () => {
    fake.enqueue([])
    await q.upsertProfile('u1', { birthYear: 1990, maxHr: 189 })
    const { sql } = fake.only()
    expect(sql).toMatch(/^insert into "profiles"/)
    expect(sql).toContain('on conflict ("user_id") do update')
    expect(sql).toContain('"updated_at"')
  })

  it('getProfile returns null rather than throwing for a user who has not onboarded', async () => {
    fake.enqueue([])
    await expect(q.getProfile('u1')).resolves.toBeNull()
  })
})
