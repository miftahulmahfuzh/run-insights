import { describe, expect, it } from 'vitest'

import { roundSharesTo100 } from '@/lib/metrics/round'

/**
 * Ported from `expense-tracking/lib/stats/__tests__/series.test.ts`'s `largestRemainderPct` block
 * — same algorithm, same edge cases, zone seconds instead of category rupiah.
 */
describe('roundSharesTo100', () => {
  it('always sums to exactly 100', () => {
    const sets = [
      [104, 25, 303, 2165, 1998], // the canonical run's five zones
      [1, 1, 1],
      [333, 333, 334],
      [1, 1, 1, 1, 1, 1, 1],
      [999999999, 1],
    ]
    for (const set of sets) {
      expect(roundSharesTo100(set).reduce((a, b) => a + b, 0)).toBe(100)
    }
  })

  it('returns all zeros for a run with no zone time', () => {
    expect(roundSharesTo100([0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0])
    expect(roundSharesTo100([])).toEqual([])
  })

  it('gives a single zone the whole 100', () => {
    expect(roundSharesTo100([4595])).toEqual([100])
  })

  it('breaks a remainder tie on the earlier index, so the output is deterministic', () => {
    expect(roundSharesTo100([1, 1, 1])).toEqual([34, 33, 33])
  })

  it('never awards a percent to a zone with no time in it', () => {
    // Zone 5 is empty. Floors are [33,33,33,0,0] = 99; the one spare point must go to a zone that
    // actually has a remainder, not to the row that reads "you spent 1% at redline" out of nothing.
    const out = roundSharesTo100([100, 100, 100, 0, 0])
    expect(out[3]).toBe(0)
    expect(out[4]).toBe(0)
    expect(out.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('apportions the canonical run so the headline zones survive rounding', () => {
    // Raw: [2.26, 0.54, 6.59, 47.12, 43.48]. Floors sum to 98; the two largest remainders
    // (Z3 .594, Z2 .544) each take a point. Z4/Z5 — the numbers anyone reads — are untouched.
    expect(roundSharesTo100([104, 25, 303, 2165, 1998])).toEqual([2, 1, 7, 47, 43])
  })
})
