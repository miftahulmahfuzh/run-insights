import { NINA_APPEARANCE, ninaAppearance } from '@/lib/nina/persona'
import { ninaBand, type NinaTuning } from '@/lib/nina/tuning'

import {
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_RESOLUTION,
  type NinaImagePurpose,
} from './imagerecipe'

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
 * The avatar variant. Same camera, tighter crop, because the result is rendered inside a 28-44 px
 * circle by `NinaAvatar` and a full-body shot becomes an unreadable smudge at that size. Phase 15
 * exists to let an operator re-frame one by hand; this is the framing that means it usually does not
 * have to.
 */
export const NINA_AVATAR_STYLE = `A casual smartphone photograph framed as a profile picture: head and shoulders, her face filling most of the frame, looking at the camera. Natural daylight, visible skin texture, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render.`

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
 * Nowhere in here. What she WEARS is `tuning.wardrobe`, and it belongs to the SUBJECT paragraph via
 * phase 2's `ninaAppearance` — the operator's own words about her outfit, in the one place the
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

/**
 * ── THE TUNING IS OPTIONAL, AND OPTIONAL IS THE POINT ─────────────────────────────────────────
 * Two things must both be true and `tests/nina.imagerecipe.test.ts` asserts both: with no `tuning`
 * this returns the string that shipped, and with `NINA_TUNING_DEFAULTS` it returns the same string
 * again. Everything the tuning adds is additive text above the default band. That is what makes
 * this feature a provable superset of the Nina who shipped rather than a rewrite of her.
 *
 * It takes the WHOLE `NinaTuning` rather than a slice of it because the picture already reads three
 * unrelated members of it (`wardrobe`, `steamy`, `flirty`), and because a whole tuning is what
 * `ninaAppearance` wants — a bespoke slice would be a second vocabulary for one row.
 */
export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
  /** The operator's character tuning. Absent (or the defaults) renders today's prompt exactly. */
  tuning?: NinaTuning | null
}): string {
  const tuning = input.tuning ?? null

  const parts = [
    input.purpose === 'avatar' ? NINA_AVATAR_STYLE : NINA_SELFIE_STYLE,
    '',
    'SUBJECT:',
    /* Phase 2's seam. With no tuning we spell the canon constant, so this function is still a pure
     * function of its arguments when nobody has an opinion about her wardrobe. */
    tuning == null ? NINA_APPEARANCE : ninaAppearance(tuning),
  ]

  /* BEFORE the scene, because it is a standing property of the subject the operator set once — not
   * a per-photograph note. The per-photograph note is `mood`, and it stays last. */
  const presence = ninaPhotoPresence(input.purpose, tuning)
  if (presence != null) parts.push('', `POSE AND PRESENCE: ${presence}`)

  parts.push('', `SCENE: ${input.scene.trim()}`)

  const mood = input.mood?.trim()
  // After the scene, so it reads as a refinement of this photograph rather than an amendment to who
  // she is. Exactly where `gen_badge_art.py` puts `--note`, and for the same reason.
  if (mood != null && mood.length > 0) parts.push('', `EXPRESSION AND ENERGY: ${mood}`)
  return parts.join('\n')
}

/** `gen_badge_art.py`'s `write_sidecar`, minus the file. Only a human ever reads this. */
export function sidecarText(input: {
  prompt: string
  seed: number
  purpose: NinaImagePurpose
}): string {
  return [
    `provider:   openrouter`,
    `model:      ${NINA_IMAGE_MODEL}`,
    `purpose:    ${input.purpose}`,
    `resolution: ${NINA_IMAGE_RESOLUTION} ${NINA_IMAGE_ASPECT}`,
    `seed:       ${input.seed}`,
    `reference:  none (RU-18)`,
    '',
    '--- prompt as sent ---',
    input.prompt,
  ].join('\n')
}
