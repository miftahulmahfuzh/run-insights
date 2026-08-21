import 'server-only'

import {
  isoWeekKeyOf,
  isoWeekRange,
  monthKey as monthKeyOf,
  addDays,
  type DateISO,
} from '@/lib/date/ranges'
import {
  countReviewedRunsStartedBefore,
  getBadgeAwards,
  getBadgeAwardsForRun,
  getRunDetail,
  getReviewedRunWindow,
  getRunsBetween,
  getRunsInMonth,
  hasOtherReviewedRunAtLocation,
  insertBadgeAward,
} from '@/lib/db/queries'
import type { Run } from '@/lib/db/schema'
import { computeSessionMetrics } from '@/lib/metrics/session'
import type { ZoneRow } from '@/lib/metrics/types'
import { BADGE_THRESHOLDS as T, catalogIndex } from './catalog'
import {
  dedupeKeyFor,
  type BadgeGateway,
  type CommitFacts,
  type PeriodFacts,
  type SessionFacts,
} from './evaluate'
import {
  foldAwards,
  qualifyingWeekStreak,
  runsOnDay,
  toWindowRun,
  totalDistanceM,
  weekRunCounts,
} from './facts'
import type { BadgeEarn, StoredBadge } from './types'

/**
 * The real `BadgeGateway` — the only file in `lib/badges` that touches the database, and it does no
 * arithmetic (that is all in `facts.ts`). Same division as `lib/records/gateway.ts`, and for the
 * same reason: `catalog.ts`, `meta.ts`, `rules.ts` and `evaluate.ts` stay importable and testable
 * without a connection.
 *
 * **`server-only` is the structural half of D1 here.** This module is the single door between badge
 * evaluation and stored data, it opens only onto `runs`/`run_splits`/`run_zones`/`badges`, and it
 * refuses a run whose `reviewed_at` is null. There is no query in this file that could reach
 * `extractions` even by accident.
 */

/**
 * How far back the qualifying-week walk can see. `consistency_gremlin` re-fires at 8 and 12
 * consecutive weeks, so a 12-week lookback would report a 16-week streak as 12 and quietly stop
 * firing — the window has to be comfortably longer than any streak it means to measure. Half a
 * year of runs for one user is ~110 rows on the `(user_id, occurred_on DESC)` index.
 */
const STREAK_LOOKBACK_WEEKS = 26

export const dbBadgeGateway: BadgeGateway = {
  async loadCommitFacts(userId: string, runId: string): Promise<CommitFacts | null> {
    const detail = await getRunDetail(userId, runId)

    /* D16, structurally. `getRunDetail` is draft-visible by design — `/r/[id]` has to render a run
     * whatever its review state — so the reviewed-data invariant is asserted HERE rather than
     * assumed. A badge earned from an unreviewed row is a badge earned from a number no human
     * vouched for, and this early return is the only thing standing between the two. */
    if (!detail || detail.reviewedAt == null) return null

    const [period, window, locationSeenBefore] = await Promise.all([
      loadPeriod(userId, detail.occurredOn),
      getReviewedRunWindow(
        userId,
        { occurredOn: detail.occurredOn, startedAt: detail.startedAt },
        T.windowRuns + 1,
      ),
      /* A blank location is missing data, not a new town: `null` here keeps `tourist` from firing
       * on every run of a user whose screenshots never carried a place name. */
      detail.location?.trim()
        ? hasOtherReviewedRunAtLocation(userId, detail.location, runId)
        : Promise.resolve(null),
    ])

    const metrics = computeSessionMetrics(
      {
        runId: detail.id,
        occurredOn: detail.occurredOn,
        distanceM: detail.distanceM,
        durationSec: detail.durationSec,
        avgHrBpm: detail.avgHr,
        splits: detail.splits,
        // `run_zones.zone` is a plain `int` in Postgres; the 1..5 domain is enforced by F04's Zod
        // schema on the way in, so this narrowing restates a guarantee rather than assuming one.
        zones: detail.zones.map((z) => ({
          zone: z.zone as ZoneRow['zone'],
          durationSec: z.durationSec,
          minBpm: z.minBpm,
          maxBpm: z.maxBpm,
        })),
        recovery: { endHrBpm: detail.endHrBpm, hrAt1MinBpm: detail.hr1MinPostBpm },
      },
      /* No HRmax, and no query to resolve one. `avgHrPctMax` is the only field that depends on it
       * and no rule in `rules.ts` reads that field — `warmup_who` deliberately uses this run's own
       * `run_zones` bounds instead (R-26). */
      null,
    )

    const session: SessionFacts = {
      run: {
        runId: detail.id,
        occurredOn: detail.occurredOn,
        startedAt: detail.startedAt,
        distanceM: detail.distanceM,
        activeKcal: detail.activeKcal,
      },
      splits: detail.splits,
      zones: detail.zones.map((z) => ({
        zone: z.zone as ZoneRow['zone'],
        durationSec: z.durationSec,
        minBpm: z.minBpm,
        maxBpm: z.maxBpm,
      })),
      metrics,
      locationSeenBefore,
      runsOnThisDay: runsOnDay(period.recent, detail.occurredOn),
      window: window.map((run) => toWindowRun(run, run.splits)),
    }

    return { session, ...period.facts }
  },

  async loadPeriodFacts(userId: string, anchorDay: DateISO): Promise<PeriodFacts> {
    return (await loadPeriod(userId, anchorDay)).facts
  },

  /* The ledger, folded. The arithmetic is `foldAwards`' and not this file's — same division of
   * labour as every other read here, and it is what makes the count testable without a database. */
  async readBadges(userId: string): Promise<StoredBadge[]> {
    return foldAwards(await getBadgeAwards(userId))
  },

  /* Returns whether a row was actually written, which is what `newlyEarned` is built from. The
   * dedupe is the primary key's job: this issues the insert and reports what the database did. */
  async earn(userId: string, earn: BadgeEarn): Promise<boolean> {
    return insertBadgeAward(userId, earn.key, {
      runId: earn.runId,
      scopeKey: earn.scopeKey,
      dedupeKey: dedupeKeyFor(earn),
      earnedOn: earn.earnedOn,
    })
  },
}

