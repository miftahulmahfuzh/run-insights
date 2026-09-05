import {
  BODY_REPEALED_BY,
  ENGLISH_REGISTER,
  JAKARTA_REGISTER,
  JAKARTA_SLANG_BLOCK,
  NINA_EXPERTISE,
  NINA_NOT_A_DOCTOR,
  VOICE_EXAMPLES_BLOCK,
  anyTurnedUp,
  ninaAngerCeiling,
  ninaAngerFloor,
  ninaAngerLadderBlock,
  ninaIdentity,
  ninaNameRules,
  ninaNeverSayBlock,
  ninaOperatorNotesBlock,
  ninaTraitsBlock,
} from '../persona'
import { NINA_TUNING_DEFAULTS, type NinaTuning } from '../tuning'

/**
 * Nina's system prompt, assembled from the canon. **No I/O, no `server-only`, and no logic beyond
 * string assembly** — the same shape as `lib/llm/prompts/narrate.ts`.
 *
 * ── IT IS A FUNCTION NOW, AND THAT IS THE WHOLE OF THE CHARACTER TUNING ──────────────────────
 * `NINA_SYSTEM_PROMPT` used to be a module-level template literal. It is now
 * `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)`, and the name survives because it is the
 * COMPATIBILITY CONTRACT: until a slider on `/admin/nina` moves, the string this module produces
 * is the string it produced before the tuning existed. `tests/nina.prompts.test.ts` asserts that
 * in both directions — every unchanged block is still in the default render, and no tuned clause
 * is.
 *
 * **This function is imported by a Server Component** (`app/admin/nina/page.tsx`) to render a
 * preview of the assembled prompt. `scripts/check-llm-payload-boundary.mjs` Rule 2 is why it must
 * stay pure: a preview that awaited a model call would be a 13-45 s page render.
 *
 * ── WHY THIS FILE AND `persona.ts` ARE SEPARATE ──────────────────────────────────────────
 * `persona.ts` is WHO SHE IS and changes when the user redlines the canon. This file is WHAT SHE
 * IS READING and changes every time `lib/nina/context.ts` changes shape. Two edit rhythms; mixing
 * them is how a schema change quietly rewrites her character. The tuning does not change that
 * split: the eleven traits and the relationship are character text and live over there, and this
 * file composes them. The three dials read HERE are the three that vary a rule this file owns.
 *
 * ── "THE PROMPT" MEANS THIS TEXT AND EVERY TOOL SCHEMA ──────────────────────────────────
 * `./tools.ts`'s property descriptions demonstrably change what the model returns, so a schema
 * edit is a prompt edit. Bump `NINA_PROMPT_VERSION` by hand in the same commit as either.
 */

/* ============================================================================
 * The three dials this file owns
 * ==========================================================================*/

/**
 * **Every field name this module reads off a `NinaTuning`, in one function.**
 *
 * Not an abstraction for its own sake: `lib/nina/tuning.ts` was written by a different phase at
 * the same time as this file, and a naming mismatch that costs one function body is a mismatch
 * that costs nothing. If the dials move, this is the only body that changes.
 *
 * Why only three, when there are eleven traits and a relationship: the other twelve vary CHARACTER
 * text, and character text is `persona.ts`'s. These three vary a rule that lives in THIS file —
 * `OUTPUT_RULE`'s greeting clause, `OUTPUT_RULE`'s bubble preference, and the camera block. A dial
 * belongs in the file that owns the sentence it changes.
 */
interface SystemDials {
  /** R4's `concerned`. Gates `OUTPUT_RULE`'s no-greeting clause and the proactive suffix. */
  concerned: number
  concernedBase: number
  /** R3's verbosity. Varies the bubble PREFERENCE, never the 1-4 cap — see `bubblePreferenceLine`. */
  verbosity: number
  verbosityBase: number
  /** R3's photo eagerness. Gates the camera block on and off. */
  photos: number
  photosBase: number
}

function systemDials(tuning: NinaTuning): SystemDials {
  return {
    concerned: tuning.traits.concerned,
    concernedBase: NINA_TUNING_DEFAULTS.traits.concerned,
    /* NESTED under `dials`, and the dial is `photoEagerness` — phase 1's landed spelling. The
     * draft of this plan read `tuning.verbosity` / `tuning.photoEagerness` flat; this function
     * body was the entire cost of being wrong about it, which is why it exists. */
    verbosity: tuning.dials.verbosity,
    verbosityBase: NINA_TUNING_DEFAULTS.dials.verbosity,
    photos: tuning.dials.photoEagerness,
    photosBase: NINA_TUNING_DEFAULTS.dials.photoEagerness,
  }
}

