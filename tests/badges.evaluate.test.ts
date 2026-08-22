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
import { dedupeKeyFor } from '@/lib/badges/evaluate'
import { foldAwards } from '@/lib/badges/facts'
import type { BadgeAward, BadgeEarn, StoredBadge } from '@/lib/badges/types'
import { computeSessionMetrics } from '@/lib/metrics/session'
import { canonicalRecordRun, canonicalRunFacts, canonicalSession } from './fixtures/canonicalRun'

/**
 * The orchestration layer against a hand-written fake gateway — no database, no clock.
 *
 * What this file is really about is **idempotency**, which is the property §7's `count` policy and
 * §8.2's nightly sweep both rest on. Evaluating the same commit twice, or sweeping a period that has
 * already been awarded, must write nothing the second time. Without that, a post-review edit becomes
 * a way to inflate a count, and the cron backstop becomes a nightly `count += 1` machine.
 *
 * **The fake is a ledger keyed on `(key, dedupe_key)`, because since F13 that is the primary key.**
 * A fake that kept one row per key could not fail the defect this feature exists to fix — it would
 * model the schema that had the bug. Every count here comes out of `foldAwards`, exactly as the
 * real gateway's does.
 */

const USER = 'user_1'
const RUN = canonicalSession.runId
const DAY = canonicalSession.occurredOn

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
 * A gateway that remembers, as a multiset keyed by `(key, dedupeKey)` — the primary key F13 widened
 * `badges` to. `earn` is `ON CONFLICT DO NOTHING`: it returns false and writes nothing when that
 * exact award is already on the ledger, which is the whole of the idempotency contract.
 */
function fakeGateway(options: {
  commit?: CommitFacts | null
  period?: PeriodFacts
  stored?: BadgeAward[]
}): BadgeGateway & {
  ledger: Map<string, BadgeAward>
  earns: BadgeEarn[]
  fold: (key: string) => StoredBadge | undefined
} {
  const ledger = new Map<string, BadgeAward>(
    (options.stored ?? []).map((row) => [`${row.key}\u0000${row.dedupeKey}`, row]),
  )
  const earns: BadgeEarn[] = []
  let clock = 0
  const fold = (key: string) => foldAwards([...ledger.values()]).find((b) => b.key === key)
  return {
    ledger,
    earns,
    fold,
    loadCommitFacts: () => Promise.resolve(options.commit ?? null),
    loadPeriodFacts: () => Promise.resolve(options.period ?? QUIET_PERIOD),
    readBadges: () => Promise.resolve(foldAwards([...ledger.values()])),
    earn: (_userId, earn) => {
      earns.push(earn)
      const dedupeKey = dedupeKeyFor(earn)
      const pk = `${earn.key}\u0000${dedupeKey}`
      if (ledger.has(pk)) return Promise.resolve(false)
      ledger.set(pk, {
        key: earn.key,
        runId: earn.runId,
        scopeKey: earn.scopeKey,
        dedupeKey,
        earnedOn: earn.earnedOn,
        // Insertion order stands in for `created_at`; it is only ever a same-day tie-break.
        createdAt: new Date(Date.UTC(2026, 0, 1) + (clock += 1000)),
        count: 1,
      })
      return Promise.resolve(true)
    },
  }
}

