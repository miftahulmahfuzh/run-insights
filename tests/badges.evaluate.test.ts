import { describe, expect, it } from 'vitest'

import {
  evaluateBadgesForCommit,
  sweepPeriodBadges,
  type BadgeGateway,
  type CommitFacts,
  type PeriodFacts,
  type SessionFacts,
} from '@/lib/badges/evaluate'
import { badgeScope } from '@/lib/badges/catalog'
import type { BadgeEarn, StoredBadge } from '@/lib/badges/types'
import { computeSessionMetrics } from '@/lib/metrics/session'
import { canonicalRecordRun, canonicalRunFacts, canonicalSession } from './fixtures/canonicalRun'

/**
 * The orchestration layer against a hand-written fake gateway — no database, no clock.
 *
 * What this file is really about is **idempotency**, which is the property §7's `count` policy and
 * §8.2's nightly sweep both rest on. Evaluating the same commit twice, or sweeping a period that has
 * already been awarded, must write nothing the second time. Without that, a post-review edit becomes
 * a way to inflate a count, and the cron backstop becomes a nightly `count += 1` machine.
 */

const USER = 'user_1'
const RUN = canonicalSession.runId

const SESSION: SessionFacts = {
  run: {
    runId: RUN,
    occurredOn: canonicalSession.occurredOn,
    startedAt: canonicalRunFacts.startedAt,
    distanceM: canonicalSession.distanceM,
    activeKcal: canonicalRecordRun.activeKcal,
  },
  splits: canonicalSession.splits,
  zones: canonicalSession.zones,
  metrics: computeSessionMetrics(canonicalSession, null),
  locationSeenBefore: false,
  runsOnThisDay: 1,
  window: [],
}

const QUIET_PERIOD: PeriodFacts = {
  week: { weekKey: '2026-W34', runsThisWeek: 1, consecutiveQualifyingWeeks: 0 },
  month: { monthKey: '2026-08', monthDistanceM: 10_670 },
  lifetime: { dawnRunCount: 0 },
}

const BUSY_PERIOD: PeriodFacts = {
  week: { weekKey: '2026-W34', runsThisWeek: 4, consecutiveQualifyingWeeks: 4 },
  month: { monthKey: '2026-08', monthDistanceM: 150_000 },
  lifetime: { dawnRunCount: 12 },
}

/**
 * A gateway that remembers. `earn` applies the same semantics `upsertBadge` does — insert, or
 * `count += 1` with `earned_on`/`run_id`/`scope_key` moved forward — so a test that awards twice
 * sees what the database would hold, not what the evaluator hoped it would.
 */
function fakeGateway(options: {
  commit?: CommitFacts | null
  period?: PeriodFacts
  stored?: StoredBadge[]
}): BadgeGateway & { rows: Map<string, StoredBadge>; earns: BadgeEarn[] } {
  const rows = new Map<string, StoredBadge>((options.stored ?? []).map((b) => [b.key, b]))
  const earns: BadgeEarn[] = []
  return {
    rows,
    earns,
    loadCommitFacts: () => Promise.resolve(options.commit ?? null),
    loadPeriodFacts: () => Promise.resolve(options.period ?? QUIET_PERIOD),
    readBadges: () => Promise.resolve([...rows.values()]),
    earn: (_userId, earn) => {
      earns.push(earn)
      const existing = rows.get(earn.key)
      rows.set(earn.key, {
        key: earn.key,
        runId: earn.runId,
        scopeKey: earn.scopeKey,
        earnedOn: earn.earnedOn,
        count: (existing?.count ?? 0) + 1,
      })
      return Promise.resolve()
    },
  }
}

const commitFacts = (session: SessionFacts = SESSION, period = QUIET_PERIOD): CommitFacts => ({
  session,
  ...period,
})