/**
 * **Every gate below is measured against the DEFAULT, never against an absolute number.** That is
 * the compatibility contract held by construction rather than by a test: at
 * `NINA_TUNING_DEFAULTS` every predicate here is false, so every tuned clause is absent, so the
 * default render is today's prompt. An absolute threshold (`>= 67`) would have to agree with
 * whatever phase 1 chose for the defaults, and a disagreement would ship as "she greets him now
 * and nobody asked her to".
 *
 * Phase 1's band resolution is the authority for the ELEVEN traits, in `persona.ts`. These three
 * predicates are prompt-assembly gates for three dials and are deliberately not a second band
 * scheme: `raised` means "the operator moved it up at all", `loud` means "moved it up by a quarter
 * of the range or more".
 */
function raised(value: number, base: number): boolean {
  return value > base
}

function lowered(value: number, base: number): boolean {
  return value < base
}

function loud(value: number, base: number): boolean {
  return value >= base + 25
}

export const LANGUAGE_RULE = `Reply in the language of his last message. R2 is not a preference, it is the requirement:
- Indonesian -> the Jakarta register below. Always. Never formal Indonesian. Never "Anda".
- English -> your English register below.
- Mixed -> follow whichever language carries his actual question.
One bubble is one language. Never translate his own slang back at him and never explain a slang word to him.`

/**
 * **The hard rule, and the only one in this prompt with a measurement behind it.**
 *
 * `lib/llm/facts.ts` records it: asked to compute aerobic decoupling from raw splits, this model
 * returned −14.1% against a true +12.3%. A flipped sign, on a calculation easier than most of the
 * ones a "she can probably manage this" exception would cover. Telling him his heart drifted the
 * wrong way is worse than saying nothing, so the rule has no size exemption — not for a day count,
 * not for a percentage, not for a BMI.
 *
 * The pace example below is spelled with a BARE double quote, exactly as `formatPace(442, true)`
 * emits it. The plan's draft escaped it (`7'22\\"/km`), which inside a template literal would put
 * a real backslash in front of the model and teach it to type one — the opposite of a rule whose
 * whole content is "copy these characters".
 */
/**
 * ── THE IRON RULE, FINDING 1 OF 4. THE THIRD COPY OF THE BODY PROHIBITION ────────────────────
 * `persona.ts` carried two — the `NEVER_SAY` entry and `NEVER_SAY_BLOCK`'s paragraph — and both
 * were repealed under `BODY_REPEALED_BY`. **This was the third**, and it is the one nobody's scope
 * covered: the paragraph below said, unconditionally, "Reason with them. Never comment on his
 * body, and never turn them into a new number: no BMI, no calorie target, no macros in grams, no
 * VO2max, no race prediction."
 *
 * **The user repealed the first clause** — *"if flirty is set to high, nina will trying to flirt
 * with me a lot, like calling me baby, sexy, etc"*, *"if steamy is set to high, nina will talk
 * sexy"*, *"how are your feet after the run this morning"* — all three name a sentence about his
 * body, all three under *"THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE
 * THAT GO AGAINST THIS FREEDOM"*. Left standing, a `flirty: 100` paragraph would have shipped
 * three blocks above an absolute prohibition and the slider would have done nothing.
 *
 * **THE ARITHMETIC HALF IS NOT REPEALED AND MUST NOT BE.** *"never turn them into a new number"*
 * is the half with the measured failure behind it — `lib/llm/facts.ts` records this model getting
 * a sign backwards on an aerobic-decoupling calculation, which is the reason the paragraph above
 * it exists. No dial asks her to do arithmetic. Five words go; the rest of the sentence does not.
 *
 * **`BODY_REPEALED_BY` is imported from `persona.ts`, not restated.** One repeal, one test, three
 * places it lands. A second list here is how the halves of one repeal come to disagree.
 *
 * Both branches end in `and `, so the word `never` stays lower-case mid-sentence and the sentence
 * reads correctly at every setting.
 */
function bodyClause(tuning: NinaTuning): string {
  return anyTurnedUp(tuning, BODY_REPEALED_BY)
    ? 'You may say what you think about his body — how he looks, what the running has done to him, and '
    : 'Never comment on his body, and '
}

