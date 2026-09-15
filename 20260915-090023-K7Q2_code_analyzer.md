# Code Analysis: Duplicate-Image Push Notification + Full-Screen Deep Link

**Type:** Feature Implementation
**Date:** 2026-09-15 09:00:23
**Session ID:** 20260915-090023-K7Q2
**Plan:** `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/dup-image-push-notify` (branch `feature/dup-image-push-notify`, base `origin/main` @ `c1a3d9e`)

---

## User Input

### Original User Request

> we have implemented image deduplication system. send a push notification if user/admin uploaded an image (from any image uploading route, whether from admin app or client app) if their image already exist in the whole of our app's image collection. also, can we make it so , if user click this notification, it will open run insights client app -> open full screen image view of that saved image?

### User-Provided Context

None beyond the prompt above. No files attached with `@`.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Send a push notification whenever an image uploaded through *any* image-upload route (admin app or client/runner app) turns out to already exist somewhere in the app's whole image collection. |
| R2 | Clicking that notification opens the Run Insights client app to a full-screen view of the pre-existing ("saved") image. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The app already contains dedup *detection* logic in several places, but (a) that detection is siloed per storage table and per route rather than covering "the whole image collection," and (b) no route currently surfaces a duplicate hit to the user in any way — it is a silent, internal bookkeeping event. The ask is to make every duplicate hit, on every upload route, produce a push notification, and to make that notification's click action deep-link into a full-screen view of the image that was already saved (the *keeper*, not the newly-rejected upload).

**Success Criteria**:
- Every route that accepts an image upload (5 routes identified below) performs (or already performs) a duplicate check against the same signed-in user's entire image collection across all three image-storing tables, not just the table that route itself writes to.
- On a hit, exactly one push notification fires, describing that a duplicate was found.
- The notification's stored `url` is a same-origin path that, when the service worker's existing `notificationclick` handler navigates to it, loads a page that opens `PhotoViewer` full-screen directly on the pre-existing image — with no dependency on an in-memory chat-message array or run-detail page context.
- No existing dedup *decision* behavior changes (which row is kept as the "original," which becomes a reference, when blobs get released) — this feature only adds detection-for-notification-purposes and the click-through surface.

**Key Considerations / Constraints found during investigation**:
- This is architecturally a **single-user app** (`lib/admin/requireAdmin.ts`, `lib/env.ts:158-181`) — "admin" is an email-gated route on the same account, not a second identity or a second push-subscription pool. So "notify user/admin" reduces to "notify the app's one user on every device they've subscribed on."
- There is **no single "image collection" table** — three independent tables (`run_photos`, `nina_avatars`, `nina_message_images`), each with a different (or absent) dedup mechanism, none of them cross-table today.
- The codebase has an explicit, stated invariant that the three *write-time dedup decision* modules (`lib/nina/dedupe.ts`, `lib/nina/imageDedupe.ts`, `lib/admin/chatPhotos.ts`) must **not** be merged and a fourth must not be grown (`lib/nina/dedupe.ts:36-43`). The new cross-table check for notification purposes must be **additive** — a new, separate, read-only layer consulted after each existing decision — not a rewrite of those three modules.
- The perceptual ("near duplicate") gate is tuned with production-measured constants scoped specifically to the chat-photo re-download/re-upload scenario (`lib/nina/perceptual.ts:9-10,39-42,58-62`) and is explicitly fragile ("if one number moves, move BOTH" — must mirror `scripts/nina-dedupe-plan.mjs`). Extending perceptual matching cross-table (to shots/avatars) is a distinct, much larger tuning effort not implied by "already exist" — scoped out (see Decisions).
- Two of the five upload routes (`run_photos` shots, `nina_avatars` batch) have **no content-hash column at all** today — `nina_avatars` only has a mechanical `source_key` (path+size+mtime) unique index, and `run_photos` has zero dedup. A schema migration is required to add `content_hash` to both.
- No existing full-screen viewer opens "an arbitrary photo by id, on a cold page load, without a preceding messages array." `usePhotoViewer.ts` needs `(messageId, index)` from an already-loaded chat; `/nina?photo=<kind>:<id>` (the only existing id-based deep link) arms the **composer's pending-attachment slot**, not a full-screen view, and only ever gets constructed for `kind: 'avatar'` from one admin "share to Nina" button. Neither is reusable as-is for R2; a new minimal route is the smallest correct fix (see Decisions).

