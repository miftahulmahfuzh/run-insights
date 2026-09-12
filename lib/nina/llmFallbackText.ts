import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { ninaEnv } from '@/lib/env'

import { logNinaError } from './errorlogs'
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from './openrouter'
import type { NinaLlmClientLike } from './turn'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE SECOND PROVIDER. z.ai first, OpenRouter's `z-ai/glm-5.3-flash` second, silence third.
 *
 *  R1, and it exists because of a measured incident: 2026-09-11 22:29 – 00:12 UTC, eleven
 *  consecutive `nina_turns` rows with `status='failed', error_code='unavailable'` on the z.ai
 *  Anthropic-compatible endpoint, zero automatic recovery, and a live probe of the same endpoint
 *  at 00:17 that succeeded. A transient provider-side condition cost the runner two hours of
 *  conversation, and nothing in the app noticed.
 *
 * ── WHY THIS IS A CLIENT AND NOT A BRANCH IN `turn.ts` ────────────────────────────────────────
 *  `turn.ts` already isolates the model call behind `NinaLlmClientLike` — the seam
 *  `productionDeps()` constructs and the unit suite injects at. A client that wraps another
 *  client covers ALL FIVE call sites of a turn (primary, two continuations, the prose re-ask, and
 *  `attemptNinaRepair`'s one) without a line of the loop changing, because every one of them goes
 *  through `deps.client.messages.create`. Inlining a retry at each `catch` instead would be five
 *  edits to the most carefully-reasoned control flow in this repo, and the fifth would drift.
 *
 *  It is also **stateless per call**, which is what makes multi-round tool dispatch work: a turn
 *  reuses one `deps.client` for up to `MAX_TOOL_ROUNDS + MAX_PROSE_RETRIES + 1` calls plus a
 *  repair, and each of them independently tries z.ai, independently falls back, and independently
 *  logs. Round 1 may answer from z.ai and round 2 from OpenRouter, or the reverse — see
 *  `openRouterToolUseId` for the one thing that makes that safe.
 *
 * ── WHAT IS NOT HERE ──────────────────────────────────────────────────────────────────────────
 *  No second fallback, no retry of the fallback, no provider chain. R1 asks for one alternative
 *  and the 45 s turn deadline cannot pay for two. And still no fallback bubble: when both
 *  providers fail this rethrows, `turn.ts`'s own catch fires, and the turn ends `'unavailable'`
 *  with a runner who sees no reply — the header of `turn.ts` argues that case and it is unchanged.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/*
 * ── THE ENDPOINT AND THE MODEL ID ARE IMPORTED, NOT DECLARED ──────────────────────────────────
 * `OPENROUTER_CHAT_URL` and `NINA_FALLBACK_TEXT_MODEL` live in `lib/nina/openrouter.ts`, which
 * phase 3 creates, because phase 3's vision fallback needs the same two values. Two call paths
 * spelling one endpoint and one model id twice is exactly how they drift apart, and neither a
 * text-chat client nor a vision module is the right home for the other's copy — so neither owns
 * them.
 *
 * Both remain hardcoded rather than env vars, like `OPENROUTER_IMAGE_URL` / `NINA_IMAGE_MODEL` in
 * `lib/nina/imagerecipe.ts:114-115`, and the plan's Decisions table follows that precedent: the
 * PRIMARY text model is operator-selectable through `app_settings.text_model`, the fallback is not.
 * An operator who can misconfigure the safety net can turn the safety net off by accident.
 * `z-ai/glm-5.3-flash` and not `z-ai/glm-5.3` because OpenRouter lists the flash variant as natively
 * multimodal, which is what R1 asks for in as many words — the full argument is on the constant's
 * own docblock in `openrouter.ts`.
 */

/**
 * Below this much allowance, the fallback is NOT attempted and the z.ai error is rethrown.
 *
 * The caller's `options.timeout` is `Math.min(ceiling, Math.max(remaining(), 1))` (`turn.ts:912`)
 * — what is left of the 45 s turn deadline. When z.ai has just burned most of it, a second call
 * started with two seconds cannot finish; attempting it anyway costs those two seconds, writes a
 * junk `nina_error_logs` row that says nothing but "no time left", and changes nothing the runner
 * sees. 5 s because the fastest call ever measured on these endpoints was 10.2 s
 * (`NINA_MIN_ROUND_BUDGET_MS`'s note) and a flash model is the one thing that might beat it.
 *
 * **Note which failure this threshold is NOT about.** The incident this feature exists for was
 * z.ai failing FAST — connection errors, not timeouts — so the fallback had the whole remaining
 * budget. This gate only declines the hopeless case.
 */
export const NINA_FALLBACK_MIN_BUDGET_MS = 5_000

/** Only reached by a caller that passes no `timeout`; `turn.ts` always passes one. */
const NINA_FALLBACK_DEFAULT_TIMEOUT_MS = 20_000

/* ============================================================================
 * The OpenAI-Chat-Completions envelope, as far as this file needs it
 * ==========================================================================*/

interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenRouterContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

type OpenRouterMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenRouterContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenRouterToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

interface OpenRouterTool {
  type: 'function'
  function: { name: string; description?: string; parameters: Record<string, unknown> }
}

type OpenRouterToolChoice =
  'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }

export interface OpenRouterChatBody {
  model: string
  max_tokens: number
  messages: OpenRouterMessage[]
  tools?: OpenRouterTool[]
  tool_choice?: OpenRouterToolChoice
}

/** What comes back. Every field optional, because a provider error is also a 200 sometimes. */
interface OpenRouterChatResponse {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: number | string }
}

