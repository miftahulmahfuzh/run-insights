import { daysBetween } from '@/lib/date/ranges'
import type { RunIntent } from '@/lib/db/schema'
import { formatDay, formatDuration, formatPace } from '@/lib/format'
import { ageFromBirthYear } from '@/lib/metrics/age'
import type { Flag } from '@/lib/metrics/flags'
import type { HrMax, HrMaxSource } from '@/lib/metrics/hrMax'
import type { SessionMetrics, SplitRow } from '@/lib/metrics/types'
import type { DistanceBucket } from '@/lib/metrics/week'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE BOUNDARY. Everything the model is allowed to know is built here, and nothing else exists
 *  to it. Pure functions, no I/O, no `server-only` — `lib/insights/load.ts` does the fetching
 *  and hands the rows in, exactly the way `lib/records/recompute.ts` takes a gateway.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT NEVER ENTERS A PAYLOAD, AND WHY EACH ONE IS A SEPARATE DECISION ──────────────────────
 *
 *  · **`weightKg`** — D15 / R-28. `research/narrate.mjs`'s `profile` object carried it; this
 *    feature drops it, and `NarrativeProfile` below is a two-field type rather than F03's
 *    `Profile` so that passing it is a compile error rather than a code-review catch.
 *    `scripts/check-llm-payload-boundary.mjs` greps for the name across `lib/llm/` in CI, because
 *    a type only protects the path that goes through the type.
 *
 *  · **`runs.note`** — a runner's own words can contain numbers ("did 15k today") that disagree
 *    with the reviewed record. Mixing verified and unverified numeric claims in one prompt is
 *    exactly the ambiguity D2 exists to prevent.
 *
 *  · **Raw per-second HR or GPS series** — F06 never computes from them either. Only
 *    zone-bucketed durations, already aggregated, go in.
 *
 *  · **Anything requiring arithmetic to answer.** If F06 has not precomputed it as a field, it
 *    does not exist. MEASURED (IMPLEMENTATION_PLAN §1.5): asked to compute aerobic decoupling
 *    from raw splits, `glm-5.3` returned −14.1% against a true +12.3% — a flipped sign, on a
 *    calculation easier than most of the ones a "the model can probably manage this" exception
 *    would cover.
 *
 * ── EVERY STRING COMES FROM `lib/format.ts` ───────────────────────────────────────────────────
 * A pace in the prompt is `formatPace(442, true)`, the same call the run detail page makes, so
 * the model reads the exact characters the runner reads. Two spellings of one number is how a
 * narrative ends up quoting `7:22` at someone looking at `7'22"/km` and sounding like it read a
 * different run (R-23, one layer out).
 */

/* ============================================================================
 * Shared shapes
 * ==========================================================================*/

/**
 * The profile, minus everything a coach must not see. Two fields, both self-reported, both
 * labelled as such in every prompt (§1.2) — they come from a form, not a sensor.
 */
export interface NarrativeProfile {
  birthYear: number | null
  heightCm: number | null
}

export interface ProfileFacts {
  age: number | null
  heightCm: number | null
  /**
   * Carries its `source` into the prompt, and every prompt has a rule about it: an `estimated`
   * HRmax is a Tanaka formula and must be called a formula whenever a percentage leans on it.
   * IMPLEMENTATION_PLAN §4.1 measured the estimate wrong by 2 bpm on the very first run analysed;
   * presenting a formula as a measurement is the most likely way this app gives bad advice.
   */
  hrMax: { bpm: number; source: HrMaxSource } | null
}

export interface SplitFact {
  km: number
  pace: string
  hr: number | null
  cadence: number | null
  partial: boolean
}

export interface FlagFact {
  /** F06 owns the catalog. The narrator is handed codes that fired; it never coins one. */
  code: string
  severity: 'info' | 'warn'
  value: number
}

/* ============================================================================
 * Session
 * ==========================================================================*/

export interface SessionFacts {
  /** A display label only — "Thu, 20 Aug 2026". Never used for date math by anyone. */
  date: string
  distanceKm: number
  duration: string
  avgPace: string
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  elevationGainM: number | null
  activeKcal: number | null
  /**
   * Ground truth once answered (§4). `null` means never asked or never answered — keep asking.
   * `'unspecified'` means the runner was asked and chose "Not sure", which is a real answer and
   * closes the question. Prompt rule 6 enforces the distinction; asking twice is the nagging the
   * product's core tenet forbids.
   */
  intent: RunIntent | null
}

