> Adopted from `PROFPIC_POINTER_SYNC_PLAN.md` phase 1. Source: `.workflows/plan/profpic-pointer-sync/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Adoption relinks legacy copies and stale pointers

**Plan set:** `PROFPIC_POINTER_SYNC_PLAN.md`
**Analysis:** `20261003-143305-P7Q2_code_analyzer.md`
**Satisfies:** R2, R1. After a Media photo is replaced and set as her profile picture, `/nina/about` shows the new version, and the adopted album row is a real pointer instead of a detached copy.
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (query + helper), `lib/admin` (one action)

---

## Goal

Today "Set as her profile picture" (admin Media pane) and "pakai foto ini" (Nina's chat tool) look the
album row up by `source_key = 'chat-photo:<imageId>'` and, on a hit, only re-current it. A hit can be a
**legacy copy** (`source_image_id IS NULL`, its own `avatar-…` object, made before the pointer design)
or a **stale pointer** (`source_image_id` set, but `pathname` still names the pre-Replace object).
After this phase, both adoption paths rewrite such a row in place into a fresh pointer at the Media
row's *current* bytes, then release the Blob object(s) the row stopped naming through
`releaseBlobIfUnreferenced`. The row keeps its `id`, `folder`, `source_key` and `is_current`.

## Interface Contract

**Deletes:** none

**Renames:** none

**Creates:**
- `relinkNinaAvatarToImage(userId, avatar, image)` (`lib/nina/queries/avatars.ts`, inserted directly
  after `getNinaAvatarBySourceKey`, i.e. after today's line 320). Exported through the
  `lib/nina/queries` barrel (`export * from './queries/avatars'`), so it is a new runtime name on the
  barrel.
- `NinaAvatarRelinkSource` and `NinaAvatarRelinkResult` types (`lib/nina/queries/shapes.ts`, directly
  after `NinaAvatarBlobRef`, today line 654). Type-only.
- `refreshAdoptedNinaAvatar(userId, avatar, image, sourceKey)` and `NinaAdoptedAvatarRefresh` type, in
  a new file `lib/nina/avatarRelink.ts`.
- `tests/nina.avatarRelink.test.ts` (new test file).

**Signature changes:**
- `lib/nina/avatarAdopt.ts` private `promoteAndAnnounce(userId, avatar)` →
  `promoteAndAnnounce(userId, avatar, bytesChanged = false)`. It is module-private. Its other caller,
  `promoteNinaAvatarAsCurrent`, is unchanged because the parameter has a default.

**Behaviour changes:**
- `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumAvatarActions.ts:132`): a `source_key` hit that is
  a legacy copy or a stale pointer is relinked before crop/current. Unchanged otherwise.
- `adoptNinaChatPhotoAsAvatar` (`lib/nina/avatarAdopt.ts:157`): same, plus `changed: true` when the
  row's bytes were swapped, even if it was already current. Without that she would say "it already
  was" when her face just changed.

**Requires (from earlier phases):** nothing.

**Leaves alone (owned by others):**
- `updateNinaAvatarBlob` (`avatars.ts:206`): Phase 2. In `avatars.ts` this phase only adds two names
  to the `./shapes` type import (lines 25–36, so lines below shift by +2) and inserts one function
  after `getNinaAvatarBySourceKey`. `updateNinaAvatarBlob`'s body is untouched. Phase 2 edits it in
  place.
- `updateNinaChatPhotoBlob`, `isBlobPathnameReferenced` (`lib/nina/queries/images.ts`): Phase 2 / unchanged.
- `lib/nina/photoshopResolve.ts`: Phase 2.
- `lib/nina/blobRelease.ts`: unchanged, only called.
- `scripts/*`, `package.json`: Phase 3.
- `resolveNinaAvatarLinkedText` / `avatarPointer.ts`: out of scope for the whole set.

**Barrel allowlist:** `lib/nina/queries.test.ts`'s `BARREL_VALUE_EXPORTS` gains exactly
`'relinkNinaAvatarToImage'`, sorted between `'referenceEligibleChatPhotoScope'` and
`'removeNinaSession'`. Phases 2 and 3 add no barrel name and do not edit `queries.test.ts` or
`shapes.ts` (reconciled), so this is the only change to either file in the set.

**Column contract (reconciled, index Decision D1):** the SET list in Step 2b is the plan set's one
"pointer re-shows its Media row's bytes" contract. Phase 2's replace propagation (statement 2 of
`updateNinaChatPhotoBlob`) and Phase 3's repair script (`relink-legacy` and `refresh-pointer`) write
exactly the same columns: the five byte columns from the Media row, `source_image_id`, NULL
`description/search_keywords/negative_search_keywords/description_embedding/content_hash/thumb_url/thumb_pathname`,
crop NULL iff `width`/`height` differ. This phase moves no `nina_message_images` row (Decision D4).

**Phase 2 edits after this one, in two of this phase's files.** `lib/nina/queries/avatars.ts`: Phase 2
rewrites `updateNinaAvatarBlob` (above this phase's insertion) and adds `exists` / `ninaMessageImages`
to lines 1–16. `lib/admin/ninaAlbumAvatarActions.ts`: Phase 2 rewrites `replaceNinaAvatarAction`.
Keep this phase's edits out of those regions so Phase 2's quotes stay exact.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/shapes.ts` | modify (after line 654) | add `NinaAvatarRelinkSource`, `NinaAvatarRelinkResult` |
| `lib/nina/queries/avatars.ts` | modify (import block lines 25–36; new function after line 320) | add `relinkNinaAvatarToImage` |
| `lib/nina/avatarRelink.ts` | create | `refreshAdoptedNinaAvatar`: is this hit stale? relink, then release dropped objects |
| `lib/admin/ninaAlbumAvatarActions.ts` | modify (imports line 26; docstring lines 112–117; body lines 156–159) | call `refreshAdoptedNinaAvatar` on a `source_key` hit |
| `lib/nina/avatarAdopt.ts` | modify (header block after line 46; lines 174–182; lines 198–216) | call `refreshAdoptedNinaAvatar` on a hit; `promoteAndAnnounce` takes `bytesChanged` |
| `lib/nina/queries.test.ts` | modify (header after line 92; list between lines 223 and 224) | barrel allowlist gains `relinkNinaAvatarToImage` |
| `tests/nina.avatarRelink.test.ts` | create | query SQL shape, chat path, admin path, race, shared object kept |

## Implementation Steps

### Step 1: Result shapes
**File:** `lib/nina/queries/shapes.ts:654` (insert directly after the closing `}` of `NinaAvatarBlobRef`)
**Change:** add the input and output shapes of the relink query. Type-only, so the barrel's runtime
surface is unaffected by this step.
**Code:**
```ts

/**
 * What `relinkNinaAvatarToImage` copies off the Media row. The six columns a pointer row borrows,
 * per `linkChatPhotoIntoAlbum` (`lib/admin/ninaAlbumAvatarActions.ts`). A `NinaImageRow`
 * satisfies it structurally, so callers pass the row they already read.
 */
