/**
 * The chat-image contract: how big a photo Nina's eyes get, where it lands in Blob, and which
 * picked files are allowed in at all.
 *
 * PURE ON PURPOSE, exactly as `lib/extract/constants.ts` is pure on purpose. No imports, no
 * `server-only`, no `@/lib/env`. This module is read by a `'use client'` composer, by
 * `app/api/upload/route.ts`, by `lib/nina/actions.ts` and by the unit suite. One import of
 * anything server-side and the client half of this phase stops compiling.
 *
 * AND BY THREE LATER PHASES, which is why the rule above is now permanent (RULING A6): phase 12's
 * `imagerecipe.ts` test, phase 14's `.mjs` backfill script (imported as
 * `'../lib/nina/images.ts'` under `--experimental-strip-types`) and phase 15's
 * `lib/admin/avatars.ts` all read `NINA_BLOB_PREFIX` from here. Two of those break at RUNTIME
 * rather than at `tsc` if this file ever grows an import. Do not add one.
 *
 * ── WHY THESE NUMBERS DIFFER FROM F04's ─────────────────────────────────────────────────────
 * F04's 560 px / q80 is a MEASUREMENT: five consecutive 108/108 scores at transcribing small
 * rendered type. A post-run selfie has no small type. What `glm-4.6v` has to resolve here is a
 * face, sweat, the light and the background, and undershooting does not produce a wrong digit —
 * it produces "a person outdoors" where the whole feature needed "drenched, squinting into low
 * sun". So the short edge goes up to 768 and the quality down to 0.75. See the phase-6 plan's
 * Step 1.
 */

/** RU-5's four-bubble reply has a three-photo counterpart; the same "enough, not endless" call. */
export const NINA_MAX_CHAT_IMAGES = 3

/** DESIGNED, not measured. ~1024x768 at 4:3 -> ~1,700 input tokens. See the header. */
export const NINA_CHAT_TARGET_SHORT_EDGE_PX = 768
/** DESIGNED. A photograph tolerates more chroma loss than rendered UI type. */
export const NINA_CHAT_TARGET_QUALITY = 0.75
/** The compressor's byte ceiling, in MB, as `browser-image-compression` wants it. */
export const NINA_CHAT_TARGET_MAX_MB = 1
/**
 * Server-side ceiling for the compressed upload, enforced at token-mint time. ~4x the expected
 * 120-200 KB, the same safety ratio `MAX_UPLOAD_BYTES` was chosen for, so "upload the raw
 * original" still fails loudly rather than quietly eating the free tier.
 */
export const NINA_CHAT_MAX_UPLOAD_BYTES = 900_000
/** Reject before decoding. Same 25 MB as F04: a photo bigger than this is a mistake. */
export const NINA_CHAT_MAX_SOURCE_BYTES = 25 * 1024 * 1024

/** The compressor always emits JPEG, so exactly one type is allowed through. */
export const NINA_CHAT_CONTENT_TYPE = 'image/jpeg'
export const NINA_CHAT_ALLOWED_CONTENT_TYPES = ['image/jpeg'] as const

/* ── Blob paths (RU-7) ───────────────────────────────────────────────────────────────────── */

/**
 * Everything Nina owns lives under here. Phases 12 and 13 write siblings of `chat/`.
 *
 * **THE ONE DEFINITION IN THE REPO (RULING A6).** Phase 12 spells it inline inside
 * `ninaImagePathname` to keep `imagerecipe.ts` zero-import for the Actions worker, and asserts the
 * two agree in a test that imports this constant; phase 14's `.mjs` script imports it from
 * `'../lib/nina/images.ts'`; phase 15's `lib/admin/avatars.ts` imports it instead of declaring an
 * `ADMIN_AVATAR_PREFIX`. Which is exactly why the file header's no-imports rule is not a style
 * preference: three hosts outside this phase now depend on this module staying reachable from
 * anywhere.
 */
export const NINA_BLOB_PREFIX = 'nina/'
/** The one segment this phase claims. `nina/<userId>/chat/<id>.jpg`. */
export const NINA_CHAT_SEGMENT = 'chat'
/**
 * `lib/id.ts`'s `newId()` is 12 symbols over the URL-safe alphabet. The upper bound is 24 because
 * the STORED pathname carries Vercel's random suffix on top of the requested one, and
 * `describeNinaImage` re-validates the stored form.
 */
