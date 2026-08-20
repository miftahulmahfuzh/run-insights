import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

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

describe('getInsight — the facts_hash cache', () => {
  it('matches on all four key columns, so identical facts never bill twice', async () => {
    fake.enqueue([])
    await q.getInsight('u1', 'week', '2026-W34', 'abc123')
    const { sql, params } = fake.only()
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"scope" = $')
    expect(sql).toContain('"scope_key" = $')
    expect(sql).toContain('"facts_hash" = $')
    expect(params).toEqual(['u1', 'week', '2026-W34', 'abc123', 1])
  })
})

describe('getLatestInsight — R-19 insight memory', () => {
  it('is newest-first regardless of hash, which is what week 5 diffs against week 4', async () => {
    fake.enqueue([])
    await q.getLatestInsight('u1', 'week', '2026-W33')
    const { sql } = fake.only()
    expect(sql).toContain('order by "insights"."created_at" desc')
    // The column is in the projection; what must be absent is the PREDICATE, or "latest" would
    // silently mean "latest with these exact facts" and the diff would always be empty.
    expect(sql).not.toContain('"facts_hash" = $')
  })
})

describe('saveInsight', () => {
  it('inserts a new row and reports created: true', async () => {
    fake.enqueue([['i1']])
    const result = await q.saveInsight('u1', {
      scope: 'session',
      scopeKey: 'r1',
      factsHash: 'h1',
      payload: { headline: 'ok', hrMaxUsed: 189, hrMaxSource: 'observed' },
      model: 'glm-5.3',
    })
    expect(result).toEqual({ id: 'i1', created: true })
    expect(fake.only().sql).toContain('on conflict')
  })

  it('does NOT overwrite an existing payload — an insight a runner has read is immutable', async () => {
    fake.enqueue([])
    const { insights } = await import('@/lib/db/schema')
    fake.enqueue([tableRow(insights, { id: 'i_existing' })])

    const result = await q.saveInsight('u1', {
      scope: 'week',
      scopeKey: '2026-W34',
      factsHash: 'h1',
      payload: { headline: 'second attempt' },
      model: 'glm-5.3',
    })

    expect(result).toEqual({ id: 'i_existing', created: false })
    expect(fake.sqlAt(0)).toContain('do nothing')
    expect(fake.sqlAt(0)).not.toContain('do update')
  })

  it('freezes the denominator by storing whatever payload the caller computed (R-11)', async () => {
    fake.enqueue([['i1']])
    await q.saveInsight('u1', {
      scope: 'session',
      scopeKey: 'r1',
      factsHash: 'h1',
      payload: { hrMaxUsed: 189, hrMaxSource: 'observed' },
      model: 'glm-5.3',
    })
    const payloadParam = fake.only().params.find((p) => typeof p === 'string' && p.startsWith('{'))
    const payload = JSON.parse(String(payloadParam))
    // A later, higher observed ceiling must not silently rewrite a percentage already shown.
    expect(payload).toEqual({ hrMaxUsed: 189, hrMaxSource: 'observed' })
  })
})

describe('applyRunCorrections — R-8', () => {
  it('sets corrected_at and never touches reviewed_at', async () => {
    fake.enqueue([['r1']])
    await q.applyRunCorrections('u1', 'r1', { distanceM: 10670 })
    const { sql } = fake.only()
    expect(sql).toContain('"corrected_at"')
    // reviewed_at answers "has a human ever confirmed this run" and is written exactly once.
    expect(sql).not.toContain('"reviewed_at" =')
    expect(sql).toContain('"user_id" = $')
  })

  it('replaces splits wholesale when supplied, in the same batch as the update', async () => {
    fake.enqueue([['r1']], [], [])
    await q.applyRunCorrections('u1', 'r1', {}, [
      { km: 1, timeSec: 400, paceSec: 400, hr: null, cadence: null, partial: false },
    ])
    expect(fake.batches).toEqual([3])
    expect(fake.sqlAt(0)).toMatch(/^update "runs"/)
    expect(fake.sqlAt(1)).toMatch(/^delete from "run_splits"/)
    expect(fake.sqlAt(2)).toMatch(/^insert into "run_splits"/)
  })

  it('an empty replacement array DELETES the splits, while undefined leaves them alone', async () => {
    fake.enqueue([['r1']], [])
    await q.applyRunCorrections('u1', 'r1', {}, [])
    expect(fake.queries.map((x) => x.sql.split(' ').slice(0, 2).join(' '))).toEqual([
      'update "runs"',
      'delete from',
    ])

    fake.reset()
    fake.enqueue([['r1']])
    await q.applyRunCorrections('u1', 'r1', {})
    expect(fake.queries).toHaveLength(1)
  })

  it('throws NotFoundError when the run is not the caller’s, rolling back the child writes', async () => {
    fake.enqueue([], [], [])
    await expect(
      q.applyRunCorrections('u2', 'r1', {}, [
        { km: 1, timeSec: 1, paceSec: 1, hr: null, cadence: null, partial: false },
      ]),
    ).rejects.toBeInstanceOf(q.NotFoundError)
    // All three statements were in ONE batch, so the DELETE could not have committed alone.
    expect(fake.batches).toEqual([3])
  })

  it('maps a dedupe collision from an edited date to DuplicateRunError', async () => {
    const { db } = await import('@/lib/db/index')
    vi.spyOn(db, 'batch').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    fake.enqueue([['r_other']])
    const error = await q
      .applyRunCorrections('u1', 'r1', { occurredOn: '2026-08-19', startedAt: '05:12:00' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(q.DuplicateRunError)
    expect((error as InstanceType<Queries['DuplicateRunError']>).existingRunId).toBe('r_other')
  })
})

describe('deleteRun', () => {
  it('is scoped and throws NotFoundError when nothing was deleted', async () => {
    fake.enqueue([])
    await expect(q.deleteRun('u2', 'r1')).rejects.toBeInstanceOf(q.NotFoundError)
    expect(fake.only().sql).toContain('"user_id" = $')
  })

  it('relies on the FK cascades rather than deleting children by hand', async () => {
    fake.enqueue([['r1']])
    await q.deleteRun('u1', 'r1')
    expect(fake.queries).toHaveLength(1)
  })
})

describe('listRuns paging', () => {
  it('pages by occurred_on, newest first, with a default limit', async () => {
    fake.enqueue([])
    await q.listRuns('u1')
    const { sql, params } = fake.only()
    expect(sql).toContain('order by "runs"."occurred_on" desc, "runs"."started_at" desc')
    expect(params).toContain(50)
  })

  it('accepts a cursor and a limit', async () => {
    fake.enqueue([])
    await q.listRuns('u1', { limit: 10, beforeOccurredOn: '2026-08-01' })
    const { sql, params } = fake.only()
    expect(sql).toContain('"occurred_on" < $')
    expect(params).toContain('2026-08-01')
    expect(params).toContain(10)
  })
})