export interface NinaAvatarRelinkSource {
  id: string
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
}

/**
 * `relinkNinaAvatarToImage`'s outcome. `row` is the album row AFTER the write. The two `dropped*`
 * fields are the Blob objects the row named BEFORE the write and no longer names. The caller hands
 * each non-null one to `releaseBlobIfUnreferenced`, row first and blob second, which is why they
 * are returned rather than deleted here: a query module never calls `del`.
 *
 *   · `droppedOriginal` — the row's old `blob_url`/`pathname`. NULL when the old pathname IS the
 *     Media row's (a legacy copy that happens to name the same object needs no release).
 *   · `droppedThumb` — the row's old `thumb_url`/`thumb_pathname`. NULL when it had none. A pointer
 *     never carries a thumbnail, so a relink always clears one.
 */
export interface NinaAvatarRelinkResult {
  row: NinaAvatarRow
  droppedOriginal: { blobUrl: string; pathname: string } | null
  droppedThumb: { blobUrl: string; pathname: string } | null
}
```
**Impact:** none at runtime.

### Step 2: The relink query
**File:** `lib/nina/queries/avatars.ts`

**2a: imports, lines 25–36.** Add the two new types to the existing `import type { … } from './shapes'`
block, keeping it alphabetical.
**Code:**
```ts
import type {
  NinaAvatarBatchInsert,
  NinaAvatarBlobRef,
  NinaAvatarCrop,
  NinaAvatarFolderCount,
  NinaAvatarFolderPage,
  NinaAvatarInsert,
  NinaAvatarManifestEntry,
  NinaAvatarPage,
  NinaAvatarRelinkResult,
  NinaAvatarRelinkSource,
  NinaAvatarRow,
  NinaFolderRenameResult,
} from './shapes'
```

**2b: new function, at line 321.** Insert it directly after the closing `}` of
`getNinaAvatarBySourceKey` (today line 320), before the `/** **"Does this user's album already store
these bytes?"**` docstring. `and`, `eq`, `isNull`, `db`, `ninaAvatars` and `avatarColumns` are
already imported by this module.
**Code:**
```ts

/**
 * **Turn an adopted album row back into a TRUE pointer at its Media original.**
 * `profpic-pointer-sync` R1/R2.
 *
 * `getNinaAvatarBySourceKey('chat-photo:<imageId>')` can answer with a row whose bytes are NOT the
 * Media row's current bytes, in two shapes, both confirmed on production rows on 2026-10-03:
 *
 *   · **a legacy copy** — `source_image_id IS NULL`, its own `avatar-…` object, written before
 *     `media-album-unified-search` R3 made adoption a link (21 rows, one of them current);
 *   · **a stale pointer** — `source_image_id` set, but `blob_url`/`pathname` still name the object
 *     the Media row held before a Replace (11 rows).
 *
 * Re-currenting either one puts the OLD photograph back on her face, which is the reported bug.
 * This rewrites the row in place into exactly what `linkChatPhotoIntoAlbum` would insert today:
 *
 *   · `blob_url`/`pathname`/`width`/`height`/`bytes` — the Media row's, verbatim.
 *   · `source_image_id` — the Media row's id. This is what makes it a pointer.
 *   · `description`, `search_keywords`, `negative_search_keywords`, `description_embedding` — NULL.
 *     A pointer holds no prose. The Media row is the one place it lives (`avatarPointer.ts`).
 *   · `content_hash` — NULL, as a fresh link writes it. A pointer must not answer the album arm of
 *     the duplicate lookup with a hash for bytes it does not own.
 *   · `thumb_url`/`thumb_pathname` — NULL. Nothing generates a thumbnail for a link, and a legacy
 *     copy's thumbnail is a picture of the OLD bytes.
 *   · `crop_scale`/`crop_x`/`crop_y` — NULL **only when the dimensions change**. A crop is clamped
 *     against real dimensions (`clampCrop`), so the old crop on new dimensions may not cover the
 *     circle. Identity (three NULLs) always does. Same dimensions keep the operator's framing.
 *
 * `id`, `folder`, `filename`, `source`, `source_key`, `is_current` and `announced_at` are NOT in the
 * SET. The row is still the same album entry, in the same place, and still current if it was.
 *
 * ── THE WHERE CLAUSE PINS WHAT THE CALLER READ ───────────────────────────────────────────────
 * `pathname` and both thumbnail columns must still equal the `avatar` the caller read. So the
 * `dropped*` refs returned are exactly the objects THIS statement stopped naming, never a guess
 * about a row another tab rewrote in between. A miss (another writer won, or the row is gone or not
 * yours) returns `null`. The caller re-reads.
 *
 * Does not `del` anything. Releasing the dropped objects is the caller's job, through
 * `releaseBlobIfUnreferenced`, after this statement has run (row first, blob second).
 */
