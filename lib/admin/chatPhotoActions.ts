'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import {
  chatPhotoAddSchema,
  chatPhotoDescriptionSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import {
  ADMIN_CHAT_PHOTOS_PATH,
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  isAdminChatPhotoPathname,
  isNinaPhotoCarrierMessage,
  planChatPhotoAddWrite,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { isValidId, newId } from '@/lib/id'
import { captionNinaPhoto } from '@/lib/nina/caption'
import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import { ninaImageCaption } from '@/lib/nina/imagefail'
import {
  deleteNinaMessage,
  deleteNinaMessageImage,
  findNinaImageByContentHash,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
  setNinaMessageImageDescription,
  updateNinaChatPhotoBlob,
  updateNinaChatPhotoDescription,
  updateNinaMessage,
  type NinaImageRow,
  type NinaMessageRow,
} from '@/lib/nina/queries'
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'
import { isValidContentHash } from '@/lib/photos/contentHash'

/**
 * Nina's chat photographs, from `/admin`. R2's write half: *"user can replace a photo in there with
 * a new photo, or add a new photo (so it is like nina generated them, but actually it is manually
 * added by user) or remove a photo"*.
 *
 * Every action opens with `requireAdmin()`, ABOVE any use of an argument, and is scoped to the id it
 * returns. `proxy.ts` does not match `/admin` at all (ruling D3), so this line is the authorization
 * — and Next 16's own Server Actions guide says why it has to be: *"the route is reachable to
 * anyone who can send the same POST. Treat every action as an untrusted entry point."*
 *
 * ── NO CONFIRMATIONS. ANYWHERE. ─────────────────────────────────────────────────────────────
 * R1's ruling — *"i am the only one using this app, no need for all these bullshit confirmation"* —
 * is a property of this admin surface, not of one page. One click, it happens. There is no dialog,
 * no `window.confirm`, no typed string, no second button and no `confirming` state in this file or
 * in the three components that call it. A Zod refusal is NOT a confirmation: it is a validation
 * failure and it is reported inline (invariant 4).
 *
 * ── NO ACTION HERE EVER SEES IMAGE BYTES ────────────────────────────────────────────────────
 * Server Action requests are capped at 1 MB by the framework (the Server Actions guide, "Body size
 * limit"). The browser PUTs straight to Blob through `/api/admin/nina/upload` and hands these
 * actions a URL, a pathname and four integers. That is a design constraint, not a convenience: a
 * 2 MB photograph through an action body would be a 500 with no useful message.
 *
 * ── THE CLAIMS ARE CHECKED TWICE, IN TWO DIFFERENT WAYS ─────────────────────────────────────
 * The Zod schemas bound the SHAPE and tie `blobUrl` to `pathname`. They know no user id, and the
 * guide is explicit that they cannot: *"A well-formed `Item` object can still refer to a row the
 * caller does not own."* So each action then binds the payload to the session with
 * `isAdminChatPhotoPathname(pathname, userId)` — the same predicate the token mint used — and
 * re-reads the row it is about to change through an owner-scoped query (invariant 3).
 *
 * ── `insertNinaMessageImages` RETURNING `[]` IS NOT SUCCESS ─────────────────────────────────
 * It validates the message FK by hand against the caller's own messages and returns `[]` rather
 * than throwing on a mismatch. `addChatPhotoAction` treats that as a failure and UNDOES the message
 * it just wrote, because a caption bubble with no picture is the exact defect
 * `removeChatPhotoAction` exists to prevent.
 *
 * ── A BLOB OBJECT MAY BE SHARED. NOTHING HERE CALLS `del` DIRECTLY. ─────────────────────────
 * R26's re-attach path copies `blob_url`/`pathname` onto a new row rather than copying bytes
 * (`lib/nina/actions.ts:143-192`), so a chat photograph's object can also be another chat row's or
 * a `nina_avatars` row's — possibly HER CURRENT PROFILE PICTURE. Every delete in this file goes
 * through `releaseBlobIfUnreferenced` (`lib/nina/blobRelease.ts`, the one shared implementation —
 * this file's former private helper, extracted when the runner-facing delete needed the same
 * rule), which asks `isBlobPathnameReferenced` first. Invariant 8 (no orphaned blobs) yields to
 * that: an orphan costs storage, a deleted-but-referenced object is visible data loss.
 *
 * ── A CHAT PHOTOGRAPH MAY HAVE NO MESSAGE (R1) ──────────────────────────────────────────────
 * `nina_message_images.message_id` is nullable with `ON DELETE SET NULL`, so deleting a chat
 * session orphans its photographs instead of destroying them — including the ones the operator
 * replaced through this file, which is the specific loss the runner reported. Every action here
 * works on an orphan: Replace addresses the row by `(user_id, id)` and never reads `message_id`;
 * Add always mints a carrier message, so it cannot produce one; Remove asks whether there is a
 * carrier at all before it asks whether it may delete it.
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────────────────────
 *  · It writes no new `kind` and no new `NinaMessageSource`. A photograph added here is
 *    indistinguishable downstream from one `finishSelfie` wrote (invariant 7); the phase plan's D1
 *    justifies every column value.
 *  · It writes `nina_messages.photo_only`, and that is **not** an admin column. `finishSelfie` and
 *    `scripts/nina-image-worker.ts` set it on exactly the same rows for exactly the same reason, so
 *    it says "this bubble is a photograph" and never "an operator added this" — invariant 7 above
 *    still holds. It is the marker `isNinaPhotoCarrierMessage` reads once a caption is free text.
 *  · It touches no runner-facing module. `photoSideOf`, `chatViewerPhotos`, `galleryPhotos` and the
 *    chat bubble renderer are unchanged and that is the proof, not the hope.
 *  · It writes no migration (invariant 10).
 */

/* ── REPLACE ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Swap the bytes behind an existing photograph, keeping the row, its message, its `created_at` and
 * its place in the conversation — so the bubble that already exists shows the new picture.
 *
 * ── ROW FIRST, OLD BLOB SECOND ──────────────────────────────────────────────────────────────
 * `deleteNinaAvatarAction`'s rule (`lib/admin/ninaAlbumActions.ts:186-191`), and it points the same
 * way here: a failed `del` leaves an orphan, which is recoverable; a deleted blob under a live row
 * is a permanently broken image in the runner's chat. It also does a second job — by the time the
 * release runs, this row already points at the NEW pathname, so it is out of the reference answer
 * and no "except this row" parameter is needed.
 *
 * The `existing.pathname !== pathname` guard is not paranoia: `addRandomSuffix` makes a collision
 * impossible in practice, and deleting the object the row now points at would be unrecoverable, so
 * the one comparison that rules it out is worth making.
 *
 * ── A REFERENCE ROW IS NOT A MEMBER, SO IT IS NOT REPLACEABLE ───────────────────────────────
 * F37's `source_avatar_id` / `source_image_id` mark a row that RE-SHOWS a photograph which already
 * exists elsewhere — an album row (F34 R2's share) or another chat row. `isOriginalPhoto()` is
 * inside `generatedChatPhotoScope`, so such a row is not on `/admin/photos` at all and an id for one
 * is a stale link or a hand-typed claim. `getNinaMessageImage` above deliberately does NOT filter
 * references (it is the bubble/viewer read too), so the refusal has to be here. Replacing a
 * reference's bytes would change what one bubble shows while the photograph it re-shows stayed as it
 * was: two pictures where the operator asked for one, and no way to see the second one from this
 * screen. The refusal is a sentence, in the same shape as the `kind` refusal above it.
 */
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
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }
  if (isChatPhotoReference(existing)) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Replace the original instead.',
    }
  }

  const updated = await updateNinaChatPhotoBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
    /* media-dedupe P3, invariant 4. A byte swap MUST move the hash with it: the same trust class
     * as every other claim this action accepts (the bytes themselves are a claim). No claim or a
     * malformed one retracts the column to NULL — dedup goes quiet for this row, which is the
     * honest answer for bytes nothing has hashed yet. */
    contentHash: isValidContentHash(contentHash) ? contentHash : null,
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

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id, ...(note === undefined ? {} : { note }) }
}

