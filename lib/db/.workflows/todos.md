# Todos: db

**Package Path**: `lib/db`
**Package Code**: DB
**Last Updated**: 2026-09-19
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 11
- Archived: 7

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

(all seven completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and
in `.workflows/package_readme.md`)

- [x] **P1-DB-A008** Phase 2: Schema + job-args plumbing
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema/nina/photoshop.ts` (four new NULLABLE columns on `ninaPhotoshopJobs` — `cropScale`, `cropX`, `cropY`, `cropRatioLabel`, per-axis-per-mille of the frame's width/height, all-four-null = "no crop, behave as today"), a new Drizzle migration (generated and reviewed by this phase but NOT applied to production by this phase or any automated step — `npm run db:migrate` is a step the user runs deliberately, and MUST be applied and confirmed BEFORE this branch's code is deployed, since Drizzle names every declared column in every statement and an unmigrated database fails every photoshop job, cropped or not), `lib/nina/photoshopJobs.ts` (`NinaPhotoshopJobArgs` gains the four optional fields; `openNinaPhotoshopJob` writes them; `claimNinaPhotoshopJob` reads them back), and `scripts/photoshop.ts` (its raw `INSERT` column list gains the four columns as explicit `NULL` literals). Adds round-trip test coverage for the new fields. Does not touch `imagecall.ts`, `photoshopRun.ts`'s crop-box computation, or any Server Action/UI. Exit criteria: migration file generated and reviewed (not applied), committed with its `drizzle/meta/` snapshot and journal entry; schema/args/CLI insert all agree on the four new nullable columns; a no-crop `openNinaPhotoshopJob`→`claimNinaPhotoshopJob` round-trip is regression-checked unchanged from `main`; the hand-off names `npm run db:migrate` as a required pre-deploy step; `npx tsc --noEmit`, `npm run lint`, `npm test` all pass.
  - **Status**: completed
  - **Plan Set**: `photoshop-aspect-ratio-crop_PLAN.md` (phase 2 of 5)
  - **Satisfies**: R1 — Add an optional "aspect ratio crop" step to `/admin/photoshop/[source]/[id]`, for BOTH anchor and edit mode.
  - **Depends on**: none
  - **Plan**: `.workflows/plan/P1-DB-A008.md`
  - **Completed**: 2026-09-19
  - **Method**: /implement (plan set phase 2 of 5; phase 1 running concurrently in the same worktree via a peer swarm session)
  - **Files**: lib/db/schema/nina/photoshop.ts, lib/nina/photoshopJobs.ts, scripts/photoshop.ts, tests/nina.photoshopJobs.test.ts, drizzle/0035_first_loa.sql, drizzle/meta/0035_snapshot.json, drizzle/meta/_journal.json
  - **Drift**:
    - `scripts/photoshop.ts`'s plan-quoted comment text contained literal backticks around `` `nearestNinaImageAspectRatio` `` inside a JS tagged template literal (the `sql\`...\`` insert), which prematurely closed the template and broke the parse (TS1005). Fixed by removing the backticks from that inline SQL comment; no semantic change.
  - **Decided**:
    - `npm test` has 5 pre-existing failures (`tests/admin.photoReference.test.ts`, `tests/nina.errorlogs.test.ts`, `components/admin/AdminNavLinks.test.tsx` x2, `lib/nina/queries.test.ts`) → treated as out-of-scope, not a phase-2 regression, and not fixed. Rung: narrower blast radius / no scope-widening. Verified via a disposable detached worktree at the branch's base commit `b88d5bc` (before this plan set's worktree was even cut) reproducing the identical 5 failures with identical assertion diffs — confirmed pre-existing on main, unrelated to this phase's changes, and outside Phase 2's Owns (schema + job-args plumbing).
    - Phase 3 (`P1-NIN-A056`) and Phase 4 (`P1-ADM-N8QW`) both depend on this phase AND on Phase 1 (`P1-NIN-A055`, in progress in a concurrent peer session at completion time) — left `blocked` in their own packages' todos.md, not touched by this dispatch.

