import { describe, expect, it } from 'vitest'

import { recomputeRecords, type RecordsGateway } from '@/lib/records/recompute'
import type { RecordKey, RecordRunRow, StoredRecord } from '@/lib/records/types'
import { runA, runB, runC } from './fixtures/recordCandidates'

/**
 * `recomputeRecords` against a hand-written fake gateway — **no database in this suite**, which is
 * the whole reason the gateway is an injected seam rather than a direct `db` import.
 */
interface FakeGateway extends RecordsGateway {
  stored: Map<RecordKey, StoredRecord>
  replaceCalls: StoredRecord[][]
}

function fakeGateway(runs: RecordRunRow[], stored: StoredRecord[] = []): FakeGateway {
  const gateway: FakeGateway = {
    stored: new Map(stored.map((r) => [r.key, r])),
    replaceCalls: [],
    async fetchReviewedRuns() {
      return runs
    },
    async readCurrent() {
      return new Map(gateway.stored)
    },
    async replace(_userId, rows) {
      gateway.replaceCalls.push([...rows])
      gateway.stored = new Map(rows.map((r) => [r.key, r]))
    },
  }
  return gateway
}

const held = (key: RecordKey, over: Partial<StoredRecord> = {}): StoredRecord => ({
  key,
  runId: runA.runId,
  value: 1,
  achievedOn: '2026-08-20',
  previousValue: null,
  ...over,
})

describe('first-ever computation', () => {
  it('writes the whole set with no previous values', async () => {
    const gateway = fakeGateway([runA, runB, runC])
    const result = await recomputeRecords('u1', gateway)

    expect(result.rows).toHaveLength(11)
    expect(result.changed).toHaveLength(11)
    expect(result.removed).toEqual([])
    expect(result.rows.every((r) => r.previousValue === null)).toBe(true)
    expect(gateway.replaceCalls).toHaveLength(1)
  })

  it('a user with no reviewed runs writes nothing at all', async () => {
    const gateway = fakeGateway([])
    const result = await recomputeRecords('u1', gateway)
    expect(result.rows).toEqual([])
    expect(result.changed).toEqual([])
    expect(gateway.replaceCalls).toHaveLength(0)
  })
})

describe('the reviewed-data invariant (D16 / R-13)', () => {
  it('only ever sees what fetchReviewedRuns returns', async () => {
    // An unreviewed run is not filtered here — it never reaches this function. A record set by an
    // unconfirmed extraction is a record set by a number nobody vouched for, and the gateway's
    // query is where that is enforced (tests/db.queries.reviewedOnly.test.ts asserts the SQL).
    const gateway = fakeGateway([runB])
    const result = await recomputeRecords('u1', gateway)
    expect(result.rows.every((r) => r.runId === runB.runId)).toBe(true)
    expect(result.rows.map((r) => r.key)).not.toContain('fastest_pace_10k')
  })
})

describe('a record changing hands', () => {
  it('carries the beaten value into previousValue', async () => {
    const gateway = fakeGateway(
      [runA, runB],
      [held('longest_distance', { runId: runB.runId, value: 6000, achievedOn: '2026-07-11' })],
    )
    const result = await recomputeRecords('u1', gateway)

    const longest = result.rows.find((r) => r.key === 'longest_distance')!
    expect(longest).toMatchObject({ runId: runA.runId, value: 10670, previousValue: 6000 })
    expect(result.changed.map((r) => r.key)).toContain('longest_distance')
  })

  it('leaves an untouched key’s previousValue alone', async () => {
    // The interesting half of a record row is "what it beat". Overwriting it with the current
    // value every time some OTHER key moves would erase that history for no reason.
    const gateway = fakeGateway(
      [runA, runB],
      [
        held('longest_distance', { runId: runA.runId, value: 10670, previousValue: 9000 }),
        held('highest_max_hr', { runId: runB.runId, value: 170, previousValue: 160 }),
      ],
    )
    const result = await recomputeRecords('u1', gateway)

    expect(result.rows.find((r) => r.key === 'longest_distance')!.previousValue).toBe(9000)
    expect(result.changed.map((r) => r.key)).not.toContain('longest_distance')
    // highest_max_hr DID move (B's 170 -> A's 189), so it takes 170 as its new previous.
    expect(result.rows.find((r) => r.key === 'highest_max_hr')).toMatchObject({
      runId: runA.runId,
      value: 189,
      previousValue: 170,
    })
  })
})

describe('a correction that disqualifies the sole holder (R-10’s reason for existing)', () => {
  it('removes the key rather than leaving a stale row', async () => {
    // A only just clears the 10 km floor. Corrected to 9.9 km, nothing qualifies for
    // fastest_pace_10k any more — and an upsert-based implementation would have no way to say so.
    const shortened: RecordRunRow = { ...runA, distanceM: 9900 }
    const gateway = fakeGateway(
      [shortened, runB],
      [held('fastest_pace_10k', { runId: runA.runId, value: 442 })],
    )
    const result = await recomputeRecords('u1', gateway)

    expect(result.removed).toEqual(['fastest_pace_10k'])
    expect(result.rows.map((r) => r.key)).not.toContain('fastest_pace_10k')
    // The write is a full replace, so the removed key is gone from what lands in the table.
    expect(gateway.replaceCalls).toHaveLength(1)
    expect(gateway.replaceCalls[0]!.map((r) => r.key)).not.toContain('fastest_pace_10k')
  })

  it('a deleted run hands its records to the next best holder', async () => {
    const gateway = fakeGateway(
      [runB, runC], // A has been deleted
      [held('longest_distance', { runId: runA.runId, value: 10670, previousValue: 6000 })],
    )
    const result = await recomputeRecords('u1', gateway)

    expect(result.rows.find((r) => r.key === 'longest_distance')).toMatchObject({
      runId: runB.runId,
      value: 6000,
      previousValue: 10670,
    })
  })
})

describe('idempotence', () => {
  it('a second pass over unchanged data writes nothing', async () => {
    // `records.updated_at` then means "when this record last moved", not "when anything was last
    // saved" — which is what a UI showing it would assume.
    const gateway = fakeGateway([runA, runB, runC])
    await recomputeRecords('u1', gateway)
    const second = await recomputeRecords('u1', gateway)

    expect(gateway.replaceCalls).toHaveLength(1)
    expect(second.changed).toEqual([])
    expect(second.removed).toEqual([])
    expect(second.rows).toHaveLength(11)
  })

  it('returns the same set whatever order the runs arrive in', async () => {
    const forward = await recomputeRecords('u1', fakeGateway([runA, runB, runC]))
    const reverse = await recomputeRecords('u1', fakeGateway([runC, runB, runA]))
    expect(JSON.stringify(forward.rows)).toBe(JSON.stringify(reverse.rows))
  })
})

describe('the F09 handoff', () => {
  it('reports exactly which keys moved, so badges need not re-query', async () => {
    const gateway = fakeGateway([runB])
    await recomputeRecords('u1', gateway)

    // Run A lands: it takes five magnitude keys off B and adds fastest_pace_10k, which had no
    // holder at all. `long_way_home` and `new_ceiling` read this array, not the records table.
    const withA = fakeGateway([runA, runB], [...gateway.stored.values()])
    const result = await recomputeRecords('u1', withA)

    expect([...result.changed.map((r) => r.key)].sort()).toEqual([
      'fastest_pace_10k',
      'highest_max_hr',
      'longest_distance',
      'longest_duration',
      'most_elevation',
      'most_kcal',
    ])
    expect(result.removed).toEqual([])
  })
})