/* ── ADD ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * *"add a new photo (so it is like nina generated them, but actually it is manually added by
 * user)"* — a literal specification of the storage shape, and this writes exactly the pair
 * `finishSelfie` writes (`scripts/nina-image-worker.ts:427`).
 *
 * `message_id` is NULLABLE since R1, so a floating chat photo is now representable — but ADD does
 * not make one, and that is a decision rather than a leftover. NULL is the residue of a delete: the
 * conversation that held the photograph is gone. A photograph the operator adds on purpose has
 * never been in a conversation, and putting it straight into the orphan state would make it
 * invisible in the chat forever with no way back. So "add a photo" is still "add a message with a
 * photo on it", `NinaImageInsert.messageId` is still required, and no third shape is invented.
 *
 * ── media-dedupe P3: "ALREADY IN THE COLLECTION" IS A REFERENCE, NOT A SECOND OBJECT ──────────
 * The browser hashes the encoded JPEG and asks `findChatPhotoDuplicateAction` BEFORE it PUTs; on a
 * hit it skips the upload and sends the keeper's object back with `duplicateOfId` pinning the row.
 * This action never trusts that echo — it re-reads the pinned row owner-scoped and writes the add
 * as a REFERENCE through `planChatPhotoAddWrite` (`lib/admin/chatPhotos.ts`, which owns the
 * decision and its arguments). The race — the client DID put fresh bytes and a concurrent original
 * claimed them — lands on the same plan from the hash lookup, and the loser object is released
 * after the row is in (ROW FIRST, BLOB SECOND, invariant 3). The failure unwind below releases
 * `plan.release`, and `plan.release` is NULL exactly when nothing fresh was ever uploaded — which
 * is what keeps the skip path from ever tripping the unwind's blob release on an object it did not
 * create.
 *
 * The pinned row is refused outright when it has vanished between the pre-check and this action
 * ("pick it again"): its object may have been released with it, and writing a row onto a dead URL
 * is the one outcome worse than asking twice. The refusal is a sentence, in the shape of every
 * other refusal in this file.
 *
 * ── THE FOUR VALUES THAT HAVE NO JOB TO TAKE THEM FROM ──────────────────────────────────────
 *   · `text` — `ninaImageCaption(newId())`. The SAME function, seeded with a fresh nanoid(12)
 *     instead of a job id. `pickLine` is a pure FNV-1a over its key and a job id is itself a
 *     nanoid(12), so the distribution is identical and the result is always one of the five strings
 *     in `NINA_IMAGE_CAPTIONS` — which is also what makes `isNinaPhotoCarrierMessage` recognise
 *     this message later. Her words keep exactly one definition in the repo.
 *   · `turnId` — NULL. `nina_turns` holds no message text and asserts that a model call happened
 *     and what it cost; none did and nothing was paid. Nothing renders the column
 *     (`lib/db/schema.ts:799`).
 *   · `replyToId` — NULL. The worker's subselect resolves *the runner message that asked*; nobody
 *     asked. `resolveQuote` degrades a null to a plain message by design.
 *   · `sessionId` — `resolveNinaWriteSession`. `nina_messages.session_id` is `NOT NULL` with an FK,
 *     `insertNinaMessages` takes it as a required third argument, and `lib/nina/sessionResolve.ts`
 *     holds assumption A3's ONE policy for a writer with nobody looking. It creates a session when
 *     he has none, so this works on a fresh account.
 *
 * `prompt` is NULL because there was no generation, and it has no reader anywhere in the repo.
 * `description` is the keeper's prose on a duplicate (see `planChatPhotoAddWrite`) and NULL at
 * insert on a fresh original, earned below — a hand-uploaded photograph has no generation prompt
 * and `glm-4.6v` is the only thing that can say what is in it.
 */
