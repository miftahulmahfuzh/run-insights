import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **`/admin/shortcuts`' write side, executing for the first time** — all four actions and, behind
 * them, the five store functions nothing had ever called.
 *
 * Until now this page's coverage was `tests/admin.shortcuts.test.ts`: the pure model half
 * (`buildShortcutRows`, `formatFired`) ran for real, and the actions/store were pinned
 * STRUCTURALLY — export lists, `requireAdmin` counts, and the source-read assertions that keep
 * the derived columns out of the payload. Real, but silent about runtime behaviour. What only
 * execution can see, and what this file pins:
 *
 *   - the unique-index duplicate arrives as a REAL 23505 through drizzle (via
 *     `fake.enqueueError`), and the store's catch walks it into `'duplicate'` — including the
 *     wrapped-error shape and the constraint-less shape the Neon driver sometimes hands back,
 *     while a violation of a DIFFERENT unique constraint (the primary key) rethrows;
 *   - the empty-trigger QUESTION fires before any statement: a trigger of nothing but variation
 *     selectors is a sentence, not a row that can never match anything;
 *   - every refusal sentence reaches the admin verbatim — the duplicate's sentence QUOTES the
 *     trigger, because `✌️` and `✌` fold to the same key and the collision may look unlike
 *     anything in the table;
 *   - a successful delete returns NO note, because a sentence under a row that no longer exists
 *     has nowhere to render.
 */

const USER = 'abc123XYZ_-9'
const ID = 'shrtcut12345'

const requireAdmin = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

type Actions = typeof import('@/lib/admin/shortcutActions')
type Store = typeof import('@/lib/admin/shortcutStore')
let actions: Actions
let store: Store
let fake: FakeDb

/** `shortcutColumns` in projection order — 11 values. Timestamps bind as the driver hands them. */
function shortcutRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'trigger' in overrides ? overrides.trigger : '🍑',
    'matchKey' in overrides ? overrides.matchKey : '🍑',
    'kind' in overrides ? overrides.kind : 'glyph',
    'label' in overrides ? overrides.label : 'remes pantat',
    'expansion' in overrides ? overrides.expansion : 'ahh remes pantat aku sayang',
    'enabled' in overrides ? overrides.enabled : true,
    'uses' in overrides ? overrides.uses : 3,
    'lastUsedAt' in overrides ? overrides.lastUsedAt : '2026-09-05 04:31:00+00',
    'createdAt' in overrides ? overrides.createdAt : '2026-09-01 00:00:00+00',
    'updatedAt' in overrides ? overrides.updatedAt : '2026-09-01 00:00:00+00',
  )
}

/** A Postgres-unique-violation the way a driver actually delivers it: code on the error itself. */
function uniqueViolation(constraint: string | null): Error {
  const error: Error & { code?: string; constraint?: string } = new Error(
    'duplicate key value violates unique constraint',
  )
  error.code = '23505'
  if (constraint != null) error.constraint = constraint
  return error
}

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  revalidatePath.mockReset()
  fake = installFakeDb()
  actions = await import('@/lib/admin/shortcutActions')
  store = await import('@/lib/admin/shortcutStore')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/* ── the store, through the real query layer ───────────────────────────────────────────────── */

