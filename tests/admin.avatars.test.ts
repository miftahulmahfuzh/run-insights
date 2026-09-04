import { describe, expect, it } from 'vitest'

import {
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  adminAvatarPathname,
  adminAvatarThumbPathname,
  extForContentType,
  isAdminAvatarRequestPathname,
  isAdminAvatarThumbRequestPathname,
} from '@/lib/admin/avatars'
import { avatarRegisterSchema, cropWriteSchema } from '@/lib/admin/schema'

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
