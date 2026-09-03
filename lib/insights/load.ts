import 'server-only'

import {
  addDays,
  isoWeekKeyOf,
  isoWeekRange,
  addMonths,
  monthRange,
  todayInJakarta,
  type DateISO,
  type IsoWeekKey,
  type MonthKey,
} from '@/lib/date/ranges'
import {
  getLatestInsight,
  getProfile,
  getReviewedRunsBefore,
  getReviewedRunsWithChildren,
  getRunDetail,
  getRunsBetween,
} from '@/lib/db/queries'
import type { Run, RunSplit, RunZone } from '@/lib/db/schema'
import type { InsightScope, Sex } from '@/lib/db/schema'
import {
  aggregatePeriodFlags,
  buildMonthFacts,
  buildSessionFacts,
  buildWeekFacts,
  summarisePreviousInsight,
  type FlagFact,
  type MonthNarrateFacts,
  type NarrativeProfile,
  type PreviousInsightSummary,
  type RecentRunInput,
  type SessionNarrateFacts,
  type WeekNarrateFacts,
} from '@/lib/llm/facts'
import { promptVersionFor } from '@/lib/llm/prompts/narrate'
import {
  ACWR_OUT_OF_RANGE,
  bucketForDistanceM,
  computeAcwr,
  computeSessionMetrics,
  computeWeekMetrics,
  evaluateSessionFlags,
  isAcwrOutOfRange,
  paceByBucket,
  resolveHrMax,
  VOLUME_JUMP,
  type DistanceBucket,
  type Flag,
  type HrMax,
  type SessionInput,
  type ZoneRow,
} from '@/lib/metrics'

/**
 * **The fetching half of F07.** `lib/llm/facts.ts` decides what a fact IS and contains no I/O;
 * this file reads rows and hands them over, the same split `lib/records/{recompute,gateway}.ts`
 * uses and for the same reason — the interesting logic stays unit-testable without a database.
 *
 * ── ONE QUERY FOR A PERIOD, THE SAME ONE `/trends` USES ───────────────────────────────────────
 * `getReviewedRunsWithChildren` reads the whole reviewed history in one `db.batch` — three
 * statements, one consistent snapshot — and every rollup below is a `filter` and a `reduce` over
 * that array. The alternative is six range scans that can disagree with each other the day one of
 * them straddles midnight in Jakarta. This is right *because this is a single-user app with a
 * bounded history* (~200 runs a year); F08's `/trends` and F06's `recomputeRecords` rest on the
 * same premise, and if it ever stops holding all three need the same rethink together.
 *
 * ── REVIEWED-ONLY, INCLUDING AT SESSION SCOPE (D16) ───────────────────────────────────────────
 * `getReviewedRunsWithChildren` filters `reviewed_at IS NOT NULL` in SQL. `getRunDetail`
 * deliberately does not — a run must render whatever its review state — so `loadSessionFacts`
 * applies the filter itself and returns `null` for a draft. A narrative about numbers no human
 * has confirmed is a narrative about a hallucination, which is D1's whole point one layer down.
 */

/* ============================================================================
 * Shared reductions
 * ==========================================================================*/

/**
 * The minimum a run must carry to be narratable, structurally rather than by table type.
 * `getRunDetail` and `getReviewedRunsWithChildren` return different row shapes (one has photos,
 * the other does not) and both satisfy this; naming the fields is what lets one reduction serve
 * both without either query's extras leaking into the fact builders.
 */
type RunWithChildren = Pick<
  Run,
  'id' | 'occurredOn' | 'distanceM' | 'durationSec' | 'avgHr' | 'endHrBpm' | 'hr1MinPostBpm'
> & { splits: readonly RunSplit[]; zones: readonly RunZone[] }