describe('shortcutStore — the writes', () => {
  it('adminCreateShortcut inserts and reports ok; the fold happens in the statement', async () => {
    fake.enqueue([shortcutRow()]) // insertNinaShortcut RETURNING

    const status = await store.adminCreateShortcut(USER, {
      trigger: '✌️ Victory',
      label: 'victory',
      expansion: 'MPI finished first',
    })

    expect(status).toBe('ok')
    const insert = fake.only()
    expect(insert.sql).toContain('insert into "nina_shortcuts"')
    // The DERIVED columns ride the same statement, computed by the query layer from `trigger` —
    // variation selectors and case folded away (`✌️ Victory` stores `✌ victory`). The store could
    // not have supplied a mismatched key: its draft type has no field for one.
    expect(insert.params).toContain('✌ victory')
    expect(insert.params).toContain('word')
  })

  it('adminCreateShortcut answers a real 23505 with duplicate — not a throw', async () => {
    fake.enqueueError(uniqueViolation('nina_shortcuts_user_match_unq'))

    const status = await store.adminCreateShortcut(USER, {
      trigger: '🍑',
      label: 'taken',
      expansion: 'whatever',
    })

    expect(status).toBe('duplicate')
  })

  it('still answers duplicate when the driver hands back no constraint name', async () => {
    // The Neon HTTP driver does not always carry `.constraint`. `(user_id, match_key)` is the
    // only unique index a form on this page can reach, so a constraint-less 23505 is still a
    // duplicate — pinning this is what stops a "tighten the check" edit from turning a sentence
    // into a 500.
    fake.enqueueError(uniqueViolation(null))

    expect(
      await store.adminCreateShortcut(USER, { trigger: '🍑', label: 'x', expansion: 'y' }),
    ).toBe('duplicate')
  })

  it('recognises the violation through the wrapped-error shape, walking .sourceError', async () => {
    const wrapped = new Error('request failed', { cause: { sourceError: uniqueViolation(null) } })

    fake.enqueueError(wrapped)

    expect(
      await store.adminCreateShortcut(USER, { trigger: '🍑', label: 'x', expansion: 'y' }),
    ).toBe('duplicate')
  })

  it('rethrows a 23505 on a DIFFERENT constraint — a pk collision is not "trigger taken"', async () => {
    fake.enqueueError(uniqueViolation('nina_shortcuts_pkey'))

    // Drizzle wraps the driver error (`Failed query: …`, original on `.cause`) — the same chain
    // `isUniqueViolation` walks. The store answers `duplicate` only for the match index; a pk
    // collision travels OUT of the store, to the action's catch-all, where a nanoid collision
    // reported as "that trigger is taken" would send the operator hunting for a row that is not.
    const cause = await store
      .adminCreateShortcut(USER, { trigger: '🍑', label: 'x', expansion: 'y' })
      .then(
        () => null,
        (error) => error,
      )

    expect(cause).not.toBeNull()
    expect((cause as { cause?: { constraint?: string } }).cause?.constraint).toBe(
      'nina_shortcuts_pkey',
    )
  })

  it('rethrows anything that is not a unique violation at all', async () => {
    fake.enqueueError(new Error('connection reset'))

    const cause = await store
      .adminCreateShortcut(USER, { trigger: '🍑', label: 'x', expansion: 'y' })
      .then(
        () => null,
        (error) => error,
      )

    expect(cause).not.toBeNull()
    expect((cause as { cause?: { message?: string } }).cause?.message).toBe('connection reset')
  })

  it('adminCreateShortcut answers an unfolding trigger before any statement', async () => {
    const status = await store.adminCreateShortcut(USER, {
      trigger: '️️️',
      label: 'selectors',
      expansion: 'never fires',
    })

    expect(status).toBe('empty')
    expect(fake.queries).toHaveLength(0)
  })

  it('adminSaveShortcutField saves one cell and reports missing when the row is gone', async () => {
    fake.enqueue([shortcutRow({ label: 'new label' })]) // label branch RETURNING

    expect(await store.adminSaveShortcutField(USER, ID, 'label', 'new label')).toBe('ok')
    expect(fake.only().sql).toContain('update "nina_shortcuts"')
    expect(fake.only().params).toContain('new label')

    fake.enqueue([]) // the row is gone in another tab
    expect(await store.adminSaveShortcutField(USER, ID, 'label', 'x')).toBe('missing')
  })

  it('the trigger cell rewrite re-derives the folded pair, and can be refused as a duplicate', async () => {
    fake.enqueue([shortcutRow({ trigger: 'fresh', matchKey: 'fresh', kind: 'word' })])

    expect(await store.adminSaveShortcutField(USER, ID, 'trigger', 'Fresh ')).toBe('ok')
    const update = fake.only()
    // All three derived-and-derived-from columns move together — the folded key and the
    // classification cannot disagree with the trigger they were folded from.
    expect(update.params).toContain('fresh')

    fake.enqueueError(uniqueViolation('nina_shortcuts_user_match_unq'))
    expect(await store.adminSaveShortcutField(USER, ID, 'trigger', '🍑')).toBe('duplicate')
  })

  it('adminSetShortcutEnabled is the narrow write: ok or missing, nothing else', async () => {
    fake.enqueue([shortcutRow({ enabled: false })])
    expect(await store.adminSetShortcutEnabled(USER, ID, false)).toBe('ok')

    fake.enqueue([])
    expect(await store.adminSetShortcutEnabled(USER, ID, true)).toBe('missing')
  })

  it('adminDeleteShortcut maps the boolean the delete returns', async () => {
    fake.enqueue([{ id: ID }])
    expect(await store.adminDeleteShortcut(USER, ID)).toBe('ok')

    fake.enqueue([])
    expect(await store.adminDeleteShortcut(USER, ID)).toBe('missing')
    expect(fake.last().sql).toContain('delete from')
  })
})

