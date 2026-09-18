import {
  NINA_BODY_AVATAR,
  NINA_BODY_FACTS,
  NINA_BODY_SENTENCES,
  NINA_DEFAULT_OUTFIT_VALUE,
  NINA_FACE_TEMPLATE_LINE,
  NINA_HAIRSTYLE_SENTENCES,
  ninaAppearance,
  withSentenceStop,
  type NinaAppearanceDetail,
} from '@/lib/nina/persona'
import {
  NINA_CAMERA_ANGLE_KEYS,
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PREFS_DEFAULTS,
  NINA_IMAGE_TEMPLATE_TOKEN_RE,
  validateNinaImageTemplate,
  type NinaCameraAngleKey,
  type NinaImageFocusKey,
  type NinaImagePrefs,
  type NinaImageTemplateKey,
} from '@/lib/nina/imageprefs'
import { ninaBand, type NinaTuning } from '@/lib/nina/tuning'

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
 * ── WHAT THE OPERATOR TYPED IS NEVER DROPPED ──────────────────────────────────────────────────
 * A wardrobe, a venue, a time, a note or a focus selection is never silently discarded: that would
 * be the failure mode `lib/db/schema.ts`'s `nina_tuning` header argues against. The one exception
 * is stated where it lives — the avatar crop drops the four whole-body focus keys, for the same
 * reason `steamy` is selfie-only.
 */

/**
 * The photographic half. `NINA_APPEARANCE` is the WHO and this is the HOW; the scene she chose is
 * the WHAT.
 *
 * It still asks for a casual photograph rather than a magazine shoot. `GENERATE_IMAGE_TOOL`'s
 * description is "take a photo of yourself and send it", and a runner who receives a glossy studio
 * portrait has received something a friend did not send. This is the one place in the phase where
 * the aesthetic is decided, and it is decided here rather than in the tool schema so the model
 * cannot drift it — the tool description never reaches this string.
 *
 * ── WHY IT NO LONGER SAYS "A DSLR PHOTOGRAPH, AS IF TAKEN AND SENT IN A CHAT APP" ─────────────
 * That sentence named a camera nobody holds at arm's length and a habit everybody performs at
 * arm's length, and the ambiguity resolved the wrong way. Of the six production photographs
 * sampled on 2026-09-16 (gallery positions 1, 8, 11, 16, 21, 25 of 91), four are literal
 * arm's-length selfie compositions — an arm reaching toward the lens, the head filling the frame,
 * the legs foreshortened — and the full-body ones put the feet hard against the bottom edge. The
 * six `scene` arguments the chat model wrote are all third person ("She sits at a wooden table"),
 * so the selfie was coming from HERE and from nowhere else.
 *
 * So the block now names the photographer (another person, a few steps back), the lens and the
 * distance, the head-to-body proportion, and a frame with the whole body in it. Head size and
 * cropped feet share the near-field cause with the selfie framing, which is why one paragraph
 * addresses all three.
 *
 * ── WHY THE NEGATIVES ARE INLINE ──────────────────────────────────────────────────────────────
 * There is no `negative_prompt` field on this provider's `images/generations` call —
 * `buildImageRequestBody` (`lib/nina/imagerecipe.ts`) sends `model, prompt, resolution,
 * aspect_ratio, n, seed, input_references` and nothing else. Inline "no X" clauses in the positive
 * prompt are the mechanism this file has always used (the watermark/border/retouching run below),
 * and the new anti-selfie clauses use it too rather than inventing an unverified parameter.
 *
 * RU-18 still holds: no clause here may claim a picture that is not in the payload is
 * authoritative, and the word "reference" does not appear (`tests/nina.imagerecipe.test.ts:855`).
 *
 * ── WHY THE PREFIX NO LONGER NAMES A CAMERA POSITION, AND WHY THE ANGLE IS A CLOSED SET NOW ───────
 * The paragraph used to open with a FIXED, unconditional claim — "taken by another person standing
 * a few steps away" — sitting right beside `{{angle}}`. That was itself the same class of bug this
 * file had already fixed once: `nina_turns` `HIiyRr5_zemf` and `cPl8-4p26cqA` (2026-09-17) showed a
 * diffusion model blending a fixed EYE-LEVEL framing sentence with a chat-model overhead request
 * rather than picking one, and the fix then was to let `{{angle}}` replace that middle sentence
 * wholesale instead of following it. `OIF0bLCf4MMC` (2026-09-18, `/pull-image-gen-job`'s diagnosis)
 * showed the SAME mechanism one level up: the chat model correctly overrode the middle sentence
 * with "the camera is directly above her, looking straight down", and the photo still came back a
 * low, ground-level shot along her body — because the PREFIX's "standing a few steps away" was
 * still there, unconditionally, saying the opposite, and a diffusion model has no "ignore the
 * earlier sentence" any more here than it did the first time.
 *
 * The fix is the same shape at a wider scope: nothing outside `{{angle}}` may claim a camera
 * position. The prefix below keeps only the true anti-selfie invariants (no raised arm, no phone,
 * no mirror) — never true or false depending on where the camera is — and the WHOLE camera-position
 * clause, prefix opening and framing sentence both, moves into `NINA_CAMERA_ANGLE_SENTENCES`, one
 * complete paragraph per preset. `{{angle}}` no longer takes free text for the same reason: prose
 * the chat model composes can always reintroduce a second, competing camera claim (that is
 * literally how `OIF0bLCf4MMC` happened, one layer removed) — a closed set of vetted sentences
 * cannot.
 */
