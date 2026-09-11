import { z } from 'zod'

import {
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  ADMIN_CHAT_PHOTO_MAX_EDGE_PX,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  ADMIN_CHAT_PHOTO_MAX_URL_CHARS,
  blobUrlMatchesPathname,
} from '@/lib/admin/chatPhotos'
import { NINA_CROP_MAX_ABS_OFFSET, NINA_CROP_MAX_SCALE, NINA_CROP_MIN_SCALE } from '@/lib/nina/crop'

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

/**
 * media-dedupe P3. The client's sha-256 claim over the exact bytes it PUT — or, on a skipped
 * upload, over the bytes it tried to. SHAPE only, deliberately: the FORMAT is validated in the
 * action with `isValidContentHash`, because invariant 9 makes a malformed hash a NULL and a
 * proceed, never a refused add. A regex here would be an error where the plan demands silence.
 */
const chatPhotoContentHash = z.string().min(1).max(128)

/** "Put a new photograph in the collection." Mints the message + image pair. */
export const chatPhotoAddSchema = z
  .object({
    ...uploadedBlob,
    contentHash: chatPhotoContentHash.optional(),
    /**
     * The row the browser's pre-check found, when the upload was SKIPPED. An id, so it gets the
     * shape check every id in this file gets; existence and ownership are the action's job, as
     * the header above says.
     */
    duplicateOfId: chatPhotoId.optional(),
  })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/** "Swap the bytes behind this row." The row id plus the same claims, plus the new bytes' hash. */
export const chatPhotoReplaceSchema = z
  .object({
    id: chatPhotoId,
    ...uploadedBlob,
    contentHash: chatPhotoContentHash.optional(),
  })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/**
 * "Take this row away." An object rather than a bare string, so a later field (a reason, a
 * keep-the-message flag) is additive on an action the grid already calls.
 */
export const chatPhotoRemoveSchema = z.object({ id: chatPhotoId })

/**
 * **"Look at this photograph with the vision model."** The bare-id shape `describeChatPhotoAction`
 * validates. An object rather than a bare string, for the reason `chatPhotoRemoveSchema` states: a
 * later field is additive on an action the panel already calls. Existence, ownership and the
 * reference refusal are the action's job, as the header above says.
 */
export const chatPhotoDescribeSchema = z.object({ id: chatPhotoId })

/**
 * **"What she can see in it", as a field.** Exported so the ALBUM's hand-edit schema
 * (`lib/admin/schema.ts`'s `avatarDescriptionSchema`) reuses the one normalizer instead of growing
 * a second copy of it — the two tables' descriptions are the same kind of sentence written into
 * the same kind of prompt, and they must normalise the same way.
 *
 * ── THE MAX IS ON THE RAW STRING, THE NORMALISE COMES AFTER IT ────────────────────────────
 * `.max()` before `.transform()`, deliberately. A 4000-character paste is REFUSED and reported
 * inline — this file's rule: a Zod refusal is a validation failure, not a confirmation — rather
 * than silently truncated into range, which is the one outcome that would put half a sentence into
 * Nina's prompt and tell the operator it saved fine. `coerceNinaNotes` (`lib/nina/tuning.ts`)
 * slices instead, and is right to: it coerces a stored blob at read time and has no operator to
 * report to.
 *
 * ── WHAT THE TRANSFORM DOES, AND WHY IT IS ALL IT DOES ─────────────────────────────────
 * CRLF to LF so a Windows paste does not store carriage returns in prompt text, three-or-more
 * newlines collapsed to one blank line, then trimmed. Nothing else. No sentence casing, no digit
 * stripping, no length floor. The model's own rules (`lib/nina/prompts/describe.ts` — no digits,
 * 60-140 words, one paragraph) are instructions to a vendor, not validation of a human: this
 * description is a WITNESS statement and here the operator IS the witness. He is allowed to write
 * a number if the number is true.
 *
 * ── AN EMPTY RESULT IS LEGAL AND MEANS SOMETHING TO THE ACTION ────────────────────────
 * No `.min(1)`. An all-whitespace box normalises to `''`, this accepts it, and the action turns it
 * into `NULL` — D1. That split is this file's stated division of labour: the schema knows shapes,
 * the action owns policy and ownership.
 */
export const chatPhotoDescriptionField = z
  .string()
  .max(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS)
  .transform((value) =>
    value
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )

/**
 * **"Rewrite what she can see in it."** R2 of `nina-photo-refs-and-bubble-actions`, verbatim:
 * *"there is a 'what she can see in it' field. make this field editable by user"*.
 */
export const chatPhotoDescriptionSchema = z.object({
  id: chatPhotoId,
  description: chatPhotoDescriptionField,
})

/**
 * **"Make this chat photograph her profile picture."** The framing panel always knows its whole
 * draft — identity `{1, 0, 0}` before the operator touches anything — so the crop is three
 * REQUIRED fields, not an optional one with an all-present-or-all-absent refine. The bounds are
 * `cropWriteSchema`'s (`lib/admin/schema.ts`), re-spelled here for the same two reasons that file
 * is separate at all; the numbers themselves stay single-sourced in `lib/nina/crop.ts`. The
 * schema can only reject nonsense — clamping the crop against the row's real dimensions is the
 * action's job, server-side, exactly as `saveNinaAvatarCropAction` argues.
 */
export const chatPhotoSetAvatarSchema = z.object({
  id: chatPhotoId,
  scale: z.number().min(NINA_CROP_MIN_SCALE).max(NINA_CROP_MAX_SCALE),
  x: z.number().int().min(-NINA_CROP_MAX_ABS_OFFSET).max(NINA_CROP_MAX_ABS_OFFSET),
  y: z.number().int().min(-NINA_CROP_MAX_ABS_OFFSET).max(NINA_CROP_MAX_ABS_OFFSET),
})

export type ChatPhotoAddInput = z.infer<typeof chatPhotoAddSchema>
export type ChatPhotoReplaceInput = z.infer<typeof chatPhotoReplaceSchema>
export type ChatPhotoRemoveInput = z.infer<typeof chatPhotoRemoveSchema>
export type ChatPhotoDescribeInput = z.infer<typeof chatPhotoDescribeSchema>
export type ChatPhotoDescriptionInput = z.infer<typeof chatPhotoDescriptionSchema>
export type ChatPhotoSetAvatarInput = z.infer<typeof chatPhotoSetAvatarSchema>
