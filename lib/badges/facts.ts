import {
  addDays,
  isoWeekKeyOf,
  isoWeekRange,
  type DateISO,
  type IsoWeekKey,
} from '@/lib/date/ranges'
import { computeSessionMetrics } from '@/lib/metrics/session'
import type { SplitRow } from '@/lib/metrics/types'
import type { WindowRun } from './rules'
import type { BadgeAward, StoredBadge } from './types'

/**
 * The pure half of fact-building. `gateway.ts` fetches rows and calls these; it contains no
 * arithmetic of its own, exactly as `lib/records/gateway.ts` contains none — every decision about
 * what a fact *is* lives in a function that can be tested without a database.
 */

/**
 * One trailing-window entry, with its decoupling computed **by F06's own function**.
 *
 * `boring_excellence` is the only rule that needs a metric from a run other than the one being
 * committed, and it needs the hardest one. Re-deriving Pa:Hr here — with its half-split, its
 * aggregate means, its D14 partial exclusion — would be a second implementation of the exact number
 * `research/control.mjs` caught a model getting backwards. So `computeSessionMetrics` runs again,
 * per window run, on rows already in memory.
 *
 * `hrMax` is `null` and that costs nothing: `avgHrPctMax` is the single field that depends on it and
 * no badge rule reads it. Resolving it per window run would be three queries to feed a field
 * nothing consumes.
 */
export function toWindowRun(
  run: {
    id: string
    occurredOn: DateISO
    distanceM: number
    durationSec: number
    avgHr: number | null
    avgPaceSec: number
  },
  splits: readonly SplitRow[],
): WindowRun {
  const metrics = computeSessionMetrics(
    {
      runId: run.id,
      occurredOn: run.occurredOn,
      distanceM: run.distanceM,
      durationSec: run.durationSec,
      avgHrBpm: run.avgHr,
      splits,
      zones: [],
      recovery: null,
    },
    null,
  )
  return {
    runId: run.id,
    distanceM: run.distanceM,
    avgPaceSec: run.avgPaceSec,
    decouplingPct: metrics.decouplingPct,
  }
}

/**
 * **F13's fold: the award ledger's rows collapsed to one entry per badge.**
 *
 * This is where the count comes from now. Before F13 `badges` held one row per `(user, key)` and
 * `count` was incremented by the application, which could only compare the incoming earn against
 * the LAST one recorded — so re-reviewing an earlier run looked like a fresh earn and the number
 * inflated (F12 §4.1). The primary key does that job now, and all that is left here is arithmetic
 * over rows that already exist.
 *
 * It lives in `facts.ts` and not in `gateway.ts` for the reason the gateway states about itself:
 * it touches the database and does no arithmetic. Sorting and summing rows is arithmetic. It also
 * means the case that matters most — run A, run B, re-review A — is three literal rows and one
 * assertion, with no connection.
 *
 * The rules, each of which has a test:
 *
 *   - `count` **sums the column**, never counts rows. A row written before the migration carries
 *     the aggregate it had then, and discarding it would take history off the user's shelf.
 *   - `firstEarnedOn` is the earliest `earned_on`, `earnedOn` the latest.
 *   - `runId` / `scopeKey` come from the row holding that latest day, ties broken by `created_at`
 *     so the fold is deterministic when two awards share a date.
 *   - a key with no rows is **absent**, not a zero row — `buildShelf` reads absence as "locked".
 *   - **catalog order is not applied here.** `buildShelf` iterates the catalog and `badgesForRun`
 *     sorts by `catalogIndex`; imposing it a third time would be a third place to get it wrong.
 *     Keys come out in the order they were first seen.
 *
 * ── F27: COLLECT THEN DERIVE, RATHER THAN ACCUMULATE ────────────────────────────────────────
 * Every rule above still holds and not one of their tests changed. What changed is the mechanism.
 * This used to walk the rows once, carrying a running fold and a running `latest`, and patch four
 * fields whenever a later row arrived — which worked precisely because the four answers it wanted
 * were all readable from one end of an ordering it never materialised.
 *
 * #26 needs that ordering materialised: the panel lists every earn date, newest down. So the rows
 * are collected per key, sorted ONCE by `byLatestFirst`, and the four conveniences are read off the
 * ends — head for `runId` / `scopeKey` / `earnedOn`, tail's day for `firstEarnedOn`. Fewer moving
 * parts, and the ordering claim now has one definition instead of being implied by a comparison
 * inside a loop.
 *
 * `count` is emphatically NOT `earnedDays.length`. It stays `Σ row.count` for the first rule's own
 * reason, and the gap between the two on a pre-F13 row is a real thing the panel has to report
 * rather than paper over — see `StoredBadge.earnedDays` and `BadgeDialog`.
 */
