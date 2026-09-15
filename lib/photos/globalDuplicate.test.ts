import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── WHAT THIS FILE IS ASSERTING, AND WHAT IT DELIBERATELY IS NOT ──────────────────────────────
 * `findGlobalDuplicatePhoto` contains no SQL. Its whole behaviour is: which hashes survive the
 * validity gate, which table is asked first, and what shape comes back. So the three finders are
 * mocked at the module boundary and this file asserts the COMPOSITION.
 *
 * The ownership properties of the three arms belong to the arms: `run_photos`' correlated EXISTS
 * is `tests/db.ownership.test.ts`'s subject (the app's core security regression guard), and the
 * two Nina arms' `user_id` equality is the barrel's standing invariant. Re-asserting them here
 * through a mock would be a test of the mock.
 */
vi.mock('@/lib/db/queries', () => ({ findRunPhotoByContentHash: vi.fn() }))
vi.mock('@/lib/nina/queries', () => ({
  findNinaAvatarByContentHash: vi.fn(),
  findNinaImageByContentHash: vi.fn(),
}))

const { findRunPhotoByContentHash } = await import('@/lib/db/queries')
const { findNinaAvatarByContentHash, findNinaImageByContentHash } =
  await import('@/lib/nina/queries')
const { findGlobalDuplicatePhoto } = await import('./globalDuplicate')

const USER = 'user-1'
/** 64 lowercase hex — the only spelling `contentHashOf` produces. */
const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)

const shot = vi.mocked(findRunPhotoByContentHash)
const avatar = vi.mocked(findNinaAvatarByContentHash)
const image = vi.mocked(findNinaImageByContentHash)

beforeEach(() => {
  /* resetAllMocks, not clearAllMocks: a failed test's unconsumed `mockResolvedValueOnce` would
   * otherwise ghost a row into the next test. */
  vi.resetAllMocks()
  shot.mockResolvedValue(null)
  avatar.mockResolvedValue(null)
  image.mockResolvedValue(null)
})

describe('findGlobalDuplicatePhoto — a hit in each of the three tables', () => {
  it('finds a chat photo and points at it as kind "image"', async () => {
    image.mockResolvedValue({ id: 'img-1', blobUrl: 'https://blob.test/img-1.jpg' } as never)
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toEqual({
      kind: 'image',
      id: 'img-1',
      url: 'https://blob.test/img-1.jpg',
    })
  })

  it('finds an album face and points at it as kind "avatar"', async () => {
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'https://blob.test/av-1.jpg' })
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toEqual({
      kind: 'avatar',
      id: 'av-1',
      url: 'https://blob.test/av-1.jpg',
    })
  })

  it('finds a run screenshot and points at it as kind "shot"', async () => {
    shot.mockResolvedValue({ id: 'ph-1', blobUrl: 'https://blob.test/ph-1.jpg' })
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toEqual({
      kind: 'shot',
      id: 'ph-1',
      url: 'https://blob.test/ph-1.jpg',
    })
  })
})

describe('findGlobalDuplicatePhoto — the miss', () => {
  it('returns null when no table holds the bytes, having asked all three', async () => {
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toBeNull()
    expect(image).toHaveBeenCalledTimes(1)
    expect(avatar).toHaveBeenCalledTimes(1)
    expect(shot).toHaveBeenCalledTimes(1)
  })

  it('asks NOTHING at all when no claimed hash survives the validity gate', async () => {
    /* A malformed claim means "dedup is inactive for this row" (lib/photos/contentHash.ts) — not
     * an error, and not a round trip either. */
    await expect(findGlobalDuplicatePhoto(USER, 'not-a-hash')).resolves.toBeNull()
    await expect(findGlobalDuplicatePhoto(USER, HASH.toUpperCase())).resolves.toBeNull()
    await expect(findGlobalDuplicatePhoto(USER, [])).resolves.toBeNull()
    expect(image).not.toHaveBeenCalled()
    expect(avatar).not.toHaveBeenCalled()
    expect(shot).not.toHaveBeenCalled()
  })

  it('drops the invalid claims and still asks about the valid ones', async () => {
    await findGlobalDuplicatePhoto(USER, [HASH, 'garbage', OTHER_HASH])
    expect(image).toHaveBeenCalledWith(USER, [HASH, OTHER_HASH])
  })
})

