# Phase 5: Memory: slots, ledger, the name

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R4 (distil everything he reveals, permanently, as the main context) · R7 (learn his
name and use its Indonesian short form)
**Depends on:** Phase 1, Phase 2, Phase 3
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

After this phase a finished Nina turn is *distilled*: everything the runner said about himself
becomes an append-only `nina_memory_facts` row with a `source_message_id`, and the subset that is
standing truth becomes a machine-readable `nina_memory_slots` upsert. The slot vocabulary exists
and is closed, so `running_days` is a string the evening cron can parse into weekdays rather than
prose someone has to guess at; `pending_promises` is a typed list phase 13 can evaluate without a
second model call. She also knows what to call him: `users.name` seeds candidate Indonesian short
forms, she offers them once in the first conversation, and the answer becomes the `nickname` slot
she then uses forever.

**Nothing distilled can be lost.** The ledger is append-only and the distiller has no path to any
UPDATE or DELETE; a slot upsert is always *preceded* by the ledger append of the same statement, so
a wrong slot is a recoverable mistake and never a destroyed fact. Every fact carries the
`source_message_id` it came from, which is what makes the whole distillation re-derivable from the
raw conversation if the slot logic is later found wrong. That property is the implementation of the
user's word "PERMANENTLY", and it is the reason the order of the two writes is specified rather
than incidental.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**

- `applyMemoryWrites` — the module-private helper in `lib/nina/actions.ts` (Phase 3, Step 7,
  the function directly below `sendNinaMessage`). Phase 3 wrote it as the placeholder for this
  phase and said so: *"Phase 5 replaces the INTERPRETATION here — vocabulary, contradictions, the
  nickname, distillation from the whole turn."* Its two gateway calls survive; only the
  interpretation is replaced. It is not exported, so nothing outside that file names it.

**Renames:** none.

**Creates — `lib/nina/memory.ts` (the pure half; no I/O, no `server-only`):**

- vocabulary: `NINA_SLOT_KEYS` (const tuple of 9), `NinaSlotKey`, `isNinaSlotKey`,
  `NINA_SLOT_SPECS` (`Readonly<Record<NinaSlotKey, SlotSpec>>`), `SlotSpec`, `SlotWritePolicy`
- weekdays: `IsoWeekday`, `JsWeekday`, `WEEKDAY_ID`, `WEEKDAY_EN_SHORT`,
  **`parseRunningDays(value: string | null | undefined): readonly IsoWeekday[]`**,
  `parseRunningDaysAsJsWeekday(value): readonly JsWeekday[]`,
  `isoToJsWeekday(day: IsoWeekday): JsWeekday`, `formatRunningDays(days): string`
- work hours: `WorkHours`, `parseWorkHours(value): WorkHours | null`,
  `formatWorkHours(hours: WorkHours): string`
- the name (R7): `syllabify(word: string): readonly string[]`,
  **`deriveNicknameCandidates(fullName: string | null | undefined): readonly string[]`**,
  `canonicaliseNickname(raw: string): string | null`,
  **`nameSlotValue(input: NameSlotInput): string | null`**, `NameSlotInput`,
  `FIRST_CONVERSATION_MESSAGE_LIMIT = 12`, `NICKNAME_CANDIDATE_LIMIT = 4`
- promises (R19, for phase 13): `PromiseCandidateSchema`, `PromiseCandidate`,
  **`mergePendingPromises(current, candidates, ctx): PromiseMergeResult`**, `PromiseMergeContext`,
  `PromiseMergeResult`, `MAX_PENDING_PROMISES = 12`
- the distiller's contract: `DistilledCandidateSchema`, `DistilledCandidate`,
  `DistillPayloadSchema`, `DistillPayload`, `describeDistillIssues`, `NINA_FACT_CATEGORIES`,
  `FACT_TEXT_MAX = 400`, `MAX_DISTILLED_CANDIDATES = 12`, `SLOT_CONFIDENCE_FLOOR = 80`,
  `UNVERIFIED_CONFIDENCE_CEILING = 40`, `verifyQuote(quote, haystack): boolean`
- planning: **`planMemoryWrites(input: MemoryPlanInput): MemoryPlan`**, `MemoryPlanInput`,
  `MemoryPlan`, `PlannedFact`, `PlannedSlot`, `DeferredSlot`, `DemotedWrite`,
  `MAX_PLANNED_FACTS = 24`

**Creates — `lib/nina/distill.ts` (the impure half; opens with `import 'server-only'`):**
`distillNinaMemory(deps): Promise<DistillResult>`, `distillWith(client, input, options)`,
`applyMemoryPlan(userId, plan, gateway)`,
`runTurnDistillation(input: TurnDistillationInput): Promise<void>`,
interfaces `NinaMemoryGateway`, `DistillClientLike`, `DistillInput`, `DistillResult`,
`TurnDistillationInput`, type `DistillSource`,
constants `DISTILL_PRIMARY_MS = 20_000`, `DISTILL_REPAIR_MS = 12_000`,
`DISTILL_OVERALL_MS = 34_000`, `DISTILL_MAX_TOKENS = 2_000`, `MIN_DISTILL_REPAIR_BUDGET_MS = 3_000`.

**Creates — `lib/nina/prompts/distill.ts`:** `DISTILL_SYSTEM_PROMPT`, `DISTILL_TOOL`
(`Anthropic.Tool`), `DISTILL_REPAIR_PREAMBLE`, `NINA_DISTILL_PROMPT_VERSION = 1`,
`SLOT_VOCABULARY_BLOCK`.
**This file is in Phase 2's directory but is not one of the four files Phase 2 declares there.**
Phase 2 creates `prompts/system.ts`, `prompts/tools.ts` and `prompts/index.ts`; this is a fifth,
additive file and it is not re-exported from `prompts/index.ts`, so Phase 2's barrel is untouched.

**Creates — `tests/nina.memory.test.ts`**, **`tests/nina.distill.test.ts`**.

**Signature changes (both are widenings by optional fields; no existing call site has to change):**

- `lib/nina/tools.ts` — `NinaToolGateway.saveMemorySlot`:
  `(userId: string, row: { key: string; value: string }) => Promise<void>`
  -> `(userId: string, row: { key: string; value: NinaSlotValue; source?: NinaMemorySource; sourceMessageId?: string | null }) => Promise<void>`
- `lib/nina/tools.ts` — `NinaToolGateway.appendMemoryFact`:
  `(userId: string, row: { text: string; sourceMessageId: string | null }) => Promise<void>`
  -> `(userId: string, row: { text: string; sourceMessageId: string | null; category?: NinaFactCategory; confidence?: number }) => Promise<void>`

`string` is a member of Phase 1's `NinaSlotValue` union and every new field is optional, so Phase
3's `handleSaveMemory` (`ctx.gateway.saveMemorySlot(ctx.userId, { key, value: text })`) and its
`appendMemoryFact` call compile **unchanged**, and so does Phase 3's fake tool gateway in
`tests/fixtures/ninaTurn.ts` — **that fixture is not edited by this phase.**

**`NinaToolGateway` gains no new METHOD.** The two reads this phase needs
(`readSlotSources`, `readPendingPromises`) are declared on this phase's own `NinaMemoryGateway`
in `lib/nina/distill.ts` and added to `dbNinaToolGateway` as extra members, with a compile-time
`const _memoryGateway: NinaMemoryGateway = dbNinaToolGateway` assertion in `gateway.ts`. One
implementation object, two interface views — so there is still exactly one way to upsert a slot,
and Phase 3's tools are not made to know about reads they never make.

**`scripts/check-llm-payload-boundary.mjs` — not touched by this phase (RULING D1).** Phase 1 owns
that file and ships the complete `GUARDED_CALLS` table whole, including `distillNinaMemory` with
`lib/nina/distill.ts` and `lib/nina/actions.ts` as its sanctioned callers. The table's name is
**`GUARDED_CALLS`**; this plan was written against phase 3's `BLOCKING_CALLS`, which no longer
exists. Nothing to add here.

**Requires (from earlier phases) — read these as fixed:**

1. **Phase 1** — `lib/db/schema.ts` exports `NinaMemorySource = 'distilled' | 'admin'`,
   `NinaFactCategory` (the seven values), `NinaSlotValue`, `NinaPendingPromise`,
   `NinaPendingPromisesSlot`, `NinaPromiseMetric`, `NINA_SLOT_PENDING_PROMISES = 'pending_promises'`.
   `nina_memory_slots` is `(user_id, key)` PK with `{value jsonb, source, source_message_id NULL,
   updated_at}`; `nina_memory_facts` is `{id, category, text, confidence int 0-100, source,
   source_message_id NULL, created_at}`.
   **RULING C3 — `NinaPendingPromise` also carries `jobId?: string | null`,
   `firedOn?: string | null` (Jakarta `YYYY-MM-DD`) and `attempts?: number`, added by phase 1 for
   phase 13's promise state machine.** All three are optional and the column is `jsonb`, so
   **there is no migration and this phase's candidate constructor (`normalisePromise`),
   `mergePendingPromises` and every case in `tests/nina.memory.test.ts` compile untouched** — the
   §6 code block above is verified against the widened type as written: it constructs an object
   literal with the required fields only, and it copies existing entries with a spread that carries
   any extra field through verbatim. Phase 13 *sets* those three fields **in place**, through the
   same rule this phase lays down for it in the Handoffs — resolve in place, write the whole slot
   back through `saveMemorySlot`, never remove an entry, carry the row's `source` through — so no
   new write path appears anywhere and `mergePendingPromises` stays the only constructor.
2. **Phase 1** — `lib/nina/queries.ts` exports `getNinaMemorySlots(userId): Promise<NinaSlotRow[]>`
   (`value` **rendered** to a string, `source` and `sourceMessageId` carried),
   `getNinaMemorySlot(userId, key): Promise<{ value: NinaSlotValue; source; updatedAt } | null>`
   (**parsed**), `upsertNinaMemorySlot(userId, input: NinaSlotUpsert)`,
   `appendNinaMemoryFacts(userId, rows: readonly NinaFactInsert[]): Promise<NinaFactRow[]>`,
   `listNinaMemoryFacts(userId, opts: { limit: number }): Promise<NinaFactRow[]>` (an **options
   object**, not a bare number — this phase does not call it, phase 2 and phase 16 do),
   `getNinaIdentity(userId): Promise<{ fullName; nickname }>`.
   **`updateNinaMemoryFact` and `deleteNinaMemoryFact` exist and this phase never imports either.**
   **RULING A2 — `countNinaMessages` does NOT exist and is not being added**; it was phase 3's
   spelling for a function phase 1 never wrote. It is struck from this list. This phase never wanted
   it (see the decisions on the open items), and if a real count is ever needed the general answer
   is `getNinaMessageWindow(userId, limit)`'s **`olderCount`**, which phase 1 does export.
   **RULING A2 — the plural `appendNinaMemoryFacts` is the canonical name and it wins.** Phase 3's
   `insertNinaMemoryFact` does not exist: phase 1 owns `lib/nina/queries.ts` and exports the batch
   form only, and phase 3's `lib/nina/gateway.ts` has been edited to call it. **Step 9 below is
   already written against the right name**, so nothing in this plan moves.
   One consequence to keep in view when editing Step 9: **this phase's structural R24 guarantee
   (ruling (c) rule 1) depends on exactly which functions the distiller imports**, so
   `tests/nina.distill.test.ts` case 14 — which `readFileSync`s `lib/nina/memory.ts` and
   `lib/nina/distill.ts` and asserts neither names `updateNinaMemoryFact` or
   `deleteNinaMemoryFact` — must keep asserting precisely that. It is unchanged in substance, and
   the import lists printed in Steps 5, 7 and 9 still satisfy it: the two mutating fact queries
   appear in neither module, and `appendNinaMemoryFacts` is imported by `gateway.ts`, which is
   neither of the two files case 14 reads.
3. **Phase 1** — `getNinaIdentity` reads the `nickname` slot and returns it only when
   `typeof raw === 'string' && raw.length > 0`. **The `nickname` slot value is therefore a bare
   JSON string, never an object.** This phase's canonicaliser guarantees that.
4. **Phase 2** — `lib/nina/context.ts` exports `MemorySlotInput { key, value: string, updatedAt }`
   and `MemoryFactInput { id, text, sourceMessageId, createdAt }`; slots reach the prompt as
   display strings and Nina is told she never coins a key. `NAME_RULES` already instructs her to
   ask once and to never invent a nickname from `runner.fullName` herself. `MEMORY_FACT_LIMIT = 60`.
5. **Phase 3** — `lib/nina/schema.ts` exports `NinaMemoryWriteSchema`, `NinaMemoryWrite`
   (`{ kind: 'slot' | 'fact', slotKey?: string, text: string }`) and `MAX_MEMORY_WRITES = 6`;
   `NinaSendPayload.memoryWrites` arrives **already validated**.
6. **Phase 3** — `lib/nina/gateway.ts` hosts every concrete gateway (`dbNinaSourceGateway`,
   `dbNinaToolGateway`, `dbNinaTurnStore`), is the only file in `lib/nina` that both talks to the
   database and knows an interface, and contains no arithmetic.
7. **Phase 3** — `lib/nina/actions.ts` is `'use server'`, persists the runner message before the
   model call, then the bubbles, then calls `applyMemoryWrites(userId, payload.memoryWrites,
   runnerMessage.id)` last and in its own `try`. `MAX_RUNNER_MESSAGE_CHARS = 4000`.
8. **Phase 1 (RULING D1)** — `scripts/check-llm-payload-boundary.mjs` has exactly one owner and it
   is phase 1, which ships the complete **`GUARDED_CALLS`** table whole — `getOrCreateInsight`,
   `runNinaTurn`, `distillNinaMemory` (sanctioned in `lib/nina/distill.ts` and
   `lib/nina/actions.ts`) and `describeNinaImage`. Consumed as shipped; this phase adds no entry.
   The name is `GUARDED_CALLS`, not phase 3's `BLOCKING_CALLS`, which no longer exists.
9. **Phase 3, ruling (b)** — both `send.memoryWrites` and the `save_memory` tool ship, and both
   land in the same two gateway write methods. This phase adds no third write path.
10. **`lib/llm/client.ts`** exports `narrativeClient()` and `narrativeModel()`; **`lib/id.ts`**
    exports `newId()`; **`lib/date/ranges.ts`** exports `jakartaDayOf`.

**Leaves alone (owned by others):**

- **The cron and the four triggers (Phase 10).** `running_days` is read there, never here. Phase
  10's own `parseRunningDays` and `DAY_TOKENS` **have been deleted in favour of this phase's** —
  RULING E4 accepted the edit verbatim and phase 10's plan already carries it. See the ruling below
  and the Handoffs.
- **The promise evaluator (Phase 13).** This phase writes and merges `pending_promises`; it never
  checks one against reality, never generates an avatar and never sets `status: 'met'`.
- **The context builder and every prompt Phase 2 declares (Phase 2).** `context.ts`, `load.ts`,
  `persona.ts`, `prompts/system.ts`, `prompts/tools.ts`, `prompts/index.ts` — untouched. The name
  confirmation reaches her through the `name` **slot's value**, which Phase 2 already renders, so
  no context type moves and no prompt is edited.
- **The admin memory editor (Phase 16).** No UI here. This phase supplies the guarantee Phase 16's
  exit criteria depend on — a hand-written row survives the next distillation pass — and nothing
  more.
- **`lib/nina/turn.ts`, `lib/nina/tools.ts`'s dispatch and dates logic (Phase 3).** Consumed. Only
  the `NinaToolGateway` interface block in `tools.ts` is edited.
- **Phase 9's `patterns.ts` and `nags.ts`.** No code is coined here and no threshold is defined.
- **`lib/llm/*`, `lib/format.ts`, `lib/db/queries.ts`.** Read and reused unchanged.

## Rulings this phase makes

Five decisions the other phases either asked for or would otherwise have to guess at.

### (a) `parseRunningDays` has exactly one owner, and it is this phase — in ISO weekdays

Phase 9 refused to write it and gave the right reason: *"parsing a display string inside a pattern
rule would put a second opinion about what the slot MEANS inside the module that judges him for
it."* Phase 10 then wrote one anyway, as `parseRunningDays(value): Weekday[]` over
`Weekday = 0 | … | 6` (`getUTCDay()` order, Sunday = 0), because it needed one and this plan did not
exist yet. **The two consumers want two different weekday conventions**, which is precisely why one
module has to own both.

