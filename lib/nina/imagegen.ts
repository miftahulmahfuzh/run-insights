import {
  NINA_BODY_AVATAR,
  NINA_BODY_FACTS,
  NINA_BODY_SENTENCES,
  NINA_DEFAULT_OUTFIT_VALUE,
  NINA_FACE,
  ninaAppearance,
  withSentenceStop,
  type NinaAppearanceDetail,
} from '@/lib/nina/persona'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PREFS_DEFAULTS,
  NINA_IMAGE_TEMPLATE_TOKEN_RE,
  validateNinaImageTemplate,
  type NinaImageFocusKey,
  type NinaImagePrefs,
  type NinaImageTemplateKey,
} from '@/lib/nina/imageprefs'
import { ninaBand, type NinaBandName, type NinaTuning } from '@/lib/nina/tuning'

import { NINA_IMAGE_ASPECT, NINA_IMAGE_RESOLUTION, type NinaImagePurpose } from './imagerecipe'

/**
 * **The words the camera is given.** Assembled on Vercel, stored in `nina_turns.args.prompt`, and
 * sent verbatim by the worker.
 *
 * ── WHY THE PROMPT IS BUILT HERE AND NOT THERE ────────────────────────────────────────────────
 * `NINA_APPEARANCE` is phase 2's canon and lives in a module with real imports, so a
 * `--experimental-strip-types` script cannot reach it. Building the prompt on the app side and
 * persisting it has three further benefits that make it the right choice rather than a workaround:
 * the worker stays dependency-free of the persona; a RETRY reuses the exact prompt and the exact
 * seed, so it produces the same photograph rather than a different one; and the prompt as sent is
 * recoverable from the database six weeks later, which is the sidecar habit
 * `tools/gen_badge_art.py` established.
 *
 * ── NO REFERENCE IMAGE (RU-18) ────────────────────────────────────────────────────────────────
 * The subject paragraph below describes her from the canon and says nothing about a reference,
 * because there is none. The first draft's line — "this is the same woman as the reference image,
 * and the reference is authoritative for her face" — is deleted. Leaving it in would instruct the
 * model to defer to an image that is not in the payload, which is the kind of contradiction that
 * degrades a prompt for free.
 *
 * ── THE COMPATIBILITY CONTRACT, REPEALED AND RESTATED (R1) ────────────────────────────────────
 * This file used to promise that `tuning == null` and `tuning === NINA_TUNING_DEFAULTS` rendered
 * the prompt that shipped, character for character — "a provable superset of the Nina who shipped
 * rather than a rewrite of her". **That promise is repealed, deliberately, and this is the record
 * of it.** R1 is the user's word "always": the body canon is unconditional, so there is no longer
 * any setting that renders the old subject paragraph. Keeping the claim in a comment while the
 * code had stopped honouring it would be worse than the change.
 *
 * TWO WEAKER PROPERTIES SURVIVE AND ARE STILL ASSERTED IN `tests/nina.imagerecipe.test.ts`:
 *
 *   1. **Optionality.** A caller with neither a tuning nor prefs and a caller holding
 *      `NINA_TUNING_DEFAULTS` plus default prefs get the SAME string. This is still a pure
 *      function of its arguments, and no default reaches out to a database.
 *   2. **Additivity above the canon.** Everything the tuning and the prefs contribute is text
 *      ADDED to an unconditional canon. Nothing any setting can do removes a body fact — PLAN
 *      INVARIANT 4, asserted as a property over every combination rather than as four examples.
 *
 * ── WHAT THE OPERATOR TYPED IS NEVER DROPPED BY THE LADDER ────────────────────────────────────
 * The prompt-length rungs below spend more or less CANON prose. They never suppress a wardrobe, a
 * venue, a time, a note or a focus selection: a control that silently discards a field somebody
 * filled in is the failure mode `lib/db/schema.ts`'s `nina_tuning` header argues against. The one
 * exception is stated where it lives — the avatar crop drops the four whole-body focus keys, for
 * the same reason `steamy` is selfie-only.
 */

