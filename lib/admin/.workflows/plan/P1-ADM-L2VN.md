> Adopted from `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` phase 4. Source: `.workflows/plan/dup-image-push-notify/phase-4.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 4: Wire admin-side upload routes

**Plan set:** `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`
**Analysis:** `20260915-090023-K7Q2_code_analyzer.md`
**Satisfies:** R1 — a push notification fires when an image uploaded through an *admin* route already exists somewhere in the signed-in user's whole image collection
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `lib/admin` (with `components/admin/explorer`, and two threading edits in `lib/nina/queries`)

---

## Goal

After this phase all three admin-app upload paths ask phase 1's cross-table lookup whether the bytes
they just accepted already exist in the user's collection, and fire `duplicate_image` on a hit:
**Add** (which stops sending its generic `admin_chat_photo` push when the add *was* a duplicate),
**Replace** (which detected nothing at all before — it only round-tripped the caller's hash claim),
and the **avatar folder batch** (which computed no content hash at all before — only the mechanical
`source_key`). No existing dedup *decision* changes: `planChatPhotoAddWrite` still decides
insert-vs-reference, Replace still always replaces, and `ON CONFLICT (user_id, source_key) DO NOTHING`
still decides which avatar rows land.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**
- `lib/admin/chatPhotoActions.ts` — private (non-exported) helper `duplicateTargetFromPlan(plan)`;
  a `'use server'` module may export only async functions, so it stays module-private exactly as
  `isChatPhotoReference` and `loadPhotoCarrier` already do.
- `lib/admin/ninaAlbumUploadActions.ts` — private (non-exported) scheduler
  `scheduleAvatarDuplicateScan(userId, candidates)`.
- `lib/admin/schema.ts` — `avatarBatchRecordSchema` gains an optional, nullable `contentHash` field
  (shape-only, mirroring `chatPhotoContentHash` in `lib/admin/chatPhotoSchema.ts:56`), so
  `AvatarBatchRecord` gains `contentHash?: string | null`.
- `components/admin/explorer/useFolderUpload.ts` — `uploadOne` now computes and returns
  `contentHash`.
- `tests/admin.albumUploadActions.test.ts` — NEW file (there is no behavioural test for
  `registerNinaAvatarsAction` today; `tests/admin.albumActionsBarrel.test.ts` only asserts the
  barrel's export list).

**Signature changes:**
- `NinaAvatarBatchInsert` (`lib/nina/queries/shapes.ts:424-437`) gains `contentHash?: string | null`
  — **optional**, so `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumAvatarActions.ts`), the other
  writer of this shape, needs no edit.
- `insertNinaAvatars` (`lib/nina/queries/avatars.ts:587-621`) writes
  `contentHash: input.contentHash ?? null` into its `VALUES`. Its parameter and return types are
  unchanged; `avatarColumns` is deliberately NOT widened (see "Leaves alone").

**Requires (from earlier phases) — Phase 1. Reconciled round 1: copied verbatim from phase 1's plan,
no longer assumed.**
1. `nina_avatars.content_hash` exists as a nullable `text` column on the Drizzle table
   (`lib/db/schema/nina/avatars.ts`) **and is named `contentHash` in the Drizzle model**, so
   `insertNinaAvatars`'s `.values({ ..., contentHash })` compiles. **Verified: phase 1 adds the
   column and a read-only finder, and threads the hash nowhere.** The write-side threading —
   `NinaAvatarBatchInsert.contentHash` (Step 5c) and `insertNinaAvatars`'s `VALUES` (Step 5d) — is
   this phase's, end to end, and is *not* duplicated by phase 1. Step 5c/5d stay.
2. The pointer vocabulary, exported by **`@/lib/photos/pointer`** (not by `globalDuplicate`):
   ```ts
   export type PhotoPointerKind = 'shot' | 'avatar' | 'image'
   export interface PhotoPointer { kind: PhotoPointerKind; id: string }
   export interface ResolvedPhotoPointer extends PhotoPointer { url: string }
   ```
3. The lookup, from `@/lib/photos/globalDuplicate`:
   ```ts
   export interface GlobalDuplicateOptions {
     exclude?: PhotoPointer | readonly PhotoPointer[] | null
   }
   export async function findGlobalDuplicatePhoto(
     userId: string,
     contentHash: string | readonly string[],
     options?: GlobalDuplicateOptions,
   ): Promise<ResolvedPhotoPointer | null>
   ```
   — read-only, `user_id`-scoped across all three tables, `null` on a miss, never throws for a miss.
   **`exclude` is the THIRD argument's `exclude` FIELD, not a positional pointer** — the draft of
   this plan passed it positionally at all three call sites and every one has been corrected below.
   It accepts a single pointer (what the two chat routes pass, one row per call) or a list (what the
   avatar batch now passes — see 4).
4. A notify helper `notifyDuplicateImagePush(userId, pointer: PhotoPointer): Promise<void>` at
   `@/lib/push/duplicateImage` (a sibling of `lib/push/send.ts`), which wraps `notifyNinaPush` with
   the new `duplicate_image` kind and sets `url` to `photoViewerPath(pointer)` =
   `/photo/<kind>/<id>`. **This plan guessed both the module path and the name correctly** — it is
   the only one of the four phases that did.
5. The `duplicate_image` entry in `NINA_PUSH_KINDS` (`lib/push/payload.ts:161-200`). This phase
   never names that string literal — it only calls the helper — so there is no second spelling to
   drift.

> **Naming note (reconciler round 1).** This plan's draft guessed `findGlobalDuplicateImage`
> returning a `GlobalPhotoPointer`, with a positional `exclude`. Phase 1 ships
> `findGlobalDuplicatePhoto` returning `ResolvedPhotoPointer`, with `exclude` inside an options
> object. Every occurrence below has been rewritten:
>
> | draft (wrong) | phase 1 (use this) |
> |---|---|
> | `findGlobalDuplicateImage` | `findGlobalDuplicatePhoto` |
> | `GlobalPhotoPointer` | `ResolvedPhotoPointer`, from `@/lib/photos/pointer` |
> | `GlobalPhotoKind` (does not exist) | `PhotoPointerKind`, from `@/lib/photos/pointer` |
> | `findGlobalDuplicateImage(u, h, {kind, id})` | `findGlobalDuplicatePhoto(u, h, { exclude: {kind, id} })` |
>
> *(Reconciler round 2: the left column had itself been caught by round 1's global rename, so the
> table read `findGlobalDuplicatePhoto → findGlobalDuplicatePhoto` and proved nothing. The draft's
> real names are restored above, from the index's Reconciliation Log #4 and this plan's own first
> Handoffs bullet, so the rename is auditable again. No step or code block changed.)*
>
> `notifyDuplicateImagePush` and both module paths were already right and are unchanged, so the
> `vi.mock` specifiers still name the right files.

**Leaves alone (owned by others):**
- `app/api/extract/route.ts`, `components/extract/UploadPicker.tsx`,
  `components/nina/useComposerPhotos.ts`, `lib/nina/actions/send.ts`, `lib/db/queries/photos.ts`
  (Phase 3).
- `app/photo/[kind]/[id]/page.tsx` (Phase 2). This phase never constructs the URL; the helper does.
- `lib/db/schema/nina/avatars.ts`, `lib/db/schema/runs.ts`, the migration, `lib/push/payload.ts`,
  `lib/push/send.ts`, `lib/photos/pointer.ts`, `lib/photos/globalDuplicate.ts`'s body (Phase 1).
  **This phase never constructs a `/photo/...` URL** — it hands a pointer to
  `notifyDuplicateImagePush`, which calls `photoViewerPath`.
- `lib/admin/chatPhotos.ts` — `planChatPhotoAddWrite` and `ChatPhotoAddPlan` are **read, never
  edited**. The duplicate pointer is derived from the plan the function already returns.
- `avatarColumns` (`lib/nina/queries/columns.ts:72-91`) — deliberately not widened with
  `contentHash`. Nothing in this phase reads the hash *back* off an inserted avatar row: it already
  holds the submitted hash and joins by `pathname`, the same join `registerNinaAvatarsAction`
  already uses for `keyByPathname` (`lib/admin/ninaAlbumUploadActions.ts:187`). Phase 1's lookup
  reads the column in its own SQL, not through this projection.
- The `source_key` `ON CONFLICT DO NOTHING` mechanism, intra-batch dedupe, `setCurrentNinaAvatar`
  promotion, `scheduleDescribe`, `declareNinaFolders` — untouched.
- `components/admin/explorer/chatPhotoUpload.ts` — untouched. It already hashes.
  `findChatPhotoDuplicateAction` — untouched.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/chatPhotoActions.ts` | modify | imports (`:46-47`); `replaceChatPhotoAction` gets a hoisted `claimedHash` + a duplicate check (`:148-205`); `addChatPhotoAction`'s push branches on a duplicate (`:380-419`); new private `duplicateTargetFromPlan` |
