# Todos: admin

**Package Path**: `lib/admin`
**Package Code**: ADM
**Last Updated**: 2026-09-07
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

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

### [P1] High

- [x] **P1-ADM-A000** Phase 3: The admin add path captions from the photograph
  - **Difficulty**: NORMAL
  - **Type**: Bug
  - **Context**: Owns `lib/admin/chatPhotoActions.ts` — `scheduleChatPhotoDescribe` becomes `scheduleChatPhotoCaption`: describe with `subject: 'self'` → `captionNinaPhoto` → `updateNinaMessage`, all inside the **one** existing `after()` rather than a second one, with the `description != null` early return kept so a re-run captions from the stored description without paying a second vision call — plus its tests, appended to `tests/admin.chatPhotos.test.ts` after phase 2 has landed. Quotes the file as phase 2 leaves it (the `insertNinaMessages` call already carrying `photoOnly: true`); the diff is confined to `scheduleChatPhotoDescribe` and its import block. Does not touch `replaceChatPhotoAction`'s caption (deliberately deferred, with a one-line note left at the site), `lib/nina/imagerun.ts`, `lib/nina/caption.ts`, `lib/nina/vision.ts`, `lib/nina/queries.ts`. Exit: an add writes a scene-agnostic placeholder synchronously and, in `after()`, replaces it with a caption derived from that photograph's own description; every failure — describe throws, token floor trips, caption returns `null` — leaves the placeholder in place, logs once, and returns `{ ok: true }`; the description is still written to the row; no `await` was added to the action's response path.
  - **Status**: completed
  - **Plan Set**: `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — A photo added to the Chat photos collection must arrive with a chat message that says something true about **that** photograph
  - **Depends on**: P1-NIN-A019, P1-DB-A002
  - **Plan**: `.workflows/plan/P1-ADM-A000.md`
  - **Completed**: 2026-09-07
  - **Outcome**: `scheduleChatPhotoDescribe` -> `scheduleChatPhotoCaption`: one `after()`, `describeNinaImages(refs, { subject: 'self' })` -> `readNinaTuning` -> `captionNinaPhoto({ seen, seenKind: 'described', tuning })` -> `updateNinaMessage`. The description is still stored first and on its own, so a caption failure never costs the paragraph. Every failure branch — row gone, floor tripped, transport failure, caption `null`, `updateNinaMessage` `null` or throwing — leaves the scene-agnostic placeholder standing, logs once, and never rejects. The floor gets `console.error` and a transport failure `console.warn`, so a silently-dropped image is distinguishable from a dead socket.
  - **Decisions**: `replaceChatPhotoAction` DID hold a `scheduleChatPhotoDescribe` call, so Step 3's second half applied — renamed with the plan's verbatim note that a replaced photograph's bubble text in the gap is undesigned and is its own card (rung 3, the plan's code block). `tests/admin.chatPhotos.test.ts` had NO mock setup at all — it was a pure-function file — so the whole harness was added (`next/server`'s `after` captured, not executed) rather than a pinned factory extended (rung 3). Two tests beyond the plan's six: floor-vs-transport logging and the replace call site, because exit criterion 4 and Step 3's rename had no assertion otherwise (rung 2, exit criteria).
  - **Verified**: `npm run lint` 0 errors; `tsc --noEmit` clean for this phase's files; `node scripts/check-llm-payload-boundary.mjs` passes with `captionNinaPhoto` already sanctioned for this file by phase 1; `npm run test` 147 files / 2910 tests pass (40 in `tests/admin.chatPhotos.test.ts`, up from 32).
  - **Note**: `tsc` also reports 4 `TS2304` errors in `tests/nina.imagerun.test.ts` — phase 4's untracked, in-flight file in this shared worktree. Not this phase's, and `lib/nina/*` was deliberately not touched.

