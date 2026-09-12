# Plan: Photo reference dedup for album-adopted chat photographs

**Slug:** photo-reference-dedup-album-adoption
**Date:** 2026-09-12 11:58:48
**Analysis:** `20260912-115848-A7F3_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/photo-reference-dedup-album-adoption`
**Branch:** `feature/photo-reference-dedup-album-adoption` (base: `origin/main` @ `78f1a9c`)
**Phases:** 1
**Status:** complete
**Coordinator:** —

---

## Why

> admin/image-generation , in Photo reference, why is there duplicate photos? the first 2 are
> duplicates. make sure the same photo exist in Image Collection-album and
> Image Collection-album-Media is deduplicated in Photo reference

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Diagnose why Photo reference shows duplicate photos (the first two), and deduplicate Photo reference so a photo present in both Image collection's Album and Media views is shown once | 1 |

## Scope

**In scope:** `generatedChatPhotoScope` in `lib/nina/queries.ts` (the predicate shared by
`listNinaPhotoReferences`, `countNinaChatPhotos`, and `resolveNinaPhotoReference`) gains a
correlated exclusion for a chat photograph that has already been copied into the album via
`setChatPhotoAsAvatarAction` (detectable by `nina_avatars.source_key = 'chat-photo:' || id`).
Docstrings and tests that describe/assert this scope's behaviour.

**Out of scope, and why:**
- `mediaCollectionScope` / the `/admin/nina?view=media` Media explorer — the user asked only
  about the Photo reference picker; the Media view must keep showing every original photograph,
  adopted or not (per its own documented scope).
- `/admin/nina?view=album` — likewise unaffected; the new album row is a real, independent
  photograph in the album and must keep appearing there.
- `setChatPhotoAsAvatarAction` / `copyChatPhotoIntoAlbum` (`lib/admin/ninaAlbumActions.ts`) — the
  "copy, not share" design is deliberate (album deletes call `del` with no reference check; a
  shared object would break the chat photo the day the album row went away) and is not being
  changed. The fix works around the copy at read time, not by un-copying it or by writing a new
  back-reference column.
- No schema migration — `nina_avatars_user_source_key_unq` already indexes exactly the lookup the
  new predicate needs.

## Invariants

1. The tree builds and `npm run typecheck` / the touched test files pass at the end of the phase.
2. `generatedChatPhotoScope`'s three existing callers (`listNinaPhotoReferences`,
   `countNinaChatPhotos`, `resolveNinaPhotoReference`) keep reading the identical predicate object
   — no caller may diverge or grow a second, slightly different filter.
3. `mediaCollectionScope` and `isOriginalPhoto()` are untouched byte for byte; the new predicate
   lives only inside `generatedChatPhotoScope`.
4. No behavior change for a chat row that has never been adopted (`getNinaAvatarBySourceKey`
   lookup miss) — the new `NOT EXISTS` must be a no-op for every row that isn't in the 5-row
   production set already carrying a `chat-photo:` `source_key`.
5. No migration; no new index.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | [x] Exclude album-adopted photographs from the chat side of the reference picker | R1 | `lib/nina` | 3 | — | NORMAL | `.workflows/plan/photo-reference-dedup-album-adoption/phase-1.md` | P1-NIN-A039 | — |

### Phase 1 — Exclude album-adopted photographs from the chat side of the reference picker
**Satisfies:** R1
**Owns:** `generatedChatPhotoScope` in `lib/nina/queries.ts`; its docstring and
`isOriginalPhoto`'s neighbouring prose where it explains what is and is not filtered;
`tests/nina.imageprefs.test.ts`'s plan-invariant-13 describe block; a check (not necessarily a
change) that `tests/nina.photoRefs.test.ts`'s `REFERENCE_SKIPPED`-based assertions still pass.
**Does not touch:** `mediaCollectionScope`, `isOriginalPhoto()`'s own definition,
`lib/admin/ninaAlbumActions.ts`, `lib/db/schema.ts`, any migration.
**Exit criteria:** a chat photograph adopted into the album (an `nina_avatars` row with
`source_key = 'chat-photo:<id>'`) no longer appears via the chat side of
`listNinaPhotoReferences`, and `countNinaChatPhotos` agrees; an un-adopted chat photograph is
unaffected; `mediaCollectionScope`-driven reads are unaffected; tests pass; typecheck passes.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Which side to hide when a photograph exists in both the Album and Media views — the new album copy, or the original chat/Media row | Hide the original chat/Media row from the picker; keep the album copy (the newer, "current" row) as the surviving reference-picker entry | 1: matches the existing precedent (`isOriginalPhoto()` already hides a *chat* row when it is the derivative side of an album→chat reference; this is the same shape, mirrored for the chat→album direction) and requires no change to the writer, the schema, or the Media/Album explorer views the user did not ask to change |
| Whether to write a new back-reference column on `nina_message_images` versus reading the existing `nina_avatars.source_key` at query time | Read `source_key` at query time via a correlated `NOT EXISTS`; no new column | 3: the plan's own code-block choice — `nina_avatars_user_source_key_unq` already makes this an index-backed lookup, and a new column would be a migration for a fact the existing unique key already states |

## Open Questions

None — the fork above has a reversible, low-cost losing side (a query-time predicate is one
commit to change again), so it belongs under Decisions, not here.

## Rollback

Revert the single commit touching `generatedChatPhotoScope` (and its test/docstring updates) in
`lib/nina/queries.ts`. No data was written or migrated, so there is nothing to back out at the
database layer — the fix is read-path only.

## Next

Execute the phase:

    /implement -f PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md --phase 1

Or run it as a swarm (overkill for one phase, but uniform):

    /analyze-orchestrator -f PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md

Or put it on the board first (GitHub repos only):

    /create-task --from-plan PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md