The ruling: `lib/nina/memory.ts` owns the token table and the parse. It returns
`readonly IsoWeekday[]` — **1 = Monday … 7 = Sunday**, which is what Phase 9's
`PatternInput.usualRunningDays` declares — and it also exports
`parseRunningDaysAsJsWeekday`, a two-line wrapper over the same parse for Phase 10's
`Weekday`. One token table, one range expander, one negation rule, two typed views.

**Phase 10 deletes its `DAY_TOKENS` constant and its `parseRunningDays` body** and re-exports the
wrapper, keeping its own `Weekday` type and its `jakartaWeekdayOf`. That is a deletion of 22 lines
and the change of one import; it was written out in the Handoffs so the reconciler could apply it
without reading this file, and **RULING E4 did exactly that — the edit is applied in phase 10's
plan**, so the Handoffs entry is now a record rather than a request.

### (b) The slot is display text **and** the parser is exported — because the writer canonicalises

RU-6 and Phase 2 both say a slot value is display-ready. Phase 9 pointed out that this makes it
unparseable in general. Both are satisfiable at once, and the mechanism is the *writer*, not the
reader: every `running_days` write goes through
`formatRunningDays(parseRunningDays(raw))`, so **the stored string is always the canonical
rendering of a parsed weekday set**, and `parseRunningDays(stored)` is therefore guaranteed to
return that same set. A write whose raw text does not parse is **refused as a slot and appended to
the ledger instead** — the fact survives, the slot does not become a guess. The round trip is a
unit test, not a hope.

Same shape for `work_hours` (`formatWorkHours(parseWorkHours(raw))`). The five prose slots
(`goals`, `injuries`, `food_likes`, `gear`, `name`) have no machine consumer and canonicalise only
by trimming and length-capping.

### (c) The admin-row preservation rule — how R24 and R4's "PERMANENTLY" stop destroying each other

Phase 16's `/admin/memory` inserts and edits rows by hand and Phase 1 gave both memory tables a
`source` discriminator for it. Three rules, in decreasing order of how much they matter:

1. **The ledger cannot be touched, by construction and not by policy.** This phase imports
   `appendNinaMemoryFacts` and never imports `updateNinaMemoryFact` or `deleteNinaMemoryFact`. An
   admin-written ledger row is therefore unreachable from every code path in this phase. There is
   no flag to get wrong. `tests/nina.distill.test.ts` asserts the import list.
2. **A `replace`-policy slot whose existing row has `source: 'admin'` is not overwritten.** Before
   applying slot writes, `applyMemoryPlan` reads `gateway.readSlotSources(userId)`. A planned
   upsert whose current row is admin-owned is **deferred**: it is dropped from the slot writes and
   its statement is appended to the ledger instead, at the confidence it earned. So the distiller's
   reading is recorded permanently, the human's assertion still stands, and `/admin/memory` can
   show both. Nothing is discarded in either direction.
3. **A `merge`-policy slot needs no exception, because a merge cannot discard.**
   `pending_promises` is the only merge slot. `mergePendingPromises` reads the current parsed value,
   matches candidates against existing entries **by `id`**, appends what is new and leaves every
   entry it did not match untouched — including one the admin typed. Its `source` is
   **sticky**: if the existing row was `'admin'`, the merged row is written back as `'admin'`,
   because a merge preserved what the admin wrote and relabelling it `'distilled'` would lie about
   who owns it.

Rule 2 is the one that would have been easy to get wrong, and the failure mode is silent: the
runner corrects a bad memory through the backdoor, and the next thing he says in chat quietly
re-breaks it. Deferral plus a ledger append is what makes that impossible without ever refusing to
record something he said.

### (d) A slot is written only when he actually said it — the quote gate

The distiller returns, per candidate, a `quote`: the span of **his own message in this turn** the
claim came from. `verifyQuote` checks it is really a substring of the turn's runner text, compared
after lowercasing and whitespace collapse.

- **Slots require a verified quote and `confidence >= SLOT_CONFIDENCE_FLOOR` (80).** An inferred
  standing fact is a fabricated memory she will then confidently act on in every future turn, which
  is worse than not remembering.
- **Facts are appended either way, but an unverified quote caps confidence at
  `UNVERIFIED_CONFIDENCE_CEILING` (40).** The ledger is a record of what the distiller read, and
  `source_message_id` is on every row, so a bad reading is correctable by re-reading the
  conversation. Refusing to append it is how a fact gets silently lost, which R4 forbids.

Confidence lives on the ledger row and nowhere else, exactly as the brief requires.

### (e) The distillation is its own budgeted model call, fired from `after()` in the Server Action

It cannot ride the turn's own call: `send.memoryWrites` is emitted while she is composing a reply
and is therefore whatever she happened to notice, not a pass over the finished exchange. A second
call reads both sides of the turn and is told to be exhaustive.

It must not be awaited before the action returns — the turn is already 13–45 s and this would add
10–20 s of silence after the bubbles are on screen. So it goes in `after()`. **`after()` throws
`E468` outside a request scope**, which is exactly the constraint Phase 10 hit when it moved its
hook out of `lib/review/commit.ts` and into `lib/review/actions.ts`; the same lesson applies here
and is already satisfied, because the hook sits in `lib/nina/actions.ts`, a `'use server'` module
that always has a request scope. `runTurnDistillation` is a plain async function called *inside*
the callback and never calls `after()` itself, so it stays callable from a test and from Phase 10's
cron. `after` also runs for the route's configured max duration and executes even when the response
already went out, which is the behaviour this needs.

Contract: **primary call → Zod → one repair → degrade**, byte-for-byte `lib/llm/narrate.ts`'s
contract. Degrading means applying Phase 3's already-validated `memoryWrites` and nothing distilled
— so the worst case of this phase is Phase 3's behaviour, and the phase is strictly additive.
Per the plan index's verified-live section, `thinking: {type:'disabled'}` **was not honoured on
round 1**, so `DISTILL_MAX_TOKENS` has room for a thinking block and the reader **scans
`content[]` for the tool block rather than reading `content[0]`**.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/memory.ts` | create | THE PURE HALF — vocabulary, canonicalisers, `parseRunningDays`, the nickname, the plan |
| `lib/nina/distill.ts` | create | THE IMPURE HALF — the `glm-5.3` call, `applyMemoryPlan`, `runTurnDistillation` |
| `lib/nina/prompts/distill.ts` | create | the distillation system text and `DISTILL_TOOL` |
| `lib/nina/tools.ts` | modify | `NinaToolGateway`: the two write signatures widened by optional fields (`:762–777`) |
| `lib/nina/gateway.ts` | modify | `dbNinaToolGateway` gains `readSlotSources` + `readPendingPromises`; the two writers pass the new fields (`:1714–1740`) |
| `lib/nina/actions.ts` | modify | STEP 6 of `sendNinaMessage`: `applyMemoryWrites` deleted, `after()` hook added |
| `tests/nina.memory.test.ts` | create | the pure suite — parsers, syllabifier, planning, admin deferral |
| `tests/nina.distill.test.ts` | create | fake client + fake gateway: the repair, the degrade, the apply order |

`scripts/check-llm-payload-boundary.mjs` is **not** in this table: RULING D1 gives it one owner,
phase 1, which ships the whole `GUARDED_CALLS` table including `distillNinaMemory`.

The index estimated ~6 files; it is 8, and the two extra are the `tools.ts` and `gateway.ts` edits.
Neither is new behaviour — they are the cost of inheriting one write path instead of adding a
second.

**The `lib/nina/memory.ts` / `lib/nina/distill.ts` split** is Phase 2's `context.ts` / `load.ts`
split for the same reason (invariant 6): everything worth testing is pure and lives in the file
with no `server-only` and no database import, and the thin impure shell around it is the only part
that needs a fake.

---

## Implementation Steps

Steps 1–5 are five consecutive sections of the single new file `lib/nina/memory.ts`, written in
this order — nothing in the tree changes behaviour until Step 10, so the first nine steps can land
and typecheck on their own. Steps 6–7 are the two other new modules, Steps 8–10 are three small
edits to existing files, Step 11 is now a **no-op record** (RULING D1 moved the guard-script entry
to phase 1), and Step 12 is the suites.

### Step 1: `lib/nina/memory.ts` §1–§2 — the header, and the weekday parser Phase 9 asked for

**File:** `lib/nina/memory.ts` (new), lines 1 to the end of §2
**Change:** The module header (the argument the rest of the file rests on) and the one function two
other phases were both about to write.

**Code:**

```ts
import { z } from 'zod'

import type {
  NinaFactCategory,
  NinaMemorySource,
  NinaPendingPromise,
  NinaPendingPromisesSlot,
  NinaPromiseMetric,
  NinaSlotValue,
} from '@/lib/db/schema'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R4 — the memory, distilled. THE PURE HALF.
 *
 *  RU-6 is two tables and this file is the reading of them:
 *
 *    nina_memory_slots  — "what is true now". One row per (user, key), OVERWRITTEN in place.
 *                         Pre-injected on every turn (RU-4) and QUERIED by the evening cron
 *                         (phase 10), so a slot that is wrong is wrong in every conversation
 *                         until it is corrected, and a slot the cron cannot parse is a slot the
 *                         cron cannot act on.
 *    nina_memory_facts  — "what has he ever told me". APPEND-ONLY. The colour.
 *
 *  ── THE ONE RULE THAT MAKES "PERMANENTLY" TRUE ──────────────────────────────────────────────
 *  A slot upsert is always PRECEDED by the ledger append of the same statement, and the ledger
 *  append is unconditional. So:
 *
 *    - a contradiction REPLACES the slot and leaves BOTH ledger rows, which is what lets her say
 *      "lo bilang benci lari pagi bulan lalu" three months after the slot moved on;
 *    - a slot write this file refuses (bad vocabulary, unparseable value, an admin-owned row)
 *      still lands as a fact, so a refusal is never a loss;
 *    - every fact carries `source_message_id`, so if the slot logic in this file is later found
 *      wrong, the whole distillation is RE-DERIVABLE from the raw conversation. That is the
 *      difference between a memory and a summary.
 *
 *  ── AND THE ONE RULE THAT KEEPS IT HONEST ───────────────────────────────────────────────────
 *  A slot is written only when he ACTUALLY SAID the thing (§6's quote gate, and
 *  SLOT_CONFIDENCE_FLOOR). An inferred slot is a fabricated memory she will then confidently act
 *  on for months. Confidence lives on the ledger row and nowhere else; a low-confidence fact is
 *  recorded and never promoted.
 *
 *  ── WHY THIS FILE IS PURE ───────────────────────────────────────────────────────────────────
 *  No `server-only`, no database import, no clock, no model. Invariant 6: everything worth
 *  testing is a pure function in lib/. `lib/nina/distill.ts` is the thin impure shell — the same
 *  split, for the same reason, as phase 2's context.ts / load.ts.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ============================================================================
 * §2 Weekdays — the `running_days` slot, and the parser phases 9 and 10 share
 * ==========================================================================*/

/**
 * **ISO 8601 weekday: 1 = Monday … 7 = Sunday.** This is the convention phase 9's
 * `PatternInput.usualRunningDays` declares, and phase 9 was explicit that the conversion belongs
 * here rather than in the module that judges him for missing a day.
 */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** `Date.prototype.getUTCDay()`'s convention: 0 = Sunday … 6 = Saturday. Phase 10's `Weekday`. */
export type JsWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** ISO -> JS. The whole difference between the two conventions, in one expression. */
export function isoToJsWeekday(day: IsoWeekday): JsWeekday {
  return (day === 7 ? 0 : day) as JsWeekday
}

/** The canonical display spelling. Indonesian, because that is the register she writes in. */
export const WEEKDAY_ID: Readonly<Record<IsoWeekday, string>> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
  7: 'Minggu',
}

/** Exported for a caller that wants the English rendering; nothing in this phase uses it. */
export const WEEKDAY_EN_SHORT: Readonly<Record<IsoWeekday, string>> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

/**
 * Every token that names a day, in both languages this app speaks, plus the clipped forms an
 * Indonesian actually types. **Exact-token matching, never prefixes:** `sun`/`senin` and
 * `min`/`mon` are one letter apart, and prefix matching gets them wrong in a way no test notices
 * until a Tuesday nag arrives on a Sunday.
 */
const DAY_TOKENS: Readonly<Record<string, IsoWeekday>> = {
  senin: 1, sen: 1, monday: 1, mon: 1,
  selasa: 2, sel: 2, tuesday: 2, tue: 2, tues: 2,
  rabu: 3, rab: 3, wednesday: 3, wed: 3,
  kamis: 4, kam: 4, thursday: 4, thu: 4, thur: 4, thurs: 4,
  jumat: 5, jumaat: 5, jumah: 5, jum: 5, friday: 5, fri: 5,
  sabtu: 6, sab: 6, saturday: 6, sat: 6,
  minggu: 7, min: 7, ahad: 7, sunday: 7, sun: 7,
}

/**
 * A token that turns two day tokens into an inclusive range. `"Senin sampe Jumat"` names five
 * days and not two, and a parser that returned `[1, 5]` for it would disable Tuesday, Wednesday
 * and Thursday silently — the single most likely phrasing for someone who runs before work.
 *
 * `ke` is deliberately NOT here. It is a range word in `"senin ke jumat"` and a preposition in
 * half of all Indonesian sentences, and a false range is worse than a missed one.
 */
const RANGE_TOKENS: ReadonlySet<string> = new Set([
  'sampai', 'sampe', 'hingga', 'sd', 'to', 'through', 'thru', 'til', 'till', 'until',
])

/**
 * A token that inverts the meaning of every day named after it. `"tiap hari kecuali senin"` names
 * six days, and this parser cannot work out which six — so it returns `[]` and the trigger that
 * depends on the slot switches off. **Refusing to answer is the policy**: a nag built on a guess
 * about which days he runs is a friend confidently misremembering, which is the one failure this
 * whole feature cannot afford.
 */
const NEGATION_TOKENS: ReadonlySet<string> = new Set([
  'kecuali', 'selain', 'bukan', 'tanpa', 'ga', 'gak', 'nggak', 'engga', 'enggak', 'tidak', 'tak',
  'except', 'without', 'minus', 'not', 'no',
])

/** `"tiap hari"`, `"daily"`, `"every day"` — the answer is all seven, and it is a real answer. */
const EVERY_DAY_PATTERN = /\b(?:tiap|setiap)\s+hari\b|\bharian\b|\bevery\s*day\b|\beveryday\b|\bdaily\b/

const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

type DayItem = { readonly kind: 'day'; readonly day: IsoWeekday } | { readonly kind: 'range' }

/**
 * Dashes and slashes are range markers that the letters-only tokeniser below would throw away, so
 * they are rewritten to a word before tokenising. `"Selasa-Kamis"` and `"Senin s/d Jumat"` both
 * become `"… sampai …"`; the stray `s` and `d` fall out as unrecognised tokens, which is exactly
 * what should happen to them.
 */
function normaliseDayText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*(?:[–—]|-{1,2}|\/)\s*/g, ' sampai ')
}

/**
 * The `running_days` slot value, parsed. The slot stores DISPLAY text (RU-6, and phase 2's
 * `MemorySlotInput` says so) — `"Selasa, Kamis, Sabtu, Minggu"`, or whatever week-one text phase
 * 3's verbatim sink or phase 16's admin editor put there. This turns it into weekday numbers.
 *
 * **The round trip is guaranteed in the WRITER, not here.** Every write this phase makes goes
 * through `formatRunningDays(parseRunningDays(raw))` (see `NINA_SLOT_SPECS`), so a stored value is
 * always the canonical rendering of a parsed set and `parseRunningDays` of it returns that set
 * back. `tests/nina.memory.test.ts` asserts the round trip rather than assuming it.
 *
 * Returns sorted and deduplicated, so two identical states produce two identical prompts and one
 * identical trigger decision.
 */
