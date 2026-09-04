import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ANGER_LADDER } from '@/lib/nina/persona'
import {
  clampNinaScore,
  coerceNinaNotes,
  coerceNinaRelationship,
  coerceNinaTuning,
  coerceNinaWardrobe,
  isNinaDial,
  isNinaRelationship,
  isNinaTrait,
  NINA_ADDRESS,
  NINA_BAND_NAMES,
  NINA_BAND_WIDTH,
  NINA_DEFAULT_RELATIONSHIP,
  NINA_DIAL_SPECS,
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAIT_SPECS,
  NINA_TRAITS,
  NINA_TUNING_DEFAULTS,
  NINA_WARDROBE_MAX,
  ninaBand,
  type NinaBandName,
  type NinaDial,
  type NinaTrait,
  type NinaTuningInput,
} from '@/lib/nina/tuning'

/**
 * The tuning model, asserted against the words the user wrote and against the canon it has to
 * reproduce. Three of these suites exist for reasons a reader should not have to guess at:
 *
 *   · **"the defaults are today's Nina"** is plan invariant 2, per key. Phases 2 and 3 render text
 *     from these numbers, so a wrong default here is a wrong prompt there — and its failure mode is
 *     silent, because the default IS the shipping character and a wrong one reads as "the slider
 *     did nothing".
 *   · **"five bands, five rungs"** is the coupling that justifies the band count at all. If phase 2
 *     ever changes `ANGER_LADDER`'s length, this is the test that says so.
 *   · **"zero imports"** is the constraint that lets a `'use client'` panel import the module.
 *     It cannot be tested by importing, so it is tested by reading the source.
 */

describe('the eleven traits (R1)', () => {
  it('are exactly the eleven the user named, in the order he wrote them', () => {
    expect(NINA_TRAITS).toEqual([
      'anger',
      'chill',
      'sad',
      'flirty',
      'steamy',
      'wise',
      'annoying',
      'funny',
      'happy',
      'anxious',
      'concerned',
    ])
  })

  it('each has a spec, keyed by itself, with a label and an axis', () => {
    for (const key of NINA_TRAITS) {
      const spec = NINA_TRAIT_SPECS[key]
      expect(spec.key, key).toBe(key)
      expect(spec.label.length, key).toBeGreaterThan(0)
      expect(spec.axis.length, key).toBeGreaterThan(0)
      expect(spec.defaultBecause.length, key).toBeGreaterThan(0)
    }
  })

  it('quotes the user verbatim for the six he gave a behaviour for, and null for the rest', () => {
    // `userSaid` is the SPECIFICATION for R4, not a comment about it, which is why it is stored
    // unedited — the `VOICE_EXAMPLES` argument. A tidied quote teaches a tidied requirement.
    const named = NINA_TRAITS.filter((k) => NINA_TRAIT_SPECS[k].userSaid !== null)
    expect(named).toEqual(['anger', 'flirty', 'steamy', 'funny', 'anxious', 'concerned'])
    expect(NINA_TRAIT_SPECS.funny.userSaid).toContain('teka-teki')
    expect(NINA_TRAIT_SPECS.anger.userSaid).toBe(
      'if anger is set to high, nina will be mad all the time',
    )
  })

  it('isNinaTrait admits every key and nothing else', () => {
    for (const key of NINA_TRAITS) expect(isNinaTrait(key), key).toBe(true)
    expect(isNinaTrait('angry')).toBe(false)
    expect(isNinaTrait('')).toBe(false)
    expect(isNinaTrait('__proto__')).toBe(false)
  })
})