/** One pre-existing ledger row, spelled out where a test needs history it did not create. */
function storedAward(over: Partial<BadgeAward> & { key: string; dedupeKey: string }): BadgeAward {
  return {
    runId: null,
    scopeKey: null,
    earnedOn: '2026-08-20',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    count: 1,
    ...over,
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
    expect(gateway.fold('late_start')!.count).toBe(1)
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
    const row = gateway.fold('late_start')!
    expect(row.count).toBe(2)
    expect(row.runId).toBe('run_second')
    expect(row.earnedOn).toBe('2026-08-27')
    // And the first earning is still legible, which is the other half of what the ledger bought.
    expect(row.firstEarnedOn).toBe('2026-08-20')
  })

  it('THE DEFECT (F12 §4.1): re-committing an EARLIER run leaves the count alone', async () => {
    /* Run A earns it, run B earns it, then A is re-reviewed because a split was wrong. The old
     * `isNews` compared A against the one run the row remembered — B — decided A was news, and
     * wrote `count = 3`. There is no comparison left to get wrong: the insert for A collides with
     * A's own row and the database declines it. */
    const gateway = fakeGateway({ commit: commitFacts() })
    await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)

    const runB: CommitFacts = commitFacts({
      ...SESSION,
      run: { ...SESSION.run, runId: 'run_b', occurredOn: '2026-08-27' },
    })
    await evaluateBadgesForCommit(
      USER,
      'run_b',
      { recordsMovedToThisRun: [] },
      { ...gateway, loadCommitFacts: () => Promise.resolve(runB) },
    )
    expect(gateway.fold('late_start')!.count).toBe(2)

    // The re-review of A. Same facts, same run, and nothing qualifies as news.
    const reReview = await evaluateBadgesForCommit(
      USER,
      RUN,
      { recordsMovedToThisRun: [] },
      gateway,
    )
    expect(reReview.qualified).toContain('late_start')
    expect(reReview.newlyEarned).toEqual([])
    const row = gateway.fold('late_start')!
    expect(row.count).toBe(2)
    // B is still the latest earner: a re-review of A does not drag the date backwards either.
    expect(row.earnedOn).toBe('2026-08-27')
    expect(row.runId).toBe('run_b')

    /* F27 — the same defect from the side the panel now shows. The panel lists one row per earning,
     * so a third row here would be the count inflation made visible: the runner would read the day
     * they re-reviewed a run as a day they earned the badge. Two earnings, two days, newest first. */
    expect(row.earnedDays).toEqual([
      { earnedOn: '2026-08-27', runId: 'run_b', scopeKey: null },
      { earnedOn: '2026-08-20', runId: RUN, scopeKey: null },
    ])
  })

  it('earns a week badge once per ISO week, not once per qualifying run', async () => {
    const gateway = fakeGateway({ commit: commitFacts(SESSION, BUSY_PERIOD), period: BUSY_PERIOD })
    const first = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(first.newlyEarned).toContain('self_reward')
    expect(gateway.fold('self_reward')!.scopeKey).toBe('2026-W34')

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
    expect(gateway.fold('self_reward')!.count).toBe(1)
  })

  it('earns a week badge again in a new week', async () => {
    const gateway = fakeGateway({
      stored: [storedAward({ key: 'self_reward', dedupeKey: '2026-W34', scopeKey: '2026-W34' })],
      commit: commitFacts(SESSION, {
        ...BUSY_PERIOD,
        week: { weekKey: '2026-W35', runsThisWeek: 4, consecutiveQualifyingWeeks: 5 },
      }),
    })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result.newlyEarned).toContain('self_reward')
    expect(gateway.fold('self_reward')!.count).toBe(2)
  })

  it('does not re-earn a week badge when a run from an OLDER week is re-reviewed', async () => {
    // The week-shaped half of the same defect: after W35 has qualified, re-reviewing a W34 run
    // used to see `scopeKey !== '2026-W35'` and fire again.
    const gateway = fakeGateway({
      stored: [
        storedAward({ key: 'self_reward', dedupeKey: '2026-W34', scopeKey: '2026-W34' }),
        storedAward({
          key: 'self_reward',
          dedupeKey: '2026-W35',
          scopeKey: '2026-W35',
          earnedOn: '2026-08-27',
        }),
      ],
      commit: commitFacts(SESSION, BUSY_PERIOD), // BUSY_PERIOD's week is 2026-W34
    })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result.qualified).toContain('self_reward')
    expect(result.newlyEarned).not.toContain('self_reward')
    expect(gateway.fold('self_reward')!.count).toBe(2)
  })

  it('earns a month badge once per calendar month', async () => {
    const gateway = fakeGateway({
      stored: [storedAward({ key: 'century_club', dedupeKey: '2026-08', scopeKey: '2026-08' })],
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
      stored: [storedAward({ key: 'dawn_patrol', dedupeKey: '', earnedOn: '2026-06-01' })],
      commit: commitFacts(SESSION, { ...BUSY_PERIOD, lifetime: { dawnRunCount: 40 } }),
    })
    const result = await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(result.qualified).toContain('dawn_patrol')
    expect(result.newlyEarned).not.toContain('dawn_patrol')
    expect(gateway.fold('dawn_patrol')!.count).toBe(1)
  })

  it('earns dawn_patrol exactly once however many sweeps run — every scope, one dedupe key', () => {
    // The lifetime dedupe key is '' for every earn, so the second insert can only ever collide.
    expect(dedupeKeyFor({ key: 'dawn_patrol', runId: null, scopeKey: null, earnedOn: DAY })).toBe(
      '',
    )
  })

  it('refuses to build a dedupe key for a mis-stamped earn rather than inventing one', () => {
    // `earn.runId ?? earn.scopeKey ?? ''` would quietly file a session badge under the lifetime
    // key and dedupe every run's award onto one row. A session earn with no run is a bug.
    expect(() =>
      dedupeKeyFor({ key: 'late_start', runId: null, scopeKey: null, earnedOn: DAY }),
    ).toThrow(/late_start/)
    expect(() =>
      dedupeKeyFor({ key: 'self_reward', runId: null, scopeKey: null, earnedOn: DAY }),
    ).toThrow(/self_reward/)
  })

  it('never removes a row, whatever stops qualifying', async () => {
    // §1.2's position, asserted: badges are never revoked, records are always recomputed. The
    // schema already agreed — `badges.run_id` is ON DELETE SET NULL (R-22), the one non-cascade FK.
    const gateway = fakeGateway({
      stored: [
        storedAward({
          key: 'half_ish',
          dedupeKey: 'old_run',
          runId: 'old_run',
          earnedOn: '2026-01-01',
        }),
      ],
      commit: commitFacts(),
    })
    await evaluateBadgesForCommit(USER, RUN, { recordsMovedToThisRun: [] }, gateway)
    expect(gateway.fold('half_ish')).toEqual({
      key: 'half_ish',
      runId: 'old_run',
      scopeKey: null,
      firstEarnedOn: '2026-01-01',
      earnedOn: '2026-01-01',
      count: 1,
      earnedDays: [{ earnedOn: '2026-01-01', runId: 'old_run', scopeKey: null }],
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
    expect(gateway.fold('century_club')!.count).toBe(1)
    expect(gateway.fold('dawn_patrol')!.count).toBe(1)
    // Sixteen earns attempted across two nights; eight rows on the ledger. The other eight were
    // declined by the primary key, and `newlyEarned` named none of them.
    expect(gateway.earns).toHaveLength(8)
    expect(gateway.ledger.size).toBe(4)
  })

  it('writes nothing at all for a quiet user', async () => {
    const gateway = fakeGateway({ period: QUIET_PERIOD })
    const result = await sweepPeriodBadges(USER, '2026-08-21', gateway)
    expect(result).toEqual({ newlyEarned: [], qualified: [] })
    expect(gateway.earns).toEqual([])
  })
})
