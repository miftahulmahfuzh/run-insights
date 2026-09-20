import 'server-only'

import { z } from 'zod'

import { narrativeClient } from '@/lib/llm/client'
import { narrativeModel } from '@/lib/llm/textModel'
import type Anthropic from '@anthropic-ai/sdk'

import {
  NINA_CAMERA_ANGLE_SPECS,
  NINA_IMAGE_TEXT_KEYS,
  NINA_IMAGE_TEXT_SPECS,
  coerceNinaImageText,
  type NinaCameraAngleKey,
  type NinaImageTextKey,
} from './imageprefs'

/**
 * **The 2026-09-20 fix for a Notes suggestion that fights the camera.** Measured: with
 * `cameraAngle: 'overhead'` saved, this module still proposed "She jogs along the wet sand" — a
 * standing, ground-level action a drone directly above her could not have framed. Notes is the
 * field that names her body's position and action, so it is the one field a camera-angle mismatch
 * actually breaks; the other four (wardrobe, venue, time, expression) don't claim a pose and are
 * left alone. Phrased as guidance for the MODEL, not a fixed list the operator sees, so it still
 * reads like every other style example above it.
 */
const NINA_IMAGE_FIELD_GEN_NOTES_ANGLE_GUIDANCE: Readonly<Record<NinaCameraAngleKey, string>> =
  Object.freeze({
    eye_level:
      'The camera is a normal few-steps-away, eye-level shot — any natural standing, walking, sitting or reclining action fits.',
    overhead:
      'The camera is a drone directly overhead, looking straight down — she must be lying flat on a horizontal surface beneath it. Only a prone or supine position reads correctly from this angle: lying on her back, lying face-down, lying on her back with her knees bent, lying on her back with her hands cushioning her head, lying face-down with her head resting on her forearms, or a close variation. Never standing, walking, running, sitting upright, or any action that implies a horizon or a ground-level vantage.',
    low_angle:
      'The camera is low to the ground near her feet, looking up along her body — an action that reads naturally from below works: standing over the lens, walking toward it, or looking down at it. Avoid an action that assumes an eye-level or overhead vantage.',
    from_behind:
      'The camera is directly behind her at hip height — the action must keep her back and butt toward the lens; her face need not be visible and she should not turn to face the camera.',
  })

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
  /** The browser's current DRAFT of all five fields — including unsaved edits — so a Wardrobe
   * suggestion can read what Venue and Time already say, for one coherent scene. Never the saved
   * row: an admin mid-edit has not committed yet, and the generation must see what they typed. */
  currentText: Readonly<Record<NinaImageTextKey, string>>
  /** This field's past suggestions, in any order — the "do not repeat these" list. */
  recentValues: readonly string[]
  /** The saved `/admin/image-generation` camera-angle preset — always read from the row, never
   * from a draft, because the dropdown commits on change and has no unsaved-edit state the way the
   * text fields do (`lib/admin/imageGenActions.ts`'s own docstring on the panel's commit rule). */
  cameraAngle: NinaCameraAngleKey
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
    '',
    `Camera angle for this photograph: ${NINA_CAMERA_ANGLE_SPECS[request.cameraAngle].label}`,
  ]
  if (request.field === 'notes') {
    lines.push(NINA_IMAGE_FIELD_GEN_NOTES_ANGLE_GUIDANCE[request.cameraAngle])
  }

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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  ONE CALL THAT PROPOSES ALL FIVE FIELDS AT ONCE — the 2026-09-18 icon's sibling.
 *
 *  The single-field pass above is one click, one field, one call — an operator who wants all five
 *  refreshed pays for five separate round-trips. This is the batch version: one `glm-5.3` call,
 *  one tool with all five properties required, so the model proposes a coherent scene in a single
 *  response instead of five independent ones that happen to agree.
 *
 *  Same never-throws contract as the single-field pass, but with the one difference the user asked
 *  for: a malformed or partially-invalid response gets ONE repair round-trip (`narrate.ts`'s
 *  primary → Zod → one repair → silence shape) before giving up, because discarding a whole
 *  five-field batch over one field's stray quote mark is a worse trade here than it is for a
 *  single field the operator can just re-click.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Five short lines instead of one — `imagefieldgen`'s single-field number, roughly ×3 for the
 * extra fields plus headroom for a `thinking` block. */
const IMAGE_FIELD_GEN_ALL_MAX_TOKENS = 900
/** The single-field timeout's own number: short answers sit at the bottom of the measured
 * 6.2–16.4 s range for this endpoint, and five short answers in one call are still one call. */
const IMAGE_FIELD_GEN_ALL_TIMEOUT_MS = 16_000
/** The repair call's own, separate budget — `narrate.ts`'s `BUDGET.session.repair` shape, sized
 * down for this much smaller payload. */
const IMAGE_FIELD_GEN_ALL_REPAIR_TIMEOUT_MS = 12_000

