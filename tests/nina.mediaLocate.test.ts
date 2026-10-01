import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `locateNinaMediaPhoto` — the read behind `/admin/nina?view=media&image=<id>` (copy-admin-media-link
 * R2). Asserted against generated SQL rather than behaviour, for `tests/nina.avatarsPage.test.ts`'s
 * reason: the fake driver returns what it is handed and filters nothing, so a wrong PREDICATE or a
 * wrong SORT KEY produces a perfectly green behavioural test and a wrong page in production.
 *
 * The two things that can be subtly wrong, and are therefore pinned here:
 *   · the offset must count over `mediaCollectionScope` — `user_id` AND `isOriginalPhoto()`'s two
 *     null checks — not over the whole table;
 *   · the offset must compare the FULL sort key `listNinaMediaPhotos` reads with,
 *     `coalesce(last_replaced_at, created_at)` then `id`. A photograph someone already replaced is
 *     exactly the row whose position moved, and exactly the row this feature exists to reach.
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

/** Generated SQL is pretty-printed across lines; the clause is what matters, not the whitespace. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, ' ')
}

describe('locateNinaMediaPhoto — the Media collection deep link', () => {
  it('resolves an ORIGINAL to itself and returns its 0-based offset', async () => {
    fake.enqueue([projectedRow('img1', null)], [projectedRow('img1', 7)])

    const found = await queries.locateNinaMediaPhoto('u1', 'img1')

    expect(found).toEqual({ id: 'img1', offset: 7 })
    expect(fake.queries).toHaveLength(2)
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['u1', 'img1']))
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['u1', 'img1']))
  })

  it('resolves a RE-SHARE through source_image_id and locates the original instead', async () => {
    // F37: a re-show is a second row naming the first, and `isOriginalPhoto()` keeps it out of the
    // collection — so it has no tile. The original is the row a Replace would rewrite.
    fake.enqueue([projectedRow('reshare1', 'orig1')], [projectedRow('orig1', 3)])

    const found = await queries.locateNinaMediaPhoto('u1', 'reshare1')

    expect(found).toEqual({ id: 'orig1', offset: 3 })
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['reshare1']))
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['orig1']))
    expect(fake.queries[1]?.params).not.toEqual(expect.arrayContaining(['reshare1']))
  })

  it('counts over mediaCollectionScope — user_id AND isOriginalPhoto’s two null checks', async () => {
    fake.enqueue([projectedRow('img1', null)], [projectedRow('img1', 0)])
    await queries.locateNinaMediaPhoto('u1', 'img1')
    const locate = flat(fake.sqlAt(1))

    // The OUTER predicate is `mediaCollectionScope(userId)`, called rather than restated.
    expect(locate).toContain('"nina_message_images"."user_id" = $')
    expect(locate).toContain('"nina_message_images"."source_avatar_id" is null')
    expect(locate).toContain('"nina_message_images"."source_image_id" is null')

    // The correlated count carries the same three arms on the alias. These are hand-spelled in the
    // query (a drizzle predicate cannot be re-pointed at an alias), which is why they are pinned.
    expect(locate).toContain('earlier.user_id = "nina_message_images"."user_id"')
    expect(locate).toContain('earlier.source_avatar_id is null')
    expect(locate).toContain('earlier.source_image_id is null')
  })

  it('compares the FULL sort key listNinaMediaPhotos orders by — coalesce first, then id', async () => {
    fake.enqueue([[3]], [])
    await queries.listNinaMediaPhotos('u1')
    // `listNinaMediaPhotos` runs its count and its page in one `Promise.all`; the count lands at
    // index 0 and the rows at index 1 (`tests/nina.avatarsPage.test.ts` records the same ordering).
    const listing = flat(fake.sqlAt(1))

    fake.reset()
    fake.enqueue([projectedRow('img1', null)], [projectedRow('img1', 0)])
    await queries.locateNinaMediaPhoto('u1', 'img1')
    const locate = flat(fake.sqlAt(1))

    expect(listing).toContain(
      'coalesce("nina_message_images"."last_replaced_at", "nina_message_images"."created_at") desc',
    )
    expect(listing).toContain('"nina_message_images"."id" desc')

    // Both sides of the tuple comparison, so neither half can quietly become `created_at` alone.
    expect(locate).toContain('coalesce(earlier.last_replaced_at, earlier.created_at)')
    expect(locate).toContain(
      'coalesce("nina_message_images"."last_replaced_at", "nina_message_images"."created_at")',
    )
    expect(locate).toContain('earlier.id')
  })

  it('answers null for a row that is not this user’s, without a second statement', async () => {
    fake.enqueue([])

    expect(await queries.locateNinaMediaPhoto('u1', 'someone-else')).toBeNull()
    expect(fake.queries).toHaveLength(1)
  })

  it('answers null when a re-share’s original is gone', async () => {
    fake.enqueue([projectedRow('reshare1', 'orig1')], [])

    expect(await queries.locateNinaMediaPhoto('u1', 'reshare1')).toBeNull()
    expect(fake.queries).toHaveLength(2)
  })

  it('answers null for a re-show of an ALBUM avatar — no tile, and no media original either', async () => {
    // `source_avatar_id` set, `source_image_id` null: the resolution falls back to the row's own id
    // and `mediaCollectionScope` excludes it, so the second statement matches nothing.
    fake.enqueue([projectedRow('reshow1', null)], [])

    expect(await queries.locateNinaMediaPhoto('u1', 'reshow1')).toBeNull()
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['reshow1']))
  })
})
