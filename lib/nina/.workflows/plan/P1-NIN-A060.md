> Adopted from `PROFPIC_POINTER_SYNC_PLAN.md` phase 2. Source: `.workflows/plan/profpic-pointer-sync/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Replace propagates to dependents and frees the old file

**Plan set:** `PROFPIC_POINTER_SYNC_PLAN.md`
**Analysis:** `20261003-143305-P7Q2_code_analyzer.md`
**Satisfies:** R3, R1. After a replace, nothing names the old object any more, so it is deleted (R3). Every album pointer at the replaced photo shows the photo's real current file (R1).
**Depends on:** Phase 1. It edits `lib/nina/queries/avatars.ts` and `lib/admin/ninaAlbumAvatarActions.ts` *after* Phase 1. This phase touches only `updateNinaAvatarBlob` and `replaceNinaAvatarAction` in those files, so it reads them by function name, not line number.
**Difficulty:** HARD
**Package:** `lib/nina/queries`, `lib/nina`, `lib/admin`

---

## Goal

Today, a Media replace (`updateNinaChatPhotoBlob`) rewrites only the Media row. An album replace (`updateNinaAvatarBlob`) rewrites only the album row. Every pointer and chat reference that re-shows the photo keeps naming the old object. So `releaseBlobIfUnreferenced` answers `'shared'` and v1 stays in the store forever. Photoshop's replace does not release anything at all.

After this phase:
- Each replace is one `db.batch`. The batch moves the original and every row that re-shows it to the new bytes. Once it lands, no row names the old pathname, and the release returns `'deleted'`.
- `resolvePhotoshopReplace` reads the source row first. After the write it releases the old object, and the old album thumbnail too.

## Interface Contract

**Deletes:** none.
**Renames:** none.
**Creates:**
- Module-private `replacedObjects()` in `lib/nina/photoshopResolve.ts`. It is not exported.
- New test files `tests/nina.replacePropagation.test.ts`, `tests/nina.photoshopResolve.test.ts` and `tests/integration/replacePropagation.int.test.ts`.

**Signature changes:** none. `updateNinaChatPhotoBlob(userId, id, patch): Promise<NinaImageRow | null>`, `updateNinaAvatarBlob(userId, id, patch): Promise<NinaAvatarRow | null>` and `resolvePhotoshopReplace(userId, jobId): Promise<NinaPhotoshopResolveOutcome>` keep their exact types.

**Behaviour changes.** The SET lists below are the plan set's ONE column contract for "a row now
re-shows the target's bytes" (index **Decisions** D1/D2). Phase 1's `relinkNinaAvatarToImage` and
Phase 3's script write the same shapes.
- `updateNinaChatPhotoBlob` is now **one `db.batch` of 4 statements**. A caller or test that expects one bare statement will break (fixed here: `tests/nina.chatPhotoDescription.test.ts`, `tests/nina.photoRefs.test.ts`).
  1. The Media row update. The SET list, WHERE and `RETURNING imageColumns` are byte-identical to today.
  2. `UPDATE nina_avatars` where `user_id = $u AND source_image_id = $id`, gated (see below). **Pointer contract:** sets `blob_url`, `pathname`, `width`, `height` and `bytes` from the patch; sets `content_hash`, `description`, `search_keywords`, `negative_search_keywords`, `description_embedding`, `thumb_url`, `thumb_pathname` to NULL; sets `crop_scale/x/y = CASE WHEN dims unchanged THEN own value ELSE NULL END`. (The prose four are NULL on every pointer by doctrine and the thumb pair is NULL on every pointer by construction — only the folder upload writes thumbnails, and only on originals — so in practice those seven NULLs change zero rows. They are written so all three writers share one SET list.)
  3. `UPDATE nina_message_images` where `user_id = $u AND source_image_id = $id`, gated. **Reference contract:** a reference mirrors its target's post-write values, so it sets `blob_url`, `pathname`, `width`, `height`, `bytes`, `content_hash` from the patch (the original's new values), and `description`, `perceptual_hash`, `perceptual_sig` to NULL (statement 1 just set the original's to NULL).
  4. `UPDATE nina_message_images` where `user_id = $u AND source_avatar_id IN (SELECT id FROM nina_avatars WHERE user_id = $u AND source_image_id = $id)`, gated. Sets the same columns as 3. These are chat re-shows of a pointer: `resolveAttachment` → `ninaPhotoProvenance({kind:'avatar'})` writes `source_avatar_id = <pointer id>`. Without this statement those rows would still pin v1. **Kept on purpose (R3, index Decision D3)** — Phase 1 does not move these rows and does not conflict with this statement (Decision D4).
  - **The gate** on 2–4 is `EXISTS (SELECT 1 FROM nina_message_images replaced_original WHERE user_id = $u AND id = $id AND pathname = <new pathname> AND source_avatar_id IS NULL AND source_image_id IS NULL)`. The dependents move only if statement 1 actually swapped an original. A refused write (not found, not owned, or a reference row) moves nothing.
- `updateNinaAvatarBlob` is now **one `db.batch` of 2 statements**:
  1. The album row update. The SET list is today's plus **`thumb_url = NULL, thumb_pathname = NULL`**. The thumbnail showed the old bytes, and the row has to stop naming it before it can be released. Renderers already fall back to `blob_url`. **Kept on purpose (R3, Decision D3).**
  2. `UPDATE nina_message_images` where `user_id = $u AND source_avatar_id = $id`, gated on `EXISTS (SELECT 1 FROM nina_avatars WHERE user_id = $u AND id = $id AND pathname = <new> AND source_image_id IS NULL)`. Reference contract, the same columns as statement 3 above: bytes and `content_hash` from the patch, `description`/`perceptual_hash`/`perceptual_sig` NULL (statement 1 just nulled the album row's prose; an album row has no perceptual pair).
- `replaceNinaAvatarAction` also releases the old thumbnail (`existing.thumbUrl`) after the write. The `'shared'` note on the main object is unchanged.
- `replaceChatPhotoAction`: the docstring is updated. The code is unchanged: it already releases after the write and now gets `'deleted'`.
- `resolvePhotoshopReplace` reads the source row (`getNinaAvatar` / `getNinaMessageImage`) **before** the write. A missing row now returns `source-unavailable` without writing. After a successful write and the job resolve, it calls `releaseBlobIfUnreferenced` for the old object, when the pathname changed, and for the old thumbnail, if there was one.

**Requires (from earlier phases):**
- Phase 1 has landed. In `lib/nina/queries/avatars.ts` it added `NinaAvatarRelinkResult` and `NinaAvatarRelinkSource` to the `import type { … } from './shapes'` block (2 lines, so everything below shifts by +2) and inserted `relinkNinaAvatarToImage` directly after `getNinaAvatarBySourceKey`, which is BELOW `updateNinaAvatarBlob`. It did **not** touch the `drizzle-orm` import (lines 1–12) or the `@/lib/db/schema` import (line 16), and did not change `updateNinaAvatarBlob`. The code blocks in Steps 3–4 are quoted against that post-Phase-1 file.
- In `lib/admin/ninaAlbumAvatarActions.ts` Phase 1 added one import line (`refreshAdoptedNinaAvatar`), rewrote the `RE-ADOPTION` docstring block (+2 lines) and the `source_key` lookup in `setChatPhotoAsAvatarAction` (+1 line). `replaceNinaAvatarAction` itself is untouched and now starts about 4 lines lower. Locate it by name.
- Phase 1 did not touch `lib/nina/queries/images.ts`, `lib/nina/photoshopResolve.ts`, `lib/admin/chatPhotoActions.ts`, `lib/nina/queries.test.ts` (beyond its own barrel line) or `lib/nina/queries/shapes.ts` (beyond its two new types). This phase adds no barrel name and no shape, so it does not edit `queries.test.ts` or `shapes.ts` at all.

**Leaves alone (owned by others):**
- `setChatPhotoAsAvatarAction`, `linkChatPhotoIntoAlbum` (`lib/admin/ninaAlbumAvatarActions.ts`), `lib/nina/avatarAdopt.ts` and Phase 1's new relink query (Phase 1).
- `scripts/*` and `package.json` (Phase 3).
- `isBlobPathnameReferenced` and `releaseBlobIfUnreferenced` (the plan's out-of-scope list).
- `resolveNinaAvatarLinkedText` (out of scope).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/images.ts:1-13` | modify | import `exists`; add `import { alias } from 'drizzle-orm/pg-core'` |
| `lib/nina/queries/images.ts:926-1021` | modify | `updateNinaChatPhotoBlob` becomes the 4-statement gated batch; one docstring block appended |
| `lib/nina/queries/avatars.ts:1-16` (unchanged by Phase 1) | modify | import `exists`; import `ninaMessageImages` |
| `lib/nina/queries/avatars.ts:~199-238` (post-Phase-1 numbering; locate by `export async function updateNinaAvatarBlob`) | modify | `updateNinaAvatarBlob` becomes the 2-statement gated batch, nulls the thumb pair, docstring updated |
| `lib/nina/photoshopResolve.ts:1-11, 73-104` | modify | import `releaseBlobIfUnreferenced`; read before write, release after; new private `replacedObjects` |
| `lib/admin/ninaAlbumAvatarActions.ts` (`replaceNinaAvatarAction`, ~:269-323 post-Phase-1; locate by name) | modify | release the old thumbnail; docstring sentence |
| `lib/admin/chatPhotoActions.ts:138-143` | modify | docstring paragraph only |
| `tests/nina.chatPhotoDescription.test.ts:99-141` | modify | `fake.only()` → first member of the one batch |
| `tests/nina.photoRefs.test.ts:293-331` | modify | same |
| `tests/nina.replacePropagation.test.ts` | create | SQL-contract tests for both batches, plus the release returning `'deleted'` |
| `tests/nina.photoshopResolve.test.ts` | create | read-before-write, release-after, refusal paths |
| `tests/integration/replacePropagation.int.test.ts` | create | real Postgres: dependents move, crop rule, gate, old pathname unreferenced |

## Implementation Steps

### Step 1: Imports in `images.ts`
**File:** `lib/nina/queries/images.ts:1-13`
**Change:** Add `exists` to the `drizzle-orm` import and add the pg-core `alias` import.
**Code:**
```ts
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
```
**Impact:** None on its own.

### Step 2: `updateNinaChatPhotoBlob` moves every row that re-shows the original, in one batch
**File:** `lib/nina/queries/images.ts:926-1021` (docstring 926-959, function 960-1021)
**Change:** Keep the existing docstring verbatim. Insert the block below before its closing `*/`, right after the paragraph that ends "`prompt` … NULL is honest and invisible rather than a marker.". Then replace the function with the version below. Statement 1 is today's statement character for character.

Docstring block to insert:
```ts
 *
 * ── EVERY ROW THAT RE-SHOWS THIS PHOTOGRAPH MOVES IN THE SAME BATCH (profpic-pointer-sync R3) ──
 * Three kinds of row copy this row's `blob_url/pathname/width/height/bytes` at link time and never
 * own bytes of their own: album POINTERS (`nina_avatars.source_image_id = id`), chat REFERENCES
 * (`nina_message_images.source_image_id = id`), and chat references that re-show one of those
 * pointers (`source_avatar_id` naming a pointer — `ninaPhotoProvenance({ kind: 'avatar' })`).
 * Until this set, a replace moved none of them: `/nina/about` kept showing v1 through every pointer,
 * and `isBlobPathnameReferenced` kept answering "shared" for v1, so the old object was never freed.
 * The plan's Decisions table rules both ways: chat references follow the original, and a pointer's
 * crop survives only when the new bytes have the same dimensions (`clampCrop`'s guarantee needs
 * the real dims; NULL is identity and always covers the circle).
 *
 * `db.batch`, not four awaits: neon-http has no `db.transaction()`, and a half-applied replace
 * (original moved, pointers not) is exactly the stale state this exists to end. Statements 2–4 are
 * GATED on the original now serving the new pathname — they move nothing when statement 1 refused
 * (not found, not his, or a reference row: `ninaPhotoProvenance` can write `source_image_id` =
 * a reference's id when that reference only carried `source_avatar_id`, and replacing such a
 * reference must not repaint its re-shows). Postgres runs a batch's statements in order inside one
 * transaction, so the gate sees statement 1's write.
 *
 * ONE column contract, shared with `relinkNinaAvatarToImage` and the repair script
 * (`profpic-pointer-sync` Decisions D1/D2):
 *   · A POINTER takes the five byte columns, and NULL `content_hash` (a pointer owns no bytes and
 *     makes no claim), NULL prose/keywords/embedding (dead by doctrine — `avatarPointer.ts`) and
 *     NULL thumbnail pair (nothing generates one for a link). Its crop survives only on unchanged
 *     dimensions. Its identity — `id`, `is_current`, `folder`, `source_key`, `source_image_id` — is
 *     not touched.
 *   · A REFERENCE mirrors its target's POST-write values, which is how `resolveAttachment` and
 *     `planChatPhotoAddWrite` create one (they copy `description` off the target): the five byte
 *     columns and `content_hash` from the patch, and `description`, `perceptual_hash`,
 *     `perceptual_sig` NULL, because statement 1 has just set the original's to NULL. Readers read a
 *     reference's OWN `description` (no provenance redirect — `gateway.ts`'s history read says so),
 *     so v1 prose left here would be described to her as the v2 photograph.
