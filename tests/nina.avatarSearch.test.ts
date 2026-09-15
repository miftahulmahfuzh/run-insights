import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The album's semantic search, asserted against generated SQL rather than against a spy.
 *
 * Four properties, and every one of them is a thing a `vi.fn()` could not see:
 *
 *   1. Both statements of every search are ownership-scoped AND restricted to rows that HAVE an
 *      embedding — so the ranked page and the coverage total can never describe different sets.
 *   2. The ORDER BY is on the raw distance ascending. `1 - (...) DESC` is the same ordering and is
 *      the one spelling a pgvector HNSW index cannot answer, so the direction is pinned here.
 *   3. The combined read carries BOTH query vectors and the two weights in ONE statement — R4's
 *      whole claim. A merge in JS would pass a behaviour test and fail this one.
 *   4. The cap is the cap: an oversized `limit` comes back as 48 (`NINA_SEARCH_LIMIT`).
 */

type Queries = typeof import('@/lib/nina/queries')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const USER = 'usrAAAAAAAAA'

const TEXT_VECTOR = [0.1, 0.2, -0.3]
const CAPTION_VECTOR = [-0.4, 0.5, 0.6]

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

/** The candidate predicate, in both statements of every search. */
const SCOPED = ['"nina_avatars"."user_id" = $', '"description_embedding" is not null'] as const

describe('the candidate set is ownership-scoped and embedding-only', () => {
  it('holds for the ranked page and for the coverage count alike', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    expect(fake.queries).toHaveLength(2)
    for (const index of [0, 1]) {
      const statement = fake.sqlAt(index)
      for (const predicate of SCOPED) expect(statement, predicate).toContain(predicate)
    }
    expect(fake.sqlAt(1)).toContain('count(*)')
  })
})

describe('the ranking is index-shaped', () => {
  it('orders by the raw cosine distance ascending and projects the similarity', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    const ranked = fake.sqlAt(0)
    expect(ranked).toContain('<=>')
    expect(ranked).toContain('::vector')
    // The similarity is in the projection…
    expect(ranked).toContain('1 - (')
    // …and the ordering is on the distance, ascending, which is what an HNSW index can answer.
    expect(ranked).toMatch(/order by \([^)]*<=>[^)]*\) asc/)
    expect(ranked).not.toMatch(/order by[\s\S]*1 - /)
    // The album's own tiebreak rides behind it, so equal descriptions do not swap between renders.
    expect(ranked).toContain('"nina_avatars"."created_at" desc')
  })

  it('binds the query vector in pgvector text form', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    expect(fake.queries[0]?.params).toContain(JSON.stringify(TEXT_VECTOR))
  })

  it('caps the limit at 48 however much a caller asks for', async () => {
    // 48 is also the length of PhotoViewer's dot row once phase 4 opens the overlay over the
    // whole result set — see NINA_SEARCH_LIMIT's note. Raising it is a UI change, not a tuning.
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR, { limit: 5000 })

    expect(fake.queries[0]?.params).toContain(48)
  })
})

describe('image-caption search IS text search', () => {
  it('emits the identical statement for the identical vector', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)
    const byText = fake.sqlAt(0)

    fake.reset()
    await queries.searchNinaAvatarsByImageCaption(USER, TEXT_VECTOR)

    /* Not a redundant assertion: it is the plan index's Decision ("image-only = caption, then the
     * SAME text-embedding search") written as a test. A future edit that gives image search its own
     * column or its own operator has to change this line and say why. */
    expect(fake.sqlAt(0)).toBe(byText)
  })
})

describe('the combined search resolves both scores in one statement (R4)', () => {
  it('carries both vectors and both weights, and still orders ascending', async () => {
    await queries.searchNinaAvatarsByTextAndCaption(USER, TEXT_VECTOR, CAPTION_VECTOR)

    expect(fake.queries).toHaveLength(2)
    const ranked = fake.sqlAt(0)
    expect(ranked.match(/<=>/g)).toHaveLength(4) // two terms, in the projection and the ORDER BY
    expect(ranked).toContain('::float8')

    const params = fake.queries[0]?.params ?? []
    expect(params).toContain(JSON.stringify(TEXT_VECTOR))
    expect(params).toContain(JSON.stringify(CAPTION_VECTOR))
    /* Four bindings of the split: two weights, each bound once in the projection and once in the
     * ORDER BY. The literal is deliberate — `NINA_SEARCH_TEXT_WEIGHT` is module-private (the
     * barrel pins that every runtime export is a function), so changing the split is a two-line
     * change: the constant, and this line. That is the point of it being one named constant. */
    expect(params.filter((value) => value === 0.5)).toHaveLength(4)
  })
})

describe('the rows come back scored', () => {
  it('maps the projection and reports the candidate total', async () => {
    fake.enqueue(
      [
        projectedRow(
          'avtAAAAAAAAA', // id
          'https://blob/x.jpg', // blobUrl
          'nina/u/x.jpg', // pathname
          '2026/bali', // folder
          'x.jpg', // filename
          null, // thumbUrl
          null, // thumbPathname
          1024, // width
          768, // height
          200_000, // bytes
          'upload', // source
          null, // cropScale
          null, // cropX
          null, // cropY
          'she is on a beach', // description
          false, // isCurrent
          null, // announcedAt
          '2026-09-01 10:00:00+00', // createdAt
          0.82, // score
        ),
      ],
      [projectedRow(342)],
    )

    const page = await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    expect(page.total).toBe(342)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).toBe('avtAAAAAAAAA')
    expect(page.rows[0]?.score).toBeCloseTo(0.82)
  })
})

describe('a malformed query vector never reaches Postgres', () => {
  it('refuses an empty embedding', async () => {
    await expect(queries.searchNinaAvatarsByText(USER, [])).rejects.toThrow(/empty/)
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses a non-finite value, which JSON.stringify would have written as null', async () => {
    await expect(queries.searchNinaAvatarsByText(USER, [0.1, Number.NaN])).rejects.toThrow(
      /non-finite/,
    )
    expect(fake.queries).toHaveLength(0)
  })
})
