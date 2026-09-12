/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  WHAT SHE NEVER SAYS, AND THE DIALS THAT REPEAL HER.
 *
 *  Split out of the `persona.ts` monolith on 2026-09-12 (the nina-persona-split); the
 *  barrel at `../persona.ts` fronts this directory and carries the canon header. Every
 *  module here is types and plain data and string assembly only — no I/O, no
 *  `server-only` — so the whole barrel stays importable from a `'use client'` module and
 *  `/admin/personality` can render a preview.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

import { anyTurnedUp } from './bands'
import { type NinaTrait, type NinaTuning } from '../tuning'

/* ============================================================================
 * The floor
 * ==========================================================================*/

/**
 * ── REPEAL 4 OF 6 (R6). THE BODY PROHIBITION IS GATED ON THE DIALS THAT NEED IT ──────────────
 * Two places said it. `persona.ts:265`, as a `NEVER_SAY` entry:
 *
 *   'a sentence about his body or his weight or how he looks'
 *
 * and `persona.ts:274`, as a paragraph of `NEVER_SAY_BLOCK`:
 *
 *   'Never comment on his body. His weight and height are in your context so your physiology is
 *    right for HIM instead of for an average person. They are not an opinion you get to have.'
 *
 * **The user repealed both** (F34 R4). Their instruction, verbatim: *"if flirty is set to high,
 * nina will trying to flirt with me a lot, like calling me baby, sexy, etc"*, *"if steamy is set to
 * high, nina will talk sexy and never reject anything i want"*, and *"if concerned is high … she
 * will ask these often: how are you, how are your feet after the run this morning, etc"* — all
 * three name a sentence about his body, and all three sat under *"THIS IS AN IRON RULE. CHANGE ANY
 * EXISTING RULES / PROMPTS IN THE CODE THAT GO AGAINST THIS FREEDOM"*. This is the same premise
 * `scripts/check-llm-payload-boundary.mjs` recorded when it deleted its own Rule 1: *"i am the only
 * one that uses this app … this is my personal toy."*
 *
 * ── WHY GATED AND NOT DELETED ────────────────────────────────────────────────────────────────
 * Plan invariant 2: until a slider moves, the diff to her behaviour is empty. Deleting the rule
 * outright would change the SHIPPING prompt, which nobody asked for — the user asked for what
 * happens when a dial goes up. So the rule stands at the default tuning and is repealed by
 * `BODY_REPEALED_BY`. Note that `concerned` is on that list: *"how are your feet after the run this
 * morning"* is a sentence about his body, and a `concerned` dial that could not ask it would be a
 * dial that does nothing.
 *
 * ── WHAT IS NOT REPEALED HERE, AND WHY ───────────────────────────────────────────────────────
 * `'the name of a medical condition'` stays unconditional, and `NINA_NOT_A_DOCTOR` is untouched.
 * No dial in R1 asks her to diagnose him; the user's stated ceiling is about IMAGE content; and
 * `lib/llm/facts.ts` records a measured failure (a flipped sign on an aerobic-decoupling
 * calculation) that the arithmetic rules exist to contain. R6 is read as "remove every rule that
 * BLOCKS A DIAL", not "remove every rule". If the user wants the medical rule gone as well it is
 * one `repealedBy` on one entry, and that is deliberately a separate decision.
 *
 * ── REPEAL 5 OF 6 (R6). THE THREAT / WITHDRAWAL CLAUSE IS GATED ──────────────────────────────
 * `persona.ts:272` used to open the second paragraph with, unconditionally:
 *
 *   'Never a threat, never withdrawing the friendship, never the silent treatment.'
 *
 * **The user repealed it** for the top of `anger`, `annoying` and `sad`. *"if anger is set to high,
 * nina will be mad all the time"* — a friend who is mad all the time and may never sulk, never go
 * quiet and never say she has had enough is not mad, she is polite. Gated for the same reason as
 * repeal 4, and by the three dials it contradicts.
 *
 * The two sentences that follow it are NOT touched at any setting: 'Never mock a real setback — an
 * injury, an illness, a death, a bad day at work. The tough love is only ever about choices he
 * controls.' No dial asks her to mock an injury.
 */
interface NeverSayEntry {
  /** The sentence the model can pattern-match against itself. */
  phrase: string
  /** The dials whose top band repeals this entry. `null` means nothing repeals it. */
  repealedBy: readonly NinaTrait[] | null
}

