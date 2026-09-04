import { describe, expect, it } from 'vitest'

import { newId } from '@/lib/id'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  formatNinaPhotoParam,
  parseNinaPhotoParam,
} from '@/lib/nina/attach'

/**
 * The `?photo=` grammar — F34 R2's contract between `/admin/nina` (which writes the URL) and
 * `/nina` (which reads it). Two modules, one string format, and nothing but this suite keeping
 * them in step.
 *
 * `app/nina/page.tsx` hands the raw `searchParams` value straight to `parseNinaPhotoParam`, so the
 * hostile cases below are not hypothetical: a `string[]`, an `undefined` and a hand-typed URL are
 * all reachable from a browser address bar.
 */

describe('the two query-parameter idioms are distinct', () => {
  it('does not collide with the run idiom', () => {
    /* If these are ever equal, one deep link silently eats the other's parameter and
     * `ChatScreen`'s single `replaceState` deletes a parameter it was not asked to. */
    expect(PHOTO_PARAM).not.toBe(ATTACH_PARAM)
  })
})

describe('formatNinaPhotoParam / parseNinaPhotoParam', () => {
  it('round-trips an avatar pointer', () => {
    const id = newId()
    const formatted = formatNinaPhotoParam({ kind: 'avatar', id })
    expect(formatted).toBe(`avatar:${id}`)
    expect(parseNinaPhotoParam(formatted)).toEqual({ kind: 'avatar', id })
  })

  it('round-trips an image pointer', () => {
    const id = newId()
    expect(parseNinaPhotoParam(formatNinaPhotoParam({ kind: 'image', id }))).toEqual({
      kind: 'image',
      id,
    })
  })

  it('round-trips ids containing the alphabet edges', () => {
    /* `lib/id.ts`'s alphabet ends `-_`, and both are legal in a query string unencoded. An id
     * made entirely of them is the case a regex written from memory gets wrong. */
    for (const id of ['------------', '____________', '-_-_-_-_-_-_', '000000000000']) {
      expect(parseNinaPhotoParam(formatNinaPhotoParam({ kind: 'avatar', id }))).toEqual({
        kind: 'avatar',
        id,
      })
    }
  })

  it('refuses an unknown kind', () => {
    const id = newId()
    expect(parseNinaPhotoParam(`run:${id}`)).toBeNull()
    expect(parseNinaPhotoParam(`AVATAR:${id}`)).toBeNull()
    expect(parseNinaPhotoParam(`avatars:${id}`)).toBeNull()
  })

  it('refuses an id that cannot be one of ours', () => {
    expect(parseNinaPhotoParam('avatar:short')).toBeNull()
    expect(parseNinaPhotoParam('avatar:thirteencharsx')).toBeNull()
    expect(parseNinaPhotoParam('avatar:has a space')).toBeNull()
    expect(parseNinaPhotoParam('avatar:../../etc/pw')).toBeNull()
    expect(parseNinaPhotoParam('avatar:')).toBeNull()
  })

  it('refuses a missing or misplaced separator', () => {
    const id = newId()
    expect(parseNinaPhotoParam(id)).toBeNull()
    expect(parseNinaPhotoParam(`:${id}`)).toBeNull()
    expect(parseNinaPhotoParam(`:avatar:${id}`)).toBeNull()
  })

  it('refuses a second colon inside the id rather than trimming it', () => {
    /* Split on the FIRST colon, then validate the whole tail. `avatar:abc:def` must not resolve to
     * `abc` — a link that half-parses is a link that arms the composer with the wrong photo. */
    expect(parseNinaPhotoParam('avatar:abcdefghijk:l')).toBeNull()
  })

  it('refuses anything that is not a string', () => {
    /* Exactly what `searchParams` can hand it: a repeated parameter, and an absent one. */
    expect(parseNinaPhotoParam(['avatar:abcdefghijkl'])).toBeNull()
    expect(parseNinaPhotoParam(undefined)).toBeNull()
    expect(parseNinaPhotoParam(null)).toBeNull()
    expect(parseNinaPhotoParam(42)).toBeNull()
    expect(parseNinaPhotoParam({ kind: 'avatar', id: 'abcdefghijkl' })).toBeNull()
  })
})