- [x] **P2-DB-A002** Phase 1: Schema: media keyword/embedding columns + Album pointer FK
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema/nina/avatars.ts`, `lib/db/schema/nina/chat.ts`, new leaf module `lib/db/schema/nina/embedding.ts`, new Drizzle migration under `drizzle/` (+meta), and `tests/db.schema.nina.test.ts`. Exit criteria: `npx drizzle-kit generate` produces one additive-only migration; `npx tsc --noEmit` and vitest pass; migration applies cleanly; `npm run ci:schema-drift-guard` OK.
  - **Status**: completed
  - **Plan Set**: `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R1, R2, R3 — R1: every picture in every directory is semantically searchable, merged into one deduplicated ranked result set; R2: every picture can carry hand-written search keywords and negative search keywords; R3: promoting a Media photo to Album creates a pointer (no byte copy) instead of a copy, with synchronized description/keywords
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P2-DB-A002.md`
  - **Completed**: 2026-09-17 10:13
  - **Method**: /do
  - **Files**: lib/db/schema/nina/embedding.ts, lib/db/schema/nina/avatars.ts, lib/db/schema/nina/chat.ts, drizzle/0026_media_album_unified_search.sql, drizzle/meta/0026_snapshot.json, drizzle/meta/_journal.json, tests/db.schema.nina.test.ts
  - **Verified**: implementation followed `.workflows/plan/P2-DB-A002.md` exactly — no drift, no decisions forked. `npm run typecheck` clean; `npx vitest run tests/db.schema.nina.test.ts tests/db.schemaDrift.test.ts` 129 passed; full `npm test` showed one red in `components/admin/explorer/MediaPane.test.tsx` (a file this phase never touches) that reproduced only under parallel load — isolated re-run green and `npx vitest run --no-file-parallelism` all 6243 tests / 357 files green, so it is the known pre-existing test-infra flake, not this phase. `npm run db:check` OK; `npm run ci:schema-drift-guard` OK for both halves (static + live diff: 29 tables, 317 columns, 38 FKs, 36 indexes, no drift). Migration `0026` verified additive-only by reading the generated SQL (4 `ADD COLUMN`, 1 `ADD CONSTRAINT`, 2 `CREATE INDEX`, no `DROP`, no `SET NOT NULL`) and is already applied to the one Neon database this repo has — confirmed by the live half of the drift guard, not just `db:migrate`'s exit code. `npm run knip` reports no new unused-file/export findings for this phase: `embedding.ts` is consumed by both `avatars.ts` and `chat.ts`.

- [x] **P2-DB-A001** Phase 1: Schema + embedding client
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the nullable `description_embedding vector(N)` column + HNSW cosine index on `nina_avatars` (`lib/db/schema/nina/avatars.ts`), the migration that enables the `vector` extension, `lib/nina/openrouter.ts`'s embeddings endpoint/model constants, and a new `lib/nina/embedding.ts` (`embedNinaText`) that turns text into a `number[]` via one fetch against a probe-confirmed embeddings endpoint. Leaves `lib/nina/queries/columns.ts`/`shapes.ts` untouched so the vector never rides the shared row projection. Exit: `db:check` passes and the database itself reports the `vector` extension, the nullable column and the HNSW index; `embedNinaText` is unit-testable against a mocked fetch and returns the documented dimension; the model id + dimension are confirmed by a live probe and recorded in the module's doc comment.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R2, R3, R4 — shared infra for text-only search (R2), image-only search (R3, via caption+embed), and combined text+image search (R4)
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P2-DB-A001.md`
  - **Completed**: 2026-09-15 09:54
  - **Method**: /implement
  - **Files**: lib/nina/openrouter.ts, lib/db/schema/nina/avatars.ts, lib/nina/embedding.ts, lib/nina/embedding.test.ts, drizzle/0022_nina_avatar_embedding.sql, drizzle/meta/0022_snapshot.json, drizzle/meta/_journal.json, tests/db.schema.nina.test.ts, tests/db.schemaDrift.test.ts, scripts/check-schema-drift.mjs
  - **Verified**: live embeddings probe landed on the plan's Branch A first try — `openai/text-embedding-3-small`, 200 OK, finite 1536-dim vector, so `NINA_EMBEDDING_DIMENSIONS = 1536` matches the plan's written default with no branch deviation. Migration `0022` already applied to the (single, production) database and confirmed by direct `information_schema` / `pg_indexes` / `pg_extension` reads, not just `db:migrate`'s exit code. `npm test` (5905 tests, 339 files), `npm run typecheck`, `npm run build`, `npm run lint`, `npm run ci:openrouter-guard` and `npm run ci:schema-drift-guard` (0 drift vs the 29-table/309-column production schema) all pass. `npm run format:check`'s 4 unformatted files (`components/nina/NinaAboutScreen.tsx`, `tests/admin.chatPhotos.test.ts`, `tests/nina.imagerun.test.ts`, `tests/nina.llmFallbackText.test.ts`) are pre-existing drift this phase never touched (checked against `git status --porcelain`). `npm run knip` flags `embedNinaText` as an unused export — expected and plan-documented; phases 2/3 consume it, so it must not be suppressed or deleted.