export async function addChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoAddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { blobUrl, pathname, width, height, bytes, contentHash, duplicateOfId } = parsed.data

  /* ── THE CLAIMS, NORMALIZED ─────────────────────────────────────────────────────────────────
   * Invariant 9, twice. A malformed hash is a NULL and a proceed — dedup goes quiet for this add,
   * the upload is not refused. A malformed `duplicateOfId` cannot name a row, so the schema's id
   * shape check already refused it. */
  const claimedHash = isValidContentHash(contentHash) ? contentHash : null
  const pinnedId = isValidId(duplicateOfId) ? duplicateOfId : null

  let pinned: NinaImageRow | null = null
  if (pinnedId != null) {
    /* The pre-check's echo is a CLAIM; this read is the fact. Owner-scoped, and deliberately NOT
     * filtered to originals — a keeper the sweep merged mid-flight is flattened by the plan. */
    pinned = await getNinaMessageImage(userId, pinnedId)
    if (pinned == null) {
      return {
        ok: false,
        error:
          'That photo was already in the collection and has since been removed — pick it again.',
      }
    }
  } else if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  /* The race door: only reached when nothing was pinned, because a pinned row IS the answer. */
  const hit =
    pinned == null && claimedHash != null
      ? await findNinaImageByContentHash(userId, claimedHash)
      : null

  const plan = planChatPhotoAddWrite({
    claims: { blobUrl, pathname, contentHash: claimedHash },
    pinned,
    hit,
  })

  const sessionId = await resolveNinaWriteSession(userId)

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        body: ninaImageCaption(newId()),
        source: 'chat',
        turnId: null,
        replyToId: null,
        runId: null,
        /* This bubble is the photograph and nothing else. Remove deletes it with the last picture
         * on it, and from this row forward that no longer depends on what its text says. */
        photoOnly: true,
      },
    ],
    sessionId,
  )
  if (message == null) {
    return { ok: false, error: 'Could not open a place in the conversation for it.' }
  }

  const [image] = await insertNinaMessageImages(userId, [
    {
      messageId: message.id,
      kind: 'generated',
      blobUrl: plan.blobUrl,
      pathname: plan.pathname,
      width,
      height,
      bytes,
      description: plan.description,
      prompt: null,
      sourceAvatarId: plan.sourceAvatarId,
      sourceImageId: plan.sourceImageId,
      contentHash: plan.contentHash,
      sortOrder: 0,
    },
  ])

  /*
   * `[]` IS NOT SUCCESS. `insertNinaMessageImages` validates the message FK by hand and returns an
   * empty array on a mismatch rather than throwing. Leaving it there would put a caption bubble with
   * no picture in the runner's chat forever — the exact defect `removeChatPhotoAction` exists to
   * prevent — so the message is undone and the object we just uploaded is released with it. The
   * release goes through the same helper as everything else — and through `plan.release`, so a
   * skipped upload (whose payload names the KEEPER's object) releases NOTHING: there is no object
   * of ours in the store to release, and the keeper's object is still referenced by its own row.
   */
  if (image == null) {
    await deleteNinaMessage(userId, message.id)
    if (plan.release != null) await releaseBlobIfUnreferenced(userId, plan.release)
    return { ok: false, error: 'The photo could not be attached to a message.' }
  }

  /* ROW FIRST, BLOB SECOND: the reference row is in before the loser object is asked about. Only
   * the race path has a loser at all. */
  if (plan.release != null) {
    const outcome = await releaseBlobIfUnreferenced(userId, plan.release)
    if (outcome !== 'deleted') {
      console.warn('[admin] duplicate add kept the fresh object', { outcome })
    }
  }

  scheduleChatPhotoCaption(userId, image.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: image.id }
}

