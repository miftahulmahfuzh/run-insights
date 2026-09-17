'use server'

import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTOS_PATH } from '@/lib/admin/chatPhotos'
import { chatPhotoSetAvatarSchema } from '@/lib/admin/chatPhotoSchema'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { scheduleDescribe } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { scheduleMediaDescribe } from '@/lib/admin/ninaMediaDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { avatarIdSchema, cropWriteSchema } from '@/lib/admin/schema'
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
 *   · `setChatPhotoAsAvatarAction` adopts a chat photograph — as a LINK, not a copy.
 *   · `saveNinaAvatarCropAction` saves the framing an operator dragged.
 *   · `deleteNinaAvatarAction` removes one photo — promoting anything that re-shows it first, and
 *     then releasing its blob(s) only if nothing else still points at them.
 *
 * The bulk forms of move and remove live in `lib/admin/ninaAlbumFolderActions.ts`; the deferred
 * describe that promotion schedules lives in `lib/admin/ninaMediaDeferredDescribe.ts` (the MEDIA
 * one — a pointer row never earns a vector of its own). The adoption helper
 * (`linkChatPhotoIntoAlbum`) stays private here because a `'use server'` module exports actions,
 * not predicates or insert routines (`lib/nina/album.ts:144-148` states the rule). Nothing outside
 * the layer imports this module; everything reaches it through the
 * `lib/admin/ninaAlbumActions.ts` barrel.
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
 * "Set as her profile picture", from a CHAT photograph — the reverse of F37's share. The Media
 * pane's framing panel sends a chat-photo id and its whole crop draft; this makes the photograph
 * hers, exactly as `setCurrentNinaAvatarAction` does for an album row.
 *
 * ══ THE BYTES ARE SHARED, NOT COPIED. THE OLD DECISION IS REVERSED, ON PURPOSE. ═════════════
 * This function used to `fetch` the chat photograph and `put` a fresh `avatar-` object, and its
 * docstring argued for that at length. **That argument is withdrawn** by the user's own input
 * (`media-album-unified-search` R3): *"if admin set a picture from Media, we wouldn't copy paste a
 * new duplicate image into Album directory … the image in Album is just a pointer to the real file
 * in Media … this way, storage usage will be lower, and editing image description, search keyword,
 * negative keyword in one place will automatically synchronize it with other location."*
 *
 * The old decision's two stated reasons are both answered by mechanisms that have nothing to do
 * with whether bytes are copied, which is why reversing it reopens neither:
 *
 *   · *"its own framing"* — `crop_scale`/`crop_x`/`crop_y` are this row's OWN columns and stay so.
 *     Re-cropping her profile picture still cannot re-crop the bubble; the crop was never in the
 *     bytes.
 *   · *"deleting either side cannot turn the other into a row whose bytes are kept alive only by
 *     someone else's reference"* — `releaseBlobIfUnreferenced`/`isBlobPathnameReferenced` already
 *     do reference-checked shared-blob deletion across BOTH tables, and this set adds the two
 *     guards that close the row-level half: `deleteNinaAvatarAction` releases nothing for a
 *     pointer (it never owned the object) and `removeChatPhotoAction` refuses to delete a Media
 *     row an album pointer still names (`source_image_id` is `ON DELETE RESTRICT`).
 *
 * A live cross-table read with no copy is already proven in production by
 * `resolveNinaPhotoReference` (`lib/nina/queries/imageprefs.ts`), which resolves a stored
 * `{source, id}` against whichever table `source` names, at generation time, copying nothing.
 *
 * ── AND THE POINTER ROW CARRIES NO PROSE OF ITS OWN ─────────────────────────────────────────
 * `description` is deliberately NOT seeded from the chat row any more — the line that did it is
 * gone rather than kept. A pointer row's `description`, `search_keywords`,
 * `negative_search_keywords` and `description_embedding` are all permanently NULL and the truth
 * lives on the Media row (`lib/nina/queries/avatarPointer.ts`). That is what makes R3's *"editing
 * in one place automatically synchronize"* true by construction rather than by a sync mechanism
 * that could get it wrong.
 *
 * ── RE-ADOPTION IS STILL A CONSTRAINT DECISION ──────────────────────────────────────────────
 * Unchanged: the row is written with `source_key = 'chat-photo:<imageId>'`, so a second click
 * finds the first adoption through `getNinaAvatarBySourceKey` and just re-currents it, and
 * `nina_avatars_user_source_key_unq` is the backstop for the race the lookup cannot close. What
 * changes is the cost of losing that race: nothing. There is no orphaned object to reap any more,
 * because no object was minted.
 *
 * ── THE GUARDS ARE REPLACE'S AND REMOVE'S, VERBATIM ─────────────────────────────────────────
 * Unchanged. `getNinaMessageImage` deliberately does not filter (it is the bubble and viewer read
 * too), so this action enforces here what Replace and Remove enforce at their own seams: a row
 * carrying `source_avatar_id`/`source_image_id` is a re-SHOW, and pointing an album entry at a
 * pointer would be a link to a link.
 *
 * ── AND THE DESCRIBE IT SCHEDULES IS THE **MEDIA** ONE ──────────────────────────────────────
 * `scheduleMediaDescribe(userId, row.id)`, not `scheduleDescribe(userId, avatar.id)`. The pointer
 * row will never carry a vector, so scheduling the album worker on it would be a read that finds
 * a NULL description it must not invent prose for, every single time. The row that needs prose and
 * a vector is the MEDIA row — and after this phase that row is the one the merged search ranks,
 * so this is also what makes a freshly-promoted photograph findable at all.
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
   * server-side guarantee, same reason. Identity stays three NULLs by never being written.
   */
  const crop = clampCrop({ width: row.width, height: row.height }, resolveCrop({ scale, x, y }))
  const sourceKey = `chat-photo:${row.id}`

  let avatar = await getNinaAvatarBySourceKey(userId, sourceKey)
  if (avatar == null) {
    avatar = await linkChatPhotoIntoAlbum(userId, row, sourceKey)
  }
  if (avatar == null) {
    return { ok: false, error: 'The link into her album did not land. Try again.' }
  }

  if (!isIdentityCrop(crop)) {
    await updateNinaAvatarCrop(userId, avatar.id, cropForWrite(crop))
  }

  await setCurrentNinaAvatar(userId, avatar.id)
  /*
   * The MEDIA row, not the album row — see the docstring's last block. `scheduleMediaDescribe`
   * re-reads inside its `after()` and decides for itself: prose and vector both present is an
   * authoritative skip with no vendor call, which is the property the scheduler's own docstring
   * claims. So promoting an already-described, already-embedded photograph costs one indexed read.
   */
  scheduleMediaDescribe(userId, row.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: avatar.id }
}

