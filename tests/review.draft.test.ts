import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import { jakartaDayOf, todayInJakarta } from '@/lib/date/ranges'
import {
  diffCorrections,
  draftFromRun,
  emptyDraft,
  flattenDraft,
  hydrateDraftFromExtraction,
  mergeCorrections,
  narrowTime,
  resolveOccurredOn,
  widenTime,
  type ReviewDraft,
} from '@/lib/review/draft'
import type { ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * The draft, the date guess, and `extractions.corrections` — the column
 * `IMPLEMENTATION_PLAN.md` §3 calls the most valuable in the schema, because every human fix in
 * it is a labelled extraction failure.
 *
 * `diffCorrections` gets the most attention here for a reason: it is the only part of F05 whose
 * output nobody looks at until a month has passed and somebody runs the error-profile query. A
 * silently wrong diff produces a plausible-looking report built on nothing, which is worse than
 * no report at all.
 */

const NOW = new Date('2026-08-21T02:00:00Z') // 09:00 in Jakarta on the 21st

function truthSession(): ExtractedSession {
  return JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession
}

describe('todayInJakarta / jakartaDayOf (D6)', () => {
  it('is the Jakarta day, not the UTC day', () => {
    // 2026-08-20T18:30:00Z is 2026-08-21 01:30 in Jakarta. A run uploaded then belongs to the 21st.
    expect(jakartaDayOf(new Date('2026-08-20T18:30:00Z'))).toBe('2026-08-21')
    expect(jakartaDayOf(new Date('2026-08-20T16:59:00Z'))).toBe('2026-08-20')
  })

  it('emits ISO 8601, which is what runs.occurred_on stores', () => {
    expect(todayInJakarta(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(todayInJakarta(NOW)).toBe('2026-08-21')
  })
})

describe('resolveOccurredOn — the year Apple never prints', () => {
  it('reads the canonical fixture’s label', () => {
    expect(resolveOccurredOn('Thu, 20 Aug', NOW)).toBe('2026-08-20')
  })

  it('never guesses a future date: a December label read in August is LAST December', () => {
    // The whole safety property. A run cannot have happened tomorrow.
    expect(resolveOccurredOn('Sun, 14 Dec', NOW)).toBe('2025-12-14')
  })

  it('accepts today itself', () => {
    expect(resolveOccurredOn('Fri, 21 Aug', NOW)).toBe('2026-08-21')
  })

  it('honours an explicit year when the label carries one, future or not', () => {
    expect(resolveOccurredOn('Aug 20, 2024', NOW)).toBe('2024-08-20')
  })

  it('reads long month names and a bare day-month', () => {
    expect(resolveOccurredOn('20 August', NOW)).toBe('2026-08-20')
    expect(resolveOccurredOn('3 Mar', NOW)).toBe('2026-03-03')
  })

  it('returns null rather than a wrong date when it cannot read the label', () => {
    expect(resolveOccurredOn('Tangerang', NOW)).toBeNull()
    expect(resolveOccurredOn('', NOW)).toBeNull()
    expect(resolveOccurredOn(null, NOW)).toBeNull()
    expect(resolveOccurredOn('Outdoor Run', NOW)).toBeNull()
  })

  it('rejects an impossible day instead of rolling it into the next month', () => {
    expect(resolveOccurredOn('31 Feb', NOW)).toBeNull()
  })
})

describe('hydrateDraftFromExtraction', () => {
  it('mirrors every extracted field and derives the date', () => {
    const draft = hydrateDraftFromExtraction(truthSession(), NOW)
    expect(draft.occurredOn).toBe('2026-08-20')
    expect(draft.distanceKm).toBe(10.67)
    expect(draft.durationSec).toBe(4716)
    expect(draft.avgPaceSecPerKm).toBe(442)
    expect(draft.splits).toHaveLength(11)
    expect(draft.splits[10]).toMatchObject({ km: 11, timeSec: 288, partial: true })
    expect(draft.hrZones).toHaveLength(5)
    expect(draft.postWorkoutHr).toHaveLength(3)
  })

  it('keeps the year-less label as the evidence for the guess', () => {
    expect(hydrateDraftFromExtraction(truthSession(), NOW).dateLabel).toBe('Thu, 20 Aug')
  })

  it('falls back to today when the label cannot be read', () => {
    const session = { ...truthSession(), dateLabel: 'Outdoor Run' }
    expect(hydrateDraftFromExtraction(session, NOW).occurredOn).toBe('2026-08-21')
  })

  it('deep-copies: editing the draft cannot mutate the stored extraction', () => {
    const session = truthSession()
    const draft = hydrateDraftFromExtraction(session, NOW)
    draft.splits[0]!.timeSec = 999
    expect(session.splits[0]!.timeSec).toBe(396)
  })

  it('a null session is §8’s blank manual-entry draft, not an error', () => {
    const draft = hydrateDraftFromExtraction(null, NOW)
    expect(draft).toEqual(emptyDraft(NOW))
    expect(draft.durationSec).toBeNull()
    expect(draft.splits).toEqual([])
  })

  it('emptyDraft returns a fresh array each call — no shared splits between reviewers', () => {
    const a = emptyDraft(NOW)
    const b = emptyDraft(NOW)
    a.splits.push({
      km: 1,
      timeSec: 1,
      paceSecPerKm: 1,
      hrBpm: null,
      cadenceSpm: null,
      partial: false,
    })
    expect(b.splits).toEqual([])
  })
})

describe('draftFromRun — the post-review baseline', () => {
  const run = {
    occurredOn: '2026-08-20',
    activityType: 'Outdoor Run',
    location: 'Tangerang',
    startedAt: '07:07:00',
    endedAt: '08:26:00',
    durationSec: 4716,
    distanceM: 10670,
    activeKcal: 646,
    totalKcal: 747,
    elevationM: 15,
    avgCadence: 144,
    avgPaceSec: 442,
    avgHr: 173,
    maxHr: 189,
    restingHr: 72,
    endHrBpm: 185,
    hr1MinPostBpm: 162,
    intent: 'easy' as const,
    note: null,
  }

  it('converts metres back to the kilometres the screen edits in', () => {
    expect(draftFromRun(run, [], []).distanceKm).toBe(10.67)
  })

  it('narrows the time column back to what the screenshot printed', () => {
    const draft = draftFromRun(run, [], [])
    expect(draft.startTime).toBe('07:07')
    expect(draft.endTime).toBe('08:26')
  })

  it('rebuilds R-9’s two readings POSITIONALLY, holding a hole rather than promoting', () => {
    const draft = draftFromRun({ ...run, endHrBpm: null }, [], [])
    expect(draft.postWorkoutHr).toEqual([
      { label: 'End', bpm: null },
      { label: '1 MIN', bpm: 162 },
    ])
  })

  it('emits no readings at all when neither column is set', () => {
    expect(
      draftFromRun({ ...run, endHrBpm: null, hr1MinPostBpm: null }, [], []).postWorkoutHr,
    ).toEqual([])
  })

  it('renames the stored split columns back to the extractor’s field names', () => {
    const draft = draftFromRun(
      run,
      [{ km: 11, timeSec: 288, paceSec: 429, hr: 183, cadence: 145, partial: true }],
      [{ zone: 1, durationSec: 104, minBpm: null, maxBpm: 140 }],
    )
    expect(draft.splits[0]).toEqual({
      km: 11,
      timeSec: 288,
      paceSecPerKm: 429,
      hrBpm: 183,
      cadenceSpm: 145,
      partial: true,
    })
    expect(draft.hrZones[0]).toEqual({ zone: 1, durationSec: 104, minBpm: null, maxBpm: 140 })
  })
})

describe('narrowTime / widenTime', () => {
  it('round-trips the shape the time column wants', () => {
    expect(widenTime('07:07')).toBe('07:07:00')
    expect(widenTime('7:07')).toBe('07:07:00')
    expect(narrowTime('07:07:00')).toBe('07:07')
    expect(widenTime(null)).toBeNull()
    expect(narrowTime(null)).toBeNull()
  })

  it('refuses a value it cannot widen rather than storing a broken time', () => {
    expect(widenTime('lunchtime')).toBeNull()
  })
})

describe('flattenDraft', () => {
  it('produces one key per leaf, in F05’s dotted syntax', () => {
    const flat = flattenDraft(hydrateDraftFromExtraction(truthSession(), NOW))
    expect(flat.get('distanceKm')).toBe(10.67)
    expect(flat.get('splits.0.timeSec')).toBe(396)
    expect(flat.get('splits.10.partial')).toBe(true)
    expect(flat.get('hrZones.3.durationSec')).toBe(2165)
    expect(flat.get('postWorkoutHr.1.bpm')).toBe(162)
  })

  it('keys arrays by INDEX, not by km — a renumbered row must stay expressible', () => {
    const draft = hydrateDraftFromExtraction(truthSession(), NOW)
    draft.splits[10]!.km = 12
    expect(flattenDraft(draft).get('splits.10.km')).toBe(12)
  })
})

describe('diffCorrections (R-7 / plan §6.1)', () => {
  const base = () => hydrateDraftFromExtraction(truthSession(), NOW)
  const OPTS = { phase: 'review' as const, correctedAt: '2026-08-21T09:14:41.000Z' }

  it('records nothing when nothing changed — corrections measure edits, not attention', () => {
    expect(diffCorrections(base(), base(), OPTS)).toEqual({})
  })

  it('records exactly the leaf that changed, in R-7’s array-per-field shape', () => {
    const before = base()
    before.splits[0]!.timeSec = 436 // what the model said
    const after = base() // what the human fixed it back to

    const diff = diffCorrections(before, after, OPTS)
    expect(Object.keys(diff)).toEqual(['splits.0.timeSec'])
    expect(diff['splits.0.timeSec']).toEqual([
      { from: 436, to: 396, phase: 'review', correctedAt: OPTS.correctedAt },
    ])
  })

  it('attaches the checkId of whichever check was pointing at the field', () => {
    const before = base()
    before.splits[0]!.timeSec = 436
    const after = base()

    const diff = diffCorrections(before, after, {
      ...OPTS,
      checkIdFor: (path) => (path.startsWith('splits') ? 'splits_sum_vs_duration' : undefined),
    })
    expect(diff['splits.0.timeSec']![0]!.checkId).toBe('splits_sum_vs_duration')
  })

  it('omits checkId entirely — rather than writing null — when no check fired', () => {
    // `undefined` keys vanish through jsonb; the analytics query reads a missing key as
    // "caught by eye", which is the honest reading.
    const before = base()
    const after = base()
    after.location = 'Serpong'
    const diff = diffCorrections(before, after, OPTS)
    expect(diff['location']![0]).not.toHaveProperty('checkId')
  })

  it('records a boolean flip — the D14 case', () => {
    const before = base()
    before.splits[10]!.partial = false
    const diff = diffCorrections(before, base(), OPTS)
    expect(diff['splits.10.partial']).toEqual([
      { from: false, to: true, phase: 'review', correctedAt: OPTS.correctedAt },
    ])
  })

  it('treats a blank string as a null, not as a change', () => {
    const before = base()
    const after = base()
    after.location = '   '
    expect(diffCorrections({ ...before, location: null }, after, OPTS)).toEqual({})
  })

  it('records a deleted split row as its leaves going to null', () => {
    const before = base()
    const after = base()
    after.splits = after.splits.slice(0, 10)
    const diff = diffCorrections(before, after, OPTS)
    expect(diff['splits.10.timeSec']).toEqual([
      { from: 288, to: null, phase: 'review', correctedAt: OPTS.correctedAt },
    ])
  })

  it('records an added split row as its leaves arriving from null', () => {
    const before = base()
    const after = base()
    after.splits = [
      ...after.splits,
      { km: 12, timeSec: 300, paceSecPerKm: 450, hrBpm: null, cadenceSpm: null, partial: false },
    ]
    const diff = diffCorrections(before, after, OPTS)
    expect(diff['splits.11.km']).toEqual([
      { from: null, to: 12, phase: 'review', correctedAt: OPTS.correctedAt },
    ])
  })

  it('carries the manual phase, where every from is null by construction', () => {
    const diff = diffCorrections(emptyDraft(NOW), base(), {
      phase: 'manual',
      correctedAt: OPTS.correctedAt,
    })
    expect(diff['distanceKm']).toEqual([
      { from: null, to: 10.67, phase: 'manual', correctedAt: OPTS.correctedAt },
    ])
    // Every entry in a manual commit has a null `from` — that is what makes §6.2 able to exclude
    // them from the extractor's error rate.
    for (const events of Object.values(diff)) {
      for (const event of events) expect(event.phase).toBe('manual')
    }
  })
})

describe('mergeCorrections — append, never overwrite', () => {
  const first = {
    'splits.0.timeSec': [
      { from: 436, to: 396, phase: 'review' as const, correctedAt: '2026-08-20T09:14:41.000Z' },
    ],
  }
  const second = {
    'splits.0.timeSec': [
      {
        from: 396,
        to: 398,
        phase: 'post-review-edit' as const,
        correctedAt: '2026-08-22T18:02:10.000Z',
      },
    ],
  }

  it('keeps both edit events on the same path, oldest first', () => {
    const merged = mergeCorrections(first, second)
    expect(merged['splits.0.timeSec']).toHaveLength(2)
    expect(merged['splits.0.timeSec']![0]!.phase).toBe('review')
    expect(merged['splits.0.timeSec']![1]!.phase).toBe('post-review-edit')
  })

  it('leaves untouched paths alone and starts a new array for a new one', () => {
    const merged = mergeCorrections(first, { location: second['splits.0.timeSec'] })
    expect(Object.keys(merged).sort()).toEqual(['location', 'splits.0.timeSec'])
  })

  it('does not mutate the existing column value', () => {
    mergeCorrections(first, second)
    expect(first['splits.0.timeSec']).toHaveLength(1)
  })

  it('null existing is the first commit', () => {
    expect(mergeCorrections(null, second)).toEqual(second)
  })

  it('coerces a pre-R-7 single-object value into a one-event array rather than dropping it', () => {
    const legacy = { distanceKm: { from: 1, to: 2 } } as unknown as Parameters<
      typeof mergeCorrections
    >[0]
    const merged = mergeCorrections(legacy, {})
    expect(Array.isArray(merged['distanceKm'])).toBe(true)
    expect(merged['distanceKm']).toHaveLength(1)
  })
})

describe('the draft type mirrors the extractor field-for-field', () => {
  it('every ExtractedSession key exists on the draft', () => {
    const session = truthSession()
    const draft: ReviewDraft = hydrateDraftFromExtraction(session, NOW)
    for (const key of Object.keys(session)) {
      expect(draft).toHaveProperty(key)
    }
  })
})
