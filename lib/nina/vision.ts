import 'server-only'

import { env } from '@/lib/env'
import { NINA_CHAT_CONTENT_TYPE } from './images'
import {
  NINA_DESCRIBE_SYSTEM_PROMPT,
  buildDescribeUserContent,
  type NinaDescribeImage,
  type NinaVisionContentPart,
} from './prompts/describe'

/**
 * Nina's eyes: one `glm-4.6v` call that turns a photo into a paragraph.
 *
 * One `fetch`, no SDK, exactly as `lib/llm/vision.ts` does it and for exactly the same reason
 * (roadmap §3): `@anthropic-ai/sdk` cannot be pointed at this endpoint, whose envelope is OpenAI
 * Chat Completions with `{ type: 'image_url', image_url: { url } }` image parts rather than
 * Anthropic's `{ type: 'image', source: {…} }`.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TOKEN-FLOOR GUARD LIVES HERE TOO, AND IT IS NOT A COPY OF F04's.
 *  `lib/llm/vision.ts`'s floor is `500 x imageCount`, flat. That works there because its
 *  measurement — 141 prompt_tokens for a whole dropped-image request, IMPLEMENTATION_PLAN.md
 *  §1.1 — was taken with a short probe prompt. `prompt_tokens` counts the SYSTEM PROMPT, and
 *  this module's system prompt is ~3,300 characters. A dropped image here would report ~1,000
 *  prompt tokens and clear a flat floor of 500 without a murmur.
 *
 *  So the floor is TEXT-AWARE: the text we actually sent, estimated at a deliberately
 *  pessimistic 3 chars/token, PLUS 500 per image. Read the phase-6 plan's Step 3 before
 *  touching it.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * MEASURED, and ported verbatim from `lib/llm/vision.ts`'s `TOKEN_FLOOR_PER_IMAGE` with its
 * reasoning intact. 500 sits 3.4x above the observed 141-token drop signature. A 768 px chat photo
 * costs ~1,700 input tokens — a wider margin than F04's 1,092, so if 500 is right there it is
 * right here.
 *
 * MULTIPLIED by the image count, and the multiplication is load-bearing: a flat floor would let a
 * 3-image request with only one image actually delivered slip straight through. This phase always
 * sends one, and the multiplication stays anyway, for whoever sends three.
 */
export const NINA_TOKEN_FLOOR_PER_IMAGE = 500

/**
 * Characters per token, for the TEXT half of the floor only. Real BPE on English/Indonesian prose
 * runs nearer 4; 3 over-estimates the text term on purpose, which raises the floor and therefore
 * errs toward "I could not see it" rather than toward believing an invented description. That is
 * the correct direction: the degraded path asks him what the photo is, and the other direction
 * puts words in Nina's mouth about a picture she never received.
 */
export const NINA_DESCRIBE_CHARS_PER_TOKEN = 3

/** 60-140 words plus slack. Not a target; the prompt sets the length. */
export const NINA_DESCRIBE_MAX_TOKENS = 500

/**
 * MEASURED-DERIVED. F04 measured this vendor at ~26-33 ms per completion token with ~2-3 s of
 * fixed overhead. ~220 output tokens is therefore ~8-11 s. 25 s covers the tail with room, and it
 * is affordable because this call runs in its OWN invocation, concurrently with the runner
 * typing — never inside `sendNinaMessage`. See the phase-6 plan's latency verdict.
 */
export const NINA_DESCRIBE_TIMEOUT_MS = 25_000

/** A ~200 KB GET from a CDN in the same region. If Blob is slower than this, describing is moot. */
export const NINA_BLOB_FETCH_TIMEOUT_MS = 8_000

/**
 * The guard tripped: the response reported so little input that the image cannot have reached the
 * model. Its own class because it is the ONE failure that must never be recovered from by
 * retrying, rephrasing, or trusting the text — the text is exactly where the invention is.
 */
export class NinaVisionTokenFloorError extends Error {
  constructor(
    readonly promptTokens: number,
    readonly floor: number,
    readonly imageCount: number,
  ) {
    super(
      `nina describe reported prompt_tokens=${promptTokens} for ${imageCount} image(s); ` +
        `expected >= ${floor}. The endpoint may have silently dropped the image ` +
        `(IMPLEMENTATION_PLAN.md §1.1) — refusing to hand Nina a description that may have ` +
        `been invented.`,
    )
    this.name = 'NinaVisionTokenFloorError'
  }
}

/** Network failure, timeout, non-JSON body, empty completion, or a non-200 that cleared the floor. */
export class NinaVisionTransportError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'NinaVisionTransportError'
  }
}

/** A blob this phase already owns a row for, or is about to. */
export interface NinaImageRef {
  blobUrl: string
  pathname: string
}

export interface NinaDescribeResult {
  /** The description. Trimmed, never empty — an empty completion throws instead. */
  description: string
  promptTokens: number
  completionTokens: number
  /** The floor this response was measured against, for the log line. */
  floor: number
  finishReason: string | null
}

export interface NinaDescribeOptions {
  timeoutMs?: number
}

type FetchLike = typeof fetch

type Message =
  { role: 'system'; content: string } | { role: 'user'; content: NinaVisionContentPart[] }

/** Pure. Exported so the floor arithmetic is unit-testable without a request. */
export function estimateTextTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars < 0) return 0
  return Math.ceil(chars / NINA_DESCRIBE_CHARS_PER_TOKEN)
}

