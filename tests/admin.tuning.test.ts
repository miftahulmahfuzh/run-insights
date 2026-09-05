import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ninaTuningResetSchema, ninaTuningWriteSchema } from '@/lib/admin/schema'
import {
  changedTuningFields,
  hasRelationshipCopy,
  hasTuningCopy,
  loudestDials,
  prettifyKey,
  relationshipCopy,
  toTuningDraft,
  tuningCopy,
  tuningDraftEquals,
  type TuningDraft,
} from '@/lib/admin/tuningModel'
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_DEFAULTS,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'

/**
 * `/admin/nina`'s character panel — the testable surface.
 *
 * `vitest.config.ts` runs `environment: 'node'` and includes no `.tsx`, so there is no render
 * here. That is not a gap: everything about this panel that could be wrong in a way a human would
 * not notice is a pure function in `lib/admin/tuningModel.ts` or a Zod shape in
 * `lib/admin/schema.ts`, which is why they are there.
 *
 * The last five cases are STRUCTURAL — they read source files and assert a boundary, the technique
 * `tests/admin.memory.test.ts` uses for the same reason: *a structural guarantee that is only a
 * comment decays.*
 *
 * `NINA_WARDROBE_MAX` and `NINA_NOTES_MAX` are imported from `@/lib/nina/tuning` rather than from
 * the admin model. The draft of this phase declared a second pair (240 / 1000) against phase 1's
 * 200 / 2000; reconciliation cut them, so there is one home for each bound and this file reads it.
 */

const DEFAULTS: TuningDraft = toTuningDraft(NINA_TUNING_DEFAULTS)

/** A valid save payload, with whatever overrides a case needs. */
function payload(overrides: Partial<TuningDraft> = {}) {
  return { userId: 'user_1', ...DEFAULTS, ...overrides }
}

describe('toTuningDraft — the read-side seam', () => {
  it('carries every trait and every dial phase 1 declares', () => {
    for (const key of NINA_TRAITS) {
      expect(DEFAULTS.traits[key]).toBe(NINA_TUNING_DEFAULTS.traits[key])
    }
    for (const key of NINA_DIALS) {
      expect(DEFAULTS.dials[key]).toBe(NINA_TUNING_DEFAULTS.dials[key])
    }
    expect(DEFAULTS.relationship).toBe(NINA_TUNING_DEFAULTS.relationship)
    expect(DEFAULTS.wardrobe).toBe(NINA_TUNING_DEFAULTS.wardrobe)
    expect(DEFAULTS.notes).toBe(NINA_TUNING_DEFAULTS.notes)
  })

  it('copies the records, so a draft edit cannot reach into the row it came from', () => {
    const draft = toTuningDraft(NINA_TUNING_DEFAULTS)
    draft.traits[NINA_TRAITS[0]] = 99
    expect(NINA_TUNING_DEFAULTS.traits[NINA_TRAITS[0]]).not.toBe(99)
  })

  it('does not carry the revision — the panel takes that as its own prop', () => {
    expect('revision' in DEFAULTS).toBe(false)
  })
})

