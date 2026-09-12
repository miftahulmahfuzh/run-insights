import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { type DateISO } from '@/lib/date/ranges'

import { db } from '../index'
import { runSplits, runZones, runs, type RunIntent, type RunSplit, type RunZone } from '../schema'

import { runSplitOwnedBy, runZoneOwnedBy } from './ownership'

/* ============================================================================
 * §5b F09's three badge reads
 *
 * All reviewed-only (D16), because a badge earned from an unreviewed extraction is a badge earned
 * from a hallucination. None of them adds an index: at ~17 runs a month, and with `user_id` leading
 * every index in §4.3, each is single-digit-millisecond work over one user's partition.
 * ==========================================================================*/

/**
 * A trailing-window row: only the columns the two window rules actually read, not a whole `Run`.
 *
 * Narrow on purpose. `toWindowRun` needs six numbers and a decoupling computed from the splits; a
 * `select()` of all 26 run columns would ship the note, the photos' worth of metadata and both
 * recovery readings across the wire to be discarded, and it would make this function's real
 * dependency on the schema invisible. The field list IS the documentation of what a window rule can
 * see.
 */
export interface ReviewedRunWindowRow {
  id: string
  occurredOn: DateISO
  startedAt: string | null
  distanceM: number
  durationSec: number
  avgHr: number | null
  avgPaceSec: number
  splits: RunSplit[]
}

/**
 * The trailing window `groundhog_day` and `boring_excellence` need: this run and the reviewed runs
 * immediately before it, newest first.
 *
 * **`upTo` is the committing run's own position, not "today".** A backfilled run closes the window
 * that ends at *it*, not the one that ends at the most recent run in the table — otherwise
 * reviewing an old Tuesday would ask whether last week's three runs were near-identical, which is a
 * question about a different three runs. The row-value comparison
 * `(occurred_on, coalesce(started_at, '00:00')) <= (day, time)` is the same total order the R-5
 * dedupe index imposes, so "before this run" means one thing across the whole codebase.
 *
 * `limit` is passed by the caller as `windowRuns + 1`: the extra row is read purely so the rule can
 * tell whether the window ending one run EARLIER already qualified, which is what stops a fourth
 * near-identical loop from re-earning `groundhog_day`. Two statements rather than one join, for the
 * reason `getReviewedRunsWithChildren` gives — a join would multiply each run by its eleven splits.
 */
export async function getReviewedRunWindow(
  userId: string,
  upTo: { occurredOn: DateISO; startedAt: string | null },
  limit: number,
): Promise<ReviewedRunWindowRow[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError(`limit must be 1..50, got ${limit}`)
  }
  const position = sql`(${runs.occurredOn}, coalesce(${runs.startedAt}, '00:00:00'::time))`
  const runRows = await db
    .select({
      id: runs.id,
      occurredOn: runs.occurredOn,
      startedAt: runs.startedAt,
      distanceM: runs.distanceM,
      durationSec: runs.durationSec,
      avgHr: runs.avgHr,
      avgPaceSec: runs.avgPaceSec,
    })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        sql`${position} <= (${upTo.occurredOn}::date, ${upTo.startedAt ?? '00:00:00'}::time)`,
      ),
    )
    .orderBy(desc(runs.occurredOn), desc(sql`coalesce(${runs.startedAt}, '00:00:00'::time)`))
    .limit(limit)

  if (runRows.length === 0) return []

  const splitRows = await db
    .select()
    .from(runSplits)
    .where(
      and(
        inArray(
          runSplits.runId,
          runRows.map((r) => r.id),
        ),
        runSplitOwnedBy(userId),
      ),
    )
    .orderBy(asc(runSplits.runId), asc(runSplits.km))

  const byRun = new Map<string, RunSplit[]>()
  for (const split of splitRows) {
    const list = byRun.get(split.runId)
    if (list) list.push(split)
    else byRun.set(split.runId, [split])
  }
  return runRows.map((run) => ({ ...run, splits: byRun.get(run.id) ?? [] }))
}

/**
 * One earlier run as the session narrative sees it: six scalars and the zone durations behind
 * them, and deliberately no splits.
 *
 * The narrower sibling of `ReviewedRunWindowRow` above, and narrow for a different reason. That
 * one carries splits because its two badge rules recompute a decoupling from them; this one
 * exists to be *serialised into an LLM payload*, where every field costs input tokens on every
 * run detail page. Zones reduce to a single `percentTimeInZone4And5` before they reach the model
 * (§1.1 admits exactly one full child inclusion per payload, and this run's own splits already
 * spend it), so the durations are read and the rows are dropped.
 */
