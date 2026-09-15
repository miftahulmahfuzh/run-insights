# Todos: app

**Package Path**: `app`
**Package Code**: APP
**Last Updated**: 2026-09-15
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1
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
