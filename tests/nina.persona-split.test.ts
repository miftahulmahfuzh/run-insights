import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as persona from '@/lib/nina/persona'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE PERSONA SPLIT'S STRUCTURAL CONTRACT.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On 2026-09-12 the 1723-line `lib/nina/persona.ts` monolith became a barrel over cohesive
 * modules under `lib/nina/persona/` — the persona audit of the same day found a missing
 * relationship level in the doc, and a file this size is exactly why such gaps hide. A split
 * has two ways to fail silently, and each has its own guard here:
 *
 *   1. **The surface drifts.** A name moves into a module and nobody re-exports it, or a
 *      re-export is renamed, and a consumer breaks — or worse, a consumer is "fixed" to deep-
 *      import a module and the barrel stops being the contract. So the barrel's runtime export
 *      set is pinned to the monolith's, exactly, additions included: adding a name to her
 *      public surface is a deliberate edit, the same way `NINA_SECTION_TITLES` makes a new
 *      prompt section one.
 *
 *   2. **The modules grow apart.** A module starts importing the server graph (`server-only`,
 *      `next/*`, the db) and `/admin/personality`'s `'use client'` preview — the property the
 *      monolith's header promises — dies without a diff that says so. So every import in every
 *      persona file must be relative: sibling modules, `../tuning`, `../imageprefs`, and
 *      nothing else.
 *
 * What is deliberately NOT re-tested here: the text. Every byte of her rendered prompt was
 * already pinned by `tests/nina.prompts.test.ts` (the four-render snapshot, the default-render
 * identity, the per-dial matrix) — those are the tests that prove the split changed nothing.
 * This file proves the SHAPE the split left behind is the shape it claimed.
 */

/** The barrel, and the module directory it fronts. */
const BARREL = fileURLToPath(new URL('../lib/nina/persona.ts', import.meta.url))
const DIR = fileURLToPath(new URL('../lib/nina/persona/', import.meta.url))

/**
 * The modules, one per banner-section concern of the old monolith. Sorted, because this list is
 * compared against `readdirSync` and the directory does not promise an order.
 */
const MODULES = [
  'appearance',
  'bands',
  'identity',
  'instructor',
  'anger',
  'verbosity',
  'never-say',
  'tuning-blocks',
  'voice',
].sort()

/**
 * The monolith's runtime surface, captured from the pre-split file (git
 * `token-maxxing-2026-09-12-nina-persona-split`~1), grouped by the module that now owns each
 * name. Thirty-six values; the four types are pinned separately below, since a type does not
 * exist at runtime to be walked.
 */
const EXPECTED_RUNTIME = [
  /* bands.ts — the R4 gate layer, shared by every other module */
  'anyTurnedUp',

  /* identity.ts — who she is, and who she is TO HIM */
  'NINA_EXPERTISE',
  'NINA_NOT_A_DOCTOR',
  'ninaIdentity',
  'ninaNameRules',

  /* appearance.ts — the image canon */
  'NINA_APPEARANCE',
  'NINA_BODY',
  'NINA_BODY_AVATAR',
  'NINA_BODY_FACTS',
  'NINA_BODY_SENTENCES',
  'NINA_DEFAULT_OUTFIT_VALUE',
  'NINA_FACE',
  'ninaAppearance',
  'withSentenceStop',

  /* voice.ts — the registers and the verbatim example lines */
  'ENGLISH_REGISTER',
  'GIRLFRIEND_VOICE_EXAMPLES',
  'JAKARTA_REGISTER',
  'JAKARTA_SLANG',
  'JAKARTA_SLANG_BLOCK',
  'VOICE_EXAMPLES',
  'VOICE_EXAMPLES_BLOCK',
  'ninaGirlfriendVoiceBlock',
  'ninaManjaRegisterBlock',

  /* instructor.ts — the coaching register */
  'INSTRUCTOR_COACHING',
  'isInstructor',
  'ninaInstructorCoachingBlock',

  /* anger.ts — the computed ladder and its floor and ceiling */
  'ANGER_LADDER',
  'ninaAngerCeiling',
  'ninaAngerFloor',
  'ninaAngerLadderBlock',

  /* verbosity.ts — the floor `horny` puts under `verbosity` */
  'VERBOSITY_FLOOR_BY_HORNY_BAND',
  'ninaEffectiveVerbosity',

  /* never-say.ts — the illusion-breaking phrases and their repeals */
  'BODY_REPEALED_BY',
  'ninaNeverSayBlock',

  /* tuning-blocks.ts — the trait and dial paragraphs, and the operator's own words */
  'ninaOperatorNotesBlock',
  'ninaTraitsBlock',
]

