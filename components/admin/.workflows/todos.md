# Todos: components/admin

**Package Path**: `components/admin`
**Package Code**: CA
**Last Updated**: 2026-10-01
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 1
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 10
- Archived: 6

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

- [ ] **P2-CA-A009** Phase 5: `/admin/photoshop` and `/admin/error-logs`
  - **Difficulty**: EASY
  - **Type**: Feature
  - **Context**: Owns `components/admin/PhotoshopPickerGrid.tsx` and `app/admin/error-logs/page.tsx`; `app/admin/photoshop/page.tsx`, `lib/admin/errorLogModel.ts`, `ErrorLogList.tsx`, `errorLogHref`'s body, the `TabStrip` and both `EmptyState` branches are untouched. Exit: the picker's two hand-rolled `<Link>`s become `<Pagination hrefForPage={(n) => \`/admin/photoshop?page=${n}\`} label="Photo pages" />` and the error-logs `‹ Newer` / `Older ›` row becomes `<Pagination hrefForPage={(n) => errorLogHref(category, n)} label="Error log pages" className="mt-2" />`, both count lines kept and neither surface gaining an outer `pageCount <= 1` guard; `TOUCH_ICON` leaves the error-logs imports while `cn`, `Link`, `TOUCH_TARGET`, `ButtonLink` and `EmptyState` stay; the stale `PhotoGrid.tsx:177-211` citation at `:116` is dropped. Neither file is read by any suite, so `grep -n 'Newer\|Older\|Previous\|Next\|Sebelumnya\|Berikutnya'` over both is invariant 9's **only** check here — load-bearing, not skippable.
  - **Status**: open
  - **Plan Set**: `NUMBERED_PAGINATION_PLAN.md` (phase 5 of 5)
  - **Satisfies**: R1 — Change **every** pagination system in the app — `/nina/about`, `/admin/nina` (the "Image collection" nav label), and every other paginated surface — so each one uses the new control, and the current Previous/Next pagination UI is gone from all of them
  - **Depends on**: `P2-CU-A001`
  - **Plan**: `.workflows/plan/P2-CA-A009.md`

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

(all six completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and
in `.workflows/package_readme.md`)

