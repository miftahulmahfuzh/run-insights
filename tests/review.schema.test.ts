import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import { hydrateDraftFromExtraction, type ReviewDraft } from '@/lib/review/draft'
import {
  CommitReviewPayloadSchema,
  fieldErrorsOf,
  ReviewDraftSchema,
  toRunInput,
} from '@/lib/review/schema'
import type { ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * The wall (lib/review/schema.ts) and the unit conversion behind it.
 *
 * Two properties are being defended, and they pull in opposite directions:
 *
 *   - **The golden fixture must pass unmodified.** If the real, correct, hand-verified run cannot
 *     be committed, the schema is wrong, not the run.
 *   - **Nothing that would corrupt a downstream aggregate may pass.** A second partial row, a
 *     duplicate km, three zones out of five — each of these is silently wrong once stored, because
 *     F06 filters and F09's rules would happily consume them.
 */

const NOW = new Date('2026-08-21T02:00:00Z')

function truthDraft(): ReviewDraft {
  return hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession, NOW)
}

describe('ReviewDraftSchema accepts the canonical fixture', () => {
  it('parses the TRUTH-hydrated draft unmodified', () => {
    const result = ReviewDraftSchema.safeParse(truthDraft())
    if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2))
    expect(result.success).toBe(true)
  })

  it('and the whole commit payload around it', () => {
    const result = CommitReviewPayloadSchema.safeParse({
      extractionId: 'abcdefghijkl',
      runId: null,
      draft: truthDraft(),
    })
    expect(result.success).toBe(true)
  })
})

describe('what the wall stops', () => {
  it('rejects a zero or negative distance', () => {
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), distanceKm: 0 }).success).toBe(false)
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), distanceKm: -5 }).success).toBe(false)
  })

  it('rejects a zero duration — it is the denominator of every metric F06 computes', () => {
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), durationSec: 0 }).success).toBe(false)
  })

  it('rejects a missing date', () => {
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), occurredOn: '' }).success).toBe(false)
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), occurredOn: '20 Aug' }).success).toBe(
      false,
    )
  })

  it('rejects two partial rows (D14)', () => {
    const draft = truthDraft()
    draft.splits[0]!.partial = true
    const result = ReviewDraftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    expect(fieldErrorsOf(result.error!)['splits.10.partial']).toBe(
      'Only the final kilometre can be partial.',
    )
  })

  it('rejects a partial row that is not the last one', () => {
    const draft = truthDraft()
    draft.splits[10]!.partial = false
    draft.splits[4]!.partial = true
    const result = ReviewDraftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    expect(fieldErrorsOf(result.error!)['splits.4.partial']).toContain('final kilometre')
  })

  it('rejects two rows claiming the same km — run_splits’ primary key would refuse it anyway', () => {
    const draft = truthDraft()
    draft.splits[3]!.km = 3
    const result = ReviewDraftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    expect(fieldErrorsOf(result.error!)['splits.3.km']).toContain('already a km 3')
  })

  it('rejects three zones out of five — a truncated denominator is undetectable downstream', () => {
    const draft = truthDraft()
    draft.hrZones = draft.hrZones.slice(0, 3)
    const result = ReviewDraftSchema.safeParse(draft)
    expect(result.success).toBe(false)
    expect(fieldErrorsOf(result.error!)['hrZones']).toContain('all five rows or none')
  })

  it('rejects a heart rate outside 40–230, which is a transposed digit not a reading', () => {
    const draft = truthDraft()
    draft.maxHrBpm = 1890
    expect(ReviewDraftSchema.safeParse(draft).success).toBe(false)
  })

  it('rejects a malformed start time', () => {
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), startTime: '25:00' }).success).toBe(false)
    expect(ReviewDraftSchema.safeParse({ ...truthDraft(), startTime: '7:07' }).success).toBe(false)
  })
})