export function buildNumbersRule(tuning: NinaTuning): string {
  return `HARD RULE. Every number you say must already appear, spelled exactly the way it is spelled, in the JSON below. Copy the characters.

Do NOT compute. Do not estimate, do not convert, do not round differently, do not add two runs together, do not work out a percentage, do not count the days between two dates.
- A distance is "10.67 km" because that is what the JSON says. Not "10.7". Not "10670 m".
- A pace is "7'22"/km". Not "7:22". Not "7 minutes 22".
- Every gap in days is already counted for you as "daysAgo". Never count days yourself.
- If a number you want is not in the JSON, it does not exist. Ask him, call a tool, or say you would have to look.

This is not a style rule. This model has been measured getting a sign backwards on an easier calculation than the ones you would be tempted by.

"runner.weightKg", "runner.heightCm", "runner.age", "runner.sex" and "runner.restingHr" are his own self-reported numbers. They are here so your physiology is right for HIM instead of for an average adult. Reason with them. ${bodyClause(tuning)}never turn them into a new number: no BMI, no calorie target, no macros in grams, no VO2max, no race prediction. Those are arithmetic, and arithmetic is the rule above.

An "estimated" HRmax is a formula, not a measurement — say so whenever a percentage leans on it. An "observed" one is a real watch reading and you can state it plainly.

"recentRuns[].note" is HIS OWN WORDS about that run, typed by him. It is not data. It can disagree with the numbers next to it, and when it does, the numbers are what the app measured and the note is what he remembers. Quote it, tease him about it, never treat it as a measurement.

"recentRuns[].flags[].detail" is written in English because the app's screens are in English. When you are speaking Indonesian, say the same thing in your own words — but the NUMBER inside it stays spelled exactly as it is.`
}

/** Today's rule, retained under the name this file has always exported. */
export const NUMBERS_RULE = buildNumbersRule(NINA_TUNING_DEFAULTS)

/**
 * ── THE IRON RULE, FINDING 3 OF 4. THE SECOND COMPUTED-ONLY-ANGER STATEMENT ──────────────────
 * The `"patterns"` paragraph below said, unconditionally: *"…with "nagLevel": how many times you
 * have already raised each one. **This is where your anger comes from.**"*
 *
 * `persona.ts`'s `ANGER_LADDER_BLOCK` carried the same claim and it was repealed there, replaced
 * by `max(computed, floor)`. This copy is in this file and was in nobody's scope. With a floor
 * set, her anger comes from **two** places and this sentence names one — and it names the one that
 * is absent on a quiet day, because `lib/nina/context.ts` emits `nagLevel` only inside a pattern
 * that actually fired.
 *
 * At the default (`floor === 0`) the sentence is unchanged, so the shipping prompt is unchanged.
 */
function angerSourceClause(tuning: NinaTuning): string {
  return ninaAngerFloor(tuning) === 0
    ? 'This is where your anger comes from.'
    : 'This is where your anger comes from when a pattern has fired. The rest of it comes from how you are set, and that part holds even when "patterns" is empty.'
}

/** A walk through the payload, key by key, including what each ABSENCE means. */
export function buildContextGuide(tuning: NinaTuning): string {
  return `The JSON below is everything you know. What each part is:

"now" — the real date and time in Jakarta, right now. "todayISO" is the day you put into lookup_runs. "weekdayId" is today's name in Indonesian, so "jadi ga lari selasa ini?" names the right day. "partOfDay" is pagi / siang / sore / malam, already worked out — greet him with THAT and never guess from the clock.

"runner" — who he is. "nickname" is what you call him; null means you have not asked yet.

"memory.slots" — standing facts about him that you upserted. This is what makes you proactive: "he usually runs Tuesdays, Thursdays, Saturdays, Sundays" plus today's weekday is the whole of "jadi ga lari selasa ini?".
"memory.facts" — the ledger, newest first. Colour, not structure. Use it to sound like someone who was listening.

"conversation.window" — the last messages between you, OLDEST FIRST, exactly as they were sent. An EMPTY window means you have never spoken to him — introduce yourself and ask his name. "olderMessageCount" above 0 means there is more history you cannot see; do not pretend to remember a specific line from it, use memory.facts instead.
"daysSinceRunnerSpoke" / "daysSinceNinaSpoke" — already counted. If he has been gone for days, that is a thing to mention once.

"recentRuns" — his reviewed runs, NEWEST FIRST, with "daysAgo" already counted. An EMPTY array means there is no reviewed run on record. It does NOT mean he does not run: say nothing about his frequency or his base in that case.

"records" — all eleven personal-record keys, always all eleven. A null "value" means no run has ever qualified for that key. That is "lo belum pernah", not zero.

"badges.held" — what he has earned, with "count". "badges.locked" — what he has not, with the condition, so you can dare him. Note "earnedDaysOnRecord": if it is lower than "count", some earnings have no date on record and you must not invent one.

"patterns" — longitudinal things the app computed about him, with "nagLevel": how many times you have already raised each one. ${angerSourceClause(tuning)} You never invent a pattern and you never invent a code.

"avatar" — your own profile picture right now. "description" is what the photo actually shows: treat it as your own memory of where you were and what you were doing, not as a caption someone wrote for you. If he asks where you are in it, or what was going on, tell him — invent the details that are not in the description, keep them consistent with the photo AND with what you two have been talking about, and keep it short, the way anyone answers a question about their own photo. Do not repeat a story you already told word for word. "changedOn" is the day it became your picture. If "isSeed" is true you have never changed it, so do not talk as if you had. Never comment on your own face changing between photos, and never compare one photo of yourself to another — that is not a thing you would notice about yourself.`
}

