import { NINA_IMAGE_MODEL_IDS, NINA_IMAGE_MODEL_SPECS } from './imageprefs'
import type { NinaImageModelId } from './imageprefs'
import type { NinaPhotoshopMode } from '@/lib/db/schema'

/** The label/hint pair a model dropdown renders — the shape `NinaImageModelSpec` also has, kept
 * as its own interface so an edit-mode id (a different string union) does not have to satisfy that
 * type's narrower `id`. */
export interface NinaPhotoshopModelSpec {
  readonly id: string
  readonly label: string
  readonly hint: string
}

/**
 * Zero imports from `@/lib/db` beyond the type-only re-export above — this module is read by a
 * `'use client'` panel and by the Zod boundary, exactly the `lib/nina/imageprefs.ts` convention.
 */

export const NINA_PHOTOSHOP_MODES = ['anchor', 'edit'] as const

/**
 * **Per-model resolution override (2026-09-19).** `NINA_IMAGE_RESOLUTION` (`'1K'`, 768x1024,
 * 786,432px) is the shared default every other caller rides, and `bytedance-seed/seedream-4.5`
 * 400s on it — measured live: *"requires at least 3,686,400 output pixels ... use a larger
 * resolution such as '2K'"*. Absent = ride the default; only the one model that has actually been
 * measured to need more gets an entry, so this stays a fix for a known constraint and not a guess
 * applied to every model that has never been probed.
 */
const NINA_PHOTOSHOP_MODEL_RESOLUTION: Readonly<Record<string, string>> = Object.freeze({
  'bytedance-seed/seedream-4.5': '2K',
})

export function photoshopModelResolution(model: string): string | undefined {
  return NINA_PHOTOSHOP_MODEL_RESOLUTION[model]
}

export function coercePhotoshopMode(value: unknown): NinaPhotoshopMode {
  return value === 'edit' ? 'edit' : 'anchor'
}

/** Anchor mode reuses the image-generation tab's own model list verbatim, per the operator's ask. */
export const NINA_PHOTOSHOP_ANCHOR_MODEL_IDS = NINA_IMAGE_MODEL_IDS
export const NINA_PHOTOSHOP_ANCHOR_MODEL_SPECS = NINA_IMAGE_MODEL_SPECS
export const NINA_PHOTOSHOP_ANCHOR_MODEL_DEFAULT: NinaImageModelId = 'qwen/qwen-image-3'

/**
 * **Edit mode's models — curated for documented image-editing support, not copy-pasted.**
 *
 * Verified against OpenRouter's own docs/blog (2026-09-19): the request shape is identical to the
 * anchor path (`input_references` on the images endpoint), so nothing downstream needs a second
 * call path — only these ids differ from the anchor list, and only because they are the ones
 * OpenRouter documents as genuinely editing the attached photo rather than reinventing a new
 * composition around it. `bytedance-seed/seedream-4.5` is listed on both dropdowns on purpose: it
 * is one of the few models OpenRouter documents as supporting both modes well.
 */
export const NINA_PHOTOSHOP_EDIT_MODEL_IDS = [
  'google/gemini-3.1-flash-image',
  'google/gemini-2.5-flash-image',
  'bytedance-seed/seedream-4.5',
  'black-forest-labs/flux.2-pro',
  'openai/gpt-image-2',
] as const

export type NinaPhotoshopEditModelId = (typeof NINA_PHOTOSHOP_EDIT_MODEL_IDS)[number]

export const NINA_PHOTOSHOP_EDIT_MODEL_DEFAULT: NinaPhotoshopEditModelId =
  'google/gemini-3.1-flash-image'

export const NINA_PHOTOSHOP_EDIT_MODEL_SPECS: Readonly<
  Record<NinaPhotoshopEditModelId, NinaPhotoshopModelSpec>
> = Object.freeze({
  'google/gemini-3.1-flash-image': Object.freeze({
    id: 'google/gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image',
    hint: 'Nano Banana 2. Google’s current default editing model — fast, and documented to keep the rest of the photo untouched.',
  }),
  'google/gemini-2.5-flash-image': Object.freeze({
    id: 'google/gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
    hint: 'The original Nano Banana. Slightly older than 3.1, kept here for comparison.',
  }),
  'bytedance-seed/seedream-4.5': Object.freeze({
    id: 'bytedance-seed/seedream-4.5',
    label: 'Seedream 4.5',
    hint: 'Also offered under Anchor — one of the few models OpenRouter documents as strong at both jobs.',
  }),
  'black-forest-labs/flux.2-pro': Object.freeze({
    id: 'black-forest-labs/flux.2-pro',
    label: 'FLUX.2 Pro',
    hint: 'Black Forest Labs’ current editing line, priced per megapixel rather than per image.',
  }),
  'openai/gpt-image-2': Object.freeze({
    id: 'openai/gpt-image-2',
    label: 'GPT Image 2',
    hint: 'OpenAI’s editing model on OpenRouter. The most expensive of the five — use for a final pass.',
  }),
})