describe('what the wall deliberately lets through', () => {
  it('a summary-only upload: zero splits and zero zones', () => {
    const draft = { ...truthDraft(), splits: [], hrZones: [] }
    expect(ReviewDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('a run whose numbers fail every consistency check — checks advise, they do not gate', () => {
    // 1 km in 4716 s at 442 s/km: CHK-1, CHK-3 and CHK-4 all disagree. A human who has looked at
    // the screenshot outranks arithmetic that only knows the numbers disagree.
    const draft = { ...truthDraft(), distanceKm: 1 }
    expect(ReviewDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('a run that crosses midnight', () => {
    const draft = { ...truthDraft(), startTime: '23:40', endTime: '00:12' }
    expect(ReviewDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('a cleared post-workout reading, held as a positional null (R-9)', () => {
    const draft = truthDraft()
    draft.postWorkoutHr = [
      { label: 'End', bpm: null },
      { label: '1 MIN', bpm: 162 },
    ]
    expect(ReviewDraftSchema.safeParse(draft).success).toBe(true)
  })
})

describe('toRunInput — D5’s unit conversion, once', () => {
  const parsed = () => ReviewDraftSchema.parse(truthDraft())

  it('converts kilometres to integer metres', () => {
    expect(toRunInput(parsed(), { source: 'screenshot', extractionId: 'x' }).distanceM).toBe(10670)
  })

  it('widens the clock times to what the time column wants', () => {
    const input = toRunInput(parsed(), { source: 'screenshot', extractionId: 'x' })
    expect(input.startedAt).toBe('07:07:00')
    expect(input.endedAt).toBe('08:26:00')
  })

  it('stores the REVIEWED average pace, not a recomputed one', () => {
    // CHK-3 exists to cross-check Apple's printed pace against distance and duration. Always
    // deriving would make the stored value unfalsifiable and the check meaningless.
    const draft = { ...parsed(), avgPaceSecPerKm: 448 }
    expect(toRunInput(draft, { source: 'screenshot', extractionId: 'x' }).avgPaceSec).toBe(448)
  })

  it('derives the pace only when the screenshot never printed one', () => {
    const draft = { ...parsed(), avgPaceSecPerKm: null }
    // 4716 s over 10.67 km = 442.0 s/km.
    expect(toRunInput(draft, { source: 'screenshot', extractionId: 'x' }).avgPaceSec).toBe(442)
  })

  it('maps R-9’s two readings positionally', () => {
    const input = toRunInput(parsed(), { source: 'screenshot', extractionId: 'x' })
    expect(input.endHrBpm).toBe(185)
    expect(input.hr1MinPostBpm).toBe(162)
    // The +2 min reading is reviewable and gets no column, by ruling.
  })

  it('leaves both HR-recovery columns null when the readings were cleared', () => {
    const draft = { ...parsed(), postWorkoutHr: [] }
    const input = toRunInput(draft, { source: 'screenshot', extractionId: 'x' })
    expect(input.endHrBpm).toBeNull()
    expect(input.hr1MinPostBpm).toBeNull()
  })

  it('renames the draft’s split fields onto the run_splits columns', () => {
    const input = toRunInput(parsed(), { source: 'screenshot', extractionId: 'x' })
    expect(input.splits).toHaveLength(11)
    expect(input.splits[10]).toEqual({
      km: 11,
      timeSec: 288,
      paceSec: 429,
      hr: 183,
      cadence: 145,
      partial: true,
    })
    expect(input.splits.filter((s) => s.partial)).toHaveLength(1)
  })

  it('carries all five zone rows with their null bounds intact', () => {
    const input = toRunInput(parsed(), { source: 'screenshot', extractionId: 'x' })
    expect(input.zones).toHaveLength(5)
    expect(input.zones[0]).toEqual({ zone: 1, durationSec: 104, minBpm: null, maxBpm: 140 })
    expect(input.zones[4]).toEqual({ zone: 5, durationSec: 1998, minBpm: 175, maxBpm: null })
  })

  it('carries the source and the extraction id through unchanged (§8)', () => {
    const input = toRunInput(parsed(), { source: 'manual', extractionId: 'failedone123' })
    expect(input.source).toBe('manual')
    // The failed extraction stays linked: it is a genuine F04 failure case and worth keeping.
    expect(input.extractionId).toBe('failedone123')
  })

  it('defaults the activity type rather than writing null into a NOT NULL column', () => {
    const draft = { ...parsed(), activityType: null }
    expect(toRunInput(draft, { source: 'manual', extractionId: null }).activityType).toBe(
      'Outdoor Run',
    )
  })
})

describe('fieldErrorsOf', () => {
  it('keys by the same dotted path the draft uses, first message wins', () => {
    const result = ReviewDraftSchema.safeParse({ ...truthDraft(), durationSec: 0, distanceKm: 0 })
    const errors = fieldErrorsOf(result.error!)
    expect(Object.keys(errors).sort()).toEqual(['distanceKm', 'durationSec'])
  })
})