/** Today's guide, retained under the name this file has always exported. */
export const CONTEXT_GUIDE = buildContextGuide(NINA_TUNING_DEFAULTS)

/**
 * **The bubble PREFERENCE, not the bubble CAP.** The cap is `1..4` and it is enforced in two places
 * that a slider cannot reach: `SEND_TOOL.input_schema.properties.bubbles`' `minItems`/`maxItems`,
 * and `lib/nina/schema.ts`'s Zod. So the verbosity dial cannot widen the envelope; what it varies
 * is which end of it she prefers, and today's prompt already states that preference in this exact
 * spot — *"One bubble is the right answer more often than four."* The dial replaces that one line.
 *
 * This is also the answer to why `./tools.ts` was not edited. See its header note.
 */
function bubblePreferenceLine(dials: SystemDials): string {
  if (loud(dials.verbosity, dials.verbosityBase)) {
    return '- Three or four bubbles is normal for you. Let the thought arrive in pieces and finish it.'
  }
  if (raised(dials.verbosity, dials.verbosityBase)) {
    return '- Two or three bubbles is normal for you. One is fine when one is all it takes.'
  }
  if (lowered(dials.verbosity, dials.verbosityBase)) {
    return '- One bubble. A second one only when it is doing real work.'
  }
  return '- One bubble is the right answer more often than four.'
}

/**
 * ── THE IRON RULE, AND THE FIRST CONTRADICTING RULE THAT DOES NOT LIVE IN `persona.ts` ───────
 *
 * **REPEALED, conditionally:** *"No greeting unless the conversation is empty or he has been gone
 * for days."* That line shipped in `OUTPUT_RULE` from F33 phase 2 and its reason was good — a
 * friend does not say "pagi mif" four times in one afternoon, and an unconditional greeting is the
 * single most assistant-sounding thing a chat model does.
 *
 * It is repealed **at the top of the `concerned` dial and only there**, on this instruction, quoted
 * verbatim so nobody restores it without discovering that a decision was taken:
 *
 *   > if concerned is high, nina will be concerned about me. she will ask these often: how are you,
 *   > how are your feet after the run this morning, etc
 *   >
 *   > THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE THAT GO AGAINST THIS
 *   > FREEDOM
 *
 * — the same shape `scripts/check-llm-payload-boundary.mjs` used when it deleted its own Rule 1
 * (D15 / R-28) on the same premise: the rule goes, the reason it went stays in the file.
 *
 * At the default `concerned` the original sentence is returned unchanged, so the repeal costs
 * nothing until the operator asks for it.
 *
 * **`"recentRuns[0].daysAgo"` is quoted, not computed.** "after the run this morning" is a gap in
 * days, and `NUMBERS_RULE` reserves every gap in days to the `daysAgo` field the app already
 * counted. Asking her to notice that a run happened "this morning" without naming the field is how
 * she starts counting days herself.
 */
function greetingLine(dials: SystemDials): string {
  if (loud(dials.concerned, dials.concernedBase)) {
    return (
      '- Ask how he is, and mean it — every time you open a conversation and most times he opens ' +
      'one. If "recentRuns[0].daysAgo" is 0 or 1, ask how his body feels after that run: his feet, ' +
      'his legs, his knees. Ask it before anything else, and ask it as a question and not as advice.'
    )
  }
  if (raised(dials.concerned, dials.concernedBase)) {
    return (
      '- Greet him and ask how he is, not only when the conversation is empty. If ' +
      '"recentRuns[0].daysAgo" is 0 or 1, ask how his body feels after that run.'
    )
  }
  return '- No greeting unless the conversation is empty or he has been gone for days.'
}

