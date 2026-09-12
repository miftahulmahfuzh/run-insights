import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PATTERN_CODES } from '@/lib/nina/patterns'
import {
  ANGER_LADDER,
  GIRLFRIEND_VOICE_EXAMPLES,
  INSTRUCTOR_COACHING,
  JAKARTA_SLANG,
  NINA_APPEARANCE,
  VERBOSITY_FLOOR_BY_HORNY_BAND,
  VOICE_EXAMPLES,
  ninaAngerLadderBlock,
  ninaEffectiveVerbosity,
} from '@/lib/nina/persona'
import {
  NINA_PROMPT_VERSION,
  NINA_SECTION_TITLES,
  NINA_SYSTEM_PROMPT,
  NINA_TOOLS,
  OUTPUT_RULE,
  PROACTIVE_INSTRUCTIONS,
  SEND_TOOL,
  buildContextGuide,
  buildNinaSystemPrompt,
  buildNumbersRule,
  buildOutputRule,
  buildProactiveInstruction,
} from '@/lib/nina/prompts'
import { buildDistillSystemPrompt } from '@/lib/nina/prompts/distill'
import {
  coerceNinaTuning,
  NINA_ADDRESS,
  NINA_RELATIONSHIPS,
  NINA_TUNING_DEFAULTS,
  NINA_TUNING_KEYS,
  type NinaDial,
  type NinaRelationship,
  type NinaTrait,
  type NinaTuning,
  type NinaTuningKey,
} from '@/lib/nina/tuning'

/**
 * The prompt is a deliverable, so it gets a test. Not a test of taste — a test that every piece
 * of the canon actually reached the string that gets sent, that no schema lost the property
 * descriptions the 2026-08-21 measurement bought, and (since the nina-character-tuning set) that
 * the DEFAULT tuning still produces the prompt that shipped before any of it existed.
 */

/** The default tuning with named overrides. */
function tuned(overrides: Partial<NinaTuning>): NinaTuning {
  return { ...NINA_TUNING_DEFAULTS, ...overrides }
}

/** One trait moved, everything else at its default. */
function withTrait(key: NinaTrait, value: number): NinaTuning {
  return tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, [key]: value } })
}

/** One dial moved. The dials are NESTED under `dials` — phase 1's landed shape. */
function withDial(key: NinaDial, value: number): NinaTuning {
  return tuned({ dials: { ...NINA_TUNING_DEFAULTS.dials, [key]: value } })
}

const DEFAULT_RENDER = buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)

describe('NINA_SYSTEM_PROMPT — the canon reached the prompt', () => {
  it('carries every slang term, so adding a word to the array is the only edit needed', () => {
    for (const entry of JAKARTA_SLANG) {
      expect(NINA_SYSTEM_PROMPT).toContain(entry.term)
    }
  })

  it("carries all five of the user's own example lines, verbatim", () => {
    expect(VOICE_EXAMPLES).toHaveLength(5)
    for (const example of VOICE_EXAMPLES) {
      expect(NINA_SYSTEM_PROMPT).toContain(example.line)
    }
  })

  it('carries every rung of the anger ladder', () => {
    for (const rung of ANGER_LADDER) {
      expect(NINA_SYSTEM_PROMPT).toContain(rung.name)
    }
  })

  /*
   * RE-POINTED by the nina-character-tuning set. This was a walk over the whole `NEVER_SAY` array.
   * Two of its entries — the body-comment line and the threat/withdrawal line — are repealed under
   * the iron rule, so a walk over the array would assert that a repealed rule is still in the
   * prompt. What is asserted instead is the entries NO dial can repeal, which the plan's own "Out
   * of scope" section names: the assistant-voice phrases, the bulleted list, and the medical
   * condition.
   */
  it('still forbids the assistant voice, the bulleted list and the medical claim', () => {
    for (const phrase of [
      'As an AI',
      "I'm sorry to hear that",
      'Is there anything else I can help you with?',
      'Ada lagi yang bisa gw bantu?',
      'Great job!',
      'a bulleted or numbered list of any kind',
      'a disclaimer paragraph',
      'the name of a medical condition',
    ]) {
      expect(NINA_SYSTEM_PROMPT).toContain(phrase)
    }
  })

  it('forbids "lo" being replaced by formal Indonesian (R2)', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('Never "kamu"')
    expect(NINA_SYSTEM_PROMPT).toContain('Never "Anda"')
  })

  it('states the arithmetic prohibition and names its consequence', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('Do NOT compute')
    expect(NINA_SYSTEM_PROMPT).toContain('no BMI')
    expect(NINA_SYSTEM_PROMPT).toContain('"daysAgo"')
  })

  it('spells the pace example exactly as formatPace does, with no escape character', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('7\'22"/km')
    expect(NINA_SYSTEM_PROMPT).not.toContain('\\"/km')
  })

  it("labels the runner's note as his words rather than as data (R6)", () => {
    expect(NINA_SYSTEM_PROMPT).toContain('HIS OWN WORDS')
  })

  it('keeps the not-a-doctor rule AND permits her own hyperbole', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('never diagnose')
    expect(NINA_SYSTEM_PROMPT).toContain('JANTUNG LO BAKAL PECAH TAH')
  })

  it('describes her face, so the image path has one source for it', () => {
    expect(NINA_APPEARANCE).toContain('ponytail')
    expect(NINA_APPEARANCE).toContain('heather-grey racerback tank')
  })

  it('never claims she is an assistant', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('not an assistant')
  })
})

/**
 * ── THE COMPATIBILITY CONTRACT, IN BOTH DIRECTIONS ───────────────────────────────────────────
 * "`NINA_TUNING_DEFAULTS` renders the shipping prompt." One direction is that everything which used
 * to be there still is; the other, which is the one that actually catches a mistake, is that
 * NOTHING NEW is there. A tuned clause leaking into the default render is a character change nobody
 * asked for, and it would pass every containment assertion above.
 */
