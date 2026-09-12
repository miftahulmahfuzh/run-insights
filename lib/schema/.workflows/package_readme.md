# Package: schema

**Location**: `lib/schema`
**Last Updated**: 2026-09-12 (initial creation — YAGNI sweep + first readme, session
`tokenmax-schema-yagni-readme`; every count and consumer list measured that day)

## Overview

`lib/schema` is the validation boundary between the vision model's transcription and everything
the application trusts. Two Zod modules, both **pure and client-importable**:
`extractedSession.ts` owns the shape of one extracted workout plus the provenance guard that
decides which of its fields may be populated at all; `extractionResult.ts` owns F04's wire
contract — the upload request, the poll-result DTO, and the user-facing failure copy.

The package exists because the vendor does not honour JSON Schema: `IMPLEMENTATION_PLAN.md` §1.6
measured z.ai omitting fields listed in a tool schema's `required` array, and the extraction
recipe does not even use function-calling — it asks for raw JSON in the prompt. Nothing here may
assume a field is present because the prompt described it.

**Key Responsibilities:**

- Enforce structurally what the vendor does not: every field validated, at every depth.
- The **provenance guard** (`makeExtractedSessionSchema`): hard-null every field that no uploaded
  screen could legitimately have shown, before a human ever sees the extraction.
- Normalise the reader's misshapen-but-accurate clock transcriptions (`"5.32 PM"` → `"17:32"`).
- Publish the one DTO F05 renders from (`ExtractionResult`) and the upload request schema
  (`ExtractRequestSchema`, whose Blob-URL host allowlist is the SSRF boundary).

## Exported API

### `extractedSession.ts` — the session shape and its guard

| Export | Kind | Purpose |
|---|---|---|
| `ScreenKind` | type re-export | From `@/lib/extract/constants`; re-exported so schema consumers import one place |
| `ScreenKindSchema` | Zod enum | `'summary' \| 'splits' \| 'heartrate'` |
| `normalizeClockTime` | function | F30 coercion to `HH:MM` or `null`; see the 28-row production-shape table in its test |
| `RawExtractedSession` | Zod object | Pre-guard schema. Scalars nullable-with-default (RULE 1); row arrays strict |
| `ExtractedSession` | type | `z.infer` of the raw schema — the post-parse shape |
| `FIELD_SOURCES` | config table | Which screens can show which field; settled by R-4 against the three source screenshots |
| `makeExtractedSessionSchema(kindsPresent)` | function | The guard: transform that nulls unreachable fields |
| `describeZodIssues(error)` | function | Model-readable repair note for the R-2 text-only round-trip, capped at 12 issues |

The scalar/row asymmetry in `RawExtractedSession` is the package's central design statement:
"this field was not visible" is a legitimate answer for every scalar, so they degrade to `null`;
a row that exists must be complete (`hrBpm` on a split, every zone bound pair), so rows fail Zod
and fire the repair round-trip instead of silently defaulting.

### `extractionResult.ts` — F04's wire contract

| Export | Kind | Purpose |
|---|---|---|
| `ExtractionBlobRef` | type | One uploaded screenshot as the browser reports it post-PUT |
| `ExtractRequestSchema` | Zod object | `POST /api/extract` body: 1–3 images (`MIN_IMAGES`/`MAX_IMAGES`), no duplicate kinds, SSRF-refined URLs |
| `ExtractAcceptedResponse` | interface | 202 body: `{ extractionId }` — an extraction id, never a run id (R-1) |
| `ExtractionStatus` | type union | `'pending' \| 'ok' \| 'repaired' \| 'failed'` |
| `ExtractionResult` | interface | The GET poll body — the whole F05 hand-off; the status table in its doc comment is the contract |
| `isTerminal` | function | Only `pending` is non-terminal |
| `EXTRACTION_ERROR_COPY` | copy map | One sentence per `ExtractionErrorCode`, written for the runner, not the log |
| `errorCopy(code)` | function | Map lookup with a generic fallback; `null`/`undefined` → `null`, never throws |

