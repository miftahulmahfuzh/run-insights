import 'server-only'
import { rename } from '@vercel/blob'

import { updatePhotoBlobLocation } from '@/lib/db/queries'
import { BLOB_CACHE_MAX_AGE, SHOT_PREFIX, UPLOAD_CONTENT_TYPE } from '@/lib/extract/constants'
import { PHOTO_THUMB_CONTENT_TYPE } from '@/lib/photos/thumbnailSpec'
import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'

/**
 * **R-15, implemented. The reconciliation's answer to the sharpest issue in this feature.**
 *
 * A Vercel Blob URL is public, unguessable and permanent. It is not protected by the share token —
 * it is its own bearer secret, minted once at upload. So revoking a share kills the *page* and
 * leaves every screenshot exactly as reachable as it was a second earlier, forever, for anyone who
 * copied an image address while the link was live.
 *
 * F11's plan proposed fixing this with a photo proxy — `GET /s/[token]/photo/[id]` re-checking the
 * token on every image request — and then correctly refused to ship it, because that is a Route
 * Handler outside D7's fixed list and amending a decision the roadmap marks *do not re-litigate* is
 * not a plan's call to make. **R-15 ruled the other way round: rotate instead of proxy.** On revoke,
 * every photo moves to a fresh random pathname; the old URL 404s. No new route, D7 intact, and the
 * cost is paid once per revocation instead of on every image view forever.
 *
 * ── WHY `rename` AND NOT fetch → put → del ────────────────────────────────────────────────────
 * `@vercel/blob`'s `rename` is copy-then-delete performed inside the store: the bytes never travel
 * through our function, so a three-screenshot rotation costs three API calls and no egress instead
 * of ~170 KB down and back up again on a serverless invocation with a 60 s ceiling. Its documented
 * failure mode is also the one we want — *"if the copy fails, the source blob is left untouched"* —
 * so a rotation that dies half way has not destroyed a photo.
 *
 * ── BOTH OBJECTS MOVE, OR THE PHOTO IS REPORTED STILL LIVE ───────────────────────────────────
 * Since media-thumbnails phase 3 a screenshot can be behind TWO objects, and a revocation is only
 * as strong as the weaker one. So a photo counts as rotated only when every object it has was
 * moved and the row names both new locations; a thumbnail that would not move puts the photo in
 * `failed`, exactly as a failed original does, and the UI turns that into "try Stop sharing
 * again". Half a rotation is not a partial success here — it is the original outcome with extra
 * steps, and the caller has to be told.
 *
 * ── WHAT THIS DOES NOT FIX, SAID PLAINLY ──────────────────────────────────────────────────────
 * Somebody who already saved the image keeps the pixels. Nothing server-side reaches into a phone.
 * That is why `REVOKE_BODY` says so in the confirm dialog rather than only in this comment.
 */

interface RotatablePhoto {
  id: string
  blobUrl: string
  /** The stored pathname. Needed to put a photo back at its exact old URL if the row write fails. */
  pathname: string
  /**
   * **The derived thumbnail — media-thumbnails phase 3 — and it is a SECOND BEARER SECRET.**
   *
   * Everything this file's header says about a Blob URL applies to it unchanged: *"A Vercel Blob
   * URL is public, unguessable and permanent. It is not protected by the share token — it is its
   * own bearer secret."* `ScreenshotStrip` on `/s/[token]` serves this URL to whoever opened the
   * link, so a revocation that rotated only the original would kill the page, 404 the original,
   * and leave the photograph fully readable at its thumbnail's address forever. That is R-15's
   * hole, reopened at 256 px — which is still the photograph.
   *
   * NULL on a row the backfill has not reached, or whose derivation failed. There is then nothing
   * to rotate and nothing leaks.
   */
  thumbUrl: string | null
  thumbPathname: string | null
}

interface RotationResult {
  rotated: number
  /** Photo ids whose old URL is still live. Non-empty means the caller must say so — §REVOKE_PARTIAL. */
  failed: string[]
}

