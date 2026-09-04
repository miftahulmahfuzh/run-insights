# Todos: run-insights

**Package Path**: `.`
**Package Code**: RI
**Last Updated**: 2026-09-04
**Total Active Tasks**: 3

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 2
- Completed: 3

---

## Active Tasks

### [P0] Critical

### [P1] High

- [ ] **P1-RI-A003** Phase 5: The file explorer: tree, breadcrumb, paginated grid, drop zone, upload queue, set-as-profile
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `app/admin/nina/page.tsx` (folder-scoped paginated `searchParams` reads, still a Server Component, `force-dynamic`, `requireAdmin()` on line 1) and `components/admin/FileExplorer.tsx` with its five children under `components/admin/explorer/`: the `webkitdirectory` picker, the Explorer drag-and-drop walk (`webkitGetAsEntry()` captured synchronously, `readEntries` looped until empty), the manifest diff through phase 2's `planFolderUpload`, client-side thumbnail derivation, a four-parallel bounded upload queue chunk-registering as files land, selection, the framing studio, and "Set as profile picture". Retires `AlbumManager.tsx`, `UploadAvatar.tsx` and the singular `registerNinaAvatarAction` in one commit. Exit: picker and drag-drop produce the same tree; a directory of more than 100 files uploads all of them; a re-drop uploads nothing and says so with a count; the grid issues only thumbnail requests; one click sets her profile picture; the retired files no longer exist; test, typecheck, lint and format:check green.
  - **Status**: open
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 5 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: `P1-RI-A002`
  - **Plan**: `.workflows/plan/P1-RI-A003.md`
  - **Card**: `miftahulmahfuzh/run-insights#70`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

