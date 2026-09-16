# Todos: run-insights

**Package Path**: `.`
**Package Code**: RI
**Last Updated**: 2026-09-16
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 44
- Archived: 41

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

- [x] **P1-RI-A043** Phase 2: Deep-link every chat push to its session and bubble
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/push/payload.ts`'s `buildNinaPushPayload` (new optional `sessionId` input and the deep-link URL it produces), and threading `sessionId?` through `lib/push/send.ts` (`sendNinaPush`, `NinaPushNotifier`, `notifyNinaPush`), `lib/nina/turnrun.ts`, `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts`, `lib/admin/chatPhotoActions.ts`, `lib/nina/proactive.ts` (widening `ProactiveNotifier`), and `scripts/nina-image-worker/push.ts` + `finish.ts`. Exit: every chat-shaped push kind (`chat_reply`, `photo_delivered`, `photo_apology`, `admin_chat_photo`, the five proactive triggers, and the worker's two backstop kinds) produces a `url` of `/nina?s=<sessionId>&jump=<messageId>`; `duplicate_image`'s payload is byte-for-byte unaffected; `sessionId` stays optional with the bare `PUSH_TARGET_URL` fallback intact; `npx tsc --noEmit` passes with `ProactiveNotifier` widened and the worker script still runs under `node --experimental-strip-types`; tests updated at each call site plus `lib/push/payload.test.ts`.
  - **Status**: completed
  - **Plan Set**: `PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R2 — The tap must land on the correct bubble in the correct chat session, not just the chat tab in general.
  - **Depends on**: none
  - **Plan**: `.workflows/plan/P1-RI-A043.md`
  - **Completed**: 2026-09-16 09:11
  - **Method**: /do
  - **Files**: lib/push/payload.ts, lib/push/send.ts, lib/nina/turnrun.ts, lib/nina/imagerun.ts, lib/nina/imagejobs.ts, lib/admin/chatPhotoActions.ts, lib/nina/proactive.ts, scripts/nina-image-worker/push.ts, scripts/nina-image-worker/finish.ts, lib/push/payload.test.ts, lib/push/send.test.ts, lib/push/duplicateImage.test.ts, tests/nina.turnpush.test.ts, tests/nina.imagerun.test.ts, tests/nina.imagepush.test.ts, tests/admin.chatPhotos.test.ts, tests/nina.imageworker.test.ts
  - **Drift**: `tests/admin.chatPhotos.test.ts` had a second `admin_chat_photo` `toHaveBeenCalledWith` assertion (a different test case, "a genuinely new photograph keeps today's admin_chat_photo push, unchanged") that the phase plan's Files table did not cite by line number — only one such assertion was listed. Updated it identically (appended `undefined`, `SESSION_ID`) since it pins the same call site's arity and would otherwise fail.
  - **Decided**: `pushNotifier`'s arrow function (`lib/push/send.ts`) declares `sessionId` via `satisfies ProactiveNotifier` rather than a type annotation, so contextual typing gave the parameter its TYPE but not its optionality — existing 3-argument callers (e.g. `pushNotifier('user-1', BUBBLES, 'silence')`) failed `npx tsc --noEmit` with "Expected 4 arguments, but got 3." Fixed by marking the parameter explicitly optional in the implementation (`sessionId?`) → Rung 2 (phase exit criteria: tsc must pass with `ProactiveNotifier` widened, and existing 3-arg callers must keep compiling).
  - **Verification**: `npx tsc --noEmit` clean; targeted vitest suite 8 files / 259 tests green; full `npm test` 352 files / 6121 tests green; `node --experimental-strip-types` worker-load check printed `[ 'sendWorkerPush' ]`; `@/`/`server-only` grep under `scripts/nina-image-worker/` shows only pre-existing header-comment mentions.

