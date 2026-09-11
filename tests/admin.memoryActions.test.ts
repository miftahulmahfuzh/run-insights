import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { NINA_SLOT_PENDING_PROMISES } from '@/lib/db/schema'

/**
 * **`/admin/memory`'s write side, executing for the first time** — the four actions and, behind
 * them, all eight store functions.
 *
 * `tests/admin.memory.test.ts` covers the pure vocabulary (`memoryVocab`, `memoryModel`) and
 * asserts the actions structurally. What only execution pins:
 *
 *   - **the admin label cannot be forgotten, because it is in the params.** Every write this page
 *     makes carries `source = 'admin'` and `source_message_id = null` — the store exists so a
 *     write that omitted them would silently disable its own distillation protection, and these
 *     tests read the actual INSERT/UPDATE statements to prove both columns ride every one;
 *   - `adminUpdateFact` re-labels IN THE SAME STATEMENT as the text: a distilled row that the
 *     admin rewrites stops quoting the message it pointed at (`source = 'admin'`, pointer NULL),
 *     and the note says so;
 *   - the promise delete REWRITES the `pending_promises` slot without the removed entry — and a
 *     corrupt slot value (promises not an array) degrades to "no such promise", not a crash;
 *   - the canonicalisation round trip runs on the writer: a refused value is reported with
 *     phase 5's sentence, a canonicalised one is saved under its canonical form with a note.
 */

const USER = 'abc123XYZ_-9'
const FACT_ID = 'fact123456789'
const UPDATED_AT = '2026-09-08 10:00:00+00'

const requireAdmin = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

type Actions = typeof import('@/lib/admin/memoryActions')
type Store = typeof import('@/lib/admin/memoryStore')
let actions: Actions
let store: Store
let fake: FakeDb

/** `appendNinaMemoryFacts`' RETURNING projection — 6 values. */
function factRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : FACT_ID,
    'category' in overrides ? overrides.category : 'goal',
    'text' in overrides ? overrides.text : 'sub 3 before 2027',
    'source' in overrides ? overrides.source : 'admin',
    'sourceMessageId' in overrides ? overrides.sourceMessageId : null,
    'createdAt' in overrides ? overrides.createdAt : UPDATED_AT,
  )
}

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  revalidatePath.mockReset()
  fake = installFakeDb()
  actions = await import('@/lib/admin/memoryActions')
  store = await import('@/lib/admin/memoryStore')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/* ── the store, through the real query layer ───────────────────────────────────────────────── */