/* ============================================================================
 * Request: Anthropic Messages -> OpenAI Chat Completions
 * ==========================================================================*/

/**
 * **Tool-call ids must round-trip through BOTH providers, because a turn can change providers
 * mid-flight.** The failure this prevents is concrete: round 1 answers from OpenRouter with a
 * `tool_use`, `turn.ts:1032-1033` appends that block and its matching `tool_result`, and round 2
 * goes to z.ai because z.ai recovered. z.ai now sees a `tool_result` whose `tool_use_id` it must
 * match against the `tool_use` id in the same history — which it will, because the id is carried
 * verbatim and never regenerated.
 *
 * Two rules keep that true in both directions:
 *
 *   1. `openRouterToolUseId` gives a synthesized block an ANTHROPIC-SHAPED id (`toolu_or_…`), so
 *      the id that reaches z.ai looks like the ids z.ai itself issues rather than an OpenAI
 *      `call_…`.
 *   2. `openAiToolCallId` is applied when translating BACK, to both the assistant's `tool_calls[].id`
 *      and the `tool` message's `tool_call_id`. It is deterministic, so the same input id yields
 *      the same output id in both places and the pair still matches — which is the only property
 *      OpenAI's protocol actually checks.
 */
const OPENROUTER_TOOL_ID_PREFIX = 'toolu_or_'

function sanitiseToolId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '_')
  return cleaned.length === 0 ? 'tool_call' : cleaned
}

function openRouterToolUseId(rawCallId: string): string {
  return OPENROUTER_TOOL_ID_PREFIX + sanitiseToolId(rawCallId)
}

/** 40 chars is OpenAI's documented ceiling for a tool-call id; longer ones are rejected. */
function openAiToolCallId(anthropicId: string): string {
  return sanitiseToolId(anthropicId).slice(0, 40)
}

