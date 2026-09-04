import { z } from 'zod'

import { NINA_CROP_MAX_ABS_OFFSET, NINA_CROP_MAX_SCALE, NINA_CROP_MIN_SCALE } from '@/lib/nina/crop'

import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_SLOT_VALUE_MAX,
} from '@/lib/admin/memoryModel'

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

/* ============================================================================
 * Phase 16 — /admin/memory. Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * The eight memory actions' input bounds. They are here rather than in a second `lib/admin/*`
 * schema file for the reason phase 15 gave for appending to `lib/nina/queries.ts`: two homes for
 * one concern is worse than one additive edit to a landed file.
 *
 * `userId` is a `user.id` — `crypto.randomUUID()` from the Auth.js adapter
 * (`lib/db/schema.ts:47-49`), **not** a nanoid — so `isValidId` is the wrong check for it and a
 * length-bounded non-empty string is the right one. Ownership is not established by this regex; it
 * is established by `requireAdmin()`, and every read and write is scoped to the id that survives
 * `getAdminUser`.
 */
export const userIdSchema = z.string().trim().min(1).max(64)

/** A slot key. Membership in phase 5's nine is checked by `canonicaliseSlotValue`, not here. */
export const slotKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'A slot key is lower_snake_case.')

export const slotEditSchema = z.object({
  userId: userIdSchema,
  /** Not trimmed here — `canonicaliseSlotValue` owns every transformation of a slot value. */
  key: slotKeySchema,
  value: z.string().min(1).max(ADMIN_SLOT_VALUE_MAX),
})
export type SlotEdit = z.infer<typeof slotEditSchema>

export const slotRetireSchema = z.object({
  userId: userIdSchema,
  key: slotKeySchema,
  reason: z.string().trim().max(ADMIN_FACT_TEXT_MAX).default(''),
})

export const promiseRemoveSchema = z.object({
  userId: userIdSchema,
  /** A `NinaPendingPromise.id`, minted by `newId()`. */
  promiseId: z.string().trim().min(1).max(64),
})

const factCategorySchema = z.enum(ADMIN_FACT_CATEGORIES)

/**
 * A hand-typed fact — R24's backdoor, literally. `confidence` defaults to 100 because a human
 * asserting something outright is phase 1's documented meaning of 100, and it is still editable.
 */
export const factInsertSchema = z.object({
  userId: userIdSchema,
  category: factCategorySchema,
  text: z.string().trim().min(1).max(ADMIN_FACT_TEXT_MAX),
  confidence: z.number().int().min(0).max(100).default(100),
})
export type FactInsert = z.infer<typeof factInsertSchema>

export const factEditSchema = z.object({
  userId: userIdSchema,
  id: z.string().trim().min(1).max(64),
  category: factCategorySchema,
  text: z.string().trim().min(1).max(ADMIN_FACT_TEXT_MAX),
  confidence: z.number().int().min(0).max(100),
})
export type FactEdit = z.infer<typeof factEditSchema>

/** `replacement` may be empty — that is a pure retraction rather than a correction. */
export const factRetractSchema = z.object({
  userId: userIdSchema,
  id: z.string().trim().min(1).max(64),
  replacement: z.string().trim().max(ADMIN_FACT_TEXT_MAX).default(''),
})
export type FactRetract = z.infer<typeof factRetractSchema>

export const factPurgeSchema = z.object({
  userId: userIdSchema,
  id: z.string().trim().min(1).max(64),
  /** Compared against `ADMIN_PURGE_CONFIRMATION` by `isPurgeConfirmed`, not by a Zod literal, so */
  /** the refusal message can explain itself rather than being a field error. */
  confirm: z.string(),
})
