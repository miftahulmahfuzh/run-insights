import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The ALBUM arm of the merged search, asserted against generated SQL rather than against a spy.
 * The MEDIA arm and the merge itself are `tests/nina.mediaSearch.test.ts`'s job
 * (`media-album-unified-search` phase 2) — this file keeps every property it already proved about
 * the album's own ranking, at whatever index it now falls at, since every search runs FOUR
 * statements (album ranked + album count + media ranked + media count) instead of two.
 *
 * Four properties, and every one of them is a thing a `vi.fn()` could not see:
 *
 *   1. Both album statements are ownership-scoped, restricted to rows that HAVE an embedding, and
 *      restricted to rows that are NOT a pointer — so the ranked page and the coverage total can
 *      never describe different sets.
 *   2. The ORDER BY is on the raw distance ascending. `1 - (...) DESC` is the same ordering and is
 *      the one spelling a pgvector HNSW index cannot answer, so the direction is pinned here.
 *   3. The combined read carries BOTH query vectors and the two weights in ONE statement — R4's
 *      whole claim. A merge in JS would pass a behaviour test and fail this one.
 *   4. The cap is the cap: an oversized `limit` comes back as 48 (`NINA_SEARCH_LIMIT`), in BOTH
 *      arms.
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

/**
 * The statement containing every one of `substrings` — content-based, not index-based, because a
 * merged search now runs FOUR statements and which index the album arm lands at is an
 * implementation detail of `Promise.all` scheduling, not a contract.
 */
function findStatement(...substrings: string[]): string {
  const match = fake.queries.find((query) => substrings.every((s) => query.sql.includes(s)))
  if (match == null) {
    const dump = fake.queries.map((q, i) => `  [${i}] ${q.sql}`).join('\n')
    throw new Error(`no statement matching [${substrings.join(', ')}] among:\n${dump}`)
  }
  return match.sql
}

/** The ALBUM arm's ranked-page statement. */
function albumRanked(): string {
  return findStatement('"nina_avatars"', '<=>')
}

/** The ALBUM arm's coverage-count statement. */
function albumCount(): string {
  return findStatement('"nina_avatars"', 'count(*)')
}

/** The candidate predicate, in both statements of the album arm. */
const ALBUM_SCOPED = ['"nina_avatars"."user_id" = $', '"description_embedding" is not null'] as const

describe('the album candidate set is ownership-scoped, embedding-only, and pointer-free', () => {
  it('holds for the ranked page and for the coverage count alike', async () => {
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    /* Every merged search is FOUR statements now: album ranked, album count, media ranked, media
     * count — two of the four are `count(*)`. */
    expect(fake.queries).toHaveLength(4)
    expect(fake.queries.filter((q) => q.sql.includes('count(*)'))).toHaveLength(2)

    for (const statement of [albumRanked(), albumCount()]) {
      for (const predicate of ALBUM_SCOPED) expect(statement, predicate).toContain(predicate)
      /* The documented insurance predicate — a pointer row's own vector is already permanently
       * NULL, so this is technically redundant, but it is the one place the ranking STATES the
       * dedup invariant rather than relying on that NULL elsewhere to imply it. */
      expect(statement, 'the insurance predicate').toContain('"source_image_id" is null')
    }
  })
})

describe('the album ranking is index-shaped', () => {
  it('orders by the raw cosine distance ascending and projects the similarity', async () => {
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    const ranked = albumRanked()
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
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(fake.queries.some((q) => q.params.includes(JSON.stringify(TEXT_VECTOR)))).toBe(true)
  })

  it('caps the limit at 48 in BOTH arms however much a caller asks for', async () => {
    // 48 is also the length of PhotoViewer's dot row once phase 4 opens the overlay over the
    // whole result set — see NINA_SEARCH_LIMIT's note. Raising it is a UI change, not a tuning.
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR, null, { limit: 5000 })

    /* Both ranked statements bind the clamp; neither count statement takes a limit at all. */
    const boundIn48 = fake.queries.filter((q) => q.params.includes(48))
    expect(boundIn48).toHaveLength(2)
  })
})

describe('image-caption search IS text search', () => {
  it('emits the identical album statement for the identical vector', async () => {
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)
    const byText = albumRanked()

    fake.reset()
    await queries.searchNinaPhotosByImageCaption(USER, TEXT_VECTOR)

    /* Not a redundant assertion: it is the plan index's Decision ("image-only = caption, then the
     * SAME text-embedding search") written as a test. A future edit that gives image search its own
     * column or its own operator has to change this line and say why. */
    expect(albumRanked()).toBe(byText)
  })
})

describe('the combined search resolves both scores in one statement per arm (R4)', () => {
  it('carries both vectors and both weights in the album statement, and still orders ascending', async () => {
    await queries.searchNinaPhotosByTextAndCaption(USER, TEXT_VECTOR, CAPTION_VECTOR)

    expect(fake.queries).toHaveLength(4)
    const ranked = albumRanked()
    expect(ranked.match(/<=>/g)).toHaveLength(4) // two terms, in the projection and the ORDER BY
    expect(ranked).toContain('::float8')

    const params = fake.queries.flatMap((q) => q.params)
    expect(params).toContain(JSON.stringify(TEXT_VECTOR))
    expect(params).toContain(JSON.stringify(CAPTION_VECTOR))
    /* Eight bindings of the 0.5/0.5 split across BOTH arms: each arm's weighted expression binds
     * the split twice (projection, ORDER BY) and each binding carries two literals (one per term),
     * for four per arm and eight total. The literal is deliberate — `NINA_SEARCH_TEXT_WEIGHT` is
     * module-private (the barrel pins that every runtime export is a function), so changing the
     * split is a two-line change: the constant, and this line. */
    expect(params.filter((value) => value === 0.5)).toHaveLength(8)
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
          null, // searchKeywords
          null, // negativeSearchKeywords
          false, // isCurrent
          null, // announcedAt
          '2026-09-01 10:00:00+00', // createdAt
          null, // sourceImageId
          0.82, // score
        ),
      ],
      [projectedRow(342)],
    )

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(page.total).toBe(342)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).toBe('avtAAAAAAAAA')
    expect(page.rows[0]?.origin).toBe('album')
    expect(page.rows[0]?.score).toBeCloseTo(0.82)
  })
})