/** `JSON.stringify` that cannot itself become the failure being logged. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch (cause) {
    return `[unserialisable: ${String(cause)}]`
  }
}

/** Text out of either spelling of a content field. Non-text blocks are dropped, not stringified. */
function plainText(content: string | Array<Anthropic.ContentBlockParam>): string {
  if (typeof content === 'string') return content
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * `turn.ts` never sends an image on this path — plan invariant 5, stated at `turnrun.ts:268-271`
 * ("`imageDescriptions` is TEXT... `glm-5.3` answers 200 and silently drops an image block").
 * This is here anyway because `NinaLlmClientLike` accepts any `MessageParam`, the fallback model
 * IS multimodal, and a translator that silently dropped an image would be the same class of lie
 * that invariant is about.
 */
function imagePartUrl(block: Anthropic.ImageBlockParam): string | null {
  const source = block.source
  if (source.type === 'url') return source.url
  if (source.type === 'base64') return `data:${source.media_type};base64,${source.data}`
  return null
}

/**
 * A `tool_result`'s text. **`is_error` is folded into the string on purpose**: OpenAI's `tool`
 * role has no error flag, and `turn.ts:1026-1029` sets `is_error: true` for a tool answer she is
 * meant to notice and fix inside the same round. Dropping it would silently turn a failed lookup
 * into a successful-looking empty one.
 */
function toolResultText(block: Anthropic.ToolResultBlockParam): string {
  const prefix = block.is_error === true ? 'ERROR: ' : ''
  const content = block.content
  if (content == null) return prefix
  if (typeof content === 'string') return prefix + content
  const parts: string[] = []
  for (const item of content) {
    if (item.type === 'text') parts.push(item.text)
  }
  return prefix + parts.join('\n')
}

type AnthropicToolUnion = NonNullable<Anthropic.MessageCreateParamsNonStreaming['tools']>[number]

/**
 * `ninaBody` only ever sends CUSTOM tools (`SEND_TOOL`, `LOOKUP_RUNS_TOOL`, `COMPARE_RUNS_TOOL`,
 * `SAVE_MEMORY_TOOL`, and phase 12's `generate_image`), so the `'input_schema' in tool` guard is
 * always true today. It is a guard and not a cast because `tools` is typed `Array<ToolUnion>`,
 * whose server-tool members (`web_search`, `bash`, …) carry no `input_schema` and have no OpenAI
 * function equivalent at all — silently emitting `parameters: undefined` for one would be a 400
 * from OpenRouter attributed to the wrong thing.
 */
function translateTools(tools: readonly AnthropicToolUnion[] | undefined): OpenRouterTool[] {
  if (tools == null) return []
  const out: OpenRouterTool[] = []
  for (const tool of tools) {
    if (!('input_schema' in tool)) continue
    out.push({
      type: 'function',
      function: {
        name: tool.name,
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
        parameters: tool.input_schema,
      },
    })
  }
  return out
}

/**
 * **The forcing translation, and it is the one that carries the turn's safety property.**
 * `ninaBody` sends `{ type: 'tool', name: 'send' }` on the final call with `tools` narrowed to
 * `[SEND_TOOL]` — that is what stops the loop from spinning (`runNinaTurnWith`'s header). Its
 * OpenAI spelling is `{ type: 'function', function: { name: 'send' } }`, and `{ type: 'any' }`'s
 * is the bare string `'required'` ("call SOMETHING").
 */
function translateToolChoice(
  choice: Anthropic.ToolChoice | undefined,
): OpenRouterToolChoice | null {
  if (choice == null) return null
  switch (choice.type) {
    case 'tool':
      return { type: 'function', function: { name: choice.name } }
    case 'any':
      return 'required'
    case 'none':
      return 'none'
    case 'auto':
    default:
      return 'auto'
  }
}

/**
 * One Anthropic turn -> zero or more OpenAI messages.
 *
 * **Tool results are emitted BEFORE the turn's own text.** `turn.ts:1033` pushes them as a `user`
 * turn whose content is nothing but `tool_result` blocks; OpenAI's protocol wants them as separate
 * `role: 'tool'` messages directly after the assistant message that made the calls. Emitting them
 * first preserves that adjacency, and a user turn left with no text and no images emits nothing at
 * all rather than an empty bubble the model would have to interpret.
 */
function pushTranslatedTurn(out: OpenRouterMessage[], turn: Anthropic.MessageParam): void {
  if (turn.role === 'system') {
    const text = plainText(turn.content)
    if (text.length > 0) out.push({ role: 'system', content: text })
    return
  }

  if (typeof turn.content === 'string') {
    if (turn.content.length === 0) return
    out.push(
      turn.role === 'assistant'
        ? { role: 'assistant', content: turn.content }
        : { role: 'user', content: turn.content },
    )
    return
  }

  const texts: string[] = []
  const images: OpenRouterContentPart[] = []
  const toolCalls: OpenRouterToolCall[] = []
  const toolMessages: OpenRouterMessage[] = []

  for (const block of turn.content) {
    switch (block.type) {
      case 'text':
        texts.push(block.text)
        break
      case 'image': {
        const url = imagePartUrl(block)
        if (url != null) images.push({ type: 'image_url', image_url: { url } })
        break
      }
      case 'tool_use':
        toolCalls.push({
          id: openAiToolCallId(block.id),
          type: 'function',
          function: { name: block.name, arguments: safeStringify(block.input ?? {}) },
        })
        break
      case 'tool_result':
        toolMessages.push({
          role: 'tool',
          tool_call_id: openAiToolCallId(block.tool_use_id),
          content: toolResultText(block),
        })
        break
      default:
        /*
         * `thinking` and `redacted_thinking` have no OpenAI equivalent and no business being
         * replayed at a second provider — `turn.ts:1032` pushes `message.content` wholesale, and
         * the 2026-09-03 probe proved a thinking block arrives even with the flag set. Documents,
         * search results and server-tool blocks cannot reach this path at all. All dropped.
         */
        break
    }
  }

  for (const toolMessage of toolMessages) out.push(toolMessage)

  const text = texts.join('\n')

  if (turn.role === 'assistant') {
    if (text.length === 0 && toolCalls.length === 0) return
    out.push({
      role: 'assistant',
      content: text.length > 0 ? text : null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    })
    return
  }

  if (images.length > 0) {
    const parts: OpenRouterContentPart[] = []
    if (text.length > 0) parts.push({ type: 'text', text })
    for (const image of images) parts.push(image)
    out.push({ role: 'user', content: parts })
    return
  }

  if (text.length > 0) out.push({ role: 'user', content: text })
}

/**
 * **The whole request translation, and it is PURE and TOTAL** — no I/O, no environment, and no
 * input it throws on. That is deliberate: `ninaFallbackTextClient` builds this body BEFORE the
 * POST so the body it logs as `fullInput` for a failed OpenRouter attempt is the payload that
 * actually went on the wire, per the analysis's decision 7 ("full input is the full request
 * payload actually sent to the model"). A translator that could throw would make that log line
 * conditional on the thing being logged.
 *
 * `body.model` is DISCARDED — it is the z.ai model id (`glm-5.3` or whatever
 * `app_settings.text_model` holds) and means nothing to OpenRouter. `max_tokens` is carried
 * across unchanged: `NINA_MAX_TOKENS` is 2400 because a thinking block may eat the front of the
 * budget, and that risk does not go away at a second provider.
 */
export function toOpenRouterChatBody(
  body: Anthropic.MessageCreateParamsNonStreaming,
): OpenRouterChatBody {
  const messages: OpenRouterMessage[] = []

  const system = plainText(body.system ?? '')
  if (system.length > 0) messages.push({ role: 'system', content: system })

  for (const turn of body.messages) pushTranslatedTurn(messages, turn)

  const tools = translateTools(body.tools)
  const toolChoice = translateToolChoice(body.tool_choice)

  return {
    model: NINA_FALLBACK_TEXT_MODEL,
    max_tokens: body.max_tokens,
    messages,
    ...(tools.length > 0 ? { tools } : {}),
    /* A `tool_choice` with no `tools` is a 400 at every provider that validates it. */
    ...(tools.length > 0 && toolChoice != null ? { tool_choice: toolChoice } : {}),
    /*
     * No reasoning-control field. MEASURED 2026-09-12 13:11 WIB: sending the once-standard
     * `reasoning: { enabled: false }` now gets a `400 "Reasoning is mandatory for this endpoint
     * and cannot be disabled."` from `z-ai/glm-5.3-flash` — the fallback this codebase relies on
     * for a z.ai outage failed itself, on the exact incident it exists to survive. Omitting the
     * field entirely follows `vision.ts:112-117`'s already-established rule for this same
     * provider/model: an unprobed reasoning-control shape is not something to trust against a
     * vendor whose behaviour here has now changed once already, and `NINA_MAX_TOKENS` (2400,
     * carried across unchanged) already budgets slack for a reasoning preamble the z.ai side
     * itself does not guarantee suppressing.
     */
  }
}

/* ============================================================================
 * Response: OpenAI Chat Completions -> Anthropic Message
 * ==========================================================================*/

function parseToolArguments(raw: string | undefined): unknown {
  if (raw == null || raw.length === 0) return {}
  try {
    return JSON.parse(raw)
  } catch {
    /*
     * Arguments the provider could not serialise validly. `{}` and not a throw, because
     * `NinaSendPayloadSchema.safeParse` will reject it and `turn.ts:946` will spend THE ONE REPAIR
     * asking again — which is exactly the existing handling for a malformed `send` argument, and a
     * better outcome than `'unavailable'`.
     */
    return {}
  }
}

/**
 * Only `'max_tokens'` is load-bearing: it is the single `stop_reason` value `turn.ts` compares
 * against (`:925` and `:1084`), and it means "a response cut mid-object — the same ceiling will
 * cut it again", which degrades the turn instead of repairing it. Everything else is recorded
 * honestly and read by nothing.
 *
 * `hasToolUse` wins over a `finish_reason` of `'stop'` because the content is the ground truth:
 * a provider that returns tool calls and calls it a natural stop still made tool calls.
 */
function mapStopReason(
  finish: string | null | undefined,
  hasToolUse: boolean,
): NonNullable<Anthropic.Message['stop_reason']> {
  if (finish === 'length') return 'max_tokens'
  if (hasToolUse || finish === 'tool_calls') return 'tool_use'
  if (finish === 'content_filter') return 'refusal'
  return 'end_turn'
}

/**
 * **The synthesized `Anthropic.Message`, and every field is spelled out because the SDK's
 * `Message` and `Usage` interfaces require them** (`@anthropic-ai/sdk@0.117.1`) — `container`,
 * `stop_details`, `stop_sequence`, and seven `usage` members this provider knows nothing about.
 * They are `null`, which is what the SDK's own type says "absent" looks like, rather than a cast
 * that would let a future SDK bump add a required field without a compile error.
 *
 * Throws — never returns a degenerate message — when the response carries no usable completion.
 * Same rule as `callNinaImageModel`'s "a 200 with no image is a failure, not a success with an
 * empty photograph" (`tests/nina.imagecall.test.ts:131`): a throw here is logged as an OpenRouter
 * failure and lands the turn on `'unavailable'`, which is the truth, while a message with zero
 * content blocks would be silently read as "she answered in prose with nothing in it".
 */
export function toAnthropicMessage(
  payload: OpenRouterChatResponse,
  fallbackModel: string,
): Anthropic.Message {
  const choice = payload.choices?.[0]
  if (choice == null) {
    throw new Error(`openrouter returned no choices: ${safeStringify(payload).slice(0, 1_000)}`)
  }

  const content: Anthropic.ContentBlock[] = []

  const text = typeof choice.message?.content === 'string' ? choice.message.content : ''
  if (text.length > 0) content.push({ type: 'text', text, citations: null })

  for (const call of choice.message?.tool_calls ?? []) {
    const name = call.function?.name
    if (name == null || name.length === 0) continue
    content.push({
      type: 'tool_use',
      id: openRouterToolUseId(call.id ?? name),
      name,
      input: parseToolArguments(call.function?.arguments),
      caller: { type: 'direct' },
    })
  }

  if (content.length === 0) {
    throw new Error(
      `openrouter returned an empty completion: ${safeStringify(payload).slice(0, 1_000)}`,
    )
  }

  const hasToolUse = content.some((block) => block.type === 'tool_use')

  return {
    id: payload.id ?? 'openrouter-fallback',
    container: null,
    content,
    model: payload.model ?? fallbackModel,
    role: 'assistant',
    stop_details: null,
    stop_reason: mapStopReason(choice.finish_reason, hasToolUse),
    stop_sequence: null,
    type: 'message',
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      /* The two `usageOf` reads. Everything else on this object is protocol furniture. */
      input_tokens: payload.usage?.prompt_tokens ?? 0,
      output_tokens: payload.usage?.completion_tokens ?? 0,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
  }
}

/* ============================================================================
 * The call
 * ==========================================================================*/

/**
 * One POST. Throws for every failure, because the caller's whole contract with `turn.ts` is a
 * promise-that-rejects — `NinaLlmClientLike.create` returns `Promise<Anthropic.Message>` and
 * `turn.ts` has a `catch` around every call of it.
 *
 * `ninaEnv()` is read INSIDE this function, never at module scope, for the reason
 * `lib/nina/imagecall.ts:201-211` gives at length: it is a lazy zod group that THROWS when the
 * variable is absent, and production was measured carrying no `OPENROUTER_API_KEY` on 2026-09-04.
 * Here that throw is caught by `ninaFallbackTextClient` and written to `nina_error_logs` as an
 * OpenRouter failure — so "the safety net was never wired up" becomes a row an admin can see on
 * `/admin/error-logs` instead of a silence that looks identical to a provider outage.
 */
async function postOpenRouterChat(
  body: OpenRouterChatBody,
  timeoutMs: number,
): Promise<Anthropic.Message> {
  const apiKey = ninaEnv().OPENROUTER_API_KEY

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })

  const raw = await res.text()

  if (!res.ok) throw new Error(`openrouter HTTP ${res.status}: ${raw.slice(0, 1_000)}`)

  let parsed: OpenRouterChatResponse
  try {
    parsed = JSON.parse(raw) as OpenRouterChatResponse
  } catch {
    throw new Error(`openrouter returned unparseable JSON: ${raw.slice(0, 1_000)}`)
  }

  /* OpenRouter reports upstream provider errors as a 200 with an `error` member. */
  if (parsed.error != null) {
    throw new Error(`openrouter error: ${parsed.error.message ?? safeStringify(parsed.error)}`)
  }

  return toAnthropicMessage(parsed, NINA_FALLBACK_TEXT_MODEL)
}

