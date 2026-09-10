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
 *   2. The reads that make a photograph RENDER, or that build Nina's context, carry NO such
 *      predicate — invariant 2, written as an ABSENCE on purpose. A future "consistency" cleanup
 *      that adds the filter to `getNinaMessageImagesForMessages` blanks a photograph in a live
 *      conversation, and this is the only thing that would notice. (The job-photo link set added a
 *      fifth render read, `getNinaJobPhoto` — the Detail foto row's link fact — asserted below on
 *      the same absence.)
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

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const JOB = 'jobAAAAAAAAA'

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

  it('getNinaJobPhoto carries none either — the Detail foto row renders from it', async () => {
    /* The fifth render read: the icon is DRAWN from this row, so hiding a reference here would
     * blank the one control that proves the photograph still exists. Today a job's own row can
     * only be an original — references are minted on re-attach under a NEW carrier message — but
     * the invariant is written as an absence, not as today's data. */
    fake.enqueue([])
    await expect(queries.getNinaJobPhoto('u1', JOB)).resolves.toBeNull()

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
})

describe('getNinaJobPhoto — the job→photo join (this set)', () => {
  it('scopes BOTH tables, joins on the carrier message, filters to the job’s generated photograph', async () => {
    fake.enqueue([])
    await queries.getNinaJobPhoto('u1', JOB)

    const { sql } = fake.only()
    /* The join is the only job→photo key there is: the image row carries no job id, the carrier
     * message carries `turn_id`. `listNinaSelfieJobIdsSince` walks this exact join in the other
     * direction. */
    expect(sql).toContain(
      'inner join "nina_messages" on "nina_messages"."id" = "nina_message_images"."message_id"',
    )
    const where = whereOf(sql)
    /* Invariant 3, spelled on both sides: the images predicate is the module's standing rule, the
     * messages predicate is spelled too because a join's WHERE is where ownership is proved. */
    expect(where).toContain('"nina_message_images"."user_id" = $')
    expect(where).toContain('"nina_messages"."user_id" = $')
    expect(where).toContain('"nina_messages"."turn_id" = $')
    /* HIS uploads share the table; a job's photograph is always hers. */
    expect(where).toContain('"nina_message_images"."kind" = $')
    expect(fake.only().params).toContain(JOB)
  })

  it('deterministic order, one row, and nothing but the id', async () => {
    fake.enqueue([])
    await queries.getNinaJobPhoto('u1', JOB)

    const { sql } = fake.only()
    /* The gallery's own tiebreak, so LIMIT 1 stays deterministic even if a job ever carried two
     * photographs. */
    expect(sql).toContain(
      'order by "nina_message_images"."created_at" desc, "nina_message_images"."id" desc',
    )
    expect(sql).toContain('limit $')
    /* Invariant 5, STRUCTURALLY: the page maps this row to an href and nothing else, so the
     * projection names the id and nothing else — `description` is not kept off the client by the
     * caller's discipline, it is never selected. */
    expect(sql.startsWith('select "nina_message_images"."id" from')).toBe(true)
    expect(sql).not.toContain('description')
  })
})
