# Todos: admin

**Package Path**: `lib/admin`
**Package Code**: ADM
**Last Updated**: 2026-09-07
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 1
- Completed: 0

---

## Active Tasks

### [P1] High

- [ ] **P1-ADM-A000** Phase 3: The admin add path captions from the photograph
  - **Difficulty**: NORMAL
  - **Type**: Bug
  - **Context**: Owns `lib/admin/chatPhotoActions.ts` — `scheduleChatPhotoDescribe` becomes `scheduleChatPhotoCaption`: describe with `subject: 'self'` → `captionNinaPhoto` → `updateNinaMessage`, all inside the **one** existing `after()` rather than a second one, with the `description != null` early return kept so a re-run captions from the stored description without paying a second vision call — plus its tests, appended to `tests/admin.chatPhotos.test.ts` after phase 2 has landed. Quotes the file as phase 2 leaves it (the `insertNinaMessages` call already carrying `photoOnly: true`); the diff is confined to `scheduleChatPhotoDescribe` and its import block. Does not touch `replaceChatPhotoAction`'s caption (deliberately deferred, with a one-line note left at the site), `lib/nina/imagerun.ts`, `lib/nina/caption.ts`, `lib/nina/vision.ts`, `lib/nina/queries.ts`. Exit: an add writes a scene-agnostic placeholder synchronously and, in `after()`, replaces it with a caption derived from that photograph's own description; every failure — describe throws, token floor trips, caption returns `null` — leaves the placeholder in place, logs once, and returns `{ ok: true }`; the description is still written to the row; no `await` was added to the action's response path.
  - **Status**: pending
  - **Plan Set**: `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — A photo added to the Chat photos collection must arrive with a chat message that says something true about **that** photograph
  - **Depends on**: P1-NIN-A019, P1-DB-A002
  - **Plan**: `.workflows/plan/P1-ADM-A000.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

_None._