export interface ComputedFacts {
  avgHrPctOfMax: number | null
  aerobicDecouplingPct: number | null
  firstToSecondHalfDriftSecPerKm: number | null
  paceStdDevSec: number | null
  fastestKm: { km: number; pace: string } | null
  slowestKm: { km: number; pace: string } | null
  cadenceFadeSpm: number | null
  hrRecovery1MinBpm: number | null
  percentTimeInZone4And5: number | null
  zoneBreakdown: Array<{ zone: number; pct: number; duration: string }>
}

export interface WeeklyContextFacts {
  runsPerWeek: number
  typicalDistanceKm: number
  monthlyVolumeKm: number
}

/**
 * One earlier run, as the narrator sees it (F28).
 *
 * ── WHY `daysBefore` IS A NUMBER AND NOT LEFT TO THE MODEL ────────────────────────────────────
 * HARD RULE #1 of the session prompt is "do NOT compute new numbers". Shipping two dates and
 * expecting the gap between them to be worked out would be asking the model to break the one
 * rule that keeps every other figure in the narrative honest — and date arithmetic is not
 * obviously easier than the decoupling it got backwards by a sign (see the header above). So the
 * gap is precomputed here, in whole days, the same way every percentage is.
 *
 * ── WHY NO SPLITS ─────────────────────────────────────────────────────────────────────────────
 * §1.1 admits exactly one full child inclusion per payload and this run's own splits already
 * spend it. Eight earlier runs at eleven splits each would be 88 rows of pace-and-HR for the
 * model to average by hand, which is the precise thing this boundary exists to prevent. What
 * survives is the one aggregate that decides the advice: how hard the run was.
 */
export interface RecentRunFact {
  date: string
  /** Whole days from this run to the session being narrated. Always >= 0. */
  daysBefore: number
  distanceKm: number
  duration: string
  avgPace: string
  avgHr: number | null
  percentTimeInZone4And5: number | null
  intent: RunIntent | null
}

export interface SessionNarrateFacts {
  profile: ProfileFacts
  weeklyContext: WeeklyContextFacts | null
  /**
   * The runs immediately before this one, **newest first** — so index 0 is the previous run and
   * `daysBefore` ascends down the array. `[]` (never `null`, unlike `weeklyContext`) when there
   * is no earlier reviewed run; the prompt says what an empty array means so it cannot be read
   * as a runner who does not run.
   */
  recentRuns: RecentRunFact[]
  session: SessionFacts
  computed: ComputedFacts
  splits: SplitFact[]
  flags: FlagFact[]
  /** Bumped by hand whenever the session prompt's text changes. Hashed, never sent (§5.2). */
  promptVersion: number
}

/** The scalar columns of `runs` a narrative reads. Deliberately not `Run` — see `note` above. */
export interface SessionRunFacts {
  occurredOn: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  elevationM: number | null
  activeKcal: number | null
  intent: RunIntent | null
}

/**
 * One earlier run as it arrives from the database, before this file turns it into prose-ready
 * strings. `zones` carries the raw durations rather than a percentage: computing the share is
 * this layer's job, so the rounding happens at the same boundary as every other number here.
 */
export interface RecentRunInput {
  occurredOn: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  intent: RunIntent | null
  zones: readonly { zone: number; durationSec: number }[]
}

export interface BuildSessionFactsInput {
  run: SessionRunFacts
  /** F06's output. Every number below is copied from it; none is recomputed here. */
  metrics: SessionMetrics
  flags: readonly Flag[]
  splits: readonly SplitRow[]
  profile: NarrativeProfile | null
  weeklyContext?: WeeklyContextFacts | null
  /** Newest first, and NOT containing `run` itself — see `getReviewedRunsBefore`. */
  recentRuns?: readonly RecentRunInput[]
  promptVersion: number
  /** Injected so a test can pin the age derived from `birthYear`. */
  now?: Date
}

/**
 * Display precision, applied once, here.
 *
 * Rounding at the boundary rather than at render time is what makes the cache work: an unrounded
 * `decouplingPct` of `12.299999999999999` and `12.3` are the same run to a reader and two
 * different `facts_hash` values to Postgres. Round first, then hash, and a float that wobbles in
 * the sixteenth decimal place stops invalidating a perfectly good insight.
 *
 * It is also the D2 boundary made literal: the model is handed `12.3`, so `12.3` is the only
 * decoupling figure it can possibly quote.
 */