export async function relinkNinaAvatarToImage(
  userId: string,
  avatar: NinaAvatarRow,
  image: NinaAvatarRelinkSource,
): Promise<NinaAvatarRelinkResult | null> {
  const dimensionsChanged = avatar.width !== image.width || avatar.height !== image.height

  const updated = await db
    .update(ninaAvatars)
    .set({
      blobUrl: image.blobUrl,
      pathname: image.pathname,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      sourceImageId: image.id,
      description: null,
      searchKeywords: null,
      negativeSearchKeywords: null,
      descriptionEmbedding: null,
      contentHash: null,
      thumbUrl: null,
      thumbPathname: null,
      ...(dimensionsChanged ? { cropScale: null, cropX: null, cropY: null } : {}),
    })
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.id, avatar.id),
        eq(ninaAvatars.pathname, avatar.pathname),
        avatar.thumbUrl == null
          ? isNull(ninaAvatars.thumbUrl)
          : eq(ninaAvatars.thumbUrl, avatar.thumbUrl),
        avatar.thumbPathname == null
          ? isNull(ninaAvatars.thumbPathname)
          : eq(ninaAvatars.thumbPathname, avatar.thumbPathname),
      ),
    )
    .returning(avatarColumns)

  const row = updated[0]
  if (row == null) return null

  return {
    row,
    droppedOriginal:
      avatar.pathname === image.pathname
        ? null
        : { blobUrl: avatar.blobUrl, pathname: avatar.pathname },
    droppedThumb:
      avatar.thumbUrl == null
        ? null
        : { blobUrl: avatar.thumbUrl, pathname: avatar.thumbPathname ?? avatar.thumbUrl },
  }
}
```
**Impact:** a new barrel name (Step 6 updates the allowlist). `userId` is the first parameter
(`ci:data-layer-guard` scans only `lib/db/queries`, but the Nina rule is the same). `db` stays inside
`lib/nina/queries/*`.

### Step 3: The shared adopt-time refresh
**File:** `lib/nina/avatarRelink.ts` (new)
**Change:** one helper both adoption paths call on a `source_key` hit. It lives in `lib/nina` (not in
`lib/admin`) because `lib/admin` may import `lib/nina` but not the reverse, and a `'use server'`
module may export only actions. Exactly one `relinkNinaAvatarToImage` call, then one
`releaseBlobIfUnreferenced` per dropped object. It holds no `db` import of its own.
**Code:**
```ts
import 'server-only'

import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import {
  getNinaAvatarBySourceKey,
  relinkNinaAvatarToImage,
  type NinaAvatarRelinkSource,
  type NinaAvatarRow,
} from '@/lib/nina/queries'

/**
 * **A re-adoption must land on the Media photo's CURRENT bytes.** `profpic-pointer-sync` R1/R2.
 *
 * Both adoption paths (`setChatPhotoAsAvatarAction` in `lib/admin`, `adoptNinaChatPhotoAsAvatar`
 * in this layer) find a previous adoption by `source_key = 'chat-photo:<imageId>'` before
 * inserting anything. That lookup is still the policy, since the unique index backs it. What changed
 * is what they do with a hit: they used to re-current it as-is. This is the step between the hit
 * and the re-current.
 *
 * A hit is **fresh** when it already points at this Media row and names the same object. Then it is
 * returned untouched, with zero writes, which is every re-adoption made since the pointer design.
 * Anything else is **stale**:
 *
 *   · `source_image_id` NULL — a legacy copy (its own `avatar-…` object, pre-R3). The reported bug:
 *     `Daofejusg4Xa` held v1 of `jWWu8vkl09fT` and was put back on her face after v2 landed.
 *   · `source_image_id` set but `pathname`/`blob_url` differ — a pointer from before a Replace.
 *   · `source_image_id` naming some OTHER Media row — not produced by any code path, but the key
 *     says which photograph this row is, so the key wins.
 *
 * A stale hit is rewritten in place by `relinkNinaAvatarToImage`. Then each object the row stopped
 * naming goes to `releaseBlobIfUnreferenced`, which deletes it only if no row in either table still
 * names it. A stale pointer's old object is usually still named by OTHER stale rows until Phase 2's
 * replace propagation and Phase 3's repair land. Then the answer is `'shared'`, the object stays,
 * and that is the correct, recoverable direction.
 *
 * `relinked` tells the chat path that her face changed even if the row was already current. Without
 * it she would say "it already is" over a photograph that just changed.
 *
 * A relink that misses (another tab rewrote the row between the read and the write) re-reads by
 * key and returns whatever is there now. Same as the insert-race handling in both link helpers. It
 * releases nothing, because this call dropped nothing.
 */
export interface NinaAdoptedAvatarRefresh {
  row: NinaAvatarRow
  relinked: boolean
}

export async function refreshAdoptedNinaAvatar(
  userId: string,
  avatar: NinaAvatarRow,
  image: NinaAvatarRelinkSource,
  sourceKey: string,
): Promise<NinaAdoptedAvatarRefresh | null> {
  const fresh =
    avatar.sourceImageId === image.id &&
    avatar.pathname === image.pathname &&
    avatar.blobUrl === image.blobUrl
  if (fresh) return { row: avatar, relinked: false }

  const relinked = await relinkNinaAvatarToImage(userId, avatar, image)
  if (relinked == null) {
    const reread = await getNinaAvatarBySourceKey(userId, sourceKey)
    if (reread == null) return null
    return { row: reread, relinked: reread.pathname !== avatar.pathname }
  }

  // Row first, blob second: the UPDATE above has already stopped naming these objects.
  if (relinked.droppedOriginal != null) {
    await releaseBlobIfUnreferenced(userId, relinked.droppedOriginal)
  }
  if (relinked.droppedThumb != null) {
    await releaseBlobIfUnreferenced(userId, relinked.droppedThumb)
  }

  return { row: relinked.row, relinked: true }
}
```
**Impact:** new module. `releaseBlobIfUnreferenced` never throws (it returns
`'deleted' | 'shared' | 'failed'`), so a failed `del` cannot fail the adoption.

### Step 4: Admin Media pane, "Set as her profile picture"
**File:** `lib/admin/ninaAlbumAvatarActions.ts`

**4a: import, line 25.** Add after the existing `import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'` line:
```ts
import { refreshAdoptedNinaAvatar } from '@/lib/nina/avatarRelink'
```
`getNinaAvatarBySourceKey` stays in the `@/lib/nina/queries` import (still used here and in
`linkChatPhotoIntoAlbum`).

