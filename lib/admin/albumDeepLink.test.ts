import { describe, expect, it } from 'vitest'

import { hrefForAvatar, NINA_AVATAR_PARAM } from './albumDeepLink'

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