- [x] **P1-RI-A042** Phase 1: Make the tap work from anywhere
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/service-worker.js`'s `notificationclick` handler, the SW→window message-type constant (`lib/nina/live.ts`), a new app-wide client component that turns that message into a client-side route change, and its wiring into `app/layout.tsx`. Exit: `notificationclick` no longer relies on `WindowClient.navigate()` as its primary mechanism for an already-open, possibly-uncontrolled window (focus + postMessage works regardless); no unhandled promise rejection is reachable from any (controlled|uncontrolled) × (has navigate|doesn't) × (matches target|doesn't) combination; a window already showing the exact target (pathname + query) is focused without a redundant navigation; the new listener is mounted once, app-wide, and is reachable from a route `AppShell` does not wrap; new/updated tests cover the listener.
  - **Status**: completed
  - **Plan Set**: `PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md` (phase 1 of 2)
  - **Satisfies**: R1 — Tapping the push notification must work from anywhere in the app — any screen, any overlay (full-screen photo, another chat session, Nina's profile picture) — not just from a bare `/nina`.
  - **Depends on**: none
  - **Plan**: `.workflows/plan/P1-RI-A042.md`
  - **Completed**: 2026-09-16 09:08
  - **Method**: /do
  - **Files**: lib/service-worker.js, lib/nina/live.ts, lib/nina/live.test.ts, components/push/PushTapNavigator.tsx, components/push/PushTapNavigator.test.tsx, app/layout.tsx
  - **Decided**: `PushTapNavigator.test.tsx`'s `afterEach` crashed (`removeEventListener` on an undefined `navigator.serviceWorker`) → fixed the test cleanup ordering by calling `cleanup()` explicitly before deleting `navigator.serviceWorker` in the local `afterEach`, because this project's `afterEach` hooks fire in reverse registration order (the local hook ran before the global `afterEach(cleanup)` in `tests/support/setup.ts`). Tie-break rung: fix the code, never relax a failing check.
  - **Verification**: `npm run typecheck` clean; `npm run lint` 0 errors; `npx vitest run components/push/PushTapNavigator.test.tsx lib/nina/live.test.ts` 23/23. The live worktree's full `npm test` shows 14 failures, all in `tests/nina.imageworker.test.ts` and `tests/nina.turnpush.test.ts` — files phase 1 never opens, mid-edit under the concurrent P1-RI-A043. Proved not ours by copying phase 1's 6 files onto a clean detached-HEAD worktree: 352/352 files, 6112/6112 tests pass, typecheck clean.

- [x] **P1-RI-K3JQ** Viewer button + cross-folder navigation to the description panel
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/admin/albumDeepLink.ts` (new — the `?avatar=` grammar), `lib/nina/queries/avatars.ts` (`locateNinaAvatar`, `NinaAvatarLocation`), `components/ui/PhotoViewer.tsx` (`ViewerPhoto.id`, the `headerAction` slot), `components/admin/explorer/SearchResultsGrid.tsx` (the link + glyph), `components/admin/FileExplorer.tsx` (`deepLinkId` prop + landing effect), and the `?avatar=` resolution region of `app/admin/nina/page.tsx`. Exit: clicking the new button in the open viewer, for a search hit from any folder, lands the operator on `/admin/nina` with that exact photo selected and its description panel open — verified across folders and pagination; the `?avatar=` param is spent (replaced, not pushed) and reload-safe; a well-formed id naming no row lands on the album root with nothing selected; `npm run typecheck` and `npm test` green.
  - **Status**: completed
  - **Plan Set**: `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md` (phase 1 of 3)
  - **Satisfies**: R1 — Icon button in the full-screen viewer that jumps to that photo's description panel
  - **Plan**: `.workflows/plan/P1-RI-K3JQ.md`
  - **Completed**: 2026-09-15 15:00
  - **Method**: /do
  - **Files**: app/admin/nina/page.tsx, components/admin/FileExplorer.tsx, components/admin/FileExplorer.test.tsx, components/admin/explorer/SearchResultsGrid.tsx, components/admin/explorer/SearchResultsGrid.test.tsx, components/ui/PhotoViewer.tsx, components/ui/PhotoViewer.test.tsx, lib/admin/albumDeepLink.ts, lib/admin/albumDeepLink.test.ts, lib/nina/queries/avatars.ts, lib/nina/queries.test.ts, tests/admin.photoSearch.test.ts
  - **Drift**: None from the phase plan — every step applied at the exact line numbers/old_string the plan quoted, no manual adaptation needed.
  - **Drift**: Unrelated pre-existing issues found during verification, NOT caused by this phase (confirmed via `git status --short` / `git diff origin/main` showing zero change to these files): `npm run format:check` flags `tests/admin.albumUploadActions.test.ts` (pre-existing formatting drift from commit 81c101f), and `npm run ci:client-secret-guard` flags a raw `process.env.OPENROUTER_API_KEY` read in `lib/nina/embedding.test.ts` (pre-existing). Neither is this phase's to fix.
  - **Verification**: `npx vitest run` on the touched set 111/111; full `npm test` 6069/6069; `npm run typecheck` clean; `npm run lint` clean. Read-only production-DB smoke confirmed `locateNinaAvatar`'s correlated-subquery offset math (3/3 sample ids matched expected offsets) and that a well-formed non-existent id returns zero rows — this retires the phase plan's own flagged "needs a real-DB smoke" risk. **Still open:** no authenticated-browser walkthrough of the click-through UX (no local `ADMIN_EMAILS`/cookie-minting setup).

