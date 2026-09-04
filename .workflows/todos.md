# Todos: run-insights

**Package Path**: `.`
**Package Code**: RI
**Last Updated**: 2026-09-05
**Total Active Tasks**: 7

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 6
- Completed: 7

---

## Active Tasks

### [P0] Critical

### [P1] High

- [ ] **P1-RI-A007** Phase 3: Session-scoped chat surface and session lifecycle actions
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `app/nina/page.tsx` (resolves the active session from `?s=`, defaults to the most recent, reads one session's messages), `components/nina/ChatScreen.tsx` (the session id threaded to the send path), `lib/nina/actions.ts` (`sendNinaMessage` takes and writes a session), `lib/nina/gateway.ts` + `lib/nina/load.ts` (`readMessageWindow` scoped), `lib/nina/proactive.ts` and `lib/nina/imagejobs.ts` (both writers resolve a session), and a new `lib/nina/sessionActions.ts` (`'use server'`) exporting `createNinaChatSession`, `renameNinaChatSession`, `setNinaChatSessionPinned` and `removeNinaChatSession({ sessionId, activeSessionId })`, all returning `{ ok, next }` — the `*ChatSession*` infix is load-bearing, because phase 1's `queries.ts` already exports `renameNinaSession`, `setNinaSessionPinned` and `removeNinaSession`. It makes phase 1's optional session parameters **required**, which is how `tsc` proves no writer was missed, and it owns R11's two edge cases: what `/nina?s=<id>` renders when the runner removes the session he is currently reading, and what happens when he removes the last one, since every proactive message goes to "the most recent session" and a user with none is a state the cron must survive. Exit criteria: two sessions hold different conversations; a turn sent in one does not appear in the other and Nina's prompt for that turn contains none of the old session's messages; a proactive message written with no session in view lands somewhere findable; removing the open session navigates to a real one and removing the last one leaves the screen and the cron both working (R11); `tests/nina.gateway.patterns.test.ts` is updated for the widened `getNinaMessageWindow` mock.
  - **Status**: open
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 3 of 9)
  - **Satisfies**: R2, R11 — R2: Chat sessions: create a new one, or return to a previous conversation through a session-history list; R11: Remove a session
  - **Depends on**: `P1-DB-A001`, `P1-RI-A006`
  - **Plan**: `.workflows/plan/P1-RI-A007.md`
  - **Card**: `miftahulmahfuzh/run-insights#80`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

- [ ] **P1-RI-A008** Phase 4: Automatic session titling, and the rename path
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns **two** new modules where the draft named one: a pure `lib/nina/title.ts` (the prompt, the 3-4 word constraint, the parse and the sanitiser as pure functions with tests, importing `NINA_SESSION_TITLE_MAX_CHARS` from phase 1's `sessions.ts` and declaring no cap of its own) and a `server-only` `lib/nina/autotitle.ts` carrying the model call and exporting `titleNinaSessionIfNeeded` — the split is what keeps phase 5's `SessionRow` and phase 6's client-imported `search.ts` out of the exact build error `components/ui/index.ts` documents. It also owns the `after()` hook in `lib/nina/actions.ts` that fires the titler at phase 3's named seam, the manual-rename validation rule, and `scripts/check-llm-payload-boundary.mjs` — the only phase that may edit that file — registering both this titler and phase 6's `rankNinaSearchHits` in one commit and repairing that guard's header, which claimed "FOUR ENTRY POINTS. THIS TABLE IS COMPLETE" while `GUARDED_CALLS` has held five since `resolveNinaPromises` landed; the count becomes seven. `narrativeClient()` speaks Anthropic Messages, `narrativeModel()` is `glm-5.3`, a manual title is never overwritten (`title_source` makes that decision cheap), and the trigger must be idempotent because `after()` can run more than once and two tabs can race. Exit criteria: a fresh session titled within one `after()` of its first exchange, 3-4 words, no model call awaited in a render path; a manually renamed session keeps its name across further turns; the titler fires exactly once per session under a double-invoked `after()`; `npm run ci:llm-payload-guard` passes with both new entries present.
  - **Status**: blocked
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 4 of 9)
  - **Satisfies**: R3 — An LLM writes a 3-4 word title after the first user→Nina exchange; the user can also rename manually
  - **Depends on**: `P1-RI-A007`
  - **Plan**: `.workflows/plan/P1-RI-A008.md`
  - **Card**: `miftahulmahfuzh/run-insights#81`

