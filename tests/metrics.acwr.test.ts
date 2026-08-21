import { describe, expect, it } from 'vitest'

import { computeAcwr, isAcwrOutOfRange, type DailyLoadPoint } from '@/lib/metrics/acwr'
import { addDays } from '@/lib/date/ranges'

const AS_OF = '2026-08-23'

/** `n` days before `asOf`, so every case reads as an offset rather than a calendar puzzle. */
const dayBefore = (n: number) => addDays(AS_OF, -n)

/** One run per day for `days` days ending on `asOf`, each covering `perDayM`. */
function steady(days: number, perDayM: number): DailyLoadPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    occurredOn: dayBefore(i),
    distanceM: perDayM,
  }))
}

describe('the steady-state proof — why the naive formula is unusable', () => {
  it('four weeks of identical volume give a ratio of 1.0, not 0.25', () => {
    // THE test with teeth. `Σ7 / Σ28` is identically 0.25 at ANY constant volume — tapering,
    // steady, or doubling — so a 0.8–1.3 band written against it could never fire high. Gabbett's
    // coupled form expresses both sides as weekly-equivalent load, and reads 1.0 when nothing is
    // changing, which is what makes the published band mean anything.
    const a = computeAcwr(steady(28, 5000), AS_OF, dayBefore(200))
    expect(a.ratio).toBeCloseTo(1.0, 10)
    expect(a.ratio).not.toBeCloseTo(0.25, 2)
    expect(isAcwrOutOfRange(a)).toBe(false)
  })

  it('holds at 1.0 whatever the constant volume is', () => {
    for (const perDay of [1000, 5000, 20000]) {
      expect(computeAcwr(steady(28, perDay), AS_OF, dayBefore(200)).ratio).toBeCloseTo(1.0, 10)
    }
  })
})

/**
 * The §6.5 worked pair. Acute week = the §5.5 synthetic week's 23.67 km; the three weeks before
 * it are 20 km each, giving a chronic weekly average of (20+20+20+23.67)/4 = 20.9175 km.
 */
function history(acuteKm: number): DailyLoadPoint[] {
  return [
    { occurredOn: dayBefore(3), distanceM: acuteKm * 1000 }, // inside the 7-day window
    { occurredOn: dayBefore(10), distanceM: 20000 },
    { occurredOn: dayBefore(17), distanceM: 20000 },
    { occurredOn: dayBefore(24), distanceM: 20000 },
  ]
}

describe('computeAcwr — the worked cases (§6.5)', () => {
  it('in range: 23.67 km on a 20.92 km base is 1.13, and does not fire', () => {
    const a = computeAcwr(history(23.67), AS_OF, dayBefore(120))
    expect(a.acuteKm).toBeCloseTo(23.67, 6)
    expect(a.chronicWeeklyAvgKm).toBeCloseTo(20.9175, 6)
    expect(a.ratio).toBeCloseTo(1.13, 2)
    expect(isAcwrOutOfRange(a)).toBe(false)
  })

  /**
   * The plan's §6.5 quotes 1.91 here, holding the chronic baseline at 20.9175 while the acute week
   * spikes to 40 km. That is arithmetically impossible under the COUPLED definition the same
   * section defines: the 28-day window contains the acute week, so raising this week to 40 km
   * necessarily raises the chronic average to (20+20+20+40)/4 = 25.0 and the ratio to 1.6.
   *
   * 1.6 is the correct number for a coupled ACWR, and the conclusion the case exists to prove is
   * unchanged — a near-doubling lands well above 1.3 and fires. (An UNcoupled ACWR, which excludes
   * the acute week from the chronic side, would give 40/20 = 2.0, not 1.91 either.)
   */
  it('out of range: 40 km against the same three 20 km weeks is 1.6, and fires', () => {
    const a = computeAcwr(history(40), AS_OF, dayBefore(120))
    expect(a.chronicWeeklyAvgKm).toBeCloseTo(25.0, 6) // (20+20+20+40)/4
    expect(a.ratio).toBeCloseTo(1.6, 2)
    expect(isAcwrOutOfRange(a)).toBe(true)
  })

  it('fires on the low side too — a sudden stop is also a change in load', () => {
    const a = computeAcwr(
      [
        { occurredOn: dayBefore(10), distanceM: 30000 },
        { occurredOn: dayBefore(17), distanceM: 30000 },
        { occurredOn: dayBefore(24), distanceM: 30000 },
      ],
      AS_OF,
      dayBefore(120),
    )
    expect(a.acuteKm).toBe(0)
    expect(a.ratio).toBe(0)
    expect(isAcwrOutOfRange(a)).toBe(true)
  })

  it('the band boundaries are inclusive — 0.8 and 1.3 are inside the sweet spot', () => {
    const at = (ratio: number) => ({
      asOf: AS_OF,
      acuteKm: ratio * 10,
      chronicWeeklyAvgKm: 10,
      ratio,
      insufficientHistory: false,
    })
    expect(isAcwrOutOfRange(at(0.8))).toBe(false)
    expect(isAcwrOutOfRange(at(1.3))).toBe(false)
    expect(isAcwrOutOfRange(at(0.79))).toBe(true)
    expect(isAcwrOutOfRange(at(1.31))).toBe(true)
  })
})

