import type Anthropic from '@anthropic-ai/sdk'

import {
  JAKARTA_REGISTER,
  JAKARTA_SLANG_BLOCK,
  VOICE_EXAMPLES_BLOCK,
  ninaGirlfriendVoiceBlock,
  ninaManjaRegisterBlock,
  ninaNeverSayBlock,
} from '../persona'
import type { NinaTuning } from '../tuning'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  ONE LINE UNDER A PHOTOGRAPH OF HERS, IN HER VOICE — the pure half.
 *
 *  This file is pure: prompt text, a tool schema, and the rules that decide whether what came
 *  back may be said. The model call is `lib/nina/caption.ts`, alone. The split is
 *  `lib/nina/title.ts` beside `lib/nina/autotitle.ts`, for the reason that file gives: every rule
 *  below is unit-testable under `environment: 'node'` without importing a client.
 *
 *  ── NO `import 'server-only'`, EVER ─────────────────────────────────────────────────────────
 *  `../persona` and `../tuning` are both pure by their own headers, and `/admin/nina` renders a
 *  character preview from `persona.ts` in a client component. A runtime import from `@/lib/llm/*`,
 *  `@/lib/env` or `./queries` does not belong here.
 *
 *  ── AND IT IS NOT COVERED BY `NINA_PROMPT_VERSION` ──────────────────────────────────────────
 *  `prompts/index.ts` states that version's scope — the system text and every tool schema in
 *  `./tools.ts` — and `describe.ts` is the precedent for a prompt deliberately outside it. A
 *  caption is closer to what she says than a description is, so this file carries its OWN version,
 *  on `NINA_TITLE_PROMPT_VERSION`'s precedent. Bump that below, never hers.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Bumped by hand whenever the prompt or the tool schema below changes. Logged, never sent. */
export const NINA_CAPTION_PROMPT_VERSION = 1

/**
 * How long a caption may be, in characters, after sanitising.
 *
 * A hundred and twenty. The pool's longest existing line is `udah nih, jangan minta lagi` at 27,
 * and `VOICE_EXAMPLES` are short by design — her register is *"short lines"*. The ceiling is not a
 * target: it is the point past which the answer stops being a chat message and starts being the
 * description paraphrased, which invariant 9 forbids. Over it the answer is REFUSED, not truncated
 * — `lib/llm/narrate.ts`'s rule, and cutting a sentence in half is how a caption becomes nonsense.
 */
export const NINA_CAPTION_MAX_CHARS = 120

/**
 * How much of the description the prompt may see.
 *
 * The witness prompt asks for 60-140 words, so ~900 characters is the whole of a well-behaved
 * answer with slack. The clamp exists for the badly-behaved one: a vendor that ignores the length
 * rule and returns an essay would otherwise crowd out the instruction, which is the failure F07
 * measured when a prompt "spent three of four prose fields on the one scalar that happened to be in
 * front of it".
 */
export const NINA_CAPTION_SEEN_CHARS = 900

/** ASCII control characters -> a space. `lib/nina/title.ts`'s class, and its reasoning. */
const CONTROL_RE = /[\u0000-\u001F\u007F]/g

/** The invisibles `.trim()` leaves behind, including the bidi overrides. `title.ts`'s set. */
const INVISIBLE_RE = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** A caption with no letter in it says nothing. `.test` only, so no `lastIndex`. */
const HAS_LETTER_RE = /\p{L}/u

/**
 * **ANY DIGIT REFUSES THE WHOLE CAPTION.** Invariant 2 — she never states a number the app did not
 * compute — and this is the one surface where the rule is absolute rather than contextual.
 *
 * Every number that could reach a caption comes from a photograph: a depth on a dive computer, a
 * pace on a watch face, a time on a clock behind her, a size on a label. The app computed none of
 * them and the witness prompt is forbidden from reading them out, so a digit arriving here means
 * one of two things — the vision model broke rule 1, or `glm-5.3` invented one. Both are the same
 * defect and both are unsayable.
 *
 * There is no carve-out for a number she legitimately knows, because a caption is not the surface
 * she says those on. Her turn is, and her turn has `lib/format.ts`'s real figures in its context.
 *
 * `\p{Nd}` rather than `[0-9]`: the vendor answers in Indonesian and English but the class costs
 * nothing to widen, and a superscript or Arabic-Indic digit is still a digit.
 */
