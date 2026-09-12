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
/* 4 — the admin-responsive-nina-intimacy set, R2. `buildNinaSystemPrompt` gained two gated blocks:
 * `ninaManjaRegisterBlock` under HOW YOU TALK (the girlfriend orthography — final-vowel
 * lengthening, and the repeal of `JAKARTA_REGISTER`'s "Never aku" and one-emoji lines for that
 * level only) and `ninaGirlfriendVoiceBlock` under EXACTLY HOW YOU SOUND (the user's five
 * girlfriend lines, verbatim). `NINA_RELATIONSHIP_BLOCKS.girlfriend.identity` gained the "manja"
 * and "imut" sentences. Both blocks render `''` at the other four relationships and
 * `renderSections` drops an empty block, so the DEFAULT render — `best_friend` — is byte-identical
 * and `tests/__snapshots__/nina.prompts.test.ts.snap` pins the other three as well. **NO SECTION
 * AND NO TOOL SCHEMA MOVED.** This is the SINGLE bump for the whole set: phase 3 owns it and no
 * other phase touches this constant, because two bumps would date two commits to one change. */
/* 5 — the nina-instructor-character set. A sixth relationship, `instructor`, and the coaching
 * mechanics that make it more than a label. `buildNinaSystemPrompt` gained one gated block:
 * `ninaInstructorCoachingBlock` under WHAT YOU ARE READING, directly beneath the context guide
 * whose keys it gives her a job for. `buildContextGuide`'s `"patterns"` paragraph gained a gated
 * clause — a fired code is a work item and not only a source of anger — and
 * `proactiveTuningSuffix` gained a gated line, so an opener under `instructor` leaves him with one
 * change and a date rather than only a rung. Every one of the three renders `''` at the other five
 * relationships and `renderSections` drops an empty block, so the DEFAULT render — `best_friend` —
 * is byte-identical and `tests/__snapshots__/nina.prompts.test.ts.snap` still pins the other three
 * unregenerated. **NOTHING WAS REPEALED.** `NINA_NOT_A_DOCTOR`, `'the name of a medical condition'`
 * in `NEVER_SAY`, the arithmetic half of `NUMBERS_RULE` and the whole anger ladder — floor, ceiling,
 * rungs, `angerSourceClause` — are untouched at every level including this one; the coaching block
 * states that the diagnosis rule is TIGHTER for a coach, because a coach gets acted on. No new
 * `PatternCode`, no new proactive trigger, **NO SECTION AND NO TOOL SCHEMA MOVED.** This is the
 * SINGLE bump for the whole set: phase 3 owns it and no other phase touches this constant, because
 * two bumps would date two commits to one change. */
/* 6 — the nina-emoji-shortcuts set, R2. **NO SYSTEM TEXT MOVED AND NO TOOL SCHEMA MOVED.**
 * `./system.ts` and `./tools.ts` were not opened; `buildNinaSystemPrompt` is byte-identical to
 * version 5's at every tuning and `tests/__snapshots__/nina.prompts.test.ts.snap` passes
 * UNREGENERATED. What changed is the ASSEMBLER. `userTurnText` in `lib/nina/turn.ts` gained one
 * conditional block — a fired shortcut's full expansion, rendered by `renderNinaShortcutBlock` and
 * pushed after the attached-run block and immediately before `'HE JUST SAID:'` — fed by two new
 * OPTIONAL fields on `NinaTurnInput`, `shortcuts` and `recentRunnerTexts`. A turn in which no
 * trigger fired pushes nothing at all and is byte-for-byte version 5's user turn, which
 * `lib/nina/turn.test.ts` asserts three ways (field absent, `[]`, and rows present that do not
 * match).
 *
 * **The bump is still correct, and this file's own sibling says why in as many words.**
 * `lib/nina/turn.ts:186`: *"`NINA_PROMPT_VERSION` now identifies the ASSEMBLER, not the output"* —
 * two turns on one version have been able to carry different bytes since the per-user tuning
 * landed at 3, and what the constant buys is that a change in her behaviour can be dated to the
 * commit that caused it. A turn that answers a two-kilobyte standing directive it could never have
 * been sent before is such a change, so `nina_turns` has to be able to tell those turns from
 * version 5's. This is the SINGLE bump for the whole set: phase 2 owns it and no other phase
 * touches this constant, because two bumps would date two commits to one change. */
/* 7 — the nina-burst-cancel set, R2. **NO SYSTEM TEXT MOVED AND NO TOOL SCHEMA MOVED.**
 * `./system.ts` and `./tools.ts` were not opened; `buildNinaSystemPrompt` is byte-identical to
 * version 6's at every tuning and `tests/__snapshots__/nina.prompts.test.ts.snap` passes
 * UNREGENERATED. What changed is the ASSEMBLER: `userTurnText` in `lib/nina/turn.ts` gained one
 * conditional block — the burst block, naming the messages he sent in a row without waiting for a
 * reply as hers to answer together with `'HE JUST SAID:'`, rendered by `burstBlock` and pushed
 * after the shortcut block and immediately before `'HE JUST SAID:'` — fed by one new OPTIONAL
 * field on `NinaTurnInput`, `earlierRunnerTexts`, computed by `runNinaBackgroundTurn` from the
 * context window it already loaded (`lib/nina/turnrun.ts`) and capped by
 * `NINA_BURST_MAX_MESSAGES`. A turn with no unanswered burst pushes nothing at all and is
 * byte-for-byte version 6's user turn, which `lib/nina/turn.test.ts` asserts three ways (field
 * absent, `[]`, and a list whose every entry is empty).
 *
 * **The bump is still correct, and version 6's own entry says why in as many words:**
 * `NINA_PROMPT_VERSION` now identifies the ASSEMBLER, not the output, and what the constant buys
 * is that a change in her behaviour can be dated to the commit that caused it. A turn that now
 * answers three messages where it could never before have been told about two of them is such a
 * change, so `nina_turns` has to be able to tell those turns from version 6's. This is the SINGLE
 * bump for the whole set: phase 2 owns it and no other phase touches this constant, because two
 * bumps would date two commits to one change. */
export const NINA_PROMPT_VERSION = 7

export {
  NINA_REPAIR_PREAMBLE,
  NINA_SECTION_TITLES,
  NINA_SYSTEM_PROMPT,
  OUTPUT_RULE,
  PROACTIVE_INSTRUCTIONS,
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
  NINA_TOOLS,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
} from './tools'