| `lib/admin/schema.ts` | modify | `avatarBatchRecordSchema` gains optional nullable `contentHash` (`:361-373`) |
| `components/admin/explorer/useFolderUpload.ts` | modify | `uploadOne` hashes the file and puts `contentHash` on the record (`:134-240`) |
| `lib/nina/queries/shapes.ts` | modify | `NinaAvatarBatchInsert` gains `contentHash?: string \| null` (`:424-437`) |
| `lib/nina/queries/avatars.ts` | modify | `insertNinaAvatars` writes the column (`:598-620`) |
| `lib/admin/ninaAlbumUploadActions.ts` | modify | imports; `registerNinaAvatarsAction` threads the hash into the insert and schedules the duplicate scan (`:125-196`); new private `scheduleAvatarDuplicateScan` |
| `tests/admin.chatPhotos.test.ts` | modify | two new `vi.mock` factories; new cases for Add-suppression and Replace-detection; amend the now-too-broad docstring at `:908` |
| `components/admin/explorer/useFolderUpload.test.tsx` | modify | mock `@/lib/photos/contentHash`; new case asserting the hash rides the record, and the null fallback |
| `tests/admin.albumUploadActions.test.ts` | create | first behavioural test for `registerNinaAvatarsAction`: hash threading, the `after()` scan, the one-push-per-batch cap |

Nine files.

**`lib/nina/queries/avatars.ts` is shared with phase 1, and the regions are disjoint** (reconciler
round 1): phase 1 inserts `findNinaAvatarByContentHash` after `getNinaAvatarBySourceKey` (~`:256`)
and rewrites the file's `drizzle-orm` import line in full; this phase edits `insertNinaAvatars`,
which sits far below it. **Phase 1 lands first, so `insertNinaAvatars` will no longer be at
`:598-620`** — it moves down by roughly 45 lines. Locate it by name, and do not touch the
`drizzle-orm` import line.

**`lib/nina/queries/shapes.ts` is this phase's alone** — verified against phase 1's plan, which
neither lists it nor edits any avatar write path. Steps 5c and 5d are not duplicated work and must
be implemented.

---

## Implementation Steps

### Step 1: Import phase 1's lookup and notifier into the chat-photo actions

**File:** `lib/admin/chatPhotoActions.ts:46-47`
**Change:** Two new imports beside the two that already sit there. The file already imports
`isValidContentHash` from `@/lib/photos/contentHash` and `notifyNinaPush` from `@/lib/push/send`;
both stay.

**Code:** replace lines 46-47

```ts
import { isValidContentHash } from '@/lib/photos/contentHash'
import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'
import type { ResolvedPhotoPointer } from '@/lib/photos/pointer'
import { notifyDuplicateImagePush } from '@/lib/push/duplicateImage'
import { notifyNinaPush } from '@/lib/push/send'
```

> **The type comes from `@/lib/photos/pointer`, not from `@/lib/photos/globalDuplicate`**
> (reconciler round 1): phase 1 declares the pointer vocabulary in the pure `pointer.ts` module so a
> browser-safe caller can name it without dragging in `server-only` and the database client.
> `globalDuplicate.ts` imports it too.

Also add, to the existing `@/lib/admin/chatPhotos` import block at `:13-20`, the plan type — the new
helper in Step 2 is typed against it:

```ts
import {
  ADMIN_CHAT_PHOTOS_PATH,
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  isAdminChatPhotoPathname,
  isNinaPhotoCarrierMessage,
  planChatPhotoAddWrite,
  type ChatPhotoActionResult,
  type ChatPhotoAddPlan,
} from '@/lib/admin/chatPhotos'
```

**Impact:** `lib/admin/chatPhotoActions.ts` now sits in phase 1's import graph. Any test that loads
this module must mock both new specifiers (Step 7) — `@/lib/photos/globalDuplicate` imports `db`,
and `@/lib/push/duplicateImage` transitively reaches `web-push`/`pushEnv()`.

---

### Step 2: The private helper that reads a duplicate pointer off the add plan

**File:** `lib/admin/chatPhotoActions.ts` — new function, placed with the other two private helpers
in the `── The two helpers ──` section (after `isChatPhotoReference`, before `loadPhotoCarrier`,
i.e. at `:760`)

**Change:** `planChatPhotoAddWrite` already answers "was this add a duplicate, and of what" —
`sourceImageId`/`sourceAvatarId` are non-null on exactly the duplicate branch, they name the
**flattened original** (`ninaPhotoProvenance` is the one writer of the pair), and `plan.blobUrl` is
the keeper's object. So the in-collection case needs no lookup at all: asking phase 1's finder here
would be asking a question the plan has already answered, and it would answer *worse* — the plan
copies the keeper's `content_hash`, which may be NULL for a keeper the backfill sweep never reached,
and a NULL hash makes the cross-table lookup unanswerable for a duplicate we have positive proof of.

**Code:**

```ts
/**
 * **Was this add a duplicate, and which row is the original?** — read off the plan rather than
 * asked a second time.
 *
 * `planChatPhotoAddWrite` sets exactly one of `sourceImageId` / `sourceAvatarId` on its two
 * duplicate branches (the pre-check pin and the race-door hash hit) and neither on a fresh
 * original — and `ninaPhotoProvenance`, its one writer, has already FLATTENED a pinned row that was
 * itself a re-share down to the photograph it re-shows. So this is both the cheapest and the most
 * correct answer available at the call site: no query, and a pointer at the row the operator would
 * actually want to see, not at the reference that happened to be pinned.
 *
 * ── WHY NOT JUST CALL PHASE 1'S LOOKUP FOR EVERY ADD ────────────────────────────────────────
 * Because the lookup is keyed by content hash and a duplicate's hash is the KEEPER's hash, which
 * `planChatPhotoAddWrite`'s own header says may legitimately be NULL ("a keeper that never had a
 * hash keeps this row hash-less"). An add we have positive proof is a duplicate would then produce
 * no notification, and the operator would get the generic `admin_chat_photo` push for a photograph
 * the collection already held — which is the exact defect R1 exists to close. The cross-table
 * lookup is still asked, at the call site, for the case this function cannot answer: a genuinely
 * new chat-photo row whose bytes live in `nina_avatars` or `run_photos`.
 *
 * `url` is `plan.blobUrl` and not a re-read: on both duplicate branches the plan has already
 * adopted the keeper's object, so that string IS the original's blob URL.
 */
function duplicateTargetFromPlan(
  plan: Pick<ChatPhotoAddPlan, 'blobUrl' | 'sourceAvatarId' | 'sourceImageId'>,
): ResolvedPhotoPointer | null {
  if (plan.sourceImageId != null) {
    return { kind: 'image', id: plan.sourceImageId, url: plan.blobUrl }
  }
  if (plan.sourceAvatarId != null) {
    return { kind: 'avatar', id: plan.sourceAvatarId, url: plan.blobUrl }
  }
  return null
}
```

**Impact:** none on its own — pure, unexported, no I/O.

---

### Step 3: ADD — suppress the generic push on a duplicate, send `duplicate_image` instead

**File:** `lib/admin/chatPhotoActions.ts:380-419` (the tail of `addChatPhotoAction`, from
`scheduleChatPhotoCaption(userId, image.id)` to `return { ok: true, id: image.id }`)

**Change:** Between the captioner and the push, resolve a duplicate pointer. Then the existing push
block becomes a two-armed branch. Everything above `scheduleChatPhotoCaption` — the claims
normalisation, the pinned re-read, the race door, `planChatPhotoAddWrite`, both inserts, the unwind
and the loser release — is **byte-for-byte unchanged**.

**Code:** replace lines 380-419 with

