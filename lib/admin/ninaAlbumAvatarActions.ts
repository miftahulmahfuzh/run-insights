'use server'

import { put } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

import {
  ADMIN_AVATAR_EXTS,
  adminAvatarPathname,
  contentTypeForAvatarExt,
  type AdminAvatarExt,
} from '@/lib/admin/avatars'
import { ADMIN_CHAT_PHOTOS_PATH } from '@/lib/admin/chatPhotos'
import { chatPhotoSetAvatarSchema } from '@/lib/admin/chatPhotoSchema'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { scheduleDescribe } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { avatarIdSchema, cropWriteSchema } from '@/lib/admin/schema'
import { newId } from '@/lib/id'
import { clampCrop, cropForWrite, isIdentityCrop, resolveCrop } from '@/lib/nina/crop'
import {
  deleteNinaAvatar,
  getNinaAvatar,
  getNinaAvatarBySourceKey,
  getNinaMessageImage,
  insertNinaAvatars,
  setCurrentNinaAvatar,
  updateNinaAvatarCrop,
  type NinaAvatarRow,
  type NinaImageRow,
} from '@/lib/nina/queries'
import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import { promoteNinaAvatarDependents } from '@/lib/nina/provenancePromotion'

/**
 * The face itself: make a photograph hers, keep her in it, reframe it, and take it away.
 *
 *   · `setCurrentNinaAvatarAction` promotes an album row to current.
 *   · `setChatPhotoAsAvatarAction` adopts a chat photograph — the bytes are copied, not shared.
 *   · `saveNinaAvatarCropAction` saves the framing an operator dragged.
 *   · `deleteNinaAvatarAction` removes one photo — promoting anything that re-shows it first, and
 *     then releasing its blob(s) only if nothing else still points at them.
 *
 * The bulk forms of move and remove live in `lib/admin/ninaAlbumFolderActions.ts`; the deferred
 * describe that promotion schedules lives in `lib/admin/ninaAlbumDeferredDescribe.ts`. The
 * adoption helpers (`copyChatPhotoIntoAlbum`, `avatarExtFor`) stay private here because a
 * `'use server'` module exports actions, not predicates or copy routines
 * (`lib/nina/album.ts:144-148` states the rule). Nothing outside the layer imports this module;
 * everything reaches it through the `lib/admin/ninaAlbumActions.ts` barrel.
 */

/**
 * "Set as her profile photo" — R23, verbatim. Re-arms `announced_at`, so she comments on the
 * change (RU-17) via phase 10's trigger. Idempotent when the row is already current.
 *
 * ── AND IT IS NOW ONE OF THE TWO PLACES A DESCRIPTION IS EARNED ─────────────────────────────
 * The describe pre-pass used to run on upload. It runs here instead, because this is the moment
 * `nina_avatars.description` becomes readable by anything: invariant 5 says the description is her
 * prompt's private input, and her prompt reads the CURRENT avatar. A photo sitting in a folder is
 * read by nobody. `scheduleDescribe` is `after()`-based and skips a row that already has a
 * description, so promoting an old, already-described photo costs one indexed read and no vendor
 * call.
 */
