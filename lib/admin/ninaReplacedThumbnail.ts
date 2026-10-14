import 'server-only'

import { after } from 'next/server'

import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import {
  getNinaAvatar,
  getNinaMessageImage,
  updateNinaAvatarThumbnail,
  updateNinaChatPhotoThumbnail,
} from '@/lib/nina/queries'
import { storeThumbnailFromStoredUrl } from '@/lib/nina/thumbnailStore'

/**
 * **Earn a grid tile for the bytes a replaced row now serves** — the `after()` pass every in-place
 * byte swap schedules, for either table.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────────────────────
 * media-thumbnails shipped on 2026-10-13 and this was reported the next morning: *"when i
 * replaced one of the photos in Media, the thumbnail still showed the old photo. before
 * yesterday's update, we don't have this bug."* Both halves of that sentence were exactly right.
 * Migration 0037 gave `nina_message_images` a `thumb_url`/`thumb_pathname` pair, the backfill
 * filled 835 of them, and every grid switched from `blobUrl` to `thumbUrl ?? blobUrl` — so from
 * that day a Replace that moved the five byte columns and left the tile standing put the OLD
 * photograph on screen. Before it, there was no tile to be stale. Measured on production the
 * morning of the report: 16 rows carrying a thumbnail derived from an object the row no longer
 * served, every one of them with `last_replaced_at` set.
 *
 * The fix is two halves, and `lib/nina/perceptualSign.ts`'s 2026-09-15 ghost-signature fix is the
 * pattern for both. The byte swap RETRACTS the pair in the same statement
 * (`updateNinaChatPhotoBlob`, `updateNinaAvatarBlob`), which is what ends the WRONG picture. This
 * is the half that ends the DEGRADED one: without it a replaced photograph falls back to its
 * full-size original forever, which is ~1 MB per tile per page view — the exact burn that
 * suspended the Blob store and motivated the feature in the first place.
 *
 * ── ONE MODULE, THREE CALLERS, AND THAT IS THE POINT ────────────────────────────────────────
 * `replaceChatPhotoAction` (the Media folder's Replace), `replaceNinaAvatarAction` (the album's
 * manual Replace) and `resolvePhotoshopJobAction`'s replace arm all retract a tile, so all three
 * owe one. It shipped as a private helper inside `lib/admin/chatPhotoActions.ts` and lasted
 * exactly as long as the first of the other two needing it — `lib/nina/blobRelease.ts`'s header
 * states the rule it is now obeying: *"a second copy of a delete rule is how the copy becomes the
 * one that forgot the check."* Same reasoning, same shape, one implementation.
 *
 * It is a plain server module rather than a `'use server'` one, for
 * `lib/admin/ninaMediaDeferredDescribe.ts`'s stated reason: a `'use server'` module may export
 * only async functions, and a scheduler is synchronous. It is also not a decision a client gets
 * to POST.
 *
 * ── SERVER-SIDE, FROM THE STORED OBJECT, AND THAT IS A RULING RATHER THAN A SHRUG ───────────
 * `lib/nina/actions/send.ts`'s own: *"not worth a second door into the Blob store: a
 * browser-uploaded thumbnail needs its own minted ticket for a `thumb-` pathname"*. The
 * operator's tab could derive this for free — it is holding the decoded bitmap — but buying that
 * costs a new pathname shape in the upload route's predicate, a thumbnail claim in several Zod
 * schemas and a second PUT the client can lie about. A GET of an object the upload paths already
 * bound to ~1024 px is the cheaper half of that trade, and it is spent once per replace, ever.
 * The photoshop arm has no browser in the loop at all, so for that caller it is the only option.
 *
 * ── EVERY FAILURE IS A TILE-LESS ROW, WHICH IS LEGAL AND PERMANENT ──────────────────────────
 * The plan's invariant 2. `storeThumbnailFromStoredUrl` answers `null` for a failed GET, an
 * undecodable body, a sharp fault or a suspended store, and never throws; the row keeps NULL, the
 * grid renders the original exactly as it did before media-thumbnails, and
 * `npm run thumbs:backfill` fills it on the next sweep. A photograph must never be lost, delayed
 * or refused because its thumbnail could not be made.
 */

