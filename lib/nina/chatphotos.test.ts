import { describe, expect, it } from 'vitest'

import {
  attachableIdAt,
  chatSessionPhotos,
  chatViewerPhotos,
  sessionPhotoIndex,
  viewerIndex,
} from './chatphotos'

describe('chatViewerPhotos', () => {
  it('names his photograph and hers, so the dot row never says "generated"', () => {
    const photos = chatViewerPhotos({
      imageUrls: ['https://x.example/a.jpg', 'https://x.example/b.jpg'],
      imageKinds: ['upload', 'generated'],
    })
    expect(photos).toEqual([
      { url: 'https://x.example/a.jpg', kind: 'upload', label: 'Foto kamu' },
      { url: 'https://x.example/b.jpg', kind: 'generated', label: 'Foto Nina' },
    ])
  })

  it('keeps a RE-ATTACHED selfie hers, which the message role could not', () => {
    // The case R10 creates more of: a `kind: 'generated'` row on a message the runner wrote.
    // Reading the role here would put her photograph under his name.
    const [photo] = chatViewerPhotos({
      imageUrls: ['https://x.example/s.jpg'],
      imageKinds: ['generated'],
    })
    expect(photo?.label).toBe('Foto Nina')
  })

  it('defaults a missing or unknown kind to his, ChatImages-style', () => {
    expect(chatViewerPhotos({ imageUrls: ['https://x.example/a.jpg'] })[0]?.label).toBe('Foto kamu')
    expect(
      chatViewerPhotos({ imageUrls: ['https://x.example/a.jpg'], imageKinds: ['who-knows'] })[0]
        ?.label,
    ).toBe('Foto kamu')
  })

  it('carries no caption field at all (invariant 5)', () => {
    const [photo] = chatViewerPhotos({
      imageUrls: ['https://x.example/a.jpg'],
      imageKinds: ['upload'],
    })
    // `id` (the 2026-09-18 fullscreen-to-job-detail link) is always a key, `undefined` on an
    // upload — never a caption, never `description`, whatever kind the photo carries.
    expect(Object.keys(photo ?? {}).sort()).toEqual(['id', 'kind', 'label', 'url'])
  })

  it('sets id to the job when a generated photo carries a turn_id, and leaves it undefined otherwise', () => {
    const generated = chatViewerPhotos({
      imageUrls: ['https://x.example/s.jpg'],
      imageKinds: ['generated'],
      turnId: 'jobAAAAAAAAA',
    })
    expect(generated[0]?.id).toBe('jobAAAAAAAAA')

    // An upload never gets one, even with a turn_id on the message (a runner's own message
    // can never carry one — only `finishSelfie`'s caption bubble does).
    const upload = chatViewerPhotos({
      imageUrls: ['https://x.example/a.jpg'],
      imageKinds: ['upload'],
      turnId: 'jobAAAAAAAAA',
    })
    expect(upload[0]?.id).toBeUndefined()

    // A generated photo predating this column, or an avatar-purpose one with no join back to it.
    const noJob = chatViewerPhotos({
      imageUrls: ['https://x.example/s.jpg'],
      imageKinds: ['generated'],
      turnId: null,
    })
    expect(noJob[0]?.id).toBeUndefined()
  })

  it('is empty for a message with no photos, and for no message at all', () => {
    expect(chatViewerPhotos(null)).toEqual([])
    expect(chatViewerPhotos(undefined)).toEqual([])
    expect(chatViewerPhotos({})).toEqual([])
    expect(chatViewerPhotos({ imageUrls: [] })).toEqual([])
  })
})

describe('viewerIndex', () => {
  it('passes an index that is still in range straight through', () => {
    expect(viewerIndex(2, 4)).toBe(2)
  })

  it('clamps rather than closing when the list merely shrank', () => {
    // A refresh, or a neighbouring photo removed. Landing on the last remaining photo beats an
    // overlay that blinks shut, and it beats PhotoViewer's `photos[index]!` throwing.
    expect(viewerIndex(3, 2)).toBe(1)
  })

  it('closes when there is nothing left to show', () => {
    expect(viewerIndex(0, 0)).toBeNull()
    expect(viewerIndex(2, -1)).toBeNull()
    expect(viewerIndex(0, Number.NaN)).toBeNull()
  })

  it('is defensive about a nonsense index', () => {
    expect(viewerIndex(-4, 3)).toBe(0)
    expect(viewerIndex(Number.NaN, 3)).toBe(0)
    expect(viewerIndex(1.7, 3)).toBe(1)
  })
})

describe('attachableIdAt', () => {
  it('finds the id at the shown position', () => {
    expect(attachableIdAt(['a1', 'b2', 'c3'], 1)).toBe('b2')
  })

  it('is null when the ids never arrived, which is the optimistic row', () => {
    expect(attachableIdAt(undefined, 0)).toBeNull()
    expect(attachableIdAt(null, 0)).toBeNull()
    expect(attachableIdAt([], 0)).toBeNull()
    expect(attachableIdAt(['a1'], 3)).toBeNull()
    expect(attachableIdAt([''], 0)).toBeNull()
  })
})

