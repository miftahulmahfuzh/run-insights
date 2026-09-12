import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NINA_CHAT_PHOTO_PAGE_SIZE } from '@/lib/nina/album'

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
 *   1. The three COLLECTION reads skip a reference. The listing read and the picker count —
 *      `listNinaPhotoReferences`' page side and `countNinaChatPhotos`, its total — share
 *      `generatedChatPhotoScope` on purpose, so the page and the total cannot drift.
 *   2. The reads that make a photograph RENDER, or that build Nina's context, carry NO such
 *      predicate — invariant 2, written as an ABSENCE on purpose. A future "consistency" cleanup
 *      that adds the filter to `getNinaMessageImagesForMessages` blanks a photograph in a live
 *      conversation, and this is the only thing that would notice. (The job-photo link set added a
 *      fifth render read, `getNinaJobPhoto` — the Detail foto row's link fact — asserted below on
 *      the same absence, and this set added `getNinaJobPhotoBubble` — the jump's target, where a
 *      reference row IS the answer — on it too.)
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
 * The album-adoption half of the same duplicate class, pinned as text for `REFERENCE_SKIPPED`'s
 * reason. `setChatPhotoAsAvatarAction` COPIES a chat photograph into `nina_avatars` and writes
 * `source_key = 'chat-photo:<image id>'` on the COPY, never on the original — so `isOriginalPhoto()`
 * still calls the chat row original and the picker's union offered the photograph twice.
 *
 * Single-line fragments only: the predicate is a raw `sql` template, so its newlines and
 * indentation reach the statement verbatim and a multi-line expectation would pin the author's
 * formatting rather than the meaning.
 *
 * The `'chat-photo:'` literal is the coupling this file exists to hold: the writer spells it at
 * `lib/admin/ninaAlbumActions.ts:301` and the reader spells it in `generatedChatPhotoScope`, with
 * no shared constant possible between a `'use server'` module and the db layer.
 */
const ADOPTED_SKIPPED = [
  'not exists (',
  'from "nina_avatars"',
  '"nina_avatars"."user_id" = $',
  `"nina_avatars"."source_key" = 'chat-photo:' || "nina_message_images"."id"`,
] as const

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

  it('countNinaChatPhotos — the reference picker’s chat-side total still skips a reference', async () => {
    fake.enqueue([[0]])
    await expect(queries.countNinaChatPhotos('u1')).resolves.toBe(0)

    const where = whereOf(fake.only().sql)
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
  })
})

