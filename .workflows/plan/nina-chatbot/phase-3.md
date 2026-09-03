# Phase 3: Turn engine, tools, multi-bubble

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R1 (`glm-5.3` drives every turn; she answers in 1–4 short bubbles that read like a
person typing) and R15 (a natural date reference resolves to a run, two runs compare on
precomputed deltas, and "there is no run that day" is said out loud)
**Depends on:** Phase 1 (schema, `lib/nina/queries.ts`, env), Phase 2 (persona, context boundary,
prompts, every tool schema)
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

After this phase Nina *answers*. A Server Action takes what the runner typed, persists it, builds
phase 2's context, drives a budgeted agentic loop over `glm-5.3` — primary call, at most two tool
rounds, one repair, then honest silence — and returns 1–4 bubbles that phase 4 renders. Three
tools work: `lookup_runs` resolves ISO dates to precomputed run facts or an explicit absence,
`compare_runs` returns differences the app already worked out, and `save_memory` writes a fact.
Nothing in `lib/nina/turn.ts` throws for an LLM problem, nothing exceeds the platform's 60 s
ceiling, and `lib/nina/gateway.ts` makes phase 2's `NinaSourceGateway` concrete.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none of my own. **One rename I need from Phase 2:** its module-local
`runFact(run, today)` (phase-2.md line 1281) must become an export named `buildNinaRunFact`,
signature unchanged: `(run: NinaRunInput, today: DateISO) => NinaRunFact`. See *Requires*.

**Creates — `lib/nina/dates.ts`:**
`parseCalendarDate`, `isRealCalendarDate`, `resolveDate`, `resolveDates`, `indexRunsByDate`,
`MAX_LOOKUP_DATES = 5`; types `DateResolution`, `DateAbsence`, `DateInvalid`, `DateFuture`,
`DateHit`, `DateAmbiguous`, `RunsByDate`.

**Creates — `lib/nina/schema.ts`:**
`NinaSendPayloadSchema`, `NinaMemoryWriteSchema`, `SaveMemoryArgsSchema`, `LookupRunsArgsSchema`,
`CompareRunsArgsSchema`, `describeNinaIssues`, `MAX_BUBBLES = 4`, `MAX_MEMORY_WRITES = 6`,
`MAX_BUBBLE_CHARS = 700`, `MAX_RUNNER_MESSAGE_CHARS = 4000`; types `NinaSendPayload`,
`NinaMemoryWrite`, `SaveMemoryArgs`, `LookupRunsArgs`, `CompareRunsArgs`.

**Creates — `lib/nina/tools.ts`:**
`NINA_CORE_TOOL_SET`, `extendToolSet`, `dispatchNinaTool`, `handleLookupRuns`,
`handleCompareRuns`, `handleSaveMemory`, `compareRunFacts`, `COMPARE_FIELDS`;
types `NinaToolSet`, `NinaToolTable`, `NinaToolHandler`, `NinaToolContext`, `NinaToolAnswer`,
`NinaToolGateway`, `LookupRunsAnswer`, `CompareRunsAnswer`, `RunDelta`, `DeltaDirection`,
`SaveMemoryAnswer`.

**Creates — `lib/nina/gateway.ts`:** `dbNinaSourceGateway` (implements phase 2's
`NinaSourceGateway`), `dbNinaToolGateway` (implements this phase's `NinaToolGateway`),
`dbNinaTurnStore` (implements `NinaTurnStore`).

**Creates — `lib/nina/turn.ts`:**
`runNinaTurn`, `runNinaTurnWith`, `productionDeps`, `NINA_TURN_BUDGET`,
`NINA_MIN_REPAIR_BUDGET_MS`,
`NINA_MIN_ROUND_BUDGET_MS`, `MAX_TOOL_ROUNDS`, `NINA_MAX_TOKENS`, `ninaClient`, `ninaModel`;
types `NinaTurnResult`, `NinaTurnSource`, `NinaTurnDeps`, `NinaLlmClientLike`, `NinaTurnUsage`,
`NinaTurnTrace`, `NinaTurnStore`, `NinaTurnRow`, `NinaTurnInput`.

**Creates — `lib/nina/actions.ts`:**
`sendNinaMessage`, `SendNinaMessageResult`, `SentBubble` (`'use server'` module; these are the
only two exported types and the only exported function).

**Creates — tests:** `lib/nina/dates.test.ts`, `lib/nina/schema.test.ts`,
`lib/nina/tools.test.ts`, `lib/nina/turn.test.ts`, `tests/fixtures/ninaTurn.ts`,
`tests/live/nina.live.test.ts` (excluded from `npm test`, opt-in via `LLM_LIVE_TEST=1`).

**Modifies:** `package.json` (one script: `test:live:nina`).

**Not modified, and this is a ruling, not an oversight — `scripts/check-llm-payload-boundary.mjs`.**
Phase 1 owns that file outright and ships the complete `GUARDED_CALLS` table whole, including
`runNinaTurn` and its four sanctioned callers (`lib/nina/turn.ts`, `lib/nina/actions.ts`,
`lib/nina/proactive.ts`, `app/api/cron/nina/route.ts`). Nothing to add here. **The name is
`GUARDED_CALLS`** — not `SANCTIONED`, not `BLOCKING_CALLS`; both of those spellings originated in
this plan's draft and phase 5 was written against `BLOCKING_CALLS` because of it, so the name is
stated here unambiguously. What this phase still owes the guard is one thing: **its entry point
must be NAMED `runNinaTurn`**, because that literal string is what the table greps for. Rename it
and the guard silently stops guarding.

**Signature changes:** none to any existing symbol.

**Requires (from earlier phases).** Everything this phase leans on, so a mismatch is one named
edit and not a hunt:

1. **Phase 2 — `lib/nina/context.ts` must export `buildNinaRunFact(run: NinaRunInput, today:
   DateISO): NinaRunFact`.** Today it is the module-local `runFact` at phase-2.md:1281. Without
   the export, `lookup_runs` and `compare_runs` would have to re-spell distance, pace and HR for
   runs outside the recent-20 window — a second formatting authority, which is exactly what
   invariant 3 forbids. **This is a one-word change (`function` → `export function`) plus the
   rename**, and it is the single largest coupling between phases 2 and 3.
2. **Phase 2** — `lib/nina/load.ts` exports `loadNinaContext(userId, gateway, now?)` and the
   `NinaSourceGateway` interface with exactly the six reads listed in its plan; `lib/nina/prompts`
   exports `NINA_SYSTEM_PROMPT`, `NINA_REPAIR_PREAMBLE`, `NINA_PROMPT_VERSION`, `SEND_TOOL`,
   `LOOKUP_RUNS_TOOL`, `COMPARE_RUNS_TOOL`, `SAVE_MEMORY_TOOL`; `lib/nina/context.ts` exports the
   types `NinaContext`, `NinaRunFact`, `NinaRunInput`, `MemorySlotInput`, `MemoryFactInput`,
   `MessageInput`, `MessageRole`, `FiredPattern`, `NagState`.
3. **Phase 1 — `lib/nina/queries.ts`. These are its ACTUAL exports, and they are canonical.** This
   phase's draft guessed at five of these names and lost all five; the offer it made — *"or names
   close enough that `lib/nina/gateway.ts` is the only file that changes"* — has been taken up
   literally, and `gateway.ts` **is** the only file that changes. Every one is `userId`-scoped
   (invariant 7):

   ```ts
   getNinaIdentity(userId): Promise<{ fullName: string | null; nickname: string | null }>
   getNinaMemorySlots(userId): Promise<NinaSlotRow[]>                 // value RENDERED to string
   listNinaMemoryFacts(userId, opts: { limit: number }): Promise<NinaFactRow[]>
   getNinaMessageWindow(userId, limit: number): Promise<{ messages: NinaMessageRow[]; olderCount: number }>
   insertNinaMessages(userId, rows: readonly NinaMessageInsert[]): Promise<NinaMessageRow[]>
   upsertNinaMemorySlot(userId, input: NinaSlotUpsert): Promise<void>
   appendNinaMemoryFacts(userId, rows: readonly NinaFactInsert[]): Promise<NinaFactRow[]>
   insertNinaTurn(userId, input: NinaTurnInsert): Promise<string>     // returns the id
   ```

   Five corrections, each of which changes a body in Step 5 and nothing else:

   - **`listNinaMemorySlots` → `getNinaMemorySlots`.** A name, nothing more.
   - **`insertNinaMessage` → `insertNinaMessages`, and it is a BATCH.** It takes
     `readonly NinaMessageInsert[]`, spells the text field **`body`** and not `text`, takes **no
     `seq`** (item 4), and returns the inserted `NinaMessageRow[]` **in emission order** with the
     ids and the database-assigned `seq` already on them. That return value is strictly better than
     what this phase asked for: one round trip for a four-bubble reply instead of four, and the ids
     come back in the order they were emitted rather than in the order four concurrent inserts
     happened to land.
   - **`insertNinaMemoryFact` → `appendNinaMemoryFacts(userId, rows)`.** Also a batch, also plural.
   - **`countNinaMessages` does not exist, and must not be asked for.**
     `getNinaMessageWindow(userId, limit)` returns `{ messages, olderCount }` in one call, which is
     *exactly* what phase 2's `readMessageWindow` declares. So the gateway's `readMessageWindow`
     drops the `Promise.all([listNinaMessages, countNinaMessages])` entirely in favour of that one
     call — the `olderCount` is still a SQL `COUNT`, it is just phase 1's `COUNT` rather than a
     second one written here.
   - **`listNinaMemoryFacts` takes an OPTIONS OBJECT**, `{ limit: number }`, not a positional
     limit.
4. **Phase 1 — `seq` is a `bigserial` and Postgres assigns it. Nothing here writes one.** Phase
   1's decision D-2 supersedes the `seq integer not null default 0` this phase originally asked
   for, and the composite `ORDER BY (sent_at asc, seq asc)` with it. A `bigserial` is a **total
   order over the whole conversation**, so `ORDER BY seq` alone is deterministic, needs no
   composite key, and admits **no tie at all** — not even between two turns that share a `sent_at`
   to the microsecond, which is precisely what an `after()` hook and the cron running concurrently
   can produce. Emission order within a turn comes free from the one multi-row `INSERT`, because
   Postgres evaluates `nextval` once per row in `VALUES` order. So the batch call in Step 7 is not
   merely an optimisation over four singles: it is what makes the four bubbles' order a database
   fact instead of an application convention.
5. **Phase 1** — `nina_turns` carries `id`, `user_id`, `kind`, `trigger`, `model`,
   `prompt_version`, `input_tokens`, `output_tokens`, `tool_calls`, `latency_ms`,
   `cost_micro_usd`, `status`, `error_code`, `args`, `created_at`, and
   `insertNinaTurn(userId, input: NinaTurnInsert): Promise<string>` returns the id.

   **`tool_calls` is `text NOT NULL DEFAULT ''` — comma-joined tool names, `''` when none — and
   this phase won that argument.** Phase 1's column was an `integer` count; it was changed to text
   *because* ruling (b) below has an empirical exit condition ("drop `save_memory` if it never
   fires") that is only decidable if the column records **which** tools fired. A count answers a
   question nobody asked. Phase 12 writes `dropped:save_memory` into the same column.

   **`status` is not `source`.** `NinaTurnStatus` is
   `'pending' | 'ok' | 'repaired' | 'failed'` — the `'pending'` member is phase 12's, for a queued
   image job. This phase's `NinaTurnSource` (`'llm' | 'llm_repair' | 'unavailable'`) is a
   **different concept**: which mechanism produced the reply, not what became of the row. So
   `source` is **not** the `status` column under another name, and the plan does not pretend it is.
   `NinaTurnSource` stays a field on `NinaTurnResult` — the thing callers and tests read — and the
   store **translates** it once, at the one place that writes a row:
   `'llm' → status 'ok'`, `'llm_repair' → status 'repaired'`,
   `'unavailable' → status 'failed'` with `error_code: 'unavailable'`. Two vocabularies, one
   mechanical map, written down once. `kind` is `'chat'` and `trigger` is null for every turn this
   phase writes; phase 10 supplies the other values.

   **`rounds` is not a column, and this phase does not add one.** Phase 1's `nina_turns` has no
   `rounds`, and inventing one would mean this phase editing phase 1's schema and migration for a
   number nothing reads yet. `NinaTurnTrace.rounds` therefore stays in memory, where the tests
   assert it; the durable evidence of a tool round is `tool_calls`, which now records the names and
   is strictly more informative than a count. If a rounds histogram is ever wanted it is one card
   against phase 1's table, not a column smuggled in here.
6. **Phase 1** — `lib/nina/queries.ts` reads `nina_messages` through the reviewed-run rules where
   relevant and `lib/db/queries.ts` gains nothing: this phase reads runs through the existing
   `getReviewedRunsWithChildren`, `getProfile`, `getRecords`, `getBadgeAwards`, `resolveHrMax`.
7. **Phase 1** — `lib/env.ts` still exports `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`. Nina
   shares the narrative credential and the narrative model id; there is no `NINA_MODEL`.

**Provides (to later phases) — read these as fixed:**

- **Phase 4** gets `sendNinaMessage({ body }) -> { ok, userMessageId, bubbles: [{ id, body }],
  unavailable }`, the runner's row persisted before the model call, `bubbles.length <= 4`
  structurally. Honoured exactly.

  **THE DTO BOUNDARY — SETTLED. Three layers, three spellings, one mapper, and that mapper is in
  this phase.** This plan's draft argued that the column spelling `text` should win everywhere and
  that phase 4's one destructure should be edited to match. **That position is overruled, and it
  was the wrong shape of answer**: it treated a naming difference between a column and a DTO as a
  mistake, when it is the ordinary and correct consequence of having a data-access layer at all.
  The settled boundary:

  | Layer | Owner | Message field names |
  |---|---|---|
  | `lib/db/schema.ts` — the columns | phase 1 | `text`, `sent_at` (Drizzle: `ninaMessages.text`, `ninaMessages.sentAt`) |
  | `lib/nina/queries.ts` — the data-access DTO (`NinaMessageRow`, `NinaMessageInsert`) | phase 1 | **`body`, `createdAt`** |
  | `lib/nina/context.ts` — the prompt-layer input (`MessageInput`) | phase 2 | `text`, `sentAt` |

  The middle row is `body` / `createdAt` **uniformly, in every function of `queries.ts`**, and not
  by coincidence: every one of them selects through a single shared `messageColumns` projection, so
  there is no function that could disagree even if someone wanted it to. Phase 2's
  `MessageInput { text, sentAt }` is correct and does not move. Phase 4's and phase 6's `row.body`
  are correct.

  **`lib/nina/gateway.ts` — this phase's file — is the single translation point**, and it does the
  whole job in one map: `text: row.body, sentAt: row.createdAt`. That is what a gateway is for; it
  is why ruling (a) put it in a third file in the first place.

  **Neither side is to be "fixed" to match the other.** Not phase 1's DTO, not phase 2's
  `MessageInput`, not phase 4's destructure. A future reader who finds two spellings and assumes a
  bug should read this table and then read `gateway.ts`, in that order.
- **Phase 5** gets: `NinaSendPayload.memoryWrites` already validated, `NinaToolGateway`'s
  `saveMemorySlot` / `appendMemoryFact`, and the ruling below on the `send`/`save_memory`
  division. It replaces the *interpretation* (vocabulary, contradiction handling, nickname,
  distillation from the conversation); it does not need to touch the two INSERTs.
- **Phases 12 and 13** get `extendToolSet(NINA_CORE_TOOL_SET, [{ tool, handler }])` and the
  `NinaToolHandler` / `NinaToolContext` / `NinaToolAnswer` types. Adding `generate_image` or
  `set_avatar` requires **no edit to `turn.ts` or `tools.ts`** — they build their own tool set and
  pass it in `NinaTurnDeps.toolSet`.
- **Phase 12 gets `productionDeps()` as an EXPORT, and therefore does not modify `lib/nina/turn.ts`
  at all.** One keyword, added at creation rather than by a later phase reaching in. Phase 12's
  `lib/nina/actions.ts` work needs to pass its own `toolSet` while keeping every other production
  dep — client, model, gateway, store — exactly as this file defines them, and
  `{ ...productionDeps(), toolSet: withImageTool }` is the whole of it. Without the `export` the
  only alternatives are for phase 12 to reach into `turn.ts`'s body (a second writer on this
  phase's file, for one keyword) or to re-spell every dep at its own call site (a second definition
  of "production", which is exactly the drift `productionDeps` exists to prevent). So the keyword
  lands here, in this phase's commit, and phase 12's Files table loses a row.
- **Phase 6** gets `NinaTurnInput.imageDescriptions`: `glm-4.6v`'s text rides into the turn as a
  string array on the runner's message, never as an image block (invariant 5).
- **Phase 7** gets `NinaSendPayload.replyToMessageId`, validated and resolved to a real row id by
  the action before it becomes `nina_messages.reply_to_id`.
- **Phase 10** gets `runNinaTurn`, and it is already in phase 1's `GUARDED_CALLS` entry as a
  sanctioned caller from both `lib/nina/proactive.ts` and `app/api/cron/nina/route.ts`. Phase 10
  calls this seam *"the single largest adaptation point in the phase"*, so it is spelled out here
  rather than left to be discovered:

  **The shape is `runNinaTurn(userId, options: NinaTurnOptions)`.** `NinaTurnOptions` is
  `{ context, extraInstruction?, source: NinaMessageSource, runId?, runnerMessageId? }` — phase
  10's declaration, adopted verbatim. Three consequences for this phase's own code:

  1. `userId` moves out of the input object and into its own first parameter, because a proactive
     caller has a `userId` and no message at all, and burying it in an object named for the turn's
     *content* was always the wrong home for it.
  2. `extraInstruction` is the general form of what this phase drafted as `proactive` — the same
     string, appended to the user turn the same way, under a name that does not presuppose why it
     is there.
  3. `runnerMessageId` is the general form of `sourceMessageId`, and `source` /
     `runId` are the two values every row the turn persists must carry (see the next bullet).

  **`NinaTurnOptions` is the OUTER shape; `NinaTurnInput` stays the inner one, and the seam between
  them is where `history` comes from.** `runNinaTurnWith(deps, input: NinaTurnInput)` is unchanged
  — it is the testable core, it takes a `history` it does not load, and that is why the unit suite
  needs no database. `NinaTurnOptions` carries **no `history`**, deliberately: a proactive caller
  has no reason to know that the tools need a reviewed-run index. So `runNinaTurn` assembles the
  `NinaTurnInput` itself, loading the history through `deps.gateway.loadRunHistory(userId)` when
  the caller did not supply one. The chat path still passes its own, because Step 7 already has it
  in flight inside a `Promise.all` alongside `loadNinaContext` and re-loading it would undo exactly
  the concurrency that makes the duplicate read free.

  **A proactive turn must tolerate a conversation whose last message is Nina's own.** Nothing in
  the loop may assume a trailing runner message: `runnerText` is already nullable and
  `userTurnText` already handles the null, but the *invariant* is stated here so no later phase
  adds a "the last row is his" shortcut. She is allowed to speak twice in a row; that is what a
  proactive trigger IS.

  **And it must persist its rows with the `source` and `runId` it was handed**, not with `'chat'`
  and null. `source` is phase 1's `NinaMessageSource` column domain and `run_id` is how phase 10's
  R8 idempotence marker (`source='run_committed' AND run_id=<this run>`) becomes a single indexed
  read instead of a join against `nina_turns.trigger`. A turn that dropped either would be
  correct-looking and would silently double-post on the next cron tick.

  **`NinaTurnOptions.runId` and `NinaTurnInput.attachedRunId` (phase 8) are DIFFERENT FIELDS and
  both exist.** `runId` is *bookkeeping*: it is written to `nina_messages.run_id` on every row this
  turn persists. `attachedRunId` is *content*: it is resolved through `buildNinaRunFact` and
  rendered into the prompt so she can talk about the run. For a chat attachment they happen to
  carry the same id; for phase 10's `run_committed` turn they need not — the rows are stamped with
  the run while the prompt may be carrying a pattern instead. Collapsing them into one field would
  make one of those two turns impossible to express.

**Leaves alone (owned by others):**
`lib/nina/persona.ts`, `context.ts`, `load.ts`, `prompts/*` (Phase 2) · `lib/nina/queries.ts`,
`lib/db/schema.ts`, `lib/db/queries.ts`, `lib/env.ts`, `lib/llm/facts.ts`, **all of**
`scripts/check-llm-payload-boundary.mjs` (Phase 1) · `lib/nina/memory.ts` (Phase 5) ·
`lib/nina/vision.ts` (Phase 6) · `lib/nina/reply.ts` (Phase 7) · `lib/nina/scroll.ts` (Phase 8) ·
`lib/nina/patterns.ts`, `nags.ts` (Phase 9) · `lib/nina/proactive.ts` (Phase 10) ·
`lib/nina/imagegen.ts`, `app/api/nina/*` (Phase 12) · `lib/nina/reveal.ts`, `chatview.ts`,
everything under `components/` and `app/` (Phase 4) · `lib/llm/*`, `lib/format.ts`,
`lib/metrics/*`, `lib/flags/copy.ts`, `lib/date/ranges.ts`, `lib/records/*`, `lib/badges/*` —
**read and reused unchanged.**

## The two converged shapes, printed whole

Two of this phase's exports are widened by four later phases each. Both are printed here in their
**final** form — not because this phase ships all of it, but because a head that four phases each
rewrite is four merge conflicts and four chances to drop a field, and phases 7 and 8 both asked in
their own plans for exactly this: **ONE combined object, agreed up front.**

### The final `sendNinaMessage` signature

```ts
// lib/nina/actions.ts — phase 3 creates it; 6, 7, 8 and 13 each add exactly one optional field.
export async function sendNinaMessage(input: {
  body: string
  /** phase 6 — signed describe tickets for images already in Blob. */
  imageTickets?: readonly string[]
  /** phase 7 — a `nina_messages.id` this message answers. */
  replyToMessageId?: string | null
  /** phase 8 — a run pinned to this message. */
  runId?: string | null
  /** phase 13 — a blob the server already owns (R26). */
  attachExisting?: { kind: 'avatar' | 'image'; id: string } | null
}): Promise<SendNinaMessageResult>
```

### The final refusal rule

An empty `body` is refused **unless the message carries something else**. That is the whole rule,
and it is monotone: each phase adds one clause, never edits an existing one.

```ts
const hasAttachment =
  (input.imageTickets?.length ?? 0) > 0 ||        // phase 6
  input.runId != null ||                           // phase 8
  input.attachExisting != null                     // phase 13
if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
```

**At THIS phase's landing, only `body` exists**, so the rule degenerates to exactly what Step 7
ships: `body.trim() === ''` refuses, full stop. `hasAttachment` has no terms yet and is therefore
not written yet — a `false` constant with three commented-out clauses is worse than nothing. Each
of 6, 8 and 13 adds its own field, its own clause and its own test **in its own commit**, so the
tree is green at every phase boundary (RU-11) and no phase inherits a half-written head. Phase 7's
field takes no clause: a reply to a message is not a substitute for saying something.

`SentBubble` gains `replyToId: string | null`, **owned by phase 7**, which already edits this file
— so her own quote renders on the optimistic reveal rather than only on the next server render.
Phase 7's question about whether that lands here or as a follow-up card is answered: phase 7.

### The final `NinaTurnInput`

```ts
// lib/nina/turn.ts — phase 3 creates it; 6, 7 and 8 each add one optional field.
export interface NinaTurnInput {
  /* phase 3's base fields, unchanged — see Step 6 */
  imageDescriptions?: readonly string[]          // phase 6 — glm-4.6v's TEXT, never an image block
  quoted?: QuotedMessageInput | null             // phase 7
  attachedRunId?: string | null                  // phase 8
}
```

**`avatar` is NOT on `NinaTurnInput`.** Phase 13 puts it on **`NinaContext`** (and
`BuildNinaContextInput`), which is right and stays there: what she looks like is a standing fact
about her, not an input to one turn, and `NinaContext` is already the boundary that answers "every
fact you are allowed to state is in here".

**`NinaTurnOptions.runId` (phase 10) and `NinaTurnInput.attachedRunId` (phase 8) are different
fields and both exist** — see the phase 10 bullet in *Provides* for the full argument. In one line:
`runId` is written to `nina_messages.run_id` on every row the turn persists; `attachedRunId` is
resolved through `buildNinaRunFact` and rendered into the prompt.

## Rulings this phase makes

Phase 2 left four open items and named them. Answered here, in order.

### (a) The concrete `dbNinaSourceGateway` — implemented, in `lib/nina/gateway.ts`

Not in `load.ts` (phase 2 owns that file) and not in `queries.ts` (phase 1 owns that one). A third
file, in the exact shape of `lib/records/gateway.ts`: `import 'server-only'`, the only file in
`lib/nina` that both talks to the database and knows the interface, **and it contains no
arithmetic whatsoever.** Step 5.

### (b) `send.memoryWrites` versus the `save_memory` tool — BOTH SHIP, with a rule and an exit

Phase 2 called its division "a reading, not a ruling". The ruling:

> **`send.memoryWrites` is the default and carries every fact she picks up in passing.
> `save_memory` exists for the one case `memoryWrites` structurally cannot serve: a fact she needs
> written *before* she speaks, so the reply can refer to the write as done.** A correction is that
> case — "gw pindah ke Bandung" changes a standing slot that her very next sentence leans on, and
> a `memoryWrites` entry is applied *after* the reply is composed, so the reply would be composed
> against the stale slot.

Both write through the same two gateway methods, so there is one write path and no chance of two
divergent implementations of "upsert a slot". The tool additionally returns a `tool_result`
confirming the write, which is the whole reason it can be referred to in the same turn.

**The exit condition is empirical, not aesthetic.** `nina_turns.tool_calls` records which fired —
and this is why phase 1's column is `text NOT NULL DEFAULT ''` holding comma-joined **names**
rather than the `integer` count it was originally drafted as. The exit condition below is not
decidable from a count; it needed to know *which*, so the column became text. That change is
phase 1's, already made, and it is the reason this ruling has a falsifiable exit at all.
If `save_memory` has not appeared in that column after a week of real use, phase 2's handoff
applies literally: drop the tool, keep the array. That is a one-line deletion from
`NINA_CORE_TOOL_SET`, which is why the tool set is a value and not a hardcoded array literal in
`turn.ts`.

**What phase 3 does NOT own here:** the `slotKey` vocabulary, contradiction handling, the nickname
derivation, and any distillation pass over a finished turn. Phase 3's sink accepts any non-empty
`slotKey` and upserts it verbatim; phase 5 introduces the vocabulary and the validation. So a
`slotKey` she invents in week one becomes a row phase 5 later has to reconcile — accepted
deliberately, because refusing an unknown key before the vocabulary exists would mean refusing
every key.

### (c) `compare_runs` on a two-a-days date — an explicit question, never a pick

`two_a_days` is a real badge, so a date can name two runs. The dispatch answers
`{ kind: 'ambiguous', dateISO, runs: [{ runId, startedAt, distance, duration }, …] }` and the
`send`-facing text of the tool result says *"there were two runs on that day; ask him which one"*.
Picking the longer one silently is the failure this ruling exists to prevent: she would then talk
confidently about a run he did not mean, and nothing in the transcript would ever reveal it.
`lookup_runs` on the same date returns **both**, because a list is a truthful answer to "what did
I do that day" — only a *comparison* needs a single run per side.

### (d) The `lookup_runs` answer shape — splits live there

Phase 2's `NinaRunFact` carries no splits by design, and adding them to the 20-run context window
would put ~200 rows of split table in front of every single turn. So `lookup_runs` returns
`NinaRunFact` **plus** a `splits` array, a `fastestKm` / `slowestKm` pair and the zone
distribution — every field spelled through `lib/format.ts`, none of it recomputed here. That is
the whole reason the tool exists: it is the expensive detail RU-4 says a tool is for.

### (e) Thinking is DISABLED for Nina, and this is a decision

`docs/plans/F31-narrate-thinking-disabled.md` (commit `2255565`) disabled `thinking` on the
narrative call after measuring 18–73 s runs that spent the entire `max_tokens` ceiling on a
`thinking` block and produced **no `tool_use` block at all**. Nina inherits that verdict, for
three reasons and not by copy-paste:

1. **The same failure mode applies verbatim, and worse.** Nina's entire output is a `tool_use`
   block (`OUTPUT_RULE`: never prose outside a tool call). A turn whose ceiling is eaten by
   thinking produces no `send` block, which this loop reads as a malformed reply — so it spends
   the repair budget reproducing the identical failure, and *then* degrades. One insight that
   fails to generate is a card without prose; one chat turn that fails is a friend who did not
   answer.
2. **The budget does not exist.** This loop makes two model calls in the ordinary path and three
   in the repair path. At the measured 13–16 s per call that is already 32–48 s of a 60 s
   platform ceiling. `thinking` measured at 18–73 s *per call*. There is no ceiling at which two
   thinking calls fit.
3. **Persona.** R1 asks for someone who passes for human in a chat window. A friend does not
   deliberate for forty seconds before saying "lari lo kenapa lambat amat". Fast and wrong-ish is
   in character here in a way it never was for a coaching narrative.

`thinking: { type: 'disabled' }` therefore goes on **every** body this file builds — primary, tool
continuation, and repair — and `lib/nina/turn.test.ts` asserts it on all three, the way
`tests/llm.narrate.test.ts` and `vision.test.ts` guard theirs. **Never remove it.**

#### The correction that measurement forced — the flag is NOT load-bearing on a tool call

This ruling's draft claimed the flag is load-bearing on all three body shapes and that removing it
"produces no reply at all, twice per turn". **That claim is inherited from F31 and is wrong for
this endpoint's tool path**, and the plan says so rather than quietly keeping a false reason for a
correct decision. The direct probe of `api.z.ai/api/anthropic` against `glm-5.3` recorded in the
plan index's *Verified live, 2026-09-03* section sent `thinking: { type: 'disabled' }` **and the
round-1 response still contained a `thinking` block.** (Round 2 contained none.) F31 measured a
*text* completion; a tool call on this endpoint behaves differently, and the flag is a request, not
a guarantee.

**Neither consequence is "delete the flag."** Two things change instead:

1. **Keep sending it.** It is harmless, it is what F31 actually measured for the narrative path
   this repo shares a client with, and the day z.ai starts honouring it on tool calls we want to
   already be asking. The assertion in `turn.test.ts` stays. **Never remove it** — that sentence
   survives verbatim.
2. **Stop doing arithmetic against it.** Two specific places had quietly assumed a `thinking`
   block cannot arrive:
   - **`NINA_MAX_TOKENS` must leave room for one.** Sizing the ceiling to the payload alone was
     sizing it to a response shape the endpoint does not promise. See its own note in Step 6.
   - **The loop must scan `content[]` for the `tool_use` block, never read `content[0]`.** This is
     the load-bearing half. A parser that read `content[0]` would have failed on round 1 of that
     very probe — a `thinking` block in slot 0 and the `tool_use` behind it — and the failure would
     have looked exactly like a malformed reply, so it would have burned the repair budget
     reproducing itself and then degraded. `findSendBlock` and `findToolUses` already iterate, and
     that is now a **requirement with a measurement behind it** rather than defensive style;
     `turn.test.ts` pins it with a fixture whose first content block is `thinking`.

What survives of the original argument is the part the measurement did not touch: the budget (two
thinking calls do not fit under 45 s at any ceiling) and the persona (a friend does not deliberate
for forty seconds). Those are still why the flag goes on every body.

### (f) The loop uses real `tool_result` blocks; the repair does not

`lib/llm/narrate.ts` deliberately shapes its repair as `user → assistant(text) → user` rather than
a `tool_use`/`tool_result` pair, because `api.z.ai/api/anthropic` is Anthropic-*compatible* and
F04 had already settled on the plain three-turn form against the sibling endpoint.

An agentic loop has no such option: an assistant turn containing `tool_use` **must** be followed
by a user turn containing matching `tool_result` blocks, and there is no text-shaped substitute.
So this phase splits the difference deliberately:

- **The tool round trip uses the protocol-correct `tool_use` / `tool_result` pair.** Unavoidable,
  and it *was* the one genuinely unproven thing in this phase. **It has since been proven by direct
  measurement** — see the *Decisions on the open items* section, items 1 and 2.
  `tests/live/nina.live.test.ts` therefore changes job: it is no longer the experiment that decides
  whether this architecture is possible, it is the **regression guard** that re-runs against any
  endpoint or model change.
- **The repair keeps narrate's three-turn text shape**, built from a *fresh* message array — the
  turn's messages as they stood before the failing assistant turn, then `assistant(<the malformed
  JSON>)`, then `user(NINA_REPAIR_PREAMBLE + issues)`. Protocol-valid whether or not a tool round
  happened, and it reuses the one repair idiom this repo has measured.

### (g) A malformed *tool argument* is a `tool_result`, not a repair

`lookup_runs` with `dates: ['besok']` does not consume the repair budget. It gets a `tool_result`
whose content names the problem — the natural, protocol-shaped way to tell a model its call was
wrong, costing one already-budgeted round instead of a second one. **The repair budget is spent on
exactly one thing: a malformed `send` payload.** That is what "exactly ONE repair then degrades"
means in this file.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/dates.ts` | create | R15 — ISO validation, calendar validation, and the explicit-absence answer |
| `lib/nina/schema.ts` | create | Zod over `SEND_TOOL`'s payload and all three tool argument shapes |
| `lib/nina/tools.ts` | create | the dispatch table phases 12/13 extend, and the precomputed deltas |
| `lib/nina/gateway.ts` | create | `dbNinaSourceGateway`, `dbNinaToolGateway`, `dbNinaTurnStore` — the only DB file here |
| `lib/nina/turn.ts` | create | the budgeted agentic loop; nothing throws for an LLM problem |
| `lib/nina/actions.ts` | create | `'use server'` — the one entry point phase 4 calls |
| `lib/nina/dates.test.ts` | create | the two user-supplied date cases, plus `2026-02-30` and a future date |
| `lib/nina/schema.test.ts` | create | 5 bubbles rejected, 0 rejected, `describeNinaIssues` naming the field |
| `lib/nina/tools.test.ts` | create | deltas precomputed, absence explicit, two-a-days ambiguous |
| `lib/nina/turn.test.ts` | create | fake client through a tool round; exactly one repair; deadline gate; thinking disabled |
| `tests/fixtures/ninaTurn.ts` | create | the fake client, the fake gateways, the malformed bodies |
| `tests/live/nina.live.test.ts` | create | the `tool_result` protocol against the real endpoint. Opt-in only |
| `package.json` | modify | one script, `test:live:nina`, beside `test:live:narrate` (line 45) |

