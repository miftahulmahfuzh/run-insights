import { and, asc, desc, eq, exists, gt, gte, isNotNull, lt, sql, type SQL } from 'drizzle-orm'

import {
  isoWeekRange,
  monthRange,
  type DateISO,
  type IsoWeekKey,
  type MonthKey,
} from '@/lib/date/ranges'

import { db } from '../index'
import {
  runSplits,
  runZones,
  runs,
  type Run,
  type RunIntent,
  type RunSplit,
  type RunZone,
} from '../schema'

/* ============================================================================
 * §5 Rollups — all reviewed-only, all range-scanned
 *
 * Every one of these filters `occurred_on >= start AND occurred_on < endExclusive` rather than
 * `to_char(occurred_on, 'YYYY-MM') = key`. Same rows; only the first can use
 * `runs_user_occurred_idx`.
 * ==========================================================================*/

export interface RunAggregate {
  runCount: number
  distanceM: number
  durationSec: number
}

/** Runs in one ISO week ('2026-W34'), reviewed-only, oldest first. */
export async function getRunsInIsoWeek(userId: string, week: IsoWeekKey): Promise<Run[]> {
  const { startISO, endExclusiveISO } = isoWeekRange(week)
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/** Runs in one calendar month ('2026-08'), reviewed-only, oldest first. */
export async function getRunsInMonth(userId: string, month: MonthKey): Promise<Run[]> {
  const { startISO, endExclusiveISO } = monthRange(month)
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/**
 * Runs in an arbitrary half-open day range, reviewed-only. R-6's ACWR needs a rolling 7-day and
 * 28-day window, which is neither a calendar month nor an ISO week.
 */
export async function getRunsBetween(
  userId: string,
  startISO: DateISO,
  endExclusiveISO: DateISO,
): Promise<Run[]> {
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/** One reviewed run and its children, as F06's record recompute reads them. */
export interface ReviewedRunWithChildren extends Run {
  splits: RunSplit[]
  zones: RunZone[]
}

/**
 * **Every reviewed run a user has, with its splits and zones — three statements, one `db.batch`,
 * one snapshot.** F06's `recomputeRecords` is the only caller, and it needs the whole history:
 * records are recomputed wholesale, never incremented (roadmap §4.5 / R-10), because a correction
 * that drops a run below a qualifier can only be expressed by re-deriving the set from scratch.
 *
 * Reviewed-only (D16). A record set by an unconfirmed extraction is a record set by a number
 * nobody vouched for.
 *
 * Three statements rather than one join: a join would multiply the run row by its eleven splits
 * and five zones and hand back ~55 rows per run to be de-duplicated in TypeScript. At 17 runs a
 * month the whole history is a few hundred rows across three flat result sets, and the batch
 * makes them one consistent snapshot — a concurrent correction cannot land between the splits
 * read and the zones read.
 */
export async function getReviewedRunsWithChildren(
  userId: string,
): Promise<ReviewedRunWithChildren[]> {
  const reviewedRunOf = (child: typeof runSplits | typeof runZones) =>
    exists(
      db
        .select({ ok: sql`1` })
        .from(runs)
        .where(and(eq(runs.id, child.runId), eq(runs.userId, userId), isNotNull(runs.reviewedAt))),
    )

  const [runRows, splitRows, zoneRows] = await db.batch([
    db
      .select()
      .from(runs)
      .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
      .orderBy(asc(runs.occurredOn), asc(runs.startedAt)),

    db
      .select()
      .from(runSplits)
      .where(reviewedRunOf(runSplits))
      .orderBy(asc(runSplits.runId), asc(runSplits.km)),

    db
      .select()
      .from(runZones)
      .where(reviewedRunOf(runZones))
      .orderBy(asc(runZones.runId), asc(runZones.zone)),
  ])

  const splitsByRun = new Map<string, RunSplit[]>()
  for (const s of splitRows) {
    const list = splitsByRun.get(s.runId)
    if (list) list.push(s)
    else splitsByRun.set(s.runId, [s])
  }
  const zonesByRun = new Map<string, RunZone[]>()
  for (const z of zoneRows) {
    const list = zonesByRun.get(z.runId)
    if (list) list.push(z)
    else zonesByRun.set(z.runId, [z])
  }

  return runRows.map((run) => ({
    ...run,
    splits: splitsByRun.get(run.id) ?? [],
    zones: zonesByRun.get(run.id) ?? [],
  }))
}

export interface AllTimeTotals extends RunAggregate {
  firstRunOn: DateISO | null
  lastRunOn: DateISO | null
}

/** Lifetime totals, reviewed-only. Powers `/me`. */
export async function getAllTimeTotals(userId: string): Promise<AllTimeTotals> {
  const rows = await db
    .select({
      runCount: sql<number>`count(*)`.mapWith(Number),
      distanceM: sql<number>`coalesce(sum(${runs.distanceM}), 0)`.mapWith(Number),
      durationSec: sql<number>`coalesce(sum(${runs.durationSec}), 0)`.mapWith(Number),
      firstRunOn: sql<string | null>`min(${runs.occurredOn})`,
      lastRunOn: sql<string | null>`max(${runs.occurredOn})`,
    })
    .from(runs)
    .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
  return rows[0] ?? { runCount: 0, distanceM: 0, durationSec: 0, firstRunOn: null, lastRunOn: null }
}

/* ============================================================================
 * §5c The one PARAMETERISED aggregate — Nina's `aggregate_runs` (R1)
 * ==========================================================================*/

/**
 * **The metric columns an aggregate may be taken over, as a CLOSED map from key to column.**
 *
 * The map is the type source and the injection boundary at once: `RunMetricKey` is derived from
 * its own keys, so a caller cannot name a column that is not in here, and nothing a model sends is
 * ever interpolated into SQL as a string — the key selects a `PgColumn`, and drizzle renders that
 * column's quoted identifier itself.
 *
 * Three of the six are NOT NULL on every row (`durationSec`, `distanceM`, `avgPaceSec`) and three
 * are nullable (`avgHr`, `activeKcal`, `elevationM`), which is the whole reason `n` below counts
 * non-null READINGS rather than matching rows. Adding a seventh metric is one line here and one
 * line in `NINA_AGGREGATE_METRICS` (`lib/nina/schema.ts`); `tests/nina.prompts.test.ts` fails
 * until the tool schema's `enum` moves with them.
 */
const RUN_METRIC_COLUMNS = {
  durationSec: runs.durationSec,
  distanceM: runs.distanceM,
  avgPaceSec: runs.avgPaceSec,
  avgHr: runs.avgHr,
  activeKcal: runs.activeKcal,
  elevationM: runs.elevationM,
} as const

export type RunMetricKey = keyof typeof RUN_METRIC_COLUMNS

export type RunAggregateFn = 'avg' | 'sum' | 'min' | 'max' | 'count'

export interface RunMetricAggregateParams {
  metric: RunMetricKey
  agg: RunAggregateFn
  /** INCLUSIVE lower bound. */
  startISO: DateISO
  /** EXCLUSIVE upper bound — rule 1 at the top of this file. The caller added the day. */
  endExclusiveISO: DateISO
  /** `null` or omitted means every intent, INCLUDING rows whose intent was never set. */
  intent?: RunIntent | null
}

export interface RunMetricAggregate {
  /** The aggregate. `null` when no reviewed run in the range has a reading for the metric. */
  value: number | null
  /** Runs that contributed a NON-NULL reading — the denominator of an `avg`. */
  n: number
  /** Reviewed runs the filters matched at all. `runCount - n` is how many had no reading. */
  runCount: number
}

/**
 * The aggregation, as a SQL fragment. A `switch` over a closed union rather than a lookup table so
 * that adding a sixth `RunAggregateFn` fails to compile here instead of falling through to a
 * runtime default that quietly returns the wrong function.
 *
 * Every branch is typed `string | number | null` and NOT `.mapWith(Number)`: `avg()` over an
 * integer column returns `numeric` and `sum()`/`count()` return `bigint`, both of which the Neon
 * driver hands back as strings, while `min()`/`max()` come back as numbers — and `Number(null)` is
 * `0`, which is the one wrong answer this function must never give. The caller converts once,
 * after an explicit null check.
 */
function aggregateExpr(
  agg: RunAggregateFn,
  column: (typeof RUN_METRIC_COLUMNS)[RunMetricKey],
): SQL<string | number | null> {
  switch (agg) {
    case 'avg':
      return sql<string | number | null>`avg(${column})`
    case 'sum':
      return sql<string | number | null>`sum(${column})`
    case 'min':
      return sql<string | number | null>`min(${column})`
    case 'max':
      return sql<string | number | null>`max(${column})`
    case 'count':
      return sql<string | number | null>`count(${column})`
  }
}

/**
 * **One aggregate over one metric, over a half-open day range. One row back, never rows.**
 *
 * R1's whole point: an average over two months is a `select avg(...)` the database answers in one
 * row, and materialising the range to reduce over it in TypeScript would cost more and put the
 * arithmetic in the wrong place. `getAllTimeTotals` above is the shape; this is that shape with
 * the column, the function and the window made parameters.
 *
 * Reviewed-only (D16) and `userId`-scoped, like every other function in this file. The range is
 * `>= startISO AND < endExclusiveISO` so `runs_user_occurred_idx` can scan it.
 *
 * **`count` counts non-null READINGS, not matching rows.** `getAllTimeTotals` uses `count(*)`
 * because every column it totals is NOT NULL; three of the six metrics here are nullable, so
 * "how many runs have a recorded elevation gain" has to be answerable — and for the three NOT NULL
 * metrics `count(column)` is identical to `count(*)` anyway. `runCount` carries the row count
 * separately so a caller can tell 12-of-14 from 12-of-12.
 */
export async function aggregateRunMetric(
  userId: string,
  params: RunMetricAggregateParams,
): Promise<RunMetricAggregate> {
  const column = RUN_METRIC_COLUMNS[params.metric]
  const rows = await db
    .select({
      value: aggregateExpr(params.agg, column),
      n: sql<number>`count(${column})`.mapWith(Number),
      runCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, params.startISO),
        lt(runs.occurredOn, params.endExclusiveISO),
        /* `and()` drops undefined members, so "no intent filter" adds no predicate at all rather
         * than a tautology the planner has to reason about. */
        params.intent == null ? undefined : eq(runs.intent, params.intent),
      ),
    )

  const row = rows[0]
  /* An aggregate with no GROUP BY always returns exactly one row; the fallback is here for the
   * same reason `getAllTimeTotals` has one — a driver shape this file does not control. */
  if (row == null) return { value: null, n: 0, runCount: 0 }
  return {
    value: row.value == null ? null : Number(row.value),
    n: row.n,
    runCount: row.runCount,
  }
}

/** Which run holds the observed max, not just what it was. See `getObservedMaxHrRun`. */
export interface ObservedMaxHr {
  runId: string
  maxHr: number
  occurredOn: DateISO
}

/**
 * The observed-max read that names its run, and the only query `lib/metrics/hrMax.ts` uses for
 * rule 2 of roadmap §4.4. Two things it does that a plain `max()` cannot:
 *
 *   - **Names the run.** The return is provenance, not just a bpm: `observedOn` feeds the "from
 *     your run of X" attribution copy on the run page and /me.
 *   - **Filters in SQL, not in TypeScript.** `minBpm` is the Tanaka estimate. Roadmap §4.4 does
 *     not say "prefer whichever number loaded first" — it says an observation wins when it
 *     *exceeds* the formula, and `ORDER BY max_hr DESC LIMIT 1` over that predicate is that rule,
 *     expressed once. Never fetch runs and reduce over them in application code.
 *
 * Reads `runs_user_maxhr_idx` (R-12). Reviewed-only (D16): an unreviewed max HR is a number a
 * vision model asserted and no human confirmed, and it would move the denominator under every
 * %HRmax figure in the app.
 */
export async function getObservedMaxHrRun(
  userId: string,
  options: { minBpm?: number } = {},
): Promise<ObservedMaxHr | null> {
  const { minBpm = 0 } = options
  const rows = await db
    .select({ runId: runs.id, maxHr: runs.maxHr, occurredOn: runs.occurredOn })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        isNotNull(runs.maxHr),
        gt(runs.maxHr, minBpm),
      ),
    )
    .orderBy(desc(runs.maxHr))
    .limit(1)
  const row = rows[0]
  if (!row || row.maxHr == null) return null
  return { runId: row.runId, maxHr: row.maxHr, occurredOn: row.occurredOn }
}

/**
 * **The one query in this layer that is not ownership-scoped, and the second sanctioned exception
 * overall.** `/api/cron/rollup` has no session — it is authenticated by `CRON_SECRET` — and its
 * whole job is to enumerate users, so a `userId` parameter would be a lie.
 *
 * It returns ids and nothing else: no run data, no profile, no email. The cron then loops and
 * every read inside the loop is scoped to one id, so the unscoped surface is exactly this one
 * `SELECT DISTINCT` and stops there. `scripts/check-data-layer-invariants.mjs` names it in its
 * allowlist so a THIRD exception still has to be argued for in a diff.
 *
 * "Active" is deliberately generous — anyone with a reviewed run since `sinceISO`. A runner who
 * took three weeks off still wants their week to be readable when they come back.
 */
export async function listActiveUserIds(sinceISO: DateISO): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: runs.userId })
    .from(runs)
    .where(and(isNotNull(runs.reviewedAt), gte(runs.occurredOn, sinceISO)))
  return rows.map((row) => row.userId)
}