export interface ImageFieldGenAllRequest {
  /** Every field's own past suggestions, in any order — one avoid-list per field, the single-field
   * pass's `recentValues` but for all five at once. */
  recentValues: Readonly<Record<NinaImageTextKey, readonly string[]>>
  /**
   * The 2026-09-20 "Admin request" box, hand-typed right before the click — *"pool table"*,
   * *"laying on her chest playing PS5"*. `undefined` or `''` means the operator left it blank,
   * which is the common case and changes nothing about the call. When it is non-empty it is the
   * scene's STARTING POINT: the five fields are built around it rather than proposed independently,
   * because the measured complaint was the model settling into the same handful of scenes when
   * given no anchor at all.
   */
  adminRequest?: string
  /** The saved camera-angle preset — `ImageFieldGenRequest.cameraAngle`'s own reason: read from
   * the row, never from a draft, since the dropdown commits on change. */
  cameraAngle: NinaCameraAngleKey
}

const ImageFieldGenAllSchema = z.object({
  wardrobe: z.string().trim().min(1).max(NINA_IMAGE_TEXT_SPECS.wardrobe.max),
  venue: z.string().trim().min(1).max(NINA_IMAGE_TEXT_SPECS.venue.max),
  time: z.string().trim().min(1).max(NINA_IMAGE_TEXT_SPECS.time.max),
  notes: z.string().trim().min(1).max(NINA_IMAGE_TEXT_SPECS.notes.max),
  expression: z.string().trim().min(1).max(NINA_IMAGE_TEXT_SPECS.expression.max),
})

export type ImageFieldGenAllValues = z.infer<typeof ImageFieldGenAllSchema>

const IMAGE_FIELD_GEN_ALL_TOOL: Anthropic.Tool = {
  name: 'field_values',
  description: 'Propose fresh values for all five fields of this photograph — one coherent scene.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [...NINA_IMAGE_TEXT_KEYS],
    properties: Object.fromEntries(
      NINA_IMAGE_TEXT_KEYS.map((key) => [
        key,
        {
          type: 'string',
          maxLength: NINA_IMAGE_TEXT_SPECS[key].max,
          description:
            `REQUIRED. One line for "${NINA_IMAGE_TEXT_SPECS[key].label}", in the style of its ` +
            'example and within its character limit. No label, no quotes, no markdown.',
        },
      ]),
    ),
  },
}

const IMAGE_FIELD_GEN_ALL_SYSTEM_PROMPT = `You propose values for all five fields of a photograph's setup form, in one pass. You are a copywriter, not a participant: you never address anyone, you never explain a choice, and you never describe a person.

Return all five values through the "field_values" tool. Nothing else — no labels, no quotes, no markdown, no trailing period unless a field's style example has one.

Stay inside each field's own character limit. Match the style and level of detail of each field's example. The five values describe ONE photograph, so they must plausibly belong in the same scene together — do not contradict each other. Never repeat, or closely paraphrase, a value listed as already used for that field.

When an admin request names a starting point for the scene, treat it as the anchor: the five fields must plausibly belong to THAT scene rather than a generic or previously-used one, even if it means departing from your usual defaults.`

function buildImageFieldGenAllRequest(request: ImageFieldGenAllRequest): string {
  const lines: string[] = []
  const adminRequest = request.adminRequest?.trim()
  if (adminRequest !== undefined && adminRequest !== '') {
    lines.push(
      `Admin's requested starting point for this photograph: "${adminRequest}"`,
      'Build the five fields around this scene rather than proposing an independent one.',
      '',
    )
  }
  lines.push(
    `Camera angle for this photograph: ${NINA_CAMERA_ANGLE_SPECS[request.cameraAngle].label}`,
    '',
  )
  for (const key of NINA_IMAGE_TEXT_KEYS) {
    const spec = NINA_IMAGE_TEXT_SPECS[key]
    lines.push(
      `Field: ${spec.label}`,
      `What it means: ${spec.userSaid}`,
      `Style example: "${spec.placeholder}"`,
      `Character limit: ${spec.max}`,
    )
    if (key === 'notes') {
      lines.push(NINA_IMAGE_FIELD_GEN_NOTES_ANGLE_GUIDANCE[request.cameraAngle])
    }
    const recent = request.recentValues[key]
    if (recent.length > 0) {
      lines.push('Already used for this field — do not repeat or paraphrase any of these:')
      for (const value of recent) lines.push(`- ${value}`)
    }
    lines.push('')
  }
  lines.push(
    'Propose one fresh, coherent value for each of the five fields through the field_values tool.',
  )
  return lines.join('\n')
}

/** `describeInsightIssues`'s own shape (`lib/llm/schema.ts`) — kept local rather than imported,
 * this module's own header's reason: "six lines duplicated beats a coupling". */
function describeImageFieldGenAllIssues(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(error)
  return issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}

/** `findImageFieldGenBlock`'s own reason: a `thinking` block can arrive in front of the answer. */
function findImageFieldGenAllBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === IMAGE_FIELD_GEN_ALL_TOOL.name) return block
  }
  return null
}

/** The same normaliser every field's own value goes through — collapses whitespace and cuts at
 * that field's own cap, so a suggestion can never violate the bound the input enforces. `null`
 * when any one field clamps to empty: a batch that is missing a field is not a usable batch. */
