# F06 — Metrics & personal records

**Owns:** `lib/metrics/*` (pure, no I/O, no LLM) except `lib/metrics/hrMax.ts` (F02's), the flags
engine, `lib/records/*` (the §4.5 catalog, comparators, recompute), and their exhaustive unit
tests.
**Does not own:** HRmax resolution (F02, `lib/metrics/hrMax.ts` — consumed, never reimplemented),
the narrative (F07), badge rules (F09 — consumes this feature's output), the DDL and query layer
(F03 — this feature consumes rows, never runs SQL itself), the review/commit transaction (F05 —
this feature is *called by* it).
**Depends on:** F03 (`runs`/`run_splits`/`run_zones` rows, and the query primitives §8 lists),
F05 (the commit that triggers a recompute), F02 (`HrMax`, imported by type — never redeclared).
**Depended on by:** F07 (narrative facts), F08 (charts, run detail), F09 (badges reference both
metrics and `records`).

---

## 0. Why every number here is TypeScript, never the LLM

`research/control.mjs` handed `glm-5.3` the canonical fixture's raw splits and the exact
formulas below, and asked it to compute six numbers itself:

| Metric | LLM returned | Truth | |
|---|---|---|---|
| avg HR as % of max | 93.2 | 93.01 | ok |
| **aerobic decoupling %** | **−14.1** | **+12.35** | ❌ **sign flipped** |
| 1st→2nd half drift (s/km) | 40.8 | 40.80 | ok |
| % time in Z4+Z5 | 88.3 | 90.60 | ❌ |
| cadence fade (spm) | −18 | −18.00 | ok |
| pace std dev (s) | 24.7 | 24.72 | ok |

Two of six wrong, and the decoupling error is not noise rounding — **it is backwards**. Shipped
as-is, the narrative would have told this runner their aerobic fitness *held up* on the exact run
where it visibly collapsed (HR pinned at 90%+ of max while pace faded 6'36" → 8'00"). The model
was not confused about the formula; it was given the formula in the prompt and still got the
arithmetic wrong on a live grading run.

**The rule this feature exists to enforce:** every number that appears in a run/week/month view
or in a flag or a record is computed by a pure TypeScript function in this module, unit-tested
against a known value, and handed to the LLM (F07) as a pre-computed fact. The LLM's only
permitted operation on a number is to copy it into a sentence. It never adds, divides, compares,
or estimates one. F07's own plan enforces the consumption half of this rule (§1: "every number
F07 sends the model has already been computed by F06 ... and is never recomputed by the LLM");
this plan enforces the production half.

This also means: **F06 ships before F07.** A run detail page with correct numbers and no prose
is a complete, useful product. A run detail page with prose and wrong numbers is a liability.

---

## 1. Module layout

```
lib/metrics/
  hrMax.ts              ← F02 OWNS THIS FILE. F06 imports types/functions, never edits it.
  types.ts               shared boundary types (Section 2)
  round.ts                largestRemainderPct — ported from expense-tracking/lib/stats/series.ts
  pace.ts                 avgPaceSecPerKm() — the one division every feature that touches pace reuses
  session.ts              computeSessionMetrics() (Section 3)
  flags.ts                evaluateSessionFlags() (Section 4)
  week.ts                 computeWeekMetrics(), computeVolumeDelta(), bucketForDistanceM() (Section 5)
  month.ts                computeMonthMetrics() (Section 6)
  acwr.ts                 computeAcwr(), ACWR_OUT_OF_RANGE (Section 6.4)
  index.ts                barrel — re-exports everything above EXCEPT it re-exports (not
                          redeclares) HrMax/HrMaxSource from ./hrMax
  __fixtures__/
    canonicalRun.ts        ported from research/schema.mjs TRUTH — Section 1.1
    syntheticWeek.ts        Section 5.5
    syntheticMonth.ts       Section 6.5
    recordCandidates.ts     Section 7.4
  __tests__/
    round.test.ts
    session.test.ts
    flags.test.ts
    week.test.ts
    month.test.ts
    acwr.test.ts

lib/records/
  types.ts                RecordKey, RecordDefinition, RecordCandidate (Section 7.1)
  catalog.ts               RECORD_CATALOG — the §4.5 table as data (Section 7.1)
  compute.ts               computeRecords() — pure (Section 7.2)
  recompute.ts             recomputeRecords() — the one I/O-shaped orchestrator (Section 7.3)
  index.ts
  __tests__/
    catalog.test.ts         each key: qualifies / does not qualify / wins / loses / ties
    compute.test.ts
    recompute.test.ts       against a fake RecordsGateway — no DB in this suite
```

### 1.1 Porting the fixture — the exact field-name remap

`research/schema.mjs`'s `TRUTH` is screenshot-shaped (camelCase, `distanceKm`, `paceSecPerKm`
inside each split). Production types are DB-row-shaped, matching F03's Drizzle column names
exactly so F06 never needs an adapter layer between a query result and its own input type.

| `research/schema.mjs` (`TRUTH`) | production field (F03's column) | transform |
|---|---|---|
| `distanceKm: 10.67` | `runs.distanceM` | `× 1000`, round to int → `10670` |
| `durationSec` | `runs.durationSec` | none |
| `avgHrBpm` | `runs.avgHr` | rename only |
| `maxHrBpm` | `runs.maxHr` | rename only |
| `restingHrBpm` | `runs.restingHr` | rename only |
| `splits[].timeSec` | `run_splits.timeSec` | none |
| `splits[].paceSecPerKm` | `run_splits.paceSec` | rename only |
| `splits[].hrBpm` | `run_splits.hr` | rename only |
| `splits[].cadenceSpm` | `run_splits.cadence` | rename only |
| `splits[].partial` | `run_splits.partial` | none |
| `hrZones[]` | `run_zones` | none — field names already match |
| `postWorkoutHr[0].bpm` (label `'8.26'`, i.e. end-of-workout) | `runs.endHrBpm` **(new column — see Contract deltas)** | rename |
| `postWorkoutHr[1].bpm` (label `'1 MIN'`) | `runs.hr1MinPostBpm` **(new column)** | rename |
| `postWorkoutHr[2].bpm` (label `'2 MIN'`) | *(dropped)* | no F06 metric consumes it; do not add a column for it |

Task 1 in Section 9 is: build `lib/metrics/__fixtures__/canonicalRun.ts` from this table, and add
a standing test that fails if `research/schema.mjs`'s `TRUTH` ever drifts from it (D13 — keep the
108-field ground truth and its production port from silently diverging).

---

## 2. Shared types — the F02/F03 boundary

```ts
// lib/metrics/types.ts

// Re-exported, NEVER redeclared. F02 owns the only definition of these two types.
export type { HrMax, HrMaxSource } from './hrMax'

export interface SplitRow {
  km: number
  timeSec: number
  paceSec: number
  hr: number | null
  cadence: number | null
  partial: boolean
}

export interface ZoneRow {
  zone: 1 | 2 | 3 | 4 | 5
  durationSec: number
  minBpm: number | null
  maxBpm: number | null
}

/** null when the run has no recovery reading at all — pre-migration data, or a manual entry. */
export interface RecoveryInput {
  endHrBpm: number | null
  hrAt1MinBpm: number | null
}

export interface SessionInput {
  runId: string
  occurredOn: string        // 'YYYY-MM-DD'
  distanceM: number
  durationSec: number
  avgHrBpm: number | null
  splits: readonly SplitRow[]
  zones: readonly ZoneRow[]
  recovery: RecoveryInput | null
}

export interface FastestSlowestKm { km: number; paceSec: number }

export interface ZonePctRow { zone: 1 | 2 | 3 | 4 | 5; durationSec: number; pct: number }

export interface SessionMetrics {
  runId: string
  hrMaxUsed: HrMax | null              // carried through for the UI's provenance label
  avgHrPctMax: number | null           // null iff hrMaxUsed is null OR avgHrBpm is null
  decouplingPct: number | null         // null iff fewer than 2 full-km splits (see §3.5)
  splitDriftSecPerKm: number | null
  paceSdSec: number | null
  cadenceFadeSpm: number | null
  fastestKm: FastestSlowestKm | null
  slowestKm: FastestSlowestKm | null
  zonePct: ZonePctRow[]                // [] iff zones is []
  hardPct: number | null               // Z4+Z5 share; null iff zoneTotalSec === 0
  hrRecovery1MinBpm: number | null     // endHrBpm - hrAt1MinBpm; null if either missing
  fullSplitCount: number               // diagnostic — how many rows fed the split-based metrics
}
```

**F06 never formats a number for display.** No `"min:sec"` strings, no `%` suffixes, no
`Math.round` for presentation — that is `lib/format.ts`'s job (ROADMAP §4.2), owned elsewhere.
Every field above is a plain `number | null`, JSON-serialisable, crossing the server→client
boundary as-is — the same boundary-type discipline as `expense-tracking/lib/stats/series.ts`'s
`MonthPoint`/`Delta`.

**`computeSessionMetrics` signature:**

```ts
export function computeSessionMetrics(input: SessionInput, hrMax: HrMax | null): SessionMetrics
```

Two arguments, deliberately. `hrMax` is resolved by F02's `resolveHrMax`-family functions, which
do I/O (a DB scan across a user's other runs). `computeSessionMetrics` itself touches no
database — it is handed the already-resolved value. This is the exact shape F05's own plan
already assumes ("Recompute every `lib/metrics/*` value for `runId` — cheap, pure functions, no
I/O **beyond the one run's rows**"): the *function* is pure; a thin caller in F05's server action
(or F06's own `recompute.ts`, for `records`) does the one I/O fetch first.

---

## 3. Session metrics (`lib/metrics/session.ts`)

Computed at the author's real profile — age 30, 169 cm, 55 kg — which resolves to a Tanaka
estimate of `208 − 0.7 × 30 = 187` bpm before any observed-max override (§3.4 explains exactly
when the override does and does not apply to a run's *own* percentage).

### 3.1 The partial-kilometre exclusion rule (D14) — and what breaks if you skip it

`run_splits.partial` exists for exactly one reason: km 11 of the canonical run is **0.67 km**
run in **288 s** (pace-equivalent 429 s/km, but the *row's own time* is not a full km's worth of
effort). Every metric below that aggregates *individual split rows* — not the whole-run
`duration_sec / (distance_m / 1000)` ratio, which is already correct because it divides by the
true fractional distance — must compute over `splits.filter(s => !s.partial)` **before** doing
anything else with the array: slicing into halves, indexing the last element, computing a mean.

```ts
const full = input.splits.filter((s) => !s.partial)
```

**The bug this guards against is not hypothetical — it is the most natural way to write this
function wrong**, because `splits[splits.length - 1]` is a completely ordinary way to reach for
"the last kilometre" and it is *silently wrong* the moment a partial row exists:

| Metric | Correct (filter first) | Wrong (index raw `splits`, filter never applied) | Why the wrong version happens |
|---|---|---|---|
| Cadence fade | `cad[9] − cad[0] = 136 − 154 = `**`−18`** | `cad[10] − cad[0] = 145 − 154 = `**`−9`** | `splits[splits.length-1].cadence` silently picks up the partial row's cadence — exactly half the true fade |
| 1st→2nd half drift | mean(km6–10) − mean(km1–5) = 462.6 − 421.8 = **`+40.8`** s/km | mean(km6–11) − mean(km1–5) = 457.0 − 421.8 = **`+35.2`** s/km | `half = floor(splits.length / 2)` computed on the unfiltered array shifts which rows land in the second half |
| Aerobic decoupling | **`≈ +12.35%`** | `≈ +11.88%` | second half's mean speed/HR ratio is diluted by the partial row's inflated apparent pace |

The wrong cadence-fade number is the most dangerous of the three: it is not a rounding slip, it
is **exactly half the true value**, and a test that hardcodes `-18` will catch it immediately —
which is the point of pinning exact fixture values rather than "cadence fade is negative."

**What is *not* affected by D14:** `runs.avg_pace_sec` (the whole-run ratio) already divides by
`distance_m / 1000`, which correctly includes the partial kilometre's true distance. D14 applies
only to statistics built by aggregating *individual split rows* — never re-derive the whole-run
average from the splits array; read it from `runs.avg_pace_sec` instead.

### 3.2 Formulas

All formulas operate on `full = input.splits.filter(s => !s.partial)`, `half = Math.floor(full.length / 2)`, `firstHalf = full.slice(0, half)`, `secondHalf = full.slice(half)`.

```ts
// Aerobic decoupling — Pa:Hr ratio, first half vs second half.
// Uses AGGREGATE means (mean pace, mean HR), not a mean of per-split ratios.
function halfSpeedPerBpm(rows: readonly SplitRow[]): number {
  const meanPace = mean(rows.map((r) => r.paceSec))     // s/km
  const meanHr = mean(rows.map((r) => r.hr!))           // bpm — full rows are never HR-null in practice; guard anyway
  return (1000 / meanPace) / meanHr                      // (m/s) per bpm
}
const r1 = halfSpeedPerBpm(firstHalf), r2 = halfSpeedPerBpm(secondHalf)
const decouplingPct = ((r1 - r2) / r1) * 100
// canonical fixture: r1 = 1000/421.8/169.0, r2 = 1000/462.6/175.8 → decouplingPct ≈ +12.35%
```

```ts
// First → second half pacing drift, s/km. Positive = slowed down (positive split).
const splitDriftSecPerKm = mean(secondHalf.map((r) => r.paceSec)) - mean(firstHalf.map((r) => r.paceSec))
// canonical fixture: 462.6 - 421.8 = +40.8   (ROADMAP prose rounds this to "+41 s/km" for
// display; the function returns the unrounded float — rounding is lib/format.ts's job, never
// bake a rounded constant into the metrics layer)
```

```ts
// Pace consistency — population std dev of full-km paces.
const paces = full.map((r) => r.paceSec)
const paceMean = mean(paces)
const paceSdSec = Math.sqrt(mean(paces.map((p) => (p - paceMean) ** 2)))
// canonical fixture: paces = [396,428,431,431,423,440,452,474,467,480], mean 442.2 → sd ≈ 24.72
```

```ts
// Cadence fade — LAST FULL km minus FIRST FULL km. Never `splits.at(-1)` on the raw array (§3.1).
const cadenceFadeSpm = full.at(-1)!.cadence! - full[0]!.cadence!
// canonical fixture: 136 - 154 = -18
```

```ts
// Fastest / slowest full km.
const fastestKm = full.reduce((a, r) => (r.paceSec < a.paceSec ? r : a))
const slowestKm = full.reduce((a, r) => (r.paceSec > a.paceSec ? r : a))
// canonical fixture: fastest = km1 @ 396s (6'36"), slowest = km10 @ 480s (8'00")
```

```ts
// Zone distribution. Raw floats for hardPct/threshold checks; integer apportionment (round.ts)
// is a DISPLAY-layer concern applied by the caller, never baked into hardPct's own comparisons —
// a rounding artefact must never be able to flip a flag.
const zoneTotalSec = zones.reduce((a, z) => a + z.durationSec, 0)
const zonePct = zones.map((z) => ({ zone: z.zone, durationSec: z.durationSec, pct: zoneTotalSec > 0 ? (z.durationSec / zoneTotalSec) * 100 : 0 }))
const hardPct = zonePct.filter((z) => z.zone >= 4).reduce((a, z) => a + z.pct, 0)
// canonical fixture: Z4 47.12% + Z5 43.48% = hardPct ≈ 90.60%
// Displayed integers (roundSharesTo100, lib/metrics/round.ts, a direct port of
// expense-tracking's largestRemainderPct): floor gives [2,0,6,47,43]=98, the two largest
// fractional remainders (Z3 .594, Z2 .544) each get +1 → [2,1,7,47,43], sums to exactly 100,
// and still reads "Z4 47%, Z5 43%" — the headline numbers are unaffected either way here.
```

```ts
// HR recovery @ 1 minute. Requires the new runs.endHrBpm / runs.hr1MinPostBpm columns — see
// Contract deltas. null, not 0, when either reading is missing.
const hrRecovery1MinBpm =
  recovery?.endHrBpm != null && recovery?.hrAt1MinBpm != null
    ? recovery.endHrBpm - recovery.hrAt1MinBpm
    : null
// canonical fixture: 185 - 162 = 23
```

```ts
// Avg HR % of max — the ONE metric that depends on hrMax at all.
const avgHrPctMax = hrMax != null && input.avgHrBpm != null ? (input.avgHrBpm / hrMax.bpm) * 100 : null
```

### 3.3 `fullSplitCount` and the degenerate-run guard

`decouplingPct`, `splitDriftSecPerKm`, and `paceSdSec` require `full.length >= 2` (so `half >= 1`
and both slices are non-empty); `cadenceFadeSpm` requires `full.length >= 1`. A run with 0 or 1
full-km splits (a very short run, or one that is entirely a single partial kilometre) returns
`null` for all four rather than `NaN` from a `0/0` division. `fullSplitCount = full.length` is
exposed so a caller (F08's chart, a future badge rule) can render "not enough data for pacing
analysis" instead of silently omitting a field a reader would otherwise assume just wasn't
computed yet. This is a defensive path, not a live v0.1.0 scenario — ROADMAP's non-goals mean no
`source: 'manual'` UI ships, so every real session in v0.1.0 comes from extraction with a full
splits table — but the guard costs nothing and turns a future edge case into `null`, not a crash.

### 3.4 HRmax consumption contract — the self-exclusion requirement, and a conflict with F02's current draft

**The fixture's own number proves which HRmax value must be used.** `avgHrPctMax = 92.5%` is
stated in `IMPLEMENTATION_PLAN.md` §4 and matches `research/show-metrics.mjs`'s literal output.
Check the arithmetic both ways:

```
173 / 187 (Tanaka estimate)        = 92.51%  → rounds to 92.5%  ✓ matches the required fixture value
173 / 189 (this run's own max_hr)  = 91.53%  → rounds to 91.5%  ✗ does not match
```

This run **is** "the very first run analysed" that IMPLEMENTATION_PLAN §4.1 uses as its worked
example of an observed max (189) overtaking the Tanaka estimate (187). For the fixture's own
`avgHrPctMax` to come out to 92.5%, the HRmax used to score **a run's own session metrics must
exclude that run's own `max_hr` from the observed-max pool** — i.e. resolution must be done
*as of just before this run*, not against the live, all-runs-included state.

**This is a real conflict with F02's plan as currently drafted, not a hypothetical one.** F02's
`resolveHrMax(userId)` scans `WHERE user_id = $1 AND max_hr > $2` with no per-run cutoff, and its
own unit-test scenario 2 states plainly: *"No `max_hr`, `birth_year = 1996`, one run with
`max_hr = 189` → returns `{ bpm: 189, source: 'observed' }`"* — which is precisely this fixture,
and which produces 91.5%, not 92.5%, if `computeSessionMetrics` is fed that value. F02's
`resolveHrMaxAsOf(userId, cutoff)` doesn't fix this either — its documented predicate is
`runs.occurred_on <= cutoff`, which is *inclusive* and would still pull in this run's own row
when called with the run's own `occurred_on` as the cutoff.

**What F06 needs from F02/F03, precisely:** a resolver variant that answers *"what was HRmax
immediately before run X existed"* — not date-based (two runs can share a calendar day; `<` on
`occurred_on` is both too strict for a same-day earlier run and too generous for a same-day
later one), but **identity-based**:

```ts
// Requested addition to lib/metrics/hrMax.ts (F02's file):
export async function resolveHrMaxExcludingRun(userId: string, runId: string): Promise<HrMax | null>
// Same resolution order as resolveHrMax, but the observed-max query adds `AND runs.id <> $runId`.
```

`computeSessionMetrics`'s own caller (F05's post-commit step, or F08's run-detail loader) is
responsible for calling `resolveHrMaxExcludingRun(userId, input.runId)` — never plain
`resolveHrMax` — when resolving the `hrMax` argument for **that run's own** metrics. Plain
`resolveHrMax(userId)` remains correct for every *other* use F02 lists (`/me`, defaulting a new
upload, badge evaluation against "the current understanding") — this is a narrow, single-purpose
addition, not a change to `resolveHrMax`'s existing contract.

**One consequence worth stating explicitly:** under this rule, the canonical run's *own* page
shows 92.5% (the estimate that was true before it ran), while F02's `hrMaxTransitionAt` banner
still correctly announces on that same page *"your watch just recorded 189, above your predicted
187 — HRmax **from here forward** uses 189"* — the banner and the run's own historical percentage
are allowed to disagree, on purpose, in the same way a bank statement's balance-as-of-this-line
and today's live balance are allowed to disagree. F02's current banner copy ("Heart rate
percentages **on this run**, and going forward, now use 189 bpm") should be adjusted to drop "on
this run" once this delta is accepted — flagging that wording fix for F02, not changing it here.

### 3.5 Degradation — what disappears when `HrMax` is `null`

`resolveHrMax`/`resolveHrMaxExcludingRun` return `null` only when there is no `birth_year` **and**
no qualifying observed run. When that happens:

| Stays computable (unaffected by HRmax) | Disappears |
|---|---|
| `decouplingPct`, `splitDriftSecPerKm`, `paceSdSec`, `cadenceFadeSpm`, `fastestKm`/`slowestKm`, `zonePct`/`hardPct`, `hrRecovery1MinBpm` | `avgHrPctMax` → `null`, never `0` or a substituted constant |
| `TOO_MUCH_HARD`, `POSITIVE_SPLIT`, `CADENCE_FADE`, `HIGH_DECOUPLING`, `SLOW_HR_RECOVERY`, `FAST_START` (§4) | `VERY_HIGH_AVG_HR` → simply never pushed to the flags array (not "false" — absent) |
| Every record in §7 except none — **no record key depends on HRmax at all** (`highest_max_hr` and `best_paced_run` both use raw `max_hr`/`decouplingPct`, neither divides by a resolved HRmax) | — |
| `run_zones`' own bucket boundaries (`min_bpm`/`max_bpm`, and therefore `zonePct`) — these come from Apple's own on-device zone calibration, extracted as-is, and never touch this app's resolver | — |

**HRmax nullability affects exactly two fields in this feature's entire surface: `avgHrPctMax`
and the `VERY_HIGH_AVG_HR` flag.** Every other metric, flag, and record is computable from
`run_splits`/`run_zones` alone. This is worth stating as a single sentence because it is the
whole answer to "what does the app lose when onboarding is skipped" (IMPLEMENTATION_PLAN §7) —
not "half the app," but two fields, clearly labelled as absent rather than defaulted.

### 3.6 Acceptance table — session metrics

| Metric | Formula (§3.2) | Canonical fixture value | Test |
|---|---|---|---|
| `avgHrPctMax` | `avgHrBpm / hrMax.bpm × 100` | **92.5%** (173/187, `estimated`, per §3.4) | `session.test.ts` › `avg HR %max` |
| `decouplingPct` | half-speed/HR ratio delta | **+12.3%** (≈12.35, per §3.2) | › `aerobic decoupling` |
| `splitDriftSecPerKm` | mean(2nd half) − mean(1st half) | **+40.8 s/km** (displayed "+41") | › `positive split drift` |
| `paceSdSec` | population std dev, full kms | **24.7 s** (≈24.72) | › `pace consistency` |
| `cadenceFadeSpm` | `cad[last full] − cad[first full]` | **−18 spm** | › `cadence fade` |
| `fastestKm` | min pace, full kms | **km 1, 396 s (6'36")** | › `fastest km` |
| `slowestKm` | max pace, full kms | **km 10, 480 s (8'00")** | › `slowest km` |
| `hardPct` (Z4+Z5) | sum of zone% for zone ≥ 4 | **90.6%** | › `zone distribution` |
| `zonePct[3].pct` (Z4) | `durationSec / zoneTotalSec × 100` | **47.1%** | › `zone distribution` |
| `zonePct[4].pct` (Z5) | same | **43.5%** | › `zone distribution` |
| `hrRecovery1MinBpm` | `endHrBpm − hrAt1MinBpm` | **23 bpm** | › `HR recovery` *(blocked — Contract deltas)* |
| cadence fade, **wrong** (regression) | last raw split, unfiltered | must NOT equal **−9** | › `partial km exclusion — cadence` |
| split drift, **wrong** (regression) | half computed on unfiltered array | must NOT equal **+35.2** | › `partial km exclusion — drift` |

---

## 4. Flags (`lib/metrics/flags.ts`)

Fixed, hand-authored rules. New codes are never invented by the narrative layer — F07's own plan
states this explicitly ("the flag catalog stays entirely F06's"). Flags operate on an
already-computed `SessionMetrics` plus the two raw fields (`splits[0]`, `fastestKm`) `FAST_START`
needs, which keeps flag tests independent of `computeSessionMetrics` — a fires/does-not-fire test
just constructs a `SessionMetrics` object by hand and toggles one field.

```ts
export type FlagCode =
  | 'HIGH_DECOUPLING' | 'TOO_MUCH_HARD' | 'POSITIVE_SPLIT' | 'CADENCE_FADE'
  | 'VERY_HIGH_AVG_HR' | 'SLOW_HR_RECOVERY' | 'FAST_START'
export type FlagSeverity = 'info' | 'warn'
export interface Flag { code: FlagCode; severity: FlagSeverity; value: number }

export function evaluateSessionFlags(m: SessionMetrics, firstFullSplit: SplitRow | null): Flag[]
```

| Code | Severity | Condition (strict) | Fixture value | Fires on fixture? |
|---|---|---|---|---|
| `HIGH_DECOUPLING` | warn | `decouplingPct != null && decouplingPct > 5` | 12.3 | **yes** |
| `TOO_MUCH_HARD` | warn | `hardPct != null && hardPct > 70` | 90.6 | **yes** |
| `POSITIVE_SPLIT` | info | `splitDriftSecPerKm != null && splitDriftSecPerKm > 30` | 40.8 | **yes** |
| `CADENCE_FADE` | warn | `cadenceFadeSpm != null && cadenceFadeSpm < -8` | −18 | **yes** |
| `VERY_HIGH_AVG_HR` | warn | `avgHrPctMax != null && avgHrPctMax > 90` | 92.5 | **yes** |
| `SLOW_HR_RECOVERY` | info | `hrRecovery1MinBpm != null && hrRecovery1MinBpm < 20` | 23 | no |
| `FAST_START` | info | `firstFullSplit != null && fastestKm != null && firstFullSplit.paceSec <= fastestKm.paceSec + 1` | km1 = fastestKm | **yes** |

The six that fire together on the canonical fixture are exactly ROADMAP §4.9's pinned set:
`HIGH_DECOUPLING`, `TOO_MUCH_HARD`, `POSITIVE_SPLIT`, `CADENCE_FADE`, `VERY_HIGH_AVG_HR`,
`FAST_START`. `SLOW_HR_RECOVERY` is inherited from `research/metrics.mjs`'s reference
implementation and kept as a seventh flag — its own fires/does-not-fire pair uses a synthetic
value (fixture's 23 is the *does-not-fire* case; a synthetic recovery of `endHr - hrAt1Min = 15`
is the *fires* case).

**`FAST_START` uses the first *full* split, never `splits[0]` on the raw array.** The reference
implementation's `s.splits[0]` happens to be correct on this fixture only because km 1 is not
partial; a run that somehow had a partial *first* row (never true under D14's stated design, but
defensive typing costs nothing) would otherwise compare against the wrong row.

### 4.1 Boundary tests — every threshold is strict, not `>=`/`<=`

Each flag needs a test at the exact threshold proving it does *not* fire there, plus one just
past it that does:

| Flag | At threshold (does not fire) | Just past (fires) |
|---|---|---|
| `HIGH_DECOUPLING` | `decouplingPct = 5.0` | `5.01` |
| `TOO_MUCH_HARD` | `hardPct = 70.0` | `70.01` |
| `POSITIVE_SPLIT` | `splitDriftSecPerKm = 30.0` | `30.01` |
| `CADENCE_FADE` | `cadenceFadeSpm = -8.0` | `-8.01` |
| `VERY_HIGH_AVG_HR` | `avgHrPctMax = 90.0` | `90.01` |
| `SLOW_HR_RECOVERY` | `hrRecovery1MinBpm = 20` | `19` |
| `FAST_START` | first full split pace = fastest + 2 (e.g. fastest 396, split0 398) | fastest + 1 or less |

Plus one integration test: run `evaluateSessionFlags` against `computeSessionMetrics` of the real
canonical fixture and assert the returned set is **exactly** `{HIGH_DECOUPLING, TOO_MUCH_HARD,
POSITIVE_SPLIT, CADENCE_FADE, VERY_HIGH_AVG_HR, FAST_START}` — six codes, no more, no fewer
(`SLOW_HR_RECOVERY` explicitly absent, proving 23 bpm truly falls on the "does not fire" side).

---

## 5. Week metrics (`lib/metrics/week.ts`)

```ts
export type DistanceBucket = '5k' | '10k' | 'half' | 'full' | 'other'

/** Boundaries are training-run buckets around race-equivalent efforts, not race distances
 *  themselves — an MVP heuristic, explicitly tunable, NOT asserted by the canonical fixture
 *  (which is a single run; bucket tests use the synthetic fixture in §5.5). */
export function bucketForDistanceM(distanceM: number): DistanceBucket {
  if (distanceM < 3500) return 'other'
  if (distanceM < 7000) return '5k'
  if (distanceM < 15000) return '10k'
  if (distanceM < 30000) return 'half'
  return 'full'
}

export type VolumeDelta =
  | { kind: 'none' }
  | { kind: 'first'; currentM: number }
  | { kind: 'pct'; pct: number; direction: 'up' | 'down' | 'flat'; currentM: number; previousM: number }

/** Direct structural mirror of expense-tracking's computeDelta — same divide-by-zero guard,
 *  same rounding rule (1dp under 10%, 0dp at/above), same 'flat' band under 0.5%. Ported, not
 *  reinvented, because the shape of "compare two periods honestly" doesn't change with domain. */
export function computeVolumeDelta(currentM: number, previousM: number): VolumeDelta

export interface WeekRunSummary {
  runId: string; occurredOn: string; distanceM: number; durationSec: number
  zones: readonly ZoneRow[]
}

export interface WeekMetrics {
  weekKey: string                                    // ISO week, e.g. '2026-W34'
  volumeM: number
  runCount: number
  longestRunM: number | null                          // null iff runCount === 0
  z1z2SharePct: number | null                          // null iff aggregate zone time is 0
  volumeDelta: VolumeDelta
  jumpWarning: boolean                                 // volumeDelta.kind==='pct' && direction==='up' && pct > 10
  avgPaceByBucket: Partial<Record<DistanceBucket, number>>   // s/km, distance-WEIGHTED, not a mean of averages
}

export function computeWeekMetrics(
  weekKey: string, runs: readonly WeekRunSummary[], previousWeekVolumeM: number,
): WeekMetrics
```

**`avgPaceByBucket` is distance-weighted** (`avgPaceSecPerKm(Σ distanceM, Σ durationSec)` per
bucket — reusing `lib/metrics/pace.ts`, §8), never a mean of each run's own `avg_pace_sec`. A
5 km recovery jog and a 15 km tempo run must not count equally toward "this week's 10k-effort
pace" — the run that covered more ground should weigh more.

**`jumpWarning`** is the ">10% jump warning" IMPLEMENTATION_PLAN §4 asks for. It fires only on an
*increase* — a taper or rest week is not a training-load warning, so a decrease never sets this
flag regardless of magnitude. This is not one of the seven session `FlagCode`s (§4) — it is a
boolean on `WeekMetrics` itself, since "week volume jumped" has no meaning at session scope and
introducing a `FlagCode` for it would blur the session-flag catalog F07 already treats as closed.

### 5.5 Synthetic week fixture (`__fixtures__/syntheticWeek.ts`)

The shipped canonical fixture is a single run; week aggregation needs ≥2 runs to test. This
fixture is **not** derived from the screenshots — it is hand-built, and every number below is
worked by hand so the test has a known-correct expected value, exactly like the canonical
fixture's own numbers.

Week `2026-W34` (Mon 17 Aug – Sun 23 Aug 2026):

| Date | distanceM | durationSec | Z1+Z2 (s) | zone total (s) |
|---|---|---|---|---|
| Mon 17 Aug | 5000 | 1800 | 1650 (900+750) | 1800 |
| **Thu 20 Aug** (canonical run) | 10670 | 4716 | 129 (104+25) | 4595 |
| Sat 22 Aug | 8000 | 3040 | 1400 (200+1200) | 2800 |

- `volumeM = 5000 + 10670 + 8000 = `**`23670`**
- `runCount = 3`
- `longestRunM = `**`10670`** (Thursday's run)
- `z1z2SharePct = (1650+129+1400) / (1800+4595+2800) × 100 = 3179/9195×100 ≈ `**`34.6%`**
- `previousWeekVolumeM = 20000` (given) → `volumeDelta = {kind:'pct', pct:18, direction:'up', currentM:23670, previousM:20000}` (raw 18.35%, rounds to 18 at ≥10%) → `jumpWarning = `**`true`**
- Bucket assignment: Mon(5000)→`'5k'`, Thu(10670)&Sat(8000)→`'10k'` (both ≥7000 and <15000)
  - `avgPaceByBucket['5k'] = avgPaceSecPerKm(5000, 1800) = 1800/5 = `**`360 s/km`**
  - `avgPaceByBucket['10k'] = avgPaceSecPerKm(10670+8000, 4716+3040) = 18670m / 7756s → `**`≈415.4 s/km`**

---

## 6. Month metrics (`lib/metrics/month.ts`) and ACWR (`lib/metrics/acwr.ts`)

```ts
export interface MonthRunSummary {
  runId: string; occurredOn: string; distanceM: number; durationSec: number
  zones: readonly ZoneRow[]
}

export interface PaceComparison {
  thisMonthSecPerKm: number
  previousMonthSecPerKm: number | null    // null iff no run in that bucket last month
  deltaSecPerKm: number | null
}

export interface MonthMetrics {
  monthKey: string                                          // 'YYYY-MM'
  volumeM: number
  volumeDelta: VolumeDelta                                   // REUSES week.ts's computeVolumeDelta — no reimplementation
  paceTrendByBucket: Partial<Record<DistanceBucket, PaceComparison>>
  zonePct: ZonePctRow[]                                      // aggregate across every run in the month
}

export function computeMonthMetrics(
  monthKey: string, runs: readonly MonthRunSummary[], previousMonthRuns: readonly MonthRunSummary[],
): MonthMetrics
```

`zonePct` is the exact same reduction as a week's `z1z2SharePct`, generalised to all five zones
over a different run-set — no new arithmetic, just a wider `runs` array folded through the same
`Σ durationSec / Σ zoneTotalSec` shape already proven in §5.5.

### 6.4 ACWR — defined precisely, because the naive version is silently wrong

IMPLEMENTATION_PLAN §4 says "acute:chronic workload ratio (7-day ÷ 28-day volume; flag outside
0.8–1.3)." Read literally — `Σ7dayVolume / Σ28dayVolume` with no further scaling — **this can
never land near the stated 0.8–1.3 band**: at any steady, unchanging training volume, 7 days is
exactly one quarter of 28 days, so the naive ratio is **identically 0.25 forever**, regardless of
whether training load is dangerously spiking or perfectly stable. A threshold check written
against that formula would never fire in the "too high" direction no matter how reckless the
week, which defeats the entire purpose of the flag.

**Correct definition (Gabbett's coupled ACWR, both sides expressed as weekly-equivalent load):**

```ts
export interface DailyLoadPoint { occurredOn: string; distanceM: number }

export interface Acwr {
  acuteKm: number                 // Σ distanceM for occurredOn ∈ [asOf-6d, asOf], inclusive, /1000
  chronicWeeklyAvgKm: number      // Σ distanceM for occurredOn ∈ [asOf-27d, asOf] /1000 /4
  ratio: number | null            // acuteKm / chronicWeeklyAvgKm; null if chronic is 0 or history is insufficient
  insufficientHistory: boolean    // true if the user's first-ever run is < 28 days before asOf
}

export function computeAcwr(
  runs: readonly DailyLoadPoint[], asOf: string, firstRunOn: string | null,
): Acwr
```

The `/ 4` (equivalently, multiplying the acute side by 4 before dividing by the raw 28-day total)
is what makes the ratio comparable to "1.0 = holding steady": at constant weekly volume `V`,
`acuteKm ≡ V` and `chronicWeeklyAvgKm ≡ (4V)/4 = V`, so `ratio ≡ 1.0` — only this form is
compatible with a 0.8–1.3 "sweet spot," which is exactly what the published sports-science
literature the roadmap's thresholds come from actually measures.

**Insufficient-history guard.** A user in their first four weeks has an artificially small
28-day denominator that would otherwise produce a spuriously extreme ratio on their very first
real training week. Rather than compute a misleading number, `ratio` is `null` and
`insufficientHistory` is `true` whenever `firstRunOn` is less than 28 days before `asOf`. This is
a deliberate divergence from "just compute it anyway" — an ACWR of 3.2 in someone's second week
is not a training-load red flag, it's a denominator with three weeks of nothing in it.

**ACWR is not month-key-scoped.** It answers "what is this runner's current injury-risk profile,
right now" — a single rolling value computed as of *today* (Asia/Jakarta), independent of which
month's page happens to be open. Viewing March 2026's rollup does not recompute ACWR "as of
March"; it shows the same current ACWR the month view for any other month would show. Treating it
as a per-`monthKey` fact (the way `volumeDelta` and `paceTrendByBucket` are) would silently invite
someone to read a training-risk indicator historically, which it is not designed to support.

**`ACWR_OUT_OF_RANGE`** fires when `!insufficientHistory && ratio != null && (ratio < 0.8 || ratio > 1.3)`. Like `jumpWarning`, this is not a session `FlagCode` — it lives on the ACWR result itself, evaluated once per render, not once per run.

### 6.5 Worked ACWR example (relative-day, not tied to any calendar fixture)

**Steady-state proof (algebraic, no numbers needed):** at any constant weekly distance `V`,
naive `Σ7/Σ28 ≡ 0.25` always; correct `acuteKm/chronicWeeklyAvgKm ≡ 1.0` always. Only the second
is usable against a 0.8–1.3 band. This is the test that has teeth without needing a big fixture:
assert that four weeks of *identical* weekly volume produce `ratio ≈ 1.0`, not `≈ 0.25`.

**In-range case:** acute week (day −6..0) totals 23.67 km (this is literally the §5.5 synthetic
week). The three weeks before it (day −7..−27) each total 20 km. `chronicWeeklyAvgKm =
(20+20+20+23.67)/4 = 20.9175`. `ratio = 23.67/20.9175 ≈ `**`1.13`** → inside 0.8–1.3 →
`ACWR_OUT_OF_RANGE` **does not fire**.

**Out-of-range case:** same chronic baseline (20.9175), but the runner spikes to 40 km this week
(a sudden near-doubling). `ratio = 40/20.9175 ≈ `**`1.91`** → above 1.3 → `ACWR_OUT_OF_RANGE`
**fires**.

**Insufficient-history case:** `firstRunOn` is 10 days before `asOf`. Regardless of the raw
numbers, `insufficientHistory = true`, `ratio = null`, flag never fires.

---

## 7. Records (`lib/records/*`)

### 7.1 Catalog — unchanged from ROADMAP §4.5, encoded as data

```ts
export type RecordKey =
  | 'longest_distance' | 'longest_duration' | 'fastest_pace_5k' | 'fastest_pace_10k'
  | 'fastest_km_split' | 'most_kcal' | 'most_elevation' | 'highest_cadence'
  | 'highest_max_hr' | 'best_paced_run'

export type RecordDirection = 'max' | 'min'

/** Everything computeRecords() needs about one run. Populated by recompute.ts (§7.3) by
 *  calling computeSessionMetrics(session, null) per run — hrMax is irrelevant to every field
 *  here (§3.5), so passing null avoids an unnecessary per-run HRmax resolution during a
 *  whole-history scan. */
export interface RecordCandidate {
  runId: string
  occurredOn: string
  distanceM: number
  durationSec: number
  avgPaceSec: number                    // runs.avg_pace_sec — the whole-run ratio, not re-derived
  activeKcal: number | null
  elevationM: number | null
  avgCadence: number | null
  maxHr: number | null
  fastestFullKmPaceSec: number | null    // min(SessionMetrics.fastestKm.paceSec) — null if no full splits
  decouplingBp: number | null            // round(abs(SessionMetrics.decouplingPct) * 100) — null if decouplingPct is null
}

export interface RecordDefinition {
  key: RecordKey
  unit: 'm' | 's' | 's_per_km' | 'kcal' | 'spm' | 'bpm' | 'bp'   // 'bp' = basis points
  direction: RecordDirection
  qualifies: (c: RecordCandidate) => boolean
  valueOf: (c: RecordCandidate) => number | null   // null excludes this run from THIS key only
}

export const RECORD_CATALOG: readonly RecordDefinition[] = [
  { key: 'longest_distance',  unit: 'm',       direction: 'max', qualifies: () => true,                       valueOf: (c) => c.distanceM },
  { key: 'longest_duration',  unit: 's',       direction: 'max', qualifies: () => true,                       valueOf: (c) => c.durationSec },
  { key: 'fastest_pace_5k',   unit: 's_per_km',direction: 'min', qualifies: (c) => c.distanceM >= 5000,        valueOf: (c) => c.avgPaceSec },
  { key: 'fastest_pace_10k',  unit: 's_per_km',direction: 'min', qualifies: (c) => c.distanceM >= 10000,       valueOf: (c) => c.avgPaceSec },
  { key: 'fastest_km_split',  unit: 's_per_km',direction: 'min', qualifies: (c) => c.fastestFullKmPaceSec != null, valueOf: (c) => c.fastestFullKmPaceSec },
  { key: 'most_kcal',         unit: 'kcal',    direction: 'max', qualifies: (c) => c.activeKcal != null,       valueOf: (c) => c.activeKcal },
  { key: 'most_elevation',    unit: 'm',       direction: 'max', qualifies: (c) => c.elevationM != null,       valueOf: (c) => c.elevationM },
  { key: 'highest_cadence',   unit: 'spm',     direction: 'max', qualifies: (c) => c.distanceM >= 5000 && c.avgCadence != null, valueOf: (c) => c.avgCadence },
  { key: 'highest_max_hr',    unit: 'bpm',     direction: 'max', qualifies: (c) => c.maxHr != null,            valueOf: (c) => c.maxHr },
  { key: 'best_paced_run',    unit: 'bp',      direction: 'min', qualifies: (c) => c.distanceM >= 5000 && c.decouplingBp != null, valueOf: (c) => c.decouplingBp },
]
```

`fastest_pace_5k` / `fastest_pace_10k` compare the **whole-run** `avg_pace_sec` among runs at
least that long — not a best-effort 5 km/10 km *segment* extracted from a longer run. A 12 km
run's overall pace can win `fastest_pace_10k`; it is not attempting to reconstruct "your best 10k
split within this run," which would need per-metre GPS data this app never has (ROADMAP non-goals:
no GPX/route data). State this plainly in the UI copy (F08's job) so it isn't misread as a race PB.

`best_paced_run`'s basis-points encoding: `round(abs(decouplingPct) * 100)`. Canonical fixture:
`abs(12.3466) * 100 = 1234.66 → `**`1235`** bp (roadmap's own worked example, "1234 = 12.34%," is
the same idea to one unit of rounding). Storing basis points keeps `records.value` an integer for
every key (schema §4.3: `value int NOT NULL`), consistent with D5's whole-number discipline.

### 7.2 Pure comparator (`lib/records/compute.ts`)

```ts
export interface RecordResult { key: RecordKey; runId: string; value: number; achievedOn: string }

/**
 * For each catalog key: filter to qualifying candidates with a non-null valueOf, then reduce by
 * direction. Ties are broken by earliest occurredOn (then runId, for full determinism) — the
 * record belongs to whoever got there FIRST, mirroring expense-tracking's largestRemainderPct
 * tie-break-on-earlier-index convention. A later run must beat the holder STRICTLY, never merely
 * equal it, to take the record.
 */
export function computeRecords(candidates: readonly RecordCandidate[]): RecordResult[]
```

Absence is meaningful: if no candidate qualifies for a key (e.g. nobody has run ≥10 km yet), that
key is simply missing from the returned array — never a synthetic zero-value row.

### 7.3 Recompute — the algorithm and the trigger contract with F05

**Records are recomputed in full, never incremented (ROADMAP, unchanged).** A review correction
that lowers a run's `distance_m` below a qualifier, or deletes the run outright, can only be
expressed correctly by re-deriving the whole set from scratch — F05's own plan states the
identical rule for the identical reason and assigns this exact recompute to F06.

**Reviewed-only, mirroring F03's `getObservedMaxHr` and ROADMAP §4.6's badge rule:** candidates
are built only from runs with `reviewed_at IS NOT NULL`. A record set by an unconfirmed
extraction is a record set by a number nobody has vouched for — the same principle §4.6 already
states for badges, extended here for consistency though ROADMAP §4.5 doesn't spell it out.

```ts
export interface RecordRow { key: RecordKey; runId: string; value: number; achievedOn: string; previousValue: number | null }
export interface RecordUpsert extends RecordRow {}

/** F03-provided. recompute.ts is the one lib/records file that touches I/O — through this
 *  injected seam, never a direct db import, so compute.ts/catalog.ts stay unit-testable with
 *  in-memory fixtures and recompute.ts is testable with a fake gateway (no live DB in CI). */
export interface RecordsGateway {
  fetchReviewedRuns(userId: string): Promise<Array<SessionInput & { avgPaceSec: number; activeKcal: number | null; elevationM: number | null; avgCadence: number | null; maxHr: number | null }>>
  readCurrent(userId: string): Promise<Map<RecordKey, RecordRow>>
  upsert(userId: string, rows: RecordUpsert[]): Promise<void>
  deleteKeys(userId: string, keys: readonly RecordKey[]): Promise<void>
}

/**
 * 1. Fetch every reviewed run's rows via the gateway.
 * 2. Map each to a RecordCandidate by calling computeSessionMetrics(session, null) — reusing
 *    session.ts's decoupling/fastest-km math rather than a second implementation (§7.1).
 * 3. computeRecords(candidates) — pure.
 * 4. Diff against gateway.readCurrent(): for each key present in the new best set, upsert iff
 *    (runId, value) differs from the current row, carrying previousValue = the old value (or
 *    null if this is the key's first-ever holder). For each key ABSENT from the new best set
 *    but PRESENT in current (e.g. the sole ≥10k run was corrected below 10 km), delete it.
 * 5. Return the changed RecordUpsert[] — the caller (F09) uses this to know which keys just
 *    moved without re-deriving "did anything change" itself.
 */
export async function recomputeRecords(userId: string, gateway: RecordsGateway): Promise<RecordUpsert[]>
```

**Trigger contract — what F05 (and F09) must do, precisely:**

1. F05's server action, immediately after committing `runs`/`run_splits`/`run_zones` for a
   reviewed run (first-time review, a correction to an already-reviewed run, or a deletion),
   calls `recomputeRecords(userId, gateway)` **synchronously, in the same request** — never a
   queued job. At ~17 runs/month a full history scan is sub-millisecond-class work; there is no
   latency case for deferring it, and deferring it would let F09's badge evaluation (next) run
   against stale records.
2. F09's badge evaluation (`new_ceiling`, `long_way_home`) runs **after** step 1 completes, in
   the same request, and consumes the `RecordUpsert[]` step 1 returned rather than re-querying
   `records` itself to answer "did a record just change" — F06 already knows the answer at the
   exact moment it happened.
3. F06 does not call itself on a schedule and does not run inside `/api/cron/rollup` — that cron
   job (F07's) refreshes *insights*, not *records*; records only ever change in response to a
   write to `runs`, which only F05 (and, for `source: 'manual'`, a future feature this app does
   not ship in v0.1.0) performs.

### 7.4 Worked fixture — Run A (canonical) vs Run B (synthetic, even-paced)

Two runs, hand-built so every one of the ten keys has a verifiable winner:

**Run A** — the canonical fixture: `distanceM 10670, durationSec 4716, avgPaceSec 442,
activeKcal 646, elevationM 15, avgCadence 144, maxHr 189`, `fastestFullKmPaceSec 396`,
`decouplingBp 1235`.

**Run B** — synthetic, `occurredOn` before Run A, 6 perfectly uniform full km splits (pace 300s,
HR 150bpm, cadence 170spm each): `distanceM 6000, durationSec 1800, avgPaceSec 300, activeKcal
380, elevationM 5, avgCadence 170, maxHr 170`, `fastestFullKmPaceSec 300`, `decouplingBp 0`
(identical first/second-half speed-per-bpm ratio by construction — the textbook "perfectly even
effort" run).

| key | qualifies? (A / B) | winner | why |
|---|---|---|---|
| `longest_distance` | yes / yes | **A** (10670 > 6000) | max |
| `longest_duration` | yes / yes | **A** (4716 > 1800) | max |
| `fastest_pace_5k` | yes / yes | **B** (300 < 442) | min, both qualify (≥5000) |
| `fastest_pace_10k` | yes / **no** (6000 < 10000) | **A**, sole qualifier | B excluded — the "does not qualify" test case |
| `fastest_km_split` | yes / yes | **B** (300 < 396) | min, no distance qualifier |
| `most_kcal` | yes / yes | **A** (646 > 380) | max |
| `most_elevation` | yes / yes | **A** (15 > 5) | max |
| `highest_cadence` | yes / yes | **B** (170 > 144) | max, both qualify (≥5000) |
| `highest_max_hr` | yes / yes | **A** (189 > 170) | max |
| `best_paced_run` | yes / yes | **B** (0 < 1235) | min — perfectly even pacing wins |

Plus a third run, **Run C** (`distanceM 2000`, otherwise well-formed), used only to prove
exclusion from every qualifier-gated key (`fastest_pace_5k`, `fastest_pace_10k`,
`highest_cadence`, `best_paced_run`) while still being eligible for the six unqualified keys.

A tie test: two runs with identical `avgPaceSec` for `fastest_pace_5k` — the earlier-`occurredOn`
run must win, proving the deterministic tie-break in §7.2.

---

## 8. `lib/metrics/pace.ts` and `lib/metrics/round.ts` — the two shared utilities

```ts
// lib/metrics/pace.ts
/** The one place distance/duration becomes a pace. F05 (writing runs.avg_pace_sec at commit
 *  time) and week/month's bucket averages both call this — never re-divide inline elsewhere. */
export function avgPaceSecPerKm(distanceM: number, durationSec: number): number {
  return Math.round(durationSec / (distanceM / 1000))
}
// canonical fixture: avgPaceSecPerKm(10670, 4716) = Math.round(441.99...) = 442 ✓ matches runs.avg_pace_sec
```

```ts
// lib/metrics/round.ts — direct port of expense-tracking/lib/stats/series.ts's largestRemainderPct.
// DISPLAY layer only: used to render zone percentages that sum to exactly 100. Never call this
// before a threshold comparison (hardPct, ACWR, any flag) — thresholds always use the raw float.
export function roundSharesTo100(values: readonly number[]): number[]
```

`round.ts`'s test suite mirrors `expense-tracking/lib/stats/__tests__/series.test.ts`'s
`largestRemainderPct` describe block almost verbatim (sums to 100, empty input, single value,
deterministic tie-break, never awards a percent to a zero row) — same algorithm, same edge
cases, different domain (zone seconds instead of category rupiah).

---

## 9. Task breakdown

1. **Port the canonical fixture.** `lib/metrics/__fixtures__/canonicalRun.ts`, built from
   `research/schema.mjs`'s `TRUTH` via the §1.1 remap table. Stub `recovery: null` until Task 9
   lands the schema addition; mark the HR-recovery test `it.todo` with a comment citing the
   blocking migration, not silently skipped.
2. `lib/metrics/types.ts` — every interface in §2, `HrMax`/`HrMaxSource` re-exported from
   `./hrMax`, never redeclared.
3. `lib/metrics/round.ts` + tests — port `largestRemainderPct`, rename to `roundSharesTo100`,
   same test names adapted to zone data.
4. `lib/metrics/pace.ts` + tests — `avgPaceSecPerKm`, one test against the fixture (442).
5. `lib/metrics/session.ts` + `__tests__/session.test.ts` — every row of §3.6's acceptance
   table, plus the two "wrong" regression tests from §3.1 (assert the buggy values do NOT come
   out), plus the degenerate-run guard (§3.3) with 0 and 1 full-km inputs.
6. `lib/metrics/flags.ts` + `__tests__/flags.test.ts` — the fourteen boundary tests in §4.1, plus
   the "exactly six, no more, no fewer" integration test against the real canonical fixture.
7. `lib/metrics/week.ts` + `__fixtures__/syntheticWeek.ts` + tests — every number in §5.5,
   `computeVolumeDelta`'s none/first/pct/flat cases (mirroring `computeDelta`'s own test
   coverage), `bucketForDistanceM`'s boundary values.
8. `lib/metrics/acwr.ts` + tests — the steady-state algebraic proof, the in-range/out-of-range
   pair from §6.5, the insufficient-history guard.
9. `lib/metrics/month.ts` + `__fixtures__/syntheticMonth.ts` + tests — volume delta (reusing
   `computeVolumeDelta`), pace trend by bucket, aggregate zone reduction.
10. `lib/records/types.ts` + `catalog.ts` + `__tests__/catalog.test.ts` — the §7.4 A/B/C fixture,
    every key's qualify/exclude/win/lose outcome from the table in §7.4.
11. `lib/records/compute.ts` + tests — the pure reduction, plus an explicit tie test (§7.4's
    last paragraph).
12. `lib/records/recompute.ts` + tests against a hand-written fake `RecordsGateway` — covers:
    first-ever computation (empty `readCurrent`), a correction that lowers a held value
    (`previousValue` populated correctly), a deletion that removes a key's sole qualifier (row
    deleted via `deleteKeys`), an unreviewed run excluded from `fetchReviewedRuns` entirely.
13. **File the two cross-plan follow-ups** this plan surfaces (§3.4's `resolveHrMaxExcludingRun`
    request to F02; the Contract deltas schema addition to F03) as explicit items on those
    features' own task lists — not implemented here, but this feature cannot ship a correct
    `avgHrPctMax`/`hrRecovery1MinBpm` without them landing first.
14. Typecheck + lint + `vitest run lib/metrics lib/records` green; confirm `research/score.mjs`
    (D13) still passes unmodified — this feature must never touch `research/`.

---

## 10. Verification

```bash
# Every unit in this plan, no live LLM, no live DB (recompute.ts uses a fake gateway):
npx vitest run lib/metrics lib/records

# The reference harness this feature productionises must stay green independently (D13):
node research/score.mjs

npx tsc --noEmit
```

Verification checklist — one line per acceptance-table row (§3.6, §4, §5.5, §6.5, §7.4), each
resolving to exactly one named `it(...)` block:

- [ ] All 13 rows of §3.6 (11 real values + 2 regression guards) pass with the canonical fixture.
- [ ] All 7 flags have a fires + does-not-fire pair (14 tests) plus the "exactly six" integration
      assertion.
- [ ] `computeWeekMetrics` reproduces every number in §5.5's table from the synthetic week input.
- [ ] `computeAcwr` reproduces the steady-state proof, the 1.13/1.91 pair, and the
      insufficient-history null.
- [ ] All 10 record keys resolve to the winner in §7.4's table from the A/B/C candidates, plus
      the tie-break test.
- [ ] `recomputeRecords` correctly upserts, diffs `previousValue`, and deletes a key against the
      fake gateway.
- [ ] No test in `lib/metrics/__tests__` or `lib/records/__tests__` imports `hrMax.ts`'s DB-facing
      internals or opens a real database connection.
- [ ] `research/score.mjs` is untouched and still passing.

---

## Contract deltas

**§4.3 (`runs` table) — two nullable columns are missing for the `hrRecovery1MinBpm` metric.**
This is a delta to §4.3, not §4.5 (records catalog); flagged under this heading anyway since it's
the schema this feature's session metrics depend on, and no other section is designated for it.

`research/schema.mjs`'s extraction shape captures a 3-point `postWorkoutHr` series (end-of-workout,
+1 min, +2 min), and IMPLEMENTATION_PLAN §4 lists "HR recovery @ 1 min" (fixture value **23 bpm**)
as a required session metric — but neither `IMPLEMENTATION_PLAN.md §3` nor `ROADMAP §4.3`
persists this series anywhere past `extractions.raw_response` (an opaque JSON blob F05 does not
parse when committing structured rows). F07's own plan already assumes the field exists
(`SessionNarrateFacts.hrRecovery1MinBpm: number | null`), so this gap blocks two features, not
one.

**Requested addition to `runs` (F03's table, §4.3):**

```
runs
  ...
  end_hr_bpm        int NULL   -- HR at the moment the workout ended (postWorkoutHr[0])
  hr_1min_post_bpm  int NULL   -- HR one minute after ending (postWorkoutHr[1])
```

Two flat nullable columns, matching how `avg_hr`/`max_hr`/`resting_hr` are already flat columns
on `runs` rather than a child table — there are exactly two scalars any metric ever consumes, not
a list. The screenshot's 2-minute reading (`postWorkoutHr[2]`) is captured by extraction but
consumed by no metric in this plan; it does not need a column. F05's review/correction screen
gains two more editable fields (same correction mechanism as every other extracted field); F04's
extraction→structured-commit mapping gains two more assignments. Until this lands, `session.ts`'s
`hrRecovery1MinBpm` and `flags.ts`'s `SLOW_HR_RECOVERY` are implemented and unit-tested against
the ported fixture (Task 1, §9) but cannot be exercised end-to-end against a real committed run.

**§4.4 (HRmax resolution) — F02's `resolveHrMax`/`resolveHrMaxAsOf` cannot produce the fixture's
92.5% for a run's own metrics; a third, identity-excluding resolver is needed.** Fully argued in
§3.4. This is not a change to the *resolution order* (measured → observed → estimated → null) —
it is a request for one additional entry point, `resolveHrMaxExcludingRun(userId, runId)`, so a
run's own session metrics can be resolved *as of just before that run existed* rather than
against the live, all-runs-included state its own `max_hr` has since joined. No column or
constraint changes; this is a query-shape addition to F02's existing file (`AND runs.id <>
$runId` on the same observed-max query F03 already exposes via `getObservedMaxHr`).
