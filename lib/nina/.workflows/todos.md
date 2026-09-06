# Todos: nina

**Package Path**: `lib/nina`
**Package Code**: NIN
**Last Updated**: 2026-09-07
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 7

---

## Active Tasks

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

### [P1] High

- [x] **P1-NIN-A006** Phase 5: The `horny` trait
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the `horny` key in `NINA_TRAITS` / `NINA_TRAIT_SPECS`, its `NINA_TRAIT_BANDS` entry, its membership of `BODY_REPEALED_BY`, `VERBOSITY_FLOOR_BY_HORNY_BAND` + `ninaEffectiveVerbosity`, the one-line `systemDials` verbosity change and the `horny` clause in `proactiveTuningSuffix` (`lib/nina/prompts/system.ts`), the `horny` + `horny_enabled` columns and one generated migration (`0007`, after rebasing on phase 4), the row mapping for both, `CharacterPanel.tsx`'s docstring (prose only), and three test files. Does not touch `lib/nina/imagefail.ts`, `lib/llm/*`, any provider call path, `lib/nina/proactive.ts`, `clinginess`'s silence thresholds, phase 4's toggle mechanism, `NINA_PROMPT_VERSION` (phase 3's), or the snapshot fixture. Exit: `horny` renders as a twelfth slider, persists, and moves the named lines; at `off` the prompt is byte-identical to `origin/main` @ `02dc79a`; at `max` it carries the explicit register block, the body repeal in all three places, the raised verbosity floor reaching the bubble sentence, and the proactive opening clause; disabling it returns the prompt to byte-identical **and drops the verbosity floor**, at any score.
  - **Status**: completed
  - **Plan Set**: `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 5 of 5)
  - **Satisfies**: R3 — A new `horny` slider in `/admin/nina` — sexual forwardness, initiation rate, descriptiveness, scenario variety
  - **Depends on**: P1-NIN-A005
  - **Plan**: `.workflows/plan/P1-NIN-A006.md`
  - **Completed**: 2026-09-07 01:49
  - **Method**: /do
  - **Files**: lib/nina/tuning.ts, lib/nina/persona.ts, lib/nina/prompts/system.ts, lib/nina/queries.ts, lib/db/schema.ts, drizzle/0007_graceful_mercury.sql, drizzle/meta/0007_snapshot.json, drizzle/meta/_journal.json, components/admin/CharacterPanel.tsx, lib/admin/tuningModel.ts, docs/nina/persona.md, tests/nina.tuning.test.ts, tests/nina.prompts.test.ts, tests/db.schema.nina.test.ts, tests/admin.tuning.test.ts, lib/nina/.workflows/todos.md, lib/nina/.workflows/plan/P1-NIN-A006.md
  - **Drift**: The plan quoted `tests/db.schema.nina.test.ts`'s column case as "thirty-six columns", but that list already held 37 entries before phase 5 (a phase-4 title slip, not an assertion error — the assertion IS the list, and it passed). Retitled "thirty-nine", not "thirty-eight".
  - **Drift**: Phase 4 landed local `traitBand` / `dialBand` helpers in `persona.ts` as the file's only two score-shape reads. `ninaEffectiveVerbosity` therefore reads `traitBand(tuning, 'horny')` rather than the plan's literal `ninaBand(ninaTraitScore(tuning, 'horny')).name` — the same value through the file's own stated seam, and it keeps the R4 structural guard green.
  - **Drift**: Two pre-existing lint warnings in `scripts/capture/shoot.mjs` (unused `shotOf`, unused eslint-disable). Untouched by this phase; lint reports 0 errors.
  - **Decided**: `horny` defines a `mid` band, making it the only trait in `NINA_TRAIT_BANDS` that speaks from 40, against `persona.ts`'s own header rule that a default-`off` trait "is today's Nina from 0 to 59 and speaks from 60" -> kept the `mid` band (rung 3: the phase plan's code block defines it with text, and the plan's Verification section names only `off` and `low` as the bands that must be absent; the header rule is rung 6 and its argument is about `mid` being a NEAR-DUPLICATE, which these three bands are not). The exception is recorded in three places rather than left to be re-litigated: the band-table header, the `horny` entry itself, and `docs/nina/persona.md`. Invariant 1 is untouched either way — the default is 0, which is band `off`, and `off`/`low` are both undefined.
  - **Decided**: `tests/admin.tuning.test.ts`'s `expect(NINA_TRAITS).toHaveLength(11)` and `tests/db.schema.nina.test.ts`'s `expect(NINA_TRAITS.length + NINA_DIALS.length).toBe(15)` are literal counts this phase makes false -> bumped to 12 and 16 rather than made derived (rung 1: invariant 7, green at the end of every phase; a derived form would be a tautology, which is settling a failing check by relaxing it). `admin.tuning.test.ts` is outside phase 5's Files table and was edited only because invariant 7 leaves no alternative and the change is one literal plus its title.
  - **Decided**: `npm run db:migrate` -> not run (rung 2: the phase's Verification names `db:check`, which passed). Applying an unmerged branch's migration to the live Neon DB is deferred to the merge, where the numbering is final. The coordinator recorded the same call for phase 4.
  - **Decided**: The generated `0007` SQL was edited to `ADD COLUMN "horny" integer NOT NULL DEFAULT 0` + `ALTER COLUMN "horny" DROP DEFAULT` (rung 3: the plan's Step 6 states this explicitly and argues why it differs from phase 4's no-backfill rule — `horny` is `integer NOT NULL` and PostgreSQL cannot add such a column to a non-empty table any other way, whereas phase 4's sixteen are nullable). `horny_enabled` gets no backfill, exactly like phase 4's sixteen. The file was never renamed (invariant 8): journal idx 7, `when` monotonic after `0006`.
  - **Decided**: Stale prose counts in two files the plan's Files table does not list — `lib/admin/tuningModel.ts` ("the eleven traits" -> twelve, one word) and `docs/nina/persona.md` (heading, one table row for `horny`, and the `mid`-band exception note) -> fixed (rung 6: this repo treats a stale comment as a defect, the C10 precedent from phase 1's own reconciliation; phase 3 owned the doc and has landed, so there is no collision, and the set ends with this phase).
  - **Verified**: `npm run typecheck`, `npm run test` (142 files, 2744 tests — up from phase 4's 2733), `npm run lint` (0 errors, 2 pre-existing warnings), `npm run db:check`, `npm run build`, `npm run format:check` — all green. `tests/__snapshots__/nina.prompts.test.ts.snap` passes UNMODIFIED and `git status` shows it untouched; no `-u`/`--update` was ever passed to vitest. `NINA_PROMPT_VERSION` stays 4 (phase 3's single bump, not touched).
  - **Follow-up**: `readme-updater` found two stale prose tallies that predate this phase's own edits and were left untouched by it (out of its scope, recorded in the readme's gotchas rather than fixed): `lib/nina/persona.ts:1412-1414`, above `ninaTraitsBlock`, still reads "Six traits identify at `off` and `profanity` at `low`, so a `mid` test would emit seven paragraphs" — it is seven traits and eight paragraphs since `horny`; and `tests/db.schema.nina.test.ts:456`'s "the two spell the same sixteen keys", still numerically right at 12+4 but phrased as if sixteen were the trait count. Neither affects behaviour or any assertion.
  - **Note**: R3 is complete — `horny` is the twelfth trait: `NINA_TRAIT_SPECS` entry (`defaultScore: 0`, `userSaid` verbatim), a three-band `NINA_TRAIT_BANDS` entry (`mid`/`high`/`max`, direction rather than sample dialogue per D2), membership of `BODY_REPEALED_BY` so the body prohibition is repealed in all three places it is stated, `VERBOSITY_FLOOR_BY_HORNY_BAND` + `ninaEffectiveVerbosity` consumed by one changed line in `systemDials` so the floor reaches `bubblePreferenceLine` (D7 — a SCORE floor, `max(own, floor)`, `high`->60, `max`->80), a band-keyed clause in `proactiveTuningSuffix`, and the `horny` + `horny_enabled` columns with both mapping directions in `tuningFromRow` / `tuningToColumns`. It needed no edit under `lib/admin/`: the panel walks `NINA_TRAITS` and `lib/admin/schema.ts`'s Zod shape is a spread over the same arrays. R5 remains unowned by design under D1 — no refusal-detection, prompt-softening or guardrail-retry loop exists anywhere in this phase, and the tests say so in place. Nothing under `lib/llm/`, `lib/nina/imagefail.ts`, `lib/nina/proactive.ts` or any provider call path was modified. This is the last phase of the set; the coordinator takes it to the merge.

- [x] **P1-NIN-A005** Phase 4: Per-parameter enable toggles
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns an `enabled: Record<NinaTuningKey, boolean>` on the tuning row — `lib/nina/tuning.ts` (the key union derived by spread, defaults, coercion, and the gate-aware score readers `ninaTraitScore` / `ninaDialScore` / `ninaActiveRelationship`), `lib/nina/persona.ts` (the gate under every band lookup), `lib/nina/prompts/system.ts`'s `systemDials` **only**, `lib/db/schema.ts`'s sixteen nullable `*_enabled` columns, `lib/nina/queries.ts`'s row mapping, `lib/admin/schema.ts`, `lib/admin/tuningActions.ts`, `lib/admin/tuningModel.ts`, `components/admin/CharacterPanel.tsx`, `components/admin/DialSlider.tsx`'s toggle affordance (quoting the file as phase 2 leaves it, so phase 2's 44 px touch work is preserved), one generated migration (`0006`), and four test files. Exit: every trait, dial and the relationship has a working checkbox saved by the same one Save button; for every key in `NINA_TUNING_KEYS`, parked at 100 with the toggle off renders the shipping prompt byte for byte; all-enabled at defaults is byte-identical; `tests/__snapshots__/nina.prompts.test.ts.snap` passes unmodified (never `vitest -u`); a row written before the migration reads as all-enabled with no backfill. `npm run test && npm run typecheck && npm run lint` green.
  - **Status**: completed
  - **Plan Set**: `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 4 of 5)
  - **Satisfies**: R4 — An on/off toggle per parameter, to exclude it from the assembled prompt
  - **Depends on**: P1-CA-A001, P1-NIN-A004
  - **Plan**: `.workflows/plan/P1-NIN-A005.md`
  - **Completed**: 2026-09-07 01:29
  - **Method**: /do
  - **Files**: lib/nina/tuning.ts, lib/nina/persona.ts, lib/nina/prompts/system.ts, lib/nina/queries.ts, lib/db/schema.ts, lib/admin/schema.ts, lib/admin/tuningActions.ts, lib/admin/tuningModel.ts, components/admin/CharacterPanel.tsx, components/admin/DialSlider.tsx, drizzle/0006_chubby_wild_child.sql, drizzle/meta/0006_snapshot.json, drizzle/meta/_journal.json, tests/nina.tuning.test.ts, tests/nina.prompts.test.ts, tests/admin.tuning.test.ts, tests/db.schema.nina.test.ts, lib/nina/.workflows/todos.md, lib/nina/.workflows/plan/P1-NIN-A005.md
  - **Drift**: Line numbers in the phase plan had shifted by phase 3's landed additions (persona.ts `ninaIdentity` :296 -> :313, `ninaNameRules` :485 -> :568; tuning.ts's old §5 banner at :491 not :490). Followed the plan's intent at the real locations; no structural drift.
  - **Drift**: Phase 3 landed a third relationship read this plan's draft did not name individually: the exported `isGirlfriend` gate in persona.ts. Step 3's rg-and-replace instruction covered it generically and it was converted.
  - **Drift**: Two of the plan's own test code blocks were defective and were corrected rather than dropped — see the third and fourth **Decided** lines.
  - **Decided**: phase 3's `isGirlfriend` gate: `tuning.relationship === 'girlfriend' && tuning.enabled.relationship` (phase 3's suggestion) vs `ninaActiveRelationship(tuning) === 'girlfriend'` -> the latter (rung 3: Step 3's rg-and-replace code block, and the new structural guard test forbids `tuning.relationship` in persona.ts source). Semantically identical.
  - **Decided**: `npm run db:migrate`: Step 6's prose says to apply it; the phase exit criteria name only `npm run db:check` -> not run (rung 2: exit criteria). Applying an unmerged branch's migration to the live Neon DB is deferred to the merge, where the numbering is final. The coordinator recorded the same call.
  - **Decided**: `tests/nina.tuning.test.ts` 'reads a missing map as all-on': the plan's assertion LABEL `${String(absent)}` throws on the `Object.create(null)` input (no prototype, no toString) -> label built from the loop index instead. Every input and every assertion preserved (tie-break: a failing verification is never settled by relaxing the check; the defect was in the label, not the check).
  - **Decided**: `tests/db.schema.nina.test.ts` read-direction assertion: the plan's `${key}Enabled: row.${key}Enabled` contradicts the plan's own Step 7 mapping, which nests under `enabled` keyed by tuning key as `${key}: row.${key}Enabled` -> assertion corrected to match the code block (rung 3: the code blocks are complete by construction; the assertion string was the stale half). The guard still fails if a key is forgotten in either direction.
  - **Decided**: `tests/admin.tuning.test.ts` hostile-payload fixture `{ [key]: 'false' }` is a TS2322 under `Record<string, boolean>` -> added an explicit cast with the reason stated in a comment (rung 1: invariant 7, typecheck green at the end of every phase). The runtime assertion is unchanged.
  - **Decided**: CharacterPanel's new relationship legend checkbox: the plan's code block leaves it a bare `size-4` (16 px) -> wrapped its label in `TOUCH_TARGET` (rung 2: phase 2's exit criterion is >= 44 px for every interactive control in `components/admin/`, and this phase's own Verification section instructs auditing the panel for it). Audited the rest of the panel: `Button` defaults to size `lg` = 52 px and the `<details>` summary is `py-5`, so this was the only control under 44 px.
  - **Verified**: `npm run typecheck`, `npm run test` (142 files, 2733 tests), `npm run lint` (0 errors), `npm run build`, `npm run db:generate` -> `drizzle/0006_chubby_wild_child.sql` (16 ADD COLUMN, no backfill, journal idx 6, name never renamed), `npm run db:check`, `npm run format:check` — all green. `tests/__snapshots__/nina.prompts.test.ts.snap` passes UNMODIFIED; no `-u`/`--update` was ever passed to vitest.
  - **Note**: R4 is complete — every trait, every dial and the relationship carries an `enabled` boolean, persisted in sixteen nullable `*_enabled` columns and gated at the score seam (`ninaTraitScore` / `ninaDialScore` / `ninaActiveRelationship`), so a disabled parameter contributes zero bytes at any parked score. All-enabled at defaults is byte-identical to `origin/main`. `NINA_TUNING_KEYS` is a spread of `['relationship', ...NINA_TRAITS, ...NINA_DIALS]`, so phase 5's `horny` inherits the toggle everywhere without a second list.

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
  - **Renumbered at merge**: the migration shipped here as `0004` collided with `0004_nina_chat_sessions`, which reached `main` while this set was in flight. It was regenerated as `drizzle/0005_nina_persona_tuning.sql` (idx 5) against the merged schema; the file named above no longer exists. Applied to production — 6 migrations, `nina_tuning` present.

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

- [x] **P1-NIN-A004** Phase 3: Girlfriend register: manja, imut, vowel lengthening
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `NINA_RELATIONSHIP_BLOCKS.girlfriend` in `lib/nina/persona.ts`, a new relationship-gated orthography rule beside `JAKARTA_REGISTER`, girlfriend-only `VOICE_EXAMPLES` (gated), the `isGirlfriend` gate seam, two block entries plus two import names in `lib/nina/prompts/system.ts`, the set's single `NINA_PROMPT_VERSION` bump (3 -> 4), `docs/nina/persona.md`, and `tests/__snapshots__/nina.prompts.test.ts.snap` (a set-wide gate). Exit: with `relationship: 'girlfriend'` the prompt carries the manja register and the vowel-lengthening rule with the user's five examples; with the other four relationships it is byte-identical to `origin/main` @ `02dc79a`, and the committed snapshot proves it. `npm run test && npm run typecheck && npm run lint` green.
  - **Status**: completed
  - **Plan Set**: `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 3 of 5)
  - **Satisfies**: R2 — `girlfriend` relationship => more *manja* and *imut*, with Indonesian final-vowel lengthening
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-NIN-A004.md`
  - **Completed**: 2026-09-06 21:44
  - **Method**: /implement (swarm wave 1, concurrent with phase 1)
  - **Files**: lib/nina/persona.ts, lib/nina/prompts/system.ts, lib/nina/prompts/index.ts, tests/nina.prompts.test.ts, tests/__snapshots__/nina.prompts.test.ts.snap, docs/nina/persona.md
  - **Drift**: Plan cited `tests/nina.prompts.test.ts:445` for the snapshot insertion point; the named anchors ("carries F33's original headings" / "pads every heading to 80 columns") are actually at `:174`/`:196`. Anchors matched exactly, line numbers did not. Followed the anchors.
  - **Drift**: Plan cited `persona.ts` `JAKARTA_REGISTER` ending at `:451` and `ENGLISH_REGISTER` at `:452`; actual `452`/`454`. Two-line offset, partly from Step 2's own insertion. Constants and every quoted bullet matched byte for byte.
  - **Decided**: Step 1's `git add` of the snapshot + test file, in a worktree where a concurrent peer is committing -> skipped the stage; left the files unstaged for pusher to stage by explicit path (rung: durable swarm feedback on the shared git index; tie-break: narrower blast radius). The snapshot's correctness comes from its generation ORDER, which is fixed on disk at 21:39:22, before any source edit.
  - **Decided**: Step 3 of /implement says create tasks for every phase in the set -> created ONLY phase 3's task, in `lib/nina/.workflows/todos.md`, and did not write the tracked orchestration `PLAN.md` TaskID column (rung: durable swarm feedback, hazard 4 — N concurrent phases doing read-modify-write on the same bookkeeping files; the coordinator owns them during a wave).