**4b: docstring, lines 112–117.** Replace the `── RE-ADOPTION IS STILL A CONSTRAINT DECISION ──` block
(the heading line and its five prose lines) with:
```ts
 * ── RE-ADOPTION IS STILL A CONSTRAINT DECISION — AND NOW A REFRESH ──────────────────────────
 * The row is written with `source_key = 'chat-photo:<imageId>'`, so a second click finds the first
 * adoption through `getNinaAvatarBySourceKey`, and `nina_avatars_user_source_key_unq` is the
 * backstop for the race the lookup cannot close. What a hit gets is no longer "re-current it as
 * is": `refreshAdoptedNinaAvatar` (`lib/nina/avatarRelink.ts`) first rewrites a legacy copy (pre-R3,
 * its own `avatar-…` object) or a pointer left on pre-Replace bytes into a fresh pointer at this
 * row's CURRENT bytes, then releases the object it stopped naming. `profpic-pointer-sync` R2: the
 * operator replaced `jWWu8vkl09fT`, clicked this, and got v1 back from a 2026-09-14 copy.
```

**4c: body, lines 156–159.** Replace
```ts
  let avatar = await getNinaAvatarBySourceKey(userId, sourceKey)
  if (avatar == null) {
    avatar = await linkChatPhotoIntoAlbum(userId, row, sourceKey)
  }
```
with
```ts
  const previous = await getNinaAvatarBySourceKey(userId, sourceKey)
  const avatar =
    previous == null
      ? await linkChatPhotoIntoAlbum(userId, row, sourceKey)
      : ((await refreshAdoptedNinaAvatar(userId, previous, row, sourceKey))?.row ?? null)
```
The following `if (avatar == null) return { ok: false, error: 'The link into her album did not land.
Try again.' }` (today lines 160–162) stays exactly as is. The crop write, `setCurrentNinaAvatar`,
`scheduleMediaDescribe`, `revalidatePath` and return below it are unchanged.