export function parseRunningDays(value: string | null | undefined): readonly IsoWeekday[] {
  if (!value) return []
  const text = normaliseDayText(value)

  /* Negation first: it invalidates everything after it and there is nothing to salvage. */
  for (const raw of text.split(/[^a-z]+/)) {
    if (raw && NEGATION_TOKENS.has(raw)) return []
  }

  if (EVERY_DAY_PATTERN.test(text)) return ISO_WEEKDAYS

  const items: DayItem[] = []
  for (const raw of text.split(/[^a-z]+/)) {
    if (!raw) continue
    /* Exact match, then one attempt with a plural `s` removed — `"tuesdays and thursdays"` is a
     * real phrasing and `"tuesdays"` is not a day name. Nothing else is stripped. */
    const day = DAY_TOKENS[raw] ?? (raw.endsWith('s') ? DAY_TOKENS[raw.slice(0, -1)] : undefined)
    if (day !== undefined) {
      items.push({ kind: 'day', day })
    } else if (RANGE_TOKENS.has(raw)) {
      items.push({ kind: 'range' })
    }
  }

  const found = new Set<IsoWeekday>()
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item === undefined || item.kind !== 'day') continue
    found.add(item.day)

    const marker = items[i + 1]
    const end = items[i + 2]
    if (marker?.kind !== 'range' || end?.kind !== 'day') continue
    /* Inclusive, walking forward in ISO order and WRAPPING, so "Sabtu sampe Senin" is
     * {6, 7, 1} and not an empty set. Bounded at seven steps by construction. */
    let cursor = item.day
    for (let step = 0; step < 7; step += 1) {
      cursor = (cursor === 7 ? 1 : cursor + 1) as IsoWeekday
      found.add(cursor)
      if (cursor === end.day) break
    }
  }

  return [...found].sort((a, b) => a - b)
}

/**
 * Phase 10's view of the same parse. **One token table, one range expander, one negation rule,
 * two typed views** — the whole point of ruling (a). Phase 10 keeps its `Weekday` type and its
 * `jakartaWeekdayOf`, and deletes its own copy of everything above.
 */
export function parseRunningDaysAsJsWeekday(value: string | null | undefined): readonly JsWeekday[] {
  return parseRunningDays(value)
    .map(isoToJsWeekday)
    .sort((a, b) => a - b)
}

/**
 * The canonical rendering, and therefore the only thing this phase ever stores in the slot.
 * `[2, 4, 6, 7]` -> `"Selasa, Kamis, Sabtu, Minggu"`. Display-ready for the prompt, and parseable
 * back by the cron.
 */
export function formatRunningDays(days: readonly IsoWeekday[]): string {
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_ID[day])
    .join(', ')
}
```

**Impact:** Phase 10's `parseRunningDays` and `DAY_TOKENS` become dead code the moment this lands.
Ruling (a) and the Handoffs specify the deletion. Phase 9 needs no edit at all — its
`PatternInput.usualRunningDays` type already matches this return type.

---

### Step 2: `lib/nina/memory.ts` §3–§4 — `work_hours`, and R7's name

**File:** `lib/nina/memory.ts`, appended directly after §2
**Change:** The second machine-readable slot, then the whole of R7 — the syllable clipper that
produces `mif` and `tah` from `Miftahul Mahfuzh`, and the one-conversation confirmation.

**Code:**

```ts
/* ============================================================================
 * §3 Work hours — the second machine-readable slot
 * ==========================================================================*/

/** Minutes from Jakarta midnight, both ends. The smallest sensible unit, per the roadmap. */
export interface WorkHours {
  startMinute: number
  endMinute: number
}

/**
 * Requires a QUALIFIER — a leading `jam`, an explicit `:mm`, or a meridiem word — before it will
 * believe a bare number is a time. Without that rule `"lari 10 km terus ngantor"` parses `10` as
 * ten o'clock, and the slot then claims he starts work at 10:00 forever.
 */
const TIME_PATTERN = /(jam\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|pagi|siang|sore|malam)?/gi

function minutesOf(hour: number, minute: number, meridiem: string | undefined): number | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  let h = hour
  switch (meridiem?.toLowerCase()) {
    case 'pm':
    case 'sore':
    case 'malam':
      if (h < 12) h += 12
      break
    case 'siang':
      /* `siang` is roughly 11:00-15:00, so a small number under it is afternoon. */
      if (h < 11) h += 12
      break
    case 'am':
    case 'pagi':
      if (h === 12) h = 0
      break
    default:
      break
  }
  if (h > 23) return null
  return h * 60 + minute
}

/**
 * `"jam 8 sampe jam 5"`, `"08:00-17:00"`, `"9am to 6pm"` -> `{ startMinute, endMinute }`.
 *
 * **The one heuristic, stated so nobody has to guess it later:** if the second time is not later
 * than the first AND carried no meridiem of its own, twelve hours are added to it exactly once.
 * `"jam 8 sampe jam 5"` is a working day and not a negative-length one, and this is the only way
 * to read it. If it is still not later, the value is REFUSED (`null`) — a shift that crosses
 * midnight is a real thing and this parser is not the place to guess at one.
 */