```

Function:
```ts
export async function updateNinaChatPhotoBlob(
  userId: string,
  id: string,
  patch: NinaChatPhotoBlobPatch,
): Promise<NinaImageRow | null> {
  /* The bytes every re-showing row takes on — the same five measurements the original gets. */
  const bytesOfPatch = {
    blobUrl: patch.blobUrl,
    pathname: patch.pathname,
    width: patch.width,
    height: patch.height,
    bytes: patch.bytes,
  }

  /* The gate for statements 2–4. An alias because statements 3 and 4 UPDATE this same table, and
   * an unaliased subquery would be ambiguous to read even where Postgres would bind it correctly. */
  const replacedOriginal = alias(ninaMessageImages, 'replaced_original')
  const originalNowServesPatch = exists(
    db
      .select({ one: sql`1` })
      .from(replacedOriginal)
      .where(
        and(
          eq(replacedOriginal.userId, userId),
          eq(replacedOriginal.id, id),
          eq(replacedOriginal.pathname, patch.pathname),
          isNull(replacedOriginal.sourceAvatarId),
          isNull(replacedOriginal.sourceImageId),
        ),
      ),
  )

  /* SET-list expressions read the row's OLD values in Postgres, so this compares the pointer's
   * current dimensions against the new ones even though the same statement rewrites them.
   * `is not distinct from` because pre-measurement rows carry NULL dimensions. */
  const sameDimensions = sql`${ninaAvatars.width} is not distinct from ${patch.width} and ${ninaAvatars.height} is not distinct from ${patch.height}`

  /* The reference contract (statements 3 and 4): mirror the original's POST-write values. */
  const referenceTakesPatch = {
    ...bytesOfPatch,
    contentHash: patch.contentHash ?? null,
    description: null,
    perceptualHash: null,
    perceptualSig: null,
  }

  const pointersAtThisOriginal = db
    .select({ id: ninaAvatars.id })
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.sourceImageId, id)))

  const [updated] = await db.batch([
    db
      .update(ninaMessageImages)
      .set({
        blobUrl: patch.blobUrl,
        pathname: patch.pathname,
        width: patch.width,
        height: patch.height,
        bytes: patch.bytes,
        description: null,
        prompt: null,
        /*
         * F37. These described where the OLD bytes came from. The new bytes came from the operator's
         * file picker, so the row is now an original and must say so — otherwise a Replace applied
         * to a reference (reachable from a stale tab: the id comes from a client and
         * `getNinaMessageImage` does not filter references) leaves a unique photograph that no
         * listing will ever show. Same statement as the two nulls above it, for the same reason:
         * there must be no window in which the row points at new bytes and old provenance.
         */
        sourceAvatarId: null,
        sourceImageId: null,
        /*
         * media-dedupe P3. Same statement as the nulls above it, for the same reason: there must be
         * no window in which the row points at new bytes and claims old ones. A valid claim from
         * the caller sticks; its absence retracts. See `NinaChatPhotoBlobPatch.contentHash`.
         */
        contentHash: patch.contentHash ?? null,
        /*
         * media-dedupe follow-up, ghost-signature fix (2026-09-15). The perceptual pair describes
         * "the bytes a row OWNS" (the column header's own doctrine) and this statement just swapped
         * them — so a pair left standing is a GHOST: the send-time twin scan would compare every
         * future re-upload against a signature of the OLD photograph. Measured on production that
         * day: 49 of 71 signed originals carried a signature 23-42/64 bits from their own live
         * bytes, and a pixel-identical re-upload of `ymKp8lDU_Br6` matched nothing — its twin gate
         * saw the ghost, not the photograph. NULL retracts to the same honest "unsigned =
         * dedup-inactive" the column header defines, and `replaceChatPhotoAction` re-signs the NEW
         * bytes in `after()` (`scheduleChatPhotoResign`), so the row is unsigned for seconds, not
         * until the next sweep run.
         */
        perceptualHash: null,
        perceptualSig: null,
        /*
         * media-recency-sort, 2026-09-19. `created_at` stays untouched (this function's own header
         * argues why); this is the column the Media view's sort key reads instead —
         * `listNinaMediaPhotos` orders by `COALESCE(last_replaced_at, created_at)`. Same statement
         * as the byte swap, for the same reason as every other field here: no window in which the
         * row shows new bytes under a stale sort key.
         */
        lastReplacedAt: new Date(),
      })
      .where(
        and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
      )
      .returning(imageColumns),
    /* 2 — album pointers at this original (profpic-pointer-sync R1/R3). */
    db
      .update(ninaAvatars)
      .set({
        ...bytesOfPatch,
        contentHash: null,
        description: null,
        searchKeywords: null,
        negativeSearchKeywords: null,
        descriptionEmbedding: null,
        thumbUrl: null,
        thumbPathname: null,
        cropScale: sql`case when ${sameDimensions} then ${ninaAvatars.cropScale} else null end`,
        cropX: sql`case when ${sameDimensions} then ${ninaAvatars.cropX} else null end`,
        cropY: sql`case when ${sameDimensions} then ${ninaAvatars.cropY} else null end`,
      })
      .where(
        and(
          eq(ninaAvatars.userId, userId),
          eq(ninaAvatars.sourceImageId, id),
          originalNowServesPatch,
        ),
      ),
    /* 3 — chat references that re-show this original directly. */
    db
      .update(ninaMessageImages)
      .set(referenceTakesPatch)
      .where(
        and(
          eq(ninaMessageImages.userId, userId),
          eq(ninaMessageImages.sourceImageId, id),
          originalNowServesPatch,
        ),
      ),
    /* 4 — chat references that re-show one of this original's album pointers. */
    db
      .update(ninaMessageImages)
      .set(referenceTakesPatch)
      .where(
        and(
          eq(ninaMessageImages.userId, userId),
          inArray(ninaMessageImages.sourceAvatarId, pointersAtThisOriginal),
          originalNowServesPatch,
        ),
      ),
  ])

  return updated[0] ?? null
}
```
**Impact:** The rendered SQL for statements 1–4 was verified against the recording driver during planning: one batch of 4, with qualified `"replaced_original"."…"` inside the EXISTS. Two existing tests used `fake.only()` and must move to the batch shape (Steps 7 and 8). The action's mock-based tests (`tests/admin.chatPhotos.test.ts`) are unaffected.

### Step 3: Imports in `avatars.ts`
**File:** `lib/nina/queries/avatars.ts:1-16` (Phase 1 does not touch these lines; its import change is the `./shapes` block at lines 25–38)
**Change:** Add `exists` to the `drizzle-orm` import and `ninaMessageImages` to the schema import. The blocks below are the full post-change text of those two statements.
**Code:**
```ts
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  sql,
  type SQL,
} from 'drizzle-orm'
```
```ts
import { ninaAvatars, ninaFolders, ninaMessageImages } from '@/lib/db/schema'
```
**Impact:** None on its own.

### Step 4: `updateNinaAvatarBlob` moves its chat references and drops its stale thumbnail
**File:** `lib/nina/queries/avatars.ts`, located by `export async function updateNinaAvatarBlob` (docstring + function; ~199-238 after Phase 1, ~200-239 after Step 3's one-line import addition). Phase 1's `relinkNinaAvatarToImage` sits further down, after `getNinaAvatarBySourceKey`, and is not touched.
**Change:** Replace the docstring and the function.
**Code:**
```ts
/**
 * Swap an album original's bytes in place and keep its id. There are two callers: Photoshop's
 * "replace the existing photo" (`resolvePhotoshopReplace`) and the album's manual Replace
 * (`replaceNinaAvatarAction`). It mirrors `updateNinaChatPhotoBlob`'s shape for the reason that
 * function gives: a row must not point at new bytes while it still claims old prose about them,
 * so description, keywords and embedding are cleared along with the blob fields.
 *
 * It is guarded by `sourceImageId IS NULL`. A row with that column set is a POINTER at a Media
 * original. It owns no bytes of its own to replace, and replacing it in place would silently
 * detach it from the row it borrows from. A pointer returns `null` exactly as "not found" or
 * "not yours" do. The caller cannot tell these apart and does not need to.
 *
 * ── THE THUMBNAIL GOES TOO (profpic-pointer-sync R3) ─────────────────────────────────────────
 * `thumb_url/thumb_pathname` (written only by the folder upload) were rendered from the OLD
 * bytes. Leaving them in place shows the old picture in every grid. It also keeps the old
 * thumbnail object referenced, so the caller's release could never free it. With both NULL, a
 * renderer falls back to `blob_url`, which is the column header's own meaning. The caller holds
 * the row it read before the write, and it releases that thumbnail.
 *
 * ── CHAT REFERENCES FOLLOW, IN THE SAME BATCH ────────────────────────────────────────────────
 * A `nina_message_images` row with `source_avatar_id = id` re-shows this photograph and copies its
 * bytes (`resolveAttachment`). It moves to the new bytes in the same `db.batch`, with
 * `updateNinaChatPhotoBlob`'s reference contract: it mirrors this row's post-write values (new
 * bytes and `content_hash`; `description` NULL like this row's; no perceptual pair). It is
 * gated on this row now serving the new pathname, so a refused write (a pointer, or a row that is
 * not his) moves nothing. Album pointers never point at an album row, so no third statement is
 * needed.
 */