function round1(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10
}

function round0(value: number | null): number | null {
  return value == null ? null : Math.round(value)
}

function profileFacts(
  profile: NarrativeProfile | null,
  hrMax: HrMax | null,
  now: Date,
): ProfileFacts {
  return {
    age: profile?.birthYear == null ? null : ageFromBirthYear(profile.birthYear, now),
    heightCm: profile?.heightCm ?? null,
    hrMax: hrMax == null ? null : { bpm: hrMax.bpm, source: hrMax.source },
  }
}

/**
 * The hard share of one earlier run, from its zone durations. The same
 * `Σ zone>=4 / Σ all zones` that `computeSessionMetrics` derives for the run being narrated —
 * restated here rather than reached for, because pulling in F06 would mean fetching eleven
 * splits per run to satisfy a `SessionInput` that only five zone rows are needed for.
 *
 * `null` when the run has no zone data at all, never 0: "no time above zone 3" and "this watch
 * did not record zones" must not render the same, which is R-9's rule one metric over.
 */
function hardSharePct(zones: readonly { zone: number; durationSec: number }[]): number | null {
  const total = zones.reduce((a, z) => a + z.durationSec, 0)
  if (total === 0) return null
  const hard = zones.filter((z) => z.zone >= 4).reduce((a, z) => a + z.durationSec, 0)
  return (hard / total) * 100
}

function recentRunFacts(runs: readonly RecentRunInput[], occurredOn: string): RecentRunFact[] {
  return runs.map((r) => ({
    date: formatDay(r.occurredOn),
    daysBefore: daysBetween(r.occurredOn, occurredOn),
    distanceKm: Math.round(r.distanceM) / 1000,
    duration: formatDuration(r.durationSec),
    avgPace: formatPace(r.avgPaceSec, true),
    avgHr: r.avgHr,
    percentTimeInZone4And5: round1(hardSharePct(r.zones)),
    intent: r.intent,
  }))
}

export function buildSessionFacts(input: BuildSessionFactsInput): SessionNarrateFacts {
  const { run, metrics, splits, flags } = input
  const now = input.now ?? new Date()

  /*
   * `metrics.hrMaxUsed`, NOT a second `resolveHrMax` call. The denominator that produced
   * `avgHrPctMax` is the one the prose must label, and R-11 freezes exactly this object into
   * `insights.payload`. Resolving it again here would open a window in which the two disagree —
   * a percentage computed against 187 described as being "of your observed 189".
   */
  return {
    profile: profileFacts(input.profile, metrics.hrMaxUsed, now),
    weeklyContext: input.weeklyContext ?? null,
    recentRuns: recentRunFacts(input.recentRuns ?? [], run.occurredOn),
    session: {
      date: formatDay(run.occurredOn),
      distanceKm: Math.round(run.distanceM) / 1000,
      duration: formatDuration(run.durationSec),
      avgPace: formatPace(run.avgPaceSec, true),
      avgHr: run.avgHr,
      maxHr: run.maxHr,
      avgCadence: run.avgCadence,
      elevationGainM: run.elevationM,
      activeKcal: run.activeKcal,
      intent: run.intent,
    },
    computed: {
      avgHrPctOfMax: round1(metrics.avgHrPctMax),
      aerobicDecouplingPct: round1(metrics.decouplingPct),
      firstToSecondHalfDriftSecPerKm: round0(metrics.splitDriftSecPerKm),
      paceStdDevSec: round1(metrics.paceSdSec),
      fastestKm:
        metrics.fastestKm == null
          ? null
          : { km: metrics.fastestKm.km, pace: formatPace(metrics.fastestKm.paceSec) },
      slowestKm:
        metrics.slowestKm == null
          ? null
          : { km: metrics.slowestKm.km, pace: formatPace(metrics.slowestKm.paceSec) },
      cadenceFadeSpm: round0(metrics.cadenceFadeSpm),
      hrRecovery1MinBpm: metrics.hrRecovery1MinBpm,
      percentTimeInZone4And5: round1(metrics.hardPct),
      zoneBreakdown: metrics.zonePct.map((z) => ({
        zone: z.zone,
        pct: round1(z.pct) as number,
        duration: formatDuration(z.durationSec),
      })),
    },
    /*
     * Splits go in whole (§1.1's one qualified inclusion): the model narrates them — "km 1 at
     * 6'36\" against km 10 at 8'00\"" — but every statistic ABOUT them is precomputed above, so
     * it never has to be the place an average is derived. Partial kms carry their flag so D14's
     * exclusion is visible rather than implicit.
     */
    splits: splits.map((s) => ({
      km: s.km,
      pace: formatPace(s.paceSec),
      hr: s.hr,
      cadence: s.cadence,
      partial: s.partial,
    })),
    flags: flags.map((f) => ({ code: f.code, severity: f.severity, value: round1(f.value) ?? 0 })),
    promptVersion: input.promptVersion,
  }
}

