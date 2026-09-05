import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ADMIN_FACT_CATEGORIES } from '@/lib/admin/memoryModel'
import {
  buildMemoryRows,
  canonicaliseSlotValue,
  slotEditKind,
  slotProtection,
} from '@/lib/admin/memoryVocab'
import {
  NINA_SLOT_KEYS,
  formatWorkHours,
  parseRunningDays,
  parseWorkHours,
} from '@/lib/nina/memory'

/**
 * `/admin/memory`'s testable surface — invariant 6's "testable here = pure functions".
 *
 * The structural half at the bottom reads source files and asserts boundaries, the same technique
 * (and the same reason) as `tests/nina.distill.test.ts` case 14 — *a structural guarantee that is
 * only a comment decays.* R1's exit criteria are encoded there deliberately: "no confirmation
 * anywhere on this page" is a property a future edit could quietly reintroduce, and a prose
 * exit criterion in a landed plan cannot fail a build.
 */

const NON_STRUCTURED_SLOT_KEYS = NINA_SLOT_KEYS.filter((key) => slotEditKind(key) !== 'structured')

describe('the fact category vocabulary', () => {
  it('has all seven of phase 1s categories, in a stable order', () => {
    expect(ADMIN_FACT_CATEGORIES).toEqual([
      'person',
      'preference',
      'body',
      'life',
      'goal',
      'training',
      'other',
    ])
  })
})

describe('canonicaliseSlotValue — phase 5s round trip, on the admins keystrokes', () => {
  it('round-trips running_days so phase 10s trigger keeps working', () => {
    const result = canonicaliseSlotValue('running_days', 'tuesdays and thursdays')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // THE assertion this whole rule exists for: what we stored parses back to what he meant.
    expect(parseRunningDays(result.value)).toEqual(parseRunningDays('tuesdays and thursdays'))
    expect(parseRunningDays(result.value).length).toBeGreaterThan(0)
  })

  it('refuses running_days text with no weekday in it, and explains why it matters', () => {
    const result = canonicaliseSlotValue('running_days', 'kapan aja')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/cron|parse/i)
  })

  it('round-trips work_hours', () => {
    const result = canonicaliseSlotValue('work_hours', '08:00-17:00')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = parseWorkHours(result.value)
    expect(parsed).not.toBeNull()
    if (parsed === null) return
    expect(formatWorkHours(parsed)).toBe(result.value)
  })

  it('stores a nickname as a bare string, because getNinaIdentity typeof-checks it', () => {
    const result = canonicaliseSlotValue('nickname', 'Miftah')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(typeof result.value).toBe('string')
  })

  it('refuses pending_promises as text', () => {
    const result = canonicaliseSlotValue('pending_promises', 'he promised to change his photo')
    expect(result.ok).toBe(false)
  })

  it('refuses a key outside the nine, and points at the delete control', () => {
    const result = canonicaliseSlotValue('favourite_shoe', 'Novablast 4')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/delete/i)
  })

  it('never tells the admin to retire anything — there is no retire any more', () => {
    for (const key of [...NINA_SLOT_KEYS, 'favourite_shoe']) {
      const result = canonicaliseSlotValue(key, '')
      if (result.ok) continue
      expect(result.reason, `${key}'s refusal must not mention retiring`).not.toMatch(/retire/i)
    }
  })
})

describe('the slot vocabulary readings the row builder uses', () => {
  it('classifies the edit kind from phase 5s write policy, not from a key literal', () => {
    expect(slotEditKind('goals')).toBe('text')
    expect(slotEditKind('pending_promises')).toBe('structured')
    expect(slotEditKind('favourite_shoe')).toBe('orphaned')
  })

  it('reports phase 5s protection so the row can say it', () => {
    expect(slotProtection('goals', 'admin')).toBe('deferred')
    expect(slotProtection('pending_promises', 'admin')).toBe('sticky')
    expect(slotProtection('goals', 'distilled')).toBe('none')
    expect(slotProtection('goals', null)).toBe('none')
    expect(slotProtection('favourite_shoe', 'admin')).toBe('none')
  })
})