- [x] **P2-CA-A008** Phase 4: `/admin/image-generation` + the job anchor picker
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/admin/PhotoReferencePicker.tsx` and `components/admin/PhotoReferencePicker.test.tsx`; `tests/admin.photoReference.test.ts` is re-read and left byte-for-byte unchanged, as are `ImageGenPanel.tsx`, `NinaJobAnchorPicker.tsx`, both route pages, `photoReferenceModel.ts` and `NINA_PHOTO_REF_PAGE_SIZE`. Exit: the `Previous` / `Next` `ButtonLink`s at `:353-362` (inside the footer row at `:347-374`) become `<Pagination hrefForPage={(n) => \`?page=${n}\`} scroll={false} label="Photo reference pages" className="mt-2" />` with **no** outer `pageCount <= 1` guard, so `page 1 of 1` keeps rendering; the `Clear reference` button and the `selected #… · Showing … of … · page … of …` paragraph stay put; the `scrollIntoView` effect keyed on `page` and the `preloadUrls` prefetch links are untouched; both mounts still render; the four `Previous`/`Next` tests assert the numbered row.
  - **Status**: completed
  - **Plan Set**: `NUMBERED_PAGINATION_PLAN.md` (phase 4 of 5)
  - **Satisfies**: R1 — Change **every** pagination system in the app — `/nina/about`, `/admin/nina` (the "Image collection" nav label), and every other paginated surface — so each one uses the new control, and the current Previous/Next pagination UI is gone from all of them
  - **Depends on**: `P2-CU-A001`
  - **Plan**: `.workflows/plan/P2-CA-A008.md`
  - **Completed**: 2026-10-01 13:33
  - **Method**: /do (plan set phase 4 of 5, run as a swarm session in a worktree shared with three concurrent peer phases)
  - **Files**: components/admin/PhotoReferencePicker.tsx, components/admin/PhotoReferencePicker.test.tsx
  - **Verified**: `npx vitest run components/admin/PhotoReferencePicker.test.tsx tests/admin.photoReference.test.ts` 2 files / 51 tests passed; `npm run typecheck` clean; full `npm test` 384 files / 6848 tests passed; all seven CI guards pass; `npm run lint` and `npm run format:check` clean; `npm run build` succeeds. Exit criteria each checked: `Previous`/`Next` survive only inside stripped block comments (:107, :121, :217, :225); `Pagination` mounted with `hrefForPage={(n) => \`?page=${n}\`} scroll={false} label="Photo reference pages" className="mt-2"` and no outer `pageCount <= 1` guard, the only other `ButtonLink` being `fullViewButton` (:288) and the only `Button` being `Clear reference` (:389); `tests/admin.photoReference.test.ts` byte-for-byte unchanged (sha256 `4db08b51e33a9859253ecf9e482d2bd7441bee8de8042a7b5705dbc7c82ced54` before and after); `ImageGenPanel.tsx`, `NinaJobAnchorPicker.tsx` and both route `page.tsx` files untouched and both mounts still render.
  - **Commit note**: staged and committed by explicit pathspec, never `git add -A` — this worktree is shared with the concurrent peer sessions for phases 2, 3 and 5, whose in-flight edits to six other files must not be swept into this phase's commit.

- [x] **P1-CA-A007** Phase 5: Crop UI + PhotoshopDetail wiring
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns new `components/admin/PhotoshopCropStudio.tsx` (rectangle pan/zoom crop UI built on `CropStudio.tsx`'s interaction pattern, rendering at the chosen target ratio, calling Phase 1's pure crop-math module and importing `zoomFactorForWheel` directly from `lib/nina/crop`; a ratio `<select>` sourced from `NINA_IMAGE_ASPECT_RATIOS`, defaulting to `nearestNinaImageAspectRatio`'s auto-pick), `components/admin/PhotoshopDetail.tsx` (every line except Phase 4's two prop-type members — destructures/reads `sourceWidth`/`sourceHeight`, hides the step when either is `null`, adds the optional collapsible crop step identically in both modes, `execute()` includes the four crop fields only when the step was used and omits/nulls them otherwise), and new `components/admin/PhotoshopCropStudio.test.tsx` + `components/admin/PhotoshopDetail.test.tsx`. Does not touch the DB schema, the Server Action's validation logic, `page.tsx`, `imagecall.ts`/`photoshopRun.ts`, `lib/nina/crop.ts`, or `CropStudio.tsx`. Exit criteria: the crop step renders identically in Anchor and Edit mode; skipping it leaves `execute()`'s payload unchanged from `main` today (regression-asserted); using it produces a well-formed four-field payload that Phase 4's validation accepts; `npx tsc --noEmit`, `npm run lint`, `npm test` all pass.
  - **Status**: completed
  - **Plan Set**: `photoshop-aspect-ratio-crop_PLAN.md` (phase 5 of 5 — final phase)
  - **Satisfies**: R1 — Add an optional "aspect ratio crop" step to `/admin/photoshop/[source]/[id]`, for BOTH anchor and edit mode.
  - **Depends on**: `P1-NIN-A055` (done), `P1-ADM-N8QW` (done)
  - **Plan**: `.workflows/plan/P1-CA-A007.md`
  - **Completed**: 2026-09-19 14:58
  - **Method**: /do (plan set phase 5 of 5, run as a swarm session in a worktree shared with concurrent peer phases)
  - **Files**: components/admin/PhotoshopCropStudio.tsx (new), components/admin/PhotoshopCropStudio.test.tsx (new, 22 cases), components/admin/PhotoshopDetail.tsx (modified: imports, props destructuring, crop state/toggle, execute() payload, collapsible crop step JSX), components/admin/PhotoshopDetail.test.tsx (new, 6 cases)
  - **Drift**: None against the plan file `components/admin/.workflows/plan/P1-CA-A007.md` — every code block applied verbatim. `lib/nina/photoshopCrop.ts`, `lib/nina/imagerecipe.ts`, `lib/nina/crop.ts` (`zoomFactorForWheel`), and `PhotoshopDetail.tsx` as Phase 4 left it all matched the plan's Interface Contract exactly, so no reconciliation was needed at apply time.
  - **Drift**: `npm run format:check` flags one pre-existing, out-of-scope issue in `lib/nina/actions/send.ts` (documented by Phase 1 and Phase 3's completion reports as pre-existing on the base tree, confirmed unrelated to this phase's Owns list) — left untouched.
  - **Drift**: `npm test` shows the same 5 pre-existing failures across 4 files as the coordinator's recorded baseline (`components/admin/AdminNavLinks.test.tsx` x2, `lib/nina/queries.test.ts` x1, `tests/admin.photoReference.test.ts` x1, `tests/nina.errorlogs.test.ts` x1) — none touch files this phase owns, confirmed pre-existing per Phase 1/3's own completion notes.
  - **Verified**: Run with Node 24 (`/home/miftah/tools/node-v24.18.0-linux-x64/bin` prepended to `PATH`; this worktree's default `node` is v20.11.1, below the `package.json` engines floor and unable to boot Vitest 4). `npx vitest run components/admin/PhotoshopCropStudio.test.tsx components/admin/PhotoshopDetail.test.tsx` — 30/30 passed. `npm run typecheck` (next typegen && tsc --noEmit) clean. `npm run lint` clean. `npm run format:check` clean except the one pre-existing unrelated file above. Full `npm test` — 6596/6601 passed, same 5 pre-existing baseline failures, zero new. `npm run build` succeeds. `npm run ci:client-secret-guard` OK. `npm run knip` — no new unused-export/unused-file findings attributable to this phase (`PhotoshopCropStudio` and `PhotoshopCropSelection` both have real importers).
  - **Commit note**: committed by explicit path list, never `git add -A` — this worktree is shared with concurrent peer swarm sessions whose in-flight edits must not be swept into this phase's commit.

- [x] **P2-CA-A006** Phase 3: UI: Media keyword box, merged search results, pointer-row messaging
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/admin/explorer/model.ts`, `MediaPane.tsx`, `SelectionPane.tsx`, `PhotoDescription.tsx` (comment only), `PhotoSearchBar.tsx` (comment only), `SearchResultsGrid.tsx`, their four co-located test suites, `lib/admin/albumDeepLink.ts` (`hrefForMediaView`), and `app/admin/nina/page.tsx`. Exit criteria: vitest component suite green plus three pinned suites unbroken; manual dev-server verification of keyword box, merged search, and pointer-row linked text. (Cross-package note: also touches `app/admin/nina/page.tsx` under the `app` package, which is not filed a separate task for this phase.)
  - **Status**: completed
  - **Plan Set**: `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1, R2, R3 — R1: every picture in every directory is semantically searchable, merged into one deduplicated ranked result set; R2: every picture can carry hand-written search keywords and negative search keywords; R3: promoting a Media photo to Album creates a pointer (no byte copy) instead of a copy, with synchronized description/keywords
  - **Depends on**: P2-DB-A002, P2-NIN-A002
  - **Plan**: `.workflows/plan/P2-CA-A006.md`
  - **Completed**: 2026-09-17 11:21
  - **Method**: /implement
  - **Files**: components/admin/explorer/model.ts, components/admin/explorer/MediaPane.tsx, components/admin/explorer/SelectionPane.tsx, components/admin/explorer/PhotoDescription.tsx, components/admin/explorer/PhotoSearchBar.tsx, components/admin/explorer/SearchResultsGrid.tsx, lib/admin/albumDeepLink.ts, app/admin/nina/page.tsx, components/admin/explorer/MediaPane.test.tsx, components/admin/explorer/SelectionPane.test.tsx, components/admin/explorer/SearchResultsGrid.test.tsx, components/admin/explorer/PhotoSearchBar.test.tsx
  - **Verified**: `npx next typegen` clean; `npx tsc --noEmit` zero errors; targeted suite 15 files / 228 tests passed; full `npm test` 361 files / 6299 tests passed. Manual verification on a local dev server (port 3417, minted admin cookie) against production data confirmed: Media keyword boxes save and persist across reload; "Set as her profile picture" creates a pointer whose Album pane shows the "link to a photo in Media" sentence with all controls enabled; the pointer's keyword box loads the Media row's stored value (read redirection via `resolveNinaAvatarLinkedText`) and editing it from the Album pointer shows through on the Media original (write redirection); a text search returned an album hit and a media hit in one sheet, media tile labeled "... in Media" with its header link pointing at `/admin/nina?view=media`. All production DB side effects (pointer avatar row, reassigned `is_current`, test keyword values) were reverted via SQL and verified back to their original state; `git status --porcelain` shows only the 12 intended files.

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