export function parseWorkHours(value: string | null | undefined): WorkHours | null {
  if (!value) return null
  const found: { minutes: number; hadMeridiem: boolean }[] = []

  for (const match of value.matchAll(TIME_PATTERN)) {
    const [, jam, hourText, minuteText, meridiem] = match
    const qualified = jam !== undefined || minuteText !== undefined || meridiem !== undefined
    if (!qualified) continue
    const minutes = minutesOf(Number(hourText), minuteText === undefined ? 0 : Number(minuteText), meridiem)
    if (minutes === null) continue
    found.push({ minutes, hadMeridiem: meridiem !== undefined })
    if (found.length === 2) break
  }

  const start = found[0]
  const end = found[1]
  if (start === undefined || end === undefined) return null

  let endMinute = end.minutes
  if (endMinute <= start.minutes && !end.hadMeridiem) endMinute += 12 * 60
  if (endMinute <= start.minutes || endMinute > 24 * 60) return null

  return { startMinute: start.minutes, endMinute }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function clockOf(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`
}

/** The canonical rendering, and therefore the only thing stored. `"08:00–17:00"`, en dash. */
export function formatWorkHours(hours: WorkHours): string {
  return `${clockOf(hours.startMinute)}–${clockOf(hours.endMinute)}`
}

/* ============================================================================
 * §4 His name — R7 and RU-8
 * ==========================================================================*/

/**
 * ── HOW AN INDONESIAN NICKNAME IS ACTUALLY MADE ────────────────────────────────────────────────
 * It is a CLIPPED SYLLABLE of the given name, not a prefix of it. The user's own two examples are
 * both from the first subword of `Miftahul Mahfuzh`:
 *
 *     mif-ta-hul   ->   "mif"  (the first syllable)
 *                  ->   "tah"  (the second, closed with the following consonant)
 *
 * A `slice(0, 3)` produces `mif` and never `tah`, which is why this file syllabifies. He used both
 * forms in his own examples ("pagi mif", "lo kemaren kemana tah"), so both must be offerable.
 *
 * ── AND WHY THE FUNCTION PROPOSES INSTEAD OF PICKING ──────────────────────────────────────────
 * Phase 2's `NAME_RULES` already tells her: *"Do not invent a nickname from runner.fullName
 * yourself."* That rule is right — being called the wrong clipped syllable by a stranger is worse
 * than being asked. So this returns a CANDIDATE LIST, she offers the first two, and the answer he
 * gives is what becomes the slot. Nothing here ever writes `nickname` on its own.
 */
const VOWELS: ReadonlySet<string> = new Set(['a', 'e', 'i', 'o', 'u'])

/** Two letters that are one Indonesian consonant. They must not be split across a syllable. */
const CONSONANT_DIGRAPHS: readonly string[] = ['ng', 'ny', 'sy', 'kh']

/** Name particles that are never the source of a nickname. */
const NAME_PARTICLES: ReadonlySet<string> = new Set(['bin', 'binti', 'bt', 'al', 'el', 'van', 'de', 'da', 'dos'])

interface SyllableParts {
  onset: string
  nucleus: string
  coda: string
}

function consonantUnits(chunk: string): string[] {
  const units: string[] = []
  let index = 0
  while (index < chunk.length) {
    const pair = chunk.slice(index, index + 2)
    if (CONSONANT_DIGRAPHS.includes(pair)) {
      units.push(pair)
      index += 2
      continue
    }
    units.push(chunk.charAt(index))
    index += 1
  }
  return units
}

/**
 * Indonesian syllabification, deliberately the simple textbook rule and nothing cleverer:
 * a syllable is `(onset)(vowel run)(coda)`, ONE consonant between two vowels belongs to the
 * following syllable, and a CLUSTER of two or more splits with the first consonant staying behind.
 * Digraphs count as one consonant, so `"ngga"` does not become `"n-gga"`.
 *
 *     "miftahul" -> mif · ta · hul
 *     "mahfuzh"  -> mah · fuzh
 *     "santoso"  -> san · to · so
 */
function syllableParts(word: string): SyllableParts[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (letters.length === 0) return []

  /* The vowel runs, as [start, endExclusive] spans. Each one is exactly one nucleus. */
  const nuclei: { start: number; end: number }[] = []
  for (let i = 0; i < letters.length; i += 1) {
    if (!VOWELS.has(letters.charAt(i))) continue
    const last = nuclei[nuclei.length - 1]
    if (last !== undefined && last.end === i) last.end = i + 1
    else nuclei.push({ start: i, end: i + 1 })
  }
  if (nuclei.length === 0) return []

  const parts: SyllableParts[] = nuclei.map((nucleus) => ({
    onset: '',
    nucleus: letters.slice(nucleus.start, nucleus.end),
    coda: '',
  }))

  for (let k = 0; k < nuclei.length; k += 1) {
    const nucleus = nuclei[k]!
    const previousEnd = k === 0 ? 0 : nuclei[k - 1]!.end
    const chunk = letters.slice(previousEnd, nucleus.start)

    if (k === 0) {
      parts[0]!.onset = chunk
      continue
    }
    const units = consonantUnits(chunk)
    if (units.length <= 1) {
      parts[k]!.onset = units.join('')
    } else {
      parts[k - 1]!.coda = units[0]!
      parts[k]!.onset = units.slice(1).join('')
    }
  }

  parts[parts.length - 1]!.coda = letters.slice(nuclei[nuclei.length - 1]!.end)
  return parts
}

/** The syllables as strings. Exported for the test, which is the only honest way to check §4. */
export function syllabify(word: string): readonly string[] {
  return syllableParts(word).map((part) => part.onset + part.nucleus + part.coda)
}

/**
 * One syllable as a nickname would say it: **an open syllable borrows the next syllable's first
 * consonant, a closed one is already finished.** `ta` + `hul` -> `tah`; `mif` is already `mif`.
 * This one rule is the entire difference between producing `mif`/`tah` and producing `mif`/`ta`.
 */
function clippedForms(word: string): string[] {
  const parts = syllableParts(word)
  return parts.map((part, index) => {
    const base = part.onset + part.nucleus + part.coda
    if (part.coda.length > 0) return base
    const nextOnset = parts[index + 1]?.onset ?? ''
    return base + nextOnset.charAt(0)
  })
}

export const NICKNAME_CANDIDATE_LIMIT = 4

/**
 * The candidates she offers. `"Miftahul Mahfuzh"` -> `['mif', 'tah', 'hul', 'mah']`, which
 * contains both forms the user used about himself.
 *
 * Order: every clipped syllable of the FIRST subword, in order, then the first clipped syllable of
 * the LAST subword. The first two are the ones the ask offers, which is why `mif` and `tah` must
 * come out first and do.
 *
 * Two to four letters, letters only, lowercase, deduplicated. Lowercase because that is her
 * register — `NINA_IDENTITY` writes in lowercase and `"pagi Mif"` would be someone else talking.
 */
export function deriveNicknameCandidates(fullName: string | null | undefined): readonly string[] {
  if (!fullName) return []
  const subwords = fullName
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !NAME_PARTICLES.has(word))
  if (subwords.length === 0) return []

  const first = subwords[0]!
  const last = subwords[subwords.length - 1]!
  const raw = [...clippedForms(first)]
  if (last !== first) {
    const lastForm = clippedForms(last)[0]
    if (lastForm !== undefined) raw.push(lastForm)
  }

  const seen = new Set<string>()
  const candidates: string[] = []
  for (const form of raw) {
    if (form.length < 2 || form.length > 4) continue
    if (seen.has(form)) continue
    seen.add(form)
    candidates.push(form)
    if (candidates.length === NICKNAME_CANDIDATE_LIMIT) break
  }
  return candidates
}

/**
 * What may become the `nickname` slot. Returns `null` for anything that is not a single short word.
 *
 * **The slot value MUST be a bare JSON string**, because phase 1's `getNinaIdentity` returns the
 * nickname only when `typeof raw === 'string' && raw.length > 0` and would silently report "no
 * nickname" for an object. That is enforced here, at the one place a nickname is canonicalised.
 */
export function canonicaliseNickname(raw: string): string | null {
  const word = raw.toLowerCase().trim().split(/\s+/)[0] ?? ''
  const cleaned = word.replace(/[^a-z']/g, '')
  if (cleaned.length < 2 || cleaned.length > 16) return null
  return cleaned
}

/**
 * **How many messages count as "the first conversation".** Past this, she stops asking what to
 * call him and simply does without a name — asking on message forty is not warmth, it is a bot
 * that never listened. Twelve is roughly three turns of his plus her 1-4 bubbles each (RU-5).
 */
export const FIRST_CONVERSATION_MESSAGE_LIMIT = 12

export interface NameSlotInput {
  /** `users.name` as the OAuth provider gave it. */
  fullName: string | null
  /** The confirmed `nickname` slot, or null if she has not been told yet. */
  nickname: string | null
  /**
   * How many messages the conversation holds, both parties. **Not a `COUNT(*)`** — phase 1 exports
   * no `countNinaMessages` (RULING A2) and none is being added. The caller passes
   * `context.conversation.window.length`, which is exact below `CONTEXT_MESSAGE_WINDOW`; Step 10
   * argues why that is the right read, and `getNinaMessageWindow`'s `olderCount` is the general
   * answer if a real count is ever needed.
   */
  messageCount: number
}

/**
 * The `name` slot's value — and **the entire channel R7's confirmation travels down.**
 *
 * ── WHY A SLOT AND NOT A CONTEXT FIELD OR A PROMPT EDIT ───────────────────────────────────────
 * Slots are pre-injected on every turn (RU-4) and phase 2 renders their values verbatim into the
 * payload she reads. So putting the candidates in this slot's value gets them in front of her with
 * **no edit to phase 2's context type and no edit to any prompt** — which is what keeps this
 * phase revertable and keeps two plans off the same file. Phase 2's `NAME_RULES` already handles
 * the behaviour ("ask, once; do not invent one yourself"); this supplies the two words to offer.
 *
 * ── THE ONE ORDERING CONSEQUENCE, STATED RATHER THAN DISCOVERED ────────────────────────────────
 * Distillation runs after a turn, so on turn ONE this slot does not exist yet and she asks
 * open-endedly from `runner.fullName` ("nama lo siapa? gw panggil apa?"), exactly as
 * `NAME_RULES` instructs. From turn two the candidates are there. That is acceptable and
 * deliberate: the alternative is a pre-turn write, which means a database write in the render path
 * of the very first chat load.
 *
 * The hint DISAPPEARS the moment `nickname` is set, or once the first conversation is over —
 * which is what bounds the asking without storing an "already asked" flag anywhere.
 */
export function nameSlotValue(input: NameSlotInput): string | null {
  const fullName = input.fullName?.trim()
  if (!fullName) return null
  if (input.nickname !== null && input.nickname.length > 0) return fullName
  if (input.messageCount > FIRST_CONVERSATION_MESSAGE_LIMIT) return fullName

  const candidates = deriveNicknameCandidates(fullName)
  if (candidates.length === 0) {
    return `${fullName} — belum tau mau dipanggil apa. Tanya sekali, jangan nebak.`
  }
  const offer = candidates.slice(0, 2).join(' atau ')
  return `${fullName} — belum tau mau dipanggil apa. Tawarin: ${offer}. Jangan pakai nama panjangnya.`
}
```

**Impact:** No other phase changes. `nameSlotValue` is written by §7's planner on every
distillation, so the hint is refreshed (and retired) without any special-casing at the call site.

---

### Step 3: `lib/nina/memory.ts` §5 — the slot vocabulary, closed

**File:** `lib/nina/memory.ts`, appended directly after §4
**Change:** The nine keys, and for each one the ledger category it also becomes and the
canonicaliser that decides whether a raw string is allowed to be its value. Phase 3 deliberately
accepted *any* `slotKey` verbatim until this landed; this is the vocabulary it deferred to.

**Code:**

```ts
/* ============================================================================
 * §5 The vocabulary — nine keys, and what each one may contain
 * ==========================================================================*/

/**
 * **The closed slot vocabulary.** Phase 2's prompt tells her she never coins a key, and this is
 * the list she is handed. Order is the order they are described to the distiller and the order
 * `/admin/memory` (phase 16) will naturally show them in.
 *
 * `'pending_promises'` must stay identical to phase 1's `NINA_SLOT_PENDING_PROMISES`, which
 * `tests/nina.memory.test.ts` asserts rather than trusting.
 */
export const NINA_SLOT_KEYS = [
  'name',
  'nickname',
  'running_days',
  'work_hours',
  'goals',
  'injuries',
  'food_likes',
  'gear',
  'pending_promises',
] as const

export type NinaSlotKey = (typeof NINA_SLOT_KEYS)[number]

export function isNinaSlotKey(key: string): key is NinaSlotKey {
  return (NINA_SLOT_KEYS as readonly string[]).includes(key)
}

/**
 * `'replace'` — the upsert overwrites. This is RU-6's "upserted" and it is what makes a
 *              contradiction a replacement; both ledger rows survive it.
 * `'merge'`   — the writer reads the current value and folds new entries into it. Only
 *              `pending_promises`, and the reason is ruling (c) rule 3: a merge cannot discard,
 *              so it needs no admin exception.
 */
export type SlotWritePolicy = 'replace' | 'merge'

export interface SlotSpec {
  readonly key: NinaSlotKey
  readonly policy: SlotWritePolicy
  /** The `nina_memory_facts.category` a statement about this slot also becomes. */
  readonly category: NinaFactCategory
  /**
   * Turn a model-supplied display string into the value that will be STORED, or return `null` to
   * refuse the slot write. A refusal is never a loss — §7 turns it into a ledger append.
   */
  readonly canonicalise: (raw: string) => string | null
  /** One line, verbatim, in the distiller's prompt. This is the whole spec the model gets. */
  readonly prompt: string
}

/** Collapse whitespace, trim, cap. The only transformation a prose slot gets. */
function prose(raw: string, max: number): string | null {
  const value = raw.replace(/\s+/g, ' ').trim().slice(0, max)
  return value.length === 0 ? null : value
}

export const NINA_SLOT_SPECS: Readonly<Record<NinaSlotKey, SlotSpec>> = {
  name: {
    key: 'name',
    policy: 'replace',
    category: 'person',
    canonicalise: (raw) => prose(raw, 120),
    prompt: 'name — his full name as HE says it, plus the "what do I call you" hint. You never write this one; the app maintains it.',
  },
  nickname: {
    key: 'nickname',
    policy: 'replace',
    category: 'person',
    canonicalise: canonicaliseNickname,
    prompt: 'nickname — the ONE short word he told you to call him. Only from him saying it. Never guessed from his full name.',
  },
  running_days: {
    key: 'running_days',
    policy: 'replace',
    category: 'training',
    /*
     * **This composition is ruling (b).** Parse first, then render the canonical form, so the
     * stored string is always something `parseRunningDays` can read back — which is what makes
     * the evening cron's "jadi ga lari selasa ini?" possible from the slot alone. Text that does
     * not parse (a range this parser refuses, a negation, prose with no day in it) yields `null`
     * and becomes a ledger fact instead of a slot the cron would act on wrongly.
     */
    canonicalise: (raw) => {
      const days = parseRunningDays(raw)
      return days.length === 0 ? null : formatRunningDays(days)
    },
    prompt: 'running_days — the days he usually runs. Write them as day names: "Selasa, Kamis, Sabtu, Minggu". Only when he says it about his habit, not about one particular week.',
  },
  work_hours: {
    key: 'work_hours',
    policy: 'replace',
    category: 'life',
    canonicalise: (raw) => {
      const hours = parseWorkHours(raw)
      return hours === null ? null : formatWorkHours(hours)
    },
    prompt: 'work_hours — his working day, as two clock times: "08:00-17:00". Only when he states it.',
  },
  goals: {
    key: 'goals',
    policy: 'replace',
    category: 'goal',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'goals — what he is training FOR right now. One or two sentences, his words.',
  },
  injuries: {
    key: 'injuries',
    policy: 'replace',
    category: 'body',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'injuries — what hurts, or has hurt, and where. One or two sentences. Never a diagnosis.',
  },
  food_likes: {
    key: 'food_likes',
    policy: 'replace',
    category: 'preference',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'food_likes — what he eats, likes, avoids, or cannot eat.',
  },
  gear: {
    key: 'gear',
    policy: 'replace',
    category: 'training',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'gear — his shoes, watch, and anything he runs with.',
  },
  pending_promises: {
    key: 'pending_promises',
    policy: 'merge',
    category: 'other',
    /*
     * A string is never a promise. Promises arrive on the payload's own `promises` array as
     * structured candidates (§6) because phase 13 must be able to CHECK one against precomputed
     * facts — invariant 2 applied to a promise. Refusing the string path here means a stray
     * `slotKey: "pending_promises"` write degrades to a ledger fact instead of destroying the
     * structured slot with a sentence.
     */
    canonicalise: () => null,
    prompt: 'pending_promises — do NOT write this as text. Use the "promises" array instead.',
  },
}
```

**Impact:** Phase 3's ruling (b) predicted this: *"a `slotKey` she invents in week one becomes a
row phase 5 later has to reconcile — accepted deliberately."* From this step on, a key outside the
nine is refused as a slot and recorded as a fact.

**RULING E5 — and here is the thing this plan originally got wrong.** Rows already written under a
key outside the nine are **not** inert. `getNinaMemorySlots(userId)` (phase 1) selects **every** row
for the user, ordered by `key`, with no vocabulary filter, and phase 2's `loadNinaContext` passes
that whole array into the context that becomes the system text — there is no `isNinaSlotKey` check
anywhere on that path. So **an orphaned slot key is in Nina's prompt on every single turn.** Phase
16 verified this with file:line against both plans; it is its §1 and the reconciler adopted it.

The decision that follows: **phase 2 gains no filter, and `/admin/memory`'s Retire button is the
whole answer** (phase 16 §4 is the mechanism — append a fact quoting the key and its final value,
then `deleteNinaMemorySlot`). Retirement is *strictly better* than filtering, because it moves the
sentence into the ledger where R4 wants it instead of silently dropping it on the floor; and a
filter in `lib/nina/context.ts` would change what Nina sees on every turn, which is a prompt change
owned by phase 2. **Revisit if** phase 3's verbatim sink ever writes unknown keys faster than a
human retires them — at that point a filter is the cheap stopgap and it is still phase 2's call.

---

### Step 4: `lib/nina/memory.ts` §6 — what the distiller may return, and the promise shape phase 13 evaluates

**File:** `lib/nina/memory.ts`, appended directly after §5
**Change:** The Zod contract for the distillation payload, the quote gate, and the merge that keeps
`pending_promises` safe for phase 13 and for phase 16 at the same time.

**Code:**

```ts
/* ============================================================================
 * §6 The distiller's payload — and the quote gate
 * ==========================================================================*/

/**
 * Mirrors phase 1's `NinaFactCategory` exactly. The `satisfies` gives one half of that guarantee
 * and `_ExhaustiveCategories` gives the other, so adding an eighth category to the schema without
 * adding it here is a type error rather than a silently unreachable branch.
 */
export const NINA_FACT_CATEGORIES = [
  'person',
  'preference',
  'body',
  'life',
  'goal',
  'training',
  'other',
] as const satisfies readonly NinaFactCategory[]

type _ExhaustiveCategories =
  Exclude<NinaFactCategory, (typeof NINA_FACT_CATEGORIES)[number]> extends never ? true : never

/** `nina_memory_facts.text` is one fact, one sentence. Matches phase 3's `NinaMemoryWrite.text`. */
export const FACT_TEXT_MAX = 400

/** Twelve is generous for one exchange and still a bound. Enforced by the schema, not by a slice. */
export const MAX_DISTILLED_CANDIDATES = 12

/** Below this a statement is recorded but never promoted to a slot. Ruling (d). */
export const SLOT_CONFIDENCE_FLOOR = 80

/** The ceiling a claim whose quote does not check out is capped to. Ruling (d). */
export const UNVERIFIED_CONFIDENCE_CEILING = 40

export const DistilledCandidateSchema = z.object({
  /** The fact, one sentence, in the language he said it in. */
  text: z.string().trim().min(1).max(FACT_TEXT_MAX),
  category: z.enum(NINA_FACT_CATEGORIES),
  /** Integer percent. 100 is "he said it outright". */
  confidence: z.number().int().min(0).max(100),
  /**
   * **The span of HIS OWN message this came from.** Not a paraphrase — a substring. This is the
   * whole quote gate: `verifyQuote` checks it really is one, and a claim that fails cannot become
   * a slot no matter what confidence it declared.
   */
  quote: z.string().trim().min(1).max(FACT_TEXT_MAX),
  /** One of `NINA_SLOT_KEYS`, when this is standing truth and not just colour. */
  slotKey: z.string().trim().min(1).max(60).optional(),
})

export type DistilledCandidate = z.infer<typeof DistilledCandidateSchema>

/**
 * One promise, as the distiller reports it. `metric` plus `target`/`targetKey` is what makes it
 * CHECKABLE by phase 13 against numbers the app already computed, rather than re-asked of a model
 * — invariant 2, applied to a promise. `'free'` is the escape hatch for one no field can decide;
 * phase 13 leaves those pending and she may ask him about it.
 */
export const PromiseCandidateSchema = z.object({
  /** Her promise in her own words, display-ready. */
  text: z.string().trim().min(1).max(300),
  /** The condition in HIS terms, display-ready — "kalau lo lari 10k besok". */
  condition: z.string().trim().min(1).max(300),
  metric: z.enum(['distance_km_total', 'run_count', 'record', 'badge', 'free']),
  target: z.number().finite().positive().nullable().optional(),
  targetKey: z.string().trim().min(1).max(60).nullable().optional(),
  /** Jakarta `'YYYY-MM-DD'`, or null for open-ended. */
  byDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  quote: z.string().trim().min(1).max(FACT_TEXT_MAX),
})

export type PromiseCandidate = z.infer<typeof PromiseCandidateSchema>

export const DistillPayloadSchema = z.object({
  facts: z.array(DistilledCandidateSchema).max(MAX_DISTILLED_CANDIDATES).optional(),
  promises: z.array(PromiseCandidateSchema).max(4).optional(),
  /**
   * Present only when he said, in this turn, what to call him. A dedicated field rather than a
   * `slotKey` because it is the one slot with a bespoke canonicaliser and a confirmation flow, and
   * because the tool schema can then describe it in one unambiguous sentence.
   */
  nickname: z.string().trim().min(1).max(40).optional(),
})

export type DistillPayload = z.infer<typeof DistillPayloadSchema>

/**
 * The issue list that goes into the repair turn. The same twelve lines as
 * `describeInsightIssues` in `lib/llm/schema.ts` and `describeNinaIssues` in phase 3's
 * `lib/nina/schema.ts`, and not imported from either: both live in modules with their own
 * concerns, and three copies of twelve obvious lines is cheaper than a shared module that has to
 * know about all three payload shapes.
 */
export function describeDistillIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length === 0 ? '(root)' : issue.path.join('.')
      return `- ${path}: ${issue.message}`
    })
    .join('\n')
}

/** Lowercase, collapse whitespace. Both sides of the quote check get exactly this. */
function normaliseForQuote(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Did he actually say this? Ruling (d).
 *
 * A quote shorter than three characters after normalisation is refused outright: `"gw"` is a
 * substring of almost every message he will ever send and would verify anything.
 */
export function verifyQuote(quote: string, haystack: string): boolean {
  const needle = normaliseForQuote(quote)
  if (needle.length < 3) return false
  return normaliseForQuote(haystack).includes(needle)
}

/* ── pending_promises: the shape phase 13 evaluates ──────────────────────────────────────────── */

/**
 * Twelve open promises is already more than a person tracks. The cap drops RESOLVED entries first
 * (see `mergePendingPromises`) so a full slot never silences a live promise.
 */
export const MAX_PENDING_PROMISES = 12

export interface PromiseMergeContext {
  /** Jakarta `'YYYY-MM-DD'`. Passed in, never read from a clock — this file is pure. */
  todayISO: string
  /** `nina_messages.id` she said it in, or null. */
  sourceMessageId: string | null
  /** `lib/id.ts`'s `newId`, injected so a test gets deterministic ids. */
  newId: () => string
}

export interface PromiseMergeResult {
  slot: NinaPendingPromisesSlot
  /** Candidates whose metric and target did not agree. §7 turns each into a ledger fact. */
  rejected: readonly PromiseCandidate[]
}

/**
 * **`metric` decides which of `target` and `targetKey` is required, and the other must be null.**
 * A promise carrying both, or neither, cannot be evaluated — phase 13 would have to guess, and a
 * guessed promise is a broken one either way. Rejected candidates are not dropped: §7 appends them
 * to the ledger, so "he promised something" survives even when the shape did not.
 */
function normalisePromise(
  candidate: PromiseCandidate,
  ctx: PromiseMergeContext,
): NinaPendingPromise | null {
  const metric: NinaPromiseMetric = candidate.metric
  const target = candidate.target ?? null
  const targetKey = candidate.targetKey ?? null

  const needsTarget = metric === 'distance_km_total' || metric === 'run_count'
  const needsKey = metric === 'record' || metric === 'badge'

  if (needsTarget && (target === null || targetKey !== null)) return null
  if (needsKey && (targetKey === null || target !== null)) return null
  if (metric === 'free' && (target !== null || targetKey !== null)) return null

  return {
    id: ctx.newId(),
    text: candidate.text,
    condition: candidate.condition,
    metric,
    target: needsTarget ? target : null,
    targetKey: needsKey ? targetKey : null,
    byDate: candidate.byDate ?? null,
    promisedOn: ctx.todayISO,
    sourceMessageId: ctx.sourceMessageId,
    status: 'pending',
    resolvedOn: null,
  }
}

/**
 * **A merge, never a replacement — ruling (c) rule 3.** Every existing entry survives untouched,
 * including one the admin typed and one phase 13 has already resolved. New candidates are
 * appended. That is why `pending_promises` needs no admin exception: there is no path through this
 * function that discards someone else's entry.
 *
 * A candidate is treated as already known when a PENDING entry has the same metric and the same
 * condition text after normalisation — she restates a promise across bubbles constantly, and
 * three copies of one promise would make phase 13 change her avatar three times.
 *
 * The cap drops resolved and expired entries oldest-first, and only then pending ones. A slot at
 * its cap must never be the reason a live promise is forgotten.
 */
export function mergePendingPromises(
  current: NinaPendingPromisesSlot | null,
  candidates: readonly PromiseCandidate[],
  ctx: PromiseMergeContext,
): PromiseMergeResult {
  const promises: NinaPendingPromise[] = [...(current?.promises ?? [])]
  const rejected: PromiseCandidate[] = []

  const openKeys = new Set(
    promises
      .filter((entry) => entry.status === 'pending')
      .map((entry) => `${entry.metric}::${normaliseForQuote(entry.condition)}`),
  )

  for (const candidate of candidates) {
    const key = `${candidate.metric}::${normaliseForQuote(candidate.condition)}`
    if (openKeys.has(key)) continue
    const entry = normalisePromise(candidate, ctx)
    if (entry === null) {
      rejected.push(candidate)
      continue
    }
    openKeys.add(key)
    promises.push(entry)
  }

  if (promises.length > MAX_PENDING_PROMISES) {
    const closed = promises.filter((entry) => entry.status !== 'pending')
    const open = promises.filter((entry) => entry.status === 'pending')
    const overflow = promises.length - MAX_PENDING_PROMISES
    /* `promisedOn` ascending: the oldest closed promise is the least interesting row here. */
    closed.sort((a, b) => a.promisedOn.localeCompare(b.promisedOn))
    const keptClosed = closed.slice(Math.min(overflow, closed.length))
    const kept = [...keptClosed, ...open]
    return {
      slot: { promises: kept.slice(Math.max(0, kept.length - MAX_PENDING_PROMISES)) },
      rejected,
    }
  }

  return { slot: { promises }, rejected }
}
```

**Impact:** This is the shape phase 13 reads through phase 1's `getNinaMemorySlot(userId,
NINA_SLOT_PENDING_PROMISES)` and casts to `NinaPendingPromisesSlot`. Phase 13 needs nothing from
this module at runtime beyond that type, which phase 1 already declares — so phase 13 gains no
import and no dependency on this phase's code.

---

### Step 5: `lib/nina/memory.ts` §7 — the planner. Every rule in this phase, in one pure function

**File:** `lib/nina/memory.ts`, appended directly after §6 (end of file)
**Change:** `planMemoryWrites` — the function the whole test suite points at. Add
`import type { NinaMemoryWrite } from './schema'` to the file's imports.

**Code:**

```ts
/* ============================================================================
 * §7 The plan — the one function that decides what gets written
 * ==========================================================================*/

/** One append-only ledger row, ready for `appendNinaMemoryFacts`. */
export interface PlannedFact {
  category: NinaFactCategory
  text: string
  /** Integer percent 0-100. Already capped by the quote gate where that applied. */
  confidence: number
  sourceMessageId: string | null
}

/** One slot upsert, ready for `upsertNinaMemorySlot`. */
export interface PlannedSlot {
  key: NinaSlotKey
  value: NinaSlotValue
  /**
   * `'distilled'`, except for a `merge` slot whose existing row was `'admin'` — see ruling (c)
   * rule 3. A merge preserved what the admin wrote, so relabelling the row would lie about who
   * owns it.
   */
  source: NinaMemorySource
  sourceMessageId: string | null
}

/** A slot write that was NOT applied because a human owns the row. Ruling (c) rule 2. */
export interface DeferredSlot {
  key: NinaSlotKey
  reason: 'admin-owned'
}

/** A slot write that became a ledger fact instead. Nothing is ever dropped; this says why. */
export interface DemotedWrite {
  key: string
  reason:
    | 'unknown-key'
    | 'unparseable-value'
    | 'low-confidence'
    | 'unverified-quote'
    | 'bad-promise-shape'
}

export interface MemoryPlan {
  /** Applied FIRST and unconditionally. This is what makes "PERMANENTLY" true. */
  facts: readonly PlannedFact[]
  /** Applied SECOND. A failure here costs the current view, never the history. */
  slots: readonly PlannedSlot[]
  deferred: readonly DeferredSlot[]
  demoted: readonly DemotedWrite[]
}

export interface MemoryPlanInput {
  /** The runner's message for this turn, verbatim. The haystack for every quote check. */
  runnerText: string
  /** `nina_messages.id` of that message. Null on a proactive turn — she started it. */
  sourceMessageId: string | null
  /** Phase 3's `send.memoryWrites`, already validated by `NinaMemoryWriteSchema`. */
  memoryWrites: readonly NinaMemoryWrite[]
  /** The distillation payload, or `null` when the model call degraded (ruling (e)). */
  distilled: DistillPayload | null
  /** `source` per existing slot key, from `readSlotSources`. Ruling (c) rule 2. */
  existingSlotSources: ReadonlyMap<string, NinaMemorySource>
  /** The current parsed `pending_promises` value, or null when the slot does not exist. */
  currentPromises: NinaPendingPromisesSlot | null
  identity: NameSlotInput
  promiseCtx: PromiseMergeContext
}

/** A bound on one turn's ledger writes. Twelve distilled + six of hers + promises, with slack. */
export const MAX_PLANNED_FACTS = 24

/**
 * ── THE ORDER OF PRECEDENCE, STATED ONCE ──────────────────────────────────────────────────────
 * 1. `send.memoryWrites` and `save_memory` (phase 3) are her EXPLICIT structured assertions. They
 *    skip the quote gate, exactly as phase 3 already wrote them straight to the slot, but they now
 *    go through the vocabulary and the canonicaliser — so this phase is strictly stricter than
 *    phase 3 and never looser.
 * 2. A distilled candidate for the same key WINS over one of hers, because the distiller read the
 *    whole finished exchange and she was mid-sentence.
 * 3. `name` is written by nobody but this function. It is bookkeeping over `users.name` and the
 *    nickname hint, not something he said, so **it never produces a ledger row** — a fact ledger
 *    that fills up with "his name is still Miftahul Mahfuzh" every turn is a ledger nobody reads.
 */
export function planMemoryWrites(input: MemoryPlanInput): MemoryPlan {
  const facts: PlannedFact[] = []
  const factKeys = new Set<string>()
  const slots = new Map<NinaSlotKey, PlannedSlot>()
  const deferred: DeferredSlot[] = []
  const demoted: DemotedWrite[] = []

  const addFact = (category: NinaFactCategory, text: string, confidence: number): void => {
    if (facts.length >= MAX_PLANNED_FACTS) return
    const value = text.replace(/\s+/g, ' ').trim().slice(0, FACT_TEXT_MAX)
    if (value.length === 0) return
    /* One turn saying the same thing twice is one fact. Two turns a month apart are two — which is
     * why the dedupe is per-plan and phase 1's INSERT deliberately has none. */
    const dedupeKey = normaliseForQuote(value)
    if (factKeys.has(dedupeKey)) return
    factKeys.add(dedupeKey)
    facts.push({
      category,
      text: value,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      sourceMessageId: input.sourceMessageId,
    })
  }

  const proposeSlot = (key: NinaSlotKey, raw: string, verified: boolean, confidence: number): void => {
    const spec = NINA_SLOT_SPECS[key]
    if (spec.policy !== 'replace') {
      demoted.push({ key, reason: 'unparseable-value' })
      return
    }
    if (!verified) {
      demoted.push({ key, reason: 'unverified-quote' })
      return
    }
    if (confidence < SLOT_CONFIDENCE_FLOOR) {
      demoted.push({ key, reason: 'low-confidence' })
      return
    }
    const value = spec.canonicalise(raw)
    if (value === null) {
      demoted.push({ key, reason: 'unparseable-value' })
      return
    }
    slots.set(key, { key, value, source: 'distilled', sourceMessageId: input.sourceMessageId })
  }

  /* ── 1. hers, from the reply she just composed ─────────────────────────────────────────────── */
  for (const write of input.memoryWrites) {
    const key = write.kind === 'slot' ? write.slotKey : undefined
    if (key !== undefined && isNinaSlotKey(key)) {
      addFact(NINA_SLOT_SPECS[key].category, write.text, 100)
      /* `verified: true` — she asserted it through a tool schema, which is the trust level phase 3
       * already granted her; the quote gate exists for the DISTILLER's readings. */
      proposeSlot(key, write.text, true, 100)
      continue
    }
    if (key !== undefined) demoted.push({ key, reason: 'unknown-key' })
    addFact('other', write.text, 100)
  }

  /* ── 2. the distillation ───────────────────────────────────────────────────────────────────── */
  for (const candidate of input.distilled?.facts ?? []) {
    const verified = verifyQuote(candidate.quote, input.runnerText)
    const confidence = verified
      ? candidate.confidence
      : Math.min(candidate.confidence, UNVERIFIED_CONFIDENCE_CEILING)

    const key = candidate.slotKey
    const known = key !== undefined && isNinaSlotKey(key)
    addFact(known ? NINA_SLOT_SPECS[key as NinaSlotKey].category : candidate.category, candidate.text, confidence)

    if (key === undefined) continue
    if (!known) {
      demoted.push({ key, reason: 'unknown-key' })
      continue
    }
    proposeSlot(key as NinaSlotKey, candidate.text, verified, confidence)
  }

  /* ── 3. the nickname (R7) ──────────────────────────────────────────────────────────────────── */
  const rawNickname = input.distilled?.nickname
  if (rawNickname !== undefined) {
    const nickname = canonicaliseNickname(rawNickname)
    /* It has to be IN his message. She may not report a nickname he did not type, because from
     * then on she uses it in every single bubble. */
    if (nickname !== null && verifyQuote(nickname, input.runnerText)) {
      addFact('person', `Dia mau dipanggil "${nickname}".`, 100)
      slots.set('nickname', {
        key: 'nickname',
        value: nickname,
        source: 'distilled',
        sourceMessageId: input.sourceMessageId,
      })
    } else {
      demoted.push({ key: 'nickname', reason: nickname === null ? 'unparseable-value' : 'unverified-quote' })
    }
  }

  /* ── 4. the promises (R19, for phase 13) ───────────────────────────────────────────────────── */
  const promiseCandidates = (input.distilled?.promises ?? []).filter((candidate) =>
    verifyQuote(candidate.quote, input.runnerText),
  )
  for (const candidate of input.distilled?.promises ?? []) {
    if (!verifyQuote(candidate.quote, input.runnerText)) {
      demoted.push({ key: 'pending_promises', reason: 'unverified-quote' })
      addFact('other', candidate.text, UNVERIFIED_CONFIDENCE_CEILING)
    }
  }
  if (promiseCandidates.length > 0) {
    const merged = mergePendingPromises(input.currentPromises, promiseCandidates, input.promiseCtx)
    for (const candidate of merged.rejected) {
      demoted.push({ key: 'pending_promises', reason: 'bad-promise-shape' })
      addFact('other', `${candidate.text} (${candidate.condition})`, 100)
    }
    if (merged.slot.promises.length > (input.currentPromises?.promises.length ?? 0)) {
      slots.set('pending_promises', {
        key: 'pending_promises',
        value: merged.slot,
        source: 'distilled',
        sourceMessageId: input.sourceMessageId,
      })
      for (const candidate of promiseCandidates) {
        addFact('other', `Nina janji: ${candidate.text} — kalau ${candidate.condition}.`, 100)
      }
    }
  }

  /* ── 5. the name slot — bookkeeping, and never a ledger row ────────────────────────────────── */
  const nicknameNow =
    (slots.get('nickname')?.value as string | undefined) ?? input.identity.nickname ?? null
  const nameValue = nameSlotValue({ ...input.identity, nickname: nicknameNow })
  if (nameValue !== null) {
    slots.set('name', {
      key: 'name',
      value: nameValue,
      source: 'distilled',
      sourceMessageId: null,
    })
  }

  /* ── 6. the admin-row preservation rule — ruling (c) ───────────────────────────────────────── */
  const applied: PlannedSlot[] = []
  for (const slot of slots.values()) {
    const existing = input.existingSlotSources.get(slot.key)
    if (existing !== 'admin') {
      applied.push(slot)
      continue
    }
    if (NINA_SLOT_SPECS[slot.key].policy === 'merge') {
      /* Sticky source: a merge kept every admin entry, so the row is still the admin's. */
      applied.push({ ...slot, source: 'admin' })
      continue
    }
    /*
     * A human asserted this. The distiller's reading is already in `facts` above (or, for `name`,
     * is bookkeeping worth nothing), so deferring loses nothing and preserving loses nothing
     * either. This is the single line that stops R4 and R24 destroying each other.
     */
    deferred.push({ key: slot.key, reason: 'admin-owned' })
  }

  return { facts, slots: applied, deferred, demoted }
}
```

**Impact:** `lib/nina/memory.ts` is complete and imports nothing but `zod`, three type-only imports
from `@/lib/db/schema` and one from `./schema`. It is fully unit-testable with no fake of any kind.

---

### Step 6: `lib/nina/prompts/distill.ts` — the pass that is not Nina talking

**File:** `lib/nina/prompts/distill.ts` (new)
**Change:** The whole file. A fifth file in Phase 2's `prompts/` directory, deliberately **not**
re-exported from its `prompts/index.ts` barrel, so Phase 2's contract is untouched.

**Code:**

```ts
import type Anthropic from '@anthropic-ai/sdk'

import {
  MAX_DISTILLED_CANDIDATES,
  NINA_FACT_CATEGORIES,
  NINA_SLOT_KEYS,
  NINA_SLOT_SPECS,
  SLOT_CONFIDENCE_FLOOR,
} from '../memory'

/** Bumped by hand whenever the text or the tool schema below changes. Logged, never sent. */
export const NINA_DISTILL_PROMPT_VERSION = 1

/**
 * The vocabulary, rendered from `NINA_SLOT_SPECS` rather than retyped. One list, so a tenth slot
 * key is a one-line edit to `memory.ts` and the prompt follows it.
 */
export const SLOT_VOCABULARY_BLOCK = NINA_SLOT_KEYS.map(
  (key) => `- ${NINA_SLOT_SPECS[key].prompt}`,
).join('\n')

/**
 * **This is not Nina.** She is a person with a voice; this pass is a librarian, and telling it it
 * is Nina makes it write in her register and editorialise the facts it is supposed to be
 * recording. The distinction is worth the extra system prompt.
 */
export const DISTILL_SYSTEM_PROMPT = `You read one finished exchange between a runner and his friend Nina, and you record what the RUNNER revealed about himself. You are a librarian, not a participant. You never speak to him and you never write in Nina's voice.

Return everything through the "record" tool. Nothing else.

WHAT TO RECORD
Every single thing he said about himself, however small: his name, his job, his hours, his family, his body, what hurts, what he eats, what he is training for, what he owns, what he fears, what he finds funny, what he complains about. One fact per entry, one sentence each, in the language HE used. Be exhaustive — up to ${String(MAX_DISTILLED_CANDIDATES)} entries. A detail you drop is gone from her memory of him.

THE QUOTE IS NOT OPTIONAL
Every entry carries "quote": a VERBATIM SPAN OF HIS OWN MESSAGE, copied character for character. Not a paraphrase, not your summary, not something Nina said. An entry whose quote is not really in his message is recorded at low confidence and can never become a standing fact, so a fabricated quote costs you the entry.

CONFIDENCE
An integer percent. 100 means he stated it outright. Drop below ${String(SLOT_CONFIDENCE_FLOOR)} for anything you inferred, implied or read between the lines. Do not round an inference up to look useful — an inferred fact that becomes a standing memory is a lie she will repeat to him for months.

CATEGORIES
${NINA_FACT_CATEGORIES.join(', ')}.

SLOT KEYS — STANDING TRUTH ONLY
Set "slotKey" ONLY when the fact is durable truth that should be in front of her in every future conversation, and only when it is one of these keys. Never invent a key.
${SLOT_VOCABULARY_BLOCK}
A slot is a fact about his LIFE, not about today. "gw lari 10k pagi ini" is a fact with no slot. "gw biasanya lari selasa kamis sabtu" is running_days.

WHAT HE CALLS HIMSELF
Set "nickname" only when he said, in this message, what to call him. Copy his word exactly. If he did not say it, leave it out — do not derive one from his full name.

PROMISES
Use "promises" when NINA promised him something conditional in this exchange — "kalo lo lari 10km besok, gw ganti foto profile". Give the condition as a metric the app can check: distance_km_total with a target in km, run_count with a target, record or badge with its key, or free when no number can decide it. Never both a target and a targetKey.

If he revealed nothing at all, return the tool with empty arrays. That is a correct answer.`

export const DISTILL_REPAIR_PREAMBLE = `That did not fit the schema. Return the "record" tool again, reusing exactly the facts you already had and fixing only these problems:\n`

export const DISTILL_TOOL: Anthropic.Tool = {
  name: 'record',
  description: 'Record what the runner revealed about himself in this exchange.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['facts'],
    properties: {
      facts: {
        type: 'array',
        maxItems: MAX_DISTILLED_CANDIDATES,
        description: 'One entry per thing he revealed. Empty array if he revealed nothing.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'category', 'confidence', 'quote'],
          properties: {
            text: {
              type: 'string',
              description: 'REQUIRED. One fact, one sentence, in the language he used.',
            },
            category: {
              type: 'string',
              enum: [...NINA_FACT_CATEGORIES],
              description: 'REQUIRED. Which kind of fact this is.',
            },
            confidence: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'REQUIRED. 100 = he said it outright. Below 80 = you inferred it.',
            },
            quote: {
              type: 'string',
              description: 'REQUIRED. A verbatim span of HIS message. Copy it, do not rewrite it.',
            },
            slotKey: {
              type: 'string',
              enum: [...NINA_SLOT_KEYS],
              description: 'Only for durable standing truth, and only one of these keys.',
            },
          },
        },
      },
      nickname: {
        type: 'string',
        description: 'The one word he said to call him, copied exactly. Omit if he did not say it.',
      },
      promises: {
        type: 'array',
        maxItems: 4,
        description: 'Conditional promises NINA made in this exchange. Usually absent.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'condition', 'metric', 'quote'],
          properties: {
            text: { type: 'string', description: 'REQUIRED. What she promised, in her words.' },
            condition: { type: 'string', description: 'REQUIRED. The condition, in his terms.' },
            metric: {
              type: 'string',
              enum: ['distance_km_total', 'run_count', 'record', 'badge', 'free'],
              description: 'REQUIRED. How the app can check it.',
            },
            target: { type: 'number', description: 'The number to reach. Only for distance_km_total and run_count.' },
            targetKey: { type: 'string', description: 'A record or badge key. Only for record and badge.' },
            byDate: { type: 'string', description: 'Deadline as YYYY-MM-DD, or omit for open-ended.' },
            quote: { type: 'string', description: 'REQUIRED. A verbatim span of HIS message that set this up.' },
          },
        },
      },
    },
  },
}
```

**Impact:** New file. No other prompt changes and `NINA_PROMPT_VERSION` does not move — this pass
has its own version number because editing it must not invalidate anything keyed on hers.

---

### Step 7: `lib/nina/distill.ts` — the model call, and the two writes in the order that matters

**File:** `lib/nina/distill.ts` (new)
**Change:** The whole file. `primary → Zod → one repair → degrade`, then the apply.

**Code:**

```ts
import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { jakartaDayOf } from '@/lib/date/ranges'
import type {
  NinaFactCategory,
  NinaMemorySource,
  NinaPendingPromisesSlot,
  NinaSlotValue,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { narrativeClient, narrativeModel } from '@/lib/llm/client'

import {
  describeDistillIssues,
  DistillPayloadSchema,
  planMemoryWrites,
  type DistillPayload,
  type MemoryPlan,
  type NameSlotInput,
} from './memory'
import {
  DISTILL_REPAIR_PREAMBLE,
  DISTILL_SYSTEM_PROMPT,
  DISTILL_TOOL,
  NINA_DISTILL_PROMPT_VERSION,
} from './prompts/distill'
import type { NinaMemoryWrite } from './schema'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R4 — the distillation. THE IMPURE HALF.
 *
 *  Contract, byte-for-byte `lib/llm/narrate.ts`'s: **primary call -> Zod -> one repair ->
 *  degrade**, and NOTHING in this file throws for a model problem. Degrading means applying phase
 *  3's already-validated `send.memoryWrites` and nothing distilled, so the worst case of this
 *  whole phase is phase 3's behaviour.
 *
 *  ── WHY THIS IS A SECOND MODEL CALL AND NOT A FIELD ON THE FIRST ────────────────────────────
 *  `send.memoryWrites` is emitted while she is composing a reply, so it is whatever she happened
 *  to notice mid-sentence. R4 says "every single thing", which needs a pass over the FINISHED
 *  exchange with one instruction: be exhaustive. It also needs a prompt that is not her voice —
 *  see prompts/distill.ts.
 *
 *  ── AND WHY IT IS NEVER AWAITED BY THE ACTION ───────────────────────────────────────────────
 *  Invariant 4, plus 10-20 s of silence after the bubbles are already on screen. It runs in
 *  `after()` from `lib/nina/actions.ts`. `after()` throws E468 outside a request scope, which is
 *  why the CALL sits in the Server Action and this file only exports a plain async function —
 *  callable from a test, and from phase 10's cron route, with no request scope of its own.
 *
 *  ── THE ORDER OF THE TWO WRITES IS THE FEATURE ──────────────────────────────────────────────
 *  Facts first, unconditionally, each in its own try. Slots second. "PERMANENTLY" beats "current":
 *  a slot that fails to write costs one turn's view of the truth, and a fact that fails to write
 *  costs the truth.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets ──────────────────────────────────────────────────────────────────────────────────
 *
 * A one-turn extraction against `glm-5.3` is a smaller job than F07's session narrative (measured
 * 10.2-16.4 s), so the primary timeout is that measured ceiling with headroom rather than a guess
 * at a median. It runs in `after()`, so nobody is waiting on it — the deadline exists to stop a
 * hung socket occupying the function's max duration, not to protect a response.
 *
 * `DISTILL_MAX_TOKENS` is 2000 and not 1200 because **the plan index's live probe measured a
 * `thinking` block appearing even with `thinking: {type:'disabled'}` set.** The flag stays (it is
 * harmless and it is what F31 measured for the narrative path) but the ceiling does not rely on
 * it, and `findRecordBlock` SCANS the content array instead of reading `content[0]` — a reader
 * that read the first block would have failed on round 1 of that very probe.
 */
