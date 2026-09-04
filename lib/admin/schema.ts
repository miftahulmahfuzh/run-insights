import { z } from 'zod'

import {
  NINA_FILENAME_MAX_CHARS,
  NINA_FOLDER_FORBIDDEN_RE,
  NINA_FOLDER_MAX_PATH_CHARS,
  NINA_FOLDER_SEPARATOR,
  NINA_SOURCE_KEY_MAX_CHARS,
  validateFolderPath,
} from '@/lib/admin/filetree'
import { NINA_ADMIN_BATCH_MAX } from '@/lib/nina/album'
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

import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'

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

/* ============================================================================
 * admin-album-file-manager phase 4 — the folder-aware upload boundary.
 * Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * Everything a FOLDER upload says about itself. R1's *"i will put hundreds of profile pics in
 * there"* is the whole reason this is a second, BATCHED shape beside `avatarRegisterSchema` rather
 * than three more optional fields on it.
 *
 * ── EVERY BOUND HERE IS IMPORTED, NONE IS DECLARED ──────────────────────────────────────────
 * `NINA_FOLDER_MAX_PATH_CHARS`, `NINA_FILENAME_MAX_CHARS`, `NINA_SOURCE_KEY_MAX_CHARS`,
 * `NINA_FOLDER_FORBIDDEN_RE`, `NINA_FOLDER_SEPARATOR` and `validateFolderPath` come from
 * `lib/admin/filetree.ts` — the repo's one folder-path grammar, zero-import so that the browser
 * half of this upload can share it; `NINA_ADMIN_BATCH_MAX` from `lib/nina/album.ts`.
 * `lib/admin/avatars.ts`'s header states the rule all of this obeys: *"a constant that is agreed
 * rather than shared is a constant that will one day disagree."* `NINA_SOURCE_KEY_MAX_CHARS` in
 * particular is not taste — it is a b-tree tuple limit, and the index it protects is the one that
 * makes this schema's idempotency a constraint.
 *
 * ── THIS SCHEMA VALIDATES A CANONICAL PATH. IT DOES NOT NORMALISE ONE ───────────────────────
 * Normalisation is phase 2's `lib/admin/filetree.ts` and runs in the BROWSER, before a single byte
 * is PUT, because that is where the diff against the manifest is computed and where the mess (a
 * Windows `\`, a `.`, a doubled slash) actually is. By the time a record reaches this schema the
 * path is canonical, and the correct server behaviour is to REFUSE anything that is not.
 *
 * Silently rewriting it here would be the worse failure. The row would land in a folder the client
 * does not believe it asked for; the client's dedupe key — derived from the path it *did* ask
 * for — would be stored against it; and every later diff would compare a key from path A against a
 * row sitting at path B. Forever, invisibly, and only for the paths that needed rewriting. A
 * refusal is a bug in the caller and shows up the first time it runs. A rewrite is a bug in the
 * data and shows up never. Same division `cropWriteSchema` above draws against `clampCrop`: Zod
 * refuses garbage, the layer with the missing context does the arithmetic.
 */

/**
 * A canonical `nina_avatars.folder` value. `''` is the album root and is VALID — every pre-F34 row
 * has it by column DEFAULT, and it is still where the singular upload path lands.
 *
 * `.max()` before `.refine()` is not redundant with the validator's own length check: it is what
 * stops a megabyte of string being `split('/')` into a million segments before anything rejects
 * it. Cheap guard, then the real predicate.
 *
 * ── `path === value` IS THE WHOLE REFUSE-DON'T-REPAIR RULE ───────────────────────────────────
 * `validateFolderPath` normalises before it judges, which is exactly right on the client and
 * exactly wrong as a server's only check: on its own it would ACCEPT `/Nina`, `Nina/`,
 * `Nina//2026`, `Nina\2026` and `"trip "` by quietly rewriting them. The identity comparison is
 * what turns a normaliser into a validator. And the failure it prevents is the invisible kind: the
 * row would land in a folder the client does not believe it asked for, its dedupe key — derived
 * from the path it *did* ask for — would be stored against it, and every later diff would compare a
 * key from path A against a row sitting at path B. Forever, and only for the paths that needed
 * rewriting. A refusal is a bug in the caller and shows up the first time it runs.
 *
 * Phase 2's `planFolderUpload` only ever proposes `validateFolderPath(...).path`, so the honest
 * client passes by construction. This is the check for every other caller.
 */
