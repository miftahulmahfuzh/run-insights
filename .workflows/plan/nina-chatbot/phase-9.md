# Phase 9: Patterns and the nag ledger

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R11 — *"as a bestfriend, i want nina to be angry when necessary … this is what we call 'tough love' and i am all here for it."*
**Depends on:** Phase 1 (`nina_nags`, `lib/nina/queries.ts`), Phase 2 (`FiredPattern`, `NagState`, `PatternUnit`)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

After this phase the app can say, from data and not from vibes, **"this KEPT happening."** Five
named longitudinal codes exist with exported strict thresholds, each carrying the raw unrounded
reading that tripped it, and a ledger decides whether raising one is the first mention, the second,
or the shouting one — and drops the level back down once he complies. Nina is handed codes and
levels; she never coins either.

The two words the user actually wrote are **KEPT** and **TERUS2AN**. Both are judgements over a
window, and per invariant 2 the model does not get to make them. This phase is where they are made.

---

## The design decisions the user did not specify

R11 names two examples and no numbers. These are the choices; they are documented here because
somebody will ask "why 3 of 5" later and the answer must not be "it felt right".

**"Kept" = more than 2 of the last 5 reviewed runs.** Five, not four and not ten: at the ~17
runs/month this app is built around (the figure `queries.ts` §5b uses to justify skipping indexes),
five runs is a little over a week — recent enough that he remembers all of them, long enough that
one bad Tuesday cannot trip it. Expressed as `repeatedRuns: 2` and compared with `>`, so the test
reads *"2 of 5 does not fire, 3 of 5 does"* and the strictness discipline from `flags.ts` survives
into a count.

**Not "2 consecutive".** Consecutive is the wrong shape for this user's own examples: he does not
run every day, so two consecutive late starts can be nine days apart while three of five is a
fortnight of the same behaviour. Consecutive also makes the pattern trivially cancellable by one
compliant run, which is exactly the "nagging alarm clock" failure the ledger exists to avoid.

**The value is the MOST RECENT offending run's reading, not a mean of the offenders.** A mean of
five clock times is not a number that ever appeared on his watch, and R11's whole force comes from
Nina quoting something real: *"lu mulai jam 07:22"*. A mean is also a rounding trap the moment
`PATTERN_VALUE_FORMAT` gets hold of it. `MISSED_USUAL_DAY`, `PACE_REGRESSION` and `ACWR_SPIKE` have
no single offending run, so each documents its own value at its definition.

**One knob deliberately not added.** No `forgetDays` on the ledger: four levels at more than ten
compliant days each already returns a code to zero by day 41, so a separate amnesia threshold would
be a second number describing the same behaviour.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none. This phase edits no existing file.

**Renames:** none.

**Creates — `lib/nina/patterns.ts`:**
type `PatternCode` (the union, five members: `REPEATED_LATE_START`, `REPEATED_HIGH_AVG_HR`,
`MISSED_USUAL_DAY`, `PACE_REGRESSION`, `ACWR_SPIKE`);
`PATTERN_CODES`, `isPatternCode`;
`PATTERN_THRESHOLDS`, `PATTERN_WINDOW`, `PATTERN_RUN_FETCH_LIMIT`;
interfaces `PatternRun`, `PatternInput`, `FiredNinaPattern`;
helpers `clockStringToSec`, `startSecOf`, `isoWeekdayOf`;
`evaluatePatterns(input: PatternInput): FiredNinaPattern[]` — the only evaluator.

**Creates — `lib/nina/nags.ts`:**
`NAG_RULES`, `MAX_NAG_LEVEL`;
types `NagReason`, `NagDecision`;
`decayedNagLevel`, `applyDecay`, `decideNag`, `decideNags`.

**Creates — `tests/nina.patterns.test.ts`, `tests/nina.nags.test.ts`.**

**Signature changes:** none.

**Requires (from earlier phases):**

- **Phase 2** — `lib/nina/context.ts` exports `FiredPattern`, `NagState` and `PatternUnit`, with
  `FiredPattern` = `{ code: string; severity: 'info' | 'warn'; value: number; unit: PatternUnit;
  occurrences: number; windowRuns: number }` and `NagState` =
  `{ code: string; level: number; lastMentionedOn: DateISO | null }`. **This phase imports both
  rather than redeclaring them**, so there is exactly one definition. No cycle: `context.ts` treats
  them as inputs and never imports `patterns.ts`.
- **Phase 2** — `PatternUnit` includes `'clock'`, `'percent'`, `'paceDelta'` and `'days'`. All four
  are used below. **This phase adds no member to `PatternUnit`** — see the `ACWR_SPIKE` note for the
  one place that was tempting.
- **Phase 2** — the two placeholder codes in `tests/fixtures/ninaContext.ts` are
  `REPEATED_LATE_START` and `REPEATED_HIGH_AVG_HR`. **Both names are adopted verbatim. No edit to
  phase 2's fixture is required.**
- **Phase 1** — `nina_nags` carries `code` (text), `level` (int), `last_mentioned_on` (date), keyed
  by `user_id`, **and phase 1 declares the `(user_id, code)` unique key** that makes persisting one
  decision a single upsert. Nothing in this phase reads or writes the table directly;
  `lib/nina/queries.ts` owns the SQL and phase 10 owns the call sites.
- **Phase 5** — `lib/nina/memory.ts` exports
  `parseRunningDays(value: string | null | undefined): readonly IsoWeekday[]` with
  **1 = Monday … 7 = Sunday**, which is exactly the convention `PatternInput.usualRunningDays`
  declares, so `readonly IsoWeekday[]` is assignable to `readonly number[]` with no cast and
  **this phase needs nothing** (RULING E4). This phase still imports nothing from `memory.ts` —
  phase 10 does the parsing and hands the numbers in.
- **Phase 1** — `lib/nina/queries.ts` provides the read and the write under **its own canonical
  names**, which are not the ones this plan first guessed at: the read is
  `getNinaNags(userId): Promise<NinaNagRow[]>` and the write is
  `upsertNinaNag(userId, input: { code, level, lastMentionedOn }): Promise<void>` — one input
  object, not `(userId, code, { … })`. The point that mattered is unchanged and worth restating:
  **nothing in this phase reads or writes them directly.** `NinaNagRow` is a row type from a
  module this phase never imports; `applyDecay` and `decideNags` take phase 2's `NagState`, and
  mapping the one to the other is a phase 10 line.

**Provides (to later phases) — read these as fixed:**

