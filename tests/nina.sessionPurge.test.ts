import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **R8's exit test.** The runner's words were *"make sure deleted chat sessions are deleted
 * permanently from the db … the deleted sessions polluted nina character and it gets worse as time
 * goes on"*, and the subtlety is that the session delete was ALREADY a hard delete: what survived
 * was the distilled memory ledger, which `loadNinaContext` reads globally on every turn.
 *
 * So the property under test is not "a DELETE was issued". It is:
 *
 *   1. the purge and the delete are ONE transaction (`db.batch` — `db.transaction()` throws on the
 *      neon-http driver), so neither can land without the other;
 *   2. the session DELETE is LAST, because the three purges join against messages that the cascade
 *      is about to destroy — get this order wrong and the purge silently matches nothing, which is
 *      exactly the failure that ships green;
 *   3. every statement carries `user_id`, including both subqueries (plan invariant 5);
 *   4. `pending_promises` is pruned per ENTRY, never dropped as a row.
 *
 * Asserted against generated SQL rather than against a spy, because a spy cannot tell (2) from a
 * batch in the wrong order.
 */

type Queries = typeof import('@/lib/nina/queries')

let fake: FakeDb
let q: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  q = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** The four statements, in the order `db.batch` sent them. */
async function purge(userId = 'u1', sessionId = 'sessionAAAAA') {
  /* Four results for four statements; only the last is read. */
  fake.enqueue([], [], [], [['sessionAAAAA']])
  const removed = await q.removeNinaSession(userId, sessionId)
  return { removed, sql: fake.queries.map((query) => query.sql) }
}

describe('removeNinaSession — one transaction, four statements, session last', () => {
  it('sends all four statements as a single db.batch', async () => {
    const { sql } = await purge()
    expect(sql).toHaveLength(4)
    expect(fake.batches).toEqual([4])
    expect(fake.queries.every((query) => query.batched)).toBe(true)
  })

  it('deletes the session LAST, after the three purges have joined against its messages', async () => {
    const { sql } = await purge()
    expect(sql[0]).toMatch(/^delete from "nina_memory_facts"/)
    expect(sql[1]).toMatch(/^delete from "nina_memory_slots"/)
    expect(sql[2]).toMatch(/^update "nina_memory_slots"/)
    expect(sql[3]).toMatch(/^delete from "nina_chat_sessions"/)
  })

  it('still reports ownership from the session DELETE alone', async () => {
    const { removed } = await purge()
    expect(removed).toBe(true)

    fake.reset()
    fake.enqueue([], [], [], []) // the session was not his, or was already gone
    await expect(q.removeNinaSession('u2', 'sessionAAAAA')).resolves.toBe(false)
  })
})

describe('the purge is scoped by owner and by session (invariant 5)', () => {
  it('puts user_id in the WHERE of every one of the four statements', async () => {
    const { sql } = await purge()
    for (const statement of sql) expect(statement).toContain('"user_id" = $')
  })

  it('selects the message ids through a subquery that carries BOTH predicates', async () => {
    const { sql } = await purge()
    for (const statement of [sql[0], sql[1], sql[2]]) {
      expect(statement).toContain('from "nina_messages"')
      expect(statement).toContain('"session_id" = $')
      expect(statement).toContain('"nina_messages"."user_id" = $')
    }
  })

  it('binds the same user id and session id into every statement', async () => {
    await purge('u1', 'sessionAAAAA')
    for (const query of fake.queries) {
      expect(query.params).toContain('u1')
    }
    // The three purges and the delete all name the session.
    for (const query of fake.queries) {
      expect(query.params).toContain('sessionAAAAA')
    }
  })
})

describe('the ledger purge cannot reach a row the admin asserted', () => {
  it('matches on source_message_id membership, which a NULL can never satisfy', async () => {
    const { sql } = await purge()
    expect(sql[0]).toContain('"source_message_id" in (select')
    expect(sql[1]).toContain('"source_message_id" in (select')
    /* No `source <> 'admin'` predicate, and none is wanted: /admin/memory writes and re-labels
     * every hand-asserted row with source_message_id = NULL, so the membership test IS the
     * guarantee. A predicate on `source` would be a second, droppable copy of it. */
    expect(sql[0]).not.toContain('"source"')
    expect(sql[1]).not.toContain('"source" ')
  })
})

describe('pending_promises is pruned per entry, never dropped as a row', () => {
  it('is excluded from the slot DELETE', async () => {
    const { sql } = await purge()
    expect(sql[1]).toContain('"key" <> $')
    const slotDelete = fake.queries[1]!
    expect(slotDelete.params).toContain('pending_promises')
  })

  it('is rewritten by a jsonb UPDATE that keeps every entry from another conversation', async () => {
    const { sql } = await purge()
    const update = sql[2]!
    expect(update).toContain('jsonb_build_object')
    expect(update).toContain('jsonb_array_elements')
    expect(update).toContain("'sourceMessageId'")
    // Entries with no provenance are kept, not swept up with the session.
    expect(update).toContain('is null')
    // Order is preserved explicitly rather than left to jsonb_agg's input order.
    expect(update).toContain('with ordinality')
  })

  it('refuses to touch a malformed slot value, instead of rewriting it to an empty list', async () => {
    const { sql } = await purge()
    expect(sql[2]).toContain('jsonb_typeof')
    expect(sql[2]).toContain("= 'array'")
  })

  it('is a no-op — no updated_at bump — unless this session actually made a promise', async () => {
    const { sql } = await purge()
    expect(sql[2]).toContain('exists (')
  })
})
