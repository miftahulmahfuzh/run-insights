'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import {
  chatPhotoAddSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import {
  ADMIN_CHAT_PHOTOS_PATH,
  isAdminChatPhotoPathname,
  isNinaPhotoCarrierMessage,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { newId } from '@/lib/id'
import { ninaImageCaption } from '@/lib/nina/imagefail'
import {
  deleteNinaMessage,
  deleteNinaMessageImage,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  insertNinaMessageImages,
  insertNinaMessages,
  isBlobPathnameReferenced,
  setNinaMessageImageDescription,
  updateNinaChatPhotoBlob,
} from '@/lib/nina/queries'
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { describeNinaImages } from '@/lib/nina/vision'

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
 * through `releaseChatPhotoBlob`, which asks `isBlobPathnameReferenced` first. Invariant 8 (no
 * orphaned blobs) yields to that: an orphan costs storage, a deleted-but-referenced object is
 * visible data loss.
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────────────────────
 *  · It writes no new `kind`, no new `NinaMessageSource` and no admin column. A photograph added
 *    here is indistinguishable downstream from one `finishSelfie` wrote (invariant 7); the phase
 *    plan's D1 justifies every column value.
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
 */
export async function replaceChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoReplaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { id, blobUrl, pathname, width, height, bytes } = parsed.data

  if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }

  const updated = await updateNinaChatPhotoBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
  })
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  let note: string | undefined
  if (existing.pathname !== pathname) {
    const outcome = await releaseChatPhotoBlob(userId, existing)
    if (outcome === 'shared') note = 'The old file is still used elsewhere, so it was kept.'
  }

  scheduleChatPhotoDescribe(userId, id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id, ...(note === undefined ? {} : { note }) }
}

/* ── ADD ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * *"add a new photo (so it is like nina generated them, but actually it is manually added by
 * user)"* — a literal specification of the storage shape, and this writes exactly the pair
 * `finishSelfie` writes (`scripts/nina-image-worker.ts:427`).
 *
 * `nina_message_images.message_id` is `NOT NULL` and the column's own comment says why — *"an image
 * with no message is nothing"* — so there is no floating chat photo and "add a photo" is
 * unavoidably "add a message with a photo on it". No third shape is invented.
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
 * `description` is NULL at insert and earned below, because a hand-uploaded photograph has no
 * generation prompt and `glm-4.6v` is the only thing that can say what is in it.
 */
export async function addChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoAddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { blobUrl, pathname, width, height, bytes } = parsed.data

  if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

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
      blobUrl,
      pathname,
      width,
      height,
      bytes,
      description: null,
      prompt: null,
      sortOrder: 0,
    },
  ])

  /*
   * `[]` IS NOT SUCCESS. `insertNinaMessageImages` validates the message FK by hand and returns an
   * empty array on a mismatch rather than throwing. Leaving it there would put a caption bubble with
   * no picture in the runner's chat forever — the exact defect `removeChatPhotoAction` exists to
   * prevent — so the message is undone and the object we just uploaded is released with it. The
   * release goes through the same helper as everything else: this object is brand new and carries a
   * random suffix, so nothing can reference it, but a delete path that is uniform is a delete path
   * that cannot be the one that forgot to check.
   */
  if (image == null) {
    await deleteNinaMessage(userId, message.id)
    await releaseChatPhotoBlob(userId, { blobUrl, pathname })
    return { ok: false, error: 'The photo could not be attached to a message.' }
  }

  scheduleChatPhotoDescribe(userId, image.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: image.id }
}

/* ── REMOVE ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Take a photograph out of the collection, its Blob object with it when nothing else needs it —
 * and, when the message existed only to carry it, the message too.
 *
 * ── THE EMPTY BUBBLE, RESOLVED ──────────────────────────────────────────────────────────────
 * `finishSelfie`'s message exists ONLY to carry the photograph, so removing its last image would
 * leave a caption bubble with no picture in the runner's chat, forever. When this is the last image
 * on such a message, the MESSAGE is deleted and `nina_message_images.message_id`'s
 * `ON DELETE CASCADE` takes the image row with it — one statement, and the order is Postgres's
 * rather than two statements with a crash window between them.
 *
 * It must NOT delete a RUNNER message that merely carried her re-attached photograph
 * (`lib/nina/actions.ts:518-530`, the R26 path): that message is his and carries his text. Both
 * clauses of that rule live in `isNinaPhotoCarrierMessage` and are argued at its definition.
 *
 * ── ROW FIRST, BLOB SECOND, AND ONLY IF NOTHING ELSE POINTS AT IT ───────────────────────────
 * The same R26 path that produced the runner-message case also produced the SHARED-OBJECT case: it
 * copies `blob_url`/`pathname` rather than bytes, so the object behind this row may also be behind
 * another chat row or a `nina_avatars` row — possibly her current profile picture.
 * `releaseChatPhotoBlob` asks first. Deleting the row before asking is what makes the question
 * answerable without an exclusion parameter.
 */
export async function removeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a photo id.' }
  const { id } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }

  const [message, siblings] = await Promise.all([
    getNinaMessagesByIds(userId, [row.messageId]).then((rows) => rows[0] ?? null),
    getNinaMessageImagesForMessages(userId, [row.messageId]),
  ])
  const isLastImage = siblings.every((sibling) => sibling.id === id)

  if (isLastImage && message != null && isNinaPhotoCarrierMessage(message)) {
    const gone = await deleteNinaMessage(userId, message.id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  } else {
    const gone = await deleteNinaMessageImage(userId, id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  }

  const outcome = await releaseChatPhotoBlob(userId, row)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(outcome === 'shared'
      ? { note: 'The file is still used elsewhere, so it was kept in the store.' }
      : {}),
  }
}