- **Phase 10** builds a `PatternInput` (from `getReviewedRunWindow`, `resolveHrMax`, phase 5's
  `parseRunningDays` over the `running_days` slot, and the user's first reviewed run), calls
  `evaluatePatterns`, then `applyDecay` and `decideNags`, and persists `decision.next` for every
  decision it acted on **through phase 1's `upsertNinaNag(userId, { code, level, lastMentionedOn })`
  — writing that object verbatim and computing nothing.** It fires the `pattern_crossed` trigger on
  `decision.shouldRaise`. See the Handoffs for why the read and the write are not in this phase.
- **Phase 10 / Phase 3** validate any code arriving from outside `lib/` with `isPatternCode`. That
  function is the enforcement point for *"the model never coins a code"*.
- **Phase 2's** `buildNinaContext` receives `evaluatePatterns(...)` output as `firedPatterns` and
  `applyDecay(...)` output as `nags`, unchanged and unformatted.

**Leaves alone (owned by others):**
`lib/nina/proactive.ts`, `app/api/cron/nina/*`, `lib/review/commit.ts` (Phase 10) ·
`lib/nina/persona.ts` (`ANGER_LADDER` — Phase 2 already wrote it and consumes this phase's levels;
**this phase writes no prose at all**) · `lib/nina/memory.ts` and the `running_days` slot (Phase 5) ·
`lib/nina/queries.ts`, `lib/db/schema.ts` (Phase 1) ·
`lib/metrics/*`, `lib/badges/catalog.ts`, `lib/date/ranges.ts`, `lib/format.ts` — **read and reused
unchanged.**

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/patterns.ts` | create | the five longitudinal codes, thresholds as data, one evaluator |
| `lib/nina/nags.ts` | create | the escalation ledger's decision and decay arithmetic |
| `tests/nina.patterns.test.ts` | create | boundary pairs for all five codes, mirroring `tests/metrics.flags.test.ts` |
| `tests/nina.nags.test.ts` | create | escalation rises on repeat, decays after compliance, caps at 4 |

Four files where the index estimated ~5: no separate fixture module. `tests/metrics.flags.test.ts`
builds its `QUIET` metrics inline precisely so a boundary case is one field toggle with no fixture
in sight, and this phase mirrors that shape rather than inventing a fixture the mirror does not
need.

---

## Implementation Steps

### Step 1: `lib/nina/patterns.ts` — the header, the vocabulary, the thresholds
**File:** `lib/nina/patterns.ts` (new file, lines 1–150)
**Change:** the module doc, the closed code union, the two threshold objects as data, and the input
types. `flags.ts` is the template line for line: fixed hand-authored codes, thresholds exported as
data, every comparison strict.
**Code:**
```ts
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
```
**Impact:** creates the vocabulary phase 10 fires on and phase 2's context builder formats. Nothing
imports it yet, so the tree stays green.

### Step 2: `lib/nina/patterns.ts` — the input types and the three small helpers
**File:** `lib/nina/patterns.ts` (continues, lines ~150–250)
**Change:** the row shape the evaluator reads, the whole-input shape, and the clock/weekday
arithmetic. Appended directly below step 1 in the same file.
**Code:**
```ts
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
 * `FiredPattern` with the code narrowed to this file's union.
 *
 * Phase 2 declares `FiredPattern.code` as `string`, mirroring `FlagFact.code`, because the context
 * layer must survive a code it has never heard of. This module knows better and says so, and
 * `FiredNinaPattern[]` is still assignable to `FiredPattern[]` at the boundary.
 */
export interface FiredNinaPattern extends FiredPattern {
  code: PatternCode
}

/**
 * 'HH:MM:SS' or 'HH:MM' to seconds past midnight. Total, because both callers hand it a Postgres
 * `time` literal: `BADGE_THRESHOLDS.lateStartAfter` above and `startSecOf` below.
 */
export function clockStringToSec(value: string): number {
  const [h = '0', m = '0', s = '0'] = value.split(':')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

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
```
**Impact:** none yet — types and pure helpers.

### Step 3: `lib/nina/patterns.ts` — the two `REPEATED_*` rules
**File:** `lib/nina/patterns.ts` (continues, lines ~250–330)
**Change:** R11's two verbatim examples, in code. Each is a private function returning
`FiredNinaPattern | null`, which is what lets `evaluatePatterns` be a five-line array filter.
**Code:**
```ts
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
    code: 'REPEATED_LATE_START',
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
    code: 'REPEATED_HIGH_AVG_HR',
    severity: 'warn',
    /* Newest first, so hot[0] is the most recent hot run — the reading he can go and check. */
    value: hot[0]!,
    unit: 'percent',
    occurrences: hot.length,
    windowRuns: window.length,
  }
}
```
**Impact:** the two codes phase 2's fixture already names now have real definitions. No edit to
`tests/fixtures/ninaContext.ts` needed.

### Step 4: `lib/nina/patterns.ts` — the three longitudinal rules and the evaluator
**File:** `lib/nina/patterns.ts` (continues, lines ~330–470; ends the file)
**Change:** `MISSED_USUAL_DAY`, `PACE_REGRESSION`, `ACWR_SPIKE`, and the single exported evaluator.
**Code:**
```ts
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
    code: 'MISSED_USUAL_DAY',
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
 * `avgPaceSecPerKm(Σ distance, Σ duration)` rather than a mean of the runs' own `avg_pace_sec`,
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
    code: 'PACE_REGRESSION',
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
    code: 'ACWR_SPIKE',
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
```
**Impact:** `lib/nina/patterns.ts` is complete. Nothing imports it yet; phase 10 wires it.

### Step 5: `lib/nina/nags.ts` — the escalation ledger
**File:** `lib/nina/nags.ts` (new file, lines 1–200)
**Change:** the whole module. Pure arithmetic over `nina_nags` rows; the SQL is phase 1's and the
call sites are phase 10's.
**Code:**
```ts
import { daysBetween, type DateISO } from '@/lib/date/ranges'
import type { NagState } from '@/lib/nina/context'
import type { FiredPattern } from '@/lib/nina/context'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  RU-9, second half: **"records what she has already said so the third time escalates instead
 *  of repeating."** This is the whole difference between a friend and a nagging alarm clock.
 *
 *  `patterns.ts` decides that something KEPT happening. This decides what to do about the fact
 *  that she has mentioned it before — and, just as importantly, that she should stop mentioning it
 *  once he fixes it. A pattern with no ledger produces the same sentence every morning forever,
 *  which is how a runner learns to ignore his best friend.
 *
 *  Nothing here writes prose. `persona.ts`'s `ANGER_LADDER` (phase 2) maps a level to a tone; this
 *  module produces the integer, and she is handed it rather than choosing a mood. That is what
 *  stops rung 4 from becoming her personality.
 *
 *  ── ONE CLOCK, AND IT IS "DAYS SINCE SHE LAST SAID IT" ──────────────────────────────────────
 *  `nina_nags.last_mentioned_on` is the only time input. Compliance is read THROUGH it rather
 *  than measured separately, and the two coincide by construction: a pattern that is still firing
 *  gets raised on the first turn past the cooldown, so its `last_mentioned_on` keeps moving and it
 *  never decays; a pattern he has fixed stops firing, so she stops raising it, so the date stops
 *  moving and the level walks back down. One column, one clock, and no second table recording
 *  compliance that could disagree with the first.
 *
 *  The honest limitation: a long silence from Nina cools a still-live pattern. Phase 10's cron
 *  runs daily, so the case needs an eleven-day outage to appear, and the cost when it does is one
 *  rung of anger — which is the direction to be wrong in.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The rules, as data, for the same reason `PATTERN_THRESHOLDS` is data: a reader checks them
 * against this plan without reading a branch. Both day counts are compared **strictly**.
 */