export async function updateNinaAvatarBlob(
  userId: string,
  id: string,
  patch: {
    blobUrl: string
    pathname: string
    width: number
    height: number
    bytes: number
    contentHash: string | null
  },
): Promise<NinaAvatarRow | null> {
  const albumRowNowServesPatch = exists(
    db
      .select({ one: sql`1` })
      .from(ninaAvatars)
      .where(
        and(
          eq(ninaAvatars.userId, userId),
          eq(ninaAvatars.id, id),
          eq(ninaAvatars.pathname, patch.pathname),
          isNull(ninaAvatars.sourceImageId),
        ),
      ),
  )

  const [updated] = await db.batch([
    db
      .update(ninaAvatars)
      .set({
        blobUrl: patch.blobUrl,
        pathname: patch.pathname,
        width: patch.width,
        height: patch.height,
        bytes: patch.bytes,
        contentHash: patch.contentHash ?? null,
        description: null,
        searchKeywords: null,
        negativeSearchKeywords: null,
        descriptionEmbedding: null,
        thumbUrl: null,
        thumbPathname: null,
      })
      .where(
        and(
          eq(ninaAvatars.userId, userId),
          eq(ninaAvatars.id, id),
          isNull(ninaAvatars.sourceImageId),
        ),
      )
      .returning(avatarColumns),
    db
      .update(ninaMessageImages)
      .set({
        blobUrl: patch.blobUrl,
        pathname: patch.pathname,
        width: patch.width,
        height: patch.height,
        bytes: patch.bytes,
        contentHash: patch.contentHash ?? null,
        description: null,
        perceptualHash: null,
        perceptualSig: null,
      })
      .where(
        and(
          eq(ninaMessageImages.userId, userId),
          eq(ninaMessageImages.sourceAvatarId, id),
          albumRowNowServesPatch,
        ),
      ),
  ])
  return updated[0] ?? null
}
```
**Impact:** The return type is unchanged. `thumbUrl`/`thumbPathname` on the returned row are now `null`. Neither caller reads them from the returned row: both read the pre-write row.

### Step 5: `resolvePhotoshopReplace` reads first and releases after
**File:** `lib/nina/photoshopResolve.ts:1-11` (imports), `:73-104` (function)
**Change:** Import the release. Replace `resolvePhotoshopReplace` and add a private helper directly below it.
**Code (imports):**
```ts
import 'server-only'

import type { NinaPhotoshopJob } from '@/lib/db/schema'

import { releaseBlobIfUnreferenced } from './blobRelease'
import {
  getNinaAvatar,
  getNinaMessageImage,
  insertNinaAvatars,
  updateNinaAvatarBlob,
  updateNinaChatPhotoBlob,
} from './queries'
import { getNinaPhotoshopJob, resolveNinaPhotoshopJob } from './photoshopJobs'
```
**Code (function + helper):**
```ts
/** "Replace the existing photo": overwrite the source row's bytes in place, keep its id — then free
 * the object the row stopped naming (profpic-pointer-sync R3).
 *
 * ROW FIRST, BLOB SECOND, in three moves: read the row so the old object's URL is in hand, write
 * the new bytes (which moves every pointer and chat reference in the same batch — see
 * `updateNinaChatPhotoBlob` / `updateNinaAvatarBlob`), and only then ask `releaseBlobIfUnreferenced`
 * about the old object and the old album thumbnail. Until this set the old object was never
 * released here at all; every Photoshop replace leaked one file. The release never throws and its
 * outcome does not change this function's: the photo was replaced either way, and a kept object is
 * `reap-orphaned-blobs`' to collect. */