describe('the insufficient-history guard', () => {
  it('a runner ten days in gets null, not a spurious 3.2', () => {
    // The 28-day denominator has eighteen days of nothing in it. An extreme ratio there is an
    // artefact of an empty window, not a training-load red flag, and saying so is the honest
    // output — the same degradation discipline as resolveHrMax returning null.
    const a = computeAcwr(steady(10, 6000), AS_OF, dayBefore(10))
    expect(a.insufficientHistory).toBe(true)
    expect(a.ratio).toBeNull()
    expect(isAcwrOutOfRange(a)).toBe(false)
    // The raw sides are still reported, so the UI can show "not enough history yet" with context.
    expect(a.acuteKm).toBeCloseTo(42, 6)
  })

  it('clears at exactly 28 days of history', () => {
    expect(computeAcwr(steady(28, 5000), AS_OF, dayBefore(27)).insufficientHistory).toBe(true)
    expect(computeAcwr(steady(28, 5000), AS_OF, dayBefore(28)).insufficientHistory).toBe(false)
  })

  it('a user with no runs at all is insufficient rather than a divide-by-zero', () => {
    const a = computeAcwr([], AS_OF, null)
    expect(a.insufficientHistory).toBe(true)
    expect(a.ratio).toBeNull()
    expect(a.chronicWeeklyAvgKm).toBe(0)
  })

  it('a long-established runner who stopped entirely gets null, not Infinity', () => {
    const a = computeAcwr([], AS_OF, dayBefore(400))
    expect(a.insufficientHistory).toBe(false)
    expect(a.ratio).toBeNull() // chronic side is 0
    expect(isAcwrOutOfRange(a)).toBe(false)
  })
})

describe('window boundaries are inclusive of both ends', () => {
  const one = (offset: number): DailyLoadPoint[] => [
    { occurredOn: dayBefore(offset), distanceM: 10000 },
  ]

  it('day 0 and day −6 are inside the acute window; day −7 is not', () => {
    expect(computeAcwr(one(0), AS_OF, dayBefore(60)).acuteKm).toBe(10)
    expect(computeAcwr(one(6), AS_OF, dayBefore(60)).acuteKm).toBe(10)
    expect(computeAcwr(one(7), AS_OF, dayBefore(60)).acuteKm).toBe(0)
  })

  it('day −27 is inside the chronic window; day −28 is not', () => {
    expect(computeAcwr(one(27), AS_OF, dayBefore(60)).chronicWeeklyAvgKm).toBeCloseTo(2.5, 6)
    expect(computeAcwr(one(28), AS_OF, dayBefore(60)).chronicWeeklyAvgKm).toBe(0)
  })

  it('ignores runs after asOf — a windowed slice is safe to over-supply', () => {
    const future: DailyLoadPoint[] = [{ occurredOn: addDays(AS_OF, 1), distanceM: 50000 }]
    expect(computeAcwr([...future, ...one(1)], AS_OF, dayBefore(60)).acuteKm).toBe(10)
  })

  it('echoes asOf back, so a cached value cannot be misread as today', () => {
    expect(computeAcwr([], AS_OF, null).asOf).toBe(AS_OF)
  })
})