describe('the relevance threshold cuts the ranked tail', () => {
  it('keeps only rows scoring at or above the floor, while the total stays the candidate count', async () => {
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
          null, // searchKeywords
          null, // negativeSearchKeywords
          false, // isCurrent
          null, // announcedAt
          '2026-09-01 10:00:00+00', // createdAt
          null, // sourceImageId
          0.82, // score
        ),
        projectedRow(
          'avtBBBBBBBBBB', // id
          'https://blob/y.jpg', // blobUrl
          'nina/u/y.jpg', // pathname
          '2026/bali', // folder
          'y.jpg', // filename
          null, // thumbUrl
          null, // thumbPathname
          1024, // width
          768, // height
          200_000, // bytes
          'upload', // source
          null, // cropScale
          null, // cropX
          null, // cropY
          'she is in a pool', // description
          null, // searchKeywords
          null, // negativeSearchKeywords
          false, // isCurrent
          null, // announcedAt
          '2026-09-02 10:00:00+00', // createdAt
          null, // sourceImageId
          0.11, // score
        ),
      ],
      [projectedRow(2)],
    )

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    /* `searched` is about the CANDIDATE SET that was ranked — the threshold narrows the page,
     * not the coverage story. */
    expect(page.total).toBe(2)
    /* 0.82 and 0.11 straddle any value the threshold constant will plausibly hold (the probe's
     * relevant scores start near 0.21, its noise tail ends near 0.18), so the assertion survives
     * retuning — and a threshold moved past either fixture breaks this test on purpose, forcing
     * the fixtures to be re-read against the new value. */
    expect(page.rows.map((row) => row.id)).toEqual(['avtAAAAAAAAA'])
  })
})

describe('negative keywords exclude a row from the query that names them', () => {
  const rowWithNegativeKeywords = (negativeSearchKeywords: string | null, score = 0.82) =>
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
      'she is on a horse', // description
      null, // searchKeywords
      negativeSearchKeywords,
      false, // isCurrent
      null, // announcedAt
      '2026-09-01 10:00:00+00', // createdAt
      null, // sourceImageId
      score,
    )

  it('drops a row whose negative keyword is a whole word in the typed query', async () => {
    fake.enqueue([rowWithNegativeKeywords('tete')], [projectedRow(1)])

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR, 'tete gede nina')

    expect(page.rows).toHaveLength(0)
    /* `total` is the candidate count, untouched by either filter — the same rule the relevance
     * floor already follows. */
    expect(page.total).toBe(1)
  })

  it('keeps a row when the negative keyword is only a SUBSTRING of a query word', async () => {
    fake.enqueue([rowWithNegativeKeywords('tete')], [projectedRow(1)])

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR, 'tetesan air')

    expect(page.rows.map((row) => row.id)).toEqual(['avtAAAAAAAAA'])
  })

  it('matches case-insensitively and honours a comma-separated list', async () => {
    fake.enqueue([rowWithNegativeKeywords('Tete, payudara')], [projectedRow(1)])

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR, 'PAYUDARA besar')

    expect(page.rows).toHaveLength(0)
  })

  it('does not exclude anything when no query text is given (no caller passes one today)', async () => {
    fake.enqueue([rowWithNegativeKeywords('tete')], [projectedRow(1)])

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(page.rows.map((row) => row.id)).toEqual(['avtAAAAAAAAA'])
  })

  it('never applies to image-caption search — a caption is not something the operator typed', async () => {
    fake.enqueue([rowWithNegativeKeywords('tete')], [projectedRow(1)])

    /* The caption happens to contain the exact word "tete" — the vision model's own words — and
     * it must not be checked against the row's negative keywords: R2's whole point is excluding a
     * TYPED query, and there is no typed query on this arm. */
    const page = await queries.searchNinaPhotosByImageCaption(USER, TEXT_VECTOR)

    expect(page.rows.map((row) => row.id)).toEqual(['avtAAAAAAAAA'])
  })

  it('applies to the combined search, checked against the TYPED half only', async () => {
    fake.enqueue([rowWithNegativeKeywords('tete')], [projectedRow(1)])

    const page = await queries.searchNinaPhotosByTextAndCaption(
      USER,
      TEXT_VECTOR,
      CAPTION_VECTOR,
      'tete',
    )

    expect(page.rows).toHaveLength(0)
  })
})

describe('a malformed query vector never reaches Postgres', () => {
  it('refuses an empty embedding', async () => {
    await expect(queries.searchNinaPhotosByText(USER, [])).rejects.toThrow(/empty/)
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses a non-finite value, which JSON.stringify would have written as null', async () => {
    await expect(queries.searchNinaPhotosByText(USER, [0.1, Number.NaN])).rejects.toThrow(
      /non-finite/,
    )
    expect(fake.queries).toHaveLength(0)
  })
})
