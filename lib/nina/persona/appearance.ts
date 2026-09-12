/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  WHAT SHE LOOKS LIKE — THE IMAGE CANON.
 *
 *  Split out of the `persona.ts` monolith on 2026-09-12 (the nina-persona-split); the
 *  barrel at `../persona.ts` fronts this directory and carries the canon header. Every
 *  module here is types and plain data and string assembly only — no I/O, no
 *  `server-only` — so the whole barrel stays importable from a `'use client'` module and
 *  `/admin/personality` can render a preview.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { NinaImagePrefs } from '../imageprefs'

/* ============================================================================
 * What she looks like
 * ==========================================================================*/

/**
 * **THE BODY CANON (R1). It is unconditional, it leads the subject paragraph, and no setting can
 * switch it off.**
 *
 * The user's words, verbatim: *"i dont care about her face, i care a lot about her voluptuous body:
 * big boobs, bubble butt, big thighs , very long calves. always explicitly instruct these in the
 * prompt."* He said that while pasting a real `sidecarText()` dump whose subject paragraph spent
 * four of its five sentences on hair, eyes, eyebrows, makeup and a smile, and whose only silhouette
 * instruction was `narrow shoulders`. So this is a measured defect and not a taste.
 *
 * ── WHY IT IS AN ARRAY AND NOT A PARAGRAPH ────────────────────────────────────────────────────
 * R4 asks for a prompt-length slider where "the longer the prompt, the more detailed the prompt
 * would be". `imagegen.ts`'s rung table spends the first `n` of these, so the slider buys body
 * detail rather than buying whether there is a body at all. **Element 0 names all four facts on its own**,
 * which is what makes PLAN INVARIANT 4 structural: the lowest rung of the shortest possible prompt
 * still carries `big boobs`, `bubble butt`, `big thighs` and `very long calves`.
 *
 * ── THE ONE SENTENCE THAT MOVED, AND THE TWO WORDS THAT WERE REPEALED ─────────────────────────
 * `NINA_FACE` used to carry *"Lean, visibly muscular runner's build — defined quadriceps and
 * calves, narrow shoulders."* That is a BODY clause living in a FACE constant, and it is the exact
 * opposite of R1. Its surviving content — the muscle, the defined calves — is in elements 3 and 4
 * below. `Lean` and `narrow shoulders` are REPEALED, in as many words in element 4, because a model
 * given both "lean, narrow shoulders" and "voluptuous, wide hips" is a model being argued with —
 * the failure mode `imagegen.ts`'s header calls degrading a prompt for free.
 *
 * The face itself is NOT deleted. The index's Decisions table settles that: *"the face keeps its
 * sentences and loses its primacy"*. All four of `NINA_FACE`'s actual face sentences survive
 * verbatim below; what changed is that the body is now read first.
 */
export const NINA_BODY_SENTENCES: readonly string[] = [
  `She is voluptuous: big boobs, a bubble butt, big thighs and very long calves. This silhouette is the point of the photograph and it must be visible in it.`,
  `Her chest is full and heavy, her hips are wide and her waist is narrow, so the curve from waist to hip reads clearly through whatever she is wearing.`,
  `Her butt is round, high and prominent, standing out from her back rather than flattening into it.`,
  `Her thighs are thick and strong, filling whatever she is wearing, with a runner's muscle visible under soft skin.`,
  `Her calves are very long and full, defined all the way down to a narrow ankle, on legs that are unusually long for her height. She is curvy and heavy-bodied, never lean and never slight.`,
]

/**
 * **The four facts, as the enumeration the canon spends them in** — *"big boobs, a bubble butt,
 * big thighs and very long calves"*, the user's own list. Extracted so the editable template's
 * SUBJECT line can splice in the SAME words the built-in assembly used, instead of a second
 * spelling drifting away from the canon; `tests/nina.imagerecipe.test.ts` asserts this string
 * really is the enumeration inside `NINA_BODY_SENTENCES[0]`, so the extraction cannot silently
 * stop agreeing with the sentence it came from.
 */
export const NINA_BODY_FACTS = 'big boobs, a bubble butt, big thighs and very long calves'

/** The full render. Every sentence, in order. */
export const NINA_BODY = NINA_BODY_SENTENCES.join(' ')

/**
 * **The avatar variant, and the one place in the canon that names its own crop.**
 *
 * `NINA_AVATAR_STYLE` asks for head and shoulders inside a 28-44 px circle. Five sentences about
 * her hips, butt and calves under a face crop is the same self-contradiction that makes `steamy`
 * selfie-only in `imagegen.ts` — a prompt arguing with itself.
 *
 * Dropping the body on the avatar path was the alternative, and it is rejected: PLAN INVARIANT 4
 * says no value of any pref may produce a prompt that does not name the body, and `purpose` is not
 * a pref but "always" would still be false for half the generations. So the body survives as ONE
 * sentence naming all four facts as facts about HER, and the crop is reconciled out loud in the
 * clause after the dash rather than left for the model to guess at.
 */
