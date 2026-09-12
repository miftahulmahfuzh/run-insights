# Phase 2: OpenRouter fallback — text chat

**Plan set:** `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md`
**Analysis:** `20260912-073115-KZHE_code_analyzer.md`
**Satisfies:** R1 — when the z.ai-backed text-chat call fails, Nina retries once against OpenRouter's `z-ai/glm-5.3-flash` instead of going silent, and both attempts are recorded.
**Depends on:** Phase 1 (`lib/nina/errorlogs.ts`'s `logNinaError`), Phase 3 (`lib/nina/openrouter.ts`'s `OPENROUTER_CHAT_URL` / `NINA_FALLBACK_TEXT_MODEL` — see the Interface Contract)
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

After this phase, every `deps.client.messages.create` in `lib/nina/turn.ts` — the primary call, both
continuation calls, the prose re-ask and the repair call — goes through a wrapping
`NinaLlmClientLike` that tries z.ai first and, on a throw, translates the Anthropic-shaped request
into an OpenAI-Chat-Completions request, POSTs it to `https://openrouter.ai/api/v1/chat/completions`
with model `z-ai/glm-5.3-flash`, and hands the reply back as a synthesized `Anthropic.Message` that
`findSendBlock`/`findToolUses`/`usageOf`/the `stop_reason` check read without noticing the swap.
Every individual failed attempt (z.ai and/or OpenRouter) writes one `nina_error_logs` row with
`category: 'text'`. When both providers fail the turn still ends `'unavailable'`, exactly as today.

`turn.ts`'s loop, repair function, budgets and `nina_turns` writes are **not** touched — the only
line of control flow that changes is `productionDeps()`'s `client:` field.

## Interface Contract

**Creates:**

- `lib/nina/llmFallbackText.ts` (new file), exporting:
  - `NINA_FALLBACK_MIN_BUDGET_MS` — `5_000`
  - `NINA_FALLBACK_DEFAULT_TIMEOUT_MS` — `20_000`
  - `type OpenRouterChatBody`
  - `toOpenRouterChatBody(body: Anthropic.MessageCreateParamsNonStreaming): OpenRouterChatBody`
  - `toAnthropicMessage(payload: OpenRouterChatResponse, fallbackModel: string): Anthropic.Message`
  - `ninaFallbackTextClient(primary: NinaLlmClientLike, options?: { userId?: string | null }): NinaLlmClientLike`
- `tests/nina.llmFallbackText.test.ts` (new file)

**Does NOT create — imports from Phase 3's shared module:**

- `OPENROUTER_CHAT_URL` and `NINA_FALLBACK_TEXT_MODEL` come from **`lib/nina/openrouter.ts`**, which
  **Phase 3 creates and owns**. This phase imports both and **must not redeclare either**.
  *(Reconciled 2026-09-12: the draft of this plan declared its own copies inside
  `lib/nina/llmFallbackText.ts` while Phase 3's draft created the same two names in
  `lib/nina/openrouter.ts`. One endpoint and one model id declared twice is how the two drift apart,
  and `lib/nina/openrouter.ts` is the better home because neither a text-chat client nor a vision
  module should own a constant the other also needs. Phase 3 keeps the file because that is where
  the canonical, fully-documented text already lives — which is also why this phase now carries a
  `depends_on` edge to Phase 3. The file is pure constants with zero imports and no runtime
  behaviour, so the edge costs only ordering, never a merge.)*

**Signature changes:**

- `productionDeps()` -> `productionDeps(userId: string | null = null)` (`lib/nina/turn.ts:1107`).
  Backward compatible — the one existing caller is updated in this phase, and the three test files
  that `vi.mock` it (`tests/nina.resend.test.ts:125`, `tests/nina.sendDescriptions.test.ts:94`,
  `tests/nina.turnrevive.test.ts:127`, `tests/nina.burstCancel.test.ts:83`) replace it with
  `() => ({})` and are unaffected by an added optional parameter.

**Deletes / Renames:** none.

**Requires (from Phase 1):**

- `lib/nina/errorlogs.ts` exports `logNinaError(entry: NinaErrorLogWrite): Promise<void>`, which
  **never throws and never rejects**. **Verified against Phase 1's plan file — this is its actual
  shape, not an assumption:**

  ```ts
  export interface NinaErrorLogWrite {
    category: 'text' | 'multimodal' | 'image_generation'
    userId?: string | null     // NULLABLE column, optional field
    provider: string           // untyped text; 'zai' | 'openrouter' are this set's values
    model: string
    fullInput: string
    errorMessage: string
    timeoutMs?: number | null
    imageUrl?: string | null
  }
  ```

  Every field this phase's two `logNinaError({...})` calls name matches it byte for byte, and both
  calls pass `timeoutMs` and `imageUrl` explicitly rather than leaning on their optionality.