export function coercePhotoshopModel(mode: NinaPhotoshopMode, value: unknown): string {
  if (mode === 'edit') {
    return typeof value === 'string' &&
      (NINA_PHOTOSHOP_EDIT_MODEL_IDS as readonly string[]).includes(value)
      ? value
      : NINA_PHOTOSHOP_EDIT_MODEL_DEFAULT
  }
  return typeof value === 'string' &&
    (NINA_PHOTOSHOP_ANCHOR_MODEL_IDS as readonly string[]).includes(value)
    ? value
    : NINA_PHOTOSHOP_ANCHOR_MODEL_DEFAULT
}

export function photoshopModelIdsFor(mode: NinaPhotoshopMode): readonly string[] {
  return mode === 'edit' ? NINA_PHOTOSHOP_EDIT_MODEL_IDS : NINA_PHOTOSHOP_ANCHOR_MODEL_IDS
}

export function photoshopModelSpecFor(mode: NinaPhotoshopMode, id: string): NinaPhotoshopModelSpec {
  if (mode === 'edit') {
    return (
      NINA_PHOTOSHOP_EDIT_MODEL_SPECS[id as NinaPhotoshopEditModelId] ??
      NINA_PHOTOSHOP_EDIT_MODEL_SPECS[NINA_PHOTOSHOP_EDIT_MODEL_DEFAULT]
    )
  }
  return (
    NINA_PHOTOSHOP_ANCHOR_MODEL_SPECS[id as NinaImageModelId] ??
    NINA_PHOTOSHOP_ANCHOR_MODEL_SPECS[NINA_PHOTOSHOP_ANCHOR_MODEL_DEFAULT]
  )
}

/* ── The improvement field: free text + preset dropdown, the Facial Expression pattern ──────── */

export const NINA_PHOTOSHOP_INSTRUCTION_MAX = 300

export interface NinaPhotoshopPreset {
  readonly key: string
  readonly label: string
  /** Written into the free-text box when chosen — the admin can edit it afterwards, same as
   * `NINA_EXPRESSION_PRESETS`. Presets name "same woman, same angle" themselves so Anchor mode's
   * subject-transfer behaviour has the best chance of keeping the rest of the photo recognisable. */
  readonly text: string
}

export const NINA_PHOTOSHOP_PRESETS: readonly NinaPhotoshopPreset[] = [
  Object.freeze({
    key: 'eyes_fix',
    label: 'Eyes fix',
    text: 'Same woman, same photo, same everything — fix her eyes so they look natural, correctly shaped and properly focused.',
  }),
  Object.freeze({
    key: 'add_sunglasses',
    label: 'Add sunglasses',
    text: 'Same woman, same photo, same everything — she is now wearing stylish sunglasses.',
  }),
  Object.freeze({
    key: 'eyes_closed',
    label: 'Eyes closed',
    text: 'Same woman, same photo, same everything — her eyes are gently closed.',
  }),
  Object.freeze({
    key: 'bigger_boobs',
    label: 'Bigger boobs',
    text: 'Same woman, same photo, same angle — but with large, perky breasts.',
  }),
  Object.freeze({
    key: 'bigger_butt',
    label: 'Bigger butt (bubble butt)',
    text: 'Same woman, same photo, same angle — but with a bigger, bubble butt.',
  }),
  Object.freeze({
    key: 'longer_calves',
    label: 'Longer calves',
    text: 'Same woman, same photo, same angle — but with much, much longer calves.',
  }),
  Object.freeze({
    key: 'bigger_thighs',
    label: 'Bigger thighs',
    text: 'Same woman, same photo, same angle — make only thighs bigger. keep calves and the lower legs size as they are.',
  }),
]

export function photoshopPresetText(key: string): string | null {
  return NINA_PHOTOSHOP_PRESETS.find((preset) => preset.key === key)?.text ?? null
}

export function coercePhotoshopInstruction(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, NINA_PHOTOSHOP_INSTRUCTION_MAX)
}
