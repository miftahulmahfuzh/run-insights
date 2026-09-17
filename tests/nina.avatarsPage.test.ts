import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NINA_ABOUT_PAGE_SIZE } from '@/lib/nina/album'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `listNinaAvatarsPage` — `/nina/about`'s Foto profil tab, real `?page=` windows over the WHOLE
 * album rather than the render-cap `listNinaAvatars` + `albumPhotos` used to be. Asserted against
 * generated SQL (`tests/nina.photoRefs.test.ts`'s pattern for this same fake driver): a clamp bug
 * is invisible to a `vi.fn()` spy but not to the bound Postgres actually receives.
 */

type Queries = typeof import('@/lib/nina/queries')

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

function whereOf(sql: string): string {
  const at = sql.indexOf(' where ')
  if (at < 0) throw new Error(`no WHERE clause in: ${sql}`)
  return sql.slice(at)
}

describe('listNinaAvatarsPage — the whole album, paged (no folder scope)', () => {
  it('scopes by user_id alone, newest first, and runs the count alongside it', async () => {
    // The pager's two statements, in one round trip. `countNinaAvatars`'s own `await` runs
    // during the Promise.all array's evaluation, while the rows chain is a lazy thenable — so
    // the count lands at index 0 and the page of rows at index 1 (`listNinaMediaPhotos`'s tests
    // record the identical ordering for the identical shape).
    fake.enqueue([[3]], [])
    await queries.listNinaAvatarsPage('u1')

    expect(fake.queries).toHaveLength(2)
    const rows = fake.sqlAt(1)
    expect(whereOf(rows)).toContain('"user_id" = $')
    expect(whereOf(rows)).not.toContain('"folder"')
    expect(rows).toContain('order by "nina_avatars"."created_at" desc, "nina_avatars"."id" desc')
    expect(rows).toContain('limit')
  })

  it('defaults and CEILINGS the page at NINA_ABOUT_PAGE_SIZE, and floors the offset', async () => {
    fake.enqueue([[0]], [])
    await queries.listNinaAvatarsPage('u1', { limit: 10_000, offset: -5 })
    expect(fake.queries[1]?.params).toContain(NINA_ABOUT_PAGE_SIZE)
    expect(fake.queries[1]?.params).not.toContain(10_000)
    expect(fake.sqlAt(1)).not.toContain('offset $')

    fake.reset()
    fake.enqueue([[0]], [])
    await queries.listNinaAvatarsPage('u1', { offset: 60 })
    expect(fake.queries[1]?.params).toContain(60)
  })

  it('a truthful total on an over-shot page — not the empty-collection zero', async () => {
    fake.enqueue([[42]], [])
    const page = await queries.listNinaAvatarsPage('u1', { offset: 9999 })
    expect(page.rows).toEqual([])
    expect(page.total).toBe(42)
  })
})