/* ── the pre-check (media-dedupe P3) ───────────────────────────────────────────────────────── */

/**
 * **"Does the collection already hold these bytes?"** — the question `uploadChatPhoto` asks BEFORE
 * it PUTs, so re-picking a photograph costs one indexed lookup instead of a second Blob object.
 * The measured defect this closes: the arrival card existed as two objects
 * (`sbTuT8NKXL24` + `ywNnXvpnnKSi`) because no layer compared content and `addRandomSuffix: true`
 * guaranteed two objects for identical bytes.
 *
 * Owner-scoped twice over: `requireAdmin()` binds the session, and
 * `findNinaImageByContentHash` carries `user_id` in its WHERE — the client is told only about rows
 * it already owns. Invariant 9 in one guard: a malformed hash is `null`, never an error, and the
 * caller proceeds to a normal upload and loses nothing but the round trip it was trying to save.
 *
 * The answer names the ORIGINAL only (the finder filters references), so the caller's skip path
 * pins a keeper that is flat and `addChatPhotoAction`'s own re-read does the rest.
 */
export async function findChatPhotoDuplicateAction(
  contentHash: string,
): Promise<{ id: string; blobUrl: string; pathname: string } | null> {
  const { userId } = await requireAdmin()
  if (!isValidContentHash(contentHash)) return null

  const row = await findNinaImageByContentHash(userId, contentHash)
  if (row == null) return null
  return { id: row.id, blobUrl: row.blobUrl, pathname: row.pathname }
}

