import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The MEDIA arm of the merged search, and the merge itself — `media-album-unified-search` phase 2,
 * R1/R2/R3. The album arm's own properties are `tests/nina.avatarSearch.test.ts`'s; this file
 * proves the second arm and the JS-side merge that combines the two.
 */

type Queries = typeof import('@/lib/nina/queries')

const USER = 'usrAAAAAAAAA'
const TEXT_VECTOR = [0.1, 0.2, -0.3]

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

function findStatement(...substrings: string[]): string {
  const match = fake.queries.find((query) => substrings.every((s) => query.sql.includes(s)))
  if (match == null) {
    const dump = fake.queries.map((q, i) => `  [${i}] ${q.sql}`).join('\n')
    throw new Error(`no statement matching [${substrings.join(', ')}] among:\n${dump}`)
  }
  return match.sql
}

function mediaRanked(): string {
  return findStatement('"nina_message_images"', '<=>')
}

function mediaCount(): string {
  return findStatement('"nina_message_images"', 'count(*)')
}

/** An empty album arm — no rows, no candidates — so a test can enqueue only the media side. */
const NO_ALBUM_ROWS: [unknown[], unknown[]] = [[], [projectedRow(0)]]

/** A media row in `mediaSearchColumns` + `score` order. */
function mediaRow(opts: {
  id: string
  description?: string | null
  searchKeywords?: string | null
  negativeSearchKeywords?: string | null
  createdAt?: string
  score: number
}) {
  return projectedRow(
    opts.id, // id
    `https://blob/${opts.id}.jpg`, // blobUrl
    'upload', // kind
    1024, // width
    768, // height
    200_000, // bytes
    opts.description ?? 'a photo he sent', // description
    opts.searchKeywords ?? null, // searchKeywords
    opts.negativeSearchKeywords ?? null, // negativeSearchKeywords
    opts.createdAt ?? '2026-09-01 10:00:00+00', // createdAt
    opts.score, // score
  )
}

/** An album row in `avatarColumns` + `score` order (album table's own 22-value projection). */
function albumRow(opts: { id: string; createdAt?: string; score: number }) {
  return projectedRow(
    opts.id, // id
    `https://blob/${opts.id}.jpg`, // blobUrl
    `nina/u/${opts.id}.jpg`, // pathname
    '', // folder
    null, // filename
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
    opts.createdAt ?? '2026-09-01 10:00:00+00', // createdAt
    null, // sourceImageId
    opts.score, // score
  )
}

const MEDIA_SCOPED = [
  '"nina_message_images"."user_id" = $',
  '"description_embedding" is not null',
  '"source_avatar_id" is null',
  '"source_image_id" is null',
  'not exists',
] as const

describe('the media candidate set is ownership-scoped, embedding-only, an original, and unsuperseded', () => {
  it('holds for the ranked page and for the coverage count alike', async () => {
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    for (const statement of [mediaRanked(), mediaCount()]) {
      for (const predicate of MEDIA_SCOPED) expect(statement, predicate).toContain(predicate)
    }
  })

  it('qualifies the NOT EXISTS with source_image_id is null, so a LINK does not hide its Media row', async () => {
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    const ranked = mediaRanked()
    /* Without this qualifier a freshly-promoted photograph (a POINTER, which also carries
     * `source_key = 'chat-photo:<id>'`) would hide its own Media row — the one half of the pair
     * that is actually ranked, since the pointer's own vector is permanently NULL. Only a LEGACY
     * COPY (an ordinary album row with its own embedding) may hide the Media original. */
    expect(ranked).toContain("'chat-photo:'")
    expect(ranked).toMatch(/'chat-photo:'[\s\S]*source_image_id[\s\S]*is null/)
  })
})

describe('the media ranking is index-shaped', () => {
  it('orders by the raw cosine distance ascending, then created_at descending', async () => {
    await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    const ranked = mediaRanked()
    expect(ranked).toMatch(/order by \([^)]*<=>[^)]*\) asc/)
    expect(ranked).toContain('"nina_message_images"."created_at" desc')
  })
})

