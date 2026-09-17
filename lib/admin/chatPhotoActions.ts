'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import {
  chatPhotoAddSchema,
  chatPhotoDescriptionSchema,
  chatPhotoDescribeSchema,
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
  type ChatPhotoAddPlan,
} from '@/lib/admin/chatPhotos'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { isValidId, newId } from '@/lib/id'
import { describeSubjectForSide, photoSideOf } from '@/lib/nina/album'
import { captionNinaPhoto } from '@/lib/nina/caption'
import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import { promoteNinaImageDependents } from '@/lib/nina/provenancePromotion'
import { ninaImageCaption } from '@/lib/nina/imagefail'
import {
  countNinaAvatarsLinkedToImage,
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
  setNinaMessageImageDescriptionAndEmbedding,
  updateNinaChatPhotoBlob,
  updateNinaChatPhotoDescription,
  updateNinaChatPhotoPerceptualSignature,
  updateNinaMessage,
  type NinaImageRow,
  type NinaMessageRow,
} from '@/lib/nina/queries'
import {
  embedNinaMessageImageDescription,
  scheduleMediaEmbed,
} from '@/lib/admin/ninaMediaDeferredDescribe'
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { fetchAndSignImage } from '@/lib/nina/perceptualSign'
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'
import { isValidContentHash } from '@/lib/photos/contentHash'
import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'
import type { ResolvedPhotoPointer } from '@/lib/photos/pointer'
import { notifyDuplicateImagePush } from '@/lib/push/duplicateImage'
import { notifyNinaPush } from '@/lib/push/send'

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
 * (`lib/nina/actions/send.ts:216-247`, since the 2026-09-12 split of `lib/nina/actions.ts`), so a
 * chat photograph's object can also be another chat row's or a `nina_avatars` row's — possibly
 * HER CURRENT PROFILE PICTURE. Every delete in this file goes through `releaseBlobIfUnreferenced`
 * (`lib/nina/blobRelease.ts`, the one shared implementation —
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
 * `deleteNinaAvatarAction`'s rule (`lib/admin/ninaAlbumAvatarActions.ts`), and it points the same
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
 * inside every collection read's WHERE, so such a row is not in the Media folder at all and an id
 * for one is a stale link or a hand-typed claim. `getNinaMessageImage` above deliberately does NOT
 * filter references (it is the bubble/viewer read too), so the refusal has to be here — and
 * `updateNinaChatPhotoBlob`'s own `isOriginalPhoto()` clause is the second agreeing check.
 * Replacing a reference's bytes would change what one bubble shows while the photograph it re-shows
 * stayed as it was: two pictures where the operator asked for one, and no way to see the second one
 * from this screen.
 *
 * The old `kind !== 'generated'` refusal is GONE (the merge's whole point): one of HIS uploads is
 * now replaceable like any other original. `kind` is not written by the replace — the row keeps its
 * side, gains selfie-shaped bytes, and the describe pass below follows the side it still has.
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
  /* The byte swap retracted the perceptual pair (see `updateNinaChatPhotoBlob`'s ghost-signature
   * fix); this re-signs the NEW bytes so the row is dedup-active again in seconds rather than at
   * the next sweep run. Scheduled BEFORE the captioner so the caption pass stays the last
   * `after()` task this action hands over — the two passes are independent, and the cheap GET is
   * the one that should finish first. */
  scheduleChatPhotoResign(userId, id)
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
 *     (`lib/db/schema/nina/chat.ts:448`, since `lib/db/schema.ts` is now a barrel over the domain
 *     modules — see that file's own header).
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

  /*
   * Her words for this bubble, minted ONCE and spent twice: the row below is written with this
   * string and the notification further down carries the same one to the lock screen.
   *
   * It is a `const` rather than two calls because `ninaImageCaption` is `pickLine` over a FRESH
   * `newId()` — pure, but not idempotent across calls. A second call for the notification would
   * pick one of `NINA_IMAGE_CAPTION_POOL`'s five lines at random, so four times in five the phone
   * would show a sentence the chat does not contain. It is a `const` rather than a read-back of
   * `message.body` because that would make the notification depend on a projection nothing else
   * here reads, to learn a string this function already knows.
   */
  const body = ninaImageCaption(newId())

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        body,
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

  /* Sign the fresh row's own bytes now rather than leaving it dedup-inactive until the next sweep
   * run — the same reason the send path signs every claim it lands. On the duplicate branches the
   * row is a REFERENCE and `scheduleChatPhotoResign` skips it (a reference binds NULL by
   * doctrine), so one unconditional call covers both shapes. Scheduled BEFORE the captioner so
   * the caption pass stays the last `after()` task, same as the replace site. */
  scheduleChatPhotoResign(userId, image.id)
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
      await notifyNinaPush(
        userId,
        [{ id: message.id, body }],
        'admin_chat_photo',
        undefined,
        sessionId,
      )
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
 * ── THE SECOND KEY (2026-09-10's measured defect) ────────────────────────────────────────────
 * `sourceHash` is the picked file's OWN hash, asked alongside the encode's. The encode hash can
 * never match for a photograph that was downloaded out of the collection and re-uploaded — the
 * re-encode here produces bytes nobody has ever stored — while the picked file's bytes ARE a
 * stored row's object byte for byte, and one `content_hash` column answers for both identities.
 * Either key matching is the same answer: skip the PUT, pin the keeper.
 *
 * The answer names the ORIGINAL only (the finder filters references), so the caller's skip path
 * pins a keeper that is flat and `addChatPhotoAction`'s own re-read does the rest.
 */
export async function findChatPhotoDuplicateAction(
  contentHash: string,
  sourceHash?: string,
): Promise<{ id: string; blobUrl: string; pathname: string } | null> {
  const { userId } = await requireAdmin()

  const keys = [contentHash, sourceHash].filter((value): value is string =>
    isValidContentHash(value),
  )
  if (keys.length === 0) return null

  const row = await findNinaImageByContentHash(userId, keys)
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
 * (`lib/nina/actions/resend.ts:144-158`, the R26 path): that message is his and carries his text. Both
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
 * What was missing until the ghost-photo fix is the step BEFORE the row delete: a
 * `source_image_id` dependent had to be measured while this row still existed, or the
 * `ON DELETE SET NULL` left it an original that no dedup mechanism could ever see.
 * `promoteNinaImageDependents` is that step, and it is why the release below can now honestly
 * answer "shared" for a photograph that will keep rendering.
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
 *
 * ── AND A PHOTOGRAPH AN ALBUM ENTRY POINTS AT CANNOT LEAVE ─────────────────────────────────
 * `media-album-unified-search` R3. Since the promotion became a LINK, a `nina_avatars` row can
 * name this row through `source_image_id` and show its object without owning a byte. The FK is
 * `ON DELETE RESTRICT` — the plan index's Decision argues why, against `SET NULL` (a pointer with
 * no bytes, unrecoverable) and `CASCADE` (silently losing the "current profile picture"
 * designation) — so Postgres refuses this delete either way.
 *
 * The check below turns that refusal into the shape the operator already knows from
 * `deleteNinaAvatarAction`'s *"That is her current photo — make another one current first."*: one
 * sentence naming the fix, instead of a constraint violation surfaced as a framework error page.
 * The constraint stays the backstop for the race this read cannot close, exactly as
 * `nina_avatars_user_source_key_unq` is for re-adoption's.
 *
 * It sits ABOVE `loadPhotoCarrier` and above `promoteNinaImageDependents` for
 * `isChatPhotoReference`'s stated reason, one refusal over: nothing may be measured, promoted or
 * deleted on behalf of a remove that is not going to happen.
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

  const linked = await countNinaAvatarsLinkedToImage(userId, id)
  if (linked > 0) {
    return {
      ok: false,
      error:
        linked === 1
          ? 'An album entry shows this photo — remove it from the album first.'
          : `${linked} album entries show this photo — remove them from the album first.`,
    }
  }

  const carrier = await loadPhotoCarrier(userId, row.messageId)
  const isLastImage = carrier.siblings.every((sibling) => sibling.id === id)

  /*
   * PROMOTE BEFORE EITHER BRANCH DELETES THE ROW. A chat photograph can be re-shown by another
   * chat row (`source_image_id` naming this id), and that FK is `ON DELETE SET NULL` too — so
   * whichever branch runs below, the dependent is about to become an unmeasured "original" unless
   * it is measured now. Both branches remove THIS row (the message branch only runs when this is
   * the last image on it, and `deleteNinaMessage` deletes its own image rows), so one call above
   * the branch covers both. It never throws and never blocks the remove; see
   * `lib/nina/provenancePromotion.ts`'s header.
   */
  await promoteNinaImageDependents(userId, [id])

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
 * reaches Nina's prompt (`lib/nina/gateway.ts:62-63,198`). Until now nothing could write it by hand,
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
 * owner-scoped re-read, then a write whose own WHERE carries `user_id` AND `isOriginalPhoto()`.
 *
 * The write's WHERE used to carry `kind = 'generated'` and the action refused his uploads with the
 * same sentence Replace used. Both halves of that pair are gone with the surface merge: every
 * ORIGINAL row is describable now, and the clause that replaced the kind check — the reference
 * backstop — is the one that still matters. References keep their refusal below the fold of the
 * shared grammar: this action's write cannot reach one, and the sentence the operator sees for a
 * reference id here is the write's miss, reported as a not-in-the-collection.
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

  /* The empty box IS the clear. D1, and this line is the only place that policy lives. */
  const next = description.length === 0 ? null : description

  const updated = await updateNinaChatPhotoDescription(userId, id, next)
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  /*
   * ── AND THE VECTOR, WHICH THIS ACTION COULD NOT TOUCH UNTIL TODAY ───────────────────────────
   * `media-album-unified-search` R1. `nina_message_images.description_embedding` did not exist
   * when this action was written, which is why it has never embedded anything — not a decision,
   * an absence. Now that the column is real, the rule is the album's:
   * `editNinaAvatarDescriptionAction`'s *"a stale vector is worse than a missing one, because a
   * missing one is visible in the backlog count and a stale one is invisible until a search
   * returns the wrong photo."*
   *
   * The vector is retracted HERE rather than inside `updateNinaChatPhotoDescription`, and the
   * difference matters: that statement's docstring makes the columns it touches (and the ones it
   * does NOT) its contract, and `scheduleChatPhotoCaption`'s HALF ONE writes prose through a
   * different statement for a different reason. So the retraction is one explicit call on the
   * path that has the human's new words, and `scheduleMediaEmbed` re-earns the vector after the
   * response has gone out.
   *
   * `null` in, `null` out: a CLEARED box leaves prose and vector both NULL, which is the honest
   * state and the one `listNinaMessageImageDescribeBacklog` already looks for. `scheduleMediaEmbed`
   * and never `scheduleMediaDescribe`: a cleared box must not summon `glm-4.6v` to invent prose the
   * operator just removed.
   */
  await setNinaMessageImageDescriptionAndEmbedding(userId, id, next, null)
  if (next != null) scheduleMediaEmbed(userId, id)

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

/**
 * **Look at the photograph again, and overwrite what she can see in it.** R3's media half of "one
 * describe control everywhere": the vision-model button the unified panel mounts, one action for
 * BOTH kinds over `nina_message_images`.
 *
 * ── IT OVERWRITES, AND THAT IS THE DECISION, NOT AN OVERSIGHT ────────────────────────────────
 * `describeNinaAvatarAction` has always overwritten unconditionally — it is the album's "Describe
 * it" retry button and the same human is on both sides of the click. The panel pairs this action
 * with the hand-edit textarea, which is the way to correct a re-describe back; a confirmation
 * would be the second click R1's ruling forbids ("no need for all these bullshit confirmation").
 * The one guard that matters is a structural one instead: a reference row is refused below, so a
 * re-describe can never stamp prose onto a row that merely RE-SHOWS a photograph whose original
 * owns the truth.
 *
 * ── NO `kind` GUARD, ON PURPOSE ──────────────────────────────────────────────────────────────
 * Phase 2 lifted the describability refusals: his uploads are members of the Media folder with the
 * same verb set, and an operator describing one is the whole point of R1's "even images the user
 * uploaded manually". The reference check below is the only membership question this action asks —
 * `getNinaMessageImage` does not filter, so this is where the rule is enforced, exactly as
 * `removeChatPhotoAction` and `setChatPhotoAsAvatarAction` do at their own seams.
 *
 * ── THE SUBJECT FOLLOWS THE PHOTO ────────────────────────────────────────────────────────────
 * `photoSideOf` + `describeSubjectForSide` (both already imported here — Phase 2) — hers gets
 * `NINA_SELF_DESCRIBE_SYSTEM_PROMPT` (`scheduleChatPhotoCaption`'s HALF ONE already describes her
 * photographs this way; this is the manual button arriving at the same answer), his gets the
 * runner prompt. One helper, one suite.
 *
 * ── THE WRITE IS `setNinaMessageImageDescription`, NOT THE "CHAT PHOTO" EDIT ─────────────────
 * A vision pass that produced nothing writes nothing, and a NULL is not among its outcomes — the
 * exact reading `updateNinaChatPhotoDescription`'s docstring gives for why the `after()` pass uses
 * this statement and the operator's edit uses the other. This action IS an `after()`-pass-shaped
 * caller, so it takes the `after()`-pass-shaped statement. It also deliberately does NOT
 * re-caption the bubble: `editChatPhotoDescriptionAction`'s header owns that argument (*"Editing
 * what she SAW is not editing what she SAID"*) and this action changes the prose by machine
 * instead of by hand, which is the same category of change.
 *
 * `ADMIN_CHAT_PHOTOS_PATH` is what every action in this file revalidates; since Phase 2 it spells
 * `/admin/nina`, which is where the Media folder lives — this action inherits it by calling the
 * constant, never a literal.
 */
export async function describeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoDescribeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a photo id.' }
  const { id } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (isChatPhotoReference(row)) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Describe the original instead.',
    }
  }

  try {
    const { description } = await describeNinaImages(
      [{ blobUrl: row.blobUrl, pathname: row.pathname }],
      { subject: describeSubjectForSide(photoSideOf(row.kind)) },
    )
    /*
     * ── AND THE VECTOR, IN THE SAME UPDATE ──────────────────────────────────────────────────
     * `media-album-unified-search` R1, and `describeNinaAvatarAction`'s argument one table over:
     * this action OVERWRITES whatever was stored, so leaving the old vector in place would leave
     * the photo searchable under prose it just stopped having.
     *
     * IN BAND rather than `after()`, for that action's arithmetic: the operator is already waiting
     * ~8-11 s for the vision call they clicked, and an embedding is one small text request with no
     * image in it. `embedNinaMessageImageDescription` never throws — an embedding outage must not
     * turn a successful describe into a failed one; it answers `null`, the row is written
     * prose-with-no-vector, and phase 4's sweep picks it up.
     *
     * ── AND IT READS `search_keywords` WITHOUT WRITING IT ───────────────────────────────────
     * The keywords are the operator's correction of exactly this model's opinion, and a pass that
     * cleared them would erase the correction every time it was needed. The row's stored value is
     * read here and handed to the embedder so the new vector still carries the tags;
     * `setNinaMessageImageDescriptionAndEmbedding` sets two columns and `search_keywords` is not
     * one of them, so the omission is structural.
     *
     * The statement changes from `setNinaMessageImageDescription` to the embedding twin, and the
     * reason the old one was chosen still holds for its remaining caller: a vision pass that
     * produced nothing writes nothing, and NULL is not among this path's outcomes.
     */
    const embedding = await embedNinaMessageImageDescription(
      description,
      row.searchKeywords,
      userId,
    )
    const written = await setNinaMessageImageDescriptionAndEmbedding(
      userId,
      id,
      description,
      embedding,
    )
    if (!written) return { ok: false, error: 'That photo is not in the collection.' }

    revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
    return { ok: true, id, description }
  } catch (cause) {
    /* The floor tripping is its own class and is logged LOUDLY — `scheduleChatPhotoCaption`'s
     * posture: it means the vendor answered 200 with an image it silently dropped, and the text of
     * such a response is exactly where an invented description would be. Either way the operator
     * gets one retryable sentence and the stored prose is untouched. */
    if (cause instanceof NinaVisionTokenFloorError) {
      console.error('[f36] TOKEN FLOOR TRIPPED on a manual media describe', {
        id,
        pathname: row.pathname,
        message: cause.message,
      })
    } else {
      console.error('[f36] admin media describe failed', { id }, cause)
    }
    return { ok: false, error: 'The description call failed. Try again.' }
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
 * storing a perfectly good paragraph about it in a column that, at the time, nothing read back
 * into her context (`dbNinaSourceGateway.readMessageWindow` then mapped every window row to a
 * literal `imageDescriptions: []`; R3, 2026-09-10, made it carry the stored prose). The
 * multimodal call existed; its answer just was not reaching her — the caption below is still why
 * this function runs both halves.
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
 * `scheduleDescribe` (`lib/admin/ninaAlbumDeferredDescribe.ts`), same shape and same measurement.
 * Next dispatches Server Actions **one at a time per client** (the Server Actions guide, quoted at
 * `lib/nina/actions/describe.ts:51-53`), so an awaited pair would put ~15-25 s on every add, in series:
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
       * The subject follows the photograph's side: `photoSideOf('generated')` is 'hers', described
       * by the self witness (`NINA_SELF_DESCRIBE_SYSTEM_PROMPT` — the runner prompt would look for
       * a man who is not in the frame); one of HIS uploads is 'his', described by the runner
       * witness, because the subject of THAT photograph is him. `describeSubjectForSide` is the
       * pinned mapping; keeping it beside `photoSideOf` is what makes the two one edit apart. */
      let description = row.description
      if (description == null) {
        try {
          const result = await describeNinaImages(
            [{ blobUrl: row.blobUrl, pathname: row.pathname }],
            { subject: describeSubjectForSide(photoSideOf(row.kind)) },
          )
          description = result.description
          await setNinaMessageImageDescription(userId, id, description)
        } catch (cause) {
          /* The floor tripping is its own class and is logged LOUDLY: it means the vendor answered
           * 200 with an image it silently dropped, and the text of such a response is exactly where
           * an invented description would be. `lib/nina/actions/describe.ts:119-133` does this and
           * says why. Either way the caption is skipped and the pool line stands. */
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

/**
 * **The perceptual re-sign pass** — `after()` work that gives a freshly-landed or freshly-swapped
 * chat photograph its own signature, so the write-time twin scan can recognize its re-download.
 *
 * The ghost-signature defect (2026-09-15) had two halves and this is the second. The first — a
 * byte swap leaving the OLD signature standing — is fixed in `updateNinaChatPhotoBlob` (both
 * callers of this pass). The second was the gap behind it: an admin row landed UNSIGNED and
 * stayed that way until the next manual sweep run, dedup-inactive the whole time. Signing HERE
 * closes the gap the same way the send path does for its own claims ("every claim, twin or not,
 * carries its own signature onto the row it becomes"): the operator's bytes were PUT to Blob
 * before this action ran, so the only way the server can hold them is a GET of the URL it just
 * wrote — `fetchAndSignImage`, the ONE signer's fetch half.
 *
 * ── THE GUARD IS THE WHOLE POINT ─────────────────────────────────────────────────────────────
 * Between this pass's row read and its write, the operator can replace the photograph again —
 * two replaces in a minute is exactly what happened on production. Writing bytes-1's signature
 * onto a bytes-2 row would mint the very ghost this fix buries, so the write is
 * pathname-guarded: `updateNinaChatPhotoPerceptualSignature` lands only while the row still
 * serves the object that was fetched and signed. A racing replace makes this pass a no-op and
 * the racing pass owns the row.
 *
 * ── A REFERENCE IS SKIPPED, AND A FAILURE IS SILENT ─────────────────────────────────────────
 * The add path reaches this pass on its duplicate branches too (one unconditional call covers
 * both shapes), and a reference binds NULL by the column header's doctrine — its `blobUrl` is
 * the KEEPER's object, and a signature written here would be a fact about bytes the row does not
 * own. A failed GET or an undecodable body leaves the row unsigned — the same honest
 * dedup-inactive the sweep's `fill-perceptual` op owns later — and never fails the action that
 * scheduled it: the row is already committed, and `after()` turns a rejection into a log line.
 */
function scheduleChatPhotoResign(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaMessageImage(userId, id)
      /* Gone between the click and the callback. A miss, not a failure. */
      if (row == null) return
      /* A reference renders the KEEPER's object and binds NULL by doctrine — see
       * `NinaImageInsert.perceptualHash`'s header. Nothing about this pass may change that. */
      if (row.sourceAvatarId != null || row.sourceImageId != null) return

      const signature = await fetchAndSignImage(row.blobUrl)
      /* `null` is the fetch ladder's "cannot sign" — bad URL, failed GET, undecodable body. The
       * row stays unsigned and dedup-inactive, which is the degradation the column header
       * defines; the sweep's fill-perceptual op owns filling it eventually. */
      if (signature == null) {
        console.warn('[admin] chat photo re-sign could not measure the new bytes', {
          id,
          pathname: row.pathname,
        })
        return
      }

      /* Pathname-guarded: a no-op unless the row still serves what was just signed. */
      const written = await updateNinaChatPhotoPerceptualSignature(userId, id, row.pathname, {
        dhashHex: signature.dhashHex,
        sig16Base64: signature.sig16Base64,
      })
      if (written) {
        console.log('[admin] signed a chat photo for the twin scan', { id })
      }
    } catch (cause) {
      /* The outer net, `scheduleChatPhotoCaption`'s shape: the bytes are committed whatever this
       * pass does, and an unsigned row is one sweep run from correct. */
      console.warn('[admin] chat photo re-sign pass failed', { id, error: String(cause) })
    }
  })
}