describe('the picker drops a photograph her album has already adopted', () => {
  it('countNinaChatPhotos — the chat-side total stops counting an adopted photograph', async () => {
    fake.enqueue([[0]])
    await expect(queries.countNinaChatPhotos('u1')).resolves.toBe(0)

    const { sql, params } = fake.only()
    const where = whereOf(sql)
    for (const predicate of ADOPTED_SKIPPED) expect(where, predicate).toContain(predicate)
    /* BOTH halves, in one scope: the F37 reference filter and the adoption filter. The bug was
     * that the first one alone looked like the whole rule. */
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
    /* The owner id is bound TWICE — once on the outer table, once inside the subquery. An
     * unscoped subquery would let another operator's album hide this operator's photographs, and
     * a missing third parameter is exactly what that regression would look like from here. */
    expect(params).toEqual(['u1', 'generated', 'u1'])
  })

  it('listNinaPhotoReferences — the chat page carries it and the ALBUM page must not', async () => {
    /* Four statements. Q0 `countNinaAvatars` and Q1 `countNinaChatPhotos` are function CALLS and
     * dispatch while the `Promise.all` array is being built; Q2 the album page and Q3 the chat
     * page are lazy drizzle thenables that only run when `Promise.all` awaits them, in array
     * order. Recorded, not assumed. */
    fake.enqueue([[3]], [[4]], [], [])
    await queries.listNinaPhotoReferences('u1')

    expect(fake.queries).toHaveLength(4)
    const chat = whereOf(fake.sqlAt(3))
    for (const predicate of ADOPTED_SKIPPED) expect(chat, predicate).toContain(predicate)
    /* The page and the total read one scope, so they cannot disagree about who is adopted. */
    const count = whereOf(fake.sqlAt(1))
    for (const predicate of ADOPTED_SKIPPED) expect(count, predicate).toContain(predicate)

    /* An ABSENCE, and it is the user's other half: the album COPY is the row that SURVIVES the
     * dedup, so the album statement must keep listing it. Filtering both sides "for consistency"
     * would delete the photograph from the picker entirely. */
    const album = whereOf(fake.sqlAt(2))
    expect(album).not.toContain('source_key')
    expect(album).not.toContain('not exists')
  })

  it('resolveNinaPhotoReference — a saved chat id resolves through the same scope', async () => {
    /* The shared scope makes this free, which is why it is worth asserting: a selection saved
     * before the adoption must not resolve to a tile the picker can no longer offer. The function
     * already degrades an unresolvable reference to `null` (an unanchored generation) — its own
     * documented contract for "the photograph was deleted", and an adoption gets the same
     * treatment on purpose. */
    fake.enqueue([])
    await expect(
      queries.resolveNinaPhotoReference('u1', { source: 'chat', id: IMAGE }),
    ).resolves.toBeNull()

    const where = whereOf(fake.only().sql)
    for (const predicate of ADOPTED_SKIPPED) expect(where, predicate).toContain(predicate)
  })

  it('the Media view and /nina/about keep the adopted photograph — absence on purpose', async () => {
    /* The user asked for the PICKER to deduplicate, and only the picker. These reads take
     * `isOriginalPhoto()` directly (`listNinaMessageImages`) or through `mediaCollectionScope`
     * (`listNinaMediaPhotos`), and must not grow the album lookup: an adopted chat row is still a
     * real photograph in a real bubble, and the Media view is the only place it can be Replaced
     * or Removed. */
    fake.enqueue([])
    await queries.listNinaMessageImages('u1', { limit: 200 })
    expect(whereOf(fake.only().sql)).not.toContain('source_key')

    fake.reset()
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1')
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      expect(whereOf(query.sql), query.sql).not.toContain('source_key')
    }
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

describe('getNinaJobPhotoBubble — the earliest bubble carrying the photograph (this set)', () => {
  it('scopes BOTH tables, joins on the carrier message, and takes the original OR its references', async () => {
    fake.enqueue([])
    await expect(queries.getNinaJobPhotoBubble('u1', IMAGE)).resolves.toBeNull()

    const { sql } = fake.only()
    /* The same join `getNinaJobPhoto` walks. `message_id` is nullable (`ON DELETE SET NULL`), and
     * the inner join is what makes "a bubble" true: an orphaned photograph has no bubble to jump
     * to, which is also why no `IS NOT NULL` predicate is spelled. */
    expect(sql).toContain(
      'inner join "nina_messages" on "nina_messages"."id" = "nina_message_images"."message_id"',
    )
    const where = whereOf(sql)
    /* Invariant 1, spelled on both sides — `getNinaJobPhoto`'s rule. */
    expect(where).toContain('"nina_message_images"."user_id" = $')
    expect(where).toContain('"nina_messages"."user_id" = $')
    /* The candidate set is EXACTLY the original plus every reference pointing at it: drizzle
     * parenthesizes the OR inside the AND, so the owner scope provably applies to BOTH arms —
     * unbracketed, `a and b and c or d` would scope only the first. The second arm is matched
     * with a numbered placeholder (`= $4` in this statement) followed by BOTH closing parens —
     * the OR group's and the AND group's — so the arm provably sits inside the bracketed group.
     * `ninaPhotoProvenance` flattens copies-of-copies to name the original, so two predicates
     * are the whole set and there is no recursion to write. */
    expect(where).toContain('("nina_message_images"."id" = $')
    expect(where).toMatch(/"nina_message_images"\."source_image_id" = \$\d+\)\)/)
    expect(fake.only().params).toContain(IMAGE)
  })

  it('earliest first, by the conversation order, one row, and nothing but the two link facts', async () => {
    fake.enqueue([])
    await queries.getNinaJobPhotoBubble('u1', IMAGE)

    const { sql } = fake.only()
    /* `seq` is the schema's stated total order of the whole conversation (sessions slice it) —
     * the order `MessageList` renders in, so "earliest across all sessions" is `seq ASC`. The id
     * tiebreak covers the one shape with equal seqs: two image rows on ONE carrier message. */
    expect(sql).toContain('order by "nina_messages"."seq" asc, "nina_message_images"."id" asc')
    expect(sql).toContain('limit $')
    /* The jump needs exactly two facts — the session to open and the message to pinpoint — and
     * the projection names those and nothing else. */
    const projection = 'select "nina_messages"."session_id", "nina_messages"."id" from'
    expect(sql.startsWith(projection)).toBe(true)
  })

  it('carries NO isOriginalPhoto predicate and NO kind arm — a reference IS a valid target', async () => {
    /* ABSENCE on purpose, `getNinaJobPhoto`'s precedent. The runner's own re-attach of her photo
     * is itself a reference row; filtering it here would take back the exact case this read
     * exists for ("it could be nina's bubble, or user's own bubble"). Note `source_image_id` DOES
     * appear — as the `= $` arm — so the absence is asserted against the `is null` spellings,
     * which is what `isOriginalPhoto()` is made of. */
    fake.enqueue([])
    await queries.getNinaJobPhotoBubble('u1', IMAGE)

    const where = whereOf(fake.only().sql)
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).not.toContain(predicate)
    expect(where).not.toContain('"source_avatar_id"')
    /* And no `kind` arm: the two id predicates already pin the photograph's bytes — the original
     * arrived through `getNinaJobPhoto`'s `kind = 'generated'` read, and a re-attach inherits its
     * keeper's kind (`resolveAttachment`) — so the filter has no work to do here, and a future
     * "consistency" cleanup must not give it any. */
    expect(where).not.toContain('"kind" =')
  })
})

