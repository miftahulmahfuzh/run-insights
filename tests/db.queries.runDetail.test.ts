import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * getRunDetail is the only sanctioned way to read a run with its children (plan D4). Its shape —
 * four statements in ONE db.batch — is a contract, not an implementation detail: it is one HTTP
 * round trip and one Postgres snapshot, so a concurrent correction cannot change the splits
 * between reading the run row and reading its splits.
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

describe('getRunDetail', () => {
  it('issues exactly four statements inside exactly one batch — never N+1', async () => {
    const { runs } = await import('@/lib/db/schema')
    fake.enqueue([tableRow(runs, { id: 'r1' })], [], [], [])

    await q.getRunDetail('u1', 'r1')

    expect(fake.batches).toEqual([4])
    expect(fake.queries).toHaveLength(4)
    expect(fake.queries.every((x) => x.batched)).toBe(true)
  })

  it('reads runs, run_splits, run_zones and run_photos in that order', async () => {
    const { runs } = await import('@/lib/db/schema')
    fake.enqueue([tableRow(runs, { id: 'r1' })], [], [], [])

    await q.getRunDetail('u1', 'r1')

    expect(fake.sqlAt(0)).toContain('from "runs"')
    expect(fake.sqlAt(1)).toContain('from "run_splits"')
    expect(fake.sqlAt(2)).toContain('from "run_zones"')
    expect(fake.sqlAt(3)).toContain('from "run_photos"')
  })

  it('orders splits by km, zones by zone, photos by sort_order', async () => {
    const { runs } = await import('@/lib/db/schema')
    fake.enqueue([tableRow(runs, { id: 'r1' })], [], [], [])

    await q.getRunDetail('u1', 'r1')

    expect(fake.sqlAt(1)).toContain('order by "run_splits"."km"')
    expect(fake.sqlAt(2)).toContain('order by "run_zones"."zone"')
    expect(fake.sqlAt(3)).toContain('order by "run_photos"."sort_order"')
  })

  it('is DRAFT-VISIBLE: no reviewed_at filter, because /r/[id] must render whatever exists', async () => {
    const { runs } = await import('@/lib/db/schema')
    fake.enqueue([tableRow(runs, { id: 'r1' })], [], [], [])

    await q.getRunDetail('u1', 'r1')

    // The column appears in the SELECT list of a full-table read; what must be absent is the
    // PREDICATE.
    expect(fake.sqlAt(0)).not.toContain('"reviewed_at" is not null')
  })

  it('returns null (not an empty shell) when the run row is absent', async () => {
    fake.enqueue([], [], [], [])
    await expect(q.getRunDetail('u1', 'gone')).resolves.toBeNull()
  })

  it('assembles the run plus its three child collections', async () => {
    const { runs, runSplits, runZones, runPhotos } = await import('@/lib/db/schema')
    fake.enqueue(
      [tableRow(runs, { id: 'r1', distanceM: 10670, durationSec: 4716 })],
      [
        tableRow(runSplits, { runId: 'r1', km: 1, timeSec: 400, paceSec: 400 }),
        tableRow(runSplits, { runId: 'r1', km: 11, timeSec: 260, paceSec: 388, partial: true }),
      ],
      [tableRow(runZones, { runId: 'r1', zone: 5, durationSec: 1200 })],
      [tableRow(runPhotos, { id: 'p1', runId: 'r1', kind: 'summary' })],
    )

    const detail = await q.getRunDetail('u1', 'r1')

    expect(detail?.id).toBe('r1')
    expect(detail?.distanceM).toBe(10670)
    expect(detail?.splits).toHaveLength(2)
    expect(detail?.splits[1]?.partial).toBe(true)
    expect(detail?.zones).toHaveLength(1)
    expect(detail?.photos).toHaveLength(1)
  })
})
