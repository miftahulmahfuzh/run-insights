import { describe, expect, it } from 'vitest'

import { bucketForDistanceM, computeVolumeDelta, computeWeekMetrics } from '@/lib/metrics/week'
import {
  SYNTHETIC_WEEK_KEY,
  SYNTHETIC_WEEK_PREVIOUS_VOLUME_M,
  syntheticWeek,
} from './fixtures/syntheticWeek'

describe('bucketForDistanceM', () => {
  it('places each boundary on the higher bucket', () => {
    expect(bucketForDistanceM(3499)).toBe('other')
    expect(bucketForDistanceM(3500)).toBe('5k')
    expect(bucketForDistanceM(6999)).toBe('5k')
    expect(bucketForDistanceM(7000)).toBe('10k')
    expect(bucketForDistanceM(14999)).toBe('10k')
    expect(bucketForDistanceM(15000)).toBe('half')
    expect(bucketForDistanceM(29999)).toBe('half')
    expect(bucketForDistanceM(30000)).toBe('full')
  })

  it('groups the canonical 10.67 km run with an 8 km one', () => {
    // Race-EQUIVALENT effort, not race distance. These are the same kind of session to a runner,
    // which is what makes "this week's 10k pace" a meaningful number to average across them.
    expect(bucketForDistanceM(10670)).toBe('10k')
    expect(bucketForDistanceM(8000)).toBe('10k')
  })

  it('sends anything under 3.5 km to "other" rather than calling it a 5k', () => {
    expect(bucketForDistanceM(0)).toBe('other')
    expect(bucketForDistanceM(2000)).toBe('other')
  })
})

describe('computeVolumeDelta', () => {
  it('reports "none" when neither week had a run — not 0%', () => {
    expect(computeVolumeDelta(0, 0)).toEqual({ kind: 'none' })
  })

  it('reports "first" instead of dividing by zero', () => {
    // A percentage against a zero baseline is +∞, which is not something a runner can act on.
    expect(computeVolumeDelta(23670, 0)).toEqual({ kind: 'first', currentM: 23670 })
  })

  it('rounds to 1dp under 10% and to a whole number at or above it', () => {
    expect(computeVolumeDelta(20600, 20000)).toMatchObject({ pct: 3, direction: 'up' })
    expect(computeVolumeDelta(20740, 20000)).toMatchObject({ pct: 3.7, direction: 'up' })
    expect(computeVolumeDelta(23670, 20000)).toMatchObject({ pct: 18, direction: 'up' })
  })

  it('calls a change under half a percent flat', () => {
    expect(computeVolumeDelta(20080, 20000)).toMatchObject({ pct: 0.4, direction: 'flat' })
  })

  it('signs a decrease negative and reaches −100 when volume goes to zero', () => {
    expect(computeVolumeDelta(15000, 20000)).toMatchObject({ pct: -25, direction: 'down' })
    expect(computeVolumeDelta(0, 20000)).toMatchObject({ pct: -100, direction: 'down' })
  })
})

describe('computeWeekMetrics — the synthetic week (§5.5)', () => {
  const w = computeWeekMetrics(SYNTHETIC_WEEK_KEY, syntheticWeek, SYNTHETIC_WEEK_PREVIOUS_VOLUME_M)

  it('volume, run count and longest run', () => {
    expect(w.weekKey).toBe('2026-W34')
    expect(w.volumeM).toBe(23670)
    expect(w.runCount).toBe(3)
    expect(w.longestRunM).toBe(10670)
  })

  it('easy share — 3179 s of 9195 s in zones 1–2, 34.6%', () => {
    expect(w.z1z2SharePct).toBeCloseTo(34.57, 2)
  })

  it('volume delta against a 20 km week — +18%', () => {
    expect(w.volumeDelta).toEqual({
      kind: 'pct',
      pct: 18,
      direction: 'up',
      currentM: 23670,
      previousM: 20000,
    })
  })

  it('jumpWarning fires above a 10% increase', () => {
    expect(w.jumpWarning).toBe(true)
  })

  it('avgPaceByBucket is DISTANCE-weighted, not a mean of averages', () => {
    // 5k bucket: one run, 1800 s over 5 km = 360 s/km.
    expect(w.avgPaceByBucket['5k']).toBe(360)
    // 10k bucket: (4716 + 3040) s over (10670 + 8000) m = 415.4 s/km -> 415 whole seconds.
    // A plain mean of the two runs' own paces would give (442 + 380) / 2 = 411 — the 8 km run
    // pulling a number it did not earn a full share of.
    expect(w.avgPaceByBucket['10k']).toBe(415)
    expect(w.avgPaceByBucket['half']).toBeUndefined()
  })
})

describe('computeWeekMetrics — edges', () => {
  it('an empty week has no longest run and no zone share, rather than zeros', () => {
    const w = computeWeekMetrics('2026-W35', [], 23670)
    expect(w.runCount).toBe(0)
    expect(w.volumeM).toBe(0)
    expect(w.longestRunM).toBeNull()
    expect(w.z1z2SharePct).toBeNull()
    expect(w.avgPaceByBucket).toEqual({})
    expect(w.volumeDelta).toMatchObject({ kind: 'pct', pct: -100, direction: 'down' })
  })

  it('a rest week never raises jumpWarning, however large the drop', () => {
    // Tapering is not a training-load risk. A flag that fires on rest teaches the runner to
    // ignore the flag.
    expect(computeWeekMetrics('2026-W35', [], 23670).jumpWarning).toBe(false)
  })

  it('a 10.0% increase does not fire the warning — the threshold is strict', () => {
    const runs = [{ ...syntheticWeek[0]!, distanceM: 22000 }]
    expect(computeWeekMetrics('2026-W34', runs, 20000).jumpWarning).toBe(false)
    const more = [{ ...syntheticWeek[0]!, distanceM: 22200 }]
    expect(computeWeekMetrics('2026-W34', more, 20000).jumpWarning).toBe(true)
  })

  it('a week whose runs carry no zone data reports null, not 0% easy', () => {
    const runs = syntheticWeek.map((r) => ({ ...r, zones: [] }))
    expect(computeWeekMetrics('2026-W34', runs, 20000).z1z2SharePct).toBeNull()
  })
})