/**
 * The photographic half. `NINA_APPEARANCE` is the WHO and this is the HOW; the scene she chose is
 * the WHAT.
 *
 * It asks for a phone photograph on purpose. `GENERATE_IMAGE_TOOL`'s description is "take a photo of
 * yourself and send it", and a runner who receives a glossy studio portrait has received something a
 * friend did not send. This is the one place in the phase where the aesthetic is decided, and it is
 * decided here rather than in the tool schema so the model cannot drift it.
 *
 * The measured probe used a prompt of exactly this shape and returned a convincing phone
 * mirror-selfie with an invented street sign and a cat on the wall — so this style block is
 * verified output, not a guess.
 */
export const NINA_SELFIE_STYLE = `A casual smartphone photograph, as if taken and sent in a chat app. Natural daylight, slightly imperfect framing, shallow depth of field, visible skin texture, no studio lighting, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render.`

/**
 * The short form, spent at rungs `off`, `low` and `mid`. It keeps every instruction that changes
 * what the provider RETURNS — a phone photograph, daylight, real skin, no text, no watermark, no
 * border, a photograph and not a render — and drops the three that only refine it: the imperfect
 * framing, the shallow depth of field, and the two negations already implied by "no retouching".
 *
 * It still contains `Realistic photograph`, which is what
 * `tests/nina.imagerecipe.test.ts:67-72` asserts, so the style guarantee holds at every rung.
 */
export const NINA_SELFIE_STYLE_SHORT = `A casual smartphone photograph, as if taken and sent in a chat app. Natural daylight, visible skin texture, no text, no watermark, no border. Realistic photograph, not an illustration and not a render.`

/**
 * The avatar variant. Same camera, tighter crop, because the result is rendered inside a 28-44 px
 * circle by `NinaAvatar` and a full-body shot becomes an unreadable smudge at that size. Phase 15
 * exists to let an operator re-frame one by hand; this is the framing that means it usually does not
 * have to.
 */
export const NINA_AVATAR_STYLE = `A casual smartphone photograph framed as a profile picture: head and shoulders, her face filling most of the frame, looking at the camera. Natural daylight, visible skin texture, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render.`

/**
 * The avatar's short form. The CROP sentence is untouched at every rung — it is the whole reason
 * this style block exists, and `tests/nina.imagerecipe.test.ts:83-85` asserts
 * `head and shoulders` — so the saving comes out of the lighting refinements only.
 */
export const NINA_AVATAR_STYLE_SHORT = `A casual smartphone photograph framed as a profile picture: head and shoulders, her face filling most of the frame, looking at the camera. Natural daylight, no text, no watermark, no border. Realistic photograph, not an illustration and not a render.`

/**
 * **Where a dial becomes photographic — and it is phase 1's band, not a private number.**
 * At band `high` or `max` (a score of 60 or more, since the bands are five equal widths of 20),
 * `steamy` and `flirty` each add a clause to `POSE AND PRESENCE:`; below that they add nothing at
 * all and the prompt is the one that shipped.
 *
 * ── ONE VOCABULARY, RECONCILED ────────────────────────────────────────────────────────────────
 * The draft of this phase had a private `NINA_IMAGE_DIAL_HIGH = 67`. It is gone: `/admin/nina`
 * renders the band name beside every slider, so a dial whose visible band says `high` while the
 * camera privately wants 67 is a dial the operator cannot predict. `ninaBand` comes from
 * `./tuning`, which is zero-import plain data, so reading it here costs nothing and couples nothing
 * that was not already coupled — `steamy` is *her*, and the operator who turns it up is asking for
 * the photograph to follow.
 *
 * `NINA_TUNING_DEFAULTS.traits.steamy` and `.flirty` are both 0 (band `off`), so the default render
 * is today's prompt; `tests/nina.imagerecipe.test.ts` asserts that rather than assuming it.
 */
const isDialHigh = (value: number): boolean => ninaBand(value).index >= 3

