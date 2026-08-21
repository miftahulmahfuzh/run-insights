import { describe, expect, it } from 'vitest'

import { canonicalSession } from './fixtures/canonicalRun'
import { fastestSlowestFullKm, hrDomain, paceDomain, toPaceHrPoints } from '@/lib/charts'

/**
 * §11's first named assertion: the fixture's eleven splits, mapped for the signature chart, must
 * reproduce `research/schema.mjs`'s `TRUTH.splits[10]` exactly — `partial: true`, `distanceM: 670`,
 * `paceSec: 429`. That row is the whole reason D14 exists.
 */
describe('toPaceHrPoints — the canonical fixture', () => {
  const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)

  it('maps all eleven splits, in order, with nothing invented', () => {
    expect(points).toHaveLength(11)
    expect(points.map((p) => p.km)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('gives km 11 its real distance — 10670 m minus ten full kilometres is 670', () => {
    const partial = points[10]!
    expect(partial.partial).toBe(true)
    expect(partial.distanceM).toBe(670)
    // Apple's own normalised per-km rate, NOT the raw 288 s elapsed. Plotting the rate is honest;
    // plotting the elapsed time is what would make a fade look like a closing sprint.
    expect(partial.paceSec).toBe(429)
    expect(partial.timeSec).toBe(288)
  })

  it('gives every full kilometre exactly 1000 m', () => {
    expect(points.slice(0, 10).every((p) => p.distanceM === 1000)).toBe(true)
  })

  it('splits the remainder across multiple partial rows rather than dumping it on the first', () => {
    // Cannot arise through F04/F05, which is not the same as producing a plausible wrong number.
    const twoPartials = toPaceHrPoints(
      [
        { km: 1, timeSec: 400, paceSec: 400, hr: 150, cadence: 150, partial: false },
        { km: 2, timeSec: 200, paceSec: 400, hr: 150, cadence: 150, partial: true },
        { km: 3, timeSec: 200, paceSec: 400, hr: 150, cadence: 150, partial: true },
      ],
      2000,
    )
    expect(twoPartials.map((p) => p.distanceM)).toEqual([1000, 500, 500])
  })
})

describe('axis domains are anchored to the run, never tuned', () => {
  const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)

  it('pace domain is fastest-first, because the axis is reversed', () => {
    // 396 (km 1) is the fastest full km, 480 (km 10) the slowest; the partial's 429 sits between.
    expect(paceDomain(points)).toEqual([376, 500])
  })

  it('hr domain is a fixed 10 bpm pad around the run’s own min and max', () => {
    expect(hrDomain(points)).toEqual([144, 193])
  })

  it('degrades to null rather than to a default range when there is nothing to scale', () => {
    expect(hrDomain(points.map((p) => ({ ...p, hr: null })))).toBeNull()
    expect(paceDomain([])).toBeNull()
  })
})

describe('fastest and slowest split exclude the partial row', () => {
  it('names km 1, the fixture’s real fastest full kilometre — never km 11', () => {
    const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)
    expect(fastestSlowestFullKm(points)).toEqual({ fastestKm: 1, slowestKm: 10 })
  })

  it('highlights nothing on a run with fewer than two full kilometres', () => {
    const points = toPaceHrPoints(
      [{ km: 1, timeSec: 400, paceSec: 400, hr: null, cadence: null, partial: false }],
      1000,
    )
    expect(fastestSlowestFullKm(points)).toEqual({ fastestKm: null, slowestKm: null })
  })
})