const HAS_DIGIT_RE = /[\p{Nd}\p{No}]/u

/**
 * A label the model sometimes prefixes. Four spellings, and NOT a general "strip anything before a
 * colon" — `title.ts` gives the reason, and here `eh liat: gw nyelam` is a legitimate line.
 */
const LABEL_PREFIX_RE = /^(?:caption|teks|keterangan|nina)\s*[:\-–—]\s*/i

/**
 * Markdown at either edge. Nothing renders markdown in a bubble, so an asterisk would be shown
 * literally.
 */
const MARKDOWN_EDGE_RE = /^[#>\-*_~\s]+|[*_~\s]+$/g

/**
 * **Alt-text vocabulary: the model narrating the picture instead of talking to him.**
 *
 * This is invariant 9's enforcement. The description is private prose written by a witness; the
 * caption is her sentence. When `glm-5.3` returns *"foto ini menunjukkan gw sedang menyelam"* it
 * has handed back the description in Indonesian, and the runner then reads a museum label where a
 * message from his friend should be. Refusing is correct: the canned pool line is a worse caption
 * and a better message.
 *
 * Word-bounded and deliberately narrow — `terlihat` and `tampak` are the two Indonesian verbs a
 * describing model reaches for, and neither belongs in her register.
 */
const ALT_TEXT_RE =
  /\b(?:foto ini|gambar ini|the (?:photo|image)|this (?:photo|image)|menunjukkan|terlihat|tampak|depicts|shows a|pictured)\b/i

/** Wrapping quote pairs. `title.ts`'s list — a quoted caption is the model quoting itself. */
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
]

function cleanCaptionText(raw: string): string {
  return raw.replace(CONTROL_RE, ' ').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim()
}

/** A loop, not one pass: a model that quotes a quote returns `"'nih'"`. Terminates by shrinking. */
function stripWrappingQuotes(value: string): string {
  let current = value
  for (;;) {
    const next = current.trim()
    const pair = QUOTE_PAIRS.find(
      ([open, close]) => next.length >= 2 && next.startsWith(open) && next.endsWith(close),
    )
    if (pair === undefined) return next
    current = next.slice(1, -1)
  }
}

/**
 * **Quotes and markdown, stripped to a FIXED POINT rather than once each.**
 *
 * Either can wrap the other. The model returns `**"nih"**` as readily as `"**nih**"`, so one pass
 * of quotes-then-markdown leaves the quotes on the first shape and one pass the other way leaves
 * the asterisks on the second. Neither may survive: nothing in a bubble renders markdown, so an
 * asterisk is shown literally, and a quoted caption is the model quoting itself.
 *
 * Terminates because both operations only ever REMOVE characters, so a pass that removes nothing
 * is the fixed point and the length is a sound guard.
 */
function stripEdgeDecoration(value: string): string {
  let current = value.trim()
  for (;;) {
    const next = stripWrappingQuotes(current).replace(MARKDOWN_EDGE_RE, '').trim()
    if (next.length === current.length) return next
    current = next
  }
}

/**
 * **What the model returned -> a caption she may say, or `null`.**
 *
 * Every `null` lands in the same place, and it is a place that already exists: the caller keeps the
 * `ninaImageCaption` line that is already on the row. Nothing is persisted on a refusal, so a
 * later pass could try again for free — `lib/llm/narrate.ts`'s rule about not recording a failure.
 *
 * The order matters. Cleaning first, because every check below assumes single spaces. Then the
 * stripping, because a refusal should be about the words and not about a wrapping quote or an
 * asterisk — and to a FIXED POINT, because either wraps the other. Then the refusals, most
 * absolute first.
 */
