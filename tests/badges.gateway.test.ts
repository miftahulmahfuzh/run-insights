import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installFakeDb,
  projectedRow,
  tableRow,
  uninstallFakeDb,
  type FakeDb,
} from './support/fakeDb'
import { canonicalSession } from './fixtures/canonicalRun'

/**
 * The database-facing half of F09, against the recording fake driver — real generated SQL, real
 * parameter binding, no network.
 *
 * The property worth this much setup is the one at the top of `gateway.ts`: **`getRunDetail` is
 * draft-visible, so the reviewed-data invariant has to be asserted here rather than assumed.** Every
 * other guard in this feature is a type; this one is an `if`, and an `if` needs a test.
 */

type Gateway = typeof import('@/lib/badges/gateway')
type Schema = typeof import('@/lib/db/schema')

let fake: FakeDb
let gateway: Gateway
let schema: Schema

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  schema = await import('@/lib/db/schema')
  gateway = await import('@/lib/badges/gateway')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

const RUN = 'run_canonical'

/** The fixture's run row, as `getRunDetail`'s first statement returns it. */
function runRow(overrides: Record<string, unknown> = {}) {
  return tableRow(schema.runs, {
    id: RUN,
    userId: 'u1',
    occurredOn: '2026-08-20',
    startedAt: '07:07:00',
    location: 'Tangerang',
    durationSec: 4716,
    distanceM: 10_670,
    activeKcal: 646,
    avgPaceSec: 442,
    avgHr: 173,
    maxHr: 189,
    endHrBpm: 185,
    hr1MinPostBpm: 162,
    reviewedAt: '2026-08-20 05:12:00+00',
    ...overrides,
  })
}

const splitRows = () =>
  canonicalSession.splits.map((s) =>
    tableRow(schema.runSplits, {
      runId: RUN,
      km: s.km,
      timeSec: s.timeSec,
      paceSec: s.paceSec,
      hr: s.hr,
      cadence: s.cadence,
      partial: s.partial,
    }),
  )

const zoneRows = () =>
  canonicalSession.zones.map((z) =>
    tableRow(schema.runZones, {
      runId: RUN,
      zone: z.zone,
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    }),
  )

/**
 * Every result set one `loadCommitFacts` call consumes, in the order the statements are issued:
 * the four-statement `getRunDetail` batch, then the period reads, the window, and the location
 * existence check.
 */
function enqueueCommitReads(options: { location?: unknown[][]; dawnCount?: string } = {}) {
  fake.enqueue(
    [runRow()], // getRunDetail — run
    splitRows(), // getRunDetail — splits
    zoneRows(), // getRunDetail — zones
    [], // getRunDetail — photos
    [runRow()], // getRunsBetween — the 26-week window
    [runRow()], // getRunsInMonth
    [[options.dawnCount ?? '0']], // countReviewedRunsStartedBefore
    [projectedRow(RUN, '2026-08-20', '07:07:00', 10_670, 4716, 173, 442)], // the trailing window
    options.location ?? [], // hasOtherReviewedRunAtLocation
    splitRows(), // the window's splits
  )
}