- [ ] **P1-RI-A004** Phase 6: Folder maintenance: create, rename, move, delete
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the create / rename / move / delete folder actions plus the photo move and remove in `lib/admin/ninaAlbumActions.ts` (each `requireAdmin()`-gated and Zod-validated against phase 4's `folderPathSchema`), the pure refusal decisions in `lib/admin/folderOps.ts` + `tests/admin.folderOps.test.ts`, `components/admin/FolderMenu.tsx` and `PhotoMoveBar.tsx`, and three insertions at phase 5's two marked seams. The current photo cannot be removed; a recursive delete removes rows first and blobs best-effort in chunks of 100; a move is an UPDATE of the folder column and copies no blob; undeclare a subtree only when it is actually empty. Exit: rename, move and recursive delete are reflected in the tree without a manual reload; a folder holding the current photo refuses deletion with a message naming the photo and the reason, and the second answer leaves it holding exactly that one photo; no folder operation changes the Blob object count except a delete; `npm test` and `npm run typecheck` green.
  - **Status**: blocked
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 6 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: `P1-RI-A003`
  - **Plan**: `.workflows/plan/P1-RI-A004.md`
  - **Card**: `miftahulmahfuzh/run-insights#71`

- [ ] **P1-RI-A005** Phase 7: "Share link to Nina" in the explorer, opening the chat in a new tab
  - **Difficulty**: EASY
  - **Type**: Feature
  - **Context**: Owns `lib/admin/shareToNina.ts` (the one place an avatar id becomes a chat URL, built through phase 3's formatter), `components/admin/ShareToNinaItem.tsx`, the one item at phase 5's marked seam in `components/admin/explorer/SelectionPane.tsx`, the `shareOrigin` prop threaded from `app/admin/nina/page.tsx` through `FileExplorer`, and `tests/admin.shareToNina.test.ts`. The click opens `<origin>/nina?photo=avatar:<id>` in a new tab with `'noopener'`, before awaiting anything, and fires (never awaits) `ensureNinaAvatarDescriptionAction` when the photo has no description. Exit: one new tab at the production origin with `window.opener === null`; the chat there shows the photo chipped in the composer; sending with or without text produces a reply; no image bytes are re-uploaded; an un-described photo gets described without the tab waiting for it; `npm test` and `npm run typecheck` green.
  - **Status**: blocked
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 7 of 7)
  - **Satisfies**: R2 — "Share link to Nina" on a photo in that explorer: opens the runins.site chat in a new browser tab with the photo attached as a pointer rather than a re-upload, takes an optional question, and Nina answers it
  - **Depends on**: `P1-RI-A001`, `P1-RI-A003`
  - **Plan**: `.workflows/plan/P1-RI-A005.md`
  - **Card**: `miftahulmahfuzh/run-insights#72`

---

## Completed Tasks

### [P1] P1-RI-A000
- [x] **P1-RI-A000** Phase 2: The pure file-tree library: image filter, path grammar, tree build, upload diff
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/admin/filetree.ts` (pure, zero-import: the repo's one folder-path grammar — image test, path normalisation/validation, `buildTree`, `planFolderUpload`, the `v1|…` dedupe key, breadcrumb/ancestor/subtree helpers) and `tests/admin.filetree.test.ts`. Exit: `grep -n "^import" lib/admin/filetree.ts` prints nothing; `npm test` green with the new suite; `npm run lint` clean; no consumers yet.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 2 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-RI-A000.md`
  - **Card**: `miftahulmahfuzh/run-insights#67`
  - **Completed**: 2026-09-04 16:38
  - **Method**: /implement
  - **Files**: lib/admin/filetree.ts, tests/admin.filetree.test.ts
  - **Verification**: `npx vitest run tests/admin.filetree.test.ts` 72/72; `npm test` 120 files / 2140 tests green; `npm run typecheck` clean; `npx eslint` clean on both files; `npx prettier --check` clean on both files; all six `ci:*` guards PASS; `grep -c "^import" lib/admin/filetree.ts` → `0` (the phase's central invariant); all 47 Interface Contract symbols exported.
  - **Drift**: The plan's two verbatim code blocks disagreed on one assertion. `tests/admin.filetree.test.ts` expected `planFolderUpload(...).folders` to equal `['Faces/2027']` when a previously-uploaded `Faces/` tree grew by `Faces/2027/d.jpg`, `Faces/2027/e.jpg` and `Faces/f.jpg`. The module returns `['Faces', 'Faces/2027']`. **The module is right and the assertion is not satisfiable**: `ManifestEntryLike` is declared as `{ sourceKey: string | null }` and carries no folder, so `planFolderUpload` is never told which folders already exist; and the module deliberately reports the full ancestor chain of every uploaded row (phase-2 handoff 5 — declaring `a/b` alongside `a/b/c` is what stops `a/b` vanishing when `c` is deleted). Declaring an already-existing folder is idempotent under invariant 11, so a superset is correct. Fixed the test expectation to `['Faces', 'Faces/2027']`, renamed the case to *"uploads exactly the new files when the folder grew, and declares the whole chain"*, and added a comment recording why. The module was NOT changed. **Open for the plan-set owner**: the plan source at `.workflows/plan/admin-album-file-manager/phase-2.md` still carries the old assertion and should be corrected there.
  - **Drift**: Ran `npx prettier --write` on the two new files only, not `npm run format`, because two peer swarm sessions have uncommitted work in this same worktree and a repo-wide reformat would rewrite their in-flight files.

### [P1] P1-RI-A001
- [x] **P1-RI-A001** Phase 3: The chat side of "share link to Nina": the `?photo=` idiom, composer chip, `attachExisting`
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/nina/attach.ts` (`PHOTO_PARAM` plus the pure `formatNinaPhotoParam`/`parseNinaPhotoParam` pair for `kind:id`), `tests/nina.attach.test.ts`, `app/nina/page.tsx`'s owner-scoped single-row resolve as a fourth element of the existing `Promise.all`, `getNinaMessageImage` in `lib/nina/queries.ts`, `components/nina/PhotoAttachmentChip.tsx`, and the composer state plus the `canSend` disjunct in `ChatScreen.tsx` / `Composer.tsx`. Exit: `/nina?photo=avatar:<id>` paints with the photo chipped in the composer; sending with an empty box writes one `nina_message_images` row pointing at the existing blob with zero new bytes in Blob and zero vision calls; a forged or foreign id arms nothing and is not an error page; `/nina/about`'s attach flow untouched; `npm test` and `npm run typecheck` green.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 3 of 7)
  - **Satisfies**: R2 — "Share link to Nina" on a photo in that explorer: opens the runins.site chat in a new browser tab with the photo attached as a pointer rather than a re-upload, takes an optional question, and Nina answers it
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-RI-A001.md`
  - **Card**: `miftahulmahfuzh/run-insights#68`
  - **Completed**: 2026-09-04
  - **Method**: /implement (landed as commit f379950 under the f34 naming, before this plan set's bookkeeping existed)

### [P1] P1-RI-A002
- [x] **P1-RI-A002** Phase 4: Folder-aware upload: batch register, thumbnails, and the describe pre-pass off the hot path
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/admin/schema.ts` (folder-path, filename, dedupe-key and batch register schemas, every constant imported), the thumbnail pathname shape and smaller size cap in `app/api/admin/nina/upload/route.ts`, and in `lib/admin/ninaAlbumActions.ts`: `registerNinaAvatarsAction` (batch, idempotent on the dedupe key, declaring folders before the insert), `listNinaAlbumManifestAction`, `describeNinaImages` taken off the register path onto `after()`, `ensureNinaAvatarDescriptionAction`, and the thumbnail's second `del()`. Plus `resolveAttachment`'s two list-and-find ownership checks becoming single-row lookups. Exit: a batch of N records writes N rows in one action with `is_current` untouched; re-sending the same batch writes nothing new; the Route Handler still 404s a signed-in non-admin and 401s a signed-out one and mints thumbnail tokens at the 512 KB cap; no `glm-4.6v` call on any upload; deleting a photo with a thumbnail removes both Blob objects; `resolveAttachment` resolves by primary key; `/admin/nina` still renders.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 4 of 7)
  - **Satisfies**: R1, R2 — the file-manager album (R1), and one line of R2: `resolveAttachment` resolving a shared photo by primary key instead of an unbounded album read
  - **Depends on**: `P1-DB-A000`, `P1-RI-A000`, `P1-RI-A001`
  - **Plan**: `.workflows/plan/P1-RI-A002.md`
  - **Card**: `miftahulmahfuzh/run-insights#69`
  - **Completed**: 2026-09-04 17:05
  - **Method**: /implement
  - **Files**: lib/admin/schema.ts, lib/admin/ninaAlbumActions.ts, app/api/admin/nina/upload/route.ts, lib/nina/actions.ts, tests/admin.avatars.test.ts
  - **Verification**: `npm run typecheck` clean; `npm run build` succeeded with all routes emitted; `npm test` 120 files / 2161 tests green (2140 before, +21 from this phase's two new describe blocks); `npx vitest run tests/admin.avatars.test.ts` 29/29; `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched); `npm run format:check` clean. CI guards: `ci:data-layer-guard`, `ci:llm-payload-guard`, `ci:f08-guard`, `ci:f11-guard`, `ci:openrouter-guard` all PASS; `ci:client-secret-guard` FAIL, pre-existing at HEAD (see the third Drift note). Exit-criteria greps: `describeNinaImages(` has exactly two call sites in `lib/admin/ninaAlbumActions.ts` (`describeNinaAvatarAction`, `scheduleDescribe`), neither on a register path — no `glm-4.6v` call on any upload; `is_current` still has exactly three writers in `lib/nina/queries.ts` (`insertNinaAvatarAsCurrent`, `setCurrentNinaAvatar`, and `insertNinaAvatars` writing only `false`) — invariant 7 held.
  - **Not verified (deliberately)**: everything needing a live database. `drizzle/0003_nina_avatar_folders.sql` is generated but has not been applied to any database — applying it is a deploy action the plan-set coordinator carries to the user — so `registerNinaAvatarsAction`'s `declareNinaFolders` call is unexercised against real Postgres.
  - **Drift**: Step 6's verbatim code block omits the `kind` field from both of `resolveAttachment`'s return objects, but the function's declared return type is `{ blobUrl; pathname; kind: NinaImageKind; description }`, so the block as written would not typecheck. Kept `kind: 'generated'` on the avatar branch and `kind: row.kind` on the image branch with their existing explanatory comments; only the READ was swapped (list-and-find → `getNinaAvatar` / `getNinaMessageImage`), which is exactly what the step's prose and Impact section describe. **Open for the plan-set owner**: the plan source at `.workflows/plan/admin-album-file-manager/phase-4.md` Step 6 should carry the `kind` field.
  - **Drift**: Step 6's import edit resolved by grep as the plan instructs. `resolveAttachment` was the last caller of BOTH `listNinaAvatars` and `listNinaMessageImages` in `lib/nina/actions.ts`, and their removal also orphaned `NINA_GALLERY_LIMIT`; all three imports removed, `getNinaAvatar` and `getNinaMessageImage` added to the existing `./queries` import.
  - **Drift**: **Pre-existing CI break, not caused by this phase and not fixed here.** `npm run ci:client-secret-guard` fails on the branch and fails identically at HEAD (`76e0c2a`, phase 1's commit) — verified by stashing this phase's work and re-running. The offender is `lib/db/.workflows/package_readme.md:51`, prose written by phase 1's readme-updater that quotes `process.env.DATABASE_URL`; the guard greps `-rlE` across `lib/` and does not exclude markdown, so a documentation file trips RULE 2. Left alone deliberately: `lib/db/**` is phase 1's package, and phase 4's plan states in as many words that the guard file is not edited. **Needs an owner** — either the readme prose is reworded or the guard learns to skip non-source files.
  - **Drift**: `registerNinaAvatarAction`'s pre-edit body had `revalidatePath('/admin/nina')` before the describe pre-pass where the plan's quoted "before" shape implied it came after. Immaterial — the plan replaces the whole function and its replacement has one `revalidatePath` at the end, which is what landed.

---

## Archive
