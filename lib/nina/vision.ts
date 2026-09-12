import 'server-only'

import { env, ninaEnv } from '@/lib/env'
import { logNinaError } from './errorlogs'
import { NINA_CHAT_CONTENT_TYPE } from './images'
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from './openrouter'
import {
  NINA_DESCRIBE_SYSTEM_PROMPTS,
  buildDescribeUserContent,
  type NinaDescribeImage,
  type NinaDescribeSubject,
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
 *  pessimistic 3 chars/token, PLUS the per-image floor below (`NINA_TOKEN_FLOOR_PER_IMAGE` —
 *  measured, and re-calibrated on 2026-09-09; read its note and the phase-6 plan's Step 3 before
 *  touching either).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * MEASURED, and re-calibrated on 2026-09-09 after a false trip. The original 500 was ported
 * verbatim from `lib/llm/vision.ts`'s flat floor on the argument that a 768 px chat photo costs
 * ~1,700 input tokens, so a 3.4x margin was harmless there. It was not harmless HERE, because this
 * floor is TEXT-AWARE: with the text term already covering the prompt, the per-image term's only
 * job is to be positive — a DROPPED image contributes zero image tokens, so any positive constant
 * detects it, while a constant sized to a 768 px photo outlaws smaller real ones. And small ones
 * reach this code un-resized: `longEdgeTargetFor` never downscales a source whose short edge is
 * already under target.
 *
 * The arrival card of 2026-09-08 (`nina_message_images` Jv4VMDMao31j, 612×862) reported 1,559
 * prompt tokens against a 1,649 floor and was refused as "dropped" while demonstrably delivered —
 * the same card upscaled to short edge 768 scored 1,930 and the model read back every field on it.
 * Image tokens run ~pixels/1,100, so 500 per image drew the break-even at ~640 px of short edge,
 * and every photo under it got Nina's "your eyes failed" routine no matter how legible it was.
 *
 * 150 keeps the drop signature caught — 0 image tokens still fails by 150 — and passes real photos
 * down to roughly a 350 px short edge. MULTIPLIED by the image count, and the multiplication stays
 * load-bearing: a 3-image request with only one image actually delivered must still fail.
 */
export const NINA_TOKEN_FLOOR_PER_IMAGE = 150

/**
 * Characters per token, for the TEXT half of the floor only. Real BPE on English/Indonesian prose
 * runs nearer 4; 3 over-estimates the text term on purpose, which raises the floor and therefore
 * errs toward "I could not see it" rather than toward believing an invented description. That is
 * the correct direction: the degraded path asks him what the photo is, and the other direction
 * puts words in Nina's mouth about a picture she never received.
 */
const NINA_DESCRIBE_CHARS_PER_TOKEN = 3

/** 60-140 words plus slack. Not a target; the prompt sets the length. */
const NINA_DESCRIBE_MAX_TOKENS = 500

/**
 * MEASURED-DERIVED. F04 measured this vendor at ~26-33 ms per completion token with ~2-3 s of
 * fixed overhead. ~220 output tokens is therefore ~8-11 s. 25 s covers the tail with room, and it
 * is affordable because this call runs in its OWN invocation, concurrently with the runner
 * typing — never inside `sendNinaMessage`. See the phase-6 plan's latency verdict.
 */
export const NINA_DESCRIBE_TIMEOUT_MS = 25_000

/** A ~200 KB GET from a CDN in the same region. If Blob is slower than this, describing is moot. */
const NINA_BLOB_FETCH_TIMEOUT_MS = 8_000

/**
 * **The OpenRouter fallback's own ceiling, and it is NOT `NINA_DESCRIBE_TIMEOUT_MS`.**
 *
 * 25 s is a MEASURED-DERIVED number for z.ai's coding endpoint specifically (see
 * `NINA_DESCRIBE_TIMEOUT_MS` above: ~26-33 ms per completion token plus 2-3 s of fixed overhead).
 * OpenRouter is a broker — it selects an upstream provider per request and proxies the stream — so
 * it carries a routing hop the direct z.ai call does not, and reusing a constant derived from a
 * different vendor's measurement would be borrowing a number that was never taken here. 30 s is
 * that 25 s plus headroom for the hop; it is a CEILING, not a target, and nothing is slower for it.
 *
 * **The budget this spends is affordable, and the arithmetic is worth spelling out.** This ceiling
 * only ever binds AFTER the primary attempt already failed, so the worst case for one photo is
 * 25 s + 30 s = 55 s. The describe call runs in its OWN invocation (`describeNinaImage` is its own
 * Server Action, never inside `sendNinaMessage` and never inside `runNinaTurn`'s 45 s budget), under
 * a route segment `maxDuration` of 300 s. The composer's three-photo path describes SERIALLY
 * (`lib/nina/actions.ts:1578-1592`), so a total z.ai outage makes that path ~165 s of spinner
 * instead of ~33 s — slow, visibly in-progress, and still inside the segment ceiling. The
 * alternative on that path is three photos Nina cannot see at all, which is the outcome this whole
 * phase exists to stop.
 *
 * Deliberately NOT `opts.timeoutMs`: that option is the caller's override for the z.ai attempt and
 * no caller in the repo passes it today. Honouring a z.ai-shaped override on a different provider's
 * request would silently re-import the calibration problem this constant exists to avoid.
 */
export const NINA_DESCRIBE_FALLBACK_TIMEOUT_MS = 30_000

/**
 * **Higher than `NINA_DESCRIBE_MAX_TOKENS`, and the slack is the whole point.**
 *
 * The z.ai request sends `thinking: { type: 'disabled' }` — a z.ai vendor extension — and even
 * there `max_tokens` carries slack because the endpoint may emit a thinking block anyway. The
 * fallback request sends NO reasoning-control field at all: this module's standing rule is that an
 * unprobed request shape is not something to trust against a vendor whose failure mode is "200 OK
 * with invented content" (see `toDataUri`'s note on why a `url:`-only `image_url` is refused), and
 * OpenRouter's reasoning controls have never been probed from this codebase. So the reasoning
 * preamble is BUDGETED FOR rather than suppressed: 900 leaves ~400 tokens of head-room over the
 * 60-140 word paragraph the prompt asks for, which is what stops a preamble from consuming the
 * budget and handing back an empty completion that the non-empty check would then reject.
 */
const NINA_DESCRIBE_FALLBACK_MAX_TOKENS = 900

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
  /**
   * Whose photograph this is. **Defaults to `'runner'`** — the composer pre-pass
   * (`describeNinaImage`, his uploads) and the runner-side media describe pass the default or
   * `'runner'` explicitly; every caller that describes a photograph OF NINA — the album's button
   * and its `after()` pass, and the chat-photo caption pass — passes `'self'` (R3, 2026-09-10;
   * until then the album paths pointed the runner prompt at her faces). Pick it with
   * `describeSubjectForSide` (`lib/nina/album.ts`), which owns the mapping from `photoSideOf` —
   * do not spell the ternary at a call site.
   *
   * `'self'` selects `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`. It is a different SUBJECT, not a
   * different mode: the request shape, the data URI, the timeout and the floor are all the same,
   * which is why this is one option rather than a second function.
   */
  subject?: NinaDescribeSubject
  /**
   * **The photo's hosted Blob URL, for the failure log's image column only. Never sent to a model.**
   *
   * `describeNinaImages` fills this in from `refs[0].blobUrl`, so no caller has to pass it and no
   * existing call-site test pin changes. It exists as an option because the injectable core takes
   * data URIs and a `data:` URI is not something to put in a database row or hand to an admin
   * viewer — the model is sent the bytes, the log row is sent the link.
   *
   * One URL for what may be several images, deliberately: this path is ONE IMAGE PER CALL in
   * production (see `describeNinaImages`' header) and a multi-image batch would need a log schema
   * with a link list, which R2 did not ask for.
   */
  imageUrl?: string
  /**
   * Who this describe call belongs to, for the failure log's `user_id` column. **Nothing supplies
   * it today and that is intentional**, not an omission: the five production callers pin their
   * exact `(refs, { subject })` arguments in three test suites, and this phase does not rewrite
   * those pins to carry an id the failure log does not require. `nina_error_logs.user_id` is
   * nullable for exactly this reason. The option exists so a caller that HAS the id can hand it
   * over without another signature change.
   */
  userId?: string
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
    /* The floor is TEXT-AWARE (see the module header), so it is computed from `messages` AFTER the
     * prompt is chosen. The self prompt is longer than the runner one; that raises the floor, which
     * errs toward "I could not see it" rather than toward believing an invented description — the
     * direction the header says is correct. No constant needs touching for a new prompt. */
    { role: 'system', content: NINA_DESCRIBE_SYSTEM_PROMPTS[opts.subject ?? 'runner'] },
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
 * **What the admin log stores as "full input" — the real payload, minus the base64.**
 *
 * Pure, and exported so `vision.test.ts` can assert the one property that matters: no data URI ever
 * reaches a database row. A chat photo is ≤ 900 KB, which is ~1.2 MB of base64 per image; putting
 * that in a `text` column would make the Error Logs page unloadable and would store the same bytes
 * a second time next to the Blob that already holds them.
 *
 * Everything else IS the real thing — the exact system prompt variant that was chosen and the exact
 * fixed instruction `buildDescribeUserContent` appends — because R2's "full input" means what the
 * model was actually shown, not a summary of it. The image parts are kept in place, in order, with
 * the URI replaced by a marker, so an admin reading the row can see the message really did carry an
 * image block and where it sat.
 */
export function describeLogInput(subject: NinaDescribeSubject, imageCount: number): string {
  const placeholders: NinaDescribeImage[] = Array.from({ length: imageCount }, () => ({
    dataUri: '<data: URI omitted — see the image link on this row>',
  }))
  return JSON.stringify(
    {
      system: NINA_DESCRIBE_SYSTEM_PROMPTS[subject],
      user: buildDescribeUserContent(placeholders),
      imageCount,
    },
    null,
    2,
  )
}

/**
 * **What the admin log stores as "full LLM error message".**
 *
 * Pure, exported for the test. `String(cause)` alone would render
 * `NinaVisionTokenFloorError: nina describe reported prompt_tokens=141 ...` and throw away the
 * three fields that make a floor trip diagnosable — and `NinaVisionTransportError` carries a
 * `detail` (the thrown cause, or the response snippet) that `String()` never reaches at all. The
 * one row an admin opens six weeks later has to answer "which failure was this" without a redeploy.
 *
 * The timeout is NOT concatenated here. It rides in `nina_error_logs.timeout_ms` as its own column
 * (per the analysis's schema) and Phase 5 renders the two together — one value, one place, formatted
 * once.
 */
export function describeErrorText(cause: unknown): string {
  if (cause instanceof NinaVisionTokenFloorError) {
    return (
      `${cause.name}: ${cause.message} ` +
      `[promptTokens=${cause.promptTokens} floor=${cause.floor} imageCount=${cause.imageCount}]`
    )
  }
  if (cause instanceof NinaVisionTransportError) {
    return cause.detail === undefined
      ? `${cause.name}: ${cause.message}`
      : `${cause.name}: ${cause.message} — detail: ${String(cause.detail)}`
  }
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  return String(cause)
}

/**
 * One `nina_error_logs` row for one failed attempt. **It never throws and it never rejects.**
 *
 * Plan invariant: a failure to write the log must never affect the outer call's own
 * success/failure — the same contract, and the same `try { … } catch { console.warn(…) }` idiom,
 * that `runNinaTurn` already applies to `deps.store.record`. `logNinaError` is itself specified as
 * best-effort by phase 1; this second catch is not redundant, it is the guarantee held at the place
 * that depends on it, so a phase-1 regression cannot cost a runner his photo description.
 */
async function recordDescribeFailure(entry: {
  provider: 'zai' | 'openrouter'
  model: string
  timeoutMs: number
  cause: unknown
  imageCount: number
  opts: NinaDescribeOptions
}): Promise<void> {
  try {
    await logNinaError({
      category: 'multimodal',
      provider: entry.provider,
      model: entry.model,
      fullInput: describeLogInput(entry.opts.subject ?? 'runner', entry.imageCount),
      errorMessage: describeErrorText(entry.cause),
      timeoutMs: entry.timeoutMs,
      imageUrl: entry.opts.imageUrl ?? null,
      userId: entry.opts.userId ?? null,
    })
  } catch (cause) {
    console.warn('[nina] could not record a describe failure', {
      provider: entry.provider,
      error: String(cause),
    })
  }
}

/**
 * **The fallback attempt: the same request, a different door.**
 *
 * NO TRANSLATION LAYER, and that is not an oversight — z.ai's vision endpoint and OpenRouter's chat
 * endpoint are BOTH OpenAI Chat Completions. Same `messages` array, same
 * `{ type: 'image_url', image_url: { url } }` parts, same `choices[0].message.content` on the way
 * back. Only the URL, the credential, the model id and the two ceilings differ. (Phase 2's text
 * fallback is the opposite case and needs a full Anthropic⇄OpenAI translation, which is why it is a
 * separate, harder phase.)
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TOKEN FLOOR IS NOT APPLIED HERE, AND THAT IS A DECISION, NOT AN OMISSION.
 *
 *  `describeTokenFloor()` is calibrated for `glm-4.6v` SPECIFICALLY. `NINA_TOKEN_FLOOR_PER_IMAGE`
 *  was re-calibrated on 2026-09-09 from 500 to 150 after a real false trip — a measured 612x862
 *  arrival card (`nina_message_images` Jv4VMDMao31j) reported 1,559 prompt tokens against a 1,649
 *  floor and was refused as "dropped" while demonstrably delivered, because the constant had been
 *  sized to one vendor's tokens-per-pixel behaviour at one resolution. Read the note on that
 *  constant: the number is a MEASUREMENT of a specific model, not a property of images.
 *
 *  `z-ai/glm-5.3-flash` behind OpenRouter is a different model on a different route, and nobody has
 *  measured its prompt-token accounting for an image. Pointing a measured-elsewhere floor at it
 *  would be repeating 2026-09-09's mistake with a fresh unknown — and it would repeat it in the
 *  worst possible place, because this path only ever runs when the primary already failed. A false
 *  trip here converts a recoverable outage back into the undescribed photo the fallback exists to
 *  prevent.
 *
 *  So the fallback's acceptance test is the plain one that guards every other response in this
 *  file: a non-empty trimmed completion. The floor's real job — "the endpoint answered 200 and
 *  silently dropped the image" — is still fully guarded on the PRIMARY path, which is where it was
 *  measured and where it has always run. `NinaDescribeResult.floor` comes back as 0 on this path,
 *  which is the honest value: no floor was applied, and the log line says so.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */
async function describeNinaImagesWithOpenRouter(
  fetchImpl: FetchLike,
  images: readonly NinaDescribeImage[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  if (images.length < 1) throw new Error('describeNinaImages expects at least one image')

  const messages: Message[] = [
    { role: 'system', content: NINA_DESCRIBE_SYSTEM_PROMPTS[opts.subject ?? 'runner'] },
    { role: 'user', content: buildDescribeUserContent(images) },
  ]

  /*
   * Read INSIDE the function and inside a `try`, exactly as `lib/nina/imagecall.ts:212-223` does and
   * for the same reason: `ninaEnv()` is a lazy zod group that THROWS when its member is absent, and
   * the analysis measured production once carrying neither of the two it used to hold. A module-
   * scope read here would make a missing key an import-time crash of the whole vision module —
   * which would take the WORKING z.ai path down with it. A missing key must cost the fallback and
   * nothing else.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly would pass
   * the grep and break the invariant it stands for — app code reads secrets through `lib/env.ts`.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    throw new NinaVisionTransportError(
      'nina describe fallback is not configured (no OPENROUTER_API_KEY)',
      cause,
    )
  }

  let res: Response
  try {
    res = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NINA_FALLBACK_TEXT_MODEL,
        max_tokens: NINA_DESCRIBE_FALLBACK_MAX_TOKENS,
        /* No `thinking` field. That is a z.ai vendor extension; this is not z.ai's endpoint, and an
         * unprobed field on a vendor whose failure mode is "200 OK with invented content" is not
         * something this module sends. `NINA_DESCRIBE_FALLBACK_MAX_TOKENS` budgets for a reasoning
         * preamble instead of trying to suppress one. */
        messages,
      }),
      signal: AbortSignal.timeout(NINA_DESCRIBE_FALLBACK_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new NinaVisionTransportError('nina describe fallback request failed or timed out', cause)
  }

  const raw = await res.text()

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (cause) {
    throw new NinaVisionTransportError(
      `nina describe fallback response was not valid JSON: ${raw.slice(0, 300)}`,
      cause,
    )
  }

  /* Status FIRST here, unlike the primary path. There, the floor is checked above `res.ok` because
   * F04's measured failure was itself a 200 and the floor is the more actionable diagnosis. Here
   * there is no floor, so there is nothing to order it against — and a non-2xx body from a broker
   * carries the upstream's own error text, which is the single most useful thing this row can hold. */
  if (!res.ok) {
    throw new NinaVisionTransportError(
      `nina describe fallback returned ${res.status}: ${raw.slice(0, 300)}`,
    )
  }

  const body = json as {
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = body.choices?.[0]
  const description = (choice?.message?.content ?? '').trim()

  /* THE WHOLE ACCEPTANCE TEST. See the header block: deliberately not the token floor. A 200 with
   * an error envelope, a refusal, or a completion eaten by a reasoning preamble all land here, and
   * the raw snippet goes in the log row so the admin can tell which. */
  if (description.length === 0) {
    throw new NinaVisionTransportError(
      `nina describe fallback returned an empty completion: ${raw.slice(0, 300)}`,
    )
  }

  return {
    description,
    promptTokens: body.usage?.prompt_tokens ?? 0,
    completionTokens: body.usage?.completion_tokens ?? 0,
    /* 0 = "no floor was applied to this response". The honest value, and it is what tells a reader
     * of `describeNinaImage`'s success log line that the paragraph came from the fallback. */
    floor: 0,
    finishReason: choice?.finish_reason ?? null,
  }
}

/**
 * **z.ai, then OpenRouter, then the original failure — and every attempt gets a row.**
 *
 * R1 in one function. The three failure classes the brief names are all covered by one `catch`,
 * because `describeNinaImagesWithFetch` already funnels every one of them into a throw:
 *
 *   (a) the fetch itself throws — wrapped as `NinaVisionTransportError` (`:225-227`)
 *   (b) `NinaVisionTokenFloorError` — the endpoint answered 200 and dropped the image (`:249-251`)
 *   (c) `NinaVisionTransportError` — non-2xx, bad JSON, or an empty completion (`:233, :255, :264`)
 *
 * ── IT RETHROWS `primary`, NOT `fallback`, AND THAT IS LOAD-BEARING ───────────────────────────
 * Every caller branches on the ORIGINAL error's class and would change behaviour if handed the
 * fallback's. `describeNinaImage` (`lib/nina/actions.ts:1646-1666`) does
 * `const dropped = cause instanceof NinaVisionTokenFloorError`, logs `console.error('[nina] TOKEN
 * FLOOR TRIPPED …')` versus `console.warn('[nina] could not describe a chat image', …)`, and returns
 * `reason: dropped ? 'dropped' : 'transport'` on a ticket whose `description` is null.
 * `lib/admin/chatPhotoActions.ts:645+` and `:805+` and `lib/admin/ninaAlbumActions.ts:152+`,
 * `:557+` do the same. The fallback's own failure is always a `NinaVisionTransportError`, so
 * rethrowing IT would silently reclassify every floor trip as a transport failure and lose the one
 * signal the floor exists to raise. **Today's failure behaviour is preserved exactly: same error
 * instance, same class, same message, same `dropped`/`transport`/`rejected` branching, same null
 * description.** The only change on a total failure is two extra rows in a table nobody's control
 * flow reads.
 *
 * ── WHY THIS IS A NEW FUNCTION AND NOT A BRANCH INSIDE `describeNinaImagesWithFetch` ──────────
 * That function's contract — "one provider, one request, throws on failure" — is what its eleven
 * unit cases in `vision.test.ts` and the live probe in `tests/live/ninaVision.live.test.ts` assert,
 * and each of them hands it ONE fake `fetch` that answers every call with the same body. A fallback
 * inlined there would retry against that same fake, the fake's floor-tripping body would sail
 * through the (correctly) floor-free fallback check, and six `rejects.toBeInstanceOf(...)` cases
 * would pass for the wrong reason — the most expensive kind of green. Splitting the orchestrator out
 * keeps the primary attempt exactly as tested and gives the fallback its own cases, driven by a
 * fake that routes on the URL the way the real world does.
 *
 * ── ONE RETRY, NOT A CHAIN ────────────────────────────────────────────────────────────────────
 * R1 asks for a fallback, not a retry policy. No backoff, no second OpenRouter attempt, no third
 * provider. Two attempts, bounded at 55 s, and then the existing degraded path
 * (`NINA_DESCRIPTION_UNAVAILABLE`, which has her ask him what the picture is) takes over exactly as
 * it does today.
 */
export async function describeNinaImagesWithFallback(
  fetchImpl: FetchLike,
  images: readonly NinaDescribeImage[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  /* Hoisted above the try so a programmer error — an empty array — is one throw and zero log rows,
   * rather than the same `Error` raised twice and written to the admin table twice. */
  if (images.length < 1) throw new Error('describeNinaImages expects at least one image')

  try {
    return await describeNinaImagesWithFetch(fetchImpl, images, opts)
  } catch (primary) {
    await recordDescribeFailure({
      provider: 'zai',
      model: env.LLM_VISION_MODEL,
      /* The timeout this attempt ACTUALLY used, resolved the same way `describeNinaImagesWithFetch`
       * resolves it (`:223`) — not the constant, in case a caller ever overrides it. */
      timeoutMs: opts.timeoutMs ?? NINA_DESCRIBE_TIMEOUT_MS,
      cause: primary,
      imageCount: images.length,
      opts,
    })

    try {
      return await describeNinaImagesWithOpenRouter(fetchImpl, images, opts)
    } catch (fallback) {
      await recordDescribeFailure({
        provider: 'openrouter',
        model: NINA_FALLBACK_TEXT_MODEL,
        timeoutMs: NINA_DESCRIBE_FALLBACK_TIMEOUT_MS,
        cause: fallback,
        imageCount: images.length,
        opts,
      })
      /* `primary`, never `fallback`. See the header — every caller's `instanceof` branch depends on
       * it, and the fallback's error is always a transport error. */
      throw primary
    }
  }
}

/**
 * What a `data:` URI built by `toDataUri` may claim to be. The three `/admin/nina` accepts plus
 * nothing else — `image/jpeg` is both the chat path's only type and the fallback here.
 */
const DESCRIBABLE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

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
  /*
   * The media type is READ BACK from the blob's own `content-type`, not assumed.
   *
   * For a chat photo it is always `image/jpeg` — the compressor emits JPEG and `/api/upload`
   * allows nothing else — so this changes nothing on that path. F33 phase 15 is why it is not
   * hardcoded any more: an admin avatar is deliberately not re-encoded, so `/admin/nina` stores
   * PNG and WebP too, and labelling PNG bytes `image/jpeg` in a data URI is a lie told to a
   * vendor whose failure mode is "200 OK with invented content".
   *
   * Allow-listed rather than passed through, because the header is whatever the store was told at
   * PUT time, and it ends up inside a `data:` URI we hand to a model.
   */
  const served = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  const mediaType =
    served != null && (DESCRIBABLE_MEDIA_TYPES as readonly string[]).includes(served)
      ? served
      : NINA_CHAT_CONTENT_TYPE
  return { dataUri: `data:${mediaType};base64,${bytes.toString('base64')}` }
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
  /*
   * `describeNinaImagesWithFallback`, not `…WithFetch`: production gets z.ai then OpenRouter, the
   * unit suite still drives the single-provider core directly.
   *
   * `imageUrl` is filled in HERE and nowhere else. This is the only layer that still holds a hosted
   * URL — `toDataUri` has just turned the refs into base64 and the layers below never see a link
   * again — so it is the last honest place to name the photo for the log row. Defaulted rather than
   * overwritten so a caller that knows better can say so.
   *
   * A `toDataUri` failure above is NOT retried and NOT logged as an LLM failure: a blob that will
   * not fetch is this app's own storage failing, not a model failing, and it throws before either
   * provider is ever asked. It keeps today's behaviour exactly — a `NinaVisionTransportError` out
   * of `describeNinaImages`, caught by the caller as `'transport'`.
   */
  return describeNinaImagesWithFallback(fetch, images, {
    ...opts,
    imageUrl: opts.imageUrl ?? refs[0]?.blobUrl,
  })
}
