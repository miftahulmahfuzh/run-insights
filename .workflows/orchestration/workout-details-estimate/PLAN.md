# Plan: Workout Details screenshot as a Splits stand-in

**Slug:** workout-details-estimate
**Date:** 2026-11-22 16:04 WIB
**Analysis:** `.workflows/analyze/20261122-160452-W4D7_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/workout-details-estimate`
**Branch:** `feature/workout-details-estimate` (base: `origin/main` @ `7e285b3`)
**Phases:** 3
**Status:** planned (reconciled 2026-11-22, round 1)
**Coordinator:** —

---

## Why

> Add a fourth screen kind "Workout Details" (kind `details`) the runner can upload in place of the Splits screenshot when the Apple Watch produced no split table (and often no distance). Vision model (glm-4.6v) transcribes ONLY the printed text on that screen: duration, pace range (slowest–fastest), HR range, elevation gain/range, distance if printed. Deterministic pure code (no LLM arithmetic) measures the Pace bar chart and Heart Rate chart pixels from the stored 560px JPEG and computes estimated distance, per-km splits (time, pace, HR; cadence null) — validated method: 90 equal time slots across the chart's x-extent, per-slot max teal column height, shortest bar = slowest printed pace, tallest = fastest, height linear in SPEED (tall = fast), distance = Σ speed×dt, km splits by cumulative interpolation, final partial row; HR per slot = midpoint of red marks mapped linearly onto the printed HR range, gaps interpolated, averaged per km. Calibrated on Fri 20 Nov run: 6.08 vs 6.04 km true, splits within 10 s (km 1) and ≤3 s (km 2–6), HR within 1 bpm; stable at 560px JPEG q80 (6.09 km). Prototype scripts: /tmp/claude-1000/-home-miftah-run-insights/798b8559-2466-4da1-9a4c-4fe3bfd07570/scratchpad/pace.py and check.py; sample images in /tmp/claude-1000/-home-miftah-run-insights/798b8559-2466-4da1-9a4c-4fe3bfd07570/images/ (1.png = details without splits, Sun 22 Nov; 4–7.png = summary/splits/heartrate/details for Fri 20 Nov, the ground-truth fixture). Review screen: estimated distance and splits arrive pre-filled and labelled as estimated; runner confirms/edits as usual. DECIDED BY USER: persist that a run's splits/distance were estimated — a new column on the production DB (additive migration), run page shows an "estimated" mark, and estimated runs are excluded from pace records (a ~1% error must not mint a false PB). Existing three-screenshot flow must be unchanged; the extraction prompt's rules 1–7 and SHAPE are byte-frozen (additive rules only, re-score needed if touched). User wants it analyzed and then built end to end.

The runner, in their own words: "we dont have to be a perfectionist. if we can approximate the missing data using this new screenshot, then that'd be good enough" and, on persisting the flag, "remember it, go ahead".

Fixtures (route map painted over): the pre-phase-1 source is `.workflows/plan/workout-details-estimate/fixtures/` (seven PNGs plus the two prototype scripts). **Phase 1 moves the seven PNGs** to `research/fixtures/workout-details/` (same filenames: `2026-11-20-{details,heartrate,splits,summary}.png`, `2026-11-22-{details,heartrate,summary}.png`) and commits their shipped-recipe re-encodes (560 × 1212, JPEG q80) as `research/fixtures/workout-details/shipped/<same stem>.jpg`. Every test and Proof journey reads the `research/` copies. Measured numbers are in the analysis, section "Measured facts about the Workout Details screen" (its teal predicate carries a dated correction pointing at phase 1).

## Requirements

| ID | What the user asked for (verbatim) | Phases |
|---|---|---|
| R1 | Add a fourth screen kind "Workout Details" (kind `details`) the runner can upload in place of the Splits screenshot when the Apple Watch produced no split table (and often no distance). … Existing three-screenshot flow must be unchanged; the extraction prompt's rules 1–7 and SHAPE are byte-frozen (additive rules only, re-score needed if touched). | 3 |
| R2 | Vision model (glm-4.6v) transcribes ONLY the printed text on that screen: duration, pace range (slowest–fastest), HR range, elevation gain/range, distance if printed. Deterministic pure code (no LLM arithmetic) measures the Pace bar chart and Heart Rate chart pixels from the stored 560px JPEG and computes estimated distance, per-km splits (time, pace, HR; cadence null) — validated method: 90 equal time slots across the chart's x-extent, per-slot max teal column height, shortest bar = slowest printed pace, tallest = fastest, height linear in SPEED (tall = fast), distance = Σ speed×dt, km splits by cumulative interpolation, final partial row; HR per slot = midpoint of red marks mapped linearly onto the printed HR range, gaps interpolated, averaged per km. | 1, 3 |
| R3 | Review screen: estimated distance and splits arrive pre-filled and labelled as estimated; runner confirms/edits as usual. | 3 |
| R4 | DECIDED BY USER: persist that a run's splits/distance were estimated — a new column on the production DB (additive migration), run page shows an "estimated" mark, and estimated runs are excluded from pace records (a ~1% error must not mint a false PB). | 2, 3 |