## Internal Architecture

**Data flow.** `UploadPicker` shape-checks against `ExtractRequestSchema` → `POST /api/extract`
validates the same schema server-side → `lib/llm/extract.ts` builds
`makeExtractedSessionSchema(kindsPresent)` per attempt and formats Zod failures with
`describeZodIssues` for the repair prompt → `lib/llm/runExtractionJob.ts` validates at completion
→ `lib/extract/readExtraction.ts` maps the DB row to `ExtractionResult` → the poll hook and
`ReviewClient` render it (`isTerminal`, `errorCopy`).

**Key internals.** `transcribedClockTime` applies `normalizeClockTime` *inside* the schema so the
primary parse, the repair round-trip and `hydrateDraftFromExtraction` cannot disagree.
`emptyFieldValues()` is a function on purpose — a module-level `{ splits: [] }` would share one
array across every extraction and blank form in the process. `ExtractedSplit`/`ExtractedZone`
are the strict row shapes; `ExtractedPostWorkoutHr` and `ExtractionBlobRefSchema` are un-exported
building blocks (the latter since the 2026-09-12 sweep — in-file use only).

## Dependencies

### External

- `zod` — everything. No other runtime dependency.

### Internal

- `@/lib/extract/constants` — `SCREEN_KINDS`, `ScreenKind`, `MIN_IMAGES`/`MAX_IMAGES`,
  `SHOT_STORED_PATHNAME_RE`, `ExtractionErrorCode`/`EXTRACTION_ERROR_CODES`.

**Notably absent:** `server-only`, `@/lib/env`, `@/lib/db`. The pure-module rule (below) is why.

### Test-side oddity

`extractedSession.test.ts` imports the canonical 108-field fixture `TRUTH` from
`research/schema.mjs` — outside the package and outside knip's graph (`research/**` is ignored as
scratch). It is the ground truth the schema must round-trip; do not "clean it up".

## Reverse Dependencies

Import-edge census, 2026-09-12 (AST via knip, cross-checked by grep; prose mentions in comments
and archived plan docs excluded):

| Consumer | Imports | Role |
|---|---|---|
| `lib/llm/extract.ts` | `makeExtractedSessionSchema`, `describeZodIssues`, `ExtractedSession` | Heaviest consumer: builds the guarded schema per attempt, drives repair |
| `lib/llm/runExtractionJob.ts` | `ExtractedSession`, `ExtractionBlobRef` | Validates at completion time |
| `lib/extract/readExtraction.ts` | `ExtractedSession`, `ExtractionResult`, `ExtractionStatus` | Row → DTO mapping; the `ExtractionStatus` seam (gotcha 1) |
| `lib/review/draft.ts` | `ExtractedSession` | Draft hydration |
| `app/api/extract/route.ts` | `ExtractRequestSchema`, `ExtractAcceptedResponse` | The POST handler |
| `components/extract/UploadPicker.tsx` | `ExtractionBlobRef`, `ExtractAcceptedResponse` | Client-side shape checking |
| `components/extract/ExtractionGate.tsx`, `useExtractionStatus.ts` | `isTerminal`, `ExtractionResult` | Polling + status rendering |
| `components/review/ReviewClient.tsx` | `errorCopy` | Failure copy |
| `components/review/RetryExtraction.tsx` | `ExtractAcceptedResponse` | Retry action |
| Test side | `RawExtractedSession` (`tests/capture/dataset.test.ts`), `makeExtractedSessionSchema` + `ScreenKind` (`tests/live/vision.live.test.ts`, `tests/research/goldenFixture.test.ts`), `ExtractedSession` types (three `tests/review.*` suites), `ExtractRequestSchema` (`app/api/extract/route.test.ts`), both co-located suites | — |

`components/extract/KindSelector.tsx` and `tests/extract.*.test.ts` name `ExtractRequestSchema`
only in comments — prose, not imports.

## Concurrency

Pure functions over immutable inputs; no module state, no I/O. Safe to call concurrently. The one
shared-mutable-state trap (a module-level empty-session constant) was designed out via
`emptyFieldValues()`; do not reintroduce it as a "simplification".

