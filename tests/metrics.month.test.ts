import { describe, expect, it } from 'vitest'

import { computeMonthMetrics } from '@/lib/metrics/month'
import { syntheticMonth, syntheticPreviousMonth } from './fixtures/syntheticMonth'

describe('computeMonthMetrics — August 2026 against July (§6)', () => {
  const m = computeMonthMetrics('2026-08', syntheticMonth, syntheticPreviousMonth)

  it('volume and run count', () => {
    expect(m.monthKey).toBe('2026-08')
    expect(m.volumeM).toBe(45670) // 5000 + 10670 + 8000 + 22000
    expect(m.runCount).toBe(4)
  })

  it('reuses week.ts’s computeVolumeDelta rather than a second implementation', () => {
    // 45670 vs 18000 = +153.7% -> +154, whole-number rounding at ≥10%. Identical shape and
    // identical rounding rule to a week's delta, because it IS the same function.
    expect(m.volumeDelta).toEqual({
      kind: 'pct',
      pct: 154,
      direction: 'up',
      currentM: 45670,
      previousM: 18000,
    })
  })

  it('trends pace per bucket, distance-weighted on both sides', () => {
    expect(m.paceTrendByBucket['5k']).toEqual({
      thisMonthSecPerKm: 360, // 1800 s / 5 km
      previousMonthSecPerKm: 400, // 2400 s / 6 km
      deltaSecPerKm: -40, // negative = faster
    })
    expect(m.paceTrendByBucket['10k']).toEqual({
      thisMonthSecPerKm: 415, // (4716 + 3040) / 18.67 km
      previousMonthSecPerKm: 450, // 5400 s / 12 km
      deltaSecPerKm: -35,
    })
  })

  it('a bucket with no run last month trends against null, never a fabricated zero', () => {
    expect(m.paceTrendByBucket['half']).toEqual({
      thisMonthSecPerKm: 450, // 9900 s / 22 km
      previousMonthSecPerKm: null,
      deltaSecPerKm: null,
    })
  })

  it('a bucket run only LAST month is not a trend and does not appear', () => {
    const july = computeMonthMetrics('2026-07', syntheticPreviousMonth, syntheticMonth)
    expect(july.paceTrendByBucket['half']).toBeUndefined()
    expect(Object.keys(july.paceTrendByBucket).sort()).toEqual(['10k', '5k'])
  })

  it('aggregates zones across every run in the month, as raw floats', () => {
    // Z1 2104, Z2 7975, Z3 4453, Z4 2565, Z5 1998 — total 19095 s.
    expect(m.zonePct.map((z) => z.zone)).toEqual([1, 2, 3, 4, 5])
    expect(m.zonePct.map((z) => z.durationSec)).toEqual([2104, 7975, 4453, 2565, 1998])
    expect(m.zonePct[1]!.pct).toBeCloseTo(41.76, 2)
    expect(m.zonePct[4]!.pct).toBeCloseTo(10.46, 2)
    expect(m.zonePct.reduce((a, z) => a + z.pct, 0)).toBeCloseTo(100, 6)
  })
})

describe('computeMonthMetrics — edges', () => {
  it('an empty month reports "first" against a month that had runs — inverted, "none" for two empties', () => {
    expect(computeMonthMetrics('2026-09', [], []).volumeDelta).toEqual({ kind: 'none' })
    expect(computeMonthMetrics('2026-09', syntheticMonth, []).volumeDelta).toEqual({
      kind: 'first',
      currentM: 45670,
    })
  })

  it('omits zones entirely when no run carried zone data', () => {
    const noZones = syntheticMonth.map((r) => ({ ...r, zones: [] }))
    expect(computeMonthMetrics('2026-08', noZones, []).zonePct).toEqual([])
  })

  it('omits a zone nobody spent time in rather than emitting a 0% row', () => {
    const easyOnly = [
      {
        runId: 'r1',
        occurredOn: '2026-08-02',
        distanceM: 5000,
        durationSec: 1800,
        zones: [
          { zone: 1 as const, durationSec: 600, minBpm: null, maxBpm: 140 },
          { zone: 2 as const, durationSec: 1200, minBpm: 141, maxBpm: 151 },
        ],
      },
    ]
    const out = computeMonthMetrics('2026-08', easyOnly, [])
    expect(out.zonePct.map((z) => z.zone)).toEqual([1, 2])
    expect(out.zonePct[0]!.pct).toBeCloseTo(33.33, 2)
  })
})