export async function resolvePhotoshopReplace(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopResolveOutcome> {
  const loaded = await loadResolvableJob(userId, jobId)
  if (loaded.error != null || loaded.job == null) {
    return { ok: false, reason: loaded.error ?? 'not-found' }
  }
  const job = loaded.job

  const patch = {
    blobUrl: job.resultBlobUrl!,
    pathname: job.resultPathname!,
    width: job.resultWidth!,
    height: job.resultHeight!,
    bytes: job.resultBytes!,
    contentHash: job.resultContentHash,
  }

  const before =
    job.sourceKind === 'avatar'
      ? await getNinaAvatar(userId, job.sourceId)
      : await getNinaMessageImage(userId, job.sourceId)
  if (before == null) return { ok: false, reason: 'source-unavailable' }

  const written =
    job.sourceKind === 'avatar'
      ? await updateNinaAvatarBlob(userId, job.sourceId, patch)
      : await updateNinaChatPhotoBlob(userId, job.sourceId, patch)

  if (written == null) return { ok: false, reason: 'source-unavailable' }

  await resolveNinaPhotoshopJob(userId, jobId, 'replaced')

  for (const ref of replacedObjects(before, patch.pathname)) {
    await releaseBlobIfUnreferenced(userId, ref)
  }
  return { ok: true }
}

/** The objects a replace stopped naming: the original's own bytes (unless the job somehow handed
 * back the same pathname — deleting what the row now serves would be unrecoverable) and an album
 * row's thumbnail, which `updateNinaAvatarBlob` just nulled. A chat row has no thumbnail columns,
 * hence the optional pair. `thumb_pathname ?? thumb_url` is `deleteNinaAvatarAction`'s spelling for
 * the same question. */
function replacedObjects(
  before: {
    blobUrl: string
    pathname: string
    thumbUrl?: string | null
    thumbPathname?: string | null
  },
  newPathname: string,
): Array<{ blobUrl: string; pathname: string }> {
  const refs: Array<{ blobUrl: string; pathname: string }> = []
  if (before.pathname !== newPathname) {
    refs.push({ blobUrl: before.blobUrl, pathname: before.pathname })
  }
  if (before.thumbUrl != null) {
    refs.push({ blobUrl: before.thumbUrl, pathname: before.thumbPathname ?? before.thumbUrl })
  }
  return refs
}
```
**Impact:** Adds one indexed single-row read per Photoshop replace. `lib/admin/photoshopActions.ts` calls this unchanged, and its test mocks this module, so nothing there moves. The `ci:openrouter-guard` fence is unaffected because no OpenRouter code is involved. `blobRelease` imports `@vercel/blob`'s `del`, which already sits under `lib/nina/`.

### Step 6: `replaceNinaAvatarAction` releases the old thumbnail
**File:** `lib/admin/ninaAlbumAvatarActions.ts`, function `replaceNinaAvatarAction` (~`:269-323` after Phase 1, which adds one import line and edits the `RE-ADOPTION` docstring and `setChatPhotoAsAvatarAction` above it; the function itself is unchanged by Phase 1, so the block below replaces it verbatim — locate by name)
**Change:** Replace the docstring and function. The only code change is the thumbnail release block. The docstring gains one paragraph.
**Code:**
```ts
/**
 * Swap the bytes behind an existing album row and keep its id, its folder and its place in the
 * album. This is the manual file-pick counterpart to `resolvePhotoshopReplace`, which accepts a
 * finished job's own result. This one is called from the Photoshop detail screen's own Replace
 * button instead. It has `replaceChatPhotoAction`'s exact shape (`lib/admin/chatPhotoActions.ts`,
 * the Media folder's Replace), mirrored onto this table.
 *
 * A pointer row (`sourceImageId` set) owns no bytes of its own to replace, because it shows the
 * Media row's object. So it is refused before any write is attempted. Without that refusal,
 * `updateNinaAvatarBlob`'s own `sourceImageId IS NULL` guard would report it as a bare
 * "not in the album".
 *
 * ── THE OLD FILE AND THE OLD THUMBNAIL ARE BOTH RELEASED (profpic-pointer-sync R3) ──────────
 * `updateNinaAvatarBlob` moves every chat reference to the new bytes and nulls this row's
 * thumbnail pair in the same batch. After that, nothing this replace knows about still names
 * either old object, so both releases normally come back `'deleted'`. A `'shared'` answer now
 * means a row outside this photograph's own family names the bytes, for example a legacy album
 * copy Phase 3 has not repaired yet. That is still worth the note.
 */
export async function replaceNinaAvatarAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()

  const parsed = avatarReplaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { id, blobUrl, pathname, width, height, bytes, contentHash } = parsed.data

  if (!isAdminAvatarRequestPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  const existing = await getNinaAvatar(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the album.' }
  if (existing.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one points at a Media photo. Replace the original there instead.',
    }
  }

  const claimedHash = isValidContentHash(contentHash) ? contentHash : null

  const updated = await updateNinaAvatarBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
    contentHash: claimedHash,
  })
  if (updated == null) return { ok: false, error: 'That photo is not in the album.' }

  let note: string | undefined
  if (existing.pathname !== pathname) {
    const outcome = await releaseBlobIfUnreferenced(userId, existing)
    if (outcome === 'shared') note = 'The old file is still used elsewhere, so it was kept.'
  }
  if (existing.thumbUrl != null) {
    /* The write nulled the thumbnail pair, so the row no longer names it. Same spelling as
     * `deleteNinaAvatarAction`'s thumbnail release. */
    await releaseBlobIfUnreferenced(userId, {
      blobUrl: existing.thumbUrl,
      pathname: existing.thumbPathname ?? existing.thumbUrl,
    })
  }

  /* The write nulled description/keywords/embedding — re-earn the prose for the NEW bytes, same
   * reason `replaceChatPhotoAction` re-captions. */
  scheduleDescribe(userId, id)

  revalidatePath('/admin/nina')
  return { ok: true, id, ...(note === undefined ? {} : { note }) }
}
```
**Impact:** Adds at most one extra release call. The result shape is unchanged.

### Step 7: `replaceChatPhotoAction` docstring
**File:** `lib/admin/chatPhotoActions.ts:138-143`
**Change:** Add one paragraph after the paragraph that ends `and no "except this row" parameter is needed.` (line 143). There is no code change.
**Code:**
```ts
 *
 * Since profpic-pointer-sync (R3), `updateNinaChatPhotoBlob` also moves every album pointer and
 * chat reference that re-shows this photograph to the new bytes, in the same batch. Before that,
 * they were exactly what made this release answer `'shared'` and keep v1 in the store forever.
 * Now nothing in this photograph's own family names the old object, so the release normally
 * deletes it. A `'shared'` answer, and its note, now means something outside that family names
 * the bytes. A legacy album copy made before the pointer design is the known case, and Phase 3's
 * repair script removes those.
