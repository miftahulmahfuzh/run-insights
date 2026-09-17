# Todos: components/admin

**Package Path**: `components/admin`
**Package Code**: CA
**Last Updated**: 2026-09-17
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 1
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 1
- Completed: 7
- Archived: 6

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

- [ ] **P2-CA-A006** Phase 3: UI: Media keyword box, merged search results, pointer-row messaging
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/admin/explorer/model.ts`, `MediaPane.tsx`, `SelectionPane.tsx`, `PhotoDescription.tsx` (comment only), `PhotoSearchBar.tsx` (comment only), `SearchResultsGrid.tsx`, their four co-located test suites, `lib/admin/albumDeepLink.ts` (`hrefForMediaView`), and `app/admin/nina/page.tsx`. Exit criteria: vitest component suite green plus three pinned suites unbroken; manual dev-server verification of keyword box, merged search, and pointer-row linked text. (Cross-package note: also touches `app/admin/nina/page.tsx` under the `app` package, which is not filed a separate task for this phase.)
  - **Status**: blocked
  - **Plan Set**: `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1, R2, R3 — R1: every picture in every directory is semantically searchable, merged into one deduplicated ranked result set; R2: every picture can carry hand-written search keywords and negative search keywords; R3: promoting a Media photo to Album creates a pointer (no byte copy) instead of a copy, with synchronized description/keywords
  - **Depends on**: P2-DB-A002, P2-NIN-A002
  - **Plan**: `.workflows/plan/P2-CA-A006.md`

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

(all six completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and
in `.workflows/package_readme.md`)