export const DISTILL_PRIMARY_MS = 20_000
export const DISTILL_REPAIR_MS = 12_000
export const DISTILL_OVERALL_MS = 34_000
export const DISTILL_MAX_TOKENS = 2_000

/** Same rule and same number as `narrate.ts`: a repair with two seconds left cannot finish. */
export const MIN_DISTILL_REPAIR_BUDGET_MS = 3_000

/**
 * The gateway this file needs. **`dbNinaToolGateway` (phase 3) satisfies it** — the two writes are
 * phase 3's own, widened, and the two reads are additive members it gains in Step 8. One
 * implementation object, two interface views, so there is still exactly one way to upsert a slot.
 *
 * Phase 3's `NinaToolGateway` deliberately does NOT gain the two reads: its tools do not need
 * them, and adding them there would force an edit to its test fixture for no behavioural reason.
 */
export interface NinaMemoryGateway {
  saveMemorySlot(
    userId: string,
    row: {
      key: string
      value: NinaSlotValue
      source?: NinaMemorySource
      sourceMessageId?: string | null
    },
  ): Promise<void>
  appendMemoryFact(
    userId: string,
    row: {
      text: string
      sourceMessageId: string | null
      category?: NinaFactCategory
      confidence?: number
    },
  ): Promise<void>
  /** `source` per existing slot key. Ruling (c) rule 2 is unimplementable without this. */
  readSlotSources(userId: string): Promise<ReadonlyMap<string, NinaMemorySource>>
  /** The parsed `pending_promises` value, so the merge folds into it instead of replacing it. */
  readPendingPromises(userId: string): Promise<NinaPendingPromisesSlot | null>
}