/**
 * Rotate every photo of a run. Sequential, not `Promise.all`.
 *
 * Three screenshots is the maximum an extraction ever produces (`MAX_IMAGES`), so the parallelism
 * would buy a few hundred milliseconds on a path a human triggers once in a while — and it would
 * cost the property that matters more: with sequential calls, a store that starts rate-limiting
 * mid-rotation leaves a clean prefix of rotated photos and a reported tail, rather than three
 * simultaneous half-finished moves.
 */
export async function rotateRunPhotoBlobs(
  userId: string,
  photos: readonly RotatablePhoto[],
): Promise<RotationResult> {
  if (photos.length === 0) return { rotated: 0, failed: [] }

  const token = blobEnv().BLOB_READ_WRITE_TOKEN
  let rotated = 0
  const failed: string[] = []

  for (const photo of photos) {
    try {
      const moved = await rename(photo.blobUrl, `${SHOT_PREFIX}${newId()}.jpg`, {
        access: 'public',
        // The stored pathname keeps the shape `SHOT_STORED_PATHNAME_RE` describes — our prefix, our
        // alphabet, a random suffix — so a rotated photo is indistinguishable from a fresh upload
        // to everything downstream. Vercel's random suffix is also the reason the new URL is not
        // derivable from the old one by anyone holding the old one.
        addRandomSuffix: true,
        // `rename` preserves no metadata (documented), so the content type and the year-long cache
        // that F04 set at upload have to be restated or the rotated blob would serve as
        // `application/octet-stream` with a default TTL.
        contentType: UPLOAD_CONTENT_TYPE,
        cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
        token,
      })

      /*
       * The thumbnail, to a pathname of its own under the same prefix. Done BEFORE the row write
       * so that one `updatePhotoBlobLocation` publishes both new locations atomically: a row that
       * named a new original and an old thumbnail would be a half-revoked photograph, which is
       * the state this whole function exists to not produce.
       *
       * A failure here is NOT swallowed — it throws to the outer catch, which reports the photo
       * as still live. The original has already moved at that point, so the old original URL is
       * dead and the old thumbnail URL is not; saying "rotated" would be a lie in the one
       * direction that matters. The row is untouched, so the owner's page still resolves through
       * the restore path below on the next attempt.
       */
      const movedThumb =
        photo.thumbUrl != null && photo.thumbPathname != null
          ? await rename(photo.thumbUrl, `${SHOT_PREFIX}thumb-${newId()}.jpg`, {
              access: 'public',
              addRandomSuffix: true,
              /* `rename` preserves no metadata, so the thumbnail's own type has to be restated —
               * it is JPEG whatever the original was (`PHOTO_THUMB_CONTENT_TYPE`). */
              contentType: PHOTO_THUMB_CONTENT_TYPE,
              cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
              token,
            })
          : null

      try {
        await updatePhotoBlobLocation(userId, photo.id, {
          blobUrl: moved.url,
          pathname: moved.pathname,
          ...(movedThumb != null
            ? { thumbUrl: movedThumb.url, thumbPathname: movedThumb.pathname }
            : {}),
        })
        rotated++
      } catch (error) {
        /*
         * The bytes moved but the row still points at the old, now-deleted URL — the one outcome
         * here that would be worse than not rotating at all, because it loses the photo from the
         * owner's own run detail page. Move it back and report the failure. If the compensating
         * rename also fails there is nothing further to try, and the reported failure is what the
         * UI turns into "try Stop sharing again".
         */
        console.error('[f11] rotation wrote no row; moving the blob back', photo.id, error)
        try {
          // The old PATHNAME, and `addRandomSuffix` off, so the photo lands back on the exact URL
          // the unchanged row still points at. A random suffix here would "restore" the bytes to a
          // third URL nothing in the database knows about, which is the same data loss with an
          // extra step.
          const back = await rename(moved.url, photo.pathname, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: UPLOAD_CONTENT_TYPE,
            cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
            token,
          })
          console.error('[f11] restored', photo.id, back.pathname)
        } catch (restoreError) {
          console.error('[f11] could not restore', photo.id, restoreError)
        }
        failed.push(photo.id)
      }
    } catch (error) {
      // The copy failed, so the source is untouched: the old URL is still live and still correct in
      // the row. Nothing to undo, everything to report.
      console.error('[f11] could not rotate photo', photo.id, error)
      failed.push(photo.id)
    }
  }

  return { rotated, failed }
}