export const NAG_RULES = {
  /**
   * The ledger's ceiling. `ANGER_LADDER` saturates at nagLevel 3 ("shouting"), so levels 3 and 4
   * sound identical — the cap exists so the integer cannot grow unbounded over years of the same
   * habit, not to add a sixth rung.
   */
  maxLevel: 4,
  /**
   * She will not raise the same code again inside this many days. **Strict**: on day 3 exactly she
   * is still silent; on day 4 she speaks. Three days is the smallest gap at which "udah gw bilang"
   * is a memory rather than a repetition — at one day it is the same conversation.
   */
  cooldownDays: 3,
  /**
   * Every full run of more than this many quiet days drops one level. **Strict**: at day 10 the
   * level holds, at day 11 it falls by one. Ten days is long enough that two or three runs have
   * happened without the pattern firing, which is the smallest thing that deserves to be called
   * a change of behaviour.
   */
  decayDays: 10,
} as const

export const MAX_NAG_LEVEL = NAG_RULES.maxLevel

/** Why a decision came out the way it did. Logged by phase 10; never shown to the model. */
export type NagReason =
  /** No ledger row at all — she has never raised this. */
  | 'first_time'
  /** Raised before, cooldown is past, the level goes up. */
  | 'escalated'
  /** Raised before, and already at `maxLevel`. She still speaks; she cannot get angrier. */
  | 'capped'
  /** Raised inside `cooldownDays`. She stays quiet about it this turn. */
  | 'cooldown'

export interface NagDecision {
  code: string
  /**
   * How many times she has ALREADY raised this, after decay — the number that goes into
   * `buildNinaContext`'s `nags` and drives the anger ladder. 0 means "she is about to raise it for
   * the first time", which the ladder renders as rung 1 and not rung 0.
   */
  level: number
  /** Whether she may raise it at all this turn. False means the cooldown is still running. */
  shouldRaise: boolean
  /**
   * The row to persist — **only if she actually raised it.** Writing this when `shouldRaise` is
   * false would restart the cooldown on a sentence she never said.
   */
  next: NagState
  reason: NagReason
}

/** A ledger row's `level`, defended against a hand-edited or stale integer. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.max(0, Math.min(NAG_RULES.maxLevel, Math.trunc(level)))
}

/**
 * The stored level walked back down by however long she has been quiet.
 *
 * `Math.floor(elapsed / decayDays)` steps, gated by `elapsed > decayDays` so day 10 exactly does
 * not decay. The gate makes the first step 11 days and every later step 10, which is a deliberate
 * asymmetry: it keeps the boundary test readable ("10 does not decay, 11 does") and the function
 * monotone, and a decay schedule of 11/21/31/41 days is not meaningfully different from
 * 10/20/30/40 to a runner.
 *
 * Pure, and a function of the **stored** row only. **Never feed it its own output.** The decay is
 * anchored on `lastMentionedOn`, which the projection deliberately preserves so phase 2's
 * `daysSinceLastMentioned` stays truthful — which means re-projecting a projection decays a second
 * time from the same anchor. Read the row, decay it once, hand it to the context builder, and
 * never write the decayed level back to `nina_nags`: the stored level is the count of times she
 * said it, and only `decideNag`'s `next` may change it.
 *
 * A null `lastMentionedOn` never decays: it means the row exists but no date was recorded, and
 * inventing elapsed time from that would silently forgive a habit.
 */
export function decayedNagLevel(state: NagState | null, asOf: DateISO): number {
  if (state == null) return 0
  const level = clampLevel(state.level)
  if (level <= 0 || state.lastMentionedOn == null) return level

  const elapsed = daysBetween(state.lastMentionedOn, asOf)
  if (elapsed <= NAG_RULES.decayDays) return level

  return Math.max(0, level - Math.floor(elapsed / NAG_RULES.decayDays))
}

/**
 * Every ledger row, decayed. **This is what phase 10 hands to `buildNinaContext` as `nags`** —
 * never the raw rows, or she shouts about a habit he fixed a month ago.
 *
 * `lastMentionedOn` is preserved unchanged so phase 2's `daysSinceLastMentioned` stays truthful:
 * the level cooled, but the date she said it is still the date she said it.
 */
export function applyDecay(states: readonly NagState[], asOf: DateISO): NagState[] {
  return states.map((state) => ({
    code: state.code,
    level: decayedNagLevel(state, asOf),
    lastMentionedOn: state.lastMentionedOn,
  }))
}

/**
 * One code's verdict. `state` is the row as stored — this applies the decay itself, so a caller
 * cannot forget to.
 */
export function decideNag(code: string, state: NagState | null, asOf: DateISO): NagDecision {
  const level = decayedNagLevel(state, asOf)
  const elapsed =
    state == null || state.lastMentionedOn == null ? null : daysBetween(state.lastMentionedOn, asOf)
  const shouldRaise = elapsed == null || elapsed > NAG_RULES.cooldownDays
  const raisedLevel = Math.min(level + 1, NAG_RULES.maxLevel)

  const reason: NagReason = !shouldRaise
    ? 'cooldown'
    : state == null
      ? 'first_time'
      : level >= NAG_RULES.maxLevel
        ? 'capped'
        : 'escalated'

  return {
    code,
    level,
    shouldRaise,
    next: { code, level: raisedLevel, lastMentionedOn: asOf },
    reason,
  }
}

/**
 * The whole set, in the order `evaluatePatterns` returned them.
 *
 * `states` may hold rows for codes that did not fire; those are simply not decided about. Missing
 * rows are `null`, which `decideNag` reads as `first_time`.
 */
export function decideNags(
  patterns: readonly FiredPattern[],
  states: readonly NagState[],
  asOf: DateISO,
): NagDecision[] {
  const byCode = new Map<string, NagState>(states.map((s) => [s.code, s]))
  return patterns.map((p) => decideNag(p.code, byCode.get(p.code) ?? null, asOf))
}
```
**Impact:** the ledger arithmetic exists and is testable. No table is read or written by this
phase — phase 10 owns both.

### Step 6: `tests/nina.patterns.test.ts` — one boundary pair per code
**File:** `tests/nina.patterns.test.ts` (new file)
**Change:** the whole suite. **`tests/metrics.flags.test.ts`'s shape, mirrored exactly:** a `QUIET`
input that fires nothing, a builder that toggles one thing, and for every code a case sitting on the
line that must NOT fire beside one just past it that must.
**Code:**
```ts
import { describe, expect, it } from 'vitest'

import { BADGE_THRESHOLDS } from '@/lib/badges/catalog'
import { addDays, type DateISO } from '@/lib/date/ranges'
import { ACWR_SWEET_SPOT } from '@/lib/metrics/acwr'
import { FLAG_THRESHOLDS } from '@/lib/metrics/flags'
import {
  clockStringToSec,
  evaluatePatterns,
  isoWeekdayOf,
  isPatternCode,
  PATTERN_CODES,
  PATTERN_THRESHOLDS,
  type PatternCode,
  type PatternInput,
  type PatternRun,
} from '@/lib/nina/patterns'