/**
 * How she is in the photograph, from the two dials that have anything to say about a picture.
 *
 * Returns null — and therefore adds NO block at all — when there is no tuning or when both dials
 * are below the threshold. That null is the compatibility contract: `NINA_TUNING_DEFAULTS` renders
 * the prompt that shipped, character for character.
 *
 * ── WHY `steamy` IS SELFIE-ONLY ───────────────────────────────────────────────────────────────
 * `NINA_AVATAR_STYLE` asks for head and shoulders inside a 28-44 px circle. A pose instruction
 * about her hips under a head-and-shoulders crop is a prompt arguing with itself, which this file's
 * header names as the thing that "degrades a prompt for free" (the deleted reference-image line).
 * `flirty` survives into the avatar because a look down the lens is compatible with any crop.
 *
 * ── WHERE THE CLOTHES ARE, AND ARE NOT ────────────────────────────────────────────────────────
 * Nowhere in here. What she WEARS is `prefs.wardrobe`, and it belongs to the SUBJECT paragraph via
 * `ninaAppearance` — the operator's own words about her outfit, in the one place the
 * prompt describes her body. What these two dials add is how she is STANDING and how she is LOOKING
 * at him. Keeping the two apart is what lets the user set one without the other.
 */
function ninaPhotoPresence(purpose: NinaImagePurpose, tuning: NinaTuning | null): string | null {
  if (tuning == null) return null

  const clauses: string[] = []

  if (purpose === 'selfie' && isDialHigh(tuning.traits.steamy)) {
    clauses.push(
      'She is fully aware of the camera and playing to it: weight on one hip, body turned toward ' +
        'the lens, chin down, the phone held close.',
    )
  }

  if (isDialHigh(tuning.traits.flirty)) {
    clauses.push(
      'She is looking straight down the lens and half-smiling, like she knows exactly what she is ' +
        'doing.',
    )
  }

  if (clauses.length === 0) return null
  return clauses.join(' ')
}

/* ============================================================================
 * THE PROMPT-LENGTH LADDER (R4)
 * ==========================================================================*/

/**
 * **What one rung of the length slider buys.**
 *
 * The user asked for a sliding bar where *"the longer the prompt, the more detailed the prompt
 * would be"*. The index's Decisions table settles the units: a 0-100 slider read through the repo's
 * existing five bands, *"not a character budget"* — `/admin` already renders the band name beside
 * every slider, and a private scale is a slider the operator cannot predict.
 *
 * ── WHAT THE LADDER MAY AND MAY NOT SPEND ─────────────────────────────────────────────────────
 * It spends CANON prose: how many body sentences, whether the face paragraph is there, whether the
 * default outfit is there, how verbose the focus emphasis is, and which of the two camera forms is
 * used. It NEVER spends what the operator typed. `VENUE`, `TIME`, `NOTES` and a non-empty wardrobe
 * appear at every one of the five rungs, and a selected focus key always produces a `FOCUS:` block
 * — only its wording gets shorter.
 *
 * ── WHY `off` DROPS `POSE AND PRESENCE` AND NOTHING ELSE DOES ─────────────────────────────────
 * `off` is the one rung whose contract is "as short as this can be while still being a photograph
 * of her". Something has to go, and the pose block is the only candidate that is neither the
 * operator's own words nor a body fact: it is a derived clause from two character dials that have
 * a home of their own on `/admin/personality`. From `low` up, every block is present and the ladder
 * varies only how much is said.
 *
 * ── EVERY RUNG NAMES THE BODY ─────────────────────────────────────────────────────────────────
 * `bodySentences` is never 0, and `ninaBodyBlock` clamps it to at least 1 even if this table were
 * edited to say otherwise. `NINA_BODY_SENTENCES[0]` names all four facts on its own. That is PLAN
 * INVARIANT 4 twice over, which is proportionate: it is the requirement the user actually wrote
 * down.
 */
export interface NinaPromptRung {
  /** The band this rung answers, so a reader can line it up with what `/admin` shows. */
  readonly band: NinaBandName
  /** How many of `NINA_BODY_SENTENCES` to spend. Never 0. */
  readonly bodySentences: number
  /** Spend `NINA_FACE`. */
  readonly face: boolean
  /** Spend `NINA_DEFAULT_OUTFIT` when the operator set no wardrobe. */
  readonly outfit: boolean
  /** Spend `POSE AND PRESENCE:` when the dials have something to say. */
  readonly presence: boolean
  /** `list` = the emphasis lead only. `sentences` = the lead plus one sentence per selected key. */
  readonly focus: 'list' | 'sentences'
  /** Which of the two camera forms. */
  readonly camera: 'short' | 'full'
}

