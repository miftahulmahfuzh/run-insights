import 'server-only'

import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type Anthropic from '@anthropic-ai/sdk'

import {
  NINA_CAPTION_TOOL,
  buildNinaCaptionRequest,
  buildNinaCaptionSystemPrompt,
  parseNinaCaption,
  type NinaCaptionSeenKind,
} from './prompts/caption'
import type { NinaTuning } from './tuning'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  ONE `glm-5.3` CALL THAT PUTS ONE LINE UNDER ONE PHOTOGRAPH — the impure half.
 *
 *  Contract, `lib/nina/autotitle.ts`'s: **one call -> parse -> silence.** Nothing here throws for
 *  a model problem, and nothing is persisted when it fails. Degrading means the caller keeps the
 *  `ninaImageCaption` line that is already on the row — a sentence that is true of any
 *  photograph, which is what `NINA_IMAGE_CAPTION_POOL` now guarantees.
 *
 *  ── WHY IT IS NEVER ON A RESPONSE PATH ──────────────────────────────────────────────────────
 *  Both callers run it inside `after()`. `scheduleChatPhotoDescribe`'s arithmetic is the reason
 *  and it is unchanged: Next dispatches Server Actions one at a time per client, so an awaited
 *  describe (~8-11 s) plus this call (~4-8 s) would add ~15-25 s to EVERY admin add, in series
 *  across a multi-photo session. `scripts/check-llm-payload-boundary.mjs` names
 *  `captionNinaPhoto` and sanctions exactly this file and the two wiring modules.
 *
 *  ── AND WHY THERE IS NO REPAIR ROUND TRIP ───────────────────────────────────────────────────
 *  `autotitle.ts`'s ruling, and it holds harder here: a single short line cannot be malformed in a
 *  way worth describing back. An empty string is an answer the prompt explicitly asks for, and a
 *  refused line means the fallback is correct rather than that the model needs another go.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * MEASURED-DERIVED, and this ceiling is LOW on purpose. The payload is one line of at most 120
 * characters — under 40 output tokens — so every token below the ceiling is headroom for a
 * `thinking` block nobody asked for. The 2026-09-03 probe recorded one arriving on this endpoint
 * with `thinking: { type: 'disabled' }` set, which is why the flag is sent and not relied on.
 *
 * 400 rather than `NINA_TITLE_MAX_TOKENS`'s 600, for the same reason that number is not 2400:
 * **output tokens are wall clock** at ~26-33 ms each (F04). 400 is ~10-13 s worst case, and this
 * call shares its `after()` segment with a describe call that has already spent 8-11 s of the same
 * 60 s function. A `max_tokens` stop is treated as "no caption" and the fallback stands — F07
 * settled that raising a ceiling is not the fix for a thinking model.
 */
export const NINA_CAPTION_MAX_TOKENS = 400

/**
 * Twelve seconds, `NINA_TITLE_TIMEOUT_MS`'s number and its reasoning. Fifteen measured calls on
 * this endpoint ran 10.2-16.4 s for a five-field narrative; the 2026-09-03 Nina probe measured a
 * real round at 6.2 s. This request carries one paragraph and returns one line, so it sits at the
 * bottom of that range — and 12 s is what leaves the describe call whole inside one segment.
 */
export const NINA_CAPTION_TIMEOUT_MS = 12_000

/**
 * The injection seam, declared here rather than imported from `lib/nina/autotitle.ts` —
 * `distill.ts` and `autotitle.ts` both made this call and gave the reason: "six lines duplicated
 * beats a coupling".
 */
export interface CaptionClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export interface NinaCaptionRequest {
  /**
   * What is in the photograph, in prose. `glm-4.6v`'s description for `'described'`, or
   * `NinaSelfieRequest.scene` for `'requested'`.
   */
  seen: string
  seenKind: NinaCaptionSeenKind
  /**
   * Read live by the CALLER, no cache — `lib/nina/selfiegen.ts`'s rule: *"A wardrobe saved on
   * /admin/nina thirty seconds ago is in this prompt."* Passed in rather than fetched here so this
   * module holds no database import and stays testable with no store.
   */
  tuning: NinaTuning
}

/**
 * SCANS the content array rather than reading `content[0]` — `distill.ts` recorded a `thinking`
 * block arriving in front of the answer, and "a reader that read the first block would have failed
 * on round 1 of that very probe".
 */
function findCaptionBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === NINA_CAPTION_TOOL.name) return block
  }
  return null
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function captionNinaPhotoWith(
  client: CaptionClientLike,
  request: NinaCaptionRequest,
  options: { model: string },
): Promise<string | null> {
  const userTurn = buildNinaCaptionRequest(request.seen, request.seenKind)
  /* Nothing to caption — an empty or whitespace-only description. No call, no tokens. */
  if (userTurn === null) return null

  let message: Anthropic.Message
  try {
    message = await client.messages.create(
      {
        model: options.model,
        max_tokens: NINA_CAPTION_MAX_TOKENS,
        system: buildNinaCaptionSystemPrompt(request.tuning),
        messages: [{ role: 'user', content: userTurn }],
        tools: [NINA_CAPTION_TOOL],
        tool_choice: { type: 'tool', name: NINA_CAPTION_TOOL.name },
        /* Kept, not relied on — see the budget note above. */
        thinking: { type: 'disabled' },
      },
      { timeout: NINA_CAPTION_TIMEOUT_MS },
    )
  } catch (cause) {
    /* Never `console.error`: a photograph that kept its canned line is an expected state of this
     * feature, and that line is true of any photograph. */
    console.warn('[nina.caption] call failed', { error: String(cause) })
    return null
  }

  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina.caption] response hit the token ceiling', {
      maxTokens: NINA_CAPTION_MAX_TOKENS,
    })
    return null
  }

  const block = findCaptionBlock(message)
  if (block === null) return null
  return parseNinaCaption(block.input)
}

/**
 * **The wired pass, and the symbol the payload-boundary guard names.**
 *
 * Two callers, both inside `after()`: `lib/admin/chatPhotoActions.ts` (a photograph an operator
 * dropped into the collection, described by `glm-4.6v` first) and `lib/nina/imagerun.ts` (a selfie
 * she generated, whose scene is already in hand).
 *
 * **Never throws.** It runs where a rejection is a log line and nothing else, and a photograph
 * wearing a canned caption is a cosmetic state with a true sentence on it.
 */
export async function captionNinaPhoto(
  request: NinaCaptionRequest,
  deps: { client?: CaptionClientLike; model?: string } = {},
): Promise<string | null> {
  try {
    return await captionNinaPhotoWith(deps.client ?? narrativeClient(), request, {
      model: deps.model ?? narrativeModel(),
    })
  } catch (cause) {
    /* `narrativeClient()` itself can throw — it reads `@/lib/env`. Belt and braces, because this
     * function's whole contract with both callers is that it never throws. */
    console.warn('[nina.caption] pass failed', { error: String(cause) })
    return null
  }
}
