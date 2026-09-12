/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE R4 GATE — HOW A TUNING IS READ.
 *
 *  Everything here asks for a band NAME, never for a number, so a change to how the tuning
 *  is stored is a two-line change here rather than a forty-line change through the text.
 *  These helpers are exported to the sibling modules, not to the world: the barrel
 *  re-exports `anyTurnedUp` alone, which is the one `prompts/system.ts` composes with.
 *
 *  Split out of the `persona.ts` monolith on 2026-09-12 (the nina-persona-split); the
 *  barrel at `../persona.ts` fronts this directory and carries the canon header. Every
 *  module here is types and plain data and string assembly only — no I/O, no
 *  `server-only` — so the whole barrel stays importable from a `'use client'` module and
 *  `/admin/personality` can render a preview.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  type NinaBandName,
  type NinaDial,
  type NinaTrait,
  type NinaTuning,
  NINA_DIAL_SPECS,
  NINA_TRAIT_SPECS,
  ninaBand,
  ninaDialScore,
  ninaTraitScore,
} from '../tuning'

/**
 * The two — and only two — places the SHAPE of `NinaTuning` is read for a score. Everything below
 * asks for a band NAME, never for a number, so a change to how the tuning is stored is a two-line
 * change here rather than a forty-line change through the text.
 *
 * ── R4'S GATE IS INSIDE THESE TWO LINES, AND THAT IS WHY THERE ARE ONLY TWO ───────────────────
 * `ninaTraitScore` / `ninaDialScore` return the key's own `defaultScore` when the operator has
 * switched that parameter OFF, so a disabled key resolves to its IDENTITY BAND and every skip below
 * fires exactly as it does for a key nobody moved: `atTraitIdentityBand` is true, `ninaTraitsBlock`
 * `continue`s BEFORE the band lookup, `isTurnedUp` is false so no repeal fires, and
 * `ANGER_FLOOR_BY_BAND` reads `off` so the ladder is arithmetically untouched. Zero bytes, at any
 * score — which is what R4 asked for: *"exclude some parameters to make prompt more accurate"*.
 *
 * **Nothing in this directory may read `tuning.traits`, `tuning.dials` or `tuning.relationship`
 * directly**, and `tests/nina.prompts.test.ts` reads this directory's source and fails if it does. A
 * direct read is a parameter whose toggle silently does nothing.
 *
 * `ninaBand()` returns `{ index, name }` — the index exists so the anger floor can be a rung. The
 * text below only ever wants the name.
 */
export const traitBand = (tuning: NinaTuning, trait: NinaTrait): NinaBandName =>
  ninaBand(ninaTraitScore(tuning, trait)).name
export const dialBand = (tuning: NinaTuning, dial: NinaDial): NinaBandName =>
  ninaBand(ninaDialScore(tuning, dial)).name

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **THE IDENTITY BAND, AS A FUNCTION. THIS IS PLAN INVARIANT 2, HELD BY CONSTRUCTION.**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * A key's identity band is the band containing its own `defaultScore` — the band in which today's
 * text is what ships. `ninaTraitsBlock` SKIPS a key sitting in its identity band, so the default
 * tuning contributes nothing and the shipping prompt is untouched.
 *
 * **It is computed, not tabulated, and that is the point.** The defaults are not uniform: `anger`,
 * `sad`, `flirty`, `steamy`, `annoying`, `anxious` and R3's `horny` identify at `off`; `profanity`
 * identifies at `low`; the other eight identify at `mid`. Sixteen hand-checked "leave this band
 * undefined" decisions is sixteen chances to ship a paragraph of "she is normal" into the prompt that shipped
 * — and the failure is silent, because the default IS the shipping character and a leaked paragraph
 * reads as "she has always said that". Asking phase 1's own spec removes the chance.
 */
const identityBandOf = (defaultScore: number): NinaBandName => ninaBand(defaultScore).name

export const atTraitIdentityBand = (tuning: NinaTuning, trait: NinaTrait): boolean =>
  traitBand(tuning, trait) === identityBandOf(NINA_TRAIT_SPECS[trait].defaultScore)

export const atDialIdentityBand = (tuning: NinaTuning, dial: NinaDial): boolean =>
  dialBand(tuning, dial) === identityBandOf(NINA_DIAL_SPECS[dial].defaultScore)

/**
 * `high` or `max` — a score of 60 or more, since phase 1's bands are five equal widths of 20.
 * What "a dial is turned up" means everywhere a rule is repealed by one.
 *
 * **One definition, in this module**: `prompts/system.ts` composes its own repeals with
 * `anyTurnedUp` and `BODY_REPEALED_BY`, and a second definition of "turned up" is how the two
 * halves of one repeal come to disagree.
 */
export const isTurnedUp = (tuning: NinaTuning, trait: NinaTrait): boolean => {
  const band = traitBand(tuning, trait)
  return band === 'high' || band === 'max'
}

/** True if ANY of `traits` is turned up. The repeal test for a rule several dials contradict. */
export const anyTurnedUp = (tuning: NinaTuning, traits: readonly NinaTrait[]): boolean =>
  traits.some((trait) => isTurnedUp(tuning, trait))