describe('memoryStore — the writes carry the admin label', () => {
  it('adminUpsertSlot writes source=admin, pointer NULL, and updates on conflict', async () => {
    await store.adminUpsertSlot(USER, { key: 'goals', value: 'sub 3' })

    const upsert = fake.only()
    expect(upsert.sql).toContain('insert into "nina_memory_slots"')
    expect(upsert.sql).toContain('on conflict')
    expect(upsert.params).toContain('goals')
    // The jsonb column binds as JSON.stringify's output — `"sub 3"`, quotes included — and it
    // appears TWICE: once in the INSERT's values, once in the ON CONFLICT SET. The SET clause is
    // what rewrites `source` on conflict, which is the whole sticky/deferred mechanism.
    expect(upsert.params).toContain(JSON.stringify('sub 3'))
    expect(upsert.params.filter((param) => param === 'admin')).toHaveLength(2)
    expect(upsert.params.filter((param) => param === null)).toHaveLength(2) // source_message_id
  })

  it('adminAppendFact routes the one row through the multi-row INSERT, admin-labelled', async () => {
    fake.enqueue([factRow()])

    const row = await store.adminAppendFact(USER, { category: 'goal', text: 'sub 3 before 2027' })

    expect(row).not.toBeNull()
    expect(row?.source).toBe('admin')
    expect(row?.sourceMessageId).toBeNull()
    const insert = fake.only()
    expect(insert.sql).toContain('insert into "nina_memory_facts"')
    expect(insert.params).toContain('admin')
    expect(insert.params).toContain(null)
  })

  it('adminAppendFact answers null when the insert returns nothing at all', async () => {
    fake.enqueue([]) // RETURNING empty

    expect(await store.adminAppendFact(USER, { category: 'other', text: 'x' })).toBeNull()
  })

  it('adminUpdateFact re-labels in the SAME statement: source admin, pointer NULL, user-scoped', async () => {
    fake.enqueue([{ id: FACT_ID }])

    expect(await store.adminUpdateFact(USER, FACT_ID, { category: 'goal', text: 'rewritten' })).toBe(
      true,
    )

    const update = fake.only()
    expect(update.sql).toContain('update "nina_memory_facts"')
    expect(update.sql).toContain('returning')
    // A distilled row rewritten by hand must stop claiming to quote its message — the label and
    // the pointer are corrected in the same statement as the text, never in a second one.
    expect(update.params.slice(0, 4)).toEqual(['goal', 'rewritten', 'admin', null])
    expect(update.params).toContain(USER)
    expect(update.params).toContain(FACT_ID)
  })

  it('adminUpdateFact answers false when the row is gone', async () => {
    fake.enqueue([])

    expect(await store.adminUpdateFact(USER, FACT_ID, { category: 'other', text: 'x' })).toBe(false)
  })

  it('adminDeleteSlot and adminDeleteFact map their deletes to booleans', async () => {
    fake.enqueue([{ key: 'goals' }])
    expect(await store.adminDeleteSlot(USER, 'goals')).toBe(true)
    expect(fake.last().sql).toContain('delete from "nina_memory_slots"')

    fake.enqueue([])
    expect(await store.adminDeleteSlot(USER, 'goals')).toBe(false)

    fake.enqueue([{ id: FACT_ID }])
    expect(await store.adminDeleteFact(USER, FACT_ID)).toBe(true)
    expect(fake.last().sql).toContain('delete from "nina_memory_facts"')

    fake.enqueue([])
    expect(await store.adminDeleteFact(USER, FACT_ID)).toBe(false)
  })
})

describe('memoryStore — the reads', () => {
  it('adminReadSlots reads every slot bare, ordered by key', async () => {
    fake.enqueue([
      projectedRow('goals', 'sub 3', 'admin', null, UPDATED_AT),
      projectedRow('name', 'Miftah', 'distilled', 'msg123XYZ_-9', UPDATED_AT),
    ])

    const rows = await store.adminReadSlots(USER)

    expect(rows).toHaveLength(2)
    expect(fake.only().params).toEqual([USER])
    expect(fake.only().sql).toContain('order by')
  })

  it('adminReadSlot returns the parsed jsonb value, not a string', async () => {
    const value = {
      promises: [{ id: 'p1', metric: 'longest_distance', target: '21', deadline: '2026-10-01' }],
    }
    fake.enqueue([projectedRow(value, 'admin', UPDATED_AT)])

    const slot = await store.adminReadSlot(USER, NINA_SLOT_PENDING_PROMISES)

    expect(slot?.value).toEqual(value)
  })

  it('adminReadFacts asks for exactly the limit, newest first', async () => {
    fake.enqueue([factRow()])

    const rows = await store.adminReadFacts(USER, 60)

    expect(rows).toHaveLength(1)
    expect(fake.only().sql).toContain('limit')
    expect(fake.only().params).toContain(60)
    expect(fake.only().sql).toContain('desc')
  })
})

/* ── the actions, on top of the same real store ─────────────────────────────────────────────── */

