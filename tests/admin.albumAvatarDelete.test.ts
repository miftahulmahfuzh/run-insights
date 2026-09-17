import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The single album delete, in the order the ghost-photo fix requires.**
 *
 * `deleteNinaAvatarAction` had two defects and this file pins both fixes as an ORDER, because the
 * order is the whole of the correctness:
 *
 *   1. **Promote, then delete the row.** The dependents have to be measured while
 *      `source_avatar_id` still names this avatar — the `ON DELETE SET NULL` that cuts them loose
 *      fires inside the DELETE's own statement, so there is no second chance.
 *   2. **Then ask, then `del`.** The action's `del` was unconditional, which is very probably how
 *      the production row found on 2026-09-16 came to point at a 404. It now goes through
 *      `releaseBlobIfUnreferenced`, the ONE reference-checked release, once per object.
 *
 * `media-album-unified-search` R3 added a third: the action now reads the row BEFORE promoting
 * (`getNinaAvatar`, since `deleteNinaAvatar`'s RETURNING shape does not carry `source_image_id`),
 * and step 3 is skipped ENTIRELY for a pointer row — it never owned the object it shows.
 *
 * The recording driver answers the real statements, so "the promotion SELECT ran BEFORE the DELETE"
 * is read off `fake.queries` in execution order rather than off a spy's call count.
 */

const requireAdmin = vi.fn()
const del = vi.fn()
const revalidatePath = vi.fn()
const fetchMock = vi.fn()
const signImageBytes = vi.hoisted(() => vi.fn())

vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: (...args: unknown[]) => del(...args) }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => cb() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/perceptualSign', () => ({
  signImageBytes: (...args: unknown[]) => signImageBytes(...args),
  fetchAndSignImage: vi.fn(),
}))

const USER = 'usr123XYZ_-9'
const AVATAR_ID = 'avaAAAAAAAAA'
const DEP_ID = 'depAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/avatar-${AVATAR_ID}-Tu6HvWq2m0k3.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${AVATAR_ID}-Tu6HvWq2m0k3.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`

const SIGNATURE = {
  dhashHex: '0f1e2d3c4b5a6978',
  sig16Base64: Buffer.alloc(256, 7).toString('base64'),
  width: 1024,
  height: 1536,
}
const BYTES = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2])

type Actions = typeof import('@/lib/admin/ninaAlbumActions')
let actions: Actions
let fake: FakeDb

/** `deleteNinaAvatar`'s RETURNING projection: `{ id, blobUrl, pathname, thumbUrl, thumbPathname }`. */
function removedRow(thumb = false): unknown[] {
  return projectedRow(
    AVATAR_ID,
    BLOB_URL,
    PATHNAME,
    thumb ? THUMB_URL : null,
    thumb ? THUMB_PATHNAME : null,
  )
}

/**
 * `avatarColumns` in projection order — 21 values (Step 1 appended `sourceImageId`). This is the
 * action's own pre-read (`getNinaAvatar`), which now runs BEFORE the promotion because
 * `deleteNinaAvatar`'s RETURNING shape does not carry `source_image_id`.
 */
