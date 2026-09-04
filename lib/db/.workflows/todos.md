# Todos: db

**Package Path**: `lib/db`
**Package Code**: DB
**Last Updated**: 2026-09-04 16:46:00
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

---

## Active Tasks

_None._

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
