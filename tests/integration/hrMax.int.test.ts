import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * F02's HRmax resolver, against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled neon url> npm run test:int
 *
 * Skipped entirely without `TEST_DATABASE_URL`, so `npm test` never touches a database. Safe
 * against a shared database: every row hangs off two throwaway users whose ids carry a unique
 * suffix, and `afterAll` deletes those users, which cascades everything away.
 *
 * These are the assertions the recording fake cannot make. `resolveHrMax` is two queries whose
 * correctness depends on Postgres semantics the fake driver simply does not have — that
 * `max_hr > $1` drops NULL rows rather than comparing them, that `occurred_on` comes back as a
 * 'YYYY-MM-DD' string and not a Date, that `ORDER BY max_hr DESC LIMIT 1` really does surface the
 * highest of several qualifying observations, and that the whole chain is invisible across users.
 * Every %HRmax figure in the app rides on those four facts.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `hrmax-u1-${SUFFIX}`
const U2 = `hrmax-u2-${SUFFIX}`

/** The canonical fixture runner: 30 on 2026-08-20, so Tanaka gives 187. The watch recorded 189. */
const FIXTURE_NOW = new Date('2026-08-20T05:12:00+07:00')
const BIRTH_YEAR = 1996
const TANAKA = 187

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type Queries = typeof import('@/lib/db/queries')
type HrMaxModule = typeof import('@/lib/metrics/hrMax')

let db: Db
let s: Schema
let q: Queries
let hrMax: HrMaxModule

/** A minimal reviewed run. Only `max_hr` and `occurred_on` matter to this file. */
function runInput(occurredOn: string, startedAt: string, maxHr: number | null) {
  return {
    occurredOn,
    startedAt,
    endedAt: null,
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
    maxHr,
    restingHr: 72,
    intent: 'easy' as const,
    endHrBpm: null,
    hr1MinPostBpm: null,
    note: null,
    source: 'screenshot' as const,
    extractionId: null,
    splits: [],
    zones: [],
  }
}

