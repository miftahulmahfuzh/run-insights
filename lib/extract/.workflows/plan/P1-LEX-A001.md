> Adopted from `/home/miftah/run-insights/.workflows/orchestration/workout-details-estimate/PLAN.md` phase 3. Source: `.workflows/plan/workout-details-estimate/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: `details` kind end to end: upload, reading, merge, review, commit

**Plan set:** `WORKOUT_DETAILS_ESTIMATE_PLAN.md`
**Analysis:** `.workflows/analyze/20261122-160452-W4D7_code_analyzer.md`
**Satisfies:** R1, R2, R3, R4. The runner uploads Apple's "Workout Details" screen instead of the Splits screenshot, gets an estimated distance and splits on review, labelled as estimated, and the saved run remembers which values were estimated.
**Criteria:** R1.1, R1.2, R1.3, R2.3, R2.4, R3.1, R3.2, R4.1
**Depends on:** Phase 1, Phase 2
**Difficulty:** HARD
**Package:** `lib/extract`, `lib/llm`, `lib/review`, `components/extract`, `components/review`

---

## Goal

A fourth upload kind, `details` (label "Workout Details"), travels the whole pipeline: the picker
offers it, `/api/upload` and `POST /api/extract` accept it, and `run_photos` stores it with
`excluded_from_share = true`. The background job reads the details screen with its own one-image
`glm-4.6v` call, running in parallel with the unchanged primary call. It measures the charts with
phase 1's estimator and merges an estimated distance and estimated splits into the stored parsed
session (assumptions A1, A2, A7). A failure on the details side never fails the extraction. The
review screen labels the estimated values. `commitReview` then derives
`distanceEstimated`/`splitsEstimated` on the server and hands them to phase 2's `NewRunInput`. The
primary prompt strings stay byte-identical to `origin/main` @ `7e285b3`, and a hash test now pins
them.

## Decisions this plan takes (state them; the reconciler may overrule)

| Fork | Chosen | Why |
|---|---|---|
| Status when the primary call fails but the details reading succeeded | `failed`, with the primary's error code. `raw_response.details` still records the reading. | The runner uploaded summary/heart-rate screens. Showing an `ok` review built only from the details screen would quietly drop them. A retry re-runs both calls. |
| Status when the primary call succeeds but the details side fails (vision, timeout, token floor, validation, decode, estimator `null` or throw) | The primary's `ok`/`repaired`, no estimate, `details.printed`/`estimate` `null` | R2.4, invariant 4 |
| Details-only upload (no primary call), reading succeeded | `ok`: a session built from the printed values plus the estimate | Nothing else exists to read |
| Details-only upload, reading failed (transport, timeout, token floor, validation) | `failed`, with the reading's own code (always one of `EXTRACTION_ERROR_CODES`: `token_floor` / `timeout` / `transport` from `codeForVisionError`, else `transport`; `validation` for a refused reply) | No "other screens' fields" exist to keep intact. `failed` renders the same blank review form an empty `ok` would, but also shows *why* and offers Retry. If the estimator alone failed (the reading succeeded), the result is still `ok`. **Confirmed by the reconciler** (index Decisions: rung 4 + rung 6). |
| Details call timeout | `min(PRIMARY_TIMEOUT_MS, remaining budget)`. No new constant. | It runs in parallel with the primary call and is bounded by the same budget. Nothing has been measured yet that would justify a separate knob. |
| CHK-1 (splits Σ = duration) on estimated splits | Always passes | The rows are the printed duration spread across the chart: they sum to it, or fall short by a folded-away remainder of ≤ 0.05 km (≤ ~25 s). Either way the check could only nag about the estimate, never point at a misread row |
| CHK-4 (partial km) on estimated splits | Unchanged | It stays informative after the runner edits the distance. **Reconciled:** phase 1 now emits the partial row only when the 2-decimal remainder is > 0.05 km, CHK-4's own test, so an untouched estimate never draws its advisory (Friday scaled to 6.04 km: six rows, no partial). |
| Blob fetch of the `details` screenshot fails | The extraction fails `transport`, as any failed blob fetch does today | Reconciler: invariant 4 covers the details *reading* and the estimator; the fetch is the shared step before either starts, and all blobs come from one store in one `Promise.all` |
| CHK-3 (distance × pace = duration) with an estimated distance and a `null` average pace (Sunday) | Unchanged: passes vacuously (nothing to compare) | Sensible as-is. When the details screen prints an average pace (Friday), it fills the null (A7) and CHK-3 checks the estimate against Apple's own average, which is real signal. |
| Where `ScreenKind` splits | `PrimaryScreenKind` = the three measured screens, `ScreenKind` = all four (as the index says) | `IMAGE_LABEL`, `PromptImage`, `FIELD_SOURCES`, `buildRepairRequestText` and `DEFAULT_KIND_BY_INDEX` are keyed on `PrimaryScreenKind`, so a `details` image cannot be typed into the primary request |

**A trap this plan closes, so the reconciler knows it exists.** `buildExtractionUserContent`
(`lib/llm/prompts/extraction.ts:142`) picks its intro sentence with
`images.length === SCREEN_KINDS.length`. If `SCREEN_KINDS` grows to four and nothing else changes,
every three-image request silently switches to the "You are given: …" intro. The two frozen
strings would still hash the same, but the primary request itself would change. Step 4 points the
comparison at `PRIMARY_SCREEN_KINDS.length`. The frozen-prompt test pins the hash of the whole user
turn for a three-image and a two-image request, not only the two strings.

## Interface Contract

**Deletes:** none.

**Renames:** `KINDS_MATCH_SLOTS` → `A_FREE_KIND_ALWAYS_EXISTS` (`lib/extract/reassignKind.ts:93`). The
semantics change too: `MAX_IMAGES === SCREEN_KINDS.length` becomes `SCREEN_KINDS.length >= MAX_IMAGES`.

**Creates:**
- `PRIMARY_SCREEN_KINDS`, `PrimaryScreenKind` (`lib/extract/constants.ts`)
- `DetailsPrintedSchema`, `DetailsPrinted`, `EstimatedValues` (`lib/schema/detailsPrinted.ts`, pure)
- `DETAILS_SYSTEM_PROMPT`, `DETAILS_SHAPE`, `buildDetailsUserContent` (`lib/llm/prompts/details.ts`)
- `callVisionDetails`, `callVisionDetailsWithFetch` (`lib/llm/vision.ts`)
- `readWorkoutDetails`, `DetailsDeps`, `DetailsReading`, `productionDetailsDeps` (`lib/llm/readDetails.ts`, server-only)
- `fillFromPrinted`, `estimateInputFor`, `applyEstimate`, `mergeWorkoutDetails`, `MergeInput` (`lib/extract/detailsMerge.ts`, pure)
- `JobDeps` (`lib/llm/runExtractionJob.ts`); `RawResponseColumn.details?` exactly as the index's Shared contracts block states, with `printed: DetailsPrinted | null` and `estimate: EstimatedValues | null` (`EstimatedValues` = `{ distanceKm: number | null; splits: boolean }`)
- `distanceIsEstimated`, `splitsAreEstimated` (`lib/review/estimated.ts`, pure)
- `CheckOptions` (`lib/review/checks.ts`); `ReviewContext.estimated: EstimatedValues` (`lib/review/loadReview.ts`)
- npm script `test:live:vision-details`; steps files `features/steps/upload-details.mjs`, `features/steps/review-details.mjs`

**Signature changes:**
- `SCREEN_KINDS`: `['summary','splits','heartrate']` → `['summary','splits','heartrate','details']`. `ScreenKind` widens to four, and `SCREEN_KIND_LABEL` gains `details: 'Workout Details'`.
- `DEFAULT_KIND_BY_INDEX` keeps its value but changes from `satisfies readonly ScreenKind[]` to `satisfies readonly PrimaryScreenKind[]`.
- `PhotoKind` (`lib/db/schema/runs.ts:387`) becomes `'summary' | 'splits' | 'heartrate' | 'details' | 'other'`. This is a type change only: the column is `text`, so there is no migration.
- `PromptImage.kind`, `IMAGE_LABEL`, and `buildRepairRequestText(kinds)` change from `ScreenKind` to `PrimaryScreenKind`.
- `FIELD_SOURCES` changes from `Record<field, readonly ScreenKind[]>` to `Record<field, readonly PrimaryScreenKind[]>`.
- `extractSession(deps, images, kindsPresent: ReadonlySet<PrimaryScreenKind>, budgetMs)`.
- `callVisionRepair[WithFetch]` input `kinds: PrimaryScreenKind[]`.
- `codeForVisionError` (`lib/llm/extract.ts:74`) is now exported.
- `runExtractionJob(input, deps: ExtractDeps = …)` → `runExtractionJob(input, deps: JobDeps = productionJobDeps)`.
- `runAllChecks(draft, options: CheckOptions = { splitsEstimated: false })`, `failingChecks(draft, options)`, `checkDraft(draft, options)`.
- `toRunInput(draft, { source, extractionId, estimated? })`.
- `HeroFields` takes a new required prop `distanceEstimated: boolean`. `SplitsTable` takes a new required prop `estimated: boolean`.
- `attachExtractionPhotos` writes `excludedFromShare: kind === 'details'`.

**Requires (from earlier phases):**
- Phase 1: `lib/extract/chart/estimate.ts` exports `RgbImage`, `ChartEstimateInput`, `EstimatedSplit`, `ChartEstimate`, `estimateFromCharts` (pure, returns `null`, never throws), exactly as the index's Shared contracts block; its final partial row appears only when the 2-decimal remainder is > 0.05 km (a smaller remainder is folded away). `lib/extract/chart/decode.ts` exports `decodeToRgb(Buffer): Promise<RgbImage>` (server-only, sharp), which **throws** on undecodable bytes; `readWorkoutDetails` runs it inside `Promise.allSettled`, so a rejection costs only the pixels (no estimate), never the extraction.
- Phase 1: the seven fixture PNGs are committed under `research/fixtures/workout-details/` with their original names (`2026-11-20-{details,heartrate,splits,summary}.png`, `2026-11-22-{details,heartrate,summary}.png`), and the same seven at the shipped recipe (560 × 1212, JPEG q80, Pillow) under `research/fixtures/workout-details/shipped/<same stem>.jpg`. Reconciled: Step 3's test, Step 9's live test and the Proof all read the committed `shipped/*.jpg` directly, the bytes phase 1 measured, instead of re-encoding the PNGs.
- Phase 2: `NewRunInput.distanceEstimated?: boolean`, `NewRunInput.splitsEstimated?: boolean`. Omitted means `false` in `commitExtractedRun`, and unchanged in `applyRunCorrections`, whose `patch: Partial<Omit<NewRunInput,'splits'|'zones'>>` therefore already accepts both. `RunDetail.distanceEstimated: boolean`, `RunDetail.splitsEstimated: boolean` from `getRunDetail`. The columns `runs.distance_estimated` / `runs.splits_estimated` must exist in the verify run's database: `verify.sh up` applies every `drizzle/*.sql`.

**Leaves alone (owned by others):**
- `lib/extract/chart/*` (Phase 1). This phase consumes only the contract.
- `drizzle/*`, the `runs` table columns, `lib/db/queries/runs.ts`, `lib/records/*`, `app/r/[id]/page.tsx`, `lib/llm/facts.ts`, `lib/llm/factsHash.ts` (Phase 2).
- `EXTRACTION_SYSTEM_PROMPT` and `EXTRACTION_SHAPE`: not one byte changes.
- **Shared file:** `lib/db/schema/runs.ts`. Phase 2 (which this phase depends on) has already inserted 16 lines (the `distanceEstimated` / `splitsEstimated` columns and their doc comments) after base line 215, inside the `runs` table. This phase edits the file as it stands after phase 2: the `extractions.blobUrls` comment (base and post-phase-2 line 132, above the insertion), the `runPhotos.kind` comment (base 335, post-phase-2 ~351) and the `PhotoKind` union (base 387, post-phase-2 ~403). Locate each by its content, not its number; none overlaps phase 2's hunk.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/schema/detailsPrinted.ts` | create | Zod schema for the details reading; `EstimatedValues` |
| `lib/schema/detailsPrinted.test.ts` | create | 0 → null, inverted ranges, defaults |
| `lib/llm/prompts/details.ts` | create | the details system prompt, shape, user turn |
| `lib/llm/vision.ts` | modify (`:4-12`, append after `:237`; `:210`, `:233` types) | `callVisionDetails[WithFetch]`, repair kinds typed `PrimaryScreenKind` |
| `lib/llm/vision.test.ts` | modify (append) | details call: one image, floor 500, own prompt; primary carries frozen prompt |
| `lib/llm/readDetails.ts` | create | the details side: vision + decode in parallel, never throws |
| `lib/llm/readDetails.test.ts` | create | every degrade path |
| `lib/extract/detailsMerge.ts` | create | the pure merge (A1, A2, A7) |
| `tests/extract.detailsMerge.test.ts` | create | merge rules + real-fixture merge for Sunday and Friday (phase 1's committed `shipped/*.jpg`) |
| `lib/extract/constants.ts` | modify (`:14-50`) | `PRIMARY_SCREEN_KINDS`, four `SCREEN_KINDS`, label, defaults typed primary |
| `lib/extract/reassignKind.ts` | modify (`:1-28`, `:61-64`, `:87-93`) | honest inequality, renamed export |
| `lib/extract/planPicked.ts` | modify (`:80-89`, comment only) | totality argument restated |
| `tests/extract.planPicked.test.ts` | modify (`:61-65`, `:163-183`, add one case) | reworked invariants |
| `tests/extract.reassignKind.test.ts` | modify (`:3-4`, `:20-32`, `:150-154`) | inequality, counts 40 / 400 |
| `lib/llm/prompts/extraction.ts` | modify (`:1`, `:112-126`, `:142`, `:168`). **Not** `:42-77`, **not** `:88-110` | types to `PrimaryScreenKind`, intro compares to `PRIMARY_SCREEN_KINDS.length` |
| `lib/llm/prompts/extraction.frozen.test.ts` | create | sha-256 of both strings + user turns vs base |
| `lib/schema/extractedSession.ts` | modify (`:3`, `:201`) | `FIELD_SOURCES` keyed `PrimaryScreenKind` |
| `lib/llm/extract.ts` | modify (`:3-9`, `:73-74`, `:98-103`) | export `codeForVisionError`, primary kinds |
| `lib/llm/extract.test.ts` | modify (`:4`, `:22`) | `PrimaryScreenKind` |
| `tests/live/vision.live.test.ts` | modify (`:19`, `:52`, `:64`) | `PrimaryScreenKind` |
| `lib/llm/runExtractionJob.ts` | rewrite | parallel details side, merge, `RawResponseColumn.details` |
| `lib/llm/runExtractionJob.test.ts` | create | R1.2, R1.3, R2.3, R2.4, concurrency, statuses |
| `lib/db/schema/runs.ts` | modify (post-phase-2 lines: `:132`, ~`:351`, ~`:403`; base `:132`, `:335`, `:387`) | `PhotoKind` gains `details` |
| `lib/db/queries/photos.ts` | modify (`:34-64`) | details photo excluded from share |
| `tests/db.queries.extractions.test.ts` | modify (append inside the photos describe, after `:222`) | exclusion asserted |
| `app/api/upload/route.test.ts` | modify (add after `:143`) | `details` kind minted |
| `components/extract/KindSelector.tsx` | rewrite | 2×2 grid of four kinds |
| `components/extract/KindSelector.test.tsx` | modify | four kinds, Workout Details tap |
| `components/extract/UploadPicker.tsx` | modify (`:284-285`, `:323-327`, `:388-392`) | copy with details |
| `components/extract/UploadPicker.test.tsx` | modify (add in the "fixing a mislabel" describe) | relabel to Workout Details |
| `components/extract/ExtractingSkeleton.tsx` | modify (`:13-35` comment, `:49`, `:66-80`) | honest copy when details present |
| `components/extract/ExtractingSkeleton.test.tsx` | modify (append) | details copy |
| `lib/review/estimated.ts` | create | the one rule for label + flag |
| `tests/review.estimated.test.ts` | create | the rule |
| `lib/review/loadReview.ts` | modify (`:9-16`, `:53-80`, `:96-121`, `:124-150`) | `ReviewContext.estimated` |
| `tests/review.loadReview.test.ts` | modify (`:70-112` fixture, append) | estimated in both modes |
| `lib/review/checks.ts` | modify (`:53-62`, `:249-260`, `:308-311`) | `CheckOptions`, CHK-1 passes on estimates |
| `tests/review.checks.test.ts` | modify (append) | CHK-1/CHK-3 with estimates |
| `lib/review/schema.ts` | modify (`:217-264`) | `toRunInput` passes flags |
| `tests/review.schema.test.ts` | modify (append) | flags passthrough |
| `lib/review/commit.ts` | modify (`:17-26`, `:152-168`) | server-derived flags |
| `tests/review.commit.test.ts` | modify (`:212-251` fixture, add tests) | R4.1, R3.2, edit mode, browser-sent flags ignored |
| `components/review/HeroFields.tsx` | modify (`:36-81`) | distance label |
| `components/review/HeroFields.test.tsx` | modify (`:29-48`, `:87-108`, append) | prop + label tests |
| `components/review/SplitsTable.tsx` | modify (`:34-52`, `:100-105`, `:187-197`, `:202-238`) | splits label, sheet source |
| `components/review/SplitsTable.test.tsx` | modify (`:26-48`, append) | prop + label tests |
| `components/review/ReviewClient.tsx` | modify (`:8-11`, `:62-71`, `:126-156`) | wiring |
| `components/review/ReviewClient.test.tsx` | modify (`:45-67`, `:88-95`, `:108-123`, append) | wiring tests |
| `components/review/ReviewScreen.test.tsx` | modify (`:35-58`) | factory gains `estimated` |
| `tests/live/visionDetails.live.test.ts` | create | live reading of both fixtures |
| `package.json` | modify (after `test:live:vision` line `:69`) | `test:live:vision-details` |
| `docs/architecture.md` | modify (§4.3 `:157-166`, §5 `:172-218`, §6 Records and Insights bullets `:250-266`) | §5 diagram (incl. the `/r/[id]` estimated mark); §4.3 migration `0038`; §6 records exclusion + narrative `session.estimated` (phase 2's doc handoff) |
| `CLAUDE.md` | modify (`:58-66`) | pipeline paragraph |
| `.claude/skills/verify-run-insights/features/README.md` | modify (upload + review rows) | paid calls, new sub-features |
| `.claude/skills/verify-run-insights/features/upload-extract.md` | modify | details sub-feature, driving, gotchas |
| `.claude/skills/verify-run-insights/features/review-commit.md` | modify | estimated labels, flags |
| `.claude/skills/verify-run-insights/features/steps/upload-details.mjs` | create | picker relabel journey |
| `.claude/skills/verify-run-insights/features/steps/review-details.mjs` | create | review labels / distance edit / commit |
| `.claude/skills/verify-run-insights/SKILL.md` | modify (`:138` table) | cost row |
| `.claude/skills/verify-run-insights/scripts/verify.sh` | modify (`:15`, `:423` usage text only) | kinds list |
| `lib/schema/extractionResult.ts` | **no change (verified)** | `ExtractionBlobRefSchema.kind` is `ScreenKindSchema = z.enum(SCREEN_KINDS)` and widens by itself. Max 3 and unique kinds still hold, so at most one `details`. `ExtractionResult.kinds/photos` are `ScreenKind`. The poll consumer (`ExtractionGate`) only refreshes into the review page, so it needs no estimated info. |
| `app/api/upload/route.ts` | **no change (verified)** | `ClientPayload = z.object({ kind: z.enum(SCREEN_KINDS) })` widens by itself |
| `components/ui/PhotoViewer.tsx`, `components/review/ScreenshotStrip.tsx`, `components/share/PhotoInclusionList.tsx`, `app/photo/[kind]/[id]/page.tsx`, `lib/db/queries/sharedRun.ts`, `lib/extract/readExtraction.ts` | **no change (verified)** | All index `SCREEN_KIND_LABEL[kind as ScreenKind] ?? …`, use the `PhotoKind` type, or cast. None is an exhaustive `Record<…>` keyed on the union, so each picks up "Workout Details" from the label map. `sharedRun.ts:127` already filters `excluded_from_share = false`. |

Exhaustiveness check run while planning:
`grep -rnE "Record<(ScreenKind|PhotoKind)|ScreenKind\b|PhotoKind|'heartrate'" --include='*.ts' --include='*.tsx' lib app components scripts tests`.
The only exhaustive `Record` keyed on a kind union is `IMAGE_LABEL`, together with `SCREEN_KIND_LABEL` (which is updated). The remaining hit is `lib/share/types.ts:25`, a doc comment listing the kinds; it is a Handoff.

## Implementation Steps

The order keeps the tree compiling: steps 1–3 add new modules without touching any existing type,
step 4 lands the kind, and its typecheck gate covers steps 1–4. Each step ends with a command that
can fail.

### Step 1: The details reading — schema, prompt, vision call

**File:** `lib/schema/detailsPrinted.ts` (new)
**Code:**
```ts
import { z } from 'zod'

/**
 * What the Workout Details screen PRINTS, as the details vision call transcribes it — and the one
 * place that reply is validated (`lib/llm/readDetails.ts` is the only parser). Everything
 * downstream trusts this type.
 *
 * PURE MODULE. Zod only: the review screen and the merge read these types.
 *
 * ── WHY 0 READS AS null ────────────────────────────────────────────────────────────────────────
 * Apple prints "0'00''/KM" as the pace average when it has no distance (the 2026-11-22 fixture),
 * and the reader transcribes that literally as 0. No duration, pace, distance or heart rate on this
 * screen is ever really zero, so 0 is Apple's "no value" glyph and becomes null here rather than a
 * value that would scale every estimate. Elevation gain is the exception: a flat run prints "Gain: 0M".
 *
 * ── WHY AN INVERTED RANGE NULLS THE PAIR, NOT THE READING ──────────────────────────────────────
 * The pace range is printed slowest–fastest and the HR range low–high. A pair that arrives inverted
 * or equal was misread, and an estimator fed it would scale the whole chart wrongly — so the pair is
 * dropped (no estimate) while the duration, gain and averages, read independently, survive.
 */

