# Todos: admin

**Package Path**: `lib/admin`
**Package Code**: ADM
**Last Updated**: 2026-09-15
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 9
- Archived: 4

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

(all four completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and
in `.workflows/package_readme.md`)

- [x] **P1-ADM-T8RM** `search_keywords` field, embedding combine, and backfill
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema/nina/avatars.ts` + its generated migration, the new zero-import `lib/nina/avatarEmbedText.ts` (the one combine function), `lib/admin/avatars.ts` (the 500-char bound), `lib/nina/queries/columns.ts` and `avatarEmbeddings.ts`, the `embedNinaAvatarDescription` choke point in `lib/admin/ninaAlbumDeferredDescribe.ts`, `lib/admin/ninaAlbumDescribeActions.ts`, `lib/admin/schema.ts`, `components/admin/explorer/model.ts` (`AlbumExplorerPhoto.searchKeywords`), the one additive row→prop line at `app/admin/nina/page.tsx:241`, the `PhotoDescription.tsx`/`SelectionPane.tsx` UI, and `scripts/backfill-avatar-embeddings.mjs`. Exit: `nina_avatars.search_keywords` exists and `ci:schema-drift-guard` is green; keywords save/persist independently of `description` (an emptied box stores NULL); saving either column nulls `description_embedding` in the same UPDATE and re-earns it from the combined text; `describeNinaAvatarAction` reads the keywords into the new vector and never writes the column; `npm run nina:backfill-embeddings` re-embeds every described row; `npm run typecheck` and `npm test` green.
  - **Status**: completed
  - **Plan Set**: `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md` (phase 2 of 3)
  - **Satisfies**: R2 — New `search_keywords` field (comma-separated), editable, feeds search relevance
  - **Plan**: `.workflows/plan/P1-ADM-T8RM.md`
  - **Completed**: 2026-09-15 15:23
  - **Method**: /do
  - **Files**: lib/db/schema/nina/avatars.ts, drizzle/0024_nina_avatar_search_keywords.sql, drizzle/meta/_journal.json, drizzle/meta/0024_snapshot.json, lib/nina/avatarEmbedText.ts, lib/admin/avatars.ts, lib/nina/queries/columns.ts, lib/nina/queries/avatarEmbeddings.ts, lib/nina/queries/shapes.ts, lib/admin/ninaAlbumDeferredDescribe.ts, lib/admin/schema.ts, lib/admin/ninaAlbumDescribeActions.ts, lib/admin/ninaAlbumActions.ts, components/admin/explorer/model.ts, app/admin/nina/page.tsx, components/admin/explorer/PhotoDescription.tsx, components/admin/explorer/SelectionPane.tsx, scripts/backfill-avatar-embeddings.mjs, package.json, lib/nina/queries.test.ts, tests/admin.albumActionsBarrel.test.ts, tests/admin.albumDescribeEmbed.test.ts, tests/admin.albumAvatarActions.test.ts, tests/nina.avatarSearch.test.ts, tests/db.schema.nina.test.ts, tests/admin.chatPhotoAdoption.test.ts, components/admin/explorer/PhotoDescription.test.tsx, components/admin/explorer/SelectionPane.test.tsx, components/admin/FileExplorer.test.tsx, components/admin/explorer/PhotoGrid.test.tsx
  - **Drift**: Every step in the phase plan applied at the exact quoted old_string/line numbers with no manual adaptation.
    Real gap the phase plan's own Files list omitted (found via tsc, not guessed): `lib/nina/queries/shapes.ts`'s hand-declared `NinaAvatarRow` interface also needed `searchKeywords: string | null` added after `description` — this is the type `getNinaAvatar` returns and two call sites read `row.searchKeywords` from it. Phase 1's OWN plan file had actually already flagged this ("Phase 2's `NinaAvatarRow` edit"), it just never made it into phase 2's own step list. Fixed.
    Two more real gaps found via the full `npm test` sweep (not the targeted list, which the plan itself warned might not reach far enough): (1) `tests/db.schema.nina.test.ts`'s frozen `nina_avatars` column-list test (21→22 columns) needed `search_keywords` added and its title's count updated. (2) `tests/admin.chatPhotoAdoption.test.ts` has its own independent `avatarRow`/`describeTargetRow` positional-projection helpers (18→19 and 5→6 values) that the plan's Step 15 never named — a third copy of the same positional-shape problem Step 15c/15d fixed elsewhere in the codebase. Fixed both; all 6083 tests green afterward.
  - **Decided**: Did not duplicate the phase 1 + phase 2 header paragraphs in `lib/nina/queries.test.ts` → both phases' plans independently wrote a full paragraph naming both new barrel names; phase 1 landed first and its paragraph already named phase 2's addition, so I added only phase 2's one sorted array entry rather than a second, redundant header paragraph (rung 6: surrounding convention — the file's own rule is one paragraph per plan set, not per phase).
  - **Verified**: Live production migration and backfill both executed and verified this session, not merely planned. `npm run db:generate -- --name nina_avatar_search_keywords` produced exactly the one expected statement (`ALTER TABLE "nina_avatars" ADD COLUMN "search_keywords" text;`), checked against `git log origin/main -- drizzle/` first (origin/main had advanced but only touched `lib/nina/imagegen.ts` — no migration collision). `npm run db:migrate` applied successfully and `npm run ci:schema-drift-guard` confirmed zero drift (29 tables, 312 columns). `npm run nina:backfill-embeddings -- --dry-run` then the real run: 53/53 rows re-embedded, 0 failed, 0 skipped. Also green: full `npm test` (6083/6083), `npm run typecheck`, `npm run lint`, `npm run ci:data-layer-guard`, `npm run ci:openrouter-guard`.
  - **Note**: A full authenticated-browser click-through of the new "Search keywords" box was not performed — no local admin auth session is configured, the same gap phase 1's report flagged.

- [x] **P1-ADM-L2VN** Phase 4: Wire admin-side upload routes (chat photo add/replace, avatar batch)
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `addChatPhotoAction` (suppresses the generic `admin_chat_photo` push in favor of `duplicate_image` on a plan-detected or cross-table hit), `replaceChatPhotoAction` (adds the lookup after commit, purely informational), and the avatar folder batch (`useFolderUpload.ts` hashes picked files, `insertNinaAvatars` writes the column, `registerNinaAvatarsAction` schedules an `after()` scan over rows that actually landed, one push per chunk). No existing dedup decision changes.
  - **Status**: completed
  - **Plan Set**: `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` (phase 4 of 4)
  - **Satisfies**: R1 — Push notification on any upload route when the image already exists in the whole app image collection
  - **Depends on**: `P1-PHO-Q7XK`
  - **Plan**: `.workflows/plan/P1-ADM-L2VN.md`
  - **Completed**: 2026-09-15 10:12
  - **Method**: /do
  - **Files**: lib/admin/chatPhotoActions.ts, lib/admin/schema.ts, components/admin/explorer/useFolderUpload.ts, lib/nina/queries/shapes.ts, lib/nina/queries/avatars.ts, lib/admin/ninaAlbumUploadActions.ts, tests/admin.chatPhotos.test.ts, components/admin/explorer/useFolderUpload.test.tsx, tests/admin.albumUploadActions.test.ts
  - **Drift**: The plan's Step 7c premise ("no behavioural test exists for `registerNinaAvatarsAction`") was wrong: `tests/admin.albumAvatarActions.test.ts` already covers it end-to-end via `fakeDb`. That suite does not exercise the new duplicate-scan behavior (its `batchRecord()` fixture carries no `contentHash`, so `scheduleAvatarDuplicateScan` never schedules anything there), so the new `tests/admin.albumUploadActions.test.ts` (mocked-seam style, per the plan) adds real, non-duplicate coverage rather than being redundant. Verified the pre-existing suite still passes unmodified.
  - **Verified**: `npx tsc --noEmit` clean; `npm run typecheck` (incl. `next typegen`) clean; full `npm test` 343 files / 5951 tests passed; `npm run lint` clean. All run in the shared swarm worktree with phases 2/3 in flight.
  - **Note**: No decisions were forced onto a precedence-ladder rung — the plan applied cleanly against the current tree; the only drift was ordinary line-number movement in `lib/nina/queries/avatars.ts` from phase 1 landing first, exactly as the plan's multi-owner-file notes anticipated.

- [x] **P2-ADM-A001** Phase 2: Description coverage: deferred describe+embed wiring + backfill
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns extending the deferred describe pipeline (`lib/admin/ninaAlbumDeferredDescribe.ts`) to also compute and store the embedding right after a description is written, for every inserted row in a batch (not only `rows[0]`); keeps every other write site (`ninaAlbumDescribeActions.ts`, `ninaAlbumAvatarActions.ts`) in sync; a one-time `requireAdminApi()`-gated backfill route for existing NULL rows; the four narrow embedding reads/writes in `lib/nina/queries/avatarEmbeddings.ts`; and `app/admin/nina/page.tsx`'s `maxDuration = 300` since `after()` inherits the route's budget. Exit: every code path writing `description` also writes `description_embedding` in the same non-blocking step with no added upload latency; a fresh multi-file folder upload fills every row within a bounded time window; the backfill runs once against existing data and reports how many rows it filled.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R2, R3, R4 — description coverage is what lets text-only, image-only and combined search actually cover the whole album, not just promoted/shared/described rows
  - **Depends on**: `P2-DB-A001`
  - **Plan**: `.workflows/plan/P2-ADM-A001.md`
  - **Completed**: 2026-09-15 10:18
  - **Method**: /do
  - **Files**: app/api/admin/nina/backfill-descriptions/route.ts, lib/nina/queries/avatarEmbeddings.ts, tests/admin.albumDescribeEmbed.test.ts, app/admin/nina/page.tsx, lib/admin/ninaAlbumAvatarActions.ts, lib/admin/ninaAlbumDeferredDescribe.ts, lib/admin/ninaAlbumDescribeActions.ts, lib/admin/ninaAlbumUploadActions.ts, tests/admin.albumAvatarActions.test.ts, tests/admin.chatPhotoAdoption.test.ts, lib/nina/queries.ts, lib/nina/queries.test.ts
  - **Drift**: Ran in a worktree live-shared with the concurrently executing phase 3 session (`P2-NIN-A001`), which held its own uncommitted changes in the same directory for most of this phase. Staging was therefore done by explicit per-file pathspec — never `git add -A`, never a directory pathspec over `lib/admin/`, `app/admin/` or `app/api/`, each of which also held phase 3's files — with the staged list checked against the Files line before committing.
    Phase 3's pusher landed `ab93b16` **during** this phase's completion handling, which changed the picture for the better and is the reason the landing is clean. Two consequences worth the record: (a) it swept this phase's already-applied tick of row 2 and the `**Status:**` line in `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` into its own commit, so the plan index is correctly ticked for phases 1–3 but phase 2's tick is attributed to phase 3's commit; (b) it committed its own hunks of the two shared files and its own `lib/admin/.workflows/package_readme.md` prose, leaving this phase's remaining diff in `lib/nina/queries.ts` and `lib/nina/queries.test.ts` purely its own.
    `lib/nina/queries.ts` and `lib/nina/queries.test.ts` are the two files phases 2 and 3 both edit additively, per the plan index's reconciled rule (final export order `avatars`, `avatarEmbeddings`, `avatarsearch`; barrel test array total 92). Because phase 3 committed first, this commit adds only phase 2's barrel line and its four names on top of phase 3's 88, reaching the reconciled 92 — and `queries/avatarsearch.ts` already exists in HEAD, so this commit's barrel exports resolve. Had phase 2 committed first, the merged working-tree content would have exported a module absent from the tree; the ordering, not the plan, is what made it safe.
    This phase owns the header prose counts (85 → 92); phase 3 added no prose edits there.
  - **Verified**: `npx next typegen && npx tsc --noEmit` clean; full `npm test` 342 files / 5945 tests green; `npm run lint` clean; `npm run knip` clean (its 4 unused-export findings are all phase 3's files); `npm run ci:openrouter-guard` OK.

- [x] **P1-ADM-A003** Phase 4: Push when a photo is added to her chat from `/admin`
  - **Difficulty**: EASY
  - **Type**: Feature
  - **Context**: Owns `lib/admin/chatPhotoActions.ts` and its test (`tests/admin.chatPhotos.test.ts`, modified) — adds one notify call stamped `'admin_chat_photo'` after the photo bubble and its image row are written, past all four of the action's refusal returns, with the bubble's caption hoisted so the row and the notification carry the same string by construction. Exit: adding a photo from `/admin` buzzes the phone with the bubble's caption; all four `{ ok: false }` returns push nothing; a notify failure never fails the add and never costs the photograph its deferred caption.
  - **Status**: completed
  - **Plan Set**: `NINA_PUSH_EVERY_MESSAGE_PLAN.md` (phase 4 of 5)
  - **Satisfies**: R2 — When Nina speaks on her own initiative, a push notification is sent
  - **Depends on**: `P1-PSH-A000`
  - **Plan**: `.workflows/plan/P1-ADM-A003.md`
  - **Completed**: 2026-09-14 11:28
  - **Method**: /do
  - **Files**: lib/admin/chatPhotoActions.ts, tests/admin.chatPhotos.test.ts
  - **Verified**: `npx tsc --noEmit` clean; `npm run lint` 0 errors (2 pre-existing warnings in `scripts/nina-image-worker/finish.ts`, phase 5's file, not introduced here); `npx vitest run tests/admin.chatPhotos.test.ts` 90 passed; full `npm test` 334 files / 5824 tests passed — all with no `VAPID_*` set (invariant 7).
  - **Note**: Applied verbatim from `.workflows/plan/P1-ADM-A003.md` — line numbers matched exactly. No drift, no decisions. `addChatPhotoAction` hoists the bubble caption into a `const body` written once and read twice, then calls `notifyNinaPush(userId, [{ id: message.id, body }], 'admin_chat_photo')` after `scheduleChatPhotoCaption` and before `revalidatePath`, inside its own try/catch that only logs.

- [x] **P1-ADM-A002** Phase 5: Admin Error Logs page
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `app/admin/error-logs/page.tsx` (Server Component, `?tab=text|multimodal|image_generation`, `?page=`), `lib/admin/errorLogModel.ts` (the pure row/URL model, zero value imports), a compact flex-row list component, a read-only popup dialog for full input/full error text, `PhotoViewer` integration for image links, the new `AdminNavLinks` entry (6→7 cells) and the six pinned counts in `tests/admin.shell.test.ts` that move with it. Calls Phase 1's reader as `listNinaErrorLogs(category, { limit, offset })` — no `userId` argument — with `ADMIN_ERROR_LOG_PAGE_SIZE = 25`, mirroring Phase 1's ceiling. Does not touch any of the writer code from phases 2–4 (reads `nina_error_logs` directly via Phase 1's reader) — can be built and reviewed independently of whether 2/3/4 have landed, since Phase 1 alone is enough to exercise it end-to-end (seed rows via `logNinaError` in a dev one-liner if needed). Sole owner of `components/admin/AdminNavLinks.tsx` and `tests/admin.shell.test.ts` in this set. Exit: `/admin/error-logs` renders all three tabs with real (or seeded) data; a narrow-viewport (375px) visual/manual check confirms one entry = one row; full-input/full-error icon buttons open the popup with complete text and the error popup's first line is `Timeout: <n>s` when the row has one; image links open `PhotoViewer` full-screen and rows without an image draw no image control at all; pagination works past one page (`?page=2` reads "26–50 of N"); the bottom bar is one row of seven cells at 375/414/896px.
  - **Status**: completed
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 5 of 5)
  - **Satisfies**: R2 — New admin "Error logs" tab, 3 sub-tabs, with the specified columns/behaviors
  - **Depends on**: `P1-DB-A007`
  - **Plan**: `.workflows/plan/P1-ADM-A002.md`
  - **Completed**: 2026-09-12 09:15
  - **Method**: /do
  - **Files**: app/admin/error-logs/page.tsx, lib/admin/errorLogModel.ts, lib/admin/errorLogModel.test.ts, components/admin/ErrorLogList.tsx, components/admin/ErrorLogList.test.tsx, components/admin/LogTextDialog.tsx, components/admin/LogTextDialog.test.tsx, components/admin/AdminNavLinks.tsx, components/admin/AdminNavLinks.test.tsx, tests/admin.shell.test.ts
  - **Drift**: `components/admin/AdminNavLinks.test.tsx` is NOT in the phase plan's Files table but pins the bar geometry by render (HREFS array, label pairs, grid-cols-6, toHaveLength(6) cells, two test titles) — the plan only knew about `tests/admin.shell.test.ts`. The same deliberate 6→7 move was applied there: `/admin/error-logs` appended to HREFS, `['/admin/error-logs','Errors','Error logs']` appended to pairs, grid-cols-7, seven cells, titles say seven.
  - **Drift**: The plan's "the popups" tests in `components/admin/ErrorLogList.test.tsx` used `screen.getByText` with multi-line strings (`'Timeout: 22s\n\nConnection error.'`), which @testing-library/dom can never match because it normalizes whitespace. Rewritten to assert the dialog `<pre>`'s raw `textContent` with exact equality (newlines included) — stronger, not weaker. 3 tests affected.
  - **Drift**: prettier reflowed `components/admin/ErrorLogList.test.tsx` and `app/admin/error-logs/page.tsx` (line wrapping only).
  - **Decided**: `AdminNavLinks.test.tsx` also pins the six-cell bar (plan missed the file) → extended the 6→7 move there rather than letting the suite go red. Rung 1+2: invariant "tree passes vitest every phase" + exit criterion "one row of seven cells".
  - **Decided**: The plan's multi-line `getByText` popup assertions can never match under testing-library normalization → exact `textContent` equality instead. Rung 3 code blocks + tie-break "a failing verification is never settled by relaxing the check".
  - **Decided**: First full-sweep run had 2 reds in MemoryTable add-row tests (known parallel-load flake per plan and package memory); two consecutive full sweeps then passed 5169/5169 — settled green, no flag, no assertion touched.
  - **Decided**: `ci:client-secret-guard` exits 1 on `lib/nina/vision.test.ts:33` (raw `process.env.OPENROUTER_API_KEY` read) — that is Phase 3's UNCOMMITTED in-flight file, sole-owned by Phase 3, absent from HEAD; NOT this phase's file. Left untouched; reported to the swarm coordinator.
  - **Decided**: The plan's manual 375px visual check and its "seed rows via `logNinaError`" one-liner were NOT performed: the seed writes `.env.local`'s `DATABASE_URL` which is the production instance, and the visual check needs a browser. The one-row property is held by the class-shape tests (`min-w-0 truncate` / `shrink-0`) + the plan's width arithmetic; flagged to the operator as the remaining manual step.
  - **Verified**: `npm run typecheck` clean; full vitest sweep 5169/5169 passing twice consecutively; targeted suites for this phase's files 65/65; `npm run lint` clean for this phase's files; `ci:openrouter-guard` and `ci:f08-guard` pass.
  - **Note**: The set's remaining manual steps for this phase: a signed-in-admin visual check of `/admin/error-logs` at 375px (one entry = one row, popups, PhotoViewer) and optional seeded rows. Seeding writes `.env.local`'s DATABASE_URL = the production instance — use a throwaway row and delete it, or skip.

---

## Archive

### 2026-09

- P1-ADM-A000: Phase 3: The admin add path captions from the photograph — `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-ADM-A000.md]
- P1-ADM-A001: Phase 3: `/admin/shortcuts` — `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-ADM-A001.md] — Outstanding: the plan's ten manual browser checks (414 px render, add/edit/toggle/delete each writing production, duplicate-trigger refusal) were never run — the `nina_shortcuts` table did not exist at phase time
- P1-ADM-B130: Phase 2: "What she can see in it", editable — `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 2 of 4) [.workflows/plan/P1-ADM-B130.md]
- P1-ADM-C410: Phase 4: The route, the sixth nav cell, and the form — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 4 of 7) [.workflows/plan/P1-ADM-C410.md]
