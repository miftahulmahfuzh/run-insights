'use client'

import { upload } from '@vercel/blob/client'

import { findChatPhotoDuplicateAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_CONTENT_TYPE, adminChatPhotoPathname } from '@/lib/admin/chatPhotos'
import { contentHashOf } from '@/lib/photos/contentHash'
import { newId } from '@/lib/id'

/**
 * A picked file -> an object in Blob at `nina/<userId>/selfie-<id>.jpg` -> the claims
 * `addChatPhotoAction` / `replaceChatPhotoAction` need. The Media view's upload path — Add and
 * Replace — migrated here from the purged `/admin/photos` surface (`components/admin/
 * chatPhotoUpload.ts`), unchanged in behavior and re-homed beside `thumbnail.ts`, its own cited
 * precedent for a client encode module.
 *
 * ── THE PATHNAME IS BOUND HERE, AND NOWHERE IS IT PARSED ───────────────────────────────────
 * `adminChatPhotoPathname` is the ONLY producer of the chat-photo pathname shape, and nothing in
 * the explorer ever parses one: the row's stored pathname is never split, matched or inferred-from
 * — the served content type is the only authority for what the bytes are (`lib/nina/vision.ts`'s
 * `toDataUri` reads it back rather than guessing). The collection is mixed-container by design —
 * `selfie-<id>.png` from the worker, `selfie-<id>.jpg` from this module — and
 * `NINA_IMAGE_PATHNAME_RE` admits both, which is why the pathname predicate checks segment shapes
 * and not a single container.
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
 * ── WHY THIS RE-ENCODES WHEN `UploadAvatar` REFUSES TO ─────────────────────────────────────
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
  /**
   * media-dedupe P3. sha-256 hex over the exact bytes this object holds — the bytes that were (or
   * would have been) PUT. A claim, in the same class as `width` and `bytes`: the action
   * format-validates it and the shared insert NULLs an invalid one (invariant 9).
   */
  contentHash: string
  /**
   * Non-null: an original row already holds these bytes, the PUT was SKIPPED, and `blobUrl` /
   * `pathname` are that row's (the dimensions and byte count are still this encode's — identical
   * bytes measure identically). `addChatPhotoAction` turns the add into a reference to this row.
   */
  duplicateOfId: string | null
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
 * Encode, then PUT straight to Blob through the admin handshake — unless the collection already
 * holds these bytes, in which case the PUT is SKIPPED and the claims describe the row that does
 * hold them.
 *
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — 43 symbols in the id segment, not 12 — which
 * is why `lib/admin/chatPhotos.ts` carries a SECOND pattern, `ADMIN_CHAT_PHOTO_STORED_ID_RE`, and why
 * the actions re-validate the returned pathname rather than the requested one.
 *
 * `handleUploadUrl` is the ADMIN route and not `/api/upload`: that route mints tokens for a
 * merely-signed-in session and knows nothing about this pathname shape.
 *
 * ── media-dedupe P3: THE HASH IS OVER THE ENCODED BLOB, BEFORE THE PUT ───────────────────────
 * `encoded.blob` is the exact body of the PUT, so it is what gets hashed — invariant 4's "bytes
 * persis yang di-PUT". The re-encode is NOT deterministic across browsers and sessions, and that
 * is fine: identical hash still means identical stored bytes, which is the only claim the column
 * makes. The pre-check is one owner-scoped server action round trip; on a hit it saves the PUT, a
 * second Blob object, and the duplicate row that would have hidden the keeper from nothing.
 *
 * ── THE SECOND KEY, OVER THE PICK ITSELF (2026-09-10's measured defect) ──────────────────────
 * The encode hash above can never match a photograph that was downloaded out of the collection
 * and re-added: THIS re-encode produces bytes nobody has ever stored. So the picked file is
 * hashed too and both keys go into the one lookup — the pick's bytes ARE a stored row's object
 * byte for byte, and `content_hash` holds "sha-256 over a row's stored bytes" either way. On a
 * source-key hit the claims still describe THIS encode; that is correct — `addChatPhotoAction`
 * pins the keeper by id and writes the KEEPER's measured hash onto the reference row, so the
 * encode's claim never reaches the database as a byte description.
 *
 * ── WHY DEDUPE IS OPT-IN, AND WHY REPLACE MUST NEVER PASS IT ─────────────────────────────────
 * `opts.dedupe` defaults to OFF so every existing caller keeps today's behavior, and `MediaAdd` is
 * the only caller that turns it on. Replace must NOT: its contract is "swap the bytes behind THIS
 * row", and a deduped replace would point the row at another row's object and strip its provenance
 * to a reference — which the collection reads then hide, making the photograph the operator can
 * see vanish from the Media folder. Replace gets the hash for free (it claims it through
 * `chatPhotoReplaceSchema`) but never the skip.
 */
export async function uploadChatPhoto(
  userId: string,
  file: File,
  opts: { dedupe?: boolean } = {},
): Promise<UploadedChatPhoto> {
  const encoded = await encodeChatPhotoJpeg(file)
  const contentHash = await contentHashOf(encoded.blob)

  if (opts.dedupe === true) {
    /* Only a dedupe caller pays for the pick's own hash — the opt-out paths keep today's
     * behavior byte for byte. */
    const sourceHash = await contentHashOf(file).catch(() => null)
    const duplicate = await findChatPhotoDuplicateAction(contentHash, sourceHash ?? undefined)
    if (duplicate != null) {
      return {
        blobUrl: duplicate.blobUrl,
        pathname: duplicate.pathname,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.blob.size,
        contentHash,
        duplicateOfId: duplicate.id,
      }
    }
  }

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
    contentHash,
    duplicateOfId: null,
  }
}