/** A printed number in `[min, max]`, or null. `0` reads as null (see above). */
function printedNumber(min: number, max: number, integer: boolean) {
  return z
    .number()
    .nullable()
    .default(null)
    .transform((value) => (value === 0 ? null : value))
    .pipe((integer ? z.number().int() : z.number()).min(min).max(max).nullable())
}

const secPerKm = () => printedNumber(60, 3600, true)
const bpm = () => printedNumber(40, 230, true)

export const DetailsPrintedSchema = z
  .object({
    durationSec: printedNumber(1, 86_400, true),
    distanceKm: printedNumber(0.01, 300, false),
    paceSlowestSecPerKm: secPerKm(),
    paceFastestSecPerKm: secPerKm(),
    avgPaceSecPerKm: secPerKm(),
    hrMinBpm: bpm(),
    hrMaxBpm: bpm(),
    avgHrBpm: bpm(),
    elevationGainM: z.number().int().min(0).max(10_000).nullable().default(null),
  })
  .transform((value) => {
    const out = { ...value }
    if (
      out.paceSlowestSecPerKm !== null &&
      out.paceFastestSecPerKm !== null &&
      !(out.paceSlowestSecPerKm > out.paceFastestSecPerKm)
    ) {
      out.paceSlowestSecPerKm = null
      out.paceFastestSecPerKm = null
    }
    if (out.hrMinBpm !== null && out.hrMaxBpm !== null && !(out.hrMinBpm < out.hrMaxBpm)) {
      out.hrMinBpm = null
      out.hrMaxBpm = null
    }
    return out
  })

export type DetailsPrinted = z.infer<typeof DetailsPrintedSchema>

/**
 * Which of an extraction's values were measured off the pace chart rather than read off a screen.
 * Stored as `extractions.raw_response.details.estimate`, carried as `ReviewContext.estimated`.
 *
 *  - `distanceKm`: the estimated distance that was written into the parsed session, else null
 *    (null also when the distance was transcribed and the estimate only scaled the splits to it).
 *  - `splits`: true when the parsed session's splits are chart estimates.
 */
export interface EstimatedValues {
  distanceKm: number | null
  splits: boolean
}
```

**File:** `lib/schema/detailsPrinted.test.ts` (new)
**Code:**
```ts
import { describe, expect, it } from 'vitest'

import { DetailsPrintedSchema } from './detailsPrinted'

const SUNDAY = {
  durationSec: 3046,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}

describe('DetailsPrintedSchema — the details reading, validated once', () => {
  it('accepts the 2026-11-22 reading as printed', () => {
    expect(DetailsPrintedSchema.parse(SUNDAY)).toEqual(SUNDAY)
  })

  it('reads Apple’s 0’00’’ average (transcribed as 0) as null, not as a pace', () => {
    expect(DetailsPrintedSchema.parse({ ...SUNDAY, avgPaceSecPerKm: 0 }).avgPaceSecPerKm).toBeNull()
    expect(DetailsPrintedSchema.parse({ ...SUNDAY, durationSec: 0 }).durationSec).toBeNull()
  })

  it('keeps a real zero elevation gain', () => {
    expect(DetailsPrintedSchema.parse({ ...SUNDAY, elevationGainM: 0 }).elevationGainM).toBe(0)
  })

  it('defaults every omitted field to null — the vendor drops keys', () => {
    expect(DetailsPrintedSchema.parse({})).toEqual({
      durationSec: null,
      distanceKm: null,
      paceSlowestSecPerKm: null,
      paceFastestSecPerKm: null,
      avgPaceSecPerKm: null,
      hrMinBpm: null,
      hrMaxBpm: null,
      avgHrBpm: null,
      elevationGainM: null,
    })
  })

  it('drops an inverted pace pair but keeps everything else', () => {
    const out = DetailsPrintedSchema.parse({
      ...SUNDAY,
      paceSlowestSecPerKm: 407,
      paceFastestSecPerKm: 552,
    })
    expect(out.paceSlowestSecPerKm).toBeNull()
    expect(out.paceFastestSecPerKm).toBeNull()
    expect(out.durationSec).toBe(3046)
    expect(out.hrMinBpm).toBe(116)
  })

  it('drops an HR pair whose low is not below its high', () => {
    const out = DetailsPrintedSchema.parse({ ...SUNDAY, hrMinBpm: 177, hrMaxBpm: 177 })
    expect(out.hrMinBpm).toBeNull()
    expect(out.hrMaxBpm).toBeNull()
  })

  it('refuses a value that is not a number at all — the whole reading fails', () => {
    expect(DetailsPrintedSchema.safeParse({ ...SUNDAY, paceSlowestSecPerKm: "9'12''" }).success).toBe(
      false,
    )
  })

  it('refuses a pace outside one minute to one hour per km', () => {
    expect(DetailsPrintedSchema.safeParse({ ...SUNDAY, paceFastestSecPerKm: 12 }).success).toBe(false)
  })
})
```

**File:** `lib/llm/prompts/details.ts` (new)
**Code:**
```ts
import type { VisionContentPart } from './extraction'

/**
 * The Workout Details screen's OWN prompt — deliberately not a rule appended to
 * `EXTRACTION_SYSTEM_PROMPT`, whose rules 1–7 and SHAPE scored 108/108 and are byte-frozen (a hash
 * test pins them). This screen is read by a separate one-image call that runs in parallel with the
 * primary call (`lib/llm/runExtractionJob.ts`), so the proven request is untouched by construction.
 *
 * It transcribes PRINTED TEXT ONLY. The charts' shapes are measured by deterministic code
 * (`lib/extract/chart/*`); a model asked to read a value off a bar's height would be computing,
 * which this repo does not let a model do.
 *
 * The worked examples use numbers that appear on NEITHER committed fixture (2026-11-20,
 * 2026-11-22), so the live test cannot pass by the model copying an example.
 */
export const DETAILS_SYSTEM_PROMPT = `You transcribe ONE Apple Fitness "Workout Details" screenshot into JSON. The screen is titled
"Workout Details" and shows small charts stacked under each other: Elevation, Heart Rate, Pace
and sometimes Cadence, each with a time axis underneath.

RULES — these matter more than anything else:
1. Transcribe ONLY numbers that are literally printed as text. Never read a value off the shape
   or height of a chart, never compute, never estimate. If a value is not printed, use null.
2. Apple uses a COMMA as the decimal separator: "6,04KM" is 6.04.
3. durationSec is the workout length printed at the RIGHT end of a chart's time axis (the LEFT
   end reads 0:00:00). It is H:MM:SS: "1:02:15" -> 3735. Every chart's axis prints the same value.
4. A pace "7'05''/KM" (Apple may draw '' or ") means 7 min 5 s per km -> 425 seconds per km.
5. The Pace chart prints its range at the top right as SLOWEST–FASTEST, for example
   "8'40''–5'58''/KM": paceSlowestSecPerKm is the LEFT value (520) and paceFastestSecPerKm is
   the RIGHT value (358). Copy them in printed order.
6. The Pace chart's "Average: ...''/KM" is avgPaceSecPerKm. Apple prints "0'00''" or "--'--''"
   when it has no value: that is null, never 0.
7. The Heart Rate chart prints "Average: ...BPM" (avgHrBpm) and its range at the top right, for
   example "98–181BPM": hrMinBpm is the LEFT value (98) and hrMaxBpm is the RIGHT value (181).
8. The Elevation chart prints "Gain: ...M" (elevationGainM, in metres). Ignore its range ("4–7M").
9. distanceKm only when a distance is printed as a number followed by KM, outside the pace
   figures. Most Workout Details screens print no distance: then it is null.
10. Ignore the Cadence chart and the map.

Return ONLY a JSON object. No markdown fences, no commentary, no text before or after the
JSON object.`

export const DETAILS_SHAPE = `{
  "durationSec": number|null,          // time-axis end label, 1:02:15 -> 3735
  "distanceKm": number|null,           // only if a distance is printed, 6,04KM -> 6.04
  "paceSlowestSecPerKm": number|null,  // pace range LEFT value, 8'40'' -> 520
  "paceFastestSecPerKm": number|null,  // pace range RIGHT value, 5'58'' -> 358
  "avgPaceSecPerKm": number|null,      // "Average: 7'05''/KM" -> 425; 0'00'' -> null
  "hrMinBpm": number|null,             // heart-rate range LEFT value
  "hrMaxBpm": number|null,             // heart-rate range RIGHT value
  "avgHrBpm": number|null,             // "Average: 158BPM" -> 158
  "elevationGainM": number|null        // "Gain: 12M" -> 12
}`

/** One labelled image, then the request — the primary prompt's ordering, for one screen. */
export function buildDetailsUserContent(dataUri: string): VisionContentPart[] {
  return [
    { type: 'text', text: 'IMAGE — WORKOUT DETAILS screen:' },
    { type: 'image_url', image_url: { url: dataUri } },
    {
      type: 'text',
      text: `This is the Workout Details screen of ONE running workout.\n\nReturn one JSON object with exactly this shape:\n${DETAILS_SHAPE}`,
    },
  ]
}
```

**File:** `lib/llm/vision.ts`
- **`:5-12`**, the import block from `./prompts/extraction`: leave it as it is and add a second import directly below it:
```ts
import { DETAILS_SYSTEM_PROMPT, buildDetailsUserContent } from './prompts/details'
```
- **After `:237`** (end of file), append:
```ts
/**
 * The Workout Details screen's printed numbers — ONE image, so the token floor is
 * `TOKEN_FLOOR_PER_IMAGE × 1`. The floor matters as much here as on the primary call: a dropped
 * image would come back as an invented pace range, and the pace range scales every estimated split.
 */
export function callVisionDetailsWithFetch(
  fetchImpl: FetchLike,
  image: { dataUri: string },
  opts: { timeoutMs: number },
): Promise<VisionResult> {
  return callVisionWithFetch(
    fetchImpl,
    [
      { role: 'system', content: DETAILS_SYSTEM_PROMPT },
      { role: 'user', content: buildDetailsUserContent(image.dataUri) },
    ],
    { timeoutMs: opts.timeoutMs, imageCount: 1 },
  )
}

export function callVisionDetails(
  image: { dataUri: string },
  opts: { timeoutMs: number },
): Promise<VisionResult> {
  return callVisionDetailsWithFetch(fetch, image, opts)
}
```

**File:** `lib/llm/vision.test.ts`
- **`:5-11`**: add `callVisionDetailsWithFetch` to the import list from `./vision`, and add these two new imports below it:
```ts
import { createHash } from 'node:crypto'
import { DETAILS_SYSTEM_PROMPT } from './prompts/details'
```
- Append at the end of the file:
```ts
describe('the Workout Details call', () => {
  const DETAILS = { dataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==' }

  it('trips the floor at 500 for its ONE image — the measured drop signature never parses', async () => {
    const doFetch = fakeFetch(DROPPED_IMAGE_RESPONSE)
    const error = await callVisionDetailsWithFetch(doFetch, DETAILS, { timeoutMs: 5_000 }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(VisionTokenFloorError)
    expect((error as VisionTokenFloorError).imageCount).toBe(1)
  })

  it('passes at exactly the one-image floor', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: TOKEN_FLOOR_PER_IMAGE, completion_tokens: 2 },
    })
    const result = await callVisionDetailsWithFetch(doFetch, DETAILS, { timeoutMs: 5_000 })
    expect(result.promptTokens).toBe(TOKEN_FLOOR_PER_IMAGE)
  })

  it('sends its own prompt and exactly one image — never the frozen extraction prompt', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1100, completion_tokens: 2 },
    })
    await callVisionDetailsWithFetch(doFetch, DETAILS, { timeoutMs: 5_000 })
    const body = JSON.parse(String(doFetch.mock.calls[0]![1]!.body)) as {
      messages: Array<{ role: string; content: unknown }>
    }
    expect(body.messages[0]).toEqual({ role: 'system', content: DETAILS_SYSTEM_PROMPT })
    const parts = body.messages[1]!.content as Array<{ type: string }>
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(1)
  })
})

