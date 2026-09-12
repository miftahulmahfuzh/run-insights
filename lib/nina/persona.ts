/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE CANON, AS CONSTANTS AND AS FUNCTIONS OF THE TUNING. `docs/nina/persona.md` is the same
 *  canon in prose and is the document the user redlines (RU-10). When they disagree, the document
 *  is the intent and this directory is what ships: fix these files, then fix the document, in one
 *  commit.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * This file is a BARREL: it defines nothing and re-exports the modules under `persona/`, so every
 * `from '../persona'` and `from '@/lib/nina/persona'` in the tree keeps working unchanged and the
 * module boundaries below are the only way in. Two tests hold the shape:
 * `tests/nina.persona-split.test.ts` pins the module set, the barrel's purity and the exact
 * export surface; `tests/nina.prompts.test.ts`'s R4 scan discovers every file in `persona/` and
 * fails if any of them reads `tuning.traits`, `tuning.dials` or `tuning.relationship` directly.
 *
 * No logic beyond string assembly, no I/O, no `server-only` in ANY module — the same shape as
 * `lib/llm/prompts/narrate.ts` and for the same reason: a test asserts the text of a rule
 * without importing the client that sends it. `./tuning` is types and plain data only, so this
 * barrel stays importable from a `'use client'` module and `/admin/personality` can render a
 * preview. The modules and what each owns:
 *
 *   bands          — the R4 gate: how a tuning is read. Band names, identity bands, "turned up".
 *   identity       — WHO SHE IS, AND WHO SHE IS TO HIM: the relationship blocks, `ninaIdentity`,
 *                    `ninaNameRules`, `NINA_EXPERTISE`, `NINA_NOT_A_DOCTOR`.
 *   appearance     — WHAT SHE LOOKS LIKE: the body canon, the face, the outfit, `ninaAppearance`.
 *   voice          — HOW SHE TALKS: the Jakarta register, the manja orthography, English, and
 *                    both sets of verbatim example lines.
 *   instructor     — the coaching register: `INSTRUCTOR_COACHING` and its one gate.
 *   anger          — the computed ladder, its floor and its ceiling.
 *   verbosity      — the floor `horny` puts under `verbosity`.
 *   never-say      — the illusion-breaking phrases, and the dials that repeal them.
 *   tuning-blocks  — the trait and dial paragraphs, and the operator's own words.
 *
 * ── WHY HALF OF THIS CANON IS NOW A FUNCTION ─────────────────────────────────────────────────
 * Her character is a stored, per-user `NinaTuning` (F34 R1-R3). A frozen string cannot answer
 * "what is she like when flirty is 90", so every block that varies with a dial is a function of
 * the tuning and every block that does not is still a constant. The constants that USED to be
 * frozen text — `NINA_IDENTITY`, `NAME_RULES`, `ANGER_LADDER_BLOCK`, `NEVER_SAY_BLOCK` — were
 * kept under their old names as the DEFAULT RENDER of their own function until the 2026-09-12
 * YAGNI sweep deleted them: nothing imported them any more, and a caller wanting the shipping
 * text composes `fn(NINA_TUNING_DEFAULTS)` itself. The reviewability property is unchanged:
 * `NINA_TUNING_DEFAULTS` reproduces the text that shipped, so the diff to her behaviour is empty
 * until a slider moves (plan invariant 2).
 *
 * ── WHY THE IDENTITY BAND CONTRIBUTES NOTHING ─────────────────────────────────────────────────
 * Every key has an IDENTITY BAND — the band containing its own `defaultScore` in
 * `./tuning`'s specs — and `ninaTraitsBlock` skips a key sitting in it. That is plan invariant 2
 * held by construction: at `NINA_TUNING_DEFAULTS` every key is in its identity band, so the whole
 * tuning section is empty and the shipping prompt is what ships.
 *
 * **The identity band is NOT always `mid`.** `anger`, `sad`, `flirty`, `steamy`, `annoying`,
 * `anxious` and R3's `horny` default to 0 and identify at `off`; `profanity` defaults to 30 and
 * identifies at `low`; the other eight default to 50 and identify at `mid`. Today's Nina is warm-by-default with
 * computed anger and fenced swearing — that is where she actually sits on each axis, and a uniform
 * 50 would have shipped a Nina angrier and filthier than the one that exists.
 *
 * `low` is left undefined on every trait, and `mid` on the six that identify at `off` — `horny`
 * is the one deliberate exception, and its entry says why: a paragraph
 * for the middle of every slider would be sixteen paragraphs of "she is normal", the largest
 * possible prompt carrying the least possible information, and "slightly less flirty than usual"
 * is not a behaviour a model can act on. So a default-`off` trait is today's Nina from 0 to 59 and
 * speaks from 60 up — which is exactly the shape the user asked in: *"if flirty is set to HIGH"*.
 *
 * ── WHY THREE OF THESE ARE ARRAYS WITH A DERIVED BLOCK ────────────────────────────────────────
 * `JAKARTA_SLANG`, `ANGER_LADDER` and `NEVER_SAY_ENTRIES` are data, and the prompt paragraph
 * beside each is `.map().join()` over that data. R-42's argument, one layer over: a paragraph that
 * restates a list is a second source of truth for the list, and the failure mode is silent — a
 * word added to the array and forgotten in the paragraph is a word the model never sees. The
 * arrays `tests/nina.prompts.test.ts` walks to prove every entry reached the prompt —
 * `JAKARTA_SLANG`, `VOICE_EXAMPLES`, `GIRLFRIEND_VOICE_EXAMPLES` and `ANGER_LADDER` — stay
 * walkable for exactly the same reason.
 *
 * ── WHY THE PERSONA AND THE PAYLOAD RULES ARE IN DIFFERENT FILES ──────────────────────────────
 * This canon is WHO SHE IS. `lib/nina/prompts/system.ts` is WHAT SHE IS READING and HOW SHE MUST
 * ANSWER. The split matters because the second half changes whenever `lib/nina/context.ts`
 * changes shape, and the first half changes only when the user redlines the canon — two very
 * different edit rhythms, and mixing them is how a schema change quietly rewrites her character.
 * It is also why `ninaTraitsBlock` composes the trait and dial paragraphs in `persona/
 * tuning-blocks.ts` rather than in `system.ts`: the order of two paragraphs about her temper is a
 * persona decision, and `system.ts` gets one `${}` per section instead of sixteen. (Two sections:
 * `ninaTraitsBlock` for the dials and `ninaOperatorNotesBlock` for the free text, because phase
 * 3's assembler puts the operator's own words LAST in the prompt — after everything they are
 * allowed to override.)
 *
 * ── CONTRADICTORY DIALS ARE THE OPERATOR'S, NOT THE PROMPT'S ──────────────────────────────────
 * `anger: 100` with `chill: 100` puts both paragraphs in the prompt and the model blends them.
 * There is deliberately no arbitration: sixteen dials is 120 pairwise rules, a spec nobody could
 * review, and every one of them would be a rule that quietly cancels a slider — the exact thing
 * R6 forbids. `/admin/personality` renders the assembled prompt, so the operator reads the contradiction
 * they wrote and moves a slider. That feedback loop is the arbitration.
 */

