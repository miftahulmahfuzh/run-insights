/**
 * The prompt module's public surface, and the version.
 *
 * **`NINA_PROMPT_VERSION` covers the system text AND every tool schema in `./tools.ts`.** Bump it
 * by hand in the same commit as any edit to either. Unlike F07's `promptVersion` it is not a cache
 * key — Nina has no `facts_hash` and every turn is a fresh call — so its job is narrower and still
 * real: it is what `nina_turns` records, so a change in her behaviour can be traced to the commit
 * that caused it. An edit with no bump is a bug no test can catch; only review can.
 */
/* 2 — F33 phase 13 appended the `avatar` paragraph to `CONTEXT_GUIDE` (R25). No tool schema
 * moved; `SET_AVATAR_TOOL` was already declared here and is only now dispatched. */
/* 3 — the nina-character-tuning set. `NINA_SYSTEM_PROMPT` became
 * `buildNinaSystemPrompt(tuning)` and every character block in `../persona.ts` became a function
 * of a `NinaTuning`; the constant survives as the default render. `OUTPUT_RULE`'s no-greeting
 * clause is now gated on the `concerned` dial and its bubble preference on `verbosity`, and three
 * sections — HOW YOU FEEL, THE CAMERA, STANDING INSTRUCTIONS — render only when a dial is off its
 * default. Four rules IN THIS PACKAGE that contradicted a dial were repealed with their reasons
 * left in place: `NUMBERS_RULE`'s "Never comment on his body" (the third copy of a rule
 * `persona.ts` repealed twice), `CONTEXT_GUIDE`'s "This is where your anger comes from", and the
 * "not one higher" / "do not lecture him" / "do not sulk" clauses inside
 * `PROACTIVE_INSTRUCTIONS` — which is why the record is now a default render and not a constant.
 * `buildProactiveInstruction` composes those clauses and appends a tuning suffix. **NO TOOL SCHEMA
 * MOVED** — see `./tools.ts`'s note on the two dials that were proposed for it and declined. This
 * is the SINGLE bump for the whole set: phase 3 owns it and no other phase touches this constant,
 * because two bumps would date two commits to one change. */
export const NINA_PROMPT_VERSION = 3

export {
  LANGUAGE_RULE,
  NINA_REPAIR_PREAMBLE,
  NINA_SECTION_TITLES,
  NINA_SYSTEM_PROMPT,
  NUMBERS_RULE,
  CONTEXT_GUIDE,
  OUTPUT_RULE,
  PROACTIVE_INSTRUCTIONS,
  buildCameraBlock,
  buildContextGuide,
  buildNinaSystemPrompt,
  buildNumbersRule,
  buildOutputRule,
  buildProactiveInstruction,
  type ProactiveTriggerKind,
} from './system'

export {
  COMPARE_RUNS_TOOL,
  GENERATE_IMAGE_TOOL,
  LOOKUP_RUNS_TOOL,
  NINA_TOOL_NAMES,
  NINA_TOOLS,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
  SET_AVATAR_TOOL,
} from './tools'
