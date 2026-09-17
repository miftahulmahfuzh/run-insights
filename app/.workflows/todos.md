# Todos: app

**Package Path**: `app`
**Package Code**: APP
**Last Updated**: 2026-09-17
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

### [P2] Medium
- [x] **P2-APP-A001** Phase 4: Backfill + test coverage
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the backfill route, `scripts/backfill-media-embeddings.mjs` + its package.json line, `tests/admin.mediaBackfillRoute.test.ts`, `tests/integration/mediaAlbumUnifiedSearch.int.test.ts`, four new `removeChatPhotoAction` cases. Exit criteria: read-only count reports `missing_description=0`/`missing_embedding=0`; backfill route reports `remaining:0`; full vitest green; integration suite passes with `VITEST_INTEGRATION=1`; tsc/format:check/lint/knip green. (Cross-package note: also touches `scripts/backfill-media-embeddings.mjs` under `scripts` and `tests/**`, neither of which is filed a separate task for this phase.)
  - **Status**: completed
  - **Plan Set**: `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` (phase 4 of 4)
  - **Satisfies**: R1, R2, R3 — R1: every picture in every directory is semantically searchable, merged into one deduplicated ranked result set; R2: every picture can carry hand-written search keywords and negative search keywords; R3: promoting a Media photo to Album creates a pointer (no byte copy) instead of a copy, with synchronized description/keywords
  - **Depends on**: P2-DB-A002, P2-NIN-A002, P2-CA-A006
  - **Plan**: `.workflows/plan/P2-APP-A001.md`
  - **Completed**: 2026-09-17 12:05
  - **Method**: /implement
  - **Files**: app/api/admin/nina/backfill-media-descriptions/route.ts (new), scripts/backfill-media-embeddings.mjs (new), package.json (one additive script line), tests/admin.mediaBackfillRoute.test.ts (new), tests/integration/mediaAlbumUnifiedSearch.int.test.ts (new), tests/admin.chatPhotos.test.ts (four new `removeChatPhotoAction` pointer-refusal cases; Step 4a's mock-factory lines were already present from Phase 2's Step 14l, so this phase only checked them as the reconciliation log prescribed)
  - **Verified**: `npx next typegen && npx tsc --noEmit` clean. Targeted suite `tests/admin.mediaBackfillRoute.test.ts` + `tests/admin.chatPhotos.test.ts`: 2 files / 119 tests passed, including the four new pointer-refusal cases and all eleven pre-existing `removeChatPhotoAction` cases. Full `npx vitest run`: 362 files / 6312 tests passed. Integration suite against the one real Neon database (`TEST_DATABASE_URL=<DATABASE_URL> VITEST_INTEGRATION=1 npx vitest run tests/integration/mediaAlbumUnifiedSearch.int.test.ts`): 1 file / 5 tests passed — invariants 3 and 4 proven against real Postgres, not a recording fake; the throwaway `mau-u1-%` user confirmed fully cleaned up afterwards via direct SQL (count = 0). `npm run lint` clean. `npm run format:check`: this phase's six files clean (~25 other files report pre-existing baseline warnings, none touched here — confirmed against `git status`). `npm run knip`: pre-existing baseline findings only; neither new file appears, the new npm script line making `backfill-media-embeddings.mjs` resolve through `package.json` exactly as its `nina:backfill-embeddings` twin does. Production backfill actually executed: `npm run nina:backfill-media-embeddings -- --dry-run` (118 candidates), then the real run (`embedded 118 · failed 0 · skipped 0 · of 118 candidate row(s)`); read-only SQL confirms `{ originals: 118, missing_description: 0, missing_embedding: 0, embedded: 118 }` — exit criterion 2 met exactly. Exit criterion 3 (`GET .../backfill-media-descriptions` reports `remaining: 0`) verified by construction rather than a live HTTP call: `countNinaMessageImageDescribeBacklog` scopes by `userId AND isOriginalPhoto()`, a strict subset of the global set just measured at 0 missing, so `remaining: 0` holds for every user including the admin; no `ADMIN_EMAILS` is configured in this worktree's `.env.local`, consistent with the plan's own Step 2 note about the ceremony a live route call needs locally, and the route's GET/POST logic is fully covered by `tests/admin.mediaBackfillRoute.test.ts`.
  - **Drift**: `tests/integration/mediaAlbumUnifiedSearch.int.test.ts` — the plan's `ninaAvatars` insert fixtures (the `POINTER_ID` and `PLAIN_ID` rows) omitted the `source` column, which is NOT nullable in the actual schema (`NinaAvatarSource`, required). This predates the plan set entirely — untouched by phases 1-3 — and is small drift (an added-field-the-plan-doesn't-mention case). Fixed by adding `source: 'admin'` to both inserts, matching the convention used by this repo's existing fixtures for that table (`tests/admin.imageGenActions.test.ts`, `tests/live/ninaImageE2E.live.test.ts`).
  - **Drift**: The dry-run/live backfill drained 118 original rows, not the 112 measured on 2026-09-17 at plan-writing time — production kept receiving new chat photos in the interim. Not a plan defect: the script's scope predicate (`source_avatar_id IS NULL AND source_image_id IS NULL AND description IS NOT NULL`) is time-invariant and worked correctly against the larger, current set.
  - **Decided**: `ninaAvatars` test-fixture insert missing the required `source` column → added `source: 'admin'` to both fixtures (rung 6: surrounding convention — this repo's existing test fixtures for this table all set `source: 'admin'` when the specific enum value doesn't matter to the test).