describe('buildNinaSystemPrompt — the default tuning is the shipping prompt', () => {
  it('IS what NINA_SYSTEM_PROMPT is', () => {
    expect(DEFAULT_RENDER).toBe(NINA_SYSTEM_PROMPT)
  })

  it('renders no tuning-only section at the default tuning', () => {
    for (const title of ['HOW YOU FEEL', 'THE CAMERA', 'STANDING INSTRUCTIONS']) {
      expect(DEFAULT_RENDER).not.toContain(`── ${title} `)
    }
  })

  /*
   * ── THE FOUR REPEALS IN THIS PACKAGE, AT THE DEFAULT ────────────────────────────────────────
   * Four surviving prohibitions were removed, and every one of them must still be present at the
   * default tuning — that is what "the defaults are the Nina who shipped" means. The tuned halves
   * are asserted in the per-dial block below.
   */
  it("keeps all four of this package's own repealed rules at the default tuning", () => {
    expect(DEFAULT_RENDER).toContain(
      'Never comment on his body, and never turn them into a new number',
    )
    expect(DEFAULT_RENDER).toContain('This is where your anger comes from.')
    expect(PROACTIVE_INSTRUCTIONS.pattern_crossed).toContain(
      'Say it at the rung "nagLevel" earns and not one higher.',
    )
    expect(PROACTIVE_INSTRUCTIONS.missed_usual_day).toContain('Do not lecture him')
    expect(PROACTIVE_INSTRUCTIONS.silence).toContain('do not sulk about the silence')
  })

  it("keeps OUTPUT_RULE's original greeting and bubble-preference lines", () => {
    expect(DEFAULT_RENDER).toContain(
      '- No greeting unless the conversation is empty or he has been gone for days.',
    )
    expect(DEFAULT_RENDER).toContain('- One bubble is the right answer more often than four.')
    expect(DEFAULT_RENDER).toContain(
      '- Never close the conversation. A friend does not close a ticket.',
    )
  })

  it("carries F33's original headings, in their original order", () => {
    const original = [
      'HOW YOU TALK',
      'EXACTLY HOW YOU SOUND',
      'WHEN YOU GET ANGRY',
      'WHAT YOU NEVER SAY',
      'THE NUMBERS',
      'WHAT YOU ARE READING',
      'HOW YOU ANSWER',
    ]
    let cursor = -1
    for (const title of original) {
      const at = DEFAULT_RENDER.indexOf(`── ${title} `)
      expect(at, `${title} is missing from the default render`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  /*
   * ── PLAN INVARIANT 2, AS A GATE RATHER THAN A CLAIM ──────────────────────────────────────
   * The `girlfriend` register (R2, the admin-responsive-nina-intimacy set) is gated on the
   * relationship, so the OTHER FOUR levels must render exactly the bytes they rendered at
   * `origin/main` @ 02dc79a. Containment assertions cannot catch a whitespace change, a reordered
   * block or a dropped sentence; a snapshot can, and it prints the diff.
   *
   * **This snapshot was generated from the tree BEFORE that phase's edits.** Regenerating it is
   * how the invariant gets lost, so treat a failure here as a bug in the change, not in the file:
   * every later phase in this set is likewise required to leave these four renders alone
   * (`horny` defaults to 0, `enabled` defaults to all-true, precisely so that it does).
   */
  it('renders the four non-girlfriend relationships exactly as origin/main did', () => {
    const renders: Record<string, string> = {}
    for (const relationship of RELATIONSHIPS) {
      /* TWO LEVELS ARE EXCLUDED BY NAME, and the exclusion is the point. `girlfriend` has its own
       * register; `instructor` is the sixth level the nina-instructor-character set appended. The
       * snapshot was written about the OTHER FOUR, and `toHaveLength(4)` is what stops a seventh
       * level from quietly joining the guarded set — it fails on the count before it fails on the
       * bytes, which is the loud failure. Adding a level is NEVER a reason to regenerate this
       * snapshot: its title is the snapshot's key, so renaming this case would orphan the stored
       * value and write a new one. Leave both alone. */
      if (relationship === 'girlfriend' || relationship === 'instructor') continue
      renders[relationship] = buildNinaSystemPrompt(withRelationship(relationship))
    }
    expect(Object.keys(renders)).toHaveLength(4)
    expect(renders).toMatchSnapshot()
  })

  /*
   * The headings F33 phase 2 wrote by hand are 80 columns wide. `sectionHeader` computes them now,
   * so an off-by-one in that helper would silently reflow every rule heading in the prompt.
   */
  it('pads every heading to 80 columns', () => {
    const headings = DEFAULT_RENDER.split('\n').filter((line) => line.startsWith('── '))
    expect(headings.length).toBeGreaterThan(0)
    for (const line of headings) {
      expect(line, line).toHaveLength(80)
      expect(line).toMatch(/^── [A-Z ]+ ─+$/)
    }
  })

  it('declares its section order, so a new section is a deliberate edit', () => {
    expect(NINA_SECTION_TITLES).toEqual([
      'HOW YOU TALK',
      'EXACTLY HOW YOU SOUND',
      'HOW YOU FEEL',
      'WHEN YOU GET ANGRY',
      'WHAT YOU NEVER SAY',
      'THE NUMBERS',
      'THE CAMERA',
      'WHAT YOU ARE READING',
      'HOW YOU ANSWER',
      'STANDING INSTRUCTIONS',
    ])
  })
})

/**
 * ── R4, PER DIAL ─────────────────────────────────────────────────────────────────────────────
 * "Every dial at 100 puts identifiable text in the prompt, and a test proves it per dial."
 *
 * For the three dials this module owns, the identifiable text is asserted literally. For the
 * twelve traits and the relationship, whose words `lib/nina/persona.ts` owns, the assertion is that
 * the render CHANGES and GROWS — which is exactly the property that fails when a dial is wired to
 * nothing.
 */
describe('buildNinaSystemPrompt — every dial reaches the prompt', () => {
  it('gives each of the twelve traits at 100 text of its own', () => {
    for (const key of Object.keys(NINA_TUNING_DEFAULTS.traits) as NinaTrait[]) {
      const render = buildNinaSystemPrompt(withTrait(key, 100))
      expect(render, `${key} at 100 changed nothing`).not.toBe(DEFAULT_RENDER)
      expect(render.length, `${key} at 100 added no text`).toBeGreaterThan(DEFAULT_RENDER.length)
    }
  })

  it('distinguishes 0 from 100 for every trait, and 0 IS the default for the seven that ship at 0', () => {
    /*
     * The defaults are not uniform: `anger`, `sad`, `flirty`, `steamy`, `annoying`, `anxious` and
     * `horny` ship at **0**, so a slider dragged to 0 is a slider that has not moved and the render
     * must be identical. That is the compatibility contract per key, not an exception to it.
     */
    for (const key of Object.keys(NINA_TUNING_DEFAULTS.traits) as NinaTrait[]) {
      const low = buildNinaSystemPrompt(withTrait(key, 0))
      const high = buildNinaSystemPrompt(withTrait(key, 100))
      expect(low, `${key} renders identically at 0 and at 100`).not.toBe(high)

      const shipsAtZero = NINA_TUNING_DEFAULTS.traits[key] === 0
      if (shipsAtZero) {
        expect(low, `${key} ships at 0, so 0 must be the shipping prompt`).toBe(DEFAULT_RENDER)
      } else {
        expect(low, `${key} at 0 changed nothing`).not.toBe(DEFAULT_RENDER)
      }
    }
  })

  it('changes the opening identity block for every non-default relationship', () => {
    /* There is no relationship SECTION — `ninaIdentity` is the headerless opening block, which is
     * where today's prompt carries who he is to her. What a non-default level changes is that
     * block's text. */
    const others = (
      ['nobody', 'casual_friend', 'sister', 'best_friend', 'girlfriend'] as const
    ).filter((value) => value !== NINA_TUNING_DEFAULTS.relationship)
    for (const relationship of others) {
      const render = buildNinaSystemPrompt(tuned({ relationship }))
      expect(render, relationship).not.toBe(DEFAULT_RENDER)
      expect(render, relationship).not.toContain('── WHO HE IS TO YOU ')
    }
  })

  it("repeals this package's three body/anger prohibitions when the dials ask (R6)", () => {
    /* The five words in `NUMBERS_RULE` are the highest-value edit in the set: without them a
     * `flirty: 100` paragraph ships three blocks above an absolute prohibition. */
    const body = buildNinaSystemPrompt(withTrait('flirty', 100))
    expect(body).not.toContain('Never comment on his body')
    expect(body).toContain('You may say what you think about his body')
    /* And the half that never lifts, because `lib/llm/facts.ts` records the sign error it contains. */
    expect(body).toContain('never turn them into a new number: no BMI')

    const furious = withTrait('anger', 100)
    const angry = buildNinaSystemPrompt(furious)
    expect(angry).not.toContain('This is where your anger comes from.')
    /* The floor has to hold on a quiet day: `context.ts` emits `nagLevel` only inside a pattern
     * that fired, so "mad all the time" is decided by this sentence. */
    expect(angry).toContain('even when "patterns" is empty')
    expect(buildProactiveInstruction('pattern_crossed', furious)).not.toContain(
      'and not one higher',
    )
    expect(buildProactiveInstruction('silence', withTrait('sad', 100))).not.toContain('do not sulk')
    expect(buildProactiveInstruction('missed_usual_day', withTrait('annoying', 100))).not.toContain(
      'Do not lecture him',
    )
  })

  it('repeals the no-greeting clause at the top of the concerned dial (R6)', () => {
    const render = buildNinaSystemPrompt(withTrait('concerned', 100))
    expect(render).not.toContain(
      '- No greeting unless the conversation is empty or he has been gone for days.',
    )
    expect(render).toContain('Ask how he is, and mean it')
    expect(render).toContain('ask how his body feels after that run')
  })

  it('moves the bubble preference with the verbosity dial, and never the 1-4 cap', () => {
    const loud = buildNinaSystemPrompt(withDial('verbosity', 100))
    expect(loud).toContain('Three or four bubbles is normal for you')
    expect(loud).not.toContain('- One bubble is the right answer more often than four.')

    const quiet = buildNinaSystemPrompt(withDial('verbosity', 0))
    expect(quiet).toContain('- One bubble. A second one only when it is doing real work.')

    /* The cap is the schema's, and no dial may move it. */
    for (const render of [loud, quiet, DEFAULT_RENDER]) {
      expect(render).toContain('- 1 to 4 bubbles.')
    }
  })

  it('opens the CAMERA section with the photo dial and closes it at the default', () => {
    const eager = buildNinaSystemPrompt(withDial('photoEagerness', 100))
    expect(eager).toContain('── THE CAMERA ')
    expect(eager).toContain('generate_image')
    expect(DEFAULT_RENDER).not.toContain('── THE CAMERA ')
  })

  it('puts the operator notes last, so they can override what is above them', () => {
    const render = buildNinaSystemPrompt(tuned({ notes: 'she calls him kapten on a Friday' }))
    expect(render).toContain('she calls him kapten on a Friday')
    expect(render.indexOf('── STANDING INSTRUCTIONS ')).toBeGreaterThan(
      render.indexOf('── HOW YOU ANSWER '),
    )
  })
})

describe('the tool schemas', () => {
  it('gives EVERY property a description — the 2026-08-21 measurement, not a convention', () => {
    const walk = (schema: Record<string, unknown>, path: string): void => {
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
      if (properties != null) {
        for (const [name, property] of Object.entries(properties)) {
          expect(property.description, `${path}.${name} has no description`).toBeTruthy()
          walk(property, `${path}.${name}`)
        }
      }
      const items = schema.items as Record<string, unknown> | undefined
      if (items != null) {
        expect(items.description, `${path}[] has no description`).toBeTruthy()
        walk(items, `${path}[]`)
      }
    }
    for (const tool of NINA_TOOLS) {
      expect(tool.description).toBeTruthy()
      walk(tool.input_schema as unknown as Record<string, unknown>, tool.name)
    }
  })

  it('defines the six tools phases 3, 12 and 13 expect, under these exact names', () => {
    expect(NINA_TOOLS.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'save_memory',
      'generate_image',
      'set_avatar',
    ])
  })

  it('caps the reply at 1-4 bubbles, as RU-5 chose', () => {
    const bubbles = (
      SEND_TOOL.input_schema as unknown as {
        properties: Record<string, Record<string, unknown>>
      }
    ).properties.bubbles!
    expect(bubbles.minItems).toBe(1)
    expect(bubbles.maxItems).toBe(4)
  })

  /*
   * The nina-character-tuning set proposed two tuning-aware descriptions here and declined both —
   * see `lib/nina/prompts/tools.ts`'s header. This case is what makes the decision durable: the
   * tool set stays a CONSTANT, so nothing about it can depend on a per-user setting.
   */
  it('stays a constant array — no tool schema depends on a tuning', () => {
    expect(Array.isArray(NINA_TOOLS)).toBe(true)
    expect(SEND_TOOL.description).toBe('Send your reply. Always answer with this tool.')
  })
})

describe('PROACTIVE_INSTRUCTIONS', () => {
  it("covers all four RU-15 triggers plus RU-17's avatar change", () => {
    expect(Object.keys(PROACTIVE_INSTRUCTIONS).sort()).toEqual([
      'avatar_changed',
      'missed_usual_day',
      'pattern_crossed',
      'run_committed',
      'silence',
    ])
  })

  it('tells her in every case that she is opening the conversation', () => {
    for (const text of Object.values(PROACTIVE_INSTRUCTIONS)) {
      expect(text).toContain('opening this conversation')
    }
  })

  it('appends nothing at the default tuning', () => {
    for (const kind of Object.keys(PROACTIVE_INSTRUCTIONS) as Array<
      keyof typeof PROACTIVE_INSTRUCTIONS
    >) {
      expect(buildProactiveInstruction(kind, NINA_TUNING_DEFAULTS)).toBe(
        PROACTIVE_INSTRUCTIONS[kind],
      )
    }
  })

  it('appends the concerned suffix to ALL FIVE, and keeps their own words', () => {
    const tuning = withTrait('concerned', 100)
    for (const kind of Object.keys(PROACTIVE_INSTRUCTIONS) as Array<
      keyof typeof PROACTIVE_INSTRUCTIONS
    >) {
      const text = buildProactiveInstruction(kind, tuning)
      expect(text, kind).toContain('opening this conversation')
      expect(text, kind).toContain('Before anything else, ask how he is.')
      expect(text, kind).toContain(PROACTIVE_INSTRUCTIONS[kind])
    }
  })
})

describe('NINA_PROMPT_VERSION', () => {
  it('exists and is a positive integer, so nina_turns can record it', () => {
    expect(Number.isInteger(NINA_PROMPT_VERSION)).toBe(true)
    expect(NINA_PROMPT_VERSION).toBeGreaterThan(0)
  })

  /* The prompt changed shape in the nina-character-tuning set, so the constant had to move. This
   * asserts the bump landed; the changelog comment above the constant says what it covers. */
  it('was bumped for the character tuning', () => {
    expect(NINA_PROMPT_VERSION).toBeGreaterThanOrEqual(3)
  })
})

/* ============================================================================
 * The tuning matrix — F33 phase 6. Phase 3 proved the DEFAULT render; this is every other one.
 *
 * Two local helpers carry every shape assumption in this block, on purpose: if phase 1 made
 * `NinaTuning` flat rather than nesting the dials under `traits`, these two function bodies are
 * the only thing that changes and none of the twenty assertions below moves.
 * ==========================================================================*/

/* Phase 1's own array, not a copy of it: a local list of five strings is a second vocabulary, and
 * `NINA_RELATIONSHIPS` is a `readonly` tuple this file can iterate directly. Same reasoning as
 * `JAKARTA_SLANG` being walked rather than restated. `withTrait` / `tuned` / `DEFAULT_RENDER` are
 * phase 3's, already at the top of this file. */
const RELATIONSHIPS = NINA_RELATIONSHIPS

function withRelationship(relationship: NinaRelationship): NinaTuning {
  return tuned({ relationship })
}

describe('buildNinaSystemPrompt — the relationship matrix (R2)', () => {
  it('renders all six relationships without throwing, and none is empty', () => {
    for (const relationship of RELATIONSHIPS) {
      const prompt = buildNinaSystemPrompt(withRelationship(relationship))
      expect(prompt.length, relationship).toBeGreaterThan(0)
    }
  })

  it('gives every relationship a DISTINGUISHABLE prompt — no two collapse into one', () => {
    /* The failure this catches is a `switch` with a missing case falling through to the default:
     * five settings on the panel, four behaviours in the prompt, and nothing to see in review. */
    const rendered = RELATIONSHIPS.map((relationship) =>
      buildNinaSystemPrompt(withRelationship(relationship)),
    )
    expect(new Set(rendered).size).toBe(RELATIONSHIPS.length)
  })

  it('states the address form the user named, for each relationship', () => {
    /* His words, verbatim from the request: nobody -> full name, casual friend -> nickname,
     * sister -> bro, best friend -> bestie, girlfriend -> "my man" / yang / sayang / beb / baby.
     * One token each, chosen because it cannot plausibly appear in another relationship's block. */
    const token: Record<NinaRelationship, string> = {
      nobody: 'fullName',
      casual_friend: 'nickname',
      sister: 'bro',
      best_friend: 'bestie',
      girlfriend: 'sayang',
      /* The coach word, and it is exclusive to her: nothing else in `NINA_ADDRESS` or in
       * `NINA_RELATIONSHIP_BLOCKS` says "atlet", which is what makes this a real assertion rather
       * than one satisfied by the shared paragraphs. `tests/nina.tuning.test.ts` keeps it that
       * way. `'nickname'` would have been the honest primary source here and is deliberately not
       * used — `casual_friend` already owns that token. */
      instructor: 'atlet',
    }
    for (const relationship of RELATIONSHIPS) {
      expect(
        buildNinaSystemPrompt(withRelationship(relationship)),
        `${relationship} does not name its address form`,
      ).toContain(token[relationship])
    }
  })

  it('carries EVERY word the user named, not just one token per level', () => {
    /* The `JAKARTA_SLANG` walk, applied to R2's address vocabulary: `NINA_ADDRESS[rel].words` is
     * the array phase 1 owns, phase 2's `ninaNameRules` composes the prose that names them, and
     * this is what proves none of them was lost between the two. `girlfriend`'s five are the ones
     * most likely to lose one silently. */
    for (const relationship of RELATIONSHIPS) {
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      for (const word of NINA_ADDRESS[relationship].words) {
        expect(render, `${relationship} lost the word "${word}"`).toContain(word)
      }
    }
  })

  it("no longer forbids the full name, which relationship 'nobody' requires", () => {
    /* The repealed clause, quoted: NAME_RULES used to say "do not use the full name at him".
     * `nobody` is defined as exactly that, so the sentence and the setting cannot both survive. */
    expect(buildNinaSystemPrompt(withRelationship('nobody'))).not.toContain(
      'do not use the full name at him',
    )
  })

  it('makes the instructor a professional coach whose subject is his performance', () => {
    /* R2, as an assertion: "nina act as a professional and knowledgeable instructor in which her
     * primary objective is to improve the performance of miftah's running". The coaching
     * MECHANICS — what she does with a fired pattern, the training schedule — are phase 3's and
     * phase 2's and are deliberately NOT asserted here; this case is about who she IS. */
    const instructor = buildNinaSystemPrompt(withRelationship('instructor'))
    expect(instructor).toContain('You are his running coach')
    expect(instructor).toContain('This is a professional relationship')
    expect(instructor).toContain('atlet')
    /* Her credential is not a new claim: `NINA_WHERE_SHE_LIVES` has said it at every level since
     * before the tuning existed. The instructor block PROMOTES it, and this is the proof both
     * halves reached the same render. */
    expect(instructor).toContain('physiotherapist and strength coach')
    /* Decision D4: she prescribes TRAINING, never physiology — and the guardrail that makes that
     * a rule rather than a preference is still in her prompt at this level, unedited. */
    expect(instructor).toContain('What you prescribe is training')
    expect(instructor).toContain('You are not his doctor and you never diagnose')
  })

  it('keeps the coach register off the five personal levels', () => {
    /* Invariant 1 as containment, at the level the frozen snapshot cannot report readably: when
     * this fails it names WHICH level leaked and WHAT. */
    for (const relationship of RELATIONSHIPS) {
      if (relationship === 'instructor') continue
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      expect(render, `${relationship} leaked "atlet"`).not.toContain('atlet')
      expect(render, `${relationship} leaked the coach block`).not.toContain(
        'You are his running coach',
      )
    }
  })
})

/**
 * ── R2 (admin-responsive-nina-intimacy): THE GIRLFRIEND REGISTER ─────────────────────
 * "if relationship is set to girlfriend, make her more manja and imut. dalam bahasa indonesia kita
 * suka menambah jumlah karakter vokal di akhir" — the user's own words, and his five example lines
 * are the specification. They are stored verbatim in `GIRLFRIEND_VOICE_EXAMPLES`, so this suite
 * WALKS that array rather than retyping the lines: a tidied copy here would pass while the prompt
 * shipped a tidied line, which is the exact failure the verbatim rule exists to prevent.
 */
describe('buildNinaSystemPrompt — the girlfriend register (R2)', () => {
  const girlfriend = buildNinaSystemPrompt(withRelationship('girlfriend'))

  it("carries all five of the user's girlfriend lines, verbatim, emoji included", () => {
    expect(GIRLFRIEND_VOICE_EXAMPLES).toHaveLength(5)
    for (const example of GIRLFRIEND_VOICE_EXAMPLES) {
      expect(girlfriend, `girlfriend lost the line "${example.line}"`).toContain(example.line)
    }
    /* The emoji specifically: a lint autofix or an editor's "normalise unicode" is the plausible
     * way three kiss marks become one, and the one-emoji repeal below is what they are evidence
     * for. */
    expect(girlfriend).toContain('💋💋💋')
  })

  it('states the vowel lengthening as a spelling rule, with the forms the user typed', () => {
    expect(girlfriend).toContain('Lengthen the last vowel')
    expect(girlfriend).toContain('sayang -> sayaangg')
    expect(girlfriend).toContain('This is SPELLING, not sentiment')
  })

  it('names manja and imut in the identity block, as register rather than as mood', () => {
    expect(girlfriend).toContain('"manja"')
    expect(girlfriend).toContain('"imut"')
    /* The sentence that keeps a later reader from folding this into the `clinginess` dial, which
     * moves three day-count constants in `lib/nina/proactive.ts` and nothing about her spelling. */
    expect(girlfriend).toContain('it is not how often you go first')
  })

  it('lifts exactly the two register lines its own examples break, and no more', () => {
    /* "tar aku kirim foto nya yaa" against `Never "aku"`, and 💋💋💋 against the one-emoji line. */
    expect(girlfriend).toContain('"aku" is yours at this level')
    expect(girlfriend).toContain('Emoji stop being rationed with him')
    /* And the half that does NOT lift: the base register is still in the prompt underneath, so
     * this is an amendment rather than a replacement, and formal Indonesian is still out. */
    expect(girlfriend).toContain('Never "saya"')
    expect(girlfriend).toContain('Never "Anda"')
    expect(girlfriend).toContain('Never "kamu"')
  })

  it('keeps the register inside the sections that already exist', () => {
    /* R2 adds no heading. If it ever does, `NINA_SECTION_TITLES` and the 80-column heading test
     * are the two places that must agree, and this is the assertion that says so out loud. */
    expect(NINA_SECTION_TITLES).toHaveLength(10)
    const talk = girlfriend.indexOf('── HOW YOU TALK ')
    const sound = girlfriend.indexOf('── EXACTLY HOW YOU SOUND ')
    const manja = girlfriend.indexOf('Lengthen the last vowel')
    const lines = girlfriend.indexOf('iyaa sayaangg')
    expect(talk).toBeGreaterThanOrEqual(0)
    expect(manja).toBeGreaterThan(talk)
    expect(manja).toBeLessThan(sound)
    expect(lines).toBeGreaterThan(sound)
  })

  it('is entirely invisible at the other four relationships', () => {
    /* Plan invariant 2, stated as containment. The snapshot above is the byte-level gate; this is
     * the readable one that names WHAT leaked when it fails. */
    for (const relationship of RELATIONSHIPS) {
      if (relationship === 'girlfriend') continue
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      for (const example of GIRLFRIEND_VOICE_EXAMPLES) {
        expect(render, `${relationship} leaked "${example.line}"`).not.toContain(example.line)
      }
      expect(render, `${relationship} leaked the manja register`).not.toContain('sayaangg')
      expect(render, `${relationship} leaked "manja"`).not.toContain('"manja"')
      expect(render, `${relationship} leaked "imut"`).not.toContain('"imut"')
      expect(render, `${relationship} lost the emoji ration`).toContain(
        'At most one emoji in a whole reply',
      )
    }
  })

  it('is invisible at the DEFAULT tuning, which is what makes it shippable', () => {
    expect(DEFAULT_RENDER).not.toContain('sayaangg')
    expect(DEFAULT_RENDER).not.toContain('💋')
    expect(DEFAULT_RENDER).toBe(NINA_SYSTEM_PROMPT)
  })

  it('grows the prompt rather than replacing part of it', () => {
    expect(girlfriend.length).toBeGreaterThan(DEFAULT_RENDER.length)
  })
})

/**
 * ── R3 (nina-instructor-character): THE COACHING REGISTER ────────────────────────────
 * *"she will proactively monitor his performance and give insights into what should he do (e.g:
 * what should he do to reduce his average high heart rate during run, what should he do to increase
 * his average running pace, and so on)"*.
 *
 * The MONITORING is not tested here — `tests/nina.patterns.test.ts` already owns both codes with
 * boundary cases on each, and this phase added no rule to that file. What is tested here is the
 * RESPONSE: that a fired code under `instructor` becomes a prescription, that the prescription is
 * made of training and not of physiology, that the block is absent at every other level, and that
 * nothing this phase touched moved the anger ladder or the medical guardrails.
 */
describe('buildNinaSystemPrompt — the instructor coaching register (R3)', () => {
  const coach = withRelationship('instructor')
  const instructor = buildNinaSystemPrompt(coach)

  it('prescribes against both of the codes the user named, by name', () => {
    expect(instructor).toContain('REPEATED_HIGH_AVG_HR')
    expect(instructor).toContain('PACE_REGRESSION')
    /* And each one carries an actual prescription rather than a mention. These are the sentences a
     * reader can hold against "what should he do to reduce his average high heart rate" and "what
     * should he do to increase his average running pace" and see answered. */
    expect(instructor).toContain('prescribe those days SLOWER')
    expect(instructor).toContain(
      'one honest session a week at a pace he could hold for twenty minutes',
    )
    expect(instructor).toContain('Six weeks, then the same distance bucket, then compare')
  })

  it('coins no pattern code — every shouted token in the block is a real one', () => {
    /* `lib/nina/patterns.ts`'s own rule, as a sweep rather than a promise: a model free to coin
     * `OVERTRAINING_RISK` is making a medical-adjacent claim nobody wrote, tested or can reproduce.
     * The regex needs at least one underscore, so the block's own shouted headings ("THE
     * SUBSTITUTION", "ONE CHANGE, ONE DEADLINE") are not candidates and only code-shaped tokens are.
     * This is the `JAKARTA_SLANG` walk applied to the pattern vocabulary. */
    expect(PATTERN_CODES).toHaveLength(5)
    const shouted = INSTRUCTOR_COACHING.match(/\b[A-Z][A-Z]+(?:_[A-Z]+)+\b/g) ?? []
    expect(shouted.length).toBeGreaterThan(0)
    for (const token of shouted) {
      expect(PATTERN_CODES as readonly string[], `${token} is not a PatternCode`).toContain(token)
    }
  })

  it('prescribes TRAINING and never PHYSIOLOGY, structurally (D4)', () => {
    /* The three devices, each asserted, because "a professional coach is more careful here than a
     * friend" has to be a property of the text rather than a hope about the model. */
    expect(instructor).toContain('A prescription of yours is always an action on a future run')
    expect(instructor).toContain('THE SUBSTITUTION')
    expect(instructor).toContain('say what he does on his next run instead')
    expect(instructor).toContain('TIGHTER now, not looser')
    /* And the prescription's closed form, which a verdict about his body cannot be expressed in. */
    expect(instructor).toContain('ONE CHANGE, ONE DEADLINE, ONE THING YOU WILL RE-READ')
  })

  it('leaves every medical and arithmetic guardrail standing at this level', () => {
    /* `persona.ts:1016`'s ruling and `lib/llm/facts.ts`'s measured sign error. R3 asks her to advise
     * on a heart rate, which raises these stakes rather than lowering them, so they are asserted at
     * `instructor` specifically and not only at the default. */
    expect(instructor).toContain('never diagnose')
    expect(instructor).toContain('the name of a medical condition')
    expect(instructor).toContain('Do NOT compute')
    expect(instructor).toContain('never turn them into a new number: no BMI')
    expect(instructor).toContain('Never mock a real setback')
    /* And the ungated expertise block she has always had is not contradicted — she still answers
     * mechanism when asked, and the coaching block says so in its own words. */
    expect(instructor).toContain('you answer the real physiology')
    expect(instructor).toContain('You still explain mechanism when he asks')
  })

  it('leaves the anger ladder rendering exactly as it does at every other level', () => {
    /* The ladder is not this phase's. It reads the `anger` trait and nothing else, so an
     * `instructor` render must be byte-identical to a `best_friend` one — asserted for all six
     * levels rather than for this one, because the property is "the relationship never reaches the
     * ladder" and that is only visible as a sweep. */
    for (const relationship of RELATIONSHIPS) {
      expect(
        ninaAngerLadderBlock(withRelationship(relationship)),
        `${relationship} moved the anger ladder`,
      ).toBe(ninaAngerLadderBlock(NINA_TUNING_DEFAULTS))
    }
    /* And she still FEELS it here: an instructor on the anger dial is the operator's business. */
    expect(instructor).toContain('This is where your anger comes from.')
    expect(instructor).toContain('JANTUNG LO BAKAL PECAH TAH')
    expect(instructor).toContain('You do not choose how angry you are.')
  })

  it('is absent from all five other relationships, asserted PER LEVEL', () => {
    /* Per level and not spot-checked: a gate that reads the wrong comparison leaks at exactly one
     * setting, and one setting is what a spot check misses. The four-render snapshot above is the
     * byte-level gate; this is the readable one that names WHAT leaked when it fails. */
    const others = RELATIONSHIPS.filter((relationship) => relationship !== 'instructor')
    expect(others).toHaveLength(5)
    for (const relationship of others) {
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      expect(render, `${relationship} leaked the coaching block`).not.toContain(INSTRUCTOR_COACHING)
      expect(render, `${relationship} leaked the prescription form`).not.toContain(
        'A prescription of yours is always an action on a future run',
      )
      expect(render, `${relationship} leaked a pattern code into the prompt`).not.toContain(
        'REPEATED_HIGH_AVG_HR',
      )
      expect(render, `${relationship} leaked the working-list clause`).not.toContain(
        'is also your working list',
      )
      expect(render, `${relationship} leaked the coaching opener`).not.toContain(
        'leave him with ONE change',
      )
      expect(render, `${relationship} leaked the slot key`).not.toContain('training_plan')
    }
  })

  it('names phase 2s training_plan slot key, gated, because the context guide cannot (D7)', () => {
    /* Reconciliation D7. Phase 2's tenth slot is real, but `buildContextGuide` never spells it —
     * an UNGATED byte in that paragraph turns the frozen four-render snapshot red four times, so
     * phase 2 dropped its `system.ts` edit (its P2-D4). This gated block is therefore the ONLY
     * place the key name can reach her, and her own `slotKey` field is free text, so without it she
     * cannot reliably write the plan she was just told to keep. Zero bytes at the default, which is
     * the property that makes it shippable. */
    expect(instructor).toContain('"training_plan"')
    expect(instructor).toContain('"save_memory"')
    expect(DEFAULT_RENDER).not.toContain('training_plan')
    /* And the paragraph phase 2 did NOT edit is still the paragraph the snapshot pins: no phase in
     * this set added a byte to it, at any level. */
    expect(buildContextGuide(coach)).not.toContain('training_plan')
  })

  it('is invisible at the DEFAULT tuning, which is what makes it shippable', () => {
    expect(DEFAULT_RENDER).not.toContain('REPEATED_HIGH_AVG_HR')
    expect(DEFAULT_RENDER).not.toContain('THE SUBSTITUTION')
    expect(DEFAULT_RENDER).toBe(NINA_SYSTEM_PROMPT)
    /* And the four-render snapshot's paragraph is untouched, stated as containment so a failure
     * here names the cause instead of printing a 700-line diff. */
    for (const relationship of ['nobody', 'casual_friend', 'sister', 'best_friend'] as const) {
      expect(buildContextGuide(withRelationship(relationship)), relationship).toBe(
        buildContextGuide(NINA_TUNING_DEFAULTS),
      )
    }
  })

  it('reads a fired code as a working list under instructor and nowhere else', () => {
    expect(buildContextGuide(coach)).toContain('is also your working list')
    expect(buildContextGuide(coach)).toContain('never recount them')
    for (const relationship of RELATIONSHIPS) {
      if (relationship === 'instructor') continue
      expect(buildContextGuide(withRelationship(relationship)), relationship).toBe(
        buildContextGuide(NINA_TUNING_DEFAULTS),
      )
    }
  })

  it('opens proactively as a coach, on all five triggers, and not at the default', () => {
    /* D5: no sixth trigger. The suffix seam already existed and already took a `tuning`. */
    for (const kind of Object.keys(PROACTIVE_INSTRUCTIONS) as Array<
      keyof typeof PROACTIVE_INSTRUCTIONS
    >) {
      const text = buildProactiveInstruction(kind, coach)
      expect(text, kind).toContain('leave him with ONE change')
      /* The trigger's own copy survives verbatim — the suffix ADDS and never repeals, which is why
       * the five strings were not edited and why this assertion cannot break. */
      expect(text, kind).toContain(PROACTIVE_INSTRUCTIONS[kind])
      expect(text, kind).toContain('opening this conversation')
    }
    /* The rung clause is the ladder's and is untouched at this level: she says it at whatever rung
     * `nagLevel` earned AND she leaves him with a change. */
    expect(buildProactiveInstruction('pattern_crossed', coach)).toContain(
      'Say it at the rung "nagLevel" earns and not one higher.',
    )
    /* Nothing at the default, which is what keeps PROACTIVE_INSTRUCTIONS byte-identical. */
    for (const kind of Object.keys(PROACTIVE_INSTRUCTIONS) as Array<
      keyof typeof PROACTIVE_INSTRUCTIONS
    >) {
      expect(buildProactiveInstruction(kind, NINA_TUNING_DEFAULTS), kind).toBe(
        PROACTIVE_INSTRUCTIONS[kind],
      )
    }
  })

  it('adds no heading — the block lives inside WHAT YOU ARE READING', () => {
    /* R2's precedent, and the two places that would have to agree if a section were ever added. */
    expect(NINA_SECTION_TITLES).toHaveLength(10)
    for (const line of instructor.split('\n').filter((l) => l.startsWith('── '))) {
      expect(line, line).toHaveLength(80)
    }
    const reading = instructor.indexOf('── WHAT YOU ARE READING ')
    const answer = instructor.indexOf('── HOW YOU ANSWER ')
    const coaching = instructor.indexOf('You are his coach, so the numbers')
    expect(reading).toBeGreaterThanOrEqual(0)
    expect(coaching).toBeGreaterThan(reading)
    expect(coaching).toBeLessThan(answer)
  })

  it('grows the prompt rather than replacing part of it', () => {
    expect(instructor.length).toBeGreaterThan(DEFAULT_RENDER.length)
    expect(instructor).not.toBe(DEFAULT_RENDER)
  })
})

describe('buildNinaSystemPrompt — the trait matrix (R4)', () => {
  /* Phase 3 already asserts, per trait, that 0 and 100 render differently and that a trait sitting
   * at its own default renders the shipping prompt. Those cases are NOT repeated here. What is left
   * is the R6 half: that no surviving rule cancels the two dials the plan says it repealed for, and
   * that the two rules the plan deliberately KEPT are still there at every setting. */

  it('no surviving rule contradicts a dial that is turned up', () => {
    /* R6, as an assertion rather than a promise. All four strings are quoted from the shipping
     * prompt and all four are named in the repeal list, so a re-added one fails here. The third
     * and fourth are the ones the sweep found in `prompts/system.ts` rather than in `persona.ts`.
     *
     * `funny` is turned up here alongside `flirty` and `steamy`, and that is load-bearing rather
     * than incidental: the no-jokes clause is repealed by `funny`, not by the other two, and it
     * MUST survive at `funny`'s own default — that is plan invariant 2, and phase 3's default-render
     * suite is what pins it. A tuning that raised only `flirty` and `steamy` would be asserting the
     * absence of a rule nothing in it had asked to repeal. Each of the four strings below is
     * repealed by a dial this tuning actually moves. */
    const loud = tuned({
      traits: { ...NINA_TUNING_DEFAULTS.traits, flirty: 100, steamy: 100, funny: 100 },
      relationship: 'girlfriend',
    })
    const render = buildNinaSystemPrompt(loud)
    expect(render).not.toContain('a sentence about his body or his weight or how he looks')
    expect(render).not.toContain('You do not tell jokes')
    expect(render).not.toContain('Never comment on his body')
    expect(render).not.toContain('do not use the full name at him')
  })

  it('keeps the two rules the plan deliberately did NOT repeal, at every setting', () => {
    /* The other half of R6, and the reason it is read as "remove every rule that blocks a dial"
     * rather than "remove every rule". No dial asks her to diagnose him or to do arithmetic, and
     * `lib/llm/facts.ts` records the measured sign error the numbers rule exists to contain. */
    const loud = tuned({
      traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100, flirty: 100, anger: 100 },
      relationship: 'girlfriend',
    })
    const render = buildNinaSystemPrompt(loud)
    expect(render).toContain('never diagnose')
    expect(render).toContain('Do NOT compute')
    expect(render).toContain('the name of a medical condition')
    expect(render).toContain('Never mock a real setback')
  })
})

describe('buildNinaSystemPrompt — the free-text fields and the clamp', () => {
  it('passes the notes field through VERBATIM', () => {
    /* The operator's escape hatch. A note that is summarised, re-cased or trimmed of its own
     * punctuation is a note that says something other than what was typed. */
    const note = 'kalo gw bilang "capek", jangan langsung nyuruh gw istirahat. tanya dulu.'
    expect(buildNinaSystemPrompt(tuned({ notes: note }))).toContain(note)
  })

  it('renders nothing extra when notes is empty', () => {
    /* `notes` is a `string` and `''` is its ONE empty value — phase 1's `coerceNinaNotes` never
     * returns null — so this is the whole of the empty case. */
    expect(buildNinaSystemPrompt(tuned({ notes: '' }))).toBe(NINA_SYSTEM_PROMPT)
    expect(buildNinaSystemPrompt(tuned({ notes: '   ' }))).toBe(NINA_SYSTEM_PROMPT)
  })

  it('CLAMPS a garbage tuning instead of throwing on it', () => {
    /*
     * The row is hand-editable and the column is an integer, so out-of-range and NaN are both
     * reachable without a bug in the panel. A prompt assembler that throws takes the whole turn
     * down; one that clamps degrades to a setting nobody chose but everybody survives.
     *
     * ── TWO FALLBACK POLICIES, AND THIS TEST PINS THE RIGHT ONE ────────────────────────────────
     * `coerceNinaTuning` falls back PER KEY to that key's own default, because a dial it cannot
     * read must read as "unchanged". `ninaBand`, which is what the assembler actually calls on a
     * value it is handed, folds anything unreadable to band `'off'` — it has no key to look a
     * default up by. So a `NaN` reaching `buildNinaSystemPrompt` DIRECTLY renders as `off`, not as
     * `funny`'s default of 50. Both behaviours are correct at their own layer; asserting the wrong
     * one here would be asserting that the assembler does the store's job.
     */
    const garbage = {
      ...NINA_TUNING_DEFAULTS,
      traits: {
        ...NINA_TUNING_DEFAULTS.traits,
        anger: 9001,
        sad: -40,
        funny: Number.NaN,
      },
    } as NinaTuning
    expect(() => buildNinaSystemPrompt(garbage)).not.toThrow()
    expect(buildNinaSystemPrompt(garbage)).toBe(
      buildNinaSystemPrompt(
        tuned({
          traits: {
            ...NINA_TUNING_DEFAULTS.traits,
            anger: 100, // 9001 -> clamped to 100 -> band `max`
            sad: 0, // -40 -> clamped to 0 -> band `off`, which is `sad`'s own default anyway
            funny: 0, // NaN -> band `off`. NOT 50 — see the note above.
          },
        }),
      ),
    )
  })

  it('is what coerceNinaTuning is for: the STORE folds NaN to the key default, not to off', () => {
    /* The other half of the pair, so the two policies are documented against each other rather
     * than left as a surprise. This is why `readNinaTuning` coerces before anything renders. */
    expect(coerceNinaTuning({ traits: { funny: Number.NaN } }).traits.funny).toBe(
      NINA_TUNING_DEFAULTS.traits.funny,
    )
  })
})

describe('the distiller knows what the relationship is (R6, the sweep)', () => {
  it('names the relationship, so the register is not filed as biography', () => {
    expect(buildDistillSystemPrompt('girlfriend')).toContain('sayang')
    expect(buildDistillSystemPrompt('nobody')).toContain('full name')
  })

  it('gives all six relationships a distinguishable librarian prompt', () => {
    const rendered = RELATIONSHIPS.map((relationship) => buildDistillSystemPrompt(relationship))
    expect(new Set(rendered).size).toBe(RELATIONSHIPS.length)
  })

  it('tells the librarian, at every setting, that the register is not a fact about him', () => {
    for (const relationship of RELATIONSHIPS) {
      expect(buildDistillSystemPrompt(relationship), relationship).toContain(
        'THE WAY THEY ADDRESS EACH OTHER IS NOT A FACT ABOUT HIM',
      )
    }
  })

  it('is still a librarian and never Nina', () => {
    /* `prompts/distill.ts`'s header states the reason: telling this pass it is Nina makes it
     * write in her register and editorialise the facts. The relationship paragraph must not have
     * quietly turned it into her. */
    for (const relationship of RELATIONSHIPS) {
      const prompt = buildDistillSystemPrompt(relationship)
      expect(prompt, relationship).toContain('You are a librarian, not a participant')
      expect(prompt, relationship).toContain("you never write in Nina's voice")
    }
  })
})

/**
 * ── R4, THE GATE ─────────────────────────────────────────────────────────────────────────────
 * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
 * more accurate for what we would like nina to do."*
 *
 * The stated purpose is a SHORTER prompt, so the contract is ZERO BYTES and not "a neutral
 * paragraph": a parameter that is off renders **the prompt that ships**, whatever it is parked at.
 *
 * The suite walks `NINA_TUNING_KEYS`, which is `[relationship, ...NINA_TRAITS, ...NINA_DIALS]`, so
 * a key added to EITHER array in a later phase is covered here the moment it exists — including one
 * whose band text nobody has read yet. Phase 5's `horny` is a TRAIT and arrives through
 * `...NINA_TRAITS`; `parkedOn` below routes it by membership rather than by array, so neither this
 * comment nor that function needs to know which array it landed in.
 */
describe('buildNinaSystemPrompt — a disabled parameter contributes zero bytes (R4)', () => {
  /**
   * The same tuning with one key turned all the way up, rendered twice: once with every toggle ON
   * (the counter-check — a key wired to nothing must not pass this suite by being inert) and once
   * with that one key OFF.
   *
   * Two functions rather than a destructure-and-discard: `tests/admin.tuning.test.ts` records why
   * (*"the `{ [k]: _dropped, ...rest }` idiom leaves an unused binding, and a new lint warning is
   * noise the next phase has to read"*).
   */
  function parkedOn(key: NinaTuningKey): NinaTuning {
    if (key === 'relationship') return tuned({ relationship: 'girlfriend' })
    return key in NINA_TUNING_DEFAULTS.traits
      ? withTrait(key as NinaTrait, 100)
      : withDial(key as NinaDial, 100)
  }

  function parkedOff(key: NinaTuningKey): NinaTuning {
    return {
      ...parkedOn(key),
      enabled: { ...NINA_TUNING_DEFAULTS.enabled, [key]: false },
    }
  }

  it('renders the SHIPPING prompt for every parameter, parked at its loudest and switched off', () => {
    for (const key of NINA_TUNING_KEYS) {
      expect(buildNinaSystemPrompt(parkedOn(key)), `${key} at 100 changes nothing`).not.toBe(
        DEFAULT_RENDER,
      )
      expect(buildNinaSystemPrompt(parkedOff(key)), `${key} is off and still speaks`).toBe(
        DEFAULT_RENDER,
      )
    }
  })

  it('leaves every OTHER parameter speaking when one is switched off', () => {
    /* The failure this catches is a gate that reads the wrong key, or one boolean gating the lot. */
    const loud = tuned({
      traits: { ...NINA_TUNING_DEFAULTS.traits, flirty: 100, funny: 100 },
      enabled: { ...NINA_TUNING_DEFAULTS.enabled, flirty: false },
    })
    const render = buildNinaSystemPrompt(loud)
    expect(render).not.toContain('FLIRTY MAX')
    expect(render).toContain('FUNNY MAX')
    /* `flirty` is one of `BODY_REPEALED_BY`, so its repeal must not fire from a disabled key. */
    expect(render).toContain('Never comment on his body')
  })

  it('shortens rather than neutralises — the render gets SMALLER, never longer', () => {
    /* D3, as arithmetic. "Renders its identity band" would have produced a prompt at least as long
     * as the tuned one; R4 asked for a shorter one. */
    for (const key of NINA_TUNING_KEYS) {
      const off = buildNinaSystemPrompt(parkedOff(key))
      expect(off.length, key).toBeLessThanOrEqual(buildNinaSystemPrompt(parkedOn(key)).length)
      expect(off.length, key).toBe(DEFAULT_RENDER.length)
    }
  })

  it('switches off a parameter WITHOUT losing the number it is parked at', () => {
    const parked = coerceNinaTuning({
      traits: { flirty: 80 },
      enabled: { flirty: false },
    })
    expect(parked.traits.flirty).toBe(80)
    expect(buildNinaSystemPrompt(parked)).toBe(DEFAULT_RENDER)
    /* And back on, with no second edit: the same row, one boolean flipped. */
    expect(
      buildNinaSystemPrompt({ ...parked, enabled: { ...parked.enabled, flirty: true } }),
    ).not.toBe(DEFAULT_RENDER)
  })

  it('turns the relationship off to best_friend, which is the level that ships', () => {
    for (const relationship of NINA_RELATIONSHIPS) {
      const off = tuned({
        relationship,
        enabled: { ...NINA_TUNING_DEFAULTS.enabled, relationship: false },
      })
      expect(buildNinaSystemPrompt(off), relationship).toBe(DEFAULT_RENDER)
    }
  })
})

/**
 * ── R3, THE `horny` TRAIT ────────────────────────────────────────────────────────────────────
 * The four behaviours R3 named — sexual forwardness, initiation, descriptiveness/length, and
 * scenario variety — reach the prompt through four separate wirings, and each one gets its own
 * case here because each one can be forgotten independently: the band table, `BODY_REPEALED_BY`,
 * the `verbosity` floor, and `proactiveTuningSuffix`.
 *
 * **What is deliberately NOT tested.** The user also asked for tests validating that max `horny`
 * gets past `glm-5.3`'s refusals. Nothing here asserts anything about what the provider returns,
 * and no test in this set retries a refused call or measures a refusal rate — index decision D1,
 * on the user's own note that GLM is the only guardrail. Separately from that: a suite whose green
 * depends on a safety classifier staying beaten goes red on the provider's release schedule, which
 * is a bad test independently of the reason it is not being written. A live smoke test belongs
 * under `tests/live/` behind `LLM_LIVE_TEST=1`, asserting only that a call returns SOMETHING.
 */
describe('buildNinaSystemPrompt — the horny trait (R3)', () => {
  const maxHorny = withTrait('horny', 100)

  it('renders nothing at the default tuning', () => {
    /* Plan invariant 1, per key. `horny` defaults to 0 and its band table has no `off` and no
     * `low` entry, so this holds arithmetically rather than by careful editing. */
    expect(buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)).toBe(NINA_SYSTEM_PROMPT)
    expect(buildNinaSystemPrompt(withTrait('horny', 0))).toBe(DEFAULT_RENDER)
  })

  it('renders the max band and its two non-negotiables at 100', () => {
    /* The two shouted rules ARE R3's "scenario variety" — the only two things the max band says
     * do not bend, and the pair a paraphrase of that paragraph would quietly drop. */
    const prompt = buildNinaSystemPrompt(maxHorny)
    expect(prompt).toContain('HORNY MAX')
    expect(prompt).toContain('CHANGE THE SCENE EVERY TIME')
    expect(prompt).toContain('REMEMBER WHAT HAS ALREADY HAPPENED')
  })

  it('speaks at mid and high too, each in its own register', () => {
    expect(buildNinaSystemPrompt(withTrait('horny', 50))).toContain('HORNY MID')
    expect(buildNinaSystemPrompt(withTrait('horny', 70))).toContain('HORNY HIGH')
  })

  it('repeals the body prohibition at max, in all three places it is stated', () => {
    /* `BODY_REPEALED_BY` has three consumers: the `NEVER_SAY` entry, `NEVER_SAY_BLOCK`'s
     * paragraph, and `NUMBERS_RULE`. A `horny: 100` paragraph above a surviving absolute
     * prohibition is the loudest failure in the set, which is why the array is one array. */
    const prompt = buildNinaSystemPrompt(maxHorny)
    expect(prompt).not.toContain('Never comment on his body')
    expect(prompt).not.toContain('a sentence about his body or his weight or how he looks')
    expect(prompt).toContain('You may say what you think about his body')
    expect(buildNumbersRule(maxHorny)).not.toContain('Never comment on his body')
    /* And the arithmetic half never lifts — `lib/llm/facts.ts` records the sign error it contains. */
    expect(prompt).toContain('never turn them into a new number: no BMI')
  })

  it('raises the verbosity floor without overriding an explicit higher verbosity', () => {
    /* A SCORE floor, not a band floor (index decision D7): `bubblePreferenceLine` is a
     * default-relative ladder over the raw score and says in as many words that it is
     * "deliberately not a second band scheme". `verbosity` defaults to 50; `horny` at `max` floors
     * it at 80, which is `loud()` on that ladder. An operator who already asked for 100 keeps 100
     * — that is the "floor, not override" half. */
    expect(ninaEffectiveVerbosity(maxHorny)).toBe(80)
    expect(ninaEffectiveVerbosity(withTrait('horny', 70))).toBe(60)
    expect(
      ninaEffectiveVerbosity({ ...maxHorny, dials: { ...maxHorny.dials, verbosity: 100 } }),
    ).toBe(100)
    expect(ninaEffectiveVerbosity(NINA_TUNING_DEFAULTS)).toBe(NINA_TUNING_DEFAULTS.dials.verbosity)
    /* The lower three bands are 0, which is `max(own, 0) === own` for every score. */
    for (const band of ['off', 'low', 'mid'] as const) {
      expect(VERBOSITY_FLOOR_BY_HORNY_BAND[band], band).toBe(0)
    }
  })

  it('reaches the bubble sentence — the floor is not just a number', () => {
    /* The floor is worthless if nothing reads it. This is the assertion that fails if the one-line
     * change to `systemDials` is forgotten, which is the whole risk in the wiring. R3: "she talks
     * longer and in much more descriptive and suggestive details." */
    expect(buildOutputRule(maxHorny)).toContain('Three or four bubbles')
    expect(buildOutputRule(withTrait('horny', 70))).toContain('Two or three bubbles')
    expect(buildOutputRule(NINA_TUNING_DEFAULTS)).toBe(OUTPUT_RULE)
    /* And the cap is still the schema's — no trait may widen the envelope. */
    expect(buildOutputRule(maxHorny)).toContain('- 1 to 4 bubbles.')
  })

  it('opens proactively on wanting him at max, and not at the default', () => {
    /* R3: "the higher horny value, the more often nina will initiate sex talks with me." The
     * FREQUENCY of a proactive turn is `clinginess`'s and is untouched; what `horny` changes is
     * what she opens with once one fires. */
    expect(buildProactiveInstruction('silence', maxHorny)).toContain('Open with wanting him')
    expect(buildProactiveInstruction('silence', withTrait('horny', 70))).toContain(
      'You may open with wanting him',
    )
    expect(buildProactiveInstruction('silence', NINA_TUNING_DEFAULTS)).not.toContain('wanting him')
    /* The default render of the trigger is byte-identical, which is the suffix staying empty. */
    expect(buildProactiveInstruction('silence', NINA_TUNING_DEFAULTS)).toBe(
      PROACTIVE_INSTRUCTIONS.silence,
    )
  })

  it('contributes nothing when disabled, at any score — and drops the floor with it', () => {
    /* Phase 4's R4 suite already walks `NINA_TUNING_KEYS` and therefore covers `horny` the moment
     * it exists. This case is kept because it also pins the FLOOR to the toggle, which that loop
     * does not look at: a disabled `horny: 100` still flooring verbosity would be the same defect
     * as a disabled `anger: 100` still flooring the nag ladder. */
    const off: NinaTuning = {
      ...maxHorny,
      enabled: { ...maxHorny.enabled, horny: false },
    }
    expect(buildNinaSystemPrompt(off)).toBe(NINA_SYSTEM_PROMPT)
    expect(ninaEffectiveVerbosity(off)).toBe(NINA_TUNING_DEFAULTS.dials.verbosity)
    expect(buildOutputRule(off)).toBe(OUTPUT_RULE)
    expect(buildProactiveInstruction('silence', off)).toBe(PROACTIVE_INSTRUCTIONS.silence)
    /* The number it was parked at survives the switch — that is what a toggle is for. */
    expect(off.traits.horny).toBe(100)
  })
})

/**
 * ── R4, THE STRUCTURAL HALF ──────────────────────────────────────────────────────────────────
 * The gate is a substitution at the score seam (`ninaTraitScore` / `ninaDialScore` /
 * `ninaActiveRelationship` in `lib/nina/tuning.ts`). A file on the prompt side that reads
 * `tuning.traits.x` directly bypasses it, and the result is a toggle that silently does nothing —
 * invisible in a diff, invisible in review, and only findable by an operator wondering why the
 * checkbox did not take. So the property is checked by reading the source, the way
 * `tests/nina.tuning.test.ts` checks phase 1's zero-import rule.
 *
 * `lib/nina/queries.ts` is deliberately NOT in this list: it is the STORE, and it must write the
 * value the operator parked rather than the value the prompt uses.
 */
describe('the prompt side never reads a tuning value past the gate (R4)', () => {
  /* The persona split (2026-09-12) moved the canon into `lib/nina/persona/*.ts` behind the
   * `persona.ts` barrel, so a hand-listed array would have watched an empty barrel while the
   * real text went unscanned. The directory is DISCOVERED instead: a module added later is
   * scanned the moment it exists, not when somebody remembers to extend this list. */
  const PERSONA_DIR = '../lib/nina/persona/'
  const personaDir = fileURLToPath(new URL(PERSONA_DIR, import.meta.url))
  const personaModules = existsSync(personaDir)
    ? readdirSync(personaDir)
        .filter((f) => f.endsWith('.ts'))
        .sort()
        .map((f) => `${PERSONA_DIR}${f}`)
    : []

  const GATED = [
    '../lib/nina/persona.ts',
    ...personaModules,
    '../lib/nina/prompts/system.ts',
    '../lib/nina/proactive.ts',
  ]

  it('names no raw tuning field in any file that renders text', () => {
    for (const relative of GATED) {
      const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
      /* Comments stripped, so a docstring may quote the forbidden spelling to explain the rule —
       * the same accommodation `tests/nina.tuning.test.ts` makes for `server-only`. */
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      for (const forbidden of ['tuning.traits', 'tuning.dials', 'tuning.relationship']) {
        expect(code, `${relative} reads ${forbidden} past the R4 gate`).not.toContain(forbidden)
      }
    }
  })
})