**Impact:** on a stale hit the action now issues one `UPDATE … RETURNING`, then up to two reference
checks (two SELECTs each) and up to two `del`s, all before the crop write. A relinked row whose
dimensions changed has a NULL crop. The requested crop, clamped against the Media row's dimensions
on line 153, is then written as before when non-identity. On a fresh hit (every row made since R3
that has not been replaced since), the query sequence is identical to today's, so the existing
`tests/admin.chatPhotoAdoption.test.ts` queues stay valid (its default `avatarRow()` matches
`imageRow()`'s url, pathname and id).

### Step 5: Nina's chat tool, "pakai foto ini"
**File:** `lib/nina/avatarAdopt.ts`

**5a: import.** Add after the `} from '@/lib/nina/queries'` line (line 15):
```ts
import { refreshAdoptedNinaAvatar } from '@/lib/nina/avatarRelink'
```

**5b: body of `adoptNinaChatPhotoAsAvatar`, lines 174–182.** Replace from the
`/* RE-ADOPTION IS A CONSTRAINT DECISION, NOT A COUNT.` comment through
`return promoteAndAnnounce(userId, avatar)` with:
```ts
  /* RE-ADOPTION IS A CONSTRAINT DECISION, NOT A COUNT. The lookup is the policy — a second "pakai
   * foto ini" finds the first link BEFORE any insert. The `nina_avatars_user_source_key_unq` index
   * is the backstop for the race the lookup cannot close; `linkChatPhotoIntoNinaAlbum` re-reads by
   * key when the INSERT conflicts away.
   *
   * A hit is REFRESHED, not just re-currented (`profpic-pointer-sync` R2): a legacy copy or a
   * pointer left on pre-Replace bytes becomes a pointer at this row's CURRENT bytes, and the object
   * it stopped naming is released. `lib/nina/avatarRelink.ts` argues the rest. */
  const existing = await getNinaAvatarBySourceKey(userId, sourceKey)
  if (existing == null) {
    const linked = await linkChatPhotoIntoNinaAlbum(userId, row, sourceKey)
    if (linked == null) return { ok: false, kind: 'link_failed' }
    return promoteAndAnnounce(userId, linked)
  }

  const refreshed = await refreshAdoptedNinaAvatar(userId, existing, row, sourceKey)
  if (refreshed == null) return { ok: false, kind: 'link_failed' }
  return promoteAndAnnounce(userId, refreshed.row, refreshed.relinked)
}
```
(The closing `}` above replaces the function's existing closing brace on line 183. Do not leave two.)

**5c: `promoteAndAnnounce`, lines 198–216.** Replace the docstring's last paragraph and the function
with:
```ts
/**
 * The shared tail, and the two statements invariant 6 is about.
 *
 * `setCurrentNinaAvatar` re-arms `announced_at` to NULL (its own docstring: "a hand-changed avatar
 * makes her speak") and is idempotent when the row is already current. `markNinaAvatarAnnounced`
 * then closes it, in this same request, because she is about to say so in this same reply. Its
 * return is ignored on purpose: `false` means the row was already announced, which is the state we
 * wanted anyway.
 *
 * `changed` is read BEFORE the promotion, since after it the answer is always "current". It is also
 * true when `bytesChanged`: a relinked row that was already current still shows her a different
 * photograph now (`profpic-pointer-sync` R2), and "it already was" would be false.
 */
async function promoteAndAnnounce(
  userId: string,
  avatar: NinaAvatarRow,
  bytesChanged = false,
): Promise<NinaAvatarAdoptResult> {
  const changed = !avatar.isCurrent || bytesChanged
  const promoted = await setCurrentNinaAvatar(userId, avatar.id)
  if (!promoted) return { ok: false, kind: 'missing' }
  await markNinaAvatarAnnounced(userId, avatar.id)
  return { ok: true, avatarId: avatar.id, changed }
}
```
**5d: module header.** In the top-of-file block comment (lines 17–46), append this paragraph after the
`── AND WHY IT MARKS THE ROW ANNOUNCED IN THE SAME BREATH ──` block (before the closing ` */` on
line 46):
```ts
 *
 * ── A RE-ADOPTION REFRESHES THE ROW IT FINDS (profpic-pointer-sync) ───────────────────────────
 * The `source_key` hit can be a legacy copy made before the link existed, or a pointer left on
 * bytes a Replace has since swapped. Both used to be re-currented as-is, which put an OLD photograph
 * back on her face. `refreshAdoptedNinaAvatar` (`lib/nina/avatarRelink.ts`, shared with the admin
 * twin) rewrites such a row into a fresh pointer before it is promoted.
```
**Impact:** `promoteNinaAvatarAsCurrent` is unchanged (it calls `promoteAndAnnounce(userId, row)`, and
the default applies). Existing `tests/nina.avatarFromPhoto.test.ts` cases use a fresh `avatarRow()`
(same id, url and pathname as `imageRow()`), so their query sequences and `changed` values are
unchanged.

### Step 6: Barrel allowlist
**File:** `lib/nina/queries.test.ts`

**6a: header, after line 92** (the end of the `copy-admin-media-link phase 2 …` paragraph, before
` */`):
```ts
 *
 * profpic-pointer-sync phase 1 adds one name: `relinkNinaAvatarToImage`, the in-place rewrite that
 * turns an adopted album row (a pre-R3 legacy copy, or a pointer left on pre-Replace bytes) back
 * into a pointer at its Media original's current bytes. It returns the objects it stopped naming,
 * so the caller can release them. Documented growth, one name. See the plan set's Phase 1
 * Interface Contract.
```

**6b: list, between `'referenceEligibleChatPhotoScope',` (line 223) and `'removeNinaSession',`
(line 224):**
```ts
  // profpic-pointer-sync phase 1 (R1/R2): rewrite a stale adopted album row into a fresh pointer.
  // `lib/nina/queries/avatars.ts` argues the SET list and the WHERE pin.
  'relinkNinaAvatarToImage',
```
(`'ref…' < 'rel…' < 'rem…'` under the default `Array.prototype.sort` the test applies.)

### Step 7: Tests
**File:** `tests/nina.avatarRelink.test.ts` (new)
**Change:** the real queries run against the recording driver (`tests/admin.chatPhotoAdoption.test.ts`'s
posture). Only the edges are mocked: `@vercel/blob`, `requireAdmin`, `after()`, `revalidatePath`,
vision and embedding. The fixtures are positional projections of `imageColumns` (17 values) and
`avatarColumns` (21 values), copied from `tests/nina.avatarFromPhoto.test.ts`.
**Code:**
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import type { NinaAvatarRow } from '@/lib/nina/queries'
import { clampCrop } from '@/lib/nina/crop'

/**
 * **A re-adoption lands on the Media photo's CURRENT bytes.** `profpic-pointer-sync` Phase 1, R1/R2.
 *
 * The production report: `jWWu8vkl09fT` was replaced (v1 → v2) and then set as her profile
 * picture, and `/nina/about` still showed v1. The `source_key` lookup found `Daofejusg4Xa`, a
 * 2026-09-14 legacy COPY (`source_image_id NULL`, its own `avatar-…` object holding v1), and
 * re-currented it untouched. These tests pin, in the order they would hurt if they were wrong:
 *
 *   1. **A stale hit is rewritten into a pointer at the Media row's current bytes**: url, pathname,
 *      dimensions, size and `source_image_id`. Prose, keywords, embedding, content hash and
 *      thumbnail go NULL. The crop goes NULL only when the dimensions change.
 *   2. **`id`, `folder`, `source_key` and `is_current` are not in the SET.**
 *   3. **Row first, blob second.** Every `del` happens after the relink UPDATE has been issued, and
 *      only for an object no row still names.
 *   4. **A fresh hit is untouched.** No relink UPDATE, no `del`.
 *   5. **A lost race re-reads and releases nothing.**
 */

const USER = 'abc123XYZ_-9'
const IMAGE_ID = 'img123XYZ_-9'
const MESSAGE_ID = 'msg123XYZ_-9'
const AVATAR_ID = 'ava123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/** v2: what the Media row holds after the Replace. 576×1024, the production row's dimensions. */
const V2_PATHNAME = `nina/${USER}/selfie-V2xxxxxxxxxx-${IMAGE_ID}.jpg`
const V2_URL = `${STORE}/${V2_PATHNAME}`
/** v1: what a stale POINTER still names. Same dimensions as v2. */
const V1_PATHNAME = `nina/${USER}/selfie-V1xxxxxxxxxx-${IMAGE_ID}.jpg`
const V1_URL = `${STORE}/${V1_PATHNAME}`
/** The legacy COPY's own object, minted by the pre-R3 fetch+put. 768×1024. */
const COPY_PATHNAME = `nina/${USER}/avatar-JjBL3efzVE8q-${AVATAR_ID}.jpg`
const COPY_URL = `${STORE}/${COPY_PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${AVATAR_ID}.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`

const del = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
const requireAdmin = vi.fn()
const revalidatePath = vi.fn()
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('@vercel/blob', () => ({ put, del }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/vision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/vision')>()
  return { ...actual, describeNinaImages: vi.fn() }
})
vi.mock('@/lib/nina/embedding', () => ({ embedNinaText: vi.fn() }))

let fake: FakeDb
let queries: typeof import('@/lib/nina/queries')
let avatarAdopt: typeof import('@/lib/nina/avatarAdopt')
let actions: typeof import('@/lib/admin/ninaAlbumActions')
/** `fake.queries.length` at the moment of each `del`, so "row first, blob second" is assertable. */
let queriesAtDel: number[]

/** An override that can express NULL — `in`, not `??`. */
function pick<T>(overrides: Record<string, unknown>, key: string, fallback: T): T {
  return (key in overrides ? overrides[key] : fallback) as T
}

/** `imageColumns` in projection order — the first 17 values. Defaults to the v2 Media row. */
function imageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', IMAGE_ID),
    pick(overrides, 'messageId', MESSAGE_ID),
    pick(overrides, 'kind', 'generated'),
    pick(overrides, 'blobUrl', V2_URL),
    pick(overrides, 'pathname', V2_PATHNAME),
    pick(overrides, 'width', 576),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 180_000),
    pick(overrides, 'description', null),
    pick(overrides, 'prompt', null),
    pick(overrides, 'sourceAvatarId', null),
    pick(overrides, 'sourceImageId', null),
    pick(overrides, 'contentHash', null),
    pick(overrides, 'perceptualHash', null),
    pick(overrides, 'perceptualSig', null),
    pick(overrides, 'sortOrder', 0),
    pick(overrides, 'createdAt', '2026-09-14 09:00:00+00'),
  )
}