/** Which row was replaced. `avatar` is a `nina_avatars` original; `image` a Media original. */
export interface NinaReplacedPhoto {
  kind: 'avatar' | 'image'
  id: string
}

/**
 * Read the row back, derive a tile from the bytes it NOW serves, and record it.
 *
 * ── WHY THE ROW IS RE-READ AND THE PATHNAME COMES FROM IT ───────────────────────────────────
 * Not from the caller's payload. The row is the fact; the payload is a claim that was true when
 * the write ran. Re-reading also catches the row that went away between the click and the
 * callback, which is a miss rather than a failure.
 *
 * ── A REFERENCE IS NOT SKIPPED HERE, UNLIKE THE RE-SIGN ─────────────────────────────────────
 * `scheduleChatPhotoResign` refuses a reference because a signature is a claim about bytes a row
 * OWNS. A thumbnail is not a claim, it is a derivative, and the doctrine is the opposite one:
 * *the thumbnail follows the BYTES* (`lib/nina/thumbnailStore.ts`, and the backfill, whose unit of
 * work is the OBJECT — 1,304 rows named 1,037 objects). So `updateNinaChatPhotoThumbnail` is
 * addressed by PATHNAME and lands this one derivation on the replaced original AND on every chat
 * reference the replace moved onto it — for both tables, which is why the avatar arm calls it
 * too. The album row itself is addressed by id, because `nina_avatars` can hold a POINTER at the
 * same pathname and a pointer takes NULL by a standing ruling; that function's header argues it.
 *
 * ── A LOST RACE FREES WHAT IT MINTED ────────────────────────────────────────────────────────
 * The operator can replace the photograph AGAIN while this GET is in flight. Both writes are
 * pathname-guarded, so they then match nothing and the total is 0 — and the object is already in
 * the store with no row that will ever name it. The re-sign has no equivalent problem (a refused
 * signature costs nothing), so this is the one pass that has to clean up after itself, which it
 * does through the same reference-checked release everything else deletes through.
 */
export function scheduleReplacedThumbnail(userId: string, target: NinaReplacedPhoto): void {
  after(async () => {
    try {
      const row =
        target.kind === 'avatar'
          ? await getNinaAvatar(userId, target.id)
          : await getNinaMessageImage(userId, target.id)
      /* Gone between the click and the callback. A miss, not a failure. */
      if (row == null) return
      /* Already has one — a second pass over a row the first one filled. Nothing to do, and
       * deriving anyway would PUT an object the additive writes would refuse to record. */
      if (row.thumbUrl != null) return

      const thumb = await storeThumbnailFromStoredUrl(row.blobUrl, row.pathname)
      if (thumb == null) {
        /* The store or the encoder said no. `storeThumbnailFromStoredUrl` has already logged
         * which; the row stays tile-less, which renders correctly and costs transfer. */
        return
      }

      /* The album row by id, then everything rendering those bytes by pathname. Sequential, not
       * `Promise.all`: the second is only correct once the first has had its chance, and a
       * replace is a human-paced click with nothing to win from the overlap. */
      let written = 0
      if (target.kind === 'avatar') {
        written += await updateNinaAvatarThumbnail(userId, target.id, row.pathname, thumb)
      }
      written += await updateNinaChatPhotoThumbnail(userId, row.pathname, thumb)

      if (written === 0) {
        /* The row moved to a third set of bytes mid-flight, or something else filled the gap
         * first. Either way nothing names this object, and the one reference-checked release in
         * the repo is how it goes — a bare `del` here would be the copy that forgot the check. */
        console.warn('[admin] a replaced photo moved again; freeing the tile nothing claimed', {
          kind: target.kind,
          id: target.id,
          pathname: thumb.pathname,
        })
        await releaseBlobIfUnreferenced(userId, thumb)
        return
      }
      console.log('[admin] derived a grid tile for replaced bytes', {
        kind: target.kind,
        id: target.id,
        rows: written,
      })
    } catch (cause) {
      /* The outer net, `scheduleChatPhotoResign`'s shape: the bytes are committed whatever this
       * pass does, and a tile-less row is one backfill run from filled. */
      console.warn('[admin] replaced photo thumbnail pass failed', {
        kind: target.kind,
        id: target.id,
        error: String(cause),
      })
    }
  })
}
