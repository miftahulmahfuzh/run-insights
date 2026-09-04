import { BADGE_THRESHOLDS } from '@/lib/badges/catalog'
import { addDays, daysBetween, type DateISO } from '@/lib/date/ranges'
import { ACWR_SWEET_SPOT, computeAcwr, type DailyLoadPoint } from '@/lib/metrics/acwr'
import { FLAG_THRESHOLDS } from '@/lib/metrics/flags'
import { bucketForDistanceM } from '@/lib/metrics/week'
import type { FiredPattern } from '@/lib/nina/context'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  Fixed, hand-authored LONGITUDINAL observations about the runner. **Nina never invents one.**
 *
 *  `lib/metrics/flags.ts` is the precedent and this file is deliberately its mirror: a closed
 *  union of codes, thresholds exported as DATA so a reader can check them without reading control
 *  flow, every threshold STRICT, and one boundary pair per code in the test file. The reasons are
 *  the same reasons. A model free to coin `OVERTRAINING_RISK` is a model making a
 *  medical-adjacent claim nobody wrote, tested, or can reproduce — and R11 asks Nina to SHOUT
 *  about the runner's heart, which raises the cost of a coined code rather than lowering it.
 *
 *  The difference from `flags.ts` is scope. Those seven codes describe one run. These five
 *  describe a HABIT, because R11's operative words are "kept" and "terus2an":
 *
 *      > user kept being late to start the run … or, user kept running on a high avg heart rate.
 *
 *  A habit needs a window and a numeric definition of "kept". Both are below, as data.
 *
 *  ── WHAT THIS FILE MUST NOT DO ──────────────────────────────────────────────────────────────
 *  **No formatting.** `FiredPattern.value` is raw and unrounded, exactly like `Flag.value`, and
 *  `lib/nina/context.ts`'s `PATTERN_VALUE_FORMAT` is the single place it becomes characters. That
 *  is invariant 3 with one home per payload; a `formatClockSec` call in this file would be a
 *  second one.
 *
 *  **No prose.** The anger ladder lives in `lib/nina/persona.ts` (phase 2) and reads the ledger
 *  levels this module's sibling computes. This file emits codes and numbers.
 *
 *  **No SQL.** Invariant 9: the caller reads through `lib/db/queries.ts` — `getReviewedRunWindow`
 *  for the runs — and hands the rows in. Everything here is pure, which is what makes a
 *  fires/does-not-fire test one field toggle.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The closed vocabulary. Five codes, chosen as R11's two named examples plus the three
 * longitudinal concerns the app already has the numbers for.
 *
 * Do not delete a member. `nina_nags` rows survive a code being retired, and `isPatternCode`
 * returns false for an unknown string precisely so a stale ledger row drops out quietly.
 */
export type PatternCode =
  | 'REPEATED_LATE_START'
  | 'REPEATED_HIGH_AVG_HR'
  | 'MISSED_USUAL_DAY'
  | 'PACE_REGRESSION'
  | 'ACWR_SPIKE'

/** Evaluation order, and the order `evaluatePatterns` returns in. */
export const PATTERN_CODES: readonly PatternCode[] = [
  'REPEATED_LATE_START',
  'REPEATED_HIGH_AVG_HR',
  'MISSED_USUAL_DAY',
  'PACE_REGRESSION',
  'ACWR_SPIKE',
]

const CODE_SET: ReadonlySet<string> = new Set<string>(PATTERN_CODES)

/**
 * **The enforcement point for "the model never coins a code."**
 *
 * Anything arriving from outside `lib/` — a `nina_nags` row, a tool argument, a trigger payload —
 * passes through here before it is treated as a pattern. Phase 10 and phase 3 both call it.
 */
export function isPatternCode(value: unknown): value is PatternCode {
  return typeof value === 'string' && CODE_SET.has(value)
}

/**
 * The windows, as data. `PATTERN_THRESHOLDS` answers "how bad", this answers "over what".
 *
 * `runs: 5` is a little over a week at this app's ~17 runs a month: recent enough that he
 * remembers every run in it, long enough that one bad Tuesday cannot trip a pattern.
 */