/**
 * Insert the album row that POINTS at a chat photograph. No `fetch`, no `put`, no second Blob
 * object, no second copy of the prose. `media-album-unified-search` R3.
 *
 * ── WHAT IT WRITES, FIELD BY FIELD, AND WHY EACH IS WHAT IT IS ──────────────────────────────
 *   · `blobUrl` / `pathname` — the MEDIA row's own, verbatim. The two rows now name one object,
 *     which is the storage saving R3 asked for and the reason both deletes grew a guard.
 *   · `sourceImageId` — the link itself, and the flag that marks this row a pointer. Every read of
 *     this row's prose goes through it (`lib/nina/queries/avatarPointer.ts`).
 *   · `description` — ABSENT. A pointer holds none; see the action's docstring. The line that used
 *     to read `description: row.description` is deleted, not commented out, because a copied
 *     description is exactly the second source of truth R3 exists to remove.
 *   · `sourceKey` — still `chat-photo:<imageId>`, so the re-adoption idempotency the unique index
 *     backs keeps working completely unchanged.
 *   · `width`/`height`/`bytes` — plain numbers copied from the row, as they always were: they
 *     describe the bytes, and the bytes are the same bytes.
 *   · `folder: ''` and `filename: null` — unchanged. A linked entry is an ordinary album entry for
 *     every purpose except where its bytes and its prose live: the operator can move it between
 *     folders, re-frame it and make it current exactly like any other.
 *
 * ── NO `try`/`catch` LEFT, AND THAT IS NOT AN OMISSION ──────────────────────────────────────
 * The old body wrapped a `fetch` and a `put` — two vendor calls whose failure had to become one
 * `{ ok: false }` sentence rather than a framework error page. There is no vendor call here any
 * more; what remains is one INSERT through the query layer, which is exactly as exceptional as
 * every other statement this module runs unguarded. The one non-exceptional failure — the unique
 * index racing the lookup — is still handled, below, by re-reading the row the winner wrote.
 *
 * Not exported: a `'use server'` module may export only async actions, and this is a helper with
 * one caller.
 */