describe('the copy is complete for phase 1s vocabulary', () => {
  // RECONCILED: this now passes BY CONSTRUCTION, because `tuningCopy` reads
  // `NINA_TRAIT_SPECS` / `NINA_DIAL_SPECS` / `NINA_ADDRESS` rather than a local table — so a dial
  // phase 1 adds arrives with its label and its hint already written. The cases stay anyway,
  // because they are what would catch a spec entry landing with an empty `label` or `axis`, and
  // because the fallback below must never be how an unlabelled slider ships.
  it('has a real label and hint for all eleven traits', () => {
    expect(NINA_TRAITS).toHaveLength(11)
    for (const key of NINA_TRAITS) {
      expect(hasTuningCopy(key), `no copy for trait ${key}`).toBe(true)
      expect(tuningCopy(key).label.length).toBeGreaterThan(0)
      expect(tuningCopy(key).hint.length).toBeGreaterThan(0)
    }
  })

  it('has a real label and hint for every R3 dial', () => {
    for (const key of NINA_DIALS) {
      expect(hasTuningCopy(key), `no copy for dial ${key}`).toBe(true)
      expect(tuningCopy(key).label.length).toBeGreaterThan(0)
      expect(tuningCopy(key).hint.length).toBeGreaterThan(0)
    }
  })

  it('names the address form for all five relationships', () => {
    expect(NINA_RELATIONSHIPS).toHaveLength(5)
    for (const value of NINA_RELATIONSHIPS) {
      expect(hasRelationshipCopy(value), `no copy for relationship ${value}`).toBe(true)
      expect(relationshipCopy(value).hint.length).toBeGreaterThan(0)
    }
  })

  /*
   * Phase 2 flagged this one by name and it is the one hint that could ship a lie:
   * `ANGER_CEILING_BY_BAND.off` is 4, so there is NO setting that means "she never gets angry" —
   * the quietest is band `low`. The panel reads phase 1's `axis`, which says the ladder is
   * untouched at 0 rather than switched off, and this case is what keeps a well-meaning edit from
   * writing an off switch onto the page.
   */
  it('never promises an off switch for anger', () => {
    const hint = tuningCopy('anger').hint.toLowerCase()
    for (const lie of ['never angry', 'never gets angry', 'no anger', 'switched off']) {
      expect(hint, `anger's hint promises "${lie}"`).not.toContain(lie)
    }
  })

  it('falls back to a readable label for a key it has never heard of', () => {
    expect(tuningCopy('some_new_dial').label).toBe('Some new dial')
    expect(tuningCopy('some_new_dial').hint).toBe('')
    expect(prettifyKey('casual_friend')).toBe('Casual friend')
  })
})

describe('changedTuningFields — what the operator sees as unsaved', () => {
  it('is empty for two identical drafts', () => {
    expect(changedTuningFields(DEFAULTS, DEFAULTS)).toEqual([])
    expect(tuningDraftEquals(DEFAULTS, toTuningDraft(NINA_TUNING_DEFAULTS))).toBe(true)
  })

  it('names a moved dial by its dotted path', () => {
    const key = NINA_TRAITS[0]
    const moved: TuningDraft = {
      ...DEFAULTS,
      traits: { ...DEFAULTS.traits, [key]: (DEFAULTS.traits[key] ?? 0) + 1 },
    }
    expect(changedTuningFields(moved, DEFAULTS)).toEqual([`traits.${key}`])
    expect(tuningDraftEquals(moved, DEFAULTS)).toBe(false)
  })

  it('names the three non-numeric fields', () => {
    const edited: TuningDraft = {
      ...DEFAULTS,
      relationship: 'something_else',
      wardrobe: 'short pants',
      notes: 'she knows about the half marathon',
    }
    expect(changedTuningFields(edited, DEFAULTS)).toEqual(['relationship', 'wardrobe', 'notes'])
  })

  it('counts a key that exists on one side only', () => {
    const missing: TuningDraft = { ...DEFAULTS, traits: {} }
    expect(changedTuningFields(missing, DEFAULTS)).toHaveLength(NINA_TRAITS.length)
  })
})

