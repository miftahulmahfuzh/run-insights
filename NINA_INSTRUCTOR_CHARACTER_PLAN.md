# Plan: the Instructor character

**Slug:** nina-instructor-character
**Date:** 2026-09-07 07:54:44 +07
**Analysis:** `20260907-075444-INST_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-instructor-character`
**Branch:** `feature/nina-instructor-character` (base: `origin/main` @ `f839116`)
**Phases:** 3
**Status:** in progress
**Reconciled:** yes — three phase plans reconciled in one round; see **Reconciliation Log**
**Baseline suite:** green on this branch at **145 test files, 2834 tests**. Every phase's exit
criteria are measured against that number: the file count stays 145 (no phase creates a test file)
and the test count only rises.
**Coordinator:** `orch-nina-instructor-character`

---

## Why

The user's raw input, verbatim:

```
to make it a nice 3 columns x 2 rows , add a new character: Instructor . nina act as a
professional and knowledgeable instructor in which her primary objective is to improve the
performance of miftah's running. she will set up schedules, she will proactively monitor his
performance and give insights into what should he do (e.g: what should he do to reduce his
average high heart rate during run, what should he do to increase his average running pace,
and so on)
```

Five of the six sentences describe a **character**; the first describes the **grid it sits in**. Both
are in scope and neither is a rephrasing of the other.