- [ ] **P1-RI-A009** Phase 5: The hidden full-screen sidebar: session list, pin, rename, remove, Nina's circle
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns a new `components/nina/NinaSidebar.tsx` and the row components under it, a new pure `lib/nina/sidebar.ts` with tests, the `>` control added to phase 2's `ChatChrome.tsx`, `app/nina/page.tsx`'s header — **deleted**, with `NinaAvatar` and Nina's name moved inside the sidebar (R7) — and the pin / rename / delete row controls calling phase 3's `sessionActions`, with the session list ordered by phase 1's pure rule. Reconciliation fixed four spellings it had guessed: it calls phase 3's `renameNinaChatSession` / `setNinaChatSessionPinned` / `removeNinaChatSession` rather than the `queries.ts` names, renders phase 1's `sessionTitleFor`, derives `pinned` from `pinnedAt !== null`, and reuses phase 3's `sessions` and `activeSessionId` bindings instead of reading `listNinaSessions` a second time. The sidebar is an overlay on `components/ui/Sheet.tsx` rather than a route — the user asked for "slide right and take over full screen" — and it leaves a named, documented `searchSlot` seam for phase 6. **Remove** is the one destructive action in the whole set: it takes a conversation and its photos permanently, there is no confirm dialog anywhere in this codebase today and an undo would need the archive flag scope rules out, so the confirmation is the only thing standing between a mis-tap and a lost conversation (R11). Exit criteria: `/nina` shows no header row and no tab bar; the `>` control slides a full-screen sidebar in from the left; it lists every session pinned-first then most-recent-user-message-first; Nina's circle inside it still links to `/nina/about`; pin, rename and delete each work and the list reorders; the sidebar closes with the platform back gesture and does not trap focus behind it.
  - **Status**: blocked
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 5 of 9)
  - **Satisfies**: R6, R7, R4, R11 — R6: A hidden full-screen sidebar behind a floating `>` button, with search-all-chats and a persisted semantic-search toggle; R7: Move the Nina circle into the sidebar; no more top bar, just clean chat; R4: Pin sessions to the top; R11: Remove a session
  - **Depends on**: `P1-RI-A007`
  - **Plan**: `.workflows/plan/P1-RI-A009.md`
  - **Card**: `miftahulmahfuzh/run-insights#82`

- [ ] **P1-RI-A010** Phase 6: Search all chats, with the persisted semantic-search toggle
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns **four modules and two components** where the draft named one file: a pure `lib/nina/search.ts` (query normalisation, LIKE escaping, the term split, the debounce rule, snippet extraction, text ranking, semantic candidate assembly, the ranking parse and the href, with tests, its one import `SESSION_PARAM` from phase 3's `lib/nina/active.ts` so `?s=` has one spelling in the set); a `server-only` `lib/nina/semantic.ts` exporting **`rankNinaSearchHits`** in its own module precisely so phase 4's guard can sanction the definition site; a `'use server'` `lib/nina/searchActions.ts` exporting exactly `searchNinaChats` plus the private candidate-narrowing SQL, deliberately **not** in phase 1's `queries.ts`; `components/nina/useSemanticPref.ts` and `NinaSearchField.tsx` with the toggle's persistence key; and one in-file edit to phase 5's `NinaSidebar.tsx` rendering `<NinaSearchField>` at the named `searchSlot` seam, taking its `onNavigate` close callback from phase 5's `useNinaSidebar()`. It does not edit `app/nina/page.tsx` and does not touch the guard script, which phase 4 already registered. `localStorage` would be the codebase's **first** use — `grep -rn "localStorage"` over `lib`, `components` and `app` returns nothing today, and neither does `cookies()` — so the choice needs an argument and a hydration-safe read. Exit criteria: typing in the sidebar's field lists matching sessions and messages across all sessions; the toggle survives a reload; with the toggle on, a query that shares no words with a message still finds it; with the model unavailable, results degrade to text matching rather than erroring; no model call in a render path.
  - **Status**: blocked
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 6 of 9)
  - **Satisfies**: R6 — A hidden full-screen sidebar behind a floating `>` button, with search-all-chats and a persisted semantic-search toggle
  - **Depends on**: `P1-RI-A008`, `P1-RI-A009`
  - **Plan**: `.workflows/plan/P1-RI-A010.md`
  - **Card**: `miftahulmahfuzh/run-insights#83`