/**
 * The five rungs. **All five are distinct** — a slider with two settings that render the same
 * string is a slider the operator cannot trust, and `tests/nina.imagerecipe.test.ts` asserts
 * strictly increasing length across the five band floors.
 *
 * | band | body | face | outfit | pose | focus     | camera |
 * |------|------|------|--------|------|-----------|--------|
 * | off  |  1   |  no  |   no   |  no  | list      | short  |
 * | low  |  2   |  no  |   no   | yes  | list      | short  |
 * | mid  |  3   | yes  |  yes   | yes  | list      | short  |
 * | high |  4   | yes  |  yes   | yes  | sentences | full   |
 * | max  |  5   | yes  |  yes   | yes  | sentences | full   |
 */
export const NINA_PROMPT_RUNGS: Readonly<Record<NinaBandName, NinaPromptRung>> = Object.freeze({
  off: Object.freeze({
    band: 'off',
    bodySentences: 1,
    face: false,
    outfit: false,
    presence: false,
    focus: 'list',
    camera: 'short',
  }),
  low: Object.freeze({
    band: 'low',
    bodySentences: 2,
    face: false,
    outfit: false,
    presence: true,
    focus: 'list',
    camera: 'short',
  }),
  mid: Object.freeze({
    band: 'mid',
    bodySentences: 3,
    face: true,
    outfit: true,
    presence: true,
    focus: 'list',
    camera: 'short',
  }),
  high: Object.freeze({
    band: 'high',
    bodySentences: 4,
    face: true,
    outfit: true,
    presence: true,
    focus: 'sentences',
    camera: 'full',
  }),
  max: Object.freeze({
    band: 'max',
    bodySentences: 5,
    face: true,
    outfit: true,
    presence: true,
    focus: 'sentences',
    camera: 'full',
  }),
})

/**
 * A stored `promptLength` resolved to a rung, through phase 1's band and no private threshold —
 * the fork this file already settled once for `isDialHigh` (see its docblock).
 */
export function ninaPromptRung(promptLength: number): NinaPromptRung {
  return NINA_PROMPT_RUNGS[ninaBand(promptLength).name]
}

/**
 * **What a caller with no prefs at all gets.** Band `high`: the face, the outfit, the pose, the
 * full camera, four body sentences.
 *
 * It is spelled HERE rather than read from `NINA_IMAGE_PREFS_DEFAULTS.promptLength` on purpose.
 * `buildNinaImagePrompt` must be a pure function of its arguments with a render this file can
 * state, and a test that asserted "no prefs keeps the face" would otherwise be asserting phase 1's
 * choice of default number. Phase 1 is free to default the stored slider anywhere.
 */
export const NINA_PROMPT_LENGTH_FALLBACK = 70

/* ============================================================================
 * THE FOCUS EMPHASIS (R5)
 * ==========================================================================*/

/**
 * **Emphasis, layered on an unconditional canon. Never inclusion.**
 *
 * The user listed six things to be able to "focus on": face, skin, big boobs, bubble butt, big
 * thighs, very long calves. Four of those six are already in the body canon at every rung, which
 * is the whole of R1 — so selecting `butt` cannot be what puts a butt in the prompt. It is what
 * tells the camera the butt is the point of THIS shoot. Deselecting all six leaves a prompt that
 * still names all four body facts; the index's Decisions table settles this and PLAN INVARIANT 4
 * is the test.
 *
 * `term` is the phrase for the emphasis lead, in the user's own words so the operator reads back
 * what he typed. `sentence` is the extra instruction spent at rungs `high` and `max`.
 *
 * **The key spellings are phase 1's vocabulary, imported as `NINA_IMAGE_FOCUS_KEYS`.** This record
 * is keyed by that type, so a key phase 1 adds or renames is a compile error here rather than a
 * silently missing clause.
 */
const NINA_FOCUS_EMPHASIS: Readonly<
  Record<NinaImageFocusKey, { readonly term: string; readonly sentence: string }>
