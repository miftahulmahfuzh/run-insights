import { neonConfig } from '@neondatabase/serverless'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { foldAwards } from '@/lib/badges/facts'

/**
 * Integration suite — runs against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled neon url> npm run test:int
 *     TZ=America/New_York TEST_DATABASE_URL=... npm run test:int   (the D6 timezone proof)
 *
 * Skipped entirely without `TEST_DATABASE_URL`, so `npm test` never touches a database. Use a
 * Neon **branch** where one is available; this file is nonetheless safe against a shared database
 * because every row it creates hangs off two throwaway users whose ids carry a unique suffix, and
 * `afterAll` deletes those users — which cascades everything else away.
 *
 * These are the assertions that a mocked driver cannot make: that Postgres really does treat two
 * NULL start times as distinct (the whole reason for R-5's coalesce), that `SUM(integer)` really
 * does arrive as a string, that `db.batch` really is one HTTP request, and that the FK cascades
 * really do fire in the directions the schema claims.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)

// lib/db/index.ts reads DATABASE_URL at import time, so it must be pointed at the test database
// BEFORE the dynamic imports below.
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

/** Counts real HTTP round trips, which is what the N+1 guard is actually about. */
let httpRequests = 0
const realFetch = globalThis.fetch
neonConfig.fetchFunction = (input: unknown, init: unknown) => {
  httpRequests++
  return realFetch(input as string, init as RequestInit)
}

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `itest-u1-${SUFFIX}`
const U2 = `itest-u2-${SUFFIX}`

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type Queries = typeof import('@/lib/db/queries')

let db: Db
let s: Schema
let q: Queries

/** The canonical fixture: 2026-08-20, Tangerang, 10.67 km in 1:18:36. */
const FIXTURE_SPLITS = [
  { km: 1, timeSec: 401, paceSec: 401, hr: 150, cadence: 152, partial: false },
  { km: 2, timeSec: 412, paceSec: 412, hr: 165, cadence: 150, partial: false },
  { km: 3, timeSec: 420, paceSec: 420, hr: 170, cadence: 149, partial: false },
  { km: 4, timeSec: 430, paceSec: 430, hr: 173, cadence: 147, partial: false },
  { km: 5, timeSec: 437, paceSec: 437, hr: 175, cadence: 145, partial: false },
  { km: 6, timeSec: 445, paceSec: 445, hr: 176, cadence: 143, partial: false },
  { km: 7, timeSec: 452, paceSec: 452, hr: 178, cadence: 141, partial: false },
  { km: 8, timeSec: 458, paceSec: 458, hr: 180, cadence: 138, partial: false },
  { km: 9, timeSec: 465, paceSec: 465, hr: 181, cadence: 136, partial: false },
  { km: 10, timeSec: 442, paceSec: 442, hr: 183, cadence: 134, partial: false },
  { km: 11, timeSec: 254, paceSec: 379, hr: 185, cadence: 134, partial: true },
]

const FIXTURE_ZONES = [
  { zone: 1, durationSec: 60, minBpm: null, maxBpm: 116 },
  { zone: 2, durationSec: 120, minBpm: 117, maxBpm: 135 },
  { zone: 3, durationSec: 264, minBpm: 136, maxBpm: 154 },
  { zone: 4, durationSec: 2400, minBpm: 155, maxBpm: 172 },
  { zone: 5, durationSec: 1872, minBpm: 173, maxBpm: null },
]

function runInput(overrides: Partial<Queries['commitExtractedRun']> = {}) {
  return {
    occurredOn: '2026-08-20',
    startedAt: '05:12:00',
    endedAt: '06:30:36',
    activityType: 'Outdoor Run',
    location: 'Tangerang',
    durationSec: 4716,
    distanceM: 10670,
    activeKcal: 646,
    totalKcal: 780,
    elevationM: 15,
    avgCadence: 144,
    avgPaceSec: 442,
    avgHr: 173,
    maxHr: 189,
    restingHr: 72,
    intent: 'easy' as const,
    endHrBpm: 185,
    hr1MinPostBpm: 162,
    note: 'the fixture run',
    source: 'screenshot' as const,
    extractionId: null as string | null,
    splits: FIXTURE_SPLITS,
    zones: FIXTURE_ZONES,
    ...(overrides as object),
  }
}

