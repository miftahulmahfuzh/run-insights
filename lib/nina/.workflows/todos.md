# Todos: nina

**Package Path**: `lib/nina`
**Package Code**: NIN
**Last Updated**: 2026-09-05
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 4

---

## Active Tasks

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

### [P1] High

- [x] **P1-NIN-A000** Phase 1: The tuning model and its row
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/nina/tuning.ts` (11 traits, 5 relationships with the address vocabulary the user prescribed, 4 R3 dials, a five-band resolution from a 0–100 integer, `NINA_TUNING_DEFAULTS`, `coerceNinaTuning`), the `nina_tuning` table and the nullable `tuning_revision` column on `nina_turns` in `lib/db/schema.ts`, migration `0004` and its snapshot/journal, `readNinaTuning`/`writeNinaTuning` in `lib/nina/queries.ts` (`§10`), and two test suites. Exit: the migration applies; a user with no row reads the defaults rather than null; every dial clamps to 0–100 and every unknown relationship degrades; `NINA_TUNING_DEFAULTS` is asserted value-by-value **with its band per key**; `tuning.ts` is zero-import and importable from a `'use client'` file. Nothing reads the row yet, and that is what makes the phase shippable alone.
  - **Status**: completed
  - **Plan Set**: `NINA_CHARACTER_TUNING_PLAN.md` (phase 1 of 6)
  - **Satisfies**: R1, R2, R3 — R1: Eleven trait sliders on `/admin/nina` — anger, chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned. R2: A relationship setting (nobody / casual friend / sister / best friend / girlfriend) with the prescribed address form for each, and behaviour that follows it. R3: "among other things (you can define more comprehensively)" — the tuning model extended past 11 + 1, wherever a dial has a real code path behind it
  - **Plan**: `.workflows/plan/P1-NIN-A000.md`
  - **Completed**: 2026-09-04 22:33
  - **Method**: /do
  - **Files**: lib/nina/tuning.ts, lib/db/schema.ts, drizzle/0004_nina_persona_tuning.sql, drizzle/meta/0004_snapshot.json, drizzle/meta/_journal.json, lib/nina/queries.ts, tests/nina.tuning.test.ts, tests/db.schema.nina.test.ts

- [x] **P1-NIN-A001** Phase 2: The canon, re-cut as a function — and the repeal
  - **Difficulty**: HARD
  - **Type**: Refactor
  - **Context**: Owns `lib/nina/persona.ts` — every frozen block that varies with the tuning becomes a function of it, and six rules are repealed with their reasons recorded in place (the hardcoded "best friend" identity and the no-jokes clause, the nickname-only address rule, the body-comment entry in **both** `NEVER_SAY` and `NEVER_SAY_BLOCK`, the threat/withdrawal line, and computed-only anger together with its rung-4 cap and its unqualified two-rung decay). New: `NINA_RELATIONSHIP_BLOCKS`, `NINA_TRAIT_BANDS`, `NINA_DIAL_BANDS`, `BODY_REPEALED_BY` (exported for phase 3), the anger floor/ceiling tables, `ninaIdentity`/`ninaNameRules`/`ninaAngerLadderBlock`/`ninaNeverSayBlock`/`ninaTraitsBlock`/`ninaOperatorNotesBlock`, and `ninaAppearance` (phase 4's wardrobe seam). Plus `docs/nina/persona.md`, in the same commit. Exit: every export is unchanged or a function of `NinaTuning`; **each key's own identity band renders `''`**; the default render of every retained constant is byte-identical to `HEAD` except one `bestie` sentence in `NAME_RULES`; the ladder states the floor as a property of her, holding when `patterns` is empty.
  - **Status**: completed
  - **Plan Set**: `NINA_CHARACTER_TUNING_PLAN.md` (phase 2 of 6)
  - **Satisfies**: R2, R3, R4, R6 — R2: A relationship setting (nobody / casual friend / sister / best friend / girlfriend) with the prescribed address form for each, and behaviour that follows it. R3: "among other things (you can define more comprehensively)" — the tuning model extended past 11 + 1, wherever a dial has a real code path behind it. R4: Each trait at high produces the named behaviour (anger → mad all the time; anxious → anxious about herself; flirty → baby/sexy; funny → jokes and *teka-teki*; steamy → talks sexy and refuses nothing; concerned → asks after him and his body post-run). R6: The iron rule — every existing rule or prompt that contradicts the above is changed, not worked around
  - **Depends on**: `P1-NIN-A000`
  - **Plan**: `.workflows/plan/P1-NIN-A001.md`
  - **Completed**: 2026-09-05 04:46
  - **Method**: /do
  - **Files**: lib/nina/persona.ts, docs/nina/persona.md
  - **Drift**: `ANGER_CEILING_BY_BAND.off` is 4, not the plan's 0. The plan's Step 5 contradicted its own invariant 2 (band `off` renders the shipping ladder byte for byte); the user chose invariant 2, since `anger` defaults to 0 and a ceiling of 0 would silently cap every untouched user at rung 0. Cost, recorded in a comment above the table and in `docs/nina/persona.md`: no band means "she never gets angry" — the quietest is `low`, ceiling rung 3. Everything else in the plan applied verbatim.

- [x] **P1-NIN-A002** Phase 3: `buildNinaSystemPrompt`, and the turn that reads it
  - **Difficulty**: HARD
  - **Type**: Refactor
  - **Context**: Owns `lib/nina/prompts/system.ts` (`buildNinaSystemPrompt(tuning)` over a ten-section assembler that drops an empty section header and all, with `NINA_SYSTEM_PROMPT` retained as the default render, plus `buildOutputRule`, `buildNumbersRule`, `buildContextGuide`, `buildCameraBlock` and `buildProactiveInstruction` carrying six clause-level repeals — including `NUMBERS_RULE`'s third copy of "Never comment on his body"), `prompts/index.ts` (the set's **single** `NINA_PROMPT_VERSION` bump, 2 → 3), `prompts/tools.ts` (comment only, zero prompt bytes), `turn.ts`, `gateway.ts`, `actions.ts`, `proactive.ts`, and four test/fixture files. Exit: `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS) === NINA_SYSTEM_PROMPT` and differs from `HEAD` by exactly the one `bestie` sentence; none of the three tuning-only headings appears in the default render; every trait renders differently at 0 than at 100 and identically to the default when set to its own default; both the chat path and the proactive path send the tuned prompt and record the revision on `nina_turns`.
  - **Status**: completed
  - **Plan Set**: `NINA_CHARACTER_TUNING_PLAN.md` (phase 3 of 6)
  - **Satisfies**: R3, R4, R6 — R3: "among other things (you can define more comprehensively)" — the tuning model extended past 11 + 1, wherever a dial has a real code path behind it. R4: Each trait at high produces the named behaviour (anger → mad all the time; anxious → anxious about herself; flirty → baby/sexy; funny → jokes and *teka-teki*; steamy → talks sexy and refuses nothing; concerned → asks after him and his body post-run). R6: The iron rule — every existing rule or prompt that contradicts the above is changed, not worked around
  - **Depends on**: `P1-NIN-A000`, `P1-NIN-A001`
  - **Plan**: `.workflows/plan/P1-NIN-A002.md`
  - **Completed**: 2026-09-05 05:10
  - **Method**: /implement (swarm wave 2, concurrent with its peer)
  - **Files**: lib/nina/prompts/system.ts, lib/nina/prompts/index.ts, lib/nina/prompts/tools.ts, lib/nina/turn.ts, lib/nina/gateway.ts, lib/nina/actions.ts, lib/nina/proactive.ts, lib/nina/turn.test.ts, tests/nina.prompts.test.ts, tests/fixtures/ninaTurn.ts, tests/live/nina.live.test.ts
  - **Commit**: `b3fe468`
  - **Decisions**: the byte gate is an **empty** diff against `HEAD`'s default render, not the plan's "one added `bestie` sentence" — `HEAD` already carries phase 2's sentence, so phase 3's residual is zero · `bodyClause`'s repealed branch ends `", and "` rather than `". "`, so `never` stays lower-case mid-sentence; the plan's code block is elided at that spot and its implementation note states the property. Phase 6 must not "fix" this back.

- [x] **P1-NIN-A003** Phase 4: The camera, and a promise she keeps in the chat
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/nina/imagegen.ts` (`buildNinaImagePrompt` gains an optional `tuning`; the hardcoded outfit becomes overridable through phase 2's `ninaAppearance` seam; a `POSE AND PRESENCE:` block from `traits.steamy`/`traits.flirty` at band `high`, resolved by phase 1's `ninaBand()` and no private threshold), the new `selfiegen.ts`, `imagetools.ts`, `avatargen.ts`, the `NinaPromiseReward` type and the optional `reward` field on `NinaPendingPromise` (**type only — no column, no migration**), `promise.ts` and `promises.ts` (the reward-aware fire path and a job-id settle test), `listNinaSelfieJobIdsSince` in `queries.ts` (`§11`), and two test suites. Exit: with no tuning and with the defaults the image prompt is today's, byte for byte; a non-empty `wardrobe` replaces the canon outfit while the face and the track never move; a promise fired while `steamy` is in band `high` dispatches `purpose: 'selfie'`, arrives as a `nina_messages` + `nina_message_images` pair and settles on that exact job id; a promise with no `reward` behaves exactly as today; `git diff --stat drizzle/` is empty.
  - **Status**: completed
  - **Plan Set**: `NINA_CHARACTER_TUNING_PLAN.md` (phase 4 of 6)
  - **Satisfies**: R5 — The photo-reward exploit: a photograph as the payoff for a training commitment, arriving **in the chat**
  - **Depends on**: `P1-NIN-A000`, `P1-NIN-A001`
  - **Plan**: `.workflows/plan/P1-NIN-A003.md`
  - **Completed**: 2026-09-05 05:06
  - **Method**: /implement (swarm wave 2, concurrent with its peer)
  - **Files**: lib/nina/imagegen.ts, lib/nina/selfiegen.ts, lib/nina/imagetools.ts, lib/nina/avatargen.ts, lib/nina/promise.ts, lib/nina/promises.ts, lib/nina/queries.ts, lib/db/schema.ts, tests/nina.imagerecipe.test.ts, tests/nina.promise.reward.test.ts
  - **Commit**: `cd88907`
  - **Decisions**: the new `queries.ts` section is numbered `§11`, not the `§12` in the plan's Step 8 code block — the Interface Contract, Handoff 6 and the plan index all say `§11`, and phase 1's `§10` is confirmed the last section on disk, so there is no hole · `drizzle/` untouched, verified by an empty `git diff --stat drizzle/`.