/** `avatarColumns` in projection order — 21 values. Defaults to a FRESH pointer at v2. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', AVATAR_ID),
    pick(overrides, 'blobUrl', V2_URL),
    pick(overrides, 'pathname', V2_PATHNAME),
    pick(overrides, 'folder', 'faces'),
    pick(overrides, 'filename', null),
    pick(overrides, 'thumbUrl', null),
    pick(overrides, 'thumbPathname', null),
    pick(overrides, 'width', 576),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 180_000),
    pick(overrides, 'source', 'admin'),
    pick(overrides, 'cropScale', null),
    pick(overrides, 'cropX', null),
    pick(overrides, 'cropY', null),
    pick(overrides, 'description', null),
    pick(overrides, 'searchKeywords', null),
    pick(overrides, 'negativeSearchKeywords', null),
    pick(overrides, 'isCurrent', false),
    pick(overrides, 'announcedAt', null),
    pick(overrides, 'createdAt', '2026-09-14 09:05:00+00'),
    pick(overrides, 'sourceImageId', IMAGE_ID),
  )
}

/** The production shape of `Daofejusg4Xa`: a current legacy copy with prose, a crop and a thumb. */
const LEGACY_COPY = {
  blobUrl: COPY_URL,
  pathname: COPY_PATHNAME,
  thumbUrl: THUMB_URL,
  thumbPathname: THUMB_PATHNAME,
  width: 768,
  height: 1024,
  bytes: 420_000,
  cropScale: '1.500',
  cropX: 40,
  cropY: -20,
  description: 'the copy’s own stale prose',
  searchKeywords: 'pantai',
  negativeSearchKeywords: 'malam',
  isCurrent: true,
  sourceImageId: null,
}

/** A pointer left on v1 by a Replace. Same dimensions as v2, so its crop survives. */
const STALE_POINTER = {
  blobUrl: V1_URL,
  pathname: V1_PATHNAME,
  cropScale: '1.200',
  cropX: 10,
  cropY: 0,
}

/** The same rows as TS objects, for calling the query directly. */
function avatarObject(overrides: Partial<NinaAvatarRow> = {}): NinaAvatarRow {
  return {
    id: AVATAR_ID,
    blobUrl: V2_URL,
    pathname: V2_PATHNAME,
    folder: 'faces',
    filename: null,
    thumbUrl: null,
    thumbPathname: null,
    width: 576,
    height: 1024,
    bytes: 180_000,
    source: 'admin',
    cropScale: null,
    cropX: null,
    cropY: null,
    description: null,
    searchKeywords: null,
    negativeSearchKeywords: null,
    isCurrent: false,
    announcedAt: null,
    createdAt: new Date('2026-09-14T09:05:00Z'),
    sourceImageId: IMAGE_ID,
    ...overrides,
  }
}

const MEDIA_V2 = {
  id: IMAGE_ID,
  blobUrl: V2_URL,
  pathname: V2_PATHNAME,
  width: 576,
  height: 1024,
  bytes: 180_000,
}

function relinkStatement() {
  return fake.queries.find(
    (query) =>
      query.sql.startsWith('update "nina_avatars"') && query.sql.includes('"source_image_id" = $'),
  )
}

function setClauseOf(sql: string): string {
  return sql.slice(sql.indexOf(' set '), sql.indexOf(' where '))
}

beforeEach(async () => {
  afterCallbacks.length = 0
  queriesAtDel = []
  vi.resetModules()
  del.mockReset().mockImplementation(async () => {
    queriesAtDel.push(fake.queries.length)
    return {}
  })
  put.mockReset()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER })
  revalidatePath.mockReset()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
  avatarAdopt = await import('@/lib/nina/avatarAdopt')
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('relinkNinaAvatarToImage — the statement', () => {
  it('rewrites a legacy copy into a pointer at the Media row’s current bytes', async () => {
    fake.enqueue([avatarRow({ isCurrent: true })]) // RETURNING

    const legacy = avatarObject({
      ...LEGACY_COPY,
      cropScale: 1.5,
      createdAt: new Date('2026-09-14T09:05:00Z'),
    })
    const result = await queries.relinkNinaAvatarToImage(USER, legacy, MEDIA_V2)

    const update = fake.only()
    expect(update.sql.startsWith('update "nina_avatars"')).toBe(true)
    const set = setClauseOf(update.sql)
    for (const column of [
      '"blob_url" = $',
      '"pathname" = $',
      '"width" = $',
      '"height" = $',
      '"bytes" = $',
      '"source_image_id" = $',
      '"description" = $',
      '"search_keywords" = $',
      '"negative_search_keywords" = $',
      '"description_embedding" = $',
      '"content_hash" = $',
      '"thumb_url" = $',
      '"thumb_pathname" = $',
      // 768×1024 → 576×1024: the old crop may not cover the circle any more.
      '"crop_scale" = $',
      '"crop_x" = $',
      '"crop_y" = $',
    ]) {
      expect(set).toContain(column)
    }
    // Invariant 6: the row is the same album entry, in the same place, still current.
    for (const kept of ['"id"', '"folder"', '"source_key"', '"is_current"', '"announced_at"']) {
      expect(set).not.toContain(kept)
    }
    expect(update.params).toEqual(
      expect.arrayContaining([V2_URL, V2_PATHNAME, IMAGE_ID, 576, 1024, 180_000]),
    )
    // The WHERE pins what the caller read: owner, id, old pathname, old thumbnail.
    expect(update.params).toEqual(
      expect.arrayContaining([USER, AVATAR_ID, COPY_PATHNAME, THUMB_URL, THUMB_PATHNAME]),
    )
    expect(update.params).not.toContain(LEGACY_COPY.description)
    expect(update.sql).toContain('returning')

    expect(result?.row.id).toBe(AVATAR_ID)
    expect(result?.droppedOriginal).toEqual({ blobUrl: COPY_URL, pathname: COPY_PATHNAME })
    expect(result?.droppedThumb).toEqual({ blobUrl: THUMB_URL, pathname: THUMB_PATHNAME })
  })

  it('keeps the crop when the dimensions are unchanged, and drops no thumbnail it never had', async () => {
    fake.enqueue([avatarRow({ cropScale: '1.200', cropX: 10, cropY: 0 })])

    const stale = avatarObject({ ...STALE_POINTER, cropScale: 1.2 })
    const result = await queries.relinkNinaAvatarToImage(USER, stale, MEDIA_V2)

    const update = fake.only()
    expect(setClauseOf(update.sql)).not.toContain('"crop_')
    expect(update.sql).toContain('"thumb_url" is null')
    expect(update.sql).toContain('"thumb_pathname" is null')
    expect(result?.droppedOriginal).toEqual({ blobUrl: V1_URL, pathname: V1_PATHNAME })
    expect(result?.droppedThumb).toBeNull()
  })

  it('reports no dropped original when the old pathname already IS the Media row’s', async () => {
    fake.enqueue([avatarRow()])

    const sameObjectCopy = avatarObject({ sourceImageId: null })
    const result = await queries.relinkNinaAvatarToImage(USER, sameObjectCopy, MEDIA_V2)

    expect(result?.droppedOriginal).toBeNull()
    expect(result?.droppedThumb).toBeNull()
  })

  it('answers null when the WHERE pin misses (another writer won, or not yours)', async () => {
    fake.enqueue([])

    const result = await queries.relinkNinaAvatarToImage(
      USER,
      avatarObject({ ...STALE_POINTER, cropScale: 1.2 }),
      MEDIA_V2,
    )

    expect(result).toBeNull()
  })
})

