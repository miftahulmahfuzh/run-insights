# Code Analysis: Nina burst handling — cancel-and-retarget an in-flight turn

**Type:** Feature Implementation
**Date:** 2026-09-10 09:02 WIB
**Session ID:** 20260910-090235-A7C2
**Plan:** `NINA_BURST_CANCEL_PLAN.md` (2 phase(s))
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-burst-cancel` — branch `feature/nina-burst-cancel` (base `origin/main` @ `204fd34`)

---

## User Input

### Original User Request

> there is this scenario:
> 1. user: mau kemana hari ini?
> 2. nina: ... (lagi proses jawab)
> 3. user: dan mau makan apa lunch?
> 4.
>
> in this case, make system cancel no 2 process. and start no 4, but nina now answer BOTH of no 1 and 3.
> so user can "type in fast and press enter", and nina will adapt and as long as she hasn't started answering, she will cancel her current thinking process and answer the accumulated user bubbles

### User-Provided Context

None beyond the scenario itself. The Bahasa Indonesia scenario lines translate as: "where do you want to go today?" (1), "still processing the answer" (2), "and what to eat for lunch?" (3), the new combined answer (4).

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | When a new send arrives while the current turn is still thinking (she has not started answering), CANCEL that turn's process and start a fresh turn in its place — so "type in fast and press enter" re-targets the conversation instead of queueing behind the old answer |
| R2 | The fresh turn answers the ACCUMULATED user bubbles — every message sent while she was thinking — not only the newest one |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: Today a fast follow-up send while Nina is thinking is persisted but deliberately does NOT start a turn — `openNinaChatTurn` refuses while a claim is live — and the running turn's chain picks the message up only AFTER the full 13–45 s answer to the first message has landed (`runNinaBackgroundTurn`'s chain block). The runner therefore watches one answer to message 1, then waits another full turn for message 3. The request is that the second send *cancels* the still-thinking turn and restarts one turn whose answer covers both messages, with one guard: the cancel is allowed only while she has not started answering.

**Success Criteria**:
1. Runner sends message A; while the turn for A is still in its thinking phase (model call in flight, nothing persisted), runner sends message B. Message B's send must close A's turn as superseded, open a new turn, and start it in the background — one round trip, no change to what the client already does.
2. The new turn's prompt carries BOTH messages as things to answer, and her reply addresses both.
3. If the old turn has already progressed past thinking (model answered, rows going in — the `'persisting'` phase), the cancel is NOT allowed: the new message keeps today's behavior (chained follow-up turn after the current one finishes).
4. The superseded turn's invocation, when its model call eventually returns, must persist NOTHING — no bubbles, no distillation — and must not start a chain.
5. The ledger stays honest: the superseded row records what happened (`status='failed'`, a reason on `error_code`), the discarded call's token usage is still written, and nothing about the row can be left `pending`.
6. No client change is required for the core flow (verified below — the screen already supports it).

**Key Considerations**:
- **"Hasn't started answering" has an exact database meaning.** Bubbles are inserted atomically at the END of a turn, and the moment the model returns the turn's `error_code` phase advances `'running'` → `'persisting'` (`ninaChatTurnStore.record`). So the cancellable window is exactly `status='pending' AND error_code='running'`; `'persisting'` means she is already answering.
- **The cancel and the answer must be atomic against each other.** Two writers race on one row: the new send wants `pending/running → failed/superseded`; the old turn wants `pending/running → pending/persisting`. Both must be single conditional UPDATEs so Postgres row locking picks exactly one winner, and the loser must back off cleanly (send → chain path; turn → discard path). A read-then-write on either side is a double-answer bug.
- **The wasted model call is accepted.** The superseded turn's LLM call cannot be aborted cross-invocation (the turn runs in a different serverless invocation than the send). The design lets it finish and discard the result. Aborting the in-flight HTTP request via a DB poll is deliberately NOT built — see Decisions.
- **Shortcut telemetry on a discarded turn still counts** (`bumpNinaShortcutUses` sits above the early returns on purpose, and its existing rationale — "a reply she failed to produce does not un-fire it" — covers a superseded turn).
- **Zero-byte invariant (invariant 2 of the prompt layer):** a turn with no accumulated messages must produce a user turn byte-identical to today's.
- **The existing burst chain stays.** It covers the "she already started answering" branch and the burst that arrives while she is between turns.

---

## Analysis Scope

### Explicitly Mentioned Files

None (`@`-files absent). Target inferred: the Nina chat turn pipeline.

### Discovered Related Files

- `lib/nina/actions.ts` — `sendNinaMessage` (the send), `runNinaBackgroundTurn` (the turn + its chain), `startNinaBackgroundTurn` (the `after()` seam), `pollNinaReply`
- `lib/nina/chatturn.ts` — the claim: `openNinaChatTurn`, `closeNinaChatTurn`, `getPendingNinaChatTurn`, `sweepStaleNinaChatTurns`, `ninaChatTurnStore`, `ninaSessionExists`
- `lib/nina/turn.ts` — `runNinaTurn` / `runNinaTurnWith`, `NinaTurnInput`, `userTurnText` (the prompt builder), `NINA_TURN_BUDGET`
- `lib/nina/turnflight.ts` — shared client/server timing constants, `ninaAwaitingByMessage`, `ninaFlightView`, `NINA_TURN_CHAIN_MAX`
- `lib/nina/gateway.ts` — `dbNinaTurnStore` (the INSERT-path store), `STATUS_BY_SOURCE`
- `lib/nina/queries.ts` — `listNinaMessages` (returns OLDEST FIRST after an internal reverse; `limit: 1` therefore yields exactly the newest row), `listNinaMessagesAfter`, `insertNinaTurn`, `insertNinaMessages`
- `lib/db/schema.ts:579` — `nina_turns`: `status` domain `NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'`; `error_code` free text doubling as the phase while `pending`
- `components/nina/ChatScreen.tsx` — the client screen: `busy` released on action return (fast re-send already possible), poll loop, `sendAndTrack`, reveal
- `components/nina/Composer.tsx` — the input (no change needed)
- `lib/nina/proactive.ts`, `app/api/cron/nina/route.ts` — share `runNinaTurn` but NOT the claim machinery (verified: no `openNinaChatTurn`/`ninaChatTurnStore` references)
- `lib/nina/jobview.ts` — `jobErrorLabel` falls through to the raw code; jobs pages read `kind='image'` rows only, so a new chat error-code string breaks no UI
- `tests/nina.resend.test.ts` — the existing harness that drives the send path and drains `after()`'s queue by hand
- `lib/nina/turn.test.ts`, `lib/nina/turnflight.test.ts`, `tests/fixtures/ninaTurn.ts` — turn-loop and flight test infrastructure

