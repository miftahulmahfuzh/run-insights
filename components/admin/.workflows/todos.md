# Todos: components/admin

**Package Path**: `components/admin`
**Package Code**: CA
**Last Updated**: 2026-09-15
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 1
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 1
- Completed: 6
- Archived: 6

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

- [ ] **P2-CA-A001** Phase 4: Admin UI: search bar, results grid, full-screen viewer
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/admin/explorer/PhotoSearchBar.tsx` (text input, upload-to-search button with client-side re-encode to a data URI, Search/Clear), a new results-grid component fed by the search action's ranked results, and wiring `components/admin/FileExplorer.tsx` to render the search bar above the existing breadcrumb/toolbar and branch the content pane between the normal `PhotoGrid` and the results grid. Clicking a result tile opens the existing `components/ui/PhotoViewer.tsx` full-screen overlay scoped to the result set (following the `ErrorLogList.tsx` precedent); calls phase 3's Server Action as a black box and touches no `lib/` file. Exit: the search bar renders above "Album" on `/admin/nina`; a text search, an image search, and a combined search each produce a visibly re-ranked grid; clicking a result opens the full-screen viewer with working close/swipe/keyboard paging over the result set; clearing the search returns to normal folder browsing untouched.
  - **Status**: blocked
  - **Plan Set**: `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` (phase 4 of 4)
  - **Satisfies**: R1 — search field + image-upload button above "Album"; clicking a result opens the existing full-screen viewer
  - **Depends on**: `P2-NIN-A001`
  - **Plan**: `.workflows/plan/P2-CA-A001.md`

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

(all six completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and
in `.workflows/package_readme.md`)

---

## Archive

### 2026-09

- P1-CA-A001: Phase 2: Admin surfaces: explorer, crop studio, tables, dials — `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 2 of 5) [.workflows/plan/P1-CA-A001.md]
- P1-CA-A003: Phase 5: The photo-reference picker — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 5 of 7) [.workflows/plan/P1-CA-A003.md]
- P1-CA-A004: Phase 1: Icon-only one-row bottom bar — `ADMIN_BOTTOM_BAR_ICONS_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-CA-A004.md]
- P1-CA-A005: Phase 3: One describe control everywhere; described photos reach Nina's context — `IMAGE_COLLECTION_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-CA-A005.md]
- P2-CA-A000: Phase 5: The panel on `/admin/nina` — `NINA_CHARACTER_TUNING_PLAN.md` (phase 5 of 6) [.workflows/plan/P2-CA-A000.md]
- P2-CA-A002: Phase 1: The Personality tab — `NINA_PERSONALITY_TAB_PLAN.md` (phase 1 of 1) [.workflows/plan/P2-CA-A002.md]