export function foldAwards(rows: readonly BadgeAward[]): StoredBadge[] {
  /* A Map keyed by badge key, so insertion order is first-seen order and the "catalog order is not
   * applied here" rule survives the rewrite for free. */
  const byKey = new Map<string, BadgeAward[]>()
  for (const row of rows) {
    const bucket = byKey.get(row.key)
    if (bucket) bucket.push(row)
    else byKey.set(row.key, [row])
  }

  return [...byKey.entries()].map(([key, awards]) => {
    /* A copy of the bucket, not the caller's array — `rows` is `readonly` and the buckets are ours,
     * but sorting in place still makes the order of one key's awards a side effect of folding. */
    const sorted = [...awards].sort(byLatestFirst)
    /* Non-null: a key only exists in the map because a row put it there, so both ends are rows. */
    const latest = sorted[0]!
    const earliest = sorted[sorted.length - 1]!

    return {
      key,
      runId: latest.runId,
      scopeKey: latest.scopeKey,
      firstEarnedOn: earliest.earnedOn,
      earnedOn: latest.earnedOn,
      /* The column summed, never `sorted.length`. A pre-F13 row carries an aggregate. */
      count: awards.reduce((total, row) => total + row.count, 0),
      earnedDays: sorted.map((row) => ({
        earnedOn: row.earnedOn,
        runId: row.runId,
        scopeKey: row.scopeKey,
      })),
    }
  })
}

/**
 * Latest first: `earned_on` — the day the badge is about — then `created_at` to break a same-day tie.
 *
 * The tie-break is load-bearing and not decorative. `getBadgeAwards` orders by
 * `key asc, earned_on asc` and says nothing about `created_at`, so two awards sharing a day arrive
 * from Postgres in an order Postgres is free to change. Without the second key the head of this sort
 * — and therefore `runId`, `scopeKey` and the top of the panel's date list — would depend on the
 * plan. `badges.facts.test.ts` asserts that from both directions by reversing its input.
 *
 * `Date.getTime()` rather than comparing `Date` objects: `>` on two Dates coerces, `-` is what
 * `Array.sort` wants, and doing the conversion here keeps the comparator total.
 */
function byLatestFirst(a: BadgeAward, b: BadgeAward): number {
  if (a.earnedOn !== b.earnedOn) return a.earnedOn < b.earnedOn ? 1 : -1
  return b.createdAt.getTime() - a.createdAt.getTime()
}

/** Reviewed runs per ISO week. The key is `insights.scope_key`'s week format, so it joins cleanly. */
export function weekRunCounts(runs: readonly { occurredOn: DateISO }[]): Map<IsoWeekKey, number> {
  const counts = new Map<IsoWeekKey, number>()
  for (const run of runs) {
    const key = isoWeekKeyOf(run.occurredOn)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** The ISO week before this one. Walks the calendar, never subtracts 1 from the week number. */
export function previousIsoWeek(week: IsoWeekKey): IsoWeekKey {
  return isoWeekKeyOf(addDays(isoWeekRange(week).startISO, -1))
}

/**
 * How many consecutive weeks ending at `anchorWeek` have `target`+ reviewed runs.
 *
 * Walks backwards from the anchor and stops at the first week that misses — including the anchor
 * itself, so a week with three runs yields 0 rather than reporting last month's streak. `maxWeeks`
 * bounds the walk, and the caller must fetch at least that many weeks of runs: a lookback shorter
 * than the streak would silently report the lookback length, which for `consistency_gremlin`'s
 * fire-at-a-multiple-of-four rule would mean firing on the window's edge rather than on a real
 * streak.
 */
export function qualifyingWeekStreak(
  counts: ReadonlyMap<IsoWeekKey, number>,
  anchorWeek: IsoWeekKey,
  target: number,
  maxWeeks: number,
): number {
  let streak = 0
  let week = anchorWeek
  while (streak < maxWeeks && (counts.get(week) ?? 0) >= target) {
    streak += 1
    week = previousIsoWeek(week)
  }
  return streak
}

/** Reviewed runs sharing one calendar day — `two_a_days`' whole predicate, counted once here. */
export function runsOnDay(runs: readonly { occurredOn: DateISO }[], day: DateISO): number {
  return runs.filter((r) => r.occurredOn === day).length
}

/** Summed metres. `distance_m` is an integer (D5), so this sum is exact rather than nearly exact. */
export function totalDistanceM(runs: readonly { distanceM: number }[]): number {
  return runs.reduce((a, r) => a + r.distanceM, 0)
}