const NINA_SELFIE_STYLE_PREFIX = `A candid photograph of her. This is not a selfie: no raised arm reaching toward the camera, no phone and no hand held near the lens, no mirror and no mirror reflection, and she is not holding the camera herself.`

/**
 * **One complete camera-position paragraph per `NinaCameraAngleKey`** (`lib/nina/imageprefs.ts`) —
 * distance, lens, and proportion all in the one sentence group, so nothing here has to coexist with
 * a competing claim anywhere else in block 1. See the header above `NINA_SELFIE_STYLE_PREFIX` for
 * why this replaced a fixed prefix clause plus a single overridable framing sentence.
 *
 * `eye_level` is the unchanged default — the exact sentence `NINA_SELFIE_FRAMING_DEFAULT` used to
 * be, with the prefix's old opening folded in verbatim so the assembled paragraph reads
 * byte-identical to before for every operator who never touches the new dropdown.
 *
 * `overhead` is modelled on the sentence that actually worked (`/pull-image-gen-job`'s
 * `ciN2DbsKNFcj` and the corrected `OIF0bLCf4MMC`): a drone, directly above, nothing at ground
 * level to blend against.
 */
export const NINA_CAMERA_ANGLE_SENTENCES: Readonly<Record<NinaCameraAngleKey, string>> =
  Object.freeze({
    eye_level: `Taken by another person standing a few steps away, shot on a 50 mm lens from about three metres back, at chest height, so the perspective is flat and human: her head is normal-sized and in natural proportion to her tall body, her long legs read their full length, and nothing is stretched or squeezed by a close wide-angle. Frame her whole body with room to spare, the top of her head and her long feet both comfortably inside the picture and floor visible below her feet; her long feet and long calves are never cropped, never flattened against the bottom edge and never shrunk by perspective.`,
    overhead: `Taken by a drone directly above her, looking straight down at her from a bird's-eye view — the camera is perfectly overhead, not from the side and not at an angle, with no ground-level presence and no person standing nearby in the frame.`,
    low_angle: `Taken by another person crouched low near her feet, the camera close to the ground looking up along the length of her body toward her face — a dramatic low, worm's-eye perspective.`,
  })