```
**Impact:** Comments only.

### Step 8: Re-point the two existing single-statement tests at the batch
**File:** `tests/nina.chatPhotoDescription.test.ts:99-141`
**Change:** Replace the `describe('updateNinaChatPhotoBlob — the replace write (D-P2-1)', …)` block.
**Code:**
```ts
describe('updateNinaChatPhotoBlob — the replace write (D-P2-1)', () => {
  /* profpic-pointer-sync phase 2: the replace is one `db.batch` whose FIRST member is this row's
   * own write; members 2–4 move the rows that re-show it (`tests/nina.replacePropagation.test.ts`
   * pins those). These cases are about member 1 and read it by index. */
  function mediaRowWrite(): string {
    expect(fake.batches).toEqual([4])
    return fake.sqlAt(0)
  }

  it('is original-only and kind-blind: a replaced upload keeps its kind', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob(USER, ID, {
      blobUrl: 'https://x.example/nina/u1/selfie-n.jpg',
      pathname: 'nina/u1/selfie-n.jpg',
      width: 768,
      height: 1024,
      bytes: 240_000,
      contentHash: null,
    })

    const sql = mediaRowWrite()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    // The old kind clause is gone: one of HIS uploads is replaceable now, and the statement
    // never writes `kind` — the row keeps its side with new bytes.
    expect(sql).not.toContain('"kind" = $')
    expect(sql).not.toContain('set "kind"')
  })

  it('nulls description, prompt and the provenance pair in the same statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob(USER, ID, {
      blobUrl: 'https://x.example/nina/u1/selfie-n.jpg',
      pathname: 'nina/u1/selfie-n.jpg',
      width: 768,
      height: 1024,
      bytes: 240_000,
    })

    const sql = mediaRowWrite()
    // Drizzle spells the SET clause once and comma-joins the assignments, so the column names,
    // not a repeated `set`, are what proves all five land in the ONE statement.
    expect(sql).toContain('"description" = $')
    expect(sql).toContain('"prompt" = $')
    expect(sql).toContain('"source_avatar_id" = $')
    expect(sql).toContain('"source_image_id" = $')
    // And the R2 mechanic this phase's UI leans on: the sidecar dies with the bytes it
    // produced, so the prompt affordance has nothing to render.
  })
})
```

**File:** `tests/nina.photoRefs.test.ts:293-331`
**Change:** Replace the `describe('Replace stops the provenance lying about bytes that are gone', …)` block.
**Code:**
```ts
describe('Replace stops the provenance lying about bytes that are gone', () => {
  it('nulls both columns in the same statement as description and prompt', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob('u1', IMAGE, {
      blobUrl: 'https://x/new.jpg',
      pathname: 'nina/u1/new.jpg',
      width: 768,
      height: 1024,
      bytes: 123,
    })

    /* profpic-pointer-sync phase 2: one batch, this row's write first. */
    expect(fake.batches).toEqual([4])
    const sql = fake.sqlAt(0)
    expect(sql).toContain('update "nina_message_images"')
    const setClause = sql.slice(0, sql.indexOf(' where '))
    for (const column of ['description', 'prompt', 'source_avatar_id', 'source_image_id']) {
      expect(setClause, column).toContain(column)
    }
    /* One statement, so there is no window in which the row points at new bytes and old
     * provenance — `updateNinaChatPhotoBlob`'s own argument for nulling `description` here. The
     * other three batch members write OTHER rows (its pointers and references), never this one. */
    expect(fake.queries.every((query) => query.batched)).toBe(true)
  })

  it('media-dedupe P3: names content_hash in the SAME statement — a claim sticks, its absence retracts', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob('u1', IMAGE, {
      blobUrl: 'https://x/new.jpg',
      pathname: 'nina/u1/new.jpg',
      width: 768,
      height: 1024,
      bytes: 123,
      contentHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })

    expect(fake.batches).toEqual([4])
    const sql = fake.sqlAt(0)
    /* One statement, so there is no window in which the row points at new bytes and claims old
     * ones — the same argument the provenance nulls above it make. */
    expect(sql.slice(0, sql.indexOf(' where '))).toContain('content_hash')
  })
})
```
**Impact:** Both files go green against the new shape.

### Step 9: SQL-contract tests for both batches, and the release
**File:** `tests/nina.replacePropagation.test.ts` (create)
**Code:**
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * profpic-pointer-sync phase 2 (R3, R1): **a replace moves everything that re-shows the photograph,
 * in the same batch, so the old object is free to go.**
 *
 * SQL contracts against the recording driver. The driver evaluates no predicate, so these prove
 * the statements' SHAPE: four members, gated, owner-scoped, with the right SET lists.
 * `tests/integration/replacePropagation.int.test.ts` proves the BEHAVIOUR against real Postgres
 * (rows really move, the gate really holds, the old pathname really ends up unreferenced).
 *
 * The positional `imageColumns`/`avatarColumns` projections are never fixtured here, which is
 * `tests/nina.chatPhotoDescription.test.ts`' rule. Only the miss branch of the return is asserted.
 */

const del = vi.fn()
vi.mock('@vercel/blob', () => ({ del: (...args: unknown[]) => del(...args) }))

type Queries = typeof import('@/lib/nina/queries')

const USER = 'abc123XYZ_-9'
const IMAGE = 'imgAAAAAAAAA'
const AVATAR = 'avaAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const OLD_PATHNAME = `nina/${USER}/selfie-${IMAGE}-old.jpg`
const OLD_URL = `${STORE}/${OLD_PATHNAME}`
const NEW_PATHNAME = `nina/${USER}/selfie-${IMAGE}-new.jpg`
const NEW_URL = `${STORE}/${NEW_PATHNAME}`

const PATCH = {
  blobUrl: NEW_URL,
  pathname: NEW_PATHNAME,
  width: 1024,
  height: 1536,
  bytes: 300_000,
  contentHash: null,
}

let fake: FakeDb
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  del.mockReset()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

function setOf(sql: string): string {
  return sql.slice(0, sql.indexOf(' where '))
}

function whereOf(sql: string): string {
  return sql.slice(sql.indexOf(' where '))
}

describe('updateNinaChatPhotoBlob — the original and everything that re-shows it, in one batch', () => {
  it('is exactly one db.batch of four statements, with nothing outside it', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    expect(fake.batches).toEqual([4])
    expect(fake.queries).toHaveLength(4)
    expect(fake.queries.every((query) => query.batched)).toBe(true)
  })

  it('member 1 is the Media row write, original-only and returning the row', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const sql = fake.sqlAt(0)
    expect(sql).toMatch(/^update "nina_message_images" set/)
    expect(sql).toContain('"last_replaced_at" = $')
    expect(whereOf(sql)).toContain('"id" = $')
    expect(whereOf(sql)).toContain('"source_avatar_id" is null')
    expect(whereOf(sql)).toContain('"source_image_id" is null')
    expect(sql).toContain('returning')
  })

  it('member 2 moves every album pointer at this original to the new bytes', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const { sql, params } = fake.queries[1]!
    expect(sql).toMatch(/^update "nina_avatars" set/)
    for (const column of ['blob_url', 'pathname', 'width', 'height', 'bytes', 'content_hash']) {
      expect(setOf(sql), column).toContain(`"${column}" = `)
    }
    expect(whereOf(sql)).toContain('"nina_avatars"."source_image_id" = $')
    expect(params).toContain(NEW_URL)
    expect(params).toContain(NEW_PATHNAME)
    expect(params).toContain(IMAGE)
  })

  it('member 2 keeps a pointer’s crop only when the dimensions did not change (Decisions)', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const { sql, params } = fake.queries[1]!
    const set = setOf(sql)
    for (const column of ['crop_scale', 'crop_x', 'crop_y']) {
      expect(set, column).toContain(
        `"${column}" = case when "nina_avatars"."width" is not distinct from $`,
      )
    }
    expect(set).toContain('"nina_avatars"."height" is not distinct from $')
    expect(set).toContain('then "nina_avatars"."crop_scale" else null end')
    expect(params).toContain(PATCH.width)
    expect(params).toContain(PATCH.height)
  })

  it('member 2 never touches a pointer’s identity or place (invariant 6)', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const set = setOf(fake.sqlAt(1))
    for (const column of ['id', 'is_current', 'folder', 'source_key', 'source_image_id', 'announced_at']) {
      expect(set, column).not.toContain(`"${column}" = `)
    }
  })

  it('member 2 writes the pointer contract: NULL prose, keywords, embedding and thumbnail (invariant 4, Decision D1)', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const set = setOf(fake.sqlAt(1))
    for (const column of [
      'description',
      'search_keywords',
      'negative_search_keywords',
      'description_embedding',
      'thumb_url',
      'thumb_pathname',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
  })

  it('member 3 moves chat references of this original and retracts their prose', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const sql = fake.sqlAt(2)
    expect(sql).toMatch(/^update "nina_message_images" set/)
    const set = setOf(sql)
    for (const column of [
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'content_hash',
      'description',
      'perceptual_hash',
      'perceptual_sig',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
    // A reference stays a reference: its provenance is what makes it follow the original.
    expect(set).not.toContain('"source_image_id" = ')
    expect(set).not.toContain('"source_avatar_id" = ')
    expect(set).not.toContain('"last_replaced_at" = ')
    expect(whereOf(sql)).toContain('"nina_message_images"."source_image_id" = $')
  })

  it('member 4 moves chat references that re-show one of the pointers', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const sql = fake.sqlAt(3)
    expect(sql).toMatch(/^update "nina_message_images" set/)
    expect(setOf(sql)).toContain('"pathname" = $')
    expect(setOf(sql)).toContain('"perceptual_sig" = $')
    expect(whereOf(sql)).toContain(
      '"nina_message_images"."source_avatar_id" in (select "id" from "nina_avatars" where',
    )
    expect(whereOf(sql)).toContain('"nina_avatars"."source_image_id" = $')
  })

  it('members 2–4 are gated on the original now serving the NEW pathname', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    for (const index of [1, 2, 3]) {
      const { sql, params } = fake.queries[index]!
      const where = whereOf(sql)
      expect(where, `member ${index + 1}`).toContain(
        'exists (select 1 from "nina_message_images" "replaced_original" where',
      )
      expect(where).toContain('"replaced_original"."id" = $')
      expect(where).toContain('"replaced_original"."pathname" = $')
      expect(where).toContain('"replaced_original"."source_avatar_id" is null')
      expect(where).toContain('"replaced_original"."source_image_id" is null')
      expect(params).toContain(NEW_PATHNAME)
    }
  })

  it('every member is owner-scoped', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    for (const query of fake.queries) {
      expect(whereOf(query.sql)).toContain('"user_id" = $')
      expect(query.params).toContain(USER)
    }
  })

  it('returns null when member 1 matched nothing, so the action can refuse', async () => {
    fake.enqueue([])
    await expect(queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)).resolves.toBeNull()
  })
})

describe('updateNinaAvatarBlob — the album original and its chat references, in one batch', () => {
  const ALBUM_PATCH = { ...PATCH, contentHash: null }

  it('is exactly one db.batch of two statements', async () => {
    await queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)

    expect(fake.batches).toEqual([2])
    expect(fake.queries).toHaveLength(2)
    expect(fake.queries.every((query) => query.batched)).toBe(true)
  })

  it('member 1 keeps the pointer refusal and drops the stale thumbnail pair', async () => {
    await queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)

    const sql = fake.sqlAt(0)
    expect(sql).toMatch(/^update "nina_avatars" set/)
    const set = setOf(sql)
    for (const column of [
      'blob_url',
      'pathname',
      'description',
      'description_embedding',
      'thumb_url',
      'thumb_pathname',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
    expect(whereOf(sql)).toContain('"source_image_id" is null')
    expect(sql).toContain('returning')
  })

  it('member 2 moves chat references of this album row, gated on the row now serving the new bytes', async () => {
    await queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)

    const { sql, params } = fake.queries[1]!
    expect(sql).toMatch(/^update "nina_message_images" set/)
    const set = setOf(sql)
    for (const column of ['blob_url', 'pathname', 'content_hash', 'description', 'perceptual_hash', 'perceptual_sig']) {
      expect(set, column).toContain(`"${column}" = `)
    }
    const where = whereOf(sql)
    expect(where).toContain('"nina_message_images"."user_id" = $')
    expect(where).toContain('"nina_message_images"."source_avatar_id" = $')
    expect(where).toContain('exists (select 1 from "nina_avatars" where')
    expect(where).toContain('"nina_avatars"."pathname" = $')
    expect(where).toContain('"nina_avatars"."source_image_id" is null')
    expect(params).toContain(AVATAR)
    expect(params).toContain(NEW_PATHNAME)
  })

  it('returns null on a miss (a pointer, or not his)', async () => {
    fake.enqueue([])
    await expect(queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)).resolves.toBeNull()
  })
})

describe('after the batch, the release deletes the old object', () => {
  it('asks both tables about the OLD object and deletes it when nothing names it', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)
    fake.reset()
    const { releaseBlobIfUnreferenced } = await import('@/lib/nina/blobRelease')

    await expect(
      releaseBlobIfUnreferenced(USER, { blobUrl: OLD_URL, pathname: OLD_PATHNAME }),
    ).resolves.toBe('deleted')

    expect(del).toHaveBeenCalledWith(OLD_URL)
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      expect(query.params).toContain(OLD_PATHNAME)
      expect(query.params).toContain(USER)
    }
  })
})
```
**Impact:** A new file. It uses only the existing driver API (`batches`, `queries[i].batched`, `sqlAt`, `reset`).

