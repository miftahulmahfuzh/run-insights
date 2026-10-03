import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * profpic-pointer-sync phase 2 (R3): Photoshop's "replace" frees the object the row stopped naming.
 * Edges mocked; the order of the three moves — read, write, release — is the thing under test.
 */

const order: string[] = []
const getNinaAvatar = vi.fn()
const getNinaMessageImage = vi.fn()
const insertNinaAvatars = vi.fn()
const updateNinaAvatarBlob = vi.fn()
const updateNinaChatPhotoBlob = vi.fn()
const getNinaPhotoshopJob = vi.fn()
const resolveNinaPhotoshopJob = vi.fn()
const releaseBlobIfUnreferenced = vi.fn()

vi.mock('@/lib/nina/queries', () => ({
  getNinaAvatar: (...args: unknown[]) => getNinaAvatar(...args),
  getNinaMessageImage: (...args: unknown[]) => getNinaMessageImage(...args),
  insertNinaAvatars: (...args: unknown[]) => insertNinaAvatars(...args),
  updateNinaAvatarBlob: (...args: unknown[]) => updateNinaAvatarBlob(...args),
  updateNinaChatPhotoBlob: (...args: unknown[]) => updateNinaChatPhotoBlob(...args),
}))
vi.mock('@/lib/nina/photoshopJobs', () => ({
  getNinaPhotoshopJob: (...args: unknown[]) => getNinaPhotoshopJob(...args),
  resolveNinaPhotoshopJob: (...args: unknown[]) => resolveNinaPhotoshopJob(...args),
}))
vi.mock('@/lib/nina/blobRelease', () => ({
  releaseBlobIfUnreferenced: (...args: unknown[]) => releaseBlobIfUnreferenced(...args),
}))

import { resolvePhotoshopReplace } from '@/lib/nina/photoshopResolve'

const USER = 'abc123XYZ_-9'
const JOB = 'jobAAAAAAAAA'
const AVATAR = 'avaAAAAAAAAA'
const IMAGE = 'imgAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const OLD_PATHNAME = `nina/${USER}/avatar-${AVATAR}-old.jpg`
const OLD_URL = `${STORE}/${OLD_PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${AVATAR}-old.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`
const NEW_PATHNAME = `nina/${USER}/photoshop-${JOB}.jpg`
const NEW_URL = `${STORE}/${NEW_PATHNAME}`

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB,
    userId: USER,
    status: 'ok',
    resolvedAction: null,
    sourceKind: 'avatar',
    sourceId: AVATAR,
    resultBlobUrl: NEW_URL,
    resultPathname: NEW_PATHNAME,
    resultWidth: 1024,
    resultHeight: 1536,
    resultBytes: 300_000,
    resultContentHash: null,
    ...overrides,
  }
}

beforeEach(() => {
  order.length = 0
  for (const mock of [
    getNinaAvatar,
    getNinaMessageImage,
    insertNinaAvatars,
    updateNinaAvatarBlob,
    updateNinaChatPhotoBlob,
    getNinaPhotoshopJob,
    resolveNinaPhotoshopJob,
    releaseBlobIfUnreferenced,
  ]) {
    mock.mockReset()
  }
  getNinaPhotoshopJob.mockResolvedValue(job())
  getNinaAvatar.mockImplementation(async () => {
    order.push('read')
    return {
      id: AVATAR,
      blobUrl: OLD_URL,
      pathname: OLD_PATHNAME,
      thumbUrl: THUMB_URL,
      thumbPathname: THUMB_PATHNAME,
    }
  })
  getNinaMessageImage.mockImplementation(async () => {
    order.push('read')
    return { id: IMAGE, blobUrl: OLD_URL, pathname: OLD_PATHNAME }
  })
  updateNinaAvatarBlob.mockImplementation(async () => {
    order.push('write')
    return { id: AVATAR }
  })
  updateNinaChatPhotoBlob.mockImplementation(async () => {
    order.push('write')
    return { id: IMAGE }
  })
  resolveNinaPhotoshopJob.mockImplementation(async () => {
    order.push('resolve')
  })
  releaseBlobIfUnreferenced.mockImplementation(async () => {
    order.push('release')
    return 'deleted'
  })
})

describe('resolvePhotoshopReplace — row first, blob second', () => {
  it('album source: reads, writes, resolves, then releases the old object AND the old thumbnail', async () => {
    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({ ok: true })

    expect(order).toEqual(['read', 'write', 'resolve', 'release', 'release'])
    expect(releaseBlobIfUnreferenced).toHaveBeenNthCalledWith(1, USER, {
      blobUrl: OLD_URL,
      pathname: OLD_PATHNAME,
    })
    expect(releaseBlobIfUnreferenced).toHaveBeenNthCalledWith(2, USER, {
      blobUrl: THUMB_URL,
      pathname: THUMB_PATHNAME,
    })
    expect(resolveNinaPhotoshopJob).toHaveBeenCalledWith(USER, JOB, 'replaced')
  })

  it('Media source: releases the old object only — a chat row has no thumbnail', async () => {
    getNinaPhotoshopJob.mockResolvedValue(job({ sourceKind: 'message_image', sourceId: IMAGE }))

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({ ok: true })

    expect(order).toEqual(['read', 'write', 'resolve', 'release'])
    expect(updateNinaChatPhotoBlob).toHaveBeenCalledWith(
      USER,
      IMAGE,
      expect.objectContaining({ pathname: NEW_PATHNAME, blobUrl: NEW_URL }),
    )
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: OLD_URL,
      pathname: OLD_PATHNAME,
    })
  })

  it('a refused write (a pointer, or gone) releases nothing and resolves nothing', async () => {
    updateNinaAvatarBlob.mockResolvedValue(null)

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({
      ok: false,
      reason: 'source-unavailable',
    })
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(resolveNinaPhotoshopJob).not.toHaveBeenCalled()
  })

  it('a source row that is already gone is refused before any write', async () => {
    getNinaAvatar.mockResolvedValue(null)

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({
      ok: false,
      reason: 'source-unavailable',
    })
    expect(updateNinaAvatarBlob).not.toHaveBeenCalled()
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('never releases the object the row now serves', async () => {
    getNinaPhotoshopJob.mockResolvedValue(
      job({ resultPathname: OLD_PATHNAME, resultBlobUrl: OLD_URL }),
    )

    await resolvePhotoshopReplace(USER, JOB)

    // Only the thumbnail goes; the main object is what the row still names.
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: THUMB_URL,
      pathname: THUMB_PATHNAME,
    })
  })

  it('a kept ("shared") object does not fail the replace', async () => {
    releaseBlobIfUnreferenced.mockResolvedValue('shared')

    await expect(resolvePhotoshopReplace(USER, JOB)).resolves.toEqual({ ok: true })
  })
})
