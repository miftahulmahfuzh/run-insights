# Todos: nina

**Package Path**: `lib/nina`
**Package Code**: NIN
**Last Updated**: 2026-09-06
**Total Active Tasks**: 6

## Quick Stats
- P0 Critical: 0
- P1 High: 6
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 4

---

## Active Tasks

### [P1] High

- [ ] **P1-NIN-A004** Phase 1: Unblock the camera: the three measured defects
  - **Difficulty**: HARD
  - **Type**: Bug
  - **Context**: Repairs the three measured defects that block every photograph (analysis Findings 1-3), and is the whole fix if phase 2's probe fails. Owns the worker's missing `nina_messages.session_id` write - the invariant-6 breach Finding 1 introduced, `NOT NULL` since migration 0004 and omitted by both INSERTs - plus `dispatchCutoffFor`/`claimJob`'s grace window and the recipe path. Per Decisions, `cost_micro_usd` is a per-JOB CUMULATIVE total (`coalesce(cost_micro_usd,0) + spend`) on every writer and both hosts, never a per-attempt overwrite that discards the first bill. Finding 2's regression coverage lives PERMANENTLY in the `dispatchCutoffFor`/`claimJob` unit tests, because the fix still guards the manual `--job` drain of the 15 historical `dispatched` rows and the backstop that is phase 2's rollback target. Adds no `claimed_at` column and generates no migration, though `claimJob`'s own comment invites one. Exit: `drizzle/` gains no file, `db:check` clean, all six CI guards pass.
  - **Status**: in_progress
  - **Plan Set**: `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 1 of 7)
  - **Satisfies**: R2 — No photo has ever been generated through chat; fix it. Absolute priority
  - **Plan**: `.workflows/plan/nina-image-pipeline-and-async-chat/phase-1.md`
  - **Card**: `miftahulmahfuzh/run-insights#96`
  - **Files**: scripts/nina-image-worker.ts, lib/nina/imagerecipe.ts, .github/workflows/nina-image.yml, tests/nina.imageworker.test.ts, tests/nina.imagerecipe.test.ts

- [ ] **P1-NIN-A005** Phase 2: Move generation onto Vercel Fluid compute; demote GitHub Actions to backstop
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: **Carries the set's single highest-consequence conditional.** Step 1 deploys a `maxDuration = 300` probe route that must hold past 60s with an `after()` outliving a closed tab; the PROBE RESULT is recorded in the plan index's Decisions block the moment it runs. Branch A (300s, in-platform) is assumed until then. On Branch B the propagation is fully specified so no session re-derives it: this phase reduces to comments-only with NO constant changes, phase 3 moves exactly two literals in `lib/nina/turnflight.ts` together (`NINA_BACKGROUND_BUDGET_MS` 240000->45000 and `NINA_TURN_CHAIN_MAX` 2->0), and phase 7 writes its suite in the Branch B shape. R4's answer is settled and must not be re-derived: OpenRouter has NO async image API - `POST /api/v1/images` is synchronous, and the job API with `callback_url` is video-only - so durability is solved on our side of the wire. Creates NO `app/api/nina/image/route.ts`; the durability primitive is `after()` from the segment that already owns the request. Package widened to include `app/api/cron/nina` (its `maxDuration` 60->300 is required, not cosmetic: a measured 78.2s generation dies at 60s inside `resolveNinaPromises`) and `.github/workflows`.
  - **Status**: pending
  - **Plan Set**: `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 2 of 7)
  - **Satisfies**: R2, R4 — is there an async OpenRouter image API, R7 — a started job survives the app closing
  - **Depends on**: `P1-NIN-A004`
  - **Plan**: `.workflows/plan/nina-image-pipeline-and-async-chat/phase-2.md`
  - **Card**: `miftahulmahfuzh/run-insights#97`
  - **Files**: lib/nina/imagerun.ts, app/api/cron/nina/route.ts, app/nina/page.tsx, .github/workflows/nina-image.yml, and 14 more

- [ ] **P1-NIN-A006** Phase 3: WhatsApp-style send: instant persist, durable background turn
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Splits `sendNinaMessage` so the runner's message persists and returns immediately while the model turn runs in a durable background task. **Reply delivery is a bounded poll ONLY - `lib/nina/live.ts` is NOT edited** (Decisions, rung 3): a push handler would buzz the phone on every message the runner sends while watching, and a push arrives as `router.refresh()`, landing all four bubbles through `mergeServerMessages` in ONE frame, collapsing the staggered reveal `ChatScreen` spends a paragraph forbidding. Also owns **Step 6d, which is half of R8**: backgrounding `runTurnDistillation` stretches the window in which a distillation completing AFTER a session delete re-creates the exact orphan class phase 6 purges, from milliseconds to up to 240s - so `ninaSessionExists` plus an abandon lives here, in files this phase owns. **Does NOT depend on phase 6 and must not be made to.** `openNinaChatTurn`'s read-then-write race is accepted permanently: no unique index, no lock table, no migration.
  - **Status**: pending
  - **Plan Set**: `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 3 of 7)
  - **Satisfies**: R6 — send is instant and the reply arrives even if the app is closed; R8 in part — the delete-mid-turn guard
  - **Depends on**: `P1-NIN-A005`
  - **Plan**: `.workflows/plan/nina-image-pipeline-and-async-chat/phase-3.md`
  - **Card**: `miftahulmahfuzh/run-insights#98`
  - **Files**: lib/nina/turnflight.ts, lib/nina/sessionActions.ts, components/nina/ChatScreen.tsx, and 6 more