- [x] **P1-DB-A007** Phase 1: Error-log schema + writer/reader
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the new `nina_error_logs` Drizzle table, its migration, a `logNinaError(entry)` writer (best-effort, never throws) and the paginated per-category reader `listNinaErrorLogs(category, { limit, offset })`, plus `getNinaErrorLog(id)` and the schema-pinning test. `user_id` is NULLABLE and `NinaErrorLogWrite.userId` is `string | null | undefined`; the reader takes no `userId` (admin-only, cross-user read). `NINA_ERROR_LOG_PAGE_SIZE = 25` is the reader's default and its ceiling. Shared infrastructure both later halves need — R1's log sink and R2's data source; splitting it would leave one half unowned. Does not touch `nina_turns`, any call site that will use the writer (phases 2–4), `lib/nina/openrouter.ts` (Phase 3), any UI. Exit: `npm run db:generate && npm run db:migrate` produces and applies a clean `0021_*` migration and a re-run reports "No schema changes"; the schema pin asserts `user_id` is nullable in both the Drizzle config and the generated SQL; `logNinaError()` (including a call with no `userId` at all), `listNinaErrorLogs` and `getNinaErrorLog` are exported and unit-tested against `installFakeDb()`; `npm test` and `npm run typecheck` pass.
  - **Status**: completed
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 1 of 5)
  - **Satisfies**: R1 — OpenRouter (`z-ai/glm-5.3-flash`, multimodal) fallback when a z.ai-backed LLM call fails; R2 — New admin "Error logs" tab, 3 sub-tabs, with the specified columns/behaviors
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A007.md`
  - **Completed**: 2026-09-12 08:33
  - **Method**: /implement (plan set phase 1 of 5)
  - **Files**: lib/db/schema.ts, lib/nina/errorlogs.ts, drizzle/0021_nina_error_logs.sql, drizzle/meta/0021_snapshot.json, drizzle/meta/_journal.json, tests/db.schema.errorlogs.test.ts, tests/nina.errorlogs.test.ts, scripts/check-openrouter-boundary.mjs
  - **Drift**:
    - Generated index SQL says `DESC NULLS LAST` where the plan's expected SQL anticipated `DESC NULLS FIRST` — this drizzle version's default for a non-nullable column, semantically inert; the schema pin deliberately asserts only through `DESC`.
    - This drizzle spells a column-default insert by NAMING `created_at` and sending the literal `default` rather than omitting the column; the plan's test assertion was re-expressed to the same intent (no JS clock sent) and strengthened with a no-Date-param check.
    - `db:generate` idempotence message reads "No schema changes, nothing to migrate" in this drizzle version (plan quoted "nothing to generate") — same meaning.
    - Anchor line numbers had ±2-line drift; all edits anchored by text.
    - PRE-EXISTING, not this phase's: `components/admin/ImageGenTestPanel.test.tsx` is committed unformatted, so every repo-wide `npm run format` re-dirties it. It was reverted twice in this session to keep the diff inside this task's Files. Needs a formatting-only follow-up commit someday.
  - **Decided**:
    - `ci:openrouter-guard` FAILed on the adopted plan copy `lib/db/.workflows/plan/P1-DB-A007.md`, whose PROSE mentions `OPENROUTER_API_KEY` → narrowed the guard's grep in `scripts/check-openrouter-boundary.mjs` to source extensions (ts/tsx/js/jsx/mjs/cjs) so it flags reads, not documentation; its exported function is shared by `scripts/check-badge-art.mjs`, so both callers get the fix; positive-controlled that the includes still see the exempt `lib/nina` reads. Rung 1: the plan invariant states the gate's subject is READS ("all new OPENROUTER_API_KEY reads live under lib/nina/").
    - Phase 1's task filed under `lib/db` as P1-DB-A007 (the index's Package column lists `lib/db` AND `lib/nina`) → `lib/db`, precedent P1-DB-A002: the generated migration is the phase's irreversible half. Rung 6 (surrounding convention).

---

## Archive

### 2026-09

- P1-DB-A000: Phase 1: Folder metadata on `nina_avatars`, and the folder-aware data layer — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 1 of 7) [.workflows/plan/P1-DB-A000.md] — Outstanding: the migration was left unapplied at phase time (a deploy action) and check 5, the `nina_folders` UNION probe against a live database, was to run at deploy time; no record of that probe exists in git
- P1-DB-A001: Phase 1: Session data layer: schema, migration, backfill, scoped queries — `NINA_CHAT_SESSIONS_PLAN.md` (phase 1 of 9) [.workflows/plan/P1-DB-A001.md] — Outstanding: `0004` was verified against a throwaway Postgres 16 but deliberately not applied to production — a deploy action, recorded open
- P1-DB-A002: Phase 2: The carrier marker: a photo bubble free text cannot hide — `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 2 of 4) [.workflows/plan/P1-DB-A002.md] — closed by `7fb7f90` (the Active-section `pending` entry was stale bookkeeping; the header already counted 0 active)
- P1-DB-A003: Phase 1: A re-attached photo is a reference, not a copy — `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 1 of 4) [.workflows/plan/P1-DB-A003.md] — Outstanding: `0010`'s irreversible hand-written backfill was deliberately not migrated by the phase (a deploy action, per the plan's Manual-check split)
- P1-DB-A004: Phase 1: The table and the matcher — `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 1 of 4) [.workflows/plan/P1-DB-A004.md]
- P1-DB-A005: Phase 1: `nina_image_prefs` — the row, the vocabulary, the reads — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 1 of 7) [.workflows/plan/P1-DB-A005.md]
- P1-DB-A006: Phase 1: Foundation: content_hash kolom, util hash, plumbing data — `MEDIA_DEDUPE_PLAN.md` (phase 1 of 4) [.workflows/plan/P1-DB-A006.md]