```ts
  scheduleChatPhotoCaption(userId, image.id)

  /* ── IS THIS PHOTOGRAPH ALREADY IN THE COLLECTION? (dup-image-push-notify R1) ───────────────
   * Two questions, asked in the order that makes the second one rare.
   *
   * FIRST, the plan. If `planChatPhotoAddWrite` wrote this row as a REFERENCE then the answer is
   * already in hand, exact, and free — see `duplicateTargetFromPlan`. That is also the only branch
   * that can answer for a keeper whose own `content_hash` is NULL.
   *
   * SECOND, and only for a genuinely fresh original, phase 1's cross-table finder: these bytes may
   * be sitting in `nina_avatars` or `run_photos`, which NO layer on this route has ever looked at.
   * `findNinaImageByContentHash` above already ruled out the chat table, so this is strictly the
   * new ground R1 asked for.
   *
   * ── THE EXCLUSION IS NOT OPTIONAL ──────────────────────────────────────────────────────────
   * The row we just inserted carries `plan.contentHash`, which on this branch IS `claimedHash`
   * (`planChatPhotoAddWrite`'s keeper-less return copies the claim through). Without the exclusion
   * every fresh add would find itself and announce that it is a duplicate of itself.
   *
   * ── NO HASH, NO QUESTION ───────────────────────────────────────────────────────────────────
   * Invariant 9, the same reading the race door at :291 takes: a malformed or absent claim is a
   * NULL and a proceed. There is nothing to look up and the add is not refused.
   */
  let duplicate = duplicateTargetFromPlan(plan)
  if (duplicate == null && claimedHash != null) {
    try {
      duplicate = await findGlobalDuplicatePhoto(userId, claimedHash, {
        exclude: { kind: 'image', id: image.id },
      })
    } catch (cause) {
      /* A detection failure is not an add failure. The photograph is in the collection and in the
       * conversation; the operator simply does not learn that it was already there. */
      console.warn('[dup] cross-table lookup failed on an admin add', {
        userId,
        imageId: image.id,
        error: String(cause),
      })
    }
  }

  /* ── AND TELL HIS PHONE ─────────────────────────────────────────────────────────────────────
   * The header of `scheduleChatPhotoCaption` below says the runner's screen picks a new bubble up
   * "on its next load or service-worker refresh". The refresh half was aspirational: the service
   * worker's `postMessage({type:'nina:new'})` fires only inside its `push` handler, and nothing
   * pushed for a photograph an operator added — so until this line the bubble arrived on the next
   * page load and no sooner. This is the push that makes that sentence true.
   *
   * ── EXACTLY ONE NOTIFICATION, AND WHICH ONE DEPENDS ON THE ANSWER ABOVE ────────────────────
   * dup-image-push-notify's ruling: *"send a push notification... if duplicate"* reads as ONE
   * dedicated notification per event, not two. So `admin_chat_photo` — which fired on every add
   * including duplicates, and could not tell the operator which it was — is SUPPRESSED on a hit and
   * `duplicate_image` takes its place, pointing at the photograph that was already there. On a
   * genuine new add nothing about this line has changed: same kind, same body, same array.
   *
   * ── IT IS PAST EVERY REFUSAL, AND THAT IS THE WHOLE GUARD ──────────────────────────────────
   * A vanished pinned row (:275), a file outside her photo folder (:284), an unowned session
   * (:320) and an image that could not be attached (:351) all `return` above this line, and the
   * last of them DELETES the bubble it wrote. There is no fifth condition to test here: reaching
   * this statement is the proof that a message row and an image row are both committed, which is
   * also why it is here rather than beside the insert — a notification that opens a chat showing
   * a caption above an empty frame is worse than no notification.
   *
   * ── `body`, NOT `message.body` ─────────────────────────────────────────────────────────────
   * The same string the row was written with, by construction. See the `const` at :303.
   *
   * ── IT NEVER FAILS THE ADD (plan invariant 2) ──────────────────────────────────────────────
   * `proactive.ts:611-615`'s shape, and both notifiers already swallow everything a push can do
   * wrong — no VAPID, no subscriptions, a dead endpoint, a 500 from Apple. This `try` is the belt
   * to that brace: the photograph is in the collection and in the conversation whatever happens
   * next, and an operator must never see "The photo could not be attached" because a phone was
   * unreachable.
   */
  try {
    if (duplicate != null) {
      await notifyDuplicateImagePush(userId, duplicate)
    } else {
      await notifyNinaPush(userId, [{ id: message.id, body }], 'admin_chat_photo')
    }
  } catch (cause) {
    console.warn('[push] admin chat photo notify failed', {
      userId,
      messageId: message.id,
      imageId: image.id,
      duplicateOf: duplicate?.id ?? null,
      error: String(cause),
    })
  }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: image.id }
}
```

**Impact:** `addChatPhotoAction`'s return value and every refusal are unchanged. The only behavioural
delta is *which* push fires on the duplicate branch — and that branch previously fired
`admin_chat_photo`, which is precisely what the Decisions row in the index says to suppress. A fresh
add with no cross-table hit is bit-identical to today.

---

### Step 4: REPLACE — detect a duplicate and say so; replace regardless

**File:** `lib/admin/chatPhotoActions.ts:148-205` (whole of `replaceChatPhotoAction`)

**Change:** Hoist the hash normalisation out of the `updateNinaChatPhotoBlob` argument (it is needed
twice now), and add a lookup + notify after the row is committed. **The replace itself is not
gated on the answer**: its contract is "swap the bytes behind THIS row" and
`components/admin/explorer/chatPhotoUpload.ts:155-161` states why a deduped replace would be wrong
(it would point the row at another row's object and strip its provenance to a reference, hiding the
photograph the operator can see). The notification here is purely informational.

**Code:** replace lines 148-205 with

```ts
export async function replaceChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoReplaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { id, blobUrl, pathname, width, height, bytes, contentHash } = parsed.data

  if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (isChatPhotoReference(existing)) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Replace the original instead.',
    }
  }

  /* media-dedupe P3, invariant 4. A byte swap MUST move the hash with it: the same trust class
   * as every other claim this action accepts (the bytes themselves are a claim). No claim or a
   * malformed one retracts the column to NULL — dedup goes quiet for this row, which is the
   * honest answer for bytes nothing has hashed yet.
   *
   * Hoisted out of the call below since dup-image-push-notify: the duplicate check at the bottom
   * needs the same normalised value, and normalising twice is two places for one policy to live. */
  const claimedHash = isValidContentHash(contentHash) ? contentHash : null

  const updated = await updateNinaChatPhotoBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
    contentHash: claimedHash,
  })
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  let note: string | undefined
  if (existing.pathname !== pathname) {
    const outcome = await releaseBlobIfUnreferenced(userId, existing)
    if (outcome === 'shared') note = 'The old file is still used elsewhere, so it was kept.'
  }

  /*
   * Replace re-captions too, and that falls out of the shared scheduler rather than being designed:
   * the statement nulls `description` in the same breath as it repoints the row (see
   * `updateNinaChatPhotoBlob`), so the pass below earns a fresh description for the NEW bytes and
   * then writes a caption from it — which is the right answer, since a caption about the old
   * picture is exactly the stale-prose failure that null exists to prevent.
   *
   * What is NOT designed for: the bubble keeps whatever text it had until the new caption lands,
   * and if the caption call fails it keeps a caption about a photograph that is gone. That is
   * strictly better than today (where it keeps it forever) and strictly worse than nulling the text
   * too — which cannot be done, because `nina_messages.text` is NOT NULL and an empty bubble is not
   * a message. Deciding what a replaced photograph's bubble should say in the gap is its own card.
   */
  scheduleChatPhotoCaption(userId, id)

  /* ── THE NEW BYTES MAY ALREADY BE IN THE COLLECTION (dup-image-push-notify R1) ──────────────
   * Until this phase, `contentHash` on this route was a claim that got WRITTEN and never READ:
   * round-tripped onto the row and compared against nothing (the analysis's Entry Point 3 — "not
   * even detected"). This is the one line that makes it answer a question.
   *
   * ── AND THE REPLACE STILL HAPPENS, WHICH IS THE WHOLE POINT OF ITS POSITION ─────────────────
   * Below the write, below the release, below the captioner. Replace's contract is "swap the bytes
   * behind THIS row"; `chatPhotoUpload.ts:155-161` argues at length why a deduped replace would be
   * a defect (it would repoint the row at another row's object and strip its provenance to a
   * reference, which the collection reads then hide — the photograph the operator can SEE would
   * vanish from the Media folder). So nothing here skips, references or unwinds. The operator is
   * merely TOLD, and the notification opens the copy that was already there.
   *
   * The exclusion is this row: it now carries `claimedHash` itself, by the statement six lines up.
   * Without it every replace would report itself as its own duplicate.
   */
  if (claimedHash != null) {
    try {
      const duplicate = await findGlobalDuplicatePhoto(userId, claimedHash, {
        exclude: { kind: 'image', id },
      })
      if (duplicate != null) await notifyDuplicateImagePush(userId, duplicate)
    } catch (cause) {
      /* Invariant: a notification never fails the write it is attached to. The bytes are swapped
       * and the row is committed whatever a lookup or a phone does next. */
      console.warn('[dup] replace duplicate check failed', { userId, id, error: String(cause) })
    }
  }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id, ...(note === undefined ? {} : { note }) }
}
```

