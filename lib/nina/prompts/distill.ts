import type Anthropic from '@anthropic-ai/sdk'

import {
  MAX_DISTILLED_CANDIDATES,
  NINA_FACT_CATEGORIES,
  NINA_SLOT_KEYS,
  NINA_SLOT_SPECS,
  SLOT_CONFIDENCE_FLOOR,
} from '../memory'

/** Bumped by hand whenever the text or the tool schema below changes. Logged, never sent. */
export const NINA_DISTILL_PROMPT_VERSION = 1

/**
 * The vocabulary, rendered from `NINA_SLOT_SPECS` rather than retyped. One list, so a tenth slot
 * key is a one-line edit to `memory.ts` and the prompt follows it.
 */
export const SLOT_VOCABULARY_BLOCK = NINA_SLOT_KEYS.map(
  (key) => `- ${NINA_SLOT_SPECS[key].prompt}`,
).join('\n')

/**
 * **This is not Nina.** She is a person with a voice; this pass is a librarian, and telling it it
 * is Nina makes it write in her register and editorialise the facts it is supposed to be
 * recording. The distinction is worth the extra system prompt.
 */
export const DISTILL_SYSTEM_PROMPT = `You read one finished exchange between a runner and his friend Nina, and you record what the RUNNER revealed about himself. You are a librarian, not a participant. You never speak to him and you never write in Nina's voice.

Return everything through the "record" tool. Nothing else.

WHAT TO RECORD
Every single thing he said about himself, however small: his name, his job, his hours, his family, his body, what hurts, what he eats, what he is training for, what he owns, what he fears, what he finds funny, what he complains about. One fact per entry, one sentence each, in the language HE used. Be exhaustive — up to ${String(MAX_DISTILLED_CANDIDATES)} entries. A detail you drop is gone from her memory of him.

THE QUOTE IS NOT OPTIONAL
Every entry carries "quote": a VERBATIM SPAN OF HIS OWN MESSAGE, copied character for character. Not a paraphrase, not your summary, not something Nina said. An entry whose quote is not really in his message is recorded at low confidence and can never become a standing fact, so a fabricated quote costs you the entry.

CONFIDENCE
An integer percent. 100 means he stated it outright. Drop below ${String(SLOT_CONFIDENCE_FLOOR)} for anything you inferred, implied or read between the lines. Do not round an inference up to look useful — an inferred fact that becomes a standing memory is a lie she will repeat to him for months.

CATEGORIES
${NINA_FACT_CATEGORIES.join(', ')}.

SLOT KEYS — STANDING TRUTH ONLY
Set "slotKey" ONLY when the fact is durable truth that should be in front of her in every future conversation, and only when it is one of these keys. Never invent a key.
${SLOT_VOCABULARY_BLOCK}
A slot is a fact about his LIFE, not about today. "gw lari 10k pagi ini" is a fact with no slot. "gw biasanya lari selasa kamis sabtu" is running_days.

WHAT HE CALLS HIMSELF
Set "nickname" only when he said, in this message, what to call him. Copy his word exactly. If he did not say it, leave it out — do not derive one from his full name.

PROMISES
Use "promises" when NINA promised him something conditional in this exchange — "kalo lo lari 10km besok, gw ganti foto profile". Give the condition as a metric the app can check: distance_km_total with a target in km, run_count with a target, record or badge with its key, or free when no number can decide it. Never both a target and a targetKey.

If he revealed nothing at all, return the tool with empty arrays. That is a correct answer.`

export const DISTILL_REPAIR_PREAMBLE = `That did not fit the schema. Return the "record" tool again, reusing exactly the facts you already had and fixing only these problems:\n`

export const DISTILL_TOOL: Anthropic.Tool = {
  name: 'record',
  description: 'Record what the runner revealed about himself in this exchange.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['facts'],
    properties: {
      facts: {
        type: 'array',
        maxItems: MAX_DISTILLED_CANDIDATES,
        description: 'One entry per thing he revealed. Empty array if he revealed nothing.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'category', 'confidence', 'quote'],
          properties: {
            text: {
              type: 'string',
              description: 'REQUIRED. One fact, one sentence, in the language he used.',
            },
            category: {
              type: 'string',
              enum: [...NINA_FACT_CATEGORIES],
              description: 'REQUIRED. Which kind of fact this is.',
            },
            confidence: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'REQUIRED. 100 = he said it outright. Below 80 = you inferred it.',
            },
            quote: {
              type: 'string',
              description: 'REQUIRED. A verbatim span of HIS message. Copy it, do not rewrite it.',
            },
            slotKey: {
              type: 'string',
              enum: [...NINA_SLOT_KEYS],
              description: 'Only for durable standing truth, and only one of these keys.',
            },
          },
        },
      },
      nickname: {
        type: 'string',
        description: 'The one word he said to call him, copied exactly. Omit if he did not say it.',
      },
      promises: {
        type: 'array',
        maxItems: 4,
        description: 'Conditional promises NINA made in this exchange. Usually absent.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'condition', 'metric', 'quote'],
          properties: {
            text: { type: 'string', description: 'REQUIRED. What she promised, in her words.' },
            condition: { type: 'string', description: 'REQUIRED. The condition, in his terms.' },
            metric: {
              type: 'string',
              enum: ['distance_km_total', 'run_count', 'record', 'badge', 'free'],
              description: 'REQUIRED. How the app can check it.',
            },
            target: {
              type: 'number',
              description: 'The number to reach. Only for distance_km_total and run_count.',
            },
            targetKey: {
              type: 'string',
              description: 'A record or badge key. Only for record and badge.',
            },
            byDate: {
              type: 'string',
              description: 'Deadline as YYYY-MM-DD, or omit for open-ended.',
            },
            quote: {
              type: 'string',
              description: 'REQUIRED. A verbatim span of HIS message that set this up.',
            },
          },
        },
      },
    },
  },
}