describe('the Media view read — /admin/nina?view=media (image-collection phase 1)', () => {
  it('listNinaMediaPhotos — BOTH statements skip a reference and NEITHER carries a kind arm', async () => {
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1')

    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      const where = whereOf(query.sql)
      for (const predicate of REFERENCE_SKIPPED) expect(where, query.sql).toContain(predicate)
      expect(where).toContain('"user_id" = $')
      // The superset property, asserted as an ABSENCE for the same reason invariant 2's is: his
      // composer uploads (`kind = 'upload'`) are members of this collection, and a `kind` filter
      // here would silently hide every photograph he attached himself.
      expect(where).not.toContain('"kind" =')
    }
    // The pager's two statements, in one round trip. The COUNT is recorded first (its function
    // call runs during the Promise.all array's evaluation, while the rows chain is a lazy
    // thenable), so the page of rows is at index 1 — the one that carries the pagination.
    expect(fake.sqlAt(1)).toContain('limit')
  })

  it('countNinaMediaPhotos — the tree badge counts the same set the page lists', async () => {
    fake.enqueue([[7]])
    await expect(queries.countNinaMediaPhotos('u1')).resolves.toBe(7)

    const where = whereOf(fake.only().sql)
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
    expect(where).not.toContain('"kind" =')
  })

  it('defaults and CEILINGS the page at NINA_CHAT_PHOTO_PAGE_SIZE, and floors the offset', async () => {
    // The cost argument travels with the number (`lib/nina/album.ts:80-105`: media tiles load
    // ORIGINALS), so a hand-edited limit must not be able to turn one page into the unpaginated
    // read the constant exists to prevent. Drizzle binds limit AND offset on the rows statement
    // (index 1 — the count is Q0, see above), so both bounds are visible in `params`.
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1', { limit: 10_000, offset: -5 })
    expect(fake.queries[1]?.params).toContain(NINA_CHAT_PHOTO_PAGE_SIZE)
    expect(fake.queries[1]?.params).not.toContain(10_000)
    // The negative offset was floored to 0, which drizzle omits entirely — it certainly cannot
    // have reached Postgres as a negative.
    expect(fake.sqlAt(1)).not.toContain('offset $')

    fake.reset()
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1', { offset: 96 })
    expect(fake.queries[1]?.params).toContain(96)
  })
})
