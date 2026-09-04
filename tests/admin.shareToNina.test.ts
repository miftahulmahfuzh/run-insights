import { describe, expect, it } from 'vitest'

import { ninaPhotoShareUrl } from '@/lib/admin/shareToNina'
import { PHOTO_PARAM, parseNinaPhotoParam } from '@/lib/nina/attach'

/**
 * R2's link, both ends of it. `/admin/nina` writes this URL and `/nina` reads it, in two different
 * phases of the same plan set, and the one bug neither TypeScript nor a browser can catch is the
 * two of them agreeing to compile while disagreeing about the grammar. So the assertion is a round
 * trip through phase 3's own parser rather than a string comparison against a literal — an
 * encoding change is then allowed to happen, and a grammar change is not.
 *
 * `environment: 'node'` (invariant 6), which is why the URL build is a pure `lib/` function and
 * not three lines inside `ShareToNinaItem`: that component imports the album's Server Actions, and
 * they reach `@vercel/blob` and `lib/db`.
 */
describe('ninaPhotoShareUrl', () => {
  const ORIGIN = 'https://runins.site'
  const ID = 'V1StGXR8mN4q'

  it('points at the chat on the origin it was given', () => {
    const url = new URL(ninaPhotoShareUrl(ORIGIN, ID))
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/nina')
  })

  it('round-trips through the parser the chat page uses', () => {
    const url = new URL(ninaPhotoShareUrl(ORIGIN, ID))
    expect(parseNinaPhotoParam(url.searchParams.get(PHOTO_PARAM))).toEqual({
      kind: 'avatar',
      id: ID,
    })
  })

  it('survives the whole nanoid alphabet, `_` and `-` included', () => {
    // TWELVE characters: `parseNinaPhotoParam` goes through `isValidId`, which checks the length
    // as well as the alphabet, so an 11-character id would fail the round trip for the wrong reason.
    const awkward = 'a_B-9zZ0_-xQ'
    const url = new URL(ninaPhotoShareUrl(ORIGIN, awkward))
    expect(parseNinaPhotoParam(url.searchParams.get(PHOTO_PARAM))).toEqual({
      kind: 'avatar',
      id: awkward,
    })
  })

  it('carries nothing but the pointer — no blob URL, no description, no session', () => {
    const url = new URL(ninaPhotoShareUrl(ORIGIN, ID))
    expect([...url.searchParams.keys()]).toEqual([PHOTO_PARAM])
  })

  // The development rung of `shareOrigin()`, so a link clicked on a laptop opens the laptop's chat
  // rather than production's.
  it('works on a localhost origin', () => {
    const url = new URL(ninaPhotoShareUrl('http://localhost:3000', ID))
    expect(url.origin).toBe('http://localhost:3000')
    expect(url.pathname).toBe('/nina')
  })

  // `new URL` throwing is the intended behaviour: a malformed origin must not become a link that
  // silently opens a broken tab.
  it('refuses an origin that is not an origin', () => {
    expect(() => ninaPhotoShareUrl('', ID)).toThrow(TypeError)
    expect(() => ninaPhotoShareUrl('runins.site', ID)).toThrow(TypeError)
  })
})