/* ============================================================================
 * Insight memory (R-19) — the anti-repetition mechanism
 * ==========================================================================*/

export interface PreviousInsightSummary {
  scopeKey: string
  headline: string
  doNext: string[]
  /** ISO instant, so F08 could frame it as "N days ago" without the model doing date math. */
  createdAt: string
}

/**
 * **The entire anti-repetition mechanism, and it is deterministic on purpose.** Set arithmetic
 * and two subtractions over numbers F06 already computed — never the model diffing two headline
 * strings and inferring what changed, which would be the arithmetic-by-LLM mistake §0.2 exists to
 * prevent, wearing a different hat.
 */
export interface TrendSincePrevious {
  flagsNew: string[]
  flagsResolved: string[]
  flagsPersisting: string[]
  volumeDeltaPct: number | null
  paceDeltaSecPerKmAtMatchedDistance: number | null
}

/**
 * The three lists are **sorted**, not left in set-insertion order. Insertion order here is the
 * order the runs came back from Postgres, which is stable in practice and not guaranteed by
 * anything — and two identical weeks that hash differently because a flag fired on Tuesday
 * instead of Thursday would regenerate an insight nobody asked for, forever. Sorting costs
 * nothing and makes the hash a function of the facts alone.
 */
export function buildTrendSincePrevious(
  currentFlags: readonly FlagFact[],
  previousFlags: readonly FlagFact[],
  currentVolumeKm: number,
  previousVolumeKm: number | null,
  currentPaceAtMatched: number | null,
  previousPaceAtMatched: number | null,
): TrendSincePrevious {
  const curCodes = new Set(currentFlags.map((f) => f.code))
  const prevCodes = new Set(previousFlags.map((f) => f.code))
  const sorted = (codes: string[]) => codes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  return {
    flagsNew: sorted([...curCodes].filter((c) => !prevCodes.has(c))),
    flagsResolved: sorted([...prevCodes].filter((c) => !curCodes.has(c))),
    flagsPersisting: sorted([...curCodes].filter((c) => prevCodes.has(c))),
    volumeDeltaPct:
      previousVolumeKm != null && previousVolumeKm > 0
        ? round1(((currentVolumeKm - previousVolumeKm) / previousVolumeKm) * 100)
        : null,
    paceDeltaSecPerKmAtMatchedDistance:
      currentPaceAtMatched != null && previousPaceAtMatched != null
        ? Math.round(currentPaceAtMatched - previousPaceAtMatched)
        : null,
  }
}

/**
 * Reads a stored `insights.payload` down to the three fields the memory needs. Tolerant by
 * construction, for the same reason `InsightCard` is: the row may predate a schema change, and a
 * malformed memory must degrade to "no memory" rather than throw inside a cron loop.
 */
export function summarisePreviousInsight(
  row: { scopeKey: string; payload: unknown; createdAt: Date } | null,
): PreviousInsightSummary | null {
  if (row == null || row.payload === null || typeof row.payload !== 'object') return null
  const p = row.payload as Record<string, unknown>
  const headline = typeof p.headline === 'string' ? p.headline.trim() : ''
  if (headline === '') return null

  return {
    scopeKey: row.scopeKey,
    headline,
    doNext: Array.isArray(p.doNext)
      ? p.doNext.filter((d): d is string => typeof d === 'string' && d.trim() !== '')
      : [],
    createdAt: row.createdAt.toISOString(),
  }
}

/* ============================================================================
 * Period flags
 * ==========================================================================*/

