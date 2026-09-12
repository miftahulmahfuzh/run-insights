/**
 * **The text-model vocabulary — the one module both the browser and the resolver hold.**
 *
 * The 2026-09-10 ask: a dropdown on `/admin/personality` so the operator can move every TEXT
 * generation between `glm-5.3` and `glm-5.3-flash` with *no redeploy* — *"supaya admin ga perlu
 * deploy ulang vercel kalo mau ganti LLM settings."* The resolver that honours the setting is
 * `lib/llm/textModel.ts`; this file is what makes that possible at all: it is the zero-import
 * half, importable from the `'use client'` panel (which renders the options), the Server Action's
 * Zod boundary (which refuses anything outside the list), and the server resolver — so all three
 * read ONE vocabulary instead of three copies.
 *
 * A CLOSED list, not a free-text id, for the same reason the image dropdown's is (`NINA_IMAGE_MODEL_IDS`,
 * `lib/nina/imageprefs.ts`): an unknown id must degrade toward the verified default at the read,
 * never reach the provider and fail after the turn is already half-spent. A new model is a code
 * change plus a probe, which is this repo's own discipline for a model call.
 *
 * **Both ids were verified live on 2026-09-10** with a one-token POST to the exact endpoint
 * `LLM_BASE_URL` names (the Anthropic-compatible face), not to the OpenAI-shaped coding endpoint
 * whose model list happens to include them — the two faces are one provider, but the check ran on
 * the face the turns actually use.
 */

export const NARRATIVE_TEXT_MODEL_IDS = ['glm-5.3', 'glm-5.3-flash'] as const

export type NarrativeTextModelId = (typeof NARRATIVE_TEXT_MODEL_IDS)[number]

/**
 * The deployed fallback is `env.LLM_MODEL`, and `tests/llm.textModel.test.ts` pins it to be an id
 * this catalog declares — the resolver's degrade target and the dropdown's vocabulary must
 * describe the same set. The shipped id is deliberately not duplicated here as a constant: the
 * degrade always lands on the LIVE env value (`textModel.ts`), so a second spelling of "the
 * default" would be one more name that can drift, not one more guarantee.
 */
interface NarrativeTextModelSpec {
  readonly id: NarrativeTextModelId
  /** The dropdown's label. Sentence case, the provider's product name. */
  readonly label: string
  /** One line under the dropdown: what the choice trades. */
  readonly hint: string
}

export const NARRATIVE_TEXT_MODEL_SPECS: Readonly<
  Record<NarrativeTextModelId, NarrativeTextModelSpec>
> = Object.freeze({
  'glm-5.3': Object.freeze({
    id: 'glm-5.3',
    label: 'GLM 5.3',
    hint: 'The default. The stronger writer — her voice, captions, titles and the insights rollup.',
  }),
  'glm-5.3-flash': Object.freeze({
    id: 'glm-5.3-flash',
    label: 'GLM 5.3 Flash',
    hint: 'The faster, cheaper sibling. Same endpoint, same tools — watch her voice for the trade.',
  }),
})
