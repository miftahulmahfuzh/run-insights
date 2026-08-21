import { describe, expect, it } from 'vitest'

import { canonicalSession } from './fixtures/canonicalRun'
import { aggregateZones, toZoneShares, zoneOfHr, zoneTotalSec } from '@/lib/charts'

/**
 * §11: the fixture's zone rows must produce the design brief's worked example — Z1 2%, Z2 1%,
 * Z3 7%, Z4 47%, Z5 43% — and those five must sum to exactly 100.
 */
describe('toZoneShares — the canonical fixture, and the design brief’s own numbers', () => {
  const shares = toZoneShares(canonicalSession.zones)

  it('matches the brief’s worked example exactly', () => {
    expect(shares.map((s) => s.pct)).toEqual([2, 1, 7, 47, 43])
  })

  it('sums to exactly 100 — largest-remainder, not per-row rounding', () => {
    expect(shares.reduce((sum, s) => sum + s.pct, 0)).toBe(100)
  })

  it('divides by the zone rows’ own total, not by runs.duration_sec', () => {
    // 4595 s of zone time against a 4716 s run: the watch's own tables disagree by 121 s. A bar
    // that does not fill because its denominator disagrees with its parts is the worse bug.
    expect(zoneTotalSec(canonicalSession.zones)).toBe(4595)
    expect(zoneTotalSec(canonicalSession.zones)).not.toBe(canonicalSession.durationSec)
  })

  it('carries each zone’s printed bounds through, open-ended at both ends', () => {
    expect(shares[0]).toMatchObject({ zone: 1, minBpm: null, maxBpm: 140 })
    expect(shares[4]).toMatchObject({ zone: 5, minBpm: 175, maxBpm: null })
  })

  it('returns nothing at all for a run with no zone rows — never five zeros', () => {
    expect(toZoneShares([])).toEqual([])
  })
})

describe('zoneOfHr — R-30’s dominant-zone colour, from the run’s own bounds', () => {
  const zones = canonicalSession.zones

  it('reads km 1’s 154 bpm as zone 3, not zone 4 — R-26’s correction, one layer up', () => {
    expect(zoneOfHr(154, zones)).toBe(3)
  })

  it('treats zone 1 as floorless and zone 5 as ceilingless', () => {
    expect(zoneOfHr(88, zones)).toBe(1)
    expect(zoneOfHr(205, zones)).toBe(5)
  })

  it('is null when there is no heart rate to place', () => {
    expect(zoneOfHr(null, zones)).toBeNull()
    expect(zoneOfHr(150, [])).toBeNull()
  })
})

describe('aggregateZones — the month bar is the same component, fed summed seconds', () => {
  it('sums matching zones across runs and keeps them in order', () => {
    const run = {
      runId: 'a',
      occurredOn: '2026-08-20',
      distanceM: 10670,
      durationSec: 4716,
      avgPaceSec: 442,
      zones: canonicalSession.zones,
    }
    const summed = aggregateZones([run, { ...run, runId: 'b' }])
    expect(summed.map((z) => z.durationSec)).toEqual([208, 50, 606, 4330, 3996])
    expect(toZoneShares(summed).reduce((s, z) => s + z.pct, 0)).toBe(100)
  })
})