/**
 * The boundary pairs hand-build a `PatternInput` and toggle one thing, which is only possible
 * because `evaluatePatterns` takes resolved rows rather than a `userId` — no database, no fixture,
 * just the comparison under test. Every threshold is STRICT, so each code gets a case sitting
 * exactly on the line that must not fire.
 *
 * `tests/metrics.flags.test.ts` is the model, deliberately, because `lib/nina/patterns.ts` is
 * `lib/metrics/flags.ts`'s longitudinal twin and a reader should be able to read one after the
 * other without changing gears.
 */

/** 2026-09-03 is a Thursday — ISO weekday 4. Pinned below so the date arithmetic is not folklore. */
const ASOF: DateISO = '2026-09-03'
const THURSDAY = 4

/** Nothing in this world has happened yet. Each test switches on exactly one field. */
const QUIET: PatternInput = {
  runs: [],
  asOf: ASOF,
  hrMaxBpm: 189,
  usualRunningDays: [],
  firstRunOn: null,
}

/** An unremarkable 10 km at 5:00/km, started at 06:00, at 74% of max HR. */
const run = (over: Partial<PatternRun> & { occurredOn: DateISO }): PatternRun => ({
  id: `r_${over.occurredOn}`,
  startedAt: '06:00:00',
  distanceM: 10_000,
  durationSec: 3000,
  avgHr: 140,
  avgPaceSec: 300,
  ...over,
})

const codes = (over: Partial<PatternInput>): PatternCode[] =>
  evaluatePatterns({ ...QUIET, ...over }).map((p) => p.code)

const fired = (over: Partial<PatternInput>, code: PatternCode) =>
  evaluatePatterns({ ...QUIET, ...over }).find((p) => p.code === code)

/** Five consecutive daily runs, the newest `n` of them started after 07:00. Newest first. */
const lateStarts = (n: number, at = '07:22:00'): PatternRun[] =>
  Array.from({ length: 5 }, (_, i) =>
    run({ occurredOn: addDays(ASOF, -i), startedAt: i < n ? at : '05:30:00' }),
  )

/** Five consecutive daily runs, the newest `n` of them at `bpm`. */
const hotRuns = (n: number, bpm: number): PatternRun[] =>
  Array.from({ length: 5 }, (_, i) =>
    run({ occurredOn: addDays(ASOF, -i), avgHr: i < n ? bpm : 120 }),
  )

/** Ten consecutive 10 km runs: the newest five at `recentSec`, the five before at `olderSec`. */
const paceSeries = (recentSec: number, olderSec: number, from: DateISO = ASOF): PatternRun[] =>
  Array.from({ length: 10 }, (_, i) =>
    run({
      occurredOn: addDays(from, -i),
      distanceM: 10_000,
      durationSec: i < 5 ? recentSec : olderSec,
    }),
  )

/**
 * Two runs whose 28-day total is always 40 km — so `chronicWeeklyAvgKm` is always exactly 10 —
 * with `acuteM` of it inside the 7-day window. The ratio is therefore `acuteM / 10000`, exactly.
 */
const acwrRuns = (acuteM: number): PatternRun[] => [
  run({ occurredOn: ASOF, distanceM: acuteM, durationSec: 3900 }),
  run({ occurredOn: addDays(ASOF, -20), distanceM: 40_000 - acuteM, durationSec: 8100 }),
]

const FIRST_RUN: DateISO = addDays(ASOF, -40)

describe('nothing fires on an empty history', () => {
  it('a runner with no reviewed runs has no habits to judge', () => {
    expect(evaluatePatterns(QUIET)).toEqual([])
  })
})

describe('the vocabulary is closed — the model never coins a code', () => {
  it('PATTERN_CODES is exactly the five members of the union', () => {
    expect([...PATTERN_CODES].sort()).toEqual(
      [
        'ACWR_SPIKE',
        'MISSED_USUAL_DAY',
        'PACE_REGRESSION',
        'REPEATED_HIGH_AVG_HR',
        'REPEATED_LATE_START',
      ].sort(),
    )
  })

  it('isPatternCode rejects a plausible invention, and a session flag code', () => {
    expect(isPatternCode('REPEATED_LATE_START')).toBe(true)
    expect(isPatternCode('OVERTRAINING_RISK')).toBe(false)
    // A per-run FlagCode is not a pattern. The two catalogs are separate and stay separate.
    expect(isPatternCode('HIGH_DECOUPLING')).toBe(false)
    expect(isPatternCode(null)).toBe(false)
    expect(isPatternCode(3)).toBe(false)
  })
})

describe('three thresholds are imported, not restated', () => {
  it('late is the same 07:00 the late_start badge uses', () => {
    expect(PATTERN_THRESHOLDS.lateStartAfterSec).toBe(
      clockStringToSec(BADGE_THRESHOLDS.lateStartAfter),
    )
    expect(PATTERN_THRESHOLDS.lateStartAfterSec).toBe(25_200)
  })

  it('hot is the same 90% VERY_HIGH_AVG_HR uses, and 1.3 is the published sweet spot', () => {
    expect(PATTERN_THRESHOLDS.highAvgHrPctMax).toBe(FLAG_THRESHOLDS.VERY_HIGH_AVG_HR)
    expect(PATTERN_THRESHOLDS.acwrRatioMax).toBe(ACWR_SWEET_SPOT.max)
  })
})

describe('the calendar helper', () => {
  it('isoWeekdayOf is Monday-first and reads the date as a Jakarta calendar day', () => {
    expect(isoWeekdayOf('2026-09-03')).toBe(THURSDAY)
    expect(isoWeekdayOf('2026-09-07')).toBe(1)
    expect(isoWeekdayOf('2026-09-06')).toBe(7)
  })
})