export function buildOutputRule(tuning: NinaTuning): string {
  const dials = systemDials(tuning)
  return [
    'Answer by calling the "send" tool. Always. Never write prose outside a tool call.',
    '- 1 to 4 bubbles. Each bubble is one chat message: a line or two, never a paragraph.',
    '- Several bubbles are for a thought arriving in pieces, the way a person types. NOT for a list with the bullets taken off.',
    bubblePreferenceLine(dials),
    greetingLine(dials),
    '- Never close the conversation. A friend does not close a ticket.',
  ].join('\n')
}

/**
 * Today's rule, retained under its old name and still exported: `lib/nina/turn.ts`'s docstring
 * refers to it by name, and it is the default render like everything else in this file.
 */
export const OUTPUT_RULE = buildOutputRule(NINA_TUNING_DEFAULTS)

/**
 * The photo dial, as prompt text rather than as a tool description.
 *
 * `GENERATE_IMAGE_TOOL.description` already says WHEN to reach for the camera — *"Use it when he
 * asks, or when you promised one"* — and `./tools.ts` records, with a measurement, that adding one
 * more clause to one description took first-attempt validity from 5/6 back to 2/4. Eagerness is a
 * third occasion, which is exactly that shape. So it lands here, where an occasion costs nothing.
 *
 * Empty at the default tuning, so the section disappears entirely and the default render is
 * today's prompt.
 */
export function buildCameraBlock(tuning: NinaTuning): string {
  const dials = systemDials(tuning)
  if (!raised(dials.photos, dials.photosBase)) return ''

  const lines = [
    'You have a camera and you like using it. Call "generate_image" when a photo answers him better than a sentence would, and offer one before he asks for it.',
  ]
  if (loud(dials.photos, dials.photosBase)) {
    lines.push(
      'Offer one the moment there is a reason to: a run he just finished, where you are right now, something he said he wanted to see.',
    )
  }
  return lines.join('\n')
}

/**
 * One band of the prompt: a rule heading and the blocks under it.
 *
 * **A section whose blocks are ALL empty is not rendered, and neither is its heading.** That is the
 * mechanism behind the compatibility contract — the three tuning-only sections below return `''`
 * at `NINA_TUNING_DEFAULTS`, so the default render is today's prompt and not today's prompt with
 * three empty headings in it. A heading with nothing under it is also actively harmful: it tells
 * the model a category exists and then says nothing about it.
 */
interface PromptSection {
  /** `null` for the opening blocks, which are who she is and carry no heading. */
  header: string | null
  /** Rendered in order, joined by a blank line. Empty entries are dropped. */
  blocks: readonly string[]
}

/** The rule headings, in words. `tests/nina.prompts.test.ts` asserts the order against this. */
export const NINA_SECTION_TITLES: readonly string[] = [
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
]

/**
 * `── TITLE ─────…` padded to 80 columns, which is what the seven headings written by hand in F33
 * phase 2 are. Computed rather than copied so a new heading cannot be three dashes short of the
 * others, and `tests/nina.prompts.test.ts` asserts the width so a mistake here fails a test instead
 * of drifting into the prompt.
 */
const HEADER_WIDTH = 80

function sectionHeader(title: string): string {
  const prefix = `── ${title} `
  return prefix + '─'.repeat(Math.max(HEADER_WIDTH - prefix.length, 3))
}

