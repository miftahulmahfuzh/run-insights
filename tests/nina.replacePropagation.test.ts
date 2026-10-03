import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * profpic-pointer-sync phase 2 (R3, R1): **a replace moves everything that re-shows the photograph,
 * in the same batch, so the old object is free to go.**
 *
 * SQL contracts against the recording driver. The driver evaluates no predicate, so these prove
 * the statements' SHAPE: four members, gated, owner-scoped, with the right SET lists.
 * `tests/integration/replacePropagation.int.test.ts` proves the BEHAVIOUR against real Postgres
 * (rows really move, the gate really holds, the old pathname really ends up unreferenced).
 *
 * The positional `imageColumns`/`avatarColumns` projections are never fixtured here, which is
 * `tests/nina.chatPhotoDescription.test.ts`' rule. Only the miss branch of the return is asserted.
 */

const del = vi.fn()
vi.mock('@vercel/blob', () => ({ del: (...args: unknown[]) => del(...args) }))

type Queries = typeof import('@/lib/nina/queries')

const USER = 'abc123XYZ_-9'
const IMAGE = 'imgAAAAAAAAA'
const AVATAR = 'avaAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const OLD_PATHNAME = `nina/${USER}/selfie-${IMAGE}-old.jpg`
const OLD_URL = `${STORE}/${OLD_PATHNAME}`
const NEW_PATHNAME = `nina/${USER}/selfie-${IMAGE}-new.jpg`
const NEW_URL = `${STORE}/${NEW_PATHNAME}`

const PATCH = {
  blobUrl: NEW_URL,
  pathname: NEW_PATHNAME,
  width: 1024,
  height: 1536,
  bytes: 300_000,
  contentHash: null,
}

let fake: FakeDb
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  del.mockReset()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

function setOf(sql: string): string {
  return sql.slice(0, sql.indexOf(' where '))
}

function whereOf(sql: string): string {
  return sql.slice(sql.indexOf(' where '))
}

describe('updateNinaChatPhotoBlob — the original and everything that re-shows it, in one batch', () => {
  it('is exactly one db.batch of four statements, with nothing outside it', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    expect(fake.batches).toEqual([4])
    expect(fake.queries).toHaveLength(4)
    expect(fake.queries.every((query) => query.batched)).toBe(true)
  })

  it('member 1 is the Media row write, original-only and returning the row', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const sql = fake.sqlAt(0)
    expect(sql).toMatch(/^update "nina_message_images" set/)
    expect(sql).toContain('"last_replaced_at" = $')
    expect(whereOf(sql)).toContain('"id" = $')
    expect(whereOf(sql)).toContain('"source_avatar_id" is null')
    expect(whereOf(sql)).toContain('"source_image_id" is null')
    expect(sql).toContain('returning')
  })

  it('member 2 moves every album pointer at this original to the new bytes', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const { sql, params } = fake.queries[1]!
    expect(sql).toMatch(/^update "nina_avatars" set/)
    for (const column of ['blob_url', 'pathname', 'width', 'height', 'bytes', 'content_hash']) {
      expect(setOf(sql), column).toContain(`"${column}" = `)
    }
    expect(whereOf(sql)).toContain('"nina_avatars"."source_image_id" = $')
    expect(params).toContain(NEW_URL)
    expect(params).toContain(NEW_PATHNAME)
    expect(params).toContain(IMAGE)
  })

  it('member 2 keeps a pointer’s crop only when the dimensions did not change (Decisions)', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const { sql, params } = fake.queries[1]!
    const set = setOf(sql)
    for (const column of ['crop_scale', 'crop_x', 'crop_y']) {
      expect(set, column).toContain(
        `"${column}" = case when "nina_avatars"."width" is not distinct from $`,
      )
    }
    expect(set).toContain('"nina_avatars"."height" is not distinct from $')
    expect(set).toContain('then "nina_avatars"."crop_scale" else null end')
    expect(params).toContain(PATCH.width)
    expect(params).toContain(PATCH.height)
  })

  it('member 2 never touches a pointer’s identity or place (invariant 6)', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const set = setOf(fake.sqlAt(1))
    for (const column of [
      'id',
      'is_current',
      'folder',
      'source_key',
      'source_image_id',
      'announced_at',
    ]) {
      expect(set, column).not.toContain(`"${column}" = `)
    }
  })

  it('member 2 writes the pointer contract: NULL prose, keywords, embedding and thumbnail (invariant 4, Decision D1)', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const set = setOf(fake.sqlAt(1))
    for (const column of [
      'description',
      'search_keywords',
      'negative_search_keywords',
      'description_embedding',
      'thumb_url',
      'thumb_pathname',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
  })

  it('member 3 moves chat references of this original and retracts their prose', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const sql = fake.sqlAt(2)
    expect(sql).toMatch(/^update "nina_message_images" set/)
    const set = setOf(sql)
    for (const column of [
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'content_hash',
      'description',
      'perceptual_hash',
      'perceptual_sig',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
    // A reference stays a reference: its provenance is what makes it follow the original.
    expect(set).not.toContain('"source_image_id" = ')
    expect(set).not.toContain('"source_avatar_id" = ')
    expect(set).not.toContain('"last_replaced_at" = ')
    expect(whereOf(sql)).toContain('"nina_message_images"."source_image_id" = $')
  })

  it('member 4 moves chat references that re-show one of the pointers', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    const sql = fake.sqlAt(3)
    expect(sql).toMatch(/^update "nina_message_images" set/)
    expect(setOf(sql)).toContain('"pathname" = $')
    expect(setOf(sql)).toContain('"perceptual_sig" = $')
    expect(whereOf(sql)).toContain(
      '"nina_message_images"."source_avatar_id" in (select "id" from "nina_avatars" where',
    )
    expect(whereOf(sql)).toContain('"nina_avatars"."source_image_id" = $')
  })

  it('members 2–4 are gated on the original now serving the NEW pathname', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    for (const index of [1, 2, 3]) {
      const { sql, params } = fake.queries[index]!
      const where = whereOf(sql)
      expect(where, `member ${index + 1}`).toContain(
        'exists (select 1 from "nina_message_images" "replaced_original" where',
      )
      expect(where).toContain('"replaced_original"."id" = $')
      expect(where).toContain('"replaced_original"."pathname" = $')
      expect(where).toContain('"replaced_original"."source_avatar_id" is null')
      expect(where).toContain('"replaced_original"."source_image_id" is null')
      expect(params).toContain(NEW_PATHNAME)
    }
  })

  it('every member is owner-scoped', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)

    for (const query of fake.queries) {
      expect(whereOf(query.sql)).toContain('"user_id" = $')
      expect(query.params).toContain(USER)
    }
  })

  it('returns null when member 1 matched nothing, so the action can refuse', async () => {
    fake.enqueue([])
    await expect(queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)).resolves.toBeNull()
  })
})