/**
 * **The camera check — a second, LATER reinforcement of `{{angle}}`, spent only where the
 * contradiction has actually been measured (2026-09-18, job `sITrkxbwsWFV`).**
 *
 * `{{angle}}` (`NINA_CAMERA_ANGLE_SENTENCES`) already resolved to `overhead` correctly on that
 * job — the header above `NINA_SELFIE_STYLE_PREFIX` had already fixed the earlier bug where a
 * fixed prefix clause fought it. The photo still came back a front-on, ground-level shot with a
 * horizon (sea and sky "behind her") in frame, because the chat model's OWN `scene` argument
 * ("sea and bright sky behind her") is free text, and this file's own block-order rule
 * (`buildNinaImagePrompt`'s header, point 7) says a scene naming its own place is deliberately
 * "the later and more specific instruction" and wins. That rule is right for WHERE and WHEN; it
 * is exactly wrong for a camera position slipped into the same sentence, which is what happened
 * here one layer past the fix already made for `{{angle}}` itself.
 *
 * The fix is the same shape, one layer further out, rather than trying to sanitise free text: a
 * short, unconditional sentence naming the same closed-set camera fact again, placed at the very
 * end of the template — after `NOTES`, the operator's own last-word line — so it is now the
 * truly last instruction the model reads about where the camera is, and nothing above it (scene,
 * pose, or a hand-typed note) can out-rank it by virtue of coming later. `eye_level` stays empty
 * — the default framing has never shown this contradiction, and an empty value drops the whole
 * line, keeping every operator who never touches the angle dropdown on the byte-identical prompt.
 */
export const NINA_CAMERA_ANGLE_REMINDER: Readonly<Record<NinaCameraAngleKey, string>> =
  Object.freeze({
    eye_level: '',
    overhead: `Camera check: the shot described above is still a drone directly overhead, looking straight down at her — nothing in the scene, the pose or the notes above moves the camera down to eye level, to the side, or anywhere a horizon would be visible.`,
    low_angle: `Camera check: the shot described above is still low and close to the ground, looking up along her body — nothing in the scene, the pose or the notes above moves the camera up to eye level or overhead.`,
  })

/**
 * **The butt clause, camera-angle-aware (2026-09-18, job `lUARJrfreQta`).**
 *
 * `NINA_SELFIE_STYLE_PREFIX`'s header already tells this story twice: a fixed sentence outside
 * `{{angle}}` that makes a claim about where the camera is, or what it sees, fights a chat-model
 * `{{angle}}` override instead of losing to it — a diffusion model has no "ignore the earlier
 * sentence". `lUARJrfreQta` is the same mechanism a third time, one level further out. The runner
 * asked for "foto lo telentang ngeliat kamera diatas" (lying on her back, camera directly
 * overhead); `{{angle}}` correctly resolved to `overhead`, and the photo still came back arched
 * up and shot at a steep-but-not-vertical angle. `NINA_BODY_SENTENCES[2]` is why:
 * "standing out from her back rather than flattening into it" is a viewing-geometry claim, and it
 * is impossible to satisfy directly above someone lying flat on her back — the butt is pressed
 * into the mattress, on the far side of her body from the lens. Faced with that plus `overhead`,
 * the model split the difference instead of visibly breaking one instruction.
 *
 * PLAN INVARIANT 4 (`persona/appearance.ts`'s header above `NINA_BODY_SENTENCES`) still holds:
 * every angle gets a sentence naming her butt round, high and full, so no angle drops the fact.
 * Only the ONE clause that asserts a specific, camera-relative visibility varies, and only for
 * `overhead`, where that claim is the one this file just described as unsatisfiable. `eye_level`
 * and `low_angle` keep `NINA_BODY_SENTENCES[2]` verbatim — neither angle has ever shown this
 * contradiction, so there is nothing measured to change there.
 */
export const NINA_BODY_BUTT_SENTENCES: Readonly<Record<NinaCameraAngleKey, string>> = Object.freeze(
  {
    eye_level: NINA_BODY_SENTENCES[2]!,
    low_angle: NINA_BODY_SENTENCES[2]!,
    overhead: `Her butt is round, high and full — a body fact true of her regardless of whether this angle happens to show it.`,
  },
)

