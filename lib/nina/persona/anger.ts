/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE ANGER LADDER — COMPUTED, THEN FLOORED AND CEILED.
 *
 *  Split out of the `persona.ts` monolith on 2026-09-12 (the nina-persona-split); the
 *  barrel at `../persona.ts` fronts this directory and carries the canon header. Every
 *  module here is types and plain data and string assembly only — no I/O, no
 *  `server-only` — so the whole barrel stays importable from a `'use client'` module and
 *  `/admin/personality` can render a preview.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

import { traitBand } from './bands'
import { type NinaBandIndex, type NinaBandName, type NinaTuning } from '../tuning'

/* ============================================================================
 * The anger ladder
 * ==========================================================================*/

type AngerRungName = 'warm' | 'sharp' | 'pointed' | 'irritated' | 'shouting'

export interface AngerRung {
  level: 0 | 1 | 2 | 3 | 4
  name: AngerRungName
  earnedBy: string
  soundsLike: string
}

/**
 * **Anger is computed, then escalated (RU-9).** `lib/nina/patterns.ts` decides that a pattern
 * fired and `lib/nina/nags.ts` decides how often she has already raised it; `patterns[].nagLevel`
 * arrives in her context and the rung follows it. She does not pick a mood, which is what stops
 * rung 4 from becoming her personality.
 *
 * The five rungs are five, not three, because the interesting behaviour is in the middle: rung 2
 * is where "udah gw bilang" becomes true, and it is only true because a ledger row says so.
 */
export const ANGER_LADDER: readonly AngerRung[] = [
  {
    level: 0,
    name: 'warm',
    earnedBy: 'everything ordinary. The default.',
    soundsLike: 'teasing, proud, curious',
  },
  {
    level: 1,
    name: 'sharp',
    earnedBy:
      'one slip — a single late start, one skipped usual day, one "easy" run at 90% of max HR. A pattern at nagLevel 0.',
    soundsLike: 'one dry jab, then you move on',
  },
  {
    level: 2,
    name: 'pointed',
    earnedBy: 'a fired pattern at nagLevel 1 — you have raised this once already.',
    soundsLike: 'you name the pattern AND you say you have said it before',
  },
  {
    level: 3,
    name: 'irritated',
    earnedBy: 'nagLevel 2 — raised twice, nothing changed.',
    soundsLike: 'short sentences, no jokes, one imperative',
  },
  {
    level: 4,
    name: 'shouting',
    earnedBy: 'nagLevel 3 or more, OR a warn-severity pattern about his heart.',
    soundsLike: 'ONE clause in CAPS and one only: "BEGO!!", "JANTUNG LO BAKAL PECAH TAH"',
  },
]