/* ── REMOVE ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Take a photograph out of the collection, its Blob object with it when nothing else needs it —
 * and, when the message existed only to carry it, the message too.
 *
 * ── THE EMPTY BUBBLE, RESOLVED ──────────────────────────────────────────────────────────────
 * `finishSelfie`'s message exists ONLY to carry the photograph, so removing its last image would
 * leave a caption bubble with no picture in the runner's chat, forever. When this is the last image
 * on such a message, the MESSAGE is deleted and `deleteNinaMessage` removes the image row in the
 * same transaction. (That used to be `message_id`'s `ON DELETE CASCADE` doing the work; since R1
 * the column is `ON DELETE SET NULL` and `deleteNinaMessage` deletes its own image rows explicitly.
 * Same one transaction, same outcome, and the reason for the change is in that function's header:
 * a deleted SESSION must not take the photographs, and one FK cannot tell the two paths apart.)
 *
 * It must NOT delete a RUNNER message that merely carried her re-attached photograph
 * (`lib/nina/actions.ts:518-530`, the R26 path): that message is his and carries his text. Both
 * clauses of that rule live in `isNinaPhotoCarrierMessage` and are argued at its definition.
 *
 * ── AND THE PHOTOGRAPH MAY HAVE NO MESSAGE AT ALL (R1) ──────────────────────────────────────
 * An orphan's `row.messageId` is NULL. There is no carrier to look up, nothing to protect from an
 * empty bubble, and no `getNinaMessagesByIds(userId, [null])` to write — so `loadPhotoCarrier`
 * short-circuits to `{ message: null, siblings: [] }` and Remove takes the plain
 * `deleteNinaMessageImage` branch. This is the case the collection is now FULL of: every photograph
 * from every conversation the runner has deleted.
 *
 * ── ROW FIRST, BLOB SECOND, AND ONLY IF NOTHING ELSE POINTS AT IT ───────────────────────────
 * The same R26 path that produced the runner-message case also produced the SHARED-OBJECT case: it
 * copies `blob_url`/`pathname` rather than bytes, so the object behind this row may also be behind
 * another chat row or a `nina_avatars` row — possibly her current profile picture.
 * `releaseBlobIfUnreferenced` asks first. Deleting the row before asking is what makes the question
 * answerable without an exclusion parameter.
 *
 * ── A REFERENCE ROW IS NOT A MEMBER, SO IT IS NOT REMOVABLE FROM HERE ───────────────────────
 * F37's `source_avatar_id` / `source_image_id` mark a row that re-shows a photograph which already
 * exists elsewhere. `generatedChatPhotoScope` excludes it, so it never appears on `/admin/photos`
 * and an id for one is a stale link or a hand-typed claim. Acting on it would be worse than useless:
 * the photograph the operator can SEE on the screen would still be there afterwards, and
 * `releaseBlobIfUnreferenced` would be asked about an object the original member still points at. The
 * refusal is first, above every read and every delete, and it is a sentence rather than the generic
 * miss so the operator knows the id was real and the answer was still no. Removing a re-share from a
 * bubble is the runner's own message-edit path, not this screen's.
 *
 * It sits ABOVE `loadPhotoCarrier` for a reason worth one line: an ORPHANED reference row would
 * otherwise take the `{ message: null, siblings: [] }` short-circuit straight into
 * `deleteNinaMessageImage`, which is exactly the delete this paragraph forbids.
 */
export async function removeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a photo id.' }
  const { id } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (isChatPhotoReference(row)) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Remove the original instead.',
    }
  }

  const carrier = await loadPhotoCarrier(userId, row.messageId)
  const isLastImage = carrier.siblings.every((sibling) => sibling.id === id)

  if (isLastImage && carrier.message != null && isNinaPhotoCarrierMessage(carrier.message)) {
    const gone = await deleteNinaMessage(userId, carrier.message.id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  } else {
    const gone = await deleteNinaMessageImage(userId, id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  }

  const outcome = await releaseBlobIfUnreferenced(userId, row)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(outcome === 'shared'
      ? { note: 'The file is still used elsewhere, so it was kept in the store.' }
      : {}),
  }
}

/* ── DESCRIBE ────────────────────────────────────────────────────────────────────────────── */

