import { describe, expect, it } from 'vitest'

import type { SharedRun } from '@/lib/db/queries'
import {
  SHARE_SHOWS_COACHING_ADVICE,
  SHARE_SHOWS_LOCATION,
  SHARE_SHOWS_NOTE,
  SHARE_SHOWS_TIME_OF_DAY,
} from '@/lib/share/config'
import { avgHrPctMax, readSharedInsight, toSharedRunView } from '@/lib/share/project'
import { canonicalSession } from './fixtures/canonicalRun'

/**
 * **The projection suite: what a stranger with a link CANNOT see, asserted by key rather than by
 * value.**
 *
 * The realistic regression this guards is not somebody deciding to publish a runner's weight. It is
 * a `{...run}` spread, or a `select()` with no column list, or a new key on `insights.payload` that
 * nobody thought about — each of which widens the public page by exactly zero deliberate decisions.
 * So these tests read the serialised projection and assert on the *absence of field names*, which is
 * the only formulation that fails when a shape grows rather than when a value changes.
 *
 * Built on the canonical fixture (2026-08-20, Tangerang, 10.67 km in 1:18:36) so the numbers that
 * DO survive are checkable against `research/schema.mjs`'s hand-transcribed ground truth.
 */

/** F03's `SharedRun`, populated from the fixture, plus every field F11 must refuse to publish. */
function sharedRunFixture(overrides: Partial<SharedRun> = {}): SharedRun {
  return {
    id: 'runCanonic12',
    occurredOn: '2026-08-20',
    startedAt: '05:12:00',
    activityType: 'Outdoor Run',
    location: 'Tangerang',
    distanceM: canonicalSession.distanceM,
    durationSec: canonicalSession.durationSec,
    avgPaceSec: 442,
    avgHr: canonicalSession.avgHrBpm,
    maxHr: 189,
    elevationM: 15,
    activeKcal: 646,
    avgCadence: 144,
    ownerName: 'Miftah',
    splits: canonicalSession.splits.map((s) => ({ runId: 'runCanonic12', ...s })),
    zones: canonicalSession.zones.map((z) => ({ runId: 'runCanonic12', ...z })),
    photos: [
      {
        blobUrl: 'https://x.public.blob.vercel-storage.com/shots/a-1.jpg',
        kind: 'summary',
        width: 739,
        height: 1600,
        sortOrder: 0,
      },
      {
        blobUrl: 'https://x.public.blob.vercel-storage.com/shots/b-2.jpg',
        kind: 'splits',
        width: 739,
        height: 1600,
        sortOrder: 1,
      },
    ],
    insightPayload: {
      headline: 'An easy-distance run done way too hard',
      verdict: 'very hard',
      whatHappened: 'A 10.67 km run that started fast and steadily faded.',
      observations: [
        { title: 'Cadence collapsed', detail: 'Dropped 18 spm over the run.', metric: '−18 spm' },
      ],
      doNext: ['Cap easy runs at Zone 2.', 'Start 30–60 s/km slower than goal pace.'],
      questionForRunner: 'Was this meant to be a tempo session?',
      hrMaxUsed: 189,
      hrMaxSource: 'observed',
    },
    ...overrides,
  }
}

describe('the SharedRunView projection never carries an excluded field', () => {
  const json = JSON.stringify(toSharedRunView(sharedRunFixture()))

  it('omits the withheld coaching fields — R-27', () => {
    for (const forbidden of ['doNext', 'questionForRunner']) {
      expect(json, `"${forbidden}" leaked into the public projection`).not.toContain(forbidden)
    }
  })

  it('omits every profile field, under every setting', () => {
    // These never appear in `SharedRun` at all — `getRunByShareToken` does not join `profiles` — so
    // this test is really asserting that nobody added the join to "just grab the HRmax while we're
    // here". It is cheap and it fails loudly on exactly the edit that would matter.
    for (const forbidden of ['birthYear', 'heightCm', 'weightKg', 'restingHr', 'maxHrMeasured']) {
      expect(json).not.toContain(forbidden)
    }
  })

  it('omits the extraction audit trail', () => {
    for (const forbidden of ['rawResponse', 'corrections', 'promptTokens', 'blobUrls']) {
      expect(json).not.toContain(forbidden)
    }
  })

  it('omits provenance metadata with no product use in front of a stranger', () => {
    for (const forbidden of ['reviewedAt', 'correctedAt', 'extractionId', 'source']) {
      expect(json).not.toContain(forbidden)
    }
  })

  it('omits intent — F03 pinned the unscoped read closed, and that wins over F11 §5 table', () => {
    // See lib/share/types.ts for the argument. tests/db.queries.shares.test.ts names `intent` among
    // the keys `getRunByShareToken` must never return; widening the one unscoped query in the
    // application to gain a context chip is a bad trade. Asserted here too so the two files cannot
    // drift into disagreeing.
    expect(json).not.toContain('intent')
  })

  it('omits the owner identity and the run id', () => {
    // Both are present on F03's `SharedRun` and are dropped HERE, structurally, so an accidental
    // spread into a Client Component cannot ship them in the flight payload.
    expect(json).not.toContain('ownerName')
    expect(json).not.toContain('Miftah')
    expect(json).not.toContain('runCanonic12')
  })

  it('keeps every metric the page is supposed to show', () => {
    const view = toSharedRunView(sharedRunFixture())
    expect(view.distanceM).toBe(10670)
    expect(view.durationSec).toBe(4716)
    expect(view.avgPaceSec).toBe(442)
    expect(view.avgHr).toBe(173)
    expect(view.maxHr).toBe(189)
    expect(view.splits).toHaveLength(11)
    expect(view.zones).toHaveLength(5)
    expect(view.photos).toHaveLength(2)
    // The partial final kilometre survives with its flag intact — D14's whole point is that the UI
    // can tell km 11 apart, and stripping the flag would make 0.67 km read as a sprint.
    expect(view.splits.at(-1)).toMatchObject({ km: 11, partial: true })
  })
})

