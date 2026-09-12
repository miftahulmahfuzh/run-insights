import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import type { Extraction, ExtractionBlobRefRow } from '@/lib/db/schema'
import { draftFromRun, hydrateDraftFromExtraction } from '@/lib/review/draft'
import type { ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **`loadReview` — the baseline resolver.**
 *
 *  Every `from` value in `extractions.corrections` originates here, so what these two functions
 *  return is not presentation — it is measurement (the module's own warning: a wrong baseline
 *  quietly corrupts the one column whose entire purpose is measurement). The assertions pin
 *  BASELINE PROVENANCE, the module's one rule:
 *
 *    - first commit (`/x/[id]`) → baseline is **what the model said**, hydrated from parsedSession
 *    - later edits  (`/r/[id]`) → baseline is **what is stored**, rebuilt from the run rows
 *
 *  plus the failure posture: a `failed` extraction produces §8's blank draft through the SAME
 *  branch as an ok one (`hydrateDraftFromExtraction(null)` is the blank), never a special case.
 *
 *  The queries are stubbed; `draft.ts` runs for real. The mapping is the feature here — stubbing
 *  `hydrateDraftFromExtraction`/`draftFromRun` would let the provenance rot while the suite
 *  stayed green, which is exactly the failure this file exists to catch.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const queries = vi.hoisted(() => ({
  getExtraction: vi.fn(),
  getRunDetail: vi.fn(),
  getRunIdForExtraction: vi.fn(),
  listExtractionPhotos: vi.fn(),
}))

vi.mock('@/lib/db/queries', () => ({ ...queries }))

const { loadExtractionReview, loadRunEdit } = await import('@/lib/review/loadReview')

const USER = 'user_1'
const EXTRACTION_ID = 'extract12345'
const RUN_ID = 'run123456789'
const NOW = new Date('2026-08-21T02:00:00Z')

function truthSession(): ExtractedSession {
  return JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession
}

function extractionRow(overrides: Partial<Extraction> = {}): Extraction {
  return {
    id: EXTRACTION_ID,
    userId: USER,
    blobUrls: [],
    model: 'glm-4.6v',
    promptTokens: 3277,
    rawResponse: { vendor: { choices: [] }, parsedSession: truthSession(), attempts: 1 },
    status: 'ok',
    errorCode: null,
    corrections: null,
    createdAt: new Date('2026-08-21T01:59:00Z'),
    completedAt: new Date('2026-08-21T01:59:33Z'),
    ...overrides,
  } as Extraction
}

/**
 * The stored-run shape `loadRunEdit` reads — the same fixture `tests/review.commit.test.ts` uses
 * for its post-review-edit block, so both suites describe the same run.
 */
function runDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    userId: USER,
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
    intent: null,
    note: null,
    source: 'screenshot',
    extractionId: EXTRACTION_ID,
    reviewedAt: new Date('2026-08-20T09:20:00Z'),
    correctedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    splits: TRUTH.splits.map((s) => ({
      km: s.km,
      timeSec: s.timeSec,
      paceSec: s.paceSecPerKm,
      hr: s.hrBpm,
      cadence: s.cadenceSpm,
      partial: s.partial,
    })),
    zones: TRUTH.hrZones.map((z) => ({ ...z })),
    photos: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  queries.getExtraction.mockResolvedValue(extractionRow())
  queries.listExtractionPhotos.mockResolvedValue([])
  queries.getRunIdForExtraction.mockResolvedValue(null)
  queries.getRunDetail.mockResolvedValue(runDetailRow())
})