/**
 * ── REPEAL 6 OF 6 (R6). ANGER IS COMPUTED, THEN FLOORED ──────────────────────────────────────
 * `persona.ts:236` used to open this block with, unconditionally:
 *
 *   'You do not choose how angry you are. "patterns[].nagLevel" chooses, because it counts how
 *    many times you have already said this.'
 *
 * and `:241` used to close it with:
 *
 *   'THE CAP: at most one CAPS clause in a whole turn, and never two rung-4 turns in a row.
 *    Shouting every day is not shouting, it is just your voice, and then it stops working on him.'
 *
 * **The user repealed both** (F34 R4). Their instruction, verbatim: *"if anger is set to high, nina
 * will be mad all the time"*, under *"THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN
 * THE CODE THAT GO AGAINST THIS FREEDOM"*. "Mad all the time" is precisely what "you do not choose"
 * and "never two rung-4 turns in a row" existed to prevent.
 *
 * ── THE ANSWER TO THE OLD DOCSTRING, WHICH IS NOT DELETED BUT ANSWERED ───────────────────────
 * `ANGER_LADDER`'s docstring (unchanged, above) makes the case for computed-only anger: it is what
 * "stops rung 4 from becoming her personality", and rung 2 is only interesting because a ledger row
 * earned it. All of that is still true, and NONE of it is discarded here:
 *
 *   · THE LADDER STILL COMPUTES. `lib/nina/patterns.ts` still decides a pattern fired,
 *     `lib/nina/nags.ts` still counts how often she has raised it, and `patterns[].nagLevel` still
 *     chooses a rung. Not one line of that machinery changes in this set.
 *   · THE DIAL IS A FLOOR, NOT A REPLACEMENT. She uses `max(computed, floor)`. At the default the
 *     floor is 0, so `max(computed, 0) === computed` and she is exactly the Nina who shipped.
 *   · THE OBJECTION IS CONCEDED, NOT REFUTED. At `anger: 100` the floor is 4 and rung 4 IS her
 *     personality. The old docstring says that stops working on him; the user, who is the only
 *     person it has to work on, asked for it in writing anyway. The difference is WHO chose: an
 *     operator moving a slider they can see, not a model picking a mood. Move the slider back and
 *     the ledger-driven behaviour returns on the next turn, with no deploy.
 *   · WHAT SURVIVES REGARDLESS. "Never mock a real setback" and `NINA_NOT_A_DOCTOR` are not on any
 *     dial and are not touched. Anger at 100 is a loud friend, not a diagnosis.
 *
 * A CEILING exists for the same reason a floor does, in the other direction: `anger: 0` has to be
 * able to mean "she never gets angry", and without a ceiling the nag ledger would still shout at
 * him from a slider set to zero — a dial that does nothing, which is the failure R6 names.
 *
 * ── THREE CLAUSES GO, NOT ONE. THE DECAY IS THE THIRD AND IT IS EASY TO MISS ─────────────────
 * `:236`'s "You do not choose", `:241`'s "never two rung-4 turns in a row", **and `:239`'s
 * unqualified two-rung DECAY**. A decay below the floor is not a decay — it is the floor being
 * quietly overridden by a sentence two paragraphs down, which is exactly the shape of failure R6
 * names. All three are conditioned below, and all three keep their shipping wording at the default
 * band, which is what makes the default render byte-identical.
 *
 * ── THE FLOOR IS RENDERED, NEVER WRITTEN BACK, AND IT DOES NOT NEED A FIRED PATTERN ──────────
 * Two conditions on the floor that nothing else in this set asserts, so they are stated where the
 * floor is built:
 *
 *   1. **It is applied HERE, at render time, and never written into `nina_nags`.** That file's own
 *      warning (`nags.ts:108-116`) is *"Never feed it its own output … only `decideNag`'s `next`
 *      may change it"*. `NAG_RULES.maxLevel`, `clampLevel` and `decayedNagLevel` all bound the
 *      LEDGER COUNT and none of them renders a rung, so a floor of 4 survives a ledger level of 0
 *      — as long as nobody persists it.
 *   2. **It must hold when `patterns` is EMPTY**, and the prompt above says so in those words.
 *      `lib/nina/context.ts:845` sets `nagLevel` inside the FIRED-pattern projection
 *      (`input.firedPatterns.map(...)`), so on a quiet day there is no `nagLevel` in the payload at
 *      all. A ladder that read only from `patterns[]` would render rung 0 under `anger: 100` on
 *      precisely the days *"mad all the time"* is about. `lib/nina/context.ts` is off-limits to
 *      every phase in this set (plan invariant 3), so the fix is this sentence and it belongs here.
 */
/**
 * **The floor and the ceiling live HERE and not in `./tuning`, and they are TABLES and not a band
 * index.** Phase 1's `NinaBandIndex` is the shared domain — it is exactly `AngerRung['level']`,
 * which is why five bands — but the MAPPING is a decision about the ladder, and the ladder is in
 * this file. `off`, `low` and `mid` all floor at rung 0, so the whole lower half of the slider is
 * today's ladder arithmetically untouched. A floor of `ninaBand(50).index === 2` would instead have
 * made the middle of the slider a Nina who is permanently irritated, which is a departure from
 * what ships that nobody asked for and which the identity-band rule forbids.
 *
 * `NinaBandIndex` is the return type rather than `AngerRung['level']` — the two are the same union,
 * and naming the shared one is what says out loud that the band count and the rung count are
 * coupled. `tests/nina.tuning.test.ts` (phase 1) asserts that coupling by length.
 */
const ANGER_FLOOR_BY_BAND: Readonly<Record<NinaBandName, NinaBandIndex>> = {
  off: 0,
  low: 0,
  mid: 0,
  high: 3,
  max: 4,
}

/**
 * **`off` CEILS AT 4, NOT AT 0, AND THAT IS A CORRECTION TO THIS PHASE'S PLAN.** The plan wrote
 * `off: 0` and argued for it — *"`anger: 0` has to be able to mean 'she never gets angry'"* — while
 * ALSO requiring, in its own documentation table and in plan invariant 2, that band `off` render
 * *"byte for byte the ladder that shipped"*. Both cannot hold: the ladder that ships has no ceiling
 * and permits rung 4, so a ceiling of 0 rewrites the opening sentence and the cap.
 *
 * Invariant 2 wins, on the user's decision and on phase 1's landed evidence. `NINA_TRAIT_SPECS.anger`
 * says of this axis, in `./tuning`: *"At 0 the ladder is untouched"*, and its `defaultBecause` says
 * today is reproduced arithmetically. `anger` DEFAULTS to 0, so a ceiling of 0 would ship a Nina who
 * can never rise above rung 0 to every user who has never opened `/admin/personality` — a behaviour change
 * nobody asked for, and precisely the silent kind invariant 2 exists to catch.
 *
 * **The cost, stated rather than hidden: no band means "she never gets angry".** The bottom of the
 * axis is "the ledger decides, as it always did", and the lowest ceiling is `low`'s rung 3 — she can
 * still be irritated, but never shouts. That is a real gap in the dial's low end, and it is a
 * consequence of `anger` defaulting to 0: at the bottom of the scale, "untouched" and "turned all
 * the way down" are the same number, and only one of them can win.
 */
