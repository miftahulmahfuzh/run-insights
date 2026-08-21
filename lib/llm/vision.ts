import 'server-only'

import { env } from '@/lib/env'
import type { ScreenKind } from '@/lib/extract/constants'
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserContent,
  buildRepairNote,
  buildRepairRequestText,
  type PromptImage,
  type VisionContentPart,
} from './prompts/extraction'

/**
 * The `glm-4.6v` client. One `fetch`, no SDK (roadmap §3): `@anthropic-ai/sdk` cannot be pointed
 * at this endpoint — the request envelope is OpenAI Chat Completions, where an image part is
 * `{ type: 'image_url', image_url: { url } }`, not Anthropic's
 * `{ type: 'image', source: { type: 'base64', … } }`. Bending the SDK into that shape buys
 * nothing.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TOKEN-FLOOR GUARD (D3) LIVES IN THIS FILE. It is the highest-value code in the repo.
 *  Read `docs/plans/F04-ingest-extraction.md` §1 before changing anything below.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * MEASURED, both sides. `IMPLEMENTATION_PLAN.md` §1.1 recorded the Anthropic-shaped endpoint
 * accepting an image block, answering **HTTP 200**, silently dropping the image, and reporting
 * **141 prompt_tokens for the whole request** — then inventing "Distance: 5.00 km, Avg Pace:
 * 05:00/km" for a run that was actually 10.67 km at 7'22"/km. No error field, no warning.
 *
 * A real 560w/q80 screenshot costs ~1,092 input tokens (3,277 for three, §3). So 500 per image
 * sits 3.4× above the observed drop signature and more than 2× below the real cost of one image.
 * There is no plausible real image in that gap and no plausible dropped-image response above it.
 *
 * Multiplying by the image count is load-bearing: a flat floor of, say, 800 would let a 3-image
 * request with only one image actually delivered slip straight through.
 */
export const TOKEN_FLOOR_PER_IMAGE = 500

/** MEASURED sufficient for the full 108-field JSON; the observed completion is ~950 tokens. */
const MAX_TOKENS = 4096

/**
 * The guard tripped: the response reported so few input tokens that the images cannot have
 * reached the model. Distinguished from every other failure because it is the ONE class that
 * must never be repaired — see `extract.ts`.
 */
export class VisionTokenFloorError extends Error {
  constructor(
    readonly promptTokens: number,
    readonly imageCount: number,
  ) {
    super(
      `vision response reported prompt_tokens=${promptTokens} for ${imageCount} image(s); ` +
        `expected >= ${TOKEN_FLOOR_PER_IMAGE * imageCount}. The endpoint may have silently ` +
        `dropped the image(s) (IMPLEMENTATION_PLAN.md §1.1) — refusing to parse a response ` +
        `that may have invented its numbers.`,
    )
    this.name = 'VisionTokenFloorError'
  }
}

/** Network failure, timeout, non-JSON body, or a non-200 that cleared the floor. */
export class VisionTransportError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'VisionTransportError'
  }
}

export interface VisionResult {
  text: string
  promptTokens: number
  completionTokens: number
  finishReason: string | null
  /** The exact vendor body, stored in `extractions.raw_response` for the audit trail. */
  raw: unknown
}

type FetchLike = typeof fetch

type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | VisionContentPart[] }
  | { role: 'assistant'; content: string }

interface CallOptions {
  timeoutMs: number
  /**
   * How many images this request actually carries. **The token floor is
   * `TOKEN_FLOOR_PER_IMAGE × imageCount`, so a text-only request passes `0` and is not floored
   * at all — that is R-2's corollary, not an oversight.** A text-only repair legitimately reports
   * a few hundred prompt tokens; asserting the image floor there would fail every repair.
   */
  imageCount: number
}

/**
 * The injectable core. Production reaches it through `callVisionPrimary` / `callVisionRepair`;
 * the unit suite calls it with a fake `fetch` and never touches the network.
 *
 * DI at exactly this seam, matching `expense-tracking/lib/llm/parseExpense.ts`'s `LlmClientLike`,
 * for the same reason: this module opens with `import 'server-only'` and reads `@/lib/env`, so
 * the only honest way to test the guard is to hand it a `fetch` that returns the measured
 * failure body.
 */
