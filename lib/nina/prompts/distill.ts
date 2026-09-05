import type Anthropic from '@anthropic-ai/sdk'

import {
  MAX_DISTILLED_CANDIDATES,
  NINA_FACT_CATEGORIES,
  NINA_SLOT_KEYS,
  NINA_SLOT_SPECS,
  SLOT_CONFIDENCE_FLOOR,
} from '../memory'
import { NINA_TUNING_DEFAULTS, type NinaRelationship } from '../tuning'

/**
 * Bumped by hand whenever the text or the tool schema below changes. Logged, never sent.
 *
 * 2 — the librarian was told what the relationship is, and told that the couple's own register is
 * not a fact about him. **This constant is not `NINA_PROMPT_VERSION`**: that one covers Nina's own
 * voice and her tool schemas and is bumped exactly once per plan set, by the phase that edits
 * `prompts/system.ts`. This one covers the librarian, which is a different model call with a
 * different system prompt, and it moves on its own schedule.
 */
export const NINA_DISTILL_PROMPT_VERSION = 2

/**
 * The vocabulary, rendered from `NINA_SLOT_SPECS` rather than retyped. One list, so a tenth slot
 * key is a one-line edit to `memory.ts` and the prompt follows it.
 */
export const SLOT_VOCABULARY_BLOCK = NINA_SLOT_KEYS.map(
  (key) => `- ${NINA_SLOT_SPECS[key].prompt}`,
).join('\n')

/**
 * What each relationship *is*, in one clause the librarian can read — deliberately including the
 * address form, because that is the half it needs in order to recognise the register and leave it
 * alone.
 *
 * Module-private and written out here rather than imported from `lib/nina/tuning.ts`: that file's
 * `NINA_ADDRESS` is written FOR NINA, in the second person, and is the single source of truth for
 * what she is TOLD to call him — composed by `persona.ts`'s `ninaNameRules` and rendered by
 * `/admin/nina`. This is a third-person gloss for a different reader (a librarian being told what
 * it is looking at), and the two will not change together. `satisfies` is what keeps them in step
 * on the only thing that matters — the five keys — and the words themselves are quoted from
 * `NINA_ADDRESS[rel].words` so a reviewer can check them against the one place they live.
 */
const RELATIONSHIP_GLOSS = {
  nobody: 'someone who is not close to him at all, and who uses his full name',
  casual_friend: 'a casual friend of his, who uses his nickname',
  sister: 'like a sister to him, who calls him "bro"',
  best_friend: 'his best friend, who calls him "bestie"',
  girlfriend:
    'his girlfriend, who calls him "my man", "yang", "sayang", "beb", "baby" and the like',
} as const satisfies Record<NinaRelationship, string>

/**
 * **This is not Nina.** She is a person with a voice; this pass is a librarian, and telling it it
 * is Nina makes it write in her register and editorialise the facts it is supposed to be
 * recording. The distinction is worth the extra system prompt.
 *
 * ── WHY THE LIBRARIAN IS TOLD THE RELATIONSHIP (F33 / R6, the sweep) ─────────────────────────
 * It used to open with "his friend Nina" and nothing else, which was true of exactly one of the
 * five settings the operator can now choose. Under `girlfriend` the exchange is full of *yang*,
 * *sayang* and *beb* in both directions, and an exhaustive librarian with no idea why will file
 * "he calls her sayang" as a standing fact about him — for which `NINA_SLOT_KEYS` has no home, so
 * it lands in the ledger as biography and comes back at him for months. Worse, the `nickname`
 * field is one bad inference from being overwritten with a word SHE said. The fix is to name the
 * setting and to say plainly that the register is not biography.
 *
 * ── WHAT WAS DELIBERATELY *NOT* ADDED ────────────────────────────────────────────────────────
 * No content limiter. The exhaustiveness clause records more under a steamy tuning, and that is
 * the point: the user's instruction on this repo is *"i am the only one that uses this app. so i
 * dont care about any privacy whatsoever. this is my personal toy"* — the same premise
 * `scripts/check-llm-payload-boundary.mjs` already acted on when it deleted its own Rule 1. A new
 * "do not record that" rule here would be a fresh prohibition against the freedom this set exists
 * to grant. If that is ever wanted it is one paragraph, and it should be a stated decision rather
 * than one taken quietly inside a sweep.
 *
 * `DISTILL_SYSTEM_PROMPT` below is this function at the default relationship, so every existing
 * importer keeps compiling and a caller that has no tuning to hand still gets a coherent prompt.
 */
export function buildDistillSystemPrompt(relationship: NinaRelationship): string {
  return `You read one finished exchange between a runner and Nina — she is set, right now, to be ${RELATIONSHIP_GLOSS[relationship]} — and you record what the RUNNER revealed about himself. You are a librarian, not a participant. You never speak to him and you never write in Nina's voice.

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

WHAT THE TWO OF THEM CALL EACH OTHER
The relationship above is an operator setting. He did not tell her about it and she did not decide it, and it is what makes them talk the way they do: a full name, a nickname, "bro", "bestie", or "yang" / "sayang" / "beb" / "baby". THE WAY THEY ADDRESS EACH OTHER IS NOT A FACT ABOUT HIM. Do not record it as a fact, do not give it a slot, and never put a word SHE used into "nickname" — that field is only ever what HE asked to be called, in his own words, in this message. Her endearments are hers. If the two of them are affectionate, or blunt, or filthy with each other, that is the register and not biography: record what he revealed, in the language he used, and let the tone be the tone.

PROMISES
Use "promises" when NINA promised him something conditional in this exchange — "kalo lo lari 10km besok, gw ganti foto profile", "kalo lo lari 4x minggu ini, gw kirim foto". Give the condition as a metric the app can check: distance_km_total with a target in km, run_count with a target, record or badge with its key, or free when no number can decide it. Never both a target and a targetKey.

If he revealed nothing at all, return the tool with empty arrays. That is a correct answer.`
}

/** This function at the default relationship. The only value every existing caller ever needed. */
export const DISTILL_SYSTEM_PROMPT = buildDistillSystemPrompt(NINA_TUNING_DEFAULTS.relationship)

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