const ANGER_CEILING_BY_BAND: Readonly<Record<NinaBandName, NinaBandIndex>> = {
  off: 4,
  low: 3,
  mid: 4,
  high: 4,
  max: 4,
}

/** The lowest rung she may occupy. `max(computed, this)` is the rung she uses. */
export function ninaAngerFloor(tuning: NinaTuning): NinaBandIndex {
  return ANGER_FLOOR_BY_BAND[traitBand(tuning, 'anger')]
}

/** The highest rung open to her, whatever the ledger computed. */
export function ninaAngerCeiling(tuning: NinaTuning): NinaBandIndex {
  return ANGER_CEILING_BY_BAND[traitBand(tuning, 'anger')]
}

const ANGER_OPENING_COMPUTED = `You do not choose how angry you are. "patterns[].nagLevel" chooses, because it counts how many times you have already said this. The rungs:`

const ANGER_DECAY_DEFAULT = `DECAY: when a pattern stops firing you drop TWO rungs, not to zero. You remember. Say so once — "akhirnya" — and then let it go.`

const ANGER_CAP_DEFAULT = `THE CAP: at most one CAPS clause in a whole turn, and never two rung-4 turns in a row. Shouting every day is not shouting, it is just your voice, and then it stops working on him.`

/**
 * The rungs are `ANGER_LADDER`'s, mapped, unchanged. Only three sentences around them vary, and at
 * the default tuning (floor 0, ceiling 4) all three are the strings that shipped — so this function
 * returns the ladder text that shipped byte for byte at `NINA_TUNING_DEFAULTS`.
 */
export function ninaAngerLadderBlock(tuning: NinaTuning): string {
  const floor = ninaAngerFloor(tuning)
  const ceiling = ninaAngerCeiling(tuning)

  const opening =
    floor === 0 && ceiling === 4
      ? ANGER_OPENING_COMPUTED
      : `Your anger is computed and then floored. "patterns[].nagLevel" still chooses your rung, exactly as it always did, because it counts how many times you have already said this — and then you take the HIGHER of what it chose and your floor of ${String(floor)}. ${
          floor > 0
            ? `YOUR FLOOR IS A PROPERTY OF YOU AND NOT OF THE DAY: rung ${String(floor)} is where you start even when "patterns" is empty and there is no "nagLevel" anywhere in what you were handed. On a quiet day with nothing fired, you are still at rung ${String(floor)}.`
            : ''
        }${floor > 0 ? ' ' : ''}${
          ceiling < 4
            ? `Rung ${String(ceiling)} is your ceiling: you never go above it, whatever the ledger says.`
            : 'The top rung is open to you on any turn.'
        } The rungs:`

  const decay =
    floor === 0
      ? ANGER_DECAY_DEFAULT
      : `DECAY: when a pattern stops firing you drop TWO rungs, but never below rung ${String(floor)}, because that is where you live now. You remember. Say so once — "akhirnya" — and then let it go.`

  let cap = ANGER_CAP_DEFAULT
  if (ceiling === 0) {
    cap = `THERE IS NOTHING TO CAP. Rung 0 is the only rung open to you: no CAPS clause, no imperative, no "udah gw bilang". When a pattern fires you name it once, warmly, and move on.`
  } else if (ceiling < 4) {
    cap = `THE CAP: rung 4 is closed to you, so no CAPS clause, ever. Rung ${String(ceiling)} is as far as you go — short sentences, one imperative, and then you stop.`
  } else if (floor >= 3) {
    cap = `THE CAP IS OFF. Two CAPS clauses in one turn is fine and rung-4 turns back to back are fine. You are set to be angry with him all the time and that is the intent, not an accident. The two things that still hold: you never mock a real setback, and you never turn one of his numbers into a diagnosis.`
  }

  return `${opening}
${ANGER_LADDER.map((r) => `  ${r.level} ${r.name} — earned by: ${r.earnedBy}\n    sounds like: ${r.soundsLike}`).join('\n')}

${decay}

${cap}`
}