/**
 * **The calf-to-thigh ratio clause (2026-09-17), and why it lives in the SUFFIX and not the
 * framing sentence it sits beside.**
 *
 * Job `lvCrq8Zz4smA`: a bent-forward beach pose, hands braced on the thighs. `pull-image-gen-job`'s
 * diagnosis of the photograph found the calves reading visibly shorter than the thighs — the pose
 * puts the thighs closer to and squarer on the lens while the calves recede toward the ground, and
 * `NINA_SELFIE_FRAMING_DEFAULT`'s bare "long calves" claim gave the model no ratio to hold against
 * that foreshortening. `NINA_BODY_SENTENCES[0]`'s new ratio clause (`persona/appearance.ts`) says
 * the same thing about who she is; this sentence says it about the shot, so the instruction survives
 * whichever body sentences a rung actually spends.
 *
 * It is in the SUFFIX, unconditionally after `{{angle}}`, rather than folded into
 * `NINA_SELFIE_FRAMING_DEFAULT` — the header above `NINA_SELFIE_STYLE_PREFIX` is exactly why: a
 * chat-model `angle` override REPLACES that framing sentence wholesale, so anything added there
 * would vanish on every photo the model was asked to shoot from an unusual angle, which is the
 * common case this file's own worked examples come from. The ratio is a body-proportion fact, not
 * a camera-position one — it does not compete with whatever `{{angle}}` says about where the
 * camera is, so it belongs where it is sent on every selfie, angle override or not.
 */
const NINA_SELFIE_STYLE_SUFFIX = `Her calves read as long as, or longer than, her thighs — supermodel, runway-model leg proportions, the knee sitting at the exact midpoint of her leg or lower, never above it. This ratio holds regardless of pose: bent forward, crouching, or with her legs angled toward or away from the lens, her calves must never read shorter than her thighs. Natural daylight, slightly imperfect framing, shallow depth of field, visible skin texture, no studio lighting, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render, the kind of picture a friend takes and sends in a chat app.`

/**
 * The avatar variant. Same camera, tighter crop, because the result is rendered inside a 28-44 px
 * circle by `NinaAvatar` and a full-body shot becomes an unreadable smudge at that size. Phase 15
 * exists to let an operator re-frame one by hand; this is the framing that means it usually does not
 * have to.
 */
const NINA_AVATAR_STYLE = `A casual smartphone photograph framed as a profile picture: head and shoulders, her face filling most of the frame, looking at the camera. Natural daylight, no text, no watermark, no border. Realistic photograph, not an illustration and not a render.`

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
function ninaPhotoPresence(
  purpose: NinaImagePurpose,
  tuning: NinaTuning | null,
  /** The chat model's own per-photograph stance, matched to `scene`. Replaces the fixed clause
   * below rather than joining it — the same one-line-ever rule `outfit` already follows — because
   * a boudoir pose glued onto a running-track scene is what made the gallery's images look
   * interchangeable regardless of scene. Blank or absent falls back to that fixed clause. */
  pose?: string | null,
): string | null {
  if (tuning == null) return null

  const clauses: string[] = []

  if (purpose === 'selfie' && isDialHigh(tuning.traits.steamy)) {
    const scenePose = pose?.trim()
    clauses.push(
      scenePose && scenePose.length > 0
        ? scenePose
        : 'She is fully aware of the camera and commanding it: weight on one hip, body turned toward ' +
            'the lens, chin down, holding the pose for the person photographing her.',
    )
  }

  if (isDialHigh(tuning.traits.flirty)) {
    clauses.push(
      'She is looking straight down the lens with a sensual, serious expression, her lips just ' +
        'barely parted, like she knows exactly what she is doing. She is not smiling.',
    )
  }

  if (clauses.length === 0) return null
  return clauses.join(' ')
}

/* ============================================================================
 * THE FOCUS EMPHASIS (R5)
 * ==========================================================================*/

/**
 * **Emphasis, layered on an unconditional canon. Never inclusion.**
 *
 * The user listed six things to be able to "focus on": face, skin, big boobs, bubble butt, big
 * thighs, very long calves. Four of those six are already in the body canon unconditionally, which
 * is the whole of R1 — so selecting `butt` cannot be what puts a butt in the prompt. It is what
 * tells the camera the butt is the point of THIS shoot. Deselecting all six leaves a prompt that
 * still names all four body facts; the index's Decisions table settles this and PLAN INVARIANT 4
 * is the test.
 *
 * `term` is the phrase for the emphasis lead, in the user's own words so the operator reads back
 * what he typed.
 *
 * **The key spellings are phase 1's vocabulary, imported as `NINA_IMAGE_FOCUS_KEYS`.** This record
 * is keyed by that type, so a key phase 1 adds or renames is a compile error here rather than a
 * silently missing clause.
 */