### Step 10: Unit tests for `resolvePhotoshopReplace`
**File:** `tests/nina.photoshopResolve.test.ts` (create)
**Code:**
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * profpic-pointer-sync phase 2 (R3): Photoshop's "replace" frees the object the row stopped naming.
 * Edges mocked; the order of the three moves — read, write, release — is the thing under test.
 */

const order: string[] = []
const getNinaAvatar = vi.fn()
const getNinaMessageImage = vi.fn()
const insertNinaAvatars = vi.fn()
const updateNinaAvatarBlob = vi.fn()
const updateNinaChatPhotoBlob = vi.fn()
const getNinaPhotoshopJob = vi.fn()
const resolveNinaPhotoshopJob = vi.fn()
const releaseBlobIfUnreferenced = vi.fn()

vi.mock('@/lib/nina/queries', () => ({
  getNinaAvatar: (...args: unknown[]) => getNinaAvatar(...args),
  getNinaMessageImage: (...args: unknown[]) => getNinaMessageImage(...args),
  insertNinaAvatars: (...args: unknown[]) => insertNinaAvatars(...args),
  updateNinaAvatarBlob: (...args: unknown[]) => updateNinaAvatarBlob(...args),
  updateNinaChatPhotoBlob: (...args: unknown[]) => updateNinaChatPhotoBlob(...args),
}))
vi.mock('@/lib/nina/photoshopJobs', () => ({
  getNinaPhotoshopJob: (...args: unknown[]) => getNinaPhotoshopJob(...args),
  resolveNinaPhotoshopJob: (...args: unknown[]) => resolveNinaPhotoshopJob(...args),
}))
vi.mock('@/lib/nina/blobRelease', () => ({
  releaseBlobIfUnreferenced: (...args: unknown[]) => releaseBlobIfUnreferenced(...args),
}))

import { resolvePhotoshopReplace } from '@/lib/nina/photoshopResolve'

const USER = 'abc123XYZ_-9'
const JOB = 'jobAAAAAAAAA'
const AVATAR = 'avaAAAAAAAAA'
const IMAGE = 'imgAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const OLD_PATHNAME = `nina/${USER}/avatar-${AVATAR}-old.jpg`
const OLD_URL = `${STORE}/${OLD_PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${AVATAR}-old.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`
const NEW_PATHNAME = `nina/${USER}/photoshop-${JOB}.jpg`
const NEW_URL = `${STORE}/${NEW_PATHNAME}`

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB,
    userId: USER,
    status: 'ok',
    resolvedAction: null,
    sourceKind: 'avatar',
    sourceId: AVATAR,
    resultBlobUrl: NEW_URL,
    resultPathname: NEW_PATHNAME,
    resultWidth: 1024,
    resultHeight: 1536,
    resultBytes: 300_000,
    resultContentHash: null,
    ...overrides,
  }
}

beforeEach(() => {
  order.length = 0
  for (const mock of [
    getNinaAvatar,
    getNinaMessageImage,
    insertNinaAvatars,
    updateNinaAvatarBlob,
    updateNinaChatPhotoBlob,
    getNinaPhotoshopJob,
    resolveNinaPhotoshopJob,
    releaseBlobIfUnreferenced,
  ]) {
    mock.mockReset()
  }
  getNinaPhotoshopJob.mockResolvedValue(job())
  getNinaAvatar.mockImplementation(async () => {
    order.push('read')
    return {
      id: AVATAR,
      blobUrl: OLD_URL,
      pathname: OLD_PATHNAME,
      thumbUrl: THUMB_URL,
      thumbPathname: THUMB_PATHNAME,
    }
  })
  getNinaMessageImage.mockImplementation(async () => {
    order.push('read')
    return { id: IMAGE, blobUrl: OLD_URL, pathname: OLD_PATHNAME }
  })
  updateNinaAvatarBlob.mockImplementation(async () => {
    order.push('write')
    return { id: AVATAR }
  })
  updateNinaChatPhotoBlob.mockImplementation(async () => {
    order.push('write')
    return { id: IMAGE }
  })
  resolveNinaPhotoshopJob.mockImplementation(async () => {
    order.push('resolve')
  })
  releaseBlobIfUnreferenced.mockImplementation(async () => {
    order.push('release')
    return 'deleted'
  })
})