- [ ] **P1-NIN-A007** Phase 4: Job tracking: `/nina/jobs`, the detail page, and the jump to the triggering bubble
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Two new routes, a sidebar entry, and the jump back to the chat bubble that triggered a job. 10 files rather than the draft's 8: `NinaJobElapsed.tsx` and `tests/nina.jobview.test.ts` are split out so the list and the detail share ONE ticker. Labels `cost_micro_usd` as 'Biaya total' beside the attempt count, per the Decisions row making it a per-job cumulative figure. **`NinaJobList` renders the empty state and phase 5 supplies the words via `emptyText`** - its docstring already assigns that sentence to the caller and warns that hard-coding it would be 'a component phase 5 has to fork'. One branch nuance: on Branch B `error_code = 'dispatched'` stays a LIVE stage the runner sees on every new job, so `NINA_JOB_STAGE_LABEL.dispatched`'s copy is correct as written; on Branch A it is historical only.
  - **Status**: pending
  - **Plan Set**: `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 4 of 7)
  - **Satisfies**: R1 — sidebar entry to a tracking page; a job opens a detail page with prompt, elapsed time and error status, plus a jump to the triggering bubble
  - **Depends on**: `P1-NIN-A006`
  - **Plan**: `.workflows/plan/nina-image-pipeline-and-async-chat/phase-4.md`
  - **Card**: `miftahulmahfuzh/run-insights#99`
  - **Files**: app/nina/jobs/page.tsx, app/nina/jobs/[id]/page.tsx, components/nina/NinaJobList.tsx, components/nina/NinaJobDetail.tsx, components/nina/NinaJobElapsed.tsx, and 5 more

- [ ] **P1-NIN-A008** Phase 5: The tracking section on `/nina/about`, below Media
  - **Difficulty**: EASY
  - **Type**: Feature
  - **Context**: The smallest phase in the set: 2 files, not the draft's 3 - the third was a constant in `lib/nina/album.ts` that its own D-3 argues against. Reuses phase 4's `NinaJobList` rather than writing a second renderer, and supplies only the empty-state sentence through `emptyText`. Two row renderers is exactly the drift the 'no second row renderer' rule exists to stop.
  - **Status**: pending
  - **Plan Set**: `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 5 of 7)
  - **Satisfies**: R3 — put the image-generation tracking section below the Media section on Nina's detail page
  - **Depends on**: `P1-NIN-A007`
  - **Plan**: `.workflows/plan/nina-image-pipeline-and-async-chat/phase-5.md`
  - **Card**: `miftahulmahfuzh/run-insights#100`
  - **Files**: components/nina/NinaAboutJobs.tsx, app/nina/about/page.tsx

- [ ] **P1-NIN-A009** Phase 6: Permanent session deletion: take the distilled memory with it
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: `removeNinaSession` becomes a four-statement `db.batch` that purges the session's distilled `nina_memory_facts` in the SAME transaction as the delete. The provenance fork is decided: **PURGE**, not keep-dangling, rung 5 - the user's raw input overrides the schema's stated design, because the memory ledger is the only surviving channel by which a deleted session still pollutes her. **Generates NO migration and adds NO foreign key**, deliberately: an `ALTER TABLE ... ADD CONSTRAINT` cannot be applied while dangling pointers exist in production, and hand-writing a pre-clean `DELETE` into a generated migration is the class of edit invariant 10 forbids. 7 files, not 5, and the package loses `drizzle` - the two extra are the schema comment and the schema test whose prose asserts the design being overridden; the draft counted the mechanism and not the paper trail. **`scripts/nina-memory-reap.mjs --apply` is the one irreversible act in the set** and is dry-run by default; the `\copy` snapshot is taken first. R8 is NOT satisfied by this phase alone - phase 3 owns the delete-mid-turn guard.
  - **Status**: in_progress
  - **Plan Set**: `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 6 of 7)
  - **Satisfies**: R8 — deleted chat sessions must be permanently deleted; they still pollute Nina's character
  - **Plan**: `.workflows/plan/nina-image-pipeline-and-async-chat/phase-6.md`
  - **Card**: `miftahulmahfuzh/run-insights#101`
  - **Files**: lib/nina/queries.ts, lib/nina/sessionActions.ts, lib/db/schema.ts, scripts/nina-memory-reap.mjs, package.json, tests/nina.sessionPurge.test.ts, tests/db.schema.nina.test.ts

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
