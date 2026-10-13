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

/**
 * The pre-media-thumbnails shape: an original and NO derived thumbnail. Every existing case in
 * this file keeps asserting exactly what it asserted before — one `rename` per photo — which is
 * the point: a row the backfill has not reached has nothing extra to move.
 */
const photo = (n: number) => ({
  id: `photoCanon${n}${n}`,
  blobUrl: `https://x.public.blob.vercel-storage.com/shots/old${n}-aaaa.jpg`,
  pathname: `shots/old${n}-aaaa.jpg`,
  thumbUrl: null,
  thumbPathname: null,
})

/** The same photo WITH a derived thumbnail — a second bearer URL that must also move. */
const photoWithThumb = (n: number) => ({
  ...photo(n),
  thumbUrl: `https://x.public.blob.vercel-storage.com/shots/thumb-old${n}-aaaa.jpg`,
  thumbPathname: `shots/thumb-old${n}-aaaa.jpg`,
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

/* ============================================================================
 * media-thumbnails phase 3 — the thumbnail is a SECOND bearer secret
 *
 * R-15's premise, from `lib/share/rotateBlobs.ts`'s own header: *"A Vercel Blob URL is public,
 * unguessable and permanent. It is not protected by the share token — it is its own bearer
 * secret."* A derived thumbnail is one of those too, and `ScreenshotStrip` serves it to every
 * stranger who opens `/s/[token]`. Rotating only the original would kill the page, 404 the
 * original, and leave the photograph readable at 256 px forever.
 * ==========================================================================*/
describe('rotateRunPhotoBlobs — the derived thumbnail rotates too', () => {
  it('moves BOTH objects and publishes both new locations in one row write', async () => {
    const result = await mod.rotateRunPhotoBlobs('u1', [photoWithThumb(1)])

    expect(result).toEqual({ rotated: 1, failed: [] })
    expect(rename).toHaveBeenCalledTimes(2)

    const movedFrom = rename.mock.calls.map((c) => c[0])
    expect(movedFrom).toContain('https://x.public.blob.vercel-storage.com/shots/old1-aaaa.jpg')
    expect(movedFrom).toContain(
      'https://x.public.blob.vercel-storage.com/shots/thumb-old1-aaaa.jpg',
    )

    // ONE row write carrying both, never two: a row naming a NEW original and an OLD thumbnail is
    // a half-revoked photograph, which is the state this function exists not to produce.
    expect(updatePhotoBlobLocation).toHaveBeenCalledTimes(1)
    const [, , location] = updatePhotoBlobLocation.mock.calls[0] as [
      string,
      string,
      Record<string, string>,
    ]
    expect(location.blobUrl).not.toBe(photoWithThumb(1).blobUrl)
    expect(location.thumbUrl).not.toBe(photoWithThumb(1).thumbUrl)
    expect(location.thumbPathname).toMatch(/^shots\/thumb-/)
  })

  it('a photo with NO thumbnail still rotates in exactly one rename', async () => {
    // The un-backfilled row. Nothing extra to move, and nothing extra leaks.
    const result = await mod.rotateRunPhotoBlobs('u1', [photo(1)])

    expect(result).toEqual({ rotated: 1, failed: [] })
    expect(rename).toHaveBeenCalledTimes(1)
    const [, , location] = updatePhotoBlobLocation.mock.calls[0] as [
      string,
      string,
      Record<string, string>,
    ]
    // The columns must be left ALONE, not blanked: `.set()` with an explicit null would wipe a
    // live pointer on every revocation.
    expect(location).not.toHaveProperty('thumbUrl')
    expect(location).not.toHaveProperty('thumbPathname')
  })

  it('a thumbnail that will not move reports the photo as STILL LIVE, never as rotated', async () => {
    // The original has already moved by then, so its old URL is dead and the thumbnail's is not.
    // Counting that as "rotated" would be a lie in the one direction that matters.
    rename.mockImplementationOnce((_from: string, to: string) => ({
      url: `https://x.public.blob.vercel-storage.com/${to}-zzzz`,
      pathname: `${to}-zzzz`,
    }))
    rename.mockImplementationOnce(() => {
      throw new Error('thumbnail rename failed')
    })

    const result = await mod.rotateRunPhotoBlobs('u1', [photoWithThumb(1)])

    expect(result.rotated).toBe(0)
    expect(result.failed).toEqual(['photoCanon11'])
    // The row was never written, so the owner's page still resolves and a retry can restore.
    expect(updatePhotoBlobLocation).not.toHaveBeenCalled()
  })
})
