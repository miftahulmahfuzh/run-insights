import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The database-facing half of F06, against the recording fake driver — real generated SQL, real
 * parameter binding, no network. What this proves is the grouping: three flat result sets go in
 * and correctly-parented runs come out, with each run's splits and zones attached to it and not
 * to its neighbour.
 */

type Gateway = typeof import('@/lib/records/gateway')
type Schema = typeof import('@/lib/db/schema')

let fake: FakeDb
let gateway: Gateway
let schema: Schema

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  schema = await import('@/lib/db/schema')
  gateway = await import('@/lib/records/gateway')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('dbRecordsGateway.fetchReviewedRuns', () => {
  it('attaches each run’s own splits and zones, in one batch of three', async () => {
    const { runs, runSplits, runZones } = schema
    fake.enqueue(
      [
        tableRow(runs, { id: 'r1', occurredOn: '2026-08-20', distanceM: 10670, avgHr: 173 }),
        tableRow(runs, { id: 'r2', occurredOn: '2026-08-22', distanceM: 8000, avgHr: 160 }),
      ],
      [
        tableRow(runSplits, { runId: 'r1', km: 1, paceSec: 396, hr: 154, partial: false }),
        tableRow(runSplits, { runId: 'r1', km: 2, paceSec: 428, hr: 171, partial: false }),
        tableRow(runSplits, { runId: 'r2', km: 1, paceSec: 380, hr: 150, partial: false }),
      ],
      [tableRow(runZones, { runId: 'r2', zone: 3, durationSec: 2800 })],
    )

    const rows = await gateway.dbRecordsGateway.fetchReviewedRuns('u1')

    expect(fake.batches).toEqual([3])
    expect(rows.map((r) => r.runId)).toEqual(['r1', 'r2'])
    expect(rows[0]!.splits.map((s) => s.km)).toEqual([1, 2])
    // r1 has no zone rows at all; it must get an empty array, never r2's.
    expect(rows[0]!.zones).toEqual([])
    expect(rows[1]!.splits.map((s) => s.km)).toEqual([1])
    expect(rows[1]!.zones).toHaveLength(1)
  })

  it('maps the R-9 recovery columns onto the metrics input shape', async () => {
    const { runs } = schema
    fake.enqueue(
      [tableRow(runs, { id: 'r1', endHrBpm: 185, hr1MinPostBpm: 162, avgPaceSec: 442 })],
      [],
      [],
    )

    const rows = await gateway.dbRecordsGateway.fetchReviewedRuns('u1')
    expect(rows[0]!.recovery).toEqual({ endHrBpm: 185, hrAt1MinBpm: 162 })
    expect(rows[0]!.avgPaceSec).toBe(442)
  })
})

describe('dbRecordsGateway.readCurrent', () => {
  it('keys the stored records by catalog key', async () => {
    const { records } = schema
    fake.enqueue([
      tableRow(records, {
        key: 'longest_distance',
        runId: 'r1',
        value: 10670,
        achievedOn: '2026-08-20',
        previousValue: 6000,
      }),
    ])

    const current = await gateway.dbRecordsGateway.readCurrent('u1')
    expect(current.get('longest_distance')).toEqual({
      key: 'longest_distance',
      runId: 'r1',
      value: 10670,
      achievedOn: '2026-08-20',
      previousValue: 6000,
    })
  })

  it('drops a row whose key the catalog no longer defines', async () => {
    // It cannot be recomputed, so keeping it would pin a row nothing can ever update or remove.
    // The wholesale replace then clears it from the table on the next real change.
    const { records } = schema
    fake.enqueue([tableRow(records, { key: 'fastest_marathon', runId: 'r1', value: 1 })])
    expect((await gateway.dbRecordsGateway.readCurrent('u1')).size).toBe(0)
  })
})

describe('dbRecordsGateway.replace', () => {
  it('deletes then inserts in ONE batch (R-10), never a per-key upsert', async () => {
    fake.enqueue([], [])
    await gateway.dbRecordsGateway.replace('u1', [
      {
        key: 'longest_distance',
        runId: 'r1',
        value: 10670,
        achievedOn: '2026-08-20',
        previousValue: null,
      },
    ])

    expect(fake.batches).toEqual([2])
    expect(fake.sqlAt(0)).toContain('delete from "records"')
    expect(fake.sqlAt(1)).toContain('insert into "records"')
    expect(fake.queries.every((x) => x.batched)).toBe(true)
    expect(fake.queries[1]!.params).toContain('longest_distance')
  })

  it('an empty set is a bare delete — the shelf can legitimately become empty', async () => {
    fake.enqueue([])
    await gateway.dbRecordsGateway.replace('u1', [])
    expect(fake.batches).toEqual([1])
    expect(fake.only().sql).toContain('delete from "records"')
  })
})