export async function setCurrentNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const changed = await setCurrentNinaAvatar(userId, parsed.data)
  if (!changed) return { ok: false, error: 'That photo is not in the album.' }

  scheduleDescribe(userId, parsed.data)

  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * "Set as her profile picture", from a CHAT photograph — the reverse of F37's share. The
 * `/admin/photos` rail's framing panel sends a chat-photo id and its whole crop draft; this makes
 * the photograph hers, exactly as `setCurrentNinaAvatarAction` does for an album row.
 *
 * ── THE BYTES ARE COPIED, NOT SHARED, AND THAT IS THE DECISION ────────────────────────────────
 * The two candidate designs were a `nina_avatars` row pointing at the chat photo's object, and
 * this: `fetch` + `put` into a fresh `avatar-` object. Sharing would win on storage and lose on
 * everything else. The original argument was that the album-side deletes called `del` with NO
 * reference check, so a shared object would break the day the operator removed the album row —
 * that half is fixed (the ghost-photo fix routes this file's delete through
 * `releaseBlobIfUnreferenced` and `reapAvatarBlobs` through `isBlobPathnameReferenced`), and the
 * decision survives it unchanged for the reasons that were always the stronger ones: a copy gives
 * the album row its OWN lifetime, its own folder and its own framing, so re-cropping her profile
 * picture cannot re-crop a photograph sitting in a conversation, and deleting either side cannot
 * turn the other into a row whose bytes are kept alive only by someone else's reference. A copy
 * costs one duplicate object (~100-500 KB). The adopted row also appears in `/admin/nina` (root
 * folder), where its framing can be re-tuned — which is a feature, not a leak.
 *
 * ── RE-ADOPTION IS A CONSTRAINT DECISION, NOT A COUNT ────────────────────────────────────────
 * The row is written with `source_key = 'chat-photo:<imageId>'`, so a second "set as her profile
 * picture" finds the FIRST adoption through `getNinaAvatarBySourceKey` before any bytes move and
 * just re-currents it — a re-frame-and-re-wear click costs one UPDATE, not a second copy. The
 * `nina_avatars_user_source_key_unq` index is the backstop for the race the lookup cannot close:
 * if the INSERT lands `ON CONFLICT DO NOTHING`, the copy is re-read by key and the orphaned
 * object joins the reaper's domain, the same exposure every upload already has.
 *
 * ── THE GUARDS ARE REPLACE'S AND REMOVE'S, VERBATIM ──────────────────────────────────────────
 * `getNinaMessageImage` deliberately does not filter (it is the bubble and viewer read too), so
 * this action enforces here what Replace and Remove enforce at their own seams. The old
 * `kind !== 'generated'` refusal is gone with the merge — one of HIS uploads is adoptable like any
 * other original, which is R1's literal ask ("bahkan image yang diupload user secara manual di
 * chat session bisa ... di jadiin profpic nina juga"). What still refuses, before any bytes move,
 * is a row carrying `source_avatar_id`/`source_image_id`: a re-SHOW of a photograph that lives
 * elsewhere, and adopting it would file a second copy of bytes the original still owns.
 * `isChatPhotoReference` stays private to `lib/admin/chatPhotoActions.ts` (a `'use server'` module
 * exports actions, not predicates), so the two-field test is spelled here; the actions' refusals
 * stay one rule by tests, not by imports.
 *
 * ── THE DESCRIPTION IS SEEDED, AND ONLY A NULL EARNS A VENDOR CALL ───────────────────────────
 * `insertNinaAvatars` writes the chat row's own `description` into the album row — the same
 * bytes `glm-4.6v` already described, so promoting a described photograph costs no second call
 * and no second token-floor exposure. A NULL description behaves exactly as it does on the
 * album path: `scheduleDescribe` fills it after the response, non-fatally.
 */
export async function setChatPhotoAsAvatarAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoSetAvatarSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That framing is out of range.' }
  const { id, scale, x, y } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Make the original hers instead.',
    }
  }

  /*
   * The schema can only reject nonsense; the clamp against the row's REAL dimensions is what
   * guarantees the stored numbers keep the circle covered — `saveNinaAvatarCropAction`'s
   * server-side guarantee, same reason. Identity stays three NULLs by never being written: the
   * fresh row's crop columns default to NULL and `isIdentityCrop` skips the UPDATE.
   */
  const crop = clampCrop({ width: row.width, height: row.height }, resolveCrop({ scale, x, y }))
  const sourceKey = `chat-photo:${row.id}`

  let avatar = await getNinaAvatarBySourceKey(userId, sourceKey)
  if (avatar == null) {
    avatar = await copyChatPhotoIntoAlbum(userId, row, sourceKey)
  }
  if (avatar == null) {
    return { ok: false, error: 'The copy into her album did not land. Try again.' }
  }

  if (!isIdentityCrop(crop)) {
    await updateNinaAvatarCrop(userId, avatar.id, cropForWrite(crop))
  }

  await setCurrentNinaAvatar(userId, avatar.id)
  /*
   * UNCONDITIONAL, since `admin-album-semantic-search`. The `if (avatar.description == null)`
   * guard that used to be here was a caller's guess at whether work was needed, and the seeding
   * two paragraphs up is exactly what made it wrong: `copyChatPhotoIntoAlbum` writes the CHAT
   * row's description into the album row, and a chat row has never carried a
   * `description_embedding`. Guarded, that photograph would be described (it already is) and never
   * embedded — permanently invisible to R2's search, with nothing in the album to indicate it.
   *
   * `scheduleDescribe` re-reads the row inside its `after()` and decides for itself: prose and
   * vector both present is an authoritative skip with no vendor call, which is the property its
   * own docstring has always claimed ("the skip is authoritative at the moment the work would
   * actually run"). Deleting the guard restores that claim rather than weakening it.
   */
  scheduleDescribe(userId, avatar.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: avatar.id }
}