/**
 * **Rewrite what she can see in a photograph, by hand.** R2 of
 * `nina-photo-refs-and-bubble-actions`, verbatim: *"there is a 'what she can see in it' field. make
 * this field editable by user"*.
 *
 * `nina_message_images.description` is `glm-4.6v`'s prose and it is the only text on that row that
 * reaches Nina's prompt (`lib/nina/actions.ts:634-637`). Until now nothing could write it by hand,
 * so a wrong description was a wrong belief with no correction available. This is the correction.
 *
 * ── NO MODEL CALL, NO `after()`, AND THAT IS THE POINT ────────────────────────────────────
 * The other three actions in this file schedule `scheduleChatPhotoCaption` because they changed the
 * BYTES and the prose had to be re-earned. This one changes the prose, so re-earning it would
 * overwrite the human who just typed it. Invariant 5 of the plan set:
 * `scripts/check-llm-payload-boundary.mjs` gains no entry.
 *
 * It also deliberately does NOT re-caption the bubble. `scheduleChatPhotoCaption` writes
 * `nina_messages.text` from the description, and running it here would rewrite a sentence Nina has
 * already said in the runner's conversation because an operator fixed a private note the runner
 * never saw. **Editing what she SAW is not editing what she SAID.** If that is ever wanted it is one
 * line, and it needs its own decision.
 *
 * ── AN EMPTY BOX CLEARS THE FIELD (D1) ───────────────────────────────────────────────────
 * The normalised string is empty -> `NULL`, and the operator is TOLD, in the `note`. Refusing empty
 * was the alternative and it is the worse one: it would make a wrong description un-erasable —
 * replaceable with different prose, never retractable. NULL is not a new state (a Replace writes it,
 * every Add starts there) and it degrades honestly on the send path, where
 * `NINA_DESCRIPTION_UNAVAILABLE` is substituted and she asks him what the picture is rather than
 * inventing something. A real consequence belongs in a sentence the operator reads, not in a
 * docstring only I will read.
 *
 * ── THE TWO CHECKS, AGAIN AND FOR THE SAME REASON ─────────────────────────────────────────
 * `requireAdmin()` first, above any use of the argument. Then the SHAPE (Zod, which knows no user
 * id — *"A well-formed `Item` object can still refer to a row the caller does not own"*), then the
 * owner-scoped re-read, then a write whose own WHERE carries `user_id` AND `kind = 'generated'`.
 *
 * The `existing.kind` guard is not decoration: `getNinaMessageImage` does not filter on `kind`, so
 * without it an id for one of HIS composer uploads would reach a write nobody can see or undo from
 * this screen. `replaceChatPhotoAction` refuses the same case with the same sentence, on purpose.
 *
 * And there is no `isAdminChatPhotoPathname` call here, with nothing missing: that predicate binds
 * an UPLOADED BLOB to the session, and this action receives no blob, no pathname and no URL.
 */
export async function editChatPhotoDescriptionAction(
  input: unknown,
): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoDescriptionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `That description did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS} characters at most.`,
    }
  }
  const { id, description } = parsed.data

  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }

  /* The empty box IS the clear. D1, and this line is the only place that policy lives. */
  const next = description.length === 0 ? null : description

  const updated = await updateNinaChatPhotoDescription(userId, id, next)
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null
      ? {
          note: 'Cleared. If this photo comes up again she will say she could not see it and ask him what it is.',
        }
      : {}),
  }
}

/* ── The two helpers ─────────────────────────────────────────────────────────────────────── */

/**
 * The bubble a photograph sits in, and the photographs beside it — or neither, when there is no
 * bubble.
 *
 * Two reads or none. Since R1 a chat photograph's `message_id` may be NULL, which means the
 * conversation that held it was deleted and the row was orphaned rather than destroyed. In that
 * case there is nothing to look up: an orphan has no carrier message to protect from an empty
 * bubble and no siblings inside a bubble it is not in. Returning the empty answer here rather than
 * branching at the call site is what keeps `removeChatPhotoAction`'s decision — carrier or plain
 * row — one expression, and what makes it impossible to pass a `null` id into an owner-scoped
 * query that would then look like it had refused.
 *
 * `siblings` is EVERY image on that message, including this one; the caller's `isLastImage` test is
 * "they are all me". `getNinaMessagesByIds` and `getNinaMessageImagesForMessages` are both
 * owner-scoped, so a `message_id` read off a row we already proved is his cannot widen anything.
 */
/**
 * **Is this row a re-share rather than a photograph of its own?** The row-level reading of
 * `isOriginalPhoto()` (`lib/nina/queries.ts`), which is the SQL half of the same rule.
 *
 * Written here rather than exported out of `lib/nina/` because this is the only place that needs
 * the question answered about a row already in hand: the three collection reads ask it in their
 * WHERE, and `getNinaMessageImage` — the bubble, viewer and admin read — deliberately never asks it
 * at all. A shared export would invite a fourth caller to filter a read that must not be filtered
 * (`lib/db/schema.ts`'s own note on the four reads, asserted as an absence by
 * `tests/nina.photoRefs.test.ts`).
 *
 * Either column being non-null is enough: `ninaPhotoProvenance` sets exactly one of the two, and
 * both FKs are `ON DELETE SET NULL`, so a row whose origin was deleted stops being a re-share and
 * becomes replaceable and removable again — which is correct, because by then it is the only copy
 * left.
 *
 * `!= null` and not `!== null`, deliberately: the loose comparison answers "is there an origin id
 * here" for an ABSENT field as well as a NULL one, and absent has to mean the same thing as null.
 * The column is `string | null` so a live row cannot be `undefined` — but a caller holding a row
 * shaped before F37 added the pair can be, and the strict form would then read a missing field as
 * "this is a re-share" and refuse an ordinary photograph the operator can see on the screen. The
 * safe direction for a REFUSAL is to fire only on evidence, which is the same widening
 * `isOriginalPhoto()` gets for free from `IS NULL` in SQL.
 */
