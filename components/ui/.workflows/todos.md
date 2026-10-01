# Todos: components/ui

**Package Path**: `components/ui`
**Package Code**: CU
**Last Updated**: 2026-10-01
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

- [ ] **P1-CU-A000** Phase 3: The icon-only copy button, and the handle it reads
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns a new `components/ui/CopyAdminLinkButton.tsx` and its component test, the `rowPointer?: PhotoPointer` addition to `ViewerPhoto` in `components/ui/PhotoViewer.tsx`, and the `PhotoViewer.test.tsx` half proving an absent handle still renders nothing; it also exports the four copy constants phase 4's suites import. Four files, no caller touched. Exit: the button takes a required non-null origin (R4's gate lives at phase 4's call sites), renders icon-only with an `aria-label`/`title`, and a tap writes phase 1's absolute link straight to `navigator.clipboard` — `navigator.share` is never called, and a test proves it is not called even where the platform has it — showing the `ShareButton` tick, announcing through a `role="status"` live region, and falling back to a selectable read-only field when the clipboard refuses; `ViewerPhoto.id` still means the turn id; the three review surfaces are unchanged; gates green.
  - **Status**: open
  - **Plan Set**: `COPY_ADMIN_MEDIA_LINK_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — An icon-only copy-admin-link button in the full-view image overlay; tapping it puts an absolute admin link to that photograph on the clipboard, pasteable into WhatsApp
  - **Depends on**: `P1-ADM-A004`
  - **Plan**: `.workflows/plan/P1-CU-A000.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

---

## Archive
