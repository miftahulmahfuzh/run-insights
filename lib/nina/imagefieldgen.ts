import 'server-only'

import { narrativeClient } from '@/lib/llm/client'
import { narrativeModel } from '@/lib/llm/textModel'
import type Anthropic from '@anthropic-ai/sdk'

import { NINA_IMAGE_TEXT_SPECS, coerceNinaImageText, type NinaImageTextKey } from './imageprefs'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  ONE `glm-5.3` CALL THAT PROPOSES ONE FRESH LINE FOR ONE `/admin/image-generation` FIELD.
 *
 *  Contract, `lib/nina/autotitle.ts`'s: **one call -> parse -> silence.** Nothing here throws for
 *  a model problem, and nothing is recorded when it fails — `lib/admin/imageGenActions.ts` writes
 *  a `nina_image_field_history` row only for a value this module actually returned, so a failed
 *  attempt costs nothing and leaves no gap in the avoid-list.
 *
 *  ── WHY THIS IS NEVER AWAITED FROM A PAGE RENDER ────────────────────────────────────────────
 *  It runs from `generateImageFieldValueAction`, a Server Action fired by the icon beside the
 *  field's label — never from `app/admin/image-generation/page.tsx`, which renders the saved row
 *  and awaits no model. `scripts/check-llm-payload-boundary.mjs` names `generateImageFieldValue`
 *  and sanctions exactly this file and that action module.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/** One short line, well under 40 output tokens — headroom is for a `thinking` block, not a wait. */
const NINA_IMAGE_FIELD_GEN_MAX_TOKENS = 300
/** `autotitle.ts`'s number for the same reason: a short answer sits at the bottom of the measured
 * 6.2-16.4 s range for this endpoint. */
const NINA_IMAGE_FIELD_GEN_TIMEOUT_MS = 12_000

/** The injection seam — `autotitle.ts`/`caption.ts`'s own duplicated seven lines, for their reason:
 * "six lines duplicated beats a coupling". */
export interface ImageFieldGenClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export interface ImageFieldGenRequest {
  field: NinaImageTextKey
  /** The browser's current DRAFT of all four fields — including unsaved edits — so a Wardrobe
   * suggestion can read what Venue and Time already say, for one coherent scene. Never the saved
   * row: an admin mid-edit has not committed yet, and the generation must see what they typed. */
  currentText: Readonly<Record<NinaImageTextKey, string>>
  /** This field's past suggestions, in any order — the "do not repeat these" list. */
  recentValues: readonly string[]
}

const IMAGE_FIELD_GEN_TOOL: Anthropic.Tool = {
  name: 'field_value',
  description: 'Propose one fresh value for this image-generation field.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['value'],
    properties: {
      value: {
        type: 'string',
        description:
          'REQUIRED. One line for this field, in the style of its example and within its ' +
          'character limit. No label, no quotes, no markdown.',
      },
    },
  },
}

const IMAGE_FIELD_GEN_SYSTEM_PROMPT = `You propose one short value for a single field of a photograph's setup form. You are a copywriter, not a participant: you never address anyone, you never explain a choice, and you never describe a person.

Return the value through the "field_value" tool. Nothing else — no label, no quotes, no markdown, no trailing period unless the style example has one.

Stay inside the field's stated character limit. Match the style and level of detail of its example. When other fields for the same photograph are shown, choose something that plausibly belongs in the same scene — do not contradict them. Never repeat, or closely paraphrase, a value listed as already used.`

function buildImageFieldGenRequest(request: ImageFieldGenRequest): string {
  const spec = NINA_IMAGE_TEXT_SPECS[request.field]
  const lines = [
    `Field: ${spec.label}`,
    `What it means: ${spec.userSaid}`,
    `Style example: "${spec.placeholder}"`,
    `Character limit: ${spec.max}`,
  ]

  const others = (Object.keys(request.currentText) as NinaImageTextKey[])
    .filter((key) => key !== request.field && request.currentText[key] !== '')
    .map((key) => `${NINA_IMAGE_TEXT_SPECS[key].label}: ${request.currentText[key]}`)
  if (others.length > 0) {
    lines.push('', 'Already set for this same photograph:', ...others)
  }

  if (request.recentValues.length > 0) {
    lines.push('', 'Already used for this field — do not repeat or paraphrase any of these:')
    for (const value of request.recentValues) lines.push(`- ${value}`)
  }

  lines.push('', 'Propose one fresh value through the field_value tool.')
  return lines.join('\n')
}

/** Scans the content array rather than reading `content[0]` — `distill.ts`'s measured lesson: a
 * `thinking` block can arrive in front of the answer. */
function findImageFieldGenBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === IMAGE_FIELD_GEN_TOOL.name) return block
  }
  return null
}

function parseImageFieldGenValue(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const value = (raw as { value?: unknown }).value
  return typeof value === 'string' ? value : null
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function generateImageFieldValueWith(
  client: ImageFieldGenClientLike,
  request: ImageFieldGenRequest,
  options: { model: string },
): Promise<string | null> {
  let message: Anthropic.Message
  try {
    message = await client.messages.create(
      {
        model: options.model,
        max_tokens: NINA_IMAGE_FIELD_GEN_MAX_TOKENS,
        system: IMAGE_FIELD_GEN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildImageFieldGenRequest(request) }],
        tools: [IMAGE_FIELD_GEN_TOOL],
        tool_choice: { type: 'tool', name: IMAGE_FIELD_GEN_TOOL.name },
        /* Kept, not relied on — `autotitle.ts`'s note: a `thinking` block has arrived on this
         * endpoint with the flag set anyway. */
        thinking: { type: 'disabled' },
      },
      { timeout: NINA_IMAGE_FIELD_GEN_TIMEOUT_MS },
    )
  } catch (cause) {
    /* Never `console.error`: a click that produced no suggestion is an expected state of this
     * feature, and the field is simply left as it was. */
    console.warn('[nina.imagefieldgen] call failed', { error: String(cause) })
    return null
  }

  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina.imagefieldgen] response hit the token ceiling', {
      maxTokens: NINA_IMAGE_FIELD_GEN_MAX_TOKENS,
    })
    return null
  }

  const block = findImageFieldGenBlock(message)
  if (block === null) return null
  const raw = parseImageFieldGenValue(block.input)
  if (raw === null) return null

  /* The same normaliser `writeNinaImagePrefs` runs on a saved value — collapses whitespace and
   * cuts at this field's own cap — so a suggestion can never violate the bound the input enforces. */
  const value = coerceNinaImageText(request.field, raw)
  return value === '' ? null : value
}

/**
 * **The wired pass, and the symbol the payload-boundary guard names.** Called from exactly one
 * place: `generateImageFieldValueAction` (`lib/admin/imageGenActions.ts`), a Server Action fired
 * by the generate icon.
 *
 * **Never throws.** A click that yields nothing leaves the field exactly as it was; the operator
 * can just click again.
 */
export async function generateImageFieldValue(
  request: ImageFieldGenRequest,
  deps: { client?: ImageFieldGenClientLike; model?: string } = {},
): Promise<string | null> {
  try {
    return await generateImageFieldValueWith(deps.client ?? narrativeClient(), request, {
      model: deps.model ?? (await narrativeModel()),
    })
  } catch (cause) {
    /* `narrativeClient()` itself can throw — it reads `@/lib/env`. Belt and braces: this
     * function's whole contract with its one caller is that it never throws. */
    console.warn('[nina.imagefieldgen] pass failed', { error: String(cause) })
    return null
  }
}