**Impact:** Replace's result shape, refusals, blob release and captioner are unchanged. It gains one
indexed lookup on the path where a hash was claimed (`MediaReplace` always claims one — the client
computes it unconditionally in `uploadChatPhoto`), and it can now buzz the phone. That contradicts
the *comment* on `tests/admin.chatPhotos.test.ts:908-919` ("the actions that mint no message
announce nothing"); the assertion there is on `notifyNinaPush` specifically and stays green, but the
prose must be narrowed — Step 7.

---

### Step 5: The avatar batch — client hash, schema field, insert threading

#### 5a. `components/admin/explorer/useFolderUpload.ts:134-240` — hash the file

**Change:** `uploadOne` computes `contentHashOf(file)` and puts it on the record. The avatar path
PUTs the picked file **unmodified** (unlike the chat-photo path, which re-encodes), so the file's own
bytes ARE the stored bytes and `contentHashOf(file)` satisfies the column's contract exactly.

Add the import beside the existing ones (after `import { newId } from '@/lib/id'`, `:19`):

```ts
import { contentHashOf } from '@/lib/photos/contentHash'
```

`lib/photos/contentHash.ts` imports nothing at all (its own header makes that a hard constraint), so
this costs the `/admin/nina` browser bundle nothing — the same reason
`components/admin/explorer/chatPhotoUpload.ts:7` already imports it client-side.

**Code:** replace the `uploadOne` callback body (`:134-240`) with

```ts
  const uploadOne = useCallback(
    async (
      gesture: number,
      planned: PlannedUpload<WalkedFile>,
    ): Promise<AvatarBatchRecord | null> => {
      const file = planned.source.file
      const fail = (message: string): null => {
        patch(gesture, planned.sourceKey, { state: 'error', error: message })
        return null
      }

      /*
       * `planned.contentType` and `planned.ext` come off the plan and are guaranteed to agree with
       * each other (phase 2's `classifyFile` derives the extension from the CONTENT TYPE, never
       * from the filename, so a blob called `.png` cannot hold a JPEG). Nothing is re-classified
       * here — the draft called `uploadableContentType` a second time, which was a second answer to
       * a question the plan had already answered.
       *
       * `extForContentType` is still called, on the content type rather than on the name, as the
       * one assertion that this phase and `lib/admin/avatars.ts` agree about the mapping: it is
       * typed `AdminAvatarExt`, so this line is where a divergence between phase 2's union and
       * `ADMIN_AVATAR_EXTS` becomes a build error instead of a bad pathname.
       */
      const contentType = planned.contentType
      const ext = extForContentType(contentType)
      if (ext == null) return fail('Not a JPEG, PNG or WebP.')

      patch(gesture, planned.sourceKey, { state: 'thumbnailing' })
      let measured
      try {
        measured = await measureAndThumbnail(file)
      } catch {
        return fail('That file did not decode as an image.')
      }
      if (Math.min(measured.width, measured.height) < ADMIN_AVATAR_MIN_EDGE_PX) {
        // The same refusal `UploadAvatar.tsx:81-86` made, for the same reason: below this the
        // circular frame cannot be zoomed at all without visible mush. It cannot be decided by
        // `planFolderUpload`, which has no pixels — only a decode knows.
        return fail(
          `Too small to frame — the short edge is ${Math.min(measured.width, measured.height)} px.`,
        )
      }

      /*
       * ── THE CONTENT HASH (dup-image-push-notify R1) ──────────────────────────────────────────
       * Over the PICKED FILE, not over a re-encode, and that is the whole reason this is one line
       * here and a paragraph in `chatPhotoUpload.ts`: this path PUTs `file` itself, so the file's
       * bytes ARE the bytes the row's `blob_url` will serve — which is exactly what
       * `content_hash`'s contract says the column means.
       *
       * The album's dedupe key is and stays `source_key` (path + size + mtime). This hash does NOT
       * decide anything about whether a row lands: it is carried so the SERVER can ask phase 1's
       * cross-table finder whether these bytes are already somewhere in the collection, and tell
       * the operator. Two files with identical bytes under two folder paths are still two rows,
       * deliberately (`useFolderUpload`'s own note: *"a photo's location in the tree is information
       * the operator put there on purpose"*).
       *
       * ── A HASH THAT CANNOT BE COMPUTED IS `null`, NEVER A FAILED UPLOAD ─────────────────────
       * Invariant 9, and `chatPhotoUpload.ts:174`'s `.catch(() => null)` is the precedent in this
       * very folder. `crypto.subtle` can be absent (an insecure origin) and the read can fail (a
       * file moved out from under the picker between the walk and this line). Neither is a reason
       * to lose an upload that measured fine, so the record registers hash-less and the cross-table
       * check simply goes quiet for that row. The Zod field is `nullish` for the same reason.
       */
      const contentHash = await contentHashOf(file).catch(() => null)

      patch(gesture, planned.sourceKey, { state: 'uploading' })
      const id = newId()
      let original
      try {
        original = await upload(adminAvatarPathname(userId, id, ext), file, {
          access: 'public',
          contentType,
          handleUploadUrl: '/api/admin/nina/upload',
          clientPayload: JSON.stringify({ contentType }),
        })
      } catch (cause) {
        return fail(cause instanceof Error ? cause.message : 'That upload failed.')
      }

      /*
       * The thumbnail is a SECOND blob under the SAME id: `avatar-<id>.<ext>` and
       * `thumb-<id>.jpg`. A failure here is not a failure of the upload — `thumbUrl` is nullable
       * and the grid falls back to the original, which is exactly what every pre-phase-1 row does.
       */
      let thumbUrl: string | null = null
      let thumbPathname: string | null = null
      if (measured.thumb != null) {
        try {
          /*
           * `'jpg'` is the THIRD argument and is required: the Route Handler cross-checks the
           * pathname's extension against the `contentType` declared below, and a mismatch is a
           * 400. `EXPLORER_THUMB_CONTENT_TYPE` is `image/jpeg`, so the extension is `jpg`.
           */
          const thumb = await upload(adminAvatarThumbPathname(userId, id, 'jpg'), measured.thumb, {
            access: 'public',
            contentType: EXPLORER_THUMB_CONTENT_TYPE,
            handleUploadUrl: '/api/admin/nina/upload',
            clientPayload: JSON.stringify({ contentType: EXPLORER_THUMB_CONTENT_TYPE }),
          })
          thumbUrl = thumb.url
          thumbPathname = thumb.pathname
        } catch (cause) {
          console.warn('[f33] thumbnail upload failed; the grid will load the original', cause)
        }
      }

      /*
       * `thumb` is ONE nullable object and not two nullable fields, which is phase 4's schema
       * shape and is better than the draft's flat pair: "has a thumbnail" becomes one question
       * instead of two fields that can disagree about it.
       */
      return {
        blobUrl: original.url,
        pathname: original.pathname,
        contentType,
        width: measured.width,
        height: measured.height,
        bytes: file.size,
        folder: planned.folder,
        filename: planned.filename,
        sourceKey: planned.sourceKey,
        contentHash,
        thumb:
          thumbUrl == null || thumbPathname == null
            ? null
            : { url: thumbUrl, pathname: thumbPathname },
      }
    },
    [patch, userId],
  )
```

**Impact:** One extra whole-file read per uploaded file, inside the four-lane queue. Memory cost is
bounded by the existing decode (a decoded bitmap already dominates). Per-file failure semantics are
unchanged: nothing here can `fail()`.

#### 5b. `lib/admin/schema.ts:361-373` — carry the claim

**Change:** one field on `avatarBatchRecordSchema`. **Shape-only and `nullish`**, matching
`chatPhotoContentHash` (`lib/admin/chatPhotoSchema.ts:56`) exactly, for that constant's own stated
reason: the FORMAT is validated in the action with `isValidContentHash`, because invariant 9 makes a
malformed hash a NULL and a proceed, never a refused record. `nullish` rather than `optional` because
the client sends an explicit `null` when hashing failed, and because absence must keep working —
`tests/admin.avatars.test.ts:217-232`'s fixture has no such key and must stay valid.

**Code:** replace lines 361-373 with

```ts
const avatarBatchRecordSchema = z.object({
  folder: folderPathSchema,
  filename: albumFilenameSchema,
  sourceKey: sourceKeySchema,
  blobUrl: z.url().refine((value) => value.startsWith('https://'), 'Blob URLs are https'),
  pathname: z.string().min(1).max(512),
  contentType: z.enum(ADMIN_AVATAR_CONTENT_TYPES),
  width: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  height: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  bytes: z.number().int().positive().max(ADMIN_AVATAR_MAX_UPLOAD_BYTES),
  /**
   * dup-image-push-notify R1. sha-256 over the bytes this record's object holds — the picked file
   * itself, since this path PUTs it unmodified.
   *
   * SHAPE only, and `nullish`, both deliberately. The FORMAT is validated in the action with
   * `isValidContentHash` because invariant 9 makes a malformed hash a NULL and a proceed, never a
   * refused batch — `chatPhotoContentHash` in `lib/admin/chatPhotoSchema.ts` is the same constant
   * for the same reason. `null` is what the client sends when `crypto.subtle` was unavailable or
   * the file could not be re-read; ABSENT is what every record written before this phase looks
   * like. Both have to mean "no claim", so both are accepted.
   *
   * It is NOT the album's dedupe key and must never become one: `sourceKey` and its unique index
   * decide what lands, and two identical files under two folder paths are two rows on purpose.
   */
  contentHash: z.string().min(1).max(128).nullish(),
  thumb: avatarThumbSchema.nullable(),
})
export type AvatarBatchRecord = z.infer<typeof avatarBatchRecordSchema>
```

**Impact:** `AvatarBatchRecord` gains `contentHash?: string | null`. Purely additive — every existing
fixture and every existing producer still parses.

#### 5c. `lib/nina/queries/shapes.ts:424-437` — the insert shape

**Code:** replace lines 424-437 with

```ts
export interface NinaAvatarBatchInsert {
  blobUrl: string
  pathname: string
  source: NinaAvatarSource
  folder: string
  filename: string | null
  sourceKey: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  thumbUrl?: string | null
  thumbPathname?: string | null
  description?: string | null
  /**
   * dup-image-push-notify R1. sha-256 over the bytes `blobUrl` serves, or `null` when nobody has
   * hashed them — which is every row written before that phase, and any row whose client could not
   * compute one.
   *
   * OPTIONAL, unlike `sourceKey`, and the difference is the whole design: `sourceKey` is required
   * because a NULL there would silently opt a row out of the unique index that protects the album,
   * whereas this column decides nothing. It is read only by the cross-table duplicate finder, which
   * treats a NULL as "this row cannot answer" — so the second writer of this shape,
   * `setChatPhotoAsAvatarAction`, needs no edit and keeps writing rows without one.
   */
  contentHash?: string | null
}
```

#### 5d. `lib/nina/queries/avatars.ts` — write the column

> **Line numbers.** `:598-620` was read at the BASE commit and is the one anchor in this plan that
> phase 1 moves: phase 1 inserts `findNinaAvatarByContentHash` after `getNinaAvatarBySourceKey`
> (~`:256`), pushing `insertNinaAvatars` down by roughly 45 lines. **Locate the function by name,
> never by line**, and do not touch this file's `drizzle-orm` import line — phase 1 rewrites it in
> full. (Stated in the Files section too; repeated here because this is the step that acts on it.)

**Code:** replace the `return db.insert(...)` expression at the tail of `insertNinaAvatars` with

```ts
  return db
    .insert(ninaAvatars)
    .values(
      inputs.map((input) => ({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        folder: input.folder,
        filename: input.filename,
        sourceKey: input.sourceKey,
        thumbUrl: input.thumbUrl ?? null,
        thumbPathname: input.thumbPathname ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        /* dup-image-push-notify R1, phase 1's column. `?? null` and not a conditional spread: an
         * absent claim and an explicit null are the same fact, and the column is nullable. It takes
         * no part in `onConflictDoNothing` below — `(user_id, source_key)` is still the only key
         * this statement conflicts on. */
        contentHash: input.contentHash ?? null,
        isCurrent: false,
      })),
    )
    .onConflictDoNothing({ target: [ninaAvatars.userId, ninaAvatars.sourceKey] })
    .returning(avatarColumns)
```

**Impact:** `insertNinaAvatars` writes one more column. `avatarColumns` is unchanged, so the returned
`NinaAvatarRow` shape does not move and no consumer of it needs an edit.

---

### Step 6: `registerNinaAvatarsAction` — thread the hash and scan for duplicates after the response

**File:** `lib/admin/ninaAlbumUploadActions.ts` — imports at `:1-20`, action body at `:125-196`, new
private scheduler at the end of the file.

**Change (imports):** replace lines 1-20 with

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { scheduleDescribe } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  albumManifestSchema,
  avatarBatchRegisterSchema,
  type AvatarBatchRecord,
} from '@/lib/admin/schema'
import { NINA_ADMIN_MANIFEST_MAX } from '@/lib/nina/album'
import {
  declareNinaFolders,
  getCurrentNinaAvatar,
  insertNinaAvatars,
  listNinaAvatarManifest,
  setCurrentNinaAvatar,
} from '@/lib/nina/queries'
import { isValidContentHash } from '@/lib/photos/contentHash'
import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'
import { notifyDuplicateImagePush } from '@/lib/push/duplicateImage'
```

**Change (action body):** replace lines 162-196 (from `const rows = await insertNinaAvatars(` to the
closing `}` of the function) with

```ts
  const rows = await insertNinaAvatars(
    userId,
    records.map((record) => ({
      blobUrl: record.blobUrl,
      pathname: record.pathname,
      source: 'admin' as const,
      folder: record.folder,
      filename: record.filename,
      sourceKey: record.sourceKey,
      width: record.width,
      height: record.height,
      bytes: record.bytes,
      thumbUrl: record.thumb?.url ?? null,
      thumbPathname: record.thumb?.pathname ?? null,
      /* dup-image-push-notify R1. The FORMAT gate is here and not in Zod — invariant 9's division,
       * stated at `avatarBatchRecordSchema`: a malformed claim is a NULL and a proceed, never a
       * refused batch. A record that loses its hash this way simply cannot answer the duplicate
       * question, which is the honest outcome for a claim that is not one of ours. */
      contentHash: isValidContentHash(record.contentHash) ? record.contentHash : null,
    })),
  )

  const first = rows[0]
  if (!hadCurrent && first != null) {
    await setCurrentNinaAvatar(userId, first.id)
    scheduleDescribe(userId, first.id)
  }

  revalidatePath('/admin/nina')

  const keyByPathname = new Map(records.map((record) => [record.pathname, record.sourceKey]))

  /*
   * The cross-table duplicate question, asked about the rows that ACTUALLY landed.
   *
   * `rows` is `RETURNING` after `ON CONFLICT DO NOTHING`, so a re-dropped folder produces an empty
   * array and this costs nothing at all — which is the common case and the reason the scan is
   * keyed off `rows` rather than off `records`.
   *
   * The hash is carried across by PATHNAME, the same join `keyByPathname` above already uses and
   * for the same stated reason: `avatarColumns` does not project `source_key` (or `content_hash`),
   * `addRandomSuffix: true` plus `allowOverwrite: false` make the stored pathname unique per
   * object, and array position after a conflict-skipping `RETURNING` is not a promise worth
   * depending on.
   */
  const hashByPathname = new Map(
    records.flatMap((record) =>
      isValidContentHash(record.contentHash) ? [[record.pathname, record.contentHash]] : [],
    ),
  )
  scheduleAvatarDuplicateScan(
    userId,
    rows.flatMap((row) => {
      const contentHash = hashByPathname.get(row.pathname)
      return contentHash == null ? [] : [{ id: row.id, contentHash }]
    }),
  )

  return {
    ok: true,
    inserted: rows.flatMap((row) => {
      const sourceKey = keyByPathname.get(row.pathname)
      return sourceKey == null ? [] : [{ sourceKey, id: row.id }]
    }),
    skipped: submitted - rows.length,
  }
}
```

**Change (new private scheduler):** append at the end of the file, after
`listNinaAlbumManifestAction`.

```ts
/**
 * **Did any of the photographs that just landed already exist somewhere else in the collection?**
 * — asked AFTER the response has gone out. Not exported: a `'use server'` module may export only
 * async functions, and this is a synchronous scheduler (`scheduleChatPhotoCaption` and
 * `scheduleDescribe` are the two precedents, and this follows both).
 *
 * ── WHY `after()` AND NOT INLINE ────────────────────────────────────────────────────────────
 * A chunk is up to `NINA_ADMIN_BATCH_MAX` (50) records and the finder reads three tables, so an
 * inline scan would put up to 150 round trips on a Server Action that Next dispatches ONE AT A TIME
 * PER CLIENT — turning a 300-file drop's bookkeeping into the stall the batching exists to prevent.
 * Nothing downstream waits on the answer: the rows are committed, the grid is revalidated, and a
 * notification is informational. This is the same trade `scheduleDescribe` makes two functions up.
 *
 * ── ONE PUSH PER BATCH, NOT ONE PER HIT ─────────────────────────────────────────────────────
 * **RATIFIED by the reconciler in round 1**, and the plan index's Scope bullet was rewritten to
 * match rather than this cap being removed: the index's Invariants say nothing about push
 * cardinality, so the wording that read "exactly once per detected duplicate" was a Scope sentence
 * and not a rule, and the surrounding convention outranked it — every notification this app sends
 * shares one `PUSH_NOTIFICATION_TAG = 'nina'`, so N sends already collapse to ONE visible
 * notification in the tray. Sending fifty is therefore not fifty times the signal; it is fifty
 * web-push round trips to redraw one notification — and a phone the operator turns push off on,
 * which would cost R1 every OTHER route as well. Phase 1's own handoff anticipated this and named
 * this exact remedy ("notify once per batch with a count — a phase-4 decision").
 *
 * A folder drop is the one upload route in this app that submits FIFTY images in a single gesture,
 * and a re-organised library (the same photographs under a new folder tree) is exactly the drop
 * that makes every one of them a cross-table hit. The other four routes accept one image per
 * gesture and keep one push per detected duplicate, so the index's wording and this cap agree
 * everywhere except here.
 *
 * The scan still visits every row, so the log line carries the true count — the operator who wants
 * the full list has it, and a later card could turn the count into a `/admin` panel without
 * changing what buzzes.
 *
 * ── IT NEVER FAILS THE REGISTER ─────────────────────────────────────────────────────────────
 * `after()` turns a rejection into a log line, and the rows are committed before this runs. The
 * inner try/catch is the belt to that brace, per-row, so one unreadable row cannot cost the other
 * forty-nine their check.
 *
 * An empty `candidates` array returns without scheduling anything — the common case (a re-dropped
 * folder inserts no rows), and there is no point paying for an `after()` callback to do nothing.
 */