---

## Analysis Scope

### Explicitly Mentioned Files

None — no `@` files in the request.

### Discovered Related Files

**Dedup / write-decision layer:**
- `lib/nina/dedupe.ts` — runner chat-upload decision (`ninaUploadInsertRow`, `partitionNinaUploadClaims`, `applyPerceptualKeepers`, `planNinaPickUpload`)
- `lib/nina/imageDedupe.ts` — generated/admin-worker decision (`planNinaImageWrite`)
- `lib/admin/chatPhotos.ts` — admin manual add decision (`planChatPhotoAddWrite`)
- `lib/nina/perceptual.ts`, `lib/nina/perceptualSign.ts` — perceptual twin gate (dHash/sig16, `isPerceptualTwin`)
- `lib/photos/contentHash.ts` — `contentHashOf()` (SHA-256), `isValidContentHash()`
- `lib/nina/actions/duplicateCheck.ts` — runner pre-check server action (`findNinaDuplicateChatImage`)
- `lib/admin/chatPhotoActions.ts` — admin pre-check (`findChatPhotoDuplicateAction`), and the five admin chat-photo server actions
- `lib/nina/actions/send.ts` — runner chat send finalize (STEP 1b race-close, `perceptualTwinsForClaims`)
- `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts` — generated-selfie delivery/apology write paths
- `lib/admin/ninaAlbumUploadActions.ts` — avatar batch register (`registerNinaAvatarsAction`, `listNinaAlbumManifestAction`), `source_key`-only dedup
- `components/admin/explorer/useFolderUpload.ts`, `components/admin/explorer/chatPhotoUpload.ts` — client-side upload orchestration
- `components/nina/useComposerPhotos.ts` — runner chat client-side upload orchestration

**Schema:**
- `lib/db/schema/runs.ts:290-317` — `run_photos` (no hash column)
- `lib/db/schema/nina/avatars.ts:150-219` — `nina_avatars` (`source_key` unique index only)
- `lib/db/schema/nina/chat.ts:578-716` — `nina_message_images` (`content_hash`, `perceptual_hash`, `perceptual_sig` columns + partial index)

**Upload routes (token mint + finalize):**
- `app/api/admin/nina/upload/route.ts:121-226` — admin token mint (avatar original/thumb, chat-photo)
- `app/api/upload/route.ts:53-145` — runner token mint (shots, nina-chat)
- `app/api/extract/route.ts:36-93` — shots finalize (`attachExtractionPhotos`) — **no dedup today**
- `lib/db/queries/photos.ts` — `attachExtractionPhotos`, `setPhotoExcludedFromShare`, `updatePhotoBlobLocation` (ownership-scoped, no simple "read one photo by id" query confirmed to exist yet — phase 2 must verify/add)