/**
 * The injection seam, declared here rather than imported from `lib/llm/narrate.ts`. Phase 3 made
 * the same call about `describeInsightIssues` and gave the reason: that module is F07's file and
 * reaches F07's types. Six lines duplicated beats a coupling.
 */
export interface DistillClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export interface DistillInput {
  /** His message this turn, verbatim. Also the quote gate's haystack. */
  runnerText: string
  /** Her bubbles, in emission order. Needed for the promise detection. */
  ninaBubbles: readonly string[]
  /** The slots that already exist, as `key: value` lines, so it does not re-record what is known. */
  slotSummary: readonly { key: string; value: string }[]
}

export type DistillSource = 'llm' | 'llm_repair' | 'unavailable'

export interface DistillResult {
  payload: DistillPayload | null
  source: DistillSource
}

function findRecordBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === DISTILL_TOOL.name) return block
  }
  return null
}

function distillBody(
  model: string,
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: DISTILL_MAX_TOKENS,
    system: DISTILL_SYSTEM_PROMPT,
    messages,
    tools: [DISTILL_TOOL],
    tool_choice: { type: 'tool', name: DISTILL_TOOL.name },
    /* Kept, not relied on. See the budget note above and the plan index's live probe. */
    thinking: { type: 'disabled' },
  }
}

function userTurn(input: DistillInput): string {
  const known =
    input.slotSummary.length === 0
      ? '(nothing known about him yet)'
      : input.slotSummary.map((slot) => `${slot.key}: ${slot.value}`).join('\n')
  const hers = input.ninaBubbles.map((bubble) => `NINA: ${bubble}`).join('\n')
  return `ALREADY KNOWN ABOUT HIM (do not re-record these unless he changed one):\n${known}\n\nHIM: ${input.runnerText}\n\n${hers}`
}

function logDistillFailure(stage: 'primary' | 'repair', cause: unknown): void {
  /* Never `console.error`. A turn that did not distil is an expected state of this feature: the
   * message is stored with an id, so the distillation is re-derivable and nothing is lost. */
  console.warn(`[nina.distill] ${stage} call failed`, { error: String(cause) })
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function distillWith(
  client: DistillClientLike,
  input: DistillInput,
  options: { model: string; now?: () => number },
): Promise<DistillResult> {
  const now = options.now ?? Date.now
  const deadline = now() + DISTILL_OVERALL_MS
  const remaining = (): number => deadline - now()

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn(input) }]

  let first: Anthropic.Message | null = null
  try {
    first = await client.messages.create(distillBody(options.model, messages), {
      timeout: Math.min(DISTILL_PRIMARY_MS, Math.max(remaining(), 1)),
    })
  } catch (cause) {
    logDistillFailure('primary', cause)
  }

  if (first !== null) {
    const block = findRecordBlock(first)
    /* A `max_tokens` stop is a response cut mid-object; the same prompt cuts it again, so it is
     * not a validation failure to repair. `narrate.ts` makes the same call for the same reason. */
    const truncated = first.stop_reason === 'max_tokens'

    if (block !== null && !truncated) {
      const parsed = DistillPayloadSchema.safeParse(block.input)
      if (parsed.success) return { payload: parsed.data, source: 'llm' }

      if (remaining() > MIN_DISTILL_REPAIR_BUDGET_MS) {
        const repairMessages: Anthropic.MessageParam[] = [
          ...messages,
          { role: 'assistant', content: JSON.stringify(block.input) },
          { role: 'user', content: DISTILL_REPAIR_PREAMBLE + describeDistillIssues(parsed.error) },
        ]
        try {
          const second = await client.messages.create(distillBody(options.model, repairMessages), {
            timeout: Math.max(Math.min(DISTILL_REPAIR_MS, remaining()), 1),
          })
          const repairedBlock = findRecordBlock(second)
          if (repairedBlock !== null && second.stop_reason !== 'max_tokens') {
            const repaired = DistillPayloadSchema.safeParse(repairedBlock.input)
            if (repaired.success) return { payload: repaired.data, source: 'llm_repair' }
          }
        } catch (cause) {
          logDistillFailure('repair', cause)
        }
      }
    }
  }

  return { payload: null, source: 'unavailable' }
}

/**
 * The wired call. **This is the symbol the payload-boundary guard names** (Step 8), because it is
 * the one that costs 10-20 s and must never sit in a render path.
 */
export async function distillNinaMemory(deps: {
  input: DistillInput
  client?: DistillClientLike
  model?: string
  now?: () => number
}): Promise<DistillResult> {
  return distillWith(deps.client ?? narrativeClient(), deps.input, {
    model: deps.model ?? narrativeModel(),
    now: deps.now,
  })
}

/**
 * **Facts first, unconditionally. Slots second.** Sequential and each in its own `try`, so one
 * rejected row cannot take the other twenty-three with it, and a slot that fails to write leaves
 * the ledger intact.
 *
 * One `appendMemoryFact` per row rather than a batch insert: it keeps phase 3's single write path
 * (ruling (b)) and it means a single malformed fact costs one fact. This runs in `after()`, so the
 * extra round trips cost nobody any wall clock they can feel.
 */
export async function applyMemoryPlan(
  userId: string,
  plan: MemoryPlan,
  gateway: NinaMemoryGateway,
): Promise<void> {
  for (const fact of plan.facts) {
    try {
      await gateway.appendMemoryFact(userId, {
        text: fact.text,
        sourceMessageId: fact.sourceMessageId,
        category: fact.category,
        confidence: fact.confidence,
      })
    } catch (cause) {
      console.warn('[nina.distill] fact append failed', { error: String(cause) })
    }
  }

  for (const slot of plan.slots) {
    try {
      await gateway.saveMemorySlot(userId, {
        key: slot.key,
        value: slot.value,
        source: slot.source,
        sourceMessageId: slot.sourceMessageId,
      })
    } catch (cause) {
      console.warn('[nina.distill] slot upsert failed', { key: slot.key, error: String(cause) })
    }
  }

  if (plan.deferred.length > 0) {
    /* Ruling (c) rule 2, made visible. An admin-owned slot she tried to correct is worth a log
     * line: it is the one case where the app knowingly did not write what the model concluded. */
    console.info('[nina.distill] slots deferred to their admin-written values', {
      keys: plan.deferred.map((slot) => slot.key),
    })
  }
}

export interface TurnDistillationInput {
  userId: string
  runnerText: string
  /** `nina_messages.id` of his message. Null on a proactive turn. */
  sourceMessageId: string | null
  ninaBubbles: readonly string[]
  /** Phase 3's `send.memoryWrites`, already validated. */
  memoryWrites: readonly NinaMemoryWrite[]
  /** `context.memory.slots` mapped to `{ key, value }` — already display strings (phase 2). */
  slots: readonly { key: string; value: string }[]
  /**
   * `context.runner.fullName`, the `nickname` slot, and the window length as `messageCount` —
   * never a `COUNT(*)`, because phase 1 exports no `countNinaMessages` (RULING A2).
   */
  identity: NameSlotInput
  gateway?: NinaMemoryGateway
  client?: DistillClientLike
  now?: () => Date
}

/**
 * The whole pass, and the only thing `lib/nina/actions.ts` calls. Never throws: a distillation
 * that failed is a turn whose facts are still re-derivable from a persisted message.
 */
export async function runTurnDistillation(input: TurnDistillationInput): Promise<void> {
  const { dbNinaToolGateway } = await import('./gateway')
  const gateway = input.gateway ?? (dbNinaToolGateway as NinaMemoryGateway)
  const now = input.now?.() ?? new Date()

  try {
    const [distilled, existingSlotSources, currentPromises] = await Promise.all([
      distillNinaMemory({
        input: {
          runnerText: input.runnerText,
          ninaBubbles: input.ninaBubbles,
          slotSummary: input.slots,
        },
        client: input.client,
      }),
      gateway.readSlotSources(input.userId),
      gateway.readPendingPromises(input.userId),
    ])

    const plan = planMemoryWrites({
      runnerText: input.runnerText,
      sourceMessageId: input.sourceMessageId,
      memoryWrites: input.memoryWrites,
      distilled: distilled.payload,
      existingSlotSources,
      currentPromises,
      identity: input.identity,
      promiseCtx: {
        todayISO: jakartaDayOf(now),
        sourceMessageId: input.sourceMessageId,
        newId: () => newId(),
      },
    })

    await applyMemoryPlan(input.userId, plan, gateway)

    console.info('[nina.distill] done', {
      promptVersion: NINA_DISTILL_PROMPT_VERSION,
      source: distilled.source,
      facts: plan.facts.length,
      slots: plan.slots.length,
      deferred: plan.deferred.length,
      demoted: plan.demoted.length,
    })
  } catch (cause) {
    console.warn('[nina.distill] pass failed entirely', { error: String(cause) })
  }
}
```

**Impact:** The dynamic `await import('./gateway')` is what keeps this module importable from
`tests/nina.distill.test.ts` with a fake gateway and without pulling a database client into the
test process. Every other import here is either a type or already `server-only`.

---

### Step 8: `lib/nina/tools.ts` — two widened write signatures, and nothing else

**File:** `lib/nina/tools.ts`, the `NinaToolGateway` interface (`:762–777`)
**Change:** Two optional-field widenings. `handleSaveMemory` and every other call site in the file
is untouched, because `string` is a member of `NinaSlotValue` and every new field is optional.

**Code — replacing the two method declarations inside `NinaToolGateway`:**

```ts
  /**
   * Ruling (b): the ONE write path for a standing fact. `save_memory` and
   * `send.memoryWrites` both land here, so there is no second implementation of "upsert a slot".
   * Phase 5 owns the vocabulary; this method owns the row.
   *
   * **Widened by phase 5, additively.** `value` takes `NinaSlotValue` because `pending_promises`
   * (R19) is a structured slot and `string` is a member of that union, so this file's own callers
   * are unaffected. `source` exists for phase 5's admin-row rule — a merge that preserved an
   * admin-written value writes the row back as `'admin'` rather than relabelling it.
   */
  saveMemorySlot(
    userId: string,
    row: {
      key: string
      value: NinaSlotValue
      source?: NinaMemorySource
      sourceMessageId?: string | null
    },
  ): Promise<void>
  /**
   * The append-only ledger (RU-6). `sourceMessageId` is the runner message this turn answers.
   *
   * **Widened by phase 5, additively.** `category` and `confidence` are phase 1's own columns and
   * phase 5's distiller supplies both; omitted, they take the row's defaults (`'other'` and 100),
   * which is exactly what `save_memory` wants.
   */
  appendMemoryFact(
    userId: string,
    row: {
      text: string
      sourceMessageId: string | null
      category?: NinaFactCategory
      confidence?: number
    },
  ): Promise<void>
