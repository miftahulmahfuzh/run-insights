import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import type { Extraction } from '@/lib/db/schema'
import { hydrateDraftFromExtraction, type ReviewDraft } from '@/lib/review/draft'
import type { ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **`commitReview` — the only code path that sets `runs.reviewed_at`.**
 *
 *  These tests assert the ORCHESTRATION, not the SQL: which query is called, with what, in what
 *  order, and what happens when one of them fails. The generated SQL is already asserted by
 *  `tests/db.queries.commitRun.test.ts` against a real dialect; re-asserting it here would test
 *  F03 twice and F05 not at all.
 *
 *  What is actually at stake in each case:
 *
 *    - the golden path writes `reviewed_at` and NO corrections (nothing was changed)
 *    - a corrected field lands in `extractions.corrections` with the checkId that caught it
 *    - a post-review edit leaves `reviewed_at` alone, sets `corrected_at`, and APPENDS
 *    - a failed extraction becomes `source: 'manual'` and keeps its link to the failure
 *    - a duplicate is a message, not a stack trace
 *    - **invalidation failure never rolls back a human's confirmed save** (plan §7.3)
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const queries = vi.hoisted(() => ({
  getExtraction: vi.fn(),
  listExtractionPhotos: vi.fn(),
  getRunIdForExtraction: vi.fn(),
  getRunDetail: vi.fn(),
  commitExtractedRun: vi.fn(),
  applyRunCorrections: vi.fn(),
  recordCorrections: vi.fn(),
}))

vi.mock('@/lib/db/queries', async (importOriginal) => {
  // The real error classes come through: `commitReview` branches on `instanceof`, and a stubbed
  // class would make that branch untestable in exactly the way that matters.
  const actual = await importOriginal<typeof import('@/lib/db/queries')>()
  return { ...actual, ...queries }
})

const { commitReview } = await import('@/lib/review/commit')
const { DuplicateRunError } = await import('@/lib/db/queries')

const USER = 'user_1'
const EXTRACTION_ID = 'extract12345'
const NOW = new Date('2026-08-21T02:00:00Z')
const now = () => NOW

function truthSession(): ExtractedSession {
  return JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession
}

function baselineDraft(): ReviewDraft {
  return hydrateDraftFromExtraction(truthSession(), NOW)
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

beforeEach(() => {
  vi.clearAllMocks()
  queries.getExtraction.mockResolvedValue(extractionRow())
  queries.listExtractionPhotos.mockResolvedValue([])
  queries.getRunIdForExtraction.mockResolvedValue(null)
  queries.commitExtractedRun.mockResolvedValue({ runId: 'run123456789' })
  queries.applyRunCorrections.mockResolvedValue(undefined)
  queries.recordCorrections.mockResolvedValue(undefined)
})

function payload(draft: ReviewDraft, runId: string | null = null) {
  return { extractionId: EXTRACTION_ID, runId, draft }
}

describe('the golden path — TRUTH committed unmodified', () => {
  it('creates the run with reviewed_at set (R-1: this is the only place a run is born)', async () => {
    const invalidate = vi.fn()
    const outcome = await commitReview(USER, payload(baselineDraft()), { now, invalidate })

    expect(outcome).toEqual({ ok: true, runId: 'run123456789', newlyEarned: [] })
    expect(queries.commitExtractedRun).toHaveBeenCalledTimes(1)
    const [userId, input, options] = queries.commitExtractedRun.mock.calls[0]!
    expect(userId).toBe(USER)
    expect(options).toEqual({ reviewedAt: NOW })
    expect(input.source).toBe('screenshot')
    expect(input.extractionId).toBe(EXTRACTION_ID)
  })

  it('writes the fixture’s real numbers, converted to the stored units', async () => {
    await commitReview(USER, payload(baselineDraft()), { now })
    const [, input] = queries.commitExtractedRun.mock.calls[0]!
    expect(input.occurredOn).toBe('2026-08-20')
    expect(input.distanceM).toBe(10670)
    expect(input.durationSec).toBe(4716)
    expect(input.avgPaceSec).toBe(442)
    expect(input.maxHr).toBe(189)
    expect(input.endHrBpm).toBe(185)
    expect(input.hr1MinPostBpm).toBe(162)
    expect(input.splits).toHaveLength(11)
    expect(input.splits.filter((s: { partial: boolean }) => s.partial)).toHaveLength(1)
    expect(input.zones).toHaveLength(5)
  })

  it('records NO corrections — nothing was changed', async () => {
    await commitReview(USER, payload(baselineDraft()), { now })
    expect(queries.recordCorrections).not.toHaveBeenCalled()
  })

  it('fires onRunCommitted exactly once, with phase "review"', async () => {
    const invalidate = vi.fn()
    await commitReview(USER, payload(baselineDraft()), { now, invalidate })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({
      runId: 'run123456789',
      userId: USER,
      changedFieldPaths: [],
      occurredOn: '2026-08-20',
      previousOccurredOn: null,
      phase: 'review',
    })
  })
})

describe('the corrected path — the §1.3 misread, fixed by a human', () => {
  it('logs the edit with the checkId of the check that caught it', async () => {
    // The extraction said 436 s where the screenshot reads 6'36". CHK-1 fires on that (the split
    // sum lands 34 s out), the reviewer corrects it back to 396.
    const corrupted = truthSession()
    corrupted.splits[0]!.timeSec = 436
    queries.getExtraction.mockResolvedValue(
      extractionRow({
        rawResponse: { vendor: {}, parsedSession: corrupted, attempts: 1 },
      }),
    )

    await commitReview(USER, payload(baselineDraft()), { now })

    expect(queries.recordCorrections).toHaveBeenCalledTimes(1)
    const [userId, extractionId, corrections] = queries.recordCorrections.mock.calls[0]!
    expect(userId).toBe(USER)
    expect(extractionId).toBe(EXTRACTION_ID)
    expect(corrections['splits.0.timeSec']).toEqual([
      {
        from: 436,
        to: 396,
        phase: 'review',
        checkId: 'splits_sum_vs_duration',
        correctedAt: NOW.toISOString(),
      },
    ])
  })

  it('leaves checkId off a field no check was pointing at — "caught by eye"', async () => {
    const draft = baselineDraft()
    draft.location = 'Serpong'
    await commitReview(USER, payload(draft), { now })

    const [, , corrections] = queries.recordCorrections.mock.calls[0]!
    expect(corrections['location']![0]).not.toHaveProperty('checkId')
  })

  it('passes the changed paths to onRunCommitted so F06/F09 know what moved', async () => {
    const invalidate = vi.fn()
    const draft = baselineDraft()
    draft.distanceKm = 10.7
    await commitReview(USER, payload(draft), { now, invalidate })

    expect(invalidate.mock.calls[0]![0].changedFieldPaths).toEqual(['distanceKm'])
  })

  it('reports a moved date so the week and month it LEFT can be swept too', async () => {
    const invalidate = vi.fn()
    const draft = baselineDraft()
    draft.occurredOn = '2026-08-18'
    await commitReview(USER, payload(draft), { now, invalidate })

    expect(invalidate.mock.calls[0]![0]).toMatchObject({
      occurredOn: '2026-08-18',
      previousOccurredOn: '2026-08-20',
    })
  })

  it('never lets the client nominate its own baseline', async () => {
    // The payload carries only the edited draft. The `from` side comes from the row the server
    // just read — a client that could set it could rewrite the extractor's error profile.
    const draft = baselineDraft()
    draft.avgPaceSecPerKm = 448
    await commitReview(USER, payload(draft), { now })

    const [, , corrections] = queries.recordCorrections.mock.calls[0]!
    expect(corrections['avgPaceSecPerKm']![0]!.from).toBe(442) // from the extraction, not the client
  })
})

describe('the post-review edit (R-8)', () => {
  const RUN_ID = 'run123456789'

  beforeEach(() => {
    queries.getRunDetail.mockResolvedValue({
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
    })
  })

  it('updates rather than inserts — reviewed_at is written once and never again', async () => {
    const draft = baselineDraft()
    draft.splits[3]!.hrBpm = 174
    await commitReview(USER, payload(draft, RUN_ID), { now })

    expect(queries.commitExtractedRun).not.toHaveBeenCalled()
    expect(queries.applyRunCorrections).toHaveBeenCalledTimes(1)
    // `applyRunCorrections` sets corrected_at and touches no reviewed_at — asserted at the SQL
    // level in tests/db.queries.commitRun.test.ts.
    const [, runId, patch] = queries.applyRunCorrections.mock.calls[0]!
    expect(runId).toBe(RUN_ID)
    expect(patch).not.toHaveProperty('reviewedAt')
  })

  it('diffs against the STORED run, not the original extraction', async () => {
    const draft = baselineDraft()
    draft.splits[3]!.hrBpm = 174 // stored value is 173
    await commitReview(USER, payload(draft, RUN_ID), { now })

    const [, , corrections] = queries.recordCorrections.mock.calls[0]!
    expect(corrections['splits.3.hrBpm']![0]).toMatchObject({
      from: 173,
      to: 174,
      phase: 'post-review-edit',
    })
  })

  it('APPENDS to the existing log — the first correction is never lost (R-7)', async () => {
    queries.getExtraction.mockResolvedValue(
      extractionRow({
        corrections: {
          'splits.3.hrBpm': [
            {
              from: 999,
              to: 173,
              phase: 'review',
              correctedAt: '2026-08-20T09:14:41.000Z',
            },
          ],
        },
      }),
    )
    const draft = baselineDraft()
    draft.splits[3]!.hrBpm = 174
    await commitReview(USER, payload(draft, RUN_ID), { now })

    const [, , corrections] = queries.recordCorrections.mock.calls[0]!
    expect(corrections['splits.3.hrBpm']).toHaveLength(2)
    expect(corrections['splits.3.hrBpm']![0]!.phase).toBe('review')
    expect(corrections['splits.3.hrBpm']![1]!.phase).toBe('post-review-edit')
  })

  it('never rewrites the source: a hand-typed run stays hand-typed', async () => {
    const draft = baselineDraft()
    draft.note = 'humid'
    await commitReview(USER, payload(draft, RUN_ID), { now })
    expect(queries.applyRunCorrections.mock.calls[0]![2]).not.toHaveProperty('source')
  })

  it('replaces splits and zones wholesale, so a deleted row actually disappears', async () => {
    const draft = baselineDraft()
    draft.splits = draft.splits.slice(0, 10)
    await commitReview(USER, payload(draft, RUN_ID), { now })

    const [, , , splits, zones] = queries.applyRunCorrections.mock.calls[0]!
    expect(splits).toHaveLength(10)
    expect(zones).toHaveLength(5)
  })
})

describe('§8 — manual entry, when the reader failed outright', () => {
  beforeEach(() => {
    queries.getExtraction.mockResolvedValue(
      extractionRow({ status: 'failed', errorCode: 'validation', rawResponse: null }),
    )
  })

  it('stores source = manual', async () => {
    await commitReview(USER, payload(baselineDraft()), { now })
    expect(queries.commitExtractedRun.mock.calls[0]![1].source).toBe('manual')
  })

  it('KEEPS the link to the failed extraction — the failure is worth auditing', async () => {
    await commitReview(USER, payload(baselineDraft()), { now })
    expect(queries.commitExtractedRun.mock.calls[0]![1].extractionId).toBe(EXTRACTION_ID)
  })

  it('logs every entered field with phase "manual" and from: null', async () => {
    await commitReview(USER, payload(baselineDraft()), { now })
    const [, , corrections] = queries.recordCorrections.mock.calls[0]!

    expect(corrections['distanceKm']).toEqual([
      { from: null, to: 10.67, phase: 'manual', correctedAt: NOW.toISOString() },
    ])
    for (const events of Object.values(corrections) as Array<
      Array<{ phase: string; from: unknown }>
    >) {
      for (const event of events) {
        expect(event.phase).toBe('manual')
        expect(event.from).toBeNull()
      }
    }
  })

  it('reports phase "manual" to the invalidation contract too', async () => {
    const invalidate = vi.fn()
    await commitReview(USER, payload(baselineDraft()), { now, invalidate })
    expect(invalidate.mock.calls[0]![0].phase).toBe('manual')
  })
})

describe('failure modes', () => {
  it('turns the R-5 duplicate index into a sentence and a link, not a stack trace', async () => {
    queries.commitExtractedRun.mockRejectedValue(new DuplicateRunError('existingrun1'))
    const outcome = await commitReview(USER, payload(baselineDraft()), { now })

    expect(outcome).toEqual({
      ok: false,
      state: {
        status: 'duplicate',
        message: 'You have already logged a run on that date at that time.',
        existingRunId: 'existingrun1',
      },
    })
  })

  it('rejects an unparseable payload with per-field messages', async () => {
    const draft = baselineDraft()
    draft.durationSec = 0
    const outcome = await commitReview(USER, payload(draft), { now })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    if (outcome.state.status !== 'error') throw new Error('expected an error state')
    expect(outcome.state.fieldErrors).toHaveProperty('durationSec')
    expect(queries.commitExtractedRun).not.toHaveBeenCalled()
  })

  it('refuses to commit against an extraction that is not ours', async () => {
    queries.getExtraction.mockResolvedValue(null)
    const outcome = await commitReview(USER, payload(baselineDraft()), { now })

    expect(outcome).toEqual({
      ok: false,
      state: { status: 'error', message: 'That run could not be found.', fieldErrors: {} },
    })
    expect(queries.commitExtractedRun).not.toHaveBeenCalled()
  })

  it('does not commit an extraction twice — it answers with the run already made', async () => {
    queries.getRunIdForExtraction.mockResolvedValue('alreadyrun12')
    const outcome = await commitReview(USER, payload(baselineDraft()), { now })

    expect(outcome).toEqual({ ok: true, runId: 'alreadyrun12', newlyEarned: [] })
    expect(queries.commitExtractedRun).not.toHaveBeenCalled()
    expect(queries.recordCorrections).not.toHaveBeenCalled()
  })

  it('saves the run even when the corrections log write fails', async () => {
    // Losing analytics beats losing a human's confirmed save. The run is what matters.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    queries.recordCorrections.mockRejectedValue(new Error('neon is having a moment'))
    const draft = baselineDraft()
    draft.location = 'Serpong'

    const outcome = await commitReview(USER, payload(draft), { now })
    expect(outcome).toEqual({ ok: true, runId: 'run123456789', newlyEarned: [] })
    error.mockRestore()
  })

  it('§7.3 — a thrown onRunCommitted must NEVER undo a committed run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const invalidate = vi.fn().mockRejectedValue(new Error('F06 is not deployed'))

    const outcome = await commitReview(USER, payload(baselineDraft()), { now, invalidate })

    expect(outcome).toEqual({ ok: true, runId: 'run123456789', newlyEarned: [] })
    expect(queries.commitExtractedRun).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