describe('boundaries — every threshold is strict', () => {
  it('REPEATED_LATE_START: 2 of the last 5 does not fire, 3 does', () => {
    expect(codes({ runs: lateStarts(2) })).not.toContain('REPEATED_LATE_START')
    expect(codes({ runs: lateStarts(3) })).toContain('REPEATED_LATE_START')
  })

  it('REPEATED_LATE_START: 07:00:00 exactly is not late, 07:00:01 is', () => {
    expect(codes({ runs: lateStarts(5, '07:00:00') })).not.toContain('REPEATED_LATE_START')
    expect(codes({ runs: lateStarts(5, '07:00:01') })).toContain('REPEATED_LATE_START')
  })

  it('REPEATED_HIGH_AVG_HR: 90.0% of max does not fire, 90.5% does', () => {
    expect(codes({ runs: hotRuns(3, 180), hrMaxBpm: 200 })).not.toContain('REPEATED_HIGH_AVG_HR')
    expect(codes({ runs: hotRuns(3, 181), hrMaxBpm: 200 })).toContain('REPEATED_HIGH_AVG_HR')
  })

  it('REPEATED_HIGH_AVG_HR: 2 hot runs of 5 does not fire, 3 does', () => {
    expect(codes({ runs: hotRuns(2, 181), hrMaxBpm: 200 })).not.toContain('REPEATED_HIGH_AVG_HR')
    expect(codes({ runs: hotRuns(3, 181), hrMaxBpm: 200 })).toContain('REPEATED_HIGH_AVG_HR')
  })

  it('MISSED_USUAL_DAY: one skipped usual day does not fire, two do', () => {
    // The 14-day lookback from 2026-09-02 holds exactly two Thursdays: 08-27 and 08-20.
    expect(
      codes({ runs: [run({ occurredOn: '2026-08-27' })], usualRunningDays: [THURSDAY] }),
    ).not.toContain('MISSED_USUAL_DAY')
    expect(codes({ runs: [], usualRunningDays: [THURSDAY] })).toContain('MISSED_USUAL_DAY')
  })

  it('PACE_REGRESSION: exactly 15 s/km slower does not fire, 15.1 does', () => {
    // 10 km in 3000 s is 300 s/km; in 3150 s it is 315; in 3151 s it is 315.1.
    expect(codes({ runs: paceSeries(3150, 3000) })).not.toContain('PACE_REGRESSION')
    expect(codes({ runs: paceSeries(3151, 3000) })).toContain('PACE_REGRESSION')
  })

  it('ACWR_SPIKE: a ratio of exactly 1.3 does not fire, 1.31 does', () => {
    expect(codes({ runs: acwrRuns(13_000), firstRunOn: FIRST_RUN })).not.toContain('ACWR_SPIKE')
    expect(codes({ runs: acwrRuns(13_100), firstRunOn: FIRST_RUN })).toContain('ACWR_SPIKE')
  })
})

describe('absence is not "false"', () => {
  it('a null hrMax disables REPEATED_HIGH_AVG_HR rather than estimating one', () => {
    expect(codes({ runs: hotRuns(5, 181), hrMaxBpm: null })).not.toContain('REPEATED_HIGH_AVG_HR')
  })

  it('a run with no started_at is not a late start', () => {
    const noStarts = Array.from({ length: 5 }, (_, i) =>
      run({ occurredOn: addDays(ASOF, -i), startedAt: null }),
    )
    expect(codes({ runs: noStarts })).not.toContain('REPEATED_LATE_START')
  })

  it('an empty running_days slot disables MISSED_USUAL_DAY', () => {
    expect(codes({ runs: [], usualRunningDays: [] })).not.toContain('MISSED_USUAL_DAY')
  })

  it('MISSED_USUAL_DAY never judges asOf itself — a day in progress is not a day skipped', () => {
    const bothEarlierThursdays = [
      run({ occurredOn: '2026-08-27' }),
      run({ occurredOn: '2026-08-20' }),
    ]
    expect(codes({ runs: bothEarlierThursdays, usualRunningDays: [THURSDAY] })).not.toContain(
      'MISSED_USUAL_DAY',
    )
  })

  it('PACE_REGRESSION never fires on thin history — nine runs is not a comparison', () => {
    expect(codes({ runs: paceSeries(3600, 3000).slice(0, 9) })).not.toContain('PACE_REGRESSION')
  })

  it('PACE_REGRESSION compares only inside the bucket of the run he just did', () => {
    // Ten regressed 10k-bucket runs, plus one half-bucket run on top. The newest run's bucket is
    // 'half', which holds one run, so there is nothing to compare and nothing fires.
    const withHalf = [
      run({ occurredOn: ASOF, distanceM: 21_100, durationSec: 7000 }),
      ...paceSeries(3600, 3000, addDays(ASOF, -1)),
    ]
    expect(codes({ runs: withHalf })).not.toContain('PACE_REGRESSION')
  })

  it('ACWR_SPIKE never fires without 28 days of history, however wild the week', () => {
    expect(codes({ runs: acwrRuns(20_000), firstRunOn: addDays(ASOF, -20) })).not.toContain(
      'ACWR_SPIKE',
    )
  })

  it('ACWR_SPIKE is high-side only — a taper is not a tough-love moment', () => {
    // 2 km acute against a 10 km weekly average is a ratio of 0.2: far outside the sweet spot,
    // and `isAcwrOutOfRange` would say so. This code deliberately does not.
    expect(codes({ runs: acwrRuns(2_000), firstRunOn: FIRST_RUN })).not.toContain('ACWR_SPIKE')
  })
})

describe('every fired pattern carries the raw reading Nina quotes', () => {
  it('REPEATED_LATE_START reports the MOST RECENT offending start, not a mean', () => {
    const p = fired({ runs: lateStarts(3) }, 'REPEATED_LATE_START')!
    // 07:22:00 as seconds past midnight — the exact value phase 2's fixture formats via `clock`.
    expect(p.value).toBe(26_520)
    expect(p.unit).toBe('clock')
    expect(p.severity).toBe('warn')
    expect(p.occurrences).toBe(3)
    expect(p.windowRuns).toBe(5)
  })

  it('REPEATED_HIGH_AVG_HR reports an unrounded percentage of max', () => {
    const p = fired({ runs: hotRuns(3, 181), hrMaxBpm: 200 }, 'REPEATED_HIGH_AVG_HR')!
    expect(p.value).toBeCloseTo(90.5, 10)
    expect(p.unit).toBe('percent')
    expect(p.severity).toBe('warn')
  })

  it('MISSED_USUAL_DAY reports days since the nearest miss, and counts usual-day slots', () => {
    const p = fired({ runs: [], usualRunningDays: [THURSDAY] }, 'MISSED_USUAL_DAY')!
    expect(p.value).toBe(7) // 2026-08-27 is seven days before asOf
    expect(p.unit).toBe('days')
    expect(p.severity).toBe('info')
    expect(p.occurrences).toBe(2)
    expect(p.windowRuns).toBe(2) // two Thursdays in the lookback, NOT two runs
  })

  it('PACE_REGRESSION reports the signed s/km delta, positive meaning slower now', () => {
    const p = fired({ runs: paceSeries(3151, 3000) }, 'PACE_REGRESSION')!
    expect(p.value).toBeCloseTo(15.1, 10)
    expect(p.unit).toBe('paceDelta')
    expect(p.severity).toBe('info')
  })

  it('ACWR_SPIKE reports the ratio as a percentage of his own weekly average', () => {
    const p = fired({ runs: acwrRuns(13_100), firstRunOn: FIRST_RUN }, 'ACWR_SPIKE')!
    expect(p.value).toBeCloseTo(131, 6)
    expect(p.unit).toBe('percent')
    expect(p.severity).toBe('warn')
    expect(p.occurrences).toBe(1) // runs inside the 7-day acute window
    expect(p.windowRuns).toBe(2) // runs inside the 28-day chronic window
  })

  it('every value is a raw number — this module formats nothing', () => {
    const all = evaluatePatterns({
      ...QUIET,
      runs: lateStarts(5),
      hrMaxBpm: 200,
      usualRunningDays: [THURSDAY],
    })
    expect(all.length).toBeGreaterThan(0)
    for (const p of all) expect(typeof p.value).toBe('number')
  })
})