describe('loudestDials — what the hub card prints', () => {
  it('is empty when nothing was moved, so the card can say so', () => {
    expect(loudestDials(DEFAULTS, DEFAULTS)).toEqual([])
  })

  /*
   * DRIFT, and it is invariant 2's non-uniformity biting exactly where the invariant says it will.
   * This case was written as `NINA_TRAITS[0] -> NINA_SCORE_MIN`, but `NINA_TRAITS[0]` is `anger`
   * and anger's default IS 0 — so the "move" was a no-op, the key never entered the result, and
   * the case asserted a two-element list against a one-element one. It is rewritten to the thing
   * it was always trying to prove, which needs two dials whose value order and whose distance
   * order genuinely DISAGREE: a trait that ships at 0 pushed to 90 (delta 90, value 90) against
   * one that ships at 50 pushed to 100 (delta 50, value 100). Ranking by value would put the
   * second first; ranking by distance puts the first first, and that is the contract.
   */
  it('ranks by distance from the default rather than by value', () => {
    const shipsAtZero = NINA_TRAITS.find((key) => DEFAULTS.traits[key] === NINA_SCORE_MIN)
    const shipsHigher = NINA_TRAITS.find((key) => (DEFAULTS.traits[key] ?? 0) > NINA_SCORE_MIN)
    expect(shipsAtZero, 'phase 1 ships six traits at 0').toBeDefined()
    expect(shipsHigher, 'phase 1 ships eight keys above 0').toBeDefined()
    if (shipsAtZero === undefined || shipsHigher === undefined) return

    const draft: TuningDraft = {
      ...DEFAULTS,
      traits: { ...DEFAULTS.traits, [shipsAtZero]: 90, [shipsHigher]: NINA_SCORE_MAX },
    }

    const [loudest, quieter] = loudestDials(draft, DEFAULTS, 2)
    expect([loudest?.key, quieter?.key]).toEqual([shipsAtZero, shipsHigher])

    /* The discriminating half: by VALUE the order is the other way round. */
    expect(loudest?.value).toBeLessThan(quieter?.value ?? 0)
    expect(loudest?.delta).toBeGreaterThan(quieter?.delta ?? 0)
  })

  it('caps at the limit', () => {
    const draft: TuningDraft = {
      ...DEFAULTS,
      traits: Object.fromEntries(
        NINA_TRAITS.map((key) => [
          key,
          DEFAULTS.traits[key] === NINA_SCORE_MAX ? NINA_SCORE_MIN : NINA_SCORE_MAX,
        ]),
      ),
    }
    expect(loudestDials(draft, DEFAULTS, 3)).toHaveLength(3)
  })
})

describe('ninaTuningWriteSchema — the boundary', () => {
  it('accepts the default tuning as a payload', () => {
    expect(ninaTuningWriteSchema.safeParse(payload()).success).toBe(true)
  })

  it('refuses a missing trait rather than defaulting it', () => {
    /* Deleted off a copy rather than destructured-and-discarded: the `{ [k]: _dropped, ...rest }`
     * idiom leaves an unused binding, and a new lint warning is noise the next phase has to read. */
    const rest = { ...DEFAULTS.traits }
    delete rest[NINA_TRAITS[0]]
    expect(ninaTuningWriteSchema.safeParse(payload({ traits: rest })).success).toBe(false)
  })

  it('refuses a dial key nobody declared, instead of stripping it', () => {
    const traits = { ...DEFAULTS.traits, flirtyy: 90 }
    expect(ninaTuningWriteSchema.safeParse(payload({ traits })).success).toBe(false)
  })

  it('refuses a value outside phase 1s own range, and a fractional one', () => {
    const key = NINA_TRAITS[0]
    for (const bad of [NINA_SCORE_MIN - 1, NINA_SCORE_MAX + 1, 42.5, Number.NaN]) {
      const traits = { ...DEFAULTS.traits, [key]: bad }
      expect(ninaTuningWriteSchema.safeParse(payload({ traits })).success, `${bad}`).toBe(false)
    }
  })

  it('refuses a relationship outside the five', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ relationship: 'wife' })).success).toBe(false)
  })

  it('bounds the wardrobe and the notes, and accepts both empty', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ wardrobe: '', notes: '' })).success).toBe(true)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ wardrobe: 'x'.repeat(NINA_WARDROBE_MAX + 1) }))
        .success,
    ).toBe(false)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX + 1) })).success,
    ).toBe(false)
  })

  /*
   * The panel's `maxLength` and this schema must be the SAME number, or the textarea refuses a
   * keystroke the action would have accepted (or, worse, the other way round). One home, two
   * readers — so assert that the bound this file imports is the bound phase 1 declares.
   */
  it('accepts a value at exactly each bound', () => {
    expect(
      ninaTuningWriteSchema.safeParse(payload({ wardrobe: 'x'.repeat(NINA_WARDROBE_MAX) })).success,
    ).toBe(true)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX) })).success,
    ).toBe(true)
  })

  it('refuses an empty userId, which requireAdmin would never produce', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ userId: '' } as never)).success).toBe(false)
    expect(ninaTuningResetSchema.safeParse({ userId: '' }).success).toBe(false)
    expect(ninaTuningResetSchema.safeParse({ userId: 'user_1' }).success).toBe(true)
  })
})