```

**Also add to this file's type imports:**

```ts
import type { NinaFactCategory, NinaMemorySource, NinaSlotValue } from '@/lib/db/schema'
```

**Impact:** Type-only. `import type` is erased, so `lib/nina/tools.ts` stays free of any runtime
dependency on the schema module and phase 3's "no database import in tools.ts" rule holds.

---

### Step 9: `lib/nina/gateway.ts` — two reads added to the one gateway object

**File:** `lib/nina/gateway.ts`, `dbNinaToolGateway` (`:1714–1740`)
**Change:** The two writers forward the new optional fields, and the object gains the two reads
`NinaMemoryGateway` needs. **No second gateway object is created** — that is the whole point.

**Code — the two writers, replacing their current bodies, plus the two new members:**

```ts
  async saveMemorySlot(userId, row) {
    await upsertNinaMemorySlot(userId, {
      key: row.key,
      value: row.value,
      source: row.source,
      sourceMessageId: row.sourceMessageId,
    })
  },

  async appendMemoryFact(userId, row) {
    /* `category` is NOT NULL on the table and `save_memory` does not supply one, so the default
     * lands here rather than in a database default that a reader would have to go and look up. */
    await appendNinaMemoryFacts(userId, [
      {
        category: row.category ?? 'other',
        text: row.text,
        confidence: row.confidence,
        sourceMessageId: row.sourceMessageId,
      },
    ])
  },

  /**
   * Phase 5's admin-row rule (its ruling (c)) is unimplementable without knowing who wrote each
   * slot. `getNinaMemorySlots` already selects `source`; this only reshapes it into the lookup the
   * planner wants.
   */
  async readSlotSources(userId) {
    const rows = await getNinaMemorySlots(userId)
    return new Map(rows.map((row) => [row.key, row.source]))
  },

  /**
   * `pending_promises`, parsed, for phase 5's merge. The shape check is deliberate and belongs
   * here: `value` is `jsonb`, phase 16's editor hand-writes it, and a malformed value must degrade
   * to "no promises" rather than throw inside a distillation pass. This is a boundary, not
   * arithmetic.
   */
  async readPendingPromises(userId) {
    const row = await getNinaMemorySlot(userId, NINA_SLOT_PENDING_PROMISES)
    if (row === null) return null
    const value = row.value
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const promises = (value as { promises?: unknown }).promises
    if (!Array.isArray(promises)) return null
    return { promises } as NinaPendingPromisesSlot
  },
```

**Also in this file — the imports and one compile-time assertion:**

```ts
import {
  appendNinaMemoryFacts,
  getNinaMemorySlot,
  getNinaMemorySlots,
  upsertNinaMemorySlot,
  /* …phase 3's existing imports… */
} from './queries'
import { NINA_SLOT_PENDING_PROMISES, type NinaPendingPromisesSlot } from '@/lib/db/schema'
import type { NinaMemoryGateway } from './distill'

/**
 * **The one-implementation guarantee, checked by the compiler.** Phase 5's `NinaMemoryGateway` and
 * phase 3's `NinaToolGateway` are two views of this single object; if a later edit breaks either,
 * the build fails here rather than in a runtime cast.
 */
const _memoryGateway: NinaMemoryGateway = dbNinaToolGateway
void _memoryGateway
```

**Impact:** The import above names `appendNinaMemoryFacts`, which **RULING A2 confirms is the
canonical and only spelling** — phase 3's singular `insertNinaMemoryFact` does not exist, phase 1
owns `lib/nina/queries.ts` and exports the batch form alone, and phase 3's `lib/nina/gateway.ts`
has already been edited to call it. So this step needs no adaptation and no wrapper is added
anywhere. It was a pre-existing phase 1 / phase 3 naming disagreement, resolved in phase 1's favour
before this phase lands.

---

### Step 10: `lib/nina/actions.ts` — the interpretation moves out, `after()` moves in

**File:** `lib/nina/actions.ts` — the imports, `sendNinaMessage`'s STEP 6, and the
`applyMemoryWrites` helper below it
**Change:** Delete `applyMemoryWrites` and its `NinaMemoryWrite` import. Add the `after()` hook,
called on **both** exit paths.

**Code — the import additions:**

```ts
import { after } from 'next/server'

import { runTurnDistillation } from './distill'
```

**Code — replacing STEP 6, `applyMemoryWrites`, and both success returns:**

```ts
  /*
   * STEP 6 — the distillation (phase 5, R4). `after()` and not `await`: the turn already cost
   * 13-45 s and this is another 10-20 s model call, so awaiting it would leave him watching an
   * idle screen after the bubbles have landed. `after` runs for the route's max duration and runs
   * even when the response is already out.
   *
   * `after()` throws E468 outside a request scope, which is exactly why the CALL is here in the
   * `'use server'` module and `runTurnDistillation` itself never calls it — the same lesson phase
   * 10 learned when it moved its hook out of `lib/review/commit.ts`.
   *
   * `runTurnDistillation` never throws, so there is no `try` around this and nothing to swallow.
   */
  scheduleDistillation({
    userId,
    runnerText: text,
    sourceMessageId: runnerMessage.id,
    ninaBubbles: bubbles.map((bubble) => bubble.body),
    memoryWrites: result.payload.memoryWrites ?? [],
    context,
  })

  return { ok: true, userMessageId: runnerMessage.id, bubbles, unavailable: false }
}

/**
 * The `after()` wrapper, so the two exit paths schedule one identical pass.
 *
 * **`messageCount` comes from the context window and not from a `COUNT(*)`.** The window is
 * `CONTEXT_MESSAGE_WINDOW = 40` messages and it is loaded AFTER his message was persisted, so it
 * is an exact count everywhere below 40 — and `FIRST_CONVERSATION_MESSAGE_LIMIT` is 12, so the one
 * decision that reads it is always in the exact range. That is a whole query saved for free, and
 * saying so here is cheaper than someone later "fixing" it.
 */
function scheduleDistillation(input: {
  userId: string
  runnerText: string
  sourceMessageId: string
  ninaBubbles: readonly string[]
  memoryWrites: readonly NinaMemoryWrite[]
  context: NinaContext
}): void {
  after(async () => {
    await runTurnDistillation({
      userId: input.userId,
      runnerText: input.runnerText,
      sourceMessageId: input.sourceMessageId,
      ninaBubbles: input.ninaBubbles,
      memoryWrites: input.memoryWrites,
      slots: input.context.memory.slots.map((slot) => ({ key: slot.key, value: slot.value })),
      identity: {
        fullName: input.context.runner.fullName,
        nickname: input.context.runner.nickname,
        messageCount: input.context.conversation.window.length,
      },
    })
  })
}
```

**Code — the `unavailable` early return, which now also distils:**

```ts
  if (result.payload == null) {
    /*
     * She could not answer, but HE still spoke, and R4 is "every single thing". His message is
     * persisted with an id, so distilling it is both possible and the honest reading of the
     * requirement — a turn where she failed is not a turn where he said nothing.
     */
    scheduleDistillation({
      userId,
      runnerText: text,
      sourceMessageId: runnerMessage.id,
      ninaBubbles: [],
      memoryWrites: [],
      context,
    })
    return { ok: true, userMessageId: runnerMessage.id, bubbles: [], unavailable: true }
  }
```

**Impact:** `send.memoryWrites` now land ~10–20 s later than they did in phase 3, inside the same
pass that distils. That is deliberate: **one interpretation, one plan, one apply.** The cost of a
dropped `after()` is one turn's distillation, and it is recoverable — his message is persisted with
an id and `source_message_id` is exactly what makes the pass re-runnable over it. A synchronous
ledger-only pre-pass would remove even that risk; it is not built, and the decision is recorded
below under the decisions on the open items.

---

### Step 11: `scripts/check-llm-payload-boundary.mjs` — nothing to do (RULING D1)

**File:** none. **This step is a no-op and is kept only so the numbering below does not shift.**

Phase 1 ships the complete **`GUARDED_CALLS`** table, including `distillNinaMemory` with
`lib/nina/distill.ts` and `lib/nina/actions.ts` as its sanctioned callers. Phase 1 owns the file;
nothing to add here. The reasoning this step used to carry is still the reason the entry exists, and
it belongs in phase 1's `why` string rather than in a second writer's diff: the distillation is not
the reply, so nothing on screen is waiting for it, which makes it exactly the kind of call that
gets quietly awaited somewhere it should not be.

**Impact:** `npm run ci:llm-payload-guard` must still pass at this phase's landing — it will, with
no edit from here, because `lib/nina/actions.ts` and `lib/nina/distill.ts` are the two callers phase
1 already sanctioned.

---

### Step 12: the two suites

**File:** `tests/nina.memory.test.ts` (new) and `tests/nina.distill.test.ts` (new)
**Change:** Every exit criterion, plus the two rules that would otherwise be honoured by
convention.

**`tests/nina.memory.test.ts` — the pure suite. No fake of any kind.**

| # | Case | Assertion |
|---|---|---|
| 1 | `NINA_SLOT_KEYS` vs phase 1 | contains `NINA_SLOT_PENDING_PROMISES`; `NINA_SLOT_SPECS[k].key === k` for all nine |
| 2 | `"Selasa, Kamis, Sabtu, Minggu"` | `[2, 4, 6, 7]` |
| 3 | `"selasa kamis sabtu dan minggu"` | `[2, 4, 6, 7]` — `dan` is not a day |
| 4 | `"tue, thu, sat, sun"` | `[2, 4, 6, 7]` |
| 5 | `"tuesdays and thursdays"` | `[2, 4]` — the plural strip |
| 6 | `"gw biasanya lari selasa sama kamis"` | `[2, 4]` — prose around the tokens |
| 7 | `"Senin sampe Jumat"` | `[1, 2, 3, 4, 5]` — **the range, not `[1, 5]`** |
| 8 | `"Selasa-Kamis"` and `"Senin s/d Jumat"` | `[2, 3, 4]` and `[1, 2, 3, 4, 5]` |
| 9 | `"Sabtu sampe Senin"` | `[1, 6, 7]` — the wrap |
| 10 | `"tiap hari"`, `"daily"` | all seven |
| 11 | `"tiap hari kecuali senin"` | `[]` — refuses rather than misremembers |
| 12 | `"kapan aja"`, `""`, `null` | `[]` |
| 13 | **round trip**, for cases 2–10 | `parseRunningDays(formatRunningDays(days))` deep-equals `days` |
| 14 | `parseRunningDaysAsJsWeekday("Minggu, Senin")` | `[0, 1]` — phase 10's convention |
| 15 | `NINA_SLOT_SPECS.running_days.canonicalise` | `"senin sampe jumat"` -> `"Senin, Selasa, Rabu, Kamis, Jumat"`; `"kapan aja"` -> `null` |
| 16 | `parseWorkHours("jam 8 sampe jam 5")` | `{ startMinute: 480, endMinute: 1020 }` — the PM heuristic |
| 17 | `parseWorkHours("9am to 6pm")`, `"08:00-17:00"` | `540/1080`, `480/1020` |
| 18 | `parseWorkHours("lari 10 km terus ngantor")` | `null` — the qualifier rule |
| 19 | `formatWorkHours` round trip | `parseWorkHours(formatWorkHours(h))` deep-equals `h` |
| 20 | `syllabify` | `"miftahul"` -> `['mif','ta','hul']`; `"mahfuzh"` -> `['mah','fuzh']`; `"santoso"` -> `['san','to','so']`; `"nggak"` -> one syllable |
| 21 | **`deriveNicknameCandidates("Miftahul Mahfuzh")`** | `['mif','tah','hul','mah']` — **contains both forms the user used about himself** |
| 22 | `deriveNicknameCandidates` | `"Budi Santoso"` -> `['bud','di','san']`; `"Sukarno"` -> `['suk','kar','no']`; `null` -> `[]`; `"Ahmad bin Yusuf"` -> particle `bin` skipped |
| 23 | `canonicaliseNickname` | `"Mif"` -> `"mif"`; `"mif aja"` -> `"mif"`; `"m"` -> `null`; `"panggil gw apa aja"` -> `"panggil"` (documented: the caller's quote gate is what stops this landing) |
| 24 | `nameSlotValue` | nickname set -> bare full name; nickname null and `messageCount: 3` -> contains `"mif atau tah"`; nickname null and `messageCount: 40` -> bare full name; `fullName: null` -> `null` |
| 25 | **the fixture conversation** | `planMemoryWrites` over one distilled payload yields exactly the expected `facts` (category, text, confidence) and `slots` (`running_days`, `goals`, `name`) |
| 26 | **the contradiction** | two successive plans, the second saying he now runs Mon/Wed/Fri: plan 2's `slots` replaces `running_days`, **and both plans carry their own ledger fact** — nothing in either plan updates or removes the other's |
| 27 | **admin deferral** | `existingSlotSources: Map([['running_days','admin']])` -> `slots` has no `running_days`, `deferred` has `{ key:'running_days', reason:'admin-owned' }`, **and `facts` still carries the statement** |
| 28 | **merge stickiness** | `existingSlotSources: Map([['pending_promises','admin']])` with a new promise -> the slot IS written, `source === 'admin'`, and the admin's existing entry is still in `value.promises` |
| 29 | unverified quote | `quote: 'gw pindah ke Bandung'` against a message that never said it -> no slot, one fact at confidence 40, `demoted` says `'unverified-quote'` |
| 30 | low confidence | `confidence: 60` with a good quote -> no slot, one fact at 60, `demoted` says `'low-confidence'` |
| 31 | unknown `slotKey` | `slotKey: 'favourite_colour'` -> `demoted` `'unknown-key'`, fact present, no slot |
| 32 | `memoryWrites` bypass the quote gate | a `{ kind:'slot', slotKey:'gear', text:'Nike Pegasus 41' }` write with no quote anywhere -> slot written (phase 3's trust level, preserved) |
| 33 | `mergePendingPromises` | a `metric:'record'` candidate with a `target` and no `targetKey` -> `rejected`, and `planMemoryWrites` turns it into a fact with `demoted: 'bad-promise-shape'` |
| 34 | `mergePendingPromises` restatement | the same condition twice in one payload -> one entry |
| 35 | `mergePendingPromises` cap | 12 pending + 3 resolved + 1 new -> the resolved ones go first, **no pending entry is dropped** |
| 36 | `verifyQuote` | `"gw"` -> false (too short); case and whitespace differences -> true |

**`tests/nina.distill.test.ts` — one fake client, one fake gateway.**

| # | Case | Assertion |
|---|---|---|
| 1 | a `thinking` block **before** the `record` block | the payload still parses — **the plan index's live correction, made a test.** A reader of `content[0]` fails this case |
| 2 | a well-formed payload | `source: 'llm'`, one `create` call |
| 3 | a malformed payload, then a good one | `source: 'llm_repair'`, **exactly two** `create` calls, and the repair body's messages are `[user, assistant(malformed JSON), user(preamble + issues)]` |
| 4 | malformed twice | `payload: null`, `source: 'unavailable'`, and no throw |
| 5 | primary `create` rejects | `payload: null`, `source: 'unavailable'`, no throw, one `console.warn` |
| 6 | `stop_reason: 'max_tokens'` | **no repair is attempted** — one `create` call |
| 7 | the request body | carries `thinking: { type: 'disabled' }`, `tool_choice: { type: 'tool', name: 'record' }`, `max_tokens: DISTILL_MAX_TOKENS` |
| 8 | a deadline already spent (`now` pinned past it) | no repair; the primary timeout is at least 1 ms |
| 9 | **`applyMemoryPlan` order** | a recording gateway: **every `appendMemoryFact` call precedes every `saveMemorySlot` call.** This is R4's "PERMANENTLY" as an executable assertion |
| 10 | `applyMemoryPlan` resilience | the first `appendMemoryFact` rejects -> the remaining facts AND every slot are still written |
| 11 | `applyMemoryPlan` resilience | a `saveMemorySlot` rejects -> every fact is still written and the other slots still land |
| 12 | `runTurnDistillation` degraded | a client that always throws -> phase 3's `memoryWrites` are STILL applied, which is the "phase 3's behaviour is the floor" guarantee |
| 13 | `runTurnDistillation` never throws | a gateway whose every method rejects -> resolves, does not reject |
| 14 | **ruling (c) rule 1, mechanically** | `readFileSync` on `lib/nina/memory.ts` and `lib/nina/distill.ts`: neither source contains `updateNinaMemoryFact` or `deleteNinaMemoryFact`. An admin ledger row is unreachable from this phase **by construction, and the construction is checked** |

**Impact:** Case 14 is the only test in the repo that asserts on source text rather than behaviour,
and it is deliberate: ruling (c) rule 1 is a *structural* guarantee, and the only way to keep a
structural guarantee from decaying into a comment is to check the structure.

## Verification

**Build:** `npm run typecheck && npm run lint`
**Tests:** `npm test`, and while iterating
`npx vitest run tests/nina.memory.test.ts tests/nina.distill.test.ts`
**Guards:** `npm run ci:llm-payload-guard` (phase 1 already sanctioned `distillNinaMemory` in
`GUARDED_CALLS`; this phase adds the two callers it named, so the guard must pass with no edit to
the script), then every other `ci:*` script —
`ci:openrouter-guard`, `ci:data-layer-guard`, `ci:client-secret-guard`, `ci:f08-guard`,
`ci:f11-guard`.

**Manual check**, against a real conversation, in this order:

1. Say something that names standing truth — *"gw biasanya lari selasa, kamis, sabtu sama minggu"*.
   Wait for her bubbles, then reload `/nina`. `nina_memory_slots` has
   `running_days = "Selasa, Kamis, Sabtu, Minggu"` and `nina_memory_facts` has a row quoting it
   with `source_message_id` set.
2. Contradict it — *"gw ganti, sekarang senin rabu jumat"*. The slot now reads
   `"Senin, Rabu, Jumat"` and **both** ledger rows are present.
3. Check the name. On a fresh account the `name` slot's value contains
   `"Tawarin: mif atau tah"`; answer her, and the `nickname` slot becomes `mif`, the `name` slot
   collapses to the bare full name, and she uses the nickname from the next turn on.
4. Simulate R24 by hand: `UPDATE nina_memory_slots SET source = 'admin', value = '"Senin, Kamis"'
   WHERE key = 'running_days'`. Say something that would change it. The slot is **unchanged**, the
   ledger has the new statement, and the server log carries
   `[nina.distill] slots deferred to their admin-written values`.

**Exit criteria:**

- A fixture conversation yields the expected slots and ledger rows (`nina.memory.test.ts` case 25).
- A contradicting later statement replaces the slot and leaves both ledger rows (case 26).
- A nickname is derived from a multi-word name, and `"Miftahul Mahfuzh"` yields both `mif` and
  `tah` (case 21).
- `pending_promises` has a documented machine-readable shape phase 13 can evaluate without
  guessing: phase 1's `NinaPendingPromise`, written only through `mergePendingPromises`, with
  `metric` deciding which of `target`/`targetKey` is set and the other guaranteed null (cases
  28, 33–35).
- `parseRunningDays` is unit-tested against the phrasings a runner actually uses, including a range
  and a negation (cases 2–14).
- An admin-written row survives a distillation pass, in both directions: a `replace` slot is
  deferred and a `merge` slot keeps its `'admin'` source (cases 27, 28), and no ledger row can be
  reached at all (case 14).
- `npm run typecheck && npm run lint && npm test` and every `ci:*` guard pass (invariant 1).

## Handoffs

**Phase 10 — `parseRunningDays` now has one owner, and the edit is DONE. RULING E4 accepted this
phase's binding edit verbatim and it has been APPLIED in phase 10's own plan** — phase 10 no longer
declares a token table or a parse, and its Owns line, its Files table and its code block all name
the wrapper. Nothing here is an ask any more; the three steps below are kept as the record of what
landed, because they are also the rationale.

The edit, as applied in `lib/nina/proactive.ts`:

1. Delete the `DAY_TOKENS` constant (its comment block and the seven lines of the table) and the
   whole body of `parseRunningDays`, including its header.
2. Add `import { parseRunningDaysAsJsWeekday } from './memory'`.
3. Replace the export with the one line that keeps your own name and type in your own file:

```ts
/**
 * Phase 5 owns the `running_days` slot and its parser (its ruling (a)): one token table, one range
 * expander, one negation rule. This is the JS-weekday view of it, so `jakartaWeekdayOf` and this
 * function still agree about which number is Sunday.
 */
