# Todos: extract

**Package Path**: `app/api/extract`
**Package Code**: EXT
**Last Updated**: 2026-09-15
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 0
- Archived: 0

---

## Active Tasks

### [P0] Critical

### [P1] High
- [ ] **P1-EXT-R9WD** Phase 3: Wire runner-side upload routes (shots, chat)
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the shots path (`components/extract/UploadPicker.tsx` hashes compressed bytes, `ExtractionBlobRefSchema` carries the claim, `attachExtractionPhotos` writes it, `POST /api/extract` registers an `after()` callback asking phase 1's lookup once per distinct hash) and the chat path (`lib/nina/actions/send.ts` reports its existing dedup judgement plus asks phase 1's cross-table lookup for genuinely-new claims). No existing dedup decision changes.
  - **Status**: pending
  - **Plan Set**: `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — Push notification on any upload route when the image already exists in the whole app image collection
  - **Depends on**: `P1-PHO-Q7XK`
  - **Plan**: `.workflows/plan/P1-EXT-R9WD.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

(none yet)

---

## Archive

(none yet)