- [ ] **P1-RI-A011** Phase 7: Editing and deleting messages, his and hers
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns a new `lib/nina/messageActions.ts` (`'use server'`: edit and delete, both owner-scoped), a new pure `lib/nina/edit.ts` (what may be edited, what an empty edit means, how a delete composes with a quote) with tests, the `updateNinaMessage` / `deleteNinaMessage` queries, and the affordance in `components/nina/MessageBubble.tsx` wired through `MessageList.tsx` and `ChatScreen.tsx`. It touches `lib/db/schema.ts` only if an `edited_at` column is judged necessary, and if it is, this phase writes migration `0005` and says why a nullable timestamp is worth one. The affordance may not be a swipe-right (taken by reply), a long-press (rejected on the record: it collides with iOS text selection and the native callout, and copying what she said is a real capability) or a plain tap (breaks selection outright), so it is a fourth thing needing a keyboard and VoiceOver path exactly as the reply button got its `sr-only`-until-focused treatment. Nina's own words are editable on purpose — the plan must say plainly that the edited text becomes what she "said" on the next turn. A deleted message's photo rows cascade (A5) and their blobs are deliberately left, which must be *stated* rather than silently accepted; a distilled memory fact whose `source_message_id` points at a deleted row survives, since no FK exists. Exit criteria: editing a message changes the row and the next turn's prompt window contains the new text; deleting one removes it from the screen and from the prompt; a quote pointing at a deleted message degrades to plain text rather than throwing; a foreign message id is refused, not degraded; the reply swipe still works on every bubble.
  - **Status**: blocked
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 7 of 9)
  - **Satisfies**: R8 — Edit and delete his messages and hers, to keep Nina's context accurate
  - **Depends on**: `P1-RI-A007`
  - **Plan**: `.workflows/plan/P1-RI-A011.md`
  - **Card**: `miftahulmahfuzh/run-insights#84`

- [ ] **P1-RI-A012** Phase 8: The unread dot clears itself on the newest session
  - **Difficulty**: EASY
  - **Type**: Bug
  - **Context**: Owns `components/nina/NinaUnreadBadge.tsx` (docstring only), `app/nina/page.tsx`'s `after()` mark-read call — now session-scoped as `markNinaMessagesRead(userId, { sessionId: activeSessionId })`, phase 1's options-bag shape rather than the positional form this plan assumed — a new pure `lib/nina/unread.ts` with tests, and a `null`-rendering `components/nina/NinaUnreadSync.tsx` firing at most one `router.refresh()` per change of the flag. **The mark is per session, the count is global**: phase 1 ships the session parameter as *optional* on both `markNinaMessagesRead` and `countUnreadNinaMessages`, so `countUnreadNinaMessages(userId)` stays callable with no session argument and keeps reading the partial index `nina_messages_user_unread_idx`, and no index is added. The `if (activeSessionId !== null)` guard stays, because phase 3 deliberately tolerates a runner with no sessions rather than writing to the database in a render path. The dot is stale because `NinaUnreadBadge` is a Server Component whose only refresh trigger is a server render of another tabbed screen, and `markNinaMessagesRead` already returns a changed-row count no caller has ever used — so the fix is most likely a `revalidatePath` or targeted refresh on the transition from unread to read, not a new query, and it must not reintroduce the polling that docstring rejects. Exit criteria: open `/nina`, read her newest messages, stay on the page — the dot is gone with no navigation; a message that arrives while the page is open still raises it; no polling; the partial index `nina_messages_user_unread_idx` is still the index the count reads.
  - **Status**: blocked
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 8 of 9)
  - **Satisfies**: R9 — The red dot must disappear on its own once the most recent chat has been opened
  - **Depends on**: `P1-RI-A009`
  - **Plan**: `.workflows/plan/P1-RI-A012.md`
  - **Card**: `miftahulmahfuzh/run-insights#85`

