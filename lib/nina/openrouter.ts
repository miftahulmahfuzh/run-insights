/**
 * **OpenRouter's CHAT surface, plus the models Nina falls back to.** Zero imports.
 *
 * ── WHY A FILE OF ITS OWN ─────────────────────────────────────────────────────────────────────
 * Two unrelated call paths need `OPENROUTER_CHAT_URL`: the vision/describe fallback
 * (`lib/nina/vision.ts`) and the text-chat fallback (`lib/nina/llmFallbackText.ts`). Declaring it
 * twice is how an endpoint drifts apart from itself — RULING A6's rule, the same one that keeps
 * `NINA_BLOB_PREFIX` in exactly one place. A vision module is the wrong home for a text client's
 * endpoint and vice versa, so neither owns it: this file does. The two model VOCABULARIES below
 * are declared here for the same reason `NARRATIVE_TEXT_MODEL_SPECS` lives in `lib/llm/catalog.ts`
 * — the browser dropdown, the Server Action's Zod boundary and the server resolver must all read
 * one list, not three copies.
 *
 * ── ZERO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────────────────────
 * Same rule and same reason as `imagerecipe.ts` and `imagefail.ts`: a constants module with no
 * imports can be read by anything — a `'use client'` dropdown included — without dragging
 * `server-only` or a database client in behind it. There is no secret here — the API KEY is read
 * through `ninaEnv()` at the call site, which is what `ci:openrouter-guard` checks for.
 *
 * ── THE VISION FALLBACK STAYS HARDCODED. THE CHAT FALLBACK DOES NOT. ─────────────────────────
 * These used to be one constant, `NINA_FALLBACK_TEXT_MODEL`, serving both call paths — chosen
 * because it was natively multimodal (`lib/nina/vision.ts` sends an `image_url` part; a text-only
 * model would 400 on it). The 2026-09-14 ask splits them: the operator wants to pick the CHAT
 * fallback from a dropdown with no redeploy, the same "supaya admin ga perlu deploy ulang vercel"
 * shape `lib/llm/textModel.ts` already ships for the primary model. `NINA_VISION_FALLBACK_MODEL`
 * keeps the old reasoning verbatim and stays a hardcoded single constant: `turn.ts` never sends an
 * image on the chat path (invariant 5 — `imageDescriptions` is TEXT), so the chat fallback carries
 * no multimodal requirement and an operator picking one of these ids cannot break the photo
 * description path by accident. A dropdown that could ALSO repoint the vision fallback would be
 * one control silently deciding two unrelated things.
 */

/** OpenRouter's OpenAI-Chat-Completions endpoint. The image path's sibling of `/images/generations`. */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * **OpenRouter's embeddings surface.** Sibling of `OPENROUTER_CHAT_URL` above, and declared here
 * for the same reason that one is: an endpoint spelled in two files is an endpoint that drifts
 * apart from itself. `lib/nina/embedding.ts` is its only reader today; the search query layer
 * reaches it through that module and never spells the URL.
 *
 * Unlike the chat and vision paths, this endpoint has **no z.ai primary in front of it**. Neither
 * configured z.ai base URL (`LLM_VISION_BASE_URL`, `LLM_BASE_URL`) exposes an embeddings surface
 * that this repo has confirmed, so there is nothing to fall back FROM. A failure here is a single
 * failed attempt and one `nina_error_logs` row, not a two-provider ladder.
 */
export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'

/**
 * **The album's text-embedding model, and the ONE thing that fixes the vector column's width.**
 *
 * PROBED LIVE on 2026-09-15, not assumed — the plan set's own exit criterion, and the same posture
 * `NINA_CHAT_FALLBACK_MODEL_IDS` records for `nvidia/nemotron-3.5-lightning`. The probe's raw
 * reading:
 *
 *     POST https://openrouter.ai/api/v1/embeddings
 *     { model: 'openai/text-embedding-3-small', input: 'A woman in a red jacket standing on a
 *       mountain trail at sunrise.', encoding_format: 'float' }
 *     -> 200, data[0].embedding.length = 1536, every element finite,
 *        usage = {"prompt_tokens":14,"total_tokens":14,"cost":2.8e-7}
 *
 * **Not admin-configurable, and it cannot become so without a migration.** The chat fallback got a
 * dropdown (see the header) because swapping a chat model changes only the prose. Swapping THIS
 * model changes the width of `nina_avatars.description_embedding` and invalidates every vector
 * already stored — two different models do not share an embedding space, so a mixed column ranks
 * nonsense. Changing it is: a new dimension constant, a new migration, and a full re-embed of the
 * album. A dropdown would be a control that silently corrupts a ranking.
 *
 * **Bounded above at 2000 dimensions by pgvector**, which is why a bigger model is not simply
 * better here: HNSW refuses to index a wider column, and the index is declared in
 * `lib/db/schema/nina/avatars.ts`. See `NINA_EMBEDDING_DIMENSIONS` there.
 */
