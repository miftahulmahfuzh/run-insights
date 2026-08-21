import type { DateISO } from '@/lib/date/ranges'
import type { RecordKey } from '@/lib/records/types'
import { badgeScope, catalogIndex } from './catalog'
import {
  evaluateLifetimeBadges,
  evaluateMonthBadges,
  evaluateSessionBadges,
  evaluateWeekBadges,
  type LifetimeBadgeContext,
  type MonthBadgeContext,
  type SessionBadgeContext,
  type WeekBadgeContext,
} from './rules'
import type { BadgeEarn, BadgeKey, StoredBadge } from './types'

/**
 * The orchestration layer: builds nothing, computes nothing, decides two things.
 *
 *   1. what `run_id` / `scope_key` / `earned_on` / `dedupe_key` each earn is stamped with
 *   2. nothing else — **which earns are news is the primary key's answer, not this file's** (F13).
 *      `badges` holds one row per `(user, key, dedupe_key)`, so `gateway.earn` reports whether it
 *      wrote and `newlyEarned` is that report rather than a prediction of it.
 *
 * Every read goes through an injected `BadgeGateway`, never a direct `db` import — the same shape
 * and the same reason as `lib/records/recompute.ts`: `catalog.ts`, `meta.ts` and `rules.ts` stay
 * pure, and this orchestrator is testable against a hand-written fake with no live connection in
 * CI. `gateway.ts` holds the real implementation and is the only file here that opens with
 * `import 'server-only'`.
 *
 * ── THE TRIGGER CONTRACT ────────────────────────────────────────────────────────────────────
 * `evaluateBadgesForCommit` is called from `lib/derived/invalidate.ts`'s `onRunCommitted`,
 * **synchronously, in the same request as the review commit**, and strictly AFTER F06's record
 * recompute. That ordering is load-bearing rather than tidy: `new_ceiling` and `long_way_home` are
 * one-line reads of the record that recompute just moved (§6), so running them earlier would
 * evaluate them against yesterday's shelf.
 *
 * ── ONLY REVIEWED DATA CAN REACH THIS ───────────────────────────────────────────────────────
 * There is no code path from `extractions` into a `BadgeContext`. Every context is built from
 * `runs`/`run_splits`/`run_zones` rows, and under R-1 those rows exist only because the review
 * commit inserted them. This is D1 made structural for badges: a badge cannot be "evaluated
 * against an unreviewed extraction" because the evaluator has no argument type that could hold
 * one.
 */

/**
 * A session context minus the two fields only F06's recompute can answer. Splitting them out keeps
 * the gateway honest — it loads rows, it does not get an opinion about records.
 */
export type SessionFacts = Omit<SessionBadgeContext, 'isNewLongestDistance' | 'isNewHighestMaxHr'>

export interface PeriodFacts {
  week: WeekBadgeContext
  month: MonthBadgeContext
  lifetime: LifetimeBadgeContext
}

export interface CommitFacts extends PeriodFacts {
  session: SessionFacts
}

export interface BadgeGateway {
  /**
   * Everything the four evaluators need about one just-committed run, anchored on **that run's own
   * week and month** rather than on today's — a backfilled Tuesday still completes the week it
   * belongs to. Returns null when the run cannot be read (deleted between the commit and this
   * call, or not this user's).
   */
  loadCommitFacts(userId: string, runId: string): Promise<CommitFacts | null>
  /** The week/month/lifetime half alone, anchored on a day. The cron sweep and `/me` both use it. */
  loadPeriodFacts(userId: string, anchorDay: DateISO): Promise<PeriodFacts>
  /** The award ledger, folded to one entry per key. */
  readBadges(userId: string): Promise<StoredBadge[]>
  /** Insert one award. **False when the row already existed** — the dedupe is the PK, not a read. */
  earn(userId: string, earn: BadgeEarn): Promise<boolean>
}

export interface BadgeAwardResult {
  /** Written to `badges` on this call — what a "you earned X" line should name. */
  newlyEarned: BadgeKey[]
  /** Everything that qualified, including keys already recorded for this run or period. */
  qualified: BadgeKey[]
}

const NOTHING: BadgeAwardResult = { newlyEarned: [], qualified: [] }

export interface CommitBadgeOptions {
  /**
   * From F06's `RecomputeResult.changed`, filtered to rows whose `run_id` is this run: the keys
   * whose record **moved to this run on this very commit**. `long_way_home` and `new_ceiling` are
   * reads of this and nothing else (§6) — never a second `distance > previousLongest` comparison.
   */
  recordsMovedToThisRun: readonly RecordKey[]
}

export async function evaluateBadgesForCommit(
  userId: string,
  runId: string,
  options: CommitBadgeOptions,
  gateway: BadgeGateway,
): Promise<BadgeAwardResult> {
  const facts = await gateway.loadCommitFacts(userId, runId)
  if (!facts) return NOTHING

  const moved = new Set(options.recordsMovedToThisRun)
  const session: SessionBadgeContext = {
    ...facts.session,
    isNewLongestDistance: moved.has('longest_distance'),
    isNewHighestMaxHr: moved.has('highest_max_hr'),
  }

  const day = facts.session.run.occurredOn
  const earns: BadgeEarn[] = [
    ...toEarns(evaluateSessionBadges(session), { runId, scopeKey: null, earnedOn: day }),
    ...toEarns(evaluateWeekBadges(facts.week), {
      runId: null,
      scopeKey: facts.week.weekKey,
      earnedOn: day,
    }),
    ...toEarns(evaluateMonthBadges(facts.month), {
      runId: null,
      scopeKey: facts.month.monthKey,
      earnedOn: day,
    }),
    ...toEarns(evaluateLifetimeBadges(facts.lifetime), {
      runId: null,
      scopeKey: null,
      earnedOn: day,
    }),
  ]

  return award(userId, earns, gateway)
}