- **`nina_error_logs.user_id` is nullable and `userId` accepts `string | null | undefined`** —
  confirmed in Phase 1's Drizzle definition (`text('user_id').references(…)`, no `.notNull()`) and
  pinned by its schema test. This phase supplies a real id on the production path (threaded through
  `productionDeps(userId)`), but `ninaFallbackTextClient` is also constructible without one (the
  unit suite, and any future caller with no user in hand), and a `NOT NULL` column would have made
  that write a failed insert the `.catch(() => {})` swallows in silence.

**Requires (from Phase 3):**

- `lib/nina/openrouter.ts` exports `OPENROUTER_CHAT_URL` (`'https://openrouter.ai/api/v1/chat/completions'`)
  and `NINA_FALLBACK_TEXT_MODEL` (`'z-ai/glm-5.3-flash'`). Zero-import constants module, no runtime
  behaviour — the dependency is purely "the file must exist before this phase's import resolves".

**Leaves alone (owned by others):**

- `lib/db/schema.ts`, `lib/nina/errorlogs.ts` (Phase 1)
- `lib/nina/vision.ts`, `lib/nina/prompts/describe.ts`, `lib/nina/openrouter.ts` (Phase 3 — the last
  one is **imported, never edited**: Phase 3 creates it and owns its content)
- `lib/nina/imagejobs.ts`, `lib/nina/imagerun.ts`, `lib/nina/imagecall.ts`, `lib/nina/imagerecipe.ts` (Phase 4)
- `app/admin/**`, `components/admin/**` (Phase 5)
- `lib/llm/client.ts`, `lib/llm/vision.ts`, `lib/llm/narrate.ts` — unchanged; `narrativeClient()` is
  wrapped, never modified.
- `NINA_TURN_BUDGET`, `MAX_TOOL_ROUNDS`, `runNinaTurnWith`, `attemptNinaRepair`, `ninaBody`,
  `dbNinaTurnStore` — read, never edited.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/openrouter.ts` | **read only** | Phase 3 creates it. This phase imports `OPENROUTER_CHAT_URL` and `NINA_FALLBACK_TEXT_MODEL` from it and edits nothing — hence the `depends_on` edge to Phase 3 |
| `lib/nina/llmFallbackText.ts` | create | The whole phase: Anthropic⇄OpenAI translation, the OpenRouter POST, and the wrapping `NinaLlmClientLike` |
| `lib/nina/turn.ts` | modify | one import (`:8`-ish); `productionDeps` gains an optional `userId` and its `client:` field is wrapped (`:1107-1115`); `runNinaTurn` passes `input.userId` (`:1147`) |
| `lib/nina/turnrun.ts` | modify | `productionDeps()` -> `productionDeps(userId)` (`:294`) |
| `tests/nina.llmFallbackText.test.ts` | create | translation + fallback-order + double-failure coverage |

---

## Implementation Steps

### Step 1: The fallback client and its translation layer

**File:** `lib/nina/llmFallbackText.ts` (new)
**Change:** The entire file. Nothing else in the repo is edited for the translation.

Facts this file is written against, all verified in the worktree at `faace78`:

- `NinaLlmClientLike` (`turn.ts:172-179`) is
  `{ messages: { create(body: Anthropic.MessageCreateParamsNonStreaming, options?: { timeout?: number }): Promise<Anthropic.Message> } }`.
- `ninaBody` (`turn.ts:718-743`) builds exactly
  `{ model, max_tokens: 2400, system, messages, tools, tool_choice, thinking: { type: 'disabled' } }`,
  with `tools: forceSend ? [SEND_TOOL] : [...toolSet.tools]` and
  `tool_choice: forceSend ? { type: 'tool', name: 'send' } : { type: 'any' }`
  (`SEND_TOOL.name === 'send'`, `lib/nina/prompts/tools.ts:76`).
- What the turn actually reads off the returned `Anthropic.Message` — **nothing else**:
  - `usageOf` (`turn.ts:745-750`): `message.usage?.input_tokens ?? 0`, `message.usage?.output_tokens ?? 0`
  - `findSendBlock` (`turn.ts:762-767`): iterates `message.content`, matches `block.type === 'tool_use' && block.name === 'send'`, returns the block (the loop then reads `send.input`)
  - `findToolUses` (`turn.ts:769-775`): iterates `message.content`, collects `tool_use` blocks whose `name !== 'send'` (the loop then reads `use.id`, `use.name`, `use.input`)
  - `proseOf` (`turn.ts:798-804`): filters `block.type === 'text'`, reads `block.text`
  - `message.stop_reason === 'max_tokens'` (`turn.ts:925`, `turn.ts:1084`)
  - `messages.push({ role: 'assistant', content: message.content })` (`turn.ts:1032`) — so the
    synthesized `content` array is fed straight back into the **next** call's request.
- `@anthropic-ai/sdk` is `0.117.1`. `Anthropic.Message` requires
  `id, container, content, model, role, stop_details, stop_reason, stop_sequence, type, usage`;
  `Anthropic.Usage` requires `cache_creation, cache_creation_input_tokens, cache_read_input_tokens,
  inference_geo, input_tokens, output_tokens, output_tokens_details, server_tool_use, service_tier`;
  `Anthropic.TextBlock` requires `citations`; `Anthropic.ToolUseBlock` requires `caller`.
  Every one of those is spelled out below — `tsconfig.json` has `strict` and
  `noUncheckedIndexedAccess`, so a partial literal will not compile.
- `tsconfig.json` has `verbatimModuleSyntax: true`, so the `NinaLlmClientLike` import must be
  `import type`. It is: the resulting `turn.ts ⇄ llmFallbackText.ts` cycle is **type-only and fully
  erased**, so there is no runtime cycle. (`eslint.config.mjs` carries no `import/no-cycle` rule.)
- `scripts/check-openrouter-boundary.mjs` exempts `lib/nina/` and `lib/env.ts` only — this file is
  under `lib/nina/` and reads the key through `ninaEnv()`, never `process.env` directly, exactly as
  `lib/nina/imagecall.ts:212-223` does and for the reason its comment gives.

**Code:**

```ts
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
export const NINA_FALLBACK_DEFAULT_TIMEOUT_MS = 20_000