export const NINA_BODY_AVATAR = `She is voluptuous — big boobs, a bubble butt, big thighs and very long calves — even though this photograph is cropped to her head and shoulders and shows almost none of it.`

/**
 * The anchor image in words, minus the body clause that moved to `NINA_BODY_SENTENCES`.
 *
 * Transcribed from `nina.png` rather than invented, because R20 makes that image the anchor for
 * every generation after it: a description that contradicts the anchor would fight the reference
 * on every single generation.
 *
 * ── WHY THE BODY, THE FACE AND THE OUTFIT ARE THREE CONSTANTS ─────────────────────────────────
 * Three things vary independently and each has its own operator. The BODY is the user's standing
 * instruction and never varies (R1). The OUTFIT is `nina_image_prefs.wardrobe`, one free-text line
 * he retypes per shoot (R6). Her FACE is the anchor and must never move, or every generation after
 * a change fights the reference. Three concerns, three paragraph boundaries, one source for each
 * sentence — `NINA_APPEARANCE` is derived from the three halves rather than written a fourth time.
 */
export const NINA_FACE = `A woman in her late twenties, mixed Southeast Asian and Mediterranean features, olive skin with a warm undertone. Long dark brown hair pulled into a high ponytail with loose strands at the temples. Dark brown eyes, thick straight eyebrows, no makeup, a wide open smile. Usually a little sweaty.`

const NINA_DEFAULT_OUTFIT = `Her default outfit is a heather-grey racerback tank, black fitted running shorts, white running shoes, and a black digital watch on her left wrist. Often a white towel over one shoulder and a blue water bottle in one hand. Her home ground is a red 400 m athletics track beside a green field, in flat morning sun.`

/**
 * **The default outfit as a VALUE**, for the template's `{{wardrobe}}` slot: what fills
 * "Her outfit for this photograph: {{wardrobe}}" when the operator left the Wardrobe field empty,
 * so the sentence always has a subject. The same three garments `NINA_DEFAULT_OUTFIT` names, in
 * the same order, minus the watch (the template's own next sentence carries the watch) and the
 * towel. Not derived from `NINA_DEFAULT_OUTFIT` by slicing — prose surgery on prose is how the
 * two drift — but asserted in `tests/nina.imagerecipe.test.ts` to be covered by it, so a canon
 * outfit change fails a test here instead of quietly leaving the template dressing her in last
 * season's kit.
 */
export const NINA_DEFAULT_OUTFIT_VALUE =
  'a heather-grey racerback tank, black fitted running shorts and white running shoes'

/**
 * The two sentences that follow an outfit wherever it is stated — the watch and her home ground.
 * Extracted from `ninaAppearance` so the suffix has one home rather than a hand-copied second
 * spelling; `ninaAppearance` interpolates this constant directly.
 */
const NINA_OUTFIT_SUFFIX =
  'She still has the black digital watch on her left wrist unless the outfit says otherwise. ' +
  'Her home ground is a red 400 m athletics track beside a green field, in flat morning sun.'

/**
 * The whole canon, at full detail, with no wardrobe override. **BODY FIRST** — that reorder is R1's
 * other half: the user does not care about her face, so the face no longer opens the paragraph the
 * model reads first.
 *
 * `tests/nina.prompts.test.ts:139-140` asserts this constant contains `'ponytail'` and
 * `'heather-grey racerback tank'`, and both survive here unchanged. That test needs no edit.
 */
export const NINA_APPEARANCE = `${NINA_BODY}

${NINA_FACE}

${NINA_DEFAULT_OUTFIT}`

/**
 * **The defect from the user's own paste, fixed.**
 *
 * `ninaAppearance` used to interpolate `${wardrobe}` and continue with ` She still has...`, so an
 * operator line that did not end in a full stop produced `long pants She still has the black
 * digital watch` — two sentences the provider reads as one. He pasted that. It is evidence.
 *
 * `?`, `!` and `.` all count as an ending, so an operator who writes their own stop does not get a
 * doubled one. A trailing `,` or `;` is NOT an ending: a comma before `She still has` is the same
 * run-on with a different mark.
 */
/**
 * Append a full stop unless the text already ends with one — exported for `imagegen.ts`'s
 * `{{wardrobe}}` expansion, which must give the operator's wardrobe the same sentence stop the
 * built-in assembly gives it, so the two paths cannot disagree about a period.
 */