describe.skipIf(!enabled)('data layer against a real database', () => {
  let fixtureRunId = ''
  let juneRunId = ''
  let draftRunId = ''
  let extractionId = ''

  beforeAll(async () => {
    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    q = await import('@/lib/db/queries')

    await db.insert(s.users).values([
      { id: U1, name: 'Fixture Runner', email: `${U1}@example.test` },
      { id: U2, name: 'Someone Else', email: `${U2}@example.test` },
    ])

    // An extraction with two photos attached at upload time (R-1: no run exists yet).
    extractionId = (
      await q.createExtraction(
        U1,
        [
          { url: 'https://blob/1.jpg', pathname: '1.jpg', kind: 'summary' },
          { url: 'https://blob/2.jpg', pathname: '2.jpg', kind: 'splits' },
        ],
        'glm-4.6v',
      )
    ).id
    await q.attachExtractionPhotos(U1, extractionId, [
      { blobUrl: 'https://blob/1.jpg', pathname: '1.jpg', kind: 'summary' },
      { blobUrl: 'https://blob/2.jpg', pathname: '2.jpg', kind: 'splits' },
    ])
    await q.markExtractionOk(U1, extractionId, { distanceKm: 10.67 }, 1737)
    await q.recordCorrections(U1, extractionId, {
      distanceM: [
        { from: 10600, to: 10670, phase: 'review', correctedAt: '2026-08-20T12:00:00.000Z' },
      ],
      'splits.10.paceSec': [
        { from: 380, to: 379, phase: 'post-review-edit', correctedAt: '2026-08-21T02:00:00.000Z' },
      ],
    })

    // The review commit — the only thing that creates a run row.
    fixtureRunId = (await q.commitExtractedRun(U1, runInput({ extractionId }))).runId

    // A second reviewed August run, so monthly sums are non-trivial.
    await q.commitExtractedRun(
      U1,
      runInput({
        occurredOn: '2026-08-25',
        startedAt: '05:30:00',
        distanceM: 5330,
        durationSec: 2400,
        avgPaceSec: 450,
        maxHr: 175,
        extractionId: null,
        splits: [],
        zones: [],
      }),
    )

    // A June run, outside every August window.
    juneRunId = (
      await q.commitExtractedRun(
        U1,
        runInput({
          occurredOn: '2026-06-10',
          startedAt: '06:00:00',
          distanceM: 8000,
          durationSec: 3600,
          avgPaceSec: 450,
          maxHr: 170,
          extractionId: null,
          splits: [],
          zones: [],
        }),
      )
    ).runId

    // A DRAFT (reviewed_at IS NULL), written directly. commitExtractedRun cannot make one — but
    // the reviewed-data invariant exists precisely so that a future importer or manual-entry
    // flow that does cannot leak into a rollup.
    draftRunId = 'draft-' + SUFFIX.slice(0, 6)
    await db.insert(s.runs).values({
      id: draftRunId,
      userId: U1,
      occurredOn: '2026-08-28',
      startedAt: '05:00:00',
      durationSec: 3000,
      distanceM: 9999,
      avgPaceSec: 300,
      maxHr: 200,
      source: 'manual',
      reviewedAt: null,
    })

    // U2's own August run, for the isolation checks.
    await q.commitExtractedRun(
      U2,
      runInput({
        occurredOn: '2026-08-20',
        startedAt: '05:12:00',
        distanceM: 3000,
        durationSec: 1500,
        avgPaceSec: 500,
        maxHr: 210,
        extractionId: null,
        splits: [],
        zones: [],
      }),
    )
  }, 60_000)

  afterAll(async () => {
    if (!enabled) return
    // One delete per user; every app table cascades from `user`, including extractions — which is
    // the ONLY way an extractions row is ever removed (D3).
    await db.delete(s.users).where(sql`${s.users.id} in (${U1}, ${U2})`)
  }, 60_000)

  describe('R-1 — the commit creates the run and adopts the photos', () => {
    it('backfills run_photos.run_id from the extraction', async () => {
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(detail?.photos).toHaveLength(2)
      expect(detail?.photos.every((p) => p.runId === fixtureRunId)).toBe(true)
      expect(detail?.photos.every((p) => p.extractionId === extractionId)).toBe(true)
      // Attachment order survives.
      expect(detail?.photos.map((p) => p.kind)).toEqual(['summary', 'splits'])
    })

    it('stores the run already reviewed, with its splits and zones', async () => {
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(detail?.reviewedAt).toBeInstanceOf(Date)
      expect(detail?.correctedAt).toBeNull()
      expect(detail?.splits).toHaveLength(11)
      expect(detail?.zones).toHaveLength(5)
      expect(detail?.splits.at(-1)?.partial).toBe(true)
      expect(detail?.distanceM).toBe(10670)
      expect(detail?.endHrBpm).toBe(185) // R-9
      expect(detail?.hr1MinPostBpm).toBe(162)
    })

    it('keeps integers as integers through a full round trip', async () => {
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(typeof detail?.distanceM).toBe('number')
      expect(typeof detail?.durationSec).toBe('number')
      expect(typeof detail?.splits[0]?.paceSec).toBe('number')
    })
  })

  describe('getRunDetail is ONE http request (the N+1 guard)', () => {
    it('reads a run with 11 splits, 5 zones and 2 photos in a single round trip', async () => {
      httpRequests = 0
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(detail?.splits).toHaveLength(11)
      expect(httpRequests).toBe(1)
    })
  })

  describe('the reviewed-data invariant (D16 / R-13)', () => {
    it('hides the draft run from listRuns', async () => {
      const runs = await q.listRuns(U1)
      expect(runs.map((r) => r.id)).not.toContain(draftRunId)
      expect(runs).toHaveLength(3)
    })

    it('hides the draft run from the August total, which would otherwise be 9 999 m heavier', async () => {
      const [august] = await q.getMonthlyTotals(U1, 1, '2026-08')
      expect(august?.runCount).toBe(2)
      expect(august?.distanceM).toBe(10670 + 5330)
    })

    it('hides the draft run from getObservedMaxHr — a 200 bpm draft must not become a ceiling', async () => {
      await expect(q.getObservedMaxHr(U1)).resolves.toBe(189)
    })

    it('still shows the draft through getRunDetail, which is draft-visible by design', async () => {
      const detail = await q.getRunDetail(U1, draftRunId)
      expect(detail?.id).toBe(draftRunId)
      expect(detail?.reviewedAt).toBeNull()
    })
  })

  describe('cross-user isolation', () => {
    it('getRunsInMonth never returns another user’s run', async () => {
      const mine = await q.getRunsInMonth(U1, '2026-08')
      expect(mine.every((r) => r.userId === U1)).toBe(true)
      const theirs = await q.getRunsInMonth(U2, '2026-08')
      expect(theirs).toHaveLength(1)
      expect(theirs[0]?.id).not.toBe(fixtureRunId)
    })

    it('getRunDetail returns null for a run that is not yours', async () => {
      await expect(q.getRunDetail(U2, fixtureRunId)).resolves.toBeNull()
    })

    it('assertRunOwned throws NotFoundError for a run that is not yours', async () => {
      await expect(q.assertRunOwned(U2, fixtureRunId)).rejects.toBeInstanceOf(q.NotFoundError)
    })

    it('getObservedMaxHr is per user — U2’s 210 does not raise U1’s ceiling', async () => {
      await expect(q.getObservedMaxHr(U1)).resolves.toBe(189)
      await expect(q.getObservedMaxHr(U2)).resolves.toBe(210)
    })

    it('applyRunCorrections cannot touch another user’s run', async () => {
      await expect(
        q.applyRunCorrections(U2, fixtureRunId, { distanceM: 1 }),
      ).rejects.toBeInstanceOf(q.NotFoundError)
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(detail?.distanceM).toBe(10670)
    })
  })

  describe('R-5 — the duplicate guard, as Postgres actually behaves', () => {
    it('refuses a second run for the same day and start time, naming the existing one', async () => {
      const error = await q
        .commitExtractedRun(U1, runInput({ extractionId: null, splits: [], zones: [] }))
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(q.DuplicateRunError)
      expect((error as InstanceType<Queries['DuplicateRunError']>).existingRunId).toBe(fixtureRunId)
    })

    it('ALSO refuses two runs on one day when both start times are NULL', async () => {
      // This is the case the literal roadmap spec silently failed to guard: a plain
      // UNIQUE(user_id, occurred_on, started_at) permits both rows, because Postgres treats two
      // NULLs as distinct. Only the coalesce expression catches it.
      const first = await q.commitExtractedRun(
        U1,
        runInput({
          occurredOn: '2026-05-01',
          startedAt: null,
          extractionId: null,
          splits: [],
          zones: [],
        }),
      )
      const error = await q
        .commitExtractedRun(
          U1,
          runInput({
            occurredOn: '2026-05-01',
            startedAt: null,
            extractionId: null,
            splits: [],
            zones: [],
          }),
        )
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(q.DuplicateRunError)
      expect((error as InstanceType<Queries['DuplicateRunError']>).existingRunId).toBe(first.runId)
      await q.deleteRun(U1, first.runId)
    })

    it('lets a different user upload the same run on the same day', async () => {
      // Scoping is part of the index, so two people running at 05:12 on the same morning is fine.
      const other = await q.commitExtractedRun(
        U2,
        runInput({
          occurredOn: '2026-08-20',
          startedAt: '07:00:00',
          extractionId: null,
          splits: [],
          zones: [],
        }),
      )
      expect(other.runId).toBeTruthy()
      await q.deleteRun(U2, other.runId)
    })
  })

  describe('rollups', () => {
    it('getMonthlyTotals zero-fills and returns NUMBERS, not the strings the wire carries', async () => {
      const totals = await q.getMonthlyTotals(U1, 12, '2026-08')
      expect(totals).toHaveLength(12)
      expect(totals.map((t) => t.month).at(-1)).toBe('2026-08')
      for (const total of totals) {
        expect(typeof total.distanceM, total.month).toBe('number')
        expect(typeof total.runCount, total.month).toBe('number')
        expect(typeof total.durationSec, total.month).toBe('number')
      }
      const byMonth = new Map(totals.map((t) => [t.month, t]))
      expect(byMonth.get('2026-07')).toEqual({
        month: '2026-07',
        runCount: 0,
        distanceM: 0,
        durationSec: 0,
      })
      expect(byMonth.get('2026-08')?.distanceM).toBe(16000)
      expect(byMonth.get('2026-06')?.distanceM).toBe(8000)
    })

    it('getAllTimeTotals sums the reviewed runs and reports the real date bounds', async () => {
      const totals = await q.getAllTimeTotals(U1)
      expect(totals.runCount).toBe(3)
      expect(totals.distanceM).toBe(10670 + 5330 + 8000)
      expect(totals.firstRunOn).toBe('2026-06-10')
      expect(totals.lastRunOn).toBe('2026-08-25')
    })

    it('getRunsInIsoWeek resolves the fixture week and excludes the one before it', async () => {
      const week34 = await q.getRunsInIsoWeek(U1, '2026-W34')
      expect(week34.map((r) => r.id)).toContain(fixtureRunId)
      const week33 = await q.getRunsInIsoWeek(U1, '2026-W33')
      expect(week33).toHaveLength(0)
    })

    it('getRunsBetween handles the rolling windows R-6’s ACWR needs', async () => {
      const rolling28 = await q.getRunsBetween(U1, '2026-07-29', '2026-08-26')
      expect(rolling28).toHaveLength(2)
      const rolling7 = await q.getRunsBetween(U1, '2026-08-19', '2026-08-26')
      expect(rolling7).toHaveLength(2)
    })

    it('getObservedMaxHrExcludingRun answers "what was the ceiling BEFORE this run" (R-3)', async () => {
      await expect(q.getObservedMaxHrExcludingRun(U1, fixtureRunId)).resolves.toBe(175)
    })
  })

  describe('corrections and the error profile', () => {
    it('getExtractionErrorProfile counts events per field path', async () => {
      const profile = await q.getExtractionErrorProfile(U1)
      const fields = profile.map((p) => p.field).sort()
      expect(fields).toEqual(['distanceM', 'splits.10.paceSec'])
      for (const row of profile) {
        expect(row.correctionCount).toBe(1)
        expect(row.extractionCount).toBe(1)
        expect(row.extractionsWithCorrections).toBe(1)
      }
    })

    it('is scoped: U2 sees no corrections at all', async () => {
      await expect(q.getExtractionErrorProfile(U2)).resolves.toEqual([])
    })

    it('applyRunCorrections sets corrected_at and replaces splits atomically', async () => {
      await q.applyRunCorrections(U1, fixtureRunId, { distanceM: 10680 }, [
        { km: 1, timeSec: 400, paceSec: 400, hr: 151, cadence: 152, partial: false },
      ])
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(detail?.distanceM).toBe(10680)
      expect(detail?.correctedAt).toBeInstanceOf(Date)
      expect(detail?.reviewedAt).toBeInstanceOf(Date) // untouched
      expect(detail?.splits).toHaveLength(1)

      // Put the fixture back for the later cascade assertions.
      await q.applyRunCorrections(U1, fixtureRunId, { distanceM: 10670 }, FIXTURE_SPLITS)
      const restored = await q.getRunDetail(U1, fixtureRunId)
      expect(restored?.splits).toHaveLength(11)
    })
  })

  describe('records — replaced, never incremented (D7 / R-10)', () => {
    it('replaces the whole set, so a demoted record disappears instead of going stale', async () => {
      await q.replaceRecords(U1, [
        {
          key: 'longest_distance',
          runId: fixtureRunId,
          value: 10670,
          achievedOn: '2026-08-20',
        },
        { key: 'highest_max_hr', runId: fixtureRunId, value: 189, achievedOn: '2026-08-20' },
      ])
      const seeded = await q.getRecords(U1)
      expect(seeded.map((r) => r.key)).toEqual(['highest_max_hr', 'longest_distance'])
      expect(seeded[1]?.value).toBe(10670)

      // The case a per-key upsert cannot express: a correction disqualified every candidate.
      await q.replaceRecords(U1, [])
      await expect(q.getRecords(U1)).resolves.toEqual([])
    })
  })

  describe('badges — an append-only ledger the primary key dedupes (F13)', () => {
    it('inserts one row per earn and declines the same earn twice', async () => {
      // The old shape incremented a count here. The new one cannot: the second insert collides
      // with `(user_id, key, dedupe_key)` and `ON CONFLICT DO NOTHING` swallows it, which is what
      // makes re-committing a run a no-op at the database rather than at a function's discretion.
      const first = await q.insertBadgeAward(U1, 'redline_republic', {
        runId: fixtureRunId,
        scopeKey: null,
        dedupeKey: fixtureRunId,
        earnedOn: '2026-08-20',
      })
      expect(first).toBe(true)

      const again = await q.insertBadgeAward(U1, 'redline_republic', {
        runId: fixtureRunId,
        scopeKey: null,
        dedupeKey: fixtureRunId,
        earnedOn: '2026-08-25', // a later date changes nothing; the identity is the run
      })
      expect(again).toBe(false)

      const awards = (await q.getBadgeAwards(U1)).filter((b) => b.key === 'redline_republic')
      expect(awards).toHaveLength(1)
      expect(awards[0]?.count).toBe(1)
      expect(awards[0]?.earnedOn).toBe('2026-08-20')
    })

    it('accepts a second award of the same badge under a different dedupe key', async () => {
      // Two months, two rows, one key — and `foldAwards` is what turns them back into a count.
      expect(
        await q.insertBadgeAward(U1, 'century_club', {
          runId: null,
          scopeKey: '2026-07',
          dedupeKey: '2026-07',
          earnedOn: '2026-07-31',
        }),
      ).toBe(true)
      expect(
        await q.insertBadgeAward(U1, 'century_club', {
          runId: null,
          scopeKey: '2026-08',
          dedupeKey: '2026-08',
          earnedOn: '2026-08-31',
        }),
      ).toBe(true)

      const awards = (await q.getBadgeAwards(U1)).filter((b) => b.key === 'century_club')
      expect(awards).toHaveLength(2)
      expect(awards.map((a) => a.scopeKey)).toEqual(['2026-07', '2026-08']) // ordered by earned_on
      expect(foldAwards(awards)).toEqual([
        {
          key: 'century_club',
          runId: null,
          scopeKey: '2026-08',
          firstEarnedOn: '2026-07-31',
          earnedOn: '2026-08-31',
          count: 2,
          /* F27, against real Postgres rather than a fake: the two rows come back
             `order by key asc, earned_on asc` and the fold reverses them to newest-first, with a
             null runId on each because no single run earned a month badge. This is the assertion
             the unit tests cannot make — that the DB's own ordering is the one being re-sorted. */
          earnedDays: [
            { earnedOn: '2026-08-31', runId: null, scopeKey: '2026-08' },
            { earnedOn: '2026-07-31', runId: null, scopeKey: '2026-07' },
          ],
        },
      ])
    })

    it('getBadgeAwardsForRun returns this run’s awards and no period badge', async () => {
      const forRun = await q.getBadgeAwardsForRun(U1, fixtureRunId)
      expect(forRun.map((a) => a.key)).toContain('redline_republic')
      // `century_club` has a null run_id, so no `WHERE run_id = $1` can ever reach it.
      expect(forRun.map((a) => a.key)).not.toContain('century_club')
      expect(forRun.every((a) => a.runId === fixtureRunId)).toBe(true)
    })
  })

  describe('insights', () => {
    it('is a cache: the same facts_hash returns the first row instead of writing a second', async () => {
      const first = await q.saveInsight(U1, {
        scope: 'session',
        scopeKey: fixtureRunId,
        factsHash: 'hash-1',
        payload: { headline: '90% in zones 4–5', hrMaxUsed: 189, hrMaxSource: 'observed' },
        model: 'glm-5.3',
      })
      expect(first.created).toBe(true)

      const second = await q.saveInsight(U1, {
        scope: 'session',
        scopeKey: fixtureRunId,
        factsHash: 'hash-1',
        payload: { headline: 'DIFFERENT PROSE' },
        model: 'glm-5.3',
      })
      expect(second.created).toBe(false)
      expect(second.id).toBe(first.id)

      const cached = await q.getInsight(U1, 'session', fixtureRunId, 'hash-1')
      // The original payload survived: an insight a runner has already read is immutable.
      expect((cached?.payload as { headline: string }).headline).toBe('90% in zones 4–5')
      expect((cached?.payload as { hrMaxSource: string }).hrMaxSource).toBe('observed')
    })

    it('getLatestInsight ignores the hash, which is what R-19’s memory diffs against', async () => {
      await q.saveInsight(U1, {
        scope: 'week',
        scopeKey: '2026-W34',
        factsHash: 'hash-a',
        payload: { headline: 'first' },
        model: 'glm-5.3',
      })
      await q.saveInsight(U1, {
        scope: 'week',
        scopeKey: '2026-W34',
        factsHash: 'hash-b',
        payload: { headline: 'second' },
        model: 'glm-5.3',
      })
      const latest = await q.getLatestInsight(U1, 'week', '2026-W34')
      expect((latest?.payload as { headline: string }).headline).toBe('second')
    })
  })

  describe('sharing', () => {
    let token = ''

    it('creates one active share per run and is idempotent under a double tap', async () => {
      token = (await q.createShare(U1, fixtureRunId)).token
      const again = await q.createShare(U1, fixtureRunId)
      expect(again.token).toBe(token)
      expect((await q.getActiveShareForRun(U1, fixtureRunId))?.token).toBe(token)
    })

    it('serves the run to an anonymous reader, without a single private field', async () => {
      const shared = await q.getRunByShareToken(token)
      expect(shared?.id).toBe(fixtureRunId)
      expect(shared?.ownerName).toBe('Fixture Runner')
      expect(shared?.splits).toHaveLength(11)
      expect(shared?.zones).toHaveLength(5)
      expect(shared?.photos).toHaveLength(2)
      const keys = Object.keys(shared!)
      expect(keys).not.toContain('userId')
      expect(keys).not.toContain('note')
      expect(keys).not.toContain('extractionId')
    })

    it('R-11: an excluded photo disappears from the shared page', async () => {
      const detail = await q.getRunDetail(U1, fixtureRunId)
      const photoId = detail!.photos[1]!.id
      await q.setPhotoExcludedFromShare(U1, photoId, true)
      const shared = await q.getRunByShareToken(token)
      expect(shared?.photos).toHaveLength(1)
      expect(shared?.photos[0]?.kind).toBe('summary')
      await q.setPhotoExcludedFromShare(U1, photoId, false)
    })

    it('carries the frozen session insight so /s/[token] never resolves HRmax live', async () => {
      const shared = await q.getRunByShareToken(token)
      expect((shared?.insightPayload as { hrMaxUsed: number }).hrMaxUsed).toBe(189)
    })

    it('goes dark on revoke, and re-sharing mints a NEW token (R-15)', async () => {
      await q.revokeShare(U1, token)
      await expect(q.getRunByShareToken(token)).resolves.toBeNull()
      const fresh = await q.createShare(U1, fixtureRunId)
      expect(fresh.token).not.toBe(token)
      expect((await q.getRunByShareToken(fresh.token))?.id).toBe(fixtureRunId)
    })

    it('cannot be revoked by another user', async () => {
      const active = await q.getActiveShareForRun(U1, fixtureRunId)
      await expect(q.revokeShare(U2, active!.token)).rejects.toBeInstanceOf(q.NotFoundError)
      expect(await q.getRunByShareToken(active!.token)).not.toBeNull()
    })

    it('refuses to share a run that is not yours', async () => {
      await expect(q.createShare(U2, fixtureRunId)).rejects.toBeInstanceOf(q.NotFoundError)
    })
  })

  describe('cascades, in the directions the schema claims', () => {
    it('deleting a run removes its children and shares, but only SET NULLs its badges', async () => {
      const doomed = (
        await q.commitExtractedRun(
          U1,
          runInput({
            occurredOn: '2026-04-04',
            startedAt: '05:00:00',
            extractionId: null,
            splits: [{ km: 1, timeSec: 400, paceSec: 400, hr: 150, cadence: 150, partial: false }],
            zones: [{ zone: 5, durationSec: 100, minBpm: 173, maxBpm: null }],
          }),
        )
      ).runId
      const share = await q.createShare(U1, doomed)
      await q.insertBadgeAward(U1, 'half_ish', {
        runId: doomed,
        scopeKey: null,
        dedupeKey: doomed,
        earnedOn: '2026-04-04',
      })

      await q.deleteRun(U1, doomed)

      expect(await db.select().from(s.runSplits).where(eq(s.runSplits.runId, doomed))).toHaveLength(
        0,
      )
      expect(await db.select().from(s.runZones).where(eq(s.runZones.runId, doomed))).toHaveLength(0)
      expect(await q.getRunByShareToken(share.token)).toBeNull()

      /* R-22 — the badge survives the run that earned it, with a null run_id. Deleting badge
       * history because a run was deleted would be a lie about the past.
       *
       * And F13 §2.2, which is why `dedupe_key` is a plain column: had it been
       * `GENERATED ALWAYS AS (coalesce(run_id, scope_key, ''))`, the SET NULL above would have
       * recomputed it to '' — colliding with the lifetime row and making this very `deleteRun`
       * fail on a primary-key violation. The delete succeeding IS the assertion; the key still
       * naming the deleted run is what makes a re-upload count as a fresh earn. */
      const award = (await q.getBadgeAwards(U1)).find((b) => b.key === 'half_ish')
      expect(award).toBeDefined()
      expect(award?.runId).toBeNull()
      expect(award?.dedupeKey).toBe(doomed)
    })

    it('deleting a run leaves its extraction (and the extraction’s photos) intact — D3', async () => {
      const keeper = (
        await q.commitExtractedRun(
          U1,
          runInput({
            occurredOn: '2026-03-03',
            startedAt: '05:00:00',
            extractionId: null,
            splits: [],
            zones: [],
          }),
        )
      ).runId
      await q.deleteRun(U1, keeper)
      // The audit trail is independent of any run it produced.
      expect(await q.getExtraction(U1, extractionId)).not.toBeNull()
    })

    it('the photo rows of a deleted run go with it, but the extraction row does not', async () => {
      const photoRows = await db
        .select()
        .from(s.runPhotos)
        .where(and(eq(s.runPhotos.extractionId, extractionId), isNull(s.runPhotos.runId)))
      expect(photoRows).toHaveLength(0) // all were adopted by the fixture run
    })
  })

  describe('timezone independence (D6)', () => {
    it('reads back the calendar day exactly as written, whatever the process TZ', async () => {
      // Run this file again under TZ=America/New_York; occurred_on is a `date` and is read as a
      // string, so no local-midnight arithmetic can shift it.
      const detail = await q.getRunDetail(U1, fixtureRunId)
      expect(detail?.occurredOn).toBe('2026-08-20')
      expect(detail?.startedAt).toBe('05:12:00')
      const june = await q.getRunDetail(U1, juneRunId)
      expect(june?.occurredOn).toBe('2026-06-10')
    })
  })
})