**Push infrastructure:**
- `lib/db/schema/push.ts:17-44` — `push_subscriptions` (per-`userId`, one row per browser install)
- `lib/env.ts:141-155,236-239` — VAPID env (`pushEnv()`)
- `lib/push/send.ts` — `sendNinaPush`, `notifyNinaPush` (never throws), `pushNotifier`, `configureVapid`, `PUSH_TTL_SECONDS`
- `lib/push/payload.ts:20,161-200,277` — `PUSH_TARGET_URL = '/nina'` (hardcoded), `NINA_PUSH_KINDS`, `buildNinaPushPayload`, `classifyPushFailure`, `shouldRevokeSubscription`
- `lib/push/queries.ts` — `savePushSubscription`, `listLivePushSubscriptions`, `countLivePushSubscriptions`, `deletePushSubscription`, `recordPushSuccess/Failure`
- `lib/push/actions.ts` — `subscribeToPushAction`, `unsubscribeFromPushAction`, `sendTestPushAction`
- `lib/service-worker.js:44,81-137,144-170` — `push` handler (reads `url`/`title`/`body`/`tag` off payload), `notificationclick` handler (already generically navigates `clients.matchAll` → `client.navigate(target)` / `openWindow(target)` for **any** same-origin path — not hardcoded beyond the payload's `url` value)
- `components/push/PushSetupCard.tsx` — subscribe/unsubscribe UI, service worker registration (`scope: '/'`)

**Existing call sites of `notifyNinaPush`/`pushNotifier`:**
- `lib/nina/proactive.ts:620,702` — proactive triggers
- `lib/nina/turnrun.ts:194` — chat reply
- `lib/nina/imagerun.ts:496` — generated photo delivered
- `lib/nina/imagejobs.ts:666` — generation apology
- `lib/admin/chatPhotoActions.ts:407-416` — **fires unconditionally on every admin Add, including duplicates** (kind `admin_chat_photo`)
- `scripts/nina-image-worker/push.ts` — off-platform worker backstop
- `lib/push/actions.ts:91-107` — manual test send

**Full-screen viewer / deep-link:**
- `components/ui/PhotoViewer.tsx:8-25,61-285` — the one shared full-screen overlay component (`role="dialog"`, driven by `useState` props: `photos`, `index`, `onIndex`, `onClose` — no route/URL involvement)
- `components/nina/usePhotoViewer.ts:15-77` — opens by `{messageId, index}` derived from the in-memory chat `messages` array
- `components/review/ScreenshotStrip.tsx`, `components/share/PhotoInclusionList.tsx` — other `PhotoViewer` callers, same in-memory-index pattern
- `lib/nina/attach.ts:88-163` — `NinaPhotoPointer {kind:'image'|'avatar'; id}`, `NinaExistingPhoto`, `formatNinaPhotoParam`/`parseNinaPhotoParam` (the `/nina?photo=` grammar — arms composer, not a viewer)
- `app/nina/page.tsx:150-266,395-398,583` — reads `?photo=`, resolves `(kind,id)` ownership-scoped, seeds `pendingPhoto` into `ChatScreen`
- `lib/admin/shareToNina.ts:38`, `components/admin/ShareToNinaItem.tsx:131` — the one live caller of `formatNinaPhotoParam` (`kind:'avatar'` only)
- `lib/nina/queries/avatars.ts:211-218` (`getNinaAvatar`), `lib/nina/queries/images.ts:272-282` (`getNinaMessageImage`) — single-row, `user_id`-scoped reads; miss → `null`, never an error page
- `app/manifest.ts`, `app/admin/manifest.webmanifest/route.ts:39-70`, `lib/pwa.ts:70-134` — two install identities, **one shared origin/scope (`/`)**, one shared service worker (`lib/service-worker.js:2-3`), registered once from `/me` (`components/push/PushSetupCard.tsx:126-137`)
- `app/(public)/s/[token]/page.tsx:281-330` — the one route that deliberately has no `PhotoViewer` (public, unauthenticated; plain `<a target="_blank">` to the raw blob URL)

---

## Current Dataflow

### Entry Point 1: Runner chat-photo upload (full dedup today)

**Location:** `components/nina/useComposerPhotos.ts:165-259` (client hash+pre-check) → `lib/nina/actions/send.ts:288-` (finalize)
**Trigger:** Runner picks/pastes an image in the `/nina` composer and sends a message with it attached.
**Input Schema:** File bytes (client) → `{ contentHash, sourceHash }` computed via `contentHashOf()` → `findNinaDuplicateChatImage(userId, hash)` pre-check.
**Validation:** `isValidContentHash()` gates a bad claim to `NULL`, never an error.
**Next Step:** If pre-check hits, `planNinaPickUpload` marks the tile `attach-existing`, no PUT occurs. At send time, `send.ts` re-derives via `partitionNinaUploadClaims`/`applyPerceptualKeepers` (exact hash race-close **and** perceptual twin scan against the owner's signed originals) and writes a **reference row** (`lib/nina/dedupe.ts:212-231`) copying the keeper's `blob_url`/`pathname`; any object that did land on Blob is released after the row commits (`send.ts:635-787`).
**Duplicate signal today:** None. The composer tile renders identically to a normal upload; no toast, no badge.

### Entry Point 2: Admin chat-photo Add (exact-hash only)

**Location:** `components/admin/explorer/chatPhotoUpload.ts:163-204` (client, opt-in `dedupe:true` from `MediaAdd.tsx:59`) → `lib/admin/chatPhotoActions.ts:260-420` (`addChatPhotoAction`)
**Trigger:** Admin uses "Add" in the `/admin` file explorer's chat-photo media panel.
**Validation:** `findChatPhotoDuplicateAction` (`chatPhotoActions.ts:446-`) pre-checks by exact content hash only — no perceptual gate.
**Next Step:** `planChatPhotoAddWrite` (`lib/admin/chatPhotos.ts:427-465`) decides insert vs reference; on reference, `notifyNinaPush(userId, ..., 'admin_chat_photo')` still fires **unconditionally** (`chatPhotoActions.ts:407-416`) — the existing push does not distinguish "new photo" from "this was actually a duplicate."
**Duplicate signal today:** None distinguishable — `MediaAdd.tsx` shows the same success state either way (no `duplicateOfId` reference in the component).

### Entry Point 3: Admin chat-photo Replace (no dedup)

**Location:** `lib/admin/chatPhotoActions.ts:148-205` (`replaceChatPhotoAction`)
**Trigger:** Admin uses "Replace" on an existing chat-photo row.
**Validation:** None against the collection — it only round-trips a caller-supplied `contentHash` claim onto the row (`:174-178`), never checked for a match elsewhere.
**Duplicate signal today:** None; not even detected.

### Entry Point 4: Admin avatar batch upload (mechanical, non-content dedup)

**Location:** `components/admin/explorer/useFolderUpload.ts` (client PUT loop) → `lib/admin/ninaAlbumUploadActions.ts:125-196` (`registerNinaAvatarsAction`)
**Trigger:** Admin drops a folder of images onto the avatar/album uploader.
**Validation:** `source_key` (normalized relative path + size + `lastModified`) unique index (`nina_avatars_user_source_key_unq`); `ON CONFLICT DO NOTHING`.
**Duplicate signal today:** Aggregate `skipped` count only, no per-file identity, no notification.

### Entry Point 5: Runner shots upload (no dedup at all)

**Location:** `components/extract/UploadPicker.tsx` (client) → `app/api/upload/route.ts:53-145` (token mint) → `app/api/extract/route.ts:36-93` (`attachExtractionPhotos`, finalize)
**Trigger:** Runner uploads a run screenshot/photo during extraction.
**Validation:** None — no hash computed, no lookup performed anywhere in this path.
**Duplicate signal today:** N/A — duplicates aren't even detected.

### Notification delivery (existing, unrelated to dedup)

`notifyNinaPush(userId, messages, kind)` (`lib/push/send.ts:234-244`) → `sendNinaPush` (`:151-195`) loads `listLivePushSubscriptions(userId)`, builds one payload via `buildNinaPushPayload`, calls `web-push`'s `sendNotification` per subscription, records success/failure, prunes dead ones on repeated failure or a terminal 404/410. The service worker shows the notification with `data.url` (always `/nina` today) and, on click, `clients.matchAll` → focus-if-open / `navigate()` / `openWindow()` to that path (`lib/service-worker.js:144-170`) — this click-navigation mechanism is **already generic**; it has just never been given a URL other than `/nina`.

---

## Key Data Structures

### `NinaPhotoPointer` / `NinaExistingPhoto`
**Location:** `lib/nina/attach.ts:88-112`
**Fields:** `{ kind: 'image' | 'avatar'; id: string }`, extended with `url: string`.
**Used In:** `/nina?photo=` grammar, write-side "keeper" shapes (`NinaUploadKeeper`, `NinaImageDedupHit`, `ChatPhotoKeeper` — all narrowings of the same `nina_message_images` row plus avatar-row equivalents).
**Gap:** No `kind: 'shot'` variant exists — `run_photos` isn't representable in this pointer type today. R1/R2 need a three-way kind.

### `nina_message_images` (excerpt)
**Location:** `lib/db/schema/nina/chat.ts:578-716`
**Fields:** `content_hash text`, `perceptual_hash text`, `perceptual_sig text`, `source_avatar_id`, `source_image_id` (both non-null = reference row), plus `blob_url`, `pathname`, `user_id`.
**Used In:** all three write-decision modules; `findNinaImageByContentHash`, `isOriginalPhoto()`.

### `nina_avatars` (excerpt)
**Location:** `lib/db/schema/nina/avatars.ts:150-219`
**Fields:** `source_key text` (unique per `user_id`), `blob_url`, `user_id`. **No content-hash column.**

### `run_photos` (excerpt)
**Location:** `lib/db/schema/runs.ts:290-317`
**Fields:** `blob_url`, `user_id`, extraction linkage. **No content-hash column, no dedup column of any kind.**

### `push_subscriptions`
**Location:** `lib/db/schema/push.ts:17-44`
**Fields:** `id`, `user_id` (FK, cascade), `endpoint` (unique), `p256dh`, `auth`, `last_success_at`, `last_failure_at`, `failure_count`, `revoked_at`.

### `NINA_PUSH_KINDS`
**Location:** `lib/push/payload.ts:161-200`
**Fields:** closed union of diagnostic "kind" strings (`chat_reply`, `photo_delivered`, `photo_apology`, `admin_chat_photo`, `run_committed`, `missed_usual_day`, `pattern_crossed`, `silence`, `avatar_changed`, `manual_test`). New kind needed: e.g. `duplicate_image`.

---

## Dependencies

### Configuration / Environment
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — `lib/env.ts:141-155` (Production-scope only per prior session notes; not directly re-verified here since it's a Vercel dashboard setting, not code).
- No admin-specific push config — single `push_subscriptions` table, no role column anywhere in `lib/db/schema/auth.ts`.

### External Services
- `web-push` npm package (`lib/push/send.ts:2`).
- Vercel Blob (all three image tables store a public blob URL; no server-side auth gate on the raw bytes — only on the app's own pages/actions, per `lib/db/queries/photos.ts:83-86`).

### Database
- Postgres via Drizzle; migrations live under the project's standard migration folder (per prior session notes: verify against `origin/main`, never rename a migration file, regenerate on collision).

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `content_hash` (nina_message_images) | `lib/db/schema/nina/chat.ts:661` | def | `lib/db/schema` |
| `content_hash` (run_photos) | *(does not exist yet)* | gap | `lib/db/schema` |
| `content_hash` (nina_avatars) | *(does not exist yet)* | gap | `lib/db/schema` |
| `contentHashOf` | `lib/photos/contentHash.ts:40-48` | def | `lib/photos` |
| `planNinaPickUpload` | `lib/nina/dedupe.ts:369-379` | def | `lib/nina` |
| `planNinaImageWrite` | `lib/nina/imageDedupe.ts:72-99` | def | `lib/nina` |
| `planChatPhotoAddWrite` | `lib/admin/chatPhotos.ts:427-465` | def | `lib/admin` |
| `findNinaDuplicateChatImage` | `lib/nina/actions/duplicateCheck.ts:39-62` | call | `lib/nina` |
| `findChatPhotoDuplicateAction` | `lib/admin/chatPhotoActions.ts:446-` | call | `lib/admin` |
| `addChatPhotoAction` | `lib/admin/chatPhotoActions.ts:260-420` | call | `lib/admin` |
| `replaceChatPhotoAction` | `lib/admin/chatPhotoActions.ts:148-205` | call | `lib/admin` |
| `registerNinaAvatarsAction` | `lib/admin/ninaAlbumUploadActions.ts:125-196` | call | `lib/admin` |
| `attachExtractionPhotos` | `lib/db/queries/photos.ts:26-47` | call | `lib/db/queries` |
| `sendNinaMessage` | `lib/nina/actions/send.ts:288-` | call | `lib/nina` |
| `notifyNinaPush` | `lib/push/send.ts:234-244` | def | `lib/push` |
| `pushNotifier` | `lib/push/send.ts:255-269` | def | `lib/push` |
| `NINA_PUSH_KINDS` | `lib/push/payload.ts:161-200` | def | `lib/push` |
| `buildNinaPushPayload` | `lib/push/payload.ts` (~:277 sets `url`) | def | `lib/push` |
| `PUSH_TARGET_URL` | `lib/push/payload.ts:20` | def (const) | `lib/push` |
| service worker `push`/`notificationclick` | `lib/service-worker.js:81-137,144-170` | def | root |
| `NinaPhotoPointer`/`NinaExistingPhoto` | `lib/nina/attach.ts:88-112` | def | `lib/nina` |
| `formatNinaPhotoParam`/`parseNinaPhotoParam` | `lib/nina/attach.ts:137-163` | def | `lib/nina` |
| `PhotoViewer` | `components/ui/PhotoViewer.tsx:61-285` | def | `components/ui` |
| `usePhotoViewer` | `components/nina/usePhotoViewer.ts:15-77` | def | `components/nina` |
| `getNinaAvatar` | `lib/nina/queries/avatars.ts:211-218` | def | `lib/nina` |
| `getNinaMessageImage` | `lib/nina/queries/images.ts:272-282` | def | `lib/nina` |
| run-photo point read by id | *(not confirmed to exist)* | gap | `lib/db/queries` |

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema/runs.ts` (`run_photos`) — add nullable `content_hash` column — **Phase 1**
2. `lib/db/schema/nina/avatars.ts` (`nina_avatars`) — add nullable `content_hash` column — **Phase 1**
3. New migration file(s) under the project's migrations folder — **Phase 1**
4. New shared cross-table lookup (e.g. `lib/photos/globalDuplicate.ts`) — **Phase 1**
5. `lib/push/payload.ts` — new `duplicate_image` push kind, payload shape carrying the existing image's `(kind, id)` and a same-origin `url` — **Phase 1**
6. New shared notify helper on top of `notifyNinaPush` for the duplicate case — **Phase 1**
7. New route/page e.g. `app/photo/[kind]/[id]/page.tsx` — ownership-scoped resolve + mount `PhotoViewer` full-screen for a single arbitrary photo — **Phase 2**
8. `lib/nina/attach.ts` (or a new shared module) — extend the `kind` union to include `'shot'` for `run_photos` if the pointer type is reused for the new route — **Phase 2**
9. `lib/db/queries/photos.ts` — add an ownership-scoped point-read-by-id query for `run_photos` if none exists — **Phase 2**
10. `app/api/extract/route.ts` / `lib/db/queries/photos.ts` (`attachExtractionPhotos`) — compute hash client-side, cross-table check, notify on hit — **Phase 3**
11. `components/nina/useComposerPhotos.ts` / `lib/nina/actions/send.ts` — cross-table check + notify on hit (in addition to existing intra-table dedup) — **Phase 3**
12. `components/extract/UploadPicker.tsx` — compute `contentHashOf()` client-side before/alongside upload, same pattern as chat photos — **Phase 3**
13. `lib/admin/chatPhotoActions.ts` (`addChatPhotoAction`, `replaceChatPhotoAction`) — cross-table check + notify, suppress the generic `admin_chat_photo` push when the Add is a duplicate — **Phase 4**
14. `lib/admin/ninaAlbumUploadActions.ts` (`registerNinaAvatarsAction`) — compute content hash client-side (`components/admin/explorer/useFolderUpload.ts`), cross-table check + notify — **Phase 4**

**This document describes. The plan files prescribe.**