**Thirteen files: twelve created, one modified.** `scripts/check-llm-payload-boundary.mjs` was a
fourteenth row in this plan's draft and **is not in this table** — phase 1 owns that file and ships
the complete `GUARDED_CALLS` table, `runNinaTurn` and its four sanctioned callers included. This
phase's only remaining obligation to the guard is to name its entry point `runNinaTurn`, because
that literal string is what the table greps for. See Step 8.

---

## Implementation Steps

### Step 1: `lib/nina/dates.ts` — R15, and the absence that gets said out loud

**File:** `lib/nina/dates.ts` (new)
**Change:** The whole file. Pure — no I/O, no client, no `server-only` — so
`lib/nina/dates.test.ts` drives it with a hand-built index and no database.

Two findings drove the shape:

1. **`isValidDateISO` in `lib/date/ranges.ts` is a shape check, not a calendar check.** Its regex
   is `^\d{4}-\d{2}-\d{2}$`, so `'2026-13-45'` and `'2026-02-30'` both pass it. That is correct for
   its callers — they read values that came out of a Postgres `date` column — but Nina is a
   *generator* of these strings, and RU-13 makes her the only source of them. So this module adds
   a real calendar check on top rather than widening `ranges.ts`, which phase 2 leaves alone.
2. **An empty answer and an absent run are different facts.** `{ runs: [] }` is something a model
   can read as "nothing worth mentioning" and skip. `{ kind: 'no_run', … }` with a day label and a
   weekday is something she has to say out loud, and the tool-result text says so.

**Code:**

```ts
/**
 * R15 — the date half. **She emits ISO strings (RU-13) and this module is what checks them.**
 *
 * ── WHY NINA RESOLVES THE INDONESIAN AND THIS FILE DOES NOT ──────────────────────────────────
 * "coba compare run gw tanggal 3 vs 1 bulan ini" and "lari gw kemaren gimana" are resolved by the
 * MODEL, not here, because `NinaContext.now` already puts `todayISO`, `weekday`, `weekdayId`,
 * `clock` and `isoWeek` in front of her on every turn. Writing a second Indonesian date parser
 * server-side would mean two things that can disagree about what "kemaren" means, and the one
 * without the clock in its context would be the one that is wrong.
 *
 * What this file owns is the half a model cannot be trusted with: that the string is a real day,
 * that it is not in the future, and that "there is no run on that day" is an ANSWER rather than an
 * empty collection. `lib/nina/dates.test.ts` pins the user's own two cases against today =
 * 2026-09-03, so a prompt edit that breaks them fails a test instead of a conversation.
 *
 * ── NOTHING HERE FORMATS A NUMBER ─────────────────────────────────────────────────────────────
 * Invariant 3: every string a run contributes comes from `buildNinaRunFact`, which is phase 2's
 * one spelling authority and already routes through `lib/format.ts`. This file adds day labels
 * and day counts and nothing else.
 */
import { daysBetween, isValidDateISO, type DateISO } from '@/lib/date/ranges'
import { formatDay } from '@/lib/format'
import {
  buildNinaRunFact,
  WEEKDAY_EN,
  WEEKDAY_ID,
  type NinaRunFact,
  type NinaRunInput,
} from './context'

/** Matches `LOOKUP_RUNS_TOOL.input_schema.properties.dates.maxItems`. Kept in sync by hand. */
export const MAX_LOOKUP_DATES = 5

export interface DateInvalid {
  kind: 'invalid'
  /** Echoed back verbatim so the tool result can name what she actually sent. */
  input: string
  /** One plain clause, addressed to her: "not a real calendar day". */
  reason: string
}

export interface DateFuture {
  kind: 'future'
  dateISO: DateISO
  dayLabel: string
  /** Always >= 1. */
  daysAhead: number
}

export interface DateAbsence {
  kind: 'no_run'
  dateISO: DateISO
  /** `'Tue, 1 Sep 2026'` — `formatDay`, the spelling every screen uses. */
  dayLabel: string
  weekday: (typeof WEEKDAY_EN)[number]
  weekdayId: (typeof WEEKDAY_ID)[number]
  /** Whole days from that day to today. 0 means today. Always >= 0. */
  daysAgo: number
}

export interface DateHit {
  kind: 'runs'
  dateISO: DateISO
  dayLabel: string
  weekday: (typeof WEEKDAY_EN)[number]
  weekdayId: (typeof WEEKDAY_ID)[number]
  daysAgo: number
  /**
   * One entry per run that day, earliest start first. **Two entries is a real state** — the
   * `two_a_days` badge exists — and `lookup_runs` returns both. Only `compare_runs` narrows it,
   * via `ambiguousFrom`.
   */
  runs: NinaRunFact[]
}

export type DateResolution = DateInvalid | DateFuture | DateAbsence | DateHit

/** What `compare_runs` answers with when one side of the comparison names two runs. */
export interface DateAmbiguous {
  kind: 'ambiguous'
  dateISO: DateISO
  dayLabel: string
  /** Enough to ask the question, and no more. She asks; she does not guess. */
  runs: Array<{ runId: string; startedAt: string | null; distance: string; duration: string }>
}

/** `occurred_on` -> that day's runs, earliest start first. Built once per turn. */
export type RunsByDate = Map<DateISO, NinaRunInput[]>

/**
 * A real calendar day, not just four-two-two digits.
 *
 * `new Date('2026-02-30T00:00:00Z')` does not throw — it rolls forward to 2 March — so the check
 * is a round trip: parse, re-render, compare. `'2026-13-45'` fails the shape test first;
 * `'2026-02-30'` fails only here, and it is the one Nina can actually produce by counting
 * backwards off the end of a month.
 */
export function isRealCalendarDate(value: unknown): value is DateISO {
  if (!isValidDateISO(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

/** `null` rather than a throw: every caller here is answering a model, not a programmer. */
export function parseCalendarDate(value: unknown): DateISO | null {
  return isRealCalendarDate(value) ? value : null
}

/**
 * Mon=0 .. Sun=6, matching the order of `WEEKDAY_EN` / `WEEKDAY_ID`.
 *
 * Three lines of UTC arithmetic over a string, identical to the opening of `isoWeekKeyOf`. Not
 * imported from phase 2 on purpose: asking that phase for a second export to save three
 * deterministic lines is a worse trade than the duplication, and `dates.test.ts` pins Monday and
 * Sunday so a drift fails loudly.
 */
function weekdayIndex(dateISO: DateISO): number {
  const d = new Date(`${dateISO}T00:00:00Z`)
  return (d.getUTCDay() + 6) % 7
}

/**
 * Group the reviewed history by day. Within a day, earliest `started_at` first; a run with no
 * `started_at` (the screenshot had no clock) sorts last, because an unknown time cannot be
 * asserted to be the morning one.
 */
export function indexRunsByDate(runs: readonly NinaRunInput[]): RunsByDate {
  const index: RunsByDate = new Map()
  for (const run of runs) {
    const bucket = index.get(run.occurredOn)
    if (bucket) bucket.push(run)
    else index.set(run.occurredOn, [run])
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => {
      if (a.startedAt === b.startedAt) return 0
      if (a.startedAt == null) return 1
      if (b.startedAt == null) return -1
      return a.startedAt < b.startedAt ? -1 : 1
    })
  }
  return index
}

/**
 * One ISO string to one answer. **Never returns an empty success**: the four `kind`s are
 * exhaustive and each one is a sentence she can say.
 */
export function resolveDate(input: string, index: RunsByDate, todayISO: DateISO): DateResolution {
  const dateISO = parseCalendarDate(input)
  if (dateISO == null) {
    return {
      kind: 'invalid',
      input,
      reason: 'not a real calendar day in YYYY-MM-DD form',
    }
  }

  const daysAgo = daysBetween(dateISO, todayISO)
  if (daysAgo < 0) {
    return { kind: 'future', dateISO, dayLabel: formatDay(dateISO), daysAhead: -daysAgo }
  }

  const dow = weekdayIndex(dateISO)
  const common = {
    dateISO,
    dayLabel: formatDay(dateISO),
    weekday: WEEKDAY_EN[dow]!,
    weekdayId: WEEKDAY_ID[dow]!,
    daysAgo,
  }

  const found = index.get(dateISO)
  if (found == null || found.length === 0) return { kind: 'no_run', ...common }

  return { kind: 'runs', ...common, runs: found.map((run) => buildNinaRunFact(run, todayISO)) }
}

/**
 * The array form, with the cap and the de-duplication applied here rather than trusted to the
 * schema. `maxItems: 5` in a tool schema is a request — the same endpoint returned HTTP 200 for a
 * call that omitted a `required` field from every array entry — so the cap that holds is this one.
 * Duplicates collapse because "compare 3 Sep with 3 Sep" should cost one lookup, not two.
 */
export function resolveDates(
  inputs: readonly string[],
  index: RunsByDate,
  todayISO: DateISO,
): DateResolution[] {
  const seen = new Set<string>()
  const out: DateResolution[] = []
  for (const input of inputs) {
    if (out.length >= MAX_LOOKUP_DATES) break
    if (seen.has(input)) continue
    seen.add(input)
    out.push(resolveDate(input, index, todayISO))
  }
  return out
}

/**
 * A `DateHit` with more than one run, narrowed to the question she must ask. Ruling (c): the app
 * never picks. Picking the longer run silently would have her talk confidently about a run he did
 * not mean, and nothing in the transcript would ever show it happened.
 */
export function ambiguousFrom(hit: DateHit): DateAmbiguous {
  return {
    kind: 'ambiguous',
    dateISO: hit.dateISO,
    dayLabel: hit.dayLabel,
    runs: hit.runs.map((run) => ({
      runId: run.runId,
      startedAt: run.startedAt,
      distance: run.distance,
      duration: run.duration,
    })),
  }
}
```

**Impact:** New pure module. Imports `buildNinaRunFact` — the one export this phase asks phase 2
to add (contract item 1). If the reconciler cannot get that export, this file cannot spell a run
and the fallback is worse: a second formatter in `lib/nina`.

---

### Step 2: `lib/nina/schema.ts` — what actually checks the model

**File:** `lib/nina/schema.ts` (new)
**Change:** The whole file. Pure, in the shape of `lib/llm/schema.ts`, and it is the only thing in
this feature that enforces anything about the model's output.

**Code:**

```ts
import { z } from 'zod'

/**
 * The output contract for `SEND_TOOL`, and the argument contracts for all three tools.
 *
 * ── WHY A TOOL SCHEMA IS NOT ENOUGH ───────────────────────────────────────────────────────────
 * MEASURED (`research/results-narrative.json`, still committed with the defect intact): this same
 * z.ai endpoint returned HTTP 200 for a forced tool call whose array entries were **all missing a
 * `required` field**. The endpoint does not enforce a tool schema; `required` and `maxItems` in
 * `lib/nina/prompts/tools.ts` are prompt text that happens to be shaped like a schema. Everything
 * load-bearing is here.
 *
 * ── THE OBJECTS STRIP, THEY DO NOT REJECT ─────────────────────────────────────────────────────
 * `z.object` (strip) rather than `z.strictObject` throughout. An extra key the model invents is
 * harmless — nothing downstream reads it — and rejecting it would spend a ~16 s repair round trip
 * to delete a field. The caps and the required fields are what a repair is worth.
 */

/** RU-5's cap, and phase 4's `REVEAL_MAX_BUBBLES`. Five is a monologue. */
export const MAX_BUBBLES = 4

/**
 * One bubble's ceiling, in characters.
 *
 * Not arbitrary: RU-5's staggered reveal only reads as someone typing if a bubble is the length of
 * a chat message. Phase 4's reveal timing is per-character with a ceiling, so a 2000-character
 * bubble either flashes in instantly (dishonest) or stalls the whole turn behind one typing
 * indicator. 700 characters is roughly 110 words — long for a chat message, short of an essay.
 */
export const MAX_BUBBLE_CHARS = 700

/** `SEND_TOOL`'s `maxItems`, enforced. Six facts from one turn is already a lot of revelation. */
export const MAX_MEMORY_WRITES = 6

/**
 * The runner's own message cap, checked in `lib/nina/actions.ts` before anything is persisted.
 * Server Actions are capped at a 1 MB body by the framework; this is the app's own smaller,
 * earlier limit so a paste of a whole article fails at the boundary instead of inside a prompt.
 */
export const MAX_RUNNER_MESSAGE_CHARS = 4000

export const NinaMemoryWriteSchema = z.object({
  kind: z.enum(['slot', 'fact']),
  /**
   * Phase 5 owns the vocabulary (ruling b). Until it lands, any non-empty key is accepted and
   * upserted verbatim — refusing unknown keys before a vocabulary exists would refuse every key.
   */
  slotKey: z.string().trim().min(1).max(60).optional(),
  text: z.string().trim().min(1).max(400),
})

export type NinaMemoryWrite = z.infer<typeof NinaMemoryWriteSchema>

/**
 * **The reply.** RU-5: 1–4 bubbles, each of which becomes its own `nina_messages` row so phase 7
 * can quote any one of them independently.
 *
 * The cap is `.max(MAX_BUBBLES)` and NOT a `.slice(0, 4)`, and that is the interesting choice.
 * Truncating five bubbles to four ships a reply that stops mid-thought and looks like a bug in the
 * client; failing validation spends one repair telling her the real constraint, and if she does it
 * twice the turn degrades honestly. It also means phase 4's "already clamped to <= 4" is
 * guaranteed by the TYPE rather than by a call this phase promises to remember to make.
 */
export const NinaSendPayloadSchema = z.object({
  bubbles: z
    .array(z.string().trim().min(1).max(MAX_BUBBLE_CHARS))
    .min(1)
    .max(MAX_BUBBLES),
  /**
   * Phase 7's field. Validated for shape here; the ACTION checks it names a real row this user
   * owns, because a message id is the one thing in this payload that refers to the database.
   */
  replyToMessageId: z.string().trim().min(1).max(64).optional(),
  memoryWrites: z.array(NinaMemoryWriteSchema).max(MAX_MEMORY_WRITES).optional(),
})

export type NinaSendPayload = z.infer<typeof NinaSendPayloadSchema>

/**
 * Tool arguments. Deliberately loose about the date STRINGS — `z.string()`, not a regex — because
 * `lib/nina/dates.ts` produces a better answer for a bad date than a validation error does: an
 * explicit `{ kind: 'invalid', input, reason }` she can read and retry, inside the same budgeted
 * round. A Zod regex here would turn that into a dispatch failure with nothing to say.
 */
export const LookupRunsArgsSchema = z.object({
  dates: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
})

export const CompareRunsArgsSchema = z.object({
  dateA: z.string().trim().min(1).max(32),
  dateB: z.string().trim().min(1).max(32),
})

export const SaveMemoryArgsSchema = NinaMemoryWriteSchema

export type LookupRunsArgs = z.infer<typeof LookupRunsArgsSchema>
export type CompareRunsArgs = z.infer<typeof CompareRunsArgsSchema>
export type SaveMemoryArgs = z.infer<typeof SaveMemoryArgsSchema>

/**
 * The issue list that goes into the repair turn. Byte-for-byte the same helper as
 * `describeInsightIssues` in `lib/llm/schema.ts`, and not imported from there: that module reaches
 * `@/lib/metrics/hrMax` for `HrMaxSource` and is F07's file. Twelve lines duplicated beats a
 * cross-feature import for a string formatter.
 *
 * MEASURED, F07: naming the failing FIELD is what makes the repair land. A generic "your JSON was
 * invalid" measured 1/4; a per-field issue list measured 5/6.
 */
export function describeNinaIssues(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(error)
  return issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
```