describe('adoptNinaChatPhotoAsAvatar — a stale hit is refreshed before it is promoted', () => {
  it('relinks the current legacy copy to v2, releases the copy and its thumbnail, reports changed', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage — v2
    fake.enqueue([avatarRow(LEGACY_COPY)]) // getNinaAvatarBySourceKey — the 2026-09-14 copy
    fake.enqueue([avatarRow({ isCurrent: true })]) // relink RETURNING — now a v2 pointer
    fake.enqueue([], []) // isBlobPathnameReferenced(copy) — nothing names it
    fake.enqueue([], []) // isBlobPathnameReferenced(thumb) — nothing names it
    fake.enqueue([avatarRow({ isCurrent: true })]) // setCurrentNinaAvatar's pre-read → idempotent

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    // Already current, but her face just changed — she must not say "it already was".
    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })

    const relink = relinkStatement()
    expect(relink).toBeDefined()
    expect(relink?.params).toEqual(expect.arrayContaining([V2_URL, V2_PATHNAME, IMAGE_ID]))
    expect(fake.queries.some((query) => query.sql.startsWith('insert into'))).toBe(false)

    expect(del).toHaveBeenCalledTimes(2)
    expect(del).toHaveBeenNthCalledWith(1, COPY_URL)
    expect(del).toHaveBeenNthCalledWith(2, THUMB_URL)
    // Row first, blob second.
    const relinkIndex = fake.queries.indexOf(relink!)
    for (const seen of queriesAtDel) expect(seen).toBeGreaterThan(relinkIndex)
    expect(put).not.toHaveBeenCalled()
  })

  it('refreshes a stale pointer but KEEPS v1 while another row still names it', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow(STALE_POINTER)])
    fake.enqueue([avatarRow({ cropScale: '1.200', cropX: 10, cropY: 0 })]) // relink RETURNING
    fake.enqueue([{ id: 'refRow000001' }], []) // a stale chat reference still names v1 → 'shared'
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read — not current yet

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(setClauseOf(relinkStatement()!.sql)).not.toContain('"crop_')
    expect(del).not.toHaveBeenCalled()
  })

  it('leaves a fresh pointer untouched: no relink, no release', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow({ isCurrent: true })])
    fake.enqueue([avatarRow({ isCurrent: true })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: false })
    expect(relinkStatement()).toBeUndefined()
    expect(del).not.toHaveBeenCalled()
  })

  it('a lost relink race re-reads by key and releases nothing', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow(LEGACY_COPY)])
    fake.enqueue([]) // relink RETURNING — the WHERE pin missed
    fake.enqueue([avatarRow({ isCurrent: true })]) // the re-read: the winner's v2 pointer
    fake.enqueue([avatarRow({ isCurrent: true })]) // setCurrentNinaAvatar's pre-read

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(del).not.toHaveBeenCalled()
    const reread = fake.queries[3]
    expect(reread?.sql).toContain('"source_key"')
    expect(reread?.params).toContain(`chat-photo:${IMAGE_ID}`)
  })
})

