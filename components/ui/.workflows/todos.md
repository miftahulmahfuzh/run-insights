# Todos: components/ui

**Package Path**: `components/ui`
**Package Code**: CU
**Last Updated**: 2026-10-01
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

- [x] **P1-CU-A000** Phase 3: The icon-only copy button, and the handle it reads
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns a new `components/ui/CopyAdminLinkButton.tsx` and its component test, the `rowPointer?: PhotoPointer` addition to `ViewerPhoto` in `components/ui/PhotoViewer.tsx`, and the `PhotoViewer.test.tsx` half proving an absent handle still renders nothing; it also exports the four copy constants phase 4's suites import. Four files, no caller touched. Exit: the button takes a required non-null origin (R4's gate lives at phase 4's call sites), renders icon-only with an `aria-label`/`title`, and a tap writes phase 1's absolute link straight to `navigator.clipboard` — `navigator.share` is never called, and a test proves it is not called even where the platform has it — showing the `ShareButton` tick, announcing through a `role="status"` live region, and falling back to a selectable read-only field when the clipboard refuses; `ViewerPhoto.id` still means the turn id; the three review surfaces are unchanged; gates green.
  - **Status**: completed
  - **Plan Set**: `COPY_ADMIN_MEDIA_LINK_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — An icon-only copy-admin-link button in the full-view image overlay; tapping it puts an absolute admin link to that photograph on the clipboard, pasteable into WhatsApp
  - **Depends on**: `P1-ADM-A004`
  - **Plan**: `.workflows/plan/P1-CU-A000.md`
  - **Completed**: 2026-10-01 11:45
  - **Method**: /do (plan set phase 3 of 4)
  - **Files**: components/ui/PhotoViewer.tsx, components/ui/PhotoViewer.test.tsx, components/ui/CopyAdminLinkButton.tsx, components/ui/CopyAdminLinkButton.test.tsx
  - **Verified**: `npx vitest run components/ui/CopyAdminLinkButton.test.tsx components/ui/PhotoViewer.test.tsx tests/ui.photoViewer.test.ts` 3 files / 56 tests passed; `npm run typecheck`, `npm run build`, `npm run lint`, `npm run format:check` all clean; `npm run ci:f08-guard` and `npm run ci:client-secret-guard` passed; `npm run knip` identical to the plan's recorded baseline (3 unused files / 27 unused exports / 10 unused exported types), `CopyAdminLinkButton` not flagged. Full `npm test` 375/376 files pass — the one red file, `tests/nina.mediaLocate.test.ts`, is phase 2's untracked in-flight work in the shared worktree, not this phase's.

---

## Archive