/**
 * The nightly sweep (§8.2), honestly scoped: **v0.1.0 does not strictly need it.**
 *
 * Every week/month/lifetime rule is a condition detected at the commit that satisfies it, in
 * whatever order runs are actually reviewed — reviewing a backfilled Tuesday today still fires
 * `self_reward` if that commit is the one that takes the week to four. The sweep only earns its
 * keep once something can change an aggregate *without* a commit: a future "delete a run" or a
 * correction that moves a run across a period boundary. It ships anyway because
 * `/api/cron/rollup` already runs nightly and the marginal cost is three cheap queries per active
 * user — a backstop bought for almost nothing, not a load-bearing part of correctness today.
 *
 * Session badges are deliberately NOT swept. There is no aggregate to drift: a run's own shape is
 * fixed at commit, and re-evaluating it nightly could only ever re-award what is already recorded.
 */
export async function sweepPeriodBadges(
  userId: string,
  anchorDay: DateISO,
  gateway: BadgeGateway,
): Promise<BadgeAwardResult> {
  const facts = await gateway.loadPeriodFacts(userId, anchorDay)
  const earns: BadgeEarn[] = [
    ...toEarns(evaluateWeekBadges(facts.week), {
      runId: null,
      scopeKey: facts.week.weekKey,
      earnedOn: anchorDay,
    }),
    ...toEarns(evaluateMonthBadges(facts.month), {
      runId: null,
      scopeKey: facts.month.monthKey,
      earnedOn: anchorDay,
    }),
    ...toEarns(evaluateLifetimeBadges(facts.lifetime), {
      runId: null,
      scopeKey: null,
      earnedOn: anchorDay,
    }),
  ]
  return award(userId, earns, gateway)
}

function toEarns(keys: readonly BadgeKey[], stamp: Omit<BadgeEarn, 'key'>): BadgeEarn[] {
  return keys.map((key) => ({ key, ...stamp }))
}

/**
 * **The earn's scope identity — what the primary key dedupes on, and the whole of §7's `count`
 * policy now that a constraint enforces it rather than a comparison.**
 *
 *   `session`   the run id. One row per run, so re-committing a run after a post-review edit
 *               inserts nothing: the run earned it once, and an edit is not a second run.
 *   `week`      the ISO week. Four runs in a week fires once; a fifth collides with that row.
 *   `month`     the calendar month, on the same reasoning.
 *   `lifetime`  the empty string. One row per account, forever. §7 argues this asymmetry for
 *               `dawn_patrol`: a lifetime count has no period to re-cross within, and re-firing at
 *               20 and 30 turns one observation into a scoreboard — the exact streak-pressure
 *               mechanic the roadmap's core tenet rules out.
 *
 * A switch on the scope rather than `earn.runId ?? earn.scopeKey ?? ''`, which would produce the
 * same four answers today and would silently produce a WRONG one the first time a stamp is
 * mis-built. A session earn with a null runId is a bug, and this is where it should be loud.
 *
 * Note what no code path here does: **remove a row.** §1.2 takes the position that badges are never
 * revoked while records are always recomputed, and the schema agrees — `badges.run_id` is
 * `ON DELETE SET NULL` (R-22), the one non-cascade FK in the file, so a badge survives the deletion
 * of the run that earned it and keeps the `dedupe_key` naming it. A correction can make a run
 * *newly* earn a badge; it can never take one back. A newspaper prints a correction without
 * recalling the copies it delivered.
 */
export function dedupeKeyFor(earn: BadgeEarn): string {
  switch (badgeScope(earn.key)) {
    case 'session':
      if (!earn.runId) throw new Error(`session badge ${earn.key} earned with no runId`)
      return earn.runId
    case 'week':
    case 'month':
      if (!earn.scopeKey) throw new Error(`period badge ${earn.key} earned with no scopeKey`)
      return earn.scopeKey
    case 'lifetime':
      return ''
  }
}

/**
 * Write every earn, and report which ones actually landed.
 *
 * Sequential rather than batched: at most a handful of rows per commit, each one an independent
 * insert, and a failure on the fourth must not roll back the first three — a badge that was
 * genuinely earned is not made less true by the next one failing to save. (It is also why F13
 * widened `badges` instead of adding a second table: `neon-http` has no `db.transaction()`, so a
 * ledger row plus an aggregate update would be two unbound writes and a drift bug.)
 *
 * There is no read here any more. `gateway.earn` returns whether the insert wrote a row, so
 * `newlyEarned` is what the database did rather than what a comparison predicted it would do —
 * more accurate as well as one query cheaper.
 */
async function award(
  userId: string,
  unordered: readonly BadgeEarn[],
  gateway: BadgeGateway,
): Promise<BadgeAwardResult> {
  /* Catalog order across the whole result, not just within each scope's own evaluator. The four
   * evaluators each return their keys in catalog order, but concatenating session + week + month +
   * lifetime would interleave them by scope — and a caller rendering "you earned X and Y" should
   * read the same sequence the shelf shows (§2). */
  const earns = [...unordered].sort((a, b) => catalogIndex(a.key) - catalogIndex(b.key))
  if (earns.length === 0) return NOTHING

  const newlyEarned: BadgeKey[] = []
  for (const earn of earns) {
    if (await gateway.earn(userId, earn)) newlyEarned.push(earn.key)
  }
  return { newlyEarned, qualified: earns.map((e) => e.key) }
}