/** The type surface, which a namespace walk cannot see. */
const EXPECTED_TYPES = ['AngerRung', 'NinaAppearanceDetail', 'SlangEntry', 'VoiceExample']

/** Comments stripped, the same accommodation `tests/nina.prompts.test.ts`'s R4 scan makes. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('the persona split — the shape the monolith left behind', () => {
  it('is one module per concern, with no orphans and no stragglers', () => {
    /* EXACT set equality, additions included: an orphan file in this directory is not scanned
     * by the R4 gate (which discovers `*.ts` here), is not covered by this contract, and is
     * exactly how a second home for the canon begins. Make adding a module a deliberate edit. */
    expect(
      readdirSync(DIR)
        .filter((f) => f.endsWith('.ts'))
        .sort(),
    ).toEqual(MODULES.map((m) => `${m}.ts`))
  })

  it('makes persona.ts a barrel — re-exports and nothing else', () => {
    /* After comments are stripped, no line may OPEN a declaration. (Not "every line must start
     * with import/export": a multi-line `export { … }` continues on lines that are bare names,
     * and those are re-exports, not definitions.) The day a `const` or a `function` sneaks back
     * into the barrel is the day the module boundaries become fiction while the directory keeps
     * pretending otherwise — the monolith reforming in place. */
    const code = stripComments(readFileSync(BARREL, 'utf8'))
    const offenders = code
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => /^(const|let|var|function|interface)\b/.test(line) || /^type\s+\w/.test(line),
      )
    expect(offenders, 'the barrel defines symbols of its own').toEqual([])
  })

  it('re-exports the monolith’s whole runtime surface, exactly — nothing dropped, nothing added', () => {
    const exported = new Set(Object.keys(persona))
    const expected = new Set(EXPECTED_RUNTIME)
    /* Both directions, each with a readable failure: a dropped name names itself first (the
     * common case — a module grew a new export nobody re-exported), then the additions. */
    const dropped = [...expected].filter((name) => !exported.has(name))
    const added = [...exported].filter((name) => !expected.has(name))
    expect(dropped, 'names the barrel no longer exports').toEqual([])
    expect(added, 'names the barrel exports that the contract does not declare').toEqual([])
  })

  it('declares the type surface too', () => {
    const code = stripComments(readFileSync(BARREL, 'utf8'))
    for (const type of EXPECTED_TYPES) {
      expect(code, `the barrel does not re-export the type ${type}`).toMatch(
        new RegExp(`export type \\{[^}]*\\b${type}\\b[^}]*\\}`),
      )
    }
  })

  it('imports nothing but siblings and plain data modules — client-importable forever', () => {
    /* The monolith's header promises `/admin/personality` can import the canon from a
     * `'use client'` module. That property is one `import { db }` away from dead, so it is
     * structural here: EVERY import, in the barrel and in every module, is relative. New
     * canon goes in as types and plain data, or it does not go in. */
    const files = [BARREL, ...MODULES.map((m) => `${DIR}${m}.ts`)]
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'))
      const specs = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
      for (const spec of specs) {
        expect(spec, `${file} imports ${spec}`).toMatch(/^\.\.?\//)
      }
    }
  })
})
