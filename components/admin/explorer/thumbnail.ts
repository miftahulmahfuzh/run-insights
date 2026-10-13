import {
  PHOTO_THUMB_CONTENT_TYPE,
  PHOTO_THUMB_QUALITY,
  PHOTO_THUMB_SHORT_EDGE_PX,
  thumbnailTargetFor,
} from '@/lib/photos/thumbnailSpec'

/**
 * The derived thumbnail — the answer to "hundreds of profile pics" in a grid that may not use
 * `next/image`.
 *
 * ── WHY A SECOND BLOB AND NOT A TRANSFORM ───────────────────────────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rules out `next/image` on Blob-hosted photos outright:
 * it *"would re-optimise finished files on a paid transform quota"*. So a grid of three hundred
 * originals is three hundred multi-megabyte downloads, and there is no server-side resizer in the
 * loop to ask. The only remaining place with the pixels in hand is the browser that is already
 * decoding the file to measure it — so it draws a 256 px copy while it is there, and that copy is
 * PUT beside the original as a second object.
 *
 * ── THE ORIGINAL IS STILL NOT RE-ENCODED ────────────────────────────────────────────────────
 * `components/admin/UploadAvatar.tsx:26-33`, quoted because it is a ruling and not a preference:
 * *"An avatar is neither: the crop is a display transform, so a 4x zoom on a 768 px source would
 * show her face at 192 px of real detail, and phase 13's full-screen viewer serves the same blob.
 * The original goes up whole."* That still holds. This module ADDS a thumbnail; it does not touch
 * what goes into `avatar-<id>.<ext>`.
 *
 * ── ONE DECODE, AND `close()` IS NOT OPTIONAL ───────────────────────────────────────────────
 * `createImageBitmap(file, { resizeWidth, … })` would decode straight to the thumbnail size, but
 * then the intrinsic `width`/`height` — which `clampCrop` needs and `avatarRegisterSchema` bounds —
 * would be lost. So the decode is full-size and the scaling happens on the canvas. That makes
 * `bitmap.close()` load-bearing rather than tidy: an 8 MB 4032x3024 JPEG is ~48 MB of decoded
 * surface, and a three-hundred-file folder that forgets to release them will be killed by the tab's
 * memory ceiling long before it finishes. Hence the `finally`.
 *
 * ── THE TWO NUMBERS MOVED OUT, BECAUSE THEIR PREMISE EXPIRED ────────────────────────────────
 * This header used to read: *"THE TWO NUMBERS BELOW ARE THE CLIENT'S OWN. Nothing on the server
 * re-encodes anything, so no other module has to agree with the short edge or the quality… a
 * constant is shared when it is **agreed on**, and these are not."* Correct then, and its own
 * stated condition is what retired it.
 *
 * media-thumbnails phase 2 added a SERVER encoder (`lib/photos/deriveThumbnail.ts`, sharp),
 * because two write paths have no browser in them at all — her generated selfies come out of
 * `scripts/nina-image-worker`, and the three backfills read originals out of Blob on a server. The
 * numbers are agreed on now, by two encoders, so by that rule they moved to one home:
 * `lib/photos/thumbnailSpec.ts`. The values are unchanged; only the address is.
 *
 * The failure the old note was guarding against is unchanged too, and is now guarded better: two
 * encoders with two short edges would make a grid where a tile's sharpness depended on which path
 * uploaded it, and nothing would ever flag it.
 *
 * The reconciler's earlier deletion of phase 1's draft `ADMIN_AVATAR_THUMB_EDGE_PX = 384` stands
 * and is the same rule being applied: one thing, one number, one home.
 */

/**
 * Re-exported under their F34 names so the existing call sites and tests keep reading the way they
 * were written. These are aliases of `lib/photos/thumbnailSpec.ts`'s constants — **not** second
 * definitions. A new caller should import the spec directly.
 */
export const EXPLORER_THUMB_SHORT_EDGE_PX = PHOTO_THUMB_SHORT_EDGE_PX
export const EXPLORER_THUMB_QUALITY = PHOTO_THUMB_QUALITY
export const EXPLORER_THUMB_CONTENT_TYPE = PHOTO_THUMB_CONTENT_TYPE

export interface MeasuredFile {
  width: number
  height: number
  /** The derived JPEG, or `null` when this browser could not make one. Never fatal. */
  thumb: Blob | null
}

/**
 * Decode once; report the intrinsic size; return a 256 px JPEG if the browser can make one.
 *
 * Throws only if the file does not decode as an image at all — which is the caller's cue to mark
 * that one file failed, not to abandon the batch.
 */
export async function measureAndThumbnail(file: File): Promise<MeasuredFile> {
  const bitmap = await createImageBitmap(file)
  try {
    const width = bitmap.width
    const height = bitmap.height
    return { width, height, thumb: await drawThumbnail(bitmap, width, height) }
  } finally {
    // See the header: not tidiness, a memory ceiling.
    bitmap.close()
  }
}

/**
 * `null` on every failure, and every failure is silent by design: a missing thumbnail costs the
 * grid one heavy download, and `ExplorerPhoto.thumbUrl` is nullable precisely so that this can
 * degrade instead of refusing an upload.
 */
async function drawThumbnail(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  try {
    // The box arithmetic is the spec's, so this encoder and the sharp one cannot disagree about
    // what "256 px short edge, never upscaled" means. See `lib/photos/thumbnailSpec.ts`.
    const { width: targetWidth, height: targetHeight } = thumbnailTargetFor(width, height)

    const canvas = new OffscreenCanvas(targetWidth, targetHeight)
    const context = canvas.getContext('2d')
    if (context == null) return null

    // A PNG with an alpha channel flattens to BLACK behind a JPEG encoder unless the ground is
    // painted first, which on a portrait means a black halo around her hair. White, not `--card`:
    // this is baked pixel data and it must not carry a theme.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

    return await canvas.convertToBlob({
      type: EXPLORER_THUMB_CONTENT_TYPE,
      quality: EXPLORER_THUMB_QUALITY,
    })
  } catch (cause) {
    console.warn('[f33] thumbnail derivation failed; the grid will load the original', cause)
    return null
  }
}
