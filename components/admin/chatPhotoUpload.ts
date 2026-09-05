'use client'

import { upload } from '@vercel/blob/client'

import { ADMIN_CHAT_PHOTO_CONTENT_TYPE, adminChatPhotoPathname } from '@/lib/admin/chatPhotos'
import { newId } from '@/lib/id'

/**
 * A picked file -> an object in Blob at `nina/<userId>/selfie-<id>.jpg` -> the claims
 * `addChatPhotoAction` / `replaceChatPhotoAction` need.
 *
 * ── THE TWO NUMBERS BELOW ARE THE CLIENT'S OWN ──────────────────────────────────────────────
 * `components/admin/explorer/thumbnail.ts:30-40`'s rule, applied: nothing on the server re-encodes
 * anything, so no other module has to agree with the long edge or the quality, and a constant is
 * shared when it is AGREED ON. Only three things cross the boundary and none of them is here:
 * `adminChatPhotoPathname`, `ADMIN_CHAT_PHOTO_CONTENT_TYPE`, and
 * `ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES` (which Blob enforces at PUT time and the Zod schema re-checks
 * at action time). `tests/admin.chatPhotos.test.ts` asserts the long edge equals `NINA_IMAGE_HEIGHT`
 * so the "same size class as her generated photographs" claim below is checked rather than merely
 * intended.
 *
 * ── WHY THIS RE-ENCODES WHEN `UploadAvatar` REFUSES TO ──────────────────────────────────────
 * `UploadAvatar.tsx:26-33` is a ruling and it still holds where it was made: an avatar is
 * crop-zoomed 4x inside a circular frame, so a 768 px source would show her face at 192 px of real
 * detail. A chat photograph is never crop-zoomed — the bubble draws it small and `PhotoViewer`
 * serves the same blob at screen size — so re-encoding costs nothing visible and buys three things:
 * the `.jpg` container the accepted pathname requires, the size class the rest of this folder
 * already lives in (a generated selfie is 768x1024 PNG), and a bounded byte count in the one table
 * `/nina/about` downloads whole with no `next/image`.
 */

/**
 * 1024 px on the LONG edge — `NINA_IMAGE_HEIGHT`, so a hand-added photograph lands in the same size
 * class as every generated one rather than being the only 4000 px object in the folder. Never
 * upscales: a smaller source is passed through at its own size.
 */
export const ADMIN_CHAT_PHOTO_LONG_EDGE_PX = 1024

/**
 * 0.90 — higher than the runner composer's 0.75, because that number was chosen for what
 * `glm-4.6v` needs to resolve a face at 768 px on a phone upload, and this is a photograph the
 * operator chose deliberately and will look at full-screen.
 */
export const ADMIN_CHAT_PHOTO_QUALITY = 0.9

export interface UploadedChatPhoto {
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
}

/**
 * Decode once, scale on the canvas, encode JPEG.
 *
 * `bitmap.close()` in a `finally` is load-bearing and not tidiness — `thumbnail.ts:22-28` measured
 * it: a 4032x3024 JPEG is ~48 MB of decoded surface, and this runs once per picked file.
 *
 * Throws if the file does not decode or the browser has no `OffscreenCanvas`. The caller reports it
 * on the control; there is no silent fallback, because a photograph that could not be re-encoded
 * cannot be stored under the `.jpg` pathname the predicate requires.
 */
export async function encodeChatPhotoJpeg(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser cannot re-encode an image.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale =
      longEdge > ADMIN_CHAT_PHOTO_LONG_EDGE_PX ? ADMIN_CHAT_PHOTO_LONG_EDGE_PX / longEdge : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context == null) throw new Error('This browser cannot re-encode an image.')

    // A PNG with an alpha channel flattens to BLACK behind a JPEG encoder unless the ground is
    // painted first, which on a portrait means a black halo around her hair. White, not `--card`:
    // this is baked pixel data and it must not carry a theme. (`thumbnail.ts:106-108`.)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvas.convertToBlob({
      type: ADMIN_CHAT_PHOTO_CONTENT_TYPE,
      quality: ADMIN_CHAT_PHOTO_QUALITY,
    })
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

/**
 * Encode, then PUT straight to Blob through the admin handshake.
 *
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — which is why `ADMIN_CHAT_PHOTO_ID_RE` admits
 * 12-24 symbols and why the actions re-validate the returned pathname rather than the requested one.
 *
 * `handleUploadUrl` is the ADMIN route and not `/api/upload`: that route mints tokens for a
 * merely-signed-in session and knows nothing about this pathname shape.
 */
export async function uploadChatPhoto(userId: string, file: File): Promise<UploadedChatPhoto> {
  const encoded = await encodeChatPhotoJpeg(file)
  const result = await upload(adminChatPhotoPathname(userId, newId()), encoded.blob, {
    access: 'public',
    contentType: ADMIN_CHAT_PHOTO_CONTENT_TYPE,
    handleUploadUrl: '/api/admin/nina/upload',
    clientPayload: JSON.stringify({ contentType: ADMIN_CHAT_PHOTO_CONTENT_TYPE }),
  })
  return {
    blobUrl: result.url,
    pathname: result.pathname,
    width: encoded.width,
    height: encoded.height,
    bytes: encoded.blob.size,
  }
}