### Acceptance Criteria

| ID | Pattern | Criterion | Phases | Journeys |
|---|---|---|---|---|
| R1.1 | optional | WHERE the runner labels an upload tile "Workout Details" THE SYSTEM SHALL accept the screenshot through `/api/upload` and `POST /api/extract` with kind `details` and store it as a `run_photos` row of that kind. | 3 | P3.J2 |
| R1.2 | unwanted | IF an extraction contains a `splits` screenshot THEN THE SYSTEM SHALL keep the transcribed split table and SHALL NOT replace any split row with a chart estimate. | 3 | P3.J6 |
| R1.3 | ubiquitous | THE SYSTEM SHALL send the primary vision request for the `summary` / `splits` / `heartrate` images with `EXTRACTION_SYSTEM_PROMPT` and `EXTRACTION_SHAPE` byte-identical to `origin/main` @ `7e285b3`, and SHALL never include a `details` image in that request. | 3 | P3.J1 |
| R2.1 | ubiquitous | THE SYSTEM SHALL compute, from the pixels of a Workout Details screenshot plus its printed duration, pace range and HR range, an estimated distance and per-kilometre splits (time, pace, HR, cadence null, final row partial) in deterministic TypeScript with no model call. | 1 | P1.J2, P1.J3 |
| R2.2 | ubiquitous | THE SYSTEM SHALL estimate the 2026-11-20 fixture, re-encoded as a 560 px-wide JPEG q80, to within 2 % of 6.04 km, within 15 s of every full-kilometre split time, and within 3 bpm of every full-kilometre split heart rate. | 1 | P1.J1, P1.J5, P1.J6 |
| R2.3 | event | WHEN the extraction job runs with a `details` screenshot and no `splits` screenshot THE SYSTEM SHALL store the estimated splits in the extraction's parsed session, and SHALL fill `distanceKm` from the estimate only when no distance was transcribed. | 3 | P3.J2, P3.J5 |
| R2.4 | unwanted | IF the charts cannot be located, the pace range was not transcribed, or the Workout Details reading fails THEN THE SYSTEM SHALL finish the extraction with the other screens' fields intact and no estimated values, and SHALL NOT mark the extraction `failed` for that reason. | 1, 3 | P1.J4, P1.J5, P3.J7, P3.J8 |
| R3.1 | state | WHILE a review draft holds a chart-estimated distance or chart-estimated splits THE SYSTEM SHALL label that field as estimated on the review screen at `/x/[extractionId]`. | 3 | P3.J3 |
| R3.2 | event | WHEN the runner changes the estimated distance on the review screen and saves THE SYSTEM SHALL store the runner's value and SHALL NOT persist the run's distance as estimated. | 3 | P3.J4 |
| R4.1 | event | WHEN a run is committed from an extraction whose distance or splits were chart-estimated and left as estimated THE SYSTEM SHALL persist `runs.distance_estimated` / `runs.splits_estimated` as true for the values that were estimated, deriving both on the server from the stored extraction. | 2, 3 | P2.J1, P2.J3, P2.J4, P3.J3, P3.J5 |
| R4.2 | state | WHILE a run has `distance_estimated` or `splits_estimated` true THE SYSTEM SHALL show an "estimated" mark on the run page `/r/[id]`. | 2 | P2.J3, P2.J6 |
| R4.3 | state | WHILE a run has `distance_estimated` true THE SYSTEM SHALL exclude it from `longest_distance`, `fastest_pace_5k`, `fastest_pace_10k` and `best_paced_run`, and WHILE it has `splits_estimated` true THE SYSTEM SHALL exclude it from `fastest_km_split` and `best_paced_run`. | 2 | P2.J3, P2.J5 |
| R4.4 | ubiquitous | THE SYSTEM SHALL treat every run committed before this change as not estimated (both columns false) with its records unchanged. | 2 | P2.J1, P2.J2, P2.J6 |

R4.1 is proved twice on purpose: phase 2's J3 sets the flags by hand in the throwaway verify database (persistence, display, records), and phase 3's J3/J5 commit real Workout Details uploads through the review screen (server-side derivation).

## Scope

**In scope:** a fourth upload kind `details`; a deterministic chart estimator; a separate one-image vision call for the details screen's printed numbers; merging the estimate into the stored parsed session; "estimated" labels on review; two boolean columns on `runs`; an "estimated" mark on `/r/[id]`; record exclusion; the narrative being told the splits are estimated; docs.

