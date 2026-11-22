# Todos: extract

**Package Path**: `lib/extract`
**Package Code**: LEX
**Last Updated**: 2026-11-22
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 2
- Archived: 0

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

- [x] **P1-LEX-A001** Phase 3: `details` kind end to end: upload, reading, merge, review, commit
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the `details` kind across the pipeline. Kind: `details` joins the upload kinds in `lib/extract/constants.ts` (label "Workout Details"; `PRIMARY_SCREEN_KINDS` / `PrimaryScreenKind` = the existing three, `ScreenKind` = four; `MAX_IMAGES` still 3, `DEFAULT_KIND_BY_INDEX` unchanged), `KINDS_MATCH_SLOTS` renamed `A_FREE_KIND_ALWAYS_EXISTS`, `KindSelector` (2×2), `UploadPicker`, `ExtractingSkeleton`, `PhotoKind`. Frozen prompt stays frozen: `lib/llm/prompts/extraction.ts` gets only the type narrowing and the one intro comparison, hash-pinned by `extraction.frozen.test.ts`. Details reading: new `lib/schema/detailsPrinted.ts`, `lib/llm/prompts/details.ts`, `callVisionDetails[WithFetch]` in `lib/llm/vision.ts` (one image, same token floor), `lib/llm/readDetails.ts` (`readWorkoutDetails`: vision call and `decodeToRgb` under `Promise.allSettled`, never throws, no repair round-trip). Job: `runExtractionJob` runs the details side in parallel with the primary call (primary gets only non-`details` images) and merges through the pure `lib/extract/detailsMerge.ts` — real splits win, estimated splits fill an empty `splits`, `distanceKm` filled from the estimate only when null, printed values fill nulls only; writes `RawResponseColumn.details`; any details-side failure degrades to "no estimate"; bounded by `JOB_DEADLINE_MS`. Review: `ReviewContext.estimated`, `lib/review/estimated.ts` (one rule for label and flag), `HeroFields` and `SplitsTable` show "Estimated from the pace chart", CHK-1 passes for estimated splits. Commit: `lib/review/commit.ts` derives `distanceEstimated` / `splitsEstimated` on the server from `raw_response.details.estimate` (edit mode: the stored run's flags) versus the validated draft, through `toRunInput` → `NewRunInput`. Privacy: a `details` photo is inserted with `excluded_from_share = true`. Docs: `docs/architecture.md` §4.3, §5, §6, `CLAUDE.md`'s pipeline paragraph, the verify skill's feature map. Does not touch `lib/extract/chart/*` internals, phase 2's `runs` columns hunk / migration / records / run page / facts, or `EXTRACTION_SYSTEM_PROMPT` / `EXTRACTION_SHAPE`. Proof: one verify run, `verify.sh up --seed=review --llm=80`, uploading `research/fixtures/workout-details/shipped/*.jpg`. Exit: the Sunday set (summary + details + heartrate) reaches review at ~6.1 km with six full estimated splits plus a partial, both labelled, and commits with both flags true and the mark on `/r/[id]`; the Friday set (summary + details + heartrate) yields distance 6.04 exactly (transcribed), six estimated rows with no partial, `distance_estimated` false, `splits_estimated` true; a plain summary + splits + heartrate upload sends the hash-pinned prompt and commits with both flags false; typecheck, lint, `npm test`, build and all seven guards green.
  - **Status**: done
  - **Plan Set**: `/home/miftah/run-insights/.workflows/orchestration/workout-details-estimate/PLAN.md` (phase 3 of 3)
  - **Satisfies**: R1, R2, R3, R4 — R1: a fourth screen kind "Workout Details" (kind `details`) the runner can upload in place of the Splits screenshot when the Apple Watch produced no split table; the existing three-screenshot flow unchanged, the extraction prompt's rules 1–7 and SHAPE byte-frozen. R2: the vision model (glm-4.6v) transcribes ONLY the printed text on that screen (duration, pace range, HR range, elevation, distance if printed); deterministic pure code measures the Pace and Heart Rate chart pixels from the stored 560px JPEG and computes estimated distance and per-km splits (the job half here). R3: on the review screen the estimated distance and splits arrive pre-filled and labelled as estimated; the runner confirms/edits as usual. R4: persist that a run's splits/distance were estimated (new columns, "estimated" mark on the run page, estimated runs excluded from pace records) — the server-side derivation half here. · criteria: R1.1, R1.2, R1.3, R2.3, R2.4, R3.1, R3.2, R4.1
  - **Depends on**: P1-LEX-K7CD, P1-DB-A009
  - **Plan**: `.workflows/plan/P1-LEX-A001.md`
  - **Completed**: 2026-11-22 17:20
  - **Method**: /implement
  - **Files**: .claude/skills/verify-run-insights/SKILL.md, .claude/skills/verify-run-insights/features/README.md, .claude/skills/verify-run-insights/features/review-commit.md, .claude/skills/verify-run-insights/features/upload-extract.md, .claude/skills/verify-run-insights/features/steps/review-details.mjs, .claude/skills/verify-run-insights/features/steps/upload-details.mjs, .claude/skills/verify-run-insights/scripts/verify.sh, .workflows/plan/WORKOUT_DETAILS_ESTIMATE_PLAN.md, CLAUDE.md, app/api/upload/route.test.ts, components/extract/ExtractingSkeleton.test.tsx, components/extract/ExtractingSkeleton.tsx, components/extract/KindSelector.test.tsx, components/extract/KindSelector.tsx, components/extract/UploadPicker.test.tsx, components/extract/UploadPicker.tsx, components/review/HeroFields.test.tsx, components/review/HeroFields.tsx, components/review/ReviewClient.test.tsx, components/review/ReviewClient.tsx, components/review/ReviewScreen.test.tsx, components/review/SplitsTable.test.tsx, components/review/SplitsTable.tsx, docs/architecture.md, lib/db/queries/photos.ts, lib/db/schema/runs.ts, lib/extract/.workflows/todos.md, lib/extract/.workflows/plan/P1-LEX-A001.md, lib/extract/constants.ts, lib/extract/detailsMerge.ts, lib/extract/planPicked.ts, lib/extract/reassignKind.ts, lib/llm/extract.test.ts, lib/llm/extract.ts, lib/llm/prompts/details.ts, lib/llm/prompts/extraction.frozen.test.ts, lib/llm/prompts/extraction.ts, lib/llm/readDetails.test.ts, lib/llm/readDetails.ts, lib/llm/runExtractionJob.test.ts, lib/llm/runExtractionJob.ts, lib/llm/vision.test.ts, lib/llm/vision.ts, lib/review/checks.ts, lib/review/commit.ts, lib/review/estimated.ts, lib/review/loadReview.ts, lib/review/schema.ts, lib/schema/detailsPrinted.test.ts, lib/schema/detailsPrinted.ts, lib/schema/extractedSession.ts, package.json, tests/db.queries.extractions.test.ts, tests/extract.detailsMerge.test.ts, tests/extract.planPicked.test.ts, tests/extract.reassignKind.test.ts, tests/live/vision.live.test.ts, tests/live/visionDetails.live.test.ts, tests/review.checks.test.ts, tests/review.commit.test.ts, tests/review.estimated.test.ts, tests/review.loadReview.test.ts, tests/review.schema.test.ts
  - **Proof**: verified-first-pass — 9 journeys, evidence /home/miftah/.local/state/run-insights-verify/1122-171358-200782/evidence
  - **Drift**:
    - components/review/HeroFields.test.tsx has a third direct `<HeroFields>` render (distanceRef test, ~line 221) the plan did not list; added `distanceEstimated={false}` there too.
    - Prettier reflowed 11 of the plan's code blocks (formatting only).
    - FINDING (not fixed, plan decision 'CHK-4 unchanged' kept): an UNTOUCHED estimate can draw CHK-4's partial-pace advisory. Sunday set read correctly (duration 3046) gives 6.07 km with a 35 s partial row at pace 479; CHK-4 divides 35 s by the 2-decimal remainder 0.07 -> 500 s/km, 21 s off its 15 s tolerance -> '1 thing worth checking'. The plan's claim that an untouched estimate never draws the advisory holds for direction 1 only. Follow-up candidate: skip CHK-4's pace comparison for estimated splits, or have the estimator derive the partial row's pace from the rounded remainder.
    - FINDING (not fixed): the details call's duration read is not perfectly stable — one browser-path read returned durationSec 3054 (truth 3046) and estimateInputFor prefers the details figure over the Summary's 3046, giving 6.13 km instead of 6.07. Still inside the 5.9-6.3 criterion. Follow-up candidate: prefer the Summary's duration when both exist.
  - **Decided**:
    - CHK-4 advisory fires on an untouched small-remainder estimate → left unchanged, reported as a finding (rung 3: the phase plan's code blocks and its 'CHK-4 unchanged' decision row; exit criteria are silent on the banner)
    - Three journeys failed first time on a vendor timeout/transport that also hit the unchanged plain flow → one re-run each, as the harness allows; no budget raised, no journey weakened (verify skill's proof standard)

- [x] **P1-LEX-K7CD** Phase 1: Chart estimator
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the new directory `lib/extract/chart/` — `pixels.ts` (`RgbImage`, colour predicates), `locate.ts` (find the pace and HR charts by colour and band shape, not fixed rows; thresholds scale with image width), `measure.ts` (slot measurement), `estimate.ts` (the pure `estimateFromCharts`), `decode.ts` (the `sharp` shell `decodeToRgb`); `tests/extract.chartEstimate.test.ts` (19 cases on committed bytes); the fixtures moved to `research/fixtures/workout-details/` with `shipped/*.jpg` generated by a named `workout-details` set in `scripts/shipped-image-recipe.py`, plus that directory's README. Touches nothing else (no vision code, schema, `constants.ts` or docs); contract exports carry `@public` until phase 3 imports them. Exit: `estimateFromCharts` meets R2.2 on the Friday fixture at 739 px PNG and 560 px JPEG; a plausible Sunday estimate (5.9–6.3 km, six full splits); `null` (never throws) for the four non-details screens, an inverted or zero-width pace range, a non-positive duration and malformed images; with `knownDistanceKm: 6.04` returns `distanceKm: 6.04`, `distanceWasEstimated: false`, six full rows and no partial row (a partial row only when the 2-decimal remainder is > 0.05 km); typecheck, lint, format and all seven guards green.
  - **Status**: done
  - **Plan Set**: `/home/miftah/run-insights/.workflows/orchestration/workout-details-estimate/PLAN.md` (phase 1 of 3)
  - **Satisfies**: R2 — Vision model (glm-4.6v) transcribes ONLY the printed text on that screen: duration, pace range (slowest–fastest), HR range, elevation gain/range, distance if printed. Deterministic pure code (no LLM arithmetic) measures the Pace bar chart and Heart Rate chart pixels from the stored 560px JPEG and computes estimated distance, per-km splits (time, pace, HR; cadence null) — validated method: 90 equal time slots across the chart's x-extent, per-slot max teal column height, shortest bar = slowest printed pace, tallest = fastest, height linear in SPEED (tall = fast), distance = Σ speed×dt, km splits by cumulative interpolation, final partial row; HR per slot = midpoint of red marks mapped linearly onto the printed HR range, gaps interpolated, averaged per km. · criteria: R2.1, R2.2, R2.4
  - **Depends on**: none
  - **Plan**: `.workflows/plan/P1-LEX-K7CD.md`
  - **Completed**: 2026-11-22 16:56
  - **Method**: /implement
  - **Files**: lib/extract/chart/pixels.ts, lib/extract/chart/locate.ts, lib/extract/chart/measure.ts, lib/extract/chart/estimate.ts, lib/extract/chart/decode.ts, tests/extract.chartEstimate.test.ts, scripts/shipped-image-recipe.py, research/fixtures/workout-details/README.md, research/fixtures/workout-details/{2026-11-20-details,2026-11-20-heartrate,2026-11-20-splits,2026-11-20-summary,2026-11-22-details,2026-11-22-heartrate,2026-11-22-summary}.png, research/fixtures/workout-details/shipped/{same seven stems}.jpg, .workflows/plan/workout-details-estimate/fixtures/*.png (seven deletions, the old side of the move), lib/extract/.workflows/todos.md, lib/extract/.workflows/plan/P1-LEX-K7CD.md
  - **Proof**: verified-first-pass — 6 journeys, evidence vitest on committed fixture bytes (no harness for this phase); measured numbers in /tmp/claude-1000/-home-miftah--worktrees-run-insights-workout-details-estimate-p1/dc5c5b03-8c74-45fe-809d-15ee193b91d9/scratchpad/measured.txt
  - **Drift**:
    - The seven fixture PNGs were TRACKED under .workflows/plan/workout-details-estimate/fixtures/ (the plan said untracked); moved with plain mv, so the commit carries both the deletions and the new research/ paths.
    - tests/extract.chartEstimate.test.ts: three reconciler-added lines exceeded the Prettier width; ran prettier --write (formatting only, 311 -> 315 lines, no assertion changed).
    - Implemented in the swarm's per-phase worktree workout-details-estimate-p1 / branch phase-1-workout-details-estimate, not the set worktree the index names.
    - J6's post-commit half (git status clean on shipped/ after re-running the recipe) can only be observed after the commit; pre-commit the regenerated 2026-11-20-details.jpg sha256 matched the plan's c57c66f9… under Pillow 12.3.0 and the canonical set regenerated byte-identical.
  - **Decided**:
    - Index names the set worktree/branch but swarm.py spawned this phase in its own worktree → implement in the phase worktree (rung 6: swarm convention; the coordinator integrates phase branches).
    - Package `lib/extract/chart` has no .workflows → task filed under the enclosing package lib/extract with new package code LEX (EXT is taken by app/api/extract).

---

## Archive

(none yet)