describe('chatSessionPhotos', () => {
  /* A conversation: a two-photo bubble of his, a text-only bubble, then one of her selfies with a
   * job behind it. The middle row is there on purpose — a message with no photos must not shift
   * the flat positions by one. */
  const SESSION = [
    {
      id: 'm1',
      imageUrls: ['https://x.example/a.jpg', 'https://x.example/b.jpg'],
      imageKinds: ['upload', 'upload'],
      imageIds: ['img-a', 'img-b'],
    },
    { id: 'm2', body: 'no photos here' },
    {
      id: 'm3',
      imageUrls: ['https://x.example/s.jpg'],
      imageKinds: ['generated'],
      imageIds: ['img-s'],
      turnId: 'jobAAAAAAAAA',
    },
  ]

  it('flattens the whole window in conversation order, carrying each photo its owner', () => {
    const photos = chatSessionPhotos(SESSION)
    expect(photos.map((photo) => [photo.messageId, photo.indexWithinMessage])).toEqual([
      ['m1', 0],
      ['m1', 1],
      ['m3', 0],
    ])
  })

  it('states the label and the job id ONCE, by reusing chatViewerPhotos', () => {
    // The rule that drifts silently if it is ever written twice: a `kind: 'generated'` row is hers
    // whatever the message's role, and only a generated photo gets the turn id.
    const photos = chatSessionPhotos(SESSION)
    expect(photos.map((photo) => photo.label)).toEqual(['Foto kamu', 'Foto kamu', 'Foto Nina'])
    expect(photos.map((photo) => photo.id)).toEqual([undefined, undefined, 'jobAAAAAAAAA'])
  })

  it('resolves the attach handle from the owning message, position by position', () => {
    expect(chatSessionPhotos(SESSION).map((photo) => photo.attachId)).toEqual([
      'img-a',
      'img-b',
      'img-s',
    ])
  })

  it('leaves the attach handle null on the optimistic row, which has no ids yet', () => {
    // ChatScreen's optimistic bubble describes rows that have not been written, so there is
    // nothing to attach until the next full load — and the control simply does not render.
    const [photo] = chatSessionPhotos([
      { id: 'tmp', imageUrls: ['blob:local'], imageKinds: ['upload'] },
    ])
    expect(photo?.attachId).toBeNull()
  })

  it('carries no caption field at all (invariant 5)', () => {
    const [photo] = chatSessionPhotos(SESSION)
    expect(Object.keys(photo ?? {}).sort()).toEqual([
      'attachId',
      'id',
      'indexWithinMessage',
      'kind',
      'label',
      'messageId',
      'url',
    ])
  })

  it('is empty for an empty window, and for no window at all', () => {
    expect(chatSessionPhotos(null)).toEqual([])
    expect(chatSessionPhotos(undefined)).toEqual([])
    expect(chatSessionPhotos([])).toEqual([])
    expect(chatSessionPhotos([{ id: 'm2' }, { id: 'm4', imageUrls: [] }])).toEqual([])
  })
})

describe('sessionPhotoIndex', () => {
  const PHOTOS = [
    { messageId: 'm1', indexWithinMessage: 0 },
    { messageId: 'm1', indexWithinMessage: 1 },
    { messageId: 'm3', indexWithinMessage: 0 },
    { messageId: 'm3', indexWithinMessage: 1 },
  ]

  it('finds the photo the overlay is aimed at', () => {
    expect(sessionPhotoIndex(PHOTOS, 'm1', 1)).toBe(1)
  })

  it('answers with the OWNING message, not the first match on the index', () => {
    // The whole of R1's correctness: index 0 exists in both bubbles, and the overlay means m3's.
    expect(sessionPhotoIndex(PHOTOS, 'm3', 0)).toBe(2)
  })

  it('clamps inside the owning bubble when that message lost photos', () => {
    // A refresh dropped m3's second photo. Landing on its remaining one beats blinking shut, and
    // clamping INSIDE m3 is what stops a shrink from silently showing a neighbour's photograph.
    expect(sessionPhotoIndex(PHOTOS.slice(0, 3), 'm3', 1)).toBe(2)
  })

  it('is defensive about a nonsense position, without leaving the bubble', () => {
    expect(sessionPhotoIndex(PHOTOS, 'm3', -4)).toBe(2)
    expect(sessionPhotoIndex(PHOTOS, 'm3', Number.NaN)).toBe(2)
    expect(sessionPhotoIndex(PHOTOS, 'm1', 1.7)).toBe(1)
  })

  it('closes when the message itself is gone — a delete, or a refreshed window', () => {
    expect(sessionPhotoIndex(PHOTOS, 'm2', 0)).toBeNull()
    expect(sessionPhotoIndex([], 'm1', 0)).toBeNull()
  })
})