export const folderPathSchema = z
  .string()
  .max(NINA_FOLDER_MAX_PATH_CHARS)
  .refine((value) => {
    const result = validateFolderPath(value)
    return result.ok && result.path === value
  }, 'Not a folder path this album accepts.')

/**
 * A file's own name inside its folder.
 *
 * ── WHY THIS IS NOT `folderPathSchema` APPLIED TO ONE SEGMENT ───────────────────────────────
 * Because the two have different length bounds, deliberately: a folder SEGMENT is capped at
 * `NINA_FOLDER_MAX_SEGMENT_CHARS` (64) because a human typed it and a tree pane has to render it,
 * while a filename is capped at `NINA_FILENAME_MAX_CHARS` (200) because it came off a disk —
 * `IMG_20240817_101112_BURST003_COVER_TOP.jpg` is a real camera filename (46 characters) and
 * refusing it would refuse the operator's own photographs. It is also the bound phase 2's
 * `planFolderUpload` already refuses against, so a file this schema rejects never reaches it.
 *
 * The CHARACTER grammar is not re-spelled: `NINA_FOLDER_FORBIDDEN_RE` is imported, and note that
 * its sense is INVERTED against a positive class — it is a deny list, matched unanchored, so the
 * test is `!RE.test(value)`. It has no `g` flag on purpose (a global regex reused with `.test`
 * carries `lastIndex` and starts answering `false` to input it just rejected), which is what makes
 * it safe to share between a loop in `filetree.ts` and this `.refine`.
 *
 * Three refusals are added on top of the character class, and each has a reason:
 *   · **`/` explicitly.** `NINA_FOLDER_FORBIDDEN_RE` forbids `\` and not `/`, because in
 *     `filetree.ts` the forward slash is the SEPARATOR and has already been split on by the time
 *     that regex sees a segment. Here the value is one field on a JSON record and nothing has
 *     split it, so `Bali/IMG_1.jpg` would otherwise pass — a filename carrying a path is exactly
 *     the client bug this schema exists to catch.
 *   · **Trailing space, and trailing dot.** Win32 silently strips both, so `"beach "` and
 *     `"beach"` are one file on the machine the upload came from and would be two rows here.
 *   · **`.` and `..`** by name, because both are legal filenames in the abstract and neither is a
 *     legal one here.
 */
export const albumFilenameSchema = z
  .string()
  .min(1)
  .max(NINA_FILENAME_MAX_CHARS)
  .refine((value) => {
    if (value === '.' || value === '..') return false
    if (value !== value.trim()) return false
    if (value.endsWith('.')) return false
    if (value.includes(NINA_FOLDER_SEPARATOR)) return false
    return !NINA_FOLDER_FORBIDDEN_RE.test(value)
  }, 'Not a filename this album accepts.')

/**
 * The dedupe key, as a SHAPE. Its derivation is phase 2's — `(normalised relative path, size,
 * lastModified)` folded into one string, because a browser reads all three off a `File` for free
 * and hashing hundreds of megabytes to answer "have I seen this?" costs more than the upload it
 * saves.
 *
 * `\p{Cc}` and not a positive character class, matching `NINA_FOLDER_FORBIDDEN_RE`'s posture: the
 * key contains a filename that came from NTFS, so the set worth excluding is the set that would
 * make it unrepresentable, not the set that is unusual. A folder called `naïve` must round-trip.
 *
 * 800 rather than the draft's 1024, because that is where phase 2 put the bound and phase 2 is the
 * one thing that derives the key. It is still a STORAGE bound and not a taste one:
 * `(user_id, source_key)` is a unique b-tree index and a b-tree tuple cannot exceed ~2704 bytes, so
 * an unbounded client-supplied string in that index is an `INSERT` that fails inside Postgres at
 * some unpredictable path length instead of failing validation at the boundary. Phase 2's computed
 * worst case is 745 — a 512-character folder, a 200-character filename, a size and a timestamp.
 */
export const sourceKeySchema = z
  .string()
  .min(1)
  .max(NINA_SOURCE_KEY_MAX_CHARS)
  .refine((value) => !/\p{Cc}/u.test(value), 'A dedupe key carries no control characters.')

