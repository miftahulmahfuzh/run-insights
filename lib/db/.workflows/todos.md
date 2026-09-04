# Todos: db

**Package Path**: `lib/db`
**Package Code**: DB
**Last Updated**: 2026-09-05
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

---

## Active Tasks

### [P1] High

- [ ] **P1-DB-A001** Phase 1: Session data layer: schema, migration, backfill, scoped queries
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema.ts` (the new `ninaChatSessions` table, `nina_messages.session_id` and the indexes both need); `drizzle/0004_*.sql` plus `drizzle/meta/`; `lib/nina/queries.ts` §4, where every message read and write gains a session parameter alongside session CRUD and the list query; and a new pure `lib/nina/sessions.ts` for the ordering and title-fallback rules with tests — including `NINA_SESSION_TITLE_MAX_CHARS = 60`, the set's one and only title cap, the `sessionTitleFor` fallback phase 5 renders rather than `session.title`, and `pinnedAt: Date | null` as an instant rather than a boolean. `session_id` is `NOT NULL` (D1) with `ON DELETE CASCADE` (R11), the sort key is derived at read time with no stored column (D3), and pins partition rather than sort (D4). Signatures widen with a defaulted or optional session parameter so the tree still compiles and existing callers keep working; phase 3 then makes them required. The backfill is the risk and is not optional: every existing row must end up in exactly one session per user, in `seq` order, under a deterministic placeholder title rather than an LLM call from a migration. Exit criteria: `npm run db:check` passes; the migration applies to a copy of production and `SELECT count(*) FROM nina_messages WHERE session_id IS NULL` is 0; `listNinaSessions` returns pinned-first then most-recent-user-message-descending, asserted by a unit test on the pure ordering rule; deleting a session row leaves no orphaned `nina_messages` and no orphaned `nina_message_images` (R11); the existing suite is green with no caller changed.
  - **Status**: in_progress
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 1 of 9)
  - **Satisfies**: R2, R4, R5, R11 — R2: Chat sessions: create a new one, or return to a previous conversation through a session-history list; R4: Pin sessions to the top; R5: Sort sessions by the most recent **user** message, newest first; R11: Remove a session
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A001.md`
  - **Card**: `miftahulmahfuzh/run-insights#78`

---

## Completed Tasks

### [P1] High

- [x] **P1-DB-A000** Phase 1: Folder metadata on `nina_avatars`, and the folder-aware data layer
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns five new columns on `ninaAvatars` (`folder`, `filename`, `source_key`, `thumb_url`, `thumb_pathname`) plus `nina_avatars_user_folder_created_idx` and the UNIQUE `nina_avatars_user_source_key_unq`; the new `nina_folders` table; `drizzle/0003_nina_avatar_folders.sql` and its meta snapshot/journal; nine statements in `lib/nina/queries.ts` (folder-scoped page, subtree manifest, distinct-folder listing, album count, plain batch insert, bulk move/rename/recursive-delete/bulk-delete) plus `declareNinaFolders`/`renameNinaFolderSubtree`/`deleteNinaFolderSubtree`; the thumbnail cap/pathname builder/predicate in `lib/admin/avatars.ts`; the three new caps in `lib/nina/album.ts`; and `app/admin/page.tsx` switching to `countNinaAvatars`. Exit criteria: `npm run db:generate` produces exactly one additive migration; `db:check`, `typecheck`, `test` green; `is_current` has exactly three writers in `lib/nina/queries.ts`; `/admin/nina` renders exactly as today; `/admin`'s album card renders the same sentence from a `count(*)`.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 1 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A000.md`
  - **Card**: `#66`
  - **Completed**: 2026-09-04 16:46
  - **Method**: /do
  - **Files**: lib/db/schema.ts, drizzle/0003_nina_avatar_folders.sql, drizzle/meta/0003_snapshot.json, drizzle/meta/_journal.json, lib/nina/album.ts, lib/admin/avatars.ts, lib/nina/queries.ts, app/admin/page.tsx, tests/admin.avatars.test.ts, tests/db.schema.nina.test.ts
  - **Notes**: Migration generated and `db:check`-clean, but **not applied** — applying it is a deploy action. Verification check 5 (the `nina_folders` UNION probe against a live database) must run at deploy time. `lib/nina/queries.ts` is shared with phase 3 (`getNinaMessageImage` in §6).