describe('evaluatePatterns returns in PATTERN_CODES order', () => {
  it('a runner tripping several codes gets them in catalog order', () => {
    const runs = [
      ...lateStarts(3, '08:00:00').map((r) => ({ ...r, avgHr: 190 })),
      ...paceSeries(3600, 3000, addDays(ASOF, -5)),
    ]
    const got = evaluatePatterns({
      ...QUIET,
      runs,
      hrMaxBpm: 200,
      usualRunningDays: [THURSDAY],
      firstRunOn: FIRST_RUN,
    }).map((p) => p.code)
    const order = PATTERN_CODES.filter((c) => got.includes(c))
    expect(got).toEqual([...order])
  })
})
```
**Impact:** every code has its strict boundary pair, which is half of this phase's exit criteria.

> **Implementation note.** The order test asserts a *relation* (returned order equals
> `PATTERN_CODES` filtered to what returned), not a hardcoded list, precisely so it cannot be
> falsified by a run set that happens to trip one code more or fewer than expected while the
> arithmetic above is being adjusted. If any `toBeCloseTo` or `toBe` in the value tests disagrees
> with the real arithmetic, **fix the test's fixture numbers, never the threshold** — the
> thresholds in `PATTERN_THRESHOLDS` are the specification and this plan's table is their record.

### Step 7: `tests/nina.nags.test.ts` — escalation rises, and decay brings it back
**File:** `tests/nina.nags.test.ts` (new file)
**Change:** the whole suite. The two behaviours the exit criteria name — *the third mention
escalates* and *the level decays after compliance* — plus the strict boundaries on both day counts.
**Code:**
```ts
import { describe, expect, it } from 'vitest'

import { addDays, type DateISO } from '@/lib/date/ranges'
import type { FiredPattern, NagState } from '@/lib/nina/context'
import {
  applyDecay,
  decayedNagLevel,
  decideNag,
  decideNags,
  MAX_NAG_LEVEL,
  NAG_RULES,
} from '@/lib/nina/nags'

const ASOF: DateISO = '2026-09-03'
const CODE = 'REPEATED_LATE_START'

const ledger = (level: number, lastMentionedOn: DateISO | null, code = CODE): NagState => ({
  code,
  level,
  lastMentionedOn,
})

describe('the first mention', () => {
  it('no ledger row means level 0, and she is free to speak', () => {
    const d = decideNag(CODE, null, ASOF)
    expect(d.level).toBe(0)
    expect(d.shouldRaise).toBe(true)
    expect(d.reason).toBe('first_time')
    expect(d.next).toEqual({ code: CODE, level: 1, lastMentionedOn: ASOF })
  })
})

describe('the third time she raises it, she escalates rather than repeating', () => {
  it('three mentions four days apart come out at levels 0, 1 and 2', () => {
    let state: NagState | null = null
    let day: DateISO = ASOF
    const levels: number[] = []

    for (let i = 0; i < 3; i += 1) {
      const d = decideNag(CODE, state, day)
      expect(d.shouldRaise).toBe(true)
      levels.push(d.level)
      state = d.next
      day = addDays(day, NAG_RULES.cooldownDays + 1)
    }

    // 0 → rung 1 "sharp", 1 → rung 2 "pointed", 2 → rung 3 "irritated" on phase 2's ANGER_LADDER.
    // Level 2 is where "udah gw bilang" is literally true, and it is true because of this ledger.
    expect(levels).toEqual([0, 1, 2])
    expect(state).toEqual({ code: CODE, level: 3, lastMentionedOn: day })
  })

  it('caps at MAX_NAG_LEVEL — she still speaks, she just cannot get angrier', () => {
    const d = decideNag(CODE, ledger(MAX_NAG_LEVEL, addDays(ASOF, -4)), ASOF)
    expect(d.level).toBe(MAX_NAG_LEVEL)
    expect(d.shouldRaise).toBe(true)
    expect(d.reason).toBe('capped')
    expect(d.next.level).toBe(MAX_NAG_LEVEL)
  })

  it('MAX_NAG_LEVEL is 4, one past the highest rung the ladder distinguishes', () => {
    expect(MAX_NAG_LEVEL).toBe(4)
  })
})

describe('the cooldown is strict', () => {
  it('three days after saying it she is still quiet; four days after, she speaks', () => {
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -3)), ASOF).shouldRaise).toBe(false)
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -3)), ASOF).reason).toBe('cooldown')
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -4)), ASOF).shouldRaise).toBe(true)
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -4)), ASOF).reason).toBe('escalated')
  })

  it('a same-day repeat is refused — that is the same conversation, not a reminder', () => {
    expect(decideNag(CODE, ledger(2, ASOF), ASOF).shouldRaise).toBe(false)
  })

  it('the level is still reported while on cooldown, so context stays truthful', () => {
    const d = decideNag(CODE, ledger(2, ASOF), ASOF)
    expect(d.level).toBe(2)
  })
})

describe('the level decays after compliance', () => {
  const raised = ledger(3, ASOF)

  it('decay is strict at ten quiet days, and steps once per further ten', () => {
    expect(decayedNagLevel(raised, addDays(ASOF, 10))).toBe(3)
    expect(decayedNagLevel(raised, addDays(ASOF, 11))).toBe(2)
    expect(decayedNagLevel(raised, addDays(ASOF, 21))).toBe(1)
    expect(decayedNagLevel(raised, addDays(ASOF, 31))).toBe(0)
  })

  it('never goes below zero, however long he behaves', () => {
    expect(decayedNagLevel(raised, addDays(ASOF, 400))).toBe(0)
  })

  it('a fixed habit that returns is met at the cooled level, not the old one', () => {
    // He was shouted at, complied for a month, and has started sleeping in again.
    const d = decideNag(CODE, ledger(3, ASOF), addDays(ASOF, 31))
    expect(d.level).toBe(0)
    expect(d.reason).toBe('escalated')
    expect(d.next.level).toBe(1)
  })

  it('a row with no last_mentioned_on never decays — an absent date is not elapsed time', () => {
    expect(decayedNagLevel(ledger(3, null), addDays(ASOF, 400))).toBe(3)
  })

  it('a null state is level 0', () => {
    expect(decayedNagLevel(null, ASOF)).toBe(0)
  })

  it('a corrupt stored level is clamped rather than trusted', () => {
    expect(decayedNagLevel(ledger(99, ASOF), ASOF)).toBe(MAX_NAG_LEVEL)
    expect(decayedNagLevel(ledger(-3, ASOF), ASOF)).toBe(0)
    expect(decayedNagLevel(ledger(Number.NaN, ASOF), ASOF)).toBe(0)
    expect(decayedNagLevel(ledger(2.7, ASOF), ASOF)).toBe(2)
  })
})

