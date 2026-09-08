import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { readRepoCode } from './support/importGraph'

/**
 * **R1's exit test.** The runner's words were *"don't delete existing photos, if user delete a chat
 * session, just let the photos be"* — twice, the second time about photographs he had replaced by
 * hand in `/admin/photos`, which are the same rows with new bytes underneath them.
 *
 * The property under test is a pair, and the pair is the whole design:
 *
 *   1. a SESSION delete issues no statement against `nina_message_images` at all. The photographs
 *      survive because the foreign key is `ON DELETE SET NULL`, and `removeNinaSession` gets that
 *      by NOT changing — so what a test can assert is the absence of the table from its SQL.
 *   2. a MESSAGE delete still takes its own photographs, now explicitly, and the IMAGES GO FIRST.
 *      Reverse those two statements and the FK nulls the pointers before the image delete looks for
 *      them, which leaves the photographs behind and still returns the deleted message — a
 *      regression that ships green. Order is why this is asserted against generated SQL and not
 *      against a spy.
 *
 * The schema half (nullable, `set null`) lives in `tests/db.schema.nina.test.ts`. The admin half is
 * a source claim and is at the bottom of this file, on `tests/nina.chatPhoto.test.ts`'s pattern:
 * `removeChatPhotoAction` is a `'use server'` export that reaches `requireAdmin`, `next/cache` and
 * `next/server`, and the null-carrier branch is a property of the source rather than of any one
 * rendered scenario.
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

describe('removeNinaSession leaves every photograph standing (R1)', () => {
  it('names nina_message_images in none of its four statements', async () => {
    fake.enqueue([], [], [], [['sessionAAAAA']])
    await q.removeNinaSession('u1', 'sessionAAAAA')

    expect(fake.queries).toHaveLength(4)
    for (const query of fake.queries) {
      expect(query.sql).not.toContain('nina_message_images')
    }
  })

  it('still sends exactly the four statements it always did, session last', async () => {
    // Guards the other direction: "leave the photos be" must not have been implemented by removing
    // the memory purge (R8 of the sessions set) or by reordering the batch.
    fake.enqueue([], [], [], [['sessionAAAAA']])
    await q.removeNinaSession('u1', 'sessionAAAAA')

    const sql = fake.queries.map((query) => query.sql)
    expect(fake.batches).toEqual([4])
    expect(sql[0]).toMatch(/^delete from "nina_memory_facts"/)
    expect(sql[1]).toMatch(/^delete from "nina_memory_slots"/)
    expect(sql[2]).toMatch(/^update "nina_memory_slots"/)
    expect(sql[3]).toMatch(/^delete from "nina_chat_sessions"/)
  })
})

describe('deleteNinaMessage still takes its own photographs (the Decisions table, row 1)', () => {
  it('deletes the image rows FIRST and the message SECOND, in one batch', async () => {
    /* Two empty results for two statements. The return value is not asserted here, so there is no
     * reason to hand `messageColumns` a hand-built row array — thirteen columns' worth of driver
     * mapping is not what this test is about. */
    fake.enqueue([], [])
    await q.deleteNinaMessage('u1', 'ms000000000a')

    const sql = fake.queries.map((query) => query.sql)
    expect(sql).toHaveLength(2)
    expect(fake.batches).toEqual([2])
    expect(fake.queries.every((query) => query.batched)).toBe(true)

    // The order IS the correctness. Message-first would let ON DELETE SET NULL blank the pointers
    // before the image delete looked for them.
    expect(sql[0]).toMatch(/^delete from "nina_message_images"/)
    expect(sql[1]).toMatch(/^delete from "nina_messages"/)
  })

  it('scopes both statements by owner, and the image delete by message (invariant 4)', async () => {
    fake.enqueue([], [])
    await q.deleteNinaMessage('u1', 'ms000000000a')

    for (const query of fake.queries) {
      expect(query.sql).toContain('"user_id" = $')
      expect(query.params).toContain('u1')
      expect(query.params).toContain('ms000000000a')
    }
    expect(fake.queries[0]!.sql).toContain('"message_id" = $')
  })

  it('reports ownership from the MESSAGE delete alone', async () => {
    fake.enqueue([], [])
    await expect(q.deleteNinaMessage('u2', 'ms000000000a')).resolves.toBeNull()
  })
})

describe('the admin collection handles a photograph with no message', () => {
  const ACTIONS = 'lib/admin/chatPhotoActions.ts'

  it('asks for a carrier through the helper that short-circuits on a null', () => {
    // Comments are stripped by readRepoCode, so these are claims about code.
    const source = readRepoCode(ACTIONS)
    expect(source).toContain('loadPhotoCarrier(userId, row.messageId)')
    expect(source).toContain('if (messageId === null) return { message: null, siblings: [] }')
  })

  it('never passes a possibly-null message id straight into an owner-scoped query', () => {
    // The defect this replaces: `getNinaMessagesByIds(userId, [row.messageId])`, which on an orphan
    // asks the database for the message with id NULL and gets back a refusal-shaped empty answer.
    expect(readRepoCode(ACTIONS)).not.toContain('[row.messageId]')
  })

  it('still refuses to delete a bubble it has not proved is a carrier', () => {
    expect(readRepoCode(ACTIONS)).toContain(
      'carrier.message != null && isNinaPhotoCarrierMessage(carrier.message)',
    )
  })
})
