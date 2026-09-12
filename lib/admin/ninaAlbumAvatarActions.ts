'use server'

import { del, put } from '@vercel/blob'
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

/**
 * The face itself: make a photograph hers, keep her in it, reframe it, and take it away.
 *
 *   · `setCurrentNinaAvatarAction` promotes an album row to current.
 *   · `setChatPhotoAsAvatarAction` adopts a chat photograph — the bytes are copied, not shared.
 *   · `saveNinaAvatarCropAction` saves the framing an operator dragged.
 *   · `deleteNinaAvatarAction` removes one photo, and its blob(s) with it.
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
 * everything else, because the album-side deletes (`deleteNinaAvatarAction`, `reapAvatarBlobs`)
 * call `del` with NO reference check — the reference-checked release
 * (`releaseBlobIfUnreferenced`) exists on the CHAT side only. A shared object would survive
 * every chat-side delete and then break the day the operator removed the album row: a dead
 * photograph in the conversation, unrecoverable. A copy costs one duplicate object (~100-500 KB)
 * and makes both sides' existing delete rules correct with nothing changed on either. The
 * adopted row also appears in `/admin/nina` (root folder), where its framing can be re-tuned —
 * which is a feature, not a leak.
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
  if (avatar.description == null) scheduleDescribe(userId, avatar.id)

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
 * Remove a photo from the album, and its blob with it.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * A failed `del` leaves an orphaned object, which is recoverable (and is what
 * `scripts/blob-reap.mjs` exists for, once it is taught the `nina/` prefix — ruling D4's one
 * follow-up card). A deleted blob under a live row is a permanently broken image in her album. So
 * the row goes first and the `del` is best-effort, logged rather than surfaced.
 *
 * The current photo cannot be removed: `deleteNinaAvatar`'s WHERE clause refuses it, which is what
 * makes "zero current avatars" unreachable rather than repaired.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  /*
   * ROW FIRST, BLOB SECOND, BEST-EFFORT — and TWO objects now, not one.
   *
   * The order and the swallow are unchanged and the original argument still holds: a failed `del`
   * leaves an orphaned object, which is recoverable (and is what `scripts/blob-reap.mjs` exists
   * for, once it is taught the `nina/` prefix — ruling D4's one follow-up card), while a deleted
   * blob under a live row is a permanently broken image in her album.
   *
   * What is new is the thumbnail (F34 R1). `nina_avatars.thumb_url` is written by
   * `registerNinaAvatarsAction` (`lib/admin/ninaAlbumUploadActions.ts`), and the ROW is the only
   * record that the object exists — its stored pathname carries Blob's random suffix and is not
   * derivable — so a delete that removed one ref would leak an object nothing could ever find
   * again. Both fields are NULL for every pre-F34 row and for any row whose canvas encode failed,
   * and NULL means "there is nothing to delete" rather than "something went wrong".
   *
   * One `del([...])` and not two calls: `del` takes an array, both objects belong to the same
   * photo, and a partial success here has no meaning worth reporting separately — either the
   * photo's objects are gone or a `[f34]` line names the ones that are not.
   */
  const orphans = removed.thumbUrl == null ? [removed.blobUrl] : [removed.blobUrl, removed.thumbUrl]
  try {
    await del(orphans)
  } catch (cause) {
    console.error('[f34] row deleted, blob(s) left behind', orphans, cause)
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