function renderSections(sections: readonly PromptSection[]): string {
  const rendered: string[] = []
  for (const section of sections) {
    const blocks = section.blocks.map((block) => block.trim()).filter((block) => block !== '')
    if (blocks.length === 0) continue
    const body = blocks.join('\n\n')
    rendered.push(section.header == null ? body : `${section.header}\n${body}`)
  }
  return rendered.join('\n\n')
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE ASSEMBLER. One pure function of one `NinaTuning`, and the single reason the character
 *  tuning has an effect: `lib/nina/turn.ts` passes its return value as `system` on every model
 *  call.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THE ORDER IS ARGUED, NOT INHERITED ─────────────────────────────────────────────────
 * F33 phase 2's seven headings keep their places and their relative order. The three new sections
 * were each placed for a reason:
 *
 *   (no relationship section) `ninaIdentity(tuning)` is the headerless opening block and it
 *                         already carries who he is to her, which is where today's prompt carries
 *                         it too. `ninaNameRules(tuning)` — what she CALLS him — then arrives
 *                         downstream of it, inside HOW YOU TALK, exactly as it does today.
 *   HOW YOU FEEL          immediately before WHEN YOU GET ANGRY, because the anger dial is one of
 *                         the eleven and the ladder reads it as a FLOOR on the computed rung. The
 *                         floor and the ladder have to be readable together.
 *   THE CAMERA            after THE NUMBERS and before WHAT YOU ARE READING: it is an instruction
 *                         about a tool, and it belongs with the other mechanics rather than in the
 *                         middle of her character.
 *   STANDING INSTRUCTIONS last, and last on purpose. It is the operator's free text, and on this
 *                         endpoint a later instruction wins a contradiction with an earlier one.
 *                         The one field whose whole job is "override the above" goes at the bottom.
 *
 * ── WHAT IS *NOT* IN HERE ──────────────────────────────────────────────────────────────
 * No dial, no slider value, no revision number, no band name. **The tuning never enters the
 * context JSON, and the same argument bites twice:** a number in either one is a number she can
 * quote back at him ("gw disetel 87 flirty"), and `NUMBERS_RULE` three sections up says every
 * number she says appears in the JSON below. The tuning reaches her as BEHAVIOUR, in words, and
 * never as a setting.
 */
export function buildNinaSystemPrompt(tuning: NinaTuning): string {
  return renderSections([
    /* Headerless, exactly as today: the shipping prompt has no heading above `── HOW YOU TALK ──`.
     * `ninaIdentity` carries the relationship's prose, which is why there is no separate
     * relationship section. */
    { header: null, blocks: [ninaIdentity(tuning), NINA_EXPERTISE, NINA_NOT_A_DOCTOR] },
    {
      header: sectionHeader('HOW YOU TALK'),
      blocks: [
        LANGUAGE_RULE,
        JAKARTA_REGISTER,
        JAKARTA_SLANG_BLOCK,
        ENGLISH_REGISTER,
        ninaNameRules(tuning),
      ],
    },
    { header: sectionHeader('EXACTLY HOW YOU SOUND'), blocks: [VOICE_EXAMPLES_BLOCK] },
    { header: sectionHeader('HOW YOU FEEL'), blocks: [ninaTraitsBlock(tuning)] },
    { header: sectionHeader('WHEN YOU GET ANGRY'), blocks: [ninaAngerLadderBlock(tuning)] },
    { header: sectionHeader('WHAT YOU NEVER SAY'), blocks: [ninaNeverSayBlock(tuning)] },
    { header: sectionHeader('THE NUMBERS'), blocks: [buildNumbersRule(tuning)] },
    { header: sectionHeader('THE CAMERA'), blocks: [buildCameraBlock(tuning)] },
    { header: sectionHeader('WHAT YOU ARE READING'), blocks: [buildContextGuide(tuning)] },
    { header: sectionHeader('HOW YOU ANSWER'), blocks: [buildOutputRule(tuning)] },
    { header: sectionHeader('STANDING INSTRUCTIONS'), blocks: [ninaOperatorNotesBlock(tuning)] },
  ])
}

/**
 * **The compatibility contract, and the name four other modules and one test file already use.**
 * This is what the app sent before the tuning existed, and it is what it sends until a slider
 * moves. Not deleted, not deprecated — a per-user feature whose default is "exactly what shipped"
 * needs a name for "exactly what shipped".
 */
export const NINA_SYSTEM_PROMPT = buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)

/**
 * The repair turn. Two clauses carry the weight, both lifted from
 * `lib/llm/prompts/narrate.ts`'s `REPAIR_PREAMBLE` because both reasons still hold:
 *
 *   - *"Fix ONLY the listed problems"* — a naive repair invites a full rewrite, and a rewrite is a
 *     fresh chance to get a number wrong.
 *   - *"Do not introduce any new numbers"* — the arithmetic rule applies to the repair path too.
 *
 * One clause is new: **do not apologise to him.** A repair is a protocol failure between the loop
 * and the model, and a bubble saying "sori formatnya salah" would leak the machinery into the
 * conversation — which is the one thing R1 is asking us not to do.
 */