export function withSentenceStop(text: string): string {
  if (text.length === 0) return text
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/**
 * How much of the canon to spend. Chosen by `imagegen.ts`'s prompt-length rung, which is the only
 * caller that has an opinion; everybody else takes the default and gets the whole canon.
 *
 * `body` is a STRING and not a sentence count because the avatar path substitutes a different
 * sentence entirely (`NINA_BODY_AVATAR`) rather than taking fewer of the same ones. Passing the
 * text keeps that decision where the crop is known — in `imagegen.ts`, next to
 * `NINA_AVATAR_STYLE` — instead of teaching this module about purposes.
 */
export interface NinaAppearanceDetail {
  /** The body paragraph. Empty is repaired, not honoured — PLAN INVARIANT 4. */
  readonly body: string
  /** Spend the face paragraph. */
  readonly face: boolean
  /** Spend `NINA_DEFAULT_OUTFIT` when the operator set no wardrobe. */
  readonly outfit: boolean
}

/** Everything, which is what `NINA_APPEARANCE` is. `ninaAppearance(prefs)` with an empty wardrobe
 * returns exactly that constant, and `tests/nina.imagerecipe.test.ts` asserts the identity. */
const NINA_APPEARANCE_FULL_DETAIL: NinaAppearanceDetail = Object.freeze({
  body: NINA_BODY,
  face: true,
  outfit: true,
})

/**
 * **The wardrobe seam, re-pointed at `nina_image_prefs`.**
 *
 * ── WHY THE PARAMETER IS `NinaImagePrefs` AND NOT `{ wardrobe: string }` ──────────────────────
 * A structural parameter would keep accepting a `NinaTuning`, because `NinaTuning` still has a
 * `wardrobe` member until phase 7 removes it. The index's Decisions table is explicit that *"two
 * wardrobes silently competing is the one outcome R3 cannot mean"*, so this parameter is nominal:
 * a leftover `ninaAppearance(tuning)` anywhere in the tree is a compile error rather than a
 * photograph quietly wearing the wrong clothes. `tests/nina.imagerecipe.test.ts` asserts the
 * runtime half of the same thing — a tuning wardrobe set to something distinctive does not appear
 * in the prompt.
 *
 * ── WHAT THE WARDROBE REPLACES, AND WHAT IT NEVER TOUCHES ─────────────────────────────────────
 * When set it replaces `NINA_DEFAULT_OUTFIT` and nothing else. The body paragraph, the face
 * paragraph and her home ground are untouched: the body is the user's standing instruction, the
 * face is the anchor, and the track is a place rather than a garment.
 *
 * ── THE LADDER NEVER DROPS WHAT THE OPERATOR TYPED ────────────────────────────────────────────
 * `detail.outfit === false` suppresses the CANON outfit paragraph. It does not suppress a wardrobe
 * the operator wrote — a control that silently discards a field somebody filled in is the failure
 * mode `lib/db/schema.ts`'s `nina_tuning` header argues against (*"a control that silently does
 * nothing"*). Same rule as `VENUE`, `TIME` and `NOTES` in `imagegen.ts`.
 *
 * This does NOT reach the system prompt. `NINA_APPEARANCE` never did — `prompts/system.ts`
 * imports its twenty-one names from the persona barrel and none of these four is among them — and a paragraph
 * telling her what she is wearing would be a fact about a photograph that has not been taken yet.
 */
export function ninaAppearance(
  prefs: NinaImagePrefs,
  detail: NinaAppearanceDetail = NINA_APPEARANCE_FULL_DETAIL,
): string {
  /* PLAN INVARIANT 4, once more by construction. A caller that computed an empty body gets element
   * 0 rather than a prompt with no body in it. */
  const body = detail.body.trim().length > 0 ? detail.body : NINA_BODY_SENTENCES[0]!

  const paragraphs: string[] = [body]
  if (detail.face) paragraphs.push(NINA_FACE)

  /* `wardrobe` is `string` and never null — phase 1's coercer returns `''` for anything unusable
   * and has already collapsed the whitespace to single spaces and capped the length. `''` is the
   * ONE empty value, so this is a length check and not a null check. `.trim()` survives only
   * because a hand-run SQL update can still write ' '. */
  const wardrobe = withSentenceStop(prefs.wardrobe.trim())
  if (wardrobe.length > 0) {
    paragraphs.push(`Her outfit for this photograph: ${wardrobe} ${NINA_OUTFIT_SUFFIX}`)
  } else if (detail.outfit) {
    paragraphs.push(NINA_DEFAULT_OUTFIT)
  }

  return paragraphs.join('\n\n')
}