**Impact:** New pure module. `zod` is already a dependency at `4.4.3`. No `server-only`, so
`lib/nina/schema.test.ts` imports it directly.

---

### Step 3: `lib/nina/tools.ts` (part 1 of 2) — the dispatch table phases 12 and 13 extend

**File:** `lib/nina/tools.ts` (new)
**Change:** The types, the gateway seam, the tool set, the additive extension point, and two of
the three handlers. `compare_runs` and its deltas are Step 4, in the same file, appended below.

**Code (top of file):**

```ts
/**
 * **Tool DISPATCH.** The schemas are phase 2's (`lib/nina/prompts/tools.ts`); what a call MEANS is
 * here. No `server-only` and no database import: every read arrives through `NinaToolGateway`, so
 * `lib/nina/tools.test.ts` drives all three handlers against a hand-written fake and no connection
 * — the `RecordsGateway` idiom, and the same reason phase 2 gave for `NinaSourceGateway`.
 *
 * ── INVARIANT 2, AT THE ONE PLACE IT WOULD OTHERWISE BREAK ────────────────────────────────────
 * `compare_runs` returns DIFFERENCES, already worked out, spelled through `lib/format.ts`. It
 * never returns two run objects and an instruction to subtract. The measurement behind the rule is
 * in the analysis: a flipped sign on aerobic decoupling, which a model restated confidently. Two
 * numbers and a minus sign is the same bet with more steps.
 *
 * ── HOW PHASES 12 AND 13 ADD A TOOL WITHOUT TOUCHING THIS FILE ────────────────────────────────
 * `NINA_CORE_TOOL_SET` is a VALUE, and `runNinaTurn` takes a tool set in its deps. Phase 12 writes
 *
 *     const toolSet = extendToolSet(NINA_CORE_TOOL_SET, [
 *       { tool: GENERATE_IMAGE_TOOL, handler: handleGenerateImage },
 *     ])
 *
 * in `lib/nina/imagegen.ts` and passes it through. No edit here, no edit to `turn.ts`, and this
 * phase stays revertable on its own. It is also what makes ruling (b)'s empirical exit cheap: if
 * `save_memory` never fires, it leaves `NINA_CORE_TOOL_SET` in one line.
 */
import { formatBpm, formatCadence, formatDuration, formatPace, formatPercent } from '@/lib/format'
import type { DateISO } from '@/lib/date/ranges'
import type { SplitRow, ZonePctRow } from '@/lib/metrics'
import type Anthropic from '@anthropic-ai/sdk'

import type { NinaRunFact, NinaRunInput } from './context'
import {
  ambiguousFrom,
  indexRunsByDate,
  resolveDate,
  resolveDates,
  type DateAmbiguous,
  type DateResolution,
  type RunsByDate,
} from './dates'
import {
  COMPARE_RUNS_TOOL,
  LOOKUP_RUNS_TOOL,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
} from './prompts'
import {
  CompareRunsArgsSchema,
  LookupRunsArgsSchema,
  SaveMemoryArgsSchema,
  describeNinaIssues,
} from './schema'

/* ============================================================================
 * The reads a tool needs
 * ==========================================================================*/

/**
 * `NinaRunInput` plus its split rows. Phase 2 leaves splits off `NinaRunFact` on purpose — 20 runs
 * of split table in front of every turn is ~200 rows of noise — and ruling (d) puts them here,
 * which is the point of a tool under RU-4: the expensive detail, fetched when she asks for it.
 */
export interface NinaDetailedRunInput extends NinaRunInput {
  splits: readonly SplitRow[]
}

/**
 * Built ONCE per turn, before the first model call, and reused by every tool round. Building it
 * lazily inside a handler would put a database round trip inside the model's latency budget, and
 * `getReviewedRunsWithChildren` is one `db.batch` for the whole history anyway — the same premise
 * `lib/insights/load.ts`, `recomputeRecords` and phase 2's `load.ts` all rest on (~200 runs a
 * year, one user). All four need the same rethink together if it ever stops holding.
 */
export interface NinaRunHistory {
  /** The whole reviewed history, oldest first, as `getReviewedRunsWithChildren` returns it. */
  runs: readonly NinaDetailedRunInput[]
  /** `occurred_on` -> that day's runs. `indexRunsByDate(runs)`. */
  index: RunsByDate
  /** `runId` -> its split rows, so a hit can be enriched without a second scan. */
  splitsByRunId: ReadonlyMap<string, readonly SplitRow[]>
  /** `runId` -> F06's zone shares, copied from `metrics.zonePct`. Never recomputed here. */
  zonesByRunId: ReadonlyMap<string, readonly ZonePctRow[]>
}

export interface NinaToolGateway {
  /** One `db.batch`, every reviewed run with children, metrics and flags already computed. */
  loadRunHistory(userId: string): Promise<NinaRunHistory>
  /**
   * Ruling (b): the ONE write path for a standing fact. `save_memory` and
   * `send.memoryWrites` both land here, so there is no second implementation of "upsert a slot".
   * Phase 5 owns the vocabulary; this method owns the row.
   */
  saveMemorySlot(userId: string, row: { key: string; value: string }): Promise<void>
  /** The append-only ledger (RU-6). `sourceMessageId` is the runner message this turn answers. */
  appendMemoryFact(
    userId: string,
    row: { text: string; sourceMessageId: string | null },
  ): Promise<void>
}

/* ============================================================================
 * The dispatch table
 * ==========================================================================*/

export interface NinaToolContext {
  userId: string
  /** `NinaContext.now.todayISO`. The origin of every gap this file reports. */
  todayISO: DateISO
  history: NinaRunHistory
  gateway: NinaToolGateway
  /**
   * The runner message this turn is answering, for `nina_memory_facts.source_message_id` (RU-6).
   * Null on a proactive turn (phase 10), where she started the conversation.
   */
  sourceMessageId: string | null
}

/**
 * What a tool call becomes. `answer` is JSON-serialised straight into a `tool_result` block.
 *
 * `isError` is `true` for "you asked for something I cannot answer" — a bad date, an ambiguous
 * comparison, arguments that failed Zod. It is **still a `tool_result`**, and it deliberately does
 * NOT consume the repair budget (ruling g): telling a model its call was wrong through the
 * protocol's own channel costs one already-budgeted round, and the repair exists for exactly one
 * thing, a malformed `send`.
 */
export interface NinaToolAnswer {
  answer: unknown
  isError: boolean
}

export type NinaToolHandler = (
  args: unknown,
  ctx: NinaToolContext,
) => Promise<NinaToolAnswer>

/** Keyed by the tool's `name`. `send` is deliberately absent — it terminates the loop. */
export type NinaToolTable = Readonly<Record<string, NinaToolHandler>>

export interface NinaToolSet {
  /** Sent as `body.tools`, `send` first so it is the most available thing in the list. */
  tools: readonly Anthropic.Tool[]
  handlers: NinaToolTable
}

/**
 * The four tools phase 3 ships. `GENERATE_IMAGE_TOOL` and `SET_AVATAR_TOOL` exist in phase 2's
 * module and are **deliberately not here**: a tool she can call and this file cannot dispatch
 * would return an error she then has to apologise for, which is R22's failure mode arriving two
 * phases early.
 */
export const NINA_CORE_TOOL_SET: NinaToolSet = {
  tools: [SEND_TOOL, LOOKUP_RUNS_TOOL, COMPARE_RUNS_TOOL, SAVE_MEMORY_TOOL],
  handlers: {
    [LOOKUP_RUNS_TOOL.name]: handleLookupRuns,
    [COMPARE_RUNS_TOOL.name]: handleCompareRuns,
    [SAVE_MEMORY_TOOL.name]: handleSaveMemory,
  },
}

/**
 * Purely additive composition, and the reason phases 12 and 13 need no edit here. Returns a new
 * set; nothing is mutated, so `NINA_CORE_TOOL_SET` is safe to share across requests.
 *
 * A duplicate tool name throws — at module load, in the phase that added it, which is the only
 * time anyone can fix it. Two schemas under one name is a silent dispatch coin-flip otherwise.
 */
export function extendToolSet(
  base: NinaToolSet,
  additions: ReadonlyArray<{ tool: Anthropic.Tool; handler: NinaToolHandler }>,
): NinaToolSet {
  const handlers: Record<string, NinaToolHandler> = { ...base.handlers }
  const tools = [...base.tools]
  for (const { tool, handler } of additions) {
    if (handlers[tool.name] != null || tools.some((t) => t.name === tool.name)) {
      throw new Error(`Nina tool "${tool.name}" is already registered`)
    }
    handlers[tool.name] = handler
    tools.push(tool)
  }
  return { tools, handlers }
}

/**
 * One `tool_use` block to one `tool_result`. **Never throws** — a handler that rejects becomes an
 * `isError` answer, because a thrown exception here would take down a whole chat turn over one bad
 * tool call, and the loop's contract (like `narrate.ts`') is that nothing fails loudly for a model
 * problem.
 */
export async function dispatchNinaTool(
  name: string,
  args: unknown,
  ctx: NinaToolContext,
  table: NinaToolTable,
): Promise<NinaToolAnswer> {
  const handler = table[name]
  if (handler == null) {
    return { answer: { error: `There is no tool called "${name}".` }, isError: true }
  }
  try {
    return await handler(args, ctx)
  } catch (cause) {
    // Warn, never error: see `logLlmFailure` in narrate.ts. A tool that failed is a state of this
    // feature, and the turn continues with her told about it.
    console.warn('[nina] tool dispatch failed', { tool: name, error: String(cause) })
    return {
      answer: { error: `The "${name}" tool could not answer just now. Reply without it.` },
      isError: true,
    }
  }
}
```

**Code (continues in the same file) — `lookup_runs` and `save_memory`:**

```ts
/* ============================================================================
 * lookup_runs — ruling (d): splits live here
 * ==========================================================================*/

export interface NinaSplitFact {
  km: number
  /** `'04:32'` — `formatDuration`. */
  time: string
  /** `'4:32 /km'` — `formatPace(paceSec, true)`. */
  pace: string
  hr: string | null
  cadence: string | null
  /** True for the trailing part-kilometre. Its pace is not comparable to a full km's. */
  partial: boolean
}

export interface NinaZoneFact {
  zone: 1 | 2 | 3 | 4 | 5
  duration: string
  /** `'34%'` — `formatPercent(pct, 0)`. Copied from F06's raw float, rounded once, here. */
  share: string
}

/** Phase 2's run fact, plus the detail that only a tool call is worth paying for. */
export interface NinaLookupRunFact extends NinaRunFact {
  splits: NinaSplitFact[]
  fastestKm: { km: number; pace: string } | null
  slowestKm: { km: number; pace: string } | null
  zones: NinaZoneFact[]
}

/**
 * One day's answer. **There is no shape here that means "nothing".** `situation` restates the
 * `kind` as a clause addressed to her, so an absence cannot be read as a run with no numbers —
 * which is R15's actual requirement and the reason this tool does not simply return an array.
 */
export type LookupDay =
  | { kind: 'invalid'; input: string; situation: string }
  | { kind: 'future'; dateISO: DateISO; dayLabel: string; daysAhead: number; situation: string }
  | {
      kind: 'no_run'
      dateISO: DateISO
      dayLabel: string
      weekday: string
      weekdayId: string
      daysAgo: number
      situation: string
    }
  | {
      kind: 'runs'
      dateISO: DateISO
      dayLabel: string
      weekday: string
      weekdayId: string
      daysAgo: number
      /** Earliest start first. **Two entries is a real state** — the `two_a_days` badge. */
      runs: NinaLookupRunFact[]
      situation: string
    }

export interface LookupRunsAnswer {
  /** Repeated so the answer is self-contained if she re-reads it three turns later. */
  todayISO: DateISO
  days: LookupDay[]
}

function splitFacts(splits: readonly SplitRow[]): NinaSplitFact[] {
  return splits.map((split) => ({
    km: split.km,
    time: formatDuration(split.timeSec),
    pace: formatPace(split.paceSec, true),
    hr: split.hr == null ? null : formatBpm(split.hr),
    cadence: split.cadence == null ? null : formatCadence(split.cadence),
    partial: split.partial,
  }))
}

function zoneFacts(zones: readonly ZonePctRow[]): NinaZoneFact[] {
  return zones.map((zone) => ({
    zone: zone.zone,
    duration: formatDuration(zone.durationSec),
    share: formatPercent(zone.pct, 0),
  }))
}

/**
 * `NinaRunFact` -> `NinaLookupRunFact`. **Everything added is copied or formatted, nothing is
 * computed** — `fastestKm` and `slowestKm` come straight off F06's `SessionMetrics`, which is the
 * only thing allowed to decide which kilometre was fastest.
 */
function enrich(
  fact: NinaRunFact,
  source: NinaDetailedRunInput,
  history: NinaRunHistory,
): NinaLookupRunFact {
  const fastest = source.metrics.fastestKm
  const slowest = source.metrics.slowestKm
  return {
    ...fact,
    splits: splitFacts(history.splitsByRunId.get(fact.runId) ?? source.splits),
    fastestKm: fastest == null ? null : { km: fastest.km, pace: formatPace(fastest.paceSec, true) },
    slowestKm: slowest == null ? null : { km: slowest.km, pace: formatPace(slowest.paceSec, true) },
    zones: zoneFacts(history.zonesByRunId.get(fact.runId) ?? source.metrics.zonePct),
  }
}

function toLookupDay(resolved: DateResolution, history: NinaRunHistory): LookupDay {
  switch (resolved.kind) {
    case 'invalid':
      return {
        kind: 'invalid',
        input: resolved.input,
        situation: `"${resolved.input}" is ${resolved.reason}. Send YYYY-MM-DD worked out from todayISO.`,
      }
    case 'future':
      return {
        kind: 'future',
        dateISO: resolved.dateISO,
        dayLabel: resolved.dayLabel,
        daysAhead: resolved.daysAhead,
        situation: `${resolved.dayLabel} is ${resolved.daysAhead} day(s) in the future. It has not happened yet.`,
      }
    case 'no_run':
      return {
        kind: 'no_run',
        dateISO: resolved.dateISO,
        dayLabel: resolved.dayLabel,
        weekday: resolved.weekday,
        weekdayId: resolved.weekdayId,
        daysAgo: resolved.daysAgo,
        /* R15's whole point. This clause is why an absence gets SAID rather than skipped. */
        situation: `NO RUN on ${resolved.dayLabel} (${resolved.weekdayId}). He did not run that day. Say so.`,
      }
    case 'runs': {
      const byId = new Map(history.runs.map((run) => [run.runId, run]))
      const runs = resolved.runs.map((fact) => {
        const source = byId.get(fact.runId)
        // Unreachable: `resolved.runs` was built from this same history. Kept because the
        // alternative is a non-null assertion on a Map read.
        return source == null ? ({ ...fact, splits: [], fastestKm: null, slowestKm: null, zones: [] } as NinaLookupRunFact) : enrich(fact, source, history)
      })
      return {
        kind: 'runs',
        dateISO: resolved.dateISO,
        dayLabel: resolved.dayLabel,
        weekday: resolved.weekday,
        weekdayId: resolved.weekdayId,
        daysAgo: resolved.daysAgo,
        runs,
        situation:
          runs.length === 1
            ? `One run on ${resolved.dayLabel}.`
            : `${runs.length} runs on ${resolved.dayLabel} — a two-a-day. Both are below.`,
      }
    }
  }
}

export async function handleLookupRuns(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = LookupRunsArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: { error: 'lookup_runs needs { dates: ["YYYY-MM-DD", …] }.', issues: describeNinaIssues(parsed.error) },
      isError: true,
    }
  }

  const days = resolveDates(parsed.data.dates, ctx.history.index, ctx.todayISO).map((resolved) =>
    toLookupDay(resolved, ctx.history),
  )

  const answer: LookupRunsAnswer = { todayISO: ctx.todayISO, days }
  /*
   * `isError` stays FALSE when every date resolved to `no_run`. An absence is a correct, complete
   * answer to a well-formed question — flagging it as an error would invite her to apologise for
   * the tool instead of telling him he did not run.
   */
  return { answer, isError: days.every((day) => day.kind === 'invalid') }
}

/* ============================================================================
 * save_memory — ruling (b)'s explicit path
 * ==========================================================================*/

export interface SaveMemoryAnswer {
  saved: true
  kind: 'slot' | 'fact'
  /** Echoed so her reply can quote the write, which is the only reason this tool exists. */
  text: string
  slotKey?: string
}

/**
 * The write that has to land BEFORE she speaks — ruling (b). A `send.memoryWrites` entry is
 * applied after the reply is composed, so a reply that leans on a corrected slot would be composed
 * against the stale one. This tool exists for that ordering and nothing else.
 */
export async function handleSaveMemory(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = SaveMemoryArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: {
        error: 'save_memory needs { kind: "slot" | "fact", text, slotKey? }.',
        issues: describeNinaIssues(parsed.error),
      },
      isError: true,
    }
  }

  const { kind, text, slotKey } = parsed.data
  if (kind === 'slot') {
    if (slotKey == null) {
      return {
        answer: { error: 'kind "slot" needs a slotKey, e.g. usual_running_days. Or use kind "fact".' },
        isError: true,
      }
    }
    await ctx.gateway.saveMemorySlot(ctx.userId, { key: slotKey, value: text })
    const answer: SaveMemoryAnswer = { saved: true, kind, text, slotKey }
    return { answer, isError: false }
  }

  await ctx.gateway.appendMemoryFact(ctx.userId, { text, sourceMessageId: ctx.sourceMessageId })
  const answer: SaveMemoryAnswer = { saved: true, kind, text }
  return { answer, isError: false }
}
```

---

### Step 4: `lib/nina/tools.ts` (part 2 of 2) — `compare_runs`, and INVARIANT 2