## Error Handling

No custom error types. Zod issues in, strings out: `describeZodIssues` renders at most 12
`path: message` lines (a longer list means the model ignored the shape entirely — no repair
prompt fixes that). `errorCopy` never throws; an unknown code degrades to a generic sentence, and
`'STALE_PENDING'` (written by F03's reaper before F04 pinned its codes) must keep rendering
something — the test asserts it.

## Standing Rules

1. **Pure module, client-importable.** No `server-only`, no `@/lib/env`, no `@/lib/db` — the
   review screen imports these types from client components. Anything server-flavoured belongs in
   `lib/llm` or `lib/extract`.
2. **The vendor ignores `required`.** Row-shaped fields must fail Zod (and fire repair), never
   `.default()` into existence. Scalars degrade to `null` because "not visible" is a real answer.
3. **The provenance null-out is hard**, and `kindsPresent` comes from our own upload records,
   never from the model's response. Do not soften it into a warning.
4. **A new session field is four edits in lockstep:** `RawExtractedSession` (or a row schema), a
   `FIELD_SOURCES` row, an `emptyFieldValues()` entry, and `EXTRACTION_SHAPE` in
   `lib/llm/prompts/extraction.ts`. The first three are mechanically enforced (the mapped type of
   `emptyFieldValues` and the `FIELD_SOURCES` completeness test); **the prompt shape is enforced
   by nothing** — a missed edit just means the model never fills the field.
5. **`ExtractionStatus` is declared twice, by necessity.** `lib/db/schema.ts` needs it for the
   column's `$type<>` and cannot import upward; this package needs it and must stay pure. The
   unions are reconciled by an explicit **cast** in `lib/extract/readExtraction.ts` — so a
   one-sided member addition is invisible to tsc at that seam. New statuses go into both unions in
   the same commit.
6. **A bare one-digit hour returns `null` on purpose.** Production measured the guess wrong 1 time
   in 8, and `lib/badges/rules.ts` mints badges from `started_at` — padding an ambiguous time
   replaces *a blank that gets corrected* with *a plausible wrong value that gets accepted*.
7. **The Blob-URL refinement in `ExtractionBlobRefSchema` is the SSRF boundary** (the background
   job fetches those URLs server-side), and `pathname` must match the **stored** pattern —
   `addRandomSuffix: true` rewrites what was requested.
8. **The D1 copy contract is test-enforced:** every failure sentence says "nothing was saved" or
   offers the by-hand path, and none may claim the opposite.
9. **Exported-for-its-own-test is a deliberate seam here, not dead code** — `normalizeClockTime`,
   `FIELD_SOURCES` and `EXTRACTION_ERROR_COPY` have their production callers inside the package
   and their test suites as the only external importers. That is the test reaching live logic
   directly; keep the export. knip cannot see this class at all (its vitest entries count as
   consumers), so `npm run knip` staying silent proves nothing either way about it.

## Performance

Trivial CPU cost: one Zod parse per extraction attempt and per repair, and a parse per poll
response on the client. Measured against the 60-second vision call it guards, the schema is free.
No benchmarks exist for this package; the co-located suites are its correctness cover.

## Notes

- **Created 2026-09-12** by token-maxxing session `tokenmax-schema-yagni-readme`: the package's
  first dead-export pass plus this page. The sweep removed the fully dead
  `ExtractedPostWorkoutHr` type alias (zero importers; its consumer died when F05 moved to its own
  positional shape) and un-exported `ExtractedPostWorkoutHr` and `ExtractionBlobRefSchema`
  (in-file use only). knip flagged the two values; the alias was caught only by the grep
  cross-check — its `z.infer<typeof ExtractedPostWorkoutHr>` self-reference made knip read the
  type as consumed. Lesson recorded: run the grep census even when knip is green.
- The instrument for future sweeps is `npm run knip` (config: `knip.ts` at the repo root, with
  its own rationale). Interpret its silence per rule 9 above.