---

## Current Dataflow

### Entry Point: `sendNinaMessage`

**Location:** `lib/nina/actions.ts:320`
**Trigger:** Server Action from `ChatScreen.sendAndTrack` (client)
**Input:** `{ body, imageTickets?, replyToMessageId?, runId?, attachExisting?, sessionId }`
**Validation:** refusal rule (empty everything), ticket verification, reply-target/run/attachment ownership, session resolution
**Next Step:** persists the runner row (STEP 1) + image rows (STEP 1b), then the claim sequence

### The claim sequence (STEP 1c, `lib/nina/actions.ts:709-751`)

1. `sweepStaleNinaChatTurns(userId)` — closes `pending` rows older than `NINA_TURN_STALE_MS` (90 s).
2. `openNinaChatTurn(userId, { sessionId, runnerMessageId, depth: 0 })` (`lib/nina/chatturn.ts:146`) — **returns null when a live claim exists** (`getPendingNinaChatTurn` non-null and younger than 90 s). Null is the ordinary burst case, not a failure.
3. If `turnId !== null`: `startNinaBackgroundTurn` → `after(() => runNinaBackgroundTurn(input))`. If null: return — the running turn's chain is expected to pick the message up.

### Processing Chain: `runNinaBackgroundTurn`

**Location:** `lib/nina/actions.ts:829`

1. `Promise.all` — context window (`loadNinaContext`), run history, tuning, shortcuts.
2. `runNinaTurn(...)` with `{ ...productionDeps(), toolSet: NINA_FULL_TOOL_SET, store: ninaChatTurnStore(turnId) }` — the 13–45 s model loop (`lib/nina/turn.ts:690` for the loop; `turn.ts:1011` for the entry, which calls `store.record` after the loop).
3. `store.record` (`lib/nina/chatturn.ts:181`) — **unconditional UPDATE**: metrics + `error_code` phase → `'persisting'`. This is the "she is about to answer" boundary today, and it does NOT check that the row is still `pending`.
4. Shortcut bump (fire-and-forget), session-exists check, bubble INSERT (one multi-row INSERT), `closeNinaChatTurn` (conditional on `status='pending'` — idempotent), distillation, auto-title.
5. **THE CHAIN** (`lib/nina/actions.ts:1140-1205`): if `depth < NINA_TURN_CHAIN_MAX` (2) and wall-clock budget remains and the newest row in the session is HIS — open a claim at `depth+1` and recursively run one more turn for the newest message. This is the ONLY mechanism that answers a message sent mid-turn today.