function existingRow(sourceImageId: string | null = null): unknown[] {
  return projectedRow(
    AVATAR_ID,
    BLOB_URL,
    PATHNAME,
    '', // folder
    null, // filename
    null, // thumbUrl
    null, // thumbPathname
    1024, // width
    1536, // height
    500_000, // bytes
    'admin', // source
    null, // cropScale
    null, // cropX
    null, // cropY
    null, // description
    null, // searchKeywords
    null, // negativeSearchKeywords
    false, // isCurrent
    null, // announcedAt
    '2026-09-01 09:00:00+00', // createdAt
    sourceImageId,
  )
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  requireAdmin.mockReset().mockResolvedValue({ userId: USER })
  del.mockReset().mockResolvedValue(undefined)
  revalidatePath.mockReset()
  fetchMock.mockReset()
  signImageBytes.mockReset().mockResolvedValue(SIGNATURE)
  fake = installFakeDb()
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

describe('deleteNinaAvatarAction', () => {
  it('promotes the dependent BEFORE the row delete, then keeps the blob it still needs', async () => {
    fake.enqueue([existingRow()]) // getNinaAvatar — the pre-read
    fake.enqueue([projectedRow(DEP_ID, BLOB_URL, PATHNAME)]) // the dependent lookup
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => BYTES.slice().buffer })
    fake.enqueue([{ id: DEP_ID }]) // the promotion UPDATE RETURNING
    fake.enqueue([removedRow()]) // deleteNinaAvatar RETURNING
    fake.enqueue([[{ id: DEP_ID }]], []) // isBlobPathnameReferenced: a chat row still names it

    const result = await actions.deleteNinaAvatarAction(AVATAR_ID)

    expect(result).toEqual({ ok: true })

    const sqls = fake.queries.map((query) => query.sql)
    const lookup = sqls.findIndex((sql) => sql.includes('"source_avatar_id"'))
    const promote = sqls.findIndex((sql) => sql.startsWith('update "nina_message_images"'))
    const remove = sqls.findIndex((sql) => sql.startsWith('delete from "nina_avatars"'))
    expect(lookup).toBeGreaterThanOrEqual(0)
    expect(promote).toBeGreaterThan(lookup)
    expect(remove).toBeGreaterThan(promote)

    /* The promoted dependent is the reason the object survives — which is the entire point. */
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('deletes the object when nothing points at it any more', async () => {
    fake.enqueue([existingRow()]) // getNinaAvatar
    fake.enqueue([]) // no dependents
    fake.enqueue([removedRow()])
    fake.enqueue([], []) // isBlobPathnameReferenced: neither table

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).resolves.toEqual({ ok: true })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(BLOB_URL)
  })

  it('asks about the thumbnail SEPARATELY — two objects, two answers', async () => {
    fake.enqueue([existingRow()])
    fake.enqueue([])
    fake.enqueue([removedRow(true)])
    fake.enqueue([[{ id: DEP_ID }]], []) // the full-size object is still referenced
    fake.enqueue([], []) // its thumbnail is not

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).resolves.toEqual({ ok: true })

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(THUMB_URL)
  })

  it('still refuses her current photo, and nothing is released', async () => {
    fake.enqueue([existingRow()]) // getNinaAvatar
    fake.enqueue([]) // the promotion runs first and finds nothing
    fake.enqueue([]) // deleteNinaAvatar → no row (is_current = true)

    const result = await actions.deleteNinaAvatarAction(AVATAR_ID)

    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('error', expect.stringContaining('current photo'))
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an id not in the album, before any promotion or delete', async () => {
    fake.enqueue([]) // getNinaAvatar → null

    const result = await actions.deleteNinaAvatarAction(AVATAR_ID)

    expect(result).toEqual({ ok: false, error: 'That photo is not in the album.' })
    expect(fake.queries).toHaveLength(1)
    expect(del).not.toHaveBeenCalled()
  })

  it('refuses a malformed id before reading, promoting or fetching anything', async () => {
    const result = await actions.deleteNinaAvatarAction('short')

    expect(result).toEqual({ ok: false, error: 'Not an avatar id.' })
    expect(fake.queries).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })

  it('a promotion that cannot reach the store never stops the delete', async () => {
    fake.enqueue([existingRow()])
    fake.enqueue([projectedRow(DEP_ID, BLOB_URL, PATHNAME)])
    fetchMock.mockRejectedValue(new Error('store unreachable'))
    fake.enqueue([removedRow()])
    fake.enqueue([[{ id: DEP_ID }]], [])

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).resolves.toEqual({ ok: true })

    /* Degraded to today's behaviour: the dependent stays unmeasured. The delete still happened,
     * and the object is still kept, because the reference check reads rows and not measurements. */
    expect(fake.queries.some((query) => query.sql.startsWith('update "nina_message_images"'))).toBe(
      false,
    )
    expect(del).not.toHaveBeenCalled()
  })

  describe('a pointer row (media-album-unified-search R3)', () => {
    it('still runs the dependent promotion and the row DELETE, but releases no blob at all', async () => {
      fake.enqueue([existingRow('img123XYZ_-9')]) // getNinaAvatar — a pointer
      fake.enqueue([]) // the promotion lookup — no dependents
      fake.enqueue([removedRow()]) // deleteNinaAvatar RETURNING

      const result = await actions.deleteNinaAvatarAction(AVATAR_ID)

      expect(result).toEqual({ ok: true })

      /* Exactly three statements: the pre-read, the promotion lookup, the delete — no
       * `isBlobPathnameReferenced` SELECT and no `del`, because a pointer never owned the object
       * it shows. */
      expect(fake.queries).toHaveLength(3)
      expect(fake.queries.some((query) => query.sql.includes('"pathname" = $'))).toBe(false)
      expect(del).not.toHaveBeenCalled()
      expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
    })
  })
})
