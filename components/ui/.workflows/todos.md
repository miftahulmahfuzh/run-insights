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

- [x] **P2-CU-A001** Phase 1: The shared numbered `Pagination` control
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/ui/Pagination.tsx` (new), `components/ui/Pagination.test.tsx` (new) and the one re-export line in `components/ui/index.ts` — no caller and no existing pager is touched, so the component ships unused until phases 2-5 land it. Exit: the discriminated `hrefForPage` / `onPage` contract compiles and is exercised — `null` at `pageCount <= 1`; every number rendered at `pageCount = 6` with no ellipsis; the active cell a non-interactive `aria-current="page"`; one `<Link>` per inactive page at the href the callback returns; `onPage` called with the clicked number; `busy` disabling every button. `components/ui/index.ts` re-exports it, it carries no `'use client'`, hook or effect, and `tests/share.bundle.test.ts` stays green.
  - **Status**: completed
  - **Plan Set**: `NUMBERED_PAGINATION_PLAN.md` (phase 1 of 5)
  - **Satisfies**: R2 — The control itself: render **every** page number as its own button (`1 2 3 4 5 6`), highlight the active page, and let a tap jump straight to that page
  - **Plan**: `.workflows/plan/P2-CU-A001.md`
  - **Completed**: 2026-10-01 13:18
  - **Method**: /do (plan set phase 1 of 5)
  - **Files**: components/ui/Pagination.tsx, components/ui/Pagination.test.tsx, components/ui/index.ts
  - **Drift**: None. `components/ui/index.ts` lines 38-46 matched the plan's quoted export list byte-for-byte; the one line was inserted between `'./Flag'` and `'./SplitsTable'` exactly as Step 3 specifies.
  - **Decided**: Exit criterion 2 demands `grep -c "components/admin" components/ui/Pagination.tsx` == 0, but the file measures 1 — the hit is prose inside the comment block Step 1 mandates verbatim ("Nothing in it is optional"), which literally names `components/admin/touch.ts` to explain why it is NOT imported. Kept the code block verbatim; treated the criterion's stated purpose ("no inverted dependency") as the thing measured. (Rung 1: invariant 4 forbids IMPORTING `components/admin/touch.ts`, not mentioning it. Verified the import list is exactly `react` type-only, `next/link`, `@/lib/cn`.)
  - **Verified**: `npx vitest run components/ui/Pagination.test.tsx` 17 passed; `npx vitest run tests/share.bundle.test.ts` 19 passed (barrel still client-safe); `npm test` 380 files / 6790 tests all passed; `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` all clean; all seven CI guards PASS.

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
