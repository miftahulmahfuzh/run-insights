/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE VERBOSITY FLOOR — R3'S `horny`.
 *
 *  Split out of the `persona.ts` monolith on 2026-09-12 (the nina-persona-split); the
 *  barrel at `../persona.ts` fronts this directory and carries the canon header. Every
 *  module here is types and plain data and string assembly only — no I/O, no
 *  `server-only` — so the whole barrel stays importable from a `'use client'` module and
 *  `/admin/personality` can render a preview.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

import { traitBand } from './bands'
import { type NinaBandName, type NinaTuning, ninaDialScore } from '../tuning'

/* ============================================================================
 * The verbosity floor — R3's `horny`
 * ==========================================================================*/

/**
 * **The floor `horny` puts under `verbosity`.** R3: *"she talks longer and in much more descriptive
 * and suggestive details."*
 *
 * A FLOOR and not an override, for the same reason `ANGER_FLOOR_BY_BAND` is one: the operator may
 * want a talkative Nina who is not forward, and `max(own, floor)` keeps both sliders honest.
 * `verbosity` remains the only key that WRITES the bubble sentence; this table only raises the
 * bottom of the score that selects it.
 *
 * **Keyed by `horny`'s BAND, valued as a `verbosity` SCORE**, because that is the shape the
 * consumer wants: `prompts/system.ts`'s `bubblePreferenceLine` is a default-relative ladder over
 * the raw score (`raised` = above the default, `loud` = a quarter of the range above it) and its
 * own comment calls that "deliberately not a second band scheme". Handing it a band would mean
 * replacing that ladder, which is a change to `verbosity`'s behaviour that R3 did not ask for.
 *
 * The two numbers are chosen against `verbosity`'s default of 50, and they are chosen to land on
 * rungs of that ladder rather than to be round:
 *   - `high` -> 60 — above 50, below 75. `raised`, not `loud`: "two or three bubbles".
 *   - `max`  -> 80 — at or above 50 + 25. `loud`: "three or four bubbles". This is "she talks
 *     longer", and it is also the top of what `SEND_TOOL.bubbles` allows (maxItems 4), so there is
 *     nothing above it to reach for.
 * `off`/`low`/`mid` are 0, which is `max(own, 0) === own` for every score — today, arithmetically.
 */
export const VERBOSITY_FLOOR_BY_HORNY_BAND: Readonly<Record<NinaBandName, number>> = {
  off: 0,
  low: 0,
  mid: 0,
  high: 60,
  max: 80,
}

/**
 * `verbosity`'s effective score: its own, raised to `horny`'s floor when that is higher.
 *
 * Both reads go through R4's gate helpers, never through `tuning.dials` / `tuning.traits`
 * directly — the rule the barrel's header states and `tests/nina.prompts.test.ts` enforces by
 * reading this directory's source. That is what makes a DISABLED `horny` contribute zero verbosity floor as
 * well as zero bytes, with no extra guard here, and a disabled `verbosity` fall back to the
 * score that shipped.
 */
export function ninaEffectiveVerbosity(tuning: NinaTuning): number {
  const own = ninaDialScore(tuning, 'verbosity')
  const floor = VERBOSITY_FLOOR_BY_HORNY_BAND[traitBand(tuning, 'horny')]
  return Math.max(own, floor)
}