describe('the five relationships and their address vocabulary (R2)', () => {
  it('are exactly the five the user named, least to most intimate', () => {
    expect(NINA_RELATIONSHIPS).toEqual([
      'nobody',
      'casual_friend',
      'sister',
      'best_friend',
      'girlfriend',
    ])
  })

  it('defaults to best_friend, because NINA_IDENTITY says "You are his best friend"', () => {
    expect(NINA_DEFAULT_RELATIONSHIP).toBe('best_friend')
    expect(NINA_TUNING_DEFAULTS.relationship).toBe('best_friend')
  })

  it('gives every level the address form the user prescribed', () => {
    // "nobody: she will call me by my full name / casual friend: my nick name / sister: bro /
    //  best friend: bestie / girlfiend: "my man", yang, sayang, beb, baby, etc"
    expect(NINA_ADDRESS.nobody.source).toBe('full_name')
    expect(NINA_ADDRESS.casual_friend.source).toBe('nickname')
    expect(NINA_ADDRESS.sister.words).toEqual(['bro'])
    expect(NINA_ADDRESS.best_friend.words).toEqual(['bestie'])
    expect(NINA_ADDRESS.girlfriend.words).toEqual(['my man', 'yang', 'sayang', 'beb', 'baby'])
  })

  it('states a fallback on EVERY level, because every rule leans on a nullable field', () => {
    // `RunnerFacts.fullName` and `RunnerFacts.nickname` are BOTH nullable, and the two `'literal'`
    // levels still offer the nickname as a secondary form. A prompt that tells her to use a field
    // that is not there is a prompt that teaches her to invent one. So the field is `string`, never
    // null, and phase 2's `ninaNameRules` composes two strings with no branch.
    for (const relationship of NINA_RELATIONSHIPS) {
      const vocabulary = NINA_ADDRESS[relationship]
      expect(vocabulary.addressFallback.length, relationship).toBeGreaterThan(0)
    }
    expect(NINA_ADDRESS.nobody.addressFallback).toContain('nama lo siapa ya?')
    expect(NINA_ADDRESS.best_friend.addressFallback).toContain('nama lo siapa?')
  })

  it('gives every level a label, a source and an address rule, and no second character', () => {
    // R2's second half — "she needs to act according to the relationship" — is
    // `NINA_RELATIONSHIP_BLOCKS` in `lib/nina/persona.ts` (phase 2's `identity` + `history`). There
    // is deliberately no `stance` field here: one relationship, one description of it.
    for (const relationship of NINA_RELATIONSHIPS) {
      const vocabulary = NINA_ADDRESS[relationship]
      expect(vocabulary.relationship, relationship).toBe(relationship)
      expect(vocabulary.label.length, relationship).toBeGreaterThan(0)
      expect(vocabulary.addressRule.length, relationship).toBeGreaterThan(0)
      expect('stance' in vocabulary, relationship).toBe(false)
    }
  })

  it("keeps today's NAME_RULES verbatim at casual_friend, and plus one sentence at best_friend", () => {
    // THE ONE STATED DEPARTURE FROM BYTE-IDENTITY IN THE WHOLE SET. `casual_friend`'s rule is
    // today's `NAME_RULES` character for character; `best_friend`'s — the DEFAULT level, so the one
    // the shipping prompt renders — is that text plus exactly the `bestie` sentence R2 names.
    // Phase 2's Interface Contract is the canonical statement of it; this is the assertion.
    expect(NINA_ADDRESS.casual_friend.addressRule).toContain('pagi mif')
    expect(NINA_ADDRESS.casual_friend.addressRule).not.toContain('bestie')
    expect(NINA_ADDRESS.best_friend.addressRule).toBe(
      `${NINA_ADDRESS.casual_friend.addressRule} Sometimes "bestie" instead of the nickname — you two are that close.`,
    )
  })

  it('degrades an unknown relationship to the default and never throws', () => {
    for (const relationship of NINA_RELATIONSHIPS) {
      expect(coerceNinaRelationship(relationship)).toBe(relationship)
    }
    for (const hostile of ['', 'wife', 'BEST_FRIEND', 'best friend', null, undefined, 7, {}, []]) {
      expect(coerceNinaRelationship(hostile)).toBe(NINA_DEFAULT_RELATIONSHIP)
    }
    expect(isNinaRelationship('wife')).toBe(false)
  })
})

