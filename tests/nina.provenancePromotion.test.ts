import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **Promote before delete, as the helper actually decides it.**
 *
 * `lib/nina/provenancePromotion.ts` is the fix for the 2026-09-16 production ghost: a reference row
 * whose parent is deleted becomes an "original" by `isOriginalPhoto()`'s own definition while
 * carrying none of the columns either dedup mechanism needs, and is therefore invisible to both
 * forever. The properties, in the order they would hurt if they were wrong:
 *
 *   1. **One GET per distinct OBJECT, however many rows share it.** Four bubbles re-showing one
 *      album face is one fetch, not four.
 *   2. **A dead object degrades and does not stop the pass.** The row it could not measure stays
 *      unmeasured — today's behaviour — the failure is named in the log, and every other object is
 *      still promoted. Nothing throws out to the caller, ever: a dedup optimisation failing must
 *      never cost the operator their delete (plan invariant 3).
 *   3. **The write carries both guards.** `content_hash is null` (idempotence against a concurrent
 *      promoter, the sweep's own `fill-hash` guard) and `pathname = $n` (the ghost-signature
 *      lesson: never write THESE bytes' measurements onto a row that has since been repointed).
 *   4. **An already-hashed dependent is never even fetched** — the lookup's own `content_hash is
 *      null` is what keeps a promotion from re-measuring what is already measured.
 *   5. **A sharp failure still writes the hash.** The perceptual pair is one op and the byte hash
 *      is another, exactly as the sweep splits them.
 *
 * `signImageBytes` is mocked so no test loads the native module; `contentHashOf` is REAL, so the
 * hashes below are the hashes production writes for those bytes.
 */

const signImageBytes = vi.hoisted(() => vi.fn())
vi.mock('@/lib/nina/perceptualSign', () => ({
  signImageBytes: (...args: unknown[]) => signImageBytes(...args),
  fetchAndSignImage: vi.fn(),
}))

const USER = 'abc123XYZ_-9'
const AVATAR_ID = 'avaAAAAAAAAA'
const IMAGE_ID = 'imgAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

const PATH_A = `nina/${USER}/avatar-${AVATAR_ID}-Tu6HvWq2m0k3.jpg`
const URL_A = `${STORE}/${PATH_A}`
const PATH_B = `nina/${USER}/avatar-bbbbbbbbbbbb-Tu6HvWq2m0k3.jpg`
const URL_B = `${STORE}/${PATH_B}`

const BYTES_A = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
/** sha-256 of BYTES_A, computed by the real `contentHashOf` in `beforeAll` — see below. */
let HASH_A: string

const SIGNATURE = {
  dhashHex: '0f1e2d3c4b5a6978',
  sig16Base64: Buffer.alloc(256, 7).toString('base64'),
  width: 1024,
  height: 1536,
}

const fetchMock = vi.fn()

/** The dependent projection: `{ id, blobUrl, pathname }`, in key order. */
function dependentRow(id: string, url: string, pathname: string): unknown[] {
  return projectedRow(id, url, pathname)
}

/** A body `measureBlobObject` can read: `ok`, and an `arrayBuffer()` of the given bytes. */
function blobResponse(bytes: Uint8Array): { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    ok: true,
    arrayBuffer: async () => bytes.slice().buffer,
  }
}

let fake: FakeDb
let promotion: typeof import('@/lib/nina/provenancePromotion')

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  signImageBytes.mockReset().mockResolvedValue(SIGNATURE)
  fake = installFakeDb()
  promotion = await import('@/lib/nina/provenancePromotion')

  const { contentHashOf } = await import('@/lib/photos/contentHash')
  HASH_A = await contentHashOf(BYTES_A)
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

describe('promoteNinaAvatarDependents', () => {
  it('asks nothing at all when there are no parents', async () => {
    await expect(promotion.promoteNinaAvatarDependents(USER, [])).resolves.toEqual({
      found: 0,
      fetched: 0,
      promoted: 0,
    })
    expect(fake.queries).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('looks up dependents owner-scoped, by source_avatar_id, and only the unmeasured ones', async () => {
    fake.enqueue([]) // no dependents

    await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    const read = fake.only()
    expect(read.sql).toContain('from "nina_message_images"')
    expect(read.sql).toContain('"source_avatar_id"')
    expect(read.sql).not.toContain('"source_image_id"') // the empty arm is omitted, not emitted
    expect(read.sql).toContain('"content_hash" is null')
    expect(read.sql).toContain('"user_id"')
    expect(read.params).toContain(USER)
    expect(read.params).toContain(AVATAR_ID)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches each distinct object ONCE, however many rows share it', async () => {
    fake.enqueue([
      dependentRow('depAAAAAAAAA', URL_A, PATH_A),
      dependentRow('depBBBBBBBBB', URL_A, PATH_A),
      dependentRow('depCCCCCCCCC', URL_A, PATH_A),
    ])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depAAAAAAAAA' }, { id: 'depBBBBBBBBB' }, { id: 'depCCCCCCCCC' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 3, fetched: 1, promoted: 3 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(signImageBytes).toHaveBeenCalledTimes(1)
    /* One UPDATE for the object, not one per row — the read plus one write. */
    expect(fake.queries).toHaveLength(2)
    expect(fake.last().sql).toContain('update "nina_message_images"')
  })

  it('writes the hash, the byte count, the pair and the dimensions, under BOTH guards', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depAAAAAAAAA' }])

    await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    const write = fake.last()
    expect(write.sql).toContain('update "nina_message_images"')
    expect(write.sql).toContain('"content_hash"')
    expect(write.sql).toContain('"perceptual_hash"')
    expect(write.sql).toContain('"perceptual_sig"')
    expect(write.sql).toContain('"width"')
    expect(write.sql).toContain('"height"')
    expect(write.sql).toContain('"bytes"')
    /* Guard 1: idempotent against a concurrent promoter — the sweep's own fill-hash guard. */
    expect(write.sql).toContain('"content_hash" is null')
    /* Guard 2: the ghost-signature lesson — only while the row still serves what was measured. */
    expect(write.sql).toContain('"pathname" =')
    /* And deliberately NOT the reference filter: every row here IS a reference right now. */
    expect(write.sql).not.toContain('"source_avatar_id" is null')

    expect(write.params).toContain(HASH_A)
    expect(write.params).toContain(BYTES_A.byteLength)
    expect(write.params).toContain(SIGNATURE.dhashHex)
    expect(write.params).toContain(SIGNATURE.sig16Base64)
    expect(write.params).toContain(PATH_A)
    expect(write.params).toContain(USER)
  })

  it('a dead object is skipped and named, and the NEXT object is still promoted', async () => {
    fake.enqueue([
      dependentRow('depAAAAAAAAA', URL_A, PATH_A),
      dependentRow('depBBBBBBBBB', URL_B, PATH_B),
    ])
    /* A's GET 404s (the production case: the blob was deleted out from under the row long ago);
     * B's succeeds. Ordered by pathname, so A is first and its failure must not end the pass. */
    fetchMock
      .mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })
      .mockResolvedValueOnce(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depBBBBBBBBB' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 2, fetched: 1, promoted: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    /* One write, and it is B's — A never reached the database. */
    const writes = fake.queries.filter((query) => query.sql.startsWith('update'))
    expect(writes).toHaveLength(1)
    expect(writes[0]?.params).toContain(PATH_B)
  })

  it('a throwing fetch degrades exactly the same way and never escapes', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockRejectedValue(new Error('network down'))

    await expect(promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])).resolves.toEqual({
      found: 1,
      fetched: 0,
      promoted: 0,
    })
    expect(fake.queries).toHaveLength(1) // the read only
  })

  it('a lookup that throws is swallowed — the caller still gets to run its delete', async () => {
    fake.enqueueError(new Error('neon unreachable'))

    await expect(promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])).resolves.toEqual({
      found: 0,
      fetched: 0,
      promoted: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a write that throws is swallowed, and the next object still lands', async () => {
    fake.enqueue([
      dependentRow('depAAAAAAAAA', URL_A, PATH_A),
      dependentRow('depBBBBBBBBB', URL_B, PATH_B),
    ])
    /* The write failure has to land on group A's UPDATE specifically — not on the lookup SELECT
     * that already ran before it. The fake driver drains queued errors strictly in call order, so
     * queuing it up front would hit the SELECT instead; queuing it as a side effect of group A's
     * `fetch` call lands it exactly between the SELECT (already done) and group A's UPDATE (next). */
    fetchMock.mockImplementationOnce(async () => {
      fake.enqueueError(new Error('write conflict'))
      return blobResponse(BYTES_A)
    })
    fetchMock.mockResolvedValueOnce(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depBBBBBBBBB' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 2, fetched: 2, promoted: 1 })
  })

  it('an unsignable object still gets its hash — the two fills are two decisions', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    signImageBytes.mockResolvedValue(null) // sharp could not decode it
    fake.enqueue([{ id: 'depAAAAAAAAA' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report.promoted).toBe(1)
    const write = fake.last()
    expect(write.sql).toContain('"content_hash"')
    expect(write.params).toContain(HASH_A)
    /* The four columns sharp owns are LEFT ALONE rather than nulled: "could not measure" is not
     * the same claim as "has no value", and the sweep's fill-perceptual op owns them. */
    expect(write.sql).not.toContain('"perceptual_hash"')
    expect(write.sql).not.toContain('"width"')
  })

  it('a malformed signature is dropped the same way a malformed claim is', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    signImageBytes.mockResolvedValue({ ...SIGNATURE, dhashHex: 'NOT-16-HEX' })
    fake.enqueue([{ id: 'depAAAAAAAAA' }])

    await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    const write = fake.last()
    expect(write.sql).toContain('"content_hash"')
    expect(write.sql).not.toContain('"perceptual_hash"')
  })

  it('an empty body is not a measurement', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(new Uint8Array(0)))

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 1, fetched: 0, promoted: 0 })
    expect(fake.queries).toHaveLength(1)
  })

  it('a non-https blob_url is refused before any request leaves', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', `http://insecure.test/${PATH_A}`, PATH_A)])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 1, fetched: 0, promoted: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('promoteNinaImageDependents', () => {
  it('reads the OTHER provenance column, and only that one', async () => {
    fake.enqueue([])

    await promotion.promoteNinaImageDependents(USER, [IMAGE_ID])

    const read = fake.only()
    expect(read.sql).toContain('"source_image_id"')
    expect(read.sql).not.toContain('"source_avatar_id"')
    expect(read.params).toContain(IMAGE_ID)
  })

  it('dedupes repeated parent ids before they reach the statement', async () => {
    fake.enqueue([])

    await promotion.promoteNinaImageDependents(USER, [IMAGE_ID, IMAGE_ID, IMAGE_ID])

    expect(fake.only().params.filter((param) => param === IMAGE_ID)).toHaveLength(1)
  })
})