**File:** `lib/nina/tools.ts` (appended below Step 3's code)
**Change:** The delta table and the comparison handler.

**The two design rules, stated before the code because both are easy to undo by accident:**

1. **The difference is computed here and spelled here.** `RunDelta.delta` is a string. There is no
   field on this answer holding a raw number for two runs on either side of it, because the moment
   such a field exists, a prompt edit can make her subtract it herself and the sign is a coin flip.
2. **There is no `better` field, and that is deliberate.** For pace, lower is better. For distance,
   more is better only relative to what the session was *for* — a 4 km recovery jog is not worse
   than a 16 km long run. Deciding which run was better is R5's job and hers; the app's job is to
   say what moved and in which direction. So every delta carries `direction` (B relative to A) and
   `higherMeans` (a clause naming what a rise *is*), and never a verdict.

**Code (continues in the same file):**

```ts
/* ============================================================================
 * compare_runs — INVARIANT 2, at the one place it would otherwise break
 * ==========================================================================*/

/** B relative to A. `'unknown'` when either side has no value — never conflated with `'same'`. */
export type DeltaDirection = 'up' | 'down' | 'same' | 'unknown'

export interface RunDelta {
  /** Stable machine key, so a later phase can pick one delta out without string matching a label. */
  key: string
  /** `'Average pace'`. */
  label: string
  /** A's value, spelled. null when the run has no reading for it. */
  a: string | null
  b: string | null
  /** **B minus A, already spelled and signed.** null when either side is null. */
  delta: string | null
  direction: DeltaDirection
  /** `'a rise means he ran slower'` — so she never has to infer what the sign means. */
  higherMeans: string
}

interface CompareField {
  key: string
  label: string
  read: (run: NinaDetailedRunInput) => number | null
  /** Spelling for an absolute value. Always an existing `lib/format.ts` call. */
  format: (value: number) => string
  /**
   * Spelling for a difference. `lib/format.ts` has exactly one delta formatter,
   * `formatPaceDelta`, and pace uses it. Everything else gets `signed()` wrapped around its own
   * absolute formatter — a sign prefix, not a second formatter, so invariant 3 still holds and
   * `lib/format.ts` gains nothing (R-23).
   */
  formatDelta: (delta: number) => string
  higherMeans: string
}

/** `+1.2 km`, `-14 bpm`. A prefix on an existing spelling; never a new number format. */
function signed(delta: number, format: (abs: number) => string): string {
  if (delta === 0) return format(0)
  return `${delta > 0 ? '+' : '-'}${format(Math.abs(delta))}`
}

/**
 * **Every comparison Nina can make, and therefore every comparison she can make AT ALL.**
 *
 * A field is in this table only if F06 already computes it. That is invariant 2 as a data
 * structure: adding a row here is impossible without a `SessionMetrics` field to read, so a
 * comparison F06 does not support cannot be added to a prompt — it has to be added to F06 first,
 * in F06's own card. Comparisons that were wanted and are NOT here are in this plan's Open
 * Questions, by name.
 *
 * `paceSd` is spelled with `formatDuration` because a spread in seconds has exactly one spelling
 * in `lib/format.ts` and that is it. `'0:12'` for a 12-second spread reads oddly and is still the
 * right call: a second seconds-formatter invented here is precisely the divergence R-42 punished.
 */
export const COMPARE_FIELDS: readonly CompareField[] = [
  {
    key: 'distance',
    label: 'Distance',
    read: (run) => run.distanceM,
    format: (v) => formatDistanceM(v),
    formatDelta: (d) => signed(d, (abs) => formatDistanceM(abs)),
    higherMeans: 'a rise means he covered more ground',
  },
  {
    key: 'duration',
    label: 'Moving time',
    read: (run) => run.durationSec,
    format: (v) => formatDuration(v),
    formatDelta: (d) => signed(d, (abs) => formatDuration(abs)),
    higherMeans: 'a rise means he was out longer',
  },
  {
    key: 'avgPace',
    label: 'Average pace',
    read: (run) => run.avgPaceSec,
    format: (v) => formatPace(v, true),
    /* The one existing delta formatter in the repo. `+12 s/km` = slower. */
    formatDelta: (d) => formatPaceDelta(d),
    higherMeans: 'a rise means he ran SLOWER — pace is seconds per km, so bigger is worse',
  },
  {
    key: 'avgHr',
    label: 'Average heart rate',
    read: (run) => run.avgHr,
    format: (v) => formatBpm(v),
    formatDelta: (d) => signed(d, (abs) => formatBpm(abs)),
    higherMeans: 'a rise means his heart worked harder for the same outing',
  },
  {
    key: 'maxHr',
    label: 'Peak heart rate',
    read: (run) => run.maxHr,
    format: (v) => formatBpm(v),
    formatDelta: (d) => signed(d, (abs) => formatBpm(abs)),
    higherMeans: 'a rise means a harder peak effort',
  },
  {
    key: 'avgHrPctOfMax',
    label: 'Average HR as % of max',
    read: (run) => run.metrics.avgHrPctMax,
    format: (v) => formatPercent(v, 0),
    formatDelta: (d) => signed(d, (abs) => formatPercent(abs, 0)),
    higherMeans: 'a rise means a bigger share of his ceiling. If his HRmax is estimated, say so',
  },
  {
    key: 'aerobicDecoupling',
    label: 'Aerobic decoupling (Pa:Hr)',
    read: (run) => run.metrics.decouplingPct,
    format: (v) => formatPercent(v, 1),
    formatDelta: (d) => signed(d, (abs) => formatPercent(abs, 1)),
    higherMeans: 'POSITIVE decoupling is drift — a rise means he faded more, not less',
  },
  {
    key: 'splitDrift',
    label: 'First-half to second-half pace drift',
    read: (run) => run.metrics.splitDriftSecPerKm,
    format: (v) => formatPaceDelta(v),
    formatDelta: (d) => formatPaceDelta(d),
    higherMeans: 'a rise means he slowed down more over the run',
  },
  {
    key: 'paceSd',
    label: 'Pace spread across kilometres',
    read: (run) => run.metrics.paceSdSec,
    format: (v) => formatDuration(v),
    formatDelta: (d) => signed(d, (abs) => formatDuration(abs)),
    higherMeans: 'a rise means the kilometres were less even',
  },
  {
    key: 'cadenceFade',
    label: 'Cadence fade, last full km minus first',
    read: (run) => run.metrics.cadenceFadeSpm,
    format: (v) => formatCadence(v),
    formatDelta: (d) => signed(d, (abs) => formatCadence(abs)),
    higherMeans: 'NEGATIVE fade is the bad direction — a rise means he held his cadence better',
  },
  {
    key: 'avgCadence',
    label: 'Average cadence',
    read: (run) => run.avgCadence,
    format: (v) => formatCadence(v),
    formatDelta: (d) => signed(d, (abs) => formatCadence(abs)),
    higherMeans: 'a rise means quicker turnover',
  },
  {
    key: 'hardPct',
    label: 'Time in zones 4 and 5',
    read: (run) => run.metrics.hardPct,
    format: (v) => formatPercent(v, 0),
    formatDelta: (d) => signed(d, (abs) => formatPercent(abs, 0)),
    higherMeans: 'a rise means more of the run was genuinely hard',
  },
  {
    key: 'hrRecovery1Min',
    label: 'Heart-rate drop one minute after finishing',
    read: (run) => run.metrics.hrRecovery1MinBpm,
    format: (v) => formatBpm(v),
    formatDelta: (d) => signed(d, (abs) => formatBpm(abs)),
    higherMeans: 'a rise is GOOD — a bigger drop is better recovery',
  },
  {
    key: 'activeKcal',
    label: 'Active calories',
    read: (run) => run.activeKcal,
    format: (v) => formatKcal(v),
    formatDelta: (d) => signed(d, (abs) => formatKcal(abs)),
    higherMeans: 'a rise means more energy spent, as the watch reported it',
  },
  {
    key: 'elevationGain',
    label: 'Elevation gain',
    read: (run) => run.elevationM,
    format: (v) => formatElevation(v),
    formatDelta: (d) => signed(d, (abs) => formatElevation(abs)),
    higherMeans: 'a rise means more climbing, which makes a slower pace expected',
  },
]

/** The whole delta table for one ordered pair. Pure — the unit test calls it directly. */
export function compareRunFacts(
  a: NinaDetailedRunInput,
  b: NinaDetailedRunInput,
): RunDelta[] {
  return COMPARE_FIELDS.map((field) => {
    const rawA = field.read(a)
    const rawB = field.read(b)
    if (rawA == null || rawB == null) {
      return {
        key: field.key,
        label: field.label,
        a: rawA == null ? null : field.format(rawA),
        b: rawB == null ? null : field.format(rawB),
        /* null, never 0. A missing reading and an unchanged reading are different facts, and F06
         * makes the same distinction for exactly this reason. */
        delta: null,
        direction: 'unknown' as DeltaDirection,
        higherMeans: field.higherMeans,
      }
    }
    const diff = rawB - rawA
    return {
      key: field.key,
      label: field.label,
      a: field.format(rawA),
      b: field.format(rawB),
      delta: field.formatDelta(diff),
      direction: (diff === 0 ? 'same' : diff > 0 ? 'up' : 'down') as DeltaDirection,
      higherMeans: field.higherMeans,
    }
  })
}

export interface CompareSide {
  dateISO: DateISO
  dayLabel: string
  weekdayId: string
  daysAgo: number
  runId: string
  startedAt: string | null
  location: string | null
  intent: NinaRunFact['intent']
  flags: NinaRunFact['flags']
  note: string | null
}

export interface CompareRunsAnswer {
  kind: 'comparison'
  todayISO: DateISO
  a: CompareSide
  b: CompareSide
  /** One entry per `COMPARE_FIELDS` row, in that order. Already subtracted, already spelled. */
  deltas: RunDelta[]
  situation: string
}

/** Every answer `compare_runs` can give. Union, so no branch can return "nothing". */
export type CompareRunsResult =
  | CompareRunsAnswer
  | DateAmbiguous
  | { kind: 'invalid'; input: string; situation: string }
  | { kind: 'future'; dateISO: DateISO; dayLabel: string; situation: string }
  | { kind: 'no_run'; dateISO: DateISO; dayLabel: string; weekdayId: string; situation: string }
  | { kind: 'same_day'; dateISO: DateISO; situation: string }

function sideOf(fact: NinaRunFact, resolved: { dayLabel: string; weekdayId: string }): CompareSide {
  return {
    dateISO: fact.dateISO,
    dayLabel: resolved.dayLabel,
    weekdayId: resolved.weekdayId,
    daysAgo: fact.daysAgo,
    runId: fact.runId,
    startedAt: fact.startedAt,
    location: fact.location,
    intent: fact.intent,
    flags: fact.flags,
    note: fact.note,
  }
}

/**
 * R15's comparison. **Answers a question or asks one; it never guesses.**
 *
 * Every non-comparison branch returns `isError: false` except the two that are genuinely her
 * mistake (a malformed date, the same day twice). "There is no run on 1 Sep" and "there were two
 * runs that day" are correct, complete answers she has to relay — marking them as errors would
 * invite an apology about a tool instead of the sentence R15 asked for.
 */
export async function handleCompareRuns(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = CompareRunsArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: {
        error: 'compare_runs needs { dateA: "YYYY-MM-DD", dateB: "YYYY-MM-DD" }.',
        issues: describeNinaIssues(parsed.error),
      },
      isError: true,
    }
  }

  const { dateA, dateB } = parsed.data
  if (dateA === dateB) {
    const result: CompareRunsResult = {
      kind: 'same_day',
      dateISO: dateA,
      situation: `${dateA} is one day. To compare two runs from the same day, use lookup_runs and pick two.`,
    }
    return { answer: result, isError: true }
  }

  const sides = [dateA, dateB].map((input) => resolveDate(input, ctx.history.index, ctx.todayISO))

  for (const resolved of sides) {
    if (resolved.kind === 'invalid') {
      return {
        answer: {
          kind: 'invalid',
          input: resolved.input,
          situation: `"${resolved.input}" is ${resolved.reason}. Send YYYY-MM-DD worked out from todayISO.`,
        } satisfies CompareRunsResult,
        isError: true,
      }
    }
    if (resolved.kind === 'future') {
      return {
        answer: {
          kind: 'future',
          dateISO: resolved.dateISO,
          dayLabel: resolved.dayLabel,
          situation: `${resolved.dayLabel} has not happened yet. Nothing to compare.`,
        } satisfies CompareRunsResult,
        isError: true,
      }
    }
    if (resolved.kind === 'no_run') {
      return {
        answer: {
          kind: 'no_run',
          dateISO: resolved.dateISO,
          dayLabel: resolved.dayLabel,
          weekdayId: resolved.weekdayId,
          /* R15's explicit absence, on the comparison path too. */
          situation: `NO RUN on ${resolved.dayLabel} (${resolved.weekdayId}), so there is nothing to compare it with. Tell him that.`,
        } satisfies CompareRunsResult,
        isError: false,
      }
    }
    if (resolved.runs.length > 1) {
      /* Ruling (c). She asks which one; the app does not pick. */
      return { answer: ambiguousFrom(resolved), isError: false }
    }
  }

  const [left, right] = sides as [
    Extract<DateResolution, { kind: 'runs' }>,
    Extract<DateResolution, { kind: 'runs' }>,
  ]
  const byId = new Map(ctx.history.runs.map((run) => [run.runId, run]))
  const sourceA = byId.get(left.runs[0]!.runId)
  const sourceB = byId.get(right.runs[0]!.runId)
  if (sourceA == null || sourceB == null) {
    // Unreachable: both were resolved out of this same history one statement ago.
    return { answer: { error: 'Those runs could not be read just now.' }, isError: true }
  }

  const answer: CompareRunsAnswer = {
    kind: 'comparison',
    todayISO: ctx.todayISO,
    a: sideOf(left.runs[0]!, left),
    b: sideOf(right.runs[0]!, right),
    deltas: compareRunFacts(sourceA, sourceB),
    situation:
      'Every delta below is B minus A, already worked out. Do NOT subtract anything yourself. ' +
      'Read `higherMeans` before calling a rise good or bad, and `direction: "unknown"` means one ' +
      'of the two runs has no reading for that field — not that nothing changed.',
  }
  return { answer, isError: false }
}
```

Add to the import block at the top of the file (Step 3):

```ts
import {
  formatBpm,
  formatCadence,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
  formatPaceDelta,
  formatPercent,
} from '@/lib/format'
```

**Impact:** New module, pure, no I/O. `NINA_CORE_TOOL_SET` references `handleLookupRuns`,
`handleCompareRuns` and `handleSaveMemory` before their `function` declarations — legal, because
function declarations hoist, and it keeps the table readable at the top of the file.

---

### Step 5: `lib/nina/gateway.ts` — phase 2's handoff (a), made concrete

**File:** `lib/nina/gateway.ts` (new)
**Change:** The whole file. Phase 2 shipped `NinaSourceGateway` as an interface and explicitly
handed the implementation here. This is the **only** file in `lib/nina` that both talks to the
database and knows an interface, and — like `lib/records/gateway.ts` — **it contains no arithmetic
about what a fact means.** It maps rows and calls F06's own functions.

**Code:**

```ts
import 'server-only'

import { getReviewedRunsWithChildren } from '@/lib/db/queries'
import { computeSessionMetrics, evaluateSessionFlags, resolveHrMax, type ZoneRow } from '@/lib/metrics'
import {
  appendNinaMemoryFacts,
  getNinaIdentity,
  getNinaMemorySlots,
  getNinaMessageWindow,
  insertNinaTurn,
  listNinaMemoryFacts,
  upsertNinaMemorySlot,
} from './queries'
import type { NinaRole, NinaTurnStatus } from './queries'
import type {
  FiredPattern,
  MemoryFactInput,
  MemorySlotInput,
  MessageInput,
  MessageRole,
  NagState,
} from './context'
import type { NinaSourceGateway } from './load'
import { indexRunsByDate } from './dates'
import type { NinaDetailedRunInput, NinaRunHistory, NinaToolGateway } from './tools'
import type { NinaTurnRow, NinaTurnSource, NinaTurnStore } from './turn'

/**
 * The three real gateways. `lib/records/gateway.ts` is the model, down to the rule in its header:
 * every decision about what a fact IS lives in `context.ts`, `dates.ts` and `tools.ts`, none of
 * which import this file.
 *
 * ── WHY PHASES 9 AND 6 ARE STUBBED HERE AND NOT ELSEWHERE ─────────────────────────────────────
 * `readFiredPatterns` and `readNags` return `[]` until phase 9 lands, and `imageDescriptions`
 * defaults to `[]` until phase 6 does. Both are the interface's own documented empty case — phase
 * 2 wrote "`[]` when none fired" — so a green tree at this boundary (RU-11) costs one comment
 * each rather than a fake. When phase 9 lands it replaces two method bodies in this file and
 * nothing else.
 */

/* ============================================================================
 * Phase 2's NinaSourceGateway
 * ==========================================================================*/

/*
 * **There is no `toRole`, and its absence is a decision.** This file's draft carried a
 * `toRole(value: string): MessageRole` that narrowed by string comparison, on the assumption that
 * phase 1 might ship `role` as a bare `text`. It does not: phase 1 exports
 * `NinaRole = 'runner' | 'nina'` and `NinaMessageRow.role` is already that type. So the narrowing
 * function is deleted rather than kept "for safety" — a runtime coercion in front of a type the
 * database layer already guarantees is a second, weaker definition of the same domain, and the
 * `?? 'runner'` inside it would silently rewrite a genuinely bad row into a plausible one instead
 * of failing where someone would see it.
 *
 * `NinaRole` is imported from `./queries`, which is where the row type that carries it lives. If
 * phase 1 declares it in `lib/db/schema.ts` as a column domain — as it does for
 * `NinaMessageSource` — then `queries.ts` re-exports it and this import is unchanged either way,
 * which is the point of importing it from the layer this file already talks to.
 */
/*
 * What replaces it is a type-level assertion that costs nothing at runtime and fails the build the
 * day the two layers disagree. `role` is the one field that crosses this boundary UNCHANGED, so it
 * is the one field a mapper cannot document by mapping it; this line documents it instead.
 */
type _RolesAgree = [NinaRole] extends [MessageRole]
  ? [MessageRole] extends [NinaRole]
    ? true
    : never
  : never
const _rolesAgree: _RolesAgree = true
void _rolesAgree

export const dbNinaSourceGateway: NinaSourceGateway = {
  async readIdentity(userId) {
    return getNinaIdentity(userId)
  },

  async readMemorySlots(userId): Promise<MemorySlotInput[]> {
    const rows = await getNinaMemorySlots(userId)
    return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt }))
  },

  async readMemoryFacts(userId, limit): Promise<MemoryFactInput[]> {
    /* An OPTIONS OBJECT, not a positional limit — phase 1's signature. */
    const rows = await listNinaMemoryFacts(userId, { limit })
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      sourceMessageId: row.sourceMessageId,
      createdAt: row.createdAt,
    }))
  },

  async readMessageWindow(userId, limit) {
    /*
     * ── ONE CALL. This is the DTO boundary, and this map is the whole of it. ──────────────────
     *
     * `getNinaMessageWindow` returns `{ messages, olderCount }` — which is *exactly* the shape
     * phase 2's `readMessageWindow` declares, so there is nothing to assemble. This file's draft
     * ran `listNinaMessages` and a `countNinaMessages` concurrently and subtracted; the second of
     * those does not exist, and the first is now redundant, because phase 1 already does the
     * `COUNT` inside this one query. The property the draft cared about is preserved and is now
     * phase 1's to keep: `olderCount` is a SQL `COUNT`, not `all.length - limit`, which would need
     * the whole history in memory to answer a question about its size and would report 0 for a
     * 500-message history the moment the window happened to be short.
     *
     * **The three-spelling translation happens here and ONLY here** (see *Provides → Phase 4*):
     * the columns are `text` / `sent_at`, `queries.ts`'s DTO is `body` / `createdAt` uniformly in
     * every function because they all select through one shared `messageColumns`, and phase 2's
     * `MessageInput` is `text` / `sentAt`. Two lines below are that boundary. Neither side is to
     * be "fixed" to match the other.
     */
    const { messages: rows, olderCount } = await getNinaMessageWindow(userId, limit)
    const messages: MessageInput[] = rows.map((row) => ({
      id: row.id,
      role: row.role,
      text: row.body,
      sentAt: row.createdAt,
      replyToId: row.replyToId ?? null,
      runId: row.runId ?? null,
      /* Phase 6 populates this. `[]`, never null — phase 2's `MessageInput` says so. */
      imageDescriptions: row.imageDescriptions ?? [],
    }))
    return { messages, olderCount }
  },

  /** Phase 9. `[]` is the interface's documented "nothing fired". */
  async readFiredPatterns(): Promise<FiredPattern[]> {
    return []
  },

  /** Phase 9. `[]` is the interface's documented "she has never nagged". */
  async readNags(): Promise<NagState[]> {
    return []
  },
}

/* ============================================================================
 * This phase's NinaToolGateway
 * ==========================================================================*/

/**
 * One reviewed run into the shape the tools need: phase 2's `NinaRunInput` fields, plus the split
 * rows `NinaRunFact` deliberately omits (ruling d).
 *
 * `computeSessionMetrics` and `evaluateSessionFlags` are called here rather than reimplemented,
 * for the reason `lib/badges/facts.ts` gives about `toWindowRun`: a second implementation of
 * decoupling is a second chance to get the sign wrong, and that sign has been wrong once already.
 */
function toDetailedRun(
  run: Awaited<ReturnType<typeof getReviewedRunsWithChildren>>[number],
  hrMax: Awaited<ReturnType<typeof resolveHrMax>>,
): NinaDetailedRunInput {
  const splits = run.splits.map((s) => ({
    km: s.km,
    timeSec: s.timeSec,
    paceSec: s.paceSec,
    hr: s.hr,
    cadence: s.cadence,
    partial: s.partial,
  }))
  const sessionInput = {
    runId: run.id,
    occurredOn: run.occurredOn,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgHrBpm: run.avgHr,
    splits,
    // `run_zones.zone` is a plain int in Postgres; F04's Zod schema enforces the 1..5 domain on
    // the way in, so this narrowing restates a guarantee rather than assuming one.
    zones: run.zones.map((z) => ({
      zone: z.zone as ZoneRow['zone'],
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
    recovery: { endHrBpm: run.endHrBpm, hrAt1MinBpm: run.hr1MinPostBpm },
  }
  const metrics = computeSessionMetrics(sessionInput, hrMax)
  return {
    runId: run.id,
    occurredOn: run.occurredOn,
    startedAt: run.startedAt,
    location: run.location,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgPaceSec: run.avgPaceSec,
    avgHr: run.avgHr,
    maxHr: run.maxHr,
    avgCadence: run.avgCadence,
    activeKcal: run.activeKcal,
    elevationM: run.elevationM,
    intent: run.intent,
    note: run.note,
    metrics,
    flags: evaluateSessionFlags(metrics, splits.find((s) => !s.partial) ?? null),
    splits,
  }
}

export const dbNinaToolGateway: NinaToolGateway = {
  async loadRunHistory(userId): Promise<NinaRunHistory> {
    /*
     * `resolveHrMax` is resolved ONCE and reused across the loop, which is exactly what that
     * function's own header asks a hot caller to do: it is two queries and `avgHrPctMax` is the
     * single field that depends on it.
     */
    const [rows, hrMax] = await Promise.all([getReviewedRunsWithChildren(userId), resolveHrMax(userId)])
    const runs = rows.map((row) => toDetailedRun(row, hrMax))
    return {
      runs,
      index: indexRunsByDate(runs),
      splitsByRunId: new Map(runs.map((run) => [run.runId, run.splits])),
      zonesByRunId: new Map(runs.map((run) => [run.runId, run.metrics.zonePct])),
    }
  },

  async saveMemorySlot(userId, row) {
    await upsertNinaMemorySlot(userId, row)
  },

  async appendMemoryFact(userId, row) {
    /* `appendNinaMemoryFacts` is a BATCH — phase 1's name and phase 1's shape. The gateway method
     * stays singular because both callers (the `save_memory` tool and `applyMemoryWrites`) have
     * one fact at a time and a caller-side array-of-one is noise. Wrapping it here costs one pair
     * of brackets; making phase 5 think about batching does not. */
    await appendNinaMemoryFacts(userId, [row])
  },
}

/* ============================================================================
 * The turn log
 * ==========================================================================*/

/**
 * **`source` is translated to `status` HERE, and nowhere else.** Phase 1's `nina_turns` has a
 * `status` column whose domain is `NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'`
 * (`'pending'` is phase 12's, for a queued image job). This phase's `NinaTurnSource` is a
 * different concept — *which mechanism produced the reply*, not *what became of the row* — so the
 * two are not one column under two names, and `source` is never written into `status` raw.
 *
 * The map is three lines and it lives at the single write site, which is the only place that can
 * drift:
 *
 *     'llm'         → status 'ok'
 *     'llm_repair'  → status 'repaired'
 *     'unavailable' → status 'failed', error_code 'unavailable'
 *
 * `kind: 'chat'` and `trigger: null` for every turn this phase writes; phase 10 hands in the other
 * values. `rounds` is deliberately absent — phase 1's table has no such column and this phase does
 * not add one; `tool_calls` carries the names, which is strictly more than a count would say.
 */
const STATUS_BY_SOURCE = {
  llm: 'ok',
  llm_repair: 'repaired',
  unavailable: 'failed',
} as const satisfies Record<NinaTurnSource, NinaTurnStatus>

export const dbNinaTurnStore: NinaTurnStore = {
  async record(userId: string, row: NinaTurnRow): Promise<void> {
    await insertNinaTurn(userId, {
      kind: 'chat',
      trigger: null,
      model: row.model,
      promptVersion: row.promptVersion,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      /* Comma-joined names, `''` when none — ruling (b)'s evidence, and the reason phase 1's
       * column is `text NOT NULL DEFAULT ''` rather than an `integer` count. */
      toolCalls: row.toolCalls,
      latencyMs: row.latencyMs,
      status: STATUS_BY_SOURCE[row.source],
      errorCode: row.source === 'unavailable' ? 'unavailable' : null,
    })
  },
}

```

**Impact:** New `server-only` module, first consumer of every function in contract item 3 — under
**phase 1's names**, which are canonical: `getNinaMemorySlots`, `getNinaMessageWindow`,
`insertNinaMessages`, `appendNinaMemoryFacts`, `listNinaMemoryFacts(userId, { limit })`. The offer
this plan made in item 3 — *"or names close enough that `lib/nina/gateway.ts` is the only file that
changes"* — has been taken up in full: **this file absorbed every one of the five corrections and
no other file in this phase or any other moved.** That is the gateway earning its existence. **A
known, accepted cost:** `getReviewedRunsWithChildren` runs twice per turn — once inside phase 2's
`loadNinaContext` for the recent-20 window, once here for the full history the tools search. Both
are one `db.batch` against a ~200-row table, and Step 7 fires them concurrently in a
`Promise.all`, so the wall-clock cost is one query, not two. The clean fix is a second optional
parameter on `loadNinaContext`, and **phase 2 has recorded it**: not taken here because it means a
second writer on phase 2's file, and not taken there because it stops being worth doing alone —
the same parameter wants to move together with `lib/insights/load.ts` and `recomputeRecords`, all
three in one card. See *Decisions on the open items* item 5.


---

### Step 6: `lib/nina/turn.ts` (part 1 of 2) — budgets, seams, and the bodies

**File:** `lib/nina/turn.ts` (new)
**Change:** The whole file. `lib/llm/narrate.ts` is the model, deliberately and closely: budgets
as a table with the measurement that produced them, `maxRetries: 0` on the client with one budgeted
repair in the caller, `MIN_REPAIR_BUDGET_MS`, an injected `LlmClientLike` seam, and the contract
that **nothing here throws for an LLM problem.**

**Code (part 1):**

```ts
import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type { NinaContext } from './context'
import { NINA_PROMPT_VERSION, NINA_REPAIR_PREAMBLE, NINA_SYSTEM_PROMPT, SEND_TOOL } from './prompts'
import { NinaSendPayloadSchema, describeNinaIssues, type NinaSendPayload } from './schema'
import {
  NINA_CORE_TOOL_SET,
  dispatchNinaTool,
  type NinaRunHistory,
  type NinaToolGateway,
  type NinaToolSet,
} from './tools'
import { dbNinaToolGateway, dbNinaTurnStore } from './gateway'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TURN. Primary call → up to two tool rounds → Zod → ONE repair → honest silence.
 *
 *  `lib/llm/narrate.ts`'s contract, with a tool loop bolted inside the same deadline: **nothing
 *  in this file throws for an LLM problem.** A turn that cannot be completed returns
 *  `source: 'unavailable'` with a null payload, `lib/nina/actions.ts` returns
 *  `{ unavailable: true }`, and phase 4's screen says she is not answering right now — with the
 *  runner's own message already persisted, so nothing he typed is lost.
 *
 *  There is deliberately NO fallback bubble. narrate.ts's third tier is absent for the same
 *  reason: a canned "sorry, I'm having trouble" in Nina's voice is the app inventing her, and R1's
 *  whole ask is that she pass for a person. A friend who did not reply is a real thing; a friend
 *  who replies with a templated apology in perfect Jakarta slang is a broken illusion.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets ──────────────────────────────────────────────────────────────────────────────────
 *
 * MEASURED, 2026-08-21, fifteen live `glm-5.3` calls on this endpoint: **10.2 – 16.4 s,
 * clustering at 13 – 16 s** (`lib/llm/narrate.ts`'s budget note). Nina's turn makes TWO of those
 * calls in the ordinary path and THREE in the repair path, inside Vercel's hard 60 s function
 * ceiling on region `sin1`.
 *
 *   auth + two `db.batch` reads + serialising the reply   ~  2 – 4 s
 *   primary call                                          ~ 13 – 16 s
 *   tool dispatch (in-memory, no I/O for lookup/compare)  ~      0 s
 *   continuation call                                     ~ 13 – 16 s
 *   ────────────────────────────────────────────────────────────────────
 *   ordinary worst case                                   ~ 36 s
 *   + one repair                                          ~ 52 s   ← over an unpadded 45 s
 *
 * So `overall` is 45 s and the repair is CLAMPED to whatever is left rather than given its full
 * 16 s. That is the "stop yourself before the platform does" rule made arithmetic: a repair that
 * starts with 9 s left gets 9 s, probably times out, and degrades — which is strictly better than
 * a 504 that loses the whole request including the bubbles it might have returned.
 *
 * **Do not raise `overall` past 50 s.** The remaining 10 s is the page segment's own overhead plus
 * the persistence of up to four rows, and a Server Action's timeout is the PAGE segment's — see
 * `app/r/[id]/page.tsx`'s note and Next's `maxDuration` reference. **`app/nina/page.tsx` carries
 * `export const maxDuration = 60`, and that line lands in PHASE 4**, which owns the file — see
 * Handoffs. Without it the 45 s below is fiction.
 */
export const NINA_TURN_BUDGET = {
  /** The measured ceiling with real headroom, not the measured median with none. */
  primary: 22_000,
  /** The post-tool call. Same output size, a bigger input; same allowance. */
  continue: 20_000,
  /** Clamped to `remaining()` at the call site. This is a ceiling, not a promise. */
  repair: 16_000,
  overall: 45_000,
} as const

/**
 * Below this much remaining budget, another TOOL ROUND is not started — the loop forces `send`
 * instead. 14 s because the fastest call ever measured on this endpoint was 10.2 s: a round begun
 * with less than that cannot finish, and the only thing it changes is which failure he sees.
 */
export const NINA_MIN_ROUND_BUDGET_MS = 14_000

/**
 * Below this much remaining budget, the repair is skipped rather than started. Same rule and same
 * number as F04's extraction path and F07's narrative: a repair fired with two seconds left cannot
 * finish.
 */
export const NINA_MIN_REPAIR_BUDGET_MS = 3_000

/**
 * Two rounds, not more, and the reason is the budget above and not a philosophy of agents. Round 1
 * covers the ordinary case (`lookup_runs`, or `compare_runs`, or `save_memory`, or several at
 * once — Anthropic's protocol allows multiple `tool_use` blocks in one assistant turn, so "look up
 * two days AND save a fact" is ONE round). Round 2 exists for the follow-up a tool answer
 * legitimately provokes: an ambiguous two-a-days date, or an `isError` result she can fix. A third
 * round does not fit under 45 s and would not be reached anyway.
 */
export const MAX_TOOL_ROUNDS = 2

/**
 * 1200 was sized for F07's five-field payload and measured 633 actual output tokens. Nina's
 * payload is up to four bubbles of ~700 characters plus six memory writes, so the ceiling is
 * raised proportionally — and then raised again, for a reason that is a measurement and not a
 * margin of comfort.
 *
 * **THIS CEILING MUST HAVE ROOM FOR A `thinking` BLOCK WE DID NOT ASK FOR.** The 2026-09-03 probe
 * of this endpoint sent `thinking: { type: 'disabled' }` and round 1 came back **with a `thinking`
 * block anyway** (round 2 without one). So sizing `max_tokens` to the payload alone would be
 * sizing it to a response shape z.ai does not promise: the block would eat the front of the
 * budget, the `tool_use` behind it would be cut mid-object, `stop_reason` would be `max_tokens`,
 * and the turn would degrade for a reason that looks nothing like its cause. 2400 is the payload
 * ceiling plus room for the observed block.
 *
 * **What is NOT the fix:** raising this without limit. F07 measured that 4000 tokens buys 4000
 * tokens of thinking and still no answer, and that finding stands. This is headroom for a block
 * that arrives *alongside* the answer, not a budget for one that replaces it. And the flag stays
 * on every body regardless — see ruling (e), including why "keep sending it" and "do not do
 * arithmetic against it" are both true at once.
 */
export const NINA_MAX_TOKENS = 2_400

/**
 * **The same client, on purpose.** `narrativeClient()` is `@anthropic-ai/sdk` against
 * `env.LLM_BASE_URL` with `maxRetries: 0`, and every word of its rationale applies here verbatim:
 * one credential for both endpoints (R-40), and retries off because THIS module does its own
 * single budgeted retry and that is the retry with a chance of changing the outcome. A second
 * `new Anthropic({…})` would be a second HTTP agent and a second place that can drift on the
 * retry setting.
 *
 * Re-exported under Nina's own names so a reader of this file is not asking why a chat turn is
 * calling something called "narrative".
 */
export const ninaClient = narrativeClient
/** The model id, read at the call site so a test can pass its own. There is no `NINA_MODEL`. */
export const ninaModel = narrativeModel

/**
 * The seam the unit suite injects at, mirroring `LlmClientLike` in `lib/llm/narrate.ts` and
 * `ExtractDeps` in F04, for the reason both give: this module opens with `import 'server-only'`
 * and reaches `@/lib/env`, so the only honest way to test the repair path is to hand it a client
 * that returns the measured malformed body.
 *
 * Declared here rather than imported from `narrate.ts` because importing that module pulls
 * `@/lib/db/queries` into every test that wants a fake chat client. Two identical twelve-line
 * interfaces beats that; see Handoffs for the shared-seam option.
 */
export interface NinaLlmClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export type NinaTurnSource = 'llm' | 'llm_repair' | 'unavailable'

export interface NinaTurnUsage {
  inputTokens: number
  outputTokens: number
}

export interface NinaTurnTrace {
  model: string
  promptVersion: number
  /** Tool rounds actually completed. 0 for a turn she answered straight away. */
  rounds: number
  /** Every tool name dispatched, in order. A dropped sibling call is prefixed `dropped:`. */
  toolCalls: string[]
  latencyMs: number
}

export interface NinaTurnResult {
  /** null iff `source === 'unavailable'`. There is no fallback bubble; see the header. */
  payload: NinaSendPayload | null
  source: NinaTurnSource
  usage: NinaTurnUsage
  trace: NinaTurnTrace
}

/**
 * What this module hands the store. **Not a `nina_turns` row** — phase 1 owns that shape
 * (`NinaTurnInsert`) and `dbNinaTurnStore` does the translation, including `source → status` and
 * the `kind` / `trigger` this phase always sets the same way. Keeping the two shapes distinct is
 * what lets the tests assert `source: 'llm_repair'` without knowing that the column says
 * `'repaired'`.
 *
 * **No `rounds`.** Phase 1's table has no such column and this phase does not add one; the round
 * count stays on `NinaTurnTrace`, where the unit suite reads it, and the durable evidence of a
 * tool round is `toolCalls`, which names them.
 */
export interface NinaTurnRow {
  model: string
  promptVersion: number
  /** Which mechanism produced the reply. NOT the `status` column — see `dbNinaTurnStore`. */
  source: NinaTurnSource
  /** Comma-joined `trace.toolCalls`. `''` when she called none — ruling (b)'s evidence, and the
   * reason phase 1's column is `text` and not an `integer` count. */
  toolCalls: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface NinaTurnStore {
  record(userId: string, row: NinaTurnRow): Promise<void>
}

export interface NinaTurnInput {
  userId: string
  /** Phase 2's boundary. Everything she may ever know is in here. */
  context: NinaContext
  /** Built once per turn by `NinaToolGateway.loadRunHistory`, reused by every round. */
  history: NinaRunHistory
  /** The `nina_messages` row this turn answers, for `nina_memory_facts.source_message_id`. */
  sourceMessageId: string | null
  /** What he just typed. Null on a proactive turn (phase 10), where she opens the conversation. */
  runnerText: string | null
  /**
   * **INVARIANT 5.** Phase 6's `glm-4.6v` descriptions arrive here as TEXT. `glm-5.3` is never
   * sent an image: that endpoint answers 200 and silently drops the block, so an image sent here
   * is not an error, it is a lie. This field is the entire image path into this file.
   */
  imageDescriptions?: readonly string[]
  /** Phase 10's `PROACTIVE_INSTRUCTIONS[kind]`, appended to the user turn. */
  proactive?: string | null
}

export interface NinaTurnDeps {
  client: NinaLlmClientLike
  model: string
  toolSet: NinaToolSet
  gateway: NinaToolGateway
  /** Null in tests. A failure to log is caught and warned; it never fails a turn. */
  store: NinaTurnStore | null
  now?: () => number
}

/**
 * `promptVersion` is logged and never sent — phase 2's own words, and F07's `visibleFacts`
 * precedent. It is not a fact about him; putting it in the payload invites her to mention it.
 */
function visibleContext(context: NinaContext): Omit<NinaContext, 'promptVersion'> {
  const { promptVersion: _ignored, ...visible } = context
  return visible
}

/**
 * The user turn. One JSON block of facts, then what he said — the same order and the same framing
 * `narrate.ts` uses (`Analyse this ${scope}.\n\n${json}`), because that is the shape this endpoint
 * has been measured against.
 */
function userTurnText(input: NinaTurnInput): string {
  const parts: string[] = [
    'CONTEXT — every fact you are allowed to state is in here. Nothing outside it is real.',
    JSON.stringify(visibleContext(input.context), null, 2),
  ]

  if (input.imageDescriptions != null && input.imageDescriptions.length > 0) {
    parts.push(
      'HE SENT ' +
        (input.imageDescriptions.length === 1 ? 'AN IMAGE' : 'IMAGES') +
        '. This is what is in ' +
        (input.imageDescriptions.length === 1 ? 'it' : 'them') +
        ' — react to the picture, never to this description as a description:',
      input.imageDescriptions.map((description) => `- ${description}`).join('\n'),
    )
  }

  if (input.runnerText != null && input.runnerText.length > 0) {
    parts.push('HE JUST SAID:', input.runnerText)
  }

  if (input.proactive != null && input.proactive.length > 0) {
    parts.push('NOBODY SAID ANYTHING. You are starting this. ' + input.proactive)
  }

  return parts.join('\n\n')
}

/**
 * The request envelope. **The allowed surface on this endpoint is
 * `model · max_tokens · system · messages · tools · tool_choice · thinking` and nothing else** —
 * no `strict: true`, no `cache_control`, no `temperature`. It is Anthropic-*compatible*, not
 * Anthropic, and every field beyond that set is one z.ai may accept, ignore, or 400 on depending
 * on the day.
 *
 * ── `thinking: { type: 'disabled' }`. MEASURED. NEVER REMOVE. ─────────────────────────────────
 * F31 (`docs/plans/F31-narrate-thinking-disabled.md`, commit 2255565), against real prod facts:
 *
 *     thinking on,  1200 tokens →  18-38 s, stop_reason `max_tokens`, content ["thinking"]
 *     thinking on,  4000 tokens →  65-73 s, stop_reason `max_tokens`, content ["thinking"]
 *     thinking DISABLED         →     17 s, stop_reason `tool_use`,   content ["tool_use"]
 *
 * Two thinking calls do not fit under 45 s at any ceiling, and a friend does not deliberate for
 * forty seconds before answering. So the flag goes on every body, primary, continuation and
 * repair, and `lib/nina/turn.test.ts` asserts it on all three.
 *
 * **BUT IT IS A REQUEST, NOT A GUARANTEE, AND NO CODE HERE MAY ASSUME IT WAS HONOURED.** The
 * 2026-09-03 probe of this endpoint sent the flag and round 1 returned a `thinking` block anyway
 * (round 2 did not). F31 measured a *text* completion; a tool call on this endpoint does something
 * else. Two rules follow, and neither is "delete the flag":
 *
 *   1. `NINA_MAX_TOKENS` leaves room for the block — see its own note above.
 *   2. **Every parse SCANS `content[]`. Nothing reads `content[0]`.** `findSendBlock` and
 *      `findToolUses` below iterate, and that is now load-bearing: a parser reading slot 0 would
 *      have failed on round 1 of that very probe, and failed *as a malformed reply* — burning the
 *      repair budget reproducing a parse bug.
 *
 * See ruling (e) for the full argument.
 *
 * ── `tool_choice` ─────────────────────────────────────────────────────────────────────────────
 * `{ type: 'any' }` on a non-final call: she must call SOMETHING, which is `OUTPUT_RULE`'s "never
 * write prose outside a tool call" enforced by the request rather than requested by the prompt.
 * `{ type: 'tool', name: 'send' }` on the final call, with `tools` narrowed to `[SEND_TOOL]` —
 * F07 measured that removing choices raises first-attempt validity, and on the last call there is
 * no budget left to spend on a tool answer she could not act on anyway.
 */
function ninaBody(
  model: string,
  messages: Anthropic.MessageParam[],
  toolSet: NinaToolSet,
  forceSend: boolean,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: NINA_MAX_TOKENS,
    system: NINA_SYSTEM_PROMPT,
    messages,
    tools: forceSend ? [SEND_TOOL] : [...toolSet.tools],
    tool_choice: forceSend ? { type: 'tool', name: SEND_TOOL.name } : { type: 'any' },
    thinking: { type: 'disabled' },
  }
}

function usageOf(message: Anthropic.Message): NinaTurnUsage {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  }
}

/**
 * **Both of these SCAN. Neither may be rewritten to read `content[0]`, however tempting.** Two
 * independent reasons, and the second is a measurement:
 *
 * - Anthropic's protocol allows several `tool_use` blocks in one assistant turn, which is what
 *   makes "look up two days AND save a fact" one round rather than two.
 * - **`content[0]` was a `thinking` block on round 1 of the 2026-09-03 probe**, despite
 *   `thinking: { type: 'disabled' }` being sent. A slot-0 parser would have seen no `tool_use`,
 *   called it malformed, and spent the repair budget re-running its own bug. Ruling (e).
 */
function findSendBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === SEND_TOOL.name) return block
  }
  return null
}