export function parseRunningDays(value: string | null | undefined): Weekday[] {
  return [...parseRunningDaysAsJsWeekday(value)] as Weekday[]
}
```

Everything else in phase 10 is unaffected: `evaluateMissedUsualDay` still compares
`jakartaWeekdayOf(todayISO)` against the returned array, `RUNNING_DAYS_SLOT_KEY = 'running_days'`
still matches, and *"an unparseable or absent slot is no usual days, which disables trigger 2"* is
still exactly what happens. **Two behavioural changes come for free and are improvements — and they
are why the reconciler took the edit rather than leaving two parsers standing:**
`"Senin sampe Jumat"` now names five days instead of two, and `"tiap hari kecuali senin"` now
disables the trigger instead of firing it every Monday.

**Phase 9 — nothing required.** `PatternInput.usualRunningDays: readonly number[]` (ISO 1–7) is
exactly this phase's `parseRunningDays` return type, so it is assignable with no cast. The
`work_hours` slot and `parseWorkHours` also exist now, if the late-start threshold ever wants his
actual office hours instead of a fixed clock time — **that would be a change to R11 and it is
phase 9's call, not this phase's.** No `work_hours` consumer ships here.

**Phase 13 — the promise lifecycle after this phase.** `pending_promises` is written only through
`mergePendingPromises`, so when you resolve one:

- read with `getNinaMemorySlot(userId, NINA_SLOT_PENDING_PROMISES)` and cast to
  `NinaPendingPromisesSlot`, which phase 1 declares;
- set `status: 'met' | 'expired'` and `resolvedOn` **in place** and write the whole slot back
  through `saveMemorySlot`. Do not remove the entry — the cap in this phase drops resolved entries
  first, so a resolved promise ages out on its own and until then she can refer to it;
- **carry the row's existing `source` through**, exactly as this phase's merge does. If it says
  `'admin'`, write `'admin'` back. Reading it costs nothing (`getNinaMemorySlot` returns it) and
  relabelling a human's row as distilled is the one way to lose the R24 guarantee from your side.
- `metric: 'free'` promises cannot be decided by any field. Leave them `'pending'`; she may ask
  him. That is what the escape hatch is for, and it is not a bug to route into.
- **RULING C3 — your three new fields need no new write path, and you already have one.** Phase 1
  added `jobId?: string | null`, `firedOn?: string | null` and `attempts?: number` to
  `NinaPendingPromise`; all optional, `jsonb`, no migration. You set them **in place**, through
  exactly the four rules above — resolve in place, write the whole slot back, never remove an entry,
  carry `source` through — so `mergePendingPromises` stays the only *constructor* of an entry and
  your state machine is the only *mutator* of one. This phase's code compiles untouched against the
  widened type, and nothing in either plan gains a second way to write the slot.

**Phase 16 — what this phase guarantees you, and the one thing it needs back.** Guaranteed:
a `'admin'` ledger row is unreachable from every code path here (asserted by
`nina.distill.test.ts` case 14), and a `'admin'` `replace` slot is deferred rather than
overwritten. What the editor must do to hold up its end: **write `source: 'admin'` on every row it
creates or edits.** `upsertNinaMemorySlot` defaults to `'distilled'`, so an editor that omits the
field writes a row the distiller is then free to replace — which is the exact failure R24 exists to
prevent. Your "edit a stale fact" is `updateNinaMemoryFact`, and this phase never calls it —
**but RULING G5 restricts it to `source: 'admin'` rows, and phase 16 §2 is right about why:
rewriting a distilled row's `text` forges what its `source_message_id` claims the message said.
The route for a distilled row is therefore Retract (append-then-delete), never an in-place edit.**
Consider showing `confidence` and `source_message_id`, because a distilled row at confidence 40 is
usually the one worth retracting.

**Phase 6 — image descriptions are not distilled by this phase.** `glm-4.6v`'s text arrives as
`NinaTurnInput.imageDescriptions` and a photo of a swollen knee is a `body` fact worth keeping.
This phase's `DistillInput` deliberately carries only `runnerText` and her bubbles, because the
quote gate (ruling (d)) checks against **his own words** and a description he did not write cannot
be quoted. Extending it means either a second haystack or a second confidence rule; **that is
phase 6's decision if it wants it, and it is additive to `DistillInput`.** Not done here.

**Phase 2 — one thing not to change later.** R7's name confirmation travels down the `name`
**slot's value**, relying on phase 2's `CONTEXT_GUIDE` rendering `memory.slots[].value` verbatim
into the payload. If a later prompt edit ever summarises, truncates or reformats slot values, the
nickname offer disappears with them and nothing fails loudly. `NAME_RULES` itself needs no edit.

## Decisions on the open items

1. **The ledger writer is `appendNinaMemoryFacts`, plural. Decided** (RULING A2), **because phase 1
   owns `lib/nina/queries.ts` and exports the batch form and nothing else** — phase 3's singular
   `insertNinaMemoryFact` was a spelling for a function that does not exist, and phase 3's
   `lib/nina/gateway.ts` has been edited to call the real one. No singular wrapper is added: a
   wrapper would be a second name for one write path, which is the thing ruling (b) exists to
   prevent. Step 9 was already written against the right name and needs no edit. The structural
   half of this still has to hold — `tests/nina.distill.test.ts` case 14 asserts that neither
   `lib/nina/memory.ts` nor `lib/nina/distill.ts` names `updateNinaMemoryFact` or
   `deleteNinaMemoryFact`, and it is unchanged in substance, because ruling (c) rule 1 is a claim
   about *which functions the distiller imports* and nothing else. **Revisit if** a caller ever
   genuinely needs one-row-at-a-time semantics the array form cannot express — it can, with an
   array of one, which is what Step 9 does.
2. **Phase 2's context field names stand: `ConversationFacts.window`, `RunnerFacts.fullName`,
   `RunnerFacts.nickname`. Decided, because phase 2 owns those types and has recorded that phase 13
   is its ONE sanctioned additive extender** — so no rename is coming and Step 10's
   `scheduleDistillation` body needs no change at all. It reads
   `input.context.conversation.window.length`, `input.context.runner.fullName` and
   `input.context.runner.nickname`, exactly as printed. **Revisit if** phase 2 ever takes a second
   extender; the fix is still three field reads in one function.
3. **A dropped `after()` loses one turn's distillation, and that is accepted. Decided, because the
   runner's message is persisted with an id BEFORE the model call**, so the pass is re-runnable over
   it and `source_message_id` is what makes that true for every fact — nothing is unrecoverable.
   The cheap belt-and-braces — a synchronous ledger-only pre-pass of `send.memoryWrites` in the
   action, before the `after()` hook — is **not built**, because it would mean two apply passes and
   a dedupe between them for a failure mode nothing has observed. **Revisit if** a real dropped
   `after()` is ever seen: the named fix is that pre-pass, and it is a contained addition to
   Step 10.
4. **`countNinaMessages` is not used, and it does not exist. Decided** (RULING A2): phase 1 never
   wrote it, so it is struck from Requires item 2 and nothing is being added to `lib/nina/queries.ts`
   for this phase. The reasoning was already right — Step 10 reads
   `context.conversation.window.length`, which is loaded *after* his message was persisted and is
   therefore an exact count everywhere below `CONTEXT_MESSAGE_WINDOW = 40`, and the one decision
   that reads it (`FIRST_CONVERSATION_MESSAGE_LIMIT = 12`) is always inside that exact range. A
   whole query saved for free. **Revisit if** phase 2 ever lowers `CONTEXT_MESSAGE_WINDOW` below 12,
   at which point the shortcut becomes wrong; the general answer is
   `getNinaMessageWindow(userId, limit)`'s **`olderCount`**, which phase 1 does export and which
   makes a real count a one-line read rather than a new query — worth a comment on phase 2's
   constant either way.
5. **An orphaned slot key IS read — it is in Nina's prompt on every turn — and the answer is
   `/admin/memory`'s Retire button, not a filter. Decided** (RULING E5; phase 16 §1 verified it with
   file:line and the reconciler adopted it). The plan's earlier sentence, that pre-vocabulary rows
   are "left in place and simply not read", was **false**: `getNinaMemorySlots(userId)` selects every
   row for the user ordered by `key` with no vocabulary filter, and phase 2's `loadNinaContext`
   passes the whole array into the context that becomes the system text — there is no
   `isNinaSlotKey` check anywhere on that path.

   So: **phase 2 gains no filter**, because `lib/nina/context.ts` and `lib/nina/load.ts` are phase
   2's files and a filter there changes what Nina sees on every turn, which is a prompt change owned
   by the phase that owns the prompt. And **retirement is strictly better than filtering anyway**,
   because it moves the sentence into the ledger where R4 wants it instead of silently dropping it.
   The mechanism is **phase 16 §4**: append a fact quoting the key and its final value verbatim,
   then `deleteNinaMemorySlot` — append-then-delete, so nothing is lost between the two statements.
   That it is a human judgement call about someone's memory is still the reason it is a button and
   not a migration. **Revisit if** phase 3's verbatim sink ever writes unknown keys faster than a
   human retires them; the stopgap is then the `isNinaSlotKey` filter in phase 2's loader, and it is
   still phase 2's call.

   The vocabulary itself is nine keys and it is a guess about him rather than a measurement — that
   part was never a question, and a tenth key remains a one-line edit to `NINA_SLOT_SPECS` that the
   distiller's prompt follows automatically (Step 6 renders it).

## Rollback

`git revert` the phase's commit. Everything it adds is additive and the three edits are small:

1. Delete `lib/nina/memory.ts`, `lib/nina/distill.ts`, `lib/nina/prompts/distill.ts`,
   `tests/nina.memory.test.ts`, `tests/nina.distill.test.ts`.
2. `lib/nina/tools.ts` — narrow the two `NinaToolGateway` write signatures back and drop the three
   type imports.
3. `lib/nina/gateway.ts` — drop `readSlotSources`, `readPendingPromises`, the `NinaMemoryGateway`
   assertion and the extra imports; restore the two writers' one-line bodies.
4. `lib/nina/actions.ts` — restore phase 3's `applyMemoryWrites` helper and its STEP 6 call, and
   drop the `after` import.

`scripts/check-llm-payload-boundary.mjs` is **not** in this list, and must not be edited on a
revert: phase 1 owns the file and its `GUARDED_CALLS` entry for `distillNinaMemory` is phase 1's
row. A sanctioned symbol with no caller left in the tree is inert — the guard walks call sites, not
declarations — so removing the entry would be a second phase writing phase 1's file for no gain.

**Nothing has to be undone in the database, and nothing should be.** The rows this phase wrote are
valid `nina_memory_slots` and `nina_memory_facts` rows that phase 3's own write path could have
produced, and `nina_memory_facts` is append-only by design — deleting them to "clean up" a revert
would be the one action in this whole feature that actually loses a memory. If a reverted tree must
stop *reading* a key, that is `/admin/memory`'s job (phase 16) and it is a human decision.

**Phase 10 is the one coupling to check on a revert.** If phase 10 has already applied the Handoffs
edit, reverting this phase removes `parseRunningDaysAsJsWeekday` from under it and the build breaks
at `lib/nina/proactive.ts`. Restore phase 10's own `DAY_TOKENS` and `parseRunningDays` from its
plan, or revert both phases together.
