# Todos: app

**Package Path**: `app`
**Package Code**: APP
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
- [ ] **P1-APP-M4TZ** Phase 2: Full-screen deep-link viewer route
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns new route `app/photo/[kind]/[id]/page.tsx` (parses segments with phase 1's `parsePhotoViewerSegments`, resolves via `getNinaAvatar`/`getNinaMessageImage`/new `getRunPhoto`) and `components/photo/PhotoDeepLinkScreen.tsx`, which mounts `PhotoViewer` full-screen on a one-element array. A miss of any sort (malformed kind/id, foreign id, deleted id) redirects to `/` with no error page.
  - **Status**: pending
  - **Plan Set**: `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R2 — Clicking the notification opens the client app to a full-screen view of the saved (original) image
  - **Depends on**: `P1-PHO-Q7XK`
  - **Plan**: `.workflows/plan/P1-APP-M4TZ.md`

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