**Out of scope:**
- Any change to `EXTRACTION_SYSTEM_PROMPT` or `EXTRACTION_SHAPE` (frozen at 108/108; the details screen gets its own prompt).
- Raising `MAX_IMAGES` above 3 — the runner asked to upload three, swapping one.
- Estimating cadence (the chart is absent on the run that needs it) or elevation per km.
- Gating badges on the flags (assumption A4 in the analysis).
- Nina seeing the flags, and an estimated mark on the public share page `/s/[token]` (see Decisions).
- Backfilling any existing run.

## Invariants

1. The tree typechecks (`npm run typecheck`), lints, and `npm test` passes at the end of every phase; all seven CI guards stay green. Every phase's gate runs `typecheck` and all seven `ci:*` guards.
2. `EXTRACTION_SYSTEM_PROMPT` and `EXTRACTION_SHAPE` are byte-identical to base, **and so is the rendered primary user turn for any 1–3 primary images** (`buildExtractionUserContent`). The only permitted edits to `lib/llm/prompts/extraction.ts` are (a) the type narrowing to `PrimaryScreenKind` (its import, `IMAGE_LABEL`, `PromptImage`, `buildRepairRequestText`'s `kinds`) and (b) the one comparison in `buildExtractionUserContent` that picks the intro sentence, changed from `images.length === SCREEN_KINDS.length` to `images.length === PRIMARY_SCREEN_KINDS.length` — without it, widening `SCREEN_KINDS` to four silently switches every three-image request to the other intro. Phase 3's `extraction.frozen.test.ts` pins the sha-256 of both strings and of the three- and two-image user turns.
3. The model never computes: every estimated number is produced by `lib/extract/chart/*`; the details vision call returns printed values only.
4. An extraction with a `details` image never ends `failed` because of the details reading or the estimator (R2.4). `runExtractionJob` still always writes a terminal row. (A details-only upload has no other screen; see Decisions.)
5. The estimated flags are derived on the server from the extraction row; no flag is read from the browser's draft.
6. One database, production. The migration is additive (`boolean NOT NULL DEFAULT false`), generated with `npm run db:generate` (never renamed by hand), numbered after checking `origin/main`'s `drizzle/` tip.
7. The pure estimator imports nothing server-only; only the decode shell imports `sharp`.

## Shared contracts (the seam between phases)

Planners plan against these exact names. Phase 1 defines the first block, phase 2 the second; phase 3 consumes both.

```ts
// lib/extract/chart/estimate.ts — phase 1, PURE (no sharp, no server-only)
export interface RgbImage { width: number; height: number; data: Uint8Array /* RGB, 3 bytes/px, row-major */ }
// (defined in lib/extract/chart/pixels.ts, re-exported from estimate.ts)

export interface ChartEstimateInput {
  durationSec: number            // printed workout duration
  paceSlowestSecPerKm: number    // printed range, left value  (e.g. 9'12" -> 552)
  paceFastestSecPerKm: number    // printed range, right value (e.g. 6'47" -> 407)
  hrMinBpm: number | null        // printed HR range, low
  hrMaxBpm: number | null        // printed HR range, high
  knownDistanceKm: number | null // a transcribed distance; when set, speeds are scaled to total exactly this
}

export interface EstimatedSplit {
  km: number; timeSec: number; paceSecPerKm: number
  hrBpm: number | null; cadenceSpm: null; partial: boolean
}

export interface ChartEstimate {
  distanceKm: number             // 2 decimals; equals knownDistanceKm when that was given
  distanceWasEstimated: boolean  // false when knownDistanceKm was given
  splits: EstimatedSplit[]       // full km rows, then one partial row when the 2-decimal remainder
                                 // is > 0.05 km (CHK-4's own test); a smaller remainder is folded
                                 // away: no row, its seconds join no full row
  slotCount: number              // 90
}

/** null = the pace chart could not be located / measured, or the inputs are unusable. Never throws. */
export function estimateFromCharts(image: RgbImage, input: ChartEstimateInput): ChartEstimate | null

// lib/extract/chart/decode.ts — phase 1, server-only shell
/** THROWS on bytes sharp cannot decode; the caller (phase 3's readWorkoutDetails) catches and
 *  degrades to "no estimate". */
export async function decodeToRgb(jpegOrPng: Buffer): Promise<RgbImage>
```

```ts
// lib/db/queries/runs.ts — phase 2
interface NewRunInput { /* …existing… */ distanceEstimated?: boolean; splitsEstimated?: boolean }
// commitExtractedRun: omitted = false (written explicitly, `?? false`)
// Run / RunDetail rows expose distanceEstimated: boolean, splitsEstimated: boolean
// applyRunCorrections (patch: Partial<Omit<NewRunInput,'splits'|'zones'>>, no code change):
//   omitted = leave the stored value unchanged; an explicit true/false is written.
//   Phase 3's edit mode always passes both, derived on the server from the stored run.
```

```ts
// lib/llm/runExtractionJob.ts — phase 3
interface RawResponseColumn {
  /* …existing… */
  /** Present only when a details screenshot was read. */
  details?: {
    vendor: unknown                                   // the details call's raw body
    printed: DetailsPrinted | null                    // validated printed values, null if the reading failed
    estimate: { distanceKm: number | null; splits: boolean } | null   // EstimatedValues
    // distanceKm: the estimated distance that was written into parsedSession.distanceKm, else null
    // splits: true when parsedSession.splits are chart estimates
  }
}
```

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Chart estimator | R2 | `lib/extract/chart` | 10 entries (5 new TS, 1 test, 1 script edit, 23 on disk with 14 fixtures + README) | — | HARD | `.workflows/plan/workout-details-estimate/phase-1.md` | `P1-LEX-K7CD` | — |
| 2 | Estimated flags: columns, records, run page | R4 | `lib/db`, `lib/records`, `components/runs`, `app/r`, `lib/llm/facts.ts` | 25 entries (~27 files incl. generated migration) | — | NORMAL | `.workflows/plan/workout-details-estimate/phase-2.md` | P1-DB-A009 | — |
| 3 | `details` kind end to end: upload, reading, merge, review, commit | R1, R2, R3, R4 | `lib/extract`, `lib/llm`, `lib/review`, `components/extract`, `components/review` | 60 entries (+ 8 verified no-change) | 1, 2 | HARD | `.workflows/plan/workout-details-estimate/phase-3.md` | — | — |

Phases 1 and 2 share no file and no symbol and run concurrently. Phase 3 spans four Rs because it is the wiring phase: it is the only place the estimator (R2), the flags (R4), the upload kind (R1) and the labels (R3) meet, and splitting it by R would leave a `details` kind that uploads but is never read. The one file two phases edit, `lib/db/schema/runs.ts`, is edited by phase 2 first (the two columns) and then by phase 3 in other hunks, quoted as it stands after phase 2.

### Phase 1 — Chart estimator
**Satisfies:** R2 (criteria R2.1, R2.2, R2.4 — the estimator half)
**Owns:** new directory `lib/extract/chart/` — `pixels.ts` (`RgbImage`, the colour predicates), `locate.ts` (find the pace chart and the HR chart by colour and band shape, not by fixed rows), `measure.ts` (slot measurement), `estimate.ts` (the pure `estimateFromCharts`), `decode.ts` (the `sharp` shell `decodeToRgb`); `tests/extract.chartEstimate.test.ts` (19 cases on committed bytes); the fixtures — move the seven PNGs from `.workflows/plan/workout-details-estimate/fixtures/` to `research/fixtures/workout-details/`, and generate `shipped/*.jpg` by extending `scripts/shipped-image-recipe.py` with a named `workout-details` set (the canonical set regenerates byte-identical); `research/fixtures/workout-details/README.md`.
**Locator requirements:** the teal predicate is phase 1's measured `g > 130 && b > 130 && g − r > 50 && |g − b| < 40` (the analysis's `r < 130` version drops bars at 560 px; see the analysis's dated correction). Teal also matches the map's route line (wide but ~380 px tall at 739 px — the committed fixtures have the map painted over, so a synthetic test paints a wide tall teal band, solid and striped, above the charts), the "Average: …/KM" text (narrow), and the Cadence chart below the pace chart (wide, short, possibly cut by the screen edge). The pace chart is the first band, top to bottom, that is wide, short and made of many separate thin runs sharing one baseline. The HR chart is the analogous band of red marks above it. Thresholds scale with image width so 739 px and 560 px both pass.
**Partial row:** emitted only when the 2-decimal remainder is > 0.05 km (CHK-4's own test in `lib/review/checks.ts`); a smaller remainder is folded away.
**Interim knip:** contract exports nothing imports until phase 3 carry `@public` JSDoc; knip is not a CI gate and no ignore entry is added.
**Does not touch:** anything outside `lib/extract/chart/`, its test, its fixtures and the recipe script. No vision code, no schema, no `constants.ts`, no docs.
**Exit criteria:** `estimateFromCharts` meets R2.2 on the Friday fixture at both 739 px PNG and 560 px JPEG (measured 6.08 km at 560 px, splits within 9 s, HR within 1 bpm); returns a plausible estimate for the Sunday fixture (5.9–6.3 km, six full splits); returns `null` (never throws) for the four non-details screens, for an inverted or zero-width pace range, a non-positive duration and malformed images; with `knownDistanceKm: 6.04` it returns `distanceKm: 6.04`, `distanceWasEstimated: false` and six full rows with no partial row; typecheck, lint, format and all seven guards green.

### Phase 2 — Estimated flags: columns, records, run page
**Satisfies:** R4 (criteria R4.1 persistence half, R4.2, R4.3, R4.4)
**Owns:** `runs.distance_estimated`, `runs.splits_estimated` (`boolean NOT NULL DEFAULT false`) in `lib/db/schema/runs.ts` (16 lines after base line 215) + the generated `drizzle/0038_*` migration, snapshot and journal entry; `NewRunInput` and `commitExtractedRun` (writes `?? false` explicitly); `applyRunCorrections` doc comment only (its `Partial<…>` patch already gives "omitted = unchanged, explicit = written"); the schema freeze test and query-layer tests; `lib/records/*` exclusion per R4.3 (required flags on `RecordRunRow` / `RecordCandidate`, gate in `qualifies`, an exclusion table test over all eleven keys); the "estimated" clause inside `components/runs/ProvenanceMark.tsx` (required `estimated` prop) on `app/r/[id]/page.tsx`; `lib/llm/facts.ts` (required `SessionRunFacts` flags; `session.estimated` present only when a flag is true, so unflagged facts hashes stay byte-identical, pinned to the measured base hash) and `lib/insights/load.ts`; `features/run-detail.md`.
**Does not touch:** `lib/review/*`, `components/review/*`, `lib/extract/*`, `lib/llm/extract.ts`, `lib/llm/vision.ts`, `lib/llm/runExtractionJob.ts`, `lib/schema/*`, `docs/architecture.md`, `CLAUDE.md` (all phase 3), `lib/nina/*`, `lib/badges/*`, `lib/share/*`, `app/(public)/s/*`. No product code sets a flag to true — phase 3 does.
**Migration (Step 11, last):** the production migration runs only after the full gate (format, lint, typecheck, `npm test`, the guards, `db:check`) and a **second** `origin/main` drizzle-tip check right before writing; if the tip is no longer `drizzle/0037_wild_thunderbird.sql`, the phase **STOPS** and reports to the coordinator (no forked snapshot chain; once applied, `0038` is never regenerated). Then `npm run db:migrate` against the one (production) database, `ci:schema-drift-guard` with its live half, and J1 verifies by effect (`information_schema`, zero flagged rows), not by the journal.
**Exit criteria:** both columns exist in production with default false and zero flagged rows; a run committed with `splitsEstimated: true` reads back true and holds no `fastest_km_split` / `best_paced_run` record; a run with `distanceEstimated: true` holds none of the four distance-dependent records; an unflagged history's records equal base's; the run page shows the mark only for flagged runs; typecheck, lint, format, `npm test`, build, `db:check` and all seven guards green.

### Phase 3 — `details` kind end to end
**Satisfies:** R1, R2 (criteria R2.3, R2.4 — the job half), R3, R4 (criterion R4.1 — the derivation half)
**Owns:**
- **Kind.** `details` joins the upload kinds (`lib/extract/constants.ts`, label "Workout Details"; `PRIMARY_SCREEN_KINDS` / `PrimaryScreenKind` = the existing three, `ScreenKind` = four), with `MAX_IMAGES` still 3 and `DEFAULT_KIND_BY_INDEX` unchanged (`satisfies readonly PrimaryScreenKind[]`), so a three-file pick still defaults to heartrate / splits / summary and the runner relabels a tile. `KINDS_MATCH_SLOTS` is renamed `A_FREE_KIND_ALWAYS_EXISTS` (`SCREEN_KINDS.length >= MAX_IMAGES`); its one importer, `tests/extract.reassignKind.test.ts`, is updated; the planPicked/reassignKind invariant tests are reworked, not deleted. `KindSelector` (2×2 grid), `UploadPicker`, `ExtractingSkeleton`, `PhotoKind` (post-phase-2 `runs.ts`). `app/api/upload/route.ts`, `lib/schema/extractionResult.ts` and the photo-kind UIs widen by themselves (verified, no edit).
- **Frozen prompt stays frozen** (invariant 2): `lib/llm/prompts/extraction.ts` gets only the type narrowing and the one intro comparison; `extraction.frozen.test.ts` hash-pins both strings and the three- and two-image user turns.
- **Details reading.** New `lib/schema/detailsPrinted.ts`, `lib/llm/prompts/details.ts` (own system prompt + shape, printed values only, `0'00"` / `--'--"` → null), `callVisionDetails[WithFetch]` in `lib/llm/vision.ts` (one image, same token floor), and `lib/llm/readDetails.ts` (`readWorkoutDetails`: the vision call and `decodeToRgb` under `Promise.allSettled`, never throws). No repair round-trip.
- **Job.** `runExtractionJob` runs the details side **in parallel** with the primary call (primary gets only non-`details` images; a details-only upload has no primary call), and merges through the pure `lib/extract/detailsMerge.ts` per A1, A2, A7: real splits win; estimated splits fill an empty `splits`; `distanceKm` filled from the estimate only when null (a transcribed distance is passed as `knownDistanceKm`); printed duration / elevation / avg HR / avg pace / distance fill nulls only. Writes `RawResponseColumn.details`. Any details-side failure degrades to "no estimate". Bounded by `JOB_DEADLINE_MS`; details timeout `min(PRIMARY_TIMEOUT_MS, remaining)`.
- **Review.** `ReviewContext.estimated`; `lib/review/estimated.ts` (one rule for label and flag); `HeroFields` and `SplitsTable` show "Estimated from the pace chart"; CHK-1 passes for estimated splits (`CheckOptions`).
- **Commit.** `lib/review/commit.ts` derives `distanceEstimated` / `splitsEstimated` on the server from `raw_response.details.estimate` (or, in edit mode, the stored run's flags) versus the validated draft and passes them through `toRunInput` → `NewRunInput`; edit mode passes both explicitly (distance changed ⇒ false; all splits removed ⇒ false; otherwise as stored).
- **Privacy.** A `details` photo is inserted with `excluded_from_share = true` (A6).
- **Docs.** `docs/architecture.md` §4.3 (migration `0038`), §5 (pipeline diagram incl. the `/r/[id]` estimated mark), §6 (records exclusion, narrative `session.estimated`) — phase 2's doc handoff; `CLAUDE.md`'s pipeline paragraph; the verify skill's feature map (`features/README.md`, `upload-extract.md`, `review-commit.md`, two new steps files, `SKILL.md` cost row, `verify.sh` usage text).
**Does not touch:** `lib/extract/chart/*` internals (consumes the contract), phase 2's `runs` columns hunk / migration / records / run page / facts, `EXTRACTION_SYSTEM_PROMPT` / `EXTRACTION_SHAPE`.
**Proof:** one verify run, `verify.sh up --seed=review --llm=80` (~25–28 z.ai calls expected; no cost cap, see Decisions), uploading phase 1's committed `research/fixtures/workout-details/shipped/*.jpg`.
**Exit criteria:** the Sunday set (summary + details + heartrate) reaches review at ~6.1 km with six full estimated splits plus a partial, both labelled, and commits with both flags true and the mark on `/r/[id]`; the Friday set with summary + details + heartrate yields distance 6.04 exactly (transcribed), six estimated rows with no partial, `distance_estimated` false, `splits_estimated` true; a plain summary + splits + heartrate upload sends the hash-pinned prompt and commits with both flags false; typecheck, lint, `npm test`, build and all seven guards green.

## Reconciliation Log

| # | Conflict | Kind | Resolution |
|---|---|---|---|
| 1 | Index and analysis named `.workflows/plan/workout-details-estimate/fixtures/`; phase 1 moves the PNGs to `research/fixtures/workout-details/` + `shipped/*.jpg`; phase 3 re-encoded PNGs with `sharp` in its tests and Proof (`find`-based prep) | Contract drift / file collision | Index Why and Phase 1 block name phase 1's paths and filenames; dated note added to the analysis. Phase 3's `tests/extract.detailsMerge.test.ts` (`WORKOUT_DETAILS_FIXTURE_DIR`), live test (`DIR`), Proof prep and `upload-extract.md` snippet now read the committed `shipped/*.jpg` directly (sharp re-encode removed). |
| 2 | Analysis teal predicate wrong at 560 px; phase 1 ships `g>130 && b>130 && g−r>50 && \|g−b\|<40` | Contract drift (analysis) | Analysis table left as measured; dated correction beneath it points to phase 1. Index Phase 1 block states the shipped predicate. |
| 3 | `decodeToRgb` throws (phase 1); index contract silent | Unmet assumption check | Confirmed phase 3's `readWorkoutDetails` runs it under `Promise.allSettled` (a rejection = no pixels = no estimate; test "a decode failure keeps the reading"). Index contract comment says it throws; phase 3 Requires says so. |
| 4 | Estimator emitted a partial row from 0.01 km; CHK-4 treats only `round2(remainder) > 0.05` as partial (verified in `lib/review/checks.ts`: `PARTIAL_MIN_KM = 0.05`, strict `>`) | Contract drift | Phase 1 `MIN_PARTIAL_KM = 0.05`, gate `round2(remainder) > 0.05`; smaller remainder folded away (no row, seconds join no full row). Phase 1 tests: transcribed-6.04 case now six rows/no partial; new "> 0.05 km keeps its partial" case (19 cases). Phase 3: Friday merge test (6 rows, sum 2748–2772), J5 (6 rows, 2745–2772), CHK-1/CHK-4 decision rows and comments updated; Sunday (6.07, remainder 0.07) keeps its partial, J3's 7 `run_splits` stands. Index contract updated. |
| 5 | Details-only upload whose reading fails: phase 3 marks `failed`; R2.4 "SHALL NOT mark failed" | Behavioural fork | Kept `failed` with the reading's own code; confirmed every code path writes one of `EXTRACTION_ERROR_CODES`. Primary failed + details succeeded = failed with the primary's code. Recorded in Decisions. |
| 6 | `lib/db/schema/runs.ts` edited by phase 2 (columns after base :215) and phase 3 (base :132, :335, :387) | File collision | Phase 3 now quotes the file post-phase-2: :132 unmoved, ~:351, ~:403, located by quoted current text; phase 2's hunk left alone. |
| 7 | `applyRunCorrections`: index "omitted = unchanged"; phase 2 "no code change, explicit false clears"; phase 3 edit mode passes both flags always | Contract drift (wording) | One contract everywhere: omitted = unchanged, explicit value written; phase 3's edit mode always passes both, derived from the stored run. Phase 2's fake-DB tests (omitted names neither column; explicit names exactly it) and phase 3's mock tests (`applyRunCorrections` called with both) agree. Phase 2 Provides / Handoffs / J3 note updated. |
| 8 | Phase 2 hands `docs/architecture.md` §4.3 and §6 to phase 3; phase 3 edited only §5 | Gap (doc impact point) | Phase 3 Step 10 now carries §4.3 (`0038` paragraph), the §5 `/r/[id]` mark and §6 Records + Insights inserts verbatim; Files table updated. |
| 9 | `buildExtractionUserContent`'s `images.length === SCREEN_KINDS.length` would change the primary user turn once `SCREEN_KINDS` has four | Invariant drift | Index Invariant 2 rewritten: strings and the rendered 1–3-image user turn byte-identical; only the type narrowing and that one comparison are permitted edits. |
| 10 | Phase 3 Proof needs ~25–28 calls vs the skill's 25 default | Unmet assumption check | Verified `SKILL.md` documents `$V up --llm=40` and `verify.sh` parses `--llm=N`; budget sized up front, never raised mid-run. Phase 3 Proof cites it. Recorded in Decisions. |
| 11 | R4.1 proved by phase 2 J3 (hand-set flags) and phase 3 J3/J5 (real path) | Trace check | R4.1 Journeys cell lists both phases' journeys; phase 2 Step 11 (migration last, after gates and a second tip check, STOP on move) confirmed intact and described in the Phase 2 block. |
| 12 | Phase 3's Tests line listed six guards (no `ci:schema-drift-guard`) | Broken-gate | Added `ci:schema-drift-guard`; every phase's gate now has typecheck + all seven guards. |
| 13 | Phase 2 makes `RecordCandidate` / `RecordRunRow` / `SessionRunFacts` / `ProvenanceMark` flags required | Deleted-then-used check | Phase 3 constructs none of these types (grep of its plan); its `RunDetail` fixtures (`runDetailRow`, R-8 fixture) are untyped `vi.fn()` mocks and gain both flags anyway. No conflict. |
| 14 | `KINDS_MATCH_SLOTS` rename | Deleted-then-used check | Only importer is `tests/extract.reassignKind.test.ts` (phase 3 updates `:4`, `:30`). `lib/extract/.workflows/package_readme.md` mentions it — left to the readme-updater (phase 3 Handoffs); a dated token-maxxing log keeps the old name. |
| 15 | Phase 1 exports unused until phase 3 (knip) | Broken-build check | knip is not in CI (`.github/workflows/ci.yml`); phase 1 tags contract exports `@public` and its test imports `decodeToRgb` / `estimateFromCharts`. Gate green on its own. |
| 16 | A failed blob fetch of the `details` screenshot fails the extraction `transport` in phase 3's job | Invariant scope | Kept: invariant 4 covers the reading and the estimator, not the shared fetch step. Recorded in phase 3 Decisions and below. |
| 17 | Phase 3 helper functions declared `async` with no `await` after the shipped-JPEG change | Lint hazard | Made non-async. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Read the details screen inside the proven prompt (new rules + SHAPE fields) vs a separate call | Separate one-image call with its own prompt, in parallel with the primary | 1: invariant 2 — the frozen prompt is untouched by construction, so no 108/108 re-score is needed |
| "a new column" vs two columns | Two booleans, `distance_estimated` and `splits_estimated` | 5: the user asked to remember "splits/distance were estimated"; the two can differ (Friday-style run: distance printed, table missing) |
| Which records count as "pace records" | Every record whose value or threshold depends on the estimated quantity (R4.3) | 5: "a ~1% error must not mint a false PB" |
| Both `splits` and `details` uploaded | Real table wins, no estimate | 5: the details screen is "in place of the Splits screenshot" |
| Distance printed but table missing | Scale the estimate to the printed distance; distance not flagged | 5: transcribed beats estimated; measured to tighten the splits |
| Trust the browser for the flags | No — derive on the server from the extraction row | 6: convention (`lib/review/schema.ts`: "a client is not trusted just because it was ours") |
| Badges on estimated runs | Unchanged, not gated | 5: the user limited the exclusion to records and said approximation is good enough |
| Details photo in shares | Excluded by default | 6: convention — it shows the runner's route map; `excluded_from_share` exists for this |
| Raise `MAX_IMAGES` to 4 | No, stays 3 | 5: "we still upload 3 screenshots" |
| Fixture home: plan dir vs `research/` | `research/fixtures/workout-details/` (PNGs) + `shipped/*.jpg`, read directly by every test and Proof | 3: phase 1's code blocks (measured on those bytes); 6: `research/` is the repo's load-bearing fixture home |
| Teal predicate | `g>130 && b>130 && g−r>50 && \|g−b\|<40` (the analysis's `r<130` version is wrong at 560 px) | 3: phase 1's measured code block; the analysis keeps its table plus a dated correction |
| `decodeToRgb` on undecodable bytes | Throws; `readWorkoutDetails` catches via `allSettled` and degrades to no estimate | 1: invariant 4 / R2.4 — the throw never reaches the terminal-row write |
| Partial-row threshold (0.01 vs CHK-4's 0.05) | Partial row only when `round2(remainder) > 0.05` km, CHK-4's exact test (verified strict `>`); a smaller remainder is folded away — no row, its seconds join no full row (a full row's time stays one km's time), `distanceKm` still the full total. A remainder ≥ 0.95 km keeps its row (rare; CHK-4 advisory only) rather than lose ~7 min of splits | 6: surrounding convention (`lib/review/checks.ts` `PARTIAL_MIN_KM`) — coordinator ruling |
| Details-only upload whose reading fails | `failed` with the reading's own `EXTRACTION_ERROR_CODES` code (`token_floor` / `timeout` / `transport` / `validation`); a failed extraction opens the same review screen with an empty draft plus reason and Retry. If only the estimator fails, `ok` with the printed values | 4: R2.4 says "with the other screens' fields intact" — a details-only upload has no other screen; 6: `docs/architecture.md` §5 failed-extraction convention — coordinator ruling |
| Primary call fails, details reading succeeded | `failed` with the primary's code; `raw_response.details` still records the reading | 4: R1/R2.4 — an `ok` review built only from the details screen would silently drop the runner's other screens; 6: Retry re-runs both |
| Blob fetch of the details screenshot fails | Extraction fails `transport`, as any failed blob fetch does today | 1: invariant 4's text covers the details reading and the estimator; the fetch is the shared step before either |
| `applyRunCorrections` flag semantics | Omitted = unchanged, explicit = written; no code change; phase 3's edit mode always passes both, derived from the stored run | 3: phase 2's and phase 3's code blocks agree once worded alike |
| Primary user turn under a four-kind `SCREEN_KINDS` | Phase 3 changes the one intro comparison to `PRIMARY_SCREEN_KINDS.length` and hash-pins the rendered user turns | 1: invariant 2 (amended to name this edit exactly) |
| Verify budget for phase 3's Proof | `verify.sh up --seed=review --llm=80`. **Cost is not a constraint** (owner, 2026-11-22: "use all paid model calls they needed. don't mind the cost"): start a fresh run with a larger `--llm=N`, re-run a journey, or run the live suites whenever the proof needs it; never skip or trim a journey to save calls. Still not a licence to raise the budget so a journey that fails on its merits passes | 5: the owner's instruction, given after the plan was written, amending the earlier `--llm=40` row |
| `KindSelector` layout with four kinds | A 2×2 grid on every upload tile (visible layout change) | 5: a fourth kind must be selectable; "existing three-screenshot flow must be unchanged" is read as behaviour, prompt and defaults, all unchanged |
| Nina and the flags | Nina does not see them in this set (follow-up card) | 5: scope is records + run page + review; widening `lib/nina/*` types and fixtures is outside it |
| Estimated mark on the public share page | None (`/s/[token]` renders no `ProvenanceMark` today) | 6: convention — the share page's explicit column list and `ci:f11-guard` surface stay untouched |
| Docs ownership | Phase 3 owns every `docs/architecture.md` (§4.3, §5, §6) and `CLAUDE.md` edit; phase 2 edits only `features/run-detail.md` | 3: phase 2's handoff + phase 3's Step 10 |

## Open Questions

None.

## Rollback

- **Phase 1:** delete `lib/extract/chart/`, its test and `research/fixtures/workout-details/`, and restore `scripts/shipped-image-recipe.py`; nothing imports the directory until phase 3.
- **Phase 2:** revert the code; the two columns are additive with defaults and may stay in production unused (dropping them is a separate migration applied after the revert deploys).
- **Phase 3:** revert the commit(s). Extractions already stored with a `details` blob keep working as audit rows; `run_photos.kind = 'details'` rows fall back to the bare kind string through the existing label fallbacks and stay excluded from shares, so revert phase 3's UI and data together.
- **Whole set:** the branch is unmerged until verification; abandon `feature/workout-details-estimate`.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f .workflows/plan/WORKOUT_DETAILS_ESTIMATE_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f .workflows/plan/WORKOUT_DETAILS_ESTIMATE_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan .workflows/plan/WORKOUT_DETAILS_ESTIMATE_PLAN.md