describe.skipIf(!enabled)('resolveHrMax against a real database', () => {
  let fixtureRunId = ''

  beforeAll(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXTURE_NOW)

    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    q = await import('@/lib/db/queries')
    hrMax = await import('@/lib/metrics/hrMax')

    await db.insert(s.users).values([
      { id: U1, name: 'Fixture Runner', email: `${U1}@example.test` },
      { id: U2, name: 'Someone Else', email: `${U2}@example.test` },
    ])
  })

  afterAll(async () => {
    if (!enabled) return
    vi.useRealTimers()
    await db.delete(s.users).where(sql`${s.users.id} in (${U1}, ${U2})`)
  })

  it('returns null with no profile and no runs — never a fallback constant', async () => {
    expect(await hrMax.resolveHrMax(U1)).toBeNull()
  })

  it('falls to the Tanaka estimate once a birth year exists', async () => {
    await q.upsertProfile(U1, { birthYear: BIRTH_YEAR, onboardedAt: new Date() })
    expect(await hrMax.resolveHrMax(U1)).toEqual({ bpm: TANAKA, source: 'estimated' })
  })

  it('ignores a run whose max_hr is NULL — SQL drops it, it does not compare as 0', async () => {
    // The bug this catches: `max_hr > 0` with a NULL max_hr is NULL, not true. If the predicate
    // were ever written so a NULL slipped through, the resolver would return `{ bpm: null }` and
    // every %HRmax downstream would be NaN.
    await q.commitExtractedRun(U1, runInput('2026-08-10', '05:00:00', null))
    expect(await hrMax.resolveHrMax(U1)).toEqual({ bpm: TANAKA, source: 'estimated' })
  })

  it('ignores an observation BELOW the estimate — a low peak is not a new ceiling', async () => {
    await q.commitExtractedRun(U1, runInput('2026-08-12', '05:00:00', 180))
    expect(await hrMax.resolveHrMax(U1)).toEqual({ bpm: TANAKA, source: 'estimated' })
  })

  it('takes an observation that exceeds the estimate, and attributes it (R-3)', async () => {
    fixtureRunId = (await q.commitExtractedRun(U1, runInput('2026-08-20', '05:12:00', 189))).runId

    const resolved = await hrMax.resolveHrMax(U1)
    expect(resolved).toEqual({
      bpm: 189,
      source: 'observed',
      observedRunId: fixtureRunId,
      observedOn: '2026-08-20',
    })
    // occurred_on must come back as a plain 'YYYY-MM-DD' string (D6 — no timezone reasoning).
    expect(typeof resolved?.observedOn).toBe('string')
  })

  it('surfaces the HIGHEST of several qualifying observations, not the newest', async () => {
    await q.commitExtractedRun(U1, runInput('2026-08-22', '05:00:00', 191))
    expect(await hrMax.resolveHrMax(U1)).toMatchObject({ bpm: 191, source: 'observed' })
  })

  it('an unreviewed run cannot move the ceiling (D16)', async () => {
    // Written directly: commitExtractedRun cannot make a draft. The invariant exists precisely so
    // a future importer or manual-entry flow cannot leak a hallucinated 210 into the denominator.
    await db.insert(s.runs).values({
      id: `hrmax-draft-${SUFFIX.slice(0, 6)}`,
      userId: U1,
      occurredOn: '2026-08-23',
      startedAt: '05:00:00',
      durationSec: 1200,
      distanceM: 3000,
      avgPaceSec: 400,
      maxHr: 210,
      source: 'manual',
      reviewedAt: null,
    })
    expect(await hrMax.resolveHrMax(U1)).toMatchObject({ bpm: 191, source: 'observed' })
  })

  it('a measured max wins even when it is LOWER than the observation', async () => {
    await q.upsertProfile(U1, { maxHr: 172 })
    expect(await hrMax.resolveHrMax(U1)).toEqual({ bpm: 172, source: 'measured' })

    await q.upsertProfile(U1, { maxHr: null }) // put it back for the tests below
    expect(await hrMax.resolveHrMax(U1)).toMatchObject({ source: 'observed' })
  })

  it('resolveHrMaxAsOf sees only what had happened by the cutoff', async () => {
    expect(await hrMax.resolveHrMaxAsOf(U1, '2026-08-19')).toEqual({
      bpm: TANAKA,
      source: 'estimated',
    })
    expect(await hrMax.resolveHrMaxAsOf(U1, '2026-08-20')).toMatchObject({
      bpm: 189,
      source: 'observed',
    })
    expect(await hrMax.resolveHrMaxAsOf(U1, '2026-08-22')).toMatchObject({ bpm: 191 })
  })

  it('hrMaxTransitionAt fires exactly once — on the run that first overtook the estimate', async () => {
    const transition = await hrMax.hrMaxTransitionAt(U1, fixtureRunId)
    expect(transition).toEqual({
      from: { bpm: TANAKA, source: 'estimated' },
      to: {
        bpm: 189,
        source: 'observed',
        observedRunId: fixtureRunId,
        observedOn: '2026-08-20',
      },
    })
  })

  it('hrMaxTransitionAt stays quiet on a run that changed nothing', async () => {
    const before = await q.getPreviousReviewedRun(U1, '2026-08-12')
    expect(before?.occurredOn).toBe('2026-08-10')
    // 2026-08-12's max of 180 is below the 187 estimate, so nothing moved.
    const runs = await q.listRuns(U1)
    const quietRun = runs.find((r) => r.occurredOn === '2026-08-12')
    expect(await hrMax.hrMaxTransitionAt(U1, quietRun!.id)).toBeNull()
  })

  it('hrMaxTransitionAt returns null on the runner’s first run', async () => {
    const runs = await q.listRuns(U1)
    const first = runs.find((r) => r.occurredOn === '2026-08-10')
    expect(await hrMax.hrMaxTransitionAt(U1, first!.id)).toBeNull()
  })

  it('is invisible across users — U2 sees none of U1’s ceiling (D8)', async () => {
    expect(await hrMax.resolveHrMax(U2)).toBeNull()
    expect(await hrMax.hrMaxTransitionAt(U2, fixtureRunId)).toBeNull()
    expect(await q.getObservedMaxHrRun(U2)).toBeNull()
    expect(await q.getRun(U2, fixtureRunId)).toBeNull()
  })
})