- [ ] **P1-RI-A013** Phase 9: Tap an image: full screen, download, attach to a new message
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/nina/ChatImages.tsx` (pass `onOpen` at last — the prop has existed since phase 6 of F33 and its docstring says wiring it "should be its own card"), `components/nina/MessageList.tsx` and `ChatScreen.tsx` (viewer state and the `onOpen` thread), and `components/ui/PhotoViewer.tsx` (a download control and an attach control, both **optional props** so the four existing callers are byte-identical in behaviour). Reconciliation also assigned it the two-hunk image-id/kind mapping in `app/nina/page.tsx` that its own H1 identified as required and **nobody owned**: the `urlsByMessage` loop becomes a `photosByMessage` loop carrying ids and kinds and `imageIds` / `imageKinds` join the `initial` mapping, with no query change because `getNinaMessageImagesForMessages` already selects both columns, and `description` still dropped on the floor at that boundary (invariant 5). The new `Depends on: 7, 8` edge is what serialises that file to 3 -> 5 -> 8 -> 9 and keeps R10 whole in one phase. The download is the part of R10 most likely to quietly not work, since `<a download>` on a cross-origin Blob URL does not save on iOS Safari; attach reuses `sendNinaMessage`'s existing owner-scoped `attachExisting: { kind, id }` and the already-supported `/nina?photo=image:<id>` deep link rather than re-uploading. Exit criteria: tapping any chat image opens the full-screen viewer with pinch-zoom and paging intact; the download control saves the file on a real iPhone, or the plan states precisely what it does instead and why; the attach control arms the composer with that photo and a send persists a row pointing at the same blob with no re-upload; the four existing `PhotoViewer` call sites are unchanged in behaviour.
  - **Status**: blocked
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 9 of 9)
  - **Satisfies**: R10 — Tap a chat image for full screen, with a download icon and an attach-to-new-chat icon
  - **Depends on**: `P1-RI-A011`, `P1-RI-A012`
  - **Plan**: `.workflows/plan/P1-RI-A013.md`
  - **Card**: `miftahulmahfuzh/run-insights#86`

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