> = Object.freeze({
  face: Object.freeze({
    term: 'her face',
    sentence: `Her face is sharp and clearly visible, lit well enough to read her expression.`,
  }),
  skin: Object.freeze({
    term: 'her skin',
    sentence: `Her bare skin is what the photograph is about: olive, faintly sweat-sheened, with visible pores and fine texture rather than a retouched surface.`,
  }),
  boobs: Object.freeze({
    term: 'her big boobs',
    sentence: `Her big boobs are full and heavy and read clearly through whatever she is wearing, with real weight to them and a deep cleavage line.`,
  }),
  butt: Object.freeze({
    term: 'her bubble butt',
    sentence: `Her bubble butt is round, high and prominent, and the pose and the framing are chosen so that it is unmistakable.`,
  }),
  thighs: Object.freeze({
    term: 'her big thighs',
    sentence: `Her big thighs are thick and powerful, filling whatever she is wearing, with the muscle showing under soft skin.`,
  }),
  calves: Object.freeze({
    term: 'her very long calves',
    sentence: `Her very long calves run most of the length of the frame, full and sharply defined all the way down to a narrow ankle.`,
  }),
})

/**
 * **Which focus keys survive the avatar crop, and why the other four do not.**
 *
 * `NINA_AVATAR_STYLE` asks for head and shoulders inside a 28-44 px circle. `FOCUS: Emphasise her
 * bubble butt above everything else` under that crop is a prompt arguing with itself, which is
 * exactly the rule that already makes `steamy` selfie-only two functions up. So the four
 * whole-body keys are dropped on the avatar path and the two that a face crop can actually honour
 * are kept.
 *
 * They are DROPPED and not substituted: if the operator selected only body keys, the avatar gets no
 * `FOCUS:` block at all rather than an invented one. `NINA_BODY_AVATAR` is still in its subject
 * paragraph, so PLAN INVARIANT 4 holds without this block having to fake anything.
 */
const NINA_AVATAR_FOCUS_KEYS: readonly NinaImageFocusKey[] = ['face', 'skin']

/** `a`, `a and b`, `a, b and c`. No Oxford comma, matching every other prose list in the canon. */
function joinTerms(terms: readonly string[]): string {
  if (terms.length <= 1) return terms[0] ?? ''
  return `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]!}`
}

/** The `FOCUS:` block's body, or null when nothing the crop can honour was selected. */
function ninaFocusBlock(
  purpose: NinaImagePurpose,
  prefs: NinaImagePrefs,
  rung: NinaPromptRung,
): string | null {
  const keys = NINA_IMAGE_FOCUS_KEYS.filter(
    (key) => prefs.focus[key] && (purpose === 'selfie' || NINA_AVATAR_FOCUS_KEYS.includes(key)),
  )
  if (keys.length === 0) return null

  const lead = `Emphasise ${joinTerms(
    keys.map((key) => NINA_FOCUS_EMPHASIS[key].term),
  )} above everything else in this photograph.`
  if (rung.focus === 'list') return lead
  return [lead, ...keys.map((key) => NINA_FOCUS_EMPHASIS[key].sentence)].join(' ')
}

/**
 * One of the operator's free-text blocks, or null when he left the field empty.
 *
 * `''` is the ONE empty value for all four fields (phase 1's coercers), so this is a length check
 * and not a null check — the same contract `ninaAppearance` reads the wardrobe under. `.trim()`
 * survives because a hand-run SQL update can still write ' '.
 */
function ninaFreeTextBlock(label: string, value: string): string | null {
  const text = value.trim()
  if (text.length === 0) return null
  return `${label}: ${text}`
}

/**
 * The chat model's per-photograph note, or the empty block when it sent none — `ninaFreeTextBlock`'s
 * rule for a value that arrives as `null` rather than as the row's own `''`.
 */
function ninaMoodBlock(mood: string | null | undefined): string {
  const text = mood?.trim()
  if (text == null || text.length === 0) return ''
  return `EXPRESSION AND ENERGY: ${text}`
}

/* ============================================================================
 * THE EDITABLE PROMPT TEMPLATE (the 2026-09-10 ask, second revision: the template IS the prompt)
 * ==========================================================================*/

