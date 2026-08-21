import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * Records and badges are written with deliberately OPPOSITE shapes, and both halves matter:
 *
 *   - a record is a statement about the current best, so a correction must be able to REMOVE one
 *     → full replace (D7 / R-10)
 *   - a badge is a fact about the past, never revoked by a later correction to a different run
 *     → an append-only ledger whose primary key does the deduping (F13)
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

describe('insertBadgeAward', () => {
  it('is INSERT … ON CONFLICT DO NOTHING — never an UPDATE, and never a count increment', async () => {
    // F13. Before this, a re-earn was `count = count + 1` and the application decided when to
    // issue one — a decision it could only make against the LAST run recorded, so re-reviewing an
    // earlier run inflated the count (F12 §4.1). The primary key answers it now.
    fake.enqueue([{ key: 'early_bird' }])
    await q.insertBadgeAward('u1', 'early_bird', {
      runId: 'r1',
      scopeKey: null,
      dedupeKey: 'r1',
      earnedOn: '2026-08-20',
    })
    const { sql } = fake.only()
    expect(sql).toMatch(/^insert into "badges"/)
    expect(sql).toContain('on conflict do nothing')
    expect(sql).not.toContain('do update')
    expect(sql).not.toContain('"count" = "badges"."count" + 1')
  })

  it('returns true when a row was written and false when the earn was already there', async () => {
    // `newlyEarned` is built from this boolean, so it has to be what the database did rather than
    // what the evaluator hoped it would do.
    fake.enqueue([{ key: 'early_bird' }])
    await expect(
      q.insertBadgeAward('u1', 'early_bird', {
        runId: 'r1',
        scopeKey: null,
        dedupeKey: 'r1',
        earnedOn: '2026-08-20',
      }),
    ).resolves.toBe(true)

    fake.reset()
    fake.enqueue([]) // ON CONFLICT DO NOTHING returns no rows
    await expect(
      q.insertBadgeAward('u1', 'early_bird', {
        runId: 'r1',
        scopeKey: null,
        dedupeKey: 'r1',
        earnedOn: '2026-08-20',
      }),
    ).resolves.toBe(false)
  })

  it('writes the dedupe key alongside the run, and count = 1 on every row', async () => {
    fake.enqueue([{ key: 'redline_republic' }])
    await q.insertBadgeAward('u1', 'redline_republic', {
      runId: 'r2',
      scopeKey: null,
      dedupeKey: 'r2',
      earnedOn: '2026-09-01',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"dedupe_key"')
    expect(params).toContain('r2')
    expect(params).toContain(1) // the column is a fold, and every row this app writes is one earn
  })

  it('accepts a period badge whose dedupe key is the scope key and whose run is null', async () => {
    fake.enqueue([{ key: 'century_club' }])
    await q.insertBadgeAward('u1', 'century_club', {
      runId: null,
      scopeKey: '2026-08',
      dedupeKey: '2026-08',
      earnedOn: '2026-08-31',
    })
    expect(fake.only().params.filter((p) => p === '2026-08')).toHaveLength(2)
  })
})

describe('reads', () => {
  it('getRecords and getBadgeAwards are user-scoped and stably ordered', async () => {
    fake.enqueue([])
    await q.getRecords('u1')
    expect(fake.only().sql).toMatch(/where "records"\."user_id" = \$1 order by "records"\."key"/)

    fake.reset()
    fake.enqueue([])
    await q.getBadgeAwards('u1')
    // Key then day: the ledger arrives grouped and oldest-first, which is the order `foldAwards`
    // reads most naturally even though it does not depend on one.
    expect(fake.only().sql).toMatch(
      /where "badges"\."user_id" = \$1 order by "badges"\."key" asc, "badges"\."earned_on" asc/,
    )
  })

  it('getBadgeAwardsForRun asks the database, not an array filter', async () => {
    // The ledger grows without bound now, so F11's inline read is a real WHERE on
    // `badges_user_run_idx` rather than a scan of every award the user holds.
    fake.enqueue([])
    await q.getBadgeAwardsForRun('u1', 'r1')
    const { sql, params } = fake.only()
    expect(sql).toContain('"run_id" = $')
    expect(params).toEqual(['u1', 'r1'])
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