### [P1] P1-RI-A003
- [x] **P1-RI-A003** Phase 5: The file explorer: tree, breadcrumb, paginated grid, drop zone, upload queue, set-as-profile
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `app/admin/nina/page.tsx` (folder-scoped paginated `searchParams` reads, still a Server Component, `force-dynamic`, `requireAdmin()` on line 1) and `components/admin/FileExplorer.tsx` with its five children under `components/admin/explorer/`: the `webkitdirectory` picker, the Explorer drag-and-drop walk (`webkitGetAsEntry()` captured synchronously, `readEntries` looped until empty), the manifest diff through phase 2's `planFolderUpload`, client-side thumbnail derivation, a four-parallel bounded upload queue chunk-registering as files land, selection, the framing studio, and "Set as profile picture". Retires `AlbumManager.tsx`, `UploadAvatar.tsx` and the singular `registerNinaAvatarAction` in one commit. Exit: picker and drag-drop produce the same tree; a directory of more than 100 files uploads all of them; a re-drop uploads nothing and says so with a count; the grid issues only thumbnail requests; one click sets her profile picture; the retired files no longer exist; test, typecheck, lint and format:check green.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 5 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: `P1-RI-A002`
  - **Plan**: `.workflows/plan/P1-RI-A003.md`
  - **Card**: `miftahulmahfuzh/run-insights#70`
  - **Completed**: 2026-09-04 17:30
  - **Method**: /do
  - **Files**: app/admin/nina/page.tsx, components/admin/FileExplorer.tsx, components/admin/explorer/model.ts, components/admin/explorer/thumbnail.ts, components/admin/explorer/dropWalk.ts, components/admin/explorer/useFolderUpload.ts, components/admin/explorer/FolderTree.tsx, components/admin/explorer/PhotoGrid.tsx, components/admin/explorer/SelectionPane.tsx, components/admin/explorer/UploadQueue.tsx, components/admin/CropStudio.tsx, lib/admin/ninaAlbumActions.ts, components/admin/AlbumManager.tsx (deleted), components/admin/UploadAvatar.tsx (deleted)
  - **Verification**: `npm run typecheck` clean (next typegen resolves `PageProps<'/admin/nina'>`); `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, unrelated); `npm run format:check` clean; `npm test` 120 files / 2161 tests green with no new suite — correct for this phase, since what remains here is browser API and React and vitest runs `environment: 'node'`; `npm run build` emits `/admin/nina` as a dynamic route; all six `ci:*` guards PASS. Retirement greps: `AlbumManager.tsx` and `UploadAvatar.tsx` no longer exist, and no importer and no caller of `registerNinaAvatarAction` remains in `app/`, `components/`, `lib/` or `tests/`.
  - **Not verified (deliberately)**: the plan's nine manual browser checks — picker vs drag-drop tree parity, the >100-file `readEntries` batching check, the re-drop "nothing new" count, thumbnail-only network requests, set-as-profile, and the framing studio. `drizzle/0003` is generated but applied to no database, so `nina_folders` and the five new `nina_avatars` columns exist nowhere live and `/admin/nina` cannot render against them. Applying the migration is a deploy action the plan-set coordinator carries to the user; phases 1 and 4 both reported the same way. **These checks remain outstanding until the migration is applied.**
  - **Drift**: The plan's citations had drifted because phase 4 landed first — `registerNinaAvatarAction` at `:111` not `:87`, `setCurrentNinaAvatarAction` at `:156` not `:135`. Followed the plan's intent; no structural drift.
  - **Drift**: `EXPLORER_REGISTER_CHUNK` is exported, as the Interface Contract's Creates list names it, rather than the private `const REGISTER_CHUNK` the Step 4 code block wrote. Same value (`NINA_ADMIN_BATCH_MAX`). This harmonises the contract with the code block; it is not a second constant and not a fallback.
  - **Drift**: Dropped an unused `cn` import the plan's `UploadQueue.tsx` block wrote but never used — lint rejects it. `UploadQueue`'s `REFUSAL_TEXT` docstring said *"Ten entries, not four"*, but `UploadRefusal` has nine members and the plan's own code block had nine; reworded to *"Nine"*. The exhaustive `Record` typechecks.
  - **Drift**: Removing the singular `registerNinaAvatarAction` orphaned two imports in `lib/admin/ninaAlbumActions.ts` (`avatarRegisterSchema`, `insertNinaAvatarAsCurrent`) and one docstring on `AdminActionResult.id` naming the deleted function. Imports removed; the docstring now names the describe actions, which are what still set `id` (`:306`). `avatarRegisterSchema` itself stays in `lib/admin/schema.ts` as the plan requires — `tests/admin.avatars.test.ts` covers it.
  - **Drift**: The Step 7 SEAM comment quotes the string `NEXT_PUBLIC_`, and written as a JSX `{/* */}` block with bare continuation lines it failed `ci:client-secret-guard` Rule 3 — the guard's `isComment` only recognises `//`, `/*` and `*`-prefixed lines. Reformatted the comment with leading `*` per the convention every other mention in the repo already follows, with a note in it explaining why the prefix is load-bearing. **The guard script was NOT modified.**
  - **Drift**: Prettier reformatted three of the new files (`model.ts`, `PhotoGrid.tsx`, `useFolderUpload.ts`) — whitespace only.