/**
 * What goes in `nina_error_logs.error_message`. `String(cause)` alone flattens an SDK error to
 * `"APIConnectionError: Connection error."` and throws away the status and the provider's own
 * body — the two things the 2026-09-11 incident investigation actually needed and did not have.
 *
 * Written against the shape rather than against `@anthropic-ai/sdk`'s error classes on purpose:
 * this has to describe an `AbortError` from `AbortSignal.timeout`, a plain `Error` thrown four
 * functions up, and whatever z.ai's SDK wrapper produces, without importing any of them.
 */
function describeCause(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause)

  const parts: string[] = [`${cause.name}: ${cause.message}`]

  const status = (cause as { status?: unknown }).status
  if (typeof status === 'number') parts.push(`status=${status}`)

  const body = (cause as { error?: unknown }).error
  if (body != null) parts.push(`body=${safeStringify(body)}`)

  if (cause.cause != null) parts.push(`cause=${String(cause.cause)}`)

  return parts.join(' | ')
}

/**
 * **The wrapper.** `productionDeps()` hands this the real z.ai client and it hands `turn.ts` back
 * something `turn.ts` cannot tell apart.
 *
 * ── WHAT IS LOGGED, AND WHY EACH ATTEMPT GETS ITS OWN ROW ─────────────────────────────────────
 * R2 asks for "log setiap failure call to LLM" — every failed call, not every failed turn. A turn
 * where z.ai failed and OpenRouter rescued it writes ONE row and produces a reply; the row is the
 * only evidence that the primary provider is degrading, and it is exactly the evidence the
 * 2026-09-11 streak had none of. A turn where both failed writes TWO rows and no reply.
 *
 * ── `userId` ──────────────────────────────────────────────────────────────────────────────────
 * Threaded from `runNinaTurn`'s own input through `productionDeps(userId)`, because the client is
 * constructed per turn and a log row nobody can attribute is a log row that cannot be joined to
 * the `nina_turns` row written for the same turn. It is nullable for the callers that have no
 * user in hand — the unit suite, and anything future.
 *
 * ── A LOG THAT CANNOT BE WRITTEN MUST NOT COST A REPLY THAT CAN ───────────────────────────────
 * Plan invariant: every `logNinaError` is `await`ed and `.catch(() => {})`-ed. `logNinaError`
 * already promises never to throw (Phase 1); the catch is the second lock, and it is the same
 * idiom `runNinaTurn:1150-1164` already uses around `deps.store.record`.
 */