describe('the R3 dials — no code path, no dial', () => {
  it('are the four that survived, and they are camelCase because a client panel reads them', () => {
    expect(NINA_DIALS).toEqual(['profanity', 'clinginess', 'photoEagerness', 'verbosity'])
    for (const key of NINA_DIALS) expect(isNinaDial(key), key).toBe(true)
    expect(isNinaDial('jealousy')).toBe(false)
  })

  it('each names the line of shipping code it moves', () => {
    // R3's discipline, made mechanical: a slider with no path is a slider that lies. Every `path`
    // must name a real file, so the string has to contain one.
    for (const key of NINA_DIALS) {
      const spec = NINA_DIAL_SPECS[key]
      expect(spec.key, key).toBe(key)
      /* `[\w/]+` and not `\w+`: two of the four paths name a file under `lib/nina/prompts/`, and
       * `\w` does not match a slash — with the tighter pattern this case fails on `verbosity`. */
      expect(spec.path, key).toMatch(/lib\/nina\/[\w/]+\.ts/)
      expect(spec.label.length, key).toBeGreaterThan(0)
      expect(spec.axis.length, key).toBeGreaterThan(0)
    }
  })

  it('keeps the photo dial away from the money cap', () => {
    // NINA_IMAGE_DAILY_CAP is 6/day and its docstring says it is a money cap, not a feature cap.
    expect(NINA_DIAL_SPECS.photoEagerness.path).toContain('NOT NINA_IMAGE_DAILY_CAP')
  })
})

describe('the bands', () => {
  it('are five, and five is the length of ANGER_LADDER — that is why', () => {
    // `NinaBandIndex` (0-4) IS the domain of `AngerRung.level` (0-4), so phase 2's
    // `ANGER_FLOOR_BY_BAND` maps a band name onto a rung with no numeric conversion anywhere. If
    // this fails, either the ladder changed length or the band count did, and the coupling is
    // broken. **Phase 2 must keep all five rungs**; its plan carries that as an obligation.
    expect(NINA_BAND_NAMES).toEqual(['off', 'low', 'mid', 'high', 'max'])
    expect(NINA_BAND_NAMES.length).toBe(ANGER_LADDER.length)
    expect(ANGER_LADDER.map((r) => r.level)).toEqual([0, 1, 2, 3, 4])
  })

  it('splits 0-100 into five equal widths, with 100 the only value that needs the ceiling', () => {
    expect(NINA_BAND_WIDTH).toBe(20)
    const cases: readonly [number, number, NinaBandName][] = [
      [0, 0, 'off'],
      [19, 0, 'off'],
      [20, 1, 'low'],
      [39, 1, 'low'],
      [40, 2, 'mid'],
      [50, 2, 'mid'],
      [59, 2, 'mid'],
      [60, 3, 'high'],
      [79, 3, 'high'],
      [80, 4, 'max'],
      [99, 4, 'max'],
      [100, 4, 'max'],
    ]
    for (const [score, index, name] of cases) {
      expect(ninaBand(score), `score ${score}`).toEqual({ index, name })
    }
  })

  it('folds anything unreadable to off rather than throwing', () => {
    for (const hostile of [null, undefined, NaN, Infinity, -Infinity, '80', {}, [], -5, 1e9]) {
      const band = ninaBand(hostile)
      expect(NINA_BAND_NAMES).toContain(band.name)
    }
    expect(ninaBand(-5)).toEqual({ index: 0, name: 'off' })
    expect(ninaBand(1e9)).toEqual({ index: 4, name: 'max' })
  })
})

