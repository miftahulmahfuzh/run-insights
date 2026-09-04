import { describe, expect, it } from 'vitest'

import {
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  adminAvatarPathname,
  adminAvatarThumbPathname,
  extForContentType,
  isAdminAvatarRequestPathname,
  isAdminAvatarThumbRequestPathname,
} from '@/lib/admin/avatars'
import {
  NINA_FILENAME_MAX_CHARS,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_PATH_CHARS,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
  NINA_SOURCE_KEY_MAX_CHARS,
} from '@/lib/admin/filetree'
import {
  albumFilenameSchema,
  avatarBatchRegisterSchema,
  avatarRegisterSchema,
  cropWriteSchema,
} from '@/lib/admin/schema'
import { NINA_ADMIN_BATCH_MAX } from '@/lib/nina/album'

/**
 * F33 phase 15's boundary logic — the half that is not in `lib/nina/crop.test.ts`: the pathname
 * regex (a path-traversal defence), the content-type mapping, and the Zod schemas that bound what
 * a browser may say.
 */

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'

describe('adminAvatarPathname / isAdminAvatarRequestPathname', () => {
  it('round-trips the shape the CLI already writes', () => {
    const pathname = adminAvatarPathname(USER, ID, 'jpg')
    expect(pathname).toBe(`nina/${USER}/avatar-${ID}.jpg`)
    expect(isAdminAvatarRequestPathname(pathname, USER)).toBe(true)
  })

  it('accepts all three extensions and nothing else', () => {
    expect(isAdminAvatarRequestPathname(adminAvatarPathname(USER, ID, 'png'), USER)).toBe(true)
    expect(isAdminAvatarRequestPathname(adminAvatarPathname(USER, ID, 'webp'), USER)).toBe(true)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-${ID}.gif`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-${ID}.jpg.html`, USER)).toBe(false)
  })

  it('refuses another user folder, traversal, and the chat prefix', () => {
    expect(isAdminAvatarRequestPathname(`nina/someoneelse/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/../avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/chat/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`shots/${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(adminAvatarPathname(USER, ID, 'jpg'), 'other')).toBe(false)
  })

  it('refuses an id that is not nanoid(12)', () => {
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-short.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-${ID}x.jpg`, USER)).toBe(false)
  })

  it('refuses a user id that is not id-shaped, rather than interpolating it into a regex', () => {
    expect(isAdminAvatarRequestPathname('nina/./avatar.jpg', '.')).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/a.*/avatar-${ID}.jpg`, 'a.*')).toBe(false)
  })
})

describe('extForContentType', () => {
  it('maps the three we accept and refuses everything else', () => {
    expect(extForContentType('image/jpeg')).toBe('jpg')
    expect(extForContentType('image/png')).toBe('png')
    expect(extForContentType('image/webp')).toBe('webp')
    expect(extForContentType('image/gif')).toBeNull()
    expect(extForContentType('image/svg+xml')).toBeNull()
    expect(extForContentType('')).toBeNull()
  })
})

describe('cropWriteSchema', () => {
  const base = { id: ID, scale: 1.5, x: 10, y: -10 }

  it('accepts a real crop', () => {
    expect(cropWriteSchema.safeParse(base).success).toBe(true)
  })

  it('refuses a sub-cover or absurd scale', () => {
    expect(cropWriteSchema.safeParse({ ...base, scale: 0.9 }).success).toBe(false)
    expect(cropWriteSchema.safeParse({ ...base, scale: 40 }).success).toBe(false)
  })

  it('refuses non-integer offsets and offsets past the absolute ceiling', () => {
    expect(cropWriteSchema.safeParse({ ...base, x: 1.5 }).success).toBe(false)
    expect(cropWriteSchema.safeParse({ ...base, y: 99_999 }).success).toBe(false)
  })

  it('refuses a bogus id', () => {
    expect(cropWriteSchema.safeParse({ ...base, id: 'nope' }).success).toBe(false)
  })
})

describe('avatarRegisterSchema', () => {
  const base = {
    blobUrl: 'https://example.public.blob.vercel-storage.com/nina/u/avatar-x.jpg',
    pathname: `nina/${USER}/avatar-${ID}-suffix.jpg`,
    contentType: 'image/jpeg' as const,
    width: 1792,
    height: 2400,
    bytes: 1_500_000,
    makeCurrent: true,
  }

  it('accepts a real registration', () => {
    expect(avatarRegisterSchema.safeParse(base).success).toBe(true)
  })

  it('refuses an image too small to frame and one impossibly large', () => {
    expect(avatarRegisterSchema.safeParse({ ...base, width: 64 }).success).toBe(false)
    expect(avatarRegisterSchema.safeParse({ ...base, height: 99_999 }).success).toBe(false)
  })

  it('refuses a non-https blob url and an unaccepted content type', () => {
    expect(avatarRegisterSchema.safeParse({ ...base, blobUrl: 'http://x/y.jpg' }).success).toBe(
      false,
    )
    expect(avatarRegisterSchema.safeParse({ ...base, contentType: 'image/gif' }).success).toBe(
      false,
    )
  })

  it('refuses a payload over the upload cap', () => {
    expect(
      avatarRegisterSchema.safeParse({ ...base, bytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES + 1 }).success,
    ).toBe(false)
  })
})