export function ninaFallbackTextClient(
  primary: NinaLlmClientLike,
  options: { userId?: string | null } = {},
): NinaLlmClientLike {
  const userId = options.userId ?? null

  return {
    messages: {
      async create(body, callOptions) {
        const timeoutMs = callOptions?.timeout ?? NINA_FALLBACK_DEFAULT_TIMEOUT_MS

        try {
          return await primary.messages.create(body, callOptions)
        } catch (zaiCause) {
          console.warn('[nina] z.ai text call failed — considering openrouter', {
            model: body.model,
            timeoutMs,
            error: String(zaiCause),
          })

          await logNinaError({
            category: 'text',
            userId,
            provider: 'zai',
            model: body.model,
            fullInput: safeStringify(body),
            errorMessage: describeCause(zaiCause),
            timeoutMs,
            imageUrl: null,
          }).catch(() => {})

          if (timeoutMs < NINA_FALLBACK_MIN_BUDGET_MS) {
            console.warn('[nina] openrouter fallback skipped — not enough budget left', {
              timeoutMs,
              minimumMs: NINA_FALLBACK_MIN_BUDGET_MS,
            })
            throw zaiCause
          }

          /* Built before the POST so the logged `fullInput` is the payload that went on the wire. */
          const openRouterBody = toOpenRouterChatBody(body)
          const startedAt = Date.now()

          try {
            const message = await postOpenRouterChat(openRouterBody, timeoutMs)
            console.info('[nina] openrouter text fallback answered', {
              model: NINA_FALLBACK_TEXT_MODEL,
              latencyMs: Date.now() - startedAt,
              stopReason: message.stop_reason,
            })
            return message
          } catch (openRouterCause) {
            await logNinaError({
              category: 'text',
              userId,
              provider: 'openrouter',
              model: NINA_FALLBACK_TEXT_MODEL,
              fullInput: safeStringify(openRouterBody),
              errorMessage: describeCause(openRouterCause),
              timeoutMs,
              imageUrl: null,
            }).catch(() => {})

            /*
             * Both providers are down. Rethrowing puts `turn.ts` exactly where it was before this
             * feature existed: `logNinaFailure` warns, `finish(null, 'unavailable')` runs, and the
             * runner sees no reply rather than a templated apology. The z.ai cause is not lost —
             * it is the first of the two rows just written.
             */
            throw openRouterCause
          }
        }
      },
    },
  }
}