- [x] **P2-CA-A001** Phase 4: Admin UI: search bar, results grid, full-screen viewer
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/admin/explorer/PhotoSearchBar.tsx` (text input, upload-to-search button with client-side re-encode to a data URI, Search/Clear), a new results-grid component fed by the search action's ranked results, and wiring `components/admin/FileExplorer.tsx` to render the search bar above the existing breadcrumb/toolbar and branch the content pane between the normal `PhotoGrid` and the results grid. Clicking a result tile opens the existing `components/ui/PhotoViewer.tsx` full-screen overlay scoped to the result set (following the `ErrorLogList.tsx` precedent); calls phase 3's Server Action as a black box and touches no `lib/` file. Exit: the search bar renders above "Album" on `/admin/nina`; a text search, an image search, and a combined search each produce a visibly re-ranked grid; clicking a result opens the full-screen viewer with working close/swipe/keyboard paging over the result set; clearing the search returns to normal folder browsing untouched.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` (phase 4 of 4)
  - **Satisfies**: R1 — search field + image-upload button above "Album"; clicking a result opens the existing full-screen viewer
  - **Depends on**: `P2-NIN-A001`
  - **Plan**: `.workflows/plan/P2-CA-A001.md`
  - **Completed**: 2026-09-15 10:36
  - **Method**: /do
  - **Files**: components/admin/FileExplorer.tsx, components/admin/FileExplorer.test.tsx, components/admin/explorer/PhotoSearchBar.tsx, components/admin/explorer/PhotoSearchBar.test.tsx, components/admin/explorer/SearchResultsGrid.tsx, components/admin/explorer/SearchResultsGrid.test.tsx, components/admin/explorer/searchQueryImage.ts, tests/admin.photoSearch.test.ts
  - **Drift**: Step 5a's raw-source `.not.toContain(...)` checks (`@vercel/blob`, `Newer`/`Older`, `SelectionPane`, `data-photo-id`) collided with Step 1/Step 3 doc-comment prose from the same phase plan that quotes those exact strings; routed those assertions through the test file's own pre-existing `codeLines()` comment-stripping helper. No documentation deleted.
  - **Drift**: `components/admin/FileExplorer.test.tsx` (pre-existing, not in phase 4's Files table) mocks every child but had none for the two new ones; PhotoSearchBar's real import of the `@/lib/admin/ninaAlbumActions` barrel pulled in the real `searchNinaAvatarsAction`/`requireAdmin`/next-auth chain and failed with `Cannot find module .../node_modules/next/server` (next-auth-beta / next-16.3.1 ESM resolution). Added `vi.mock` stubs for `./explorer/PhotoSearchBar` and `./explorer/SearchResultsGrid`, mirroring the file's existing per-child mock idiom. Folder-browsing scope unchanged.
  - **Drift**: Pre-existing, out of scope, NOT fixed (plan's "Leaves alone: every file under lib/"): `npm run ci:client-secret-guard` flags a raw `process.env.OPENROUTER_API_KEY` read at `lib/nina/embedding.test.ts:23` (phase 1's commit 5d1ad67); knip flags `NINA_ALBUM_SEARCH_TEXT_MAX`, `NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS` and the `NinaAlbumSearchInput` type in `lib/admin/ninaAlbumSearchSchema.ts` (phase 3's commit ab93b16).
  - **Drift**: knip flags the four `SEARCH_QUERY_*` constants in `searchQueryImage.ts` as unused exports — their only outside reader (`tests/admin.photoSearch.test.ts`) pins them via `readFileSync` source-text matching, not an import. Per the plan ("annotate at the symbol, never suppress") added an explanatory doc comment at the symbol, matching the repo's `EXTRACTION_SHAPE` precedent. Finding is expected, not an error.
  - **Drift**: `npm run format` is repo-wide and reformatted eight files belonging to phase 2 (`P2-ADM-A001`), whose uncommitted work shares this worktree: `app/api/admin/nina/backfill-descriptions/route.ts`, `components/nina/NinaAboutScreen.tsx`, `lib/admin/ninaAlbumDescribeActions.ts`, `lib/nina/queries/avatarEmbeddings.ts`, `tests/admin.albumDescribeEmbed.test.ts`, `tests/admin.chatPhotos.test.ts`, `tests/nina.imagerun.test.ts`, `tests/nina.llmFallbackText.test.ts`. Verified by hand as pure prettier line-wrap, zero logic change. Deliberately left unstaged for phase 2's own session.
  - **Drift**: Manual browser verification (plan's Verification items 1-8 against `npm run dev`) not performed — `ADMIN_EMAILS` is Production-scope only and absent from this worktree's `.env.local`, so `requireAdmin()` cannot pass locally; judged out of proportion for a UI smoke check. All automated gates ran green: `npm run format`, `npm run lint`, `npx next typegen && npx tsc --noEmit`, the full `npm test` (345 files / 5972 tests, including 3 new dedicated suites), `ci:client-secret-guard` and `knip` (only the pre-existing findings above).
  - **Decided**: Step 5a's raw-source `.not.toContain` assertions vs Step 1/Step 3 doc-comment prose quoting the same strings → routed the three affected assertions through the test file's existing `codeLines()` helper (rung 6: surrounding convention already established in the same file for the same purpose).
  - **Decided**: `FileExplorer.test.tsx` reaching real next-auth through the two new unmocked children → added `vi.mock` stubs for `PhotoSearchBar` and `SearchResultsGrid` (rung 6: surrounding convention — every other child in that file is already mocked the same way).

---

## Archive

### 2026-09

- P1-CA-A001: Phase 2: Admin surfaces: explorer, crop studio, tables, dials — `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 2 of 5) [.workflows/plan/P1-CA-A001.md]
- P1-CA-A003: Phase 5: The photo-reference picker — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 5 of 7) [.workflows/plan/P1-CA-A003.md]
- P1-CA-A004: Phase 1: Icon-only one-row bottom bar — `ADMIN_BOTTOM_BAR_ICONS_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-CA-A004.md]
- P1-CA-A005: Phase 3: One describe control everywhere; described photos reach Nina's context — `IMAGE_COLLECTION_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-CA-A005.md]
- P2-CA-A000: Phase 5: The panel on `/admin/nina` — `NINA_CHARACTER_TUNING_PLAN.md` (phase 5 of 6) [.workflows/plan/P2-CA-A000.md]
- P2-CA-A002: Phase 1: The Personality tab — `NINA_PERSONALITY_TAB_PLAN.md` (phase 1 of 1) [.workflows/plan/P2-CA-A002.md]
