import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `searchNinaAvatarsAction`'s three jobs: refuse an empty query BEFORE any vendor call, wire each
 * of the three modes to its own read, and narrow a row to what a browser may see.
 *
 * Every edge is doubled — this is a wiring test, and the things it is checking are precisely the
 * arguments passed across the seams (the witness subject, which vector goes to which search, what
 * survives the serialization boundary). The two vision error classes are real classes in the
 * factory so the action's `instanceof` branch is exercised rather than simulated.
 */

const USER = 'usrAAAAAAAAA'

class FakeTokenFloorError extends Error {}
class FakeTransportError extends Error {}

const requireAdmin = vi.fn(async () => ({ userId: USER, email: 'admin@example.com' }))
const describeNinaImagesWithFallback = vi.fn()
const embedNinaText = vi.fn()
const searchNinaAvatarsByText = vi.fn()
const searchNinaAvatarsByImageCaption = vi.fn()
const searchNinaAvatarsByTextAndCaption = vi.fn()

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
  searchNinaAvatarsByText: (...args: unknown[]) => searchNinaAvatarsByText(...args),
  searchNinaAvatarsByImageCaption: (...args: unknown[]) => searchNinaAvatarsByImageCaption(...args),
  searchNinaAvatarsByTextAndCaption: (...args: unknown[]) =>
    searchNinaAvatarsByTextAndCaption(...args),
}))

const JPEG = `data:image/jpeg;base64,${'A'.repeat(64)}`

/** One row as the query layer hands it over — a `NinaAvatarSearchRow`. */
const ROW = {
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
  isCurrent: false,
  announcedAt: null,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  score: 0.82,
}

async function action() {
  return (await import('@/lib/admin/ninaAlbumSearchActions')).searchNinaAvatarsAction
}

beforeEach(() => {
  vi.resetModules()
  requireAdmin.mockClear()
  describeNinaImagesWithFallback.mockReset()
  embedNinaText.mockReset()
  searchNinaAvatarsByText.mockReset()
  searchNinaAvatarsByImageCaption.mockReset()
  searchNinaAvatarsByTextAndCaption.mockReset()
  searchNinaAvatarsByText.mockResolvedValue({ rows: [ROW], total: 342 })
  searchNinaAvatarsByImageCaption.mockResolvedValue({ rows: [ROW], total: 342 })
  searchNinaAvatarsByTextAndCaption.mockResolvedValue({ rows: [ROW], total: 342 })
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
    expect(searchNinaAvatarsByText).toHaveBeenCalledExactlyOnceWith(USER, [0.1, 0.2])
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('text')
    expect(result.searched).toBe(342)
    expect(result.caption).toBeUndefined()
  })

  it('narrows a row to what a browser may see', async () => {
    embedNinaText.mockResolvedValue([0.1, 0.2])

    const result = await (await action())({ text: 'red dress' })

    expect(result.hits[0]).toEqual({
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
    expect(searchNinaAvatarsByImageCaption).toHaveBeenCalledExactlyOnceWith(USER, [0.3, 0.4])
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

    expect(searchNinaAvatarsByTextAndCaption).toHaveBeenCalledExactlyOnceWith(
      USER,
      [0.1, 0.2],
      [0.3, 0.4],
    )
    expect(searchNinaAvatarsByText).not.toHaveBeenCalled()
    expect(searchNinaAvatarsByImageCaption).not.toHaveBeenCalled()
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