The thing this request is standing on, which the analysis found and which shapes all three phases:
**the monitoring already exists.** `lib/nina/patterns.ts` computes `REPEATED_HIGH_AVG_HR` and
`PACE_REGRESSION` — the user's two named examples, by name, with strict thresholds and tests. What
the app does with a fired pattern today is get *angry* about it (`angerSourceClause`: *"This is where
your anger comes from"*). That is the right response for a best friend and it is not what a coach
does with the same number. **The gap is not detection; it is that shouting is currently the only
thing the app knows how to do with a detected pattern.**

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | *"to make it a nice 3 columns x 2 rows"* — the character picker reads as a clean 3-across, 2-down grid, not a ragged 3 + 2 | 1 |
| R2 | *"add a new character: Instructor"* — a sixth character, *"a professional and knowledgeable instructor"* whose *"primary objective is to improve the performance of miftah's running"* | 1 |
| R3 | *"she will set up schedules, she will proactively monitor his performance and give insights into what should he do"* — reduce a high average HR, increase average pace | 2, 3 |

Final after reconciliation, and unchanged from the draft: **R1 -> 1, R2 -> 1, R3 -> 2 and 3.** No
requirement moved between phases and no requirement is unowned. One piece of *work* moved — the
prose naming of phase 2's slot, from phase 2 to phase 3 (D7) — but both phases already serve R3, so
no `Satisfies` line widened and no `R` changed hands.

**R1 and R2 share phase 1, and the coupling is real rather than a convenience.** The grid reads 3x2
only because a sixth card exists, and the sixth card lands in a ragged grid unless the cells are
squared up. They cannot ship apart, so they are not split apart. Per the decomposition rule, that
coupling is stated rather than pretended away.

## Scope

**In scope**

- `'instructor'` as a sixth `NINA_RELATIONSHIPS` member, appended, with every reader filled in:
  `NINA_ADDRESS`, `NINA_RELATIONSHIP_BLOCKS`, `RELATIONSHIP_NOTE`, `RELATIONSHIP_GLOSS`
- The `nina_tuning.relationship` docstring, and the hardcoded address-forms prose at
  `lib/nina/prompts/distill.ts:105` — the two places the compiler cannot help
- Equal-height cells in the character grid, so six cards read as a rectangle
- A tenth memory slot holding the training schedule she authors, with its `canonicalise`, its
  distiller line, its `/admin/memory` label and its refusal reason
- The instructor's coaching register: what she does with `patterns`, `recentRuns` and `records`,
  gated on the relationship, and the prescriptions for the two examples the user named
- The proactive suffix, so an opener under `instructor` arrives as a coach's
- `NINA_PROMPT_VERSION` 4 -> 5, once, in phase 3
- `NINA_DISTILL_PROMPT_VERSION` 2 -> 3, once, in phase 1 — a *different* constant, covering the
  librarian's prompt, which both phase 1 (directly) and phase 2 (through `SLOT_VOCABULARY_BLOCK`)
  change. One bump for the set; see Decisions, D6

**Out of scope, and it stays out**

- **`NINA_NOT_A_DOCTOR`, and `'the name of a medical condition'` in `NEVER_SAY`.** Not touched, not
  gated, not softened at this level. R3 asks her to advise on a heart rate, which raises this
  guardrail's stakes rather than lowering them. The instructor prescribes **training**, never
  physiology — see Decisions, D4.
- **`NINA_DEFAULT_RELATIONSHIP`.** Stays `best_friend`. A sixth option is an option.
- **The other five levels' rendered bytes.** Invariant 1, gated by the frozen snapshot.
- **`lib/nina/patterns.ts`.** No new `PatternCode`. The file's own rule is that a coined code is a
  medical-adjacent claim nobody wrote or tested; both codes R3 names already exist.
- **`lib/nina/proactive.ts`.** No new trigger, no new priority entry, no new idempotence marker, no
  new table. The five openers are reshaped by tuning, not added to — see Decisions, D5.
- **`lib/nina/context.ts`.** Off-limits by the standing invariant carried from the tuning set.
- **`lib/nina/prompts/tools.ts`.** No tool schema change. The instructor uses the tools she has.
- **The database.** No migration. `relationship` is `text`; the slot key is `text`. Both domains are
  TypeScript so that widening one is a code change.
- **The dials.** Not one of the seventeen changes meaning, default, or bound.
- **Any calendar, reminder, or notification scheduler.** "Set up schedules" is read as a training
  plan she authors and maintains — see Decisions, D3.

## Invariants

1. **The five existing levels render byte for byte.** `tests/__snapshots__/nina.prompts.test.ts.snap`
   is the gate. It is **never regenerated** — `vitest -u` is forbidden in this set, and a snapshot
   failure is a bug in the change, not in the file.
2. **`buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` is unchanged.** The default is `best_friend`, so
   every instructor block must be gated on the relationship and contribute zero bytes elsewhere.
3. **The tree builds and `npx vitest run` passes at the end of every phase.**
4. **One vocabulary, one home.** No phase retypes a relationship list, a slot list, or an address
   word that already exists in a module it can import. `z.enum(NINA_RELATIONSHIPS)` and
   `SLOT_VOCABULARY_BLOCK` are the proof this holds today; keep it holding.
5. **`NINA_NOT_A_DOCTOR` and `NEVER_SAY` are unedited**, at every level, in every phase.
6. **`NINA_PROMPT_VERSION` is bumped exactly once, in phase 3**, and by exactly one.
   **This invariant is about that constant only.** `NINA_DISTILL_PROMPT_VERSION`
   (`lib/nina/prompts/distill.ts:21`) is a different constant for a different model call — its own
   docstring says it *"moves on its own schedule"* — and it is bumped exactly once, in **phase 1**,
   by exactly one (D6). Two version constants, two owners, one bump each; no phase bumps both and no
   constant is bumped twice.
7. **No new database table, column, or migration.**
8. **Every new prompt string is in her register** — Jakarta Indonesian where she speaks, and the
   existing files' voice where it is instruction to the model.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | The sixth character, and the 3x2 grid | R1, R2 | `lib/nina`, `lib/admin`, `components/admin`, `lib/db` | 9 | — | NORMAL | `.workflows/plan/nina-instructor-character/phase-1.md` | `P1-NIN-A016` | — |
| 2 | A schedule she can keep | R3 | `lib/nina`, `lib/admin` | 6 | — | NORMAL | `.workflows/plan/nina-instructor-character/phase-2.md` | `P1-NIN-A017` | — |
| 3 | The coaching register and the insight path | R3 | `lib/nina` | 4 | 1, 2 | HARD | `.workflows/plan/nina-instructor-character/phase-3.md` | `P1-NIN-A018` | — |

**File counts are post-reconciliation and each was checked against the phase plan's own Files
table.** Phase 1 is 9 (`tuning.ts`, `persona.ts`, `tuningModel.ts`, `prompts/distill.ts`,
`db/schema.ts`, `CharacterPanel.tsx`, and three test files). Phase 2 is **6, not the draft's 5**:
`lib/nina/prompts/system.ts` is **out** (see D6's neighbour in the Reconciliation Log, conflict C1)
and `lib/admin/memoryModel.ts` + `lib/admin/schema.ts` are **in** for comment text only. Phase 3 is 4
(`persona.ts`, `prompts/system.ts`, `prompts/index.ts`, `tests/nina.prompts.test.ts`).

**Concurrency and file ownership, after reconciliation.** Phases 1 and 2 share **no file** and run
concurrently — verified against both Files tables. Phase 3 depends on both: it needs `'instructor'`
in the union to gate on (phase 1) and it names the schedule slot key in its gated prose (phase 2).
Phase 3 shares two files with phase 1 — `lib/nina/persona.ts` and `tests/nina.prompts.test.ts` —
append-only, in disjoint regions, and strictly after it, so the only cost is that **phase 3's line
numbers for those two files are pre-phase-1 and must be resolved by anchor text**, which its plan now
tabulates. `lib/nina/prompts/system.ts` is **phase 3's alone**; `lib/admin/schema.ts` is **phase 2's
alone** (comment only).

### Phase 1 — The sixth character, and the 3x2 grid
**Satisfies:** R1, R2
**Owns:** `'instructor'` appended to `NINA_RELATIONSHIPS`; `NINA_ADDRESS.instructor`;
`NINA_RELATIONSHIP_BLOCKS.instructor`; `RELATIONSHIP_NOTE.instructor`;
`RELATIONSHIP_GLOSS.instructor`; the prose address list at `distill.ts:105`;
**`NINA_DISTILL_PROMPT_VERSION` 2 -> 3 (D6)**; the `nina_tuning.relationship` docstring; the reworded
"stays at nine" sentence at `tuning.ts:44`; the grid's equal-height cells in `CharacterPanel.tsx`;
and the four test files that count or enumerate the levels — including the four-render snapshot
guard at `tests/nina.prompts.test.ts:220`, where `'instructor'` is excluded **by name in the loop
body only** because the `it()` title is the snapshot's key and renaming it would orphan the stored
value.
**Does not touch:** `lib/nina/prompts/system.ts`, `lib/nina/prompts/index.ts`, `NINA_PROMPT_VERSION`,
`lib/nina/memory.ts`, `lib/admin/memoryVocab.ts`, `lib/admin/memoryModel.ts`,
**`lib/admin/schema.ts`** (the Zod enum reads the array, so no edit is needed there — and phase 2
owns the comment-only slot-count edit in that file), the anger ladder, `NINA_NOT_A_DOCTOR`,
`NEVER_SAY`, `lib/nina/patterns.ts`, `lib/nina/proactive.ts`, `lib/nina/context.ts`.
**Exit criteria:** six cards render three-across and two-down with cells of equal height at `xl`, by
`sm:auto-rows-fr` on the grid container and **no `h-full` on the cards** (the cards already stretch
inside their row; what was ragged is row-to-row height), with the class string surviving
`prettier-plugin-tailwindcss` unreordered; all four `Record<NinaRelationship, …>` sites and all four
prose sites filled; `npx tsc --noEmit` clean; `npx vitest run` green at **145 test files** and ≥ 2834
tests, **including the frozen snapshot, unregenerated**; selecting Instructor and saving yields a
prompt in which she is a professional coach and the runner's performance is the point;
`buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` byte-identical; `NINA_PROMPT_VERSION === 4` still and
`NINA_DISTILL_PROMPT_VERSION === 3`.

### Phase 2 — A schedule she can keep
**Satisfies:** R3 (the "set up schedules" half)
**Owns:** the tenth `NINA_SLOT_KEYS` member for the training plan — spelled **`training_plan`**, at
index 3 immediately after `running_days` — its `NINA_SLOT_SPECS` entry (`policy: 'replace'`,
`category: 'training'`, `canonicalise: prose(raw, 400)`, `prompt`), its `SLOT_LABELS` entry and
refusal reason in `lib/admin/memoryVocab.ts`, the slot-count prose in `lib/admin/memoryModel.ts` and
`lib/admin/schema.ts` (comments only), and the two slot-count test files.
**Does not touch:** **`lib/nina/prompts/system.ts` — at all** (reconciled, conflict C1: the
`memory.slots` paragraph of `buildContextGuide` is **no phase's** in this set and stays
byte-identical, because it appears verbatim four times inside the frozen snapshot and an *ungated*
byte there fails it four times; the slot's prose naming moved to phase 3's gated instructor block,
D7). Not `lib/nina/prompts/distill.ts` — no edit is needed there, and `NINA_DISTILL_PROMPT_VERSION`
is phase 1's bump (D6). Not `lib/nina/prompts/index.ts` or `NINA_PROMPT_VERSION`. Nothing
relationship-shaped — not `NINA_RELATIONSHIPS`, not `NINA_ADDRESS`, not `NINA_RELATIONSHIP_BLOCKS`,
not `CharacterPanel.tsx`; the string `instructor` does not appear in this phase's diff. Not
`running_days` or `goals`, whose specs and canonicalisers are unchanged. Not `lib/nina/context.ts`.
**Exit criteria:** `NINA_SLOT_KEYS` has ten members with `training_plan` fourth and
`pending_promises` last; the slot round-trips through `canonicalise`, refuses an empty value to a
ledger fact rather than storing it, appears at `/admin/memory` with a label, a hint and an editable
value, and is described to the distiller by **exactly one** rendered line from
`SLOT_VOCABULARY_BLOCK` with nothing retyped. **Neither `lib/nina/prompts/system.ts` nor
`lib/nina/prompts/distill.ts` appears in `git diff --name-only`** — so the slot is deliberately *not*
named in the context guide, and that omission is the design rather than a gap; phase 3's gated block
is where the key name reaches Nina. `npx tsc --noEmit` clean; `npx vitest run` green at **145 test
files** and ≥ 2834 tests; the frozen snapshot byte-identical.
**The one thing to get right:** the slot is **useful to every level**, not only the instructor. A
best-friend Nina who knows his training plan is better at her job too. Nothing in this phase gates on
the relationship, and that is deliberate — a slot that only one setting can fill is a slot the
distiller will not learn to write.

### Phase 3 — The coaching register and the insight path
**Satisfies:** R3 (the "monitor and give insights" half)
**Owns:** the instructor's coaching block in `lib/nina/persona.ts` (`isInstructor`,
`INSTRUCTOR_COACHING`, `ninaInstructorCoachingBlock`), gated on the relationship; **and all three of
its edits to `lib/nina/prompts/system.ts`, which is this phase's file alone** — the `"patterns"`
paragraph of `buildContextGuide` (`:247`) so a fired code reads as something to prescribe against and
not only as a source of anger, the `WHAT YOU ARE READING` section of `buildNinaSystemPrompt` (`:485`)
where the coaching block lands, and **`proactiveTuningSuffix` (`:594`)**. `NINA_PROMPT_VERSION` 4 -> 5
in `lib/nina/prompts/index.ts` (`:36`). The gated prose naming of phase 2's `training_plan` slot key
(D7). And the register's tests.

> **Corrected here by the reconciler:** the draft put the proactive suffix in
> `lib/nina/prompts/index.ts`. It is not there. `proactiveTuningSuffix` (`:594`), `PROACTIVE_COPY`
> (`:643`) and `buildProactiveInstruction` (`:684`) all live in **`lib/nina/prompts/system.ts`**;
> `index.ts` is a barrel plus `NINA_PROMPT_VERSION`, and that constant is the *only* reason this
> phase opens it. Phase 3's own plan was already right.

**Does not touch:** `NINA_RELATIONSHIPS` and every `Record` over it (phase 1 filled them);
`NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` (phase 2 owns the slot — this phase only *names* the key in
gated prose); the `memory.slots` paragraph of `buildContextGuide` (`system.ts:235`), which no phase
edits; `angerSourceClause`, `rungClause`, `lectureClause`, `sulkClause`, `PROACTIVE_COPY` and the
five trigger strings; the anger ladder's floor and ceiling tables; `NINA_NOT_A_DOCTOR`; `NEVER_SAY`;
`lib/nina/patterns.ts`; `lib/nina/proactive.ts`'s priority, markers and thresholds;
`lib/nina/context.ts`; `lib/nina/prompts/distill.ts` and `NINA_DISTILL_PROMPT_VERSION` (phase 1's).
**Exit criteria:** under `instructor` the prompt prescribes against `REPEATED_HIGH_AVG_HR` and
`PACE_REGRESSION` in training terms — a day, an effort, a duration and a field to re-read; the gate
is `ninaActiveRelationship(tuning) === 'instructor'` and **never** `tuning.relationship`, so clearing
the relationship checkbox degrades to `best_friend` and the whole register leaves the prompt with it;
the coaching block, the `"patterns"` clause, the proactive line and the slot key are **absent** from
all five other levels (asserted per level, not once); `buildContextGuide` never contains
`training_plan` at any level; the frozen snapshot passes unregenerated; the anger ladder renders
identically at all six relationships; `NINA_PROMPT_VERSION === 5`; `npx vitest run` green at **145
test files** and ≥ 2834 tests.

## Reconciliation Log

One round. Ten conflicts found, ten resolved, none deferred. Every row was re-verified against the
actual source before being settled — the phase planners' claims are marked **confirmed** or
**corrected** accordingly.

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| C1 | **The frozen snapshot vs `buildContextGuide`.** The draft index assigned phase 2 the `memory.slots` paragraph. That paragraph is inside the frozen snapshot four times, so any *ungated* byte added to it fails the snapshot four times, and `vitest -u` is forbidden by invariant 1. Phase 2 unilaterally dropped the edit; phase 3 independently resolved its own two edits to the same file by gating. Both planners flagged it and asked the reconciler to settle it. | 2, 3 | **Both claims confirmed against the source** — the `.snap` holds exactly one `exports[...]` entry, `git log --follow` returns exactly one commit, and the `memory.slots` paragraph appears verbatim at `:155`, `:328`, `:501`, `:674`. **Phase 2's deviation is right and the draft index was wrong.** Resolved on rule 1 (build-green wins) plus invariant 1, which outranks a draft file list: the paragraph is now **no phase's** and stays byte-identical; phase 2's `system.ts` edit is dropped for good; phase 3's gating resolution stands unchanged. The index's phase-2 Owns, Does-not-touch and Exit-criteria lines and its file count were all rewritten to match, so no phase is still assigned an edit it does not make. Phase 3's "cross-phase warning for the reconciler" paragraph was replaced with the settled outcome, and phase 2's P2-D4 reframed from a request into a ratified record. |
| C2 | **Phase 2's Appendix A** carried the exact unapplied paragraph edit alongside its reasoning — a plan file containing both the dropped edit and why it was dropped, as live-looking instructions. | 2 | Retitled **"Appendix A — NOT AN INSTRUCTION. DO NOT APPLY THIS EDIT, IN ANY PHASE."** with a blockquoted STOP preamble naming C1's outcome, the four snapshot line numbers it would break, and the invariant it would violate. Kept rather than deleted, per its own stated purpose (a future set that deliberately relaxes invariant 1 finds the sentence already reviewed), but no longer readable as a step. |
| C3 | **`NINA_DISTILL_PROMPT_VERSION` genuinely unassigned.** `distill.ts:21`, currently `2`, hand-bumped whenever the librarian prompt changes. Phase 1 changes that file's bytes and did not bump; phase 2 changes the same rendered prompt indirectly through `SLOT_VOCABULARY_BLOCK` and does not open the file. Phases 1 and 2 run concurrently, so "whoever lands last" is unresolvable at plan time. Not covered by invariant 6. | 1, 2 | **Assigned to phase 1** — see Decisions, **D6**. Written into phase 1 as Step 5d with the exact before/after and a changelog paragraph that names phase 2's slot, added to its Interface Contract (Value changes), its Files table and its exit criteria. Phase 2's contract and handoffs now say the bump is phase 1's and that phase 2 **must not** bump it even if it notices the drift. Invariant 6 gained a clarifying sentence: two version constants, two owners, one bump each. |
| C4 | **The index's phase-3 "Owns" line put the proactive suffix in `lib/nina/prompts/index.ts`.** | 3 | **Index corrected; the plan was right.** Verified: `proactiveTuningSuffix` is at `system.ts:594`, `PROACTIVE_COPY` at `:643`, `buildProactiveInstruction` at `:684`; `index.ts` is a barrel plus the version constant, which is the only reason phase 3 opens it. Rule 4 — the losing text was rewritten, not caveated. |
| C5 | **File counts wrong in the Phases table** (9 / 5 / 4). | 1, 2, 3 | Each count re-derived from the phase plan's own Files table: **9 / 6 / 4**. Phase 2 is 6 — `system.ts` out (C1), `lib/admin/memoryModel.ts` and `lib/admin/schema.ts` in for comment text only. Phases 1 and 3 confirmed at 9 and 4. |
| C6 | **The index's phase-2 exit criterion "is named in the context guide"** — which under C1 is no longer phase 2's work at all. | 2 | Replaced with its inverse, stated as design rather than omission: **neither `system.ts` nor `distill.ts` may appear in phase 2's diff**, so the slot is deliberately *not* named in the guide, and phase 3's gated block is where the key name reaches Nina. |
| C7 | **The gate expression.** Phase 1's handoff requires `ninaActiveRelationship(tuning) === 'instructor'` and forbids `tuning.relationship`, because `enabled.relationship` is an off-switch. Phase 3's contract only named a `persona.isInstructor` helper without showing the reconciler its body. | 1, 3 | **Verified, no bug, no edit needed.** Phase 3's Step 1 writes exactly `ninaActiveRelationship(tuning) === 'instructor'`, and its docstring gives phase 1's reason in phase 1's words. The two plans agree. Recorded here so the check is not re-run downstream, and phase 3's assumption table — which had left this "for the reconciler to check" — is now marked bound. |
| C8 | **Gap found on the reconciler's own pass: phase 2's slot key would reach Nina nowhere.** C1 removed the only place the key name was to be spelled in the system prompt, and her own `slotKey` field is free text (`prompts/tools.ts:112` still suggests a key that no longer exists), so she could not reliably write the plan phase 3 tells her to keep. Phase 2 asked phase 3 to name it; phase 3 had deliberately named it by role only and left the call to the reconciler. | 2, 3 | **Assigned to phase 3** — see Decisions, **D7**. Rule 5 (gaps are assigned to the phase that already owns that region). `INSTRUCTOR_COACHING`'s plan bullet now spells `"training_plan"`, `kind: "slot"`, `"save_memory"` and the `replace` semantics phase 2's contract fixes; a new eleventh test case asserts the key at `instructor`, its absence from `DEFAULT_RENDER`, its absence from every other level's render, and its absence from `buildContextGuide` at every level. Zero default-render bytes, so the snapshot is untouched. No `R` moved: both phases already serve R3. |
| C9 | **`lib/admin/schema.ts` double-claimed.** Phase 1's "Leaves alone" listed it as "nobody's, this set"; phase 2's Files table edits its `slotKeySchema` comment. | 1, 2 | **Assigned to phase 2** (rule 3, one owner per region — and it is the only phase with a reason to touch it). Phase 1's line now says explicitly that no relationship edit is needed there, because `z.enum(NINA_RELATIONSHIPS)` widens for free, and that the comment-only slot-count edit is phase 2's. The index's phase-1 Does-not-touch line records the same. |
| C10 | **Two stale facts every plan repeated.** Phases 1 and 2 both instruct the implementer to run `npm ci` / `npm install` because "this worktree has no `node_modules`", and no phase states the baseline test numbers its exit criteria are measured against. | 1, 2, 3 | Corrected in all three: the install instruction is struck with the reason it was struck, and each phase now states the branch baseline — **145 test files, 2834 tests** — with the note that no phase creates a test file, so 145 is the number at the end of each. Also added to the index header. |

**Coverage, re-checked after the edits.** All 18 of the analysis's Impact Points are owned, with one
deliberate retirement: **impact point 12** — *"`lib/nina/prompts/system.ts` — the `memory.slots`
paragraph of `buildContextGuide`"* — is **owned by no phase**, and that is C1's outcome rather than a
gap. The analysis prescribed the paragraph before anyone had checked what the frozen snapshot pins;
the intent behind it (Nina learns the new slot key exists) is served instead by phase 3's gated
block, which is impact point 15's file. Every other impact point maps 1:1 onto the phase the analysis
assigned it to. On the Reference List: all **four** compiler-enforced sites are filled by phase 1 —
`NINA_ADDRESS` (`tuning.ts:391`), `NINA_RELATIONSHIP_BLOCKS` (`persona.ts:206`),
`RELATIONSHIP_GLOSS` (`distill.ts:51`, via `satisfies`) and the token record
(`tests/nina.prompts.test.ts:520`) — and so are all **four** prose sites the compiler cannot check
(`RELATIONSHIP_NOTE`, `distill.ts:105`, `db/schema.ts:1686`, `tuning.ts:44`), which is the half where
a miss would have been silent. No phase touches `lib/nina/context.ts`, `lib/nina/patterns.ts`,
`lib/nina/proactive.ts`, `NINA_NOT_A_DOCTOR`, `NEVER_SAY` or the anger ladder tables.

**Contract movement:** none. No deletion, creation or rename moved between phases. C3 assigns a
value change that was previously unowned, and C8 assigns a prompt-string edit that was previously
unowned; neither takes work *away* from a phase that another phase was written against. C1 removes a
phase-2 edit that phase 3 had already assumed would not land in the form the draft described, so
phase 3's contract needed no rewrite either. **A second round is therefore not required.**

## Decisions

_The forks settled during decomposition (D1-D5) and during reconciliation (D6-D7). D1-D5 are
unchanged._

| Fork | Chosen | Rung |
|---|---|---|
| D1 — where `'instructor'` goes in the array, whose documented order is least-to-most intimate | **Appended, position 6.** A coach is not on the intimacy axis at all, so no insertion point is more truthful than any other; appending keeps all five existing indices stable, leaves the "in the order the user wrote them" story true of the five it was written about, and puts the new option where an operator looks for a new option. Reading order also stays sensible: row 1 is nobody / casual friend / sister, row 2 is best friend / girlfriend / instructor. | 5: the user's raw input names it as an addition, not a reordering |
| D2 — the grid's breakpoints, given R1 asks for 3x2 | **Breakpoints unchanged (`sm:grid-cols-2 xl:grid-cols-3`); the "nice" is delivered by equal-height cells plus the sixth card.** `AdminNav` is `lg:sticky` in the grid's first column, so from 1024 px the nav *takes* a column: three cards each carrying a label and a sentence would be ~250 px wide at `lg` and ~340 px at `xl`. Dropping the breakpoint to `lg` to reach 3x2 sooner would buy the shape and lose the legibility, and one card per row on a phone stays right. What actually makes it ragged today is unequal cell heights, and that is what phase 1 fixes. | 6: surrounding convention — the responsive phase's own breakpoint choice, plus the ≥44 px touch rule |
| D3 — what "set up schedules" means | **A training plan she authors, in a tenth memory slot.** Not a calendar integration, not a notification scheduler, not a new cron trigger. The app already has a scheduler (`proactive.ts`) and a durable per-key store with a refusal path (`NINA_SLOT_SPECS`); a schedule she states in a message and cannot store is one she contradicts next week. `running_days` holds *which* days and `MISSED_USUAL_DAY` already monitors it; neither can hold *what he does* on them, which is the hole. | 5: the user's raw input asks for schedules and monitoring, not for infrastructure |
| D4 — R3 asks for heart-rate advice; `NINA_NOT_A_DOCTOR` forbids presenting a number as clinically dangerous | **Both hold, unedited. The instructor prescribes training, never physiology.** "Run your easy days easier and hold this pace for six weeks" is coaching; "your heart rate indicates a problem" is the sentence the guardrail exists to prevent. `persona.ts:1016` records the ruling that kept this rule through a plan set whose stated iron rule was to repeal rules, and `lib/llm/facts.ts` records a *measured* failure (a flipped sign on an aerobic-decoupling calculation) as why the arithmetic rules exist. A professional coach is more careful here than a friend, not less. | 1: stated invariant (5), and the standing ruling at `persona.ts:1016` |
| D5 — whether "proactively monitor" needs a new proactive trigger | **No. The five openers are reshaped, not added to.** `evaluatePatterns` already fires on both codes the user named, `pattern_crossed` already opens a conversation about a fired code, and `buildProactiveInstruction` already takes `tuning` and already appends a tuning-dependent suffix. A sixth trigger would need its own idempotence marker and its own priority slot, for behaviour the existing path produces once the register is right. | 4: the index's Why — the gap is the response, not the detection |
| D6 — `NINA_DISTILL_PROMPT_VERSION` (`distill.ts:21`, `2`) is hand-bumped whenever the librarian's prompt text changes. Phase 1 changes that text directly; phase 2 changes the same *rendered* prompt indirectly through `SLOT_VOCABULARY_BLOCK`; the two run concurrently, so "whoever lands last" cannot be resolved at plan time, and invariant 6 covers only `NINA_PROMPT_VERSION`. | **One bump, `2 -> 3`, assigned to phase 1** — the phase that already edits the file and owns its bytes. The version identifies the librarian prompt **as it ships**, and the whole set merges as one branch, so a single bump correctly describes both edits; phase 1's changelog paragraph names phase 2's slot explicitly so a phase-2 session finds its own change already accounted for. Phase 2 must not also bump it, and phase 3 does not open `distill.ts` at all. Two phases writing one hand-maintained integer is the collision this avoids. | 6: surrounding convention — the file's own hand-bump rule, plus one-home-per-vocabulary; and the constant's own docstring, which separates it from `NINA_PROMPT_VERSION` and says it *"moves on its own schedule"* |
| D7 — after D6's neighbour (conflict C1) removed the `memory.slots` paragraph edit, **nothing in Nina's system prompt would ever spell the new slot key.** Her `slotKey` field is free text and `prompts/tools.ts:112` still suggests a key that has not existed since the vocabulary closed, so a key she is never told is a key she cannot reliably write — a real gap in R3's "set up schedules" half. But the guide's paragraph cannot carry it: an ungated byte there fails the frozen snapshot four times. | **Phase 3's gated `INSTRUCTOR_COACHING` names it: `"training_plan"`, with `kind: "slot"`, `"save_memory"` and the `replace` semantics spelled out.** That block is `''` at the other five levels, so the key reaches exactly the one relationship whose whole job is authoring the plan, at **zero default-render bytes** — the snapshot never sees it. It is one identifier in one gated string, not a second home for the slot vocabulary, so invariant 4 still holds: `NINA_SLOT_SPECS` remains the only place the list lives. Both phases already serve R3, so no `Satisfies` line changed. | 2: the phases' exit criteria — phase 2's own Interface Contract states that *"phase 3's gated prose is the only place that key name can reach her in the system prompt"*, and its exit criterion is that the slot be usable by her; phase 3's contract left the call open with the edit costed at one string |

## Open Questions

**None.** Every fork in this set — the five taken during decomposition and the two taken during
reconciliation — was decided on a stated rung and recorded in **Decisions** above; every conflict the
three parallel planners surfaced is closed in the **Reconciliation Log**, with the losing side edited
*out* of the plan file rather than left standing beside the winner. Every requirement id is owned:
R1 and R2 by phase 1, R3 by phases 2 and 3.

Nothing here qualified for this section, because nothing in this set has a branch that cannot be
walked back: the relationship is one `text` value an operator changes with one click and
`coerceNinaRelationship` degrades an unknown one without throwing; the slot is one `nina_memory_slots`
row that becomes a deletable orphan if its key is reverted; both prompt-version constants are traces
rather than cache keys; and every new prompt block is gated so the default render is byte-identical.
No migration runs in either direction.

**A phase session that finds itself with a question this document does not answer should treat that
as a reconciliation miss and say so, not park the work** — but it should first re-read the
Reconciliation Log and Decisions, because four of the five conflicts the phase plans raised were
raised *for* the reconciler and are answered there rather than in the phase file that asked.

## Rollback

**Per phase.** Each phase is one commit on `feature/nina-instructor-character` and reverts alone:

- Phase 3 — revert. The instructor keeps her identity (phase 1) and loses the coaching mechanics; the
  other five levels were never affected. Drop `NINA_PROMPT_VERSION` back to 4.
- Phase 2 — revert. Any `nina_memory_slots` row already written under the new key becomes an unknown
  key, and `isNinaSlotKey` returns false for it, so it *drops out quietly* — the designed degradation.
  No migration either way.
- Phase 1 — revert. Any `nina_tuning` row already set to `'instructor'` becomes an unknown value, and
  `coerceNinaRelationship` degrades it to `best_friend` without throwing. This is exactly why the
  column is untyped `text`. `NINA_DISTILL_PROMPT_VERSION` goes back to 2 with the revert, which is
  correct — the librarian's prompt is back to what version 2 described. Note the asymmetry: reverting
  phase 1 alone leaves phase 2's tenth slot in the rendered librarian prompt under version 2, which
  is a logging inaccuracy and not a correctness problem (the constant is *"logged, never sent"*). If
  both are reverted the value is right again; if only phase 1 is, bump it by hand in the revert
  commit or accept the drift deliberately.

**As a whole.** Delete the branch. Nothing has been written to a shared table, no migration ran, and
no user-visible default moved.

## Notes for the phase sessions

Two facts about this repo that cost a night each when rediscovered:

- **A fresh worktree needs `.env.local`.** `lib/env.ts` validates 14 vars at load, so `next build`
  and every `db:*` script die without it. This worktree already has a copy — **and `node_modules` is
  already installed, so there is no install step.** The phase-1 and phase-2 plans were written before
  the install and both told you to run `npm ci` / `npm install` first; those instructions have been
  struck in place. Do not run them.
- **A Vercel preview cannot serve `/admin`** — `ADMIN_EMAILS`, `VAPID_*` and `AUTH_URL` are
  Production-scope only. Probe R1's grid from a local production build, not from a preview URL.

## Next

Execute the phases, starting at phase 1:

    /implement -f NINA_INSTRUCTOR_CHARACTER_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows:

    /analyze-orchestrator -f NINA_INSTRUCTOR_CHARACTER_PLAN.md

Or put them on the board first:

    /create-task --from-plan NINA_INSTRUCTOR_CHARACTER_PLAN.md