describe('resolvePhotoshopReplace — row first, blob second', () => {
  it('album source: reads, writes, resolves, then releases the old object AND the old thumbnail', async () => {
    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({ ok: true })

    expect(order).toEqual(['read', 'write', 'resolve', 'release', 'release'])
    expect(releaseBlobIfUnreferenced).toHaveBeenNthCalledWith(1, USER, {
      blobUrl: OLD_URL,
      pathname: OLD_PATHNAME,
    })
    expect(releaseBlobIfUnreferenced).toHaveBeenNthCalledWith(2, USER, {
      blobUrl: THUMB_URL,
      pathname: THUMB_PATHNAME,
    })
    expect(resolveNinaPhotoshopJob).toHaveBeenCalledWith(USER, JOB, 'replaced')
  })

  it('Media source: releases the old object only — a chat row has no thumbnail', async () => {
    getNinaPhotoshopJob.mockResolvedValue(job({ sourceKind: 'message_image', sourceId: IMAGE }))

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({ ok: true })

    expect(order).toEqual(['read', 'write', 'resolve', 'release'])
    expect(updateNinaChatPhotoBlob).toHaveBeenCalledWith(
      USER,
      IMAGE,
      expect.objectContaining({ pathname: NEW_PATHNAME, blobUrl: NEW_URL }),
    )
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: OLD_URL,
      pathname: OLD_PATHNAME,
    })
  })

  it('a refused write (a pointer, or gone) releases nothing and resolves nothing', async () => {
    updateNinaAvatarBlob.mockResolvedValue(null)

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({
      ok: false,
      reason: 'source-unavailable',
    })
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(resolveNinaPhotoshopJob).not.toHaveBeenCalled()
  })

  it('a source row that is already gone is refused before any write', async () => {
    getNinaAvatar.mockResolvedValue(null)

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({
      ok: false,
      reason: 'source-unavailable',
    })
    expect(updateNinaAvatarBlob).not.toHaveBeenCalled()
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('never releases the object the row now serves', async () => {
    getNinaPhotoshopJob.mockResolvedValue(
      job({ resultPathname: OLD_PATHNAME, resultBlobUrl: OLD_URL }),
    )

    await resolvePhotoshopReplace(USER, JOB)

    // Only the thumbnail goes; the main object is what the row still names.
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: THUMB_URL,
      pathname: THUMB_PATHNAME,
    })
  })

  it('a kept ("shared") object does not fail the replace', async () => {
    releaseBlobIfUnreferenced.mockResolvedValue('shared')

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({ ok: true })
  })
})
```
**Impact:** A new file. It does not interact with `tests/admin.photoshopActions.test.ts`, which mocks this module wholesale.

### Step 11: Real-Postgres proof
**File:** `tests/integration/replacePropagation.int.test.ts` (create)
**Code:**
```ts
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * profpic-pointer-sync phase 2, against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled neon url> npm run test:int
 *
 * Skipped without `TEST_DATABASE_URL`; `DATABASE_URL` is deliberately NOT a fallback (it is
 * production). Every row hangs off one throwaway user, removed in `afterAll` —
 * `mediaAlbumUnifiedSearch.int.test.ts`' posture exactly.
 *
 * The recording driver proves the batches' SHAPE (`tests/nina.replacePropagation.test.ts`). Only
 * Postgres can prove the three things R3 rests on: the dependents really move, the gate really
 * holds on a refused write, and afterwards no row names the old pathname.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const USER = `rpp-u1-${SUFFIX}`
const IMAGE_ID = `rpp-img-${SUFFIX}`
const POINTER_ID = `rpp-ptr-${SUFFIX}`
const IMAGE_REF_ID = `rpp-iref-${SUFFIX}`
const POINTER_REF_ID = `rpp-pref-${SUFFIX}`
const REF_OF_REF_ID = `rpp-rr-${SUFFIX}`
const ALBUM_ID = `rpp-alb-${SUFFIX}`
const ALBUM_REF_ID = `rpp-aref-${SUFFIX}`

const STORE = 'https://example.public.blob.vercel-storage.com'
const url = (pathname: string): string => `${STORE}/${pathname}`
const OLD = `nina/${USER}/selfie-${IMAGE_ID}-old.jpg`
const NEW = `nina/${USER}/selfie-${IMAGE_ID}-new.jpg`
const NEWER = `nina/${USER}/selfie-${IMAGE_ID}-newer.jpg`
const REF_OF_REF_PATH = `nina/${USER}/chat-${REF_OF_REF_ID}.jpg`
const ALBUM_OLD = `nina/${USER}/avatar-${ALBUM_ID}-old.jpg`
const ALBUM_NEW = `nina/${USER}/avatar-${ALBUM_ID}-new.jpg`
const ALBUM_THUMB = `nina/${USER}/thumb-${ALBUM_ID}-old.webp`

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type Queries = typeof import('@/lib/nina/queries')

let db: Db
let s: Schema
let q: Queries

beforeAll(async () => {
  if (!enabled) return
  vi.resetModules()
  ;({ db } = await import('@/lib/db/index'))
  s = await import('@/lib/db/schema')
  q = await import('@/lib/nina/queries')

  await db.insert(s.users).values({ id: USER, email: `${USER}@example.test` })

  /* The Media ORIGINAL, v1. */
  await db.insert(s.ninaMessageImages).values({
    id: IMAGE_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: url(OLD),
    pathname: OLD,
    width: 576,
    height: 1024,
    bytes: 100,
    description: 'v1 prose',
  })

  /* Its album POINTER — what `linkChatPhotoIntoAlbum` writes — with a non-identity crop. */
  await db.insert(s.ninaAvatars).values({
    id: POINTER_ID,
    userId: USER,
    source: 'admin',
    blobUrl: url(OLD),
    pathname: OLD,
    folder: '',
    sourceKey: `chat-photo:${IMAGE_ID}`,
    sourceImageId: IMAGE_ID,
    width: 576,
    height: 1024,
    bytes: 100,
    cropScale: 1.5,
    cropX: 0.1,
    cropY: -0.1,
  })

  /* A chat REFERENCE to the original, and one to the pointer (`resolveAttachment`'s two shapes). */
  await db.insert(s.ninaMessageImages).values([
    {
      id: IMAGE_REF_ID,
      userId: USER,
      messageId: null,
      kind: 'generated',
      blobUrl: url(OLD),
      pathname: OLD,
      width: 576,
      height: 1024,
      bytes: 100,
      description: 'v1 prose',
      sourceImageId: IMAGE_ID,
    },
    {
      id: POINTER_REF_ID,
      userId: USER,
      messageId: null,
      kind: 'generated',
      blobUrl: url(OLD),
      pathname: OLD,
      width: 576,
      height: 1024,
      bytes: 100,
      sourceAvatarId: POINTER_ID,
    },
  ])

  /* A row whose `source_image_id` names a REFERENCE — the gate's case. Its own bytes. */
  await db.insert(s.ninaMessageImages).values({
    id: REF_OF_REF_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: url(REF_OF_REF_PATH),
    pathname: REF_OF_REF_PATH,
    sourceImageId: IMAGE_REF_ID,
  })

  /* An album ORIGINAL with a folder-upload thumbnail, and a chat reference to it. */
  await db.insert(s.ninaAvatars).values({
    id: ALBUM_ID,
    userId: USER,
    source: 'admin',
    blobUrl: url(ALBUM_OLD),
    pathname: ALBUM_OLD,
    folder: '',
    thumbUrl: url(ALBUM_THUMB),
    thumbPathname: ALBUM_THUMB,
    width: 1000,
    height: 1000,
    bytes: 200,
  })
  await db.insert(s.ninaMessageImages).values({
    id: ALBUM_REF_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: url(ALBUM_OLD),
    pathname: ALBUM_OLD,
    sourceAvatarId: ALBUM_ID,
  })
})

afterAll(async () => {
  if (!enabled) return
  /* Pointers first: `nina_avatars.source_image_id` is ON DELETE RESTRICT (see the sibling int test). */
  await db.delete(s.ninaAvatars).where(eq(s.ninaAvatars.userId, USER))
  await db.delete(s.ninaMessageImages).where(eq(s.ninaMessageImages.userId, USER))
  await db.delete(s.users).where(eq(s.users.id, USER))
})

async function imageRows(ids: string[]) {
  return db
    .select({
      id: s.ninaMessageImages.id,
      blobUrl: s.ninaMessageImages.blobUrl,
      pathname: s.ninaMessageImages.pathname,
      width: s.ninaMessageImages.width,
      description: s.ninaMessageImages.description,
      sourceImageId: s.ninaMessageImages.sourceImageId,
      sourceAvatarId: s.ninaMessageImages.sourceAvatarId,
    })
    .from(s.ninaMessageImages)
    .where(and(eq(s.ninaMessageImages.userId, USER), inArray(s.ninaMessageImages.id, ids)))
}

async function avatarRow(id: string) {
  const [row] = await db
    .select({
      id: s.ninaAvatars.id,
      blobUrl: s.ninaAvatars.blobUrl,
      pathname: s.ninaAvatars.pathname,
      width: s.ninaAvatars.width,
      height: s.ninaAvatars.height,
      cropScale: s.ninaAvatars.cropScale,
      cropX: s.ninaAvatars.cropX,
      cropY: s.ninaAvatars.cropY,
      sourceKey: s.ninaAvatars.sourceKey,
      sourceImageId: s.ninaAvatars.sourceImageId,
      thumbUrl: s.ninaAvatars.thumbUrl,
      thumbPathname: s.ninaAvatars.thumbPathname,
    })
    .from(s.ninaAvatars)
    .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, id)))
  return row
}