describe('evaluateBadgesForCommit', () => {
  it('writes the fixture’s seven badges and reports them as newly earned', async () => {
    const gateway = fakeGateway({ commit: commitFacts() })
    const result = await evaluateBadgesForCommit(
      USER,
      RUN,
      { recordsMovedToThisRun: ['longest_distance', 'highest_max_hr'] },
      gateway,
    )
    expect(result.newlyEarned).toEqual([
      'late_start',
      'fast_start_fool',
      'redline_republic',
      'cadence_collapse',
      'tourist',
      'new_ceiling',
      'long_way_home',
    ])
    expect(result.qualified).toEqual(result.newlyEarned)
  })

  it('stamps a session badge with the run and the run’s own day, never the wall clock', async () => {
    // `earned_on` is the day the run happened, so a backfilled run's badge is dated to the run
    // rather than to the evening it was typed in. Nothing in this call graph reads a clock.
    const gateway = fakeGateway({ commit: commitFacts() })
    await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    const earn = gateway.earns.find((e) => e.key === 'late_start')!
    expect(earn).toEqual({
      key: 'late_start',
      runId: RUN,
      scopeKey: null,
      earnedOn: '2026-08-20',
    })
  })

  it('does nothing at all when the run cannot be read — including an unreviewed one', async () => {
    // The gateway returns null for a run whose `reviewed_at` is null (D16), and this is what that
    // null becomes: no evaluation, no write, no thrown error into the commit path.
    const gateway = fakeGateway({ commit: null })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result).toEqual({ newlyEarned: [], qualified: [] })
    expect(gateway.earns).toEqual([])
  })

  it('takes new_ceiling and long_way_home from the records that moved, and nothing else', async () => {
    const gateway = fakeGateway({ commit: commitFacts() })
    const onlyDistance = await evaluateBadgesForCommit(
      USER,
      RUN,
      { recordsMovedToThisRun: ['longest_distance'] },
      gateway,
    )
    expect(onlyDistance.newlyEarned).toContain('long_way_home')
    expect(onlyDistance.newlyEarned).not.toContain('new_ceiling')

    // An unrelated record moving to this run must not earn either badge.
    const unrelated = await evaluateBadgesForCommit(
      USER,
      RUN,
      { recordsMovedToThisRun: ['most_kcal', 'fastest_km_split'] },
      fakeGateway({ commit: commitFacts() }),
    )
    expect(unrelated.newlyEarned).not.toContain('long_way_home')
    expect(unrelated.newlyEarned).not.toContain('new_ceiling')
  })
})