function scheduleAvatarDuplicateScan(
  userId: string,
  candidates: readonly { id: string; contentHash: string }[],
): void {
  if (candidates.length === 0) return

  /*
   * ── THE EXCLUSION IS THE WHOLE CHUNK, NOT JUST THE ROW ASKING ──────────────────────────────
   * Reconciler ruling, round 1. Without any exclusion every new avatar is its own duplicate — it
   * was inserted with this very hash moments ago. But excluding only the asking row is not enough
   * either: ONE folder drop is up to fifty files and a re-organised library routinely contains the
   * same picture twice under two paths. Both land (the `source_key`s differ, deliberately), and a
   * per-row exclusion then makes each of them find the OTHER and report a photograph this same
   * gesture created. "Already" means before this drop. Phase 1's `exclude` takes a list for exactly
   * this; it is built once, outside the loop, because it is the same list for every candidate.
   */
  const exclude = candidates.map((candidate) => ({ kind: 'avatar' as const, id: candidate.id }))

  after(async () => {
    let hits = 0
    for (const candidate of candidates) {
      try {
        const duplicate = await findGlobalDuplicatePhoto(userId, candidate.contentHash, {
          exclude,
        })
        if (duplicate == null) continue
        hits += 1
        /* The FIRST hit buzzes; the rest are counted. See the header. */
        if (hits === 1) await notifyDuplicateImagePush(userId, duplicate)
      } catch (cause) {
        console.warn('[dup] avatar duplicate check failed for one row', {
          userId,
          avatarId: candidate.id,
          error: String(cause),
        })
      }
    }
    if (hits > 0) {
      console.info('[dup] folder upload landed photos the collection already had', {
        userId,
        scanned: candidates.length,
        hits,
        notified: 1,
      })
    }
  })
}
```

**Impact:** `registerNinaAvatarsAction`'s result shape, its counts, the `source_key` conflict
mechanism, the `is_current` promotion and `declareNinaFolders` are all unchanged; the action's
response time is unchanged (the scan is post-response). New behaviour: up to one `duplicate_image`
push per register chunk.

---

### Step 7: Tests

#### 7a. `tests/admin.chatPhotos.test.ts` — mocks, then cases

**File:** `tests/admin.chatPhotos.test.ts:391-463` (the mock block), `:824-920` (the push describe).

**Change (mocks):** add two spies beside the existing ones at `:405` and two `vi.mock` factories
after the `@/lib/push/send` factory at `:463`. Both new modules must be mocked for the reason that
block's own header gives: `@/lib/photos/globalDuplicate` imports `db`, and
`@/lib/push/duplicateImage` reaches `web-push`/`pushEnv()`.

```ts
const notifyNinaPush = vi.fn()
const findGlobalDuplicatePhoto = vi.fn()
const notifyDuplicateImagePush = vi.fn()
```

```ts
/**
 * Phase 1's two seams. Mocked for the same two reasons the push module above is: the finder opens
 * a database connection and the notifier reaches a push service, and plan invariant 7 forbids both
 * in this suite. `findGlobalDuplicatePhoto` resolves `null` by default in `beforeEach`, so every
 * pre-existing case in this file keeps today's behaviour exactly — a miss is a normal add.
 */
