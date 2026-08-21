import { describe, expect, it } from 'vitest'

import { isRecordKey, RECORD_CATALOG, RECORD_KEYS, recordDefinition } from '@/lib/records/catalog'
import { toRecordCandidate } from '@/lib/records/compute'
import { runA, runB, runC } from './fixtures/recordCandidates'

/**
 * The catalog is roadmap §4.5 encoded as data, so these tests read the roadmap's table back out of
 * the code: ten keys, each with a unit, a direction, and a qualifier that excludes something.
 */

const A = toRecordCandidate(runA)
const B = toRecordCandidate(runB)
const C = toRecordCandidate(runC)

describe('the catalog is the §4.5 table', () => {
  it('has exactly the ten keys, in roadmap order', () => {
    expect(RECORD_KEYS).toEqual([
      'longest_distance',
      'longest_duration',
      'fastest_pace_5k',
      'fastest_pace_10k',
      'fastest_km_split',
      'most_kcal',
      'most_elevation',
      'highest_cadence',
      'highest_max_hr',
      'best_paced_run',
    ])
  })

  it('names each key’s unit and direction', () => {
    const spec = Object.fromEntries(RECORD_CATALOG.map((d) => [d.key, `${d.unit}/${d.direction}`]))
    expect(spec).toEqual({
      longest_distance: 'm/max',
      longest_duration: 's/max',
      fastest_pace_5k: 's_per_km/min',
      fastest_pace_10k: 's_per_km/min',
      fastest_km_split: 's_per_km/min',
      most_kcal: 'kcal/max',
      most_elevation: 'm/max',
      highest_cadence: 'spm/max',
      highest_max_hr: 'bpm/max',
      best_paced_run: 'bp/min',
    })
  })

  it('stores best_paced_run in basis points so every value is an integer (D5)', () => {
    // |12.3466%| * 100 = 1234.66 -> 1235 bp. A float in `records.value int NOT NULL` would either
    // truncate silently or fail the insert; basis points make the column honest.
    expect(A.decouplingBp).toBe(1235)
    expect(Number.isInteger(A.decouplingBp)).toBe(true)
    expect(recordDefinition('best_paced_run')!.unit).toBe('bp')
  })

  it('narrows a key read back out of the database', () => {
    expect(isRecordKey('longest_distance')).toBe(true)
    expect(isRecordKey('fastest_marathon')).toBe(false)
    expect(isRecordKey(null)).toBe(false)
  })
})

describe('candidates derive their two computed fields from session metrics, not a second formula', () => {
  it('run A — the canonical run', () => {
    expect(A.fastestFullKmPaceSec).toBe(396)
    expect(A.decouplingBp).toBe(1235)
    expect(A.avgPaceSec).toBe(442) // runs.avg_pace_sec, read not re-derived
  })

  it('run B — six identical kilometres decouple by exactly nothing', () => {
    // Same mean pace and same mean HR in both halves, so speed-per-heartbeat is literally
    // unchanged. This is the reference point the whole `best_paced_run` key is measured against.
    expect(B.fastestFullKmPaceSec).toBe(300)
    expect(B.decouplingBp).toBe(0)
  })

  it('run C — two kilometres, still well-formed', () => {
    expect(C.fastestFullKmPaceSec).toBe(280)
    expect(C.decouplingBp).toBe(0)
  })
})

describe('qualifiers exclude, one key at a time', () => {
  const qualifies = (key: Parameters<typeof recordDefinition>[0], c: typeof A) =>
    recordDefinition(key)!.qualifies(c)

  it('run C (2 km) fails exactly the four distance-gated keys', () => {
    expect(qualifies('fastest_pace_5k', C)).toBe(false)
    expect(qualifies('fastest_pace_10k', C)).toBe(false)
    expect(qualifies('highest_cadence', C)).toBe(false)
    expect(qualifies('best_paced_run', C)).toBe(false)
  })

  it('run C still competes for the six keys that have no distance floor', () => {
    for (const key of [
      'longest_distance',
      'longest_duration',
      'fastest_km_split',
      'most_kcal',
      'most_elevation',
      'highest_max_hr',
    ] as const) {
      expect(qualifies(key, C)).toBe(true)
    }
  })

  it('run B (6 km) clears the 5 km floor but not the 10 km one', () => {
    expect(qualifies('fastest_pace_5k', B)).toBe(true)
    expect(qualifies('fastest_pace_10k', B)).toBe(false)
    expect(qualifies('highest_cadence', B)).toBe(true)
  })

  it('the floors are inclusive — exactly 5000 m and exactly 10000 m qualify', () => {
    expect(qualifies('fastest_pace_5k', { ...C, distanceM: 5000 })).toBe(true)
    expect(qualifies('fastest_pace_5k', { ...C, distanceM: 4999 })).toBe(false)
    expect(qualifies('fastest_pace_10k', { ...C, distanceM: 10000 })).toBe(true)
    expect(qualifies('fastest_pace_10k', { ...C, distanceM: 9999 })).toBe(false)
  })

  it('a missing input disqualifies its own key and no other', () => {
    const noKcal = { ...A, activeKcal: null }
    expect(qualifies('most_kcal', noKcal)).toBe(false)
    expect(qualifies('longest_distance', noKcal)).toBe(true)

    const noCadence = { ...A, avgCadence: null }
    expect(qualifies('highest_cadence', noCadence)).toBe(false)
    expect(qualifies('most_elevation', noCadence)).toBe(true)

    const noSplits = { ...A, fastestFullKmPaceSec: null }
    expect(qualifies('fastest_km_split', noSplits)).toBe(false)
    expect(qualifies('fastest_pace_5k', noSplits)).toBe(true)
  })
})
