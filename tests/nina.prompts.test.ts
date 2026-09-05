import { describe, expect, it } from 'vitest'

import { ANGER_LADDER, JAKARTA_SLANG, NINA_APPEARANCE, VOICE_EXAMPLES } from '@/lib/nina/persona'
import {
  NINA_PROMPT_VERSION,
  NINA_SECTION_TITLES,
  NINA_SYSTEM_PROMPT,
  NINA_TOOLS,
  PROACTIVE_INSTRUCTIONS,
  SEND_TOOL,
  buildNinaSystemPrompt,
  buildProactiveInstruction,
} from '@/lib/nina/prompts'
import { buildDistillSystemPrompt } from '@/lib/nina/prompts/distill'
import {
  coerceNinaTuning,
  NINA_ADDRESS,
  NINA_RELATIONSHIPS,
  NINA_TUNING_DEFAULTS,
  type NinaDial,
  type NinaRelationship,
  type NinaTrait,
  type NinaTuning,
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
 * eleven traits and the relationship, whose words `lib/nina/persona.ts` owns, the assertion is that
 * the render CHANGES and GROWS — which is exactly the property that fails when a dial is wired to
 * nothing.
 */
describe('buildNinaSystemPrompt — every dial reaches the prompt', () => {
  it('gives each of the eleven traits at 100 text of its own', () => {
    for (const key of Object.keys(NINA_TUNING_DEFAULTS.traits) as NinaTrait[]) {
      const render = buildNinaSystemPrompt(withTrait(key, 100))
      expect(render, `${key} at 100 changed nothing`).not.toBe(DEFAULT_RENDER)
      expect(render.length, `${key} at 100 added no text`).toBeGreaterThan(DEFAULT_RENDER.length)
    }
  })

  it('distinguishes 0 from 100 for every trait, and 0 IS the default for the six that ship at 0', () => {
    /*
     * The defaults are not uniform: `anger`, `sad`, `flirty`, `steamy`, `annoying` and `anxious`
     * ship at **0**, so a slider dragged to 0 is a slider that has not moved and the render must be
     * identical. That is the compatibility contract per key, not an exception to it.
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
  it('renders all five relationships without throwing, and none is empty', () => {
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

  it('gives all five relationships a distinguishable librarian prompt', () => {
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
