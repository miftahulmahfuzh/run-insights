import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **`/admin/memory`'s user picker, executing for the first time.**
 *
 * `listAdminUsers` is the package's ONE deliberately unscoped read, and its defence is
 * architectural rather than conditional: it lives in `lib/admin/` — behind the page's
 * `requireAdmin()` — precisely so that `lib/db/queries.ts`'s "first parameter is `userId`" guard
 * (`scripts/check-data-layer-invariants.mjs`) never needs a fifth exception. These tests pin the
 * two things that make that trade safe and correct:
 *
 *   - the counts are whole-table GROUPED SCANS merged in TypeScript, not correlated subqueries,
 *     and they are cast `::int` — without the cast the Neon driver hands back `bigint` strings
 *     and the page renders `"12"` where a number belongs (the file's own load-bearing remark);
 *   - `getAdminUser` answers a mistyped `?user=` with `null` after ONE read — "no such user" —
 *     and never runs the counts, because an empty ledger page for a nonexistent account is the
 *     wrong answer to the wrong question.
 */

const USER = 'abc123XYZ_-9'

let fake: FakeDb

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  await import('@/lib/db') // bind the fake before the module under test touches `db`
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** `{ id, name, email }` projection, in key order. */
function userRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : USER,
    'name' in overrides ? overrides.name : 'Miftah',
    'email' in overrides ? overrides.email : 'ops@example.com',
  )
}

describe('listAdminUsers', () => {
  it('merges slot and fact counts onto every account, and 0 where a user has none', async () => {
    fake.enqueue([userRow(), userRow({ id: 'otherUser12345', name: null, email: 'a@gmail.com' })])
    fake.enqueue([
      projectedRow(USER, 3), // { userId, n } — slots
    ])
    fake.enqueue([
      projectedRow('otherUser12345', 7), // facts live on the other account
    ])

    const rows = await (await import('@/lib/admin/users')).listAdminUsers()

    expect(rows).toEqual([
      { id: USER, name: 'Miftah', email: 'ops@example.com', slots: 3, facts: 0 },
      { id: 'otherUser12345', name: null, email: 'a@gmail.com', slots: 0, facts: 7 },
    ])
  })

  it('orders by email in SQL, so the picker is stable across requests', async () => {
    fake.enqueue([userRow()])
    fake.enqueue([])
    fake.enqueue([])

    await (await import('@/lib/admin/users')).listAdminUsers()

    expect(fake.queries[0]?.sql).toContain('order by')
    expect(fake.queries[0]?.sql).toContain('"user"."email" asc')
  })

  it('casts both counts ::int — the load-bearing guard against bigint strings', async () => {
    fake.enqueue([userRow()])
    fake.enqueue([])
    fake.enqueue([])

    await (await import('@/lib/admin/users')).listAdminUsers()

    const counts = fake.queries.slice(1)
    expect(counts).toHaveLength(2)
    for (const count of counts) {
      expect(count.sql).toContain('count(*)::int')
      expect(count.sql).toContain('group by')
    }
    expect(counts[0]?.sql).toContain('"nina_memory_slots"')
    expect(counts[1]?.sql).toContain('"nina_memory_facts"')
  })

  it('answers an empty accounts table with an empty picker and no errors', async () => {
    fake.enqueue([])
    fake.enqueue([])
    fake.enqueue([])

    expect(await (await import('@/lib/admin/users')).listAdminUsers()).toEqual([])
  })
})

describe('getAdminUser', () => {
  it('merges the two counts for a real account', async () => {
    fake.enqueue([userRow()])
    fake.enqueue([projectedRow(2)]) // { n } slots
    fake.enqueue([projectedRow(5)]) // { n } facts

    const row = await (await import('@/lib/admin/users')).getAdminUser(USER)

    expect(row).toEqual({
      id: USER,
      name: 'Miftah',
      email: 'ops@example.com',
      slots: 2,
      facts: 5,
    })
    for (const query of fake.queries) {
      expect(query.params).toContain(USER)
    }
  })

  it('answers a mistyped id with null after ONE read — never the counts', async () => {
    fake.enqueue([]) // the account read → null

    const row = await (await import('@/lib/admin/users')).getAdminUser('wrongUser1234')

    expect(row).toBeNull()
    expect(fake.queries).toHaveLength(1)
  })
})