describe('saveSlotAction', () => {
  it('saves a value that already reads back as itself, and promises the distiller off', async () => {
    await actions.saveSlotAction({ userId: USER, key: 'goals', value: '  sub 3  ' })

    expect(revalidatePath).toHaveBeenCalledWith('/admin/memory')
    // canonicaliseSlotValue('goals', '  sub 3  ') → 'sub 3', which equals the trimmed input, so
    // the note is the protection promise and not the canonical-form sentence.
    const result = await actions.saveSlotAction({ userId: USER, key: 'goals', value: 'sub 3' })
    expect(result).toEqual({ ok: true, note: 'Saved. The distiller will not overwrite it.' })
  })

  it('saves a canonicalised value under its CANONICAL form, and says so', async () => {
    const result = await actions.saveSlotAction({
      userId: USER,
      key: 'running_days',
      value: 'selasa, kamis, sabtu',
    })

    expect(result.ok).toBe(true)
    expect(result.note).toContain('Saved as "Selasa, Kamis, Sabtu"')
    // The WRITER canonicalised — the stored value is the canonical string (jsonb-bound), never
    // the raw input.
    expect(fake.last().params).toContain(JSON.stringify('Selasa, Kamis, Sabtu'))
  })

  it('refuses with the vocabulary sentence when the value cannot parse back', async () => {
    const result = await actions.saveSlotAction({
      userId: USER,
      key: 'running_days',
      value: 'sometime maybe',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('No weekday could be read')
    expect(fake.queries).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an orphan key and a string written into the structured slot', async () => {
    const orphan = await actions.saveSlotAction({
      userId: USER,
      key: 'mystery_key',
      value: 'anything',
    })
    expect(orphan.error).toContain('not one of the ten keys')
    expect(fake.queries).toHaveLength(0)

    const structured = await actions.saveSlotAction({
      userId: USER,
      key: NINA_SLOT_PENDING_PROMISES,
      value: 'just text',
    })
    expect(structured.error).toContain('structured rows, not text')
  })

  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(
      actions.saveSlotAction({ userId: USER, key: 'goals', value: 'x' }),
    ).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })
})

describe('insertFactAction', () => {
  it('writes the backdoor row, admin-labelled, and she reads it next turn', async () => {
    fake.enqueue([factRow()])

    const result = await actions.insertFactAction({
      userId: USER,
      category: 'goal',
      text: 'sub 3 before 2027',
    })

    expect(result).toEqual({ ok: true, note: 'She reads this on her next turn.' })
    const insert = fake.only()
    expect(insert.params).toContain('admin')
    expect(insert.params).toContain(null)
    expect(insert.params).toContain('sub 3 before 2027')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/memory')
  })

  it('refuses a category the enum does not name, before any statement', async () => {
    const result = await actions.insertFactAction({
      userId: USER,
      category: 'secrets',
      text: 'x',
    })

    expect(result).toEqual({
      ok: false,
      error: 'Pick a category and write something under 400 characters.',
    })
    expect(fake.queries).toHaveLength(0)
  })

  it('reports it honestly when the ledger returns nothing', async () => {
    fake.enqueue([])

    const result = await actions.insertFactAction({ userId: USER, category: 'other', text: 'x' })

    expect(result).toEqual({ ok: false, error: 'The ledger did not accept it. Nothing changed.' })
  })
})

describe('editFactAction', () => {
  it('rewrites any row — including a distilled one — and re-labels it in the same statement', async () => {
    fake.enqueue([{ id: FACT_ID }])

    const result = await actions.editFactAction({
      userId: USER,
      id: FACT_ID,
      category: 'body',
      text: 'corrected rest HR',
    })

    expect(result).toEqual({
      ok: true,
      note: 'Saved. The row is yours now — admin, quoting nothing.',
    })
    const update = fake.only()
    expect(update.params.slice(0, 4)).toEqual(['body', 'corrected rest HR', 'admin', null])
    expect(update.params).toContain(FACT_ID)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/memory')
  })

  it('a row gone from under the edit is a sentence, not a stack', async () => {
    fake.enqueue([])

    const result = await actions.editFactAction({
      userId: USER,
      id: FACT_ID,
      category: 'body',
      text: 'x',
    })

    expect(result).toEqual({ ok: false, error: 'That row is no longer in the ledger.' })
  })

  it('refuses a malformed edit before any statement', async () => {
    const result = await actions.editFactAction({
      userId: USER,
      id: FACT_ID,
      category: 'nope',
      text: 'x',
    })

    expect(result).toEqual({ ok: false, error: 'That is not an edit this page can make.' })
    expect(fake.queries).toHaveLength(0)
  })
})