describe('loadExtractionReview — /x/[id], the baseline is what the model said', () => {
  it('answers null for an extraction that is not ours, before touching any other table', async () => {
    // The ownership check is the FIRST read; a stranger's id must not buy two queries worth of
    // existence information, or even the photo list.
    queries.getExtraction.mockResolvedValue(null)

    expect(await loadExtractionReview(USER, EXTRACTION_ID, NOW)).toBeNull()
    expect(queries.listExtractionPhotos).not.toHaveBeenCalled()
    expect(queries.getRunIdForExtraction).not.toHaveBeenCalled()
  })

  it('hydrates the baseline from parsedSession, with the passed clock', async () => {
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    // The oracle is the real hydrator run on the same session: the loader's whole job is to hand
    // it the right session and the right now, so equality here is the contract, and the spot
    // checks below keep the oracle honest about WHICH numbers those are.
    expect(context!.baseline).toEqual(hydrateDraftFromExtraction(truthSession(), NOW))
    expect(context!.baseline.distanceKm).toBe(10.67)
    expect(context!.baseline.occurredOn).toBe('2026-08-20')
    expect(context!.baseline.splits).toHaveLength(11)

    expect(context!.mode).toBe('review')
    expect(context!.runId).toBeNull()
    expect(context!.extractionStatus).toBe('ok')
    expect(context!.errorCode).toBeNull()
  })

  it('a failed extraction hydrates §8’s blank draft — the manual path needs no separate branch', async () => {
    queries.getExtraction.mockResolvedValue(
      extractionRow({ status: 'failed', errorCode: 'validation', rawResponse: null }),
    )
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.baseline).toEqual(hydrateDraftFromExtraction(null, NOW))
    expect(context!.baseline.distanceKm).toBeNull()
    expect(context!.baseline.splits).toHaveLength(0)
    // The blank draft starts on TODAY (Jakarta), not on the model's unreadable date — and this
    // assertion is also what pins the clock passthrough: a loader that ignored the passed `now`
    // and called `new Date()` would land on the real today, not 2026-08-21.
    expect(context!.baseline.occurredOn).toBe('2026-08-21')

    // The failure stays visible: the screen is still keyed to the failed attempt so
    // `runs.extraction_id` records that the numbers were typed by a human.
    expect(context!.extractionStatus).toBe('failed')
    expect(context!.errorCode).toBe('validation')
    expect(context!.rawVendorResponse).toBeNull()
  })

  it('a repaired extraction hydrates like an ok one — it has a session worth editing', async () => {
    queries.getExtraction.mockResolvedValue(extractionRow({ status: 'repaired' }))
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.baseline.distanceKm).toBe(10.67)
    expect(context!.extractionStatus).toBe('repaired')
  })

  it('maps the session photos to the review shape, null dimensions included', async () => {
    queries.listExtractionPhotos.mockResolvedValue([
      { blobUrl: 'https://x.blob/shots/summary-1.jpg', kind: 'summary', width: 1170, height: 2532 },
      { blobUrl: 'https://x.blob/shots/splits-1.jpg', kind: 'splits', width: null, height: null },
    ])
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.photos).toEqual([
      { url: 'https://x.blob/shots/summary-1.jpg', kind: 'summary', width: 1170, height: 2532 },
      { url: 'https://x.blob/shots/splits-1.jpg', kind: 'splits', width: null, height: null },
    ])
  })

  it('carries the vendor JSON and the corrections log through BY REFERENCE', async () => {
    // "Never re-parsed, never inferred from" is the doc contract on `rawVendorResponse` — the
    // strongest form of which is identity: the very object from the row, not a copy.
    const vendor = { choices: [{ message: { content: '…' } }] }
    const corrections: Extraction['corrections'] = {
      distanceKm: [{ from: 10.0, to: 10.67, phase: 'review', correctedAt: NOW.toISOString() }],
    }
    queries.getExtraction.mockResolvedValue(
      extractionRow({
        rawResponse: { vendor, parsedSession: truthSession(), attempts: 1 },
        corrections,
      }),
    )
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.rawVendorResponse).toBe(vendor)
    expect(context!.existingCorrections).toBe(corrections)
  })

  it('sourceImages is exactly what was sent to the model — the same body /api/extract accepts', async () => {
    const blobUrls: ExtractionBlobRefRow[] = [
      {
        url: 'https://x.blob/shots/summary-1.jpg',
        pathname: 'shots/summary-1.jpg',
        kind: 'summary',
      },
    ]
    queries.getExtraction.mockResolvedValue(extractionRow({ blobUrls }))
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.sourceImages).toEqual(blobUrls)
  })

  it('falls back to [] when the blob refs are missing — a defensive guard on a notNull column', async () => {
    // `extractions.blob_urls` is notNull, so this row cannot exist today; the `?? []` is the kind
    // of guard that exists for a legacy row or a hand-edited one, and this test is its record.
    queries.getExtraction.mockResolvedValue(
      extractionRow({ blobUrls: null as unknown as Extraction['blobUrls'] }),
    )
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.sourceImages).toEqual([])
  })

  it('threads committedRunId — the screen redirects instead of re-committing', async () => {
    queries.getRunIdForExtraction.mockResolvedValue('alreadyrun12')
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)

    expect(context!.committedRunId).toBe('alreadyrun12')
  })
})