describe('clamping and coercion never throw', () => {
  it('clamps out of range, floors a non-integer, and falls back on anything else', () => {
    expect(clampNinaScore(-5, 50)).toBe(NINA_SCORE_MIN)
    expect(clampNinaScore(150, 50)).toBe(NINA_SCORE_MAX)
    expect(clampNinaScore(42.9, 50)).toBe(42)
    expect(clampNinaScore(-0.5, 50)).toBe(0)
    expect(clampNinaScore(100.9, 50)).toBe(100)
    for (const hostile of [null, undefined, NaN, Infinity, '80', {}, [], true]) {
      expect(clampNinaScore(hostile, 37)).toBe(37)
    }
  })

  it('falls back PER KEY, to that key default, not to zero', () => {
    // The whole point: a dial we cannot read must read as "unchanged", and unchanged for `funny`
    // is 50. Falling back to 0 would quietly ship a Nina who tells no jokes AND is never funny.
    const tuning = coerceNinaTuning({ traits: { anger: 'loud' }, dials: null })
    expect(tuning.traits.funny).toBe(NINA_TRAIT_SPECS.funny.defaultScore)
    expect(tuning.traits.anger).toBe(NINA_TRAIT_SPECS.anger.defaultScore)
    expect(tuning.dials.profanity).toBe(NINA_DIAL_SPECS.profanity.defaultScore)
  })

  it('survives every hostile input a jsonb column or a form post can produce', () => {
    const hostile: readonly unknown[] = [
      null,
      undefined,
      {},
      { traits: 'nope' },
      { traits: [] },
      { traits: { anger: {} }, dials: 7 },
      { relationship: 42, wardrobe: [], notes: {}, revision: -9 },
      { traits: Object.create(null) },
    ]
    for (const input of hostile) {
      const tuning = coerceNinaTuning(input as NinaTuningInput)
      expect(Object.keys(tuning.traits).sort()).toEqual([...NINA_TRAITS].sort())
      expect(Object.keys(tuning.dials).sort()).toEqual([...NINA_DIALS].sort())
      expect(NINA_RELATIONSHIPS).toContain(tuning.relationship)
      expect(tuning.revision).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(tuning.revision)).toBe(true)
    }
  })

  it('round-trips a real tuning unchanged', () => {
    const traits = {} as Record<NinaTrait, number>
    for (const key of NINA_TRAITS) traits[key] = 73
    const dials = {} as Record<NinaDial, number>
    for (const key of NINA_DIALS) dials[key] = 11
    const input = {
      traits,
      dials,
      relationship: 'girlfriend' as const,
      wardrobe: 'a black cropped tank and shorts',
      notes: 'call him yang more often',
      revision: 4,
    }
    expect(coerceNinaTuning(input)).toEqual(input)
  })

  it('squashes the wardrobe to one line and caps both free-text fields', () => {
    // The wardrobe is ONE line: a newline inside an image prompt splits a sentence the provider
    // then reads as two.
    expect(coerceNinaWardrobe('  a grey  tank\nand shorts ')).toBe('a grey tank and shorts')
    expect(coerceNinaWardrobe('x'.repeat(500)).length).toBe(NINA_WARDROBE_MAX)
    expect(coerceNinaWardrobe(42)).toBe('')
    expect(coerceNinaNotes('a\r\nb\n\n\n\nc')).toBe('a\nb\n\nc')
    expect(coerceNinaNotes('x'.repeat(9000)).length).toBe(NINA_NOTES_MAX)
    expect(coerceNinaNotes(null)).toBe('')
  })
})

