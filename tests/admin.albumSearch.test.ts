import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `searchNinaAvatarsAction`'s three jobs: refuse an empty query BEFORE any vendor call, wire each
 * of the three modes to its own read, and narrow a row to what a browser may see — now over the
 * MERGED search (`media-album-unified-search` R1), which ranks both `nina_avatars` and
 * `nina_message_images` into one list.
 *
 * Every edge is doubled — this is a wiring test, and the things it is checking are precisely the
 * arguments passed across the seams (the witness subject, which vector goes to which search, what
 * survives the serialization boundary, and now `origin`). The two vision error classes are real
 * classes in the factory so the action's `instanceof` branch is exercised rather than simulated.
 */

const USER = 'usrAAAAAAAAA'

class FakeTokenFloorError extends Error {}
class FakeTransportError extends Error {}

const requireAdmin = vi.fn(async () => ({ userId: USER, email: 'admin@example.com' }))
const describeNinaImagesWithFallback = vi.fn()
const embedNinaText = vi.fn()
const searchNinaPhotosByText = vi.fn()
const searchNinaPhotosByImageCaption = vi.fn()
const searchNinaPhotosByTextAndCaption = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImagesWithFallback: (...args: unknown[]) => describeNinaImagesWithFallback(...args),
  NinaVisionTokenFloorError: FakeTokenFloorError,
  NinaVisionTransportError: FakeTransportError,
}))
/* Forwards EVERY argument, not just the text: the action passes `{ userId }` as a second argument
 * (phase 1's contract) and the assertions below pin it. A `(text) => fn(text)` shim would silently
 * drop it and make those assertions unfalsifiable. */
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))
vi.mock('@/lib/nina/queries', () => ({
  searchNinaPhotosByText: (...args: unknown[]) => searchNinaPhotosByText(...args),
  searchNinaPhotosByImageCaption: (...args: unknown[]) => searchNinaPhotosByImageCaption(...args),
  searchNinaPhotosByTextAndCaption: (...args: unknown[]) =>
    searchNinaPhotosByTextAndCaption(...args),
}))

const JPEG = `data:image/jpeg;base64,${'A'.repeat(64)}`

/** One ALBUM row as the query layer hands it over — a `NinaPhotoSearchRow`. */
const ROW = {
  origin: 'album' as const,
  id: 'avtAAAAAAAAA',
  blobUrl: 'https://blob/x.jpg',
  pathname: 'nina/u/x.jpg',
  folder: '2026/bali',
  filename: 'x.jpg',
  thumbUrl: 'https://blob/x-thumb.jpg',
  thumbPathname: 'nina/u/x-thumb.jpg',
  width: 1024,
  height: 768,
  bytes: 200_000,
  source: 'upload',
  cropScale: null,
  cropX: null,
  cropY: null,
  description: 'she is on a beach',
  searchKeywords: null,
  negativeSearchKeywords: null,
  isCurrent: false,
  announcedAt: null,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  score: 0.82,
}

/** One MEDIA row, exercising `rankMedia`'s own constants — no folder, no framing, no thumbnail,
 *  never current. */
const MEDIA_ROW = {
  origin: 'media' as const,
  id: 'imgAAAAAAAAA',
  blobUrl: 'https://blob/y.jpg',
  folder: '',
  filename: null,
  thumbUrl: null,
  width: 1024,
  height: 768,
  bytes: 210_000,
  source: 'upload',
  cropScale: null,
  cropX: null,
  cropY: null,
  description: 'he is at the pool',
  searchKeywords: null,
  negativeSearchKeywords: null,
  isCurrent: false,
  createdAt: new Date('2026-09-02T10:00:00.000Z'),
  score: 0.75,
}

async function action() {
  return (await import('@/lib/admin/ninaAlbumSearchActions')).searchNinaAvatarsAction
}

beforeEach(() => {
  vi.resetModules()
  requireAdmin.mockClear()
  describeNinaImagesWithFallback.mockReset()
  embedNinaText.mockReset()
  searchNinaPhotosByText.mockReset()
  searchNinaPhotosByImageCaption.mockReset()
  searchNinaPhotosByTextAndCaption.mockReset()
  searchNinaPhotosByText.mockResolvedValue({ rows: [ROW], total: 342 })
  searchNinaPhotosByImageCaption.mockResolvedValue({ rows: [ROW], total: 342 })
  searchNinaPhotosByTextAndCaption.mockResolvedValue({ rows: [ROW], total: 342 })
})

afterEach(() => {
  vi.resetModules()
})

describe('an empty query never reaches a vendor', () => {
  it.each([
    ['nothing at all', {}],
    ['an all-blank box', { text: '   \n  ' }],
    ['a hosted URL rather than inline bytes', { imageDataUri: 'https://example.com/a.jpg' }],
    ['an oversized data URI', { imageDataUri: `data:image/jpeg;base64,${'A'.repeat(800_000)}` }],
    ['not an object at all', 'red dress'],
  ])('refuses %s', async (_label, input) => {
    const result = await (await action())(input)

    expect(result.ok).toBe(false)
    expect(result.hits).toEqual([])
    expect(result.searched).toBe(0)
    expect(describeNinaImagesWithFallback).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })
})