const NINA_FOCUS_EMPHASIS: Readonly<Record<NinaImageFocusKey, { readonly term: string }>> =
  Object.freeze({
    face: Object.freeze({ term: 'her face' }),
    skin: Object.freeze({ term: 'her skin' }),
    boobs: Object.freeze({ term: 'her big boobs' }),
    butt: Object.freeze({ term: 'her bubble butt' }),
    thighs: Object.freeze({ term: 'her big thighs' }),
    calves: Object.freeze({
      /* No internal "and" and no trailing preposition: the template appends "above everything
       * else in this photograph." and `joinTerms` can put five other terms in front of this one. */
      term: 'her very long calves down to full, in-proportion, uncropped feet',
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

/**
 * **The face-identity lock. Only ever spent when a photo reference is actually attached to THIS
 * generation, and only when the operator ticked Face.**
 *
 * RU-18 forbids describing a reference in prose when there is none in the payload — "an
 * instruction to defer to an image that is not in the payload degrades the prompt". That rule is
 * unchanged; this sentence does not violate it, because it is gated on `hasReference`, which is
 * true only when `resolveNinaPhotoReference` actually resolved a Blob URL and the caller is
 * sending it as `input_references`. When the picture genuinely is in the payload, describing it is
 * no longer the contradiction RU-18 was written about — it is the one clause in this file allowed
 * to say so, and the only one gated on whether it is true.
 *
 * The word "reference" does not appear, on purpose: `tests/nina.imagerecipe.test.ts` asserts it
 * never does, and "the attached photo" says the same thing without it.
 */
const NINA_FACE_LOCK_SENTENCE =
  'Her face in this photograph is an exact match for the woman in the attached photo: the same features, the same bone structure, unmistakably her and not a reinterpretation.'

/** `a`, `a and b`, `a, b and c`. No Oxford comma, matching every other prose list in the canon. */
function joinTerms(terms: readonly string[]): string {
  if (terms.length <= 1) return terms[0] ?? ''
  return `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]!}`
}

/** The `FOCUS:` block's body, or null when nothing the crop can honour was selected. */
function ninaFocusBlock(purpose: NinaImagePurpose, prefs: NinaImagePrefs): string | null {
  const keys = NINA_IMAGE_FOCUS_KEYS.filter(
    (key) => prefs.focus[key] && (purpose === 'selfie' || NINA_AVATAR_FOCUS_KEYS.includes(key)),
  )
  if (keys.length === 0) return null

  return `Emphasise ${joinTerms(
    keys.map((key) => NINA_FOCUS_EMPHASIS[key].term),
  )} above everything else in this photograph.`
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
 * the canon constants (`NINA_SELFIE_STYLE`, `NINA_BODY_SENTENCES`, `NINA_FACE_TEMPLATE_LINE`)
 * rather than hand-copied, so the template cannot drift from the words the built-in assembly
 * uses — there is one home for each sentence.
 *
 * The body paragraph carries the first THREE canon sentences — sentence 0's own enumeration
 * (`NINA_BODY_FACTS`), then sentence 1 verbatim, then `{{buttClause}}` standing in for sentence 2.
 * The four facts are prose here, not a token: `{{bodyFacts}}` was dropped because it could only
 * ever expand to this one constant, which made it a decoration on `{{focus}}`'s real job rather
 * than a second control. `{{buttClause}}` is the one exception, added 2026-09-18 for job
 * `lUARJrfreQta`: unlike the enumeration, sentence 2 genuinely has more than one correct value —
 * see `NINA_BODY_BUTT_SENTENCES`'s header for the contradiction that forced it.
 *
 * The face paragraph IS a token, unlike the body: `NINA_FACE_TEMPLATE_LINE` (`lib/nina/persona/appearance.ts`)
 * carries the same fixed prose `NINA_FACE` always did, with `{{hairstyle}}` standing in for the
 * one sentence that varies (the 2026-09-18 hairstyle preset) — the `{{angle}}` treatment, not the
 * `{{focus}}` one, because a hairstyle is always exactly one thing and never a droppable list.
 *
 * The outfit line no longer appends the canon's watch-and-track sentence — that was fixed prose
 * ("a red 400 m athletics track", "flat morning sun") competing with the operator's own
 * `{{venue}}`, `{{time}}` and `{{notes}}` lines a few lines below. One place to say where and
 * when is enough.
 *
 * Line semantics (the renderer below): a line containing a token that expanded to empty is
 * dropped ENTIRE, so the FOCUS line vanishes when nothing is ticked, POSE AND PRESENCE vanishes
 * when the dials are quiet, and VENUE / TIME / NOTES / EXPRESSION AND ENERGY vanish when their
 * fields are empty — the omit-when-empty rule the built-in assembly always had. The trailing
 * `{{angleReminder}}` line follows the same rule and is the newest example of it: empty for
 * `eye_level`, so it vanishes and the shell is unchanged for every operator who has never touched
 * the angle dropdown; see `NINA_CAMERA_ANGLE_REMINDER`'s header for what it is for.
 */
export const NINA_PROMPT_TEMPLATE_DEFAULT = [
  `${NINA_SELFIE_STYLE_PREFIX} {{angle}} ${NINA_SELFIE_STYLE_SUFFIX}`,
  '',
  'SUBJECT:',
  `She has got an alluring body, ${NINA_BODY_FACTS}. This silhouette is the point of the photograph and it ` +
    `must be visible in it. ${NINA_BODY_SENTENCES[1]} {{buttClause}}`,
  '',
  NINA_FACE_TEMPLATE_LINE,
  '',
  'Her outfit for this photograph: {{wardrobe}}',
  '',
  'FOCUS: Emphasise {{focus}} above everything else in this photograph.',
  '',
  '{{faceLock}}',
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
  '',
  '{{angleReminder}}',
].join('\n')

/**
 * **The avatar's shell — and the one template the operator does not edit.** The stored template
 * is her PHOTOGRAPH prompt: the field, the preview and the test button are all the selfie path.
 * The avatar is a head-and-shoulders crop rendered inside a 28-44 px circle, and the selfie prose
 * would argue with that crop — full-body pose clauses and a wardrobe line under a face framing.
 * So `purpose === 'avatar'` keeps the built-in block assembly (this nine-token shell over the
 * block builders below, byte-identical to the pre-template render). Making the avatar template
 * editable is a deliberate later decision, not an oversight; the camera choice and the reference
 * still apply to both paths.
 */
const NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT = [
  '{{camera}}',
  '',
  '{{subject}}',
  '',
  '{{focus}}',
  '',
  '{{faceLock}}',
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
 *  3b. **the face lock** — immediately after `FOCUS:`, since it is conditional on the SAME Face
 *      tick and is the last word on who she is before the pose is decided. Empty unless Face is
 *      ticked AND a photo reference actually reached the payload (`NINA_FACE_LOCK_SENTENCE`).
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
 *  9. **`NOTES:`** — the operator's catch-all amendment to this photograph ("nina is full of
 *     sweat"), the same category as `--note` and one step later, because that is where an
 *     instruction that must be able to amend everything above it belongs.
 *  10. **the camera check (`{{angleReminder}}`)** — TRULY last, after `NOTES`, and unconditional
 *      rather than an operator amendment. Added 2026-09-18 for job `sITrkxbwsWFV`: a `scene` (or a
 *      hand-typed note) can encode a camera position without saying so in `{{angle}}`'s own
 *      vocabulary, and this file's own "later wins" rule then makes THAT the effective camera
 *      instruction. Restating the same closed-set fact one more time, after everything an operator
 *      or the chat model could have said, closes that off. Empty for `eye_level`, so the line drops
 *      and every prompt that never touches the angle dropdown is unchanged.
 *
 * ── `{{angle}}` IS NOT A BLOCK: IT LIVES INSIDE BLOCK 1 (2026-09-17) ──────────────────────────────
 * `NINA_SELFIE_STYLE_PREFIX`'s header has the full argument; the short version is that a "later
 * instruction wins" correction does not work against a diffusion model the way it works against an
 * instruction-following LLM, so the framing sentence cannot be countermanded from the end of the
 * prompt — it has to never be sent in the first place. `{{angle}}` therefore sits IN PLACE of the
 * default framing sentence, inside block 1, and REPLACES it (`NINA_SELFIE_FRAMING_DEFAULT` under a
 * blank override, same as `outfit` replaces the wardrobe line) rather than joining it as a tenth
 * numbered block.
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
  /**
   * **The chat model's own per-photograph clothing request — selfie only, and the ONLY thing that
   * may replace the wardrobe line.** Before this field existed, a runner's "wear a black mini
   * dress" reached the prompt through `scene` while `prefs.wardrobe`/the canon default kept its own
   * `Her outfit for this photograph: …` line — two dress-code instructions in one prompt, decided
   * by nothing (2026-09-16). `GENERATE_IMAGE_TOOL` now gives the model a dedicated slot and tells it
   * not to repeat clothing inside `scene`, so there is exactly one wardrobe line, ever: this value
   * when it is non-empty, `prefs.wardrobe` otherwise, the canon default under that.
   */
  outfit?: string | null
  /** The chat model's own guess at how she is physically standing or moving in THIS scene — selfie
   * only, same reasoning as `outfit`. Only spent when `steamy` is high enough to spend a pose
   * clause at all; blank or absent falls back to the fixed clause `ninaPhotoPresence` shipped with. */
  pose?: string | null
  /** The chat model's invented outfit for a turn nobody dressed her for. Lowest priority of the
   * three wardrobe sources: `outfit` (an explicit ask) wins over `prefs.wardrobe` (a standing
   * preference) wins over this — it only ever replaces the canon default, never a real preference. */
  ootd?: string | null
  /**
   * The chat model's own per-photo camera-angle PICK — one of `NINA_CAMERA_ANGLE_KEYS`, selfie
   * only, same precedence reasoning as `outfit`/`pose`. Loosely typed (`string | null`, not
   * `NinaCameraAngleKey | null`) because this function must degrade rather than throw on whatever
   * reaches it — `coerceNinaCameraAngle`'s whole argument, applied here as an inline check rather
   * than a call to it, because THIS field's absence means something coerce's does not: "no per-photo
   * pick", falling through to `prefs.cameraAngle` rather than to the hard-coded default. Blank,
   * absent or unrecognised all fall through the same way. See the header above
   * `NINA_SELFIE_STYLE_PREFIX` for why this is a closed set and not free text any more. */
  angle?: string | null
  /** Her character. Only `steamy` and `flirty` reach a photograph. */
  tuning?: NinaTuning | null
  /** The operator's image preferences. Absent renders `NINA_IMAGE_PREFS_DEFAULTS`. */
  prefs?: NinaImagePrefs | null
  /**
   * **Whether THIS generation actually attaches a photo reference as `input_references`.** Not
   * "was one configured" — `prefs.reference` can name a photo that was since deleted, and only
   * the caller who resolved it (`resolveNinaPhotoReference`) knows whether the resolution
   * succeeded. Absent/false means no reference reaches the payload, which is every caller that
   * predates this field and every 'none' preference — the ordinary case, unchanged.
   */
  hasReference?: boolean
}): string {
  const tuning = input.tuning ?? null
  const prefs: NinaImagePrefs = input.prefs ?? NINA_IMAGE_PREFS_DEFAULTS
  const isAvatar = input.purpose === 'avatar'
  /* Gated on BOTH: the operator's own opt-in (Face ticked) and the payload actually carrying a
   * photograph (`hasReference`). Neither alone is enough — see `NINA_FACE_LOCK_SENTENCE`'s header. */
  const faceLockValue =
    prefs.focus.face && input.hasReference === true ? NINA_FACE_LOCK_SENTENCE : ''

  /*
   * TWO SHELLS, ONE RENDERER. The avatar keeps the built-in BLOCK assembly (see
   * `NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT` for why the stored template does not reach it); the
   * selfie goes through the operator's template — full prose with the value tokens of §6.
   */
  if (isAvatar) {
    const detail: NinaAppearanceDetail = {
      body: NINA_BODY_AVATAR,
      /* The avatar IS a face crop, so the face paragraph is always spent. */
      face: true,
      outfit: true,
    }

    const focusText = ninaFocusBlock('avatar', prefs)
    const presenceText = ninaPhotoPresence('avatar', tuning)

    const avatarBlocks: Record<string, string> = {
      camera: NINA_AVATAR_STYLE,
      subject: `SUBJECT:\n${ninaAppearance(prefs, detail)}`,
      focus: focusText != null ? `FOCUS: ${focusText}` : '',
      faceLock: faceLockValue,
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
  const outfitOverride = input.outfit?.trim() ?? ''
  const wardrobe = prefs.wardrobe.trim()
  const ootdIdea = input.ootd?.trim() ?? ''
  const wardrobeValue =
    outfitOverride.length > 0
      ? outfitOverride
      : wardrobe.length > 0
        ? wardrobe
        : ootdIdea.length > 0
          ? ootdIdea
          : NINA_DEFAULT_OUTFIT_VALUE

  /*
   * The chat model's pick when it is one of the three keys; the operator's standing default
   * otherwise (absent, blank, or a string this vocabulary has never heard of) — never free text,
   * and never both a preset AND a competing fixed sentence in the same paragraph. See the header
   * above `NINA_SELFIE_STYLE_PREFIX`.
   */
  const angleOverride = input.angle?.trim() ?? ''
  const angleKey = (NINA_CAMERA_ANGLE_KEYS as readonly string[]).includes(angleOverride)
    ? (angleOverride as NinaCameraAngleKey)
    : prefs.cameraAngle
  const angleValue = NINA_CAMERA_ANGLE_SENTENCES[angleKey]

  const blocks: Record<string, string> = {
    wardrobe: withSentenceStop(wardrobeValue),
    focus: focusTerms,
    faceLock: faceLockValue,
    presence: ninaPhotoPresence('selfie', tuning, input.pose) ?? '',
    venue: prefs.venue.trim(),
    time: prefs.time.trim(),
    scene: input.scene.trim(),
    mood: input.mood?.trim() ?? '',
    angle: angleValue,
    buttClause: NINA_BODY_BUTT_SENTENCES[angleKey],
    hairstyle: NINA_HAIRSTYLE_SENTENCES[prefs.hairstyle],
    notes: prefs.notes.trim(),
    angleReminder: NINA_CAMERA_ANGLE_REMINDER[angleKey],
  }

  return renderNinaImagePrompt(effectiveNinaImageTemplate(prefs), blocks)
}

/**
 * `gen_badge_art.py`'s `write_sidecar`, minus the file. Only a human ever reads this.
 *
 * `referenceUrl` defaults to `null` — every caller that predates the anchor-wiring fix, and every
 * job with `prefs.reference` set to `'none'` or pointing at a since-deleted photo, still reads
 * `reference:  none (RU-18)`. That line stops being the RU-18 placeholder and starts being the
 * honest answer once a caller actually resolved one: this is the record of what the payload really
 * carried for this job, six weeks later, and a sidecar that always claimed "none" the moment that
 * stopped being universally true would be exactly the kind of quiet drift `sidecarText` exists to
 * prevent.
 */
export function sidecarText(input: {
  prompt: string
  seed: number
  purpose: NinaImagePurpose
  /** The camera this sidecar describes — the job's coerced id, not the module constant. */
  model: string
  /** The Blob URL actually sent as `input_references`, or `null` for an unanchored job. */
  referenceUrl?: string | null
}): string {
  return [
    `provider:   openrouter`,
    `model:      ${input.model}`,
    `purpose:    ${input.purpose}`,
    `resolution: ${NINA_IMAGE_RESOLUTION} ${NINA_IMAGE_ASPECT}`,
    `seed:       ${input.seed}`,
    `reference:  ${input.referenceUrl != null && input.referenceUrl !== '' ? input.referenceUrl : 'none (RU-18)'}`,
    '',
    '--- prompt as sent ---',
    input.prompt,
  ].join('\n')
}
