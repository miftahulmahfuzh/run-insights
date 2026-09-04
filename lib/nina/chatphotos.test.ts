import { describe, expect, it } from 'vitest'

import { attachableIdAt, chatViewerPhotos, viewerIndex } from './chatphotos'

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
    expect(Object.keys(photo ?? {}).sort()).toEqual(['kind', 'label', 'url'])
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