/**
 * Every badge this one run earned, in catalog order.
 *
 * F11's promised read: a shared run may render `long_way_home` / `new_ceiling` inline, and it must
 * be able to ask that question without importing the evaluator or knowing what a rule is. A real
 * `WHERE run_id = $1` since F13 — the ledger holds one row per earn and grows without bound, so
 * filtering the user's whole history in TypeScript is no longer the cheaper half of the trade.
 *
 * Folded even though a run can earn a given badge only once: the fold is what produces a
 * `StoredBadge`, and one row folds to a count of 1 with `firstEarnedOn` equal to `earnedOn`.
 *
 * Note what this returns for a period badge: nothing. `badges.run_id` is null for week, month and
 * lifetime scopes (§4.3: "the run that earned it, if session-scoped"), so `century_club` never
 * shows up against a single run — which is correct, because no single run earned it.
 */
export async function badgesForRun(userId: string, runId: string): Promise<StoredBadge[]> {
  return foldAwards(await getBadgeAwardsForRun(userId, runId)).sort(
    (a, b) => catalogIndex(a.key) - catalogIndex(b.key),
  )
}

/**
 * The week/month/lifetime contexts for one anchor day, plus the raw run list they were built from.
 *
 * Three queries, run in parallel, and the first one does triple duty: the same 26-week range answers
 * "how many runs this week" (`self_reward`), "how long is the qualifying-week streak"
 * (`consistency_gremlin`) and "how many runs on this exact day" (`two_a_days`). Asking those as
 * three separate aggregates would be three round trips to slice one list.
 *
 * The month is queried separately rather than sliced out of that list, because a calendar month can
 * extend past the anchor week — a backfilled run reviewed today may sit in a month whose later days
 * already hold runs, and `century_club` has to count them.
 */
async function loadPeriod(
  userId: string,
  anchorDay: DateISO,
): Promise<{ facts: PeriodFacts; recent: Run[] }> {
  const weekKey = isoWeekKeyOf(anchorDay)
  const monthKey = monthKeyOf(anchorDay)
  const { startISO, endExclusiveISO } = isoWeekRange(weekKey)
  const lookbackStart = addDays(startISO, -7 * (STREAK_LOOKBACK_WEEKS - 1))

  const [recent, monthRuns, dawnRunCount] = await Promise.all([
    getRunsBetween(userId, lookbackStart, endExclusiveISO),
    getRunsInMonth(userId, monthKey),
    countReviewedRunsStartedBefore(userId, T.dawnBefore),
  ])

  const counts = weekRunCounts(recent)

  return {
    recent,
    facts: {
      week: {
        weekKey,
        runsThisWeek: counts.get(weekKey) ?? 0,
        consecutiveQualifyingWeeks: qualifyingWeekStreak(
          counts,
          weekKey,
          T.weekRunTarget,
          STREAK_LOOKBACK_WEEKS,
        ),
      },
      month: { monthKey, monthDistanceM: totalDistanceM(monthRuns) },
      lifetime: { dawnRunCount },
    },
  }
}