export function sanitizeNinaCaption(raw: string): string | null {
  const cleaned = cleanCaptionText(raw)
  if (cleaned.length === 0) return null

  const unlabelled = cleaned.replace(LABEL_PREFIX_RE, '')
  const kept = stripEdgeDecoration(unlabelled).replace(/\s+/g, ' ').trim()

  if (kept.length === 0) return null
  if (!HAS_LETTER_RE.test(kept)) return null
  /* Absolute. See `HAS_DIGIT_RE`. */
  if (HAS_DIGIT_RE.test(kept)) return null
  /* Invariant 9: a caption is not the description with an accent. */
  if (ALT_TEXT_RE.test(kept)) return null
  /* Refuse, never truncate. Over the ceiling it is prose, and prose does not become a caption by
   * being cut. */
  if (kept.length > NINA_CAPTION_MAX_CHARS) return null
  return kept
}

/**
 * The tool block's `input` -> a caption, or nothing.
 *
 * No Zod, on `parseNinaTitle`'s stated grounds: there is no repair round trip here, and for
 * `{ caption?: unknown }` a type guard is smaller and directly testable.
 */
export function parseNinaCaption(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const value = (raw as { caption?: unknown }).caption
  if (typeof value !== 'string') return null
  return sanitizeNinaCaption(value)
}

/**
 * Where the knowledge of the picture came from. It changes what the model is being handed, so it
 * changes the sentence that introduces it — and getting that wrong is how a prompt gets read as
 * prose when it is a request, or as a request when it is prose.
 *
 *  · `'described'` — a witness who could see the photograph wrote a paragraph about it
 *    (`glm-4.6v` through `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`). The admin add path.
 *  · `'requested'` — the photograph was MADE to order and this is the scene she asked for
 *    (`NinaSelfieRequest.scene`, already on the row as `description`). The generated-selfie path.
 *    No witness ran and none should: *"we wrote the picture, so paying a vision call to be told
 *    back our own prompt would be absurd"* (`lib/nina/imagerun.ts`).
 */
export type NinaCaptionSeenKind = 'described' | 'requested'

const SEEN_PREAMBLE: Readonly<Record<NinaCaptionSeenKind, string>> = {
  described:
    'Someone who can see the photo wrote this down for you. It is a flat observation, not a ' +
    'reaction — the reaction is yours to have:',
  requested:
    'This is the photo you asked to have taken of you, in the words you asked for it. It exists ' +
    'and it is about to be sent:',
}

/** The user turn. The instruction sits LAST, matching `buildDescribeUserContent`'s proven order. */
export function buildNinaCaptionRequest(
  seen: string,
  seenKind: NinaCaptionSeenKind,
): string | null {
  const trimmed = cleanCaptionText(seen).slice(0, NINA_CAPTION_SEEN_CHARS).trim()
  /* Nothing to caption. No call, no tokens — `buildNinaTitleRequest`'s `null` and its reasoning. */
  if (trimmed.length === 0) return null
  return `${SEEN_PREAMBLE[seenKind]}\n\n${trimmed}\n\nSend it to him with one line.`
}