---

## Archive

### 2026-09

- P1-RI-A000: Phase 2: The pure file-tree library: image filter, path grammar, tree build, upload diff — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 2 of 7) [.workflows/plan/P1-RI-A000.md]
- P1-RI-A001: Phase 3: The chat side of "share link to Nina": the `?photo=` idiom, composer chip, `attachExisting` — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 3 of 7) [.workflows/plan/P1-RI-A001.md]
- P1-RI-A002: Phase 4: Folder-aware upload: batch register, thumbnails, and the describe pre-pass off the hot path — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 4 of 7) [.workflows/plan/P1-RI-A002.md]
- P1-RI-A003: Phase 5: The file explorer: tree, breadcrumb, paginated grid, drop zone, upload queue, set-as-profile — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 5 of 7) [.workflows/plan/P1-RI-A003.md]
- P1-RI-A004: Phase 6: Folder maintenance: create, rename, move, delete — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 6 of 7) [.workflows/plan/P1-RI-A004.md]
- P1-RI-A005: Phase 7: "Share link to Nina" in the explorer, opening the chat in a new tab — `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 7 of 7) [.workflows/plan/P1-RI-A005.md]
- P1-RI-A006: Phase 2: Full-screen chat chrome: hide the bar, floating `^` / `v`, 5 s auto-hide — `NINA_CHAT_SESSIONS_PLAN.md` (phase 2 of 9) [.workflows/plan/P1-RI-A006.md]
- P1-RI-A007: Phase 3: Session-scoped chat surface and session lifecycle actions — `NINA_CHAT_SESSIONS_PLAN.md` (phase 3 of 9) [.workflows/plan/P1-RI-A007.md]
- P1-RI-A008: Phase 4: Automatic session titling, and the rename path — `NINA_CHAT_SESSIONS_PLAN.md` (phase 4 of 9) [.workflows/plan/P1-RI-A008.md]
- P1-RI-A009: Phase 5: The hidden full-screen sidebar: session list, pin, rename, remove, Nina's circle — `NINA_CHAT_SESSIONS_PLAN.md` (phase 5 of 9) [.workflows/plan/P1-RI-A009.md]
- P1-RI-A010: Phase 6: Search all chats, with the persisted semantic-search toggle — `NINA_CHAT_SESSIONS_PLAN.md` (phase 6 of 9) [.workflows/plan/P1-RI-A010.md]
- P1-RI-A011: Phase 7: Editing and deleting messages, his and hers — `NINA_CHAT_SESSIONS_PLAN.md` (phase 7 of 9) [.workflows/plan/P1-RI-A011.md]
- P1-RI-A012: Phase 8: The unread dot clears itself on the newest session — `NINA_CHAT_SESSIONS_PLAN.md` (phase 8 of 9) [.workflows/plan/P1-RI-A012.md]
- P1-RI-A013: Phase 9: Tap an image: full screen, download, attach to a new message — `NINA_CHAT_SESSIONS_PLAN.md` (phase 9 of 9) [.workflows/plan/P1-RI-A013.md]
- P1-RI-A014: The `nina/` blob reaper must count references, not rows — Source: `NINA_CHAT_SESSIONS_PLAN.md` — phase 7's handoffs and phase 9's H5
- P1-RI-A015: Phase 1: The `+` becomes the `New` tab, and the overhang is deleted — `TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A015.md]
- P1-RI-A016: Phase 2: The composer clears the bar's outer height, so it sits flush — `TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-RI-A016.md]
- P1-RI-A017: Phase 1: Admin shell: viewport, safe areas, navigation — `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 1 of 5) [.workflows/plan/P1-RI-A017.md]
- P1-RI-A018: Phase 7: End-to-end: chat → `set_avatar` → generation → the profpic really changes — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 7 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-7.md]
- P1-RI-A019: Phase 1: Thread the current avatar into the chat's typing row — `NINA_CHAT_AVATAR_PROFILE_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-RI-A019.md]
- P1-RI-A021: Phase 1: The second manifest: `/admin` starts at `/admin` — `ADMIN_HOME_SCREEN_SHORTCUT_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A021.md]
- P1-RI-A022: Phase 2: A tile you can tell apart: the admin icon set — `ADMIN_HOME_SCREEN_SHORTCUT_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-RI-A022.md]
- P1-RI-A023: Phase 1: The composer: paint to the edge, take less room, frost the glass — `COMPOSER_FROST_AND_ADMIN_NOTCH_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A023.md]
- P1-RI-A024: Phase 2: The `/admin` install's own status-bar tint — `COMPOSER_FROST_AND_ADMIN_NOTCH_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-RI-A024.md]
- P1-RI-A025: Phase 1: The keyboard stops eating the sidebar's fields; the search field clears — `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` (phase 1 of 3) [.workflows/plan/P1-RI-A025.md]
- P1-RI-A026: Phase 2: Session actions become icons; the rename field clears — `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` (phase 2 of 3) [.workflows/plan/P1-RI-A026.md]
- P1-RI-A027: Phase 3: The sidebar's bottom icon rail — `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` (phase 3 of 3) [.workflows/plan/P1-RI-A027.md]
- P1-RI-A028: Phase 1: Auto-save panel: the Personality commit pipeline, buttons removed — `ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md` (phase 1 of 3) [.workflows/plan/P1-RI-A028.md]
- P1-RI-A029: Phase 2: Revision purge: the counter leaves frontend, backend, and database — `ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md` (phase 2 of 3) [.workflows/plan/P1-RI-A029.md]
- P1-RI-A031: Phase 3: Focus on: the redundant hint under each option — `ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md` (phase 3 of 3) [.workflows/plan/P1-RI-A031.md]
- P1-RI-A032: Phase 1: About-viewer codec + any-age photo deep link — `JOB_PHOTO_LINK_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A032.md]
- P1-RI-A033: Phase 2: Detail foto icon row (jump + photo) — `JOB_PHOTO_LINK_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-RI-A033.md]
- P1-RI-A034: Phase 1: Media folder in the Image collection explorer (read path) — `IMAGE_COLLECTION_PLAN.md` (phase 1 of 4) [.workflows/plan/P1-RI-A034.md]
- P1-RI-A035: Phase 2: Media verbs on both kinds; purge the Chat photos surface — `IMAGE_COLLECTION_PLAN.md` (phase 2 of 4) [.workflows/plan/P1-RI-A035.md]
- P1-RI-A036: Phase 4: "Image collection": rename + borderless grid — `IMAGE_COLLECTION_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-RI-A036.md]
- P1-RI-A037: Phase 1: Jump targets the earliest bubble carrying the photo — `JOB_JUMP_PHOTO_BUBBLE_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-RI-A037.md]
- P1-RI-A038: Phase 1: In-flight truth on reopen: claim-read cold load + honest give-up — `NINA_OFFLINE_REPLY_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A038.md]
- P1-RI-A039: Phase 2: Self-repair on arrival: revive dead chat turns when the session opens — `NINA_OFFLINE_REPLY_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-RI-A039.md]
- P1-RI-A040: Phase 1: Purge the tuning revision mechanism everywhere — `SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A040-simplify-personality-settings.md]
- P1-RI-A041: Phase 2: Auto-save the Personality panel — `SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-RI-A041-simplify-personality-settings.md]
- P2-RI-A006: Phase 6: The sweep, and the record — `NINA_CHARACTER_TUNING_PLAN.md` (phase 6 of 6) [.workflows/plan/P2-RI-A006.md]