export interface ReviewedRunBeforeRow {
  id: string
  occurredOn: DateISO
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  intent: RunIntent | null
  zones: Pick<RunZone, 'zone' | 'durationSec'>[]
}

/**
 * The reviewed runs immediately BEFORE this one, newest first — F28's answer to a narrator that
 * could see three aggregate scalars and no other run.
 *
 * **Strictly `<`, where `getReviewedRunWindow` is `<=`.** That is the only substantive difference
 * between the two, and it is the whole point of this one: the window rules ask "what do the last
 * N runs *including this one* look like", and a narrative asks "what came *before* the run I am
 * describing". Including the subject in its own history would put the run in the payload twice
 * and let the model quote it as precedent for itself.
 *
 * Everything else is `getReviewedRunWindow`'s shape on purpose — the same
 * `(occurred_on, coalesce(started_at, '00:00'))` row-value comparison that the R-5 dedupe index
 * imposes, so "before this run" keeps meaning one thing across the codebase; the same bounded
 * `limit`; and the same two flat statements rather than a join, which would multiply each run row
 * by its five zone rows.
 */
export async function getReviewedRunsBefore(
  userId: string,
  before: { occurredOn: DateISO; startedAt: string | null },
  limit: number,
): Promise<ReviewedRunBeforeRow[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError(`limit must be 1..50, got ${limit}`)
  }
  const position = sql`(${runs.occurredOn}, coalesce(${runs.startedAt}, '00:00:00'::time))`
  const runRows = await db
    .select({
      id: runs.id,
      occurredOn: runs.occurredOn,
      distanceM: runs.distanceM,
      durationSec: runs.durationSec,
      avgPaceSec: runs.avgPaceSec,
      avgHr: runs.avgHr,
      intent: runs.intent,
    })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        sql`${position} < (${before.occurredOn}::date, ${before.startedAt ?? '00:00:00'}::time)`,
      ),
    )
    .orderBy(desc(runs.occurredOn), desc(sql`coalesce(${runs.startedAt}, '00:00:00'::time)`))
    .limit(limit)

  if (runRows.length === 0) return []

  const zoneRows = await db
    .select({ runId: runZones.runId, zone: runZones.zone, durationSec: runZones.durationSec })
    .from(runZones)
    .where(
      and(
        inArray(
          runZones.runId,
          runRows.map((r) => r.id),
        ),
        runZoneOwnedBy(userId),
      ),
    )
    .orderBy(asc(runZones.runId), asc(runZones.zone))

  const byRun = new Map<string, Pick<RunZone, 'zone' | 'durationSec'>[]>()
  for (const zone of zoneRows) {
    const list = byRun.get(zone.runId)
    if (list) list.push({ zone: zone.zone, durationSec: zone.durationSec })
    else byRun.set(zone.runId, [{ zone: zone.zone, durationSec: zone.durationSec }])
  }
  return runRows.map((run) => ({ ...run, zones: byRun.get(run.id) ?? [] }))
}

/**
 * `dawn_patrol`'s lifetime count. A `time` comparison in SQL, not a fetch-and-filter: the predicate
 * is the rule (roadmap §4.6, "10 runs started before 06:00") and expressing it once in the query is
 * what keeps it from being restated in TypeScript.
 */
export async function countReviewedRunsStartedBefore(
  userId: string,
  time: string,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        isNotNull(runs.startedAt),
        sql`${runs.startedAt} < ${time}::time`,
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * `tourist`: has this location ever appeared on another reviewed run?
 *
 * `LIMIT 1` existence check, and no index on `location` — §4.3 declares none and F09 does not add
 * one. A personal log tops out in the low thousands of rows after years of daily running, and this
 * scans one user's partition of an index that already leads with `user_id`. Revisit only if `/me`
 * ever measures otherwise.
 *
 * Exact equality, deliberately not case-folded or trimmed: normalising here would be a second
 * opinion about what a location IS, and F05's review screen is where the string is confirmed.
 */
export async function hasOtherReviewedRunAtLocation(
  userId: string,
  location: string,
  excludeRunId: string,
): Promise<boolean> {
  const rows = await db
    .select({ ok: sql`1` })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        eq(runs.location, location),
        sql`${runs.id} <> ${excludeRunId}`,
      ),
    )
    .limit(1)
  return rows.length > 0
}