vi.mock('@/lib/photos/globalDuplicate', () => ({
  findGlobalDuplicatePhoto: (...args: unknown[]) => findGlobalDuplicatePhoto(...args),
}))
vi.mock('@/lib/push/duplicateImage', () => ({
  notifyDuplicateImagePush: (...args: unknown[]) => notifyDuplicateImagePush(...args),
}))
```

In the file's `beforeEach`, alongside the other default resolutions, add:

```ts
    findGlobalDuplicatePhoto.mockResolvedValue(null)
    notifyDuplicateImagePush.mockResolvedValue(undefined)
```

**Change (the misleading docstring at `:908-919`):** the case is still correct and still passes — it
asserts `notifyNinaPush`, and a duplicate push goes through the other module — but its prose now
claims more than the code does. Replace the case with:

```ts
  it('the actions that mint no message send no CHAT-BUBBLE push', async () => {
    // Replace swaps the bytes behind a bubble that already exists and Edit rewrites a paragraph on
    // the photograph; neither is Nina saying anything new, so neither may announce a bubble. ADD is
    // the only writer of a `nina_messages` row on this surface and that is why it is the only
    // `admin_chat_photo` site.
    //
    // Since dup-image-push-notify, Replace CAN buzz the phone — with `duplicate_image`, which
    // announces a photograph that was already in the collection rather than a new bubble. That is a
    // different kind through a different module, and the case below asserts it.
    await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })
    await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: 'She is sitting on a kerb in low orange light, a bottle in one hand.',
    })

    expect(notifyNinaPush).not.toHaveBeenCalled()
  })
```

**Change (new cases):** append a new `describe` after the push block at `:920`.

```ts
/**
 * **The cross-table duplicate push (dup-image-push-notify R1).** Three tables hold images and no
 * admin route had ever looked past its own; these cases are the seam where that changes.
 *
 * The two arms are asserted as an EXCLUSIVE OR on every case, because "exactly one notification per
 * event" is the whole ruling: an add that announces both would be the two-notification outcome the
 * Decisions table rejected, and an add that announces neither is a silent duplicate.
 */