/**
 * One period's flags, from the session flags of every run in it plus the period-scoped codes F06
 * exports (`ACWR_OUT_OF_RANGE`, `VOLUME_JUMP`).
 *
 * **Deduped to the worst value, not summed and not counted.** "HIGH_DECOUPLING fired on three
 * runs" is a sentence the model would have to do arithmetic to write; "HIGH_DECOUPLING, worst
 * value 14.8" is a fact it can copy. `|value|` is the comparator because `CADENCE_FADE` is worst
 * at its most negative and `TOO_MUCH_HARD` at its most positive.
 *
 * Sorted by code so the hash does not depend on run order — same argument as
 * `buildTrendSincePrevious`.
 */
export function aggregatePeriodFlags(
  perRunFlags: ReadonlyArray<readonly Flag[]>,
  extra: readonly FlagFact[] = [],
): FlagFact[] {
  const worst = new Map<string, FlagFact>()

  for (const flags of perRunFlags) {
    for (const flag of flags) {
      const rounded: FlagFact = {
        code: flag.code,
        severity: flag.severity,
        value: round1(flag.value) ?? 0,
      }
      const held = worst.get(flag.code)
      if (held == null || Math.abs(rounded.value) > Math.abs(held.value)) {
        worst.set(flag.code, rounded)
      }
    }
  }
  for (const flag of extra) worst.set(flag.code, { ...flag, value: round1(flag.value) ?? 0 })

  return [...worst.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

/* ============================================================================
 * Week
 * ==========================================================================*/

export interface WeekMetricsFacts {
  isoWeek: string
  runCount: number
  volumeKm: number
  longestRunKm: number | null
  /** The polarisation check: how much of the week's heart-rate time was genuinely easy. */
  zone1And2Pct: number | null
  /** null until 28 days of history exist — R-6's insufficient-history guard, carried through. */
  acuteChronicRatio: number | null
  /** Formatted pace in the week's dominant distance bucket. The only pace comparable across weeks. */
  avgPaceAtComparableDistance: string | null
  /** Which bucket that was, so the model can say "at 10K distance" rather than "at some distance". */
  comparableDistanceBucket: DistanceBucket | null
}

export interface WeekNarrateFacts {
  profile: ProfileFacts
  week: WeekMetricsFacts
  previousWeek: { volumeKm: number; runCount: number } | null
  previousInsight: PreviousInsightSummary | null
  /** null iff `previousInsight` is null — there is nothing to have moved since. */
  trendSincePrevious: TrendSincePrevious | null
  flags: FlagFact[]
  promptVersion: number
}

export interface BuildWeekFactsInput {
  isoWeek: string
  profile: NarrativeProfile | null
  hrMax: HrMax | null
  runCount: number
  volumeM: number
  longestRunM: number | null
  z1z2SharePct: number | null
  acuteChronicRatio: number | null
  comparablePaceSecPerKm: number | null
  comparableBucket: DistanceBucket | null
  previousWeek: { volumeM: number; runCount: number; comparablePaceSecPerKm: number | null } | null
  previousInsight: PreviousInsightSummary | null
  previousFlags: readonly FlagFact[]
  flags: readonly FlagFact[]
  promptVersion: number
  now?: Date
}

const KM = (metres: number | null): number | null =>
  metres == null ? null : Math.round(metres) / 1000

export function buildWeekFacts(input: BuildWeekFactsInput): WeekNarrateFacts {
  const volumeKm = (KM(input.volumeM) as number) ?? 0

  return {
    profile: profileFacts(input.profile, input.hrMax, input.now ?? new Date()),
    week: {
      isoWeek: input.isoWeek,
      runCount: input.runCount,
      volumeKm,
      longestRunKm: KM(input.longestRunM),
      zone1And2Pct: round1(input.z1z2SharePct),
      acuteChronicRatio: round1(input.acuteChronicRatio == null ? null : input.acuteChronicRatio),
      avgPaceAtComparableDistance:
        input.comparablePaceSecPerKm == null
          ? null
          : formatPace(input.comparablePaceSecPerKm, true),
      comparableDistanceBucket: input.comparableBucket,
    },
    previousWeek:
      input.previousWeek == null
        ? null
        : {
            volumeKm: (KM(input.previousWeek.volumeM) as number) ?? 0,
            runCount: input.previousWeek.runCount,
          },
    previousInsight: input.previousInsight,
    /*
     * Gated on `previousInsight`, not on `previousWeek`. The diff's whole job is to stop the
     * model repeating what it already said — with no prior insight there is nothing to not
     * repeat, and handing it an all-`flagsNew` partition on a runner's first week would invite
     * "this is new" about a week that is the baseline.
     */
    trendSincePrevious:
      input.previousInsight == null
        ? null
        : buildTrendSincePrevious(
            input.flags,
            input.previousFlags,
            volumeKm,
            input.previousWeek == null ? null : (KM(input.previousWeek.volumeM) as number),
            input.comparablePaceSecPerKm,
            input.previousWeek?.comparablePaceSecPerKm ?? null,
          ),
    flags: [...input.flags],
    promptVersion: input.promptVersion,
  }
}

/* ============================================================================
 * Month
 * ==========================================================================*/

export interface MonthMetricsFacts {
  monthKey: string
  runCount: number
  volumeKm: number
  /** "Trend, not a bigger week" — the shape of the month is in this series, not in the total. */
  weeklyVolumeSeries: Array<{ isoWeek: string; volumeKm: number }>
  paceTrendAtMatchedDistance: Array<{ date: string; paceSecPerKm: number; distanceKm: number }>
  comparableDistanceBucket: DistanceBucket | null
  zoneBreakdown: Array<{ zone: number; pct: number }>
  acuteChronicRatioTrend: Array<{ isoWeek: string; ratio: number | null }>
}

export interface MonthNarrateFacts {
  profile: ProfileFacts
  month: MonthMetricsFacts
  previousMonth: { volumeKm: number; runCount: number } | null
  previousInsight: PreviousInsightSummary | null
  trendSincePrevious: TrendSincePrevious | null
  flags: FlagFact[]
  promptVersion: number
}

export interface BuildMonthFactsInput {
  monthKey: string
  profile: NarrativeProfile | null
  hrMax: HrMax | null
  runCount: number
  volumeM: number
  weeklyVolumeSeries: ReadonlyArray<{ isoWeek: string; volumeM: number }>
  paceTrend: ReadonlyArray<{ occurredOn: string; paceSecPerKm: number; distanceM: number }>
  comparableBucket: DistanceBucket | null
  zonePct: ReadonlyArray<{ zone: number; pct: number }>
  acuteChronicRatioTrend: ReadonlyArray<{ isoWeek: string; ratio: number | null }>
  comparablePaceSecPerKm: number | null
  previousMonth: { volumeM: number; runCount: number; comparablePaceSecPerKm: number | null } | null
  previousInsight: PreviousInsightSummary | null
  previousFlags: readonly FlagFact[]
  flags: readonly FlagFact[]
  promptVersion: number
  now?: Date
}

export function buildMonthFacts(input: BuildMonthFactsInput): MonthNarrateFacts {
  const volumeKm = (KM(input.volumeM) as number) ?? 0

  return {
    profile: profileFacts(input.profile, input.hrMax, input.now ?? new Date()),
    month: {
      monthKey: input.monthKey,
      runCount: input.runCount,
      volumeKm,
      weeklyVolumeSeries: input.weeklyVolumeSeries.map((w) => ({
        isoWeek: w.isoWeek,
        volumeKm: (KM(w.volumeM) as number) ?? 0,
      })),
      paceTrendAtMatchedDistance: input.paceTrend.map((p) => ({
        date: formatDay(p.occurredOn),
        paceSecPerKm: Math.round(p.paceSecPerKm),
        distanceKm: Math.round(p.distanceM) / 1000,
      })),
      comparableDistanceBucket: input.comparableBucket,
      zoneBreakdown: input.zonePct.map((z) => ({ zone: z.zone, pct: round1(z.pct) as number })),
      acuteChronicRatioTrend: input.acuteChronicRatioTrend.map((a) => ({
        isoWeek: a.isoWeek,
        ratio: round1(a.ratio),
      })),
    },
    previousMonth:
      input.previousMonth == null
        ? null
        : {
            volumeKm: (KM(input.previousMonth.volumeM) as number) ?? 0,
            runCount: input.previousMonth.runCount,
          },
    previousInsight: input.previousInsight,
    trendSincePrevious:
      input.previousInsight == null
        ? null
        : buildTrendSincePrevious(
            input.flags,
            input.previousFlags,
            volumeKm,
            input.previousMonth == null ? null : (KM(input.previousMonth.volumeM) as number),
            input.comparablePaceSecPerKm,
            input.previousMonth?.comparablePaceSecPerKm ?? null,
          ),
    flags: [...input.flags],
    promptVersion: input.promptVersion,
  }
}

export type NarrateFacts = SessionNarrateFacts | WeekNarrateFacts | MonthNarrateFacts