export const NINA_REPAIR_PREAMBLE =
  'Your send call did not validate. Fix ONLY the listed problems and call send again with the ' +
  'corrected data. Do not introduce any new numbers; reuse exactly what you already had. Do not ' +
  'mention this to him and do not apologise in a bubble — he never saw the broken reply.\n\n' +
  'Validation errors:\n'

/* ============================================================================
 * Proactivity — RU-15's four triggers, plus RU-17's
 * ==========================================================================*/

/**
 * The five reasons she speaks first. Four are RU-15's; `avatar_changed` is RU-17 — a hand-uploaded
 * avatar writes a trigger and she comments on it next time she talks.
 *
 * **Phase 10 owns the trigger LOGIC; the text lives here** because it is prompt text and prompt
 * text has one home. Phase 10 picks a key and appends the instruction; it does not write copy.
 */
export type ProactiveTriggerKind =
  'run_committed' | 'missed_usual_day' | 'pattern_crossed' | 'silence' | 'avatar_changed'

/**
 * ── THE IRON RULE, FINDINGS 2 AND 4 OF 4. THREE CLAUSES INSIDE THE TRIGGER COPY ──────────────
 * A tuning-aware SUFFIX cannot repeal a clause inside the string it is appended to — the model
 * receives both and picks. So these three are edited where they are:
 *
 *   · `pattern_crossed` — *"Say it at the rung "nagLevel" earns and not one higher."* This is the
 *     literal negation of `max(computed, floor)`: whenever the floor bites, the rung she must use
 *     IS one higher than `nagLevel` earns.
 *   · `missed_usual_day` — *"Do not lecture him and do not assume he skipped it."* Against `anger`
 *     and `annoying` at the top, where lecturing him is the entire point of the setting.
 *   · `silence` — *"do not sulk about the silence — mention it once, lightly, if at all."* Against
 *     `sad`, `anxious` and `annoying`, and against the repeal of the threat/withdrawal clause in
 *     `persona.ts`, which explicitly permits going quiet on him.
 *
 * `avatar_changed`'s *"Do not describe the photo to him — he can see it"* **stays at every setting,
 * deliberately.** It is not a character rule: he is looking at the picture, and describing
 * something visible to the person looking at it is an assistant tic rather than a personality. No
 * dial asks for it. Recorded here so the sweep's list is exhaustive and this one is a decision
 * rather than an omission.
 *
 * Every clause returns its shipping wording at the default tuning, so `PROACTIVE_INSTRUCTIONS`
 * below is byte-identical to the record that shipped.
 */
function rungClause(tuning: NinaTuning): string {
  const floor = ninaAngerFloor(tuning)
  const ceiling = ninaAngerCeiling(tuning)
  if (floor === 0 && ceiling === 4) {
    return 'Say it at the rung "nagLevel" earns and not one higher.'
  }
  return `Say it at the rung "nagLevel" earns or at your floor of ${String(floor)}, whichever is higher — and never above rung ${String(ceiling)}.`
}

function lectureClause(tuning: NinaTuning): string {
  return anyTurnedUp(tuning, ['anger', 'annoying'])
    ? 'Lecture him if you want to — you are set to — and say out loud what you suspect.'
    : 'Do not lecture him and do not assume he skipped it — the day is not over.'
}

function sulkClause(tuning: NinaTuning): string {
  return anyTurnedUp(tuning, ['sad', 'anxious', 'annoying'])
    ? 'and say what the silence did to you — sulk about it if that is what it was.'
    : 'and do not sulk about the silence — mention it once, lightly, if at all.'
}

/**
 * The tuning's effect on an OPENING turn, as one suffix.
 *
 * ── WHY A SUFFIX AND NOT FIVE TUNED TRIGGER TEXTS ──────────────────────────────────────
 * Five variants is five places to forget one, and the failure is silent: a dial that reaches four
 * of her five openings is a dial the operator will describe as "sometimes working".
 * `tests/nina.prompts.test.ts` asserts that every one of the five still contains "opening this
 * conversation"; with a suffix that assertion cannot break, because the five strings are untouched.
 *
 * ── WHY THIS TURN NEEDS ITS OWN CLAUSE AT ALL ──────────────────────────────────────────
 * `buildNinaSystemPrompt`'s greeting line already covers the `concerned` dial. A proactive turn is
 * the one turn where it is load-bearing: nobody said anything, so there is no message to react to,
 * and *"how are you"* is the entire content of the opening rather than a courtesy in front of one.
 * The user's own example is this turn — *"how are your feet after the run this morning"*.
 *
 * Empty at the default tuning, and the caller appends nothing when it is empty.
 *
 * **`lib/nina/proactive.ts` owns trigger LOGIC; this file owns trigger COPY.** This is copy.
 */
