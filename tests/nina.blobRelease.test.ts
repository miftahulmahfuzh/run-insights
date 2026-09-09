import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { ninaChatPathname } from '@/lib/nina/images'

/**
 * **The one place a Blob object is deleted after a photograph row stops pointing at it.**
 *
 * `releaseBlobIfUnreferenced` used to be `releaseChatPhotoBlob`, private to
 * `lib/admin/chatPhotoActions.ts` — the file whose header argues WHY every delete must go through
 * a reference check first (R26's re-attach copies `blob_url`/`pathname` onto new rows, so one
 * object can be behind another chat row or a `nina_avatars` row, possibly her CURRENT profile
 * picture). Extracting it to `lib/nina/` lets the runner-facing photo delete reuse that argument
 * instead of copying it: one definition of "nothing references these bytes", so a third delete
 * path cannot drift from the first two.
 *
 * These tests run the REAL helper over the REAL `isBlobPathnameReferenced` (the recording driver
 * answers its SELECTs — `tests/nina.softDelete.test.ts`'s posture) with only `@vercel/blob`'s
 * `del` mocked, because that is the network edge. The "reference check itself threw" branch is
 * the one case the recorder cannot stage — an empty queue answers "no rows", which is the
 * `deleted` fixture, not an error — and it is carried over verbatim from the admin original.
 */

const del = vi.hoisted(() => vi.fn())
vi.mock('@vercel/blob', () => ({ del }))

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/** The composer upload shape — `ninaChatPathname`, not a hand-spelled guess. */
const PATHNAME = ninaChatPathname(USER, ID)
const URL = `${STORE}/${PATHNAME}`

let fake: FakeDb
let blobRelease: typeof import('@/lib/nina/blobRelease')

beforeEach(async () => {
  vi.resetModules()
  del.mockReset()
  fake = installFakeDb()
  blobRelease = await import('@/lib/nina/blobRelease')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('releaseBlobIfUnreferenced', () => {
  it('deletes the object when no row references it', async () => {
    fake.enqueue([], [])
    del.mockResolvedValue({})

    await expect(
      blobRelease.releaseBlobIfUnreferenced(USER, { blobUrl: URL, pathname: PATHNAME }),
    ).resolves.toBe('deleted')

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(URL)
  })

  it('keeps the object when a chat row still points at it', async () => {
    fake.enqueue([[{ id: 'imgStillHere' }]], [])

    await expect(
      blobRelease.releaseBlobIfUnreferenced(USER, { blobUrl: URL, pathname: PATHNAME }),
    ).resolves.toBe('shared')

    expect(del).not.toHaveBeenCalled()
  })

  it('keeps the object when an album row still points at it', async () => {
    fake.enqueue([], [[{ id: 'avatarStillHere' }]])

    await expect(
      blobRelease.releaseBlobIfUnreferenced(USER, { blobUrl: URL, pathname: PATHNAME }),
    ).resolves.toBe('shared')

    expect(del).not.toHaveBeenCalled()
  })

  it('keeps the object and reports failure when the delete itself fails', async () => {
    fake.enqueue([], [])
    del.mockRejectedValue(new Error('blob store unavailable'))

    await expect(
      blobRelease.releaseBlobIfUnreferenced(USER, { blobUrl: URL, pathname: PATHNAME }),
    ).resolves.toBe('failed')

    /* The attempt was made once — a caller that retries is a caller that might double-delete. */
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('asks BOTH reference tables, owner-scoped, and hands del the URL not the pathname', async () => {
    fake.enqueue([], [])

    await blobRelease.releaseBlobIfUnreferenced(USER, { blobUrl: URL, pathname: PATHNAME })

    expect(fake.queries).toHaveLength(2)
    const tables = fake.queries.map((query) => query.sql)
    expect(tables.some((sql) => sql.includes('nina_message_images'))).toBe(true)
    expect(tables.some((sql) => sql.includes('nina_avatars'))).toBe(true)
    for (const query of fake.queries) {
      /* Ownership is invariant 3, and it is also what makes the answer meaningful: Blob objects
       * are per-user by pathname, so another user's row cannot reference this object. */
      expect(query.sql).toContain('user_id')
      expect(query.sql.toLowerCase()).toContain('limit')
    }
    expect(del).toHaveBeenCalledWith(URL)
  })
})