### The claim row (`nina_turns`, `lib/db/schema.ts:579`)

- While `status='pending'`, `error_code` is the phase: `'running'` (set at open) → `'persisting'` (set by `ninaChatTurnStore.record` when the model answered).
- `closeNinaChatTurn` transitions `pending → ok | repaired | failed` with `WHERE status='pending'` (idempotent).
- `getPendingNinaChatTurn` (`lib/nina/chatturn.ts:86`) — newest pending chat row for the session, phases filtered to `['running','persisting']`.
- `pollNinaReply` (`lib/nina/actions.ts:1502`) — `awaiting = live || ninaAwaitingByMessage(newest)`; the second disjunct already covers any hand-off gap.

### Client (`components/nina/ChatScreen.tsx`)

- `busy` is released the moment `sendNinaMessage` returns (`ChatScreen.tsx:1305`): **a second send while she thinks is already possible** — the composer is live, the optimistic bubble appends, and `setAwaiting(true)` runs unconditionally including when `turnId` is null.
- The poll loop runs while `awaiting`, delivering `role='nina'` rows after the cursor through the staggered reveal. It never stops on first bubbles — the server's `awaiting` is the stop condition.
- Consequence: **the client needs no change for R1's flow.** A cancel-and-restart is invisible to it: the typing indicator continues (the new claim is `pending`), and the combined answer arrives through the existing poll.

### Data Persistence

**Database:** `nina_messages` (runner row inserted BEFORE the model is called; her bubbles in one multi-row INSERT at turn end, stamped `turn_id`); `nina_turns` (one row per turn: open at claim → metrics+phase at model answer → close after bubbles land).
**Cache:** none on this path.

### Exit Points

- `SendNinaMessageResult { ok, userMessageId, sessionId, cursor, turnId }` — client does not branch on `turnId`.
- Her bubbles reach the screen only via `pollNinaReply` (or a cold-load server render).

---

## Key Data Structures

### `PendingNinaChatTurn`
**Location:** `lib/nina/chatturn.ts:71`
**Fields:** `{ id, createdAt, phase }` — the live claim as read by send and poll.

### `NinaChatTurnArgs`
**Location:** `lib/nina/chatturn.ts:63`
**Fields:** `{ sessionId, runnerMessageId, depth }` — `nina_turns.args` jsonb for `kind='chat'`.

### `NinaTurnInput`
**Location:** `lib/nina/turn.ts:254`
**Fields:** context, tuning, history, `runnerText` (what he just typed; rendered as `HE JUST SAID:`), `imageDescriptions`, `quoted`, `attachedRunId`, `shortcuts`, `recentRunnerTexts`, `proactive`. **This is where R2's accumulated-message input lands.**

### `NinaTurnStore`
**Location:** `lib/nina/turn.ts:250`
**Fields:** `record(userId, row): Promise<void>` — implemented by `dbNinaTurnStore` (gateway.ts, INSERT path) and `ninaChatTurnStore(turnId)` (chatturn.ts, UPDATE path).

---

## Dependencies