describe('adminAvatarThumbPathname / isAdminAvatarThumbRequestPathname', () => {
  it('is the avatar shape with a thumb- segment and the same id', () => {
    const pathname = adminAvatarThumbPathname(USER, ID, 'webp')
    expect(pathname).toBe(`nina/${USER}/thumb-${ID}.webp`)
    expect(isAdminAvatarThumbRequestPathname(pathname, USER)).toBe(true)
  })

  it('keeps the two shapes apart in both directions', () => {
    // Two predicates, not one widened regex: the Route Handler applies a different size cap to
    // each, so it has to know WHICH shape it was handed.
    expect(isAdminAvatarThumbRequestPathname(adminAvatarPathname(USER, ID, 'jpg'), USER)).toBe(
      false,
    )
    expect(isAdminAvatarRequestPathname(adminAvatarThumbPathname(USER, ID, 'webp'), USER)).toBe(
      false,
    )
  })

  it('refuses another user folder, traversal and a bad id, exactly as the avatar half does', () => {
    expect(isAdminAvatarThumbRequestPathname(`nina/someoneelse/thumb-${ID}.webp`, USER)).toBe(false)
    expect(isAdminAvatarThumbRequestPathname(`nina/${USER}/../thumb-${ID}.webp`, USER)).toBe(false)
    expect(isAdminAvatarThumbRequestPathname(`nina/${USER}/thumb-short.webp`, USER)).toBe(false)
    expect(isAdminAvatarThumbRequestPathname(`nina/${USER}/thumb-${ID}.gif`, USER)).toBe(false)
    expect(
      isAdminAvatarThumbRequestPathname(adminAvatarThumbPathname(USER, ID, 'jpg'), 'other'),
    ).toBe(false)
  })

  it('refuses a user id that is not id-shaped rather than interpolating it into a regex', () => {
    expect(isAdminAvatarThumbRequestPathname(`nina/a.*/thumb-${ID}.webp`, 'a.*')).toBe(false)
  })
})

/* ── admin-album-file-manager phase 4 — the folder-aware upload boundary ──────────────────── */

describe('albumFilenameSchema', () => {
  it('accepts what a camera and a screenshot actually produce', () => {
    expect(albumFilenameSchema.safeParse('IMG_20240817_101112.jpg').success).toBe(true)
    expect(albumFilenameSchema.safeParse('Screenshot 2024-08-17 at 10.11.12.png').success).toBe(
      true,
    )
    expect(albumFilenameSchema.safeParse('naïve — kopi.webp').success).toBe(true)
  })

  it('is bounded far above a folder segment, because it came off a disk', () => {
    const long = `${'a'.repeat(NINA_FILENAME_MAX_CHARS - 4)}.jpg`
    expect(long.length).toBe(NINA_FILENAME_MAX_CHARS)
    expect(albumFilenameSchema.safeParse(long).success).toBe(true)
    expect(albumFilenameSchema.safeParse(`a${long}`).success).toBe(false)
    // Longer than a FOLDER segment is allowed, which is the whole reason this is a second schema.
    expect(NINA_FILENAME_MAX_CHARS).toBeGreaterThan(NINA_FOLDER_MAX_SEGMENT_CHARS)
  })

  it('refuses a name that is a path, a Win32-illegal character, and the empty name', () => {
    // `/` is refused explicitly, because `NINA_FOLDER_FORBIDDEN_RE` forbids `\` and not `/` — in
    // `filetree.ts` the forward slash is the separator and has already been split on.
    expect(albumFilenameSchema.safeParse('Bali/IMG_1.jpg').success).toBe(false)
    expect(albumFilenameSchema.safeParse('Bali\\IMG_1.jpg').success).toBe(false)
    expect(albumFilenameSchema.safeParse('IMG:1.jpg').success).toBe(false)
    expect(albumFilenameSchema.safeParse('IMG?.jpg').success).toBe(false)
    expect(albumFilenameSchema.safeParse('').success).toBe(false)
  })

  it('refuses the names Win32 silently rewrites, so the tree cannot grow a twin', () => {
    expect(albumFilenameSchema.safeParse('IMG_1.jpg ').success).toBe(false)
    expect(albumFilenameSchema.safeParse(' IMG_1.jpg').success).toBe(false)
    expect(albumFilenameSchema.safeParse('IMG_1.').success).toBe(false)
    expect(albumFilenameSchema.safeParse('.').success).toBe(false)
    expect(albumFilenameSchema.safeParse('..').success).toBe(false)
  })
})