export const PATTERN_WINDOW = {
  /** How many of the most recent reviewed runs the two `REPEATED_*` codes look at. */
  runs: 5,
  /**
   * `MISSED_USUAL_DAY` looks back this many days, **starting at `asOf − 1`.** `asOf` itself is
   * never judged: a usual day that has not ended yet is not a day he skipped.
   */
  missedDayLookbackDays: 14,
  /** `PACE_REGRESSION` compares this many runs against the this-many immediately before them. */
  paceRegressionRuns: 5,
} as const

/**
 * How many reviewed runs the caller must fetch. Exported so phase 10 and phase 1's gateway pass
 * one number rather than each guessing.
 *
 * It is 40 and not `PATTERN_WINDOW.runs`, because three of the five codes reach further back than
 * the repeat window: `ACWR_SPIKE` needs 28 days of load, `PACE_REGRESSION` needs ten runs *in one
 * distance bucket*, and `MISSED_USUAL_DAY` needs every run day inside a fortnight. At ~4 runs a
 * week, 40 runs is ~10 weeks — comfortably past all three. `getReviewedRunWindow` caps `limit` at
 * 50, so this is a legal argument to it.
 */
export const PATTERN_RUN_FETCH_LIMIT = 40

/**
 * 'HH:MM:SS' or 'HH:MM' to seconds past midnight. Total, because both callers hand it a Postgres
 * `time` literal: `BADGE_THRESHOLDS.lateStartAfter` below and `startSecOf` further down.
 *
 * Declared above `PATTERN_THRESHOLDS` rather than beside its sibling helpers because that object
 * calls it at module-init time. A function declaration would hoist either way; keeping the
 * definition ahead of its one eager caller means a reader never has to know that.
 */