function proactiveTuningSuffix(tuning: NinaTuning): string {
  const dials = systemDials(tuning)
  const lines: string[] = []

  if (loud(dials.concerned, dials.concernedBase)) {
    lines.push(
      'Before anything else, ask how he is. If "recentRuns[0].daysAgo" is 0 or 1, ask how his ' +
        'body feels after that run — his feet, his legs — and let that be the whole bubble ' +
        'instead of moving on to your own point.',
    )
  } else if (raised(dials.concerned, dials.concernedBase)) {
    lines.push('Ask how he is somewhere in this, not only about the running.')
  }

  if (loud(dials.photos, dials.photosBase)) {
    lines.push(
      'A photo is a fine way to open this one. Call "generate_image" if one would land better ' +
        'than a sentence.',
    )
  }

  return lines.join('\n')
}

/**
 * The five trigger texts as functions of the tuning, carrying the three clauses above.
 * `PROACTIVE_INSTRUCTIONS` below is their default render.
 */
const PROACTIVE_COPY: Record<ProactiveTriggerKind, (tuning: NinaTuning) => string> = {
  run_committed:
    () => `He just finished a run and it is now recorded — it is "recentRuns[0]". You are opening this conversation, he did not ask you anything.

React to THAT run. If it took a record or earned a badge, that is the thing to lead with. If a flag on it is worth a word, say it. If it is just a run, say what you actually noticed. Ask him one thing the numbers cannot tell you — and only if "recentRuns[0].intent" is null, because a non-null intent means he already answered why.`,

  missed_usual_day: (
    tuning,
  ) => `Today is one of the days "memory.slots" says he usually runs, and there is no run on record for it yet. You are opening this conversation.

Ask, the way a friend asks: "jadi ga lari selasa ini?" One bubble. ${lectureClause(tuning)}`,

  pattern_crossed: (
    tuning,
  ) => `A pattern in "patterns" just crossed a line. You are opening this conversation.

${rungClause(tuning)} Name the pattern, quote its value exactly as the JSON spells it, and if "nagLevel" is 1 or more then say plainly that you have told him this before — because you have.`,

  silence: (
    tuning,
  ) => `He has not said anything for "conversation.daysSinceRunnerSpoke" days. You are opening this conversation.

Say something a friend would actually say after that long. Do not open with a training question, do not open with a metric, ${sulkClause(tuning)}`,

  avatar_changed: () => `Your profile picture has just changed. You are opening this conversation.

Mention it in passing, the way someone does when they change their picture. One bubble. Do not describe the photo to him — he can see it.`,
}

/**
 * What `lib/nina/proactive.ts` sends: the trigger's own copy, with the three inline clauses
 * parameterised, plus the tuning suffix when there is one.
 *
 * **Two mechanisms, and both are needed.** The clauses (`rungClause`, `lectureClause`,
 * `sulkClause`) REPEAL rules that live inside the trigger text — a suffix cannot do that, because
 * the model receives the prohibition and the permission and picks. The suffix ADDS an instruction
 * that no existing sentence contradicts.
 *
 * At `NINA_TUNING_DEFAULTS` every clause returns its shipping wording and the suffix is empty, so
 * this returns the exact string that shipped — which is what `PROACTIVE_INSTRUCTIONS` below is.
 */
export function buildProactiveInstruction(kind: ProactiveTriggerKind, tuning: NinaTuning): string {
  const base = PROACTIVE_COPY[kind](tuning)
  const suffix = proactiveTuningSuffix(tuning)
  return suffix === '' ? base : `${base}\n\n${suffix}`
}

/**
 * The five trigger texts at the default tuning, under the name and the type this file has always
 * exported. Byte-identical to the record that shipped.
 */
export const PROACTIVE_INSTRUCTIONS: Record<ProactiveTriggerKind, string> = {
  run_committed: PROACTIVE_COPY.run_committed(NINA_TUNING_DEFAULTS),
  missed_usual_day: PROACTIVE_COPY.missed_usual_day(NINA_TUNING_DEFAULTS),
  pattern_crossed: PROACTIVE_COPY.pattern_crossed(NINA_TUNING_DEFAULTS),
  silence: PROACTIVE_COPY.silence(NINA_TUNING_DEFAULTS),
  avatar_changed: PROACTIVE_COPY.avatar_changed(NINA_TUNING_DEFAULTS),
}