describe('the primary request carries the frozen prompt (R1.3)', () => {
  it('sends EXTRACTION_SYSTEM_PROMPT byte for byte — the same sha-256 as origin/main @ 7e285b3', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: VALID_EXTRACTION_JSON }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3277, completion_tokens: 940 },
    })
    await callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })
    const body = JSON.parse(String(doFetch.mock.calls[0]![1]!.body)) as {
      messages: Array<{ role: string; content: unknown }>
    }
    const system = body.messages[0]!.content as string
    expect(createHash('sha256').update(system, 'utf8').digest('hex')).toBe(
      '23c82197c6ae148b42a9a3a157ba505431d33da01a6e75a0d17d995868633411',
    )
    const parts = body.messages[1]!.content as Array<{ type: string; text?: string }>
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(3)
    expect(parts.some((p) => p.text?.includes('WORKOUT DETAILS'))).toBe(false)
  })
})
```
**Impact:** additive only. `npx vitest run lib/schema/detailsPrinted.test.ts lib/llm/vision.test.ts` passes.

### Step 2: The details side of the job — `readWorkoutDetails`

**File:** `lib/llm/extract.ts:73-74`. Change `function codeForVisionError(` to `export function codeForVisionError(`. Nothing else in this step.

**File:** `lib/llm/readDetails.ts` (new)
**Code:**
```ts
import 'server-only'

import { PRIMARY_TIMEOUT_MS, type ExtractionErrorCode } from '@/lib/extract/constants'
import { decodeToRgb } from '@/lib/extract/chart/decode'
import type { RgbImage } from '@/lib/extract/chart/estimate'
import { DetailsPrintedSchema, type DetailsPrinted } from '@/lib/schema/detailsPrinted'
import { codeForVisionError } from './extract'
import { extractJsonObject } from './extractJson'
import { callVisionDetails, VisionTokenFloorError } from './vision'

/**
 * The details half of the extraction job: ONE `glm-4.6v` call for the Workout Details screen's
 * printed numbers, and the pixel decode the chart estimator needs, side by side.
 *
 * THE CONTRACT: this NEVER throws and never decides the extraction's status. Every failure —
 * transport, timeout, token floor, a reply Zod refuses, a JPEG sharp cannot decode, even an error
 * nobody anticipated — degrades to "no printed values" and/or "no pixels", and the caller simply
 * makes no estimate (invariant 4, R2.4). The extraction's other screens are never at stake here.
 *
 * No repair round-trip, by ruling: the reply is ~10 numbers, and a reading the schema refuses is
 * worth less than the 60 s ceiling it would cost.
 */

export interface DetailsDeps {
  callDetails: typeof callVisionDetails
  decode: typeof decodeToRgb
}

export const productionDetailsDeps: DetailsDeps = {
  callDetails: callVisionDetails,
  decode: decodeToRgb,
}

export interface DetailsReading {
  /** The details call's raw body, for `raw_response.details.vendor`. null when there was none. */
  vendor: unknown
  /** Validated printed values; null when the reading failed in any way. */
  printed: DetailsPrinted | null
  /** The decoded screenshot; null when the decode failed. */
  image: RgbImage | null
  promptTokens: number | null
  /** Why `printed` is null. null when the reading succeeded. */
  errorCode: ExtractionErrorCode | null
}

export async function readWorkoutDetails(
  deps: DetailsDeps,
  image: { dataUri: string; bytes: Buffer },
  budgetMs: number,
): Promise<DetailsReading> {
  // Both started through `.then` so a SYNCHRONOUS throw in either lands in allSettled too.
  const [vision, decoded] = await Promise.allSettled([
    Promise.resolve().then(() =>
      deps.callDetails(
        { dataUri: image.dataUri },
        { timeoutMs: Math.max(1, Math.min(PRIMARY_TIMEOUT_MS, budgetMs)) },
      ),
    ),
    Promise.resolve().then(() => deps.decode(image.bytes)),
  ])

  const rgb = decoded.status === 'fulfilled' ? decoded.value : null
  if (decoded.status === 'rejected') {
    console.warn('[f04] workout details decode failed; no estimate', { cause: decoded.reason })
  }

  if (vision.status === 'rejected') {
    const cause: unknown = vision.reason
    const errorCode = codeForVisionError(cause) ?? 'transport'
    const promptTokens = cause instanceof VisionTokenFloorError ? cause.promptTokens : null
    console.warn('[f04] workout details reading failed; no estimate', { errorCode, promptTokens })
    return { vendor: null, printed: null, image: rgb, promptTokens, errorCode }
  }

  const result = vision.value
  const json = extractJsonObject(result.text)
  const parsed = json === null ? null : DetailsPrintedSchema.safeParse(json)
  if (!parsed?.success) {
    console.warn('[f04] workout details reply refused by the schema; no estimate')
    return {
      vendor: result.raw,
      printed: null,
      image: rgb,
      promptTokens: result.promptTokens,
      errorCode: 'validation',
    }
  }
  return {
    vendor: result.raw,
    printed: parsed.data,
    image: rgb,
    promptTokens: result.promptTokens,
    errorCode: null,
  }
}
```

**File:** `lib/llm/readDetails.test.ts` (new)
**Code:**
```ts
import { describe, expect, it, vi } from 'vitest'

import { PRIMARY_TIMEOUT_MS } from '@/lib/extract/constants'
import type { RgbImage } from '@/lib/extract/chart/estimate'
import { readWorkoutDetails, type DetailsDeps } from './readDetails'
import { VisionTokenFloorError, VisionTransportError, type VisionResult } from './vision'

const IMAGE = { dataUri: 'data:image/jpeg;base64,/9j/', bytes: Buffer.from([0xff, 0xd8]) }
const RGB: RgbImage = { width: 1, height: 1, data: new Uint8Array([0, 0, 0]) }
const PRINTED = {
  durationSec: 3046,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}

function result(text: string, promptTokens = 1100): VisionResult {
  return {
    text,
    promptTokens,
    completionTokens: 90,
    finishReason: 'stop',
    raw: { choices: [{ message: { content: text } }], usage: { prompt_tokens: promptTokens } },
  }
}

function deps(over: Partial<DetailsDeps> = {}): DetailsDeps {
  return {
    callDetails: vi.fn(async () => result(JSON.stringify(PRINTED))),
    decode: vi.fn(async () => RGB),
    ...over,
  }
}

describe('readWorkoutDetails — the details side never throws', () => {
  it('returns the validated printed values and the decoded pixels', async () => {
    const reading = await readWorkoutDetails(deps(), IMAGE, 40_000)
    expect(reading.printed).toEqual(PRINTED)
    expect(reading.image).toBe(RGB)
    expect(reading.errorCode).toBeNull()
    expect(reading.promptTokens).toBe(1100)
    expect(reading.vendor).toMatchObject({ usage: { prompt_tokens: 1100 } })
  })

  it('sends one image with a timeout capped by the budget, and by the primary timeout', async () => {
    const d = deps()
    await readWorkoutDetails(d, IMAGE, 20_000)
    expect(d.callDetails).toHaveBeenCalledWith({ dataUri: IMAGE.dataUri }, { timeoutMs: 20_000 })
    await readWorkoutDetails(d, IMAGE, 90_000)
    expect(d.callDetails).toHaveBeenLastCalledWith(
      { dataUri: IMAGE.dataUri },
      { timeoutMs: PRIMARY_TIMEOUT_MS },
    )
  })

  it('a token-floor trip is no reading, with the canary kept', async () => {
    const reading = await readWorkoutDetails(
      deps({ callDetails: vi.fn(async () => Promise.reject(new VisionTokenFloorError(141, 1))) }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'token_floor', promptTokens: 141 })
    expect(reading.image).toBe(RGB)
  })

  it('a timeout is no reading, coded timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const reading = await readWorkoutDetails(
      deps({
        callDetails: vi.fn(async () =>
          Promise.reject(new VisionTransportError('vision request failed or timed out', timeout)),
        ),
      }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'timeout' })
  })

  it('a reply the schema refuses is no reading, coded validation, raw body kept', async () => {
    const reading = await readWorkoutDetails(
      deps({ callDetails: vi.fn(async () => result('{"durationSec":"fifty minutes"}')) }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'validation' })
    expect(reading.vendor).not.toBeNull()
  })

  it('a reply with no JSON at all is no reading', async () => {
    const reading = await readWorkoutDetails(
      deps({ callDetails: vi.fn(async () => result('I cannot read this screen.')) }),
      IMAGE,
      40_000,
    )
    expect(reading.errorCode).toBe('validation')
  })

  it('a decode failure keeps the reading and loses only the pixels', async () => {
    const reading = await readWorkoutDetails(
      deps({ decode: vi.fn(async () => Promise.reject(new Error('unsupported image format'))) }),
      IMAGE,
      40_000,
    )
    expect(reading.printed).toEqual(PRINTED)
    expect(reading.image).toBeNull()
  })

  it('an unexpected error, even a synchronous throw, degrades to transport', async () => {
    const reading = await readWorkoutDetails(
      deps({
        callDetails: (() => {
          throw new TypeError('boom')
        }) as unknown as DetailsDeps['callDetails'],
      }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'transport' })
  })
})
```
**Impact:** additive. `npx vitest run lib/llm/readDetails.test.ts` passes.

### Step 3: The pure merge — `lib/extract/detailsMerge.ts`

**File:** `lib/extract/detailsMerge.ts` (new)
**Code:**
```ts
import {
  estimateFromCharts,
  type ChartEstimate,
  type ChartEstimateInput,
  type EstimatedSplit,
  type RgbImage,
} from '@/lib/extract/chart/estimate'
import type { DetailsPrinted, EstimatedValues } from '@/lib/schema/detailsPrinted'
import { RawExtractedSession, type ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * How a Workout Details reading and its chart estimate enter an extraction's parsed session.
 *
 * PURE MODULE — no I/O, no `server-only`. The rules are the analysis's assumptions, in order:
 *
 *  - A7  Values the details screen PRINTS that another screen also prints (duration, distance,
 *        elevation gain, average HR, average pace) only fill a null the other screens left.
 *  - A1  A SPLITS screenshot wins outright: no estimate is even attempted (R1.2).
 *  - A2  A transcribed distance (Summary, or printed on the details screen) is handed to the
 *        estimator as `knownDistanceKm`, which scales its splits to it; the distance is then not
 *        estimated, the splits are.
 *        Otherwise the estimated distance fills the null `distanceKm` (R2.3).
 *  - Estimated splits fill an EMPTY splits array only.
 *
 * Every number written here was produced by `lib/extract/chart/*` or transcribed from a screen;
 * nothing is computed by a model (invariant 3).
 */

export interface MergeInput {
  session: ExtractedSession
  printed: DetailsPrinted | null
  image: RgbImage | null
  /** From OUR upload records: was a `splits` screenshot part of this extraction? */
  hasSplitsScreen: boolean
}

interface Merged {
  session: ExtractedSession
  estimate: EstimatedValues | null
}

/** A7: printed values fill nulls only. Returns a fresh session; arrays are copied. */
export function fillFromPrinted(
  session: ExtractedSession,
  printed: DetailsPrinted | null,
): ExtractedSession {
  const out: ExtractedSession = {
    ...session,
    splits: session.splits.map((s) => ({ ...s })),
    hrZones: session.hrZones.map((z) => ({ ...z })),
    postWorkoutHr: session.postWorkoutHr.map((p) => ({ ...p })),
  }
  if (printed === null) return out
  out.durationSec ??= printed.durationSec
  out.distanceKm ??= printed.distanceKm
  out.elevationGainM ??= printed.elevationGainM
  out.avgHrBpm ??= printed.avgHrBpm
  out.avgPaceSecPerKm ??= printed.avgPaceSecPerKm
  return out
}

/**
 * The estimator's input, or null when no estimate may or can be made: a splits screenshot exists
 * (A1), the reading failed, or the duration or the printed pace range is missing (R2.4).
 *
 * The duration prefers the details screen's own figure — it is the end label of the very time axis
 * the chart spans — and falls back to the Summary's.
 */
export function estimateInputFor(
  session: ExtractedSession,
  printed: DetailsPrinted | null,
  hasSplitsScreen: boolean,
): ChartEstimateInput | null {
  if (hasSplitsScreen || printed === null) return null
  const durationSec = printed.durationSec ?? session.durationSec
  const { paceSlowestSecPerKm, paceFastestSecPerKm } = printed
  if (durationSec === null || paceSlowestSecPerKm === null || paceFastestSecPerKm === null) {
    return null
  }
  return {
    durationSec,
    paceSlowestSecPerKm,
    paceFastestSecPerKm,
    hrMinBpm: printed.hrMinBpm,
    hrMaxBpm: printed.hrMaxBpm,
    knownDistanceKm: session.distanceKm,
  }
}

/**
 * The estimator's rows in the stored split shape: integer seconds, an HR outside the schema's
 * 40–230 band dropped to null, cadence null. Any unusable row voids the whole table — a table with a
 * hole is worse than none, and the reviewer can still type rows by hand.
 */
function toExtractedSplits(rows: readonly EstimatedSplit[]): ExtractedSession['splits'] {
  const out = rows.map((row) => {
    const hr = row.hrBpm === null ? null : Math.round(row.hrBpm)
    return {
      km: row.km,
      timeSec: Math.round(row.timeSec),
      paceSecPerKm: Math.round(row.paceSecPerKm),
      hrBpm: hr !== null && hr >= 40 && hr <= 230 ? hr : null,
      cadenceSpm: null,
      partial: row.partial,
    }
  })
  const usable = out.every(
    (r) => Number.isInteger(r.km) && r.km > 0 && r.timeSec > 0 && r.paceSecPerKm > 0,
  )
  return usable ? out : []
}

/** A2 + R2.3: write the estimate into the empty slots, and record exactly what was written. */
export function applyEstimate(session: ExtractedSession, estimate: ChartEstimate | null): Merged {
  if (estimate === null) return { session, estimate: null }
  const out: ExtractedSession = { ...session }

  let distanceKm: number | null = null
  if (out.distanceKm === null && estimate.distanceWasEstimated) {
    out.distanceKm = estimate.distanceKm
    distanceKm = estimate.distanceKm
  }

  let splits = false
  if (out.splits.length === 0) {
    const rows = toExtractedSplits(estimate.splits)
    if (rows.length > 0) {
      out.splits = rows
      splits = true
    }
  }

  if (distanceKm === null && !splits) return { session: out, estimate: null }
  return { session: out, estimate: { distanceKm, splits } }
}

/**
 * The whole merge. The result is re-checked against the session schema — the review screen and
 * `GET /api/extract/[id]` read `parsedSession` as already validated — and an estimate the schema
 * refuses is dropped rather than stored (invariant 4: never the reason an extraction is worse).
 */
export function mergeWorkoutDetails(input: MergeInput): Merged {
  const filled = fillFromPrinted(input.session, input.printed)
  const chartInput = estimateInputFor(filled, input.printed, input.hasSplitsScreen)
  const chart = input.image !== null && chartInput !== null ? estimateFromCharts(input.image, chartInput) : null
  const merged = applyEstimate(filled, chart)
  if (RawExtractedSession.safeParse(merged.session).success) return merged
  return RawExtractedSession.safeParse(filled).success
    ? { session: filled, estimate: null }
    : { session: input.session, estimate: null }
}
```

**File:** `tests/extract.detailsMerge.test.ts` (new)
**Code:**
```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import { decodeToRgb } from '@/lib/extract/chart/decode'
import type { ChartEstimate } from '@/lib/extract/chart/estimate'
import {
  applyEstimate,
  estimateInputFor,
  fillFromPrinted,
  mergeWorkoutDetails,
} from '@/lib/extract/detailsMerge'
import type { DetailsPrinted } from '@/lib/schema/detailsPrinted'
import { RawExtractedSession, type ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * Phase 1's committed shipped-recipe JPEGs (560 × 1212, q80): the exact bytes its estimator was
 * measured on (research/fixtures/workout-details/README.md).
 */
const WORKOUT_DETAILS_FIXTURE_DIR = 'research/fixtures/workout-details/shipped'

const SUNDAY_PRINTED: DetailsPrinted = {
  durationSec: 3046,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}
const FRIDAY_PRINTED: DetailsPrinted = {
  durationSec: 2773,
  distanceKm: null,
  paceSlowestSecPerKm: 497,
  paceFastestSecPerKm: 365,
  avgPaceSecPerKm: 459,
  hrMinBpm: 101,
  hrMaxBpm: 186,
  avgHrBpm: 169,
  elevationGainM: 6,
}

/** A session the way a summary + heart-rate read leaves it: no splits screen, so no splits. */
function summaryOnly(over: Partial<ExtractedSession> = {}): ExtractedSession {
  return { ...(JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession), splits: [], ...over }
}

const ESTIMATE: ChartEstimate = {
  distanceKm: 6.1,
  distanceWasEstimated: true,
  slotCount: 90,
  splits: [
    { km: 1, timeSec: 494.4, paceSecPerKm: 494.4, hrBpm: 141.6, cadenceSpm: null, partial: false },
    { km: 2, timeSec: 496, paceSecPerKm: 496, hrBpm: 300, cadenceSpm: null, partial: false },
    { km: 3, timeSec: 46, paceSecPerKm: 460, hrBpm: null, cadenceSpm: null, partial: true },
  ],
}

function shippedRgb(file: string) {
  return decodeToRgb(readFileSync(path.join(WORKOUT_DETAILS_FIXTURE_DIR, file)))
}

describe('fillFromPrinted — A7, printed values fill nulls only', () => {
  it('never overwrites a value another screen transcribed', () => {
    const out = fillFromPrinted(summaryOnly({ durationSec: 3040, avgHrBpm: 160 }), SUNDAY_PRINTED)
    expect(out.durationSec).toBe(3040)
    expect(out.avgHrBpm).toBe(160)
  })

  it('fills what the other screens left null', () => {
    const out = fillFromPrinted(
      summaryOnly({ durationSec: null, elevationGainM: null, avgPaceSecPerKm: null }),
      FRIDAY_PRINTED,
    )
    expect(out.durationSec).toBe(2773)
    expect(out.elevationGainM).toBe(6)
    expect(out.avgPaceSecPerKm).toBe(459)
  })

  it('does not alias the input arrays', () => {
    const input = summaryOnly()
    const out = fillFromPrinted(input, null)
    expect(out.hrZones).not.toBe(input.hrZones)
    expect(out).toEqual(input)
  })
})

describe('estimateInputFor — when an estimate may be made', () => {
  it('never with a splits screenshot: the real table wins (A1, R1.2)', () => {
    expect(estimateInputFor(summaryOnly(), SUNDAY_PRINTED, true)).toBeNull()
  })

  it('never without the printed pace range (R2.4)', () => {
    expect(
      estimateInputFor(summaryOnly(), { ...SUNDAY_PRINTED, paceSlowestSecPerKm: null }, false),
    ).toBeNull()
    expect(estimateInputFor(summaryOnly(), null, false)).toBeNull()
  })

  it('never without any duration', () => {
    expect(
      estimateInputFor(summaryOnly({ durationSec: null }), { ...SUNDAY_PRINTED, durationSec: null }, false),
    ).toBeNull()
  })

  it('prefers the chart axis duration and hands over a transcribed distance (A2)', () => {
    expect(
      estimateInputFor(summaryOnly({ durationSec: 3040, distanceKm: 6.04 }), SUNDAY_PRINTED, false),
    ).toEqual({
      durationSec: 3046,
      paceSlowestSecPerKm: 552,
      paceFastestSecPerKm: 407,
      hrMinBpm: 116,
      hrMaxBpm: 177,
      knownDistanceKm: 6.04,
    })
  })
})

describe('applyEstimate — what an estimate is allowed to write', () => {
  it('fills a null distance and empty splits, and records both (R2.3)', () => {
    const { session, estimate } = applyEstimate(summaryOnly({ distanceKm: null }), ESTIMATE)
    expect(session.distanceKm).toBe(6.1)
    expect(session.splits.map((s) => s.timeSec)).toEqual([494, 496, 46])
    expect(session.splits[0]!.hrBpm).toBe(142)
    expect(session.splits[1]!.hrBpm).toBeNull() // 300 bpm is outside the schema's band
    expect(session.splits.every((s) => s.cadenceSpm === null)).toBe(true)
    expect(estimate).toEqual({ distanceKm: 6.1, splits: true })
  })

  it('leaves a transcribed distance alone: splits estimated, distance not (A2)', () => {
    const { session, estimate } = applyEstimate(summaryOnly({ distanceKm: 6.04 }), {
      ...ESTIMATE,
      distanceKm: 6.04,
      distanceWasEstimated: false,
    })
    expect(session.distanceKm).toBe(6.04)
    expect(estimate).toEqual({ distanceKm: null, splits: true })
  })

  it('never replaces a split table that exists', () => {
    const withSplits = summaryOnly({
      distanceKm: null,
      splits: (JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession).splits,
    })
    const { session, estimate } = applyEstimate(withSplits, ESTIMATE)
    expect(session.splits).toEqual(withSplits.splits)
    expect(estimate).toEqual({ distanceKm: 6.1, splits: false })
  })

  it('records nothing when there was no estimate', () => {
    expect(applyEstimate(summaryOnly(), null).estimate).toBeNull()
  })
})

describe('mergeWorkoutDetails — on the real fixtures, phase 1’s committed 560 px q80 JPEGs', () => {
  it('2026-11-22 (no distance, no table): ~6.1 km and six full estimated kilometres', async () => {
    const image = await shippedRgb('2026-11-22-details.jpg')
    const { session, estimate } = mergeWorkoutDetails({
      session: summaryOnly({ distanceKm: null, avgPaceSecPerKm: null, durationSec: 3046 }),
      printed: SUNDAY_PRINTED,
      image,
      hasSplitsScreen: false,
    })
    expect(session.distanceKm).toBeGreaterThanOrEqual(5.9)
    expect(session.distanceKm).toBeLessThanOrEqual(6.3)
    expect(session.splits.filter((s) => !s.partial)).toHaveLength(6)
    expect(estimate).toEqual({ distanceKm: session.distanceKm, splits: true })
    expect(RawExtractedSession.safeParse(session).success).toBe(true)
  })

  it('2026-11-20 (Summary printed 6.04 km): distance kept, splits scaled to it', async () => {
    const image = await shippedRgb('2026-11-20-details.jpg')
    const { session, estimate } = mergeWorkoutDetails({
      session: summaryOnly({ distanceKm: 6.04, durationSec: 2773 }),
      printed: FRIDAY_PRINTED,
      image,
      hasSplitsScreen: false,
    })
    expect(session.distanceKm).toBe(6.04)
    expect(estimate).toEqual({ distanceKm: null, splits: true })
    // The 0.04 km remainder is below CHK-4's > 0.05 km partial rule, so phase 1 folds it away:
    // six full rows, no partial, summing to the duration less that remainder's ~18 s.
    expect(session.splits.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6])
    expect(session.splits.some((s) => s.partial)).toBe(false)
    const total = session.splits.reduce((sum, s) => sum + s.timeSec, 0)
    expect(total).toBeGreaterThanOrEqual(2773 - 25)
    expect(total).toBeLessThan(2773)
  })

  it('a screenshot with no pace chart estimates nothing and keeps the printed fill (R2.4)', async () => {
    // Phase 1's exit criterion pins `null` for exactly this non-details image.
    const image = await shippedRgb('2026-11-20-summary.jpg')
    const { session, estimate } = mergeWorkoutDetails({
      session: summaryOnly({ distanceKm: null, elevationGainM: null }),
      printed: SUNDAY_PRINTED,
      image,
      hasSplitsScreen: false,
    })
    expect(estimate).toBeNull()
    expect(session.distanceKm).toBeNull()
    expect(session.splits).toEqual([])
    expect(session.elevationGainM).toBe(4)
  })
})
```
**Impact:** additive. `npx vitest run tests/extract.detailsMerge.test.ts` passes. It needs phase 1's estimator and fixtures to be present.

### Step 4: The kind lands, the prompt stays frozen, and the job reads the details screen

One unit, because widening `ScreenKind` breaks `IMAGE_LABEL`, `runExtractionJob` and `PhotoKind`
consumers until all of them move together.

**File:** `lib/extract/constants.ts:14-50`. Replace from the `/* ── The three screens` banner through the end of `DEFAULT_KIND_BY_INDEX` with:
```ts
/* ── The screens ─────────────────────────────────────────────────────────────────────────── */

/**
 * The three screens the extraction prompt was MEASURED on (108/108, `research/run-extract.mjs`).
 * `lib/llm/prompts/extraction.ts` keys its image labels, `PromptImage` and the repair text on this,
 * and `FIELD_SOURCES` its provenance table — so a fourth kind can never be typed into the primary
 * request. Do not add to it without re-running the scorer.
 */
export const PRIMARY_SCREEN_KINDS = ['summary', 'splits', 'heartrate'] as const
export type PrimaryScreenKind = (typeof PRIMARY_SCREEN_KINDS)[number]

/**
 * Every screen kind a runner can upload. `details` is Apple's "Workout Details" screen, the stand-in
 * for a missing splits table: it is read by its own one-image call (`lib/llm/prompts/details.ts`) and
 * its charts are measured by `lib/extract/chart/*`; it never joins the primary request.
 * `run_photos.kind` also allows `'other'` (roadmap §4.3); F04 never produces it.
 */
export const SCREEN_KINDS = [...PRIMARY_SCREEN_KINDS, 'details'] as const
export type ScreenKind = (typeof SCREEN_KINDS)[number]

/** Human labels. One place, so the picker and the review strip cannot drift. */
export const SCREEN_KIND_LABEL: Record<ScreenKind, string> = {
  summary: 'Summary',
  splits: 'Splits',
  heartrate: 'Heart rate',
  details: 'Workout Details',
}

/**
 * Default kind by pick order — 1st Heart rate, 2nd Splits, 3rd Summary. That is the order the
 * runner's device hands the files over in, which is the only order that matters here: the picker
 * always lets the runner override it before submitting (plan §5.3), but a default that is never
 * right means three manual re-picks on every single upload.
 *
 * **Deliberately its own literal, not `SCREEN_KINDS`.** It was an alias until F29, justified as
 * "the order the screens appear in the iOS Fitness app itself" — the same false premise F16 had
 * already recorded (`lib/extract/reassignKind.ts` §1): the app's own screen order is not the order
 * the OS photo picker hands files over in. Re-aliasing this to `SCREEN_KINDS` to tidy it up would
 * restore the defect. See docs/plans/archive/F29-default-kind-order.md.
 *
 * **Never `details`, by type.** The Workout Details screen replaces a missing splits table, which
 * only the runner knows about, so it is always chosen by a tap (the middle tile, usually). The
 * `PrimaryScreenKind` constraint makes a default of `details` a compile error rather than a habit.
 *
 * `satisfies` rather than an annotation, so the elements are checked while the tuple stays literal
 * — a widened annotation would let a mistyped entry past the invariant test that pins this.
 */
export const DEFAULT_KIND_BY_INDEX = [
  'heartrate',
  'splits',
  'summary',
] as const satisfies readonly PrimaryScreenKind[]
```

**File:** `lib/extract/reassignKind.ts`
- **`:6-21`**, the "WHY THIS EXISTS" paragraph: replace `The arithmetic runs out: \`MAX_IMAGES === SCREEN_KINDS.length === 3\`, so on a full three-screen` … through `…are mislabelled *as each other*. One tap fixes both.` with:
```ts
 * F04's picker kept the kinds distinct by *disabling* every kind another tile already held. The
 * arithmetic ran out: there were exactly as many kinds as slots (three), so on a full three-screen
 * upload every kind was claimed, every non-selected button was disabled, and the control froze
 * solid at exactly the moment a mislabel is most likely. A heart-rate screen arrived labelled
 * Summary and there was no way back. See docs/plans/archive/F16b-upload-kind-swap.md §1.
 *
 * Since the Workout Details kind landed there are four kinds for three slots, so a free kind always
 * exists and subtraction would no longer freeze outright — but swapping stays the right rule for the
 * reason that made it right in the first place: two screens are mislabelled *as each other*, and one
 * tap fixes both. Swapping keeps the invariant true after every single tap, so there is never an
 * invalid state to render, explain, or dig back out of.
```
- **`:61-64`**: replace `` `onPick` only ever assigns a kind no tile holds (there is always one free, by the equality `` / `` asserted below)`` with `` `onPick` only ever assigns a kind no tile holds (there is always one free, by the inequality `` / `` asserted below)``.
- **`:87-93`**: replace the doc comment and the export with:
```ts
/**
 * The inequality the design rests on: with at least as many kinds as slots, a free kind always
 * exists, so `onPick` can never seat a tile on a kind that is taken. It was an equality
 * (`MAX_IMAGES === SCREEN_KINDS.length`) until the Workout Details kind made it four kinds for three
 * slots; `>=` is what the picker actually needs. Exported so the suite asserts it rather than assumes it.
 */
export const A_FREE_KIND_ALWAYS_EXISTS = SCREEN_KINDS.length >= MAX_IMAGES
```

**File:** `lib/extract/planPicked.ts:84-89`. Replace the comment lines from `// The fallback search reads` through `// asserts both directly.` with:
```ts
    // The fallback search reads `DEFAULT_KIND_BY_INDEX` and not `SCREEN_KINDS`: scanning the
    // canonical list would make a pick that cannot have its preferred kind fall back to the
    // *Fitness app's* order, the one F29 removed — or, since the Workout Details kind landed, to
    // `details`, which only the runner may choose. The search is total by pigeonhole: the array
    // holds `MAX_IMAGES` distinct kinds, and when a pick is being seated fewer than `MAX_IMAGES`
    // kinds are in use, so at least one default is always free. The test asserts both facts.
```

**File:** `tests/extract.planPicked.test.ts`
- **`:61-65`**: replace with:
```ts
  it('refuses outright when three tiles are already up, and says so', () => {
    const plan = planPicked(holders('summary', 'details', 'heartrate'), [file('d.jpg')])
    expect(plan.accepted).toEqual([])
    expect(plan.error).toBe('Three screenshots is the most one run can have.')
  })
```
- **`:163-183`**: replace both tests (`has exactly as many kinds as slots`, `defaults through a permutation of every kind, exactly once each`) with:
```ts
  /**
   * The fact every "find a free kind" search here depends on, asserted directly the way F16
   * asserts its own. It used to read `MAX_IMAGES === SCREEN_KINDS.length`; the Workout Details kind
   * made it four kinds for three slots, and what the search needs was only ever `>=`.
   */
  it('always has a free kind for the next tile', () => {
    expect(SCREEN_KINDS.length).toBeGreaterThanOrEqual(MAX_IMAGES)
  })

  /**
   * The fallback search scans `DEFAULT_KIND_BY_INDEX`, so it is total only if that array holds
   * `MAX_IMAGES` DISTINCT screen kinds (pigeonhole: fewer than `MAX_IMAGES` are in use whenever a
   * pick is seated). It is no longer a permutation of every kind — Workout Details is never a
   * default, because only the runner knows the splits table is missing.
   */
  it('defaults through MAX_IMAGES distinct screen kinds, never Workout Details', () => {
    expect(DEFAULT_KIND_BY_INDEX).toHaveLength(MAX_IMAGES)
    expect(new Set(DEFAULT_KIND_BY_INDEX).size).toBe(DEFAULT_KIND_BY_INDEX.length)
    for (const kind of DEFAULT_KIND_BY_INDEX) expect(SCREEN_KINDS).toContain(kind)
    expect(DEFAULT_KIND_BY_INDEX).not.toContain('details')
  })

  it('keeps the device order around a tile the runner relabelled Workout Details', () => {
    const plan = planPicked(holders('details'), [file('b.jpg'), file('c.jpg')])
    expect(plan.accepted.map((a) => a.kind)).toEqual(['splits', 'summary'])
  })
```

**File:** `tests/extract.reassignKind.test.ts`
- **`:4`**: `import { A_FREE_KIND_ALWAYS_EXISTS, reassignKind, type KindHolder } from '@/lib/extract/reassignKind'`
- **`:20-32`**: replace the `describe('the equality the design rests on', …)` block with:
```ts
describe('the inequality the design rests on', () => {
  /**
   * What guarantees `onPick` can always seat a new tile on a free kind, and why `reassignKind`
   * looks up a single holder with `find`. It was an equality (three kinds, three slots) until the
   * Workout Details kind landed; the picker only ever needed at least as many kinds as slots.
   */
  it('has at least as many screen kinds as image slots', () => {
    expect(SCREEN_KINDS.length).toBeGreaterThanOrEqual(MAX_IMAGES)
    expect(A_FREE_KIND_ALWAYS_EXISTS).toBe(true)
  })
})
```
- **`:150-154`**: replace with:
```ts
  it('enumerates every arrangement and tap', () => {
    // Four kinds over 1-3 tiles: 4 + 12 + 24 = 40 arrangements; 1·4·4 + 12·2·4 + 24·3·4 taps.
    expect(arrangements).toHaveLength(40)
    expect(taps).toHaveLength(16 + 96 + 288)
  })
```
(The exhaustive loops already iterate `SCREEN_KINDS`, so they now cover `details` with no other change.)

**File:** `lib/llm/prompts/extraction.ts`. The two template literals at `:42-77` and `:88-110` are not touched.
- **`:1`**: `import { PRIMARY_SCREEN_KINDS, type PrimaryScreenKind } from '@/lib/extract/constants'`
- **`:112`**: `const IMAGE_LABEL: Record<PrimaryScreenKind, string> = {` (the three entries unchanged)
- **`:123`**: `  kind: PrimaryScreenKind`
- **`:142`**: `    images.length === PRIMARY_SCREEN_KINDS.length`. This line is load-bearing. Against the widened `SCREEN_KINDS` it would switch every three-image request to the "You are given" intro. The frozen test's user-turn hash catches that.
- **`:168`**: `export function buildRepairRequestText(kinds: PrimaryScreenKind[]): string {`

**File:** `lib/llm/prompts/extraction.frozen.test.ts` (new)
**Code:**
```ts
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  EXTRACTION_SHAPE,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserContent,
  buildRepairRequestText,
} from './extraction'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE FROZEN PROMPT, PINNED BY HASH. Rules 1–7 and SHAPE scored 108/108 and are byte-frozen.
 *
 *  Every expected value below is the sha-256 of the value at `origin/main` @ 7e285b3, computed
 *  from that commit's file (`git show 7e285b3:lib/llm/prompts/extraction.ts`), never from the
 *  working copy. If one of these fails, the change under test altered the measured request — revert
 *  it. Do NOT "update the hash": a new hash needs a re-run of `research/run-extract.mjs` first.
 *
 *  The user turns are pinned too, because the request is more than the two strings: the intro
 *  sentence is chosen by comparing the image count to the number of PRIMARY kinds, and comparing it
 *  to the widened `SCREEN_KINDS` (four, since Workout Details) would silently change every
 *  three-image request while both strings still hashed the same.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

describe('the frozen extraction prompt (origin/main @ 7e285b3)', () => {
  it('EXTRACTION_SYSTEM_PROMPT is byte-identical', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toHaveLength(2816)
    expect(sha(EXTRACTION_SYSTEM_PROMPT)).toBe(
      '23c82197c6ae148b42a9a3a157ba505431d33da01a6e75a0d17d995868633411',
    )
  })

  it('EXTRACTION_SHAPE is byte-identical', () => {
    expect(EXTRACTION_SHAPE).toHaveLength(1218)
    expect(sha(EXTRACTION_SHAPE)).toBe(
      '6dc42e9915b10e93d34f0a7e28998fe79fdff83c3cfd95cc2107f852dc3af3ba',
    )
  })

  it('the three-screen user turn is byte-identical', () => {
    const parts = buildExtractionUserContent([
      { kind: 'summary', dataUri: 'data:a' },
      { kind: 'splits', dataUri: 'data:b' },
      { kind: 'heartrate', dataUri: 'data:c' },
    ])
    expect(sha(JSON.stringify(parts))).toBe(
      '12338a24474acbff6aab2533afb1d060ac276f59ed72bd1588144f4dccebd5a4',
    )
  })

  it('a two-screen user turn is byte-identical', () => {
    const parts = buildExtractionUserContent([
      { kind: 'summary', dataUri: 'data:a' },
      { kind: 'heartrate', dataUri: 'data:c' },
    ])
    expect(sha(JSON.stringify(parts))).toBe(
      'ca4bbadf53f55061f00bf87c9d4043dc2ff1b7a45a15bb45a62b76f61af27754',
    )
  })

  it('the repair request text is byte-identical', () => {
    expect(sha(buildRepairRequestText(['summary', 'heartrate']))).toBe(
      'be86bea4b12f0b460061b40a1a924405476a9d8f51cbbc5789c043562add8c56',
    )
  })
})
```
(The planner computed the five hashes from `git show 7e285b3:lib/llm/prompts/extraction.ts` in two
independent ways, a template-literal eval and an esbuild transform; both agree. The two string
lengths are 2816 and 1218.)

**File:** `lib/schema/extractedSession.ts`
- **`:3`**: `import { SCREEN_KINDS, type PrimaryScreenKind, type ScreenKind } from '@/lib/extract/constants'`
- **`:201`**: `export const FIELD_SOURCES: Record<ExtractedSessionField, readonly PrimaryScreenKind[]> = {`. `makeExtractedSessionSchema` and `fieldIsReachable` keep `ReadonlySet<ScreenKind>`: `details` appears in no field's source list, so it is ignored by construction, and their test callers stay untouched.

**File:** `lib/llm/extract.ts`
- **`:3-9`**: in the constants import, replace `type ScreenKind,` with `type PrimaryScreenKind,`.
- **`:98-103`**: `  kindsPresent: ReadonlySet<PrimaryScreenKind>,` (signature otherwise unchanged).

**File:** `lib/llm/extract.test.ts`
- **`:4`**: `import { MIN_REPAIR_BUDGET_MS, type PrimaryScreenKind } from '@/lib/extract/constants'`
- **`:22`**: `const ALL_KINDS: ReadonlySet<PrimaryScreenKind> = new Set(['summary', 'splits', 'heartrate'])`

**File:** `lib/llm/vision.ts`
- **`:4`**: `import type { PrimaryScreenKind } from '@/lib/extract/constants'`
- **`:210`** and **`:233`**: `  input: { kinds: PrimaryScreenKind[]; malformedText: string; issues: string },`

**File:** `tests/live/vision.live.test.ts`
- **`:19`**: `import { makeExtractedSessionSchema } from '@/lib/schema/extractedSession'`, and add `type PrimaryScreenKind` to the `@/lib/extract/constants` import at `:14-18`.
- **`:52`**: `const FILES: Array<{ file: string; kind: PrimaryScreenKind }> = [`
- **`:64`**: `const ALL_KINDS: ReadonlySet<PrimaryScreenKind> = new Set(['summary', 'splits', 'heartrate'])`

**File:** `lib/db/schema/runs.ts` — as it stands AFTER phase 2, whose 16-line `distanceEstimated` / `splitsEstimated` hunk sits after base line 215 inside `runs` (leave that hunk exactly as phase 2 wrote it). Line numbers below are post-phase-2; find each line by the quoted current text.
- **`:132`** (above phase 2's hunk, unmoved) — current text `  /** 'summary' | 'splits' | 'heartrate' — F04 never writes 'other' into an extraction. */` becomes `  /** 'summary' | 'splits' | 'heartrate' | 'details' — F04 never writes 'other' into an extraction. */`
- **~`:351`** (base `:335`) — current text `    kind: text('kind').$type<PhotoKind>().notNull(), // 'summary'|'splits'|'heartrate'|'other'`: change the trailing comment to `// 'summary'|'splits'|'heartrate'|'details'|'other'`
- **~`:403`** (base `:387`) — current text `export type PhotoKind = 'summary' | 'splits' | 'heartrate' | 'other'` becomes `export type PhotoKind = 'summary' | 'splits' | 'heartrate' | 'details' | 'other'`. This stays a literal union on purpose: `lib/db/schema` does not import F04's modules (`:124-126`). `app/api/extract/route.ts` assigns a `ScreenKind` to it, so TypeScript proves `ScreenKind ⊆ PhotoKind`.

**File:** `lib/llm/runExtractionJob.ts`. Replace the whole file with:
```ts
import 'server-only'

import {
  JOB_DEADLINE_MS,
  PRIMARY_SCREEN_KINDS,
  UPLOAD_CONTENT_TYPE,
  type PrimaryScreenKind,
  type ScreenKind,
} from '@/lib/extract/constants'
import { markExtractionFailed, markExtractionOk, markExtractionRepaired } from '@/lib/db/queries'
import { mergeWorkoutDetails } from '@/lib/extract/detailsMerge'
import type { DetailsPrinted, EstimatedValues } from '@/lib/schema/detailsPrinted'
import { RawExtractedSession, type ExtractedSession } from '@/lib/schema/extractedSession'
import type { ExtractionBlobRef } from '@/lib/schema/extractionResult'
import { extractSession, productionDeps, type ExtractDeps } from './extract'
import type { PromptImage } from './prompts/extraction'
import {
  productionDetailsDeps,
  readWorkoutDetails,
  type DetailsDeps,
  type DetailsReading,
} from './readDetails'

/**
 * The body of `after()` in `POST /api/extract` — the whole of D4's background job.
 *
 * It runs after the 202 has already been sent, inside the same serverless invocation, and it owns
 * exactly one promise: **this function always writes a terminal `extractions` row.** Every path
 * out of it, including an unexpected throw, ends in `ok`, `repaired` or `failed`. The stale-
 * pending self-heal in `GET /api/extract/[id]` exists for the one case this cannot cover — the
 * invocation being killed outright — not as a substitute for handling errors here.
 *
 * ── TWO CALLS, IN PARALLEL, WHEN A WORKOUT DETAILS SCREENSHOT IS PRESENT ────────────────────
 * The primary call gets ONLY the summary / splits / heart-rate images, with the byte-frozen prompt
 * (R1.3). A `details` image goes to its own one-image call (`readWorkoutDetails`), started at the
 * same instant: the ceiling is 60 s, the soft deadline 55 s and the primary median 28–36 s, so a
 * second call in SERIES would not fit. Its pixels are measured by `lib/extract/chart/*` once both
 * settle — the estimator needs the primary's transcribed distance (A2) and costs milliseconds.
 *
 * Status, by ruling:
 *   primary ok/repaired, details anything   → the primary's status; estimate only if it all worked
 *   primary failed,      details anything   → failed (the primary's code); details kept for audit
 *   no primary (details-only), reading ok   → ok, a session from the printed values + estimate
 *   no primary (details-only), reading fail → failed with the reading's own code
 * Nothing on the details side can turn an otherwise-ok extraction into `failed` (invariant 4).
 */

/** What `extractions.raw_response` holds. A convention on an existing jsonb column, not a migration. */
export interface RawResponseColumn {
  /** The exact JSON body the primary endpoint returned (the repair call's, if one happened). */
  vendor: unknown
  /**
   * The Zod-validated result, stored pre-validated so `GET` is a pure read. The poll endpoint
   * must never re-run extraction logic: re-parsing on every poll could disagree with what was
   * actually written (a different `kindsPresent`, a changed schema after a deploy), and
   * "the numbers changed while I was looking at them" is the one thing D1 cannot tolerate.
   */
  parsedSession: ExtractedSession | null
  attempts: 1 | 2
  /** Present only when a details screenshot was read. */
  details?: {
    /** The details call's raw body. */
    vendor: unknown
    /** Validated printed values, null if the reading failed. */
    printed: DetailsPrinted | null
    /**
     * What the chart estimate wrote into `parsedSession`: `distanceKm` is the estimated distance
     * written into `parsedSession.distanceKm`, else null; `splits` is true when
     * `parsedSession.splits` are chart estimates. null when nothing was estimated.
     */
    estimate: EstimatedValues | null
  }
}

export type JobDeps = ExtractDeps & DetailsDeps

const productionJobDeps: JobDeps = { ...productionDeps, ...productionDetailsDeps }

interface FetchedBlob {
  ref: ExtractionBlobRef
  bytes: Buffer
}

/**
 * Fetch one uploaded screenshot back out of Blob. The bytes are kept (the details image is decoded
 * for its pixels) and re-encoded as a data URI for the vision calls.
 *
 * §2.2: a data URI, not the hosted Blob URL, even though the bytes are already on a public CDN.
 * This matches the measured recipe (`research/lib.mjs`'s `imgPart`) exactly. A `url:`-only
 * `image_url` pointing at the Blob URL was never probed against this endpoint, and per §1's whole
 * lesson, an untested request shape on this vendor is not something to trust in production —
 * especially when the failure mode is "200 OK with invented numbers".
 */
async function fetchBlob(ref: ExtractionBlobRef, signal: AbortSignal): Promise<FetchedBlob> {
  const res = await fetch(ref.url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`blob fetch ${res.status} for ${ref.pathname}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error(`blob ${ref.pathname} was empty`)
  return { ref, bytes }
}

/**
 * Compression always emits JPEG and the upload route allows only image/jpeg, so the media type is
 * known rather than sniffed.
 */
function dataUriOf(bytes: Buffer): string {
  return `data:${UPLOAD_CONTENT_TYPE};base64,${bytes.toString('base64')}`
}

function isPrimaryScreenKind(kind: ScreenKind): kind is PrimaryScreenKind {
  return (PRIMARY_SCREEN_KINDS as readonly ScreenKind[]).includes(kind)
}

function detailsColumn(
  details: DetailsReading | null,
  estimate: EstimatedValues | null,
): Pick<RawResponseColumn, 'details'> {
  return details === null
    ? {}
    : { details: { vendor: details.vendor, printed: details.printed, estimate } }
}

/** The merge, behind the one try this phase allows itself: a merge failure costs the estimate only. */
function mergeOrDegrade(
  session: ExtractedSession,
  details: DetailsReading | null,
  hasSplitsScreen: boolean,
  extractionId: string,
): { session: ExtractedSession; estimate: EstimatedValues | null } {
  if (details === null) return { session, estimate: null }
  try {
    return mergeWorkoutDetails({
      session,
      printed: details.printed,
      image: details.image,
      hasSplitsScreen,
    })
  } catch (cause) {
    console.error('[f04] workout details merge failed; keeping the other screens', {
      extractionId,
      cause,
    })
    return { session, estimate: null }
  }
}

interface RunExtractionJobInput {
  userId: string
  extractionId: string
  images: ExtractionBlobRef[]
  /** When the route started, so the job's deadline covers the whole invocation, not just itself. */
  invocationStartedAt: number
}

export async function runExtractionJob(
  input: RunExtractionJobInput,
  deps: JobDeps = productionJobDeps,
): Promise<void> {
  const { userId, extractionId, images } = input
  const deadlineAt = input.invocationStartedAt + JOB_DEADLINE_MS

  try {
    // 10 s for three ~60 KB fetches from a CDN in the same region is generous; if Blob is that
    // slow, spending the rest of the budget on a vision call that cannot finish is worse than
    // failing now with a code that says so.
    const blobTimeout = Math.min(10_000, Math.max(1_000, deadlineAt - deps.now()))
    let fetched: FetchedBlob[]
    try {
      fetched = await Promise.all(
        images.map((ref) => fetchBlob(ref, AbortSignal.timeout(blobTimeout))),
      )
    } catch (cause) {
      console.error('[f04] blob fetch failed', { extractionId, cause })
      await markExtractionFailed(userId, extractionId, 'transport', {
        vendor: null,
        parsedSession: null,
        attempts: 1,
      } satisfies RawResponseColumn)
      return
    }

    // R1.3: the primary request carries the three screens it was measured on, and nothing else.
    const primaryImages: PromptImage[] = []
    let detailsBlob: FetchedBlob | null = null
    for (const blob of fetched) {
      const kind = blob.ref.kind
      if (isPrimaryScreenKind(kind)) primaryImages.push({ kind, dataUri: dataUriOf(blob.bytes) })
      else detailsBlob = blob
    }

    // Derived from OUR upload records. The model's answer never feeds this set — that is the
    // whole point of the provenance guard.
    const kindsPresent: ReadonlySet<PrimaryScreenKind> = new Set(primaryImages.map((i) => i.kind))

    const remaining = deadlineAt - deps.now()
    const [outcome, details] = await Promise.all([
      primaryImages.length > 0
        ? extractSession(deps, primaryImages, kindsPresent, remaining)
        : null,
      detailsBlob === null
        ? null
        : readWorkoutDetails(
            deps,
            { dataUri: dataUriOf(detailsBlob.bytes), bytes: detailsBlob.bytes },
            remaining,
          ),
    ])

    if (outcome === null) {
      if (details === null) throw new Error('an extraction with no images reached the job')
      await finishDetailsOnly(userId, extractionId, details)
      return
    }

    if (outcome.status !== 'failed' && outcome.session !== null) {
      const merged = mergeOrDegrade(outcome.session, details, kindsPresent.has('splits'), extractionId)
      const rawResponse: RawResponseColumn = {
        vendor: outcome.rawVendorResponse,
        parsedSession: merged.session,
        attempts: outcome.attempts,
        ...detailsColumn(details, merged.estimate),
      }
      if (outcome.status === 'ok') {
        await markExtractionOk(userId, extractionId, rawResponse, outcome.promptTokens)
      } else {
        await markExtractionRepaired(userId, extractionId, rawResponse, outcome.promptTokens)
      }
      return
    }

    // The canary is worth storing even on the failure path — a `token_floor` row whose
    // prompt_tokens reads 141 is the difference between "the vendor dropped the images" and
    // "the model wrote bad JSON", months after the fact.
    await markExtractionFailed(
      userId,
      extractionId,
      outcome.errorCode ?? 'transport',
      {
        vendor: outcome.rawVendorResponse,
        parsedSession: null,
        attempts: outcome.attempts,
        ...detailsColumn(details, null),
      } satisfies RawResponseColumn,
      outcome.promptTokens,
    )
    console.warn('[f04] extraction failed', {
      extractionId,
      errorCode: outcome.errorCode,
      promptTokens: outcome.promptTokens,
      detailsRead: details?.printed != null,
    })
  } catch (cause) {
    // Last resort. Anything that reaches here is a bug, not a vendor failure — but the row still
    // must not be left pending, so it is closed and the cause is logged loudly.
    console.error('[f04] extraction job crashed', { extractionId, cause })
    try {
      await markExtractionFailed(userId, extractionId, 'transport', {
        vendor: null,
        parsedSession: null,
        attempts: 1,
      } satisfies RawResponseColumn)
    } catch (writeFailure) {
      console.error('[f04] could not even record the failure', { extractionId, writeFailure })
    }
  }
}

/**
 * A Workout Details screenshot alone. The reading IS the extraction here: there are no other
 * screens whose fields R2.4 must keep intact, so a failed reading is a failed extraction (the same
 * blank review form, plus the reason and a Retry). A reading that worked but whose charts could not
 * be measured is still `ok`, with the printed values filled in.
 */
async function finishDetailsOnly(
  userId: string,
  extractionId: string,
  details: DetailsReading,
): Promise<void> {
  if (details.printed === null) {
    await markExtractionFailed(
      userId,
      extractionId,
      details.errorCode ?? 'validation',
      { vendor: null, parsedSession: null, attempts: 1, ...detailsColumn(details, null) } satisfies RawResponseColumn,
      details.promptTokens,
    )
    console.warn('[f04] details-only extraction failed', {
      extractionId,
      errorCode: details.errorCode,
    })
    return
  }
  // Every field defaults to null / [] — the empty session no screen has spoken for yet.
  const merged = mergeOrDegrade(RawExtractedSession.parse({}), details, false, extractionId)
  await markExtractionOk(
    userId,
    extractionId,
    {
      vendor: null,
      parsedSession: merged.session,
      attempts: 1,
      ...detailsColumn(details, merged.estimate),
    } satisfies RawResponseColumn,
    details.promptTokens,
  )
}
```

**File:** `lib/llm/runExtractionJob.test.ts` (new)
**Code:**
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TRUTH } from '../../research/schema.mjs'
import type { ChartEstimate, RgbImage } from '@/lib/extract/chart/estimate'
import type { ScreenKind } from '@/lib/extract/constants'
import type { ExtractionBlobRef } from '@/lib/schema/extractionResult'
import type { RawResponseColumn, JobDeps } from './runExtractionJob'
import { VisionTokenFloorError, VisionTransportError, type VisionResult } from './vision'

/**
 * The job, end to end through its public entry, with both vision calls, the decode and the clock
 * injected, the database writes captured and the Blob fetch stubbed. The estimator is a
 * collaborator from phase 1 and is stubbed to a canned estimate here so the MERGE and the STATUS
 * rules are what is asserted; `tests/extract.detailsMerge.test.ts` runs the real estimator on the
 * real fixtures.
 */

const queries = vi.hoisted(() => ({
  markExtractionOk: vi.fn(),
  markExtractionRepaired: vi.fn(),
  markExtractionFailed: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => ({ ...queries }))

const chart = vi.hoisted(() => ({ estimateFromCharts: vi.fn() }))
vi.mock('@/lib/extract/chart/estimate', () => ({ ...chart }))
vi.mock('@/lib/extract/chart/decode', () => ({ decodeToRgb: vi.fn() }))

const { runExtractionJob } = await import('./runExtractionJob')

const USER = 'user_1'
const ID = 'extract12345'
const RGB: RgbImage = { width: 1, height: 1, data: new Uint8Array([0, 0, 0]) }

const SUNDAY_PRINTED = {
  durationSec: TRUTH.durationSec,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}

const CANNED: ChartEstimate = {
  distanceKm: 6.1,
  distanceWasEstimated: true,
  slotCount: 90,
  splits: [
    { km: 1, timeSec: 494.2, paceSecPerKm: 494.2, hrBpm: 141.6, cadenceSpm: null, partial: false },
    { km: 2, timeSec: 496, paceSecPerKm: 496, hrBpm: 155, cadenceSpm: null, partial: false },
    { km: 3, timeSec: 496, paceSecPerKm: 496, hrBpm: 160, cadenceSpm: null, partial: false },
    { km: 4, timeSec: 512, paceSecPerKm: 512, hrBpm: 162, cadenceSpm: null, partial: false },
    { km: 5, timeSec: 509, paceSecPerKm: 509, hrBpm: 165, cadenceSpm: null, partial: false },
    { km: 6, timeSec: 493, paceSecPerKm: 493, hrBpm: 170, cadenceSpm: null, partial: false },
    { km: 7, timeSec: 46, paceSecPerKm: 460, hrBpm: 175, cadenceSpm: null, partial: true },
  ],
}

/** What the primary call returns for a summary + heart-rate read with no printed distance. */
const NO_DISTANCE_JSON = JSON.stringify({ ...TRUTH, distanceKm: null, avgPaceSecPerKm: null })

function ref(kind: ScreenKind): ExtractionBlobRef {
  return {
    url: `https://riverifystore0000.public.blob.vercel-storage.com/shots/${kind}.jpg`,
    pathname: `shots/abcdefghijkl-${'x'.repeat(20)}.jpg`,
    kind,
    width: 560,
    height: 1212,
    bytes: 3,
    contentHash: null,
  }
}

function visionResult(text: string, promptTokens = 3277): VisionResult {
  return {
    text,
    promptTokens,
    completionTokens: 900,
    finishReason: 'stop',
    raw: { choices: [{ message: { content: text } }], usage: { prompt_tokens: promptTokens } },
  }
}

function deps(over: Partial<JobDeps> = {}): JobDeps {
  return {
    callPrimary: vi.fn(async () => visionResult(NO_DISTANCE_JSON)),
    callRepair: vi.fn(async () => Promise.reject(new Error('no repair expected'))),
    callDetails: vi.fn(async () => visionResult(JSON.stringify(SUNDAY_PRINTED), 1100)),
    decode: vi.fn(async () => RGB),
    now: () => 1_000_000,
    ...over,
  }
}

async function run(kinds: ScreenKind[], d: JobDeps) {
  await runExtractionJob(
    { userId: USER, extractionId: ID, images: kinds.map(ref), invocationStartedAt: 1_000_000 },
    d,
  )
}

const okRaw = () => queries.markExtractionOk.mock.calls[0]![2] as RawResponseColumn

beforeEach(() => {
  vi.resetAllMocks()
  chart.estimateFromCharts.mockReturnValue(CANNED)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the primary request (R1.3)', () => {
  it('never carries the details image, and the details image goes to its own one-image call', async () => {
    const d = deps()
    await run(['summary', 'details', 'heartrate'], d)

    expect(d.callPrimary).toHaveBeenCalledTimes(1)
    const [primaryImages] = vi.mocked(d.callPrimary).mock.calls[0]!
    expect(primaryImages.map((i) => i.kind)).toEqual(['summary', 'heartrate'])
    expect(d.callDetails).toHaveBeenCalledTimes(1)
    expect(vi.mocked(d.callDetails).mock.calls[0]![0]).toEqual({
      dataUri: expect.stringMatching(/^data:image\/jpeg;base64,/),
    })
  })

  it('a plain summary + splits + heart rate upload makes no details call and writes no details key', async () => {
    const d = deps({ callPrimary: vi.fn(async () => visionResult(JSON.stringify(TRUTH))) })
    await run(['summary', 'splits', 'heartrate'], d)

    expect(d.callDetails).not.toHaveBeenCalled()
    expect(okRaw()).not.toHaveProperty('details')
    expect(okRaw().parsedSession!.splits).toEqual(TRUTH.splits)
  })
})

describe('the two calls run concurrently', () => {
  it('starts the details call while the primary call is still in flight', async () => {
    let releasePrimary!: (r: VisionResult) => void
    const primary = new Promise<VisionResult>((resolve) => {
      releasePrimary = resolve
    })
    const d = deps({ callPrimary: vi.fn(() => primary) })
    const job = run(['summary', 'details', 'heartrate'], d)

    await vi.waitFor(() => expect(d.callDetails).toHaveBeenCalledTimes(1))
    expect(queries.markExtractionOk).not.toHaveBeenCalled()
    releasePrimary(visionResult(NO_DISTANCE_JSON))
    await job
    expect(queries.markExtractionOk).toHaveBeenCalledTimes(1)
  })
})

describe('the merge (R2.3, A1, A2, A7)', () => {
  it('writes the estimated distance and splits into parsedSession and records them', async () => {
    await run(['summary', 'details', 'heartrate'], deps())

    expect(chart.estimateFromCharts).toHaveBeenCalledWith(RGB, {
      durationSec: TRUTH.durationSec,
      paceSlowestSecPerKm: 552,
      paceFastestSecPerKm: 407,
      hrMinBpm: 116,
      hrMaxBpm: 177,
      knownDistanceKm: null,
    })
    const raw = okRaw()
    expect(raw.parsedSession!.distanceKm).toBe(6.1)
    expect(raw.parsedSession!.splits).toHaveLength(7)
    expect(raw.parsedSession!.splits[0]).toEqual({
      km: 1,
      timeSec: 494,
      paceSecPerKm: 494,
      hrBpm: 142,
      cadenceSpm: null,
      partial: false,
    })
    expect(raw.details).toEqual({
      vendor: expect.anything(),
      printed: SUNDAY_PRINTED,
      estimate: { distanceKm: 6.1, splits: true },
    })
    // A7: the summary's own average HR (TRUTH) is kept over the details screen's 161.
    expect(raw.parsedSession!.avgHrBpm).toBe(TRUTH.avgHrBpm)
  })

  it('a transcribed distance is handed to the estimator and is not flagged (A2)', async () => {
    chart.estimateFromCharts.mockReturnValue({ ...CANNED, distanceKm: 6.04, distanceWasEstimated: false })
    const d = deps({
      callPrimary: vi.fn(async () =>
        visionResult(JSON.stringify({ ...TRUTH, distanceKm: 6.04 })),
      ),
    })
    await run(['summary', 'details', 'heartrate'], d)

    expect(chart.estimateFromCharts.mock.calls[0]![1]).toMatchObject({ knownDistanceKm: 6.04 })
    expect(okRaw().parsedSession!.distanceKm).toBe(6.04)
    expect(okRaw().details!.estimate).toEqual({ distanceKm: null, splits: true })
  })

  it('a splits screenshot wins: the table is kept and no estimate is attempted (R1.2)', async () => {
    const d = deps({ callPrimary: vi.fn(async () => visionResult(JSON.stringify(TRUTH))) })
    await run(['summary', 'splits', 'details'], d)

    expect(chart.estimateFromCharts).not.toHaveBeenCalled()
    expect(okRaw().parsedSession!.splits).toEqual(TRUTH.splits)
    expect(okRaw().details!.estimate).toBeNull()
    expect(okRaw().details!.printed).toEqual(SUNDAY_PRINTED)
  })
})

describe('a details-side failure never fails the extraction (R2.4)', () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
  // Factories, not prebuilt mocks: `vi.resetAllMocks()` in beforeEach would strip a module-level
  // vi.fn's implementation before the case runs.
  const cases: Array<[string, () => Partial<JobDeps>]> = [
    [
      'the details call times out',
      () => ({
        callDetails: vi.fn(async () =>
          Promise.reject(new VisionTransportError('vision request failed or timed out', timeout)),
        ),
      }),
    ],
    [
      'the details call trips the token floor',
      () => ({ callDetails: vi.fn(async () => Promise.reject(new VisionTokenFloorError(141, 1))) }),
    ],
    [
      'the details reply is not the shape',
      () => ({
        callDetails: vi.fn(async () => visionResult('{"durationSec":"fifty minutes"}', 1100)),
      }),
    ],
    [
      'the pace range was not transcribed',
      () => ({
        callDetails: vi.fn(async () =>
          visionResult(JSON.stringify({ ...SUNDAY_PRINTED, paceSlowestSecPerKm: null }), 1100),
        ),
      }),
    ],
    [
      'the screenshot cannot be decoded',
      () => ({ decode: vi.fn(async () => Promise.reject(new Error('unsupported image format'))) }),
    ],
  ]

  it.each(cases)('%s: ok, the other screens intact, no estimate', async (_label, over) => {
    await run(['summary', 'details', 'heartrate'], deps(over()))

    expect(queries.markExtractionFailed).not.toHaveBeenCalled()
    const raw = okRaw()
    expect(raw.parsedSession!.durationSec).toBe(TRUTH.durationSec)
    expect(raw.parsedSession!.avgHrBpm).toBe(TRUTH.avgHrBpm)
    expect(raw.parsedSession!.hrZones).toEqual(TRUTH.hrZones)
    expect(raw.parsedSession!.distanceKm).toBeNull()
    expect(raw.parsedSession!.splits).toEqual([])
    expect(raw.details!.estimate).toBeNull()
  })

  it('the charts cannot be located (the estimator answers null): ok, no estimate', async () => {
    chart.estimateFromCharts.mockReturnValue(null)
    await run(['summary', 'details', 'heartrate'], deps())

    expect(queries.markExtractionFailed).not.toHaveBeenCalled()
    expect(okRaw().parsedSession!.distanceKm).toBeNull()
    expect(okRaw().details!.estimate).toBeNull()
    expect(okRaw().details!.printed).toEqual(SUNDAY_PRINTED)
  })

  it('even an estimator that throws against its contract costs only the estimate', async () => {
    chart.estimateFromCharts.mockImplementation(() => {
      throw new Error('contract broken')
    })
    await run(['summary', 'details', 'heartrate'], deps())

    expect(queries.markExtractionFailed).not.toHaveBeenCalled()
    expect(okRaw().parsedSession!.durationSec).toBe(TRUTH.durationSec)
    expect(okRaw().details!.estimate).toBeNull()
  })
})

describe('statuses when one side stands alone', () => {
  it('details-only: no primary call, ok, built from the printed values and the estimate', async () => {
    const d = deps()
    await run(['details'], d)

    expect(d.callPrimary).not.toHaveBeenCalled()
    const [, , raw, promptTokens] = queries.markExtractionOk.mock.calls[0]!
    expect(promptTokens).toBe(1100)
    expect((raw as RawResponseColumn).parsedSession).toMatchObject({
      durationSec: TRUTH.durationSec,
      distanceKm: 6.1,
      elevationGainM: 4,
      avgHrBpm: 161,
    })
    expect((raw as RawResponseColumn).details!.estimate).toEqual({ distanceKm: 6.1, splits: true })
  })

  it('details-only with a failed reading is failed, with the reading’s own code', async () => {
    await run(
      ['details'],
      deps({ callDetails: vi.fn(async () => Promise.reject(new VisionTokenFloorError(141, 1))) }),
    )

    expect(queries.markExtractionOk).not.toHaveBeenCalled()
    const [, , code, raw, promptTokens] = queries.markExtractionFailed.mock.calls[0]!
    expect(code).toBe('token_floor')
    expect(promptTokens).toBe(141)
    expect((raw as RawResponseColumn).details).toEqual({ vendor: null, printed: null, estimate: null })
  })

  it('a failed primary decides the status even when the details reading worked', async () => {
    await run(
      ['summary', 'details', 'heartrate'],
      deps({
        callPrimary: vi.fn(async () =>
          Promise.reject(new VisionTransportError('vision endpoint returned 503')),
        ),
      }),
    )

    expect(queries.markExtractionOk).not.toHaveBeenCalled()
    const [, , code, raw] = queries.markExtractionFailed.mock.calls[0]!
    expect(code).toBe('transport')
    expect((raw as RawResponseColumn).parsedSession).toBeNull()
    expect((raw as RawResponseColumn).details!.printed).toEqual(SUNDAY_PRINTED)
    expect((raw as RawResponseColumn).details!.estimate).toBeNull()
  })
})
```
**Impact:** the kind exists end to end in types. Gate:
`npm run typecheck && npx vitest run tests/extract.planPicked.test.ts tests/extract.reassignKind.test.ts lib/llm lib/schema tests/research tests/extract.detailsMerge.test.ts`.

### Step 5: A `details` photo is stored excluded from shares (A6)

**File:** `lib/db/queries/photos.ts:34-64`. Replace the doc comment and the function `attachExtractionPhotos` with:
```ts
/**
 * Attaches uploaded screenshots to their extraction (R-1). `run_id` stays NULL until
 * `commitExtractedRun` backfills it, so a photo is never orphaned and no placeholder run is
 * needed to hold it.
 *
 * **`ids` comes back in INPUT ORDER**, and that is a contract rather than an accident: the ids
 * are minted here, one per `photos[i]`, and `POST /api/extract` zips them back against the claims
 * it sent to know which row carries which hash for the duplicate scan. Do not reorder the map.
 *
 * **A Workout Details screenshot is born excluded from shares** (assumption A6): it shows the
 * runner's route map. `excluded_from_share` (R-11) exists for exactly this; the runner can still
 * include it from the share panel, which is the same toggle every other photo has.
 */
export async function attachExtractionPhotos(
  userId: string,
  extractionId: string,
  photos: NewPhotoInput[],
): Promise<{ ids: string[] }> {
  await assertExtractionOwned(userId, extractionId)
  if (photos.length === 0) return { ids: [] }
  const rows = photos.map((photo, i) => ({
    id: newPhotoId(),
    extractionId,
    blobUrl: photo.blobUrl,
    pathname: photo.pathname,
    kind: photo.kind,
    width: photo.width ?? null,
    height: photo.height ?? null,
    bytes: photo.bytes ?? null,
    sortOrder: photo.sortOrder ?? i,
    contentHash: isValidContentHash(photo.contentHash) ? photo.contentHash : null,
    excludedFromShare: photo.kind === 'details',
  }))
  await db.insert(runPhotos).values(rows)
  return { ids: rows.map((r) => r.id) }
}
```

**File:** `tests/db.queries.extractions.test.ts`. Insert after the `writes nothing at all for an empty photo list` test (`:217-222`):
```ts
  it('stores a Workout Details screenshot excluded from shares — it shows the route map (A6)', async () => {
    fake.enqueue([[1]], [])
    await q.attachExtractionPhotos('u1', 'x1', [
      { blobUrl: 'a', pathname: 'a', kind: 'summary' },
      { blobUrl: 'd', pathname: 'd', kind: 'details' },
    ])
    expect(fake.sqlAt(1)).toContain('"excluded_from_share"')
    const { params } = fake.queries[1]!
    expect(params.filter((p: unknown) => p === true)).toHaveLength(1)
    expect(params.filter((p: unknown) => p === false)).toHaveLength(1)
  })
```

**File:** `app/api/upload/route.test.ts`. Insert after the `accepts every screen kind the schema knows` test (`:136-143`):
```ts
  it('mints a token for a Workout Details screenshot (R1.1)', async () => {
    await post(shotBody())

    const token = await mint(SHOT_PATHNAME, JSON.stringify({ kind: 'details' }))
    expect(JSON.parse(token.tokenPayload ?? '{}')).toMatchObject({ kind: 'details' })
  })
```
**Impact:** `npx vitest run tests/db.queries.extractions.test.ts app/api/upload/route.test.ts` passes.

### Step 6: The upload UI offers Workout Details

**File:** `components/extract/KindSelector.tsx`. Replace the whole file with:
```tsx
'use client'

import { SCREEN_KINDS, SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { cn } from '@/lib/cn'

/**
 * Which screen is this? A segmented control, one tile, four options — all four always live.
 *
 * The kind is resolved **client-side, from the runner** — never inferred by the model and never
 * guessed from the pixels (plan §5.3). Both alternatives were considered and rejected: the
 * measured recipe's "unlabelled images in a fixed order" only works because the *test* controls
 * the order, and an aspect-ratio/OCR heuristic still needs a human override for when it is
 * confidently wrong, so it adds a guess without removing any UI.
 *
 * ── A 2×2 GRID, SINCE WORKOUT DETAILS ───────────────────────────────────────────────────────
 * Four labels no longer fit one row: the selector sits beside a 58 px preview in a ~250 px column,
 * and "Workout Details" alone is ~95 px at 12 px semibold. Two rows of two keep every label whole
 * and every target 36 px tall. Workout Details is never a default (`DEFAULT_KIND_BY_INDEX`); the
 * runner taps it on the tile that holds the Workout Details screenshot, in place of Splits.
 *
 * ── WHY NOTHING IS DIMMED (F16) ─────────────────────────────────────────────────────────────
 * This control used to take a `taken` set — the kinds other tiles held — and render them disabled
 * at 35% opacity, to stop two tiles claiming one screen. That guard was real (two "Splits" would
 * make the provenance guard believe a screen is covered when the real screen is missing) but
 * implemented as subtraction, and there were exactly as many kinds as slots: on a full
 * three-screen upload every kind was claimed, so every non-selected button everywhere was dead.
 * The control froze precisely when a mislabel needed fixing.
 *
 * The invariant now lives in `lib/extract/reassignKind.ts`, which **swaps** instead of subtracting,
 * so it holds after every tap and this component needs no knowledge of its neighbours at all.
 *
 * The dimming is gone outright rather than softened. It is what read as *disabled* and hid the fix
 * from the runner; a lighter version of the same signal is a lighter version of the same confusion.
 * A swap needs no forewarning because it announces itself — the neighbouring tile's control visibly
 * moves the instant the tap lands. Distinctness is still enforced server-side by
 * `ExtractRequestSchema`, which is where it belongs.
 */
export function KindSelector({
  value,
  onChange,
  disabled,
}: {
  value: ScreenKind
  onChange: (kind: ScreenKind) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Which screen is this?"
      className="grid grid-cols-2 gap-1 rounded-field bg-paper-2 p-1"
    >
      {SCREEN_KINDS.map((kind) => {
        const selected = kind === value
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(kind)}
            className={cn(
              // 36px tall; two rows of two inside the tile's column.
              'h-9 rounded-pill text-[12px] font-semibold transition-colors',
              selected ? 'bg-ink text-card' : 'text-ink-2',
            )}
          >
            {SCREEN_KIND_LABEL[kind]}
          </button>
        )
      })}
    </div>
  )
}
```
(The `tests/extract.kindSelector.test.ts` text scan still holds: `SCREEN_KINDS.map`, `onClick={() => onChange(kind)}`, `disabled?: boolean`, `disabled={disabled}` are all present; no `taken`, no `opacity`.)

**File:** `components/extract/KindSelector.test.tsx`
- Replace `it('keeps every unselected radio enabled …')` (`:66-74`) and `it('honours the submitting guard by disabling all three' …)` (`:76-82`) with:
```tsx
  it('keeps every unselected radio enabled while nothing else is held — the F16 dimming must not creep back into the DOM', () => {
    renderSelector({ value: 'summary' })

    // The historical defect rendered kinds other tiles held as `disabled` at 35% opacity. This
    // control cannot know its neighbours, so its own DOM is the invariant: nothing disabled here.
    for (const kind of SCREEN_KINDS) {
      expect(screen.getByRole('radio', { name: SCREEN_KIND_LABEL[kind] })).toBeEnabled()
    }
  })

  it('honours the submitting guard by disabling every kind', () => {
    renderSelector({ disabled: true })

    for (const kind of SCREEN_KINDS) {
      expect(screen.getByRole('radio', { name: SCREEN_KIND_LABEL[kind] })).toBeDisabled()
    }
  })

  it('offers Workout Details and reports it as the details kind', () => {
    const { onChange } = renderSelector({ value: 'splits' })

    fireEvent.click(screen.getByRole('radio', { name: 'Workout Details' }))

    expect(onChange).toHaveBeenCalledWith('details')
  })
```

**File:** `components/extract/UploadPicker.tsx`
- **`:284-285`**: replace with:
```tsx
  const ready = tiles.length > 0 && tiles.every((t) => t.state === 'ready' && t.blob)
  const kindsChosen = tiles.map((t) => SCREEN_KIND_LABEL[t.kind]).join(' · ')
  // A Workout Details tile is read by a second call beside the main one, so "all N in one pass"
  // would no longer be true — say what actually happens instead.
  const readingLine = tiles.some((t) => t.kind === 'details')
    ? `${kindsChosen} — read in about ${TYPICAL_EXTRACTION_SECONDS} seconds, with the pace chart measured rather than read.`
    : `${kindsChosen} — reading all ${tiles.length} in one pass takes about ${TYPICAL_EXTRACTION_SECONDS} seconds.`
```
- **`:323-327`**: replace the intro paragraph with:
```tsx
          <p className="mb-1.5 text-[17px] font-semibold text-ink">Pick your screenshots</p>
          <p className="mx-auto mb-6 max-w-[32ch] text-[13px] font-medium text-ink-2">
            The summary, the splits table, the heart-rate screen — or, when the watch gave you no
            splits table, the Workout Details screen in its place. Any one of them on its own is
            fine — more screens just means more of the run gets read.
          </p>
```
- **`:388-392`**: replace the status paragraph's body with:
```tsx
          <p className="mt-2.5 text-center text-[12px] font-medium text-ink-3">
            {ready ? readingLine : 'Waiting for the uploads to finish.'}
          </p>
```

**File:** `components/extract/UploadPicker.test.tsx`. In `describe('UploadPicker — fixing a mislabel swaps instead of subtracting', …)`, add after the `re-uploads only the tile whose kind was free` test:
```tsx
  it('relabels a tile as Workout Details: it re-uploads with the details kind signed in, and says the chart is measured', async () => {
    await twoReadyTiles()

    // Workout Details is free, so only tile 2 (defaulted to Splits) redoes.
    fireEvent.click(radioOf(groups()[1]!, 'Workout Details'))
    await flush()
    await flush()
    await flush()

    expect(radioOf(groups()[0]!, 'Heart rate')).toBeChecked()
    expect(radioOf(groups()[1]!, 'Workout Details')).toBeChecked()
    expect(upload).toHaveBeenCalledTimes(3)
    expect(upload.mock.calls[2]![2]).toMatchObject({
      clientPayload: JSON.stringify({ kind: 'details' }),
    })
    expect(
      screen.getByText(
        `Heart rate · Workout Details — read in about ${TYPICAL_EXTRACTION_SECONDS} seconds, with the pace chart measured rather than read.`,
      ),
    ).toBeInTheDocument()
  })
```

**File:** `components/extract/ExtractingSkeleton.tsx`
- **`:13-35`** doc comment: after the paragraph that ends `…precisely the fabricated progress the design's own principle forbids.`, insert:
```tsx
 *
 * (A Workout Details screenshot is the one exception to "ONE vision call": it is read by a second,
 * one-image call beside the main one and its pace chart is measured by code. The copy says so
 * rather than claiming one pass.)
```
- **`:49`**: keep `const overdue = …` and add below it:
```tsx
  const hasDetails = photos.some((photo) => photo.kind === 'details')
```
- **`:73-78`**: replace the `<> All … </>` fragment (the non-`gaveUp` branch) with:
```tsx
          ) : hasDetails ? (
            <>
              Your screens are read together, and the Workout Details pace chart is measured, not
              guessed. Usually about {TYPICAL_EXTRACTION_SECONDS} seconds
              {overdue ? ' — this one is running long.' : '.'}
            </>
          ) : (
            <>
              All {photos.length === 1 ? 'of it' : `${photos.length} screens`} in one pass, so the
              reader can check the total against the splits. Usually about{' '}
              {TYPICAL_EXTRACTION_SECONDS} seconds
              {overdue ? ' — this one is running long.' : '.'}
            </>
          )}
```
(The ternary is now `gaveUp ? (…) : hasDetails ? (…) : (…)`. The `gaveUp` branch is unchanged.)

**File:** `components/extract/ExtractingSkeleton.test.tsx`. Append inside the main `describe`:
```tsx
  it('does not claim one pass when a Workout Details screenshot is read beside the others', () => {
    renderSkeleton({
      photos: [photo('summary', 'summary.jpg'), photo('details', 'details.jpg')],
    })

    expect(screen.getByText(/Workout Details pace chart is measured, not guessed/)).toBeInTheDocument()
    expect(screen.queryByText(/in one pass/)).not.toBeInTheDocument()
    expect(screen.getByText('Workout Details')).toBeInTheDocument()
  })
```
**Impact:** `npx vitest run components/extract tests/extract.kindSelector.test.ts tests/extract.onPickPurity.test.ts` passes.

### Step 7: Review state and the server-side flags

**File:** `lib/review/estimated.ts` (new)
**Code:**
```ts
import type { EstimatedValues } from '@/lib/schema/detailsPrinted'

/**
 * **The one rule for "is this value still the chart's estimate?"** — read by the review screen to
 * draw the "Estimated from the pace chart" labels, and by `commitReview` on the SERVER to decide
 * `runs.distance_estimated` / `runs.splits_estimated`. One function for both, so the label the
 * runner saw and the flag the run stores cannot disagree.
 *
 * PURE MODULE — the review screen is a client component.
 *
 * Assumption A5: typing a different distance makes it the runner's value; splits stay estimated
 * while the run keeps any row (an edited row is still a row the chart produced the shape of), and
 * removing every row clears it.
 */

/** Metre resolution: `runs.distance_m` is an integer, and every draft round-trips through it. */
function sameDistance(a: number, b: number): boolean {
  return Math.round(a * 1000) === Math.round(b * 1000)
}

export function distanceIsEstimated(
  estimated: EstimatedValues,
  draftDistanceKm: number | null,
): boolean {
  return (
    estimated.distanceKm !== null &&
    draftDistanceKm !== null &&
    sameDistance(draftDistanceKm, estimated.distanceKm)
  )
}

export function splitsAreEstimated(estimated: EstimatedValues, splitCount: number): boolean {
  return estimated.splits && splitCount > 0
}
```

**File:** `tests/review.estimated.test.ts` (new)
**Code:**
```ts
import { describe, expect, it } from 'vitest'

import { distanceIsEstimated, splitsAreEstimated } from '@/lib/review/estimated'

const ESTIMATED = { distanceKm: 6.1, splits: true }
const NONE = { distanceKm: null, splits: false }

describe('distanceIsEstimated — A5', () => {
  it('is true while the draft still holds the estimated distance, at metre resolution', () => {
    expect(distanceIsEstimated(ESTIMATED, 6.1)).toBe(true)
    expect(distanceIsEstimated(ESTIMATED, 6.1004)).toBe(true)
  })

  it('is false the moment the runner types another distance (R3.2)', () => {
    expect(distanceIsEstimated(ESTIMATED, 6.05)).toBe(false)
    expect(distanceIsEstimated(ESTIMATED, null)).toBe(false)
  })

  it('is false when nothing was estimated, whatever the draft says', () => {
    expect(distanceIsEstimated(NONE, 6.1)).toBe(false)
  })
})

describe('splitsAreEstimated — A5', () => {
  it('is true while any estimated row remains', () => {
    expect(splitsAreEstimated(ESTIMATED, 1)).toBe(true)
  })

  it('is false once every row is gone, or when nothing was estimated', () => {
    expect(splitsAreEstimated(ESTIMATED, 0)).toBe(false)
    expect(splitsAreEstimated(NONE, 7)).toBe(false)
  })
})
```

**File:** `lib/review/loadReview.ts`
- **`:9-16`**: add `import type { EstimatedValues } from '@/lib/schema/detailsPrinted'` below the `RawResponseColumn` import.
- **`:77-80`**: in `ReviewContext`, after `sourceImages` and before `committedRunId`, add:
```ts
  /**
   * Which baseline values were measured off the Workout Details pace chart rather than read off a
   * screen. Review mode: the extraction's stored `raw_response.details.estimate`. Edit mode: the
   * run's stored `distance_estimated` / `splits_estimated`. Drives the review screen's
   * "Estimated from the pace chart" labels and, on the server, `commitReview`'s flags — re-read
   * on every commit, never taken from the browser.
   */
  estimated: EstimatedValues
```
- **`:96-121`** (`loadExtractionReview`'s body from `const raw = …` to the end of the return): replace with:
```ts
  const raw = extraction.rawResponse as RawResponseColumn | null
  const status = extraction.status
  // A `failed` extraction has no session to hydrate from, by contract — §8's blank draft is what
  // `hydrateDraftFromExtraction(null)` returns, so the manual path needs no separate branch.
  const session = status === 'ok' || status === 'repaired' ? (raw?.parsedSession ?? null) : null
  // An estimate describes the session it was merged into; with no session there is nothing estimated.
  const estimate = session ? (raw?.details?.estimate ?? null) : null

  return {
    mode: 'review',
    extractionId,
    runId: null,
    baseline: hydrateDraftFromExtraction(session, now),
    photos: photos.map((p) => ({
      url: p.blobUrl,
      thumbUrl: p.thumbUrl,
      kind: p.kind,
      width: p.width,
      height: p.height,
    })),
    extractionStatus: status,
    errorCode: extraction.errorCode,
    rawVendorResponse: raw?.vendor ?? null,
    existingCorrections: extraction.corrections ?? null,
    sourceImages: extraction.blobUrls ?? [],
    estimated: { distanceKm: estimate?.distanceKm ?? null, splits: estimate?.splits ?? false },
    committedRunId,
  }
}
```
- **`:124-150`** (`loadRunEdit`): replace with:
```ts
/** `/r/[id]/edit` — the post-review baseline, read from `runs` and its children. */
export async function loadRunEdit(userId: string, runId: string): Promise<ReviewContext | null> {
  const detail = await getRunDetail(userId, runId)
  if (!detail) return null

  const extraction = detail.extractionId ? await getExtraction(userId, detail.extractionId) : null
  const raw = extraction?.rawResponse as RawResponseColumn | null | undefined
  const baseline = draftFromRun(detail, detail.splits, detail.zones)

  return {
    mode: 'edit',
    extractionId: detail.extractionId,
    runId,
    baseline,
    photos: detail.photos.map((p) => ({
      url: p.blobUrl,
      thumbUrl: p.thumbUrl,
      kind: p.kind,
      width: p.width,
      height: p.height,
    })),
    extractionStatus: extraction?.status ?? null,
    errorCode: extraction?.errorCode ?? null,
    rawVendorResponse: raw?.vendor ?? null,
    existingCorrections: extraction?.corrections ?? null,
    sourceImages: extraction?.blobUrls ?? [],
    // The stored flags (phase 2's columns). A flagged distance is "the distance stored now", so an
    // edit that keeps it keeps the flag and an edit that changes it clears it — same rule as review.
    estimated: {
      distanceKm: detail.distanceEstimated ? baseline.distanceKm : null,
      splits: detail.splitsEstimated,
    },
    committedRunId: runId,
  }
}
```

**File:** `tests/review.loadReview.test.ts`
- **`:70-112`** `runDetailRow`: add `distanceEstimated: false,` and `splitsEstimated: false,` after `extractionId: EXTRACTION_ID,`. These are phase 2's `RunDetail` fields.
- Append at the end of the file:
```ts
describe('ReviewContext.estimated — which values the chart produced', () => {
  it('review mode reads the stored extraction’s estimate', async () => {
    queries.getExtraction.mockResolvedValue(
      extractionRow({
        rawResponse: {
          vendor: null,
          parsedSession: { ...truthSession(), distanceKm: 6.1 },
          attempts: 1,
          details: { vendor: null, printed: null, estimate: { distanceKm: 6.1, splits: true } },
        },
      }),
    )
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)
    expect(context!.estimated).toEqual({ distanceKm: 6.1, splits: true })
  })

  it('review mode without a Workout Details screenshot estimates nothing', async () => {
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)
    expect(context!.estimated).toEqual({ distanceKm: null, splits: false })
  })

  it('a failed extraction estimates nothing, whatever its details block says', async () => {
    queries.getExtraction.mockResolvedValue(
      extractionRow({
        status: 'failed',
        errorCode: 'transport',
        rawResponse: {
          vendor: null,
          parsedSession: null,
          attempts: 1,
          details: { vendor: null, printed: null, estimate: { distanceKm: 6.1, splits: true } },
        },
      }),
    )
    const context = await loadExtractionReview(USER, EXTRACTION_ID, NOW)
    expect(context!.estimated).toEqual({ distanceKm: null, splits: false })
  })

  it('edit mode reads the run’s stored flags, against the stored distance', async () => {
    queries.getRunDetail.mockResolvedValue(
      runDetailRow({ distanceEstimated: true, splitsEstimated: true }),
    )
    const context = await loadRunEdit(USER, RUN_ID)
    expect(context!.estimated).toEqual({ distanceKm: 10.67, splits: true })
  })

  it('edit mode of an unflagged run estimates nothing', async () => {
    const context = await loadRunEdit(USER, RUN_ID)
    expect(context!.estimated).toEqual({ distanceKm: null, splits: false })
  })
})
```

**File:** `lib/review/checks.ts`
- **`:53-62`**: after the `CheckableDraft` interface and before `const pass = …`, add:
```ts
/** What the checks need to know beyond the numbers. */
export interface CheckOptions {
  /**
   * True when the draft's splits are chart estimates (`lib/extract/chart/*`, from a Workout
   * Details screenshot). CHK-1 then passes unconditionally: the estimator spreads the printed
   * duration across the rows, so they sum to it (or fall short by a folded-away remainder of at
   * most 0.05 km, ~25 s), and the check could only ever fire on that, on rounding or on a duration
   * edited afterwards — none of which any split row can be corrected for, so it would be a nag
   * about an estimate, not a pointer at a misread.
   *
   * CHK-3 and CHK-4 run as usual. CHK-3 passes vacuously when no average pace was printed (Apple
   * prints `--'--"` without a distance); when one was, it checks the estimated distance against
   * Apple's own average, which is real signal.
   */
  splitsEstimated: boolean
}

const NO_ESTIMATE: CheckOptions = { splitsEstimated: false }
```
- **`:249-260`**: replace `runAllChecks` and `failingChecks` with:
```ts
export function runAllChecks(
  draft: CheckableDraft,
  options: CheckOptions = NO_ESTIMATE,
): CheckResult[] {
  return [
    options.splitsEstimated
      ? pass('splits_sum_vs_duration')
      : splitsSumVsDuration(draft.splits, draft.durationSec),
    zonesSumVsDuration(draft.hrZones, draft.durationSec),
    distancePaceVsDuration(draft.distanceKm, draft.avgPaceSecPerKm, draft.durationSec),
    partialConsistency(draft.splits, draft.distanceKm),
  ]
}

export function failingChecks(draft: CheckableDraft, options: CheckOptions): CheckResult[] {
  return runAllChecks(draft, options).filter((c) => !c.ok)
}
```
- **`:308-311`**: replace with:
```ts
/** `runAllChecks` over a full draft — the review screen's one call site. */
export function checkDraft(draft: ReviewDraft, options: CheckOptions): CheckResult[] {
  return runAllChecks(draft, options)
}
```

**File:** `tests/review.checks.test.ts`. Append at the end of the file:
```ts
describe('chart-estimated splits (Workout Details)', () => {
  it('CHK-1 never fires on estimated splits — they are the duration spread over the chart', () => {
    const off = SPLITS.map((s, i) => (i === 0 ? { ...s, timeSec: s.timeSec + 120 } : s))
    const estimated = runAllChecks(draft({ splits: off }), { splitsEstimated: true })
    expect(estimated.find((r) => r.id === 'splits_sum_vs_duration')!.ok).toBe(true)
    // The control: the same rows, transcribed, are a misread CHK-1 must point at.
    expect(runAllChecks(draft({ splits: off })).find((r) => r.id === 'splits_sum_vs_duration')!.ok).toBe(
      false,
    )
  })

  it('CHK-3 has nothing to compare when an estimated distance meets no printed average pace', () => {
    const results = runAllChecks(draft({ distanceKm: 6.1, avgPaceSecPerKm: null }), {
      splitsEstimated: true,
    })
    expect(results.find((r) => r.id === 'distance_pace_vs_duration')!.ok).toBe(true)
  })
})
```

**File:** `lib/review/schema.ts:217-264`. Replace `toRunInput`'s signature and return with this complete function (the doc comment above it stays):
```ts
export function toRunInput(
  draft: ReviewDraftInput,
  options: {
    source: RunSource
    extractionId: string | null
    /**
     * Derived by `commitReview` on the server from the stored extraction (or the stored run),
     * never from the browser. Omitted = the query layer's default (false on create, unchanged on
     * edit).
     */
    estimated?: { distanceEstimated: boolean; splitsEstimated: boolean }
  },
): NewRunInput {
  const distanceM = Math.round(draft.distanceKm * 1000)
  const avgPaceSec =
    draft.avgPaceSecPerKm ?? Math.round(draft.durationSec / (distanceM / 1000)) ?? 0

  return {
    occurredOn: draft.occurredOn,
    startedAt: widenTime(draft.startTime),
    endedAt: widenTime(draft.endTime),
    activityType: draft.activityType ?? 'Outdoor Run',
    location: draft.location,
    durationSec: draft.durationSec,
    distanceM,
    activeKcal: draft.activeKcal,
    totalKcal: draft.totalKcal,
    elevationM: draft.elevationGainM,
    avgCadence: draft.avgCadenceSpm,
    avgPaceSec,
    avgHr: draft.avgHrBpm,
    maxHr: draft.maxHrBpm,
    restingHr: draft.restingHrBpm,
    intent: draft.intent,
    // R-9 — positional, because that is how Apple prints them: end of run, then +1 min. The
    // +2 min reading is reviewable and gets no column, by ruling.
    endHrBpm: draft.postWorkoutHr[0]?.bpm ?? null,
    hr1MinPostBpm: draft.postWorkoutHr[1]?.bpm ?? null,
    note: draft.note,
    source: options.source,
    extractionId: options.extractionId,
    ...(options.estimated ?? {}),
    splits: draft.splits.map((s) => ({
      km: s.km,
      timeSec: s.timeSec,
      paceSec: s.paceSecPerKm,
      hr: s.hrBpm,
      cadence: s.cadenceSpm,
      partial: s.partial,
    })),
    zones: draft.hrZones.map((z) => ({
      zone: z.zone,
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
  }
}
```

**File:** `tests/review.schema.test.ts`. Append inside `describe('toRunInput — D5’s unit conversion, once', …)`, before its closing `})`:
```ts
  it('carries the server-derived estimated flags through to the run input', () => {
    const input = toRunInput(parsed(), {
      source: 'screenshot',
      extractionId: 'x',
      estimated: { distanceEstimated: true, splitsEstimated: false },
    })
    expect(input.distanceEstimated).toBe(true)
    expect(input.splitsEstimated).toBe(false)
  })

  it('omits the flags when none were derived — the query layer’s default applies', () => {
    const input = toRunInput(parsed(), { source: 'screenshot', extractionId: 'x' })
    expect(input).not.toHaveProperty('distanceEstimated')
    expect(input).not.toHaveProperty('splitsEstimated')
  })
```

**File:** `lib/review/commit.ts`
- **`:17-19`**: add `import { distanceIsEstimated, splitsAreEstimated } from './estimated'` below the `./checks` import.
- **`:152-168`**: replace from the `/* 2 — attribute each edit …` comment through the end of the `toRunInput(…)` call with:
```ts
  /* 2 — attribute each edit to the check that pointed at it, if any. Computed against the
   * BASELINE's failing checks, not the corrected draft's: by the time a number is fixed, the
   * check that flagged it has stopped firing. */
  const baselineFailures = failingChecks(context.baseline, {
    splitsEstimated: splitsAreEstimated(context.estimated, context.baseline.splits.length),
  })
  const phase = phaseFor(context)
  const corrections = diffCorrections(context.baseline, draft, {
    phase,
    correctedAt: now().toISOString(),
    checkIdFor: (path) => checkIdForFieldPath(baselineFailures, path),
  })
  const changedFieldPaths = Object.keys(corrections)

  /* 3 — the write. The estimated flags are derived HERE, from the baseline the server just re-read
   * (the stored extraction's estimate, or the stored run's flags) against the validated draft —
   * invariant 5: no flag is read from the browser. Same rule the review screen labels with
   * (`lib/review/estimated.ts`), so what the runner saw labelled is what the run stores. */
  const runInput = toRunInput(draft, {
    source: phase === 'manual' ? 'manual' : 'screenshot',
    extractionId: context.extractionId,
    estimated: {
      distanceEstimated: distanceIsEstimated(context.estimated, draft.distanceKm),
      splitsEstimated: splitsAreEstimated(context.estimated, draft.splits.length),
    },
  })
```
(Edit mode needs no other change. `const { splits, zones, source: _source, ...patch } = runInput`
keeps both flags in `patch`, and `applyRunCorrections` writes them. A kept estimated distance stays
`true`, a changed one becomes `false`, and an unflagged run stays `false`, which is exactly
"distance changed ⇒ false; all splits removed ⇒ false; otherwise unchanged".)

**File:** `tests/review.commit.test.ts`
- **`:212-251`**, the R-8 `getRunDetail` fixture: add `distanceEstimated: false,` and `splitsEstimated: false,` after `extractionId: EXTRACTION_ID,`.
- Inside `describe('the post-review edit (R-8)', …)`, after the `replaces splits and zones wholesale…` test (`:312-320`), add:
```ts
  it('derives the estimated flags for an edit from the stored run: kept stays, changed clears (A5)', async () => {
    const stored = await queries.getRunDetail(USER, RUN_ID)
    queries.getRunDetail.mockResolvedValue({ ...stored, distanceEstimated: true, splitsEstimated: true })

    await commitReview(USER, payload(baselineDraft(), RUN_ID), { now })
    expect(queries.applyRunCorrections.mock.calls[0]![2]).toMatchObject({
      distanceEstimated: true,
      splitsEstimated: true,
    })

    const changed = baselineDraft()
    changed.distanceKm = 10.5
    changed.splits = []
    await commitReview(USER, payload(changed, RUN_ID), { now })
    expect(queries.applyRunCorrections.mock.calls[1]![2]).toMatchObject({
      distanceEstimated: false,
      splitsEstimated: false,
    })
  })
```
- Append at the end of the file:
```ts
describe('chart-estimated values — the flags are derived on the server (R4.1, R3.2)', () => {
  function sundaySession(): ExtractedSession {
    return { ...truthSession(), distanceKm: 6.1 }
  }
  function estimatedRow(
    estimate: { distanceKm: number | null; splits: boolean },
    session: ExtractedSession,
  ) {
    return extractionRow({
      rawResponse: {
        vendor: null,
        parsedSession: session,
        attempts: 1,
        details: { vendor: null, printed: null, estimate },
      },
    })
  }

  it('persists both flags when the estimated distance and splits are confirmed as they are', async () => {
    queries.getExtraction.mockResolvedValue(
      estimatedRow({ distanceKm: 6.1, splits: true }, sundaySession()),
    )
    await commitReview(USER, payload(hydrateDraftFromExtraction(sundaySession(), NOW)), { now })

    const [, input] = queries.commitExtractedRun.mock.calls[0]!
    expect(input.distanceEstimated).toBe(true)
    expect(input.splitsEstimated).toBe(true)
  })

  it('stores the runner’s distance, not flagged, when they changed the estimate (R3.2)', async () => {
    queries.getExtraction.mockResolvedValue(
      estimatedRow({ distanceKm: 6.1, splits: true }, sundaySession()),
    )
    const draft = hydrateDraftFromExtraction(sundaySession(), NOW)
    draft.distanceKm = 6.05
    await commitReview(USER, payload(draft), { now })

    const [, input] = queries.commitExtractedRun.mock.calls[0]!
    expect(input.distanceM).toBe(6050)
    expect(input.distanceEstimated).toBe(false)
    expect(input.splitsEstimated).toBe(true)
  })

  it('flags only the splits when the distance was transcribed', async () => {
    queries.getExtraction.mockResolvedValue(
      estimatedRow({ distanceKm: null, splits: true }, truthSession()),
    )
    await commitReview(USER, payload(baselineDraft()), { now })

    const [, input] = queries.commitExtractedRun.mock.calls[0]!
    expect(input.distanceEstimated).toBe(false)
    expect(input.splitsEstimated).toBe(true)
  })

  it('clears the splits flag when the runner removed every estimated row', async () => {
    queries.getExtraction.mockResolvedValue(
      estimatedRow({ distanceKm: 6.1, splits: true }, sundaySession()),
    )
    const draft = hydrateDraftFromExtraction(sundaySession(), NOW)
    draft.splits = []
    await commitReview(USER, payload(draft), { now })

    const [, input] = queries.commitExtractedRun.mock.calls[0]!
    expect(input.splitsEstimated).toBe(false)
  })

  it('ignores any flag the browser sends — only the stored extraction decides (invariant 5)', async () => {
    const draft = { ...baselineDraft(), distanceEstimated: true, splitsEstimated: true }
    await commitReview(
      USER,
      { ...payload(draft as unknown as ReviewDraft), distanceEstimated: true, splitsEstimated: true },
      { now },
    )

    const [, input] = queries.commitExtractedRun.mock.calls[0]!
    expect(input.distanceEstimated).toBe(false)
    expect(input.splitsEstimated).toBe(false)
  })
})
```
**Impact:** `npx vitest run tests/review.estimated.test.ts tests/review.loadReview.test.ts tests/review.checks.test.ts tests/review.schema.test.ts tests/review.commit.test.ts tests/capture` passes. (`tests/capture/dataset.test.ts` calls `runAllChecks(session)` with the default options, so it is unchanged.)

### Step 8: The review screen labels estimated values

**File:** `components/review/HeroFields.tsx:36-81`. Replace the function head and the Distance field (through the closing `</HeroField>` of Distance) with:
```tsx
export function HeroFields({
  draft,
  flaggedPaths,
  editedPaths,
  errors,
  onChange,
  distanceEstimated,
  distanceRef,
}: {
  draft: ReviewDraft
  flaggedPaths: ReadonlySet<string>
  editedPaths: ReadonlySet<string>
  errors: Record<string, string>
  onChange: (patch: Partial<ReviewDraft>) => void
  /**
   * True while the distance is still the one measured off the Workout Details pace chart
   * (`lib/review/estimated.ts`). The label goes the moment the runner types another distance.
   */
  distanceEstimated: boolean
  distanceRef?: React.Ref<HTMLInputElement>
}) {
  const chipFor = (path: string) =>
    flaggedPaths.has(path) ? 'check' : editedPaths.has(path) ? 'edited' : 'scan'

  return (
    <section
      aria-labelledby="review-hero-heading"
      className="scroll-mt-4 rounded-card bg-card p-5 shadow-card"
    >
      <h2 id="review-hero-heading" className="sr-only">
        The run
      </h2>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <HeroField
          label="Distance"
          suffix="km"
          chip={chipFor('distanceKm')}
          error={errors['distanceKm']}
        >
          <ParsedInput
            ref={distanceRef}
            value={draft.distanceKm}
            toText={toDistanceInput}
            parse={parseDistanceInput}
            onChange={(distanceKm) => onChange({ distanceKm })}
            inputMode="decimal"
            placeholder="10.67"
            aria-label="Distance in kilometres"
            className="pr-10"
          />
          {distanceEstimated && (
            <p className="mt-1.5 text-[11px] font-medium text-ink-3">
              Estimated from the pace chart
            </p>
          )}
        </HeroField>
```
(The rest of the component, from the Duration `HeroField` on, is unchanged.)

**File:** `components/review/HeroFields.test.tsx`
- **`:29-48`** `renderFields`: add `distanceEstimated?: boolean` to the overrides type, and pass `distanceEstimated={overrides.distanceEstimated ?? false}` to `<HeroFields …>`.
- **`:87-108`**: add `distanceEstimated={false}` to both direct `<HeroFields …>` renders in the `an edited path earns its edited chip…` test.
- Append at the end of the file:
```tsx
describe('HeroFields — a distance measured off the pace chart', () => {
  it('labels the distance as estimated while it still is (R3.1)', () => {
    renderFields({ distanceEstimated: true })
    expect(screen.getByText('Estimated from the pace chart')).toBeInTheDocument()
  })

  it('says nothing for a transcribed distance', () => {
    renderFields({ distanceEstimated: false })
    expect(screen.queryByText('Estimated from the pace chart')).not.toBeInTheDocument()
  })
})
```

**File:** `components/review/SplitsTable.tsx`
- **`:34-52`**: replace the function head with:
```tsx
export function SplitsTable({
  splits,
  photos,
  flagged,
  estimated,
  editedPaths,
  errors,
  onChange,
  ref,
}: {
  splits: DraftSplit[]
  photos: ReviewPhoto[]
  /** True when CHK-1 or CHK-4 is pointing at this block. */
  flagged: boolean
  /** True while these rows are the chart's estimate (`lib/review/estimated.ts`). */
  estimated: boolean
  /** Dot-paths already corrected by hand in this session — the `edited` chip (R-46). */
  editedPaths: ReadonlySet<string>
  errors: Record<string, string>
  onChange: (splits: DraftSplit[]) => void
  ref?: React.Ref<HTMLDivElement>
}) {
```
- **`:102-104`**: directly after the `{errors['splits'] && (…)}` block, insert:
```tsx
      {estimated && splits.length > 0 && (
        <p className="mb-3 text-[11px] font-medium text-ink-3">
          Estimated from the pace chart: no splits table was uploaded, so these rows were measured
          off the Workout Details bars. Check them against your watch.
        </p>
      )}
```
- **`:187-197`**: add `estimated={estimated}` to the `<SplitSheet …>` props.
- **`:202-238`**: in `SplitSheet`, add `estimated` to the destructured props, add `estimated: boolean` to its props type, and change `<SheetSource photos={photos} section="splits" />` to:
```tsx
      {/* An estimated row came from the Workout Details screenshot, so that is the evidence to pin. */}
      <SheetSource photos={photos} section={estimated ? 'details' : 'splits'} />
```

**File:** `components/review/SplitsTable.test.tsx`
- **`:26-48`** `renderTable`: add `estimated?: boolean` to the overrides type and `estimated: overrides.estimated ?? false,` to `base`.
- Append at the end of the file:
```tsx
describe('SplitsTable — rows measured off the pace chart', () => {
  it('labels the rows as estimated while there are rows (R3.1)', () => {
    renderTable({ estimated: true })
    expect(screen.getByText(/^Estimated from the pace chart:/)).toBeInTheDocument()
  })

  it('says nothing once every row is gone, or for a transcribed table', () => {
    renderTable({ estimated: true, splits: [] })
    expect(screen.queryByText(/^Estimated from the pace chart:/)).not.toBeInTheDocument()
  })
})
```

**File:** `components/review/ReviewClient.tsx`
- **`:10`**: leave the existing imports as they are, and add this line directly below the `diffCorrections` import:
```tsx
import { distanceIsEstimated, splitsAreEstimated } from '@/lib/review/estimated'
```
- **`:70-71`**: replace the two `useMemo` lines (`checks`, `flagged`) with:
```tsx
  // The chart-estimate labels, by the same rule `commitReview` stores the flags with — so the
  // label disappears for the distance the moment the runner types another one.
  const distanceEstimated = distanceIsEstimated(context.estimated, draft.distanceKm)
  const splitsEstimated = splitsAreEstimated(context.estimated, draft.splits.length)

  const checks = React.useMemo(
    () => checkDraft(draft, { splitsEstimated }),
    [draft, splitsEstimated],
  )
  const flagged = React.useMemo(() => collectFlagged(checks), [checks])
```
- **`:126-133`**: add `distanceEstimated={distanceEstimated}` to `<HeroFields …>`.
- **`:148-156`**: add `estimated={splitsEstimated}` to `<SplitsTable …>`.

**File:** `components/review/ReviewClient.test.tsx`
- **`:45-67`**, the `HeroFields` stub: add `distanceEstimated: boolean` to its props type, add `distanceEstimated: props.distanceEstimated` to the serialized `data-props`, and add a second button inside the stub `<div>`:
```tsx
      <button type="button" onClick={() => props.onChange({ distanceKm: 6.05 })}>
        edit-distance
      </button>
```
- **`:88-95`**, the `SplitsTable` stub: add `estimated: boolean` to its props type and `estimated: props.estimated` to its `data-props`.
- **`:108-123`**, the `context()` factory: add `estimated: { distanceKm: null, splits: false },` after `sourceImages: [],`.
- Append at the end of the file:
```tsx
describe('ReviewClient — chart-estimated values (Workout Details)', () => {
  function estimatedContext() {
    const session = { ...JSON.parse(JSON.stringify(TRUTH)), distanceKm: 6.1 }
    return context({
      baseline: hydrateDraftFromExtraction(session as never, NOW),
      estimated: { distanceKm: 6.1, splits: true },
    })
  }

  it('labels the estimated distance and splits while the draft holds them (R3.1)', () => {
    renderClient({ context: estimatedContext() })
    expect(propsOf(section('hero')).distanceEstimated).toBe(true)
    expect(propsOf(section('splits')).estimated).toBe(true)
  })

  it('drops the distance label the moment the runner types another distance; splits keep theirs', () => {
    renderClient({ context: estimatedContext() })
    fireEvent.click(screen.getByRole('button', { name: 'edit-distance' }))
    expect(propsOf(section('hero')).distanceEstimated).toBe(false)
    expect(propsOf(section('splits')).estimated).toBe(true)
  })

  it('does not run the splits-sum check against estimated splits', () => {
    renderClient({ context: estimatedContext() })
    fireEvent.click(screen.getByRole('button', { name: 'edit-duration' }))
    expect(propsOf(section('banner')).failing).not.toContain('splits_sum_vs_duration')
  })

  it('labels nothing on an ordinary extraction', () => {
    renderClient()
    expect(propsOf(section('hero')).distanceEstimated).toBe(false)
    expect(propsOf(section('splits')).estimated).toBe(false)
  })
})
```
(`renderClient`, `propsOf`, `section`, `context`, `TRUTH`, `NOW`, `hydrateDraftFromExtraction` and
`fireEvent` already exist in this file.)

**File:** `components/review/ReviewScreen.test.tsx:35-58`. In the `context()` factory, add `estimated: { distanceKm: null, splits: false },` after `sourceImages: [],`.

**Impact:** `npx vitest run components/review` passes, and so does `npm run typecheck`.

### Step 9: The live reading test (paid, opt-in)

**File:** `tests/live/visionDetails.live.test.ts` (new)
**Code:**
```ts
// MUST be first: it loads .env.local before any import below reaches lib/env.ts.
import { hasRealLlmKey } from './loadEnvLocal'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractJsonObject } from '@/lib/llm/extractJson'
import { TOKEN_FLOOR_PER_IMAGE } from '@/lib/llm/vision'
import { DetailsPrintedSchema, type DetailsPrinted } from '@/lib/schema/detailsPrinted'

/**
 * THE TAGGED LIVE SUITE for the Workout Details reading. Never part of CI.
 * `npm run test:live:vision-details` — two real `glm-4.6v` calls, one per committed fixture, sent
 * as phase 1's committed SHIPPED-recipe JPEG (560 px / q80, what a browser upload actually sends).
 * The truth values were read off the screenshots by hand; the prompt's worked examples use other
 * numbers on purpose, so a pass cannot come from the model copying an example.
 */

const DIR = process.env.RI_DETAILS_FIXTURE_DIR ?? 'research/fixtures/workout-details/shipped'

const CASES: Array<{ file: string; truth: DetailsPrinted }> = [
  {
    file: '2026-11-22-details.jpg',
    truth: {
      durationSec: 3046,
      distanceKm: null,
      paceSlowestSecPerKm: 552,
      paceFastestSecPerKm: 407,
      avgPaceSecPerKm: null,
      hrMinBpm: 116,
      hrMaxBpm: 177,
      avgHrBpm: 161,
      elevationGainM: 4,
    },
  },
  {
    file: '2026-11-20-details.jpg',
    truth: {
      durationSec: 2773,
      distanceKm: null,
      paceSlowestSecPerKm: 497,
      paceFastestSecPerKm: 365,
      avgPaceSecPerKm: 459,
      hrMinBpm: 101,
      hrMaxBpm: 186,
      avgHrBpm: 169,
      elevationGainM: 6,
    },
  },
]

const runnable =
  hasRealLlmKey(process.env.LLM_API_KEY) && CASES.every((c) => existsSync(path.join(DIR, c.file)))

function shippedDataUri(file: string): string {
  return `data:image/jpeg;base64,${readFileSync(path.join(DIR, file)).toString('base64')}`
}

describe.skipIf(!runnable)('live: glm-4.6v reads the Workout Details screen', () => {
  it.each(CASES)('reads every printed number on $file', async ({ file, truth }) => {
    const { callVisionDetails } = await import('@/lib/llm/vision')
    const result = await callVisionDetails({ dataUri: shippedDataUri(file) }, { timeoutMs: 120_000 })
    console.log(`[live] ${file} in=${result.promptTokens} out=${result.completionTokens}\n${result.text}`)

    expect(result.promptTokens).toBeGreaterThanOrEqual(TOKEN_FLOOR_PER_IMAGE)
    const parsed = DetailsPrintedSchema.safeParse(extractJsonObject(result.text))
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data).toEqual(truth)
  })
})
```

**File:** `package.json`. After the `"test:live:vision": …` line (`:69`), add:
```json
    "test:live:vision-details": "LLM_LIVE_TEST=1 vitest run tests/live/visionDetails.live.test.ts",
```
**Impact:** CI is unaffected (`tests/live/**` is excluded unless `LLM_LIVE_TEST=1`). The suite costs two calls when it is run.

### Step 10: Docs and the feature map

**File:** `docs/architecture.md:172-218`. Replace the fenced pipeline diagram with:
````text
```
/upload          1–3 screenshots, per-tile kind (default order = DEVICE hand-off order:
                 heartrate → splits → summary, F29; wrong label = one-tap swap, F16b).
                 4th kind "Workout Details" (`details`): Apple's Workout Details screen, tapped
                 in place of Splits when the watch printed no split table; never a default
   │ client: compressForExtraction — JPEG q80, short edge 560 (long-edge arithmetic,
   │         resizeTarget.ts; verified in pixels by scripts/shipped-image-recipe.py)
   ▼
POST /api/upload    Blob client-upload handshake; kind rides the signed token
   ▼
POST /api/extract   requireUserIdApi() → insert extractions(status='pending') → 202 in <500ms
   │                (a `details` run_photos row is inserted excluded_from_share — route map)
   │                after(() => runExtractionJob(id))   [maxDuration = 60, literal]
   ▼
runExtractionJob    fetch blob URLs (SSRF-guarded: host must be *.public.blob.vercel-storage.com)
   │                ┌─ PRIMARY (summary/splits/heartrate only — a details image never joins it):
   │                │  data URIs → callVision  ── THE TOKEN-FLOOR GUARD ──
   │                │  usage.prompt_tokens ≥ 500 × imageCount, checked BEFORE the text is ever
   │                │  read; the measured drop signature is 141 tokens (endpoint 200s and silently
   │                │  drops images, and the model invents plausible numbers). Trip ⇒ fail fast,
   │                │  no repair. Prompt byte-frozen (sha-256 pinned by extraction.frozen.test.ts)
   │                │  → Zod (lib/schema/extractedSession.ts, FIELD_SOURCES provenance null-out:
   │                │    fields from a screen that wasn't uploaded are discarded, not flagged;
   │                │    normalizeClockTime repairs "5.32 PM"→"17:32" and nulls ambiguous bare times)
   │                │  → one TEXT-ONLY repair round-trip (imageCount: 0 — measured: a repair that
   │                │    inherited 3-image floor would always die), budget-gated by elapsed time
   │                ├─ DETAILS, IN PARALLEL (lib/llm/readDetails.ts): its own one-image call
   │                │  (prompts/details.ts, printed numbers only, floor 500 × 1, no repair) + the
   │                │  sharp decode → lib/extract/detailsMerge.ts: printed values fill nulls only;
   │                │  no splits screenshot ⇒ lib/extract/chart estimateFromCharts (pure) → estimated
   │                │  splits fill the empty table, the estimated distance fills a null distance
   │                │  (a transcribed distance scales the splits instead). Any failure here = no
   │                │  estimate, never a failed extraction.
   │                └─ raw_response = { vendor, parsedSession, attempts, details?: { vendor,
   │                   printed, estimate: { distanceKm, splits } } }
   │                → terminal row: ok | repaired | failed (token_floor|transport|timeout|validation)
   │                  — the primary decides; a details-only upload is decided by its reading
   ▼
GET /api/extract/[id]   poll (2s→3s→5s backoff); lazy self-heal flips >90s 'pending' to
   │                    failed/stale_timeout — no queue, no cron
   ▼
/x/[extractionId]   the review screen (ExtractionGate is the F04/F05 seam)
   │                ConsistencyBanner: four arithmetic cross-checks (splits Σ=duration,
   │                zones Σ=duration, distance×pace=duration, partial-km) derived from the
   │                data, not from model confidence — the fixture's real observed miss (436
   │                vs 396) trips CHK-1. CHK-1 is skipped for chart-estimated splits (they are
   │                the printed duration spread over the chart, not a transcription).
   │                "Estimated from the pace chart" labels the estimated distance (gone once the
   │                runner types another) and estimated splits (lib/review/estimated.ts).
   │                Every field editable; sheets pin the source screenshot (whole image,
   │                section-based provenance — R-45 rejected bounding boxes)
   ▼
commitReview        validate → derive distanceEstimated/splitsEstimated ON THE SERVER from the
   │                stored estimate vs the validated draft (never from the browser) →
   │                commitExtractedRun (born-reviewed run + splits + zones,
   │                photo backfill, DuplicateRunError mapping) → corrections log →
   │                onRunCommitted (lib/derived/invalidate.ts):
   │                  records: full recompute (delete+insert)   [failures logged, never
   │                  badges:  ledger insert via dedupe PK          block the human's save]
   │                  insights: scope sweep so stale prose never renders
   │                  nina:    run_committed proactivity trigger fires from after()
   ▼
/r/[id]   hero, provenance mark (+ "distance/splits estimated from the pace chart" when
          runs.distance_estimated / splits_estimated), intent chips, narrative card (suspended, never blocking),
          pace+HR dual-axis chart (the app's ONE sanctioned dual axis, argued in F08 §12),
          zone bar (zero-JS), splits table (the chart's accessible twin)
```
````
(Reconciled: phase 2 hands every `docs/architecture.md` edit to this phase. The `/r/[id]` line above
carries its mark; §4.3 and §6 follow.)

**File:** `docs/architecture.md` §4.3 (`:157-166`). Append this paragraph after the existing one:
```markdown
`0038_*` (workout-details-estimate, phase 2) adds `runs.distance_estimated` and
`runs.splits_estimated`, both `boolean NOT NULL DEFAULT false`: additive, no backfill (every earlier
run reads `false`), and applied to production during that phase, before any code selecting the
columns could deploy, because a bare `select()` of `runs` names every column.
```

**File:** `docs/architecture.md` §6. In the **Records** bullet, after "`previousValue` snapshots the displaced value;", insert:
```markdown
  a run whose distance or splits were chart-estimated from a Workout Details screenshot
  (`runs.distance_estimated` / `splits_estimated`) is dropped in `qualifies` from every key that
  depends on the estimated value — `longest_distance`, `fastest_pace_5k`, `fastest_pace_10k`,
  `best_paced_run` for the distance; `fastest_km_split`, `best_paced_run` for the splits — so a ~1%
  estimate never mints a PB (badges are not gated);
```
In the **Insights** bullet, after "`promptVersion` (bump in the same commit as any prompt edit);", insert:
```markdown
  a run with an estimated value carries `session.estimated` in its facts, present only when a
  flag is true, so every unflagged run's `facts_hash` is unchanged;
```

**File:** `CLAUDE.md:58-66`. Replace the pipeline paragraph with:
```markdown
**The run pipeline** (`docs/architecture.md` §5 has the full diagram):
`/upload` → `POST /api/extract` inserts a `pending` row and returns in <500 ms, then
`after()` runs the actual vision call in the background (`glm-4.6v`, measured 33–38 s; the
token-floor guard checks `usage.prompt_tokens ≥ 500 × imageCount` *before* trusting any field,
because the endpoint silently drops images and hallucinates otherwise) → the client polls
`GET /api/extract/[id]` → **mandatory review** at `/x/[extractionId]` (not `/r/[id]/review` — no
`runs` row exists pre-commit) → `commitExtractedRun` (runs are *born reviewed*; there is no
draft-run state) → `onRunCommitted` fires records recompute, badge evaluation, insight
invalidation, and Nina's `run_committed` trigger. A fourth upload kind, **Workout Details**
(`details`), stands in for a missing splits table: it never joins the primary request (whose
prompt is byte-frozen and hash-pinned); its own one-image call reads its printed numbers in
parallel, `lib/extract/chart/*` measures its pace/HR charts into an estimated distance and splits,
review labels them "Estimated from the pace chart", and `commitReview` derives
`runs.distance_estimated` / `splits_estimated` on the server.
```

**File:** `.claude/skills/verify-run-insights/features/README.md`. In the index table:
- Upload row: replace the paid-calls cell `1 (2 with repair)` with `1 (2 with repair; 2 with a Workout Details screenshot)`, and the feature text with `Upload and the vision read: screenshots to Blob, \`glm-4.6v\` in the background (plus a parallel Workout Details read), the poll`.
- Review row: replace the feature text with `The mandatory review and commit: \`/x/<id>\`, consistency checks, "Estimated from the pace chart" labels, Confirm & save, records, badges, Nina's reaction`.

**File:** `.claude/skills/verify-run-insights/features/upload-extract.md`
- In `## Sub-features`, replace the bullet `- Kind per tile (summary, splits, heart rate), carried inside the signed token.` with:
```markdown
- Kind per tile (summary, splits, heart rate, **Workout Details**), carried inside the signed
  token. Workout Details (`details`) is Apple's Workout Details screen, tapped in place of Splits
  when the watch printed no split table; it is never a default. Its `run_photos` row is stored
  `excluded_from_share = true` (it shows the route map).
- A `details` image never joins the primary `glm-4.6v` request (its prompt is byte-frozen). A
  separate one-image call reads its printed numbers in parallel, `lib/extract/chart/*` measures the
  pace and heart-rate charts, and the job writes an estimated distance (only when none was
  transcribed) and estimated per-km splits (only when no splits screenshot was uploaded) into the
  parsed session, recording them in `raw_response.details.estimate`. A failure on that side means
  no estimate, never a failed extraction.
```
- At the end of `## Driving it with verify.sh`, add:
````markdown
With a Workout Details screenshot. Use the committed shipped-recipe JPEGs (560 px, q80: what a
browser upload sends), not the 739 px PNGs beside them:

```sh
FX=$PWD/research/fixtures/workout-details/shipped
$V upload RUN summary=$FX/2026-11-22-summary.jpg details=$FX/2026-11-22-details.jpg heartrate=$FX/2026-11-22-heartrate.jpg
# "status":"ok", distanceKm ~6.1, 7 splits (6 full + a partial). Budget: 2 llm calls.
$V sql RUN "select status, raw_response->'details'->'estimate' from extractions where id='<EXTRACTION_ID>'"
# ok | {"splits": true, "distanceKm": 6.1}
$V ui RUN .claude/skills/verify-run-insights/features/steps/upload-details.mjs -- \
  heartrate=$FX/2026-11-22-heartrate.jpg details=$FX/2026-11-22-details.jpg summary=$FX/2026-11-22-summary.jpg
# the browser path: picks three, taps "Workout Details" on tile 2, logs EXTRACTION=<id> and the labels
```
````
- In `## Gotchas`, add:
```markdown
- An upload with a Workout Details screenshot costs **2** llm calls (the primary read and the
  details read run in parallel); a Workout Details screenshot alone costs 1.
- `upload` sends the file's bytes as they are, so pass `research/fixtures/workout-details/shipped/*.jpg`,
  not the PNGs, or the run reads a 739 px image production never sees.
```

**File:** `.claude/skills/verify-run-insights/features/review-commit.md`
- In `## Sub-features`, add after the consistency-checks bullet:
```markdown
- Values measured off the Workout Details pace chart are labelled **Estimated from the pace chart**
  (under the distance, above the splits table). The distance label goes away once the runner types
  another distance. CHK-1 (splits Σ = duration) is skipped for estimated splits. On save,
  `commitReview` derives `runs.distance_estimated` / `runs.splits_estimated` on the server from the
  stored extraction, never from the browser.
```
- At the end of `## Driving it with verify.sh`, add:
````markdown
An extraction with a Workout Details screenshot (see upload-extract.md):

```sh
$V ui RUN .claude/skills/verify-run-insights/features/steps/review-details.mjs -- <EXTRACTION_ID> [DISTANCE_KM|-] [YYYY-MM-DD]
# logs "distance label: 1", "splits label: 1", "split rows: 7"; with a distance, "distance label now: 0"
$V sql RUN "select distance_m, distance_estimated, splits_estimated from runs where extraction_id='<EXTRACTION_ID>'"
```
````

**File:** `.claude/skills/verify-run-insights/features/steps/upload-details.mjs` (new)
**Code:**
```js
// verify.sh ui RUN features/steps/upload-details.mjs -- KIND=/abs/a.jpg [KIND=/abs/b.jpg ...]
// The upload screen with a Workout Details screenshot, the way a runner does it: pick the files in
// the order given (the device's order), set each tile's kind by tapping its label (the swap rule
// keeps them distinct), tap "Read this run", and wait on /x/<id> until the read settles. KIND is
// summary | splits | heartrate | details. Logs EXTRACTION=<id> and how many "Estimated from the
// pace chart" labels the review shows. Costs 2 paid llm calls with a details tile (the primary read
// and the details read, in parallel), 1 for a details-only upload.
const LABEL = {
  summary: 'Summary',
  splits: 'Splits',
  heartrate: 'Heart rate',
  details: 'Workout Details',
}

const steps = async ({ page, base, shot, log, args }) => {
  const specs = args.map((arg) => {
    const at = arg.indexOf('=')
    const kind = arg.slice(0, at)
    const file = arg.slice(at + 1)
    if (at < 1 || !LABEL[kind] || !file) throw new Error(`pass KIND=/abs/path.jpg, got ${arg}`)
    return { kind, file }
  })
  if (specs.length < 1 || specs.length > 3) throw new Error('pass 1-3 KIND=/abs/path.jpg')

  await page.goto(`${base}/upload`, { waitUntil: 'networkidle' })
  await page.locator('input[type="file"]').setInputFiles(specs.map((s) => s.file))
  const groups = page.getByRole('radiogroup', { name: 'Which screen is this?' })
  await groups.nth(specs.length - 1).waitFor()

  for (const [i, { kind }] of specs.entries()) {
    const radio = groups.nth(i).getByRole('radio', { name: LABEL[kind] })
    if ((await radio.getAttribute('aria-checked')) !== 'true') await radio.click()
  }
  for (const [i, { kind }] of specs.entries()) {
    const checked = await groups
      .nth(i)
      .getByRole('radio', { name: LABEL[kind] })
      .getAttribute('aria-checked')
    if (checked !== 'true') throw new Error(`tile ${i + 1} is not ${LABEL[kind]}`)
  }
  log(`tiles: ${specs.map((s) => LABEL[s.kind]).join(' · ')}`)

  // A relabelled tile re-compresses and re-PUTs; the button enables once every tile has landed.
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        x.textContent?.includes('Read this run'),
      )
      return b && !b.disabled
    },
    null,
    { timeout: 90_000 },
  )
  await shot('picked')
  await page.getByRole('button', { name: 'Read this run' }).click()
  await page.waitForURL(/\/x\/[^/]+$/, { timeout: 60_000 })
  const id = new URL(page.url()).pathname.split('/').pop()
  log(`EXTRACTION=${id}`)

  await page
    .getByText(/Nothing has been saved yet\.|could not read/i)
    .first()
    .waitFor({ timeout: 180_000 })
  log(`distance label: ${await page.getByText('Estimated from the pace chart', { exact: true }).count()}`)
  log(`splits label: ${await page.getByText(/^Estimated from the pace chart:/).count()}`)
  await shot('settled')
}

export default steps
```

**File:** `.claude/skills/verify-run-insights/features/steps/review-details.mjs` (new)
**Code:**
```js
// verify.sh ui RUN features/steps/review-details.mjs -- EXTRACTION_ID [DISTANCE_KM|-] [YYYY-MM-DD]
// The review screen for a read that had a Workout Details screenshot: logs the distance, the split
// rows and which values carry the "Estimated from the pace chart" label; optionally types a new
// distance (and logs whether the distance label went away) and re-dates the run (two commits on one
// date and start time collide on the dedupe index); then Confirm & save and land on /r/<runId>.
// A commit costs 2-3 paid llm calls (the narrative, Nina's reaction).
const steps = async ({ page, base, shot, log, args }) => {
  const [id, km, date] = args
  if (!id) throw new Error('pass the extraction id: -- EXTRACTION_ID [DISTANCE_KM|-] [YYYY-MM-DD]')
  await page.goto(`${base}/x/${id}`, { waitUntil: 'networkidle' })
  await page.getByText('Nothing has been saved yet.').waitFor()

  const distanceLabel = page.getByText('Estimated from the pace chart', { exact: true })
  const splitsLabel = page.getByText(/^Estimated from the pace chart:/)
  const distance = page.getByLabel('Distance in kilometres')
  log(`distance: ${await distance.inputValue()}`)
  log(`split rows: ${await page.getByRole('button', { name: /^Edit kilometre / }).count()}`)
  log(`distance label: ${await distanceLabel.count()}`)
  log(`splits label: ${await splitsLabel.count()}`)
  const checks = page.getByText(/thing(s)? worth checking|check(s)? still disagree/)
  log(`review banner: ${(await checks.count()) ? await checks.first().innerText() : 'no checks'}`)
  await shot('review')

  if (km && km !== '-') {
    await distance.fill(km)
    await distance.press('Tab')
    log(`distance set to ${km}; distance label now: ${await distanceLabel.count()}`)
  }
  if (date) {
    await page.getByLabel('The day this run happened').fill(date)
    log(`re-dated to ${date}`)
  }
  await shot('edited')

  await page.getByRole('button', { name: 'Confirm & save' }).click()
  await page.waitForURL(/\/r\/[^/]+$/, { timeout: 90_000 })
  log(`committed: ${new URL(page.url()).pathname}`)
  await page.waitForLoadState('networkidle')
  await shot('run')
}

export default steps
```

**File:** `.claude/skills/verify-run-insights/SKILL.md:138`. Below the row `| upload + vision read | 1 (2 if the repair pass fires) |`, add:
```markdown
| upload with a Workout Details screenshot | 2 (the primary read and the details read, in parallel; 1 if it is the only image) |
```

**File:** `.claude/skills/verify-run-insights/scripts/verify.sh`. This is a usage-text change only; behaviour is unchanged because the script already passes any `KIND=` through.
- `:15`: `#   verify.sh upload RUN [KIND=]IMAGE.jpg...` stays as it is. On the following comment line, append the kinds: `(kinds summary, splits, heartrate, details)`.
- `:423`: the die message becomes `"upload: at least one IMAGE.jpg (optionally KIND=IMAGE.jpg; kinds summary, splits, heartrate, details)"`.

**Impact:** docs only. `npm run format:check` passes once `npm run format` has been run on the edited markdown.

## Principles applied

- Laziness protocol: eight files the brief listed get no edit and are verified instead: `lib/schema/extractionResult.ts`, `app/api/upload/route.ts`, `PhotoViewer`, `ScreenshotStrip`, `PhotoInclusionList`, `app/photo/[kind]/[id]`, `sharedRun.ts` and `readExtraction.ts`. Each picks up the fourth kind through `SCREEN_KINDS`, `SCREEN_KIND_LABEL` or `PhotoKind`. The details call reuses `PRIMARY_TIMEOUT_MS` instead of adding an unmeasured constant. The poll contract is unchanged because the review page reads the estimate server-side.
- Make illegal states unrepresentable: `IMAGE_LABEL`, `PromptImage` and `FIELD_SOURCES` are keyed on `PrimaryScreenKind`, so typing a `details` image into the frozen primary request is a compile error. `DEFAULT_KIND_BY_INDEX` `satisfies readonly PrimaryScreenKind[]`, so `details` can never become a default. `RawResponseColumn.details` is an absent key, not a null object, when no details screenshot was read.
- Boundary discipline: the details reply is validated once, in `readWorkoutDetails` through `DetailsPrintedSchema`. That is where the `0'00''` → null rule and the inverted-range rule live. The merge and the estimator input trust the typed value. The estimated flags are derived once, on the server in `commitReview`, from the re-read baseline, and the browser's draft cannot carry them because `ReviewDraftSchema` strips unknown keys (tested).
- Encode lessons in structure: `extraction.frozen.test.ts` pins the sha-256 of both frozen strings and of the three-image and two-image user turns. The user-turn hashes catch the `images.length === SCREEN_KINDS.length` intro trap that a strings-only hash would miss. `lib/review/estimated.ts` is the single rule behind both the review label and the persisted flag, so the two cannot disagree.
- Test behavior, not implementation: the job is tested through `runExtractionJob` itself, asserting the rows it writes and the request it sends. Phase 1's estimator is stubbed only as a collaborator there, and `tests/extract.detailsMerge.test.ts` runs the real decode and estimator on the real fixtures.
- Sequence into verifiable units: steps 1–3 add new modules that compile against the unwidened types. Step 4 widens the kind and moves every consumer in one typecheck unit. Every step ends with a named vitest command.
- Prove it works: Proof drives the throwaway app through the real picker, `/api/upload`, `/api/extract`, review and commit, and reads `extractions`, `run_photos` and `runs` back with `sql`.

## Verification

**Build:** `npm run typecheck && npm run lint && npm run build`
**Tests:** `npm test`. Also: `npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:openrouter-guard && npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f11-guard && npm run ci:schema-drift-guard && npm run format:check`. Optional and paid (2 calls, outside the harness): `npm run test:live:vision-details`. It passes when both fixtures parse to exactly the hand-read truth.
**Proof:**
- Harness: `.claude/skills/verify-run-insights`. Prep, run once from the worktree root (`cd /home/miftah/.worktrees/run-insights/workout-details-estimate`). A fresh worktree first needs `.env.local` copied from `/home/miftah/run-insights/.env.local` and a real `npm install`.
  ```sh
  V=.claude/skills/verify-run-insights/scripts/verify.sh
  FX=$PWD/research/fixtures/workout-details/shipped   # phase 1's committed 560 × 1212 q80 JPEGs
  ls "$FX"/2026-11-2{0,2}-*.jpg | wc -l                 # 7
  $V up --seed=review --llm=80      # note the RUN= it prints; every command below uses it
  $V doctor $RUN
  ```
  Cost is not a constraint (owner, 2026-11-22: "use all paid model calls they needed. don't mind the cost"; index Decisions, verify budget row). `--llm=80` leaves room for re-runs; if the proof needs more, start a fresh run with a larger `--llm=N` (SKILL.md documents the flag) and never skip or trim a journey to save calls. This does not license raising the budget so a journey that fails on its merits passes.
- Feature-map entries: `features/upload-extract.md`, `features/review-commit.md` (both updated in Step 10)
- Journeys:
  - **J1** · traces R1.3 — `npx vitest run lib/llm/prompts/extraction.frozen.test.ts lib/llm/vision.test.ts lib/llm/runExtractionJob.test.ts -t "frozen|primary request"` → passes when every case passes: the sha-256 of `EXTRACTION_SYSTEM_PROMPT` (`23c82197…3411`), `EXTRACTION_SHAPE` (`6dc42e99…f3ba`), the three-screen user turn (`12338a24…d5a4`) and the two-screen user turn (`ca4bbadf…7754`) all equal the base values; the captured primary request body carries that system prompt and three `image_url` parts with no `WORKOUT DETAILS` label; and the job's `callPrimary` receives exactly `['summary','heartrate']` for a summary+details+heartrate upload
  - **J2** · traces R1.1, R2.3 — `$V ui $RUN .claude/skills/verify-run-insights/features/steps/upload-details.mjs -- heartrate=$FX/2026-11-22-heartrate.jpg details=$FX/2026-11-22-details.jpg summary=$FX/2026-11-22-summary.jpg` (note `EXTRACTION=<S1>` in the transcript), then `$V sql $RUN "select kind, excluded_from_share from run_photos where extraction_id='<S1>' order by sort_order"` and `$V sql $RUN "select status, (raw_response->'parsedSession'->>'distanceKm')::numeric as km, jsonb_array_length(raw_response->'parsedSession'->'splits') as rows, (select count(*) from jsonb_array_elements(raw_response->'parsedSession'->'splits') s where (s->>'partial')::boolean = false) as full_rows, raw_response->'details'->'estimate' as est from extractions where id='<S1>'"` → passes when the transcript logs `tiles: Heart rate · Workout Details · Summary`; `run_photos` holds three rows with `details | t` as the second (the others `f`); and the extraction reads `ok`, `km` between 5.9 and 6.3, `full_rows` = 6, and `est` = `{"splits": true, "distanceKm": <the same km>}`
  - **J3** · traces R3.1, R4.1 — `$V ui $RUN .claude/skills/verify-run-insights/features/steps/review-details.mjs -- <S1>`, then `$V sql $RUN "select distance_m, distance_estimated, splits_estimated, (select count(*) from run_splits s where s.run_id = r.id) from runs r where extraction_id='<S1>'"` → passes when the transcript logs `distance label: 1`, `splits label: 1` and `committed: /r/<id>` (and the `review` PNG shows both labels), and the row reads `distance_m` 5900–6300, `t`, `t`, 7
  - **J4** · traces R3.2 — `$V upload $RUN summary=$FX/2026-11-22-summary.jpg details=$FX/2026-11-22-details.jpg heartrate=$FX/2026-11-22-heartrate.jpg` (note `EXTRACTION=<S2>`), `$V ui $RUN .claude/skills/verify-run-insights/features/steps/review-details.mjs -- <S2> 6.05 2026-11-21`, then `$V sql $RUN "select distance_m, distance_estimated, splits_estimated from runs where extraction_id='<S2>'"` → passes when the transcript logs `distance label: 1` and then `distance set to 6.05; distance label now: 0`, and the row reads `6050 | f | t`
  - **J5** · traces R2.3, R4.1 — `$V upload $RUN summary=$FX/2026-11-20-summary.jpg details=$FX/2026-11-20-details.jpg heartrate=$FX/2026-11-20-heartrate.jpg` (note `EXTRACTION=<F1>`), `$V sql $RUN "select (raw_response->'parsedSession'->>'distanceKm')::numeric, jsonb_array_length(raw_response->'parsedSession'->'splits'), (select sum((s->>'timeSec')::int) from jsonb_array_elements(raw_response->'parsedSession'->'splits') s), raw_response->'details'->'estimate' from extractions where id='<F1>'"`, then `$V ui $RUN .claude/skills/verify-run-insights/features/steps/review-details.mjs -- <F1>` and `$V sql $RUN "select distance_m, distance_estimated, splits_estimated from runs where extraction_id='<F1>'"` → passes when the extraction reads distance `6.04`, 6 split rows (none partial: the 0.04 km remainder is below phase 1's > 0.05 km partial rule) whose times sum to 2745–2772, and estimate `{"splits": true, "distanceKm": null}`; the transcript logs `distance label: 0` and `splits label: 1`; and the run reads `6040 | f | t`
  - **J6** · traces R1.2 — `$V upload $RUN summary=$FX/2026-11-20-summary.jpg splits=$FX/2026-11-20-splits.jpg details=$FX/2026-11-20-details.jpg` (note `EXTRACTION=<F2>`), then `$V sql $RUN "select status, raw_response->'details' ? 'printed' as read, raw_response->'details'->'estimate' as est, jsonb_path_query_array(raw_response->'parsedSession'->'splits', '$[*].timeSec') as times from extractions where id='<F2>'"` → passes when it reads `ok`, `read` = `t`, `est` = `null`, and `times` is the transcribed table, 7 entries that read `[446, 468, 458, 450, 463, 466, 17]` for a clean read (structure is the assertion; one misread digit earns the one re-run the harness allows)
  - **J7** · traces R2.4 — `$V upload $RUN summary=$FX/2026-11-22-summary.jpg details=$FX/2026-11-22-heartrate.jpg` (a screen with no pace chart, labelled Workout Details; note `EXTRACTION=<X>`), then `$V sql $RUN "select status, error_code, raw_response->'parsedSession'->>'durationSec', raw_response->'parsedSession'->>'avgHrBpm', raw_response->'parsedSession'->>'distanceKm', jsonb_array_length(raw_response->'parsedSession'->'splits'), raw_response->'details'->'estimate' from extractions where id='<X>'"` → passes when it reads `ok | (null) | 3046 | 161 | (null) | 0 | null`: the extraction finished, the summary's fields are intact, and there is no estimate
  - **J8** · traces R2.4 — `npx vitest run lib/llm/runExtractionJob.test.ts lib/llm/readDetails.test.ts -t "never|details-side|estimator"` → passes when every case passes: details timeout, token floor, schema-refused reply, missing pace range, undecodable screenshot, estimator `null` and estimator throw each end in `markExtractionOk` with `durationSec`/`avgHrBpm`/`hrZones` from the primary intact, `distanceKm` null, splits `[]`, `details.estimate` null, and `markExtractionFailed` never called
- Neighbor check (the plain three-screenshot flow): `$V upload $RUN summary=$FX/2026-11-20-summary.jpg splits=$FX/2026-11-20-splits.jpg heartrate=$FX/2026-11-20-heartrate.jpg` (note `EXTRACTION=<F3>`), then `$V sql $RUN "select status, raw_response ? 'details', jsonb_array_length(raw_response->'parsedSession'->'splits') from extractions where id='<F3>'"`, then `$V ui $RUN .claude/skills/verify-run-insights/features/steps/review-details.mjs -- <F3> - 2026-11-19` and `$V sql $RUN "select distance_estimated, splits_estimated from runs where extraction_id='<F3>'"`. It passes when the extraction reads `ok | f | 7`; the transcript logs `distance label: 0` and `splits label: 0`; the run reads `f | f`; and `$V budget $RUN` shows this upload spent exactly 1 call. Finish with `$V down $RUN`.
- Cost: about 25–28 z.ai calls in total. `up`: 0–2. J2: 2. J3 commit: 2–3. J4: 2 + 2–3. J5: 2 + 2–3. J6: 2. J7: 2. Neighbor: 1 + 2–3. The run uses `--llm=80` so re-runs fit; there is no cost cap. Run the live suite too (2 more).

**Exit criteria:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and all seven guards are green. J1–J8 and the neighbor check pass on one verify run. The Sunday set reaches review at ~6.1 km with six full estimated splits, both labelled, and commits with both flags true. Friday-with-details commits at 6.04 km, `f | t`. A plain upload sends the hash-pinned prompt and commits `f | f`.

## Handoffs

- **R4.2 (Phase 2):** the "estimated" mark on `/r/[id]` is phase 2's. J3 leaves a run with both flags true and J5 one with `f | t` in the same verify run, so a verifier can open `/r/<id>` for both before `down`.
- **R4.3 (Phase 2):** the records exclusion is phase 2's. The J3 and J5 runs are natural subjects (`$V sql $RUN "select key, run_id from records"`).
- **Settled, fixture location:** phase 1 commits `research/fixtures/workout-details/<stem>.png` and `shipped/<stem>.jpg`; Step 3, Step 9 and the Proof read the shipped JPEGs.
- **Settled, partial-row threshold:** phase 1 emits the partial row only at a 2-decimal remainder > 0.05 km (CHK-4's own test). J5 and Step 3's Friday case expect six rows, no partial; Sunday (~6.07 km) keeps its partial row (J3: 7 `run_splits`).
- **Not done: `lib/extract/.workflows/package_readme.md`** names `KINDS_MATCH_SLOTS` (lines 182, 312). The completion handler's readme-updater refreshes it; `docs/token_maxxing/2026-09-12-extract-photos-yagni.md` is a dated session log and keeps the old name.
- **Drive-by, not done:** `lib/share/types.ts:25` doc comment lists `'summary' | 'splits' | 'heartrate' | 'other'` and omits `'details'`; it is a comment only, with no type behind it. `RawResponseDisclosure` on review shows only the primary vendor body, not `raw_response.details.vendor`.
- **Phase 2 docs (settled):** phase 2 edits no `docs/architecture.md` line; this phase's Step 10 carries §4.3, the §5 `/r/[id]` mark and §6.

## Rollback

Revert this phase's commit(s); no migration belongs to it. Extractions written while it was live keep
`raw_response.details` (an extra jsonb key that older code ignores) and `run_photos.kind = 'details'`
rows. After a revert, those rows' labels fall back to the bare `details` string, through the existing
`SCREEN_KIND_LABEL[kind] ?? kind` fallbacks, and they stay excluded from shares. Phase 2's columns
keep whatever flags were written. Revert the UI and data halves together (one commit range), as the
index's rollback says.

## Risks

- **Two concurrent z.ai calls per extraction.** Six of eight simultaneous subagent calls once hit the glm burst limit. Two per extraction is far below that, but a 429 on the details call degrades to "no estimate", so a run that needed the estimate would arrive at review without one. The runner can retry.
- **Reading the duration off a chart axis.** If the model misses the `0:50:46` axis label, the estimator falls back to the Summary's `durationSec`. A details-only upload with no readable duration gets no estimate.
- **Interpretation of R2.4 for a details-only upload (confirmed by the reconciler):** a failed reading is `failed` with the reading's own `EXTRACTION_ERROR_CODES` code, because there are no other screens to keep and `failed` opens the same review screen with an empty draft (docs/architecture.md §5) plus the reason and Retry. Index Decisions records it.
- **`lib/db/schema/runs.ts` is edited by phases 2 and 3**, in different hunks.
- **The KindSelector changes from one row to a 2×2 grid** on every upload tile. This is a visible layout change, and `upload-details.mjs`'s `picked` screenshot shows it.
