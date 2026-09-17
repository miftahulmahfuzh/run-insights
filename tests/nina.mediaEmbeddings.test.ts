import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `lib/nina/queries/imageEmbeddings.ts` and `lib/nina/queries/avatarPointer.ts`, asserted against
 * generated SQL. `media-album-unified-search` phase 2, R1/R2/R3.
 *
 * Two properties carry the whole file:
 *   1. Every one of the six `imageEmbeddings.ts` statements is ownership-scoped AND restricted to
 *      an ORIGINAL row (`isOriginalPhoto()`) — a re-share must never earn a vector or a rewrite of
 *      its own.
 *   2. The two `…AndEmbedding` writers each touch exactly two columns, and never the other's —
 *      the structural guarantee that keeps `search_keywords` out of reach of a re-describe.
 */

type Queries = typeof import('@/lib/nina/queries')

const USER = 'usrAAAAAAAAA'
const IMAGE = 'imgAAAAAAAAA'

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

/** Both provenance columns NULL — "not a re-share". */
const ORIGINAL_ONLY = ['"source_avatar_id" is null', '"source_image_id" is null'] as const

/** The WHERE clause alone, so a projection-only match (every column named in a SELECT list) does
 *  not falsely pass. Mirrors `tests/nina.photoRefs.test.ts`'s `whereOf`. */
function whereOf(sql: string): string {
  const at = sql.indexOf(' where ')
  return at === -1 ? '' : sql.slice(at)
}

describe('every imageEmbeddings.ts statement is ownership-scoped and originals-only', () => {
  it('listNinaMessageImageDescribeTargets', async () => {
    await queries.listNinaMessageImageDescribeTargets(USER, [IMAGE])
    const where = whereOf(fake.only().sql)
    expect(where).toContain('"user_id" = $')
    for (const predicate of ORIGINAL_ONLY) expect(where).toContain(predicate)
  })

  it('listNinaMessageImageDescribeBacklog', async () => {
    await queries.listNinaMessageImageDescribeBacklog(USER, 200)
    const where = whereOf(fake.only().sql)
    expect(where).toContain('"user_id" = $')
    for (const predicate of ORIGINAL_ONLY) expect(where).toContain(predicate)
  })

  it('countNinaMessageImageDescribeBacklog', async () => {
    await queries.countNinaMessageImageDescribeBacklog(USER)
    const where = whereOf(fake.only().sql)
    expect(where).toContain('"user_id" = $')
    for (const predicate of ORIGINAL_ONLY) expect(where).toContain(predicate)
  })

  it('setNinaMessageImageDescriptionAndEmbedding', async () => {
    await queries.setNinaMessageImageDescriptionAndEmbedding(USER, IMAGE, 'she is on a trail', null)
    const where = whereOf(fake.only().sql)
    expect(where).toContain('"user_id" = $')
    for (const predicate of ORIGINAL_ONLY) expect(where).toContain(predicate)
  })

  it('setNinaMessageImageSearchKeywordsAndEmbedding', async () => {
    await queries.setNinaMessageImageSearchKeywordsAndEmbedding(USER, IMAGE, 'tete, putih', null)
    const where = whereOf(fake.only().sql)
    expect(where).toContain('"user_id" = $')
    for (const predicate of ORIGINAL_ONLY) expect(where).toContain(predicate)
  })

  it('setNinaMessageImageNegativeSearchKeywords', async () => {
    await queries.setNinaMessageImageNegativeSearchKeywords(USER, IMAGE, 'tete')
    const where = whereOf(fake.only().sql)
    expect(where).toContain('"user_id" = $')
    for (const predicate of ORIGINAL_ONLY) expect(where).toContain(predicate)
  })
})

describe('the two …AndEmbedding writers each touch exactly two columns', () => {
  it('setNinaMessageImageDescriptionAndEmbedding sets description and description_embedding, never search_keywords', async () => {
    await queries.setNinaMessageImageDescriptionAndEmbedding(USER, IMAGE, 'she is on a trail', null)
    const sql = fake.only().sql
    const setClause = sql.slice(sql.indexOf(' set '), sql.indexOf(' where '))
    expect(setClause).toContain('"description"')
    expect(setClause).toContain('"description_embedding"')
    expect(setClause).not.toContain('"search_keywords"')
  })

  it('setNinaMessageImageSearchKeywordsAndEmbedding sets search_keywords and description_embedding, never description', async () => {
    await queries.setNinaMessageImageSearchKeywordsAndEmbedding(USER, IMAGE, 'tete, putih', null)
    const sql = fake.only().sql
    const setClause = sql.slice(sql.indexOf(' set '), sql.indexOf(' where '))
    expect(setClause).toContain('"search_keywords"')
    expect(setClause).toContain('"description_embedding"')
    expect(setClause).not.toContain('"description"')
  })

  it('setNinaMessageImageNegativeSearchKeywords never mentions description_embedding', async () => {
    await queries.setNinaMessageImageNegativeSearchKeywords(USER, IMAGE, 'tete')
    const sql = fake.only().sql
    const setClause = sql.slice(sql.indexOf(' set '), sql.indexOf(' where '))
    expect(setClause).toContain('"negative_search_keywords"')
    expect(setClause).not.toContain('"description_embedding"')
  })
})

describe('listNinaMessageImageDescribeTargets is empty-safe', () => {
  it('runs zero statements for an empty id list', async () => {
    const targets = await queries.listNinaMessageImageDescribeTargets(USER, [])
    expect(targets).toEqual([])
    expect(fake.queries).toHaveLength(0)
  })
})

describe('resolveNinaAvatarLinkedText', () => {
  it('runs zero statements when no row is a pointer', async () => {
    const linked = await queries.resolveNinaAvatarLinkedText(USER, [
      { id: 'avtAAAAAAAAA', sourceImageId: null },
    ])
    expect(linked.size).toBe(0)
    expect(fake.queries).toHaveLength(0)
  })

  it('binds a de-duplicated IN list and keys its Map by the AVATAR id', async () => {
    fake.enqueue([
      projectedRow(IMAGE, 'her description', 'tete', null),
    ])

    const linked = await queries.resolveNinaAvatarLinkedText(USER, [
      { id: 'avtAAAAAAAAA', sourceImageId: IMAGE },
      { id: 'avtBBBBBBBBBB', sourceImageId: IMAGE },
    ])

    /* One statement, and the bound IN list is de-duplicated: two pointers name the same image. */
    expect(fake.queries).toHaveLength(1)
    const params = fake.only().params
    expect(params.filter((value) => value === IMAGE)).toHaveLength(1)

    /* Keyed by the AVATAR id, not the image id — both pointers resolve, independently. */
    expect(linked.get('avtAAAAAAAAA')).toEqual({
      description: 'her description',
      searchKeywords: 'tete',
      negativeSearchKeywords: null,
    })
    expect(linked.get('avtBBBBBBBBBB')).toEqual({
      description: 'her description',
      searchKeywords: 'tete',
      negativeSearchKeywords: null,
    })
  })
})
