import { NINA_APPEARANCE } from '@/lib/nina/persona'

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

export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
}): string {
  const parts = [
    input.purpose === 'avatar' ? NINA_AVATAR_STYLE : NINA_SELFIE_STYLE,
    '',
    'SUBJECT:',
    NINA_APPEARANCE,
    '',
    `SCENE: ${input.scene.trim()}`,
  ]
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