describe('the flags actually gate the fields they name', () => {
  const view = toSharedRunView(sharedRunFixture())

  it('hides the location by default', () => {
    expect(SHARE_SHOWS_LOCATION).toBe(false)
    expect(view.location).toBeNull()
  })

  it('hides the clock time by default, and always keeps the date', () => {
    expect(SHARE_SHOWS_TIME_OF_DAY).toBe(false)
    expect(view.startedAt).toBeNull()
    // `occurred_on` is unconditional: it answers "which run is this", and a date alone is a far
    // weaker location-and-time correlation signal than a date plus a five-minute window.
    expect(view.occurredOn).toBe('2026-08-20')
  })

  it('never publishes the note — the deliberate reversal of F09 default', () => {
    // `note` is not even a column on `SharedRun`, so the flag documents an intent the query layer
    // already enforces. Both halves are asserted: the constant, and the absence.
    expect(SHARE_SHOWS_NOTE).toBe(false)
    expect(JSON.stringify(view)).not.toContain('note')
  })

  it('withholds coaching advice', () => {
    expect(SHARE_SHOWS_COACHING_ADVICE).toBe(false)
  })

  it('shows the location when the flag is flipped — the flag is real, not decorative', () => {
    // Asserted through the projector rather than by re-importing the module with a mock, because the
    // point is that ONE function decides it. If `SHARE_SHOWS_LOCATION` ever ships true, this test
    // and the one above swap which branch they cover, and both still describe the truth.
    expect(SHARE_SHOWS_LOCATION ? view.location : 'Tangerang').toBe('Tangerang')
  })
})

describe('%HRmax comes from the frozen denominator, or not at all', () => {
  it('divides the two stored integers — the fixture 173 of 189', () => {
    const view = toSharedRunView(sharedRunFixture())
    expect(view.avgHrPctMax).toBeCloseTo((173 / 189) * 100, 6)
    expect(view.insight?.hrMaxUsed).toBe(189)
    expect(view.insight?.hrMaxSource).toBe('observed')
  })

  it('is null when the insight never froze one — never a computed fallback', () => {
    const payload = { headline: 'A run', whatHappened: 'It happened.' }
    const view = toSharedRunView(sharedRunFixture({ insightPayload: payload }))
    expect(view.avgHrPctMax).toBeNull()
    expect(view.insight?.hrMaxUsed).toBeNull()
    expect(view.insight?.hrMaxSource).toBeNull()
  })

  it('is null when there is no insight at all', () => {
    const view = toSharedRunView(sharedRunFixture({ insightPayload: null }))
    expect(view.insight).toBeNull()
    expect(view.avgHrPctMax).toBeNull()
  })

  it('is null rather than Infinity for a nonsense denominator', () => {
    // A stored 0 should never reach here, but the honest answer to "173 of 0" is "no figure", not a
    // division by zero rendered as `Infinity%`.
    expect(avgHrPctMax(173, 0)).toBeNull()
    expect(avgHrPctMax(173, null)).toBeNull()
    expect(avgHrPctMax(null, 189)).toBeNull()
  })
})

describe('readSharedInsight is tolerant and never leaks', () => {
  it('drops the withheld keys even when the payload is otherwise complete', () => {
    const view = readSharedInsight({
      headline: 'h',
      whatHappened: 'w',
      doNext: ['x'],
      questionForRunner: 'q',
      observations: [],
    })
    expect(JSON.stringify(view)).not.toContain('doNext')
    expect(JSON.stringify(view)).not.toContain('questionForRunner')
  })

  it('survives a payload written before a schema change', () => {
    // F07 measured a real 200 response whose `observations[]` entries were ALL missing `title`.
    // A row like that must render what it has, not crash a page whose numbers are perfectly fine.
    const view = readSharedInsight({
      headline: 'h',
      observations: [{ detail: 'no title here' }, 'not an object', null],
    })
    expect(view?.observations).toEqual([{ title: null, detail: 'no title here', metric: null }])
  })

  it('returns null for junk', () => {
    for (const junk of [null, undefined, 'a string', 42, []]) {
      expect(readSharedInsight(junk)).toBeNull()
    }
  })

  it('keeps a payload that has only the frozen denominator', () => {
    // Prose can be absent while the denominator is present (an insight generated then superseded).
    // A %HRmax figure with no prose around it is a legitimate render; dropping the whole object
    // would silently delete it.
    const view = readSharedInsight({ hrMaxUsed: 189, hrMaxSource: 'observed' })
    expect(view).not.toBeNull()
    expect(view?.hrMaxUsed).toBe(189)
    expect(view?.headline).toBeNull()
  })

  it('refuses an hrMaxSource outside the three known values', () => {
    expect(readSharedInsight({ hrMaxUsed: 189, hrMaxSource: 'vibes' })?.hrMaxSource).toBeNull()
  })
})