/**
 * `fetch` the chat photograph and `put` it beside her album as `avatar-`, then insert the row.
 * BYTES FIRST, ROWS SECOND — the create-side mirror of "row first, blob second": a failed copy
 * writes nothing, while a failed insert at worst leaves an orphan object, which is the recoverable
 * direction and `scripts/blob-reap.mjs`'s domain. Not exported: a `'use server'` module may export
 * only async actions, and this is a helper with a caller.
 *
 * The row records `put`'s RETURN, never the requested pathname — `addRandomSuffix: true` rewrites
 * it, and a row pointing at the requested form would point at an object that does not exist.
 */
async function copyChatPhotoIntoAlbum(
  userId: string,
  row: NinaImageRow,
  sourceKey: string,
): Promise<NinaAvatarRow | null> {
  const ext = avatarExtFor(row.pathname)
  if (ext == null) return null

  /*
   * `describeNinaAvatarAction`'s posture for a vendor-shaped call inside an action: the failure is
   * caught here and reported as one `{ ok: false }` sentence, not thrown — an unhandled rejection
   * in a Server Action is a framework error page, and "the store could not be reached" is an
   * operator-actionable state, not a bug report.
   */
  try {
    const response = await fetch(row.blobUrl)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()

    const stored = await put(adminAvatarPathname(userId, newId(), ext), bytes, {
      access: 'public',
      addRandomSuffix: true,
      contentType: contentTypeForAvatarExt(ext),
    })

    const [inserted] = await insertNinaAvatars(userId, [
      {
        blobUrl: stored.url,
        pathname: stored.pathname,
        source: 'admin',
        folder: '',
        filename: null,
        sourceKey,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        description: row.description,
      },
    ])
    if (inserted != null) return inserted

    // The unique index raced the lookup — another tab adopted this photograph between the read
    // and the insert. The album row is what the operator meant; the second copy is the reaper's.
    return getNinaAvatarBySourceKey(userId, sourceKey)
  } catch (cause) {
    console.error(
      '[f34] chat-photo adoption copy failed',
      { id: row.id, pathname: row.pathname },
      cause,
    )
    return null
  }
}

/** The container a chat photograph arrives in, or `null` if it is not one the album accepts. */
function avatarExtFor(pathname: string): AdminAvatarExt | null {
  const ext = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase()
  return (ADMIN_AVATAR_EXTS as readonly string[]).includes(ext) ? (ext as AdminAvatarExt) : null
}

/**
 * Save the framing the operator just dragged — R23's whole point.
 *
 * **`clampCrop` runs again here, server-side, against the row's real `width`/`height`.** The Zod
 * schema cannot know the aspect ratio, so it can only reject nonsense; this is what guarantees the
 * stored numbers keep the circle covered no matter what a hand-crafted POST claims. An identity
 * crop is written as three NULLs by `cropForWrite`, which is how "Reset framing" and "Save
 * framing" stay one code path — phase 1's `updateNinaAvatarCrop` docstring promises exactly that.
 */
