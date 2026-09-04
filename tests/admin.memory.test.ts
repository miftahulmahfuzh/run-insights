import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_PURGE_CONFIRMATION,
  ADMIN_RETRACTION_TEXT_MAX,
  composeRetraction,
  composeSlotRetirement,
  factPermissions,
  isPurgeConfirmed,
} from '@/lib/admin/memoryModel'
import {
  buildSlotCards,
  canonicaliseSlotValue,
  slotEditKind,
  slotFactCategory,
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
 * The last four cases are STRUCTURAL: they read source files and assert an import boundary, the
 * same technique (and the same reason) as `tests/nina.distill.test.ts` case 14 — *a structural
 * guarantee that is only a comment decays.*
 */

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

describe('factPermissions — §2s one rule', () => {
  it('lets the admin edit a row he wrote', () => {
    const permissions = factPermissions({ source: 'admin', sourceMessageId: null })
    expect(permissions.canEditInPlace).toBe(true)
    expect(permissions.canRetract).toBe(true)
    expect(permissions.canPurge).toBe(true)
  })

  it('refuses in-place editing of a distilled row, and says to retract instead', () => {
    const permissions = factPermissions({ source: 'distilled', sourceMessageId: 'msg_1' })
    expect(permissions.canEditInPlace).toBe(false)
    expect(permissions.canRetract).toBe(true)
    expect(permissions.editNote).toMatch(/retract/i)
  })

  it('still refuses a distilled row whose source message is null', () => {
    // `source` is the discriminator, not the presence of a message id. A distilled row with a null
    // message id is a distiller bug, not an admin row.
    expect(factPermissions({ source: 'distilled', sourceMessageId: null }).canEditInPlace).toBe(
      false,
    )
  })
})

describe('composeRetraction — the sentence that makes an edit non-destructive', () => {
  it('quotes the original verbatim in a pure retraction', () => {
    const text = composeRetraction({
      original: 'he only runs on weekends',
      replacement: '',
      on: '2026-09-03',
    })
    expect(text).toContain('"he only runs on weekends"')
    expect(text).toContain('2026-09-03')
  })

  it('carries both the truth and the original in a correction', () => {
    const text = composeRetraction({
      original: 'he only runs on weekends',
      replacement: 'he runs Tuesday and Thursday',
      on: '2026-09-03',
    })
    expect(text).toContain('he runs Tuesday and Thursday')
    expect(text).toContain('"he only runs on weekends"')
  })

  it('collapses whitespace so a pasted multi-line original does not break the row', () => {
    const text = composeRetraction({
      original: 'he\n  only   runs\ton weekends ',
      replacement: '',
      on: '2026-09-03',
    })
    expect(text).toContain('"he only runs on weekends"')
  })

  it('stays inside ADMIN_RETRACTION_TEXT_MAX at the worst case', () => {
    const text = composeRetraction({
      original: 'x'.repeat(ADMIN_FACT_TEXT_MAX),
      replacement: 'y'.repeat(ADMIN_FACT_TEXT_MAX),
      on: '2026-09-03',
    })
    expect(text.length).toBeLessThanOrEqual(ADMIN_RETRACTION_TEXT_MAX)
  })
})

describe('composeSlotRetirement — §4s record', () => {
  it('names the key and quotes the final value', () => {
    const text = composeSlotRetirement({
      key: 'favourite_shoe',
      value: 'Novablast 4',
      reason: '',
      on: '2026-09-03',
    })
    expect(text).toContain('"favourite_shoe"')
    expect(text).toContain('"Novablast 4"')
    expect(text).not.toContain('Reason:')
  })

  it('appends the reason when one is given', () => {
    const text = composeSlotRetirement({
      key: 'favourite_shoe',
      value: 'Novablast 4',
      reason: 'not one of the nine keys',
      on: '2026-09-03',
    })
    expect(text).toContain('Reason: not one of the nine keys')
  })
})

describe('isPurgeConfirmed — the one lossy gate', () => {
  it('accepts the word, trimmed', () => {
    expect(isPurgeConfirmed(ADMIN_PURGE_CONFIRMATION)).toBe(true)
    expect(isPurgeConfirmed('  PURGE  ')).toBe(true)
  })

  it('rejects anything else, including the lowercase form', () => {
    expect(isPurgeConfirmed('purge')).toBe(false)
    expect(isPurgeConfirmed('')).toBe(false)
    expect(isPurgeConfirmed('PURGE PLEASE')).toBe(false)
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

  it('refuses a key outside the nine', () => {
    const result = canonicaliseSlotValue('favourite_shoe', 'Novablast 4')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/retire/i)
  })
})

describe('the slot cards', () => {
  it('renders all nine keys as empty cards when there is no row at all', () => {
    const cards = buildSlotCards([])
    expect(cards).toHaveLength(NINA_SLOT_KEYS.length)
    expect(cards.map((card) => card.key)).toEqual([...NINA_SLOT_KEYS])
    expect(cards.every((card) => card.present === false)).toBe(true)
    expect(cards.every((card) => card.origin === null)).toBe(true)
  })

  it('puts an orphaned key after the nine, marked and retire-only', () => {
    const cards = buildSlotCards([
      {
        key: 'favourite_shoe',
        value: 'Novablast 4',
        source: 'distilled',
        sourceMessageId: 'msg_1',
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ])
    expect(cards).toHaveLength(NINA_SLOT_KEYS.length + 1)
    const orphan = cards[cards.length - 1]
    expect(orphan?.key).toBe('favourite_shoe')
    expect(orphan?.inVocabulary).toBe(false)
    expect(orphan?.editKind).toBe('orphaned')
  })

  it('classifies the edit kind from phase 5s write policy, not from a key literal', () => {
    expect(slotEditKind('goals')).toBe('text')
    expect(slotEditKind('pending_promises')).toBe('structured')
    expect(slotEditKind('favourite_shoe')).toBe('orphaned')
  })

  it('reports phase 5s protection so the page can show it', () => {
    expect(slotProtection('goals', 'admin')).toBe('deferred')
    expect(slotProtection('pending_promises', 'admin')).toBe('sticky')
    expect(slotProtection('goals', 'distilled')).toBe('none')
    expect(slotProtection('goals', null)).toBe('none')
    expect(slotProtection('favourite_shoe', 'admin')).toBe('none')
  })

  it('maps a slot to phase 5s own fact category, and an orphan to other', () => {
    expect(slotFactCategory('injuries')).toBe('body')
    expect(slotFactCategory('favourite_shoe')).toBe('other')
  })
})

/* ── the structural half — §5 layer 3 ───────────────────────────────────────────────────────── */

const STORE = 'lib/admin/memoryStore.ts'
const ACTIONS = 'lib/admin/memoryActions.ts'
const MODEL = 'lib/admin/memoryModel.ts'

describe("source: 'admin' cannot be forgotten", () => {
  it('routes every memory write through memoryStore, never straight at phase 1', () => {
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

  it("spells source: 'admin' on both write paths and never mentions 'distilled'", () => {
    const source = readFileSync(STORE, 'utf8')
    expect(source).not.toContain("'distilled'")
    // The slot upsert and the fact append. `adminUpdateFact` needs none: only an already-admin row
    // is editable, so there is nothing to relabel.
    expect(source.match(/source: 'admin'/g)).toHaveLength(2)
    expect(source.match(/sourceMessageId: null/g)?.length).toBeGreaterThanOrEqual(2)
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
})