function findToolUses(message: Anthropic.Message): Anthropic.ToolUseBlock[] {
  const out: Anthropic.ToolUseBlock[] = []
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name !== SEND_TOOL.name) out.push(block)
  }
  return out
}

/**
 * Never `console.error`: a turn that did not generate is an expected state of this feature, not an
 * incident — the rule `logLlmFailure` states in `narrate.ts`. It gets a warn line with enough
 * detail to correlate against the `nina_turns` row written for the same turn.
 */
function logNinaFailure(stage: 'primary' | 'continue' | 'repair', cause: unknown): void {
  console.warn(`[nina] ${stage} call failed`, { error: String(cause) })
}
```

---

### Step 6 (part 2 of 2): the loop, the one repair, and the log

**File:** `lib/nina/turn.ts` (appended below part 1)

**Code (part 2):**

```ts
/* ============================================================================
 * The loop
 * ==========================================================================*/

/**
 * **The testable core.** Client, model, tool set, gateway and clock all injected; no environment
 * beyond what `deps` carries. `tests/fixtures/ninaTurn.ts` drives every branch below with a fake
 * client and no database.
 *
 * At most `MAX_TOOL_ROUNDS + 1` model calls, each clamped to what is left of the 45 s deadline,
 * and the last one is FORCED to `send`. That last detail is the whole safety property: the loop
 * cannot spin, because on its final iteration the model is given exactly one tool and told to use
 * it.
 */
export async function runNinaTurnWith(
  deps: NinaTurnDeps,
  input: NinaTurnInput,
): Promise<NinaTurnResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const deadline = startedAt + NINA_TURN_BUDGET.overall
  const remaining = () => deadline - now()

  const usage: NinaTurnUsage = { inputTokens: 0, outputTokens: 0 }
  const trace: NinaTurnTrace = {
    model: deps.model,
    promptVersion: input.context.promptVersion ?? NINA_PROMPT_VERSION,
    rounds: 0,
    toolCalls: [],
    latencyMs: 0,
  }

  function finish(payload: NinaSendPayload | null, source: NinaTurnSource): NinaTurnResult {
    trace.latencyMs = now() - startedAt
    return { payload, source, usage, trace }
  }

  function addUsage(message: Anthropic.Message): void {
    const one = usageOf(message)
    usage.inputTokens += one.inputTokens
    usage.outputTokens += one.outputTokens
  }

  const toolCtx = {
    userId: input.userId,
    todayISO: input.context.now.todayISO,
    history: input.history,
    gateway: deps.gateway,
    sourceMessageId: input.sourceMessageId,
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurnText(input) }]

  for (let call = 0; call <= MAX_TOOL_ROUNDS; call++) {
    /*
     * Two independent reasons to force `send`, and the second is the deadline gate: the last
     * permitted call, OR too little budget left to act on another tool answer. Either way she is
     * handed one tool and told to use it.
     */
    const forceSend = call === MAX_TOOL_ROUNDS || remaining() < NINA_MIN_ROUND_BUDGET_MS
    const ceiling = call === 0 ? NINA_TURN_BUDGET.primary : NINA_TURN_BUDGET.continue

    let message: Anthropic.Message
    try {
      message = await deps.client.messages.create(
        ninaBody(deps.model, messages, deps.toolSet, forceSend),
        { timeout: Math.min(ceiling, Math.max(remaining(), 1)) },
      )
    } catch (cause) {
      logNinaFailure(call === 0 ? 'primary' : 'continue', cause)
      return finish(null, 'unavailable')
    }
    addUsage(message)

    /*
     * A `max_tokens` stop is not a validation failure to repair — it is a response cut mid-object,
     * and the same prompt with the same ceiling will cut it again. Repairing it would spend the
     * remaining budget re-proving that. If this starts firing, `NINA_MAX_TOKENS` is the bug.
     */
    const truncated = message.stop_reason === 'max_tokens'
    const send = findSendBlock(message)

    if (send != null) {
      /*
       * `send` WINS and the turn ends. Sibling `tool_use` blocks are dropped rather than
       * dispatched: she has already answered, so a `tool_result` nobody will read is pure latency.
       * Their names are still recorded — `dropped:save_memory` in `nina_turns.tool_calls` is how a
       * lost write becomes visible instead of theoretical, and `send.memoryWrites` covers that
       * case in the payload we are about to return anyway.
       */
      for (const dropped of findToolUses(message)) trace.toolCalls.push(`dropped:${dropped.name}`)

      if (truncated) return finish(null, 'unavailable')

      const parsed = NinaSendPayloadSchema.safeParse(send.input)
      if (parsed.success) return finish(parsed.data, 'llm')

      /* THE ONE REPAIR. Ruling (g): nothing else in this function is allowed to spend it. */
      if (remaining() <= NINA_MIN_REPAIR_BUDGET_MS) return finish(null, 'unavailable')
      const repaired = await attemptNinaRepair(deps, messages, {
        malformed: send.input,
        issues: describeNinaIssues(parsed.error),
        timeoutMs: Math.min(NINA_TURN_BUDGET.repair, remaining()),
      })
      if (repaired == null) return finish(null, 'unavailable')
      usage.inputTokens += repaired.usage.inputTokens
      usage.outputTokens += repaired.usage.outputTokens
      return finish(repaired.payload, 'llm_repair')
    }

    const toolUses = findToolUses(message)
    /*
     * No `send` and nothing to dispatch — or the call that was already forced to `send` came back
     * without one. There is no further move that has not already been tried, so degrade. This is
     * the branch a turn whose ceiling was ENTIRELY eaten by a `thinking` block lands in, which is
     * why ruling (e) keeps the flag on every body. Note what does NOT land here: a turn that
     * returned a `thinking` block *and* a `tool_use`, which is what this endpoint actually did on
     * 2026-09-03 — `findSendBlock` scans past the thinking block and the turn succeeds normally.
     */
    if (toolUses.length === 0 || truncated || forceSend) return finish(null, 'unavailable')

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      trace.toolCalls.push(use.name)
      const answer = await dispatchNinaTool(use.name, use.input, toolCtx, deps.toolSet.handlers)
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(answer.answer),
        /* Set only when true: an absent field is safer than a `false` on an endpoint that is only
         * Anthropic-compatible. See ruling (f) and the live test. */
        ...(answer.isError ? { is_error: true } : {}),
      })
    }

    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: results })
    trace.rounds += 1
  }

  /* Unreachable: the last iteration always forces `send` and returns. Kept because the alternative
   * is a non-null assertion on a loop's exit. */
  return finish(null, 'unavailable')
}

/**
 * The one repair round-trip.
 *
 * **Shaped as `… → assistant(text) → user`, not as a `tool_result`** — ruling (f). The
 * protocol-correct Anthropic form pairs a `tool_use` with a `tool_result`, and this endpoint is
 * only Anthropic-*compatible*; F04's vision repair and F07's narrative repair both settled on the
 * plain text shape against these endpoints, and reusing it means one repair idiom in this repo
 * instead of two, with the more conservative one chosen.
 *
 * `messages` is passed by value semantics — the array is spread, never pushed to — because the
 * failing assistant turn was deliberately never appended. So the model sees the conversation as it
 * stood, then its own malformed JSON echoed back (so "reuse exactly what you already had" refers
 * to something actually present in the context), then the field-by-field complaint.
 */
async function attemptNinaRepair(
  deps: NinaTurnDeps,
  messages: readonly Anthropic.MessageParam[],
  input: { malformed: unknown; issues: string; timeoutMs: number },
): Promise<{ payload: NinaSendPayload; usage: NinaTurnUsage } | null> {
  const repairMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(input.malformed) },
    { role: 'user', content: NINA_REPAIR_PREAMBLE + input.issues },
  ]

  let second: Anthropic.Message
  try {
    second = await deps.client.messages.create(
      ninaBody(deps.model, repairMessages, deps.toolSet, true),
      { timeout: Math.max(input.timeoutMs, 1) },
    )
  } catch (cause) {
    logNinaFailure('repair', cause)
    return null
  }

  const block = findSendBlock(second)
  if (block == null || second.stop_reason === 'max_tokens') return null

  const parsed = NinaSendPayloadSchema.safeParse(block.input)
  if (!parsed.success) return null

  return { payload: parsed.data, usage: usageOf(second) }
}

