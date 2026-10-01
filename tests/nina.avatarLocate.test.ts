import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `locateNinaAvatar` — the read behind `/admin/nina?avatar=<id>`. Asserted against generated SQL
 * rather than behaviour, and this suite exists because the behavioural version of it was never
 * enough: P2-NIN-A003 shipped an always-zero offset for the whole life of the feature and nothing
 * went red.
 *
 * **The fake driver returns what it is handed and filters nothing.** So a correlated subquery whose
 * correlation has silently become a tautology returns whatever row count the test enqueued, and a
 * behavioural assertion on that number passes over broken and fixed code alike. The only witness is
 * the generated SQL text. `tests/nina.mediaLocate.test.ts` pins the twin read for the same reason.
 *
 * What was wrong, and what these cases therefore pin: drizzle strips the table prefix from a bare
 * `Column` rendered in the fields of a single-table `select()`. That is right for an ordinary
 * projection and WRONG inside a correlated subquery holding its own alias — `${ninaAvatars.userId}`
 * rendered as `"user_id"`, which Postgres bound to the innermost range table (`earlier`) instead of
 * the outer row. Every arm became `earlier.x = earlier.x` and the tuple comparison became
 * `(x, y) > (x, y)`, so `count(*)` was 0 for every row and `?avatar=` always landed on page 1 —
 * invisible whenever a folder fits on one page. The fix is `outerRef()`; these cases pin the
 * qualified spelling it produces, on BOTH sides of every comparison.
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

describe('locateNinaAvatar — the album deep link', () => {
  it('returns the row’s folder and its 0-based offset within that folder', async () => {
    fake.enqueue([projectedRow('a1', 'bali', 7)])

    const found = await queries.locateNinaAvatar('u1', 'a1')

    expect(found).toEqual({ id: 'a1', folder: 'bali', offset: 7 })
    expect(fake.queries).toHaveLength(1)
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['u1', 'a1']))
  })

  it('counts within the SAME user and folder — the outer references stay table-qualified', async () => {
    fake.enqueue([projectedRow('a1', 'bali', 0)])
    await queries.locateNinaAvatar('u1', 'a1')
    const locate = flat(fake.sqlAt(0))

    // The OUTER predicate: this row, this user.
    expect(locate).toContain('"nina_avatars"."user_id" = $')
    expect(locate).toContain('"nina_avatars"."id" = $')

    // The correlation. `earlier.x` is hand-spelled (a drizzle predicate cannot be re-pointed at an
    // alias); the right-hand side MUST carry the table name or it binds to `earlier` itself.
    expect(locate).toContain('earlier.user_id = "nina_avatars"."user_id"')
    expect(locate).toContain('earlier.folder = "nina_avatars"."folder"')
  })

  it('compares the FULL sort key listNinaAvatarsInFolder orders by — created_at then id', async () => {
    fake.enqueue([[]], [[0]])
    await queries.listNinaAvatarsInFolder('u1', 'bali')
    const listing = flat(fake.sqlAt(0))

    fake.reset()
    fake.enqueue([projectedRow('a1', 'bali', 0)])
    await queries.locateNinaAvatar('u1', 'a1')
    const locate = flat(fake.sqlAt(0))

    // The listing's order is the offset's definition; if they disagree the offset names a page the
    // photograph is not on.
    expect(listing).toContain('"nina_avatars"."created_at" desc')
    expect(listing).toContain('"nina_avatars"."id" desc')

    // The whole comparison in one assertion: the `>`, the operand ORDER, and the qualification on
    // BOTH sides. Whitespace-tolerant because the source spells the tuple across lines; everything
    // that can actually be wrong is pinned.
    expect(locate).toMatch(
      /\(\s*earlier\.created_at,\s*earlier\.id\s*\)\s*>\s*\(\s*"nina_avatars"\."created_at",\s*"nina_avatars"\."id"\s*\)/,
    )
  })

  it('P2-NIN-A003 regression: NO outer reference renders unqualified', async () => {
    // The whole defect in one assertion. Broken, the correlation read
    // `earlier.user_id = "user_id"` — a bare quoted column name with no table prefix, which binds
    // to `earlier` and makes the arm a tautology. If any of these four reappear, the offset is
    // silently 0 again and every deep link lands on page 1.
    fake.enqueue([projectedRow('a1', 'bali', 0)])
    await queries.locateNinaAvatar('u1', 'a1')
    const locate = flat(fake.sqlAt(0))

    expect(locate).not.toContain('= "user_id"')
    expect(locate).not.toContain('= "folder"')
    expect(locate).not.toContain('("created_at", "id")')
    expect(locate).not.toContain('"created_at", "id")')
  })

  it('answers null for a row that is not this user’s', async () => {
    fake.enqueue([])

    expect(await queries.locateNinaAvatar('u1', 'someone-else')).toBeNull()
    expect(fake.queries).toHaveLength(1)
  })
})