/**
 * **The shell that ships — the user's own sketch, canon-interpolated.** This is the string the
 * template field holds before the operator touches it: the REAL prompt prose (camera paragraph,
 * body canon, face paragraph, the outfit sentence, every label) with a placeholder only where a
 * per-generation or per-preference VALUE is spliced in. The prose pieces are INTERPOLATED from
 * the canon constants (`NINA_SELFIE_STYLE`, `NINA_BODY_SENTENCES`, `NINA_FACE`) rather than
 * hand-copied, so the template cannot drift from the words the built-in assembly uses — there is
 * one home for each sentence.
 *
 * The body paragraph carries the first THREE canon sentences, verbatim — sentence 0's own
 * enumeration (`NINA_BODY_FACTS`), then sentences 1 and 2 — the mid-rung body, which is the
 * shipped default. The four facts are prose here, not a token: `{{bodyFacts}}` was dropped
 * because it could only ever expand to this one constant, which made it a decoration on
 * `{{focus}}`'s real job rather than a second control. The length dial no longer re-cuts THIS
 * text; the template is the prompt, and the dial drives the avatar path's built-in assembly.
 *
 * The outfit line no longer appends the canon's watch-and-track sentence — that was fixed prose
 * ("a red 400 m athletics track", "flat morning sun") competing with the operator's own
 * `{{venue}}`, `{{time}}` and `{{notes}}` lines a few lines below. One place to say where and
 * when is enough.
 *
 * Line semantics (the renderer below): a line containing a token that expanded to empty is
 * dropped ENTIRE, so the FOCUS line vanishes when nothing is ticked, POSE AND PRESENCE vanishes
 * when the dials are quiet, and VENUE / TIME / NOTES / EXPRESSION AND ENERGY vanish when their
 * fields are empty — the omit-when-empty rule the built-in assembly always had.
 */
export const NINA_PROMPT_TEMPLATE_DEFAULT = [
  NINA_SELFIE_STYLE,
  '',
  'SUBJECT:',
  `She is voluptuous: ${NINA_BODY_FACTS}. This silhouette is the point of the photograph and it ` +
    `must be visible in it. ${NINA_BODY_SENTENCES[1]} ${NINA_BODY_SENTENCES[2]}`,
  '',
  NINA_FACE,
  '',
  'Her outfit for this photograph: {{wardrobe}}',
  '',
  'FOCUS: Emphasise {{focus}} above everything else in this photograph.',
  '',
  'POSE AND PRESENCE: {{presence}}',
  '',
  'VENUE: {{venue}}',
  '',
  'TIME: {{time}}',
  '',
  'SCENE: {{scene}}',
  '',
  'EXPRESSION AND ENERGY: {{mood}}',
  '',
  'NOTES: {{notes}}',
].join('\n')

/**
 * **The avatar's shell — and the one template the operator does not edit.** The stored template
 * is her PHOTOGRAPH prompt: the field, the preview and the test button are all the selfie path.
 * The avatar is a head-and-shoulders crop rendered inside a 28-44 px circle, and the selfie prose
 * would argue with that crop — full-body pose clauses and a wardrobe line under a face framing.
 * So `purpose === 'avatar'` keeps the built-in block assembly (this nine-token shell over the
 * block builders below, byte-identical to the pre-template render), and the length dial's rungs
 * stay live THERE. Making the avatar template editable is a deliberate later decision, not an
 * oversight; the camera choice and the reference still apply to both paths.
 */
const NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT = [
  '{{camera}}',
  '',
  '{{subject}}',
  '',
  '{{focus}}',
  '',
  '{{pose}}',
  '',
  '{{venue}}',
  '',
  '{{time}}',
  '',
  '{{scene}}',
  '',
  '{{mood}}',
  '',
  '{{notes}}',
].join('\n')

/**
 * The template this render goes through. `coerceNinaImageTemplate` has already made every STORED
 * template `''` or valid, but `buildNinaImagePrompt` accepts any `NinaImagePrefs`-shaped argument
 * — a fixture, a hand-run SQL row that skipped the coercion — so the validator runs HERE too, and
 * a template that would fail the save fails the render into the shipped shell. The warning is
 * the only trace such a row leaves, which is the point: an operator should be able to discover a
 * hand-edited template was discarded rather than silently honoured.
 */
function effectiveNinaImageTemplate(prefs: NinaImagePrefs): string {
  const requested = typeof prefs.promptTemplate === 'string' ? prefs.promptTemplate : ''
  if (requested === '') return NINA_PROMPT_TEMPLATE_DEFAULT
  if (validateNinaImageTemplate(requested).ok) return requested
  console.warn('[imgn] stored prompt template failed validation — rendering the default shell')
  return NINA_PROMPT_TEMPLATE_DEFAULT
}

