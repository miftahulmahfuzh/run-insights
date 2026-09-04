import { NINA_BLOB_PREFIX } from '@/lib/nina/images'

/**
 * Where an admin-uploaded avatar lives, what it may be, and how big it may get. F33 R23.
 *
 * Pure apart from one constant import, in the shape of `lib/extract/constants.ts` and for the same
 * stated reason: `components/admin/UploadAvatar.tsx` (a client module),
 * `app/api/admin/nina/upload/route.ts` (a Route Handler), `lib/admin/ninaAlbumActions.ts` (a
 * Server Action) and `tests/admin.avatars.test.ts` all have to agree, and a constant that is
 * agreed rather than shared is a constant that will one day disagree.
 *
 * ── THE PREFIX IS IMPORTED, NOT DECLARED ────────────────────────────────────────────────────
 * Ruling A6: `NINA_BLOB_PREFIX = 'nina/'` has exactly one definition, in `lib/nina/images.ts`,
 * which is pure and zero-import precisely so every host can reach it. The plan's own
 * `ADMIN_AVATAR_PREFIX` would have been a second spelling of the same string.
 *
 * ── THE PATHNAME IS PHASE 14'S, WITH THREE EXTENSIONS INSTEAD OF ONE ────────────────────────
 * `/update-nina-profpic` writes `nina/<userId>/avatar-<nanoid12>.jpg` because it re-encodes
 * through `sharp`. This page does not re-encode (see `UploadAvatar`'s header), so it keeps the
 * source container: `.jpg`, `.png` or `.webp`. Same prefix (RU-7: blobs under `nina/<userId>/`),
 * same `avatar-` segment, same id length — so `scripts/blob-reap.mjs` will one day be taught one
 * pattern and not two. It knows about neither today; ruling D4 files that as one card.
 *
 * ── WHY THE REQUEST REGEX AND THE STORED PATH ARE DIFFERENT SHAPES ──────────────────────────
 * `addRandomSuffix: true` means Blob rewrites the pathname it was asked for. The regex here
 * validates what the CLIENT may ASK for; the stored pathname carries Blob's suffix and is
 * whatever `put` returned. This is the `SHOT_REQUEST_PATHNAME_RE` / `SHOT_STORED_PATHNAME_RE`
 * split in `lib/extract/constants.ts`, and only the request half is enforceable.
 */

export const ADMIN_AVATAR_EXTS = ['jpg', 'png', 'webp'] as const
export type AdminAvatarExt = (typeof ADMIN_AVATAR_EXTS)[number]

/** The three a phone camera, a screenshot and an image generator actually produce. */
export const ADMIN_AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AdminAvatarContentType = (typeof ADMIN_AVATAR_CONTENT_TYPES)[number]

/**
 * 8 MB. A 4032×3024 iPhone JPEG is ~4 MB and a lightly-compressed PNG portrait is ~7 MB, so this
 * accepts an un-touched original while still refusing a 40 MB TIFF-in-a-PNG by accident. The
 * browser PUTs straight to Blob, so the ~4.5 MB Vercel Function body limit does not apply.
 */
export const ADMIN_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Below this the circular frame cannot be zoomed at all without visible mush. */
export const ADMIN_AVATAR_MIN_EDGE_PX = 256

/** A sanity ceiling on the dimensions the client reports. Nothing real is 12000 px. */
export const ADMIN_AVATAR_MAX_EDGE_PX = 12_000

/** `newId()` is nanoid(12) over `A-Za-z0-9_-`. */
export const ADMIN_AVATAR_ID_RE = /^[A-Za-z0-9_-]{12}$/

/** Ten minutes, matching `UPLOAD_TOKEN_TTL_MS`. Long enough for a slow desktop upload. */
export const ADMIN_AVATAR_TOKEN_TTL_MS = 10 * 60 * 1000

/** One year. The pathname carries a random suffix, so the bytes at a URL never change. */
export const ADMIN_AVATAR_CACHE_MAX_AGE = 60 * 60 * 24 * 365

/** `nina/<userId>/avatar-<id>.<ext>` — what the client asks for. */
export function adminAvatarPathname(userId: string, id: string, ext: AdminAvatarExt): string {
  return `${NINA_BLOB_PREFIX}${userId}/avatar-${id}.${ext}`
}

/** The extension for a content type, or `null` if we do not accept it. */
export function extForContentType(contentType: string): AdminAvatarExt | null {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

/**
 * The path-traversal defence and the "do not write beside anything else in the store" defence, in
 * one predicate. The user id is INTERPOLATED FROM THE SESSION by the route, never taken from the
 * request, so a client cannot write into another user's folder even though there is one user.
 */
export function isAdminAvatarRequestPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false
  const pattern = new RegExp(
    `^${NINA_BLOB_PREFIX}${userId}/avatar-[A-Za-z0-9_-]{12}\\.(${ADMIN_AVATAR_EXTS.join('|')})$`,
  )
  return pattern.test(pathname)
}