function toSessionInput(run: RunWithChildren): SessionInput {
  return {
    runId: run.id,
    occurredOn: run.occurredOn,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgHrBpm: run.avgHr,
    splits: run.splits.map((s) => ({
      km: s.km,
      timeSec: s.timeSec,
      paceSec: s.paceSec,
      hr: s.hr,
      cadence: s.cadence,
      partial: s.partial,
    })),
    // `run_zones.zone` is a plain int in Postgres; F04's Zod schema enforces the 1..5 domain on
    // the way in, so this narrowing restates a guarantee rather than assuming one.
    zones: run.zones.map((z) => ({
      zone: z.zone as ZoneRow['zone'],
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
    recovery: { endHrBpm: run.endHrBpm, hrAt1MinBpm: run.hr1MinPostBpm },
  }
}

function flagsFor(run: RunWithChildren, hrMax: HrMax | null): Flag[] {
  const input = toSessionInput(run)
  const metrics = computeSessionMetrics(input, hrMax)
  return evaluateSessionFlags(metrics, input.splits.find((s) => !s.partial) ?? null)
}

function inRange<T extends { occurredOn: string }>(
  runs: readonly T[],
  startISO: DateISO,
  endExclusiveISO: DateISO,
): T[] {
  return runs.filter((r) => r.occurredOn >= startISO && r.occurredOn < endExclusiveISO)
}

/**
 * The bucket a period's pace comparison is made in — the one most of its runs landed in.
 *
 * "Pace at matched distance" is the only pace worth comparing across periods (a week of 5Ks is
 * not slower than a week of half-marathons, it is a different kind of week), and picking the
 * *dominant* bucket rather than a fixed one means the comparison follows the runner's actual
 * habit instead of a constant somebody chose. Ties break toward more distance covered, then on
 * the fixed order below so the answer never depends on row order.
 */
const BUCKET_ORDER: DistanceBucket[] = ['10k', '5k', 'half', 'full', 'other']

export function dominantBucket(runs: readonly { distanceM: number }[]): DistanceBucket | null {
  if (runs.length === 0) return null
  const tally = new Map<DistanceBucket, { count: number; distanceM: number }>()
  for (const run of runs) {
    const bucket = bucketForDistanceM(run.distanceM)
    const acc = tally.get(bucket) ?? { count: 0, distanceM: 0 }
    acc.count += 1
    acc.distanceM += run.distanceM
    tally.set(bucket, acc)
  }

  let best: DistanceBucket | null = null
  let bestAcc = { count: -1, distanceM: -1 }
  for (const bucket of BUCKET_ORDER) {
    const acc = tally.get(bucket)
    if (acc == null) continue
    if (
      acc.count > bestAcc.count ||
      (acc.count === bestAcc.count && acc.distanceM > bestAcc.distanceM)
    ) {
      best = bucket
      bestAcc = acc
    }
  }
  return best
}

function paceInBucket(
  runs: readonly { distanceM: number; durationSec: number }[],
  bucket: DistanceBucket | null,
): number | null {
  if (bucket == null) return null
  return paceByBucket(runs)[bucket] ?? null
}

function narrativeProfileOf(
  profile: {
    birthYear: number | null
    heightCm: number | null
    weightKg: number | null
    sex: Sex | null
  } | null,
): NarrativeProfile | null {
  // Still field-by-field, never a spread of the row — see `NarrativeProfile`'s own note. What
  // changed under RU-1 is WHICH fields, not whether they are enumerated: `weightKg` and `sex` are
  // now carried, `restingHr` / `maxHr` / `onboardedAt` / `updatedAt` still are not, and the
  // enumeration is what keeps that a decision rather than an accident.
  return profile == null
    ? null
    : {
        birthYear: profile.birthYear,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        sex: profile.sex,
      }
}

/**
 * The newest insight for the period immediately before this one — R-19's memory. Reads
 * `insights_latest_idx`, and deliberately ignores `facts_hash`: what matters is *what we told the
 * runner*, whichever version of the facts produced it.
 */
export async function getPreviousInsight(
  userId: string,
  scope: InsightScope,
  precedingScopeKey: string,
): Promise<PreviousInsightSummary | null> {
  const row = await getLatestInsight(userId, scope, precedingScopeKey)
  return summarisePreviousInsight(row)
}

/* ============================================================================
 * Session
 * ==========================================================================*/

/** `null` when the run does not exist, is not this user's, or has not been reviewed (D16). */
export async function loadSessionFacts(
  userId: string,
  runId: string,
): Promise<SessionNarrateFacts | null> {
  const [run, hrMax, profile] = await Promise.all([
    getRunDetail(userId, runId),
    /*
     * `resolveHrMax`, not `resolveHrMaxAsOf(run.occurredOn)`. The run detail page renders
     * `avgHrPctMax` against the CURRENT resolution, and the prose sits directly beneath that
     * number — an insight quoting 91.5% under a stat tile reading 92.5% is worse than either
     * being slightly stale. R-11 then freezes whichever value was used into the payload, so the
     * pair stays consistent for that row forever.
     */
    resolveHrMax(userId),
    getProfile(userId),
  ])
  if (run == null || run.reviewedAt == null) return null

  const input = toSessionInput(run)
  const metrics = computeSessionMetrics(input, hrMax)
  const flags = evaluateSessionFlags(metrics, input.splits.find((s) => !s.partial) ?? null)

  /*
   * Both history reads together, and both AFTER the `reviewedAt` guard above — a draft run
   * returns `null` without ever asking the database about its neighbours.
   */
  const [weeklyContext, recentRuns] = await Promise.all([
    loadWeeklyContext(userId, run.occurredOn),
    loadRecentRuns(userId, run),
  ])

  return buildSessionFacts({
    run: {
      occurredOn: run.occurredOn,
      distanceM: run.distanceM,
      durationSec: run.durationSec,
      avgPaceSec: run.avgPaceSec,
      avgHr: run.avgHr,
      maxHr: run.maxHr,
      avgCadence: run.avgCadence,
      elevationM: run.elevationM,
      activeKcal: run.activeKcal,
      intent: run.intent,
    },
    metrics,
    flags,
    splits: input.splits,
    profile: narrativeProfileOf(profile),
    weeklyContext,
    recentRuns,
    promptVersion: promptVersionFor('session'),
  })
}

/**
 * How many earlier runs the narrator gets. **A count, with no calendar bound** (F28).
 *
 * A bound was the obvious second knob and it is deliberately absent: it would return an EMPTY
 * list precisely in the case that needs history most — the first run back after a layoff — which
 * is the exact blindness this exists to fix. A row reading "Sat, 14 Feb 2026 · 189 days before"
 * tells the model everything a bound would have decided on its behalf, because `daysBefore` ships
 * with every row.
 *
 * Eight is ~2 months of history for a once-a-week runner and ~8 days for a daily one — enough to
 * read a pattern at either end. It is also the token budget: eight short rows is ~250-400 input
 * tokens against a 1,743-token baseline.
 */
const RECENT_RUN_COUNT = 8

/**
 * The runs immediately before this one, newest first — the history the narrator reads instead of
 * inferring a routine from `runsPerWeek` alone.
 *
 * The columns are already exactly what `RecentRunInput` wants, but the two types are kept
 * separate rather than one shared alias: `lib/llm/facts.ts` declares what a model may see, and a
 * database row type is not that declaration. This mapping is where the two are checked against
 * each other, which is the same reason `narrativeProfileOf` above copies field by field.
 */
async function loadRecentRuns(
  userId: string,
  run: { occurredOn: DateISO; startedAt: string | null },
): Promise<RecentRunInput[]> {
  const rows = await getReviewedRunsBefore(userId, run, RECENT_RUN_COUNT)
  return rows.map((r) => ({
    occurredOn: r.occurredOn,
    distanceM: r.distanceM,
    durationSec: r.durationSec,
    avgPaceSec: r.avgPaceSec,
    avgHr: r.avgHr,
    intent: r.intent,
    zones: r.zones,
  }))
}

/**
 * "Is this run typical for this runner?" — the 28 days ENDING ON the run's own date, never the 28
 * days ending today. Narrating a run from March in August must not cite August's volume as
 * context for it; the numbers would be true and the sentence would be nonsense.
 *
 * `null` when there is no other run in the window: "you average 1 run a week and 10.7 km" said
 * about the only run on record is a statistic about a sample of one.
 */
async function loadWeeklyContext(userId: string, occurredOn: DateISO) {
  const runs = await getRunsBetween(userId, addDays(occurredOn, -27), addDays(occurredOn, 1))
  if (runs.length < 2) return null

  const volumeM = runs.reduce((sum, r) => sum + r.distanceM, 0)
  return {
    runsPerWeek: Math.round((runs.length / 4) * 10) / 10,
    typicalDistanceKm: Math.round(volumeM / runs.length) / 1000,
    monthlyVolumeKm: Math.round(volumeM) / 1000,
  }
}

/* ============================================================================
 * Week
 * ==========================================================================*/

export async function loadWeekFacts(
  userId: string,
  weekKey: IsoWeekKey,
  todayISO: DateISO = todayInJakarta(),
): Promise<WeekNarrateFacts> {
  const { startISO, endExclusiveISO } = isoWeekRange(weekKey)
  const previousKey = isoWeekKeyOf(addDays(startISO, -7))
  const previousRange = isoWeekRange(previousKey)

  const [history, hrMax, profile, previousInsight] = await Promise.all([
    getReviewedRunsWithChildren(userId),
    resolveHrMax(userId),
    getProfile(userId),
    getPreviousInsight(userId, 'week', previousKey),
  ])

  const thisWeek = inRange(history, startISO, endExclusiveISO)
  const lastWeek = inRange(history, previousRange.startISO, previousRange.endExclusiveISO)

  const previousVolumeM = lastWeek.reduce((sum, r) => sum + r.distanceM, 0)
  const metrics = computeWeekMetrics(
    weekKey,
    thisWeek.map((r) => ({
      runId: r.id,
      occurredOn: r.occurredOn,
      distanceM: r.distanceM,
      durationSec: r.durationSec,
      zones: r.zones.map((z) => ({
        zone: z.zone as ZoneRow['zone'],
        durationSec: z.durationSec,
        minBpm: z.minBpm,
        maxBpm: z.maxBpm,
      })),
    })),
    previousVolumeM,
  )

  const bucket = dominantBucket(thisWeek)
  const acwr = acwrAsOf(history, weekEndFor(startISO, todayISO))
  const previousAcwr = acwrAsOf(history, weekEndFor(previousRange.startISO, todayISO))

  return buildWeekFacts({
    isoWeek: weekKey,
    profile: narrativeProfileOf(profile),
    hrMax,
    runCount: metrics.runCount,
    volumeM: metrics.volumeM,
    longestRunM: metrics.longestRunM,
    z1z2SharePct: metrics.z1z2SharePct,
    acuteChronicRatio: acwr.ratio,
    comparablePaceSecPerKm: paceInBucket(thisWeek, bucket),
    comparableBucket: bucket,
    previousWeek:
      lastWeek.length === 0 && previousVolumeM === 0
        ? null
        : {
            volumeM: previousVolumeM,
            runCount: lastWeek.length,
            // The PREVIOUS week is compared in THIS week's bucket, not its own. A pace delta
            // between two different distances is not a pace delta.
            comparablePaceSecPerKm: paceInBucket(lastWeek, bucket),
          },
    previousInsight,
    previousFlags: periodFlags(lastWeek, hrMax, {
      jumped: false,
      acwrOutOfRange: isAcwrOutOfRange(previousAcwr),
      acwrRatio: previousAcwr.ratio,
    }),
    flags: periodFlags(thisWeek, hrMax, {
      jumped: metrics.jumpWarning,
      acwrOutOfRange: isAcwrOutOfRange(acwr),
      acwrRatio: acwr.ratio,
    }),
    promptVersion: promptVersionFor('week'),
  })
}

/**
 * ACWR is a rolling window ending on a DAY, and R-6 is explicit that it answers "right now",
 * never "as of March". For a week in the past the honest anchor is that week's last day; for the
 * current week it is today, because the remaining days have not happened.
 */
function weekEndFor(weekStartISO: DateISO, todayISO: DateISO): DateISO {
  const weekEnd = addDays(weekStartISO, 6)
  return weekEnd < todayISO ? weekEnd : todayISO
}

function acwrAsOf(history: readonly { occurredOn: DateISO; distanceM: number }[], asOf: DateISO) {
  return computeAcwr(
    history.map((r) => ({ occurredOn: r.occurredOn, distanceM: r.distanceM })),
    asOf,
    history[0]?.occurredOn ?? null,
  )
}

function periodFlags(
  runs: readonly RunWithChildren[],
  hrMax: HrMax | null,
  period: { jumped: boolean; acwrOutOfRange: boolean; acwrRatio: number | null },
): FlagFact[] {
  const extra: FlagFact[] = []
  if (period.jumped) extra.push({ code: VOLUME_JUMP, severity: 'info', value: 1 })
  if (period.acwrOutOfRange && period.acwrRatio != null) {
    // 'warn', not 'info': R-6 calls this an injury-risk signal. The prompts cap how loudly it may
    // be said ("mention it once, plainly"); the severity is what makes it worth mentioning.
    extra.push({ code: ACWR_OUT_OF_RANGE, severity: 'warn', value: period.acwrRatio })
  }
  return aggregatePeriodFlags(
    runs.map((run) => flagsFor(run, hrMax)),
    extra,
  )
}

/* ============================================================================
 * Month
 * ==========================================================================*/

export async function loadMonthFacts(
  userId: string,
  monthKeyValue: MonthKey,
  todayISO: DateISO = todayInJakarta(),
): Promise<MonthNarrateFacts> {
  const { startISO, endExclusiveISO } = monthRange(monthKeyValue)
  const previousKey = addMonths(monthKeyValue, -1)
  const previousRange = monthRange(previousKey)

  const [history, hrMax, profile, previousInsight] = await Promise.all([
    getReviewedRunsWithChildren(userId),
    resolveHrMax(userId),
    getProfile(userId),
    getPreviousInsight(userId, 'month', previousKey),
  ])

  const thisMonth = inRange(history, startISO, endExclusiveISO)
  const lastMonth = inRange(history, previousRange.startISO, previousRange.endExclusiveISO)
  const bucket = dominantBucket(thisMonth)

  /*
   * The week-by-week series is what makes a month a SHAPE rather than a bigger week — the prompt
   * asks whether the runner was building, holding, cutting back or overreaching, and no total can
   * answer that. Weeks are keyed by ISO week, so a month's first and last weeks are usually
   * partial; that is correct, and the model is told the key rather than "week 1 of 4".
   */
  const weekly = new Map<IsoWeekKey, number>()
  for (const run of thisMonth) {
    const key = isoWeekKeyOf(run.occurredOn)
    weekly.set(key, (weekly.get(key) ?? 0) + run.distanceM)
  }
  const weeklyVolumeSeries = [...weekly.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([isoWeek, volumeM]) => ({ isoWeek, volumeM }))

  const zoneTotals = new Map<number, number>()
  let zoneTotalSec = 0
  for (const run of thisMonth) {
    for (const zone of run.zones) {
      zoneTotals.set(zone.zone, (zoneTotals.get(zone.zone) ?? 0) + zone.durationSec)
      zoneTotalSec += zone.durationSec
    }
  }
  const zonePct =
    zoneTotalSec === 0
      ? []
      : [...zoneTotals.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([zone, sec]) => ({ zone, pct: (sec / zoneTotalSec) * 100 }))

  const acwr = acwrAsOf(history, monthEndFor(endExclusiveISO, todayISO))
  const previousAcwr = acwrAsOf(history, monthEndFor(previousRange.endExclusiveISO, todayISO))

  return buildMonthFacts({
    monthKey: monthKeyValue,
    profile: narrativeProfileOf(profile),
    hrMax,
    runCount: thisMonth.length,
    volumeM: thisMonth.reduce((sum, r) => sum + r.distanceM, 0),
    weeklyVolumeSeries,
    paceTrend: thisMonth
      .filter((r) => bucket != null && bucketForDistanceM(r.distanceM) === bucket)
      .map((r) => ({
        occurredOn: r.occurredOn,
        paceSecPerKm: r.avgPaceSec,
        distanceM: r.distanceM,
      })),
    comparableBucket: bucket,
    zonePct,
    acuteChronicRatioTrend: weeklyVolumeSeries.map(({ isoWeek }) => ({
      isoWeek,
      ratio: acwrAsOf(history, weekEndFor(isoWeekRange(isoWeek).startISO, todayISO)).ratio,
    })),
    comparablePaceSecPerKm: paceInBucket(thisMonth, bucket),
    previousMonth:
      lastMonth.length === 0
        ? null
        : {
            volumeM: lastMonth.reduce((sum, r) => sum + r.distanceM, 0),
            runCount: lastMonth.length,
            comparablePaceSecPerKm: paceInBucket(lastMonth, bucket),
          },
    previousInsight,
    previousFlags: periodFlags(lastMonth, hrMax, {
      jumped: false,
      acwrOutOfRange: isAcwrOutOfRange(previousAcwr),
      acwrRatio: previousAcwr.ratio,
    }),
    flags: periodFlags(thisMonth, hrMax, {
      jumped: false,
      acwrOutOfRange: isAcwrOutOfRange(acwr),
      acwrRatio: acwr.ratio,
    }),
    promptVersion: promptVersionFor('month'),
  })
}

function monthEndFor(endExclusiveISO: DateISO, todayISO: DateISO): DateISO {
  const lastDay = addDays(endExclusiveISO, -1)
  return lastDay < todayISO ? lastDay : todayISO
}