/**
 * Substitute the value blocks into a validated template, **line by line: a line containing a
 * token that expanded to empty is dropped entire**. That per-line rule is what makes labels safe
 * in the template — "VENUE: {{venue}}" cannot dangle when the field is empty, because the label
 * and the empty value share the line and the line goes with them. Static lines (no tokens) ship
 * verbatim; duplicated tokens render twice — legal, deliberate control. What whitespace the
 * dropped lines leave behind is collapsed back to the blank-line separator and trimmed.
 */
function renderNinaImagePrompt(template: string, blocks: Record<string, string>): string {
  const keptLines = template.split('\n').filter((line) => {
    let emptyTokenOnLine = false
    line.replace(NINA_IMAGE_TEMPLATE_TOKEN_RE, (_match, name: string) => {
      if ((blocks[name as NinaImageTemplateKey] ?? '') === '') emptyTokenOnLine = true
      return ''
    })
    return !emptyTokenOnLine
  })
  const filled = keptLines
    .join('\n')
    .replace(NINA_IMAGE_TEMPLATE_TOKEN_RE, (_match, name: string) => {
      return blocks[name as NinaImageTemplateKey] ?? ''
    })
  return filled.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * **The words the camera is given, in one pure function of its arguments.**
 *
 * ── THE BLOCK ORDER IS LOAD-BEARING AND EVERY POSITION IS ARGUED ──────────────────────────────
 *
 *  1. **the camera block** — the aesthetic, first, so everything after it is read as a
 *     photograph. The measured probe used a prompt of exactly this shape.
 *  2. **`SUBJECT:`** — who she is: body, then face, then clothes. Body first is R1's reorder.
 *  3. **`FOCUS:`** — emphasis on the subject just described, so it sits immediately after the
 *     sentences it amplifies and BEFORE the pose: what to emphasise decides how she stands,
 *     rather than the other way round.
 *  4. **`POSE AND PRESENCE:`** — before the scene, because it is a standing property of the
 *     subject the operator set once and not a per-photograph note. UNCHANGED reasoning, and the
 *     ordering assertion that has always been in `tests/nina.imagerecipe.test.ts`.
 *  5. **`VENUE:`** then 6. **`TIME:`** — the operator's standing opinion about where and when she
 *     is photographed. They go immediately BEFORE `SCENE:` so the model reads
 *     general-then-specific: a scene that names its own place is the later and more specific
 *     instruction and wins. Putting them AFTER the scene was the alternative and it is rejected —
 *     it would read as a correction of the scene, and the index's Scope keeps the scene hers per
 *     photograph.
 *  7. **`SCENE:`** — the model's own `generate_image` argument. What this photograph is of.
 *  8. **`EXPRESSION AND ENERGY:`** — after the scene, so it reads as a refinement of THIS
 *     photograph rather than an amendment to who she is. UNCHANGED, and it is exactly where
 *     `tools/gen_badge_art.py` puts `--note`, for the same reason.
 *  9. **`NOTES:`** — LAST. It is the operator's catch-all amendment to this photograph ("nina is
 *     full of sweat"), the same category as `--note` and one step later, because last is where an
 *     instruction that must be able to amend everything above it belongs.
 *
 * ── WHAT IT TAKES, AND WHY BOTH ROWS ──────────────────────────────────────────────────────────
 * `tuning` is her CHARACTER (`/admin/personality`) and only `steamy` and `flirty` have anything to
 * say about a picture. `prefs` is the operator's standing opinion about how she is PHOTOGRAPHED
 * (`/admin/image-generation`). Two rows, two surfaces, two arguments; the camera reads
 * `prefs.wardrobe` and no longer reads `tuning.wardrobe` at all.
 *
 * Every member but `purpose` and `scene` is optional, which is what lets phase 6's
 * `lib/nina/imagetest.ts` be a third caller and phase 4's prompt preview call this straight from a
 * render. It is pure, does no I/O, and is not a model call, so `ci:llm-payload-guard` Rule 2 has
 * nothing to say about it.
 */
export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
  /** Her character. Only `steamy` and `flirty` reach a photograph. */
  tuning?: NinaTuning | null
  /** The operator's image preferences. Absent renders `NINA_PROMPT_LENGTH_FALLBACK`'s rung. */
  prefs?: NinaImagePrefs | null
}): string {
  const tuning = input.tuning ?? null
  const prefs: NinaImagePrefs = input.prefs ?? {
    ...NINA_IMAGE_PREFS_DEFAULTS,
    promptLength: NINA_PROMPT_LENGTH_FALLBACK,
  }
  const rung = ninaPromptRung(prefs.promptLength)
  const isAvatar = input.purpose === 'avatar'

  /*
   * TWO SHELLS, ONE RENDERER. The avatar keeps the built-in BLOCK assembly (see
   * `NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT` for why the stored template does not reach it); the
   * selfie goes through the operator's template — full prose with the value tokens of §6. The
   * length dial's rungs stay live on the avatar path and are superseded by the template on the
   * selfie path, which is the honest reading of "the template IS the prompt".
   */
  if (isAvatar) {
    const camera = rung.camera === 'full' ? NINA_AVATAR_STYLE : NINA_AVATAR_STYLE_SHORT

    const detail: NinaAppearanceDetail = {
      /* One sentence on the avatar path at EVERY rung. More body prose under a head-and-shoulders
       * crop is more contradiction, not more detail — see `NINA_BODY_AVATAR`. */
      body: NINA_BODY_AVATAR,
      /* The avatar IS a face crop, so the face paragraph is never what the ladder saves on it. */
      face: true,
      outfit: rung.outfit,
    }

    const focusText = ninaFocusBlock('avatar', prefs, rung)
    const presenceText = rung.presence ? ninaPhotoPresence('avatar', tuning) : null

    const avatarBlocks: Record<string, string> = {
      camera,
      subject: `SUBJECT:\n${ninaAppearance(prefs, detail)}`,
      focus: focusText != null ? `FOCUS: ${focusText}` : '',
      pose: presenceText != null ? `POSE AND PRESENCE: ${presenceText}` : '',
      venue: ninaFreeTextBlock('VENUE', prefs.venue) ?? '',
      time: ninaFreeTextBlock('TIME', prefs.time) ?? '',
      scene: `SCENE: ${input.scene.trim()}`,
      mood: ninaMoodBlock(input.mood),
      notes: ninaFreeTextBlock('NOTES', prefs.notes) ?? '',
    }

    return renderNinaImagePrompt(NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT, avatarBlocks)
  }

  /*
   * THE SELFIE PATH — the operator's template, the one the field edits. The value blocks are
   * exactly §6's vocabulary: the wardrobe (with the canon default outfit standing in when the
   * field is empty, so the sentence always has a subject), the ticked focus terms as the
   * emphasis sentence's object, the dials' pose clauses, the three free-text fields verbatim, and
   * the per-photograph scene and mood. Labels are TEMPLATE text now — "VENUE:" lives in the
   * shell, so only the bare values are blocks. The four-facts enumeration is no longer a block —
   * it is static prose in the default template's SUBJECT line.
   */
  const focusTerms = joinTerms(
    NINA_IMAGE_FOCUS_KEYS.filter((key) => prefs.focus[key] === true).map(
      (key) => NINA_FOCUS_EMPHASIS[key].term,
    ),
  )
  const wardrobe = prefs.wardrobe.trim()

  const blocks: Record<string, string> = {
    wardrobe: withSentenceStop(wardrobe.length > 0 ? wardrobe : NINA_DEFAULT_OUTFIT_VALUE),
    focus: focusTerms,
    presence: ninaPhotoPresence('selfie', tuning) ?? '',
    venue: prefs.venue.trim(),
    time: prefs.time.trim(),
    scene: input.scene.trim(),
    mood: input.mood?.trim() ?? '',
    notes: prefs.notes.trim(),
  }

  return renderNinaImagePrompt(effectiveNinaImageTemplate(prefs), blocks)
}

/** `gen_badge_art.py`'s `write_sidecar`, minus the file. Only a human ever reads this. */
export function sidecarText(input: {
  prompt: string
  seed: number
  purpose: NinaImagePurpose
  /** The camera this sidecar describes — the job's coerced id, not the module constant. */
  model: string
}): string {
  return [
    `provider:   openrouter`,
    `model:      ${input.model}`,
    `purpose:    ${input.purpose}`,
    `resolution: ${NINA_IMAGE_RESOLUTION} ${NINA_IMAGE_ASPECT}`,
    `seed:       ${input.seed}`,
    `reference:  none (RU-18)`,
    '',
    '--- prompt as sent ---',
    input.prompt,
  ].join('\n')
}