describe('buildMemoryRows — R1s one table', () => {
  const empty = { slots: [], facts: [], promises: [] }

  it('renders every non-structured slot key as an empty row when there is no data at all', () => {
    const rows = buildMemoryRows(empty)
    expect(rows).toHaveLength(NON_STRUCTURED_SLOT_KEYS.length)
    expect(rows.map((row) => row.target)).toEqual([...NON_STRUCTURED_SLOT_KEYS])
    expect(rows.every((row) => row.kind === 'slot')).toBe(true)
    expect(rows.every((row) => row.text === '')).toBe(true)
    expect(rows.every((row) => row.origin === null)).toBe(true)
    // Nothing to delete, but everything is typeable — an empty row IS how a slot is inserted.
    expect(rows.every((row) => row.deletable === false)).toBe(true)
    expect(rows.every((row) => row.editable === true)).toBe(true)
  })

  it('never renders pending_promises as a slot row — its entries are the rows', () => {
    const rows = buildMemoryRows(empty)
    expect(rows.some((row) => row.target === 'pending_promises')).toBe(false)
    expect(NINA_SLOT_KEYS).toContain('pending_promises')
  })

  it('marks a closed-vocabulary slot as one that comes back blank after a delete', () => {
    const rows = buildMemoryRows({
      ...empty,
      slots: [
        {
          key: 'goals',
          value: 'sub-25 5k',
          source: 'admin',
          sourceMessageId: null,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    })
    const goals = rows.find((row) => row.target === 'goals')
    expect(goals?.deletable).toBe(true)
    expect(goals?.reappears).toBe(true)
    expect(goals?.note).toMatch(/defers/i)
  })

  it('puts an orphaned key after the eight, read-only, and gone for good when deleted', () => {
    const rows = buildMemoryRows({
      ...empty,
      slots: [
        {
          key: 'favourite_shoe',
          value: 'Novablast 4',
          source: 'distilled',
          sourceMessageId: 'msg_1',
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    })
    expect(rows).toHaveLength(NON_STRUCTURED_SLOT_KEYS.length + 1)
    const orphan = rows[rows.length - 1]
    expect(orphan?.target).toBe('favourite_shoe')
    expect(orphan?.editable).toBe(false)
    expect(orphan?.deletable).toBe(true)
    // The key is not in the vocabulary, so nothing re-manufactures it.
    expect(orphan?.reappears).toBe(false)
  })

  it('gives a promise its own row: deletable, never editable as text', () => {
    const rows = buildMemoryRows({
      ...empty,
      promises: [
        {
          id: 'p1',
          text: 'gw bikinin foto kalau lo lari 50k bulan ini',
          condition: 'kalau lo lari 50k bulan ini',
          metric: 'distance_km_total',
          target: 50,
          targetKey: null,
          byDate: '2026-09-30',
          promisedOn: '2026-09-02',
          status: 'pending',
        },
      ],
    })
    const promise = rows.find((row) => row.kind === 'promise')
    expect(promise?.rowId).toBe('promise:p1')
    expect(promise?.target).toBe('p1')
    expect(promise?.editable).toBe(false)
    expect(promise?.deletable).toBe(true)
    expect(promise?.reappears).toBe(false)
    expect(promise?.at).toBe('2026-09-02')
    expect(promise?.hint).toContain('by 2026-09-30')
    expect(promise?.hint).toContain('target 50')
  })

  it('makes every ledger row editable, including a distilled one, and says what that costs', () => {
    const rows = buildMemoryRows({
      ...empty,
      facts: [
        {
          id: 'f1',
          category: 'training',
          text: 'he only runs on weekends',
          confidence: 80,
          source: 'distilled',
          sourceMessageId: 'msg_9',
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
        {
          id: 'f2',
          category: 'person',
          text: 'his sister is called Nadia',
          confidence: 100,
          source: 'admin',
          sourceMessageId: null,
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
      ],
    })

    const distilled = rows.find((row) => row.target === 'f1')
    expect(distilled?.editable).toBe(true)
    expect(distilled?.category).toBe('training')
    expect(distilled?.confidence).toBe(80)
    expect(distilled?.reappears).toBe(false)
    // The re-label rule is DESCRIBED on the row. There is no permission predicate any more, so
    // this sentence is the only place the operator learns what an edit does.
    expect(distilled?.note).toMatch(/re-labelled admin/i)

    const admin = rows.find((row) => row.target === 'f2')
    expect(admin?.editable).toBe(true)
    expect(admin?.note).toMatch(/admin/i)
    expect(admin?.note).not.toMatch(/re-labelled/i)
  })

  it('orders the table slots, then orphans, then promises, then the ledger', () => {
    const rows = buildMemoryRows({
      slots: [
        {
          key: 'favourite_shoe',
          value: 'Novablast 4',
          source: 'distilled',
          sourceMessageId: null,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
      promises: [
        {
          id: 'p1',
          text: 'a promise',
          condition: 'a condition',
          metric: 'free',
          target: null,
          targetKey: null,
          byDate: null,
          promisedOn: '2026-09-02',
          status: 'pending',
        },
      ],
      facts: [
        {
          id: 'f1',
          category: 'other',
          text: 'a fact',
          confidence: 100,
          source: 'admin',
          sourceMessageId: null,
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
      ],
    })

    const kinds = rows.map((row) => row.kind)
    const firstPromise = kinds.indexOf('promise')
    const firstFact = kinds.indexOf('fact')
    expect(kinds.slice(0, NON_STRUCTURED_SLOT_KEYS.length + 1).every((k) => k === 'slot')).toBe(
      true,
    )
    expect(firstPromise).toBe(NON_STRUCTURED_SLOT_KEYS.length + 1)
    expect(firstFact).toBeGreaterThan(firstPromise)
  })

  it('gives every row a unique rowId, because it is the React key and the result map key', () => {
    const rows = buildMemoryRows({
      ...empty,
      facts: [
        {
          id: 'f1',
          category: 'other',
          text: 'a',
          confidence: 100,
          source: 'admin',
          sourceMessageId: null,
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
      ],
    })
    expect(new Set(rows.map((row) => row.rowId)).size).toBe(rows.length)
  })
})

/* ── the structural half ────────────────────────────────────────────────────────────────────── */

const STORE = 'lib/admin/memoryStore.ts'
const ACTIONS = 'lib/admin/memoryActions.ts'
const MODEL = 'lib/admin/memoryModel.ts'
const TABLE = 'components/admin/MemoryTable.tsx'

describe("source: 'admin' cannot be forgotten", () => {
  it('routes every memory write through memoryStore, never straight at the query layer', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).not.toMatch(/from '@\/lib\/nina\/queries'/)
    for (const writer of [
      'upsertNinaMemorySlot',
      'appendNinaMemoryFacts',
      'updateNinaMemoryFact',
      'deleteNinaMemoryFact',
      'deleteNinaMemorySlot',
    ]) {
      expect(source).not.toContain(writer)
    }
  })

  it("spells source: 'admin' on all three write paths and never mentions the other label", () => {
    const source = readFileSync(STORE, 'utf8')
    expect(source).not.toContain("'distilled'")
    // The slot upsert, the fact append, and the fact update — which RE-LABELS, which is the whole
    // reason an edit to a distilled row is allowed at all.
    expect(source.match(/source: 'admin'/g)).toHaveLength(3)
    expect(source.match(/sourceMessageId: null/g)).toHaveLength(3)
  })

  it('re-labels an edited ledger row and drops its message pointer, in one statement', () => {
    const source = readFileSync(STORE, 'utf8')
    const update = source.slice(source.indexOf('export async function adminUpdateFact'))
    expect(update).toContain("source: 'admin'")
    expect(update).toContain('sourceMessageId: null')
  })

  it('keeps every memory-table write inside memoryStore, and nowhere else under lib/admin', () => {
    for (const entry of readdirSync('lib/admin', { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      if (entry.name === 'memoryStore.ts') continue
      const source = readFileSync(`lib/admin/${entry.name}`, 'utf8')
      expect(source, `lib/admin/${entry.name} must not write nina_memory_facts`).not.toMatch(
        /\.(insert|update|delete)\(\s*ninaMemoryFacts/,
      )
      expect(source, `lib/admin/${entry.name} must not write nina_memory_slots`).not.toMatch(
        /\.(insert|update|delete)\(\s*ninaMemorySlots/,
      )
    }
  })

  it('is not reachable from anything under lib/nina, so phase 5s case 14 stays true', () => {
    for (const entry of readdirSync('lib/nina', { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      const source = readFileSync(`lib/nina/${entry.name}`, 'utf8')
      expect(source).not.toContain('admin/memoryStore')
      expect(source).not.toContain('admin/memoryActions')
    }
  })

  it('keeps memoryModel client-safe: every import in it is a type import', () => {
    const source = readFileSync(MODEL, 'utf8')
    const imports = source.match(/^import .*$/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line.startsWith('import type ')).toBe(true)
  })

  it('keeps the table client-safe: it names neither zod nor a server-only module', () => {
    const source = readFileSync(TABLE, 'utf8')
    for (const banned of [
      "from 'zod'",
      '@/lib/db/schema',
      '@/lib/admin/memoryVocab',
      '@/lib/admin/memoryStore',
      '@/lib/admin/schema',
    ]) {
      expect(source, `${TABLE} must not import ${banned}`).not.toContain(banned)
    }
  })
})

describe('R1 — no confirmation, anywhere on this page', () => {
  it('has retired both card components rather than hiding them behind a flag', () => {
    expect(existsSync('components/admin/MemoryLedger.tsx')).toBe(false)
    expect(existsSync('components/admin/MemorySlots.tsx')).toBe(false)
  })

  it('never asks a second time', () => {
    const source = readFileSync(TABLE, 'utf8')
    for (const banned of [
      'window.confirm',
      'PURGE',
      '<dialog',
      'showModal',
      'Are you sure',
      'confirming',
    ]) {
      expect(source, `${TABLE} must not contain "${banned}"`).not.toContain(banned)
    }
  })

  it('has no retract, retire or purge left in the write side', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    for (const gone of [
      'retractFactAction',
      'retireSlotAction',
      'purgeFactAction',
      'recordSlotAsFactAction',
      'removePendingPromiseAction',
      'isPurgeConfirmed',
      'composeRetraction',
      'composeSlotRetirement',
    ]) {
      expect(source, `${ACTIONS} must not mention ${gone}`).not.toContain(gone)
    }
  })

  it('exports exactly the four actions the table calls', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = [...source.matchAll(/^export async function (\w+)/gm)].map(([, name]) => name)
    expect(exported.sort()).toEqual([
      'deleteMemoryRowAction',
      'editFactAction',
      'insertFactAction',
      'saveSlotAction',
    ])
  })

  it('keeps Zod at every one of those four boundaries — validation is not confirmation', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source.match(/\.safeParse\(input\)/g)).toHaveLength(4)
    // Anchored to the STATEMENT form (start of line, two-space body indent) so the numbered list in
    // this module's own header does not count as a fifth call site.
    expect(source.match(/^ {2}await requireAdmin\(\)$/gm)).toHaveLength(4)
  })
})