describe('deleteMemoryRowAction — one control, three row kinds', () => {
  it('a fact is gone, and nothing survives it', async () => {
    fake.enqueue([{ id: FACT_ID }])

    const result = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'fact',
      target: FACT_ID,
    })

    expect(result).toEqual({ ok: true })
    expect(fake.only().sql).toContain('delete from "nina_memory_facts"')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/memory')
  })

  it('a missing fact and a missing slot each get their own sentence', async () => {
    fake.enqueue([])
    const fact = await actions.deleteMemoryRowAction({ userId: USER, kind: 'fact', target: FACT_ID })
    expect(fact).toEqual({ ok: false, error: 'That row is no longer in the ledger.' })

    fake.enqueue([])
    const slot = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'slot',
      target: 'goals',
    })
    expect(slot).toEqual({ ok: false, error: 'There is no such slot, so nothing was removed.' })
  })

  it('a slot delete removes the ROW — the closed vocabulary brings the key back blank', async () => {
    fake.enqueue([{ key: 'goals' }])

    const result = await actions.deleteMemoryRowAction({ userId: USER, kind: 'slot', target: 'goals' })

    expect(result).toEqual({ ok: true })
    expect(fake.only().sql).toContain('delete from "nina_memory_slots"')
  })

  it('a promise delete rewrites the slot WITHOUT the removed entry, as an admin row', async () => {
    const value = {
      promises: [
        { id: 'p1', metric: 'longest_distance', target: '21', deadline: '2026-10-01' },
        { id: 'p2', metric: 'earliest_wake_up', target: '05:00', deadline: '2026-09-20' },
      ],
    }
    fake.enqueue([projectedRow(value, 'admin', UPDATED_AT)]) // adminReadSlot

    const result = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'promise',
      target: 'p2',
    })

    expect(result).toEqual({ ok: true })
    const upsert = fake.last()
    expect(upsert.sql).toContain('insert into "nina_memory_slots"')
    // The rewrite drops p2, keeps p1, and the stickiness label rides along so the next merge
    // cannot resurrect the deleted promise. The jsonb value binds as its JSON text, in both the
    // INSERT and the ON CONFLICT SET.
    expect(upsert.params).toContain(NINA_SLOT_PENDING_PROMISES)
    const rewritten = JSON.stringify({ promises: [value.promises[0]] })
    expect(upsert.params.filter((param) => param === rewritten)).toHaveLength(2)
    expect(upsert.params).toContain('admin')
  })

  it('an unknown promise id changes nothing, and says exactly that', async () => {
    fake.enqueue([projectedRow({ promises: [{ id: 'p1' }] }, 'admin', UPDATED_AT)])

    const result = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'promise',
      target: 'p9',
    })

    expect(result).toEqual({ ok: false, error: 'No promise with that id. Nothing changed.' })
    expect(fake.queries).toHaveLength(1) // the read only; no rewrite followed
  })

  it('a slot with no promises at all refuses before any write', async () => {
    fake.enqueue([]) // adminReadSlot → null

    const result = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'promise',
      target: 'p1',
    })

    expect(result).toEqual({ ok: false, error: 'There are no pending promises to remove.' })
  })

  it('a corrupt slot value degrades to "no such promise" instead of crashing', async () => {
    fake.enqueue([projectedRow({ promises: 'not-an-array' }, 'admin', UPDATED_AT)])

    const result = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'promise',
      target: 'p1',
    })

    expect(result).toEqual({ ok: false, error: 'No promise with that id. Nothing changed.' })
  })

  it('refuses a kind that is not one of the three', async () => {
    const result = await actions.deleteMemoryRowAction({
      userId: USER,
      kind: 'everything' as 'fact',
      target: FACT_ID,
    })

    expect(result).toEqual({ ok: false, error: 'That is not a row this page can delete.' })
    expect(fake.queries).toHaveLength(0)
  })

  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(
      actions.deleteMemoryRowAction({ userId: USER, kind: 'fact', target: FACT_ID }),
    ).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })
})