/* ============================================================================
 * The production entry point
 * ==========================================================================*/

/**
 * **`export`ed, and the keyword is a ruling.** It would be private if nothing outside this file
 * needed it, and it is not: phase 12's work in `lib/nina/actions.ts` must pass its own `toolSet`
 * (the core set plus `generate_image`) while keeping every other production dep — client, model,
 * gateway, store — exactly as defined here. With the export that is
 * `{ ...productionDeps(), toolSet: withImageTool }` and phase 12 touches nothing in this file.
 * Without it, phase 12's only options are to become a second writer on `turn.ts` for one keyword,
 * or to re-spell all five deps at its own call site — a second definition of "production", which
 * is precisely the drift this function exists to prevent. So the keyword lands in THIS phase's
 * commit, at creation, rather than as a later phase reaching in.
 */
export function productionDeps(): NinaTurnDeps {
  return {
    client: ninaClient(),
    model: ninaModel(),
    toolSet: NINA_CORE_TOOL_SET,
    gateway: dbNinaToolGateway,
    store: dbNinaTurnStore,
  }
}

/**
 * **The one function `lib/nina/actions.ts`, `lib/nina/proactive.ts` (phase 10) and
 * `app/api/cron/nina/route.ts` (phase 10) call.** Never throws for an LLM problem.
 *
 * ── DO NOT AWAIT THIS FROM A PAGE'S OWN RENDER PATH (INVARIANT 4) ─────────────────────────────
 * This takes 13–45 s, every time — there is no cache and no hit path, because every turn is a new
 * conversation state. `app/nina/page.tsx` renders the stored conversation and phase 4 fires the
 * action from a client event handler afterwards, exactly as `components/insights/InsightTrigger.tsx`
 * fires `ensureRunInsight`. **`scripts/check-llm-payload-boundary.mjs`'s `GUARDED_CALLS` table
 * enforces it** — phase 1 owns that file and ships this symbol's entry whole, with
 * `lib/nina/turn.ts`, `lib/nina/actions.ts`, `lib/nina/proactive.ts` and
 * `app/api/cron/nina/route.ts` as its sanctioned callers. The guard greps for the literal string
 * `runNinaTurn`, so **this function's name is part of the contract**; rename it and the guard
 * silently stops guarding. The rule exists because the failure mode looks fine in dev and hangs in
 * production.
 *
 * ── THE TURN IS ALWAYS LOGGED, INCLUDING WHEN IT FAILED ───────────────────────────────────────
 * F07's `getOrCreateInsight` persists NOTHING on failure, and that was right there — a page view
 * retries for free. It is wrong here. A chat turn that produced no reply is the single most
 * important thing to be able to see afterwards, and F31's own post-mortem says so: "the whole
 * `insights` table stopped growing for 31 hours and nothing recorded why, because a failure here
 * persists nothing." So `nina_turns` gets a row with `source: 'unavailable'`, and a store failure
 * is warned and swallowed — a log that cannot be written must not cost a reply that can.
 */
export async function runNinaTurn(
  input: NinaTurnInput,
  deps: NinaTurnDeps = productionDeps(),
): Promise<NinaTurnResult> {
  const result = await runNinaTurnWith(deps, input)

  if (deps.store != null) {
    try {
      await deps.store.record(input.userId, {
        model: result.trace.model,
        promptVersion: result.trace.promptVersion,
        source: result.source,
        toolCalls: result.trace.toolCalls.join(','),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.trace.latencyMs,
      })
    } catch (cause) {
      console.warn('[nina] turn log failed', { error: String(cause) })
    }
  }

  return result
}
```

**Impact:** New `server-only` module. Reuses `narrativeClient` / `narrativeModel` unchanged —
`lib/llm/client.ts` is not edited. Imports `dbNinaToolGateway` and `dbNinaTurnStore` from
`gateway.ts`, and `gateway.ts` imports the `NinaTurnRow` / `NinaTurnStore` **types** from here:
a type-only cycle, which TypeScript resolves and the bundler erases. If it ever becomes a runtime
cycle, the fix is to move the *body* of `productionDeps` behind a lazy accessor — **not** to move
the function into `actions.ts`, which is no longer available: it is an export phase 12 imports
(`{ ...productionDeps(), toolSet: withImageTool }`), so its module home is part of the contract.

---

### Step 7: `lib/nina/actions.ts` — the Server Action, exactly as phase 4 declared it

**File:** `lib/nina/actions.ts` (new)
**Change:** The whole file. **Phase 4's declared signature is honoured verbatim**, including the
write-order guarantee and the clamp.

**Why an action and not a route handler:** D7 fixes the route-handler list at `/api/extract`,
`/api/upload`, `/api/auth/[...nextauth]` and `/api/cron/*`, and says Server Actions carry every
other mutation. A chat turn writes up to five rows, so it is a mutation, so it is an action —
the identical reasoning `lib/insights/actions.ts` states in its own header.

**Read before implementing** (AGENTS.md is binding; this is Next 16.3.1):
`node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and
`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`. Three things from
them shape the code below:

1. **Actions dispatch sequentially per client.** Next runs one at a time; a second `handleSend`
   waits for the first. Good here — it is exactly the ordering a conversation needs, and it means
   this action must never be the thing a `Promise.all` on the client tries to parallelise.
2. **This action deliberately calls NO revalidation.** The guide: *"An action that does none of the
   above carries only its return value, and the current route is not re-rendered."* That is what
   we want. Phase 4 renders the returned bubbles into client state behind its staggered reveal
   (RU-5); a `revalidatePath('/nina')` would re-render the server component in the same response
   and race the reveal with a full list that already contains the un-revealed bubbles.
3. **Every action is an untrusted POST endpoint.** `requireUserId()` first, input validated,
   return value shaped to what the UI renders. The `replyToMessageId` the *model* produced is
   re-checked against rows this user owns before it becomes a foreign key — a well-formed id is
   not proof of ownership.

**Code:**

```ts
'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { dbNinaSourceGateway, dbNinaToolGateway } from './gateway'
import { loadNinaContext } from './load'
import { insertNinaMessages } from './queries'
import { MAX_RUNNER_MESSAGE_CHARS, type NinaMemoryWrite } from './schema'
import { runNinaTurn } from './turn'

/**
 * **The one entry point phase 4 calls, from exactly one place: `ChatScreen.handleSend`.**
 *
 * ── THE WRITE ORDER IS PART OF THE CONTRACT ───────────────────────────────────────────────────
 * The runner's message is persisted BEFORE the model is called, and there are two reasons, not
 * one. The obvious one is that a 45 s turn that fails must not lose what he typed — phase 4's
 * "your message is saved" copy is a claim about this ordering. The second is subtler and would
 * bite silently: `loadNinaContext` reads the conversation window out of `nina_messages`, so a
 * message not yet written is a message SHE CANNOT SEE. Insert first, then build the context, and
 * the turn she answers includes the thing she is answering.
 *
 * ── NOTHING HERE THROWS FOR A MODEL PROBLEM ───────────────────────────────────────────────────
 * `runNinaTurn`'s contract. `unavailable: true` with an empty `bubbles` array is the honest
 * answer, and phase 4's screen says she is not replying right now. `ok` is about THE REQUEST —
 * false means it could not be carried out at all (empty input, oversized input, a failed write) —
 * and `unavailable` is about HER. `ok: true, unavailable: true` is the normal degraded turn: his
 * message is safely stored and she did not answer.
 */
export interface SentBubble {
  /** The `nina_messages` row id. Phase 7 quotes it; phase 4 keys its list on it. */
  id: string
  /**
   * The bubble text. Named `body` because this return type is a **DTO**, and `body` is the DTO
   * spelling all the way down: phase 1's `NinaMessageRow.body`, phase 4's destructure, phase 6's
   * `row.body`. The *column* is `text` and phase 2's prompt-layer `MessageInput` is `text` too;
   * `lib/nina/gateway.ts` is the one place those meet. See *Provides → Phase 4* for the table.
   * Nobody "fixes" either side to match the other.
   */
  body: string
  /* Phase 7 adds `replyToId: string | null` here — it already edits this file, and it needs her
   * own quote to render on the optimistic reveal rather than only on the next server render. */
}

export interface SendNinaMessageResult {
  ok: boolean
  userMessageId: string | null
  /**
   * **At most four, guaranteed by `NinaSendPayloadSchema`'s `.max(MAX_BUBBLES)` rather than by a
   * slice here** — so phase 4's `REVEAL_MAX_BUBBLES` assumption is a property of the type, not of
   * a call this function promises to remember to make. Empty iff `unavailable`.
   */
  bubbles: SentBubble[]
  unavailable: boolean
}

const REFUSED: SendNinaMessageResult = {
  ok: false,
  userMessageId: null,
  bubbles: [],
  unavailable: false,
}

/**
 * ── THE ARGUMENT OBJECT IS THE SHAPE FOUR LATER PHASES CONVERGE ON ────────────────────────────
 * One object, agreed up front, each later phase adding exactly one optional field in its own
 * commit — phases 6 (`imageTickets`), 7 (`replyToMessageId`), 8 (`runId`) and 13
 * (`attachExisting`). Both 7 and 8 asked for this in their own plans, and the alternative is four
 * rewrites of this head, which is four merge conflicts and four chances to drop a field. The final
 * shape and the final refusal rule are printed in *The two converged shapes, printed whole*.
 * **At this phase's landing only `body` exists**, so that is all this signature carries; the
 * refusal below is the final rule with its `hasAttachment` term still empty of clauses, not a
 * different rule.
 */
export async function sendNinaMessage(input: { body: string }): Promise<SendNinaMessageResult> {
  const userId = await requireUserId()

  const text = typeof input?.body === 'string' ? input.body.trim() : ''
  /*
   * Both refusals are silent by design. An empty send is a stray Enter key, and an oversized one
   * is a paste of a whole article — neither is worth a persisted row or a 45 s model call, and
   * neither is an error the runner needs explained. The framework's own 1 MB action-body cap sits
   * behind this as the backstop.
   *
   * `text.length === 0` IS the final rule at this landing. Phases 6, 8 and 13 each widen it by one
   * disjunct — `(input.imageTickets?.length ?? 0) > 0`, `input.runId != null`,
   * `input.attachExisting != null` — so an empty body plus an attachment sends. The rule is
   * MONOTONE: every phase adds a clause, none edits one, and the tree is green at each boundary.
   * Phase 7's field adds no clause: answering a message is not a substitute for saying something.
   */
  if (text.length === 0 || text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED

  /*
   * STEP 1 — his message, first. See the header.
   *
   * `insertNinaMessages` is a BATCH and takes no `seq`: `nina_messages.seq` is a `bigserial`
   * assigned by Postgres (phase 1's D-2), which makes it a total order over the whole conversation
   * rather than a within-turn index this file would have to maintain. The DTO field is **`body`**,
   * not `text` — that is `queries.ts`'s spelling for every message-writing and message-reading
   * function it has, because they all go through one shared `messageColumns` projection.
   */
  let runnerMessage: { id: string; createdAt: Date }
  try {
    const [row] = await insertNinaMessages(userId, [{ role: 'runner', body: text }])
    if (row == null) throw new Error('insertNinaMessages returned no row')
    runnerMessage = row
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }

  /*
   * STEP 2 — the two reads, concurrently. `loadNinaContext` reads the recent-20 window and
   * `loadRunHistory` reads the whole reviewed history; both are one `db.batch` over the same
   * bounded table, and running them together makes the duplication cost one round trip of wall
   * clock instead of two. See gateway.ts's Impact note for the clean fix and why it is not taken
   * in this phase.
   */
  const [context, history] = await Promise.all([
    loadNinaContext(userId, dbNinaSourceGateway),
    dbNinaToolGateway.loadRunHistory(userId),
  ])

  /* STEP 3 — the turn. 13–45 s. Never throws for a model problem. */
  const result = await runNinaTurn({
    userId,
    context,
    history,
    sourceMessageId: runnerMessage.id,
    runnerText: text,
  })

  if (result.payload == null) {
    return { ok: true, userMessageId: runnerMessage.id, bubbles: [], unavailable: true }
  }

  /*
   * STEP 4 — `replyToMessageId`, re-checked against rows this user owns. The model produced this
   * id, and a well-formed id is not proof of ownership (the Server Actions guide's own warning).
   * The context window she was given is the authoritative list of what she could legitimately be
   * answering, so it is also the cheapest check — no extra query. Phase 7 owns the quote UI; this
   * is only the column being populated honestly from day one.
   */
  const ownedIds = new Set(context.conversation.window.map((turn) => turn.id))
  const replyToId =
    result.payload.replyToMessageId != null && ownedIds.has(result.payload.replyToMessageId)
      ? result.payload.replyToMessageId
      : null

  /*
   * STEP 5 — one row per bubble (RU-5), in ONE multi-row `INSERT`.
   *
   * ── WHY THIS IS A BATCH AND WHY THAT MAKES THE ORDER A DATABASE FACT ─────────────────────────
   * This file's draft wrote four sequential single inserts carrying `seq: 0..n-1`, and reasoned
   * about the ordering of concurrent writes. None of that is needed and none of it is allowed:
   * `seq` is a `bigserial` and Postgres assigns it, so nothing here supplies one. **Emission order
   * comes free**, because Postgres evaluates `nextval` once per row in `VALUES` order — the first
   * bubble gets the lower `seq`, always, and `insertNinaMessages` returns the rows in that same
   * order with their ids and `seq` already on them. So phase 4's reveal keys on an array order the
   * database itself produced, not on a convention this loop remembered to honour.
   *
   * It is also one round trip instead of four, and — the part that actually matters — it is
   * **atomic**: the half-written four-bubble reply the `catch` below exists for can no longer
   * happen from a partial insert. It can still happen from a failed statement, which is why the
   * `catch` stays.
   *
   * `replyToId` goes on the FIRST bubble only. A four-bubble reply is one answer to one message,
   * and quoting the same message four times would render four identical quote headers.
   */
  const bubbles: SentBubble[] = []
  try {
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        replyToId: index === 0 ? replyToId : null,
      })),
    )
    for (const row of rows) bubbles.push({ id: row.id, body: row.body })
  } catch (cause) {
    console.warn('[nina] could not persist her reply', { error: String(cause) })
    /* His message IS stored; the batch either landed whole or not at all. `ok: false` tells phase
     * 4 to reload the conversation from the server rather than trust this return value — cheaper
     * than reasoning about which of the two states it is in. */
    return { ok: false, userMessageId: runnerMessage.id, bubbles: [], unavailable: false }
  }

  /*
   * STEP 6 — the memory writes she rode along with the reply (ruling b). LAST, and in its own
   * `try`: a fact that failed to save must never cost a reply that succeeded. Phase 5 replaces
   * the INTERPRETATION here — vocabulary, contradictions, the nickname, distillation from the
   * whole turn — and inherits these same two gateway methods, so there is one write path.
   */
  await applyMemoryWrites(userId, result.payload.memoryWrites, runnerMessage.id)

  return { ok: true, userMessageId: runnerMessage.id, bubbles, unavailable: false }
}

async function applyMemoryWrites(
  userId: string,
  writes: readonly NinaMemoryWrite[] | undefined,
  sourceMessageId: string,
): Promise<void> {
  if (writes == null || writes.length === 0) return
  for (const write of writes) {
    try {
      if (write.kind === 'slot' && write.slotKey != null) {
        await dbNinaToolGateway.saveMemorySlot(userId, { key: write.slotKey, value: write.text })
      } else {
        /* A `slot` write with no `slotKey` degrades to a ledger append rather than being dropped.
         * The fact is real either way; only where it belongs is unclear, and phase 5's
         * distillation is the thing that can promote it later. */
        await dbNinaToolGateway.appendMemoryFact(userId, { text: write.text, sourceMessageId })
      }
    } catch (cause) {
      console.warn('[nina] memory write failed', { kind: write.kind, error: String(cause) })
    }
  }
}
```

**Impact:** New `'use server'` module, and the only file in this phase that phase 4 imports.
`lib/nina/actions.ts` is **already** a sanctioned caller of `runNinaTurn` in phase 1's
`GUARDED_CALLS` table, so there is nothing to add to the guard — Step 8.

---

### Step 8: the payload-boundary guard — NOT edited here, and the name is `GUARDED_CALLS`

**File:** `scripts/check-llm-payload-boundary.mjs`
**Change: none. Phase 1 owns this file outright.**

This plan's draft rewrote rule 2 into a table and added `runNinaTurn` to it, on the reasoning that
*"phase 1 cannot know the symbol is called `runNinaTurn`"*. That reasoning is now moot: the symbol
IS `runNinaTurn`, it is fixed by this plan's own contract, and phase 1 ships the **complete** table
whole — one writer on one file instead of two plans racing for the same forty lines. Recorded here
so nobody re-adds the edit.

**The table's name is `GUARDED_CALLS`.** Not `SANCTIONED` (which is the name of one *field* inside
each entry), and not `BLOCKING_CALLS` (which is what this plan's draft called it). The spelling
matters beyond pedantry: phase 5 was written against `BLOCKING_CALLS` **because it read this
plan**, so the wrong name had already propagated once. `GUARDED_CALLS`, everywhere, and this is the
authoritative sentence.

**What phase 1 ships, verbatim, so this phase can verify rather than assume:**

| symbol | sanctioned callers | why |
|---|---|---|
| `getOrCreateInsight` | its existing three | unchanged |
| `runNinaTurn` | `lib/nina/turn.ts`, `lib/nina/actions.ts`, `lib/nina/proactive.ts`, `app/api/cron/nina/route.ts` | F33's turn entry point |
| `distillNinaMemory` | `lib/nina/distill.ts`, `lib/nina/actions.ts` | phase 5 |
| `describeNinaImage` | `lib/nina/actions.ts`, `components/nina/Composer.tsx` | phase 6 |

Note that `lib/nina/turn.ts` is itself one of `runNinaTurn`'s four sanctioned callers — it has to
be, because the guard greps source text and `runNinaTurn`'s own definition and its
`productionDeps()` default argument both name it.

**WHAT THIS PHASE STILL OWES THE GUARD, AND IT IS NOT NOTHING:** the entry point must be **NAMED
`runNinaTurn`**. The guard is a `RegExp` over stripped source; the table's key is a literal string.
Rename the function — to `runTurn`, to `runNinaChatTurn`, to anything — and the guard keeps passing
while guarding nothing at all, which is the worst failure mode a guard has. So the name is a
contract term, stated in `turn.ts`'s own docstring as well as here.

**Verification is unchanged:** `npm run ci:llm-payload-guard` must pass, and must fail if
`runNinaTurn(` is added to any page, layout or component. Two of the four sanctioned paths
(`lib/nina/proactive.ts`, `app/api/cron/nina/route.ts`) do not exist until phase 10 — a `Set` entry
for a file that does not exist is inert, so the guard passes at this phase's landing and needs no
second edit when phase 10 arrives.

---

### Step 9: `tests/fixtures/ninaTurn.ts` — the fake client and the fake gateways

**File:** `tests/fixtures/ninaTurn.ts` (new)
**Change:** Everything the four test files inject. Built on phase 2's `ninaFixtureInput()` so the
numbers asserted are the ones roadmap §4.9 already pins.

**Code:**

```ts
import type Anthropic from '@anthropic-ai/sdk'

import { buildNinaContext, type NinaContext } from '@/lib/nina/context'
import { indexRunsByDate } from '@/lib/nina/dates'
import { NINA_CORE_TOOL_SET, type NinaDetailedRunInput, type NinaRunHistory, type NinaToolGateway } from '@/lib/nina/tools'
import { SEND_TOOL } from '@/lib/nina/prompts'
import type { NinaLlmClientLike, NinaTurnDeps, NinaTurnRow, NinaTurnStore } from '@/lib/nina/turn'
import { ninaFixtureInput, NINA_FIXTURE_TODAY } from './ninaContext'

/**
 * The seam fixtures. Phase 2 built the CONTEXT fixture; this file builds everything needed to
 * drive the LOOP: a scripted client, an in-memory tool gateway, and a recording turn store.
 *
 * ── THE SCRIPTED CLIENT RETURNS A QUEUE, NOT A FUNCTION OF ITS INPUT ─────────────────────────
 * `narrate.ts`'s tests hand back one measured body. A loop needs a SEQUENCE — tool call, then
 * reply — and asserting on the order of the requests is half the point of these tests, so every
 * body sent is recorded in `calls` for the test to inspect.
 */

export function ninaContextFixture(): NinaContext {
  return buildNinaContext(ninaFixtureInput())
}

/** `NinaRunInput` fixtures with splits attached, so the tool handlers have something to enrich. */
export function detailedRunsFixture(): NinaDetailedRunInput[] {
  return ninaFixtureInput().recentRuns.map((run) => ({
    ...run,
    splits: [
      { km: 1, timeSec: 427, paceSec: 427, hr: 148, cadence: 168, partial: false },
      { km: 2, timeSec: 433, paceSec: 433, hr: 155, cadence: 166, partial: false },
      { km: 3, timeSec: 190, paceSec: 452, hr: 159, cadence: 165, partial: true },
    ],
  }))
}

export function runHistoryFixture(runs = detailedRunsFixture()): NinaRunHistory {
  return {
    runs,
    index: indexRunsByDate(runs),
    splitsByRunId: new Map(runs.map((run) => [run.runId, run.splits])),
    zonesByRunId: new Map(runs.map((run) => [run.runId, run.metrics.zonePct])),
  }
}

export interface FakeToolGateway extends NinaToolGateway {
  slots: Array<{ key: string; value: string }>
  facts: Array<{ text: string; sourceMessageId: string | null }>
}

export function fakeToolGateway(history: NinaRunHistory = runHistoryFixture()): FakeToolGateway {
  const slots: Array<{ key: string; value: string }> = []
  const facts: Array<{ text: string; sourceMessageId: string | null }> = []
  return {
    slots,
    facts,
    async loadRunHistory() {
      return history
    },
    async saveMemorySlot(_userId, row) {
      slots.push(row)
    },
    async appendMemoryFact(_userId, row) {
      facts.push(row)
    },
  }
}

export interface FakeTurnStore extends NinaTurnStore {
  rows: NinaTurnRow[]
}

export function fakeTurnStore(): FakeTurnStore {
  const rows: NinaTurnRow[] = []
  return {
    rows,
    async record(_userId, row) {
      rows.push(row)
    },
  }
}

/** A `tool_use` assistant message, as this endpoint returns one. */
export function toolUseMessage(
  name: string,
  input: unknown,
  id = `tu_${name}`,
): Anthropic.Message {
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: 'glm-5.3',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id, name, input } as Anthropic.ToolUseBlock],
    usage: { input_tokens: 100, output_tokens: 50 },
  } as unknown as Anthropic.Message
}

/** A `send` reply. Pass a malformed `input` to drive the repair path. */
export function sendMessage(input: unknown): Anthropic.Message {
  return toolUseMessage(SEND_TOOL.name, input, 'tu_send')
}

/**
 * **The shape this endpoint ACTUALLY returned on round 1, 2026-09-03: a `thinking` block in slot
 * 0, the `tool_use` behind it, despite `thinking: { type: 'disabled' }` being sent.** Not a
 * hypothetical — it is a transcript. Every parse in `turn.ts` scans `content[]`, and this fixture
 * is what proves it: a slot-0 parser passes every other test in the suite and fails this one.
 * See ruling (e).
 */
export function withLeadingThinking(message: Anthropic.Message): Anthropic.Message {
  return {
    ...message,
    content: [
      { type: 'thinking', thinking: 'user asks about wednesday…', signature: '' },
      ...message.content,
    ],
  } as unknown as Anthropic.Message
}