### [P1] High
- [x] **P1-APP-M4TZ** Phase 2: Full-screen deep-link viewer route
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns new route `app/photo/[kind]/[id]/page.tsx` (parses segments with phase 1's `parsePhotoViewerSegments`, resolves via `getNinaAvatar`/`getNinaMessageImage`/new `getRunPhoto`) and `components/photo/PhotoDeepLinkScreen.tsx`, which mounts `PhotoViewer` full-screen on a one-element array. A miss of any sort (malformed kind/id, foreign id, deleted id) redirects to `/` with no error page.
  - **Status**: done
  - **Plan Set**: `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R2 — Clicking the notification opens the client app to a full-screen view of the saved (original) image
  - **Depends on**: `P1-PHO-Q7XK`
  - **Plan**: `.workflows/plan/P1-APP-M4TZ.md`
  - **Completed**: 2026-09-15 10:08
  - **Method**: /do
  - **Files**: app/photo/[kind]/[id]/page.tsx (new), components/photo/PhotoDeepLinkScreen.tsx (new), tests/photo.deepLink.test.ts (new), lib/db/queries/photos.ts (modified — `RunPhotoPoint` + `getRunPhoto` inserted after phase 1's `findRunPhotoByContentHash`, before `setPhotoExcludedFromShare`)
  - **Drift**: Worktree shared with a concurrent, uncommitted, in-progress phase 3 (`P1-EXT-R9WD`) session: `lib/db/queries/photos.ts`, `lib/schema/extractionResult.ts`, `lib/admin/chatPhotoActions.ts`, `lib/admin/schema.ts`, `lib/nina/queries/shapes.ts`, `components/extract/UploadPicker.tsx`, `components/admin/explorer/useFolderUpload.ts` and their test files carry WIP edits outside phase 2's scope and untouched by it. This is exactly the concurrent-editing pattern the plan index's file-collision table anticipated for `lib/db/queries/photos.ts` (1 → then 2 and 3 concurrently, disjoint regions); phase 2's edit sits in its own region and does not overlap phase 3's (`NewPhotoInput`, `attachExtractionPhotos`, near the top of the file). Phase 2 was therefore committed by explicit pathspec, with only its own hunk of that shared file staged.
  - **Drift**: A full `npm test` sweep shows 2 failures in `app/api/extract/route.test.ts` from phase 3's in-progress edits (a `contentHash` field newly appearing on asserted row objects) — phase 3's own test file, outside phase 2's scope and ownership, neither caused by nor fixable within phase 2.
  - **Drift**: Phase 2's own scoped verification all green: targeted tests (`tests/photo.deepLink.test.ts`, `lib/photos/pointer.test.ts`, `lib/photos/globalDuplicate.test.ts` — 26/26), `npm run typecheck` (next typegen + `tsc --noEmit`) clean, `npm run build` clean with `/photo/[kind]/[id]` listed as a dynamic route, `npm run lint` clean (0 errors; 1 pre-existing warning in the other session's WIP test file), `npm run format:check` clean for all phase-2-owned files (4 unrelated files elsewhere flagged, untouched here), `npm run ci:data-layer-guard` OK, `npm run ci:client-secret-guard` OK.

---

## Archive

(none yet)