- `NINA_TURN_BUDGET.overall` = 45 s; `NINA_BACKGROUND_BUDGET_MS` = 240 s; `NINA_TURN_CHAIN_MAX` = 2 (`lib/nina/turnflight.ts`) — all unchanged by this feature.
- `NINA_TURN_STALE_MS` = 90 s — the sweep and client give-up; unchanged.
- `scripts/check-llm-payload-boundary.mjs` — greps for `runNinaTurn` literal call sites; `lib/nina/actions.ts` and `lib/nina/turn.ts` are already sanctioned callers, and this feature adds no new model-call site.
- No schema migration: `status`/`error_code` already express the superseded state (`'failed'` + a new free-text reason `'superseded'`), per `chatturn.ts`'s own no-migration precedent.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `sendNinaMessage` | lib/nina/actions.ts:320 | def | lib/nina |
| STEP 1c claim sequence | lib/nina/actions.ts:709-751 | call | lib/nina |
| `startNinaBackgroundTurn` | lib/nina/actions.ts:787 | def | lib/nina |
| `runNinaBackgroundTurn` | lib/nina/actions.ts:829 | def | lib/nina |
| the chain block | lib/nina/actions.ts:1140-1205 | def | lib/nina |
| `pollNinaReply` | lib/nina/actions.ts:1502 | def | lib/nina |
| `resendNinaMessage` | lib/nina/actions.ts:1292 | def | lib/nina |
| `openNinaChatTurn` | lib/nina/chatturn.ts:146 | def | lib/nina |
| `getPendingNinaChatTurn` | lib/nina/chatturn.ts:86 | def | lib/nina |
| `closeNinaChatTurn` | lib/nina/chatturn.ts:211 | def | lib/nina |
| `ninaChatTurnStore` | lib/nina/chatturn.ts:181 | def | lib/nina |
| `sweepStaleNinaChatTurns` | lib/nina/chatturn.ts:267 | def | lib/nina |
| `ninaSessionExists` | lib/nina/chatturn.ts:303 | def | lib/nina |
| `CHAT_TURN_PHASE_RUNNING/PERSISTING` | lib/nina/chatturn.ts:51-54 | config | lib/nina |
| `runNinaTurn` / `runNinaTurnWith` | lib/nina/turn.ts:1011 / 690 | def | lib/nina |
| `userTurnText` | lib/nina/turn.ts:463 | def | lib/nina |
| `NinaTurnInput` | lib/nina/turn.ts:254 | type | lib/nina |
| `NinaTurnStore` | lib/nina/turn.ts:250 | type | lib/nina |
| `dbNinaTurnStore` | lib/nina/gateway.ts:~430 | def | lib/nina |
| `STATUS_BY_SOURCE` | lib/nina/gateway.ts:422 | config | lib/nina |
| `listNinaMessages` | lib/nina/queries.ts:1171 | def | lib/nina |
| `insertNinaTurn` | lib/nina/queries.ts:2646 | def | lib/nina |
| `ninaTurns` table | lib/db/schema.ts:579 | def | lib/db |
| `NinaTurnStatus` | lib/db/schema.ts:549 | type | lib/db |
| `busy` release (fast re-send) | components/nina/ChatScreen.tsx:1299-1305 | call | components |
| poll loop / `awaiting` | components/nina/ChatScreen.tsx:1100-1182 | def | components |
| `ninaAwaitingByMessage` | lib/nina/turnflight.ts:125 | def | lib/nina |
| `NINA_TURN_CHAIN_MAX` | lib/nina/turnflight.ts:94 | config | lib/nina |
| resend harness (drains `after()`) | tests/nina.resend.test.ts | test | tests |
| turn-loop tests | lib/nina/turn.test.ts | test | lib/nina |
| flight tests | lib/nina/turnflight.test.ts | test | lib/nina |
| `jobErrorLabel` (raw-code fallthrough) | lib/nina/jobview.ts:240 | def | lib/nina |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/chatturn.ts` — new conditional supersede (the atomic cancel), a "still pending?" ownership read, and `ninaChatTurnStore.record` made conditional so a superseded row is neither phase-advanced nor its reason overwritten. Phase 1 owns it.
2. `lib/nina/actions.ts` — `sendNinaMessage` attempts the cancel between the sweep and `openNinaChatTurn`; `runNinaBackgroundTurn` re-checks ownership after `runNinaTurn` and, when superseded, persists nothing and skips the chain. Phase 1 owns it.
3. `lib/nina/turn.ts` — `NinaTurnInput` gains the accumulated unanswered runner texts; `userTurnText` renders them (zero bytes when absent). Phase 2 owns it.
4. `lib/nina/actions.ts` (again, sequenced) — `runNinaBackgroundTurn` computes the accumulated texts from the context window it already loaded and passes them to `runNinaTurn`. Phase 2 owns it (must quote the file as phase 1 left it).
5. `lib/nina/turn.test.ts` / `lib/nina/chatturn.test.ts` (new) / `tests/nina.resend.test.ts` or a sibling — behavior tests for both phases.

**This document describes. The plan files prescribe.**