/**
 * `stop_reason: 'max_tokens'` — the shape a turn whose ceiling was ENTIRELY eaten produces. Never
 * repaired: the same prompt at the same ceiling cuts at the same place.
 */
export function truncatedMessage(): Anthropic.Message {
  const message = sendMessage({ bubbles: ['half a th'] })
  return { ...message, stop_reason: 'max_tokens' } as Anthropic.Message
}

export interface ScriptedClient extends NinaLlmClientLike {
  calls: Anthropic.MessageCreateParamsNonStreaming[]
  timeouts: Array<number | undefined>
}

/**
 * Returns each queued message in turn. **Running off the end throws** — deliberately, because a
 * loop that made more calls than the test scripted is the bug the test exists to catch, and an
 * unhelpful default reply would hide it.
 */
export function scriptedClient(queue: Array<Anthropic.Message | Error>): ScriptedClient {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  const timeouts: Array<number | undefined> = []
  let index = 0
  return {
    calls,
    timeouts,
    messages: {
      async create(body, options) {
        calls.push(body)
        timeouts.push(options?.timeout)
        const next = queue[index++]
        if (next == null) throw new Error(`scriptedClient: unexpected call #${index}`)
        if (next instanceof Error) throw next
        return next
      },
    },
  }
}

/** Deps wired to fakes, with a clock the test controls. */
export function fakeTurnDeps(
  client: NinaLlmClientLike,
  overrides: Partial<NinaTurnDeps> = {},
): NinaTurnDeps {
  return {
    client,
    model: 'glm-5.3',
    toolSet: NINA_CORE_TOOL_SET,
    gateway: fakeToolGateway(),
    store: null,
    ...overrides,
  }
}

/** A clock that advances by a fixed step on every read. `NINA_FIXTURE_TODAY` pins the calendar. */
export function steppingClock(startMs = 0, stepMs = 0): () => number {
  let value = startMs
  return () => {
    const current = value
    value += stepMs
    return current
  }
}

export { NINA_FIXTURE_TODAY }
```

**Impact:** New test fixture. Depends on phase 2's `tests/fixtures/ninaContext.ts`
(`ninaFixtureInput`, `NINA_FIXTURE_TODAY`) — contract item 2's fixture exports.

---

### Step 10: the four unit suites

**Files:** `lib/nina/dates.test.ts`, `lib/nina/schema.test.ts`, `lib/nina/tools.test.ts`,
`lib/nina/turn.test.ts` (all new)

`vitest.config.ts` already includes `lib/**/*.test.ts` and aliases `server-only` to a stub, so
`turn.ts` and `gateway.ts` are importable as shipped. `globals: false` — every helper is imported.

**Code — `lib/nina/dates.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import { indexRunsByDate, isRealCalendarDate, resolveDate, resolveDates } from './dates'
import { detailedRunsFixture } from '@/tests/fixtures/ninaTurn'

/**
 * **The user's own two sentences, pinned.** Given today is 2026-09-03:
 *
 *   "na, coba compare run gw tanggal 3 vs 1 bulan ini"  -> 2026-09-03 vs 2026-09-01
 *   "lari gw kemaren gimana menurut lo?"                -> 2026-09-02
 *
 * The Indonesian -> ISO step is HERS (RU-13) and is covered by `tests/live/nina.live.test.ts`.
 * What is pinned here is the half this module owns: that those exact ISO strings resolve to the
 * right day, the right weekday, the right `daysAgo`, and an EXPLICIT absence when nothing ran.
 *
 * `TODAY` is a local constant and deliberately not `NINA_FIXTURE_TODAY` — phase 2's fixture clock
 * is 2026-09-04 in Jakarta, chosen to exercise the UTC+7 boundary, and these cases are the user's,
 * anchored on 2026-09-03.
 */
const TODAY = '2026-09-03'

describe('isRealCalendarDate', () => {
  it('accepts a real day', () => {
    expect(isRealCalendarDate('2026-09-01')).toBe(true)
  })

  it('rejects a day that does not exist, which the ranges.ts regex accepts', () => {
    // The finding this function exists for: `isValidDateISO` is a SHAPE check.
    expect(isRealCalendarDate('2026-02-30')).toBe(false)
    expect(isRealCalendarDate('2026-13-01')).toBe(false)
    expect(isRealCalendarDate('2026-09-31')).toBe(false)
  })

  it('rejects non-strings and free text', () => {
    expect(isRealCalendarDate('kemaren')).toBe(false)
    expect(isRealCalendarDate(null)).toBe(false)
    expect(isRealCalendarDate(20260901)).toBe(false)
  })
})

describe('resolveDate', () => {
  const runs = detailedRunsFixture()
  const index = indexRunsByDate(runs)
  const ranDay = runs[0]!.occurredOn

  it('resolves a day that has a run, with the weekday in both languages', () => {
    const resolved = resolveDate(ranDay, index, TODAY)
    expect(resolved.kind).toBe('runs')
    if (resolved.kind !== 'runs') return
    expect(resolved.runs).toHaveLength(1)
    expect(resolved.dateISO).toBe(ranDay)
    expect(resolved.weekday).toMatch(/^[A-Z][a-z]+day$/)
    expect(resolved.weekdayId).toMatch(/^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)$/)
    expect(resolved.daysAgo).toBeGreaterThanOrEqual(0)
  })

  it('answers "no run that day" EXPLICITLY, not with an empty object — R15', () => {
    const resolved = resolveDate('2026-09-01', new Map(), TODAY)
    expect(resolved.kind).toBe('no_run')
    if (resolved.kind !== 'no_run') return
    expect(resolved.dayLabel).toBe('Tue, 1 Sep 2026')
    expect(resolved.weekdayId).toBe('Selasa')
    expect(resolved.daysAgo).toBe(2)
  })

  it('resolves "kemaren" — 2026-09-02 — to exactly one day ago', () => {
    const resolved = resolveDate('2026-09-02', new Map(), TODAY)
    expect(resolved.kind).toBe('no_run')
    if (resolved.kind !== 'no_run') return
    expect(resolved.daysAgo).toBe(1)
  })

  it('resolves today to daysAgo 0', () => {
    const resolved = resolveDate(TODAY, new Map(), TODAY)
    expect(resolved.kind === 'no_run' && resolved.daysAgo).toBe(0)
  })

  it('refuses a future day rather than reporting no run', () => {
    const resolved = resolveDate('2026-09-10', new Map(), TODAY)
    expect(resolved.kind).toBe('future')
    if (resolved.kind !== 'future') return
    expect(resolved.daysAhead).toBe(7)
  })

  it('names the bad input back when the string is not a day', () => {
    const resolved = resolveDate('2026-02-30', new Map(), TODAY)
    expect(resolved.kind).toBe('invalid')
    if (resolved.kind !== 'invalid') return
    expect(resolved.input).toBe('2026-02-30')
  })

  it('returns BOTH runs on a two-a-days date, earliest start first', () => {
    const day = '2026-08-30'
    const [base] = detailedRunsFixture()
    const morning = { ...base!, runId: 'aaaaaaaaaaaa', occurredOn: day, startedAt: '06:10:00' }
    const evening = { ...base!, runId: 'bbbbbbbbbbbb', occurredOn: day, startedAt: '18:40:00' }
    const resolved = resolveDate(day, indexRunsByDate([evening, morning]), TODAY)
    expect(resolved.kind).toBe('runs')
    if (resolved.kind !== 'runs') return
    expect(resolved.runs.map((run) => run.runId)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
  })
})

describe('resolveDates', () => {
  it('resolves the compare pair from "tanggal 3 vs 1 bulan ini"', () => {
    const resolved = resolveDates(['2026-09-03', '2026-09-01'], new Map(), TODAY)
    expect(resolved.map((r) => r.kind)).toEqual(['no_run', 'no_run'])
  })

  it('collapses duplicates and caps at five', () => {
    const inputs = ['2026-09-01', '2026-09-01', '2026-09-02', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27']
    expect(resolveDates(inputs, new Map(), TODAY)).toHaveLength(5)
  })
})
```

**Code — `lib/nina/schema.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import { MAX_BUBBLES, NinaSendPayloadSchema, describeNinaIssues } from './schema'

describe('NinaSendPayloadSchema', () => {
  it('accepts one to four bubbles', () => {
    for (let n = 1; n <= MAX_BUBBLES; n++) {
      const bubbles = Array.from({ length: n }, (_, i) => `bubble ${i}`)
      expect(NinaSendPayloadSchema.safeParse({ bubbles }).success).toBe(true)
    }
  })

  it('rejects a fifth bubble rather than truncating it', () => {
    // Phase 4's "already clamped to <= 4" is guaranteed by THIS, not by a slice.
    const bubbles = Array.from({ length: 5 }, (_, i) => `bubble ${i}`)
    expect(NinaSendPayloadSchema.safeParse({ bubbles }).success).toBe(false)
  })

  it('rejects zero bubbles and whitespace-only bubbles', () => {
    expect(NinaSendPayloadSchema.safeParse({ bubbles: [] }).success).toBe(false)
    expect(NinaSendPayloadSchema.safeParse({ bubbles: ['   '] }).success).toBe(false)
  })

  it('strips an unknown key instead of failing the whole payload', () => {
    const parsed = NinaSendPayloadSchema.safeParse({ bubbles: ['hi'], vibe: 'smug' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'vibe' in parsed.data).toBe(false)
  })

  it('accepts memoryWrites and rejects a seventh', () => {
    const write = { kind: 'fact' as const, text: 'he hates hills' }
    expect(
      NinaSendPayloadSchema.safeParse({ bubbles: ['hi'], memoryWrites: Array(6).fill(write) })
        .success,
    ).toBe(true)
    expect(
      NinaSendPayloadSchema.safeParse({ bubbles: ['hi'], memoryWrites: Array(7).fill(write) })
        .success,
    ).toBe(false)
  })
})

describe('describeNinaIssues', () => {
  it('names the failing field, which is the measured lever for the repair', () => {
    const parsed = NinaSendPayloadSchema.safeParse({ bubbles: [] })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(describeNinaIssues(parsed.error)).toContain('bubbles')
  })

  it('degrades to a string for a non-Zod error rather than throwing', () => {
    expect(describeNinaIssues(new Error('boom'))).toContain('boom')
  })
})
```

**Code — `lib/nina/tools.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import { indexRunsByDate } from './dates'
import {
  COMPARE_FIELDS,
  NINA_CORE_TOOL_SET,
  compareRunFacts,
  dispatchNinaTool,
  extendToolSet,
  handleCompareRuns,
  handleLookupRuns,
  handleSaveMemory,
  type NinaToolContext,
} from './tools'
import { detailedRunsFixture, fakeToolGateway, runHistoryFixture } from '@/tests/fixtures/ninaTurn'

const TODAY = '2026-09-03'

function ctx(history = runHistoryFixture(), gateway = fakeToolGateway()): NinaToolContext {
  return { userId: 'u1', todayISO: TODAY, history, gateway, sourceMessageId: 'm1' }
}

describe('handleLookupRuns', () => {
  it('carries splits, fastest/slowest km and zones — ruling (d)', async () => {
    const history = runHistoryFixture()
    const day = history.runs[0]!.occurredOn
    const { answer, isError } = await handleLookupRuns({ dates: [day] }, ctx(history))
    expect(isError).toBe(false)
    const days = (answer as { days: Array<Record<string, unknown>> }).days
    expect(days[0]!.kind).toBe('runs')
    const run = (days[0] as { runs: Array<Record<string, unknown>> }).runs[0]!
    expect(Array.isArray(run.splits)).toBe(true)
    expect((run.splits as unknown[]).length).toBeGreaterThan(0)
    expect(run).toHaveProperty('fastestKm')
    expect(run).toHaveProperty('zones')
    // Invariant 3: every number is a spelled string, never a raw metre or second.
    expect(typeof run.distance).toBe('string')
  })

  it('says NO RUN out loud and does not report it as an error', async () => {
    const { answer, isError } = await handleLookupRuns(
      { dates: ['2026-09-01'] },
      ctx(runHistoryFixture([])),
    )
    expect(isError).toBe(false)
    const day = (answer as { days: Array<{ kind: string; situation: string }> }).days[0]!
    expect(day.kind).toBe('no_run')
    expect(day.situation).toContain('NO RUN')
  })

  it('answers a malformed date as a tool result, not a throw', async () => {
    const { answer, isError } = await handleLookupRuns({ dates: ['kemaren'] }, ctx())
    expect(isError).toBe(true)
    expect((answer as { days: Array<{ kind: string }> }).days[0]!.kind).toBe('invalid')
  })
})

describe('compareRunFacts', () => {
  it('precomputes every delta as a spelled string — INVARIANT 2', () => {
    const [a, b] = detailedRunsFixture()
    const deltas = compareRunFacts(a!, { ...b! ?? a!, distanceM: a!.distanceM + 1200 })
    expect(deltas).toHaveLength(COMPARE_FIELDS.length)
    const distance = deltas.find((d) => d.key === 'distance')!
    expect(distance.delta).toMatch(/^\+/)
    expect(distance.direction).toBe('up')
    // No branch of this table may hand back a raw number for the model to subtract.
    for (const delta of deltas) {
      expect(typeof delta.a === 'string' || delta.a === null).toBe(true)
      expect(typeof delta.delta === 'string' || delta.delta === null).toBe(true)
    }
  })

  it('reports "unknown" and never 0 when a reading is missing', () => {
    const [a] = detailedRunsFixture()
    const deltas = compareRunFacts({ ...a!, avgHr: null }, a!)
    const hr = deltas.find((d) => d.key === 'avgHr')!
    expect(hr.direction).toBe('unknown')
    expect(hr.delta).toBeNull()
  })

  it('has no verdict field — the app says what moved, she says whether it was good', () => {
    const [a] = detailedRunsFixture()
    for (const delta of compareRunFacts(a!, a!)) {
      expect(delta).not.toHaveProperty('better')
      expect(delta.higherMeans.length).toBeGreaterThan(0)
    }
  })
})

describe('handleCompareRuns', () => {
  it('asks which run on a two-a-days date instead of picking — ruling (c)', async () => {
    const [base] = detailedRunsFixture()
    const day = '2026-08-30'
    const other = { ...base!, runId: 'cccccccccccc', occurredOn: '2026-08-29' }
    const runs = [
      { ...base!, runId: 'aaaaaaaaaaaa', occurredOn: day, startedAt: '06:10:00' },
      { ...base!, runId: 'bbbbbbbbbbbb', occurredOn: day, startedAt: '18:40:00' },
      other,
    ]
    const history = { ...runHistoryFixture(runs), index: indexRunsByDate(runs) }
    const { answer, isError } = await handleCompareRuns(
      { dateA: day, dateB: '2026-08-29' },
      ctx(history),
    )
    expect(isError).toBe(false)
    expect((answer as { kind: string }).kind).toBe('ambiguous')
    expect((answer as { runs: unknown[] }).runs).toHaveLength(2)
  })

  it('refuses to compare a day with no run, and says which day', async () => {
    const history = runHistoryFixture()
    const day = history.runs[0]!.occurredOn
    const { answer, isError } = await handleCompareRuns(
      { dateA: day, dateB: '2026-09-01' },
      ctx(history),
    )
    expect(isError).toBe(false)
    expect((answer as { kind: string }).kind).toBe('no_run')
    expect((answer as { situation: string }).situation).toContain('NO RUN')
  })

  it('refuses the same day twice', async () => {
    const { answer } = await handleCompareRuns({ dateA: TODAY, dateB: TODAY }, ctx())
    expect((answer as { kind: string }).kind).toBe('same_day')
  })
})

describe('handleSaveMemory', () => {
  it('writes a slot through the one write path', async () => {
    const gateway = fakeToolGateway()
    const { isError } = await handleSaveMemory(
      { kind: 'slot', slotKey: 'usual_running_days', text: 'Tue, Thu, Sun' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(false)
    expect(gateway.slots).toEqual([{ key: 'usual_running_days', value: 'Tue, Thu, Sun' }])
  })

  it('appends a fact with the runner message it was learned from', async () => {
    const gateway = fakeToolGateway()
    await handleSaveMemory({ kind: 'fact', text: 'he hates hills' }, ctx(runHistoryFixture(), gateway))
    expect(gateway.facts).toEqual([{ text: 'he hates hills', sourceMessageId: 'm1' }])
  })

  it('asks for a slotKey rather than inventing one', async () => {
    const { isError } = await handleSaveMemory({ kind: 'slot', text: 'x' }, ctx())
    expect(isError).toBe(true)
  })
})

describe('the dispatch table', () => {
  it('has no handler for send, which terminates the loop', () => {
    expect(NINA_CORE_TOOL_SET.handlers.send).toBeUndefined()
    expect(NINA_CORE_TOOL_SET.tools.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'save_memory',
    ])
  })

  it('ships exactly three handlers — generate_image and set_avatar are phases 12 and 13', () => {
    expect(Object.keys(NINA_CORE_TOOL_SET.handlers).sort()).toEqual([
      'compare_runs',
      'lookup_runs',
      'save_memory',
    ])
  })

  it('extends additively without mutating the core set', () => {
    const tool = { name: 'generate_image', description: 'x', input_schema: { type: 'object' as const } }
    const extended = extendToolSet(NINA_CORE_TOOL_SET, [
      { tool, handler: async () => ({ answer: {}, isError: false }) },
    ])
    expect(Object.keys(extended.handlers)).toHaveLength(4)
    expect(Object.keys(NINA_CORE_TOOL_SET.handlers)).toHaveLength(3)
  })

  it('throws on a duplicate name, at load time, in the phase that added it', () => {
    expect(() =>
      extendToolSet(NINA_CORE_TOOL_SET, [
        {
          tool: { name: 'lookup_runs', description: 'x', input_schema: { type: 'object' as const } },
          handler: async () => ({ answer: {}, isError: false }),
        },
      ]),
    ).toThrow(/already registered/)
  })

  it('turns an unknown tool and a throwing handler into tool results, never exceptions', async () => {
    const unknown = await dispatchNinaTool('teleport', {}, ctx(), NINA_CORE_TOOL_SET.handlers)
    expect(unknown.isError).toBe(true)
    const boom = await dispatchNinaTool('boom', {}, ctx(), {
      boom: async () => {
        throw new Error('nope')
      },
    })
    expect(boom.isError).toBe(true)
  })
})
```

**Code — `lib/nina/turn.test.ts`** (the exit-criteria suite):

```ts
import { describe, expect, it } from 'vitest'

import { LOOKUP_RUNS_TOOL, SEND_TOOL } from './prompts'
import {
  MAX_TOOL_ROUNDS,
  NINA_MAX_TOKENS,
  NINA_MIN_ROUND_BUDGET_MS,
  NINA_TURN_BUDGET,
  runNinaTurn,
  runNinaTurnWith,
} from './turn'
import {
  fakeToolGateway,
  fakeTurnDeps,
  fakeTurnStore,
  ninaContextFixture,
  runHistoryFixture,
  scriptedClient,
  sendMessage,
  toolUseMessage,
  truncatedMessage,
  withLeadingThinking,
} from '@/tests/fixtures/ninaTurn'

function input(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    context: ninaContextFixture(),
    history: runHistoryFixture(),
    sourceMessageId: 'm1',
    runnerText: 'lari gw kemaren gimana menurut lo?',
    ...overrides,
  } as Parameters<typeof runNinaTurnWith>[1]
}

const GOOD = { bubbles: ['lumayan sih', 'tapi hr lo ketinggian'] }

describe('runNinaTurnWith — the happy path', () => {
  it('returns the bubbles from a single send call and makes no tool round', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    expect(result.trace.rounds).toBe(0)
    expect(result.trace.toolCalls).toEqual([])
    expect(client.calls).toHaveLength(1)
  })

  it('drives the loop through a tool call and back — the exit criterion', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs'])
    expect(client.calls).toHaveLength(2)

    // The second request carries the assistant tool_use turn and a matching tool_result.
    const second = client.calls[1]!
    expect(second.messages).toHaveLength(3)
    expect(second.messages[1]!.role).toBe('assistant')
    const results = second.messages[2]!.content as Array<{ type: string; tool_use_id: string }>
    expect(results[0]!.type).toBe('tool_result')
    expect(results[0]!.tool_use_id).toBe(`tu_${LOOKUP_RUNS_TOOL.name}`)
  })

  it('dispatches several tool_use blocks from one assistant turn as ONE round', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const both = {
      ...toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      content: [
        { type: 'tool_use', id: 'a', name: 'lookup_runs', input: { dates: [day] } },
        { type: 'tool_use', id: 'b', name: 'save_memory', input: { kind: 'fact', text: 'x' } },
      ],
    } as Parameters<typeof scriptedClient>[0][number]
    const gateway = fakeToolGateway()
    const client = scriptedClient([both, sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client, { gateway }), input())
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs', 'save_memory'])
    expect(gateway.facts).toHaveLength(1)
  })
})

describe('runNinaTurnWith — the repair', () => {
  it('repairs a malformed send EXACTLY ONCE and then succeeds', async () => {
    const client = scriptedClient([sendMessage({ bubbles: [] }), sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm_repair')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    expect(client.calls).toHaveLength(2)

    // narrate.ts's three-turn text shape, not a tool_result: user -> assistant(text) -> user.
    const repair = client.calls[1]!
    expect(repair.messages).toHaveLength(3)
    expect(repair.messages[1]!.role).toBe('assistant')
    expect(typeof repair.messages[1]!.content).toBe('string')
    expect(repair.tool_choice).toEqual({ type: 'tool', name: SEND_TOOL.name })
  })

  it('degrades after ONE failed repair — never a second', async () => {
    const client = scriptedClient([
      sendMessage({ bubbles: [] }),
      sendMessage({ bubbles: ['a', 'b', 'c', 'd', 'e'] }),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(result.payload).toBeNull()
    expect(client.calls).toHaveLength(2)
  })

  it('does not repair a truncated reply — the ceiling is the bug, not the shape', async () => {
    const client = scriptedClient([truncatedMessage()])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(1)
  })

  it('reports unavailable rather than throwing when the endpoint fails', async () => {
    const client = scriptedClient([new Error('502 Bad Gateway')])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(result.payload).toBeNull()
  })
})

describe('runNinaTurnWith — the budget', () => {
  it('clamps the primary timeout to the primary budget', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.timeouts[0]).toBe(NINA_TURN_BUDGET.primary)
  })

  it('forces send instead of a second tool round when the budget is nearly gone', async () => {
    // Each clock read advances far enough that the round gate fails before the second call.
    let value = 0
    const now = () => {
      const current = value
      value += NINA_TURN_BUDGET.overall - NINA_MIN_ROUND_BUDGET_MS + 1_000
      return current
    }
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage(GOOD),
    ])
    await runNinaTurnWith(fakeTurnDeps(client, { now }), input())
    const last = client.calls[client.calls.length - 1]!
    expect(last.tool_choice).toEqual({ type: 'tool', name: SEND_TOOL.name })
    expect(last.tools).toHaveLength(1)
  })

  it('never makes more than MAX_TOOL_ROUNDS + 1 model calls', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const tool = () => toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] })
    const client = scriptedClient([tool(), tool(), tool(), tool()])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls.length).toBeLessThanOrEqual(MAX_TOOL_ROUNDS + 1)
  })
})

