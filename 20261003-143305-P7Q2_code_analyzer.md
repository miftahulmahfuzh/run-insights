# Code Analysis: Nina's profile picture vs. the Media file it came from

**Type:** Bug Investigation
**Date:** 2026-10-03 14:33 (+07)
**Session ID:** 20261003-143305-P7Q2
**Plan:** `PROFPIC_POINTER_SYNC_PLAN.md` (3 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/profpic-pointer-sync` — branch `feature/profpic-pointer-sync` off `origin/main` @ `d4491e5`

---

## User Input

### Original User Request

```
every photo in /nina/about Foto profil must point to a certain real image file in the Media or other places.
check the current nina's profile picture. it should be the same with https://runins.site/admin/nina?view=media&image=jWWu8vkl09fT
but turns out the photo is different. this is the old photo before i replaced it manually.
the sequence:
1. i replaced jWWu8vkl09fT in /admin/nina?view=media (v1 -> v2)
2. i set jWWu8vkl09fT (v2) as the profile picture (by clicking the set as profpic icon)
3. i checked /nina/about . but the profpic showed still the v1

---

i am afraid this bug causes us to consume much more harddisk space. if the photo has been replaced, then the v1 file must be deleted permanently.
there is another possibility that this is a local cache problem (cache in my xsmax safari, or in desktop browsers). but i don't think this is the case.
```

### User-Provided Context
- Media id `jWWu8vkl09fT`; replaced in `/admin/nina?view=media`, then adopted with "Set as her profile picture".
- The user suspects a server-side bug, not a browser cache. **Confirmed: it is server-side** (production rows below).

### User-Provided Files
None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Every photo in `/nina/about` → Foto profil must point at one real image file (in Media or elsewhere) — no detached copies |
| R2 | After replacing a Media photo (v1 → v2) and setting it as the profile picture, `/nina/about` shows v2 |
| R3 | When a photo is replaced, the v1 file is permanently deleted, so storage does not grow |

---

## Detailed Requirements Understanding

**Problem statement.** An album (`nina_avatars`) row made from a Media (`nina_message_images`) photo
can disagree with that Media photo in three ways, all confirmed in production on 2026-10-03:

1. **Legacy copies (the reported bug).** Before `media-album-unified-search` R3 and `b94486c`
   (2026-09-17), "Set as her profile picture" fetched the Media bytes and `put` a new `avatar-…`
   object. Those rows carry `source_key = 'chat-photo:<imageId>'` but `source_image_id IS NULL`.
   Today's adoption (`setChatPhotoAsAvatarAction` and `adoptNinaChatPhotoAsAvatar`) looks the row
   up **by `source_key` first** and, on a hit, only re-currents it. So adopting `jWWu8vkl09fT`
   found the legacy copy `Daofejusg4Xa` (created 2026-09-14, an `avatar-…jpg` holding v1) and made
   *that* current. v2 was never consulted. **21 such rows exist (8.88 MB), all with a live Media
   original; one is current.**
2. **Stale pointers.** A pointer row (`source_image_id` set) gets a one-time copy of
   `blob_url/pathname/width/height/bytes` at link time. Replace updates only the Media row.
   `resolveNinaAvatarLinkedText` corrects this for `/admin/nina` only. Every runner-facing read
   (`getCurrentNinaAvatar`, `listNinaAvatarsPage`, `getNinaAvatar` → `ninaAvatarView`,
   which reads `row.blobUrl`) shows the stale bytes. **11 stale pointers exist.**
3. **Stale chat references.** A `nina_message_images` row with `source_image_id` (or
   `source_avatar_id`) set also copied the original's `blob_url/pathname`. Replace does not move
   them. **13 stale image→image references exist** (0 image→avatar).

**Why storage grows (R3).** `replaceChatPhotoAction` / `replaceNinaAvatarAction` release the old object
through `releaseBlobIfUnreferenced`, which asks `isBlobPathnameReferenced` over both tables. Any
stale pointer or reference still names the old pathname, so the answer is `'shared'` and v1 is kept
forever. A legacy copy is a second object by construction. `resolvePhotoshopReplace` never releases
the old object at all.

**Success criteria.**
- Adopting a Media photo always yields a pointer row whose bytes equal the Media row's current
  bytes, including when an older copy or stale pointer exists under the same `source_key`.
- Replacing a Media photo (or an album original) moves every row that re-shows it to the new bytes
  **in the same atomic write**, after which the old object is unreferenced and is deleted.
- The Photoshop "replace" path releases the old object the same way.
- Existing production data is repaired: 21 legacy copies become pointers, 11 pointers and 13
  references are refreshed, and every object those rows stop naming is deleted when nothing else
  names it. `/nina/about` shows v2 for `jWWu8vkl09fT` without the user clicking anything.

**Key considerations.**
- `neon-http`: `db.transaction()` throws; atomic multi-statement writes use `db.batch([...])`.
- Row first, blob second: delete an object only after no row names it (`releaseBlobIfUnreferenced`).
- A pointer's crop (`crop_scale/x/y`) belongs to the pointer row. When the new bytes have different
  dimensions, the stored crop may no longer cover the circle.
- Legacy copies can have their own `description`, keywords, embedding, `content_hash` and a thumbnail
  (`thumb_url/thumb_pathname`). A pointer's own prose columns are dead by doctrine (`avatarPointer.ts`).
- `.env.local`'s `DATABASE_URL` is production. Scripts default to dry-run.

**Assumptions.**
- A browser cache is not involved. The DB shows the current avatar row names the v1 object.
- "Other places" in R1 covers album originals (rows with no `source_image_id`). They are their own
  real file and need no change.

---

## Analysis Scope

### Explicitly Mentioned Files
None. Surfaces: `/nina/about`, `/admin/nina?view=media`.

### Discovered Related Files
- `app/nina/about/page.tsx` — reads `getCurrentNinaAvatar`, `listNinaAvatarsPage`, `getNinaAvatar`; renders via `ninaAvatarView` (`lib/nina/album.ts:285`, `src: row.blobUrl`)
- `components/admin/explorer/MediaPane.tsx:152` — `onAdopt` → `setChatPhotoAsAvatarAction`
- `components/admin/explorer/MediaControls.tsx:72` — Replace → `replaceChatPhotoAction`
- `components/admin/explorer/SelectionPane.tsx:198` — album Replace → `replaceNinaAvatarAction`
- `lib/admin/ninaAlbumAvatarActions.ts` — `setChatPhotoAsAvatarAction` (:132), `linkChatPhotoIntoAlbum` (:218), `replaceNinaAvatarAction` (:277), `deleteNinaAvatarAction`
- `lib/admin/chatPhotoActions.ts:173` — `replaceChatPhotoAction`
- `lib/nina/avatarAdopt.ts:157` — `adoptNinaChatPhotoAsAvatar` (Nina's chat-tool twin), `linkChatPhotoIntoNinaAlbum`, `NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX` (:63)
- `lib/nina/queries/avatars.ts` — `updateNinaAvatarBlob` (:206), `getNinaAvatarBySourceKey` (:309), `listNinaAvatarsLinkedToImage` (:414), `insertNinaAvatars` (:853)
- `lib/nina/queries/images.ts` — `updateNinaChatPhotoBlob` (:960), `isBlobPathnameReferenced` (:1336)
- `lib/nina/queries/avatarPointer.ts` — `resolveNinaAvatarLinkedText` (admin-only read-side redirect)
- `lib/nina/blobRelease.ts` — `releaseBlobIfUnreferenced`
- `lib/nina/photoshopResolve.ts:74` — `resolvePhotoshopReplace` (no release)
- `scripts/blob-reap.mjs` — the reference definition (six columns) the release mirrors
- `scripts/nina-dedupe-avatars.mjs`, `scripts/nina-dedupe-media.mjs` — existing prod repair scripts (dry-run default), shape to copy

---

## Current Dataflow

### Entry Point A: Media Replace
**Location:** `components/admin/explorer/MediaControls.tsx:72` → `lib/admin/chatPhotoActions.ts:173`
1. Browser PUTs new bytes to Blob through `/api/admin/nina/upload`, then calls `replaceChatPhotoAction({id, blobUrl, pathname, width, height, bytes, contentHash})`.
2. `getNinaMessageImage` reads the row. A reference is refused.
3. `updateNinaChatPhotoBlob` (`images.ts:960`): one UPDATE on `nina_message_images` (`isOriginalPhoto()` guard). It nulls description, prompt, provenance, perceptual hash and sets `last_replaced_at`. **No other row is touched.**
4. `releaseBlobIfUnreferenced(userId, existing)` → `isBlobPathnameReferenced` → `'shared'` whenever a pointer, a reference or a legacy copy names the old pathname. Then the old object is **kept**.
5. Schedules resign + caption, a duplicate-push check, `revalidatePath`.

### Entry Point B: Media "Set as her profile picture"
**Location:** `MediaPane.tsx:152` → `ninaAlbumAvatarActions.ts:132`
1. `getNinaMessageImage(userId, id)`. A reference is refused.
2. Crop clamped against the Media row's dims.
3. `getNinaAvatarBySourceKey(userId, 'chat-photo:<id>')`. **On a hit, the row is used as-is**, whether it is a legacy copy (`source_image_id NULL`, its own object) or a stale pointer.
4. Otherwise `linkChatPhotoIntoAlbum` inserts a pointer with the Media row's *current* bytes.
5. `updateNinaAvatarCrop` (non-identity only), `setCurrentNinaAvatar`, `scheduleMediaDescribe(row.id)`.

### Entry Point C: Nina's chat tool "pakai foto ini"
`lib/nina/avatarAdopt.ts:157` `adoptNinaChatPhotoAsAvatar` follows the same steps as B (source-key lookup, then link), then `promoteAndAnnounce`. **Same defect.**

### Entry Point D: Album Replace
`ninaAlbumAvatarActions.ts:277` `replaceNinaAvatarAction` → `updateNinaAvatarBlob` (`avatars.ts:206`, guarded `source_image_id IS NULL`) → `releaseBlobIfUnreferenced`. Chat rows with `source_avatar_id = id` keep the old bytes. (0 such stale rows today.)

### Entry Point E: Photoshop "replace"
`photoshopResolve.ts:74` → `updateNinaAvatarBlob` / `updateNinaChatPhotoBlob`. **It never releases the old object.** It has the same dependent-row staleness as A and D.

### Entry Point F: `/nina/about` render
`app/nina/about/page.tsx` → `getCurrentNinaAvatar` / `listNinaAvatarsPage` / `getNinaAvatar` → `ninaAvatarView(row)` → `src: row.blobUrl`. **No pointer redirect.** It shows whatever the album row's own columns say.

### Data Persistence
- `nina_avatars`: `blob_url, pathname, width, height, bytes, crop_*, description, search_keywords, negative_search_keywords, description_embedding, content_hash, thumb_url, thumb_pathname, source_key (unique per user), source_image_id (FK → nina_message_images, ON DELETE RESTRICT), is_current, announced_at`
- `nina_message_images`: `blob_url, pathname, width, height, bytes, content_hash, perceptual_*, description, source_image_id, source_avatar_id, last_replaced_at`
- Vercel Blob: `nina/<userId>/selfie-*`, `avatar-*`, `chat/*`, `photoshop-*`, `thumb-*`

### Production evidence (read-only, 2026-10-03)
- `jWWu8vkl09fT`: `selfie-VPTcU2jExPCx-…jpg`, 576×1024, `last_replaced_at 07:22:38Z`.
- Current avatar `Daofejusg4Xa`: `source_key 'chat-photo:jWWu8vkl09fT'`, `source_image_id NULL`, `avatar-JjBL3efzVE8q-…jpg`, created 2026-09-14 (copy-era), `content_hash` ≠ the Media row's.
- No pointer and no chat reference names `jWWu8vkl09fT`.
- Legacy copies (`source_key LIKE 'chat-photo:%' AND source_image_id IS NULL`): 21, all with a live original Media row, 8,878,096 bytes, 1 current.
- Pointers: 73 total, **11 stale** (`a.pathname <> i.pathname`).
- Image→image references: **13 stale**. Image→avatar references: 0 stale.

---

## Key Data Structures
- `NinaAvatarRow` (`lib/nina/queries/shapes.ts`) — includes `sourceImageId`, `sourceKey`, `thumbUrl/thumbPathname`, crop fields.
- `NinaImageRow` — includes `sourceImageId`, `sourceAvatarId`.
- `NinaChatPhotoBlobPatch` — `{blobUrl, pathname, width, height, bytes, contentHash}`.

## Dependencies
- `@vercel/blob` `del` (only via `releaseBlobIfUnreferenced`).
- `db.batch` (neon-http) for atomic multi-statement writes.
- `ci:data-layer-guard`: Drizzle/`db` imports stay in `lib/nina/queries/*` (and the allowed layer). Actions call queries.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `setChatPhotoAsAvatarAction` | lib/admin/ninaAlbumAvatarActions.ts:132 | def | lib/admin |
| `linkChatPhotoIntoAlbum` | lib/admin/ninaAlbumAvatarActions.ts:218 | def | lib/admin |
| `replaceNinaAvatarAction` | lib/admin/ninaAlbumAvatarActions.ts:277 | def | lib/admin |
| `replaceChatPhotoAction` | lib/admin/chatPhotoActions.ts:173 | def | lib/admin |
| `adoptNinaChatPhotoAsAvatar` | lib/nina/avatarAdopt.ts:157 | def | lib/nina |
| `linkChatPhotoIntoNinaAlbum` | lib/nina/avatarAdopt.ts | def | lib/nina |
| `getNinaAvatarBySourceKey` | lib/nina/queries/avatars.ts:309 | def; called by both adopt paths | lib/nina/queries |
| `updateNinaAvatarBlob` | lib/nina/queries/avatars.ts:206 | def; call: ninaAlbumAvatarActions.ts:299, photoshopResolve.ts:95 | lib/nina/queries |
| `updateNinaChatPhotoBlob` | lib/nina/queries/images.ts:960 | def; call: chatPhotoActions.ts:193, photoshopResolve.ts:96 | lib/nina/queries |
| `isBlobPathnameReferenced` | lib/nina/queries/images.ts:1336 | def | lib/nina/queries |
| `releaseBlobIfUnreferenced` | lib/nina/blobRelease.ts | def | lib/nina |
| `resolveNinaAvatarLinkedText` | lib/nina/queries/avatarPointer.ts:78; app/admin/nina/page.tsx:327 | def, call | lib/nina/queries |
| `resolvePhotoshopReplace` | lib/nina/photoshopResolve.ts:74 | def | lib/nina |
| `ninaAvatarView` | lib/nina/album.ts:285 | render | lib/nina |
| tests | tests/nina.avatarFromPhoto.test.ts, tests/nina.mediaEmbeddings.test.ts, lib/nina/queries.test.ts, tests/integration/mediaAlbumUnifiedSearch.int.test.ts | test | — |

---

## Impact Points (files that WILL need changes)
1. `lib/nina/queries/avatars.ts` — a new relink query that turns a legacy copy or stale pointer into a fresh pointer (Phase 1). `updateNinaAvatarBlob` also moves its chat references (Phase 2).
2. `lib/admin/ninaAlbumAvatarActions.ts` — the adopt path relinks and releases the dropped object (Phase 1).
3. `lib/nina/avatarAdopt.ts` — same as 2 for the chat tool (Phase 1).
4. `lib/nina/queries/images.ts` — `updateNinaChatPhotoBlob` batches the dependent pointer/reference updates (Phase 2).
5. `lib/nina/photoshopResolve.ts` — release the old object after replace (Phase 2).
6. Tests for 1–5 (Phases 1, 2).
7. `scripts/nina-profpic-pointer-repair.mjs` + `package.json` script — one-off prod repair (Phase 3).

**This document describes. The plan files prescribe.**