describe('§7 — what counts as a re-earn, per scope', () => {
  it('does not re-earn a session badge for the same run, however often it is committed', async () => {
    // The post-review-edit path. A correction can make a run NEWLY earn something; it must never
    // make the same run earn the same thing twice.
    const gateway = fakeGateway({ commit: commitFacts() })
    const first = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(first.newlyEarned.length).toBeGreaterThan(0)

    const second = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(second.newlyEarned).toEqual([])
    expect(second.qualified).toEqual(first.qualified)
    expect(gateway.rows.get('late_start')!.count).toBe(1)
  })

  it('re-earns a session badge for a DIFFERENT run, and moves the row forward', async () => {
    const gateway = fakeGateway({ commit: commitFacts() })
    await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)

    const later: CommitFacts = commitFacts({
      ...SESSION,
      run: { ...SESSION.run, runId: 'run_second', occurredOn: '2026-08-27' },
    })
    const second = await evaluateBadgesForCommit(
      USER,
      'run_second',
      { recordsMovedToThisRun: [] },
      { ...gateway, loadCommitFacts: () => Promise.resolve(later) },
    )
    expect(second.newlyEarned).toContain('late_start')
    const row = gateway.rows.get('late_start')!
    expect(row.count).toBe(2)
    expect(row.runId).toBe('run_second')
    expect(row.earnedOn).toBe('2026-08-27')
  })

  it('earns a week badge once per ISO week, not once per qualifying run', async () => {
    const gateway = fakeGateway({ commit: commitFacts(SESSION, BUSY_PERIOD), period: BUSY_PERIOD })
    const first = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(first.newlyEarned).toContain('self_reward')
    expect(gateway.rows.get('self_reward')!.scopeKey).toBe('2026-W34')

    // A fifth run in the same week qualifies again and changes nothing — the row already names the
    // week, which is what "fires once per qualifying week" means mechanically.
    const fifth: CommitFacts = commitFacts(
      { ...SESSION, run: { ...SESSION.run, runId: 'run_fifth' } },
      { ...BUSY_PERIOD, week: { ...BUSY_PERIOD.week, runsThisWeek: 5 } },
    )
    const second = await evaluateBadgesForCommit(
      USER,
      'run_fifth',
      { recordsMovedToThisRun: [] },
      { ...gateway, loadCommitFacts: () => Promise.resolve(fifth) },
    )
    expect(second.qualified).toContain('self_reward')
    expect(second.newlyEarned).not.toContain('self_reward')
    expect(gateway.rows.get('self_reward')!.count).toBe(1)
  })

  it('earns a week badge again in a new week', async () => {
    const gateway = fakeGateway({
      stored: [
        { key: 'self_reward', runId: null, scopeKey: '2026-W34', earnedOn: '2026-08-20', count: 1 },
      ],
      commit: commitFacts(SESSION, {
        ...BUSY_PERIOD,
        week: { weekKey: '2026-W35', runsThisWeek: 4, consecutiveQualifyingWeeks: 5 },
      }),
    })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result.newlyEarned).toContain('self_reward')
    expect(gateway.rows.get('self_reward')!.count).toBe(2)
  })

  it('earns a month badge once per calendar month', async () => {
    const gateway = fakeGateway({
      stored: [
        { key: 'century_club', runId: null, scopeKey: '2026-08', earnedOn: '2026-08-20', count: 1 },
      ],
      commit: commitFacts(SESSION, BUSY_PERIOD),
    })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result.qualified).toContain('century_club')
    expect(result.newlyEarned).not.toContain('century_club')
  })

  it('never re-earns dawn_patrol — the one lifetime badge, and §7’s deliberate exception', async () => {
    // Every other crossing rule has a period to re-cross within. A lifetime count has none, and
    // re-firing at 20 and 30 would turn one observation into a scoreboard — the streak-pressure
    // mechanic the roadmap's core tenet rules out.
    const gateway = fakeGateway({
      stored: [
        { key: 'dawn_patrol', runId: null, scopeKey: null, earnedOn: '2026-06-01', count: 1 },
      ],
      commit: commitFacts(SESSION, { ...BUSY_PERIOD, lifetime: { dawnRunCount: 40 } }),
    })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result.qualified).toContain('dawn_patrol')
    expect(result.newlyEarned).not.toContain('dawn_patrol')
    expect(gateway.rows.get('dawn_patrol')!.count).toBe(1)
  })

  it('never removes a row, whatever stops qualifying', async () => {
    // §1.2's position, asserted: badges are never revoked, records are always recomputed. The
    // schema already agreed — `badges.run_id` is ON DELETE SET NULL (R-22), the one non-cascade FK.
    const gateway = fakeGateway({
      stored: [
        { key: 'half_ish', runId: 'old_run', scopeKey: null, earnedOn: '2026-01-01', count: 1 },
      ],
      commit: commitFacts(),
    })
    await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(gateway.rows.get('half_ish')).toEqual({
      key: 'half_ish',
      runId: 'old_run',
      scopeKey: null,
      earnedOn: '2026-01-01',
      count: 1,
    })
  })
})

describe('sweepPeriodBadges — §8.2’s backstop', () => {
  it('awards period badges a commit somehow missed', async () => {
    const gateway = fakeGateway({ period: BUSY_PERIOD })
    const result = await sweepPeriodBadges(USER, '2026-08-21', gateway)
    expect(result.newlyEarned).toEqual([
      'self_reward',
      'century_club',
      'consistency_gremlin',
      'dawn_patrol',
    ])
  })

  it('evaluates no session rule, because a run’s own shape cannot drift overnight', async () => {
    const gateway = fakeGateway({ period: BUSY_PERIOD })
    const result = await sweepPeriodBadges(USER, '2026-08-21', gateway)
    for (const key of result.qualified) {
      expect(badgeScope(key)).not.toBe('session')
    }
  })

  it('writes nothing on the second night — the sweep is idempotent', async () => {
    const gateway = fakeGateway({ period: BUSY_PERIOD })
    await sweepPeriodBadges(USER, '2026-08-21', gateway)
    const second = await sweepPeriodBadges(USER, '2026-08-22', gateway)
    expect(second.newlyEarned).toEqual([])
    expect(gateway.rows.get('century_club')!.count).toBe(1)
  })

  it('writes nothing at all for a quiet user', async () => {
    const gateway = fakeGateway({ period: QUIET_PERIOD })
    const result = await sweepPeriodBadges(USER, '2026-08-21', gateway)
    expect(result).toEqual({ newlyEarned: [], qualified: [] })
    expect(gateway.earns).toEqual([])
  })
})