export const NINA_EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/**
 * **The photo-description fallback, and the ONLY model this file still hardcodes.**
 *
 * Chosen because it is natively multimodal — text, image and video in, text out, per
 * `openrouter.ai/z-ai/glm-5.3-flash` — unlike the text-only `glm-5.2`/`glm-5.3`. `lib/nina/vision.ts`
 * sends an `image_url` part on this path, which is what a chat-fallback dropdown's candidates are
 * not required to accept (see the header). Not admin-configurable: an operator who repoints this to
 * a text-only model would turn "her eyes failed on that one" into every photo, silently.
 */
export const NINA_VISION_FALLBACK_MODEL = 'z-ai/glm-5.3-flash'

/**
 * **The chat-turn fallback's closed vocabulary — the 2026-09-14 ask.**
 *
 * A CLOSED list, not a free-text id, for `lib/llm/catalog.ts`'s own reason: an unknown id must
 * degrade toward the verified default at the read, never reach the provider and fail after the
 * turn is already half-spent. A new candidate is a code change plus a probe.
 *
 * `z-ai/glm-5.3-flash` is kept as an option even though it is the SAME vendor the primary z.ai
 * path already calls — R1's original shape, still useful when the primary fails FAST (a bad
 * credential, a connection reset) rather than hanging. `nvidia/nemotron-3.5-lightning` is the
 * 2026-09-14 addition: probed live the same day z.ai's `glm-5.3-flash` was measured timing out on
 * BOTH its direct endpoint and this exact OpenRouter route for two hours straight (`nina_error_logs`,
 * 07:40–09:38 UTC) — a genuinely different model, not just a different route to the same one. Live
 * probe: forced-tool-choice calls answered in 570–610 ms with `reasoning_tokens: 0` (its `reasoning`
 * is NOT mandatory, unlike `z-ai/glm-5.3-flash`'s), and it is text->text only, which is exactly what
 * the chat path needs and nothing more.
 */
export const NINA_CHAT_FALLBACK_MODEL_IDS = [
  'z-ai/glm-5.3-flash',
  'nvidia/nemotron-3.5-lightning',
] as const

export type NinaChatFallbackModelId = (typeof NINA_CHAT_FALLBACK_MODEL_IDS)[number]

/**
 * **The degrade target — an absent or unreadable `app_settings` row, or a value outside the
 * catalog, all land here.** `nvidia/nemotron-3.5-lightning` and not the z.ai-family option: the
 * incident that motivated this split was the z.ai-family route failing too, so shipping with the
 * genuinely different model as the default is the point, not a leftover of whichever was added
 * last.
 */
export const NINA_CHAT_FALLBACK_DEFAULT_MODEL: NinaChatFallbackModelId =
  'nvidia/nemotron-3.5-lightning'

interface NinaChatFallbackModelSpec {
  readonly id: NinaChatFallbackModelId
  /** The dropdown's label. Sentence case, the provider's product name. */
  readonly label: string
  /** One line under the dropdown: what the choice trades. */
  readonly hint: string
}

export const NINA_CHAT_FALLBACK_MODEL_SPECS: Readonly<
  Record<NinaChatFallbackModelId, NinaChatFallbackModelSpec>
> = Object.freeze({
  'nvidia/nemotron-3.5-lightning': Object.freeze({
    id: 'nvidia/nemotron-3.5-lightning',
    label: 'Nemotron 3.5 Lightning',
    hint:
      'The default. A different vendor entirely — survives a z.ai-wide outage, not just a single ' +
      'endpoint.',
  }),
  'z-ai/glm-5.3-flash': Object.freeze({
    id: 'z-ai/glm-5.3-flash',
    label: 'GLM 5.3 Flash (via OpenRouter)',
    hint:
      'Same model family as the primary, a different route. Rescues a fast z.ai failure; will not ' +
      'help while glm-5.3-flash itself is degraded everywhere.',
  }),
})