describe('applyDecay is the projection phase 10 hands to buildNinaContext', () => {
  it('cools every level and preserves every date', () => {
    const rows: NagState[] = [ledger(3, ASOF), ledger(1, null, 'ACWR_SPIKE')]
    expect(applyDecay(rows, addDays(ASOF, 21))).toEqual([
      { code: CODE, level: 1, lastMentionedOn: ASOF },
      { code: 'ACWR_SPIKE', level: 1, lastMentionedOn: null },
    ])
  })

  it('is NOT idempotent, and must be applied to the stored rows only', () => {
    // Pinned as a warning, not as a feature. The anchor is `lastMentionedOn`, which the projection
    // preserves on purpose, so projecting a projection decays a second time from the same anchor.
    const once = applyDecay([ledger(3, ASOF)], addDays(ASOF, 21))
    const twice = applyDecay(once, addDays(ASOF, 21))
    expect(once[0]!.level).toBe(1)
    expect(twice[0]!.level).toBe(0)
  })
})

describe('decideNags over a whole evaluation', () => {
  const pattern = (code: string): FiredPattern => ({
    code,
    severity: 'warn',
    value: 1,
    unit: 'count',
    occurrences: 3,
    windowRuns: 5,
  })

  it('decides one code per fired pattern, in the order they arrived', () => {
    const out = decideNags(
      [pattern(CODE), pattern('ACWR_SPIKE')],
      [ledger(2, addDays(ASOF, -4))],
      ASOF,
    )
    expect(out.map((d) => d.code)).toEqual([CODE, 'ACWR_SPIKE'])
    expect(out[0]!.level).toBe(2)
    expect(out[0]!.reason).toBe('escalated')
    // No row for ACWR_SPIKE: she has never raised it.
    expect(out[1]!.level).toBe(0)
    expect(out[1]!.reason).toBe('first_time')
  })

  it('ignores ledger rows for codes that did not fire', () => {
    const out = decideNags([pattern(CODE)], [ledger(4, ASOF), ledger(2, ASOF, 'PACE_REGRESSION')], ASOF)
    expect(out).toHaveLength(1)
    expect(out[0]!.code).toBe(CODE)
  })
})
```
**Impact:** the second half of the exit criteria is pinned. Both new modules are fully covered and
nothing outside `lib/nina/` and `tests/` changed.

---

## The five codes, at a glance

For the reconciler and for whoever reads this in six months. Every number here is
`PATTERN_THRESHOLDS` or `PATTERN_WINDOW`, and every comparison is strict.

| Code | Fires when | `value` (raw) | `unit` | Sev | Window |
|---|---|---|---|---|---|
| `REPEATED_LATE_START` | more than 2 of the last 5 runs started after 07:00:00 | most recent offending start, sec past midnight | `clock` | warn | 5 runs |
| `REPEATED_HIGH_AVG_HR` | more than 2 of the last 5 runs averaged above 90% of HRmax | most recent hot run's % of max | `percent` | warn | 5 runs |
| `MISSED_USUAL_DAY` | more than 1 usual day in the last 14 (excluding today) had no run | days since the nearest miss | `days` | info | 14 days |
| `PACE_REGRESSION` | last 5 runs in the newest run's bucket are more than 15 s/km slower than the 5 before | the s/km delta, positive = slower | `paceDelta` | info | 10 runs, one bucket |
| `ACWR_SPIKE` | ACWR above 1.3 (high side only, 28 days of history required) | ratio × 100 | `percent` | warn | 7 d / 28 d |

**Ledger:** cap 4, cooldown more than 3 days between mentions of one code, one level shed per
more-than-ten quiet days.

---

## Verification

**Build:**
```
npm run typecheck
npm run lint
```

**Tests:**
```
npx vitest run tests/nina.patterns.test.ts tests/nina.nags.test.ts
npm test
```

**Guards** — none of them is expected to have anything to say about this phase, and running them is
how that is established rather than assumed (invariant 1 names all six):
```
npm run ci:openrouter-guard
npm run ci:data-layer-guard
npm run ci:client-secret-guard
npm run ci:f08-guard
npm run ci:llm-payload-guard
npm run ci:f11-guard
```
The two worth watching: `ci:data-layer-guard`, because both new modules deliberately import
nothing from `lib/db` and it should stay that way (invariant 9 — the caller reads through
`lib/db/queries.ts`); and `ci:llm-payload-guard`, because neither module is a payload builder and
neither should ever be treated as one.

**Manual check:** read `PATTERN_THRESHOLDS` and `NAG_RULES` side by side with this plan's
*"five codes, at a glance"* table. Every number must match, and every comparison in the file must
be `>` or `<` and never `>=` or `<=` against a threshold. That is a two-minute read and it is the
whole point of exporting the thresholds as data.

**Exit criteria:**

1. `lib/nina/patterns.ts` exports exactly five codes, `PATTERN_THRESHOLDS`, `PATTERN_WINDOW` and one
   evaluator, and imports nothing from `lib/format.ts`.
2. Each of the five has a test case sitting exactly on its threshold that does **not** fire, beside
   one just past it that does.
3. `isPatternCode` returns false for `'OVERTRAINING_RISK'` and for a session `FlagCode`.
4. A nag escalates 0 → 1 → 2 across three mentions past the cooldown, and caps at 4.
5. A level of 3, left alone, is 3 at ten quiet days, 2 at eleven and 0 at thirty-one.
6. `npm run typecheck && npm run lint && npm test` is green, and no file outside `lib/nina/` and
   `tests/` was touched.

---

## Assumptions

Written as facts because `depends_on` says they have landed. If any is false, this phase does not
compile and the fix is in the phase that owns it, not here.

- **Phase 1** created `nina_nags` with `code`, `level` (int), `last_mentioned_on` (date), scoped by
  `user_id` and unique on `(user_id, code)`, and `lib/nina/queries.ts` reads those rows as
  `NinaNagRow[]` via `getNinaNags` and writes one through `upsertNinaNag`. This phase reads and
  writes no table, so the gap between `NinaNagRow` and phase 2's `NagState` costs phase 10 one
  mapping line and costs this phase nothing.
- **Phase 2** created `lib/nina/context.ts` exporting `FiredPattern`, `NagState` and `PatternUnit`
  with the shapes quoted in the Interface Contract. Both new modules import those types rather than
  redeclaring them.
- `lib/metrics/acwr.ts`, `lib/metrics/flags.ts`, `lib/metrics/week.ts`, `lib/metrics/pace.ts`,
  `lib/badges/catalog.ts` and `lib/date/ranges.ts` are unchanged from `main` — none of the earlier
  phases touches them, and this phase reuses all six.
- `lib/metrics/hrMax.ts`'s `resolveHrMax` is available to phase 10 for filling
  `PatternInput.hrMaxBpm`. It is not called here.

---

## Handoffs

Work found and deliberately left where it belongs — and, below, the asks from later phases that
were **answered here instead of parked**, each as a decision with what would reopen it.

- **Phase 5 owns the `running_days` parser, and it already returns exactly what this phase wants
  — RESOLVED, nothing to do (RULING E4).** `PatternInput.usualRunningDays` is `readonly number[]`,
  **ISO weekdays 1 = Monday … 7 = Sunday**. Phase 5's slot `value` is a display-ready string (that
  is what phase 2's `MemorySlotInput` says), and this plan asked phase 5 to export a parser for it.
  It does: `lib/nina/memory.ts` exports
  `parseRunningDays(value: string | null | undefined): readonly IsoWeekday[]` — same 1–7
  convention, assignable to `readonly number[]` with no cast — and it also exports
  `parseRunningDaysAsJsWeekday` for phase 10's `Weekday` (0 = Sunday). **One token table, one range
  expander, one negation rule, two typed views**, all in the module that owns the slot vocabulary.
  So this phase's input type does not move, `isoWeekdayOf` stays the only weekday convention in
  this file, and phase 10 does the parsing before it calls in. The original reason for the ask is
  what makes this the right resting place: parsing a display string inside a pattern rule would put
  a second opinion about what the slot MEANS inside the module that judges him for it.

**Two asks from phase 10, both decided here rather than parked (RU-21).** Phase 10 asked this
phase for four functions — `loadNagStates(userId)`, `recordNagMention(userId, code, onISO)` and
`computeFiredPatterns(userId)` — i.e. for a read, a write and a loader inside `lib/nina/nags.ts`
and `lib/nina/patterns.ts`. Both asks are refused, and neither refusal is a deferral:

- **DECIDED: `lib/nina/nags.ts` ships only the computation. Phase 10 persists `decision.next`
  through phase 1's `upsertNinaNag`.** *Because* adding a `server-only` database import to
  `nags.ts` would make the module that owns the thresholds also own SQL, and that is precisely the
  split invariant 6 exists to prevent — the thresholds are the thing a human reads and argues with,
  and they stop being readable the moment they share a file with a query. Phase 1 already owns
  every Nina query, `getNinaNags` and `upsertNinaNag` included, so there is no gap to fill.
  **This is NOT phase 10's own "fallback that puts escalation arithmetic in two files", and the
  distinction is the whole reason the ask can be refused safely:** the arithmetic stays entirely
  in `decideNags`, which already returns the whole next rung as `decision.next` —
  `{ code, level, lastMentionedOn }`, complete. Phase 10 writes that object **verbatim** and
  computes nothing: no `level + 1`, no date arithmetic, no cooldown test. If phase 10 ever finds
  itself deriving a field instead of forwarding one, that is the bug this decision is guarding
  against, and the fix is to widen `NagDecision`, not to duplicate the ladder.
  The existing warning still stands and is the one way to get the write wrong: **persisting `next`
  for a `cooldown` decision restarts the cooldown on a sentence she never said.** Persist only for
  the decisions that were actually raised, and only after she has actually spoken.
  *Revisit if* a second caller outside phase 10 ever needs the same read-decide-write triple, at
  which point the loader belongs in phase 10's `lib/nina/proactive.ts` beside the existing one —
  still not here.
- **DECIDED: `lib/nina/patterns.ts` stays pure. Phase 10 owns the loader.** *Because* the same
  invariant applies to the harder half: `computeFiredPatterns(userId)` would need
  `getReviewedRunWindow`, `resolveHrMax` and phase 5's slot parse, which is three imports from
  three phases into a module whose entire value is that it is five rules and a table of numbers a
  human can check by reading. So phase 10 builds the `PatternInput` and calls `evaluatePatterns` /
  `applyDecay` itself — which is also where it **implements
  `dbNinaSourceGateway.readFiredPatterns` and `readNags`**, the two methods phase 3 ships as `[]`
  stubs.
  **The consequence is a feature, not a bug (RU-11):** between phase 3's landing and phase 10's,
  `NinaContext.patterns` is `[]` and the anger ladder in phase 2's prompt is inert — she simply
  never says "this kept happening", because nothing has told her it did. The tree is green, the app
  is usable, and no boundary in the sequence ships a half-wired pattern engine that fires on
  garbage. *Revisit if* the stubs ever outlive phase 10; a stub that survives its own phase is a
  bug, and the exit criterion that catches it is phase 10's own test that `readFiredPatterns`
  returns a non-empty array for a seeded offender.

- **Phase 10 — all the wiring, and it is all of it.** Build the `PatternInput` from
  `getReviewedRunWindow(userId, { occurredOn: today, startedAt: null }, PATTERN_RUN_FETCH_LIMIT)`,
  `resolveHrMax`, phase 5's parsed slot, and the user's first reviewed run; call
  `evaluatePatterns`; call `applyDecay(storedNags, today)` and hand **that** to
  `buildNinaContext` as `nags`; call `decideNags`; fire `pattern_crossed` on
  `decision.shouldRaise`; and after she has actually spoken, persist `decision.next` for exactly
  the decisions that were raised, via `upsertNinaNag(userId, decision.next)`. **Persisting `next`
  for a `cooldown` decision restarts the cooldown on a sentence she never said** — that is the one
  way to get this wrong.
- **Phase 10 — where "today" comes from.** `PatternInput.asOf` must be `todayInJakarta()`. This
  module takes it as an argument rather than calling the clock so a test can pin a Thursday.
- **The ledger's primary key — settled: phase 1 ships it, phase 10 uses it.** `nina_nags` needs
  `(user_id, code)` unique so that persisting `decision.next` is one upsert rather than a
  read-modify-write, and **phase 1 declares that key** as part of the table it owns. Phase 10 owns
  the call sites that lean on it (`upsertNinaNag`). This phase owns neither and asks for nothing;
  the constraint is recorded here only because this phase's escalation arithmetic is what makes it
  necessary.
- **Not done, deliberately: no `'ratio'` member on `PatternUnit`.** `ACWR_SPIKE` reports a
  percentage instead. Adding a unit would be an edit to phase 2's file for a formatter phase 2
  would also have to write, and "142% of your normal week" is better copy than "1.42" anyway.
- **Decided: no `ci:*` grep for `isPatternCode` in this phase — it becomes a named follow-up card,
  *"guard the pattern-code boundary with a `ci:*` grep"*.** The plan index's invariant 4 pattern (a
  `ci:*` grep guarding a boundary) is the right shape for *"the model never coins a code"*, and the
  decision is only about **when**: the only places a coined code can enter are phase 10's and phase
  3's parsing, so a guard written now would have nothing to point at and would pass by vacuously —
  which is worse than no guard, because a vacuous guard reads as coverage. The card is written
  against those two call sites and lands after phase 10, with `isPatternCode` already exported and
  already the enforcement point. *Revisit if* a third parsing site appears before phase 10, in
  which case the card comes forward rather than the guard being invented here.
- **Not done, deliberately: `REPEATED_HIGH_AVG_HR` recomputes `avgHr / hrMax × 100`.** If phase 10
  ends up holding `SessionMetrics` for the whole window for another reason, passing `avgHrPctMax`
  in would remove the restatement. Not worth building five `SessionMetricsInput`s for one field
  today.

---

## Rollback

Both modules are new and nothing imports them until phase 10 lands, so this phase reverts by
deleting four files:

```
rm lib/nina/patterns.ts lib/nina/nags.ts \
   tests/nina.patterns.test.ts tests/nina.nags.test.ts
```

No migration, no shared-file edit, no data. `nina_nags` is phase 1's table and stays; with this
phase reverted it is simply never written to. Reverting after phase 10 has landed is not a
rollback of this phase alone — phase 10 imports both modules — and must be done as a revert of
phase 10 first.