describe('loadRunEdit — /r/[id]/edit, the baseline is what is stored', () => {
  it('answers null for a run that is not ours, without probing the extraction', async () => {
    queries.getRunDetail.mockResolvedValue(null)

    expect(await loadRunEdit(USER, RUN_ID)).toBeNull()
    expect(queries.getExtraction).not.toHaveBeenCalled()
  })

  it('rebuilds the draft from the stored run, in the stored run’s units', async () => {
    const detail = runDetailRow({
      photos: [
        {
          blobUrl: 'https://x.blob/shots/summary-1.jpg',
          kind: 'summary',
          width: 1170,
          height: 2532,
        },
      ],
    })
    queries.getRunDetail.mockResolvedValue(detail)
    const context = await loadRunEdit(USER, RUN_ID)

    // Same oracle discipline as the review mode: the real rebuilder, fed what the loader fed it.
    expect(context!.baseline).toEqual(draftFromRun(detail, detail.splits, detail.zones))
    // The conversions the oracle would silently share: metres → kilometres, Postgres's widened
    // `time` narrowed back to what the screenshot printed, and the two R-9 columns back into
    // their POSITIONAL slots.
    expect(context!.baseline.distanceKm).toBe(10.67)
    expect(context!.baseline.startTime).toBe('07:07')
    expect(context!.baseline.postWorkoutHr).toEqual([
      { label: 'End', bpm: 185 },
      { label: '1 MIN', bpm: 162 },
    ])
    expect(context!.photos).toEqual([
      { url: 'https://x.blob/shots/summary-1.jpg', kind: 'summary', width: 1170, height: 2532 },
    ])

    expect(context!.mode).toBe('edit')
    expect(context!.runId).toBe(RUN_ID)
    // An edit of a committed run IS the committed run — the redirect target is itself.
    expect(context!.committedRunId).toBe(RUN_ID)
    expect(context!.extractionId).toBe(EXTRACTION_ID)
  })

  it('a run with no extraction link reads as extraction-less, and never asks the table', async () => {
    queries.getRunDetail.mockResolvedValue(runDetailRow({ extractionId: null }))
    const context = await loadRunEdit(USER, RUN_ID)

    expect(queries.getExtraction).not.toHaveBeenCalled()
    expect(context!.extractionStatus).toBeNull()
    expect(context!.errorCode).toBeNull()
    expect(context!.rawVendorResponse).toBeNull()
    expect(context!.existingCorrections).toBeNull()
    expect(context!.sourceImages).toEqual([])
  })

  it('threads the extraction’s failure story so the edit screen still shows it', async () => {
    queries.getExtraction.mockResolvedValue(
      extractionRow({ status: 'failed', errorCode: 'validation', rawResponse: null }),
    )
    const context = await loadRunEdit(USER, RUN_ID)

    expect(context!.extractionStatus).toBe('failed')
    expect(context!.errorCode).toBe('validation')
    expect(context!.rawVendorResponse).toBeNull()
    expect(context!.existingCorrections).toBeNull()
    expect(context!.sourceImages).toEqual([])
  })
})