/**
 * The derived thumbnail, as a pair rather than two loose fields, so "has a thumbnail" is one
 * nullable object instead of two columns that can disagree about it.
 *
 * **Nullable, and that is deliberate.** Phase 5 derives the thumbnail in the browser
 * (`createImageBitmap` + `OffscreenCanvas`, 256 px on the short edge —
 * `EXPLORER_THUMB_SHORT_EDGE_PX` in `components/admin/explorer/thumbnail.ts`, which is the only
 * module that reads it, so it is not shared). If that
 * encode fails for one file out of three hundred, the ORIGINAL has already been PUT
 * successfully — refusing to register the row would throw away a completed upload and leave its
 * blob orphaned, to save a 20 KB optimisation. The row lands without a thumbnail, and phase 1's
 * handoff to phase 5 already says a tile falls back to `blobUrl` when `thumbUrl` is NULL, which
 * every pre-F34 row needs anyway.
 *
 * No `width`/`height`/`bytes` for the thumbnail: nothing reads them. The only bound a thumbnail
 * needs is `ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES`, enforced by Blob at PUT time via the Route
 * Handler's token — not by a number a client reported afterwards.
 */
const avatarThumbSchema = z.object({
  url: z.url().refine((value) => value.startsWith('https://'), 'Blob URLs are https'),
  pathname: z.string().min(1).max(512),
})

/**
 * One file in a folder upload. The six fields that describe the blob are spelled exactly as
 * `avatarRegisterSchema` spells them and bounded by the same constants — deliberately, because a
 * record that passes here and would fail there is a record that means two things.
 *
 * There is no `makeCurrent`. A folder upload never makes three hundred photos her face, and
 * `insertNinaAvatars` writes `isCurrent: false` for every row by construction.
 */
export const avatarBatchRecordSchema = z.object({
  folder: folderPathSchema,
  filename: albumFilenameSchema,
  sourceKey: sourceKeySchema,
  blobUrl: z.url().refine((value) => value.startsWith('https://'), 'Blob URLs are https'),
  pathname: z.string().min(1).max(512),
  contentType: z.enum(ADMIN_AVATAR_CONTENT_TYPES),
  width: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  height: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  bytes: z.number().int().positive().max(ADMIN_AVATAR_MAX_UPLOAD_BYTES),
  thumb: avatarThumbSchema.nullable(),
})
export type AvatarBatchRecord = z.infer<typeof avatarBatchRecordSchema>

/**
 * The envelope. An object holding one array rather than a bare array, so a future field (a batch
 * id, a "this is the last chunk" flag) is an additive change instead of a shape change on a Server
 * Action phase 5 already calls.
 *
 * ── WHY THE CAP EXISTS, AND WHY IT IS `NINA_ADMIN_BATCH_MAX` ────────────────────────────────
 * Next dispatches Server Actions **one at a time per client**
 * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Sequential dispatch on the
 * client"; `components/nina/Composer.tsx:68-75` already pays that tax knowingly for three chat
 * photos). Three hundred sequential action round trips is not a design, it is a stall — which is
 * why the register is batched at all. The blob PUTs are the opposite: they go through the Route
 * Handler straight to Blob and genuinely run in parallel under phase 5's bounded-concurrency
 * queue. **Parallel bytes, batched bookkeeping.**
 *
 * 50 rather than 300, and the number is phase 1's for phase 1's reason (parameter count and blast
 * radius — a failed request loses one chunk, not the upload). Two more reasons hold it there from
 * this side:
 *  · **The 1 MB action body cap.** Action requests are capped at 1 MB by default and
 *    `next.config.ts` sets no `serverActions.bodySizeLimit`. A record is ~450 bytes of JSON (two
 *    Blob URLs dominate it), so 50 is ~25 KB — two orders of magnitude of margin, which is the
 *    right margin for a limit whose failure mode is an opaque request rejection.
 *  · `insertNinaAvatars` THROWS above this number, and phase 1 wrote that throw to be unreachable.
 *    This is the check that makes it unreachable.
 *
 * ── ALL-OR-NOTHING AT THE SCHEMA BOUNDARY, ON PURPOSE ───────────────────────────────────────
 * One bad record fails the whole call. That reads harsh for a 50-file batch until you ask where a
 * bad record could come from: phase 2's `planFolderUpload` has already partitioned the walk into
 * *to upload*, *already there*, *rejected* (not an image) and *refused* (too big, too deep,
 * unnamed) BEFORE anything was PUT, and phase 5 only puts a record in this array for a file whose
 * blob landed. So a record that fails this schema is not user data — it is a bug in the client, and
 * a partial-success path would let that bug write half a batch and stay invisible. Per-file
 * refusals belong on the client, beside the file's name.
 */
export const avatarBatchRegisterSchema = z.object({
  records: z.array(avatarBatchRecordSchema).min(1).max(NINA_ADMIN_BATCH_MAX),
})
export type AvatarBatchRegister = z.infer<typeof avatarBatchRegisterSchema>

