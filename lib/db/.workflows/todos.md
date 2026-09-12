# Todos: db

**Package Path**: `lib/db`
**Package Code**: DB
**Last Updated**: 2026-09-12
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 8
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
