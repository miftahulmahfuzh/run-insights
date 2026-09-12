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
- Completed: 7
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