export { anyTurnedUp } from './persona/bands'

export { NINA_EXPERTISE, NINA_NOT_A_DOCTOR, ninaIdentity, ninaNameRules } from './persona/identity'

export {
  NINA_APPEARANCE,
  NINA_BODY,
  NINA_BODY_AVATAR,
  NINA_BODY_FACTS,
  NINA_BODY_SENTENCES,
  NINA_DEFAULT_OUTFIT_VALUE,
  NINA_FACE,
  ninaAppearance,
  withSentenceStop,
} from './persona/appearance'
export type { NinaAppearanceDetail } from './persona/appearance'

export {
  ENGLISH_REGISTER,
  GIRLFRIEND_VOICE_EXAMPLES,
  JAKARTA_REGISTER,
  JAKARTA_SLANG,
  JAKARTA_SLANG_BLOCK,
  VOICE_EXAMPLES,
  VOICE_EXAMPLES_BLOCK,
  ninaGirlfriendVoiceBlock,
  ninaManjaRegisterBlock,
} from './persona/voice'
export type { SlangEntry, VoiceExample } from './persona/voice'

export {
  INSTRUCTOR_COACHING,
  isInstructor,
  ninaInstructorCoachingBlock,
} from './persona/instructor'

export {
  ANGER_LADDER,
  ninaAngerCeiling,
  ninaAngerFloor,
  ninaAngerLadderBlock,
} from './persona/anger'
export type { AngerRung } from './persona/anger'

export { VERBOSITY_FLOOR_BY_HORNY_BAND, ninaEffectiveVerbosity } from './persona/verbosity'

export { BODY_REPEALED_BY, ninaNeverSayBlock } from './persona/never-say'

export { ninaOperatorNotesBlock, ninaTraitsBlock } from './persona/tuning-blocks'
