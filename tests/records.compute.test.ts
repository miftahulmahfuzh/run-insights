import { describe, expect, it } from 'vitest'

import { computeRecords, toRecordCandidate } from '@/lib/records/compute'
import type { RecordKey } from '@/lib/records/types'
import { recordRuns, runA, runB, runC } from './fixtures/recordCandidates'

/** §7.4's worked table, key by key. */
const candidates = recordRuns.map(toRecordCandidate)
const byKey = new Map(computeRecords(candidates).map((r) => [r.key, r]))
const winner = (key: RecordKey) => byKey.get(key)

describe('computeRecords — §7.4’s A / B / C table', () => {
  it('A takes every magnitude key', () => {
    expect(winner('longest_distance')).toMatchObject({ runId: runA.runId, value: 10670 })
    expect(winner('longest_duration')).toMatchObject({ runId: runA.runId, value: 4716 })
    expect(winner('most_kcal')).toMatchObject({ runId: runA.runId, value: 646 })
    expect(winner('most_elevation')).toMatchObject({ runId: runA.runId, value: 15 })
    expect(winner('highest_max_hr')).toMatchObject({ runId: runA.runId, value: 189 })
  })

  it('B takes every quality key', () => {
    expect(winner('fastest_pace_5k')).toMatchObject({ runId: runB.runId, value: 300 })
    expect(winner('highest_cadence')).toMatchObject({ runId: runB.runId, value: 170 })
    // Perfectly even effort: 0 basis points of decoupling wins a MIN key outright.
    expect(winner('best_paced_run')).toMatchObject({ runId: runB.runId, value: 0 })
  })

  it('C’s single 280 s kilometre takes fastest_km_split — no distance floor on that key', () => {
    expect(winner('fastest_km_split')).toMatchObject({ runId: runC.runId, value: 280 })
  })

  it('A wins fastest_pace_10k as the SOLE qualifier, despite being the slowest run', () => {
    // 442 s/km is slower than either other run's pace. It wins because B (6 km) and C (2 km) are
    // not eligible at all — which is exactly what a distance-qualified record means.
    expect(winner('fastest_pace_10k')).toMatchObject({ runId: runA.runId, value: 442 })
  })

  it('records the day the record was set, not the day it was computed', () => {
    expect(winner('longest_distance')!.achievedOn).toBe('2026-08-20')
    expect(winner('fastest_pace_5k')!.achievedOn).toBe('2026-07-11')
  })

  it('B also takes earliest_start — 05:12 against A’s 07:07, and C has no start time at all', () => {
    expect(winner('earliest_start')).toMatchObject({ runId: runB.runId, value: 18_720 })
  })

  it('resolves all eleven keys from these three runs', () => {
    expect([...byKey.keys()]).toHaveLength(11)
  })
})

describe('absence is meaningful', () => {
  it('a key nothing qualifies for is missing, never a synthetic zero row', () => {
    // Only run C: two kilometres, so no 5k, no 10k, no cadence record, no pacing record.
    const out = computeRecords([toRecordCandidate(runC)])
    const keys = out.map((r) => r.key)
    expect(keys).not.toContain('fastest_pace_5k')
    expect(keys).not.toContain('fastest_pace_10k')
    expect(keys).not.toContain('highest_cadence')
    expect(keys).not.toContain('best_paced_run')
    expect(keys).toContain('longest_distance')
    expect(out.every((r) => r.value > 0)).toBe(true)
  })

  it('a run with no start time is excluded from earliest_start and from nothing else', () => {
    const keys = computeRecords([toRecordCandidate(runC)]).map((r) => r.key)
    expect(keys).not.toContain('earliest_start')
    expect(keys).toContain('longest_distance')
  })

  it('a midnight start wins outright, because the day begins at 00:00 and nowhere else', () => {
    // The design call, as a test: `earliest_start` is a plain minimum over seconds past midnight,
    // so a run begun at 00:15 beats one begun at 05:12. F32 §1b — the rejected alternative was a
    // sane-morning window like `early_bird`'s, and changing this test is how that decision is
    // reversed if it is ever reversed.
    const smallHours = { ...toRecordCandidate(runA), runId: 'run_midnight', startedAtSec: 900 }
    const out = computeRecords([toRecordCandidate(runB), smallHours])
    expect(out.find((r) => r.key === 'earliest_start')).toMatchObject({
      runId: 'run_midnight',
      value: 900,
    })
  })

  it('no runs at all produces an empty set', () => {
    expect(computeRecords([])).toEqual([])
  })

  it('a run missing an optional column is excluded from that key alone', () => {
    const stripped = { ...toRecordCandidate(runA), activeKcal: null, elevationM: null }
    const keys = computeRecords([stripped]).map((r) => r.key)
    expect(keys).not.toContain('most_kcal')
    expect(keys).not.toContain('most_elevation')
    expect(keys).toContain('longest_distance')
    expect(keys).toContain('highest_max_hr')
  })
})

describe('ties go to whoever got there first', () => {
  const base = toRecordCandidate(runB)

  it('an equal pace does not take the record — a challenger must beat it strictly', () => {
    const later = { ...base, runId: 'run_later', occurredOn: '2026-08-01' }
    const out = computeRecords([later, base]) // deliberately in "later first" order
    expect(out.find((r) => r.key === 'fastest_pace_5k')).toMatchObject({
      runId: runB.runId,
      achievedOn: '2026-07-11',
    })
  })

  it('the result does not depend on input order', () => {
    const later = { ...base, runId: 'run_later', occurredOn: '2026-08-01' }
    expect(JSON.stringify(computeRecords([base, later]))).toBe(
      JSON.stringify(computeRecords([later, base])),
    )
  })

  it('two runs on the SAME day tie-break on runId, so a recompute is deterministic', () => {
    const twin = { ...base, runId: 'run_aaa' }
    const out = computeRecords([base, twin])
    expect(out.find((r) => r.key === 'fastest_pace_5k')!.runId).toBe('run_aaa')
    expect(computeRecords([twin, base]).find((r) => r.key === 'fastest_pace_5k')!.runId).toBe(
      'run_aaa',
    )
  })

  it('a strictly better value does take the record', () => {
    const faster = { ...base, runId: 'run_faster', occurredOn: '2026-08-01', avgPaceSec: 299 }
    expect(computeRecords([base, faster]).find((r) => r.key === 'fastest_pace_5k')).toMatchObject({
      runId: 'run_faster',
      value: 299,
    })
  })
})

describe('purity', () => {
  it('does not mutate its input', () => {
    const snapshot = JSON.stringify(candidates)
    computeRecords(candidates)
    expect(JSON.stringify(candidates)).toBe(snapshot)
  })
})