describe('setChatPhotoAsAvatarAction — a stale hit is refreshed before crop and current', () => {
  it('relinks the legacy copy, releases both objects, then writes the crop clamped to v2', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage — v2, 576×1024
    fake.enqueue([avatarRow(LEGACY_COPY)]) // getNinaAvatarBySourceKey — the copy
    fake.enqueue([avatarRow({ isCurrent: true })]) // relink RETURNING
    fake.enqueue([], []) // release copy
    fake.enqueue([], []) // release thumb
    fake.enqueue([{ id: AVATAR_ID }]) // updateNinaAvatarCrop RETURNING
    fake.enqueue([avatarRow({ isCurrent: true })]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction({
      id: IMAGE_ID,
      scale: 2,
      x: 120,
      y: -80,
    })

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(put).not.toHaveBeenCalled()
    expect(fake.queries.some((query) => query.sql.startsWith('insert into'))).toBe(false)

    const relink = relinkStatement()
    expect(relink).toBeDefined()
    expect(setClauseOf(relink!.sql)).toContain('"crop_scale" = $') // 768×1024 → 576×1024

    const cropWrite = fake.queries.find((query) =>
      query.sql.startsWith('update "nina_avatars" set "crop_scale"'),
    )
    expect(cropWrite).toBeDefined()
    expect(fake.queries.indexOf(cropWrite!)).toBeGreaterThan(fake.queries.indexOf(relink!))
    const expected = clampCrop({ width: 576, height: 1024 }, { scale: 2, x: 120, y: -80 })
    expect(cropWrite?.params.slice(0, 3)).toEqual([String(expected.scale), expected.x, expected.y])

    expect(del).toHaveBeenCalledTimes(2)
    expect(del).toHaveBeenCalledWith(COPY_URL)
    expect(del).toHaveBeenCalledWith(THUMB_URL)
    for (const seen of queriesAtDel) {
      expect(seen).toBeGreaterThan(fake.queries.indexOf(relink!))
    }
  })

  it('refreshes a stale pointer on an identity draft without touching its crop', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow(STALE_POINTER)])
    fake.enqueue([avatarRow({ cropScale: '1.200', cropX: 10, cropY: 0 })]) // relink RETURNING
    fake.enqueue([], []) // release v1 — nothing else names it
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction({ id: IMAGE_ID, scale: 1, x: 0, y: 0 })

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(setClauseOf(relinkStatement()!.sql)).not.toContain('"crop_')
    expect(
      fake.queries.some((query) => query.sql.startsWith('update "nina_avatars" set "crop_scale"')),
    ).toBe(false)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(V1_URL)
  })
})
```
**Impact:** new file only. Implementer notes:
- `cropScale` is `numeric(5,3)` in `mode: 'number'`. The positional fixture passes the driver's string
  form (`'1.500'`), and the TS-object fixture passes a number. Both match what each side actually sees.
- `fake.enqueue([], [])` queues two empty results, one per SELECT inside `isBlobPathnameReferenced`'s
  `Promise.all` (images first, then avatars), the same as `tests/nina.blobRelease.test.ts`.
- If drizzle's update SQL renders `" set "` / `" where "` with different spacing than assumed by
  `setClauseOf`, adjust the slice markers. The assertion's intent is "inside the SET list".
- `fake.only()` in the first describe asserts exactly one statement. The query does no pre-read.

## Verification

**Setup (once per worktree, same as Phases 2 and 3):** the worktree has no `node_modules` and no
`.env.local`. Symlink both from the main checkout instead of running `npm ci` (the lockfiles are
byte-identical at `d4491e5`). Both paths are git-ignored (`/node_modules`, `.env.*`); never
`git add -f` them, and stage files by name, not with `git add -A`. This phase needs no database:
the unit suite runs on the recording fake driver.
```bash
export PATH=/home/miftah/tools/node-v24.20.0-linux-x64/bin:$PATH
WT=/home/miftah/.worktrees/run-insights/profpic-pointer-sync
[ -e "$WT/node_modules" ] || ln -s /home/miftah/run-insights/node_modules "$WT/node_modules"
[ -e "$WT/.env.local" ]   || ln -s /home/miftah/run-insights/.env.local   "$WT/.env.local"
cd "$WT"
```

**Build:** `npm run typecheck && npm run lint && npm run format:check`
**Tests:**
- `npx vitest run tests/nina.avatarRelink.test.ts lib/nina/queries.test.ts tests/admin.chatPhotoAdoption.test.ts tests/nina.avatarFromPhoto.test.ts tests/nina.avatartools.test.ts tests/nina.blobRelease.test.ts`
- then `npm test` (full unit suite)
- `npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:openrouter-guard && npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f11-guard && npm run ci:schema-drift-guard`
- `npm run knip`: `refreshAdoptedNinaAvatar` and `relinkNinaAvatarToImage` must not be flagged.
  `NinaAdoptedAvatarRefresh` is exported for the return type. If knip flags it as an unused export
  type, drop the `export` and inline the type in the signature.

**Manual check:** none needed in this phase. Production rows are Phase 3's job. After deploy, clicking
"Set as her profile picture" on `jWWu8vkl09fT` in `/admin/nina?view=media` would relink
`Daofejusg4Xa` to v2 even before Phase 3 runs.

**Exit criteria:** adopting a Media photo whose `source_key` row is a legacy copy or a stale pointer, from
either the admin action or Nina's chat tool, yields that same row id rewritten to the Media row's
current `blob_url/pathname/width/height/bytes` with `source_image_id` set, NULL
prose/keywords/embedding/`content_hash`/thumb, and a crop that is NULL only when the dimensions
changed. The dropped object and thumbnail are each passed to `releaseBlobIfUnreferenced` after the
UPDATE. All the commands above are green.

## Handoffs

- **Phase 2 (R3):** `updateNinaChatPhotoBlob` / `updateNinaAvatarBlob` do not yet move dependent rows. Until
  they do, a relink's `droppedOriginal` for a stale pointer will often release as `'shared'`, because
  other stale pointers or chat references still name v1. That is expected and correct. Phase 2 stops new
  staleness. Phase 1 only heals it on adoption. Note for Phase 2: `relinkNinaAvatarToImage` sits
  directly after `getNinaAvatarBySourceKey` in `avatars.ts`. `updateNinaAvatarBlob` (line 206) is
  untouched and above it.
- **Phase 3 (R1, R3):** the existing 21 legacy copies / 11 stale pointers are only healed by Phase 1 when
  someone re-adopts them. The repair script fixes the rest, with the identical SET list (reconciled,
  Decision D1), so a row repaired by the script and a row relinked by adoption are the same shape.
- **Chat references to a relinked row are not moved here (Decision D4).** A legacy copy can be re-shown
  by `nina_message_images` rows with `source_avatar_id = <copy id>` (6 in production). After this
  phase's relink they still name the copy's object, so the release answers `'shared'` and keeps it.
  That is safe, and it converges: Phase 3's planner treats the relinked row as a pointer and moves
  those references to the Media row's bytes, then deletes the object, in either run order. After
  Phase 3 there are no legacy copies left for this branch to meet, and from Phase 2 on a replace
  moves a pointer's references itself (its statement 4).
- **Not taken (no requirement owns it):** when the relinked row was *already current*, the admin path's
  `setCurrentNinaAvatar` is idempotent and does not re-arm `announced_at`. So her face changes without
  the cron's "avatar changed" comment. The chat path is unaffected (she says it in the turn, and
  `changed: true` is now returned). Making the admin path re-announce would need a change to
  `setCurrentNinaAvatar` and belongs in a follow-up card, not in this set.
- **Drive-by doc drift, not taken:** `getNinaAvatarBySourceKey`'s docstring (`avatars.ts:303–308`) still
  says a second adoption "re-currents the FIRST copy". After this phase it is the lookup only, and the
  refresh is the caller's. Left alone to keep `avatars.ts` edits confined to the one insertion.

## Rollback

`git revert` the phase commit. Rows already relinked by the new code are valid pointers under the old
code: `source_image_id` set, NULL prose, Media bytes. That is exactly what `linkChatPhotoIntoAlbum`
writes. Objects already released are gone, but they were released only because no row named them.
