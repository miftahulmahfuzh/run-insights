import { describe, expect, it } from 'vitest'
import { score } from '../../research/score.mjs'
import { TRUTH } from '../../research/schema.mjs'

/**
 * This is NOT a test of the vision model — no network call happens here, no LLM_API_KEY is
 * read. It is a regression test of the SCORER itself: the 108-field ground truth in
 * schema.mjs, and the score() function research/*.mjs scripts already call against it.
 *
 * Why this matters at F01 time, before F04 exists: `score.mjs` is the instrument F04's own
 * extraction tests will be measured with (D13). If the instrument silently breaks — say, a
 * refactor drops a field from SCALARS, or `eq()`'s float tolerance regresses — every future
 * "108/108" claim becomes meaningless without anyone noticing. This test is the tripwire.
 */
describe('research/score.mjs (D13 — the F04 regression instrument)', () => {
  it('scores the ground truth against itself as a perfect match', () => {
    const result = score(TRUTH)
    expect(result.errs).toEqual([])
    expect(result.pct).toBe('100.0')
    expect(result.pass).toBe(result.total)
  })

  it('counts exactly the 108 fields the ground truth documents', () => {
    // D13/§4.9 quote "108-field hand-transcribed ground truth". If this number moves, the
    // fixture changed and every claim measured against it needs restating.
    expect(score(TRUTH).total).toBe(108)
  })

  it('detects a wrong scalar field', () => {
    const got = { ...TRUTH, distanceKm: 5.0 } // truth is 10.67
    const result = score(got)
    expect(result.pct).not.toBe('100.0')
    expect(result.errs.some((e) => e.startsWith('distanceKm:'))).toBe(true)
  })

  it('detects a truncated splits table', () => {
    const got = { ...TRUTH, splits: TRUTH.splits.slice(0, 5) } // truth has 11 rows
    const result = score(got)
    expect(result.errs.some((e) => e.includes('splits.length'))).toBe(true)
  })

  it('detects a misread value inside one split row (the exact class of error the parallel-call variant made)', () => {
    const got = {
      ...TRUTH,
      splits: TRUTH.splits.map((s, i) => (i === 0 ? { ...s, paceSecPerKm: 436 } : s)),
    }
    const result = score(got)
    expect(result.errs.some((e) => e.includes('splits[0].paceSecPerKm'))).toBe(true)
  })
})