/** What the client asks for before walking a folder: the subtree it is about to diff. */
export const albumManifestSchema = z.object({
  /** `''` means the whole album, which is what a drop onto the root asks for. */
  folder: folderPathSchema,
})
export type AlbumManifestRequest = z.infer<typeof albumManifestSchema>

/* ============================================================================
 * nina-character-tuning phase 5 — ONE whole-tuning write.
 * Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * What `/admin/nina`'s character panel may write. R1, R2 and R3 arrive as **one object**, and that
 * is plan invariant 11 rather than a preference.
 *
 * ── ONE SAVE, NOT SIXTEEN ───────────────────────────────────────────────────────────────────
 * Next dispatches Server Actions ONE AT A TIME PER CLIENT — the same fact
 * `avatarBatchRegisterSchema` above is built around, and the tax
 * `components/nina/Composer.tsx` already pays knowingly for three chat photos. Sixteen dials as
 * sixteen sequential actions is not a design, it is a stall. The whole tuning is ~1 KB of JSON
 * against a 1 MB action body cap (`next.config.ts` sets no `serverActions.bodySizeLimit`), so there
 * is nothing to batch and nothing to chunk: it is one write of one row.
 *
 * ── TWO LAYERS OF BOUNDS, THE SAME DIVISION AS `cropWriteSchema` ────────────────────────────
 * This schema enforces the SHAPE — an integer inside phase 1's own advertised range, a
 * relationship that exists, strings under a length that cannot crowd out the canon they sit
 * beside. Phase 1's clamp (`coerceNinaTuning`, called inside `writeNinaTuning`) is what GUARANTEES
 * the range, because it is on every path into the row and this schema is only on the path from a
 * browser. Neither alone is sufficient: a schema cannot be the invariant for a value the cron path
 * could also write, and a clamp cannot reject `anger: "banana"`.
 *
 * ── STRICT, AND THEREFORE REFUSE-DON'T-REPAIR ───────────────────────────────────────────────
 * `z.strictObject` on both dial groups, so an unknown or misspelled dial key FAILS rather than
 * being silently stripped. `lib/nina/schema.ts` argues the opposite for MODEL output — an extra
 * key the model invents is noise, and stripping it is the kind thing to do — and the difference is
 * the sender: a model improvises, a browser we wrote does not. A stripped `flirtyy` would save
 * fifteen dials and report success, and the operator would watch one slider silently refuse to
 * take. That is the invisible failure `folderPathSchema`'s `path === value` rule above exists to
 * prevent, in a different shape.
 *
 * Every bound is IMPORTED. `lib/admin/avatars.ts`'s rule holds here too: *"a constant that is
 * agreed rather than shared is a constant that will one day disagree."*
 */
const dialValueSchema = z.number().int().min(NINA_SCORE_MIN).max(NINA_SCORE_MAX)

/**
 * One `dialValueSchema` per key phase 1 declares, built from the array rather than spelled out.
 * Spelling eleven trait keys here would put phase 1's vocabulary in a second place, and the first
 * dial phase 1 adds would then pass typecheck and fail validation.
 */
function dialShape<K extends string>(keys: readonly K[]): Record<K, typeof dialValueSchema> {
  const shape = {} as Record<K, typeof dialValueSchema>
  for (const key of keys) shape[key] = dialValueSchema
  return shape
}

export const ninaTuningWriteSchema = z.object({
  userId: userIdSchema,
  traits: z.strictObject(dialShape(NINA_TRAITS)),
  dials: z.strictObject(dialShape(NINA_DIALS)),
  relationship: z.enum(NINA_RELATIONSHIPS),
  /** Goes into an IMAGE prompt, not into her voice. Empty is valid and means "the anchor outfit". */
  wardrobe: z.string().trim().max(NINA_WARDROBE_MAX),
  /** Handed to her verbatim in the system prompt. Empty is valid and is the default. */
  notes: z.string().trim().max(NINA_NOTES_MAX),
})
export type NinaTuningWriteInput = z.infer<typeof ninaTuningWriteSchema>

/**
 * The reset takes no tuning at all — deliberately. The defaults it writes are phase 1's module
 * constant, so accepting them from the client would be accepting a client's opinion of what
 * "default" means, and invariant 2 is the one thing in this set that must not be negotiable.
 */
export const ninaTuningResetSchema = z.object({
  userId: userIdSchema,
})
export type NinaTuningResetInput = z.infer<typeof ninaTuningResetSchema>
