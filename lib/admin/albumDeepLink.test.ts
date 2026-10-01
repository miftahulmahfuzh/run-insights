import { describe, expect, it } from 'vitest'

import { NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE } from '@/lib/admin/filetree'
import { PHOTO_POINTER_KINDS } from '@/lib/photos/pointer'

import {
  adminPhotoLink,
  hrefForAvatar,
  hrefForMediaPhoto,
  hrefForMediaView,
  NINA_AVATAR_PARAM,
  NINA_MEDIA_PHOTO_PARAM,
} from './albumDeepLink'

/**
 * The `?avatar=` grammar, from both ends at once: `SearchResultsGrid` writes it and
 * `app/admin/nina/page.tsx` reads it, and neither can be asserted against the other without a
 * running app. Pinning the grammar itself is what keeps the pair honest — the same job
 * `tests/admin.filetree.test.ts` does for `readExplorerView` / `NINA_MEDIA_VIEW_PARAM`.
 */
describe('the album deep link', () => {
  it('names the parameter the page reads', () => {
    expect(NINA_AVATAR_PARAM).toBe('avatar')
  })

  it('points at /admin/nina, carrying the id', () => {
    expect(hrefForAvatar('Rm2NGabc1234')).toBe('/admin/nina?avatar=Rm2NGabc1234')
  })

  it('carries no folder and no page — the server derives both from the id', () => {
    const href = hrefForAvatar('Rm2NGabc1234')
    expect(href).not.toContain('folder=')
    expect(href).not.toContain('page=')
  })

  it('escapes an id outside the alphabet we mint rather than trusting it', () => {
    expect(hrefForAvatar('a b&c')).toBe('/admin/nina?avatar=a%20b%26c')
  })
})

/**
 * The media photograph's deep link, pinned from both ends the way the album's is. The page that
 * reads this parameter is phase 2's edit and cannot be asserted against this builder without a
 * running app, so the grammar itself is what keeps the pair honest.
 */
describe('the media photograph deep link', () => {
  it('names a parameter that collides with none of the four the page already reads', () => {
    expect(NINA_MEDIA_PHOTO_PARAM).toBe('image')
    const taken = [NINA_MEDIA_VIEW_PARAM, 'folder', 'page', NINA_AVATAR_PARAM]
    expect(taken).not.toContain(NINA_MEDIA_PHOTO_PARAM)
  })

  it('carries the view, because the view decides which table the page reads at all', () => {
    const href = hrefForMediaPhoto('Rm2NGabc1234')
    expect(href).toBe('/admin/nina?view=media&image=Rm2NGabc1234')
    expect(new URL(href, 'https://x.test').searchParams.get(NINA_MEDIA_VIEW_PARAM)).toBe(
      NINA_MEDIA_VIEW_VALUE,
    )
  })

  it('carries no page and no folder — the server derives the page from the id', () => {
    const href = hrefForMediaPhoto('Rm2NGabc1234')
    expect(href).not.toContain('page=')
    expect(href).not.toContain('folder=')
  })

  it('escapes an id outside the alphabet we mint rather than trusting it', () => {
    const href = hrefForMediaPhoto('a b&c')
    expect(href).not.toContain('a b&c')
    expect(new URL(href, 'https://x.test').searchParams.get(NINA_MEDIA_PHOTO_PARAM)).toBe('a b&c')
  })

  it('leaves the collection-level link alone — it answers a different question', () => {
    expect(hrefForMediaView()).toBe('/admin/nina?view=media')
  })
})

/**
 * The minter, which is the interface the viewer's copy control is built against: a pointer kind, a
 * row id and a server-resolved origin in, one absolute URL out — or `null` for the kind that has no
 * admin destination.
 */
describe('the absolute admin link', () => {
  const ORIGIN = 'https://runins.site'

  it('routes an album photograph through the shipped ?avatar= grammar', () => {
    expect(adminPhotoLink('avatar', 'Rm2NGabc1234', ORIGIN)).toBe(
      'https://runins.site/admin/nina?avatar=Rm2NGabc1234',
    )
  })

  it('routes a conversation photograph through the media grammar, view and all', () => {
    expect(adminPhotoLink('image', 'Rm2NGabc1234', ORIGIN)).toBe(
      'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234',
    )
  })

  it('REFUSES a run screenshot rather than minting a link that resolves to nothing', () => {
    expect(adminPhotoLink('shot', 'Rm2NGabc1234', ORIGIN)).toBeNull()
  })

  it('agrees with the path builders, so the two can never drift apart', () => {
    expect(adminPhotoLink('avatar', 'Rm2NGabc1234', ORIGIN)).toBe(
      `${ORIGIN}${hrefForAvatar('Rm2NGabc1234')}`,
    )
    expect(adminPhotoLink('image', 'Rm2NGabc1234', ORIGIN)).toBe(
      `${ORIGIN}${hrefForMediaPhoto('Rm2NGabc1234')}`,
    )
  })

  it('is absolute, so it survives being pasted into another app on another device', () => {
    for (const kind of ['avatar', 'image'] as const) {
      const link = adminPhotoLink(kind, 'Rm2NGabc1234', ORIGIN)
      if (link === null) throw new Error(`expected a link for ${kind}`)
      const parsed = new URL(link)
      expect(parsed.origin).toBe(ORIGIN)
      expect(parsed.pathname).toBe('/admin/nina')
    }
  })

  it('joins a trailing-slashed origin without doubling the slash', () => {
    expect(adminPhotoLink('image', 'Rm2NGabc1234', 'https://runins.site/')).toBe(
      'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234',
    )
    expect(adminPhotoLink('avatar', 'Rm2NGabc1234', 'https://runins.site///')).toBe(
      'https://runins.site/admin/nina?avatar=Rm2NGabc1234',
    )
  })

  it('takes (kind, id, origin) in that order — a transposition is a broken link', () => {
    const link = adminPhotoLink('image', 'Rm2NGabc1234', ORIGIN)
    if (link === null) throw new Error('expected a link')
    // The origin is the PREFIX and the id is the VALUE. Swapping the two string arguments still
    // typechecks, so the only thing that can catch it is an assertion about which is where.
    expect(link.startsWith(`${ORIGIN}/`)).toBe(true)
    expect(new URL(link).searchParams.get(NINA_MEDIA_PHOTO_PARAM)).toBe('Rm2NGabc1234')
  })

  it('covers every kind in the union, so a fourth one cannot be forgotten', () => {
    const answered = PHOTO_POINTER_KINDS.map((kind) => adminPhotoLink(kind, 'Rm2NGabc1234', ORIGIN))
    expect(answered.filter((link) => link === null)).toHaveLength(1)
    expect(answered.filter((link) => link !== null)).toHaveLength(2)
  })
})