export const NINA_CHAT_ID_RE = /^[A-Za-z0-9_-]{12,24}$/

/**
 * A user id is a path segment here, so it must be one. Auth.js's adapter mints `crypto.randomUUID()`
 * ids, which are URL-safe, but this throws rather than trusting that: a `..` or a `/` arriving in a
 * user id would turn the pathname check below into a path-traversal hole, and a loud throw at the
 * one place that builds the path is the cheapest possible defence.
 */
function assertPathSegment(userId: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
    throw new Error(
      `ninaChatPathname: user id is not a safe path segment: ${JSON.stringify(userId)}`,
    )
  }
}

/** What the browser is allowed to ASK for. Vercel appends its own random suffix on top. */
export function ninaChatPathname(userId: string, id: string): string {
  assertPathSegment(userId)
  if (!NINA_CHAT_ID_RE.test(id)) {
    throw new Error(`ninaChatPathname: bad image id ${JSON.stringify(id)}`)
  }
  return `${NINA_BLOB_PREFIX}${userId}/${NINA_CHAT_SEGMENT}/${id}.jpg`
}

/**
 * The whole of the path-traversal and don't-write-beside-anything-else defence for the chat
 * branch, and **stronger than F04's `SHOT_REQUEST_PATHNAME_RE`**: this does not merely check an
 * alphabet, it binds the requested path to the AUTHENTICATED user. A signed-in runner cannot mint
 * a token that writes into another user's prefix, which matters because `proxy.ts` deliberately
 * does not match `/api/*` and `getUserId()` in the route is the only thing between the open
 * internet and a writable blob store.
 *
 * Compared segment by segment rather than by interpolating `userId` into a RegExp: a user id is
 * data, and data does not belong in a pattern.
 */
export function isNinaChatRequestPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false
  const parts = pathname.split('/')
  if (parts.length !== 4) return false
  const [prefix, owner, segment, file] = parts
  if (prefix !== 'nina') return false
  if (owner !== userId) return false
  if (segment !== NINA_CHAT_SEGMENT) return false
  if (file == null || !file.endsWith('.jpg')) return false
  return NINA_CHAT_ID_RE.test(file.slice(0, -'.jpg'.length))
}

/* ── The picker's decision ───────────────────────────────────────────────────────────────── */

export type NinaPickRejectionReason = 'not_an_image' | 'too_large' | 'too_many'

export interface NinaPickRejection {
  name: string
  reason: NinaPickRejectionReason
}

export interface NinaPickCandidate {
  name: string
  type: string
  size: number
}

export interface NinaPickedPlan {
  accepted: NinaPickCandidate[]
  rejected: NinaPickRejection[]
}

/**
 * Which of the files he just picked are going anywhere. PURE, and separated from the component for
 * the reason invariant 6 gives and the reason F17 measured: `UploadPicker` once decided from
 * INSIDE a `setState` updater, Strict Mode double-invoked it, and one picked file minted two
 * upload tokens and orphaned a blob in the store for good. Decide here, hand `setState` a value,
 * run the effects afterwards.
 *
 * `alreadyHeld` is the count of tiles the composer is already holding, so picking twice in a row
 * cannot exceed the cap. Rejections are returned rather than thrown: three of four files being
 * fine is a normal outcome, not an error.
 */
export function planNinaPicked(
  files: readonly NinaPickCandidate[],
  opts: { alreadyHeld: number },
): NinaPickedPlan {
  const accepted: NinaPickCandidate[] = []
  const rejected: NinaPickRejection[] = []
  let room = Math.max(0, NINA_MAX_CHAT_IMAGES - opts.alreadyHeld)

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      rejected.push({ name: file.name, reason: 'not_an_image' })
      continue
    }
    if (file.size > NINA_CHAT_MAX_SOURCE_BYTES) {
      rejected.push({ name: file.name, reason: 'too_large' })
      continue
    }
    if (room === 0) {
      rejected.push({ name: file.name, reason: 'too_many' })
      continue
    }
    accepted.push(file)
    room -= 1
  }

  return { accepted, rejected }
}