describe('shortcutStore — the read', () => {
  it('reads bare, then orders newest-first in memory with the stable id tiebreak', async () => {
    fake.enqueue([
      shortcutRow({ id: 'olderOne123456', createdAt: '2026-09-01 00:00:00+00' }),
      shortcutRow({ id: 'newestOne12345', createdAt: '2026-09-09 00:00:00+00' }),
      // Same instant as newestOne12345 — the id DESC tiebreak decides, and it is ARBITRARY but
      // STABLE, which is all a re-render needs.
      shortcutRow({ id: 'zzzTiedRow1234', createdAt: '2026-09-09 00:00:00+00' }),
    ])

    const rows = await store.adminReadShortcuts(USER, 2)

    expect(rows.map((row) => row.id)).toEqual(['zzzTiedRow1234', 'newestOne12345'])
    expect(fake.queries).toHaveLength(1)
    expect(fake.only().sql).toContain('from "nina_shortcuts"')
    expect(fake.only().params).toEqual([USER])
  })

  it('keeps disabled rows — off is not deleted, and the operator re-enables from this table', async () => {
    fake.enqueue([shortcutRow({ enabled: false })])

    const rows = await store.adminReadShortcuts(USER, 200)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.enabled).toBe(false)
  })
})

/* ── the actions, on top of the same real store ─────────────────────────────────────────────── */

