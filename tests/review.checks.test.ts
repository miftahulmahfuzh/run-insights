import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import {
  checkIdForFieldPath,
  distancePaceVsDuration,
  flaggedPaths,
  isFlagged,
  partialConsistency,
  runAllChecks,
  splitsSumVsDuration,
  zonesSumVsDuration,
  type CheckableDraft,
} from '@/lib/review/checks'
import type { DraftSplit, DraftZone } from '@/lib/review/draft'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **F05's equivalent of `research/score.mjs`.**
 *
 *  Every case below runs against `research/schema.mjs`'s `TRUTH` — the 108-field, hand-transcribed
 *  ground truth for the canonical run — and then against a copy corrupted the way the extractor
 *  has actually been observed to fail. That pairing is the point: a tolerance that passes the
 *  golden fixture but cannot catch the one error the model really made is a check that exists on
 *  paper.
 *
 *  The two directions are equally load-bearing:
 *
 *    - **All four must PASS on TRUTH.** The fixture is a correct transcription, so a banner on it
 *      is a false positive — and false positives on a clean run are what teach a reviewer to
 *      dismiss the banner, which costs more than the checks buy.
 *    - **Each must FIRE on its own corruption, and no other check may fire with it.** A check that
 *      trips on someone else's error points the reviewer at the wrong block.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const SPLITS = TRUTH.splits as DraftSplit[]
const ZONES = TRUTH.hrZones as DraftZone[]

function draft(overrides: Partial<CheckableDraft> = {}): CheckableDraft {
  return {
    durationSec: TRUTH.durationSec,
    distanceKm: TRUTH.distanceKm,
    avgPaceSecPerKm: TRUTH.avgPaceSecPerKm,
    splits: SPLITS,
    hrZones: ZONES,
    ...overrides,
  }
}

describe('the golden fixture passes its own review', () => {
  it('fires nothing at all on TRUTH', () => {
    const results = runAllChecks(draft())
    expect(results.filter((r) => !r.ok)).toEqual([])
  })

  it('is therefore a one-tap confirm — zero flagged paths', () => {
    expect(flaggedPaths(runAllChecks(draft())).size).toBe(0)
  })
})

describe('splitsSumVsDuration (CHK-1)', () => {
  it('passes on the fixture: 4710 vs 4716, 6s of Apple rounding', () => {
    const sum = SPLITS.reduce((t, s) => t + s.timeSec, 0)
    expect(sum).toBe(4710)
    expect(splitsSumVsDuration(SPLITS, TRUTH.durationSec).ok).toBe(true)
  })

  it('fires on the §1.3-observed miss: split 1 read as 436s where the screen says 6\'36" (396s)', () => {
    // The real failure, not a synthetic one. The parallel-call variant scored 102/108 and this
    // was its worst miss — 101 other fields correct, including the other ten splits.
    const corrupted = SPLITS.map((s, i) => (i === 0 ? { ...s, timeSec: 436 } : s))
    const result = splitsSumVsDuration(corrupted, TRUTH.durationSec)
    expect(result.ok).toBe(false)
    // |4750 - 4716| = 34s, against a tolerance of max(10, 23.58).
    expect(result.message).toContain('34s off')
    expect(result.fieldPaths).toEqual(['splits'])
  })

  it('never names a row — it cannot know which one', () => {
    const corrupted = SPLITS.map((s, i) => (i === 0 ? { ...s, timeSec: 436 } : s))
    const result = splitsSumVsDuration(corrupted, TRUTH.durationSec)
    expect(result.fieldPaths.some((p) => /^splits\.\d/.test(p))).toBe(false)
    expect(result.message).toContain('one of the 11 splits')
  })

  it('is silent with no duration to compare against (the manual-entry draft)', () => {
    expect(splitsSumVsDuration(SPLITS, null).ok).toBe(true)
    expect(splitsSumVsDuration([], TRUTH.durationSec).ok).toBe(true)
  })

  it('and only CHK-1 fires on that corruption', () => {
    const corrupted = SPLITS.map((s, i) => (i === 0 ? { ...s, timeSec: 436 } : s))
    const failing = runAllChecks(draft({ splits: corrupted })).filter((r) => !r.ok)
    expect(failing.map((f) => f.id)).toEqual(['splits_sum_vs_duration'])
  })
})

describe('zonesSumVsDuration (CHK-2)', () => {
  it('passes on the fixture: 4595 vs 4716, 121s of legitimate unclassified time', () => {
    const sum = ZONES.reduce((t, z) => t + z.durationSec, 0)
    expect(sum).toBe(4595)
    // 121 <= max(90, 4716 * 0.035) = 165.06. The looser tolerance is why this is not a false
    // positive on a correct transcription.
    expect(zonesSumVsDuration(ZONES, TRUTH.durationSec).ok).toBe(true)
  })

  it('fires on a dropped digit in zone 4: 2165 -> 2065', () => {
    const corrupted = ZONES.map((z) => (z.zone === 4 ? { ...z, durationSec: 2065 } : z))
    const result = zonesSumVsDuration(corrupted, TRUTH.durationSec)
    expect(result.ok).toBe(false)
    expect(result.fieldPaths).toEqual(['hrZones'])
  })

  it('and only CHK-2 fires on that corruption', () => {
    const corrupted = ZONES.map((z) => (z.zone === 4 ? { ...z, durationSec: 2065 } : z))
    const failing = runAllChecks(draft({ hrZones: corrupted })).filter((r) => !r.ok)
    expect(failing.map((f) => f.id)).toEqual(['zones_sum_vs_duration'])
  })
})