describe('the admin routes announce a photograph the collection already had', () => {
  const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  const AVATAR_HIT = {
    kind: 'avatar' as const,
    id: 'ava123XYZ_-9',
    url: `${STORE}/nina/${USER}/avatar-ava123XYZ_-9-suffix.jpg`,
  }

  it('ADD: a fresh original whose bytes live in the avatar album pushes duplicate_image, not admin_chat_photo', async () => {
    findGlobalDuplicatePhoto.mockResolvedValue(AVATAR_HIT)

    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(notifyDuplicateImagePush).toHaveBeenCalledWith(USER, AVATAR_HIT)
    expect(notifyNinaPush).not.toHaveBeenCalled()
  })

  it('ADD: the row it just inserted is EXCLUDED from the lookup, or every add is its own duplicate', async () => {
    await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(findGlobalDuplicatePhoto).toHaveBeenCalledWith(USER, HASH, {
      exclude: { kind: 'image', id: IMAGE_ID },
    })
  })

  it('ADD: an in-collection duplicate is read off the PLAN, with no second lookup, even when the keeper has no hash', async () => {
    // The pre-check path. The keeper's own `content_hash` is NULL — the case a hash lookup cannot
    // answer and the plan can — and it is itself a reference, so the pointer must name the ORIGINAL
    // it re-shows rather than the row that was pinned.
    getNinaMessageImage.mockResolvedValue({
      ...imageRow,
      id: 'keep123XYZ_9',
      contentHash: null,
      sourceImageId: 'origin12XYZ_',
    })

    const result = await actions.addChatPhotoAction({
      ...goodBlob,
      contentHash: HASH,
      duplicateOfId: 'keep123XYZ_9',
    })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(findGlobalDuplicatePhoto).not.toHaveBeenCalled()
    expect(notifyDuplicateImagePush).toHaveBeenCalledWith(USER, {
      kind: 'image',
      id: 'origin12XYZ_',
      url: imageRow.blobUrl,
    })
    expect(notifyNinaPush).not.toHaveBeenCalled()
  })

  it('ADD: a genuinely new photograph keeps today’s admin_chat_photo push, unchanged', async () => {
    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(notifyDuplicateImagePush).not.toHaveBeenCalled()
    expect(notifyNinaPush).toHaveBeenCalledTimes(1)
    const [, [inserted]] = insertNinaMessages.mock.calls[0] as [string, [{ body: string }], string]
    expect(notifyNinaPush).toHaveBeenCalledWith(
      USER,
      [{ id: MESSAGE_ID, body: inserted.body }],
      'admin_chat_photo',
    )
  })

  it('ADD: a lookup that throws never fails the add, and the bubble still announces itself', async () => {
    findGlobalDuplicatePhoto.mockRejectedValue(new Error('the replica is down'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(notifyNinaPush).toHaveBeenCalledTimes(1)
    consoleWarn.mockRestore()
  })

  it('ADD: no hash claim is no question — the finder is never asked (invariant 9)', async () => {
    await actions.addChatPhotoAction({ ...goodBlob, contentHash: 'not-a-hash' })

    expect(findGlobalDuplicatePhoto).not.toHaveBeenCalled()
    expect(notifyNinaPush).toHaveBeenCalledTimes(1)
  })

  it('REPLACE: announces the copy that was already there, and still replaces', async () => {
    findGlobalDuplicatePhoto.mockResolvedValue(AVATAR_HIT)

    const result = await actions.replaceChatPhotoAction({
      id: IMAGE_ID,
      ...goodBlob,
      contentHash: HASH,
    })

    expect(result).toMatchObject({ ok: true, id: IMAGE_ID })
    // The replace is NOT gated on the answer: the row was repointed at the new bytes regardless.
    expect(updateNinaChatPhotoBlob).toHaveBeenCalledWith(
      USER,
      IMAGE_ID,
      expect.objectContaining({ pathname: goodBlob.pathname, contentHash: HASH }),
    )
    expect(findGlobalDuplicatePhoto).toHaveBeenCalledWith(USER, HASH, {
      exclude: { kind: 'image', id: IMAGE_ID },
    })
    expect(notifyDuplicateImagePush).toHaveBeenCalledWith(USER, AVATAR_HIT)
  })

  it('REPLACE: a malformed hash claim is a NULL column and no lookup, never a refusal', async () => {
    const result = await actions.replaceChatPhotoAction({
      id: IMAGE_ID,
      ...goodBlob,
      contentHash: 'not-a-hash',
    })

    expect(result).toMatchObject({ ok: true, id: IMAGE_ID })
    expect(updateNinaChatPhotoBlob).toHaveBeenCalledWith(
      USER,
      IMAGE_ID,
      expect.objectContaining({ contentHash: null }),
    )
    expect(findGlobalDuplicatePhoto).not.toHaveBeenCalled()
    expect(notifyDuplicateImagePush).not.toHaveBeenCalled()
  })

  it('REPLACE: a failed notification never fails the replace', async () => {
    findGlobalDuplicatePhoto.mockResolvedValue(AVATAR_HIT)
    notifyDuplicateImagePush.mockRejectedValue(new Error('APNs is having a day'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await actions.replaceChatPhotoAction({
      id: IMAGE_ID,
      ...goodBlob,
      contentHash: HASH,
    })

    expect(result).toMatchObject({ ok: true, id: IMAGE_ID })
    expect(revalidatePath).toHaveBeenCalledWith(ADMIN_CHAT_PHOTOS_PATH)
    consoleWarn.mockRestore()
  })
})
```

> Implementer's note: `STORE`, `USER`, `goodBlob`, `imageRow`, `IMAGE_ID`, `MESSAGE_ID` and
> `ADMIN_CHAT_PHOTOS_PATH` are all already in scope in this file (`:372-480` and the import block).
> `updateNinaChatPhotoBlob` must resolve a truthy row in `beforeEach` for the Replace cases — it
> already does for the existing `'replaceChatPhotoAction schedules the same captioner'` block at
> `:648`; reuse that same default.

#### 7b. `components/admin/explorer/useFolderUpload.test.tsx` — mock the hash, assert it rides along

**Why a mock rather than a real hash:** the suite's `walkedFile` fixture builds `file` as
`{ size: 1000 } as unknown as File` (`:70`) — not a real `Blob` — so a real `contentHashOf` would
reject inside `crypto.subtle.digest`. That is *correct* behaviour (the `.catch(() => null)` absorbs
it and the record registers hash-less), but it would make every case exercise only the null arm and
would couple the suite to whether happy-dom exposes `crypto.subtle`. Mocking the one function gives
both arms deterministically.

**Change:** add after the `./dropWalk` factory at `:27`

```ts
vi.mock('@/lib/photos/contentHash', () => ({
  contentHashOf: (...args: unknown[]) => contentHashOfMock(...args),
}))
```

and beside the other handles at `:33-37`

```ts
const contentHashOfMock = vi.fn()
const FILE_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
```

> `contentHashOfMock` must be declared with `vi.hoisted` or simply above the `vi.mock` call in a way
> the hoisted factory can close over — follow this file's existing pattern for `uploadMock` (it
> resolves the mocked module after the factory), or use
> `const { contentHashOfMock } = vi.hoisted(() => ({ contentHashOfMock: vi.fn() }))` as
> `tests/admin.chatPhotos.test.ts:385-389` does for its hoisted class.

In `beforeEach` (`:112-118`) add:

```ts
  contentHashOfMock.mockResolvedValue(FILE_HASH)
```

**New cases**, appended to the `'useFolderUpload — one file through the lanes'` describe:

```ts
  it('hashes the PICKED FILE — the bytes it PUTs — and carries the hash on the record', async () => {
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))

    // The file itself, not a re-encode: this path uploads `file` unmodified, so the file's bytes
    // ARE the bytes the row's blob_url will serve.
    const [hashed] = contentHashOfMock.mock.calls[0] as [unknown]
    const [, putBody] = uploadMock.mock.calls[0]!
    expect(hashed).toBe(putBody)

    const arg = registerMock.mock.calls[0]![0] as { records: Array<{ contentHash: unknown }> }
    expect(arg.records[0]!.contentHash).toBe(FILE_HASH)
  })

  it('a hash that cannot be computed is a null on the record, never a lost upload', async () => {
    contentHashOfMock.mockRejectedValue(new Error('no crypto.subtle on this origin'))
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))

    expect(result.current.items[0]?.state).toBe('done')
    expect(uploadMock).toHaveBeenCalled()
    const arg = registerMock.mock.calls[0]![0] as { records: Array<{ contentHash: unknown }> }
    expect(arg.records[0]!.contentHash).toBeNull()
  })