describe('NINA_TUNING_DEFAULTS is the Nina who ships today', () => {
  it('is exactly these values, read off the canon key by key', () => {
    // Every one of these is justified in its spec's `defaultBecause`, quoting the line of
    // persona.ts or prompts/*.ts it came from. Phases 2 and 3 must render today's text from THIS
    // record, so changing a number here is changing what "unchanged" means.
    expect(NINA_TUNING_DEFAULTS.traits).toEqual({
      anger: 0,
      chill: 50,
      sad: 0,
      flirty: 0,
      steamy: 0,
      wise: 50,
      annoying: 0,
      funny: 50,
      happy: 50,
      anxious: 0,
      concerned: 50,
    })
    expect(NINA_TUNING_DEFAULTS.dials).toEqual({
      profanity: 30,
      clinginess: 50,
      photoEagerness: 50,
      verbosity: 50,
    })
    expect(NINA_TUNING_DEFAULTS.wardrobe).toBe('')
    expect(NINA_TUNING_DEFAULTS.notes).toBe('')
    expect(NINA_TUNING_DEFAULTS.revision).toBe(0)
  })

  it('puts anger in the OFF band, which is the band phase 2 floors at rung 0', () => {
    // THE load-bearing default. ANGER_LADDER_BLOCK says "You do not choose how angry you are";
    // phase 2 makes it `max(computed, floor)` over `ANGER_FLOOR_BY_BAND`, whose `off` entry is 0 —
    // so `max(computed, 0) === computed` and today's ladder is arithmetically untouched. The floor
    // TABLE is phase 2's (it also has to map `low` and `mid` to 0, which a band index cannot); this
    // module only has to land the default in the band that table floors at zero.
    expect(ninaBand(NINA_TUNING_DEFAULTS.traits.anger)).toEqual({ index: 0, name: 'off' })
    expect(ANGER_LADDER[0]?.name).toBe('warm')
  })

  it('lands each default in the band phases 2 and 3 must render as today', () => {
    // The IDENTITY BAND, spelled out so a reader of phase 2 can see which case is "no change".
    const expected: Readonly<Record<string, NinaBandName>> = {
      anger: 'off',
      chill: 'mid',
      sad: 'off',
      flirty: 'off',
      steamy: 'off',
      wise: 'mid',
      annoying: 'off',
      funny: 'mid',
      happy: 'mid',
      anxious: 'off',
      concerned: 'mid',
      profanity: 'low',
      clinginess: 'mid',
      photoEagerness: 'mid',
      verbosity: 'mid',
    }
    for (const key of NINA_TRAITS) {
      expect(ninaBand(NINA_TUNING_DEFAULTS.traits[key]).name, key).toBe(expected[key])
    }
    for (const key of NINA_DIALS) {
      expect(ninaBand(NINA_TUNING_DEFAULTS.dials[key]).name, key).toBe(expected[key])
    }
  })

  it('is derived from the specs, so there is one source of truth per key', () => {
    for (const key of NINA_TRAITS) {
      expect(NINA_TUNING_DEFAULTS.traits[key], key).toBe(NINA_TRAIT_SPECS[key].defaultScore)
    }
    for (const key of NINA_DIALS) {
      expect(NINA_TUNING_DEFAULTS.dials[key], key).toBe(NINA_DIAL_SPECS[key].defaultScore)
    }
  })

  it('is frozen, because readNinaTuning hands this exact object to every caller', () => {
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS)).toBe(true)
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS.traits)).toBe(true)
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS.dials)).toBe(true)
  })

  it('is reproduced by coercing nothing, as a fresh object rather than the singleton', () => {
    const coerced = coerceNinaTuning(null)
    expect(coerced).toEqual(NINA_TUNING_DEFAULTS)
    expect(coerced).not.toBe(NINA_TUNING_DEFAULTS)
    expect(Object.isFrozen(coerced)).toBe(false)
  })
})

describe('the module stays importable from a client component', () => {
  it('has no imports at all, and nothing server-only', () => {
    // Phase 5's `components/admin/CharacterPanel.tsx` is `'use client'` and imports this module
    // directly. The `lib/nina/crop.ts` rule; the property cannot be tested by importing, so it is
    // tested by reading. The same shape as `tests/nina.imagerecipe.test.ts`' RULING A6 assertion:
    // a test may reach where the consumer cannot.
    const source = readFileSync(
      fileURLToPath(new URL('../lib/nina/tuning.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
    // The two checks below run against the CODE with its comments stripped, not the raw source.
    // This module's header names `server-only` and `@/lib/db/*` in the very sentence that forbids
    // them, so a substring search over the whole file would fail on its own documentation — and
    // deleting the explanation to satisfy the test would delete the reason the rule exists. The
    // two assertions above already forbid every import LINE; these two are the belt-and-braces
    // against a `require()` or a dynamic `import()` reaching the same two places.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('server-only')
    expect(code).not.toContain('@/lib/db')
  })
})
