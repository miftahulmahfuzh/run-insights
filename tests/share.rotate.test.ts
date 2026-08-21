import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R-15's rotation, and specifically its failure paths.**
 *
 * The happy path is three API calls and is nearly untestable in an interesting way. The paths worth
 * a test are the two that can lose a photo:
 *
 *   1. The blob move succeeds and the row write fails. The row now points at a URL that no longer
 *      exists — the photo is gone from the owner's OWN run detail page, which is strictly worse than
 *      never having rotated. The compensating move back is the only thing standing between a
 *      revocation and data loss.
 *   2. The blob move itself fails. Nothing to undo (`rename` leaves the source untouched when the
 *      copy fails), everything to report — a silent partial rotation would let the UI claim "old
 *      image links break too" when they do not.
 */

const rename = vi.fn()
const updatePhotoBlobLocation = vi.fn()

vi.mock('@vercel/blob', () => ({ rename: (...args: unknown[]) => rename(...args) }))
vi.mock('@/lib/db/queries', () => ({
  updatePhotoBlobLocation: (...args: unknown[]) => updatePhotoBlobLocation(...args),
}))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test' }) }))

type Module = typeof import('@/lib/share/rotateBlobs')
let mod: Module

const photo = (n: number) => ({
  id: `photoCanon${n}${n}`,
  blobUrl: `https://x.public.blob.vercel-storage.com/shots/old${n}-aaaa.jpg`,
  pathname: `shots/old${n}-aaaa.jpg`,
})

beforeEach(async () => {
  vi.resetModules()
  rename.mockImplementation((_from: string, to: string) => ({
    url: `https://x.public.blob.vercel-storage.com/${to}-zzzz`,
    pathname: `${to}-zzzz`,
  }))
  updatePhotoBlobLocation.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mod = await import('@/lib/share/rotateBlobs')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('rotateRunPhotoBlobs', () => {
  it('does nothing at all for a run with no photos', async () => {
    expect(await mod.rotateRunPhotoBlobs('u1', [])).toEqual({ rotated: 0, failed: [] })
    expect(rename).not.toHaveBeenCalled()
  })

  it('moves each photo to a fresh random pathname and points the row at it', async () => {
    const result = await mod.rotateRunPhotoBlobs('u1', [photo(1), photo(2), photo(3)])

    expect(result).toEqual({ rotated: 3, failed: [] })
    expect(rename).toHaveBeenCalledTimes(3)
    expect(updatePhotoBlobLocation).toHaveBeenCalledTimes(3)

    for (const [, to, options] of rename.mock.calls) {
      // The new pathname keeps the shape `SHOT_STORED_PATHNAME_RE` describes, so a rotated photo is
      // indistinguishable from a fresh upload to everything downstream.
      expect(to).toMatch(/^shots\/[A-Za-z0-9_-]{12}\.jpg$/)
      // `rename` preserves no metadata, so the content type and the year-long cache F04 set at
      // upload have to be restated or a rotated blob serves as application/octet-stream.
      expect(options).toMatchObject({
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/jpeg',
      })
      expect(options.cacheControlMaxAge).toBeGreaterThan(0)
    }
  })

  it('never reuses a pathname across photos', async () => {
    await mod.rotateRunPhotoBlobs('u1', [photo(1), photo(2), photo(3)])
    const targets = rename.mock.calls.map(([, to]) => to)
    expect(new Set(targets).size).toBe(3)
  })

  it('moves the blob BACK when the row write fails, so the photo is not lost', async () => {
    updatePhotoBlobLocation.mockRejectedValueOnce(new Error('neon hiccup'))

    const result = await mod.rotateRunPhotoBlobs('u1', [photo(1)])

    expect(result).toEqual({ rotated: 0, failed: ['photoCanon11'] })
    expect(rename).toHaveBeenCalledTimes(2)
    const [, restoreTo, restoreOptions] = rename.mock.calls[1]!
    // Back to the EXACT old pathname, with the random suffix off, so it lands on the URL the
    // unchanged row still points at. A random suffix here would "restore" the bytes to a third URL
    // nothing in the database knows about.
    expect(restoreTo).toBe('shots/old1-aaaa.jpg')
    expect(restoreOptions).toMatchObject({ addRandomSuffix: false, allowOverwrite: true })
  })

  it('reports a photo whose move failed, and leaves its row alone', async () => {
    rename.mockRejectedValueOnce(new Error('rate limited'))

    const result = await mod.rotateRunPhotoBlobs('u1', [photo(1), photo(2)])

    // The copy failed, so the source is untouched and the row is still correct: nothing to undo.
    expect(result).toEqual({ rotated: 1, failed: ['photoCanon11'] })
    expect(updatePhotoBlobLocation).toHaveBeenCalledTimes(1)
  })

  it('keeps going after one failure — a bad photo must not strand the rest', async () => {
    rename.mockRejectedValueOnce(new Error('rate limited'))
    const result = await mod.rotateRunPhotoBlobs('u1', [photo(1), photo(2), photo(3)])
    expect(result.rotated).toBe(2)
    expect(result.failed).toEqual(['photoCanon11'])
  })

  it('scopes the row update to the authenticated user', async () => {
    await mod.rotateRunPhotoBlobs('u1', [photo(1)])
    expect(updatePhotoBlobLocation).toHaveBeenCalledWith('u1', 'photoCanon11', {
      blobUrl: expect.stringContaining('shots/'),
      pathname: expect.stringContaining('shots/'),
    })
  })
})
