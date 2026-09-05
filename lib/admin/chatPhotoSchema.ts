import { z } from 'zod'

import {
  ADMIN_CHAT_PHOTO_MAX_EDGE_PX,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  ADMIN_CHAT_PHOTO_MAX_URL_CHARS,
  blobUrlMatchesPathname,
} from '@/lib/admin/chatPhotos'

/**
 * Everything `/admin/photos` accepts from a browser. R2, phase 3.
 *
 * ── WHY THIS IS NOT IN `lib/admin/schema.ts` ────────────────────────────────────────────────
 * Two reasons, and the second stands on its own. (1) Phase 1 of this plan set rewrites the memory
 * half of that file in the same worktree, and two sessions appending to one file is a merge
 * conflict manufactured on purpose. (2) That file's docstring scopes it to what `/admin/nina`
 * accepts, and this is a different route over a different table.
 *
 * ── WHAT A SCHEMA IS AND IS NOT ─────────────────────────────────────────────────────────────
 * Next 16's Server Actions guide, verbatim: *"Schema validation (zod or similar) only checks the
 * shape of the input. A well-formed `Item` object can still refer to a row the caller does not
 * own."* So nothing here knows a user id. Ownership is the ACTION's job, in two places it cannot
 * skip: `isAdminChatPhotoPathname(pathname, userId)` binds the blob path to the session, and every
 * query below it carries `user_id` in its WHERE (invariant 3).
 *
 * What IS here: the cross-field tie between `blobUrl` and `pathname`, because that one is a pure
 * question about the payload and belongs where the payload is checked.
 */

/** `nina_message_images.id` is `newId()` — nanoid(12) over the URL-safe alphabet. */
const chatPhotoId = z.string().regex(/^[A-Za-z0-9_-]{12}$/)

/**
 * What the browser reports about the object it just PUT. Every one of these is a CLAIM: the bytes
 * went straight to Blob and no action here ever saw them.
 *
 * The byte ceiling is the same constant `/api/admin/nina/upload` hands Blob as
 * `maximumSizeInBytes`, so this is a second agreeing check rather than a second opinion — Blob
 * enforces it at PUT time and refuses the object, and this refuses the row.
 */
const uploadedBlob = {
  blobUrl: z.string().min(1).max(ADMIN_CHAT_PHOTO_MAX_URL_CHARS),
  pathname: z.string().min(1).max(512),
  width: z.number().int().positive().max(ADMIN_CHAT_PHOTO_MAX_EDGE_PX),
  height: z.number().int().positive().max(ADMIN_CHAT_PHOTO_MAX_EDGE_PX),
  bytes: z.number().int().positive().max(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES),
}

const BLOB_MISMATCH = 'blobUrl and pathname describe different objects'

/** "Put a new photograph in the collection." Mints the message + image pair. */
export const chatPhotoAddSchema = z
  .object({ ...uploadedBlob })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/** "Swap the bytes behind this row." The row id plus the same claims. */
export const chatPhotoReplaceSchema = z
  .object({ id: chatPhotoId, ...uploadedBlob })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/**
 * "Take this row away." An object rather than a bare string, so a later field (a reason, a
 * keep-the-message flag) is additive on an action the grid already calls.
 */
export const chatPhotoRemoveSchema = z.object({ id: chatPhotoId })

export type ChatPhotoAddInput = z.infer<typeof chatPhotoAddSchema>
export type ChatPhotoReplaceInput = z.infer<typeof chatPhotoReplaceSchema>
export type ChatPhotoRemoveInput = z.infer<typeof chatPhotoRemoveSchema>