/* ============================================================================
 * The OpenAI-Chat-Completions envelope, as far as this file needs it
 * ==========================================================================*/

interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

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
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }

export interface OpenRouterChatBody {
  model: string
  max_tokens: number
  messages: OpenRouterMessage[]
  tools?: OpenRouterTool[]
  tool_choice?: OpenRouterToolChoice
  /**
   * OpenRouter's unified reasoning switch, and it is this file's translation of
   * `thinking: { type: 'disabled' }` — which `ninaBody`'s docblock calls MEASURED and NEVER
   * REMOVE, with the numbers: thinking on cost 18-73 s and returned `stop_reason: 'max_tokens'`
   * with nothing but a thinking block, thinking off answered in 17 s with the tool call.
   *
   * As on the z.ai side it is a REQUEST and not a guarantee, and nothing below assumes it was
   * honoured: `toAnthropicMessage` ignores `message.reasoning` entirely rather than trying to
   * account for it.
   */
  reasoning: { enabled: false }
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
    reasoning: { enabled: false },
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
```

**Impact:** New file, no existing behaviour changes until Step 2 wires it in. `npm run ci:openrouter-guard` still passes (the file is under `lib/nina/`).

---

### Step 2: Wire the wrapper into `productionDeps()`

**File:** `lib/nina/turn.ts:7-8` (import), `:1107-1115` (`productionDeps`), `:1147` (`runNinaTurn`)
**Change:** Three edits, all mechanical. **No other line of `turn.ts` is touched** — not the loop,
not `attemptNinaRepair`, not `ninaBody`, not `NINA_TURN_BUDGET`.

**2a — the import.** `turn.ts`'s relative imports are alphabetical (`./context`, `./gateway`,
`./prompts`, …), so the new one lands between `./gateway` and `./prompts`.

Replace `lib/nina/turn.ts:7-9`:

```ts
import { buildNinaRunFact, type NinaContext, type NinaRunFact } from './context'
import { dbNinaToolGateway, dbNinaTurnStore } from './gateway'
import { NINA_REPAIR_PREAMBLE, SEND_TOOL, buildNinaSystemPrompt } from './prompts'
```

with:

```ts
import { buildNinaRunFact, type NinaContext, type NinaRunFact } from './context'
import { dbNinaToolGateway, dbNinaTurnStore } from './gateway'
import { ninaFallbackTextClient } from './llmFallbackText'
import { NINA_REPAIR_PREAMBLE, SEND_TOOL, buildNinaSystemPrompt } from './prompts'
```

**2b — `productionDeps`.** Replace the whole function at `lib/nina/turn.ts:1107-1115` (its docblock
at `:1096-1106` stays as it is; the paragraph below is APPENDED to it):

```ts
/**
 * ── AND THE CLIENT IS WRAPPED, WHICH IS THE WHOLE OF R1's TEXT PATH ───────────────────────────
 * `ninaFallbackTextClient` tries `ninaClient()` (z.ai) first and OpenRouter's
 * `z-ai/glm-5.3-flash` second, logging each failed attempt to `nina_error_logs`. **This one line
 * covers every model call a turn makes** — primary, both continuations, the prose re-ask and
 * `attemptNinaRepair`'s — because all five go through `deps.client.messages.create`, and none of
 * them can tell the difference: the fallback synthesizes an `Anthropic.Message` that
 * `findSendBlock`, `findToolUses`, `usageOf` and the `stop_reason` check read unchanged.
 *
 * `userId` is optional and defaults to null so the one production caller can attribute its log
 * rows while nothing else has to know the parameter exists. It is NOT part of `NinaTurnDeps`: a
 * turn's deps are provider-shaped, the user is turn-shaped, and `runNinaTurn` already has
 * `input.userId` in hand at the only place that constructs deps implicitly.
 */
export async function productionDeps(userId: string | null = null): Promise<NinaTurnDeps> {
  return {
    client: ninaFallbackTextClient(ninaClient(), { userId }),
    model: await ninaModel(),
    toolSet: NINA_CORE_TOOL_SET,
    gateway: dbNinaToolGateway,
    store: dbNinaTurnStore,
  }
}
```

**2c — `runNinaTurn`'s implicit deps.** Replace `lib/nina/turn.ts:1145-1147`:

```ts
  /* The model id now resolves the app_settings override, so production deps are async; a default
   * parameter cannot await, so the fallback resolves here — still once, still per call. */
  deps ??= await productionDeps()
```

with:

```ts
  /* The model id now resolves the app_settings override, so production deps are async; a default
   * parameter cannot await, so the fallback resolves here — still once, still per call. The user
   * id rides along so the OpenRouter fallback's `nina_error_logs` rows are attributable. */
  deps ??= await productionDeps(input.userId)
```

**Impact:** Production text turns now retry through OpenRouter. Every test that injects its own
`deps` (`lib/nina/turn.test.ts`, all six `runNinaTurn(input(), fakeTurnDeps(...))` call sites) is
untouched, because `deps ??=` never fires for them. The four tests that `vi.mock` `./turn` with
`productionDeps: () => ({})` are untouched by an added optional parameter.

---

### Step 3: Pass the user id from the one production caller

**File:** `lib/nina/turnrun.ts:294`
**Change:** one argument.

Replace:

```ts
      {
        ...(await productionDeps()),
        toolSet: NINA_FULL_TOOL_SET,
        store: ninaChatTurnStore(turnId),
      },
```

with:

```ts
      {
        /* `userId` so the fallback client can attribute its `nina_error_logs` rows to this runner;
         * it is the same id passed as `input.userId` twelve lines above. */
        ...(await productionDeps(userId)),
        toolSet: NINA_FULL_TOOL_SET,
        store: ninaChatTurnStore(turnId),
      },
```

`userId` is already destructured at `turnrun.ts:130` and passed as `input.userId` at `:280`.

**Impact:** none beyond the log rows' `user_id`. This is the only non-test caller of
`productionDeps` in the repo (verified by `grep -rn "productionDeps" app lib components tests scripts`).

---

### Step 4: The test

**File:** `tests/nina.llmFallbackText.test.ts` (new)
**Change:** Whole file. Conventions taken from `tests/nina.imagecall.test.ts`: `vi.fn<typeof fetch>`
(never a bare `vi.fn` — an untyped mock types its own `mock.calls` as `[]` and reading
`calls[0][1]` becomes a type error instead of an assertion), `vi.stubGlobal('fetch', …)`,
`process.env.OPENROUTER_API_KEY` set per-case, `vi.hoisted` for the mock module.

Two traps this file is written around, both real:

1. **`ninaEnv()` caches** (`lib/env.ts:222-226`): the first successful `load('nina', …)` is memoised
   for the process. `tests/support/setup.ts` deliberately does NOT default `OPENROUTER_API_KEY`, so
   the "key absent" case must be the FIRST `it()` in the file — exactly as
   `tests/nina.imagecall.test.ts:61` orders it, and for the same reason.
2. **`lib/nina/errorlogs.ts` is Phase 1's DB writer.** It is mocked, not exercised; a unit test that
   reached the real writer would try to query the dummy `DATABASE_URL` from `tests/support/setup.ts`.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type Anthropic from '@anthropic-ai/sdk'

import {
  NINA_FALLBACK_MIN_BUDGET_MS,
  ninaFallbackTextClient,
  toAnthropicMessage,
  toOpenRouterChatBody,
} from '../lib/nina/llmFallbackText.ts'
/* Phase 3's shared constants module — this phase imports them, it does not declare them. */
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from '../lib/nina/openrouter.ts'
import type { NinaLlmClientLike } from '../lib/nina/turn.ts'

/**
 * `vi.mock`'s factory is lifted above every declaration in this file, so the spy is minted in
 * `vi.hoisted` — the arrangement `tests/nina.resend.test.ts:42-54` documents.
 *
 * Phase 1 owns `logNinaError`'s real implementation and its promise never to throw. This suite
 * asserts only what THIS phase is responsible for: that it is called, once per failed attempt,
 * with the right provider/model/input, and that its own rejection cannot break the call.
 *
 * **The generic on `vi.fn` is load-bearing**, exactly as `tests/nina.imagecall.test.ts:8-13`
 * warns: a bare `vi.fn(async () => {})` types its own parameters as the empty tuple, and
 * `mock.calls[0]?.[0]` then becomes "tuple of length 0 has no element at index 0" — a type error
 * where an assertion was meant. It is spelled `Record<string, unknown>` rather than imported from
 * Phase 1 so this suite does not fail to COMPILE if Phase 1's exported row type is spelled
 * differently; the field names are asserted structurally below, which is where a mismatch should
 * surface.
 */
const { logNinaError } = vi.hoisted(() => ({
  logNinaError: vi.fn<(row: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock('../lib/nina/errorlogs.ts', () => ({ logNinaError }))

const SEND_TOOL_STUB: Anthropic.Tool = {
  name: 'send',
  description: 'Send your reply. Always answer with this tool.',
  input_schema: { type: 'object', required: ['bubbles'], properties: { bubbles: { type: 'array' } } },
}

/** What `ninaBody` (`lib/nina/turn.ts:718-743`) actually builds, reproduced field for field. */
function ninaBodyLike(
  overrides: Partial<Anthropic.MessageCreateParamsNonStreaming> = {},
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: 'glm-5.3',
    max_tokens: 2_400,
    system: 'You are Nina.',
    messages: [{ role: 'user', content: 'pagi' }],
    tools: [SEND_TOOL_STUB],
    tool_choice: { type: 'any' },
    thinking: { type: 'disabled' },
    ...overrides,
  }
}

function okCompletion(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

/** A z.ai client that always throws — the 2026-09-11 incident, in one object. */
function deadPrimary(error = new Error('Connection error.')): NinaLlmClientLike {
  return { messages: { create: vi.fn(async () => Promise.reject(error)) } }
}

describe('toOpenRouterChatBody', () => {
  it('translates the envelope `ninaBody` builds, and swaps in the fallback model', () => {
    const out = toOpenRouterChatBody(ninaBodyLike())

    expect(out.model).toBe(NINA_FALLBACK_TEXT_MODEL)
    expect(out.max_tokens).toBe(2_400)
    expect(out.reasoning).toEqual({ enabled: false })
    expect(out.messages).toEqual([
      { role: 'system', content: 'You are Nina.' },
      { role: 'user', content: 'pagi' },
    ])
    expect(out.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'send',
          description: SEND_TOOL_STUB.description,
          parameters: SEND_TOOL_STUB.input_schema,
        },
      },
    ])
    /* `{ type: 'any' }` is "call SOMETHING". */
    expect(out.tool_choice).toBe('required')
  })

  it('translates forced send — the loop’s termination property — into a function choice', () => {
    const out = toOpenRouterChatBody(
      ninaBodyLike({ tool_choice: { type: 'tool', name: 'send' }, tools: [SEND_TOOL_STUB] }),
    )
    expect(out.tool_choice).toEqual({ type: 'function', function: { name: 'send' } })
  })

  it('replays a completed tool round: assistant tool_calls, then a matching tool message', () => {
    const out = toOpenRouterChatBody(
      ninaBodyLike({
        messages: [
          { role: 'user', content: 'kemarin lari berapa?' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'sebentar ya' },
              { type: 'tool_use', id: 'toolu_01ABC', name: 'lookup_runs', input: { dates: ['2026-09-11'] } },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_01ABC', content: '{"runs":[]}' },
            ],
          },
        ],
      }),
    )

    expect(out.messages).toEqual([
      { role: 'system', content: 'You are Nina.' },
      { role: 'user', content: 'kemarin lari berapa?' },
      {
        role: 'assistant',
        content: 'sebentar ya',
        tool_calls: [
          {
            id: 'toolu_01ABC',
            type: 'function',
            function: { name: 'lookup_runs', arguments: '{"dates":["2026-09-11"]}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_01ABC', content: '{"runs":[]}' },
    ])
  })

  it('carries is_error into the tool text and drops thinking blocks', () => {
    const out = toOpenRouterChatBody(
      ninaBodyLike({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'hmm', signature: 'sig' },
              { type: 'tool_use', id: 'toolu_01X', name: 'lookup_runs', input: {} },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_01X', content: 'bad date', is_error: true },
            ],
          },
        ],
      }),
    )

    const assistant = out.messages[2]
    expect(assistant).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'toolu_01X', type: 'function', function: { name: 'lookup_runs', arguments: '{}' } },
      ],
    })
    expect(out.messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'toolu_01X',
      content: 'ERROR: bad date',
    })
  })
})

describe('toAnthropicMessage', () => {
  it('synthesizes what findSendBlock and usageOf read', () => {
    const message = toAnthropicMessage(
      {
        id: 'gen-1',
        model: NINA_FALLBACK_TEXT_MODEL,
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'send', arguments: '{"bubbles":["pagi juga"]}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1_234, completion_tokens: 56 },
      },
      NINA_FALLBACK_TEXT_MODEL,
    )

    expect(message.type).toBe('message')
    expect(message.role).toBe('assistant')
    expect(message.stop_reason).toBe('tool_use')
    expect(message.usage.input_tokens).toBe(1_234)
    expect(message.usage.output_tokens).toBe(56)

    const block = message.content[0]
    expect(block?.type).toBe('tool_use')
    if (block?.type !== 'tool_use') throw new Error('expected a tool_use block')
    expect(block.name).toBe('send')
    expect(block.input).toEqual({ bubbles: ['pagi juga'] })
    /* Anthropic-shaped, so a LATER round that succeeds at z.ai can match its tool_result. */
    expect(block.id.startsWith('toolu_')).toBe(true)
  })

  it('maps a truncated completion onto the one stop_reason turn.ts actually compares', () => {
    const message = toAnthropicMessage(
      { choices: [{ finish_reason: 'length', message: { content: 'half a sen' } }] },
      NINA_FALLBACK_TEXT_MODEL,
    )
    expect(message.stop_reason).toBe('max_tokens')
  })

  it('throws on an empty completion rather than returning a message with no blocks', () => {
    expect(() =>
      toAnthropicMessage({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }, 'x'),
    ).toThrow(/empty completion/)
  })

  it('a tool_use id survives a round trip back to the OpenAI side', () => {
    const message = toAnthropicMessage(
      {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              tool_calls: [
                { id: 'call_9', type: 'function', function: { name: 'lookup_runs', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      'x',
    )
    const use = message.content[0]
    if (use?.type !== 'tool_use') throw new Error('expected a tool_use block')

    /* Exactly what `turn.ts:1032-1033` then pushes back into the next request. */
    const next = toOpenRouterChatBody(
      ninaBodyLike({
        messages: [
          { role: 'assistant', content: message.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: '{}' }] },
        ],
      }),
    )

    const assistant = next.messages[1]
    const tool = next.messages[2]
    if (assistant?.role !== 'assistant' || tool?.role !== 'tool') {
      throw new Error('expected an assistant/tool pair')
    }
    expect(assistant.tool_calls?.[0]?.id).toBe(tool.tool_call_id)
  })
})

describe('ninaFallbackTextClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    delete process.env.OPENROUTER_API_KEY
  })

  /*
   * FIRST, and it must stay first: `ninaEnv()` memoises its first successful load for the whole
   * process (`lib/env.ts:222-226`), so once any case below sets the key this one can no longer
   * observe its absence. Same ordering constraint, same reason, as `tests/nina.imagecall.test.ts`.
   */
  it('logs the unconfigured fallback instead of hiding it, when the key is absent', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const client = ninaFallbackTextClient(deadPrimary(), { userId: 'usr_1' })

    await expect(client.messages.create(ninaBodyLike(), { timeout: 20_000 })).rejects.toThrow()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logNinaError).toHaveBeenCalledTimes(2)
    expect(logNinaError.mock.calls[1]?.[0]).toMatchObject({
      category: 'text',
      provider: 'openrouter',
      model: NINA_FALLBACK_TEXT_MODEL,
    })
    expect(String(logNinaError.mock.calls[1]?.[0]?.errorMessage)).toContain('OPENROUTER_API_KEY')
  })

  describe('with a key', () => {
    beforeEach(() => {
      process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    })

    it('does not touch OpenRouter, or the log, when z.ai answers', async () => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      const zaiMessage = { content: [], stop_reason: 'end_turn' } as unknown as Anthropic.Message
      const primary: NinaLlmClientLike = {
        messages: { create: vi.fn(async () => zaiMessage) },
      }

      const result = await ninaFallbackTextClient(primary).messages.create(ninaBodyLike(), {
        timeout: 22_000,
      })

      expect(result).toBe(zaiMessage)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(logNinaError).not.toHaveBeenCalled()
    })

    it('R1: a z.ai throw is logged and rescued by OpenRouter', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        okCompletion({
          id: 'gen-2',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'send', arguments: '{"bubbles":["halo"]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const message = await ninaFallbackTextClient(deadPrimary(), {
        userId: 'usr_1',
      }).messages.create(ninaBodyLike(), { timeout: 22_000 })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(OPENROUTER_CHAT_URL)

      const init = fetchMock.mock.calls[0]?.[1]
      const sent = JSON.parse(String(init?.body)) as { model: string; tool_choice: string }
      expect(sent.model).toBe(NINA_FALLBACK_TEXT_MODEL)
      expect(sent.tool_choice).toBe('required')

      const send = message.content[0]
      if (send?.type !== 'tool_use') throw new Error('expected a tool_use block')
      expect(send.name).toBe('send')
      expect(send.input).toEqual({ bubbles: ['halo'] })

      /* ONE row: the z.ai attempt that failed. The rescue itself is not a failure. */
      expect(logNinaError).toHaveBeenCalledTimes(1)
      expect(logNinaError.mock.calls[0]?.[0]).toMatchObject({
        category: 'text',
        provider: 'zai',
        model: 'glm-5.3',
        userId: 'usr_1',
        timeoutMs: 22_000,
        imageUrl: null,
      })
      expect(String(logNinaError.mock.calls[0]?.[0]?.fullInput)).toContain('You are Nina.')
    })

    it('R2: both providers failing writes two rows and still rejects', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => new Response('upstream is on fire', { status: 502 })),
      )

      await expect(
        ninaFallbackTextClient(deadPrimary()).messages.create(ninaBodyLike(), { timeout: 22_000 }),
      ).rejects.toThrow(/openrouter HTTP 502/)

      expect(logNinaError).toHaveBeenCalledTimes(2)
      expect(logNinaError.mock.calls[0]?.[0]).toMatchObject({ provider: 'zai' })
      expect(logNinaError.mock.calls[1]?.[0]).toMatchObject({
        provider: 'openrouter',
        model: NINA_FALLBACK_TEXT_MODEL,
      })
      /* The OpenRouter row's `fullInput` is the TRANSLATED payload, not the Anthropic one. */
      expect(String(logNinaError.mock.calls[1]?.[0]?.fullInput)).toContain(NINA_FALLBACK_TEXT_MODEL)
    })

    it('skips the fallback, and rethrows z.ai’s own error, with no budget left', async () => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      const zaiError = new Error('Connection error.')
      await expect(
        ninaFallbackTextClient(deadPrimary(zaiError)).messages.create(ninaBodyLike(), {
          timeout: NINA_FALLBACK_MIN_BUDGET_MS - 1,
        }),
      ).rejects.toBe(zaiError)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(logNinaError).toHaveBeenCalledTimes(1)
    })

    it('a log write that rejects cannot cost a reply that succeeded', async () => {
      logNinaError.mockRejectedValueOnce(new Error('nina_error_logs is unreachable'))
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () =>
          okCompletion({ choices: [{ finish_reason: 'stop', message: { content: 'halo' } }] }),
        ),
      )

      const message = await ninaFallbackTextClient(deadPrimary()).messages.create(ninaBodyLike(), {
        timeout: 22_000,
      })

      const block = message.content[0]
      expect(block?.type).toBe('text')
    })

    it('serves a whole multi-round turn from one client instance', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        okCompletion({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                tool_calls: [
                  { id: 'call_r', type: 'function', function: { name: 'send', arguments: '{}' } },
                ],
              },
            },
          ],
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const client = ninaFallbackTextClient(deadPrimary(), { userId: 'usr_1' })

      /* `MAX_TOOL_ROUNDS + 1` calls on ONE client, as `runNinaTurnWith`'s loop makes them. */
      for (let call = 0; call < 3; call++) {
        await client.messages.create(ninaBodyLike(), { timeout: 20_000 })
      }

      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(logNinaError).toHaveBeenCalledTimes(3)
      for (const call of logNinaError.mock.calls) {
        expect(call[0]).toMatchObject({ category: 'text', provider: 'zai' })
      }
    })
  })
})
```

**Impact:** ~15 new assertions, no existing test modified.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`)
**Tests:**

```
npm test
npm run ci:openrouter-guard
npm run lint
npm run format:check
```

`vitest` does not typecheck (only `tsc --noEmit` does), so `npm run typecheck` is a hard gate here
— the synthesized `Anthropic.Message` literal is the part most likely to break on an SDK bump, and
`vitest` would pass with it broken.

**Manual check:**

- `grep -n "deps.client.messages.create" lib/nina/turn.ts` still returns exactly two hits
  (`:910` and `:1074`) — this phase adds no third call site and removes neither.
- `git diff --stat lib/nina/turn.ts` shows a single-digit line count. A large diff means the loop
  was touched, which this phase forbids.
- `npm run ci:openrouter-guard` prints its OK line naming `lib/nina/` and `lib/env.ts`.
- `grep -rn "OPENROUTER_CHAT_URL\s*=\|NINA_FALLBACK_TEXT_MODEL\s*=" lib/` returns **exactly two
  hits, both in `lib/nina/openrouter.ts`**. A third hit means this phase redeclared a constant Phase
  3 owns, which is the duplication the reconciler removed.

**Exit criteria:**

1. `npm run typecheck`, `npm test`, `npm run lint`, `npm run ci:openrouter-guard` all pass.
2. `lib/nina/turn.test.ts`'s existing suite passes **unmodified** — it injects its own `deps`, so
   the fallback is never constructed there.
3. `tests/nina.llmFallbackText.test.ts` proves: z.ai success means no fetch and no log row; a z.ai
   throw means one log row and an OpenRouter call whose synthesized reply carries a readable `send`
   tool_use; a double failure means two log rows and a rejection; a starved budget skips the
   fallback; and one client instance serves three consecutive calls independently.
4. `productionDeps()` is the only line of `turn.ts` whose behaviour changed.

## Handoffs

- **Phase 1 (R1/R2) — the nullable `user_id`.** **Resolved:** Phase 1's column is nullable and its
  `userId` field optional, confirmed against its Drizzle definition and its schema pin. This was the
  one cross-phase fact that could have broken silently, because a failed log write is swallowed by
  design.
- **Phase 3 (R1) — the vision path's fallback, and the shared constants.** **Resolved:** the two
  constants live in `lib/nina/openrouter.ts`, which Phase 3 creates; this phase imports them and
  declares neither, and carries a `depends_on` edge to Phase 3 so the file exists first. Nothing
  else is shared in either direction — `lib/nina/vision.ts` is OpenAI-Chat-Completions on both sides
  and needs no translation layer, and `toOpenRouterChatBody`/`toAnthropicMessage` are
  Anthropic-shaped and have no use there.
- **Phase 5 (R2) — rendering.** `timeoutMs` is stored as an integer (e.g. `22000`) and
  `error_message` does NOT contain the "300s" string the user asked for. The admin page composes
  them (`"…  (timeout 22s)"`). Named here so nobody assumes this phase pre-rendered it.
- **Not done, deliberately:** the primary z.ai model stays operator-selectable through
  `app_settings.text_model` while the fallback is a constant; no fallback for `lib/llm/narrate.ts`'s
  run-insight narration (not in R1's scope, different feature, different budget); no second retry
  and no third provider; `NINA_TURN_BUDGET` unchanged, so a turn where z.ai times out at its full
  ceiling and OpenRouter then answers can take up to ~2× the per-call ceiling — still far inside
  `NINA_BACKGROUND_BUDGET_MS` (240 s) and the route's `maxDuration = 300`. Raising the budgets to
  account for two providers is a measurement nobody has taken yet.

## Rollback

Single-commit revert. If it must be unpicked by hand:

1. `lib/nina/turn.ts:1107` — `client: ninaFallbackTextClient(ninaClient(), { userId })` back to
   `client: ninaClient()`; drop the `userId` parameter; drop the `./llmFallbackText` import; revert
   `deps ??= await productionDeps(input.userId)` to `deps ??= await productionDeps()`.
2. `lib/nina/turnrun.ts:294` — `productionDeps(userId)` back to `productionDeps()`.
3. `rm lib/nina/llmFallbackText.ts tests/nina.llmFallbackText.test.ts`. **Leave
   `lib/nina/openrouter.ts` in place** — it belongs to Phase 3 and `lib/nina/vision.ts` imports it.

Nothing in the database, no migration, no other module imports this file. Steps 2 and 3 alone
disarm the fallback while leaving the code in the tree — the useful halfway point if OpenRouter
itself turns out to be the problem.