describe('dbBadgeGateway.loadCommitFacts', () => {
  it('refuses a run whose reviewed_at is null — D16, as an early return', async () => {
    // `getRunDetail` has no `reviewed_at` predicate by design: `/r/[id]` must render a run whatever
    // its review state. So this is the only thing standing between an unconfirmed number and a
    // badge, and `evaluateBadgesForCommit` turns the null into "evaluate nothing, write nothing".
    fake.enqueue([runRow({ reviewedAt: null })], [], [], [])
    expect(await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN)).toBeNull()
    // And it stopped there: no period reads, no window, no location probe.
    expect(fake.queries).toHaveLength(4)
  })

  it('returns null for a run that does not exist, or is not this user’s', async () => {
    fake.enqueue([], [], [], [])
    expect(await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN)).toBeNull()
  })

  it('builds the fixture’s session context, with F06 computing every metric', async () => {
    enqueueCommitReads()
    const facts = (await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN))!

    expect(facts.session.run).toEqual({
      runId: RUN,
      occurredOn: '2026-08-20',
      startedAt: '07:07:00',
      distanceM: 10_670,
      activeKcal: 646,
    })
    // The three figures the badge rules read, straight from `computeSessionMetrics`.
    expect(facts.session.metrics.cadenceFadeSpm).toBe(-18)
    expect(facts.session.metrics.splitDriftSecPerKm).toBeCloseTo(40.8, 1)
    expect(facts.session.metrics.zonePct.find((z) => z.zone === 5)!.pct).toBeCloseTo(43.5, 1)
    // No HRmax was resolved, and nothing needed one.
    expect(facts.session.metrics.hrMaxUsed).toBeNull()
    expect(facts.session.metrics.avgHrPctMax).toBeNull()
  })

  it('reads the trailing window with its own decoupling, and asks for one more than the rule needs', async () => {
    enqueueCommitReads()
    const facts = (await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN))!

    expect(facts.session.window).toEqual([
      { runId: RUN, distanceM: 10_670, avgPaceSec: 442, decouplingPct: expect.closeTo(12.35, 2) },
    ])
    // windowRuns + 1 = 4: the extra row is what lets `windowEdgeFires` see whether the window
    // ending one run earlier already qualified.
    const windowQuery = fake.queries.find((q) => q.sql.includes('coalesce'))!
    expect(windowQuery.sql).toContain('limit $')
    expect(windowQuery.params).toContain(4)
  })

  it('finds the location unseen, and says so as `false`', async () => {
    enqueueCommitReads({ location: [] })
    const facts = (await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN))!
    expect(facts.session.locationSeenBefore).toBe(false)
  })

  it('finds the location familiar, and says so as `true`', async () => {
    enqueueCommitReads({ location: [[1]] })
    const facts = (await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN))!
    expect(facts.session.locationSeenBefore).toBe(true)
  })

  it('does not probe at all for a blank location, and reports null rather than false', async () => {
    // `null` is "there was nothing to compare", which must not earn `tourist`. `false` would say
    // the opposite — that a place was checked and found new.
    fake.enqueue(
      [runRow({ location: '   ' })],
      splitRows(),
      zoneRows(),
      [],
      [runRow()],
      [runRow()],
      [['0']],
      [projectedRow(RUN, '2026-08-20', '07:07:00', 10_670, 4716, 173, 442)],
      splitRows(),
    )
    const facts = (await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN))!
    expect(facts.session.locationSeenBefore).toBeNull()
    expect(fake.queries.some((q) => q.params.includes('   '))).toBe(false)
  })

  it('anchors the week and month on the RUN’s day, not on today', async () => {
    // A backfilled Tuesday completes the week it belongs to. Anchoring on "now" would credit a
    // three-week-old run to this week and quietly never fire `self_reward` for its own.
    enqueueCommitReads()
    const facts = (await gateway.dbBadgeGateway.loadCommitFacts('u1', RUN))!
    expect(facts.week.weekKey).toBe('2026-W34')
    expect(facts.month.monthKey).toBe('2026-08')
    expect(facts.week.runsThisWeek).toBe(1)
    expect(facts.session.runsOnThisDay).toBe(1)
    expect(facts.month.monthDistanceM).toBe(10_670)
    expect(facts.lifetime.dawnRunCount).toBe(0)
  })
})

describe('dbBadgeGateway.loadPeriodFacts', () => {
  it('answers all three scopes from three parallel reads', async () => {
    fake.enqueue(
      // A four-run week, and a four-run week before it.
      [
        tableRow(schema.runs, { id: 'a', occurredOn: '2026-08-17', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'b', occurredOn: '2026-08-18', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'c', occurredOn: '2026-08-19', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'd', occurredOn: '2026-08-20', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'e', occurredOn: '2026-08-10', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'f', occurredOn: '2026-08-11', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'g', occurredOn: '2026-08-12', distanceM: 10_000 }),
        tableRow(schema.runs, { id: 'h', occurredOn: '2026-08-13', distanceM: 10_000 }),
      ],
      [tableRow(schema.runs, { id: 'a', occurredOn: '2026-08-17', distanceM: 116_000 })],
      [['6']],
    )

    const facts = await gateway.dbBadgeGateway.loadPeriodFacts('u1', '2026-08-21')

    expect(facts.week).toEqual({
      weekKey: '2026-W34',
      runsThisWeek: 4,
      consecutiveQualifyingWeeks: 2,
    })
    expect(facts.month).toEqual({ monthKey: '2026-08', monthDistanceM: 116_000 })
    expect(facts.lifetime).toEqual({ dawnRunCount: 6 })
    expect(fake.queries).toHaveLength(3)
  })

  it('looks back far enough to measure a streak longer than gremlin’s trigger', async () => {
    // The 26-week lookback is what keeps `consistency_gremlin` from reporting the window's own
    // length as the streak and firing on a boundary artefact.
    fake.enqueue([], [], [['0']])
    await gateway.dbBadgeGateway.loadPeriodFacts('u1', '2026-08-21')
    const params = fake.queries[0]!.params
    // 2026-W34 starts 2026-08-17; 25 weeks earlier is 2026-02-23.
    expect(params).toContain('2026-02-23')
    expect(params).toContain('2026-08-24')
  })
})

describe('badgesForRun', () => {
  it('returns only this run’s badges, in catalog order, and never a period badge', async () => {
    fake.enqueue([
      tableRow(schema.badges, {
        key: 'tourist',
        runId: RUN,
        scopeKey: null,
        earnedOn: '2026-08-20',
        count: 1,
      }),
      tableRow(schema.badges, {
        key: 'late_start',
        runId: RUN,
        scopeKey: null,
        earnedOn: '2026-08-20',
        count: 1,
      }),
      tableRow(schema.badges, {
        key: 'century_club',
        runId: null,
        scopeKey: '2026-08',
        earnedOn: '2026-08-31',
        count: 1,
      }),
      tableRow(schema.badges, {
        key: 'half_ish',
        runId: 'another_run',
        scopeKey: null,
        earnedOn: '2026-07-01',
        count: 1,
      }),
    ])

    const rows = await gateway.badgesForRun('u1', RUN)
    expect(rows.map((r) => r.key)).toEqual(['late_start', 'tourist'])
  })
})
