import { describe, expect, it } from 'vitest'

import { MAX_RUNNER_MESSAGE_CHARS } from './schema'
import {
  albumPhotos,
  galleryPhotos,
  NINA_ALBUM_MAX,
  NINA_ATTACH_MAX_CHARS,
  NINA_AVATAR_FALLBACK_SRC,
  NINA_GALLERY_LIMIT,
  ninaAvatarView,
  photoSideOf,
  type AvatarLike,
  type ImageLike,
} from './album'

function avatar(over: Partial<AvatarLike> = {}): AvatarLike {
  return {
    id: 'av000000000a',
    blobUrl: 'https://blob.example/nina/u1/avatar-av000000000a.jpg',
    width: 1024,
    height: 1365,
    description: 'selfie di Jalan Kemang Selatan sore-sore',
    cropScale: null,
    cropX: null,
    cropY: null,
    isCurrent: true,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    source: 'generated',
    ...over,
  }
}

function image(over: Partial<ImageLike> = {}): ImageLike {
  return {
    id: 'im000000000a',
    messageId: 'ms000000000a',
    kind: 'upload',
    blobUrl: 'https://blob.example/nina/u1/chat/im000000000a.jpg',
    createdAt: new Date('2026-09-04T10:00:00Z'),
    ...over,
  }
}

describe('ninaAvatarView', () => {
  it('null means the committed constant, with no crop (D-2)', () => {
    const view = ninaAvatarView(null)
    expect(view).toEqual({
      src: NINA_AVATAR_FALLBACK_SRC,
      natural: { width: null, height: null },
      crop: null,
      description: null,
      isFallback: true,
    })
  })

  it('undefined behaves as null', () => {
    expect(ninaAvatarView(undefined).isFallback).toBe(true)
  })

  it('a row becomes its blob url, its natural size and its stored triple', () => {
    const view = ninaAvatarView(avatar({ cropScale: 1.4, cropX: -120, cropY: 60 }))
    expect(view.isFallback).toBe(false)
    expect(view.src).toBe('https://blob.example/nina/u1/avatar-av000000000a.jpg')
    expect(view.natural).toEqual({ width: 1024, height: 1365 })
    expect(view.crop).toEqual({ scale: 1.4, x: -120, y: 60 })
  })

  it('carries the description through — it is R25s only input', () => {
    expect(ninaAvatarView(avatar()).description).toBe('selfie di Jalan Kemang Selatan sore-sore')
  })

  it('an all-null triple is still an object, so resolveCrop folds it to the identity', () => {
    expect(ninaAvatarView(avatar()).crop).toEqual({ scale: null, x: null, y: null })
  })
})

describe('albumPhotos', () => {
  it('an empty album is one synthetic entry for the constant, never a blank grid', () => {
    const photos = albumPhotos([])
    expect(photos).toHaveLength(1)
    expect(photos[0]!.id).toBe('fallback')
    expect(photos[0]!.url).toBe(NINA_AVATAR_FALLBACK_SRC)
    expect(photos[0]!.isCurrent).toBe(true)
  })

  it('preserves the query order rather than re-sorting', () => {
    const rows = [
      avatar({ id: 'c', createdAt: new Date('2026-09-04T00:00:00Z'), isCurrent: true }),
      avatar({ id: 'b', createdAt: new Date('2026-09-03T00:00:00Z'), isCurrent: false }),
      avatar({ id: 'a', createdAt: new Date('2026-09-02T00:00:00Z'), isCurrent: false }),
    ]
    expect(albumPhotos(rows).map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('marks exactly the current row, because the grid draws a ring on it', () => {
    const rows = [avatar({ id: 'c', isCurrent: true }), avatar({ id: 'b', isCurrent: false })]
    expect(albumPhotos(rows).map((p) => p.isCurrent)).toEqual([true, false])
  })

  it('caps at NINA_ALBUM_MAX', () => {
    const rows = Array.from({ length: NINA_ALBUM_MAX + 7 }, (_, i) => avatar({ id: `a${i}` }))
    expect(albumPhotos(rows)).toHaveLength(NINA_ALBUM_MAX)
  })
})

describe('photoSideOf', () => {
  it('generated is hers', () => {
    expect(photoSideOf('generated')).toBe('hers')
  })

  it('upload is his', () => {
    expect(photoSideOf('upload')).toBe('his')
  })

  it('an unknown kind is his, never hers', () => {
    expect(photoSideOf('')).toBe('his')
    expect(photoSideOf('screenshot')).toBe('his')
  })
})

describe('galleryPhotos', () => {
  it('shows BOTH parties in one list, in query order (R17)', () => {
    const rows = [
      image({ id: 'i3', kind: 'generated' }),
      image({ id: 'i2', kind: 'upload' }),
      image({ id: 'i1', kind: 'upload' }),
    ]
    const photos = galleryPhotos(rows)
    expect(photos.map((p) => p.id)).toEqual(['i3', 'i2', 'i1'])
    expect(photos.map((p) => p.side)).toEqual(['hers', 'his', 'his'])
  })

  it('labels each side in words, so the viewer never renders the raw kind', () => {
    const [hers, his] = galleryPhotos([
      image({ id: 'i2', kind: 'generated' }),
      image({ id: 'i1', kind: 'upload' }),
    ])
    expect(hers!.label).toBe('Foto Nina')
    expect(his!.label).toBe('Foto kamu')
  })

  it('carries messageId, which is what makes a photo reachable', () => {
    expect(galleryPhotos([image({ messageId: 'ms1' })])[0]!.messageId).toBe('ms1')
  })

  it('caps at NINA_GALLERY_LIMIT', () => {
    const rows = Array.from({ length: NINA_GALLERY_LIMIT + 5 }, (_, i) => image({ id: `i${i}` }))
    expect(galleryPhotos(rows)).toHaveLength(NINA_GALLERY_LIMIT)
  })

  it('an empty conversation is an empty gallery, not a fallback', () => {
    expect(galleryPhotos([])).toEqual([])
  })
})

/**
 * R26's clamp. `attachNinaPhotoToChat` is one call into a Server Action, so there is nothing pure
 * in it to assert beyond this number — and asserting it is worth doing, because
 * `MAX_RUNNER_MESSAGE_CHARS` would otherwise let a paste of an entire article into the album's
 * question box reach the model as "a question about this photo".
 *
 * It is asserted HERE rather than in an `albumActions.test.ts` for a mechanical reason: importing
 * anything from a `'use server'` module pulls `sendNinaMessage` and therefore `requireUserId` and
 * next-auth into a `node` test run, which does not resolve. The ownership check and the empty-body
 * rule live in `sendNinaMessage` and belong to phase 3's and phase 6's suites; a second copy here
 * is exactly the copy that could disagree.
 */
describe('NINA_ATTACH_MAX_CHARS', () => {
  it('is short enough to be one question and shorter than the message ceiling', () => {
    expect(NINA_ATTACH_MAX_CHARS).toBe(600)
    expect(NINA_ATTACH_MAX_CHARS).toBeLessThan(MAX_RUNNER_MESSAGE_CHARS)
  })
})