describe.skipIf(!enabled)('a Media replace moves everything that re-shows it', () => {
  it('moves the pointer and both references, drops the crop on new dims, and frees v1', async () => {
    const written = await q.updateNinaChatPhotoBlob(USER, IMAGE_ID, {
      blobUrl: url(NEW),
      pathname: NEW,
      width: 1024,
      height: 1536,
      bytes: 300,
      contentHash: null,
    })
    expect(written?.pathname).toBe(NEW)

    const pointer = await avatarRow(POINTER_ID)
    expect(pointer?.pathname).toBe(NEW)
    expect(pointer?.blobUrl).toBe(url(NEW))
    expect(pointer?.width).toBe(1024)
    expect(pointer?.height).toBe(1536)
    expect(pointer?.cropScale).toBeNull()
    expect(pointer?.cropX).toBeNull()
    expect(pointer?.cropY).toBeNull()
    expect(pointer?.sourceKey).toBe(`chat-photo:${IMAGE_ID}`)
    expect(pointer?.sourceImageId).toBe(IMAGE_ID)

    const refs = await imageRows([IMAGE_REF_ID, POINTER_REF_ID])
    expect(refs).toHaveLength(2)
    for (const ref of refs) {
      expect(ref.pathname, ref.id).toBe(NEW)
      expect(ref.blobUrl, ref.id).toBe(url(NEW))
      expect(ref.description, ref.id).toBeNull()
    }
    const [imageRef] = refs.filter((ref) => ref.id === IMAGE_REF_ID)
    expect(imageRef?.sourceImageId).toBe(IMAGE_ID)

    await expect(q.isBlobPathnameReferenced(USER, OLD, url(OLD))).resolves.toBe(false)
  })

  it('keeps the pointer crop when the new bytes have the same dimensions', async () => {
    await db
      .update(s.ninaAvatars)
      .set({ cropScale: 1.2, cropX: 0.05, cropY: 0 })
      .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))

    await q.updateNinaChatPhotoBlob(USER, IMAGE_ID, {
      blobUrl: url(NEWER),
      pathname: NEWER,
      width: 1024,
      height: 1536,
      bytes: 310,
      contentHash: null,
    })

    const pointer = await avatarRow(POINTER_ID)
    expect(pointer?.pathname).toBe(NEWER)
    expect(pointer?.cropScale).toBe(1.2)
    expect(pointer?.cropX).toBe(0.05)
    expect(pointer?.cropY).toBe(0)
    await expect(q.isBlobPathnameReferenced(USER, NEW, url(NEW))).resolves.toBe(false)
  })

  it('a refused write (a reference id) moves nothing that re-shows it', async () => {
    const written = await q.updateNinaChatPhotoBlob(USER, IMAGE_REF_ID, {
      blobUrl: url(`nina/${USER}/selfie-never.jpg`),
      pathname: `nina/${USER}/selfie-never.jpg`,
      width: 10,
      height: 10,
      bytes: 1,
      contentHash: null,
    })
    expect(written).toBeNull()

    const [refOfRef] = await imageRows([REF_OF_REF_ID])
    expect(refOfRef?.pathname).toBe(REF_OF_REF_PATH)
  })
})

describe.skipIf(!enabled)('an album replace moves its chat references and frees the old file and thumbnail', () => {
  it('moves the reference, nulls the thumbnail pair, and leaves both old objects unreferenced', async () => {
    const written = await q.updateNinaAvatarBlob(USER, ALBUM_ID, {
      blobUrl: url(ALBUM_NEW),
      pathname: ALBUM_NEW,
      width: 1200,
      height: 1600,
      bytes: 400,
      contentHash: null,
    })
    expect(written?.pathname).toBe(ALBUM_NEW)

    const album = await avatarRow(ALBUM_ID)
    expect(album?.thumbUrl).toBeNull()
    expect(album?.thumbPathname).toBeNull()

    const [ref] = await imageRows([ALBUM_REF_ID])
    expect(ref?.pathname).toBe(ALBUM_NEW)
    expect(ref?.sourceAvatarId).toBe(ALBUM_ID)

    await expect(q.isBlobPathnameReferenced(USER, ALBUM_OLD, url(ALBUM_OLD))).resolves.toBe(false)
    await expect(
      q.isBlobPathnameReferenced(USER, ALBUM_THUMB, url(ALBUM_THUMB)),
    ).resolves.toBe(false)
  })
})
```
**Impact:** It is opt-in only and is excluded from `npm test` by `vitest.config.ts`. It still has to typecheck: `tests/integration/**` falls under `tsc --noEmit`, which is why the column names above match `lib/db/schema/nina/{chat,avatars}.ts`.

## Verification

**Setup (once per worktree, same as Phases 1 and 3):** the worktree has no `node_modules` and no `.env.local`. Symlink both from the main checkout instead of running `npm ci` (the lockfiles are byte-identical at `d4491e5`). Both paths are git-ignored (`/node_modules`, `.env.*`); never `git add -f` them, and stage files by name, not with `git add -A`.
```bash
export PATH=/home/miftah/tools/node-v24.20.0-linux-x64/bin:$PATH
WT=/home/miftah/.worktrees/run-insights/profpic-pointer-sync
[ -e "$WT/node_modules" ] || ln -s /home/miftah/run-insights/node_modules "$WT/node_modules"
[ -e "$WT/.env.local" ]   || ln -s /home/miftah/run-insights/.env.local   "$WT/.env.local"
cd "$WT"
```
**Build:** `npm run typecheck && npm run lint && npm run format:check`
**Tests:** `npx vitest run tests/nina.replacePropagation.test.ts tests/nina.photoshopResolve.test.ts tests/nina.chatPhotoDescription.test.ts tests/nina.photoRefs.test.ts tests/admin.chatPhotos.test.ts tests/admin.albumAvatarActions.test.ts tests/admin.photoshopActions.test.ts lib/nina/queries.test.ts`, then `npm test`. Also run all seven `ci:*` guards (`npm run ci:data-layer-guard`, `ci:f08-guard`, `ci:openrouter-guard`, `ci:client-secret-guard`, `ci:llm-payload-guard`, `ci:f11-guard`, `ci:schema-drift-guard`) and `npm run knip`. No new export is added, so knip and `lib/nina/queries.test.ts`'s barrel freeze should not move.
**Integration (optional, needs a non-production pooled URL):** `TEST_DATABASE_URL=<url> npx vitest run tests/integration/replacePropagation.int.test.ts` with `VITEST_INTEGRATION=1`, or `npm run test:int`. **Never point it at `.env.local`'s `DATABASE_URL`, because that is production.**
**Manual check:** none required. If someone wants one in production after deploy: replace a Media photo that has an album pointer. The pointer's `pathname` should equal the Media row's, and the old object should be gone from the Blob listing.
**Exit criteria:** `updateNinaChatPhotoBlob` and `updateNinaAvatarBlob` each issue exactly one `db.batch` (4 statements and 2 statements). The SQL-contract tests pin the dependent updates, the gate and the crop CASE. After the batch, `releaseBlobIfUnreferenced` on the old object returns `'deleted'` in `tests/nina.replacePropagation.test.ts`. `resolvePhotoshopReplace` reads before it writes and releases the old object and thumbnail after (`tests/nina.photoshopResolve.test.ts`). The full `npm test`, typecheck, lint and all seven guards are green.

## Handoffs

- **Re-earned description on chat references.** Under the reference contract (Decision D2) a moved reference mirrors the original's post-write `description`, which statement 1 has just set to NULL. `replaceChatPhotoAction`'s `after()` re-describes only the original. In the history read (`gateway.ts`) an undescribed row is silent, not `NINA_DESCRIPTION_UNAVAILABLE`; only a send/resend of that exact message substitutes the placeholder. Copying the original's new prose onto its references when the describe pass lands is a follow-up. **Owner: none in this set (no R asks for it). Suggest a follow-up card.** Phase 3's repair, by contrast, copies the original's current prose, because there the original is already described.
- **An album original's own crop after a replace with new dimensions.** `updateNinaAvatarBlob` leaves the replaced row's own `crop_*` as is (unchanged semantics). The Decisions rule covers pointers only. Applying the same CASE to the original is a one-line follow-up. **Owner: none in this set.**
- **Legacy copies and already-stale rows in production.** This phase only stops *new* staleness and moves stale pointers/references *at the next replace*. The existing 21 legacy copies, 11 stale pointers and 13 stale references belong to **Phase 3** (R1, R2, R3). A legacy copy is not a pointer (`source_image_id IS NULL`), so this phase's batch deliberately leaves it alone.
- **Adoption relinking a legacy copy or a stale pointer** belongs to **Phase 1** (R2). This phase does not touch `setChatPhotoAsAvatarAction` or `avatarAdopt.ts`.
- **Docs.** `docs/architecture.md` (the replace data flow) and `CHANGELOG.md` should mention that a replace now carries its dependents and that Photoshop replace releases the old object. This is for the completion step, not a phase.

## Rollback

`git revert` the phase commit. Columns written by the new batch (moved pointers and references, nulled thumbnails, nulled crops) are valid under the old code. The old code simply stops moving them again. Objects already deleted by a release cannot be restored, but they were deleted only after no row named them, so nothing visible breaks.
