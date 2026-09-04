import { z } from 'zod'

import { NINA_CROP_MAX_ABS_OFFSET, NINA_CROP_MAX_SCALE, NINA_CROP_MIN_SCALE } from '@/lib/nina/crop'

import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_ID_RE,
  ADMIN_AVATAR_MAX_EDGE_PX,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
} from './avatars'

/**
 * Everything `/admin/nina` accepts from a browser, validated at the boundary. F33 R23.
 *
 * Phase 1's `updateNinaAvatarCrop` docstring hands this file its job in as many words: *"No range
 * validation here. The bounds ('scale ≥ 1, offsets inside the frame') are a property of the
 * framing UI and belong to a Zod schema phase 15 owns."* This is that schema.
 *
 * ── TWO LAYERS OF BOUNDS, AND WHY BOTH ──────────────────────────────────────────────────────
 * The EXACT bound on an offset depends on the image's aspect ratio and the current scale, which
 * this schema does not know — so it enforces the shape (integer, within the absolute ceiling that
 * no legitimate crop can exceed) and the Server Action then re-runs `clampCrop` against the row's
 * real `width`/`height`. Zod refuses garbage; `clampCrop` is what guarantees the frame stays
 * covered. Neither alone is sufficient: a schema cannot know the aspect ratio, and a clamp cannot
 * reject `scale: "banana"`.
 */

export const avatarIdSchema = z.string().regex(ADMIN_AVATAR_ID_RE, 'Not an avatar id')

export const cropWriteSchema = z.object({
  id: avatarIdSchema,
  /** `numeric(5,3)`: three decimals, and never below cover. */
  scale: z.number().min(NINA_CROP_MIN_SCALE).max(NINA_CROP_MAX_SCALE),
  x: z.number().int().min(-NINA_CROP_MAX_ABS_OFFSET).max(NINA_CROP_MAX_ABS_OFFSET),
  y: z.number().int().min(-NINA_CROP_MAX_ABS_OFFSET).max(NINA_CROP_MAX_ABS_OFFSET),
})
export type CropWrite = z.infer<typeof cropWriteSchema>

/**
 * What the browser reports after a successful PUT. Every field is checked, including the two the
 * browser measured itself — `width`/`height` come from the decoded bitmap, which is trustworthy in
 * practice and client-supplied in principle, and they are the input to the crop clamp, so a lie
 * here is a lie about the frame.
 */
export const avatarRegisterSchema = z.object({
  blobUrl: z.url().refine((value) => value.startsWith('https://'), 'Blob URLs are https'),
  pathname: z.string().min(1).max(512),
  contentType: z.enum(ADMIN_AVATAR_CONTENT_TYPES),
  width: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  height: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  bytes: z.number().int().positive().max(ADMIN_AVATAR_MAX_UPLOAD_BYTES),
  /** Make it hers immediately, or just park it in the album. The checkbox on the picker. */
  makeCurrent: z.boolean(),
})
export type AvatarRegister = z.infer<typeof avatarRegisterSchema>