function coerceImageFieldGenAllValues(
  parsed: ImageFieldGenAllValues,
): ImageFieldGenAllValues | null {
  const out: Record<NinaImageTextKey, string> = {
    wardrobe: '',
    venue: '',
    time: '',
    notes: '',
    expression: '',
  }
  for (const key of NINA_IMAGE_TEXT_KEYS) {
    const value = coerceNinaImageText(key, parsed[key])
    if (value === '') return null
    out[key] = value
  }
  return out
}

function baseAllBody(
  model: string,
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: IMAGE_FIELD_GEN_ALL_MAX_TOKENS,
    system: IMAGE_FIELD_GEN_ALL_SYSTEM_PROMPT,
    messages,
    tools: [IMAGE_FIELD_GEN_ALL_TOOL],
    tool_choice: { type: 'tool', name: IMAGE_FIELD_GEN_ALL_TOOL.name },
    /* Kept, not relied on — the single-field pass's note: a `thinking` block has arrived on this
     * endpoint with the flag set anyway. */
    thinking: { type: 'disabled' },
  }
}

/**
 * The one repair round-trip. `narrate.ts`'s `attemptRepair`, shaped the same way and for the same
 * reason: user → assistant(echoed malformed JSON) → user(issues), not a `tool_result` block —
 * this endpoint is only Anthropic-*compatible*, and the plain three-turn text shape is the one
 * idiom this repo already trusts against it.
 */
async function attemptImageFieldGenAllRepair(
  client: ImageFieldGenClientLike,
  model: string,
  messages: Anthropic.MessageParam[],
  malformed: unknown,
  issues: string,
): Promise<ImageFieldGenAllValues | null> {
  const repairMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(malformed) },
    {
      role: 'user',
      content:
        'That did not fit the field_values tool:\n' +
        issues +
        '\n\nReuse exactly what you already had except where it was flagged, and call ' +
        'field_values again with all five fields corrected.',
    },
  ]

  let message: Anthropic.Message
  try {
    message = await client.messages.create(baseAllBody(model, repairMessages), {
      timeout: IMAGE_FIELD_GEN_ALL_REPAIR_TIMEOUT_MS,
    })
  } catch (cause) {
    console.warn('[nina.imagefieldgen] batch repair call failed', { error: String(cause) })
    return null
  }

  if (message.stop_reason === 'max_tokens') return null
  const block = findImageFieldGenAllBlock(message)
  if (block === null) return null
  const parsed = ImageFieldGenAllSchema.safeParse(block.input)
  if (!parsed.success) return null
  return coerceImageFieldGenAllValues(parsed.data)
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function generateAllImageFieldValuesWith(
  client: ImageFieldGenClientLike,
  request: ImageFieldGenAllRequest,
  options: { model: string },
): Promise<ImageFieldGenAllValues | null> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildImageFieldGenAllRequest(request) },
  ]

  let message: Anthropic.Message
  try {
    message = await client.messages.create(baseAllBody(options.model, messages), {
      timeout: IMAGE_FIELD_GEN_ALL_TIMEOUT_MS,
    })
  } catch (cause) {
    /* Never `console.error`: a click that produced no suggestion is an expected state of this
     * feature, and every field is simply left as it was. */
    console.warn('[nina.imagefieldgen] batch call failed', { error: String(cause) })
    return null
  }

  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina.imagefieldgen] batch response hit the token ceiling', {
      maxTokens: IMAGE_FIELD_GEN_ALL_MAX_TOKENS,
    })
    return null
  }

  const block = findImageFieldGenAllBlock(message)
  if (block === null) return null

  const parsed = ImageFieldGenAllSchema.safeParse(block.input)
  if (parsed.success) return coerceImageFieldGenAllValues(parsed.data)

  return attemptImageFieldGenAllRepair(
    client,
    options.model,
    messages,
    block.input,
    describeImageFieldGenAllIssues(parsed.error),
  )
}

/**
 * **The wired pass, and the symbol the payload-boundary guard names.** Called from exactly one
 * place: `generateAllImageFieldValuesAction` (`lib/admin/imageGenActions.ts`), a Server Action
 * fired by the "regenerate all" icon in the panel header.
 *
 * **Never throws.** A click that yields nothing leaves every field exactly as it was; the operator
 * can just click again, or fall back to the single-field icons.
 */
export async function generateAllImageFieldValues(
  request: ImageFieldGenAllRequest,
  deps: { client?: ImageFieldGenClientLike; model?: string } = {},
): Promise<ImageFieldGenAllValues | null> {
  try {
    return await generateAllImageFieldValuesWith(deps.client ?? narrativeClient(), request, {
      model: deps.model ?? (await narrativeModel()),
    })
  } catch (cause) {
    /* `narrativeClient()` itself can throw — it reads `@/lib/env`. Belt and braces: this
     * function's whole contract with its one caller is that it never throws. */
    console.warn('[nina.imagefieldgen] batch pass failed', { error: String(cause) })
    return null
  }
}