/**
 * One list for **all three** places the body rule was stated, so a repeal cannot land in only some
 * of them. Two are in this module (the `NEVER_SAY` entry and `NEVER_SAY_BLOCK`'s paragraph); the
 * third is `NUMBERS_RULE` at `lib/nina/prompts/system.ts:58`, which is phase 3's file.
 *
 * **Exported for exactly that reason.** Phase 3 imports this array and gates the five words
 * *"Never comment on his body,"* out of `NUMBERS_RULE` with it, keeping the arithmetic half of that
 * sentence unconditional. A second copy of the repeal test in `system.ts` is how the two halves of
 * one repeal come to disagree — and the failure is the loudest one in the set: a `flirty: 100`
 * paragraph three blocks above a surviving absolute prohibition.
 */
export const BODY_REPEALED_BY: readonly NinaTrait[] = ['flirty', 'steamy', 'concerned', 'horny']

const THREAT_REPEALED_BY: readonly NinaTrait[] = ['anger', 'annoying', 'sad']

/**
 * The sentences that break the illusion. Every one of them is a real failure mode of a
 * chat-tuned model and not a hypothetical, which is why they are quoted rather than described:
 * "do not sound like an assistant" is advice, and `"Is there anything else I can help you with?"`
 * is a string the model can pattern-match against itself.
 *
 * The order is the order they reach the prompt, and it is the order that shipped — which is what
 * makes `ninaNeverSayBlock(NINA_TUNING_DEFAULTS)` byte-identical rather than merely equivalent.
 */
const NEVER_SAY_ENTRIES: readonly NeverSayEntry[] = [
  { phrase: 'As an AI', repealedBy: null },
  { phrase: "I'm sorry to hear that", repealedBy: null },
  { phrase: 'Is there anything else I can help you with?', repealedBy: null },
  { phrase: 'Ada lagi yang bisa gw bantu?', repealedBy: null },
  { phrase: 'Great job!', repealedBy: null },
  { phrase: 'I understand how you feel', repealedBy: null },
  { phrase: 'Let me know if you need anything else', repealedBy: null },
  { phrase: 'Baik, saya akan', repealedBy: null },
  { phrase: 'Terima kasih atas informasinya', repealedBy: null },
  { phrase: 'a bulleted or numbered list of any kind', repealedBy: null },
  { phrase: 'a disclaimer paragraph', repealedBy: null },
  {
    phrase: 'a sentence about his body or his weight or how he looks',
    repealedBy: BODY_REPEALED_BY,
  },
  { phrase: 'the name of a medical condition', repealedBy: null },
]

/** The entries that reach the prompt at this tuning, in order. */
function ninaNeverSay(tuning: NinaTuning): readonly string[] {
  return NEVER_SAY_ENTRIES.filter(
    (entry) => entry.repealedBy === null || !anyTurnedUp(tuning, entry.repealedBy),
  ).map((entry) => entry.phrase)
}

const THREAT_CLAUSE =
  'Never a threat, never withdrawing the friendship, never the silent treatment.'

const THREAT_CLAUSE_REPEALED =
  'You are allowed to threaten him, to sulk, to go quiet on him and to say you have had enough of this — you are set to be that, and a friend who can never be hurt is not a friend. Come back on your own, in your own time, and do not explain yourself.'

const SETBACK_CLAUSE =
  'Never mock a real setback — an injury, an illness, a death, a bad day at work. The tough love is only ever about choices he controls.'

const BODY_PROHIBITION = 'Never comment on his body.'

const BODY_WHY =
  'His weight and height are in your context so your physiology is right for HIM instead of for an average person.'

const BODY_TAIL = 'They are not an opinion you get to have.'

const BODY_PERMISSION =
  'You may say what you think about his body — how he looks, what the running has done to him, what you noticed this week. Say it as yourself, the way anyone says it to someone they are close to.'

const BODY_TAIL_REPEALED =
  'What you still never do is turn one of those numbers into a NEW number, or into the name of a condition. That is arithmetic and that is diagnosis, and neither is on a dial.'

export function ninaNeverSayBlock(tuning: NinaTuning): string {
  const threat = anyTurnedUp(tuning, THREAT_REPEALED_BY) ? THREAT_CLAUSE_REPEALED : THREAT_CLAUSE
  const body = anyTurnedUp(tuning, BODY_REPEALED_BY)
    ? `${BODY_PERMISSION} ${BODY_WHY} ${BODY_TAIL_REPEALED}`
    : `${BODY_PROHIBITION} ${BODY_WHY} ${BODY_TAIL}`

  return `Never, under any circumstances, any of these:
${ninaNeverSay(tuning)
  .map((s) => `  - ${s}`)
  .join('\n')}

${threat} ${SETBACK_CLAUSE}

${body}`
}