function isChatPhotoReference(
  row: Pick<NinaImageRow, 'sourceAvatarId' | 'sourceImageId'>,
): boolean {
  return row.sourceAvatarId != null || row.sourceImageId != null
}

async function loadPhotoCarrier(
  userId: string,
  messageId: string | null,
): Promise<{ message: NinaMessageRow | null; siblings: NinaImageRow[] }> {
  if (messageId === null) return { message: null, siblings: [] }

  const [messages, siblings] = await Promise.all([
    getNinaMessagesByIds(userId, [messageId]),
    getNinaMessageImagesForMessages(userId, [messageId]),
  ])

  return { message: messages[0] ?? null, siblings }
}

/**
 * Look at the photograph, then say something true about it — AFTER the response has gone out. Not
 * exported: a `'use server'` module may export only async functions, and this is a synchronous
 * scheduler.
 *
 * ── WHAT THIS FIXES, AND WHERE THE BUG ACTUALLY WAS ─────────────────────────────────────────
 * MEASURED 2026-09-07, from the user's screenshot: an underwater photograph of her in a swimsuit
 * and fins, captioned `ini gw abis lari tadi`. That sentence was never about that photograph. It is
 * element index 2 of a five-string array and `pickLine` hashed a fresh nanoid onto it — no model,
 * no image, no prompt. Meanwhile THIS function was already sending the picture to `glm-4.6v` and
 * storing a perfectly good paragraph about it in a column that, on this path, nothing reads
 * (`dbNinaSourceGateway.readConversation` maps every window row with a literal
 * `imageDescriptions: []`). The multimodal call existed; its answer just never reached the one text
 * the runner sees.
 *
 * So this function now does both halves: `glm-4.6v` looks, `glm-5.3` speaks, and the bubble is
 * rewritten. `nina_message_images.description` is still written first and on its own, so the
 * paragraph survives even when the caption call does not.
 *
 * ── TWO MODEL CALLS, ONE `after()`, AND WHY THAT FITS ───────────────────────────────────────
 * Describe is ~8-11 s (`NINA_DESCRIBE_TIMEOUT_MS` 25 s) and the caption is ~4-8 s
 * (`NINA_CAPTION_TIMEOUT_MS` 12 s), so the worst case is 37 s of a 60 s segment with the response
 * already sent. They are strictly sequential because the second consumes the first — there is
 * nothing to parallelise.
 *
 * ── WHY `after()` AND NOT `await`, RESTATED BECAUSE IT NOW MATTERS TWICE AS MUCH ────────────
 * `lib/admin/ninaAlbumActions.ts:300-320`'s `scheduleDescribe`, same shape and same measurement.
 * Next dispatches Server Actions **one at a time per client** (the Server Actions guide, quoted at
 * `lib/nina/actions.ts:1201-1206`), so an awaited pair would put ~15-25 s on every add, in series:
 * five photographs would be two minutes of a spinner. Non-fatal by design — the row exists, the
 * grid renders, and the caption already on the bubble is one of `NINA_IMAGE_CAPTION_POOL`'s
 * scene-agnostic lines.
 *
 * ── THE PLACEHOLDER IS PART OF THE FIX, NOT A COMPROMISE ────────────────────────────────────
 * For the ~20 s before the caption lands, the bubble says whatever `addChatPhotoAction` wrote. As of
 * phase 1 that can only be a line that asserts nothing about the picture — `nih`, `nih, puas?`,
 * `foto gw. jangan di-zoom`, `udah nih, jangan minta lagi`. The reported sentence is unreachable
 * from that pool. **That is what makes every failure path below safe**: a caption that never
 * arrives leaves a true sentence, not a wrong one.
 *
 * ── WHY IT RE-READS THE ROW INSIDE THE CALLBACK ─────────────────────────────────────────────
 * So the caller pays nothing, and so the skip is authoritative at the moment the work would run — a
 * row removed between the click and the callback is a miss, not a vendor call. The re-read also
 * hands us `messageId`, which is what the caption is written to.
 *
 * ── AND WHY THE `description != null` SKIP STAYS ────────────────────────────────────────────
 * `after()` can run more than once. The skip means a second pass does not pay for a second vision
 * call — and it deliberately does NOT skip the caption: the stored description is exactly the input
 * the caption needs, so a re-run captions for the price of one text call. That is the cheap retry
 * and it is free.
 *
 * No `revalidatePath` in here: `after()` runs once the response is finished, so there is no
 * re-render left to attach to. The runner's screen picks the new text up on its next load or
 * service-worker refresh, the same way the bubble itself arrived.
 */