export async function callVisionWithFetch(
  fetchImpl: FetchLike,
  messages: Message[],
  opts: CallOptions,
): Promise<VisionResult> {
  let res: Response
  try {
    res = await fetchImpl(`${env.LLM_VISION_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // R-40: one z.ai key serves both endpoints. There is no LLM_VISION_API_KEY.
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_VISION_MODEL,
        max_tokens: MAX_TOKENS,
        // MEASURED: thinking mode doubles latency (73 s vs 33.7 s) for an IDENTICAL 108/108
        // score. There is no accuracy trade to make here — it is pure waste. Never remove.
        thinking: { type: 'disabled' },
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (cause) {
    throw new VisionTransportError('vision request failed or timed out', cause)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (cause) {
    throw new VisionTransportError('vision response was not valid JSON', cause)
  }

  const body = json as {
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const promptTokens = body.usage?.prompt_tokens ?? 0
  const completionTokens = body.usage?.completion_tokens ?? 0

  /* ══ THE TOKEN-FLOOR GUARD ══════════════════════════════════════════════════════════════
   * It sits here, above every read of `choices`, because it GATES parsing rather than
   * validating alongside it. Nothing downstream — not the JSON extractor, not Zod, not the
   * review screen — is allowed to see the text of a response that fails this check, because
   * that text is exactly where the invented numbers are. Never move this below the return.
   * ═════════════════════════════════════════════════════════════════════════════════════ */
  if (promptTokens < TOKEN_FLOOR_PER_IMAGE * opts.imageCount) {
    throw new VisionTokenFloorError(promptTokens, opts.imageCount)
  }

  // Checked AFTER the floor on purpose: when a response is both non-200 and below the floor,
  // the floor is the more actionable diagnosis — and the measured failure was itself a 200.
  if (!res.ok) {
    throw new VisionTransportError(
      `vision endpoint returned ${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
    )
  }

  const choice = body.choices?.[0]
  return {
    text: choice?.message?.content ?? '',
    promptTokens,
    completionTokens,
    finishReason: choice?.finish_reason ?? null,
    raw: json,
  }
}

/** The 1–3 image call. This is the one the token floor exists for. */
export function callVisionPrimaryWithFetch(
  fetchImpl: FetchLike,
  images: PromptImage[],
  opts: { timeoutMs: number },
): Promise<VisionResult> {
  if (images.length < 1 || images.length > 3) {
    throw new Error(`callVisionPrimary expects 1-3 images, got ${images.length}`)
  }
  return callVisionWithFetch(
    fetchImpl,
    [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractionUserContent(images) },
    ],
    { timeoutMs: opts.timeoutMs, imageCount: images.length },
  )
}

/**
 * The **text-only** repair (R-2 / D17). No image parts anywhere in the message array, and
 * therefore `imageCount: 0` — the floor is not asserted, by ruling.
 *
 * `kinds` is passed so the repair can restate which screens the original request contained,
 * keeping rule 8 in force without resending a single byte of image data.
 */
export function callVisionRepairWithFetch(
  fetchImpl: FetchLike,
  input: { kinds: ScreenKind[]; malformedText: string; issues: string },
  opts: { timeoutMs: number },
): Promise<VisionResult> {
  return callVisionWithFetch(
    fetchImpl,
    [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: buildRepairRequestText(input.kinds) },
      { role: 'assistant', content: input.malformedText },
      { role: 'user', content: buildRepairNote(input.issues) },
    ],
    { timeoutMs: opts.timeoutMs, imageCount: 0 },
  )
}

export function callVisionPrimary(
  images: PromptImage[],
  opts: { timeoutMs: number },
): Promise<VisionResult> {
  return callVisionPrimaryWithFetch(fetch, images, opts)
}

export function callVisionRepair(
  input: { kinds: ScreenKind[]; malformedText: string; issues: string },
  opts: { timeoutMs: number },
): Promise<VisionResult> {
  return callVisionRepairWithFetch(fetch, input, opts)
}