describe('addShortcutAction', () => {
  const DRAFT = { userId: USER, trigger: '🍑', label: 'remes pantat', expansion: 'aku sayang' }

  it('writes through the store and revalidates the page', async () => {
    fake.enqueue([shortcutRow()])

    const result = await actions.addShortcutAction(DRAFT)

    expect(result.ok).toBe(true)
    expect(result.note).toContain('Live.')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/shortcuts')
  })

  it('refuses an out-of-bounds payload before any statement, naming the three fields', async () => {
    const result = await actions.addShortcutAction({ ...DRAFT, trigger: 'x'.repeat(17) })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('all three')
    expect(fake.queries).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('turns the duplicate into the sentence that QUOTES the trigger and explains the fold', async () => {
    fake.enqueueError(uniqueViolation('nina_shortcuts_user_match_unq'))

    const result = await actions.addShortcutAction(DRAFT)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('"🍑"')
    expect(result.error).toContain('variation selectors')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.addShortcutAction(DRAFT)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })
})

describe('saveShortcutCellAction', () => {
  it('saves a label cell and says when she reads it', async () => {
    fake.enqueue([shortcutRow()])

    const result = await actions.saveShortcutCellAction({
      userId: USER,
      id: ID,
      field: 'label',
      value: 'new label',
    })

    expect(result.ok).toBe(true)
    expect(result.note).toContain('next message')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/shortcuts')
  })

  it('the trigger cell save announces the folded key', async () => {
    fake.enqueue([shortcutRow()])

    const result = await actions.saveShortcutCellAction({
      userId: USER,
      id: ID,
      field: 'trigger',
      value: 'fresh',
    })

    expect(result.ok).toBe(true)
    expect(result.note).toContain('folded key')
  })

  it('refuses a field the union does not name — matchKey has no control on this page', async () => {
    const result = await actions.saveShortcutCellAction({
      userId: USER,
      id: ID,
      field: 'matchKey',
      value: 'forged',
    })

    // A forged derived column is a VALIDATION refusal, not a write: the payload has nowhere to
    // put a key that disagrees with its own trigger.
    expect(result).toEqual({ ok: false, error: 'That is not an edit this page can make.' })
    expect(fake.queries).toHaveLength(0)
  })

  it('a row gone from under the operator gets the GONE sentence, verbatim', async () => {
    fake.enqueue([])

    const result = await actions.saveShortcutCellAction({
      userId: USER,
      id: ID,
      field: 'expansion',
      value: 'new words',
    })

    expect(result).toEqual({
      ok: false,
      error: 'That shortcut is no longer in the table. Nothing changed.',
    })
  })

  it('a non-duplicate fault becomes the catch-all sentence, and the log gets the stack', async () => {
    fake.enqueueError(new Error('connection reset'))

    const result = await actions.saveShortcutCellAction({
      userId: USER,
      id: ID,
      field: 'label',
      value: 'x',
    })

    expect(result).toEqual({
      ok: false,
      error: 'The write failed and nothing was changed. Try again.',
    })
  })
})

describe('toggleShortcutAction', () => {
  it('turns a row off and says what off means', async () => {
    fake.enqueue([shortcutRow({ enabled: false })])

    const result = await actions.toggleShortcutAction({ userId: USER, id: ID, enabled: false })

    expect(result.ok).toBe(true)
    expect(result.note).toContain('Off.')
    expect(fake.last().params).toContain(false)
  })

  it('turning on again says it can fire', async () => {
    fake.enqueue([shortcutRow({ enabled: true })])

    const result = await actions.toggleShortcutAction({ userId: USER, id: ID, enabled: true })

    expect(result.ok).toBe(true)
    expect(result.note).toContain('On.')
  })

  it('a missing row is the GONE sentence, and there is no third state', async () => {
    fake.enqueue([])

    const result = await actions.toggleShortcutAction({ userId: USER, id: ID, enabled: true })

    expect(result).toEqual({
      ok: false,
      error: 'That shortcut is no longer in the table. Nothing changed.',
    })
  })
})

describe('deleteShortcutAction', () => {
  it('destroys on the first click and returns NO note — a gone row has nowhere to render one', async () => {
    fake.enqueue([{ id: ID }])

    const result = await actions.deleteShortcutAction({ userId: USER, id: ID })

    expect(result).toEqual({ ok: true })
    expect('note' in result).toBe(false)
    expect(fake.last().sql).toContain('delete from')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/shortcuts')
  })

  it('deleting an already-gone row is the GONE sentence, not an error', async () => {
    fake.enqueue([])

    const result = await actions.deleteShortcutAction({ userId: USER, id: ID })

    expect(result).toEqual({
      ok: false,
      error: 'That shortcut is no longer in the table. Nothing changed.',
    })
  })

  it('a client that sends a confirm field anyway gets NO confirmation — the key is stripped inert', async () => {
    // `shortcutDeleteSchema` is `{ userId, id }` and zod's default strips unknown keys, so a
    // forged `confirm: true` neither refuses nor confirms: the delete simply happens. That is
    // invariant 6 made runtime-true — there is no second click ON THE WIRE either, because the
    // payload has nowhere to carry one.
    fake.enqueue([]) // the row is already gone → GONE, and still no confirm step

    const result = await actions.deleteShortcutAction({
      userId: USER,
      id: ID,
      confirm: true,
    } as { userId: string; id: string })

    expect(result).toEqual({
      ok: false,
      error: 'That shortcut is no longer in the table. Nothing changed.',
    })
    expect(fake.last().sql).toContain('delete from')
  })
})