export async function saveNinaAvatarCropAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = cropWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That framing is out of range.' }

  const row = await getNinaAvatar(userId, parsed.data.id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  const clamped = clampCrop(
    { width: row.width, height: row.height },
    resolveCrop({ scale: parsed.data.scale, x: parsed.data.x, y: parsed.data.y }),
  )
  const saved = await updateNinaAvatarCrop(userId, row.id, cropForWrite(clamped))
  if (!saved) return { ok: false, error: 'That photo is not in the album.' }
  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Remove a photo from the album — and its blob with it, unless something else is still rendering
 * those exact bytes.
 *
 * ── PROMOTE, THEN DELETE THE ROW, THEN ASK, THEN `del` ──────────────────────────────────────
 * Three steps and the order of all three is load-bearing:
 *
 *   1. **Promote first.** A `nina_message_images` row can re-show this album photograph
 *      (`source_avatar_id` naming it) with no measurements of its own. The FK is
 *      `ON DELETE SET NULL`, so the delete below turns it into an "original" that no dedup
 *      mechanism can ever see — unless it is measured first, which is exactly what
 *      `promoteNinaAvatarDependents` does, and which can only be done while this id still links
 *      them. It cannot fail this action: every failure inside it degrades to today's behaviour and
 *      logs (see that module's header).
 *   2. **Row first, blob second.** Unchanged and for the unchanged reason: a failed `del` leaves
 *      an orphaned object, which is recoverable (`scripts/blob-reap.mjs`, and
 *      `reap-orphaned-blobs`), while a deleted blob under a live row is a permanently broken image.
 *   3. **Ask before deleting the bytes.** THIS IS NEW, and it is the second half of the
 *      ghost-photo fix. This action's `del` used to be unconditional, which is very probably how
 *      the production row found on 2026-09-16 came to point at a 404: the album row was deleted
 *      and a chat bubble was still rendering those exact bytes. `releaseBlobIfUnreferenced` is the
 *      ONE reference-checked release in the repo (`lib/nina/blobRelease.ts`) and this file now
 *      deletes through it rather than re-implementing the rule — *"a second copy of a delete rule
 *      is how the copy becomes the one that forgot the check"*, its own header. It is safe to ask
 *      AFTER the row is gone, and only then: this row has stopped referencing the object, so there
 *      is no "except this one" parameter to pass wrongly.
 *
 * ── TWO OBJECTS, TWO QUESTIONS, TWO RELEASES ────────────────────────────────────────────────
 * A row can carry a derived thumbnail (`nina_avatars.thumb_url`, F34 R1) and the row is the only
 * record it exists — its stored pathname carries Blob's random suffix and is not derivable — so a
 * delete that released one ref would leak an object nothing could ever find again. Both fields are
 * NULL for every pre-F34 row, and NULL means "there is nothing to delete", not "something went
 * wrong".
 *
 * This is the one place the previous `del([original, thumb])` becomes two calls, and that is the
 * cost of the check: the question "is anything still pointing at these bytes" is asked per OBJECT,
 * and the two objects have different answers (a chat row can reference the full-size photograph
 * while nothing on earth references its album thumbnail). One `del` of both would have to take the
 * weaker of the two answers for both.
 *
 * The current photo cannot be removed: `deleteNinaAvatar`'s WHERE clause refuses it, which is what
 * makes "zero current avatars" unreachable rather than repaired. A refused delete has already run
 * the promotion, and that is deliberately not defended against: the measurements written are true
 * statements about bytes those rows already serve, the sweep would have written them anyway
 * (`scripts/nina-dedupe-plan.mjs` hashes every row, references included), and both dedup reads
 * filter references — so the only cost is a GET that bought nothing. Buying a pre-read to avoid it
 * would cost one every time, for the common case that succeeds.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  /* STEP 1 — while `parsed.data` still links them. Never throws; see the module's header. */
  await promoteNinaAvatarDependents(userId, [parsed.data])

  /* STEP 2 — the row. This is the statement inside which `ON DELETE SET NULL` fires. */
  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  /* STEP 3 — the bytes, per object, and only if nothing else names them. */
  await releaseBlobIfUnreferenced(userId, {
    blobUrl: removed.blobUrl,
    pathname: removed.pathname,
  })
  if (removed.thumbUrl != null) {
    /* `thumb_pathname` and `thumb_url` are written together by `registerNinaAvatarsAction`, so a
     * URL with no pathname is not a state this table produces. If one ever appeared, asking about
     * the URL under both parameters is still a correct question — `isBlobPathnameReferenced` ORs
     * the pathname columns with the URL columns, and a pathname that matches nothing simply
     * contributes nothing to the answer. */
    await releaseBlobIfUnreferenced(userId, {
      blobUrl: removed.thumbUrl,
      pathname: removed.thumbPathname ?? removed.thumbUrl,
    })
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