```

The existing `'registers in the envelope shape'` case at `:311` uses `toMatchObject` on the record
and `Object.keys` on the **envelope** only, so it stays green with no edit.

#### 7c. `tests/admin.albumUploadActions.test.ts` — NEW

The first behavioural test for `registerNinaAvatarsAction`. Mock every seam the module reaches:

```ts
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({
  // Captured, not executed — the point is that the register does NOT wait for the scan.
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/admin/ninaAlbumDeferredDescribe', () => ({ scheduleDescribe: vi.fn() }))
vi.mock('@/lib/nina/queries', () => ({
  declareNinaFolders: (...a: unknown[]) => declareNinaFolders(...a),
  getCurrentNinaAvatar: (...a: unknown[]) => getCurrentNinaAvatar(...a),
  insertNinaAvatars: (...a: unknown[]) => insertNinaAvatars(...a),
  listNinaAvatarManifest: vi.fn(),
  setCurrentNinaAvatar: vi.fn(),
}))
vi.mock('@/lib/photos/globalDuplicate', () => ({
  findGlobalDuplicatePhoto: (...a: unknown[]) => findGlobalDuplicatePhoto(...a),
}))
vi.mock('@/lib/push/duplicateImage', () => ({
  notifyDuplicateImagePush: (...a: unknown[]) => notifyDuplicateImagePush(...a),
}))
```

Cases to write (each one a named failure mode, not a coverage tick):

1. **`a valid hash claim reaches the insert; a malformed one is NULLed there, not refused`** — submit
   two records, one with `HASH` and one with `'not-a-hash'`; assert `insertNinaAvatars` was called
   with `contentHash: HASH` and `contentHash: null` respectively, and that the result is
   `{ ok: true, ... }` with `skipped: 0`.
2. **`a record with no hash at all still registers`** — omit the key entirely; assert
   `contentHash: null` on the insert and `ok: true` (this is every pre-phase-4 client).
3. **`the scan runs AFTER the response, on the rows that actually landed`** — have
   `insertNinaAvatars` return one of two submitted rows (the `ON CONFLICT` skip); assert
   `findGlobalDuplicatePhoto` has NOT been called when the action resolves, then run the captured
   `after` callback and assert it was called exactly once, for the landed row's id, with the hash
   joined **by pathname**.
4. **`the whole chunk is excluded from every lookup, not just the row asking`** — two landed rows;
   assert the third argument of BOTH calls is the same
   `{ exclude: [{ kind: 'avatar', id: <row 1> }, { kind: 'avatar', id: <row 2> }] }`. Without the
   row itself every new avatar is its own duplicate; without its siblings, two copies of one
   picture in one drop announce each other. (Reconciler round 1 — the draft asserted a positional
   single pointer here, which phase 1's signature does not accept.)
5. **`a whole batch of duplicates buzzes the phone ONCE`** — five landed rows, finder hits on all
   five; after the callback, `notifyDuplicateImagePush` called exactly once, with the FIRST hit, and
   `findGlobalDuplicatePhoto` called five times (the count is still true in the log).
6. **`a re-dropped folder schedules nothing`** — `insertNinaAvatars` returns `[]`; assert no `after`
   callback was registered at all and `skipped` equals the submitted count.
7. **`one row whose lookup throws does not cost the other rows their check`** — reject the finder for
   the first candidate and resolve a hit for the second; after the callback,
   `notifyDuplicateImagePush` was called once, for the second.
8. **`a row that landed without a hash is never scanned`** — one record with no hash; the `after`
   callback is not scheduled (no candidates).

---

## Verification

**Build:** `npx tsc --noEmit` (or `npm run typecheck`, which runs `next typegen` first — use that in
a fresh worktree, where missing generated `PageProps` types otherwise surface as false errors).

**Tests:**
```
npm test -- tests/admin.chatPhotos.test.ts tests/admin.albumUploadActions.test.ts tests/admin.avatars.test.ts tests/admin.albumActionsBarrel.test.ts components/admin/explorer/useFolderUpload.test.tsx
npm test
```
Then `npm run lint`.

**Manual check** (needs phases 1 and 2 landed, and a Production-scope VAPID env — per the memory note,
`/admin` cannot be served from a Vercel preview, so probe from a local production build):
1. `/admin/nina` → Media → **Add** a photograph already in the chat collection. The phone shows the
   duplicate notification, **not** the usual "Nina sent a photo" one. Tapping it opens
   `/photo/image/<id>` full-screen on the original.
2. Add a photograph that exists only in her avatar album. Same notification, tapping opens
   `/photo/avatar/<id>`.
3. Add a genuinely new photograph. The usual `admin_chat_photo` notification fires, exactly once,
   with a pool caption — unchanged from today.
4. **Replace** a photograph's bytes with bytes already in the album. The duplicate notification
   fires **and** the bubble shows the new picture (the replace is not skipped).
5. Drop a folder of ~10 images that are already in the album under a *different* folder path. All ten
   rows land (the `source_key` differs), and the phone buzzes **once**; the server log carries
   `[dup] folder upload landed photos the collection already had` with `hits: 10, notified: 1`.
6. Re-drop the same folder into the same destination. Nothing uploads, nothing registers, nothing
   buzzes.

**Exit criteria:**
- `addChatPhotoAction` sends exactly one push per successful add: `duplicate_image` when the add was
  a duplicate (by plan or by cross-table hit), `admin_chat_photo` otherwise. Neither fires on any of
  its four refusal paths.
- `replaceChatPhotoAction` sends `duplicate_image` when the replacing bytes already exist elsewhere
  in the user's collection, and the replace itself is byte-for-byte the same operation as before in
  every case.
- `nina_avatars.content_hash` is populated for every new folder-upload row whose client could hash
  the file, and `registerNinaAvatarsAction` sends at most one `duplicate_image` per chunk, from
  `after()`.
- `npx tsc --noEmit`, `npm test` and `npm run lint` all pass.

---

## Handoffs

- **Phase 1 owns the names this plan calls, and they are now reconciled.** The draft's
  `findGlobalDuplicateImage` / `GlobalPhotoPointer` / positional `exclude` were all wrong; the
  rename landed at 5 call sites and 3 mock factories in reconciler round 1, exactly as this bullet
  predicted. See **Requires** above for the mapping table. Nothing structural moved.
- **`setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumAvatarActions.ts`) does not carry the chat
  photo's `content_hash` onto the avatar row it creates.** It is the second writer of
  `NinaAvatarBatchInsert`, the source row usually *has* a hash, and copying it would make the new
  avatar answerable to the duplicate finder for free. It is left alone here because "adopt a chat
  photo as an avatar" is not an upload route — R1's wording is "uploaded an image" — and this phase's
  scope names three routes. **This is a card, not an omission.** (It would also be self-referential:
  the new avatar is by construction a duplicate of the chat photo it was made from, so it must NOT
  notify — which is a design question, not a one-line copy.)
- **No backfill of `nina_avatars.content_hash` for existing rows.** Explicitly out of scope per the
  index; the precedent is `scripts/nina-dedupe-media.mjs`. Until a sweep runs, an *existing* avatar
  cannot be found as the duplicate of a new upload — only new-vs-new matches. Worth a line in the
  release note so the first "it didn't notify" report is diagnosed in one read rather than as a bug.
- **`avatarColumns` still does not project `content_hash` (or `source_key`).** Anything that later
  needs to read a hash back off an avatar row — a backfill sweep, an admin panel showing which
  photographs are duplicates — widens it then. This phase deliberately does not, because it needs no
  read-back.
- **The one-push-per-batch cap** (Step 6) was **ratified** by the reconciler in round 1, and the
  index's Scope bullet now says "at most once per upload event" with the batch case spelled out.
  The deciding rung was the surrounding convention (rung 6): a single shared
  `PUSH_NOTIFICATION_TAG = 'nina'` already collapses N sends into one visible notification, so the
  cap changes what is *sent*, not what the operator *sees*. The index's Decisions table carries the
  row. `if (hits === 1)` stays.
- **The runner-side routes are Phase 3's** — `app/api/extract/route.ts`,
  `components/extract/UploadPicker.tsx`, `components/nina/useComposerPhotos.ts`,
  `lib/nina/actions/send.ts`, `lib/db/queries/photos.ts`. This phase touches none of them.

---

## Rollback

Every change here is additive at a call site, so a per-file revert restores today's behaviour with no
data migration:

1. `git checkout -- lib/admin/chatPhotoActions.ts lib/admin/ninaAlbumUploadActions.ts lib/admin/schema.ts components/admin/explorer/useFolderUpload.ts lib/nina/queries/shapes.ts lib/nina/queries/avatars.ts`
2. `git checkout -- tests/admin.chatPhotos.test.ts components/admin/explorer/useFolderUpload.test.tsx`
3. `rm tests/admin.albumUploadActions.test.ts`

Phase 1's `nina_avatars.content_hash` column stays (it is phase 1's to roll back) and simply stops
being written — nullable, and nothing else reads it once the call sites are gone. Rows written while
this phase was live keep their hash; it is inert data, not a constraint, and `source_key` remains the
only key the avatar insert conflicts on. No blob, no row and no push subscription is affected.