/* ── the structural half ─────────────────────────────────────────────────────────────────────── */

const ACTIONS = 'lib/admin/tuningActions.ts'
const MODEL = 'lib/admin/tuningModel.ts'
const PANEL = 'components/admin/CharacterPanel.tsx'
const SLIDER = 'components/admin/DialSlider.tsx'
const ALBUM_PAGE = 'app/admin/nina/page.tsx'

/**
 * A source file with its block comments removed.
 *
 * DRIFT, and it is the plan contradicting itself rather than the code drifting. Steps 1, 5 and 6
 * REQUIRE these files to carry docstrings that name `server-only` (*"Nothing `server-only`, and
 * nothing that reaches drizzle"*) and `runNinaTurn` (*"the preview is deliberately the pure
 * assembler and never `runNinaTurn`"*), and Step 9 then forbids those exact substrings anywhere in
 * the same files. Both cannot hold on a raw `String.contains`.
 *
 * The guard is NOT relaxed — it is narrowed to the thing it was always about. A comment that says
 * *"this file must not import `server-only`"* is the boundary being documented, not crossed; an
 * `import 'server-only'` is the boundary being crossed. Scanning code only is strictly stronger
 * than scanning prose for a real import or a real call, because it cannot be satisfied by a
 * rewording, and it is what makes the assertion mean what its name says.
 */
function codeOnly(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('the gate cannot be forgotten', () => {
  it('opens every action with requireAdmin(), above any use of an argument', () => {
    const bodies = readFileSync(ACTIONS, 'utf8').split('export async function ').slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      const gate = body.indexOf('await requireAdmin()')
      const zod = body.indexOf('.safeParse(')
      expect(gate).toBeGreaterThan(-1)
      expect(zod).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(zod)
    }
  })

  it('gates the page before it reads the tuning', () => {
    const source = readFileSync(ALBUM_PAGE, 'utf8')
    expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('readNinaTuning('))
  })
})

describe('one save, not sixteen — plan invariant 11', () => {
  it('exports exactly two actions: the whole-tuning save and the reset', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = source.match(/^export async function (\w+)/gm) ?? []
    expect(exported).toHaveLength(2)
    expect(source).toContain('export async function saveNinaTuningAction')
    expect(source).toContain('export async function resetNinaTuningAction')
  })

  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaTuning(')
    expect(source).toContain("revalidatePath('/admin/nina')")
  })
})

describe('the client half stays client-safe', () => {
  it('keeps tuningModel client-safe: its only import is phase 1s zero-import module', () => {
    /* Value imports are fine — the labels and the words come from `tuning.ts`, which has NO imports
     * of its own (phase 1 asserts that by reading its source). What must never appear here is a
     * second module: `server-only`, drizzle, or anything under `@/lib/db`. */
    const source = codeOnly(MODEL)
    const imports = source.match(/^import[\s\S]*?from '([^']+)'/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line).toContain("from '@/lib/nina/tuning'")
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
  })

  it("declares 'use client' and reaches nothing server-only", () => {
    for (const path of [PANEL, SLIDER]) {
      expect(readFileSync(path, 'utf8').startsWith("'use client'")).toBe(true)
      const source = codeOnly(path)
      for (const forbidden of [
        'server-only',
        '@/lib/nina/queries',
        '@/lib/db/',
        '@/lib/env',
        '@/lib/admin/requireAdmin',
        '@/components/ui/AppShell',
      ]) {
        expect(source, `${path} reaches ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

describe('the preview is an assembly, not a call — plan invariant 5', () => {
  it('assembles the prompt with the pure builder and awaits no model entry point', () => {
    const source = codeOnly(ALBUM_PAGE)
    expect(source).toContain('buildNinaSystemPrompt(')
    for (const guarded of [
      'runNinaTurn',
      'distillNinaMemory',
      'describeNinaImage',
      'resolveNinaPromises',
      'getOrCreateInsight',
    ]) {
      expect(source, `the album page names ${guarded}`).not.toContain(guarded)
    }
  })
})
