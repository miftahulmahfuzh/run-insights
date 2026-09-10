import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **F37 R1/R3's contract, asserted against generated SQL rather than against a spy.**
 *
 * A reference filter is only worth anything if the reads that must carry it do and the reads that
 * must NOT carry it do not — and a `vi.fn()` cannot tell "the function ran" from "the predicate
 * was in the WHERE". So this file installs the recording driver (`tests/support/fakeDb.ts`) and
 * reads the statements, exactly as `tests/nina.softDelete.test.ts` does for `deleted_at`.
 *
 * Three properties, and the SECOND is the one most likely to rot:
 *
 *   1. The three COLLECTION reads skip a reference. Two call sites for three statements, because
 *      `generatedChatPhotoScope` is shared by the page and the count on purpose.
 *   2. The four reads that make a photograph RENDER, or that build Nina's context, carry NO such
 *      predicate — invariant 2, written as an ABSENCE on purpose. A future "consistency" cleanup
 *      that adds the filter to `getNinaMessageImagesForMessages` blanks a photograph in a live
 *      conversation, and this is the only thing that would notice.
 *   3. Every INSERT names both columns, so an original binds NULL rather than omitting the column.
 *
 * The assertions match `"source_avatar_id" is null` rather than the fully-qualified spelling,
 * because drizzle qualifies a column in a SELECT and may not in an UPDATE and neither is the
 * point — `tests/nina.softDelete.test.ts:59`'s `HIDDEN_SKIPPED` trick.
 */

type Queries = typeof import('@/lib/nina/queries')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const IMAGE = 'imgAAAAAAAAA'
const MESSAGE = 'msgAAAAAAAAA'

let fake: FakeDb
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

const REFERENCE_SKIPPED = ['"source_avatar_id" is null', '"source_image_id" is null'] as const

/** NIST FIPS 180-4's SHA-256("abc") — any 64-lowercase-hex literal would do for the shape tests. */
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

/**
 * The WHERE clause alone. Both columns are in `imageColumns`, so they appear in every SELECT list
 * on this table — an unscoped `not.toContain` would fail on the projection and prove nothing. The
 * inverse of `tests/nina.softDelete.test.ts`'s `setClause` slice.
 */
function whereOf(sql: string): string {
  const at = sql.indexOf(' where ')
  if (at < 0) throw new Error(`no WHERE clause in: ${sql}`)
  return sql.slice(at)
}

describe('the collection listings skip a reference (R1, R3)', () => {
  it('listNinaMessageImages — /nina/about loses the duplicate and the album face', async () => {
    fake.enqueue([])
    await queries.listNinaMessageImages('u1', { limit: 200 })

    const { sql } = fake.only()
    const where = whereOf(sql)
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
    // Still the same one indexed read it always was: user_id equality, (created_at, id) already
    // in index order, limit real.
    expect(where).toContain('"user_id" = $')
    expect(sql).toContain('limit')
  })

  it('listNinaChatPhotos — BOTH of its statements carry it, so the pager cannot lie', async () => {
    fake.enqueue([], [[0]])
    await queries.listNinaChatPhotos('u1')

    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      const where = whereOf(query.sql)
      for (const predicate of REFERENCE_SKIPPED) expect(where, query.sql).toContain(predicate)
      // The page and the total share `generatedChatPhotoScope`, which is why they cannot drift.
      expect(where).toContain('"kind" = $')
    }
  })

  it('countNinaChatPhotos — /admin’s hub card counts what /admin/photos lists', async () => {
    fake.enqueue([[0]])
    await expect(queries.countNinaChatPhotos('u1')).resolves.toBe(0)

    const where = whereOf(fake.only().sql)
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
  })
})

describe('invariant 2: whatever a listing hides, a bubble still gets', () => {
  it('getNinaMessageImagesForMessages carries NO reference predicate — every bubble reads it', async () => {
    /* An ABSENCE assertion on purpose. This is the read behind ChatImages, the photo viewer, the
     * download control and the delete log. Adding the filter here blanks a photograph that is
     * sitting in a conversation the runner can scroll to, and nothing else in the suite would
     * notice. */
    fake.enqueue([])
    await queries.getNinaMessageImagesForMessages('u1', [MESSAGE])

    const where = whereOf(fake.only().sql)
    expect(where).not.toContain('source_avatar_id')
    expect(where).not.toContain('source_image_id')
  })

  it('getNinaMessageImage carries none either — the ?photo= link and the re-attach path', async () => {
    /* `resolveAttachment` reads through this. A reference that could not be re-attached would be a
     * photograph the runner can see and cannot share, and the second attach is exactly what
     * `ninaPhotoProvenance`'s flattening arm is for. */
    fake.enqueue([])
    await expect(queries.getNinaMessageImage('u1', IMAGE)).resolves.toBeNull()

    const where = whereOf(fake.only().sql)
    expect(where).not.toContain('source_avatar_id')
    expect(where).not.toContain('source_image_id')
  })

  it('isBlobPathnameReferenced counts a reference as a reference — it is the whole question', async () => {
    /* This is what stands between /admin/photos and deleting bytes somebody is still rendering,
     * and a reference is BY DEFINITION a second row pointing at one Blob object. Filtering here
     * would make Remove delete the object her profile picture is served from. */
    fake.enqueue([], [])
    await queries.isBlobPathnameReferenced('u1', 'nina/u1/selfie-x.png', 'https://x.example/s.png')

    // TWO statements, run concurrently: one per table, each with its `OR`s inline. Not one per
    // column — the function asks six columns across two `Promise.all` members.
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      const where = whereOf(query.sql)
      expect(where, query.sql).not.toContain('source_avatar_id')
      expect(where, query.sql).not.toContain('source_image_id')
    }
  })
})