/* ── The two helpers ─────────────────────────────────────────────────────────────────────── */

/**
 * **Delete a Blob object we have just stopped pointing at — but only if nothing else points at
 * it.** The one place `del` is called in this file, so Replace and Remove cannot drift.
 *
 * ── WHY THE CHECK EXISTS ────────────────────────────────────────────────────────────────────
 * `resolveAttachment` (`lib/nina/actions.ts:143-192`) implements R26 by copying `blob_url` and
 * `pathname` onto a new row. No bytes are copied. So one object can be behind a chat row AND
 * another chat row AND a `nina_avatars` row — including the one that IS her current profile
 * picture. An unconditional `del` here blanks her face, or an older bubble, while the rows still
 * point at a dead URL. `isBlobPathnameReferenced` asks both tables, scoped by `user_id`, over the
 * same six columns `scripts/blob-reap.mjs` counts references in.
 *
 * ── WHY IT IS SAFE TO ASK AFTER THE ROW IS GONE ─────────────────────────────────────────────
 * Because that is the ONLY time it is safe to ask. Every caller has already removed its own
 * reference — Remove deleted the row (or the message, whose cascade deleted it), Replace repointed
 * the row at the new pathname — so the row being changed is out of the answer by construction, and
 * there is no "except this one" parameter that a future caller could pass wrongly.
 *
 * ── WHAT IT COSTS WHEN IT SAYS "SHARED" ─────────────────────────────────────────────────────
 * The object stays in the store while the row that named it is gone. That is a deliberate orphan
 * class and `reap-orphaned-blobs` is its backstop — which is what a backstop is for. The
 * alternative is unrecoverable data loss, and invariant 8 does not outrank that.
 *
 * `'failed'` is logged, not surfaced: a `del` that 500s leaves an orphan, which is recoverable, and
 * the operator asked for the photograph to leave the collection, which it has.
 */
async function releaseChatPhotoBlob(
  userId: string,
  ref: { blobUrl: string; pathname: string },
): Promise<'deleted' | 'shared' | 'failed'> {
  let shared: boolean
  try {
    shared = await isBlobPathnameReferenced(userId, ref.pathname, ref.blobUrl)
  } catch (cause) {
    // Could not prove it is unreferenced, so do not delete it. Erring toward an orphan is the only
    // direction that is recoverable.
    console.error('[f36] could not check blob references; keeping the object', ref.pathname, cause)
    return 'failed'
  }

  if (shared) {
    console.info('[f36] blob kept: another row still points at it', ref.pathname)
    return 'shared'
  }

  try {
    await del(ref.blobUrl)
    return 'deleted'
  } catch (cause) {
    console.error('[f36] row gone, blob left behind', ref.pathname, cause)
    return 'failed'
  }
}

/**
 * Fill in a missing description AFTER the response has gone out. Not exported: a `'use server'`
 * module may export only async functions, and this is a synchronous scheduler.
 *
 * ── WHY IT RUNS AT ALL ──────────────────────────────────────────────────────────────────────
 * A GENERATED photograph gets its `description` from `args.scene` — we wrote the picture, so we
 * already know what is in it. A hand-uploaded one has no prompt, and `glm-4.6v` is the only way the
 * column is ever filled for it. That is the whole difference between the two paths, and it is why
 * leaving the column NULL forever would make an admin-added row DISTINGUISHABLE from a generated
 * one in the one way that matters downstream: `lib/nina/gateway.ts:162` puts this text in Nina's
 * context window and `lib/nina/actions.ts:604` feeds it to her on the send path. Invariant 7 is
 * satisfied by filling it, not by skipping it. Invariant 5 still holds: the prose is private, only
 * `/admin` may display it, and nothing it renders reaches a runner-facing caption.
 *
 * ── WHY `after()` AND NOT `await` ───────────────────────────────────────────────────────────
 * `lib/admin/ninaAlbumActions.ts:300-320`'s `scheduleDescribe`, same shape and same measurement: a
 * describe call is ~8-11 s (`NINA_DESCRIBE_TIMEOUT_MS = 25_000`), and Server Actions dispatch one at
 * a time per client — so an awaited call would put that latency on every replace and every add, in
 * series. Non-fatal by design: the row exists, the grid renders, and a failure leaves a NULL that
 * the send path already substitutes `NINA_DESCRIPTION_UNAVAILABLE` for.
 *
 * ── WHY IT RE-READS THE ROW INSIDE THE CALLBACK ─────────────────────────────────────────────
 * So the caller pays nothing, and so the skip is authoritative at the moment the work would run — a
 * row removed between the click and the callback is a miss, not a vendor call.
 *
 * No `revalidatePath` in here: `after()` runs once the response is finished, so there is no
 * re-render left to attach to.
 */
function scheduleChatPhotoDescribe(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaMessageImage(userId, id)
      if (row == null || row.description != null) return
      const { description } = await describeNinaImages([
        { blobUrl: row.blobUrl, pathname: row.pathname },
      ])
      await setNinaMessageImageDescription(userId, id, description)
    } catch (cause) {
      console.warn('[f36] chat photo describe failed; the row keeps a null description', {
        id,
        error: String(cause),
      })
    }
  })
}
