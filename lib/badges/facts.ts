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
