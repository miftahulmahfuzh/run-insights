# Plan: Duplicate-Image Push Notification + Full-Screen Deep Link

**Slug:** dup-image-push-notify
**Date:** 2026-09-15 09:00:23
**Analysis:** `20260915-090023-K7Q2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/dup-image-push-notify`
**Branch:** `feature/dup-image-push-notify` (base: `origin/main` @ `c1a3d9e`)
**Phases:** 4
**Status:** phase 4/4 complete — all four phases landed (phase 1 @ 5effec6 — P1-PHO-Q7XK; phase 2 — P1-APP-M4TZ; phase 3 — P1-EXT-R9WD; phase 4 — P1-ADM-L2VN). Set is ready to review and merge as a whole.
**Coordinator:** —

---

## Why

> we have implemented image deduplication system. send a push notification if user/admin uploaded an image (from any image uploading route, whether from admin app or client app) if their image already exist in the whole of our app's image collection. also, can we make it so , if user click this notification, it will open run insights client app -> open full screen image view of that saved image?

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Push notification on any upload route when the image already exists in the whole app image collection | 1, 3, 4 |
| R2 | Clicking the notification opens the client app to a full-screen view of the saved (original) image | 1, 2 |

*Final, post-reconciliation.* No requirement moved between phases in round 1 — every conflict was
about a name, a shape or a file region, not about who owns which requirement — so this table is
unchanged from the draft and matches all four plans' **Satisfies** lines. Phase 1 serves both:
R1's detection-and-notification machinery and R2's `/photo/<kind>/<id>` URL contract are one
coherent foundation, which is why it is not splittable.

## Scope

**In scope:**
- A new, additive, cross-table exact-content-hash duplicate check, run after each existing per-route upload finalize step, covering all three image tables (`run_photos`, `nina_avatars`, `nina_message_images`) for the current signed-in user.
- Adding a `content_hash` column to `run_photos` and `nina_avatars` (currently absent), computed client-side at upload time using the existing `contentHashOf()` pattern — new rows only, going forward.
- One new push notification kind (`duplicate_image`) fired **at most once per upload event** on all five upload-finalize routes: once per detected duplicate on the four routes that accept one image per gesture, and **once per register chunk** on the avatar folder drop, which accepts up to fifty (see Decisions — ratified by the reconciler, and every kind shares one notification tag, so N sends already collapse to one visible notification anyway).
- A new, minimal, ownership-scoped route that opens `PhotoViewer` full-screen for an arbitrary `(kind, id)` photo pointer on a cold page load — the notification's click target, `/photo/<kind>/<id>`, whose grammar is owned end-to-end by one module (`lib/photos/pointer.ts`, phase 1).
- Wiring the service worker's already-generic `notificationclick` navigation to this new URL (no service-worker code changes needed beyond what already exists — verify only).

**Out of scope, and why:**
- Merging or restructuring the three existing write-time dedup *decision* modules (`lib/nina/dedupe.ts`, `lib/nina/imageDedupe.ts`, `lib/admin/chatPhotos.ts`) — an explicit code comment (`lib/nina/dedupe.ts:36-43`) says not to merge them or grow a fourth; this feature only adds a read-only detection layer alongside them.
- Extending the perceptual/near-duplicate ("twin") gate cross-table to shots/avatars — its constants are production-measured and narrowly scoped to the chat-photo re-download/re-upload case (`lib/nina/perceptual.ts:9-10,39-42,58-62`); this feature only adds **exact** content-hash matching cross-table.
- Backfilling `content_hash` for pre-existing `run_photos`/`nina_avatars` rows — matches this codebase's own precedent of shipping a dedup mechanism first and a backfill sweep script later (`scripts/nina-dedupe-media.mjs`).
- Cross-user matching — every existing dedup/query in this codebase is `user_id`-scoped; "whole of our app's image collection" means the whole collection *belonging to the one signed-in user*, not across accounts (there being effectively one account today).
- Any change to which row is kept vs. released when a duplicate is written (the existing keeper/reference logic, and blob release timing, are unchanged).

## Invariants