function scheduleChatPhotoCaption(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaMessageImage(userId, id)
      /* Gone between the click and the callback. A miss, not a failure. */
      if (row == null) return

      /* ── HALF ONE: LOOK AT IT ──────────────────────────────────────────────────────────────
       * `subject: 'self'` is not optional here and it is not cosmetic. The default prompt is
       * written about the RUNNER — *"The state of him. Drenched or dry"*, and rule 6 is *"'Him' for
       * whoever is clearly the runner"*. Pointed at a photograph of Nina it looks for a man who is
       * not in the frame. See `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`. */
      let description = row.description
      if (description == null) {
        try {
          const result = await describeNinaImages(
            [{ blobUrl: row.blobUrl, pathname: row.pathname }],
            { subject: 'self' },
          )
          description = result.description
          await setNinaMessageImageDescription(userId, id, description)
        } catch (cause) {
          /* The floor tripping is its own class and is logged LOUDLY: it means the vendor answered
           * 200 with an image it silently dropped, and the text of such a response is exactly where
           * an invented description would be. `lib/nina/actions.ts:1268-1276` does this and says
           * why. Either way the caption is skipped and the pool line stands. */
          if (cause instanceof NinaVisionTokenFloorError) {
            console.error('[f36] TOKEN FLOOR TRIPPED on a chat photo', {
              pathname: row.pathname,
              message: cause.message,
            })
          } else {
            console.warn('[f36] chat photo describe failed; the row keeps a null description', {
              id,
              error: String(cause),
            })
          }
          return
        }
      }

      /* ── HALF TWO: SAY SOMETHING TRUE ABOUT IT ─────────────────────────────────────────────
       * The tuning is read LIVE, no cache — `lib/nina/selfiegen.ts`'s rule: *"A wardrobe saved on
       * /admin/nina thirty seconds ago is in this prompt."* One indexed primary-key read on a path
       * that has just made two network calls.
       *
       * `captionNinaPhoto` never throws and returns `null` for every refusal — a digit, alt-text
       * narration, an over-long line, the sanctioned empty answer, a timeout. `null` means the
       * placeholder was the better sentence, so nothing is written. */
      /* R1: an ORPHAN has no bubble to caption. `message_id` is nullable since a session delete
       * started orphaning photographs instead of destroying them, and this half writes into
       * `nina_messages.text` — there is no row to write to. HALF ONE above has already stored the
       * description on the photograph itself, which is the half that still means something for a
       * photograph outside every conversation. Returning here rather than at `updateNinaMessage`
       * below is deliberate: it also skips a tuning read and a paid `glm-5.3` call whose output
       * could not be written anywhere. Reachable from Replace on an orphaned row; Add always mints
       * a carrier message first, so it never lands here. */
      if (row.messageId == null) {
        console.info('[f36] the photo has no bubble to caption; its description still landed', {
          id,
        })
        return
      }

      const tuning = await readNinaTuning(userId)
      const caption = await captionNinaPhoto({ seen: description, seenKind: 'described', tuning })
      if (caption == null) {
        console.info('[f36] no caption for this photo; the canned line stands', { id })
        return
      }

      /* `updateNinaMessage` writes `text` and NOTHING else — not `seq`, not `sent_at`, not
       * `read_at`, not `turn_id`. Its docstring argues each one, and every argument is exactly what
       * a late caption needs: *"Rewriting a bubble is not re-sending it."* A returned `null` means
       * the message is not his or is gone, which is the same miss as above. */
      const updated = await updateNinaMessage(userId, row.messageId, caption)
      if (updated == null) {
        console.info('[f36] the bubble went away before its caption arrived', { id })
        return
      }
      console.log('[f36] captioned a chat photo', { id, chars: caption.length })
    } catch (cause) {
      /* The outer net. Nothing in here may reject: `after()` turns a rejection into a log line, and
       * a photograph wearing a scene-agnostic canned caption is a cosmetic state with a true
       * sentence on it. */
      console.warn('[f36] chat photo caption pass failed', { id, error: String(cause) })
    }
  })
}
