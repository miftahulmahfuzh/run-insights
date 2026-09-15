import { z } from 'zod'

/**
 * Everything `searchNinaAvatarsAction` accepts from a browser — the admin album's semantic search,
 * R2/R3/R4.
 *
 * ── ITS OWN FILE, AND NOT `lib/admin/schema.ts` ─────────────────────────────────────────────
 * `lib/admin/chatPhotoSchema.ts`'s header made this call first and its first reason is this
 * phase's reason verbatim: another phase of this same plan set is editing `lib/admin/` in the same
 * worktree at the same time, and two sessions appending to one file is a merge conflict
 * manufactured on purpose. Its second reason applies too — a schema module carrying a `'use server'`
 * sibling's ceilings is a plain module, and these two constants have to be importable by a test
 * without dragging an action's import graph in.
 *
 * ── WHAT A SCHEMA IS AND IS NOT ─────────────────────────────────────────────────────────────
 * Shape only. Nothing here knows a user id; ownership is the action's job, and every statement
 * below it carries `user_id` in its WHERE. What IS here is the one cross-field rule — a search
 * with neither arm is not a search — because that is a pure question about the payload.
 */

/**
 * How long a typed query may be.
 *
 * A search phrase, not an essay: the embedding model gets one sentence's worth of intent, and a
 * 4000-character paste is a mis-click or a paste of the wrong buffer. Refused rather than
 * truncated, this repo's rule for a schema (`chatPhotoDescriptionField`): silently shortening the
 * query would rank against half of what the operator asked for and report success.
 */
export const NINA_ALBUM_SEARCH_TEXT_MAX = 500

/**
 * The hard ceiling on the query image, measured in CHARACTERS of its data URI.
 *
 * ── THE REAL BOUND IS NEXT'S 1 MB SERVER ACTION BODY ────────────────────────────────────────
 * `next.config.ts` sets no `serverActions.bodySizeLimit`, so the default 1 MB applies and the data
 * URI is the whole body. 700 000 characters is ~512 KB of image bytes after base64's 4/3 expansion,
 * which leaves real headroom for the action's framing and for a typed query riding alongside it.
 *
 * ── AND IT IS A CEILING, NOT A TARGET ───────────────────────────────────────────────────────
 * The browser is expected to re-encode the picked file to a small JPEG before sending it, and the
 * short edge must stay well above the ~640 px token-floor hazard `lib/nina/images.ts` documents.
 *
 * The query image is NEVER written to Blob — it is an ephemeral comparison input, and
 * `describeNinaImagesWithFallback` takes a `NinaDescribeImage { dataUri }` directly.
 */
export const NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS = 700_000

/**
 * The three types `/admin/nina` already accepts for an avatar, as a base64 data URI. No `svg`, no
 * `gif`, and no hosted `https:` URL: this string is placed straight into an `image_url` part sent
 * to a vendor whose measured failure mode is "200 OK with invented content", so what it may claim
 * to be is allow-listed rather than passed through — the same posture `toDataUri` takes in
 * `lib/nina/vision.ts`.
 *
 * One greedy character class and an optional pad; no nested quantifier, so it is linear on the
 * 700 KB string the ceiling above permits.
 */
const NINA_ALBUM_SEARCH_DATA_URI_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/**
 * **"a search field, plus a button to upload image"** — either one, or both.
 *
 * `.max()` BEFORE `.transform()`, this repo's ordering rule: an over-long query is REFUSED and
 * reported, never normalised into range. The transform folds every run of whitespace to one space
 * and trims, so `"  red   dress \n"` and `"red dress"` produce the same vector and therefore the
 * same ranking — an embedding model does not need the operator's stray newline to be meaningful.
 *
 * The refine is the one rule worth stating twice: **an empty query never reaches a vendor.** An
 * all-blank box normalises to `''` and is refused here, before `describeNinaImagesWithFallback` and
 * before `embedNinaText` — a blank search that cost a model call and returned the album in
 * arbitrary order would be the worst of both.
 */
export const ninaAlbumSearchSchema = z
  .object({
    text: z
      .string()
      .max(NINA_ALBUM_SEARCH_TEXT_MAX)
      .transform((value) => value.replace(/\s+/g, ' ').trim())
      .optional(),
    imageDataUri: z
      .string()
      .max(NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS)
      .regex(NINA_ALBUM_SEARCH_DATA_URI_RE, 'Not an inline JPEG, PNG or WebP')
      .optional(),
  })
  .refine((value) => (value.text ?? '').length > 0 || value.imageDataUri != null, {
    message: 'A search needs some text, a photo, or both',
    path: ['text'],
  })

export type NinaAlbumSearchInput = z.infer<typeof ninaAlbumSearchSchema>