/** Pure, and the whole of the guard's arithmetic. See the module header. */
export function describeTokenFloor(promptChars: number, imageCount: number): number {
  return estimateTextTokens(promptChars) + NINA_TOKEN_FLOOR_PER_IMAGE * imageCount
}

/**
 * How many characters of TEXT this request carries. Data URIs are excluded deliberately: they are
 * not tokenised as text, and counting them would inflate the floor past any real response.
 */
function textCharsOf(messages: readonly Message[]): number {
  let chars = 0
  for (const message of messages) {
    if (typeof message.content === 'string') {
      chars += message.content.length
      continue
    }
    for (const part of message.content) {
      if (part.type === 'text') chars += part.text.length
    }
  }
  return chars
}

/**
 * The injectable core. Production reaches it through `describeNinaImages`; the unit suite hands it
 * a fake `fetch` returning the measured drop signature and never touches the network. DI at
 * exactly this seam for the reason `lib/llm/vision.ts` gives: this module is `server-only` and
 * reads `@/lib/env`, so a fake `fetch` is the only honest way to test the guard.
 */
export async function describeNinaImagesWithFetch(
  fetchImpl: FetchLike,
  images: readonly NinaDescribeImage[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  if (images.length < 1) throw new Error('describeNinaImages expects at least one image')

  const messages: Message[] = [
    { role: 'system', content: NINA_DESCRIBE_SYSTEM_PROMPT },
    { role: 'user', content: buildDescribeUserContent(images) },
  ]
  const floor = describeTokenFloor(textCharsOf(messages), images.length)

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
        max_tokens: NINA_DESCRIBE_MAX_TOKENS,
        // MEASURED by F04: thinking mode doubles latency for an identical score. There is no
        // trade to make. Kept for the same reason `lib/llm/vision.ts` keeps it, and noting the
        // plan index's correction: this endpoint may emit a thinking block anyway, which costs
        // output tokens and is why `max_tokens` has slack.
        thinking: { type: 'disabled' },
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? NINA_DESCRIBE_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new NinaVisionTransportError('nina describe request failed or timed out', cause)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (cause) {
    throw new NinaVisionTransportError('nina describe response was not valid JSON', cause)
  }

  const body = json as {
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const promptTokens = body.usage?.prompt_tokens ?? 0
  const completionTokens = body.usage?.completion_tokens ?? 0

  /* ══ THE TOKEN-FLOOR GUARD ══════════════════════════════════════════════════════════════
   * ABOVE every read of `choices`, because it GATES parsing rather than validating alongside
   * it. Nothing downstream — not the ticket signer, not the row, not Nina's prompt — is allowed
   * to see the text of a response that fails this check, because that text is exactly where an
   * invented description would be. Never move this below the return.
   * ═════════════════════════════════════════════════════════════════════════════════════ */
  if (promptTokens < floor) {
    throw new NinaVisionTokenFloorError(promptTokens, floor, images.length)
  }

  // Checked AFTER the floor on purpose: when a response is both non-200 and below the floor, the
  // floor is the more actionable diagnosis — and F04's measured failure was itself a 200.
  if (!res.ok) {
    throw new NinaVisionTransportError(
      `nina describe endpoint returned ${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
    )
  }

  const choice = body.choices?.[0]
  const description = (choice?.message?.content ?? '').trim()
  if (description.length === 0) {
    throw new NinaVisionTransportError('nina describe returned an empty completion')
  }

  return {
    description,
    promptTokens,
    completionTokens,
    floor,
    finishReason: choice?.finish_reason ?? null,
  }
}

/**
 * Fetch the blob back out and re-encode it as a base64 data URI.
 *
 * A data URI, not the hosted Blob URL, even though the bytes are already on a public CDN — the
 * same ruling `lib/llm/runExtractionJob.ts`'s `toDataUri` makes and for the same reason: a
 * `url:`-only `image_url` has never been probed against this endpoint, and on this vendor an
 * untested request shape is not something to trust when the failure mode is "200 OK with invented
 * content".
 */
async function toDataUri(ref: NinaImageRef, signal: AbortSignal): Promise<NinaDescribeImage> {
  const res = await fetch(ref.blobUrl, { signal, cache: 'no-store' })
  if (!res.ok) throw new NinaVisionTransportError(`blob fetch ${res.status} for ${ref.pathname}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new NinaVisionTransportError(`blob ${ref.pathname} was empty`)
  }
  // The compressor always emits JPEG and the upload route allows only image/jpeg, so the media
  // type is known rather than sniffed.
  return { dataUri: `data:${NINA_CHAT_CONTENT_TYPE};base64,${bytes.toString('base64')}` }
}

/**
 * Production: fetch the bytes, then describe them.
 *
 * ONE IMAGE PER CALL in this phase, and that is the guard design as much as the latency one:
 * `imageCount` is 1, so a single dropped image is a single failed request rather than one weak
 * signal inside a batch. The array parameter is real — phase 15 reuses this function unchanged for
 * the avatar pre-pass — and `NINA_DESCRIBE_REQUEST_TEXT_MANY` exists for whoever batches.
 */
export async function describeNinaImages(
  refs: readonly NinaImageRef[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  const images = await Promise.all(
    refs.map((ref) => toDataUri(ref, AbortSignal.timeout(NINA_BLOB_FETCH_TIMEOUT_MS))),
  )
  return describeNinaImagesWithFetch(fetch, images, opts)
}