describe('avatarBatchRegisterSchema', () => {
  const record = {
    folder: 'Pictures/Nina/2026/09',
    filename: 'IMG_20240817_101112.jpg',
    // Phase 2's real format: `v1|<bytes>|<epochSeconds>|<folded relative path>`.
    sourceKey: 'v1|2481003|1723881072|pictures/nina/2026/09/img_20240817_101112.jpg',
    blobUrl: 'https://example.public.blob.vercel-storage.com/nina/u/avatar-x.jpg',
    pathname: `nina/${USER}/avatar-${ID}-suffix.jpg`,
    contentType: 'image/jpeg' as const,
    width: 1792,
    height: 2400,
    bytes: 2_481_003,
    thumb: {
      url: 'https://example.public.blob.vercel-storage.com/nina/u/thumb-x.webp',
      pathname: `nina/${USER}/thumb-${ID}-suffix.webp`,
    },
  }

  it('accepts a real folder batch', () => {
    expect(avatarBatchRegisterSchema.safeParse({ records: [record] }).success).toBe(true)
  })

  it('accepts a record at the album root', () => {
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, folder: '' }] }).success,
    ).toBe(true)
  })

  it('accepts a record whose thumbnail encode failed, rather than losing the upload', () => {
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, thumb: null }] }).success,
    ).toBe(true)
  })

  it('bounds the batch with NINA_ADMIN_BATCH_MAX, so insertNinaAvatars never throws', () => {
    expect(avatarBatchRegisterSchema.safeParse({ records: [] }).success).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({ records: Array(NINA_ADMIN_BATCH_MAX).fill(record) })
        .success,
    ).toBe(true)
    expect(
      avatarBatchRegisterSchema.safeParse({ records: Array(NINA_ADMIN_BATCH_MAX + 1).fill(record) })
        .success,
    ).toBe(false)
  })

  it('refuses a non-canonical folder rather than normalising it', () => {
    /*
     * THE `path === value` IDENTITY CHECK, PROVED. `validateFolderPath` on its own would ACCEPT
     * every one of these by rewriting it — that is what a normaliser is for. Each of these cases
     * is therefore a test of the identity comparison in `folderPathSchema` and not of phase 2's
     * grammar, which is why it is asserted here rather than in `tests/admin.filetree.test.ts`.
     */
    for (const folder of ['/Nina', 'Nina/', 'Nina//2026', 'Nina\\2026', 'Nina/./2026', 'trip ']) {
      expect(
        avatarBatchRegisterSchema.safeParse({ records: [{ ...record, folder }] }).success,
      ).toBe(false)
    }
    // A traversal fails the grammar itself, not just the identity check.
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, folder: 'Nina/../etc' }] })
        .success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({
        records: [{ ...record, folder: 'a'.repeat(NINA_FOLDER_MAX_PATH_CHARS + 1) }],
      }).success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({
        records: [
          {
            ...record,
            folder: Array(NINA_FOLDER_MAX_DEPTH + 1)
              .fill('a')
              .join('/'),
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('requires a dedupe key and bounds it at the b-tree limit', () => {
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, sourceKey: '' }] }).success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({
        records: [{ ...record, sourceKey: 'a'.repeat(NINA_SOURCE_KEY_MAX_CHARS) }],
      }).success,
    ).toBe(true)
    expect(
      avatarBatchRegisterSchema.safeParse({
        records: [{ ...record, sourceKey: 'a'.repeat(NINA_SOURCE_KEY_MAX_CHARS + 1) }],
      }).success,
    ).toBe(false)
  })

  it('bounds the blob fields exactly as the singular register does', () => {
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, width: 64 }] }).success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({
        records: [{ ...record, bytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES + 1 }],
      }).success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, blobUrl: 'http://x/y.jpg' }] })
        .success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({ records: [{ ...record, contentType: 'image/gif' }] })
        .success,
    ).toBe(false)
    expect(
      avatarBatchRegisterSchema.safeParse({
        records: [{ ...record, thumb: { ...record.thumb, url: 'http://x/t.webp' } }],
      }).success,
    ).toBe(false)
  })
})