export function clockStringToSec(value: string): number {
  const [h = '0', m = '0', s = '0'] = value.split(':')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

/**
 * Every threshold, as data — `flags.ts`'s `FLAG_THRESHOLDS` property (b), for the same reason:
 * a reader checks the numbers against this plan's table without reading a single `if`.
 *
 * **Three of them are imported rather than restated.** R-42's rule (copy that restates a threshold
 * is a second source of truth for it) applies just as much to a rule that restates another rule's
 * number. `late_start` the badge and `REPEATED_LATE_START` the pattern must agree on when 07:00 is
 * late, and `VERY_HIGH_AVG_HR` the flag and `REPEATED_HIGH_AVG_HR` the pattern must agree on what
 * "high" is — otherwise a run can be flagged hot on its own detail page and not count toward the
 * habit, which is the kind of inconsistency that makes a runner stop trusting the app.
 */
export const PATTERN_THRESHOLDS = {
  /**
   * A start strictly after this fires. Seconds past midnight, 25200 = 07:00:00 — **the same
   * `BADGE_THRESHOLDS.lateStartAfter` the `late_start` badge uses**, and literally the time in
   * R11: *"kalo baru mulai lari jam 7 lu bakal telat ngantor"*.
   */
  lateStartAfterSec: clockStringToSec(BADGE_THRESHOLDS.lateStartAfter),
  /** Average HR strictly above this % of max counts as a hot run. Shared with `VERY_HIGH_AVG_HR`. */
  highAvgHrPctMax: FLAG_THRESHOLDS.VERY_HIGH_AVG_HR,
  /**
   * How many runs in `PATTERN_WINDOW.runs` must offend, **strictly exceeded**. 2 here means "3 of
   * the last 5", and the test reads exactly that way.
   */
  repeatedRuns: 2,
  /**
   * Missed usual days inside the lookback, **strictly exceeded**. 1 here means two misses: one
   * skipped Tuesday is life, two inside a fortnight is a habit.
   */
  missedUsualDays: 1,
  /** Window-over-window slowdown, s/km, strictly exceeded. Two thirds of a `POSITIVE_SPLIT`. */
  paceRegressionSecPerKm: 15,
  /**
   * ACWR strictly above this fires. **The published sweet spot's upper bound, imported** — this
   * is the same 1.3 the rollup page's ACWR chip is drawn against.
   */
  acwrRatioMax: ACWR_SWEET_SPOT.max,
} as const

/**
 * One reviewed run as a pattern rule sees it.
 *
 * **A structural subset of `ReviewedRunWindowRow` minus `splits`**, so
 * `getReviewedRunWindow(...)` is assignable straight into `PatternInput.runs` with no mapping
 * step. Narrow for the reason that function's own doc gives: the field list IS the documentation
 * of what a rule can see, and none of these five rules needs a split, a note or a photo.
 */
export interface PatternRun {
  id: string
  occurredOn: DateISO
  /** Postgres `time`, 'HH:MM:SS'. Null when the screenshot carried no start time. */
  startedAt: string | null
  distanceM: number
  durationSec: number
  avgHr: number | null
  avgPaceSec: number
}

/**
 * Everything the five rules need, and nothing they do not.
 *
 * Taking resolved inputs rather than a `userId` is what `evaluateSessionFlags` does and for the
 * same payoff: a boundary test hand-builds one of these and toggles one field, with no database,
 * no fixture and no arithmetic in sight.
 */
export interface PatternInput {
  /**
   * Reviewed runs, **NEWEST FIRST** — exactly `getReviewedRunWindow`'s
   * `(occurred_on, started_at) DESC` order, so `runs[0]` is the most recent run and the "most
   * recent offender" rule below is an array scan and not a sort.
   */
  runs: readonly PatternRun[]
  /** The day the judgement is made, Asia/Jakarta. `todayInJakarta()` at the call site. */
  asOf: DateISO
  /**
   * `resolveHrMax(...).bpm`. **Null disables `REPEATED_HIGH_AVG_HR` entirely** — absence is not
   * "his heart was fine", exactly as `VERY_HIGH_AVG_HR` disappears rather than reassuring.
   */
  hrMaxBpm: number | null
  /**
   * ISO weekdays he usually runs, 1 = Monday … 7 = Sunday, from phase 5's `running_days` memory
   * slot. **Already parsed**: the slot's stored `value` is a display-ready string and parsing it
   * is phase 5's job, not a pattern rule's. Empty disables `MISSED_USUAL_DAY`.
   */
  usualRunningDays: readonly number[]
  /**
   * His first-ever reviewed run. `computeAcwr` cannot see it from a windowed slice and uses it for
   * the insufficient-history guard, which is why that function takes it as a third argument.
   */
  firstRunOn: DateISO | null
}

/**
 * **An alias of phase 2's `FiredPattern`, and nothing more** (RULING G2). One definition of the
 * shape, no structural copy: phase 2 declares `code` as `string` because the context layer must
 * survive a code it has never heard of, and narrowing it here would be a second declaration of
 * the other five fields to buy nothing the `satisfies PatternCode` below does not already buy.
 *
 * The name exists so a reader of this file can see at the return type which catalog is meant.
 */
export type FiredNinaPattern = FiredPattern

/** A run's start, or null when it has none or the string is not a clock. */
export function startSecOf(startedAt: string | null): number | null {
  if (startedAt == null) return null
  const sec = clockStringToSec(startedAt)
  return Number.isFinite(sec) ? sec : null
}

/**
 * ISO weekday of a calendar date: 1 = Monday … 7 = Sunday.
 *
 * Parsed as UTC midnight on purpose. A `DateISO` in this app is already a Jakarta calendar day
 * (`jakartaDayOf` produced it), so re-interpreting it in the runtime's local zone is how a
 * Monday becomes a Sunday on a machine west of Greenwich.
 */
export function isoWeekdayOf(dateISO: DateISO): number {
  const sundayFirst = new Date(`${dateISO}T00:00:00Z`).getUTCDay()
  return ((sundayFirst + 6) % 7) + 1
}

/**
 * *"user kept being late to start the run. then nina will say: 'udah gw bilang kalo baru mulai lari
 * jam 7 lu bakal telat ngantor, BEGO!!'"* — R11, verbatim.
 *
 * **Overlap with the `late_start` badge, and why this still needs to exist.** `late_start`
 * ("Fashionably Late") fires on the same 07:00 boundary, and imports the same threshold so they
 * cannot drift. But a badge is an AWARD: it is granted once, retrospectively, for one run, and its
 * whole tone rule (§4.6) is that a tile is an invitation and never a nag. A pattern is a STANDING
 * CONCERN — it says nothing about a single late start and everything about the third one, it can
 * un-fire when he changes, and it carries a ledger. Collapsing them would either make the badge
 * scold or make the pattern congratulate.
 *
 * `value` is the **most recent** offending start, not a mean of them. A mean of five clock times is
 * a number that never appeared on his watch; `runs[0]`-most offender is one he can check.
 *
 * A run with no `started_at` is not an offence. The screenshot simply did not carry a start, and
 * counting an absence as lateness is the "absent is not false" rule from `flags.ts`.
 */
function repeatedLateStart(input: PatternInput): FiredNinaPattern | null {
  const window = input.runs.slice(0, PATTERN_WINDOW.runs)
  const late = window.filter((r) => {
    const sec = startSecOf(r.startedAt)
    return sec != null && sec > PATTERN_THRESHOLDS.lateStartAfterSec
  })
  if (late.length <= PATTERN_THRESHOLDS.repeatedRuns) return null

  const mostRecent = late[0]!
  return {
    code: 'REPEATED_LATE_START' satisfies PatternCode,
    severity: 'warn',
    value: startSecOf(mostRecent.startedAt)!,
    unit: 'clock',
    occurrences: late.length,
    windowRuns: window.length,
  }
}

/**
 * *"user kept running on a high avg heart rate. then nina will say: 'lo terus2an lari kaya gitu
 * lama2 JANTUNG LO BAKAL PECAH TAH'"* — R11, verbatim. This is the code that earns rung 4 of the
 * anger ladder on its own, per `persona.ts`: *"a warn-severity pattern about his heart."*
 *
 * The per-run percentage is `avgHr / hrMax × 100`, the identical expression
 * `computeSessionMetrics` uses for `avgHrPctMax` (§3.5) — restated here rather than imported
 * because that one is computed per session from a `SessionMetricsInput` this module does not have,
 * and building five of those to read one field would be the more surprising code. **If phase 10
 * ever has `SessionMetrics` in hand for the window anyway, pass `avgHrPctMax` in rather than
 * recomputing it — a widened `PatternRun`, not a second expression.**
 *
 * A null `hrMaxBpm` disables the code rather than estimating one: `resolveHrMax` already degrades
 * measured → observed → Tanaka → null, and second-guessing its null here would be a fourth
 * opinion about a number §4.4 says has exactly one home.
 */
function repeatedHighAvgHr(input: PatternInput): FiredNinaPattern | null {
  const hrMax = input.hrMaxBpm
  if (hrMax == null || hrMax <= 0) return null

  const window = input.runs.slice(0, PATTERN_WINDOW.runs)
  const hot: number[] = []
  for (const run of window) {
    if (run.avgHr == null) continue
    const pct = (run.avgHr / hrMax) * 100
    if (pct > PATTERN_THRESHOLDS.highAvgHrPctMax) hot.push(pct)
  }
  if (hot.length <= PATTERN_THRESHOLDS.repeatedRuns) return null

  return {
    code: 'REPEATED_HIGH_AVG_HR' satisfies PatternCode,
    severity: 'warn',
    /* Newest first, so hot[0] is the most recent hot run — the reading he can go and check. */
    value: hot[0]!,
    unit: 'percent',
    occurrences: hot.length,
    windowRuns: window.length,
  }
}

/**
 * A usual day with no run on it. The one code whose window is DAYS rather than runs, because the
 * thing being counted is an absence and an absence has no run row.
 *
 * **`asOf` itself is never examined.** The loop starts at `asOf − 1`: a Tuesday that has not ended
 * yet is not a Tuesday he skipped, and judging it would make the code fire every single morning of
 * every usual day. Phase 10 decides *when* to look; this decides *what is true*.
 *
 * **Overlap with `consistency_gremlin`, and why this still needs to exist.** The gremlin badge
 * counts ISO weeks that hit 4 runs — a volume streak, week-shaped, and it can be satisfied by four
 * runs crammed into a weekend. This is day-shaped and reads his own stated routine from memory, so
 * it can say *"lo bolos hari Selasa"* about a Tuesday he told her he runs. Different question,
 * different data source, and the badge cannot answer this one at all.
 *
 * `windowRuns` here counts **usual-day slots in the lookback, not runs** — the only code where
 * that field is not a run count. It is what makes phase 2's rendering read "2 of your 4 usual
 * Tuesdays" instead of a bare count, and the deviation is deliberate rather than an oversight.
 */
function missedUsualDay(input: PatternInput): FiredNinaPattern | null {
  if (input.usualRunningDays.length === 0) return null

  const usual = new Set<number>(input.usualRunningDays)
  const ranOn = new Set<string>(input.runs.map((r) => r.occurredOn))

  const missed: DateISO[] = []
  let slots = 0
  for (let back = 1; back <= PATTERN_WINDOW.missedDayLookbackDays; back += 1) {
    const day = addDays(input.asOf, -back)
    if (!usual.has(isoWeekdayOf(day))) continue
    slots += 1
    if (!ranOn.has(day)) missed.push(day)
  }
  if (missed.length <= PATTERN_THRESHOLDS.missedUsualDays) return null

  /* The loop walks backwards from asOf, so missed[0] is the nearest one. */
  return {
    code: 'MISSED_USUAL_DAY' satisfies PatternCode,
    severity: 'info',
    value: daysBetween(missed[0]!, input.asOf),
    unit: 'days',
    occurrences: missed.length,
    windowRuns: slots,
  }
}

/**
 * Distance-weighted pace over a set of runs, or null when the set carries no distance or time.
 *
 * **`lib/metrics/pace.ts`'s `avgPaceSecPerKm` is deliberately NOT used here, and this is the one
 * place in this file that does not reuse an existing helper.** That function ends in
 * `Math.round(...)`, which is correct for everything that displays a pace and wrong for this:
 * rounding each side to whole seconds before subtracting quantises the delta to integers, so a
 * genuine 15.1 s/km regression arrives as exactly 15 and lands on the wrong side of a strict
 * threshold. `FiredPattern.value` is contractually raw and unrounded; `PATTERN_VALUE_FORMAT`'s
 * `paceDelta` does the rounding, once, at the point of display.
 */
function weightedPace(runs: readonly PatternRun[]): number | null {
  const distanceM = runs.reduce((a, r) => a + r.distanceM, 0)
  const durationSec = runs.reduce((a, r) => a + r.durationSec, 0)
  if (distanceM <= 0 || durationSec <= 0) return null
  return durationSec / (distanceM / 1000)
}

/**
 * Getting slower at the effort he most recently ran.
 *
 * **Bucketed, and distance-weighted, for `week.ts`'s two reasons.** An 8 km run and an 11 km run
 * are the same kind of session and comparing their paces is meaningful; comparing an 8 km against
 * a 21 km is not, so the comparison is scoped to `bucketForDistanceM(runs[0])` — the bucket of the
 * effort he just did, which is the one he is thinking about. And each side is
 * `Σ duration / (Σ distance / 1000)` rather than a mean of the runs' own `avg_pace_sec`,
 * because a 5 km jog must not weigh the same as a 15 km tempo.
 *
 * **Never fires on thin history.** It needs ten runs in one bucket, and returns null rather than
 * comparing three against two — the same choice `computeAcwr`'s insufficient-history guard makes,
 * and for the same reason: a ratio computed over a window that is mostly nothing produces a
 * confident number about noise.
 *
 * `avgPaceSec` is on `PatternRun` and deliberately unused here. It is the run's own stored pace,
 * which is the wrong input for a weighted comparison, and it stays on the type because
 * `ReviewedRunWindowRow` carries it and phase 10 may want it for a different purpose.
 */
function paceRegression(input: PatternInput): FiredNinaPattern | null {
  const newest = input.runs[0]
  if (newest == null) return null

  const bucket = bucketForDistanceM(newest.distanceM)
  const inBucket = input.runs.filter((r) => bucketForDistanceM(r.distanceM) === bucket)

  const n = PATTERN_WINDOW.paceRegressionRuns
  if (inBucket.length < n * 2) return null

  const recentPace = weightedPace(inBucket.slice(0, n))
  const olderPace = weightedPace(inBucket.slice(n, n * 2))
  if (recentPace == null || olderPace == null) return null

  /* Positive = slower now. s/km, signed, exactly what `formatPaceDelta` expects. */
  const delta = recentPace - olderPace
  if (delta <= PATTERN_THRESHOLDS.paceRegressionSecPerKm) return null

  return {
    code: 'PACE_REGRESSION' satisfies PatternCode,
    severity: 'info',
    value: delta,
    unit: 'paceDelta',
    occurrences: n,
    windowRuns: n * 2,
  }
}

/**
 * Acute:chronic workload ratio above the sweet spot. **`computeAcwr` already does the arithmetic
 * and the phase scope is explicit that this reuses it rather than recomputing** — which also means
 * this code inherits that function's hard-won definition (Gabbett's coupled form, chronic side
 * divided by four) instead of re-deriving a ratio that is identically 0.25 forever.
 *
 * **High side only.** `isAcwrOutOfRange` is not reused, because it fires in both directions and a
 * taper is not a tough-love moment however large the drop. This is `week.ts`'s `jumpWarning`
 * reasoning applied to a second metric: flagging a rest week would train him to ignore the flag.
 *
 * **The comparison is on the ratio; `value` is the ratio × 100.** Two separate points:
 *
 *   - The threshold IS a ratio — `ACWR_SWEET_SPOT.max`, imported. Comparing on the ratio means the
 *     imported number is used exactly as published; scaling both sides by 100 first would add an
 *     arithmetic step to a floating-point comparison for no gain, and would leave a `130` in this
 *     file that a reader could mistake for a threshold of its own.
 *   - `value` is a percentage because `PatternUnit` has no ratio member and **adding one would be
 *     an edit to phase 2's file.** It also reads better: `formatPercent(142.4, 1)` gives "142.4%",
 *     and "this week is 142.4% of your normal week" is a sentence he can act on, where "your ACWR
 *     is 1.42" is not.
 *
 * `occurrences` and `windowRuns` are the acute and chronic RUN COUNTS, so phase 2 renders "5 of
 * your last 14" — five runs crammed into this week out of fourteen in the month. This code has no
 * repeat count to report, and leaving the fields at 1 would make phase 2 write "1 of your last 1".
 */
function acwrSpike(input: PatternInput): FiredNinaPattern | null {
  const points: DailyLoadPoint[] = input.runs.map((r) => ({
    occurredOn: r.occurredOn,
    distanceM: r.distanceM,
  }))
  const acwr = computeAcwr(points, input.asOf, input.firstRunOn)
  if (acwr.insufficientHistory || acwr.ratio == null) return null
  if (acwr.ratio <= PATTERN_THRESHOLDS.acwrRatioMax) return null

  const countFrom = (from: DateISO) =>
    input.runs.filter((r) => r.occurredOn >= from && r.occurredOn <= input.asOf).length

  return {
    code: 'ACWR_SPIKE' satisfies PatternCode,
    severity: 'warn',
    value: acwr.ratio * 100,
    unit: 'percent',
    occurrences: countFrom(addDays(input.asOf, -6)),
    windowRuns: countFrom(addDays(input.asOf, -27)),
  }
}

/**
 * The only evaluator. Returns in `PATTERN_CODES` order, and returns `[]` for a runner with no
 * history rather than throwing — a first-week runner has no habits to judge.
 *
 * `evaluateSessionFlags`'s shape: one array, no nulls, no severity decisions taken anywhere but at
 * each rule's own definition.
 */
export function evaluatePatterns(input: PatternInput): FiredNinaPattern[] {
  const candidates: (FiredNinaPattern | null)[] = [
    repeatedLateStart(input),
    repeatedHighAvgHr(input),
    missedUsualDay(input),
    paceRegression(input),
    acwrSpike(input),
  ]
  return candidates.filter((p): p is FiredNinaPattern => p != null)
}
