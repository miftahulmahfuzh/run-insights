import { describe, expect, it } from 'vitest'

import { newId } from '@/lib/id'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  formatNinaPhotoParam,
  ninaPhotoProvenance,
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

describe('ninaPhotoProvenance — which column, and what a copy of a copy points at', () => {
  it('puts an album id in source_avatar_id and nothing in source_image_id', () => {
    /* The wrong column is not a type error and not a visible failure: it fails the foreign key at
     * INSERT time, and `sendNinaMessage` swallows that with a console.warn — so the photograph
     * would still render and the duplicate would quietly come back. */
    expect(ninaPhotoProvenance({ kind: 'avatar', id: 'avatarAAAAAA' })).toEqual({
      sourceAvatarId: 'avatarAAAAAA',
      sourceImageId: null,
    })
  })

  it('points a re-attached chat photo at itself when it is the original', () => {
    expect(
      ninaPhotoProvenance({
        kind: 'image',
        id: 'imageAAAAAAA',
        sourceAvatarId: null,
        sourceImageId: null,
      }),
    ).toEqual({ sourceAvatarId: null, sourceImageId: 'imageAAAAAAA' })
  })

  it('FLATTENS a copy of a copy to the original, never to the row he tapped', () => {
    /* He attaches A and gets B; he attaches B and gets C. If C pointed at B, then deleting B's
     * message would SET NULL on C and C would reappear in the collection as a duplicate of A,
     * which still exists. Pointing at A means the column always names the original — the same
     * thing drizzle/0010's backfill writes for the rows that predate this function. */
    expect(
      ninaPhotoProvenance({
        kind: 'image',
        id: 'imageBBBBBBB',
        sourceAvatarId: null,
        sourceImageId: 'imageAAAAAAA',
      }),
    ).toEqual({ sourceAvatarId: null, sourceImageId: 'imageAAAAAAA' })
  })

  it('INHERITS the album pointer, which is what holds R3 after the middle row is deleted', () => {
    /* An album face was attached (B), and B is now being attached again (C). Those bytes really
     * are the album face's. Keeping `source_avatar_id` means that if B's message is later deleted
     * and C's `source_image_id` goes NULL under the FK, C is STILL a reference — so the profile
     * photo still never turns up in Media, which is R3 in the user's own words. */
    expect(
      ninaPhotoProvenance({
        kind: 'image',
        id: 'imageBBBBBBB',
        sourceAvatarId: 'avatarAAAAAA',
        sourceImageId: null,
      }),
    ).toEqual({ sourceAvatarId: 'avatarAAAAAA', sourceImageId: 'imageBBBBBBB' })
  })

  it('never answers with both NULL, because it is only ever asked about a photo we already have', () => {
    for (const source of [
      { kind: 'avatar' as const, id: 'avatarAAAAAA' },
      { kind: 'image' as const, id: 'imageAAAAAAA', sourceAvatarId: null, sourceImageId: null },
    ]) {
      const provenance = ninaPhotoProvenance(source)
      expect(provenance.sourceAvatarId ?? provenance.sourceImageId).not.toBeNull()
    }
  })
})