async function linkChatPhotoIntoAlbum(
  userId: string,
  row: NinaImageRow,
  sourceKey: string,
): Promise<NinaAvatarRow | null> {
  const [inserted] = await insertNinaAvatars(userId, [
    {
      blobUrl: row.blobUrl,
      pathname: row.pathname,
      source: 'admin',
      folder: '',
      filename: null,
      sourceKey,
      sourceImageId: row.id,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
    },
  ])
  if (inserted != null) return inserted

  // The unique index raced the lookup — another tab adopted this photograph between the read and
  // the insert. The row the winner wrote is what the operator meant, and it points at the same
  // object and the same prose, so there is nothing to reconcile and nothing to reap.
  return getNinaAvatarBySourceKey(userId, sourceKey)
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
 *
 * ── AND A POINTER ROW RELEASES NOTHING, BECAUSE IT NEVER OWNED ANYTHING ─────────────────────
 * `media-album-unified-search` R3. A row with `source_image_id` set shows the MEDIA row's object;
 * it minted none of its own and it has no thumbnail (nothing generates one for a link). So step 3
 * is skipped entirely for it.
 *
 * Asking anyway would be SAFE rather than wrong — `isBlobPathnameReferenced` reads both tables, the
 * Media row still names the pathname, the answer would be `'shared'` and the object would be kept.
 * It is skipped because it is two SELECTs and a `del`-adjacent code path spent re-deriving a fact
 * the `ON DELETE RESTRICT` FK already guarantees, and because the absence of the call is the
 * clearest statement of the invariant there is.
 *
 * **Step 1 is NOT skipped for a pointer, and that is deliberate.** `promoteNinaAvatarDependents`
 * looks for `nina_message_images` rows whose `source_avatar_id` names THIS avatar — a chat re-share
 * of it (F37 R3), which a pointer row can have exactly like any other album row. That FK is
 * `ON DELETE SET NULL` and it fires inside the DELETE below, so skipping the promotion would mint
 * precisely the unmeasured ghost `lib/nina/provenancePromotion.ts` exists to bury.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  /* Read BEFORE the delete, because `deleteNinaAvatar`'s RETURNING projection is the blob-ref
   * shape and does not carry `source_image_id` — and after the DELETE there is nothing left to
   * ask. One indexed single-row read on a human-paced path. */
  const existing = await getNinaAvatar(userId, parsed.data)
  if (existing == null) return { ok: false, error: 'That photo is not in the album.' }

  /* STEP 1 — while `parsed.data` still links them. Never throws; see the module's header. Run for
   * a pointer row too: a chat row can re-show it, and that link is about to be cut. */
  await promoteNinaAvatarDependents(userId, [parsed.data])

  /* STEP 2 — the row. This is the statement inside which `ON DELETE SET NULL` fires. */
  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  /* STEP 3 — the bytes, per object, and only if nothing else names them. A POINTER OWNS NO BYTES,
   * so it releases nothing at all; see the docstring's own block. */
  if (existing.sourceImageId == null) {
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
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