/**
 * **The prompt. She is sending him a photo of herself and saying one thing about it.**
 *
 * ── SHE IS TOLD SHE IS NINA HERE, UNLIKE THE TITLER ─────────────────────────────────────────
 * `NINA_TITLE_SYSTEM_PROMPT` opens *"This is not Nina"* because a titler in her register returns
 * "eh gimana lutut lo" — her voice, useless as a label. A caption is the exact opposite: her voice
 * IS the deliverable, and a caption written by an indexer reads as alt text. So this prompt is
 * hers, and it carries only the blocks that decide how a single line SOUNDS — the register, the
 * slang, the voice examples, the never-say list, and the two intimacy blocks that render empty at
 * four of the five relationships.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CARRY ─────────────────────────────────────────────────────
 * Not `ninaIdentity`, not `NINA_EXPERTISE`, not `NINA_NOT_A_DOCTOR`, not the anger ladder, not the
 * context guide, not the tool list. This call has no conversation, no run data, no memory and no
 * tools; it has one paragraph about one picture. Handing it her whole identity would cost ~3,000
 * tokens of prompt to produce twelve words, and — the concrete failure — would invite her to
 * coach, diagnose or bring up his training, none of which belongs under a photograph of herself.
 * `buildNinaSystemPrompt` remains the only assembler of the full character, and this file must
 * never grow into a second one.
 *
 * ── AND IT MAY DECLINE ──────────────────────────────────────────────────────────────────────
 * The last paragraph gives it a way out. Without one, a description that says "I cannot tell what
 * this is" produces a confident invention; with one, the answer is refused by
 * `sanitizeNinaCaption`, the canned pool line stands, and nothing was said that is not true.
 */
export function buildNinaCaptionSystemPrompt(tuning: NinaTuning): string {
  const blocks = [
    `You are Nina. You are sending him a photograph of yourself, right now, in a chat. Write the one line that goes with it.

Return that line through the "caption" tool. Nothing else.

THE LINE
One line. Short — shorter than a sentence you would say out loud. It is a chat message, not a description of a picture: he can see the photograph, so you never tell him what is in it. You say the thing a person says when they send a photo of themselves.

TALK ABOUT WHAT IS ACTUALLY IN IT
If you are underwater, you are underwater. If you are on the track, you are on the track. If you are dressed up in a kitchen, that is what it is. Never claim an activity that is not in the photograph — do not say you have just been running unless you have just been running. That is the whole reason you are being asked instead of being handed a stock line.

NEVER
- A number. Not a depth, a time, a pace, a distance, a size, a temperature, a date. Not one digit, even if it is printed in the picture.
- "foto ini", "gambar ini", "terlihat", "tampak", "menunjukkan", or any other way of narrating the picture. That is a label on a museum wall. You are texting.
- Quotation marks, markdown, a "Caption:" prefix, or more than one line.
- Anything you cannot see. If the observation says it cannot tell whether it is a pool or the sea, you do not pick one.`,
    JAKARTA_REGISTER,
    ninaManjaRegisterBlock(tuning),
    JAKARTA_SLANG_BLOCK,
    VOICE_EXAMPLES_BLOCK,
    ninaGirlfriendVoiceBlock(tuning),
    ninaNeverSayBlock(tuning),
    `If the observation is too vague to say anything true about — or if it says the photo could not be seen at all — return the tool with an empty string. That is a correct answer. A line that invents what is in the picture is the one outcome worse than a dull one.`,
  ]
  /* `renderSections`'s filter, inlined: two of the blocks above render `''` at four of the five
   * relationships, and a blank paragraph in a prompt reads as a missing instruction. */
  return blocks
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .join('\n\n')
}

/**
 * `maxLength` is a JSON Schema keyword inside `input_schema`, not a request field —
 * `NINA_TITLE_TOOL` already sends one to this endpoint. The property description is part of the
 * prompt, so an edit to it bumps `NINA_CAPTION_PROMPT_VERSION`.
 */
export const NINA_CAPTION_TOOL: Anthropic.Tool = {
  name: 'caption',
  description: 'Send the one line that goes with this photograph of you.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['caption'],
    properties: {
      caption: {
        type: 'string',
        maxLength: NINA_CAPTION_MAX_CHARS,
        description:
          'REQUIRED. One short line, in your own voice, about the photograph you are sending. ' +
          'No digits, no quotes, no markdown, no prefix, one line only. An empty string if there ' +
          'is nothing true to say about it.',
      },
    },
  },
}