describe('runNinaTurnWith — the request envelope', () => {
  it('DISABLES THINKING on every body — primary, continuation and repair. Never remove.', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage({ bubbles: [] }),
      sendMessage(GOOD),
    ])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.calls).toHaveLength(3)
    for (const body of client.calls) {
      expect(body.thinking).toEqual({ type: 'disabled' })
    }
  })

  /*
   * The other half of ruling (e). Asking for `thinking: disabled` and GETTING a thinking block is
   * what this endpoint measurably did on 2026-09-03, so the loop is asserted against the
   * transcript rather than against the request. These two cases are the ones a `content[0]` parser
   * fails — and it would fail them as "malformed reply", which is why the assertion is on `source`
   * and not merely on `payload`.
   */
  it('finds the send block BEHIND an unrequested thinking block — never content[0]', async () => {
    const client = scriptedClient([withLeadingThinking(sendMessage(GOOD))])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    /* And it did NOT spend the repair budget on a parse bug. */
    expect(client.calls).toHaveLength(1)
  })

  it('finds a tool_use BEHIND a thinking block and completes the round', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      withLeadingThinking(toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] })),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs'])
  })

  it('leaves NINA_MAX_TOKENS room for a thinking block', () => {
    /* Not a magic-number test: the point is that the ceiling is sized for payload PLUS an
     * unrequested thinking block, so a future "tighten this to the payload" edit fails here and
     * reads ruling (e). */
    expect(NINA_MAX_TOKENS).toBeGreaterThanOrEqual(2_400)
  })

  it('sends nothing outside the allowed field surface', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(Object.keys(client.calls[0]!).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'system',
      'thinking',
      'tool_choice',
      'tools',
    ])
  })

  it('never sends an image block — INVARIANT 5', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(
      fakeTurnDeps(client),
      input({ imageDescriptions: ['a plate of nasi goreng, half eaten'] }),
    )
    const serialised = JSON.stringify(client.calls[0]!)
    expect(serialised).not.toContain('"type":"image"')
    // The description arrives as text instead.
    expect(serialised).toContain('nasi goreng')
  })

  it('does not send promptVersion, and still logs it', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    const userTurn = client.calls[0]!.messages[0]!.content as string
    expect(userTurn).not.toContain('promptVersion')
    expect(result.trace.promptVersion).toBeGreaterThan(0)
  })
})

describe('runNinaTurn — the log', () => {
  it('records a row for a successful turn', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]!.source).toBe('llm')
    expect(store.rows[0]!.toolCalls).toBe('')
  })

  it('records a row for a FAILED turn — F31 stopped growing silently and nobody knew', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([new Error('timeout')])
    await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]!.source).toBe('unavailable')
  })

  it('does not let a failed log cost a reply', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const store = {
      async record() {
        throw new Error('nina_turns is on fire')
      },
    }
    const result = await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
  })
})
```

---

### Step 11: the live test and its script

**Files:** `tests/live/nina.live.test.ts` (new), `package.json` line 45 (one script added)

Ruling (f) once left exactly one thing unproven: whether `api.z.ai/api/anthropic` honours a
`tool_use` / `tool_result` pair. **It has been proven directly** — see *Decisions on the open
items* 1 and 2 — so this suite's job is now to keep it proven. `vitest.config.ts` already excludes
`tests/live/**` unless `LLM_LIVE_TEST=1`, and `testTimeout` becomes 180 s under that flag, so this
costs nothing on `npm test`.

**Code — `tests/live/nina.live.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import { LOOKUP_RUNS_TOOL, SEND_TOOL } from '@/lib/nina/prompts'
import { NinaSendPayloadSchema } from '@/lib/nina/schema'
import { ninaClient, ninaModel, runNinaTurnWith } from '@/lib/nina/turn'
import { fakeTurnDeps, ninaContextFixture, runHistoryFixture } from '@/tests/fixtures/ninaTurn'

/**
 * **The one thing the unit suite cannot prove: that this endpoint honours a real tool round
 * trip.** Ruling (f) — an agentic loop has no text-shaped alternative to `tool_use` /
 * `tool_result`, and `api.z.ai/api/anthropic` is Anthropic-*compatible*, not Anthropic.
 *
 * **This suite is a REGRESSION guard, not an experiment.** The 2026-09-03 probe already answered
 * both questions yes, with numbers: `tool_choice: {type:'any'}` honoured, `tool_use` emitted,
 * `tool_result` accepted on the next turn, round 2 answering with another `tool_use` and quoting
 * the injected facts faithfully, 6.2 s + 7.6 s = 13.8 s for the two-round turn. So a failure here
 * is a *change* at the endpoint, and the documented escape (two plain text turns instead of tools)
 * is a phase-shaped decision to reach for then — not a live branch carried in the code now.
 *
 * Named `live` so `npm run test:live` picks it up; excluded from every default run.
 */
describe('nina live', () => {
  it('completes a real tool round trip and returns a valid send payload', async () => {
    const result = await runNinaTurnWith(
      fakeTurnDeps(ninaClient(), { model: ninaModel() }),
      {
        userId: 'live',
        context: ninaContextFixture(),
        history: runHistoryFixture(),
        sourceMessageId: null,
        runnerText: 'na, coba compare run gw tanggal 3 vs 1 bulan ini',
      },
    )
    expect(result.source).not.toBe('unavailable')
    expect(NinaSendPayloadSchema.safeParse(result.payload).success).toBe(true)
  })

  it('live: accepts tool_choice { type: "any" } without a 400', async () => {
    const message = await ninaClient().messages.create({
      model: ninaModel(),
      max_tokens: 256,
      system: 'Call a tool. Say nothing else.',
      messages: [{ role: 'user', content: 'What did I run on 2026-09-01?' }],
      tools: [SEND_TOOL, LOOKUP_RUNS_TOOL],
      tool_choice: { type: 'any' },
      thinking: { type: 'disabled' },
    })
    expect(message.content.some((block) => block.type === 'tool_use')).toBe(true)
  })
})
```

**Code — `package.json`, after the existing `test:live:narrate` line:**

```json
    "test:live:nina": "LLM_LIVE_TEST=1 vitest run tests/live/nina.live.test.ts"
```

**Impact:** No effect on `npm test`. `npm run test:live:nina` costs two real model calls.

---

## Verification

**Build:**

```
npm run typecheck && npm run lint
```

**Tests:**

```
npm test
npm run ci:llm-payload-guard
npm run ci:data-layer-guard && npm run ci:client-secret-guard && npm run ci:openrouter-guard && npm run ci:f08-guard && npm run ci:f11-guard
```

Invariant 1 is the whole gate: **every** `ci:*` script must pass, not just the one this phase
edits. `ci:openrouter-guard` matters here even though nothing in this phase touches OpenRouter —
phase 1 narrows its `DIRS` for RU-2, and this phase adds four files to `lib/nina/`, which is
exactly where that narrowing applies.

**Optional, costs money — the REGRESSION guard, not the experiment:**

```
npm run test:live:nina
```

The experiment has already been run: the probe recorded in the plan index's *Verified live,
2026-09-03* section settled every protocol question this phase had (see *Decisions on the open
items* 1 and 2). So this script is no longer the thing that decides whether the architecture is
possible; it is what you run **against any endpoint or model change** — a new `LLM_MODEL`, a
z.ai-side upgrade, a base-URL move — because those are exactly the changes that can silently take
`tool_result` support away again.

**Manual check:** none possible in this phase — there is no UI until phase 4. The live test is
still the only way to *see* a real turn before a screen exists to see it in.

**Exit criteria, each mapped to the check that proves it:**

| Exit criterion | Proven by |
|---|---|
| An injected fake client drives the loop through a tool call and back | `turn.test.ts` — "drives the loop through a tool call and back", asserting the `tool_result` block and its `tool_use_id` |
| A malformed reply triggers exactly ONE repair then degrades | `turn.test.ts` — "repairs a malformed send EXACTLY ONCE" and "degrades after ONE failed repair", both asserting `client.calls.length === 2` |
| `compare_runs` returns PRECOMPUTED deltas, never a raw run pair | `tools.test.ts` — "precomputes every delta as a spelled string", which walks every field and rejects any non-string value |
| A date with no run yields an explicit absence | `dates.test.ts` — "answers 'no run that day' EXPLICITLY"; `tools.test.ts` — "says NO RUN out loud" on both the lookup and the compare path |
| The entry point is NAMED `runNinaTurn`, which is what phase 1's `GUARDED_CALLS` table greps for | `npm run ci:llm-payload-guard` passes, and fails if `runNinaTurn(` is added to any page or component. This phase edits nothing in that script — Step 8 |
| The turn stops itself before the platform does | `turn.test.ts` — "forces send instead of a second tool round when the budget is nearly gone" and "never makes more than MAX_TOOL_ROUNDS + 1 model calls" |
| R15's two user sentences resolve correctly | `dates.test.ts` — the `TODAY = '2026-09-03'` block; the Indonesian half **already measured live**: given only *"Today is Wednesday 2026-09-03"*, *"na, lari gw kemaren gimana?"* produced `lookup_runs({dates:["2026-09-02"]})` with no date-parsing machinery on our side at all — RU-13 validated. `tests/live/nina.live.test.ts` now guards it against regression |
| Thinking is disabled on every body | `turn.test.ts` — "DISABLES THINKING on every body" |
| A `thinking` block that arrives ANYWAY does not break the parse | `turn.test.ts` — "finds the send block BEHIND an unrequested thinking block" and "finds a tool_use BEHIND a thinking block", both built on the 2026-09-03 transcript |
| `NINA_MAX_TOKENS` has room for that block | `turn.test.ts` — "leaves NINA_MAX_TOKENS room for a thinking block" |
| `glm-5.3` is never sent an image | `turn.test.ts` — "never sends an image block" |

**Not provable in this phase, and named so nobody claims it:** that Nina's replies are good, funny,
or pass for human. That is R1's qualitative half, it belongs to phase 2's prompt and phase 4's
screen, and no assertion in this phase touches it.

## Handoffs

Work found and deliberately left to the phase that owns it.

- **`export const maxDuration = 60` on `app/nina/page.tsx` → LANDED IN PHASE 4.** Not a request any
  more; a record. A Server Action's timeout is the **page segment's**, not the action file's —
  `app/r/[id]/page.tsx:65` already states this, quoting Next's `maxDuration` reference, and
  `app/trends/page.tsx` and `app/r/[id]/page.tsx` both carry the line for exactly this reason.
  Without it, `sendNinaMessage` is capped at the platform default, the 45 s budget in
  `NINA_TURN_BUDGET` is **fiction**, and the symptom is not an error message — it reads as an
  intermittent bug, because a short turn succeeds and a long one dies at whatever the default
  happens to be. That is why it was raised loudly from here despite being someone else's line of
  code. **Phase 4 owns `app/nina/page.tsx` and adds the line and the comment there.** Nothing left
  for this phase to do but state the coupling, which the budget table in Step 6 also does.
- **`loadNinaContext` taking a pre-loaded history → recorded, deliberately deferred.**
  `getReviewedRunsWithChildren` runs twice per turn (once for the recent-20 window, once for the
  tools' full history). Both fire concurrently, so the wall-clock cost is one query. The clean fix
  is a second optional parameter on `loadNinaContext` — phase 2's file, and **phase 2 has recorded
  it** rather than either of us taking it: the same parameter wants to move together with
  `lib/insights/load.ts` and `recomputeRecords`, which is one card and not three. See *Decisions on
  the open items* item 5.
- **`export function buildNinaRunFact` → Phase 2 / the reconciler.** Contract item 1. The one
  edit outside this phase that this phase cannot work without.
- **A shared `LlmClientLike` in `lib/llm/clientLike.ts` → nobody yet.** There are now two identical
  twelve-line client seams (`narrate.ts` and `turn.ts`). Hoisting them is right the third time,
  not the second: doing it now means editing F07's file for a refactor with no behaviour change,
  and phase 6's `vision.ts` will want a differently-shaped one anyway.
- **`send.memoryWrites` interpretation → Phase 5.** This phase writes rows verbatim through two
  gateway methods (ruling b). The vocabulary, the contradiction handling, the nickname, and any
  distillation pass over a finished turn are phase 5's, and they inherit the same two methods —
  there is no second write path to reconcile.
- **The reply-to UI → Phase 7.** This phase populates `nina_messages.reply_to_id` from a validated
  `replyToMessageId` because the field is on the payload this phase owns. The quote rendering, the
  scroll-to-target, and the runner's own ability to quote are phase 7's.
- **`dropped:` tool calls in `nina_turns` → Phase 10's observability, if ever.** The loop records
  `dropped:save_memory` when she calls a tool alongside `send`. Nothing reads that column yet. If
  it turns out to be common, dispatching write-only tools before returning is a small change to
  one branch of `runNinaTurnWith` — a card, not a patch.
- **`readFiredPatterns` / `readNags` returning `[]` → Phase 9.** Two method bodies in
  `lib/nina/gateway.ts`, and nothing else in this phase changes.
- **`imageDescriptions` defaulting to `[]` → Phase 6.** One `??` in `gateway.ts` and the
  `NinaTurnInput.imageDescriptions` field, already wired through `userTurnText`.
- **`generate_image` / `set_avatar` dispatch → Phases 12 and 13.** `extendToolSet` is the entire
  seam; neither phase needs to edit `tools.ts` or `turn.ts`.
- **A dedicated `nina.png` avatar read → Phase 13.** Not this phase's business at all; noted only
  because `NinaAvatar` is the one phase-4 component that reads a phase-1 asset.
- **`AGENTS.md`'s regenerated block.** `next dev` rewrites the `AGENTS.md` / `CLAUDE.md` block. If
  it shows up as an uncommitted change, commit it with this phase's work — reverting only
  re-creates it.

## Decisions on the open items

RU-21 forbids parking a question here for someone else to answer, so every item below is a
decision: **decided X because Y; revisit if Z.** Two of them were decided by *measurement*, which
is the best way to lose an argument.

### 1. `api.z.ai/api/anthropic` DOES honour a `tool_use` / `tool_result` pair. Measured.

**Decided: the architecture in this phase stands, unchanged.** This was the one genuinely unproven
thing in the plan (ruling f), and it was probed directly against `glm-5.3` on 2026-09-03 — the
result is recorded in the plan index's *Verified live, 2026-09-03* section:

| probed | result |
|---|---|
| `tool_choice: { type: 'any' }` honoured | **yes** |
| `tool_use` block emitted | **yes** |
| `tool_result` accepted on the next turn | **yes** |
| round 2 answered with another `tool_use` | **yes**, and it quoted the injected facts faithfully |
| latency | **6.2 s + 7.6 s = 13.8 s** for the whole two-round turn |

Two things follow beyond "it works". First, **13.8 s for two rounds is less than half the 36 s
ordinary worst case** `NINA_TURN_BUDGET` was sized against, so the 45 s overall is generous rather
than tight — which is the right direction for a budget to be wrong in, and the numbers stay
unchanged because they were sized on fifteen calls and not on one. Second, *"quoted the injected
facts faithfully"* is the property RU-4 and invariant 3 actually depend on: a tool answer she
paraphrases into new numbers would be worse than no tool at all.

**The named fallback is NOT needed and is NOT built.** Dropping the loop and serving `lookup_runs`
/ `compare_runs` as a *second plain text turn*
(`assistant(json) → user(here are the facts you asked for)`) remains written down — as a
**documented escape**, one paragraph in this plan, reachable if the endpoint ever changes under us.
It is deliberately not a live branch: a fallback path nobody exercises is a second untested
architecture, and this one would have to duplicate every tool's answer shape.

*Revisit if* `tests/live/nina.live.test.ts` ever fails — which is now its whole job. Any
`LLM_MODEL` change, z.ai-side upgrade or base-URL move is a reason to re-run it before shipping.

### 2. `tool_choice: { type: 'any' }` is accepted. Measured, same probe.

**Decided: `{ type: 'any' }` on every non-final call, `{ type: 'tool', name: 'send' }` on the
final one, exactly as `ninaBody` builds them.** F07 had only ever sent the narrow form, so this was
an open risk; it is now a measurement. `{ type: 'any' }` is what turns `OUTPUT_RULE`'s "never write
prose outside a tool call" from a request in the prompt into a property of the request, and the
whole tool loop depends on it — with `{ type: 'auto' }` she may answer in prose, which this loop
correctly reads as malformed and then repairs, burning a round to re-learn something the request
could have enforced.

**The ordered fallbacks stay documented, not built:** `{ type: 'auto' }` first, then
`{ type: 'tool', name: 'send' }` on every call — and note what the second one costs, because it is
easy to reach for by accident: it **silently disables the tool loop entirely**, since `send` is the
only tool she can ever call. That is precisely why this had to be caught by a live test rather than
in production, where the symptom would be "she stopped looking anything up" with nothing failing.

*Revisit if* the live test's second case ever 400s.

### 3. `MAX_BUBBLE_CHARS = 700` stays at 700.

**Decided: keep 700, because it is a judgement about her voice and there is no measurement that
would improve it before real use.** A number chosen by argument is not a bug; a number chosen by
argument and never re-examined is. So the signal that moves it is named and is recorded from day
one: **`nina_turns.status = 'repaired'` — this phase's `source: 'llm_repair'`** — which is what a
ceiling she keeps overshooting looks like from the outside.

*Revisit if* repairs cluster on `bubbles[i]` length (raise it), or if bubbles start reading as
essays in a chat window (lower it). Either way the change is one constant in `lib/nina/schema.ts`
and one number in its test.

### 4. Whether `save_memory` ever fires is decided by ruling (b)'s empirical exit, and the evidence
is now READABLE.

**Decided: both paths ship, with a falsifiable exit condition, and the exit is decidable because
`nina_turns.tool_calls` is `text` holding comma-joined tool NAMES.** That column was drafted by
phase 1 as an `integer` count, and a count cannot answer this question — "how many tools fired"
tells you nothing about *which*. Ruling (b) is the reason it changed, and the change is what turns
"we should watch whether this tool is dead weight" into a query.

The exit, restated so nobody has to reconstruct it: if `save_memory` has not appeared in
`tool_calls` after a week of real use, drop it from `NINA_CORE_TOOL_SET` — one line, no other file
— and keep `send.memoryWrites`. If it *has*, ruling (b)'s "a fact she needs written before she
speaks" was a real case and both paths stay.

*Revisit if* a week of real turns shows the column empty of it. `dropped:save_memory` in the same
column is a *different* reading and means something else: she wanted the tool and `send` won the
race, which argues for dispatching write-only tools before returning rather than for deleting the
tool.

### 5. Two `getReviewedRunsWithChildren` calls per turn: ACCEPTED.

**Decided: accepted as it stands.** They fire concurrently in Step 7's `Promise.all`, so the cost
is ~one round trip of wall clock and ~400 rows of memory against a table with ~200 rows a year.
Paying a second read of a small table to avoid a second writer on phase 2's file is the right trade
at this size.

**And the fix is already recorded rather than merely named:** phase 2 has written down that it is
*one optional parameter* on `loadNinaContext` — a pre-loaded history passed in — and that it should
move **together with `lib/insights/load.ts` and `recomputeRecords`, in one card**, because all
three re-read the same reviewed-runs history and all three stop being fine at the same moment.
Three small edits in one card beats the same edit three times in three phases.

*Revisit if* the reviewed-run count passes a few thousand, or if a turn's read time shows up in
`nina_turns.latency_ms` as anything other than noise.

### 6. Comparisons that are NOT in `COMPARE_FIELDS`, because F06 does not compute them.

**Not an open question — a list, and invariant 2 is why it belongs in the plan.** Each of these is
**a card against F06**, and **none of them is a calculation in a tool**: a tool that derived a
number the app cannot derive would become a second, invisible metrics authority answering only to
the model, and `compareRunFacts` would stop being "differences the app already worked out". The
list, by name:

- **grade-adjusted pace** — without it a hilly run and a flat one are not comparable at all, which
  makes this the most load-bearing absence on the list;
- any **weather or temperature** adjustment;
- **training load / TSS / ACWR as a per-run number** (phase 9 computes an ACWR *pattern*, which is
  a different thing and must not be mistaken for this);
- **VO2max or race-time prediction**;
- a **side-by-side split table** beyond `fastestKm` / `slowestKm`;
- anything involving **body-weight arithmetic** — RU-1 lets weight into the payload, and
  `NUMBERS_RULE` still forbids her deriving a BMI or a calorie target from it.

*Revisit* each individually, as its own F06 card. Adding any of them to `COMPARE_FIELDS` **after**
F06 computes it is a one-line change here, which is the whole reason `COMPARE_FIELDS` is a table.

### 7. The `role` column's type: decided, and `toRole` is DELETED.

**Decided: import phase 1's `NinaRole = 'runner' | 'nina'` and delete this phase's `toRole`
narrowing function.** The draft carried `toRole(value: string): MessageRole` because it did not
know whether phase 1 would ship `role` as a bare `text`; phase 1 exports the union, and
`NinaMessageRow.role` already carries it. A runtime coercion in front of a type the data layer
guarantees is a second and weaker definition of the same domain — and worse, its
`value === 'nina' ? … : 'runner'` would rewrite a genuinely bad row into a plausible one instead of
failing where someone could see it.

What replaces it in `gateway.ts` (Step 5) is a **type-level** assertion that the two layers' role
unions are mutually assignable, which costs nothing at runtime and fails the build the day they
diverge. `role` is the one field that crosses the DTO boundary unchanged, so it is the one field a
mapper cannot document by mapping it.

*Revisit if* phase 1 ever widens `NinaRole` — e.g. an `'operator'` role — in which case the
assertion fails first and points straight at phase 2's `MessageRole`, which is exactly the
behaviour wanted.

### 8. Phase 4's `body` versus the column's `text`: DECIDED, and it is not a conflict.

**Decided: three layers, three spellings, one mapper — and the mapper is `lib/nina/gateway.ts`,
this phase's file.** This plan's draft argued that `text` should win everywhere and that phase 4's
one destructure should be edited to match. **That position is overruled and it was the wrong shape
of answer**: it read an ordinary data-access boundary as a naming mistake. Columns are `text` /
`sent_at`; `lib/nina/queries.ts`'s DTO (`NinaMessageRow`, `NinaMessageInsert`) is `body` /
`createdAt` uniformly in every function, because they all select through one shared
`messageColumns`; phase 2's `MessageInput` is `text` / `sentAt`. `gateway.ts` maps
`text: row.body, sentAt: row.createdAt` and that is the entire translation. **No side is to be
"fixed" to match another.** The full table is in *Provides → Phase 4*.

*Revisit if* a fourth layer ever appears — which would be the actual smell, and the answer would be
to delete a layer, not to add a fourth spelling.

## Rollback

This phase creates six source files, six test files, and makes **one** small edit — one, not two:
`scripts/check-llm-payload-boundary.mjs` is phase 1's file and is not touched here (Step 8), which
takes a genuinely awkward hazard out of this revert. See below.

```
rm lib/nina/turn.ts lib/nina/tools.ts lib/nina/schema.ts lib/nina/dates.ts \
   lib/nina/gateway.ts lib/nina/actions.ts \
   lib/nina/turn.test.ts lib/nina/tools.test.ts lib/nina/schema.test.ts lib/nina/dates.test.ts \
   tests/fixtures/ninaTurn.ts tests/live/nina.live.test.ts
git checkout -- package.json
```

The tree is then green with phases 1 and 2 landed and no phase 3: nothing in either of those
phases imports anything from this one — phase 2's *Leaves alone* list names every file above.

**Two things to know before reverting:**

- **Phase 4 cannot survive this revert.** `components/nina/ChatScreen.tsx` imports
  `sendNinaMessage`. Reverting phase 3 means reverting phase 4 as well, in that order.
- **`scripts/check-llm-payload-boundary.mjs` MUST NOT be reverted, and this phase gives no reason
  to.** The draft of this plan edited that file, which made the revert genuinely dangerous: a
  blanket `git checkout --` on it would also have taken out phase 1's rule-1 repeal, and invariant
  8 ("a repeal is a rewrite, not a deletion") makes that header text load-bearing. Phase 1 now owns
  the file whole (Step 8), so there is nothing of this phase's in it and the hazard is gone.
  Recorded rather than deleted, because the hazard was real and someone re-adding the edit should
  know what they are re-adding. Note the guard keeps passing after the revert: a `Set` entry naming
  a file that no longer exists is inert.

No migration is involved: `nina_messages`, `nina_memory_*` and `nina_turns` are phase 1's, and a
revert of this phase leaves them empty rather than wrong.