### [P1] P1-RI-A004
- [x] **P1-RI-A004** Phase 6: Folder maintenance: create, rename, move, delete
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the create / rename / move / delete folder actions plus the photo move and remove in `lib/admin/ninaAlbumActions.ts` (each `requireAdmin()`-gated and Zod-validated against phase 4's `folderPathSchema`), the pure refusal decisions in `lib/admin/folderOps.ts` + `tests/admin.folderOps.test.ts`, `components/admin/FolderMenu.tsx` and `PhotoMoveBar.tsx`, and three insertions at phase 5's two marked seams. The current photo cannot be removed; a recursive delete removes rows first and blobs best-effort in chunks of 100; a move is an UPDATE of the folder column and copies no blob; undeclare a subtree only when it is actually empty. Exit: rename, move and recursive delete are reflected in the tree without a manual reload; a folder holding the current photo refuses deletion with a message naming the photo and the reason, and the second answer leaves it holding exactly that one photo; no folder operation changes the Blob object count except a delete; `npm test` and `npm run typecheck` green.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 6 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: `P1-RI-A003`
  - **Plan**: `.workflows/plan/P1-RI-A004.md`
  - **Card**: `miftahulmahfuzh/run-insights#71`
  - **Completed**: 2026-09-04 18:05
  - **Method**: /do
  - **Files**: lib/admin/folderOps.ts (new), tests/admin.folderOps.test.ts (new), lib/admin/ninaAlbumActions.ts, components/admin/FolderMenu.tsx (new), components/admin/PhotoMoveBar.tsx (new), components/admin/explorer/FolderTree.tsx, components/admin/FileExplorer.tsx
  - **Verification**: `npm run typecheck`, `npm run lint` (0 errors; 2 pre-existing warnings in `scripts/capture/shoot.mjs`), `npm run format:check`, `npm run build`, `npm test` (122 files / 2192 tests) and all six `ci:*-guard` scripts — all green.
  - **Outstanding**: Migration `0003` is applied to no live database, so `nina_folders` and the five new `nina_avatars` columns exist nowhere live. **No folder operation has been exercised against real rows** — the plan's nine-step manual check at `/admin/nina` could not be run. Everything verified above is static analysis plus the pure unit suite. Applying the migration is the coordinator's decision to carry to the user; phases 1, 4, 5 and 7 all reported the same way.
  - **Repair**: Phase 7 committed `components/admin/FileExplorer.tsx` as a partial stage (`c48bb60`) that reverse-applied phase 6's hunks, so the pushed tip lost this phase's `PhotoMoveBar` render, `allFolders`/`onNavigate`/`onFolderCreated` wiring and `pendingFolders` state — and did not typecheck, because `FolderTree` requires those three props. Restored from the working copy, which held the correct merged state; `shareOrigin` (phase 7) untouched. `npm run typecheck` exits 0 on the restored tree.
  - **Drift**: The plan's Step 4 `createNinaAlbumFolderAction` carried a stale docstring from before the owner added `nina_folders` — it claimed the action *"writes nothing"* and that *"there is no nina_folders table"*, directly beside a body calling `declareNinaFolders`. Rewritten to describe what the code does, per the plan's own instruction not to leave contradicting prose standing, and matching the repair phase 1 made to its twin.
  - **Drift**: The plan's `moveNinaAlbumFolderAction` did not call `renameNinaFolderSubtree` while its `renameNinaAlbumFolderAction` did — but phase 1 documents rename and move as literally the same statement. Without it, moving a declared-empty folder would move zero rows and leave the declaration at the old path, so the folder would appear not to have moved. Added the call with the rename action's rows-first ordering: the plan's stated intent (*"declarations follow the photographs"*) applied to the second caller of one statement.
  - **Drift**: `FolderMenu`'s docstring pointed at `lib/admin/folderPath.ts` for its path helpers — a file reconciliation deleted (Conflict 1). Corrected to `lib/admin/filetree.ts`.
  - **Drift**: The plan placed `<FolderMenu>` inside `FolderTree`'s `Row`, a 200px flex line, where its inline panels would lay out as a fourth flex item — squeezing the chevron/link/count and wrapping a text field into ~60px. The trigger stays inline; the panels are `absolute` overlays beneath it (`z-20`, 280px, `shadow-sheet`). Layout necessity of phase 5's seam, not a relocation of the affordance.
  - **Drift**: Phase 5's `SEAM — PHASE 6` comment proposed a separate *"New folder"* button under the `<nav>` in addition to a per-row menu. Implemented as the per-folder menu only, with `New subfolder` as its first item and the root's own `Row` carrying that single item — so the parent is the folder whose menu was opened rather than whichever folder the rail happens to have selected. The seam comment is rewritten in place to record that.
  - **Scope**: Multi-select is **not** built — `PhotoMoveBar` reads phase 5's single `selectedId` and passes `[selectedId]`. The actions are already plural (`ids`, bounded by `ADMIN_FOLDER_OP_MAX_IDS = 500`), so multi-select later is a client-only change. This is the reconciled decision, not an omission.
  - **Scope**: Internal drag-to-move is deliberately a named target list instead. Phase 5 owns `dragover`/`drop` for the Windows Explorer folder walk, and one handler disambiguating an OS folder from an in-page selection fails silently in both directions. Follow-up card.

### [P1] P1-RI-A005
- [x] **P1-RI-A005** Phase 7: "Share link to Nina" in the explorer, opening the chat in a new tab
  - **Difficulty**: EASY
  - **Type**: Feature
  - **Context**: Owns `lib/admin/shareToNina.ts` (the one place an avatar id becomes a chat URL, built through phase 3's formatter), `components/admin/ShareToNinaItem.tsx`, the one item at phase 5's marked seam in `components/admin/explorer/SelectionPane.tsx`, the `shareOrigin` prop threaded from `app/admin/nina/page.tsx` through `FileExplorer`, and `tests/admin.shareToNina.test.ts`. The click opens `<origin>/nina?photo=avatar:<id>` in a new tab with `'noopener'`, before awaiting anything, and fires (never awaits) `ensureNinaAvatarDescriptionAction` when the photo has no description. Exit: one new tab at the production origin with `window.opener === null`; the chat there shows the photo chipped in the composer; sending with or without text produces a reply; no image bytes are re-uploaded; an un-described photo gets described without the tab waiting for it; `npm test` and `npm run typecheck` green.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 7 of 7)
  - **Satisfies**: R2 — "Share link to Nina" on a photo in that explorer: opens the runins.site chat in a new browser tab with the photo attached as a pointer rather than a re-upload, takes an optional question, and Nina answers it
  - **Depends on**: `P1-RI-A001`, `P1-RI-A003`
  - **Plan**: `.workflows/plan/P1-RI-A005.md`
  - **Card**: `miftahulmahfuzh/run-insights#72`
  - **Completed**: 2026-09-04 17:51
  - **Method**: /do
  - **Files**: lib/admin/shareToNina.ts, components/admin/ShareToNinaItem.tsx, components/admin/FileExplorer.tsx, components/admin/explorer/SelectionPane.tsx, app/admin/nina/page.tsx, tests/admin.shareToNina.test.ts
  - **Verification**: `npm run typecheck` clean; `npm test` 121 files / 2167 tests green (new `tests/admin.shareToNina.test.ts` 6/6, round-tripping through phase 3's `parseNinaPhotoParam`); `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched); `npm run format:check` clean; `npm run build` succeeded with `/admin/nina` still ƒ dynamic; all six `ci:*` guards PASS.
  - **Outstanding**: The manual browser round trip (one new tab, `window.opener === null`, the photo chipped in the composer, unchanged Blob object count) is **not** verified — migration `0003` is applied to no live database, so `/admin/nina` cannot render anywhere yet. `npm run db:migrate` is the user's call and was deliberately not run.
  - **Drift**: No structural drift — every interface phase 7 required was present exactly as specified (`PHOTO_PARAM` / `formatNinaPhotoParam` / `parseNinaPhotoParam` in `lib/nina/attach.ts`; phase 5's `SEAM — PHASE 7` comment in `components/admin/explorer/SelectionPane.tsx`; `ensureNinaAvatarDescriptionAction` in `lib/admin/ninaAlbumActions.ts`).
  - **Drift**: Took the plan's own offered choice in its Step 3 *Styling* paragraph: `ShareToNinaItem`'s button wears `buttonClasses({ variant: 'secondary', size: 'md', fullWidth: true })` from `components/ui/Button.tsx` rather than the draft's ad-hoc `w-full text-left`. It stays a plain `<button>` so `window.open` runs inside the click's user activation.
  - **Drift**: The plan's docstrings quoted the literal `NEXT_PUBLIC_` prefix while explaining why the share origin cannot use one, which trips `ci:client-secret-guard`. Rephrased to *"a build-time public environment variable"* in all three places, and the JSX comment in `app/admin/nina/page.tsx` follows the repo's leading-`*` convention. The guard script was NOT modified.

---

### [P1] P1-RI-A006
- [x] **P1-RI-A006** Phase 2: Full-screen chat chrome: hide the bar, floating `^` / `v`, 5 s auto-hide
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/ui/AppShell.tsx` (`TabBar` stops being unconditional; a third `BOTTOM_GAP` case for "no bar"), `components/ui/TabBar.tsx` (a hidden state and the transform that reveals it), `lib/nina/chatview.ts`'s `composerBottomCss` (it must clear nothing when the bar is gone), a new pure `lib/nina/chrome.ts` holding the reveal state machine and the 5 s timer rule with tests, and a new `components/nina/ChatChrome.tsx` rendering the floating controls. It touches `app/nina/page.tsx` only for the one prop that selects the chat's chrome mode, and leaves the other four tabbed screens' unconditional bar alone. The geometry is the trap: `TAB_BAR_HEIGHT_PX = 58`, `TAB_BAR_FAB_OVERHANG_PX = 20`, `COMPOSER_CLEARANCE_PX = 78`, `COMPOSER_FALLBACK_PX = 146` and `BOTTOM_GAP.chat`'s Tailwind literal all encode the same three numbers, and a change to one without the others is a composer that floats or a bubble sliced by the bar. Exit criteria: `/nina` renders with no visible tab bar and the newest bubble is not obscured; the floating control reveals the bar, the glyph flips, and the bar hides again 5 s later; the transition holds still under `prefers-reduced-motion`; `keyboardOverlapPx`'s existing tests still pass and the new `chrome.ts` rules have their own.
  - **Status**: completed
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 2 of 9)
  - **Satisfies**: R1 — Full-screen chat: hide the bottom bar, a floating `^` to pull it up, a down button to hide it, auto-hide after 5 s
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-RI-A006.md`
  - **Card**: `miftahulmahfuzh/run-insights#79`
  - **Completed**: 2026-09-05 03:20
  - **Method**: /implement
  - **Files**: lib/nina/chrome.ts, lib/nina/chrome.test.ts, components/nina/ChatChrome.tsx, components/ui/TabBar.tsx, components/ui/AppShell.tsx, lib/nina/chatview.ts, lib/nina/chatview.test.ts, app/nina/page.tsx
  - **Verification**: `npm exec vitest run lib/nina/chrome.test.ts lib/nina/chatview.test.ts` 2 files / 48 tests green; the plan's named at-risk suites (`tests/motion.reducedMotion.test.ts`, `tests/share.bundle.test.ts`, `tests/ui.sheetFocus.test.ts`, `tests/ui.photoViewer.test.ts`) plus both new suites 6 files / 95 tests green; `npm test` 124/125 files and 2237/2239 tests pass; `npm run typecheck` clean on all eight files (grep for `ChatChrome|AppShell|TabBar|chatview|chrome.ts` in its output returns 0); `eslint` exit 0 and `prettier --check` clean on all eight; all six `ci:*` guards PASS (`ci:openrouter-guard`, `ci:data-layer-guard`, `ci:client-secret-guard`, `ci:f08-guard`, `ci:llm-payload-guard`, `ci:f11-guard`).
  - **Two failures seen during this phase, both phase 1's and both now closed**: while this phase was verifying, `npm test` and `npm run typecheck` were red from phase 1's *uncommitted* work in this shared worktree — (1) `lib/nina/queries.ts(587,7)` TS2769, `sessionId` missing from a `nina_messages` insert, and (2) 2 failures in `tests/db.schema.nina.test.ts` on the additive `session_id` column and the `nina_messages_session_seq_idx` / `nina_messages_user_session_runner_idx` indexes. Neither symbol appears in this phase's diff and `git status --short tests/` was empty. **Phase 1 closed both in its own later steps** (`insertNinaMessages` now resolves an omitted `sessionId` through `ensureNinaSession`; the schema suite's column and index lists were updated) and landed them in `7a89066`. Re-measured independently on the shared tree afterwards: `npm run typecheck` 0 errors, `npm test` 125/125 files and 2247/2247 tests green — with this phase's eight files and phase 1's twenty side by side. Recorded because the original diagnosis was a true snapshot of a mid-flight peer, not a defect in either phase.
  - **Drift**: The plan's step 6 code block does not typecheck as written. Its `--nina-bar-visible` effect cleanup was a concise arrow — `return () => root.style.removeProperty(NINA_BAR_VISIBLE_VAR)` — and `removeProperty` returns the removed value as a `string`, so the destructor typed as `() => string` and `tsc` rejected it against `EffectCallback` (TS2345 at `ChatChrome.tsx:159`). Changed to a block body so it returns `void`, with a comment recording why; behaviour is identical. **Open for the plan-set owner**: the plan source at `.workflows/plan/nina-chat-sessions/phase-2.md` still carries the concise form and should be corrected there for whoever re-runs this phase.
  - **Drift**: Ran `prettier --write` on `lib/nina/chrome.test.ts` only (three assertion call sites needed rewrapping past the 100-col limit), **not** `npm run format`, because two peer swarm sessions hold uncommitted work in this shared worktree and a repo-wide reformat would rewrite their in-flight files.

## Archive
