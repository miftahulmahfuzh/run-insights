/**
 * **"foto lu" — the no-interpretation photo shortcut.**
 *
 * The runner asked for one thing: when he sends a short, content-free "take my/your photo" ask
 * and the operator has already written something into the Notes field on `/admin/image-generation`,
 * skip the model turn entirely and fire the photo straight off the five saved fields (`wardrobe`,
 * `venue`, `time`, `notes`, `expression`) plus the saved reference anchor — no `glm-5.3` call, no
 * model-authored `scene`/`mood`/`outfit`/`pose`/`ootd`/`angle`.
 *
 * ── WHY NOTES GATES IT ────────────────────────────────────────────────────────────────────────
 * Notes is the operator's standing, always-applied instruction for every photo regardless of what
 * triggered it (`lib/nina/imagegen.ts`'s `NOTES:` line). An empty Notes field means the operator
 * has not actually configured anything for this shortcut to execute, so a bare "foto lu" with no
 * Notes set falls through to the ordinary chat turn instead of silently firing a bland default.
 *
 * ── WHY THE MATCH IS A LOOSE REGEX, NOT AN EXACT STRING ───────────────────────────────────────
 * The runner asked for casual variants ("foto lu dong", "fotoin lu ya") to count too. Requiring
 * both a photo-word and "lu" while keeping the whole message short is what tells "foto lu" apart
 * from a message that merely mentions a photo in passing.
 */

const NINA_PHOTO_SHORTCUT_MAX_CHARS = 25
const NINA_PHOTO_WORD_RE = /\b(foto|fotoin)\b/i
const NINA_LU_RE = /\blu\b/i

export function isNinaPhotoShortcut(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > NINA_PHOTO_SHORTCUT_MAX_CHARS) return false
  return NINA_PHOTO_WORD_RE.test(trimmed) && NINA_LU_RE.test(trimmed)
}

/**
 * `generateNinaSelfie` requires a non-empty `scene` — normally the model's own sentence describing
 * what the photograph shows. This shortcut has no model input at all, so the scene is a fixed,
 * neutral constant: it asserts nothing the five saved fields don't already cover, and it is the
 * same string every time on purpose (zero interpretation applies to the scene too).
 */
export const NINA_PHOTO_SHORTCUT_SCENE = 'A candid photo of Nina, exactly as she looks right now.'

/** The canned chat acknowledgement — never model-generated, same register as `imagefail.ts`'s. */
export const NINA_PHOTO_SHORTCUT_REPLY = 'Otw foto, tunggu bentar ya'

/** What she "says" when the daily photo cap is already spent. Same register, same reason as
 * `NINA_IMAGE_APOLOGIES` in `lib/nina/imagefail.ts` — canned, not generated, because this path
 * makes no model call to generate anything with. */
export const NINA_PHOTO_SHORTCUT_CAPPED_REPLY = 'kuota foto gw abis buat hari ini, besok lagi ya'