describe('text only (R2)', () => {
  it('embeds the normalised query and runs the text search, with no vision call', async () => {
    embedNinaText.mockResolvedValue([0.1, 0.2])

    const result = await (await action())({ text: '  red   dress \n' })

    expect(describeNinaImagesWithFallback).not.toHaveBeenCalled()
    // `{ userId }` is not decoration — it is the `user_id` on the `nina_error_logs` row
    // `embedNinaText` writes before it throws. Phase 1's contract asks for it; pin it.
    expect(embedNinaText).toHaveBeenCalledExactlyOnceWith('red dress', { userId: USER })
    expect(searchNinaPhotosByText).toHaveBeenCalledExactlyOnceWith(USER, [0.1, 0.2], 'red dress')
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('text')
    expect(result.searched).toBe(342)
    expect(result.caption).toBeUndefined()
  })

  it('narrows a row to what a browser may see, and carries origin through', async () => {
    embedNinaText.mockResolvedValue([0.1, 0.2])

    const result = await (await action())({ text: 'red dress' })

    expect(result.hits[0]).toEqual({
      origin: 'album',
      id: 'avtAAAAAAAAA',
      url: 'https://blob/x.jpg',
      thumbUrl: 'https://blob/x-thumb.jpg',
      folder: '2026/bali',
      filename: 'x.jpg',
      width: 1024,
      height: 768,
      bytes: 200_000,
      source: 'upload',
      isCurrent: false,
      description: 'she is on a beach',
      searchKeywords: null,
      negativeSearchKeywords: null,
      crop: { scale: null, x: null, y: null },
      createdAt: '2026-09-01T10:00:00.000Z',
      score: 0.82,
    })
    /* The three the page has always withheld. A hit that carried `pathname` would be handing a
     * browser the Blob path it uses as a bearer token everywhere else. */
    expect(result.hits[0]).not.toHaveProperty('pathname')
    expect(result.hits[0]).not.toHaveProperty('thumbPathname')
    expect(result.hits[0]).not.toHaveProperty('announcedAt')
  })

  it('narrows a MEDIA row using its own conventions — no folder, no framing, no thumbnail', async () => {
    embedNinaText.mockResolvedValue([0.1, 0.2])
    searchNinaPhotosByText.mockResolvedValue({ rows: [ROW, MEDIA_ROW], total: 342 })

    const result = await (await action())({ text: 'pool' })

    const mediaHit = result.hits[1]
    expect(mediaHit).toEqual({
      origin: 'media',
      id: 'imgAAAAAAAAA',
      url: 'https://blob/y.jpg',
      thumbUrl: null,
      folder: '',
      filename: 'imgAAAAAAAAA', // `row.filename ?? row.id` — a media row carries no filename
      width: 1024,
      height: 768,
      bytes: 210_000,
      source: 'upload',
      isCurrent: false,
      description: 'he is at the pool',
      searchKeywords: null,
      negativeSearchKeywords: null,
      crop: { scale: null, x: null, y: null },
      createdAt: '2026-09-02T10:00:00.000Z',
      score: 0.75,
    })
  })
})

describe('image only (R3)', () => {
  it('captions with the SELF witness prompt, embeds the caption, and searches on it', async () => {
    describeNinaImagesWithFallback.mockResolvedValue({ description: 'she is on a beach' })
    embedNinaText.mockResolvedValue([0.3, 0.4])

    const result = await (await action())({ imageDataUri: JPEG })

    expect(describeNinaImagesWithFallback).toHaveBeenCalledExactlyOnceWith(
      fetch,
      [{ dataUri: JPEG }],
      { subject: 'self', userId: USER },
    )
    expect(embedNinaText).toHaveBeenCalledExactlyOnceWith('she is on a beach', { userId: USER })
    expect(searchNinaPhotosByImageCaption).toHaveBeenCalledExactlyOnceWith(USER, [0.3, 0.4])
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('image')
    expect(result.caption).toBe('she is on a beach')
  })
})

describe('both (R4)', () => {
  it('hands the combined search the text vector first and the caption vector second', async () => {
    describeNinaImagesWithFallback.mockResolvedValue({ description: 'she is on a beach' })
    embedNinaText.mockImplementation(async (text: string) =>
      text === 'red dress' ? [0.1, 0.2] : [0.3, 0.4],
    )

    const result = await (await action())({ text: 'red dress', imageDataUri: JPEG })

    expect(searchNinaPhotosByTextAndCaption).toHaveBeenCalledExactlyOnceWith(
      USER,
      [0.1, 0.2],
      [0.3, 0.4],
      'red dress',
    )
    expect(searchNinaPhotosByText).not.toHaveBeenCalled()
    expect(searchNinaPhotosByImageCaption).not.toHaveBeenCalled()
    expect(result.mode).toBe('both')
  })
})

describe('failure is always the same shape', () => {
  it('names the photo when the vision path is what failed', async () => {
    describeNinaImagesWithFallback.mockRejectedValue(new FakeTransportError('down'))

    const result = await (await action())({ imageDataUri: JPEG })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/photo/i)
    expect(result.hits).toEqual([])
    expect(result.searched).toBe(0)
    expect(result.mode).toBe('image')
  })

  it('and does not, when the embedding is what failed', async () => {
    embedNinaText.mockRejectedValue(new Error('429'))

    const result = await (await action())({ text: 'red dress' })

    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/photo/i)
    expect(result.hits).toEqual([])
  })
})