describe('updateNinaAvatarBlob — the album original and its chat references, in one batch', () => {
  const ALBUM_PATCH = { ...PATCH, contentHash: null }

  it('is exactly one db.batch of two statements', async () => {
    await queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)

    expect(fake.batches).toEqual([2])
    expect(fake.queries).toHaveLength(2)
    expect(fake.queries.every((query) => query.batched)).toBe(true)
  })

  it('member 1 keeps the pointer refusal and drops the stale thumbnail pair', async () => {
    await queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)

    const sql = fake.sqlAt(0)
    expect(sql).toMatch(/^update "nina_avatars" set/)
    const set = setOf(sql)
    for (const column of [
      'blob_url',
      'pathname',
      'description',
      'description_embedding',
      'thumb_url',
      'thumb_pathname',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
    expect(whereOf(sql)).toContain('"source_image_id" is null')
    expect(sql).toContain('returning')
  })

  it('member 2 moves chat references of this album row, gated on the row now serving the new bytes', async () => {
    await queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)

    const { sql, params } = fake.queries[1]!
    expect(sql).toMatch(/^update "nina_message_images" set/)
    const set = setOf(sql)
    for (const column of [
      'blob_url',
      'pathname',
      'content_hash',
      'description',
      'perceptual_hash',
      'perceptual_sig',
    ]) {
      expect(set, column).toContain(`"${column}" = `)
    }
    const where = whereOf(sql)
    expect(where).toContain('"nina_message_images"."user_id" = $')
    expect(where).toContain('"nina_message_images"."source_avatar_id" = $')
    expect(where).toContain('exists (select 1 from "nina_avatars" where')
    expect(where).toContain('"nina_avatars"."pathname" = $')
    expect(where).toContain('"nina_avatars"."source_image_id" is null')
    expect(params).toContain(AVATAR)
    expect(params).toContain(NEW_PATHNAME)
  })

  it('returns null on a miss (a pointer, or not his)', async () => {
    fake.enqueue([])
    await expect(queries.updateNinaAvatarBlob(USER, AVATAR, ALBUM_PATCH)).resolves.toBeNull()
  })
})

describe('after the batch, the release deletes the old object', () => {
  it('asks both tables about the OLD object and deletes it when nothing names it', async () => {
    await queries.updateNinaChatPhotoBlob(USER, IMAGE, PATCH)
    fake.reset()
    const { releaseBlobIfUnreferenced } = await import('@/lib/nina/blobRelease')

    await expect(
      releaseBlobIfUnreferenced(USER, { blobUrl: OLD_URL, pathname: OLD_PATHNAME }),
    ).resolves.toBe('deleted')

    expect(del).toHaveBeenCalledWith(OLD_URL)
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      expect(query.params).toContain(OLD_PATHNAME)
      expect(query.params).toContain(USER)
    }
  })
})