describe('total is the sum of both candidate counts', () => {
  it('adds the album count and the media count', async () => {
    fake.enqueue([], [projectedRow(7)], [], [projectedRow(5)])

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(page.total).toBe(12)
  })
})

describe('the merge orders by score across BOTH origins', () => {
  it('interleaves album and media hits by score, descending', async () => {
    fake.enqueue(
      [albumRow({ id: 'alb1', score: 0.5 })],
      [projectedRow(1)],
      [mediaRow({ id: 'med1', score: 0.9 }), mediaRow({ id: 'med2', score: 0.3 })],
      [projectedRow(2)],
    )

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(page.rows.map((row) => row.origin)).toEqual(['media', 'album', 'media'])
    expect(page.rows.map((row) => row.id)).toEqual(['med1', 'alb1', 'med2'])
  })

  it('breaks an exact score tie by created_at desc, then id desc — never by origin', async () => {
    fake.enqueue(
      [albumRow({ id: 'albTIE', createdAt: '2026-09-01 10:00:00+00', score: 0.5 })],
      [projectedRow(1)],
      [mediaRow({ id: 'medTIE', createdAt: '2026-09-01 10:00:00+00', score: 0.5 })],
      [projectedRow(1)],
    )

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    /* Same score, same createdAt — `id desc` is the final decider. 'medTIE' > 'albTIE'
     * lexicographically, so it wins, and it wins for that reason and not because it is a media
     * hit. */
    expect(page.rows.map((row) => row.id)).toEqual(['medTIE', 'albTIE'])
  })

  it('cuts a 0.19 media row exactly as it cuts a 0.19 album row', async () => {
    fake.enqueue(
      [],
      [projectedRow(0)],
      [mediaRow({ id: 'medLOW', score: 0.19 })],
      [projectedRow(1)],
    )

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(page.rows).toHaveLength(0)
    // `total` stays the candidate count, untouched by the floor.
    expect(page.total).toBe(1)
  })
})

describe('a media row’s negative keywords exclude it from a typed query', () => {
  it('drops the row when the query names its negative keyword', async () => {
    fake.enqueue(
      NO_ALBUM_ROWS[0],
      NO_ALBUM_ROWS[1],
      [mediaRow({ id: 'medNEG', negativeSearchKeywords: 'tete', score: 0.82 })],
      [projectedRow(1)],
    )

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR, 'tete gede nina')

    expect(page.rows).toHaveLength(0)
  })

  it('is ignored on the image-only arm — a caption is not something the operator typed', async () => {
    fake.enqueue(
      NO_ALBUM_ROWS[0],
      NO_ALBUM_ROWS[1],
      [mediaRow({ id: 'medNEG', negativeSearchKeywords: 'tete', score: 0.82 })],
      [projectedRow(1)],
    )

    const page = await queries.searchNinaPhotosByImageCaption(USER, TEXT_VECTOR)

    expect(page.rows.map((row) => row.id)).toEqual(['medNEG'])
  })
})

describe('the merged page is clamped to 48 AFTER the merge', () => {
  it('keeps 48 of 96 above-floor rows, both origins represented', async () => {
    const albumRows = Array.from({ length: 48 }, (_, i) =>
      albumRow({ id: `alb${String(i).padStart(2, '0')}`, score: 0.9 - i * 0.001 }),
    )
    const mediaRows = Array.from({ length: 48 }, (_, i) =>
      mediaRow({ id: `med${String(i).padStart(2, '0')}`, score: 0.89 - i * 0.001 }),
    )

    fake.enqueue(albumRows, [projectedRow(48)], mediaRows, [projectedRow(48)])

    const page = await queries.searchNinaPhotosByText(USER, TEXT_VECTOR)

    expect(page.rows).toHaveLength(48)
    const origins = new Set(page.rows.map((row) => row.origin))
    expect(origins.has('album')).toBe(true)
    expect(origins.has('media')).toBe(true)
    expect(page.total).toBe(96)
  })
})