- The tree builds (`npx tsc --noEmit`) and the existing test suite passes at the end of every phase.
- No existing dedup *decision* behavior changes: which row becomes the keeper, which becomes a reference, and blob release timing/order are unchanged by this feature.
- Notification failures never fail the write they're attached to (matches the existing pattern at every current `notifyNinaPush` call site — always wrapped in try/catch, never thrown).
- All new queries and the new photo-view route remain strictly `user_id`-scoped; a miss (wrong owner or nonexistent id) degrades silently (`null`/404), never leaks existence via an error message — matches `lib/nina/queries/images.ts:264-266`'s stated invariant.
- The new push kind's `url` is always a same-origin path beginning with `/`, matching the existing fallback contract in `lib/service-worker.js:44` (`FALLBACK_URL = '/nina'` if malformed).

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Scope of "whole of our app's image collection" — per-user or cross-user? | Per-user (the signed-in user's rows across all 3 tables); no cross-user matching | 6: surrounding convention — every existing dedup/query in the codebase is `user_id`-scoped; this app has one real user, and matching across users would be a new, unstated, security-relevant capability |
| Matching method for the new cross-table check | Exact SHA-256 content-hash only, via the existing `contentHashOf()` pattern; no cross-table perceptual/near-duplicate matching | 6: surrounding convention — the perceptual gate's constants are explicitly production-measured and paired ("if one number moves, move BOTH"); extending its scope is a distinct tuning effort the request doesn't ask for |
| Does the new duplicate push replace or add to a route's existing "upload succeeded" push? | Where a route already pushes unconditionally on every write (`addChatPhotoAction`, kind `admin_chat_photo`), suppress that generic push and send only `duplicate_image` on a hit; all other routes had no existing push, so `duplicate_image` is purely additive there | 5: user's raw input — "send a push notification... if duplicate" reads as one dedicated notification per event, not two |
| Click-through target for the notification | A new, minimal route (e.g. `app/photo/[kind]/[id]/page.tsx`) that resolves the pointer ownership-scoped and mounts `PhotoViewer` directly on a single photo — rather than reusing `/nina?photo=` (arms the composer, not a viewer) or `usePhotoViewer` (needs an in-memory chat-messages array unavailable on a cold load) | 6: surrounding convention / Step 2 findings — neither existing mechanism does what R2 needs; a new minimal route composing the existing `PhotoViewer` component is the smallest correct addition |
| Does the new photo pointer need a `'shot'` kind? | Yes — extend the existing `{kind, id}` pointer shape (or a new equivalent) to a 3-way union `'shot' \| 'avatar' \| 'image'` so `run_photos` rows are representable for the click-through route | 6: surrounding convention — `lib/nina/attach.ts`'s existing 2-way `NinaPhotoPointer` is the closest prior art but is missing exactly this table |
| Content-hash backfill for existing `run_photos`/`nina_avatars` rows | Out of scope — new rows only, going forward | 6: surrounding convention — this codebase's own media-dedupe rollout shipped detection first and a separate backfill sweep script later |
| **Which module owns the `/photo/<kind>/<id>` grammar** — phase 1's `lib/photos/pointer.ts` or phase 2's independently-written `lib/photos/deepLink.ts`? (Reconciler, round 1) | Phase 1's `lib/photos/pointer.ts`. Phase 2's duplicate module is deleted; the route imports `parsePhotoViewerSegments` / `PhotoPointerKind` from phase 1. `lib/nina/attach.ts`'s two-way `NinaPhotoKind` is **not** widened by anyone. | 2: the phases' exit criteria — phase 1's exit criterion pins `photoViewerPath` and phase 1's push helper already calls it, while phases 3 and 4 were written against phase 1's names; phase 1 is upstream of all three. Two structurally identical codecs for one URL is the exact drift both modules' own headers were written to prevent. |
| **Can `findGlobalDuplicatePhoto`'s `exclude` name more than one row?** Phase 1 shipped a single pointer; phase 3 flagged that as a defect for batched writes. (Reconciler, round 1) | Widened to `PhotoPointer \| readonly PhotoPointer[] \| null`; the two new per-table finders take `excludeIds?: readonly string[]` and use `notInArray`. Phases 3 and 4's multi-row call sites pass the whole gesture's rows; the two admin chat routes pass a single pointer. | 3: the plans' code blocks — three of the five upload routes write more than one row per gesture (up to 3 shots, N chat images, up to 50 avatars) and two files in one gesture can carry identical bytes, so a per-row exclusion makes them announce *each other*. Phase 1's own `exclude` docstring already says the exclusion exists so that "already" means "before now"; the single-pointer form could not express that for a batch. |
| **One push per detected duplicate, or one per batch, on the avatar folder drop?** (Reconciler, round 1 — phase 4 asked for a ruling) | **One per batch**, ratified as phase 4 wrote it: the scan visits every landed row, the first hit buzzes, the true count goes to the log. The Scope bullet above was rewritten to match rather than the cap removed. | 6: surrounding convention — the Invariants section says nothing about push cardinality (so "exactly once per detected duplicate" was Scope prose, not a rule), and every notification this app sends shares one `PUSH_NOTIFICATION_TAG = 'nina'` with `renotify`, so N sends already collapse to ONE visible notification. The cap changes what is *sent*, not what the runner *sees*. Phase 1's own handoff had already named this remedy for this case. |

## Open Questions

None. Every fork above is reversible (notification wording and cardinality, schema columns, module
placement, and backfill timing can all be revisited later without destroying data or rewriting
history), and after reconciliation every requirement id is owned by at least one phase — so nothing
meets the bar for this section.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Schema + cross-table dedup detection + push kind | R1, R2 | `lib/db/schema`, `lib/photos`, `lib/push`, `lib/db/queries`, `lib/nina/queries` | 18 | — | HARD | `.workflows/plan/dup-image-push-notify/phase-1.md` | P1-PHO-Q7XK | — |
| 2 ✅ | Full-screen deep-link viewer route | R2 | `app`, `components/photo`, `lib/db/queries` | 4 | 1 | NORMAL | `.workflows/plan/dup-image-push-notify/phase-2.md` | P1-APP-M4TZ | — |
| 3 ✅ | Wire runner-side upload routes (shots, chat) | R1 | `app/api/extract`, `components/extract`, `lib/db/queries`, `lib/nina/actions`, `lib/schema` | 9 | 1 | NORMAL | `.workflows/plan/dup-image-push-notify/phase-3.md` | P1-EXT-R9WD | — |
| 4 ✅ | Wire admin-side upload routes (chat photo add/replace, avatar batch) | R1 | `lib/admin`, `components/admin/explorer`, `lib/nina/queries` | 9 | 1 | NORMAL | `.workflows/plan/dup-image-push-notify/phase-4.md` | P1-ADM-L2VN | — |

File counts are the phase plans' own, not the draft's estimates (the draft said ~6/~5/~5/~5). Phase 1
is large because five of its files are the closed-list tests this repo uses to freeze schema shape
and barrel surface, plus the generated migration triple, plus `lib/push/send.ts` — each fails on the
first source edit, so none of it is optional and none of it is creep.

Phases 2, 3, and 4 all depend only on phase 1 (the shared schema/detection/push-kind foundation, the
`(kind,id)` pointer module, and the `/photo/<kind>/<id>` URL contract) and run concurrently after
phase 1 lands. **Two files are touched by more than one phase; both are additive in disjoint regions
and the sequence is fixed:**

| File | Order | Regions |
|---|---|---|
| `lib/db/queries/photos.ts` | 1 → then 2 and 3 concurrently | **1** appends `findRunPhotoByContentHash` after `listExtractionPhotos` and rewrites the `drizzle-orm` import line; **2** inserts `RunPhotoPoint` + `getRunPhoto` after *that* function; **3** edits `NewPhotoInput` + `attachExtractionPhotos`, which sit above both, and adds one `@/lib/photos/contentHash` import |
| `lib/nina/queries/avatars.ts` | 1 → then 4 | **1** inserts `findNinaAvatarByContentHash` after `getNinaAvatarBySourceKey` and rewrites the `drizzle-orm` import line; **4** edits `insertNinaAvatars`, ~350 lines below |

Every `:NN` line number in phases 2, 3 and 4 was read at the base commit. Phase 1 lands first and
inserts ~45 lines into each of those two files, so **locate anchors by name, never by line**, and
verify the merge with `npm run typecheck` in the land worktree rather than assuming git got it right.

### Phase 1 — Schema + cross-table dedup detection + push kind
**Satisfies:** R1, R2 (shared foundation both later phases build on — genuinely not splittable: the pointer shape, push kind, and schema columns are one coherent contract)
**Owns:**
- Migration `drizzle/0022_*` adding nullable `content_hash text` + a partial index to `run_photos` and `nina_avatars`. (Generated only — applying it is a deploy-time decision, and `.env.local`'s `DATABASE_URL` is production.)
- Two new per-table content-hash finders: `findRunPhotoByContentHash` (`lib/db/queries/photos.ts`) and `findNinaAvatarByContentHash` (`lib/nina/queries/avatars.ts`), each `(userId, contentHash: string | readonly string[], excludeIds?: readonly string[])`. The third finder, `findNinaImageByContentHash`, already exists and is called unchanged.
- The shared read-only cross-table lookup `findGlobalDuplicatePhoto(userId, contentHash, { exclude })` in `lib/photos/globalDuplicate.ts` — first match across all three tables in the fixed priority `image → avatar → shot`, as a `ResolvedPhotoPointer`, or `null`. `exclude` takes one pointer **or a list**.
- **`lib/photos/pointer.ts` — the one module that owns the `/photo/<kind>/<id>` grammar**: `PhotoPointerKind`, `PHOTO_POINTER_KINDS`, `PhotoPointer`, `ResolvedPhotoPointer`, `isPhotoPointerKind`, `photoViewerPath`, `parsePhotoViewerSegments`. A pure sibling of `lib/nina/attach.ts`'s two-way union, **not** a widening of it.
- A new `duplicate_image` entry in `NINA_PUSH_KINDS`, an optional `url` on `buildNinaPushPayload` / `sendNinaPush` / `notifyNinaPush` (defaulting to today's `/nina`), and the notify helper `notifyDuplicateImagePush(userId, pointer)` in `lib/push/duplicateImage.ts`, which is the only thing that turns a pointer into a push and the only caller of `photoViewerPath` outside phase 2's route.

**Does not touch:** the three existing write-decision modules' own logic (only reads the rows they wrote), the perceptual gate, `lib/nina/attach.ts` (byte-for-byte), `lib/service-worker.js`, any upload route's own finalize code (phases 3/4), the new viewer route (phase 2), any avatar or shot **write** path — the two `content_hash` columns are created here and written by phases 3 and 4.

**Exit criteria:** `npm run db:generate` produces `drizzle/0022_*.sql` with exactly the two `ADD COLUMN`s and two `CREATE INDEX`es, `_journal.json` gains `idx: 22`, and `db:check` + `ci:schema-drift-guard` pass; `findGlobalDuplicatePhoto` has unit tests covering a hit in each of the three tables, a miss that consults all three, a no-round-trip miss on an invalid hash claim, and the **list** exclusion pushed into SQL for `shot`/`avatar`; `photoViewerPath({kind:'shot',id})` is exactly `/photo/shot/<id>`, frozen by `lib/photos/pointer.test.ts`; `notifyDuplicateImagePush` is proven to send kind `duplicate_image` with that url and never a blob URL; `npm run typecheck`, `npm test` and `npm run build` green with no behaviour reachable from the running app changed.

### Phase 2 — Full-screen deep-link viewer route
**Satisfies:** R2
**Owns:**
- New route `app/photo/[kind]/[id]/page.tsx` — the directory name is **half of phase 1's URL contract**, so it is fixed, not a choice. Calls `requireUserId()`, parses the two segments with **phase 1's `parsePhotoViewerSegments`**, then one ownership-scoped point read per kind: `getNinaAvatar`, `getNinaMessageImage`, and a new `getRunPhoto(userId, photoId)` for `run_photos` (verified absent at the base commit; phase 1's `findRunPhotoByContentHash` is a hash lookup and explicitly not a substitute).
- `components/photo/PhotoDeepLinkScreen.tsx` — the `'use client'` wrapper that mounts `PhotoViewer` on a one-element array at `index=0`, with `onIndex` a deliberate no-op and close deriving its destination from the photo itself (a committed shot closes onto `/r/<runId>`, everything else onto `/nina/about` or `/`), via `router.replace`.
- A miss of any sort (malformed kind, malformed id, foreign id, deleted id) redirects to `/` — one answer, no error page, nothing that leaks which ids exist.

**Does not touch:** `lib/photos/pointer.ts` (phase 1's — imported, never edited, and **this phase declares no second copy of the codec**); `lib/nina/attach.ts` and `app/nina/page.tsx`'s `?photo=` composer-arming grammar; `usePhotoViewer.ts` or any of the pre-existing `PhotoViewer` callers pinned by `tests/nina.chatPhoto.test.ts`; `components/ui/PhotoViewer.tsx` itself (composed, never edited); `lib/service-worker.js` (verified generic — confirmed, not changed); `proxy.ts`'s matcher (a UX redirect, not the security boundary — `requireUserId()` is).

**Exit criteria:** `/photo/<kind>/<id>` opens `PhotoViewer` full-screen on that exact photograph for all three kinds as the owning user; every miss redirects to `/` with no error page and no distinguishable response; `app/photo/[kind]/[id]/page.tsx` exists at the path `photoViewerPath` spells and the round trip through its own segments is pinned by `tests/photo.deepLink.test.ts`; `npm run typecheck` (the `next typegen` leg is not optional — `PageProps<'/photo/[kind]/[id]'>` does not exist without it), `npm test`, `npm run lint` and `npm run ci:data-layer-guard` pass.

### Phase 3 — Wire runner-side upload routes
**Satisfies:** R1
**Owns:**
- The shots path: `components/extract/UploadPicker.tsx` hashes the **compressed** bytes it PUTs with `contentHashOf`; `ExtractionBlobRefSchema` accepts the claim (nullable, defaulting to `null`, so an older client and `RetryExtraction` stay valid requests); `attachExtractionPhotos` is the **insert door** that writes it through `isValidContentHash` or writes `NULL`; and `POST /api/extract` registers a second `after()` callback — ahead of the extraction job's — that asks phase 1's lookup once per distinct hash, **excluding every row this request inserted**, and fires the push on a hit.
- The audit column `extractions.blob_urls` deliberately does **not** carry the hash: `RetryExtraction` re-POSTs those rows verbatim, and a round-tripped hash would make every retry announce its own earlier rows.
- The chat path: `lib/nina/actions/send.ts` **reports** the duplicate judgement it already makes (the composer pre-check, the exact-hash race-close, the perceptual twin scan) and additionally asks phase 1's cross-table lookup about the claims it decided were genuinely new — both drained in one `after()` task registered **last**, so no existing deferred-task index moves. Not one line of the dedup *decision* changes. A same-send reference is deliberately left silent, because "already" would be a lie about a row created seconds ago.
- `components/nina/useComposerPhotos.ts` — **verified, no change**: it already hashes every pick and already sends both `contentHashes` and `dedupedImageIds`.

**Does not touch:** the admin-side routes (phase 4), phase 1's shared lookup / pointer / push implementation (imported, never edited — and this phase never builds a `/photo/...` URL), the perceptual gate, `lib/nina/dedupe.ts` / `imageDedupe.ts` / `duplicateCheck.ts`, `ExtractionBlobRefRow`.

**Exit criteria:** a shot whose bytes already exist in any of the three tables produces exactly one `duplicate_image` push per upload event, a genuinely new shot none, and a shot whose hash could not be computed none *and still uploads*; `run_photos.content_hash` is populated for every new shot from the current client and `NULL` for anything without a valid claim; `extractions.blob_urls` still carries exactly six fields and "Try again" produces no notification; a chat photo that is an exact-hash, same-keeper or perceptual duplicate produces exactly one push *in addition to* the reference row it already wrote, with the reference row, keeper choice and blob release byte-identical to before; `npx tsc --noEmit` clean, `npm test` green.

### Phase 4 — Wire admin-side upload routes
**Satisfies:** R1
**Owns:**
- `addChatPhotoAction`: two questions in the order that makes the second rare. **First the plan** — `planChatPhotoAddWrite` already sets `sourceImageId`/`sourceAvatarId` on exactly its duplicate branches and has already flattened a pinned re-share down to the original, so a private `duplicateTargetFromPlan(plan)` reads the answer off it with no query and answers the one case a hash lookup cannot (a keeper whose own `content_hash` is NULL). **Then, only for a genuinely fresh original**, phase 1's cross-table lookup excluding the row just inserted. On either hit the existing unconditional `admin_chat_photo` push is **suppressed** and `duplicate_image` takes its place; on a genuine new add that line is bit-identical to today.
- `replaceChatPhotoAction`: hoist the `isValidContentHash` normalisation (it is needed twice now) and add the lookup after the row is committed. This route's `contentHash` claim was written and never read; this is the line that makes it answer something. **The replace itself is never gated on the answer** — its contract is "swap the bytes behind THIS row", and a deduped replace would repoint the row at another row's object and strip its provenance. The push is purely informational.
- The avatar folder batch: `useFolderUpload.ts` hashes the **picked file** (this path PUTs it unmodified, so the file's bytes *are* the stored bytes), `avatarBatchRecordSchema` carries the claim (`nullish`, shape-only — the format gate is the action's), `NinaAvatarBatchInsert` + `insertNinaAvatars` write the column, and `registerNinaAvatarsAction` schedules an `after()` scan over the rows that **actually landed** (`RETURNING` after `ON CONFLICT DO NOTHING`), joined to their hashes by `pathname`, with **the whole chunk excluded**. One push per chunk; the true hit count goes to the log.
- The first behavioural test file for `registerNinaAvatarsAction` (`tests/admin.albumUploadActions.test.ts`) — none existed.

**Does not touch:** the runner-side routes (phase 3), the `source_key` unique index and its `ON CONFLICT DO NOTHING` (still the only key the avatar insert conflicts on), `planChatPhotoAddWrite`'s own logic (read, never edited), `avatarColumns` (not widened — nothing here reads a hash back), `setChatPhotoAsAvatarAction`, phase 1's shared lookup / pointer / push implementation (imported, never edited — and this phase never builds a `/photo/...` URL).

**Exit criteria:** `addChatPhotoAction` sends **exactly one** push per successful add — `duplicate_image` when the add was a duplicate by plan *or* by cross-table hit, `admin_chat_photo` otherwise — and neither on any of its four refusal paths; `replaceChatPhotoAction` sends `duplicate_image` when the replacing bytes already exist elsewhere, and the replace is byte-for-byte the same operation as before in every case; `nina_avatars.content_hash` is populated for every new folder-upload row whose client could hash the file, and `registerNinaAvatarsAction` sends **at most one** `duplicate_image` per chunk, from `after()`, with a re-dropped folder scheduling nothing at all; `npx tsc --noEmit`, `npm test` and `npm run lint` pass.

## Reconciliation Log

Two rounds. Seventeen conflicts found, seventeen resolved by editing the phase plans in place; no
requirement left unowned and no fork parked. Round 2 was a verification pass over round 1's biggest
change (the widened `exclude`) and found that change sound everywhere — its four fixes are all
round-1 residue, none of them a signature.

### Round 1

Thirteen conflicts found, thirteen resolved by editing the phase plans in place; no
requirement left unowned and no fork parked. The four planners ran concurrently and could not see
each other's work, so every conflict below is a place where two of them guessed differently about
one shared thing.

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 1 | Duplicate work | **Two modules for one URL grammar.** Phase 1 created `lib/photos/pointer.ts` (`PhotoPointerKind`, `PHOTO_POINTER_KINDS`, `PhotoPointer`, `ResolvedPhotoPointer`, `isPhotoPointerKind`, `photoViewerPath`, `parsePhotoViewerSegments`); phase 2 independently created `lib/photos/deepLink.ts` (`PhotoDeepLinkKind`, `parsePhotoDeepLink`, `photoDeepLinkHref`) doing the identical job in the identical directory, and its handoff asked phase 1 to adopt *its* builder — backwards, since phase 1's push helper already calls `photoViewerPath` and phases 3/4 were written against phase 1's names. | **Phase 1 wins** (upstream, and three phases already depend on it). Phase 2's `lib/photos/deepLink.ts` is deleted from its plan; its Step 1 is now a mapping table and a note, its route imports `parsePhotoViewerSegments` / `PhotoPointerKind` from `@/lib/photos/pointer`, and its `resolveDeepLinkPhoto` is retyped. Phase 2's file count 5 → 4. Recorded in **Decisions**. |
| 2 | Contract drift | **Phase 2's test file duplicated phase 1's codec tests** and imported the deleted module. | `tests/photo.deepLink.test.ts` keeps its name and its structural route claims (the half phase 1's test cannot see: the route DIRECTORY exists, opens with `requireUserId`, answers every miss with a redirect, never names `description`), drops the codec describes that `lib/photos/pointer.test.ts` already owns, and keeps exactly one overlapping assertion — the round trip from `photoViewerPath` through the segments this route is handed, which is the seam where a renamed route folder becomes visible. The division of labour is stated in the file. |
| 3 | Unmet assumption | **Phase 2 claimed it imported no phase-1 symbol** and "builds and passes tests on a tree where phase 1 has not landed". False after #1. | Phase 2's `Depends on` line and `Requires` block rewritten: the dependency is now hard, on named symbols, with phase 1's real signatures quoted. Its Leaves-alone list gains `lib/photos/pointer.ts`. |
| 4 | Name mismatch | **The finder.** Phase 1 ships `findGlobalDuplicatePhoto` returning `ResolvedPhotoPointer`. Phase 3 assumed `findGlobalDuplicateImage` returning `GlobalDuplicatePointer`; phase 4 assumed `findGlobalDuplicateImage` returning `GlobalPhotoPointer`, plus a `GlobalPhotoKind` that does not exist. | Phase 1's real name and type used throughout phases 3 and 4 — 15 occurrences in phase 3, 26 in phase 4, covering call sites, type annotations, `vi.mock` factories and prose. `GlobalPhotoKind` → `PhotoPointerKind`. Both plans gained a mapping table so the rename is auditable rather than silent. |
| 5 | Name mismatch | **The type's home.** Both phases 3 and 4 imported the pointer type from `@/lib/photos/globalDuplicate`. Phase 1 declares it in the pure `@/lib/photos/pointer` (so a browser-safe caller can name it without dragging in `server-only` and the DB client); `globalDuplicate.ts` imports it too. | Both plans' import blocks split into `import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'` + `import type { ResolvedPhotoPointer } from '@/lib/photos/pointer'`. |
| 6 | Name mismatch | **The notify helper.** Phase 1 ships `notifyDuplicateImagePush`; phase 3 assumed `notifyDuplicateImage` (same module path, wrong export). Phase 4 guessed it correctly. | Phase 3 renamed at 16 occurrences. Module paths were right in both plans, so no `vi.mock` specifier moved. |
| 7 | Contract drift | **`exclude` was positional in phase 4** — `findGlobalDuplicateImage(u, hash, {kind, id})` — but phase 1 takes an options object, `{ exclude: … }`. | All three of phase 4's call sites and both of its assertions rewritten to `{ exclude: … }`. |
| 8 | Contract drift → **contract change** | **`exclude` could name only one row.** Phase 1 shipped `exclude?: PhotoPointer \| null`. Phase 3 explicitly flagged this as a defect: three of the five upload routes write more than one row per gesture (up to 3 shots, N chat images, up to 50 avatars) and two files in one gesture can carry identical bytes, so a per-row exclusion makes them announce *each other* — a push about a photograph created seconds ago in the same gesture. | **Phase 1's signature widened** to `exclude?: PhotoPointer \| readonly PhotoPointer[] \| null`; its two new per-table finders take `excludeIds?: readonly string[]` and use `notInArray` with a length guard; `findGlobalDuplicatePhoto` normalises once and splits by kind; two new unit cases pin the list form and the mixed-kind split, and three existing ones move from `'id'` to `['id']`. Phase 4's avatar scan changed from excluding its own row to excluding the whole chunk (built once, outside the loop) and its test case 4 rewritten. Phases 3's two call sites already passed arrays and needed no change. Recorded in **Decisions**. |
| 9 | Ruling requested | **Push cardinality on the avatar folder drop.** Phase 4 capped it at one push per batch and called it "a documented departure from the index's 'exactly once per detected duplicate'", asking for a ruling. | **Ratified as written.** The Invariants section says nothing about push cardinality, so the phrase phase 4 was departing from was Scope prose, not a rule; the surrounding convention decides it (rung 6) — every kind shares one `PUSH_NOTIFICATION_TAG = 'nina'` with `renotify`, so fifty sends already collapse to ONE visible notification. The cap changes what is *sent*, not what the runner *sees*, and phase 1's own handoff had already named this exact remedy for this exact case. The **Scope** bullet above was rewritten to match; phase 4's docstring and handoff now record the ratification instead of asking. Recorded in **Decisions**. |
| 10 | File collision | **`lib/db/queries/photos.ts` is edited by three phases.** Phase 1 appends `findRunPhotoByContentHash` "after `listExtractionPhotos`"; phase 2 inserts `getRunPhoto` at the *same* anchor and quoted base-commit lines `:72`/`:75`; phase 3 edits `NewPhotoInput`/`attachExtractionPhotos` above both. All three also touch the `drizzle-orm` import line region. | One owner per region, sequenced: phase 1 first (it alone rewrites the `drizzle-orm` import line in full), **phase 2 re-anchored to insert after phase 1's function**, phase 3's region is above both. A collision table is in the index and a sequencing note in each of the three plans, each saying to locate anchors by name because phase 1 shifts the file ~45 lines. |
| 11 | File collision | **`lib/nina/queries/avatars.ts` is edited by phases 1 and 4.** Phase 4 quotes `insertNinaAvatars` at `:598-620`, which are base-commit lines; phase 1 inserts ~45 lines above it. | Regions are disjoint; sequence fixed (1 then 4) and the line-drift warning added to both plans' Files sections. |
| 12 | Duplicate work (suspected) — **cleared** | Phase 4's risk notes flagged possible overlap with phase 1 on `lib/nina/queries/{shapes,avatars}.ts` around avatar `content_hash` threading, and offered to drop its own Steps 5c/5d if phase 1 already threaded it. | **Checked against phase 1's actual plan: it does not.** Phase 1 adds the *column* and a read-only *finder* and threads the hash into no write path anywhere; `lib/nina/queries/shapes.ts` appears in no phase but 4. **Steps 5c and 5d stay** and are now marked as confirmed-not-duplicated in phase 4's `Requires`. The symmetric case holds for `run_photos`: phase 1 adds the column, phase 3 writes it. |
| 13 | Contract drift | **Phase 1's Files table omitted `lib/push/send.ts`**, which its own Step 8c edits (`sendNinaPush`, `NinaPushNotifier`, `notifyNinaPush` all gain the optional `url`). Its Interface Contract listed only `buildNinaPushPayload` under Signature changes. | Row added to the Files table and two entries added to Signature changes; phase 1's count corrected 17 → 18 and the index's Phases table updated. |

**Cross-checks that found nothing, recorded so they are not re-run:**

- **Route directory and kind literals** (the thing most likely to drift silently): phase 2 creates `app/photo/[kind]/[id]/page.tsx` accepting exactly `'shot' | 'avatar' | 'image'`; phase 1's contract demands exactly that directory and those three literals; phases 3 and 4 never spell a URL at all — they hand a pointer to `notifyDuplicateImagePush`, which is the sole caller of `photoViewerPath`. **No drift.**
- **Deleted-then-used:** all four plans declare `Deletes: none` and `Renames: none`, and no symbol is removed anywhere in the set. Nothing to order.
- **Impact points:** all fourteen in the analysis document are owned. Point 8 ("extend the `kind` union … or a new shared module") is served by phase 1's `lib/photos/pointer.ts` rather than by phase 2 as the analysis guessed — the ownership moved, the coverage did not.
- **Reference-list gaps:** the three gaps the analysis named (`run_photos.content_hash`, `nina_avatars.content_hash`, a run-photo point read by id) are owned by phases 1, 1 and 2 respectively.
- **Build-green, per phase:** phase 1 is additive and reachable by nothing (knip will report its new exports as unused until 2/3/4 land — expected, not a gate). Phase 2 compiles on phase 1 + base. Phase 3 needs only `runPhotos.contentHash` and the two phase-1 modules. Phase 4 needs only `ninaAvatars.contentHash` and the same two. No phase requires a later one.
- **Requirement creep:** no phase's steps serve an `R` outside its own Satisfies line; no `R` moved between phases, so the Requirements table is unchanged from the draft.

**`contract_changed: true`** — conflict 8 widened a signature phases 3 and 4 call. Both were updated
in this round; the caller was told so it could decide, and it ran round 2.

### Round 2 — verification pass

Re-read all four plans and this index in full against the widened contract. **The contract itself is
applied consistently and no call site, type import or mock factory needed changing.** Verified:

- `exclude` is the third argument's **field** at all six call sites — phase 3 ×2 (both lists, built
  with `.map`), phase 4 ×4 (the two admin chat routes pass a single pointer, one row per call; the
  avatar batch passes the whole chunk as a list, built once outside the loop). No positional form
  survives anywhere.
- Phase 1 **implements** the widened signature rather than only describing it: `GlobalDuplicateOptions.exclude`
  is `PhotoPointer | readonly PhotoPointer[] | null` in the code block, the normaliser splits by kind
  before each arm, both new finders take `excludeIds?: readonly string[]` with a length guard around
  `notInArray`, and the test file pins the single form, the list form and the mixed-kind split.
- No stale symbol survives in phases 2-4. Every hit for `findGlobalDuplicateImage`,
  `GlobalPhotoPointer`, `GlobalPhotoKind`, `notifyDuplicateImage`, `PhotoDeepLinkKind`,
  `parsePhotoDeepLink`, `photoDeepLinkHref` or `lib/photos/deepLink.ts` is inside a round-1 mapping
  table or reconciler note — deliberate, and correctly marked as the deleted spelling.
- Both multi-owner files carry a stated sequence in the index **and** in each plan that touches them,
  and no phase quotes stale line numbers as authoritative (see #17 for the one exception, now fixed).

Four leftovers found and fixed. All four are documentation-level; **no step, signature or code block
changed meaning**, so nothing downstream needs re-planning and no third round is warranted.

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 14 | Contract drift | **Phase 4's round-1 mapping table had been clobbered by round 1's own global rename.** Its left column ("draft (wrong)") read `findGlobalDuplicatePhoto` / `ResolvedPhotoPointer` / `PhotoPointerKind` — identical to the right column — so the table proved nothing, and its lead sentence claimed the draft had guessed the names *correctly*, contradicting both this log's #4 and phase 4's own first Handoffs bullet. | Left column restored to the draft's real names (`findGlobalDuplicateImage`, `GlobalPhotoPointer`, `GlobalPhotoKind (does not exist)`, positional `exclude`) from #4 and phase 4's Handoffs, with a note recording why it had to be repaired. The rename is auditable again. |
| 15 | Contract drift | **Phase 1 contradicted itself three ways on whether `notifyDuplicateImagePush` throws.** Its helper docstring was headed "IT NEVER THROWS … and so does this"; its own test asserted `.rejects.toThrow()` under the title "does not throw when the notifier rejects"; the code block adds no `try` at all. An implementer reading the heading would have added a third catch and turned the test red. | Settled on **rung 3, the plans' code blocks**: the helper adds no catch, which is also what phase 3's `Requires` #3 already states and what every phase-3/4 call site is written against. The docstring heading and the test title were the losing side and are edited out — heading now "IT ADDS NO CATCH OF ITS OWN, AND ITS CALLERS STILL WRAP IT", test now "adds no catch of its own — a bookkeeping failure propagates to the call site that wraps it". Behaviour, code and call sites unchanged. |
| 16 | Contract drift | **Phase 1's Interface Contract spelled the helper's parameter `ResolvedPhotoPointer \| PhotoPointer`** while its code block, phase 3's `Requires` and phase 4's `Requires` all spell it `PhotoPointer`. The union reduces to `PhotoPointer`, so this was a spelling mismatch rather than a type one. | Contract line narrowed to `PhotoPointer`, with one clause recording why the narrower parameter is the point (a `ResolvedPhotoPointer` is assignable to it, and the narrow type is what keeps its BLOB `url` from being mistaken for the tap target). |
| 17 | File collision (residue) | **Phase 4's Step 5d still quoted `lib/nina/queries/avatars.ts:598-620` in its heading and its instruction**, with the line-drift warning ~590 lines away in the Files section. This is the one anchor in the set that phase 1 actually moves (~45 lines down), so the step that acts on it was the one place the warning was missing. | Heading de-numbered, an inline "locate by name, never by line" blockquote added at the step, and the instruction reworded to "the tail of `insertNinaAvatars`". Phase 2's Step 2 already carried the equivalent inline warning; phase 3's region sits above both insertions, which its Files note already explains. |

**`contract_changed: false` for round 2.** No deletion, creation or rename moved between phases, and
no signature changed — the four fixes are prose, a test title, a heading and a restored audit table.

## Rollback

- **Phase 1:** revert the migration (drop the two new nullable columns and their indexes — safe, additive-only, no code depends on them until phases 3/4 land) and delete `lib/photos/pointer.ts`, `lib/photos/globalDuplicate.ts`, `lib/push/duplicateImage.ts` and their tests, the two new per-table finders, and the optional `url` on the push path. **Phase 1 must be rolled back only after phases 2/3/4** — `lib/photos/pointer.ts` is phase 2's parser and the two `content_hash` columns are phases 3/4's write targets. The migration triple (`.sql` + snapshot + journal entry) comes out together or `db:check` fails on a broken bijection.
- **Phase 2:** delete `app/photo/` and `components/photo/` and the one test; revert the `getRunPhoto` insertion in `lib/db/queries/photos.ts` by hand (the file also carries phase 1's and phase 3's edits). **`lib/photos/pointer.ts` is phase 1's and stays.** If phase 2 is rolled back after 1/3/4 have landed, phase 1's push `url` must revert to `PUSH_TARGET_URL` in the same commit, or the notification names a path that 404s.
- **Phase 3 / Phase 4:** each is a set of additive call-site edits calling phase 1's helper; revert per-file to drop just the new hash-compute + lookup + notify calls, leaving all existing dedup decision logic untouched.
- As a whole: the branch `feature/dup-image-push-notify` can be dropped entirely with no effect on `main`; nothing here changes existing keeper/reference/release behavior, so there is no data-migration risk beyond the two new nullable columns.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f DUP_IMAGE_PUSH_NOTIFY_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f DUP_IMAGE_PUSH_NOTIFY_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan DUP_IMAGE_PUSH_NOTIFY_PLAN.md
