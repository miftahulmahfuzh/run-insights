# Todos: components/admin/explorer

**Package Path**: `components/admin/explorer`
**Package Code**: CAE
**Last Updated**: 2026-10-01
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 1
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 0
- Archived: 0

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

- [ ] **P2-CAE-A000** Phase 3: `/admin/nina` — the album and media grids
  - **Difficulty**: EASY
  - **Type**: Feature
  - **Context**: Owns `components/admin/explorer/PhotoGrid.tsx`, `components/admin/explorer/PhotoGrid.test.tsx` **and `tests/admin.photoGrid.test.ts`** — the third because its `:141-146` case asserts the `rel="prev"` / `rel="next"` attributes this phase deletes; `FileExplorer.tsx`, `model.ts`, `SearchResultsGrid.tsx` and the `EmptyState` "Go to the first page" link are untouched. Exit: the `‹ Newer` / `Older ›` row becomes `<Pagination hrefForPage={…} />` under the same `border-t border-rule pt-3` rule with **no** outer `pageCount <= 1` guard; the `{first}–{last} of {page.total}` line is kept and still renders at `pageCount === 1`; `lastPage` is renamed `pageCount`; `TOUCH_ICON` and `next/link` leave the import list; the labels are `'Media pages'` / `'Folder pages'` verbatim; the two stepper tests become three numbered-row tests and the source scan is rewritten against `codeLines(grid)`.
  - **Status**: open
  - **Plan Set**: `NUMBERED_PAGINATION_PLAN.md` (phase 3 of 5)
  - **Satisfies**: R1 — Change **every** pagination system in the app — `/nina/about`, `/admin/nina` (the "Image collection" nav label), and every other paginated surface — so each one uses the new control, and the current Previous/Next pagination UI is gone from all of them
  - **Depends on**: `P2-CU-A001`
  - **Plan**: `.workflows/plan/P2-CAE-A000.md`

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

(none yet)

---

## Archive

(none yet)
