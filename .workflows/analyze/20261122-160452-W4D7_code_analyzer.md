# Code Analysis: Workout Details screenshot as a Splits stand-in

**Type:** Feature Implementation
**Date:** 2026-11-22 16:04 WIB
**Session ID:** 20261122-160452-W4D7
**Plan:** `.workflows/plan/WORKOUT_DETAILS_ESTIMATE_PLAN.md` (3 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/workout-details-estimate` on `feature/workout-details-estimate` (base `origin/main` @ `7e285b3`)

---

## User Input

### Original User Request

> Add a fourth screen kind "Workout Details" (kind `details`) the runner can upload in place of the Splits screenshot when the Apple Watch produced no split table (and often no distance). Vision model (glm-4.6v) transcribes ONLY the printed text on that screen: duration, pace range (slowest–fastest), HR range, elevation gain/range, distance if printed. Deterministic pure code (no LLM arithmetic) measures the Pace bar chart and Heart Rate chart pixels from the stored 560px JPEG and computes estimated distance, per-km splits (time, pace, HR; cadence null) — validated method: 90 equal time slots across the chart's x-extent, per-slot max teal column height, shortest bar = slowest printed pace, tallest = fastest, height linear in SPEED (tall = fast), distance = Σ speed×dt, km splits by cumulative interpolation, final partial row; HR per slot = midpoint of red marks mapped linearly onto the printed HR range, gaps interpolated, averaged per km. Calibrated on Fri 20 Nov run: 6.08 vs 6.04 km true, splits within 10 s (km 1) and ≤3 s (km 2–6), HR within 1 bpm; stable at 560px JPEG q80 (6.09 km). Prototype scripts: /tmp/claude-1000/-home-miftah-run-insights/798b8559-2466-4da1-9a4c-4fe3bfd07570/scratchpad/pace.py and check.py; sample images in /tmp/claude-1000/-home-miftah-run-insights/798b8559-2466-4da1-9a4c-4fe3bfd07570/images/ (1.png = details without splits, Sun 22 Nov; 4–7.png = summary/splits/heartrate/details for Fri 20 Nov, the ground-truth fixture). Review screen: estimated distance and splits arrive pre-filled and labelled as estimated; runner confirms/edits as usual. DECIDED BY USER: persist that a run's splits/distance were estimated — a new column on the production DB (additive migration), run page shows an "estimated" mark, and estimated runs are excluded from pace records (a ~1% error must not mint a false PB). Existing three-screenshot flow must be unchanged; the extraction prompt's rules 1–7 and SHAPE are byte-frozen (additive rules only, re-score needed if touched). User wants it analyzed and then built end to end.

### User-Provided Context

The runner's own words across the conversation that produced the request:

- "sometimes (like this morning run) the apple watch didn't provide me with Split table. can we replace it with this? … so, we still upload 3 screenshots, but if the Split isn't available, i can replace it with that screenshot."
- "note: we dont have to be a perfectionist. if we can approximate the missing data using this new screenshot, then that'd be good enough"
- "remember it, go ahead : /analyze and build it" (answering: should a saved run remember that its splits were estimated?)

### User-Provided Files

Copied into the worktree (route map painted over — it shows the runner's home area and the repo is on GitHub):

`.workflows/plan/workout-details-estimate/fixtures/`

| File | What |
|---|---|
| `2026-11-20-details.png` | Workout Details, Fri 20 Nov — the run WITH ground truth |
| `2026-11-20-summary.png`, `-splits.png`, `-heartrate.png` | the same run's three ordinary screens (truth: 6.04 km, 0:46:13, splits 7:26 7:48 7:38 7:30 7:43 7:46 + 0:17 partial, split HR 148 158 167 174 181 180 185, cadence 149–152) |
| `2026-11-22-details.png` | Workout Details, Sun 22 Nov — no split table, no distance |
| `2026-11-22-summary.png`, `-heartrate.png` | the same run's other two screens (Summary prints `--'--"/KM`, no Distance tile, no Cadence tile) |
| `prototype_pace.py`, `prototype_check.py` | the measured prototype (Python/PIL) |

All seven PNGs are 739×1600, the same size as the existing research fixture.

> **Reconciliation note, 2026-11-22.** This directory is the pre-phase-1 source. Phase 1 moves the
> seven PNGs to `research/fixtures/workout-details/` (same filenames) and commits their 560 × 1212
> JPEG q80 re-encodes under `research/fixtures/workout-details/shipped/`; the two prototype
> scripts stay here. Tests and Proof read the `research/` copies.

### Requirement IDs

| ID | What the user asked for (verbatim) |
|---|---|
| R1 | Add a fourth screen kind "Workout Details" (kind `details`) the runner can upload in place of the Splits screenshot when the Apple Watch produced no split table (and often no distance). … Existing three-screenshot flow must be unchanged; the extraction prompt's rules 1–7 and SHAPE are byte-frozen (additive rules only, re-score needed if touched). |
| R2 | Vision model (glm-4.6v) transcribes ONLY the printed text on that screen: duration, pace range (slowest–fastest), HR range, elevation gain/range, distance if printed. Deterministic pure code (no LLM arithmetic) measures the Pace bar chart and Heart Rate chart pixels from the stored 560px JPEG and computes estimated distance, per-km splits (time, pace, HR; cadence null) — validated method: 90 equal time slots across the chart's x-extent, per-slot max teal column height, shortest bar = slowest printed pace, tallest = fastest, height linear in SPEED (tall = fast), distance = Σ speed×dt, km splits by cumulative interpolation, final partial row; HR per slot = midpoint of red marks mapped linearly onto the printed HR range, gaps interpolated, averaged per km. |
| R3 | Review screen: estimated distance and splits arrive pre-filled and labelled as estimated; runner confirms/edits as usual. |
| R4 | DECIDED BY USER: persist that a run's splits/distance were estimated — a new column on the production DB (additive migration), run page shows an "estimated" mark, and estimated runs are excluded from pace records (a ~1% error must not mint a false PB). |

#### Acceptance Criteria

| ID | Pattern | Criterion |
|---|---|---|
| R1.1 | optional | WHERE the runner labels an upload tile "Workout Details" THE SYSTEM SHALL accept the screenshot through `/api/upload` and `POST /api/extract` with kind `details` and store it as a `run_photos` row of that kind. |
| R1.2 | unwanted | IF an extraction contains a `splits` screenshot THEN THE SYSTEM SHALL keep the transcribed split table and SHALL NOT replace any split row with a chart estimate. |
| R1.3 | ubiquitous | THE SYSTEM SHALL send the primary vision request for the `summary` / `splits` / `heartrate` images with `EXTRACTION_SYSTEM_PROMPT` and `EXTRACTION_SHAPE` byte-identical to `origin/main` @ `7e285b3`, and SHALL never include a `details` image in that request. |
| R2.1 | ubiquitous | THE SYSTEM SHALL compute, from the pixels of a Workout Details screenshot plus its printed duration, pace range and HR range, an estimated distance and per-kilometre splits (time, pace, HR, cadence null, final row partial) in deterministic TypeScript with no model call. |
| R2.2 | ubiquitous | THE SYSTEM SHALL estimate the 2026-11-20 fixture, re-encoded as a 560 px-wide JPEG q80, to within 2 % of 6.04 km, within 15 s of every full-kilometre split time, and within 3 bpm of every full-kilometre split heart rate. |
| R2.3 | event | WHEN the extraction job runs with a `details` screenshot and no `splits` screenshot THE SYSTEM SHALL store the estimated splits in the extraction's parsed session, and SHALL fill `distanceKm` from the estimate only when no distance was transcribed. |
| R2.4 | unwanted | IF the charts cannot be located, the pace range was not transcribed, or the Workout Details reading fails THEN THE SYSTEM SHALL finish the extraction with the other screens' fields intact and no estimated values, and SHALL NOT mark the extraction `failed` for that reason. |
| R3.1 | state | WHILE a review draft holds a chart-estimated distance or chart-estimated splits THE SYSTEM SHALL label that field as estimated on the review screen at `/x/[extractionId]`. |
| R3.2 | event | WHEN the runner changes the estimated distance on the review screen and saves THE SYSTEM SHALL store the runner's value and SHALL NOT persist the run's distance as estimated. |
| R4.1 | event | WHEN a run is committed from an extraction whose distance or splits were chart-estimated and left as estimated THE SYSTEM SHALL persist `runs.distance_estimated` / `runs.splits_estimated` as true for the values that were estimated, deriving both on the server from the stored extraction. |
| R4.2 | state | WHILE a run has `distance_estimated` or `splits_estimated` true THE SYSTEM SHALL show an "estimated" mark on the run page `/r/[id]`. |
| R4.3 | state | WHILE a run has `distance_estimated` true THE SYSTEM SHALL exclude it from `longest_distance`, `fastest_pace_5k`, `fastest_pace_10k` and `best_paced_run`, and WHILE it has `splits_estimated` true THE SYSTEM SHALL exclude it from `fastest_km_split` and `best_paced_run`. |
| R4.4 | ubiquitous | THE SYSTEM SHALL treat every run committed before this change as not estimated (both columns false) with its records unchanged. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement.** An old Apple Watch sometimes records a run with no distance and no split table. The app requires `runs.distance_m`, and its pace/HR chart, decoupling, pace-σ and split records all read `run_splits`. Apple's "Workout Details" screen for the same run still draws a 90-bar pace chart and an HR trace, each with a printed range and a time axis spanning the workout duration. Those pixels plus three printed numbers are enough to reconstruct distance and per-km splits to about 1 %.

**Behavior that must change.**
1. The ingest path knows three screen kinds; it must know a fourth (`details`).
2. A new deterministic estimator turns the details JPEG + printed ranges into distance and splits.
3. The job merges the estimate into the stored parsed session, and records that it did.
4. The review screen says which values are estimated.
5. A committed run carries two booleans; the run page marks it; record computation skips it.

**Success Criteria.** The fourteen acceptance criteria above. In one sentence: Sunday's three screenshots (summary, details, heart rate) upload, arrive at review with ~6.08 km and six estimated splits labelled as estimated, commit, show an "estimated" mark, and do not hold a pace record — while a normal summary/splits/heartrate upload sends the byte-identical prompt and behaves exactly as today.

**Key Considerations.**
- **The frozen prompt.** `lib/llm/prompts/extraction.ts` rules 1–7 and SHAPE scored 108/108 and must not be reworded; `npm run probe:f04` scrapes `EXTRACTION_SHAPE` from source text. The details screen therefore gets its **own** small prompt and its own vision call, run in parallel with the primary call, so the proven request is untouched by construction (R1.3).
- **The 60 s ceiling.** `maxDuration = 60`, `JOB_DEADLINE_MS = 55_000`, primary median 28–36 s. A second *sequential* call does not fit; a parallel one does. Latency tracks completion tokens (~26–33 ms each), and the details reply is ~10 numbers.
- **Token floor.** `TOKEN_FLOOR_PER_IMAGE = 500` is checked per call against `imageCount`; the details call is a one-image call and must pass the same guard (a dropped image would yield an invented pace range, which scales every estimate).
- **"The LLM never computes."** The model returns only printed numbers. All arithmetic lives in pure TypeScript. Pixel decode needs `sharp` (already a dependency, `0.35.3`), which is I/O-free in the sense that matters but is a native module — keep decode in a `server-only` shell and the maths in a pure module testable from a raw RGB buffer.
- **Chart location cannot be hard-coded rows.** The prototype used y 1315–1415 at 739 px. Both fixtures happen to share that offset; a scrolled screenshot will not. And the predicate "teal" also matches the map's route line (wide, ~380 px tall), the "Average: 7'39"/KM" text (narrow) and the Cadence chart below (wide, short, may be cut by the screen edge). The locator has to discriminate by band shape.
- **Client trust.** `commitReview` validates the browser's draft. The estimated flags must be derived on the server from the extraction row, not taken from the draft.
- **Privacy.** The details screen shows the route map. `run_photos.excluded_from_share` exists.
- **One database.** `db:migrate` writes production; the migration must be additive with defaults; next free number is `0038` (verify against `origin/main`), regenerate never rename.

**Assumptions (inferences, stated).**
- A1. When both `splits` and `details` are uploaded, the real table wins and no estimate is made (R1.2).
- A2. When a distance *is* transcribed (Summary prints it) and only the split table is missing, the estimator scales its speeds so the estimated total equals the transcribed distance; the distance is then not estimated, the splits are.
- A3. "Pace records" is read as every record whose value or qualifying threshold depends on the estimated quantity (R4.3). `longest_duration`, `most_kcal`, `most_elevation`, `highest_max_hr`, `earliest_start` are unaffected. `highest_cadence` needs `avgCadence`, which such a run does not have.
- A4. Badges are not gated on the flags — the user asked for records only and said approximation is good enough.
- A5. Editing the estimated distance clears `distance_estimated` (the value is then the human's). `splits_estimated` stays true while the run keeps any split row that came from the chart; removing all splits clears it.
- A6. A `details` photo defaults to `excluded_from_share = true`.
- A7. Fields the details screen prints that the Summary also prints (duration, elevation gain, average HR, distance) are used only to fill a null left by the other screens.

---

## Analysis Scope

### Explicitly Mentioned Files
- the seven fixture PNGs and two prototype scripts above

### Discovered Related Files

Ingest
- `lib/extract/constants.ts` — `SCREEN_KINDS`, `SCREEN_KIND_LABEL`, `DEFAULT_KIND_BY_INDEX`, `MAX_IMAGES = 3`, timeouts, `EXTRACTION_ERROR_CODES`
- `lib/extract/planPicked.ts`, `lib/extract/reassignKind.ts` (`KINDS_MATCH_SLOTS = MAX_IMAGES === SCREEN_KINDS.length`)
- `components/extract/UploadPicker.tsx`, `KindSelector.tsx`, `ExtractingSkeleton.tsx`, `ExtractionGate.tsx`
- `app/api/upload/route.ts` — `ClientPayload = z.object({ kind: z.enum(SCREEN_KINDS) })`
- `app/api/extract/route.ts`, `app/api/extract/[id]/route.ts`, `lib/extract/readExtraction.ts`
- `lib/schema/extractionResult.ts` — `ExtractionBlobRefSchema.kind`, `ExtractRequestSchema`, `ExtractionResult`
- `lib/schema/extractedSession.ts` — `RawExtractedSession`, `FIELD_SOURCES`, `makeExtractedSessionSchema`
- `lib/llm/prompts/extraction.ts` — frozen prompt, `IMAGE_LABEL: Record<ScreenKind, string>`
- `lib/llm/vision.ts` — `callVisionWithFetch`, token floor, `callVisionPrimaryWithFetch` (1–3 images)
- `lib/llm/extract.ts` — `extractSession`, `ExtractDeps`
- `lib/llm/runExtractionJob.ts` — `toDataUri`, `RawResponseColumn`, terminal-row promise

Review / commit
- `lib/review/draft.ts` — `ReviewDraft`, `hydrateDraftFromExtraction`, `draftFromRun`
- `lib/review/loadReview.ts` — `ReviewContext`, `loadExtractionReview`, `loadRunEdit`
- `lib/review/schema.ts` — `ReviewDraftSchema`, `toRunInput`
- `lib/review/commit.ts`, `lib/review/actions.ts`, `lib/review/checks.ts`
- `components/review/ReviewClient.tsx`, `HeroFields.tsx`, `SplitsTable.tsx`, `ScreenshotStrip.tsx`, `HonestyChip.tsx`

Persistence / derived
- `lib/db/schema/runs.ts` — `runs`, `run_splits`, `run_photos` (`kind text`, `$type<PhotoKind>`), `PhotoKind`
- `lib/db/queries/runs.ts` — `NewRunInput`, `commitExtractedRun`, `applyRunCorrections`, `getRunDetail`
- `lib/db/queries/photos.ts` — `NewPhotoInput`, `attachExtractionPhotos`
- `lib/records/catalog.ts`, `compute.ts` (`toRecordCandidate`), `gateway.ts`, `types.ts`, `recompute.ts`
- `app/r/[id]/page.tsx` — the run page
- `lib/llm/facts.ts`, `lib/llm/factsHash.ts` — narrative facts
- `components/ui/PhotoViewer.tsx`, `app/photo/[kind]/[id]/page.tsx`, `lib/share/*`, `components/share/PhotoInclusionList.tsx` — places that enumerate photo kinds
- `drizzle/` — latest `0037_wild_thunderbird.sql`
- CI guards: `ci:schema-drift-guard`, `ci:llm-payload-guard`, `ci:data-layer-guard`, `ci:client-secret-guard`

---

## Current Dataflow

### Entry Point: `/upload`

**Location:** `components/extract/UploadPicker.tsx`
**Trigger:** the runner picks 1–3 images.
**Kind assignment:** `planPicked` gives each accepted file `DEFAULT_KIND_BY_INDEX[n]` (`heartrate`, `splits`, `summary`), falling to the first unused kind. `KindSelector` lets the runner relabel; `reassignKind` swaps with the current holder so kinds stay unique.
**Client transform:** `compressForExtraction` — JPEG q80, short edge 560 px.
**Next:** `POST /api/upload` (Blob client-upload handshake; `kind` validated by `z.enum(SCREEN_KINDS)` and carried in the signed token), then `POST /api/extract`.

### Processing Chain

1. **`POST /api/extract`** — `app/api/extract/route.ts`
   - Validates `ExtractRequestSchema` (1–3 images, unique kinds, Blob host pinned).
   - `createExtraction` inserts `extractions(status='pending')`; `attachExtractionPhotos` inserts `run_photos` rows (`kind`, `sortOrder`, `contentHash`).
   - Returns 202; `after()` runs `runExtractionJob`.

2. **`runExtractionJob`** — `lib/llm/runExtractionJob.ts`
   - `toDataUri` fetches each blob (`cache: 'no-store'`, ≤10 s) and base64-encodes it. The raw JPEG `Buffer` exists here and is discarded after encoding.
   - `kindsPresent = new Set(images.map(i => i.kind))` — from our own records.
   - `extractSession(deps, prompt, kindsPresent, remaining)`.
   - Writes `raw_response = { vendor, parsedSession, attempts }` and a terminal status. Every exit path writes a terminal row.

3. **`extractSession`** — `lib/llm/extract.ts`
   - `callPrimary(images)` → `extractJsonObject` → `makeExtractedSessionSchema(kindsPresent).safeParse`.
   - The schema nulls every field whose `FIELD_SOURCES` screens are all absent (`splits: ['splits']`, `distanceKm: ['summary']`, …).
   - On a parse failure, one text-only repair if ≥ `MIN_REPAIR_BUDGET_MS` remains.

4. **`callVisionWithFetch`** — `lib/llm/vision.ts`
   - One `chat/completions` POST, `thinking: disabled`, `max_tokens: 4096`.
   - Throws `VisionTokenFloorError` when `usage.prompt_tokens < 500 × imageCount`, before reading the text.

5. **Poll** — `GET /api/extract/[id]` → `readExtraction` → `ExtractionResult` (`session`, `kinds`, `photos`).

6. **Review** — `/x/[extractionId]`
   - `loadExtractionReview` → `hydrateDraftFromExtraction(raw.parsedSession)` → `ReviewContext.baseline`.
   - `ReviewClient` edits a `ReviewDraft`; `checks.ts` computes four advisory cross-checks; `ScreenshotStrip` shows photos by kind.

7. **Commit** — `lib/review/actions.ts` → `commit.ts`
   - `CommitReviewPayloadSchema` validates the browser's draft (`distanceKm` positive and required; zero splits legal).
   - `toRunInput(draft, { source, extractionId })` → `NewRunInput` → `commitExtractedRun` (run + splits + zones, photo backfill) → corrections log → `onRunCommitted` (records full recompute, badges, insight sweep, Nina trigger).
   - Edit mode (`/r/[id]/edit`) goes through `applyRunCorrections`.

### Data Persistence

- `extractions.raw_response` jsonb — `RawResponseColumn`; a convention, no schema.
- `extractions.blob_urls` jsonb — `[{ url, pathname, kind, width, height, bytes }]`.
- `run_photos.kind` text typed `PhotoKind = 'summary' | 'splits' | 'heartrate' | 'other'`.
- `runs` — no column records how a value was obtained beyond `source: 'screenshot' | 'manual'`.
- `records` — fully recomputed (delete + insert) from `getReviewedRunsWithChildren` on every commit.

### Exit Points

- `/r/[id]` renders the run, a provenance mark, the pace/HR chart and the splits table.
- `lib/llm/facts.ts` builds the narrative's facts from the run and its splits.

---

## Key Data Structures

### `ScreenKind` — `lib/extract/constants.ts`
`'summary' | 'splits' | 'heartrate'`. Used as a `Record<ScreenKind, …>` key in `SCREEN_KIND_LABEL`, `IMAGE_LABEL` (prompt), and photo-kind UI. Tests pin `DEFAULT_KIND_BY_INDEX` as a permutation of `SCREEN_KINDS`, and `KINDS_MATCH_SLOTS` asserts the two lengths are equal.

### `ExtractedSession` — `lib/schema/extractedSession.ts`
Nineteen fields; `splits: { km, timeSec, paceSecPerKm, hrBpm, cadenceSpm, partial }[]`. `FIELD_SOURCES: Record<field, ScreenKind[]>` drives the provenance null-out.

### `RawResponseColumn` — `lib/llm/runExtractionJob.ts`
`{ vendor: unknown; parsedSession: ExtractedSession | null; attempts: 1 | 2 }`.

### `NewRunInput` — `lib/db/queries/runs.ts:51`
The commit payload; `splits`, `zones`, `source`, `extractionId`.

### `RecordCandidate` / `RecordRunRow` — `lib/records/types.ts`
What `RECORD_CATALOG`'s `qualifies` / `valueOf` read.

---

## Measured facts about the Workout Details screen

Measured on the two fixtures at 739 px, and repeated after a 560 px JPEG q80 re-encode.

| Fact | Value |
|---|---|
| Pace chart bars | 90, pitch ≈ 7.45 px at 739 px (≈ 5.6 px at 560 px), bars 2–4 px wide |
| Pace chart x-extent | 34–704 of 739 (≈ 90 % of width) |
| Pace bar heights | 3–88 px; all bars share one baseline row |
| Teal predicate that worked at both sizes | `g > 130 && b > 130 && r < 130 && g − r > 50` |
| Red predicate (HR marks), measured at 739 px only | `r > 170 && g < 110 && b < 90` |
| HR marks | one short vertical mark per slot; gaps exist (Fri: slots ≈ 24–28 empty) |
| Direction / scale | tall = fast; height linear in speed (1/pace) fits best |

> **Correction, 2026-11-22 (reconciliation; measured by phase 1's planner, not by this analysis).**
> The teal predicate above drops whole bars at 560 px JPEG q80: chroma subsampling lightens a 2 px
> bar to ~(141, 214, 220), so `r < 130` fails and the Friday estimate moves to 6.12 km. Removing
> `r < 130` alone admits the Elevation chart's anti-aliased green (~(159, 232, 140)). The shipped
> predicate is `g > 130 && b > 130 && g − r > 50 && |g − b| < 40` — see
> `.workflows/plan/workout-details-estimate/phase-1.md` (Goal, Step 4). The table row is left as
> this analysis measured it.

| Run | Method | Distance | Splits |
|---|---|---|---|
| Fri 20 Nov (truth 6.04 km; 7:26 7:48 7:38 7:30 7:43 7:46) | linear speed, 739 px | 6.07 km | 7:17 7:48 7:38 7:31 7:41 7:45 |
| | linear speed, 560 px JPEG | 6.09 km | 7:16 7:46 7:37 7:29 7:40 7:42 |
| | linear pace, 739 px | 5.99 km | 7:22 7:53 7:44 7:38 7:48 |
| Fri HR per km (truth 148 158 167 174 181 180) | mark midpoint → printed range | — | 149 158 167 174 180 180 |
| Sun 22 Nov (no truth; same loop as Fri) | linear speed, 560 px JPEG | 6.10 km | 8:14 8:16 8:16 8:32 8:29 8:13 |

Printed inputs: Fri — duration 0:46:13 (2773 s), pace 8'17"–6'05" (497–365 s/km), HR 101–186. Sun — 0:50:46 (3046 s), 9'12"–6'47" (552–407), HR 116–177.

---

## Dependencies

- `sharp@0.35.3` — present; already used server-side (`lib/photos/deriveThumbnail.ts`).
- z.ai vision endpoint (`env.LLM_VISION_BASE_URL`, `LLM_VISION_MODEL = glm-4.6v`).
- Vercel Blob (public store, host-pinned).
- Postgres (Neon) — the one production database.
- `.claude/skills/verify-run-insights` — the throwaway-app verification harness.

---

## Reference List

| Symbol / key | File | Kind | Package |
|---|---|---|---|
| `SCREEN_KINDS`, `ScreenKind`, `SCREEN_KIND_LABEL`, `DEFAULT_KIND_BY_INDEX`, `MAX_IMAGES` | `lib/extract/constants.ts` | def | extract |
| `planPicked` | `lib/extract/planPicked.ts` (+ `tests/extract.planPicked.test.ts`) | def · test | extract |
| `reassignKind`, `KINDS_MATCH_SLOTS` | `lib/extract/reassignKind.ts` (+ `tests/extract.reassignKind.test.ts`) | def · test | extract |
| kind picker UI | `components/extract/KindSelector.tsx`, `UploadPicker.tsx`, `ExtractingSkeleton.tsx` (+ tests, `tests/extract.kindSelector.test.ts`, `tests/extract.onPickPurity.test.ts`) | call · test | components |
| `ClientPayload` | `app/api/upload/route.ts` (+ test) | call | api |
| `ExtractionBlobRefSchema`, `ExtractRequestSchema`, `ExtractionResult` | `lib/schema/extractionResult.ts` (+ test) | def | schema |
| `ScreenKindSchema`, `FIELD_SOURCES`, `makeExtractedSessionSchema` | `lib/schema/extractedSession.ts` (+ test) | def | schema |
| `IMAGE_LABEL`, `buildExtractionUserContent`, `buildRepairRequestText` | `lib/llm/prompts/extraction.ts` | def (frozen) | llm |
| `callVisionPrimaryWithFetch`, `callVisionWithFetch` | `lib/llm/vision.ts` (+ test) | def | llm |
| `extractSession`, `ExtractDeps`, `productionDeps` | `lib/llm/extract.ts` (+ test) | def | llm |
| `runExtractionJob`, `RawResponseColumn` | `lib/llm/runExtractionJob.ts` | def | llm |
| `readExtraction` | `lib/extract/readExtraction.ts` (+ test) | call | extract |
| `hydrateDraftFromExtraction`, `ReviewDraft` | `lib/review/draft.ts` (+ `tests/review.draft.test.ts`) | def | review |
| `ReviewContext`, `loadExtractionReview`, `loadRunEdit` | `lib/review/loadReview.ts` (+ test) | def | review |
| `toRunInput`, `ReviewDraftSchema` | `lib/review/schema.ts` | def | review |
| commit path | `lib/review/commit.ts`, `actions.ts` | call | review |
| review UI | `components/review/ReviewClient.tsx`, `HeroFields.tsx`, `SplitsTable.tsx`, `ScreenshotStrip.tsx` (+ tests) | call | components |
| `PhotoKind` | `lib/db/schema/runs.ts`; consumers `components/ui/PhotoViewer.tsx`, `lib/db/queries/photos.ts`, `lib/db/queries/sharedRun.ts`, `components/share/PhotoInclusionList.tsx`, `app/photo/[kind]/[id]/page.tsx` | def · call | db · ui |
| `runs` table | `lib/db/schema/runs.ts`, `drizzle/0037_*` (tip) | def | db |
| `NewRunInput`, `commitExtractedRun`, `applyRunCorrections`, `getRunDetail` | `lib/db/queries/runs.ts` (+ `tests/integration/queries.int.test.ts`) | def | db |
| `RECORD_CATALOG`, `toRecordCandidate`, `RecordCandidate`, `RecordRunRow`, `dbRecordsGateway` | `lib/records/*` | def | records |
| run page | `app/r/[id]/page.tsx` | call | app |
| narrative facts | `lib/llm/facts.ts`, `lib/llm/factsHash.ts` (+ `tests/llm.facts.test.ts`) | call | llm |
| pipeline docs | `docs/architecture.md` §5, `CLAUDE.md` pipeline paragraph, `.claude/skills/verify-run-insights/features/README.md` | doc | docs |

---

## Impact Points (files that WILL need changes)

1. **New** `lib/extract/chart/*` (locator, measurement, estimator, sharp decode shell) + tests + committed fixtures — phase 1.
2. `lib/db/schema/runs.ts`, new `drizzle/0038_*`, `lib/db/queries/runs.ts` (`NewRunInput`, commit, corrections, detail) — phase 2.
3. `lib/records/types.ts`, `catalog.ts`, `compute.ts`, `gateway.ts` (+ whatever `getReviewedRunsWithChildren` selects) — phase 2.
4. `app/r/[id]/page.tsx` and its mark component; `lib/llm/facts.ts` / `factsHash.ts` — phase 2.
5. `lib/extract/constants.ts`, `planPicked.ts`, `reassignKind.ts`, `components/extract/*`, `app/api/upload/route.ts`, `lib/schema/extractionResult.ts`, `lib/schema/extractedSession.ts` — phase 3.
6. **New** details prompt + details vision call (`lib/llm/prompts/details.ts`, `lib/llm/vision.ts`), `lib/llm/extract.ts`, `lib/llm/runExtractionJob.ts` — phase 3.
7. `lib/review/draft.ts`, `loadReview.ts`, `schema.ts` (`toRunInput`), `commit.ts`, `components/review/*` — phase 3.
8. `PhotoKind` consumers and `lib/db/queries/photos.ts` (share default) — phase 3.
9. `docs/architecture.md` §5, `CLAUDE.md`, verify-skill feature map — phase 3.

**This document describes. The plan files prescribe.**