describe('insertNinaMessageImages names both columns on every path', () => {
  it('binds NULL for an original rather than omitting the column', async () => {
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      { messageId: MESSAGE, kind: 'upload', blobUrl: 'https://x/a.jpg', pathname: 'nina/u1/a.jpg' },
    ])

    expect(fake.queries).toHaveLength(2) // the hand-rolled FK check, then the insert
    const insert = fake.sqlAt(1)
    expect(insert).toMatch(/^insert into "nina_message_images"/)
    expect(insert).toContain('"source_avatar_id"')
    expect(insert).toContain('"source_image_id"')
    /* Coalesced and not spread: one statement shape for every writer, so a reference and an
     * original bind the same parameter list. */
    expect(fake.queries[1]!.params).toContain(null)
  })

  it('binds the avatar id a re-attach supplies, in the avatar column', async () => {
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      {
        messageId: MESSAGE,
        kind: 'generated',
        blobUrl: 'https://x/a.jpg',
        pathname: 'nina/u1/a.jpg',
        sourceAvatarId: 'avatarAAAAAA',
      },
    ])
    expect(fake.queries[1]!.params).toContain('avatarAAAAAA')
  })

  it('names content_hash and binds NULL while nobody sends a hash yet', async () => {
    // media-dedupe P1: the column pass-through, live before any caller. The F37 tests above
    // assert the same shape for the provenance pair; this is its third member.
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      { messageId: MESSAGE, kind: 'upload', blobUrl: 'https://x/a.jpg', pathname: 'nina/u1/a.jpg' },
    ])

    const insert = fake.sqlAt(1)
    expect(insert).toContain('"content_hash"')
    expect(fake.queries[1]!.params).toContain(null)
  })

  it('binds a valid hash claim as given', async () => {
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      {
        messageId: MESSAGE,
        kind: 'upload',
        blobUrl: 'https://x/a.jpg',
        pathname: 'nina/u1/a.jpg',
        contentHash: ABC_SHA256,
      },
    ])
    expect(fake.queries[1]!.params).toContain(ABC_SHA256)
  })

  it('coerces a malformed hash claim to NULL rather than storing it (invariant 9)', async () => {
    // The claim came from a client; the column only ever holds what isValidContentHash accepts.
    // Dedup going quietly inactive beats a send error, and beats a column that lies.
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      {
        messageId: MESSAGE,
        kind: 'upload',
        blobUrl: 'https://x/a.jpg',
        pathname: 'nina/u1/a.jpg',
        contentHash: 'NOT-A-HASH',
      },
    ])
    expect(fake.queries[1]!.params).not.toContain('NOT-A-HASH')
    expect(fake.queries[1]!.params).toContain(null)
  })
})

describe('Replace stops the provenance lying about bytes that are gone', () => {
  it('nulls both columns in the same statement as description and prompt', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob('u1', IMAGE, {
      blobUrl: 'https://x/new.jpg',
      pathname: 'nina/u1/new.jpg',
      width: 768,
      height: 1024,
      bytes: 123,
    })

    const { sql } = fake.only()
    const setClause = sql.slice(0, sql.indexOf(' where '))
    for (const column of ['description', 'prompt', 'source_avatar_id', 'source_image_id']) {
      expect(setClause, column).toContain(column)
    }
    /* One statement, so there is no window in which the row points at new bytes and old
     * provenance — `updateNinaChatPhotoBlob`'s own argument for nulling `description` here. */
    expect(fake.queries).toHaveLength(1)
  })

  it('media-dedupe P3: names content_hash in the SAME statement — a claim sticks, its absence retracts', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob('u1', IMAGE, {
      blobUrl: 'https://x/new.jpg',
      pathname: 'nina/u1/new.jpg',
      width: 768,
      height: 1024,
      bytes: 123,
      contentHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })

    const { sql } = fake.only()
    /* One statement, so there is no window in which the row points at new bytes and claims old
     * ones — the same argument the provenance nulls above it make. */
    expect(sql.slice(0, sql.indexOf(' where '))).toContain('content_hash')
    expect(fake.queries).toHaveLength(1)
  })
})