describe('findGlobalDuplicatePhoto — the order, and the early return', () => {
  it('stops at the first hit: a chat match never reaches the album or the shots', async () => {
    image.mockResolvedValue({ id: 'img-1', blobUrl: 'u' } as never)
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'u' })
    shot.mockResolvedValue({ id: 'ph-1', blobUrl: 'u' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH)
    expect(hit?.kind).toBe('image')
    expect(avatar).not.toHaveBeenCalled()
    expect(shot).not.toHaveBeenCalled()
  })

  it('prefers the album over the shots when the chat misses', async () => {
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'u' })
    shot.mockResolvedValue({ id: 'ph-1', blobUrl: 'u' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH)
    expect(hit?.kind).toBe('avatar')
    expect(shot).not.toHaveBeenCalled()
  })
})

describe('findGlobalDuplicatePhoto — excluding the rows the caller just wrote', () => {
  it('pushes the exclusion into the shots query, so an OLDER shot is still found', async () => {
    /* The row the caller just inserted is the newest, so a post-filter would answer "no
     * duplicate" and the older twin would never be found. This is why it is a SQL predicate. */
    shot.mockResolvedValue({ id: 'ph-old', blobUrl: 'https://blob.test/old.jpg' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: { kind: 'shot', id: 'ph-new' },
    })
    expect(shot).toHaveBeenCalledWith(USER, [HASH], ['ph-new'])
    expect(hit).toEqual({ kind: 'shot', id: 'ph-old', url: 'https://blob.test/old.jpg' })
  })

  it('takes a LIST, so two identical files in ONE upload do not announce each other', async () => {
    /* The reconciler's round-1 ruling, and the case a single-pointer `exclude` cannot express:
     * `/api/extract` writes up to three shots in one request and two of them can be the same
     * picture. Both ids go into the same `not in (…)`, so neither can be "already". */
    await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: [
        { kind: 'shot', id: 'ph-a' },
        { kind: 'shot', id: 'ph-b' },
      ],
    })
    expect(shot).toHaveBeenCalledWith(USER, [HASH], ['ph-a', 'ph-b'])
  })

  it('pushes the exclusion into the album query the same way', async () => {
    await findGlobalDuplicatePhoto(USER, HASH, { exclude: { kind: 'avatar', id: 'av-new' } })
    expect(avatar).toHaveBeenCalledWith(USER, [HASH], ['av-new'])
  })

  it('splits a mixed list by kind — no arm ever sees another table’s ids', async () => {
    await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: [
        { kind: 'shot', id: 'ph-new' },
        { kind: 'avatar', id: 'av-new' },
      ],
    })
    expect(image).toHaveBeenCalledWith(USER, [HASH])
    expect(avatar).toHaveBeenCalledWith(USER, [HASH], ['av-new'])
    expect(shot).toHaveBeenCalledWith(USER, [HASH], ['ph-new'])
  })

  it('does not hand a shot exclusion to the album or chat arms', async () => {
    await findGlobalDuplicatePhoto(USER, HASH, { exclude: { kind: 'shot', id: 'ph-new' } })
    expect(image).toHaveBeenCalledWith(USER, [HASH])
    expect(avatar).toHaveBeenCalledWith(USER, [HASH], [])
  })

  it('post-filters an excluded chat row and falls through to the next table', async () => {
    image.mockResolvedValue({ id: 'img-new', blobUrl: 'u' } as never)
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'https://blob.test/av-1.jpg' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: [{ kind: 'image', id: 'img-new' }],
    })
    expect(hit).toEqual({ kind: 'avatar', id: 'av-1', url: 'https://blob.test/av-1.jpg' })
  })
})