describe('distancePaceVsDuration (CHK-3)', () => {
  it('passes on the fixture: 10.67 x 442 = 4716.14s vs 4716s', () => {
    expect(distancePaceVsDuration(10.67, 442, 4716).ok).toBe(true)
  })

  it('fires on a tens-digit pace misread: 442 -> 402 (7\'22" read as 6\'42")', () => {
    const result = distancePaceVsDuration(10.67, 402, 4716)
    expect(result.ok).toBe(false)
    expect(result.fieldPaths).toEqual(['distanceKm', 'avgPaceSecPerKm', 'durationSec'])
  })

  it('flags all three inputs, because a wrong pace and a wrong distance look identical here', () => {
    const fromDistance = distancePaceVsDuration(16.07, 442, 4716)
    const fromPace = distancePaceVsDuration(10.67, 402, 4716)
    expect(fromDistance.fieldPaths).toEqual(fromPace.fieldPaths)
  })

  it('is silent when any input is missing', () => {
    expect(distancePaceVsDuration(null, 442, 4716).ok).toBe(true)
    expect(distancePaceVsDuration(10.67, null, 4716).ok).toBe(true)
    expect(distancePaceVsDuration(10.67, 442, null).ok).toBe(true)
  })
})

describe('partialConsistency (CHK-4)', () => {
  it('passes on the fixture: km 11 is partial, 288s / 0.67km = 430 against a stated 429', () => {
    expect(partialConsistency(SPLITS, TRUTH.distanceKm).ok).toBe(true)
  })

  it('fires when the partial flag is missing — the D14 case nothing else would surface', () => {
    const corrupted = SPLITS.map((s, i) => (i === SPLITS.length - 1 ? { ...s, partial: false } : s))
    const result = partialConsistency(corrupted, TRUTH.distanceKm)
    expect(result.ok).toBe(false)
    // The ONLY check that names one exact field, because it is the only one that can.
    expect(result.fieldPaths).toEqual(['splits.10.partial'])
  })

  it('fires when a flagged row’s pace disagrees with its own time', () => {
    const corrupted = SPLITS.map((s, i) =>
      i === SPLITS.length - 1 ? { ...s, paceSecPerKm: 480 } : s,
    )
    const result = partialConsistency(corrupted, TRUTH.distanceKm)
    expect(result.ok).toBe(false)
    expect(result.fieldPaths).toEqual(['splits.10.paceSecPerKm', 'splits.10.timeSec'])
  })

  it('fires when a row is flagged partial on a distance with no remainder to spend', () => {
    const wholeRun = SPLITS.slice(0, 10).concat({ ...SPLITS[10]!, km: 11, partial: true })
    const result = partialConsistency(wholeRun, 11)
    expect(result.ok).toBe(false)
    expect(result.fieldPaths).toContain('distanceKm')
  })

  it('is quiet on a whole-kilometre run with no partial row', () => {
    const wholeRun = SPLITS.slice(0, 10)
    expect(partialConsistency(wholeRun, 10).ok).toBe(true)
  })
})

describe('checkIdForFieldPath — the corrections attribution', () => {
  const failing = runAllChecks(
    draft({ splits: SPLITS.map((s, i) => (i === 0 ? { ...s, timeSec: 436 } : s)) }),
  ).filter((c) => !c.ok)

  it('attributes a leaf inside a flagged block to the block-level check', () => {
    // CHK-1 flagged 'splits'; the human fixed 'splits.0.timeSec'. The check DID catch this, even
    // though it could not say which row — which is the distinction §6.2's query exists to count.
    expect(checkIdForFieldPath(failing, 'splits.0.timeSec')).toBe('splits_sum_vs_duration')
  })

  it('returns undefined for a field no check was pointing at — itself the signal', () => {
    expect(checkIdForFieldPath(failing, 'location')).toBeUndefined()
    expect(checkIdForFieldPath(failing, 'activeKcal')).toBeUndefined()
  })

  it('does not confuse a prefix with a sibling', () => {
    expect(checkIdForFieldPath(failing, 'splitsSomethingElse')).toBeUndefined()
  })
})

describe('isFlagged', () => {
  it('expands a block-level flag down to its leaves, and no further', () => {
    const flagged = new Set(['splits'])
    expect(isFlagged(flagged, 'splits')).toBe(true)
    expect(isFlagged(flagged, 'splits.3.hrBpm')).toBe(true)
    expect(isFlagged(flagged, 'hrZones.0.minBpm')).toBe(false)
  })
})
