# Phase 1: Cancel-and-retarget: supersede a thinking turn, discard its result

**Plan set:** `NINA_BURST_CANCEL_PLAN.md`
**Analysis:** `20260910-090235-A7C2_code_analyzer.md`
**Satisfies:** R1
**Depends on:** none
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

When a send arrives while the conversation's chat claim is still `status='pending' AND
error_code='running'` (she is thinking, has produced nothing), that send atomically closes the
claim as `failed`/`superseded`, then opens and starts a fresh turn whose context already contains
every message of the burst. The superseded turn's own invocation — which cannot be aborted across
serverless invocations, per the plan's Decisions — finishes its model call, discovers it no longer
owns the claim, and persists NOTHING: no bubbles, no distillation, no auto-title, no chain. Its
token usage still lands on its row, and the `superseded` reason is never overwritten. A cancel that
loses the race (claim already `'persisting'`, expired, or row-locked away) changes nothing: the
message takes today's chain path. No client change, no schema change, no prompt change.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**
- `lib/nina/chatturn.ts`: `export const CHAT_TURN_REASON_SUPERSEDED = 'superseded'` — the
  `error_code` a cancelled turn carries while `status='failed'`.
- `lib/nina/chatturn.ts`: `export async function supersedeNinaChatTurn(userId: string, sessionId:
  string): Promise<boolean>` — the atomic cancel. True iff this call won the row.
- `lib/nina/chatturn.ts`: `export async function chatTurnWasSuperseded(userId: string, turnId:
  string): Promise<boolean>` — the ownership read. Never rejects (catches its own errors, answers
  `false`).
- `lib/nina/chatturn.test.ts` (new file), `tests/nina.burstCancel.test.ts` (new file).

**Signature changes:**
- NONE on any exported symbol. `ninaChatTurnStore(turnId): NinaTurnStore` keeps its signature and
  the `NinaTurnStore` interface in `lib/nina/turn.ts:250` is UNTOUCHED — but `record`'s behavior
  changes in place:
  - Arm 1 (the phase advance) is now **conditional on `status='pending'`** and `.returning`s to
    detect a loss. Sets the same metrics as today plus `errorCode='persisting'`.
  - Arm 2 (NEW, the metrics-only arm — the decision the scope asked for, made: **yes, it needs
    one**) runs only when arm 1 advanced nothing: it writes ONLY the six metric fields, its SET
    names neither `status` nor `error_code`, and its WHERE is `status='failed'` (covers
    `superseded` and the sweep's `stale`; a closed row's reason is physically impossible to
    overwrite from this statement). The win/lose pair with `supersedeNinaChatTurn` is exactly one
    winner by Postgres row locking.

**Requires (from earlier phases):** none — phase 1 has no dependencies.

**Leaves alone (owned by others or out of scope):**
- `lib/nina/turn.ts` — phase 2's file entirely. `NinaTurnInput`, `userTurnText`, `runNinaTurn`,
  `runNinaTurnWith`, `productionDeps` all untouched by this phase.
- `lib/nina/actions.ts` — `runNinaBackgroundTurn` is edited by this phase ONLY for the ownership
  re-check and discard exit; phase 2 will edit the same function again (the accumulated-bubbles
  input) and must quote the file as phase 1 leaves it (see Handoffs).
- `resendNinaMessage` (`lib/nina/actions.ts:1292`) — keeps its `'turn-live'` refusal and attempts
  NO cancel. `tests/nina.resend.test.ts` pins that.
- `pollNinaReply`, the chain block and its bounds (`NINA_TURN_CHAIN_MAX`,
  `NINA_BACKGROUND_BUDGET_MS`, `NINA_TURN_BUDGET`), `ninaSessionExists`, `closeNinaChatTurn`,
  `sweepStaleNinaChatTurns`, `getPendingNinaChatTurn`, `openNinaChatTurn` — all unchanged.
- `lib/db/schema.ts`, `drizzle/` — no migration, no new index (`tests/db.schema.nina.test.ts` pins
  the table's single index). `npm run db:check` stays clean.
- `components/nina/*`, `app/nina/*` — the cancel-and-restart is invisible to the client by design.
- `lib/nina/gateway.ts` (`dbNinaTurnStore`, the INSERT-path store) — untouched; only the chat
  claim's UPDATE-path store changes.
- `scripts/check-llm-payload-boundary.mjs` — no new model-call site, sanctioned caller list
  unchanged (invariant 8).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/chatturn.ts` | modify | add `gte` to the drizzle import (line 3); add `CHAT_TURN_REASON_SUPERSEDED` next to the phase constants (after line 52); new `supersedeNinaChatTurn` after `openNinaChatTurn` (after line 163); rewrite `ninaChatTurnStore`'s `record` into conditional arm 1 + metrics-only arm 2 (lines 165-200); new `chatTurnWasSuperseded` after it (before `closeNinaChatTurn`'s comment at line 202) |
| `lib/nina/actions.ts` | modify | add `chatTurnWasSuperseded` + `supersedeNinaChatTurn` to the `./chatturn` import (lines 11-18); STEP 1c cancel attempt between the sweep and the open (insert between lines 716 and 718); ownership re-check + discard exit in `runNinaBackgroundTurn` between the shortcut bump and the session-exists check (insert between lines 982 and 984) |
| `lib/nina/chatturn.test.ts` | create | the claim state machine asserted against real generated SQL via `tests/support/fakeDb` |
| `tests/nina.burstCancel.test.ts` | create | the send-path cancel and the discard-path behavior, driven through the real `sendNinaMessage` / `runNinaBackgroundTurn` |
| `tests/nina.resend.test.ts` | modify | the `@/lib/nina/chatturn` factory mock gains the two new exports (missing names are import errors); defaults in `beforeEach`; assert a resend never cancels |
| `tests/nina.chatPhotoReattach.test.ts` | modify | stub `supersedeNinaChatTurn` in its `importOriginal` spread — the real one would query the dummy `DATABASE_URL` |

## Implementation Steps

### Step 1: The drizzle import gains `gte`
**File:** `lib/nina/chatturn.ts:3`
**Change:** the supersede UPDATE re-asserts freshness in its own WHERE, which needs `gte`.
**Code:**
```ts
import { and, desc, eq, gte, lt } from 'drizzle-orm'
```
**Impact:** none by itself; Step 3 uses it.

### Step 2: The `superseded` reason constant
**File:** `lib/nina/chatturn.ts:51-54`
**Change:** add one exported constant after `CHAT_TURN_PHASE_PERSISTING`. The existing lines stay
exactly as they are.
**Code:**
```ts
export const CHAT_TURN_PHASE_RUNNING = 'running'
export const CHAT_TURN_PHASE_PERSISTING = 'persisting'

/**
 * The `error_code` a CANCELLED turn carries (`status='failed'`). Not a phase — the row is closed
 * the moment this lands — and not a vendor failure either: the runner sent another message while
 * this turn was still thinking, so the send superseded it and started a fresh one whose context
 * contains everything this one was answering. A free-text string like every other reason on this
 * column, and `jobErrorLabel`'s raw-code fallthrough never renders it: the jobs pages read
 * `kind='image'` rows only (`lib/nina/jobview.ts`).
 */
export const CHAT_TURN_REASON_SUPERSEDED = 'superseded'
```
**Impact:** a new string in an existing free-text column. Nothing counts chat turns
(`countNinaTurnsSince` is only ever called with `'image'`) and nothing renders chat `error_code`s.

### Step 3: `supersedeNinaChatTurn` — the atomic cancel
**File:** `lib/nina/chatturn.ts` — insert directly after `openNinaChatTurn`'s closing brace
(line 163), before `ninaChatTurnStore`'s doc comment (line 165).
**Change:** the whole function below, complete.
**Code:**
```ts
/**
 * **Cancel a turn that is still THINKING, so the send that follows can start a fresh one in its
 * place (R1).**
 *
 * "Hasn't started answering" has an exact database meaning and this function is its only
 * authority: the cancellable window is `status='pending' AND error_code='running'` AND the claim is
 * still fresh (`NINA_TURN_STALE_MS`). A `'persisting'` claim is the model answering and her rows
 * going in — never cancelled, so the message falls back to the chain. An expired `'running'` claim
 * is a turn PRESUMED dead — not cancelled either: its invocation may still be alive, its metrics
 * belong on its row, `openNinaChatTurn` does not need it out of the way (an expired claim does not
 * block an open), and the sweep closes it `'stale'` in its own time.
 *
 * ── THE RACE, AND WHY THE DECISION LIVES IN THE UPDATE'S OWN WHERE ─────────────────────────────
 * Two writers want this one row: this UPDATE (`pending`+`running` → `failed`+`superseded`) and the
 * superseded turn's own `ninaChatTurnStore.record` (`pending`+`running` → `pending`+`persisting`).
 * Postgres row locking picks exactly one winner, and the predicate re-asserted inside this
 * statement — not the read above it — is what makes it so. The read only decides whether a cancel
 * is worth ATTEMPTING; losing the race here is a false answer, not a corruption. Losing means the
 * turn reached `'persisting'` between the read and the write, which is precisely the state the
 * caller must not cancel: the caller falls back to today's behavior and the turn chains the
 * message.
 *
 * Returns **true when this call won the row** (it is now closed `failed`/`superseded`), false when
 * there was nothing to cancel, the window was shut, or the race was lost. It never throws for a
 * database problem on purpose — the caller wraps it anyway, because a failed cancel must degrade to
 * today's behavior, which is always safe: his message is already persisted and the running turn
 * chains onto it.
 */
export async function supersedeNinaChatTurn(userId: string, sessionId: string): Promise<boolean> {
  const now = Date.now()

  const live = await getPendingNinaChatTurn(userId, sessionId)
  /* No live claim — the next `openNinaChatTurn` opens one anyway. */
  if (live === null) return false
  /* She is answering. The window is shut and the chain is the path. */
  if (live.phase !== CHAT_TURN_PHASE_RUNNING) return false
  /* Presumed dead. The sweep owns this row, and an expired claim never blocked an open. */
  if (now - live.createdAt.getTime() >= NINA_TURN_STALE_MS) return false

  const olderThan = new Date(now - NINA_TURN_STALE_MS)
  const cancelled = await db
    .update(ninaTurns)
    .set({ status: 'failed', errorCode: CHAT_TURN_REASON_SUPERSEDED })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, live.id),
        eq(ninaTurns.kind, 'chat'),
        /* The race, decided here and not by the read above: only a row that is STILL
         * pending+running — and still fresh — may be won. */
        eq(ninaTurns.status, 'pending'),
        eq(ninaTurns.errorCode, CHAT_TURN_PHASE_RUNNING),
        gte(ninaTurns.createdAt, olderThan),
      ),
    )
    .returning({ id: ninaTurns.id })

  return cancelled.length > 0
}
```
**Impact:** a new export on the chat claim module. No existing caller changes. Every loss mode
collapses to `false`, and every `false` collapses to `sendNinaMessage`'s existing null-`turnId`
path.

### Step 4: `ninaChatTurnStore.record` — conditional phase advance, metrics-only fallback arm
**File:** `lib/nina/chatturn.ts:165-200`
**Change:** replace the whole `ninaChatTurnStore` block — doc comment and function — with the
block below. The SET field list is byte-identical to today's; what changes is the WHERE, the
`.returning`, and the new second arm.
**Code:**
```ts
/**
 * **The `NinaTurnStore` `runNinaTurn` is handed for a background chat turn, so the pre-opened row
 * is UPDATED instead of a second row being INSERTed.**
 *
 * Injected through `{ ...productionDeps(), store: ninaChatTurnStore(turnId) }` — the same one-word
 * override `sendNinaMessage` already uses for `toolSet`, and the reason `productionDeps` is
 * exported at all (`lib/nina/turn.ts:842`). Nothing in `turn.ts` changes.
 *
 * ── IT DOES NOT CLOSE THE ROW, AND THAT IS THE WHOLE POINT ────────────────────────────────────
 * `runNinaTurn` calls `store.record` the moment the model answers — BEFORE her bubbles are
 * persisted. If this set `status='ok'` there, the claim would drop while the screen still had
 * nothing to show, and the very next poll would report "not in flight, no new rows" and raise the
 * 'no-reply' notice for a reply that was one insert away. So this records the METRICS and advances
 * the phase to `'persisting'`, and `closeNinaChatTurn` — called after the bubbles land — is what
 * ends the turn. Two writes, one row, and no window in which the truth is unreadable.
 *
 * ── THE PHASE ADVANCE IS CONDITIONAL, AND THE LOSS HAS ITS OWN ARM ─────────────────────────────
 * This UPDATE and `supersedeNinaChatTurn`'s race for the same row, and Postgres row locking picks
 * exactly one winner. Arm 1 carries `status = 'pending'` in its own WHERE and `.returning`s what it
 * advanced, so a lost race is SEEN rather than assumed — an unconditional UPDATE would overwrite a
 * freshly written `superseded` reason with a phase value and leave a closed row claiming to be
 * mid-persist, a lie nothing downstream could read past. Arm 2 is what the loss earns: the METRICS,
 * and only the metrics. `status` and `error_code` are absent from its SET by construction, so a
 * closer's reason is physically impossible to overwrite here, and the token usage the call actually
 * spent still lands on the row it belongs to. Arm 2's WHERE is `status='failed'` rather than
 * `error_code='superseded'` on purpose: it also covers the sweep's `'stale'` on a turn that
 * outlived its claim and turned out to be alive — whose metrics landed before this change and must
 * keep landing.
 */
export function ninaChatTurnStore(turnId: string): NinaTurnStore {
  return {
    async record(userId, row) {
      const metrics = {
        model: row.model,
        promptVersion: row.promptVersion,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        toolCalls: row.toolCalls,
        latencyMs: row.latencyMs,
      }

      /* Arm 1 — the phase advance, CONDITIONAL on the row still being a live claim. */
      const advanced = await db
        .update(ninaTurns)
        .set({ ...metrics, errorCode: CHAT_TURN_PHASE_PERSISTING })
        .where(
          and(
            eq(ninaTurns.userId, userId),
            eq(ninaTurns.id, turnId),
            eq(ninaTurns.kind, 'chat'),
            eq(ninaTurns.status, 'pending'),
          ),
        )
        .returning({ id: ninaTurns.id })
      if (advanced.length > 0) return

      /* Arm 2 — the claim was closed beneath us (`superseded` by a send, or `stale` by the sweep).
       * Metrics only; the reason someone else wrote stays exactly as they wrote it. */
      await db
        .update(ninaTurns)
        .set(metrics)
        .where(
          and(
            eq(ninaTurns.userId, userId),
            eq(ninaTurns.id, turnId),
            eq(ninaTurns.kind, 'chat'),
            eq(ninaTurns.status, 'failed'),
          ),
        )
    },
  }
}
```
**Impact:** on every healthy turn the observable behavior is identical (the row is `pending` when
`record` runs; arm 1 advances it; arm 2 never runs). The difference exists only on rows that lost
their claim mid-flight, which is the point.

### Step 5: `chatTurnWasSuperseded` — the ownership read
**File:** `lib/nina/chatturn.ts` — insert directly after `ninaChatTurnStore`'s closing brace,
before `closeNinaChatTurn`'s doc comment (which currently starts at line 202).
**Code:**
```ts
/**
 * **Does this invocation still own the claim it opened?** The background turn asks exactly once,
 * right after `runNinaTurn` returns — the moment the answer exists and the cost is already spent.
 *
 * The answer is narrowly `'superseded'` — `status='failed' AND error_code='superseded'`, the exact
 * state `supersedeNinaChatTurn` writes — and NOTHING ELSE counts as a loss. A claim the sweep
 * closed `'stale'` under a turn that turned out to be alive still answers false and the turn
 * proceeds exactly as it does today: the claim is gone but her rows are written, the poll delivers
 * them through the message predicate, and the only cost is a ledger row closed before its answer
 * landed. Discarding on every non-pending state would turn a slow turn into a silently lost reply,
 * which is the one outcome invariant 7 exists to prevent.
 *
 * ── A READ THAT FAILS ANSWERS FALSE, AND THAT IS A DECISION ───────────────────────────────────
 * If this read throws, the most the turn can honestly know is "no supersede was PROVEN", and being
 * wrong in that direction costs a duplicate answer — the old turn answers message 1 while the
 * retargeting turn answers 1 and 3 — which is the same priced-and-accepted blast radius as
 * `openNinaChatTurn`'s own race. The opposite degradation, discarding on a failed read, would let
 * one database hiccup on the hottest path in the app cost a whole 45-second answer. Duplicates are
 * acceptable; lost replies are not.
 */
export async function chatTurnWasSuperseded(userId: string, turnId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ status: ninaTurns.status, errorCode: ninaTurns.errorCode })
      .from(ninaTurns)
      .where(
        and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, turnId), eq(ninaTurns.kind, 'chat')),
      )
      .limit(1)
    const row = rows[0]
    return row != null && row.status === 'failed' && row.errorCode === CHAT_TURN_REASON_SUPERSEDED
  } catch (cause) {
    console.warn('[nina] could not read the claim; assuming the turn still owns it', {
      turnId,
      error: String(cause),
    })
    return false
  }
}
```
**Impact:** a new export; its only caller is Step 8. A throwing read can never discard a turn.

### Step 6: `actions.ts` imports
**File:** `lib/nina/actions.ts:11-18`
**Change:** add the two new symbols to the existing `./chatturn` import.
**Code:**
```ts
import {
  chatTurnWasSuperseded,
  closeNinaChatTurn,
  getPendingNinaChatTurn,
  ninaChatTurnStore,
  ninaSessionExists,
  openNinaChatTurn,
  supersedeNinaChatTurn,
  sweepStaleNinaChatTurns,
} from './chatturn'
```
**Impact:** `tests/nina.resend.test.ts`'s factory mock must name both (Step 11) or the module
fails to load under that suite.

### Step 7: The cancel on the send path (STEP 1c)
**File:** `lib/nina/actions.ts` — insert between the sweep's try/catch (ends line 716) and
`let turnId: string | null = null` (line 718). The sweep block above and the open block below stay
byte-identical.
**Code:**
```ts
  /*
   * ── STEP 1c-i — THE CANCEL (R1). ─────────────────────────────────────────────────────────────
   * If a turn for THIS conversation is still THINKING (`pending` + `running`, and fresh — see
   * `supersedeNinaChatTurn` for why an expired one is left alone), this send closes it
   * `failed`/`superseded`, and the `openNinaChatTurn` below then opens a FRESH one whose context
   * already contains both his messages — the one the thinking turn was answering (persisted in
   * STEP 1, before any of this) and this one. One round trip, one turn, and the burst is answered
   * together instead of queued behind a stale answer.
   *
   * It sits here — after every refusal and after his row is committed — because a cancel is a
   * write on somebody else's turn and must never be spent on a send that then refuses. It sits
   * between the sweep and the open because the open is what needs the claim gone: the moment the
   * supersede wins, there is no pending claim left for this session and the open proceeds.
   *
   * A cancel that LOSES — she reached `'persisting'`, the claim expired, or the statement raced
   * and missed — has no branch here, on purpose: `openNinaChatTurn` then refuses as it always has
   * and the turn that beat us chains onto this message exactly as before. The boolean buys one
   * log line and nothing else.
   */
  let superseded = false
  try {
    superseded = await supersedeNinaChatTurn(userId, sessionId)
  } catch (cause) {
    /* Invariant 7: a cancel that could not run must never cost him the send. The worst case is
     * exactly today's behavior — his message is saved and the running turn chains onto it. */
    console.warn('[nina] could not supersede the thinking turn', { error: String(cause) })
  }
  if (superseded) {
    console.log('[nina] superseded a thinking turn', { userId, sessionId })
  }
```
**Impact:** one extra SELECT per send (the same read `openNinaChatTurn` is about to issue anyway —
the poll already does it every poll), plus the conditional UPDATE only when a fresh running claim
exists. `resendNinaMessage` and the chain do NOT get this call.

### Step 8: The ownership re-check and the discard exit
**File:** `lib/nina/actions.ts` — insert in `runNinaBackgroundTurn` between the shortcut bump's
closing brace (line 982) and the "THE SESSION MAY HAVE BEEN DELETED" comment (starts line 984).
Everything between `runNinaTurn` returning and this insert stays as-is; the bump STAYS above the
exit.
**Code:**
```ts
    /*
     * ── THE OWNERSHIP RE-CHECK (R1). ───────────────────────────────────────────────────────────
     * Up to 45 s passed since this turn opened its claim, and a send that arrived while the claim
     * was still `'running'` may have superseded it — closed the row `failed`/`superseded` and
     * started a fresh turn whose context contains everything this one was answering. This
     * invocation is the loser of that race, and the answer it is holding is now a DUPLICATE. So it
     * persists NOTHING and exits: no session check, no bubbles, no close, no distillation, no
     * auto-title, and — because a `return` from inside this `try` leaves the function after the
     * `finally` — no chain. `ninaChatTurnStore.record` has already landed the token usage on the
     * row (its arm 2), so the money ledger stays honest; the `superseded` reason on the row is the
     * only record this answer ever existed.
     *
     * The shortcut bump above STAYS above this exit, exactly as it stays above every other early
     * return: the trigger was in his message and the payload was billed for it — a turn the runner
     * retargeted does not un-fire it any more than a failed one does.
     *
     * `closed = true` because the row IS closed — by the cancel, not by us — so the `finally`'s
     * `closeNinaChatTurn` (conditional on `status='pending'` and a no-op here anyway) is spared
     * the statement. `failure = undefined` because 'crashed' would be a lie; the row already
     * carries the truth.
     */
    if (await chatTurnWasSuperseded(userId, turnId)) {
      console.warn('[nina] turn was superseded mid-flight; discarding its answer', {
        turnId,
        sessionId,
      })
      failure = undefined
      closed = true
      return
    }
```
**Impact:** the discard covers the session-exists check, the null-payload branch and its
distillation, the bubble INSERT, `closeNinaChatTurn`, the distillation, the auto-title, and the
chain block after the `finally`. On every non-superseded turn `chatTurnWasSuperseded` answers
false and behavior is byte-identical to today; the check costs one primary-key read per turn.

### Step 9: The claim state machine test (new file)
**File:** `lib/nina/chatturn.test.ts` (new)
**Change:** full file. Uses the repo's `tests/support/fakeDb` so every assertion reads the SQL the
real drizzle builder generates — the same arrangement as `tests/db.queries.*.test.ts`. Note the
dynamic-import discipline: `lib/db/index.ts` constructs its client eagerly at import, so the fake
must be installed BEFORE `./chatturn` is first imported, and the module must not be imported
statically.
**Code:**
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from '@/tests/support/fakeDb'

/**
 * **The chat claim's state machine, asserted against the SQL it actually issues.**
 *
 * Three properties this feature lives or dies by, and each is one WHERE clause:
 *
 *   1. **The cancel is conditional.** `supersedeNinaChatTurn`'s UPDATE carries
 *      `status='pending' AND error_code='running'` in its own WHERE, so it can only ever win a row
 *      that is still THINKING — never one that reached `'persisting'`, and never a stale one.
 *   2. **The phase advance is conditional.** `ninaChatTurnStore.record`'s first arm carries
 *      `status='pending'`; when it advances nothing, a metrics-only arm runs whose SET names
 *      neither `status` nor `error_code` — a superseded reason cannot be overwritten because the
 *      statement never writes the column.
 *   3. **"Superseded" is a narrow state.** `chatTurnWasSuperseded` is true for exactly
 *      `failed`+`superseded` — never for `'stale'`, `'crashed'`, `'ok'`, or a missing row.
 */

const USER = 'u1'
const SESSION = 'ses000000001'
const TURN = 'turn00000001'

/** A `getPendingNinaChatTurn` row, in projection order: id, created_at, error_code, args. */
function claimRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    overrides.id ?? TURN,
    overrides.createdAt ?? new Date(Date.now() - 5_000).toISOString(),
    overrides.errorCode ?? 'running',
    overrides.args ?? { sessionId: SESSION, runnerMessageId: 'msg000000001', depth: 0 },
  )
}

/** A `NinaTurnRow` as `runNinaTurn` builds it — every field `record` writes. */
function turnRow() {
  return {
    model: 'glm-5.3',
    promptVersion: 7,
    source: 'llm' as const,
    toolCalls: '',
    inputTokens: 1_234,
    outputTokens: 567,
    latencyMs: 13_000,
  }
}

/** Splits a generated UPDATE into its SET and WHERE halves for predicate-level assertions. */
function setAndWhere(sql: string): { set: string; where: string } {
  const whereAt = sql.indexOf(' where ')
  return { set: sql.slice(sql.indexOf(' set '), whereAt), where: sql.slice(whereAt) }
}

type Chatturn = typeof import('./chatturn')
let chatturn: Chatturn
let fake: FakeDb

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  /* Dynamic on purpose: `lib/db/index.ts` builds its client at import, so the fake must be in
   * place first. `tests/db.queries.*.test.ts` established this arrangement. */
  chatturn = await import('./chatturn')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('supersedeNinaChatTurn — the atomic cancel', () => {
  it('wins a fresh running claim and closes it failed/superseded', async () => {
    fake.enqueue([claimRow()], [[TURN]])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(true)

    expect(fake.queries).toHaveLength(2)
    const update = fake.last()
    const { set, where } = setAndWhere(update.sql)
    expect(set).toContain('"error_code"')
    expect(update.params).toContain('failed')
    expect(update.params).toContain('superseded')
    /* THE RACE, DECIDED IN THE STATEMENT: the WHERE re-asserts the whole cancellable window. */
    expect(where).toContain('"nina_turns"."status"')
    expect(where).toContain('"nina_turns"."error_code"')
    expect(where).toContain('"nina_turns"."created_at"')
    expect(update.params).toContain('pending')
    expect(update.params).toContain('running')
    expect(update.params).toEqual(expect.arrayContaining([expect.any(Date)]))
  })

  it('does not attempt a cancel when no claim is live', async () => {
    fake.enqueue([])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(fake.only().sql).toMatch(/select/i)
  })

  it('does not attempt a cancel once she is persisting', async () => {
    fake.enqueue([claimRow({ errorCode: 'persisting' })])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(1)
  })

  it('does not attempt a cancel on an expired claim — the sweep owns that row', async () => {
    fake.enqueue([claimRow({ createdAt: new Date(Date.now() - 120_000).toISOString() })])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(1)
  })

  it('answers false when the UPDATE races and misses — the loss is seen, not assumed', async () => {
    /* The read found a fresh running claim, but the row left `pending` before the UPDATE ran. */
    fake.enqueue([claimRow()], [])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(2)
  })
})

describe('ninaChatTurnStore().record — the conditional phase advance', () => {
  it('advances a live claim to persisting, with the metrics, under status = pending', async () => {
    fake.enqueue([[TURN]])

    await chatturn.ninaChatTurnStore(TURN).record(USER, turnRow())

    const advance = fake.only()
    const { set, where } = setAndWhere(advance.sql)
    expect(set).toContain('"error_code"')
    expect(advance.params).toContain('persisting')
    expect(advance.params).toContain('glm-5.3')
    expect(advance.params).toContain(1_234)
    expect(advance.params).toContain(567)
    expect(advance.params).toContain(13_000)
    expect(where).toContain('"nina_turns"."status"')
    expect(advance.params).toContain('pending')
  })

  it('falls to a metrics-only arm when the claim was closed beneath us', async () => {
    /* Arm 1 advances nothing — a send's cancel won the row while the model call was in flight. */
    fake.enqueue([])

    await chatturn.ninaChatTurnStore(TURN).record(USER, turnRow())

    expect(fake.queries).toHaveLength(2)
    const metricsOnly = fake.last()
    const { set, where } = setAndWhere(metricsOnly.sql)
    /* THE GUARANTEE: the fallback arm physically cannot write the reason columns. */
    expect(set).not.toContain('"status"')
    expect(set).not.toContain('"error_code"')
    expect(metricsOnly.params).not.toContain('persisting')
    expect(where).toContain('"nina_turns"."status"')
    expect(metricsOnly.params).toContain('failed')
    /* The money ledger stays honest: the usage the call spent still lands. */
    expect(metricsOnly.params).toContain(1_234)
    expect(metricsOnly.params).toContain(567)
    expect(metricsOnly.params).toContain(13_000)
  })
})

describe('chatTurnWasSuperseded — the ownership read', () => {
  it('is true for exactly failed + superseded', async () => {
    fake.enqueue([projectedRow('failed', 'superseded')])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(true)
  })

  it('is false for every other closed state — a slow turn keeps its answer', async () => {
    fake.enqueue([projectedRow('failed', 'stale')])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(false)

    fake.enqueue([projectedRow('ok', null)])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(false)
  })

  it('is false when the row is gone', async () => {
    fake.enqueue([])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(false)
  })
})
```
**Impact:** new file; vitest's include pattern `lib/**/*.test.ts` picks it up.

### Step 10: The send-path and discard-path behavior test (new file)
**File:** `tests/nina.burstCancel.test.ts` (new)
**Change:** full file. Drives the real `sendNinaMessage` and the real (deferred)
`runNinaBackgroundTurn` with only the edges mocked — `tests/nina.resend.test.ts`'s arrangement.
**Code:**
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R1: the send that arrives while she is THINKING cancels her turn and retargets the
 * conversation — and the cancelled turn's own invocation, when its model call finally returns,
 * persists NOTHING.**
 *
 * Six properties, in the order they would hurt if they were wrong:
 *
 *   1. **The cancel runs on the send path, after his row is persisted and before the open** —
 *      never on a send that is about to refuse, never after a claim has already been opened.
 *   2. **A WON cancel starts a fresh turn** — the send returns the NEW claim's `turnId` and defers
 *      exactly one background turn. The client branches on none of it.
 *   3. **A LOST cancel is exactly today** — the open refuses, `turnId` is null, nothing is
 *      deferred, the running turn chains onto the message.
 *   4. **A FAILED cancel degrades to today too (invariant 7)** — the open still runs.
 *   5. **The superseded turn's answer is discarded whole** — no bubble INSERT beyond his own row,
 *      no close, no distillation, no auto-title, not even the chain's newest-row read — while the
 *      shortcut bump, which sits above the exit on purpose, still fires.
 *   6. **An ownership read answering false persists everything, exactly as today** — the
 *      regression guard for the ordinary turn.
 */

const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

const requireUserId = vi.fn<() => Promise<string>>()
vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))

const spies = vi.hoisted(() => ({
  getNinaSession: vi.fn(),
  insertNinaMessages: vi.fn(),
  listNinaMessages: vi.fn(),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: vi.fn(),
  bumpNinaShortcutUses: vi.fn(),
}))

vi.mock('@/lib/nina/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/queries')>()
  return { ...actual, ...spies }
})

const supersedeNinaChatTurn = vi.fn()
const openNinaChatTurn = vi.fn()
const chatTurnWasSuperseded = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: (...a: unknown[]) => chatTurnWasSuperseded(...a),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  supersedeNinaChatTurn: (...a: unknown[]) => supersedeNinaChatTurn(...a),
  sweepStaleNinaChatTurns: vi.fn(async () => 0),
}))

const loadNinaContext = vi.fn()
const runNinaTurn = vi.fn()
const runTurnDistillation = vi.fn()
const titleNinaSessionIfNeeded = vi.fn()

vi.mock('@/lib/nina/load', () => ({ loadNinaContext: (...a: unknown[]) => loadNinaContext(...a) }))
vi.mock('@/lib/nina/gateway', () => ({
  dbNinaSourceGateway: {},
  dbNinaToolGateway: { loadRunHistory: () => Promise.resolve([]) },
}))
vi.mock('@/lib/nina/turn', () => ({
  /* The chain's wall-clock guard reads `.overall`; the real literal, so the arithmetic is real. */
  NINA_TURN_BUDGET: { overall: 45_000 },
  productionDeps: () => ({}),
  runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
}))
vi.mock('@/lib/nina/distill', () => ({
  runTurnDistillation: (...a: unknown[]) => runTurnDistillation(...a),
}))
vi.mock('@/lib/nina/autotitle', () => ({
  titleNinaSessionIfNeeded: (...a: unknown[]) => titleNinaSessionIfNeeded(...a),
}))

/* `authEnv()` parses eagerly on first call and `sendNinaMessage` calls it before the ticket loop. */
process.env.AUTH_SECRET ??= 'unit-secret'

const USER = 'u1'
const SESSION = 'ses000000001'
const HIS = 'msgRUNNER001'
const TURN = 'turn00000001'
const TURN2 = 'turn00000002'

/** The row `insertNinaMessages` returns for HIS message — the send reads only `id` and `seq`. */
function runnerRow() {
  return [{ id: HIS, seq: 41, body: 'dan mau makan apa lunch?', replyToId: null }]
}

/** Her answer, for the turns that are ALLOWED to persist it. */
function ninaRows() {
  return [
    { id: 'msgNINA00001', seq: 42, body: 'iya, makan bareng yuk', replyToId: HIS },
    { id: 'msgNINA00002', seq: 43, body: 'abis itu kita jalan', replyToId: null },
  ]
}

/** A `runNinaTurn` answer with a real payload — the discard must be a CHOICE, not an absence. */
function answeredResult() {
  return {
    source: 'llm' as const,
    payload: {
      bubbles: ['iya, makan bareng yuk', 'abis itu kita jalan'],
      memoryWrites: [],
    },
    usage: { inputTokens: 1_234, outputTokens: 567 },
    trace: { model: 'glm-5.3', promptVersion: 7, rounds: 0, toolCalls: [], latencyMs: 13_000 },
    firedShortcutIds: ['scShortcut01'],
  }
}

type Actions = typeof import('@/lib/nina/actions')
let actions: Actions

beforeEach(async () => {
  deferred.length = 0
  vi.clearAllMocks()

  requireUserId.mockResolvedValue(USER)
  spies.getNinaSession.mockResolvedValue({ id: SESSION })
  spies.insertNinaMessages.mockResolvedValue(runnerRow())
  /* The newest row in the session is HERS, so the chain's guard exits and a drained turn stays one
   * turn deep — the chain is this phase's unchanged machinery and is asserted separately. */
  spies.listNinaMessages.mockResolvedValue([
    { id: 'msgNINA00001', seq: 42, role: 'nina', body: 'iya', runId: null },
  ])
  spies.readNinaTuning.mockResolvedValue({ relationship: 'friend' })

  supersedeNinaChatTurn.mockResolvedValue(false)
  openNinaChatTurn.mockResolvedValue(TURN)
  chatTurnWasSuperseded.mockResolvedValue(false)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)

  loadNinaContext.mockResolvedValue({ conversation: { window: [] } })
  runNinaTurn.mockResolvedValue(answeredResult())
  runTurnDistillation.mockResolvedValue(undefined)
  titleNinaSessionIfNeeded.mockResolvedValue(undefined)

  actions = await import('@/lib/nina/actions')
})

/** The burst message: a plain send into a session he already has. */
function send(): Promise<Awaited<ReturnType<typeof actions.sendNinaMessage>>> {
  return actions.sendNinaMessage({ body: 'dan mau makan apa lunch?', sessionId: SESSION })
}

describe('a send that arrives while she is thinking', () => {
  it('cancels after his row is persisted and before the claim is opened', async () => {
    supersedeNinaChatTurn.mockResolvedValue(true)
    openNinaChatTurn.mockResolvedValue(TURN2)

    await send()

    expect(supersedeNinaChatTurn).toHaveBeenCalledWith(USER, SESSION)
    /* His row first — a refusal can never waste a cancel — then the cancel, then the open that
     * needs the claim gone. */
    const rowOrder = spies.insertNinaMessages.mock.invocationCallOrder[0]!
    const cancelOrder = supersedeNinaChatTurn.mock.invocationCallOrder[0]!
    const openOrder = openNinaChatTurn.mock.invocationCallOrder[0]!
    expect(rowOrder).toBeLessThan(cancelOrder)
    expect(cancelOrder).toBeLessThan(openOrder)
  })

  it('reports the NEW turn as the send’s turnId and defers exactly one background turn', async () => {
    supersedeNinaChatTurn.mockResolvedValue(true)
    openNinaChatTurn.mockResolvedValue(TURN2)

    const result = await send()

    expect(result).toEqual({
      ok: true,
      userMessageId: HIS,
      sessionId: SESSION,
      cursor: 41,
      turnId: TURN2,
    })
    expect(openNinaChatTurn).toHaveBeenCalledWith(USER, {
      sessionId: SESSION,
      runnerMessageId: HIS,
      depth: 0,
    })
    expect(deferred).toHaveLength(1)
  })

  it('keeps the current behavior when the cancel loses the race', async () => {
    /* She reached 'persisting': the cancel answers false and the open refuses — the chain, not a
     * cancel, is what happens next. Nothing is deferred. */
    supersedeNinaChatTurn.mockResolvedValue(false)
    openNinaChatTurn.mockResolvedValue(null)

    const result = await send()

    expect(result).toEqual({
      ok: true,
      userMessageId: HIS,
      sessionId: SESSION,
      cursor: 41,
      turnId: null,
    })
    expect(deferred).toHaveLength(0)
  })

  it('degrades to the current behavior when the cancel itself fails (invariant 7)', async () => {
    supersedeNinaChatTurn.mockRejectedValue(new Error('neon: connection reset'))

    const result = await send()

    expect(result.ok).toBe(true)
    expect(result.turnId).toBe(TURN)
    expect(deferred).toHaveLength(1)
  })
})

describe('the superseded invocation, when its model call returns', () => {
  beforeEach(() => {
    /* An ORDINARY first send; a LATER send is what superseded this turn mid-flight. */
    supersedeNinaChatTurn.mockResolvedValue(false)
    chatTurnWasSuperseded.mockResolvedValue(true)
  })

  it('persists nothing and starts no chain', async () => {
    await send()
    expect(deferred).toHaveLength(1)
    await deferred[0]!()

    /* His row was written by the send; her rows never are — and she HAD an answer. */
    expect(spies.insertNinaMessages).toHaveBeenCalledTimes(1)
    const [userId, rows] = spies.insertNinaMessages.mock.calls[0]!
    expect(userId).toBe(USER)
    expect((rows as Array<{ role: string }>)[0]!.role).toBe('runner')
    /* The claim was already closed by the cancel; the discard must not touch it again. */
    expect(closeNinaChatTurn).not.toHaveBeenCalled()
    expect(runTurnDistillation).not.toHaveBeenCalled()
    expect(titleNinaSessionIfNeeded).not.toHaveBeenCalled()
    /* The exit sits above the session check AND the chain's newest-row read. */
    expect(ninaSessionExists).not.toHaveBeenCalled()
    expect(spies.listNinaMessages).not.toHaveBeenCalled()
    expect(openNinaChatTurn).toHaveBeenCalledTimes(1)
  })

  it('still counts the shortcuts the superseded turn fired', async () => {
    await send()
    await deferred[0]!()

    expect(spies.bumpNinaShortcutUses).toHaveBeenCalledWith(USER, ['scShortcut01'])
  })
})

describe('an ownership read that answers false', () => {
  it('persists the answer exactly as today', async () => {
    /* The real `chatTurnWasSuperseded` answers false whenever it cannot PROVE a supersede —
     * including when its own read throws — so `false` is both "she was not cancelled" and the
     * read-failed degradation. */
    chatTurnWasSuperseded.mockResolvedValue(false)
    spies.insertNinaMessages
      .mockReset()
      .mockResolvedValueOnce(runnerRow())
      .mockResolvedValue(ninaRows())

    await send()
    await deferred[0]!()

    expect(spies.insertNinaMessages).toHaveBeenCalledTimes(2)
    const herCall = spies.insertNinaMessages.mock.calls[1]!
    expect(herCall[1]).toHaveLength(2)
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
    expect(titleNinaSessionIfNeeded).toHaveBeenCalledWith(USER, SESSION)
  })
})
```
**Impact:** new file. If a later edit moves the shortcut bump below the exit or lets the discard
path write, the suite names it.

### Step 11: The resend suite's mock factory and one new assertion
**File:** `tests/nina.resend.test.ts` — the chatturn const block (currently lines 82-85) and the
`@/lib/nina/chatturn` factory (currently lines 87-94). Phase 2 edits this file too (the
`@/lib/nina/turn` factory and a trailing describe); this phase's regions and its are disjoint, and
the dependency edge is the only sequencing.
**Change:** actions.ts now imports two more names from `./chatturn`; a factory mock that omits
them fails the suite at import. Add the consts, the factory entries, the `beforeEach` defaults,
and pin that a resend is not a cancel.
**Code — the const block becomes:**
```ts
const openNinaChatTurn = vi.fn()
const supersedeNinaChatTurn = vi.fn()
const chatTurnWasSuperseded = vi.fn()
const sweepStaleNinaChatTurns = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()
```
**Code — the factory becomes:**
```ts
vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: (...a: unknown[]) => chatTurnWasSuperseded(...a),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  supersedeNinaChatTurn: (...a: unknown[]) => supersedeNinaChatTurn(...a),
  sweepStaleNinaChatTurns: (...a: unknown[]) => sweepStaleNinaChatTurns(...a),
}))
```
**Code — add to `beforeEach`, next to the other chatturn defaults:**
```ts
  supersedeNinaChatTurn.mockResolvedValue(false)
  chatTurnWasSuperseded.mockResolvedValue(false)
```
**Code — extend the existing 'sweeps, then opens ONE claim' test (`tests/nina.resend.test.ts`,
describe "an accepted resend claims a turn for the row that is already there"):**
```ts
  it('sweeps, then opens ONE claim against the same runner_message_id at depth 0', async () => {
    await actions.resendNinaMessage({ messageId: HIS })

    expect(sweepStaleNinaChatTurns).toHaveBeenCalledWith(USER)
    /* A resend is a RECOVERY tool, not a cancel (plan scope): it never supersedes a thinking
     * turn, whatever its phase. */
    expect(supersedeNinaChatTurn).not.toHaveBeenCalled()
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(openNinaChatTurn).toHaveBeenCalledWith(USER, {
      sessionId: SESSION,
      runnerMessageId: HIS,
      depth: 0,
    })
  })
```
**Impact:** the drained-turn tests keep passing — `chatTurnWasSuperseded` defaults to `false`, so
the drains reach today's persistence path exactly as before.

### Step 12: The chat-photo reattach suite must not reach the database
**File:** `tests/nina.chatPhotoReattach.test.ts:49-58`
**Change:** this suite spreads the REAL `@/lib/nina/chatturn` over two stubs, and the real
`sendNinaMessage` is what it exercises. Step 7 puts a real cancel query on that path; the suite's
`DATABASE_URL` is a syntactic dummy, so the real `supersedeNinaChatTurn` would attempt a network
call on every test. Stub it.
**Code:**
```ts
vi.mock('@/lib/nina/chatturn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/chatturn')>()
  return {
    ...actual,
    sweepStaleNinaChatTurns: async () => 0,
    /* Step 7 of phase 1 put a real cancel on the send path; this suite's DATABASE_URL is a dummy,
     * so answer "nothing to cancel" instead of reaching for the network. */
    supersedeNinaChatTurn: async () => false,
    /* The burst case: a turn is already running for this conversation. His message is saved and
     * nothing else happens, which is exactly the surface this suite wants. */
    openNinaChatTurn: async () => null,
  }
})
```
**Impact:** none on this suite's four properties — the cancel is upstream of everything it
asserts.

## Verification

**Prerequisite:** this worktree has no `node_modules` and no `.env.local`. Run `npm install` and
copy `.env.local` from the primary checkout before anything below — `lib/env.ts` parses 14 vars at
import, and typecheck, lint and vitest all die without both.

**Build:**
```
npm run typecheck
```
**Tests:**
```
npm run lint
npm run test
npm run db:check
```
`db:check` must report no drift — this phase generates no migration and `drizzle/` gains no file
(invariant 6). `npm test` covers the two new suites plus the two edited ones; the default run
excludes `tests/integration/**` and `tests/live/**`.

**Manual check (optional, with a real database):** send message A, and while the typing indicator
is up (within the first seconds of the turn) send message B. Expect one combined answer; in
`nina_turns`, expect the A-turn row `status='failed'`, `error_code='superseded'`, with
`input_tokens`/`output_tokens`/`latency_ms` filled in by the discarded call, and one fresh
`pending` → `ok` row for B's turn. Waiting until her answer has started landing (or simply
sending slowly) must produce today's chained behavior instead — two answers, no `superseded` row.

**Exit criteria (from the plan index):** a send arriving while the claim is `pending`+`running`
fails that row as `superseded`, opens and starts a fresh turn, and the old invocation — when its
model call returns — writes no bubbles, no distillation, and starts no chain; a send arriving
while the claim is `pending`+`persisting` (or already closed) keeps today's behavior; the
superseded row keeps its token metrics and its reason.

## Handoffs

- **Phase 2** edits `runNinaBackgroundTurn` again (accumulated unanswered runner texts, computed
  from `loadedContext` and passed into `runNinaTurn`'s input). It must quote `lib/nina/actions.ts`
  AS THIS PHASE LEAVES IT — in particular the ownership re-check sits between the shortcut bump
  and the session-exists check, and nothing phase 2 does may move below that exit: the accumulated
  texts are computed BEFORE `runNinaTurn` (from the already-loaded window) and only ride the input.
- **Phase 2** also owns the "the fresh turn answers ALL accumulated bubbles" requirement. Phase 1
  deliberately does nothing about the prompt: the fresh turn's context window already contains
  every burst message, so R1 alone is a correct (if quiet) improvement, and R2 lands entirely in
  `lib/nina/turn.ts` plus one input.
- Nothing else was found wanting. `pollNinaReply`, `ninaAwaitingByMessage`, the sweep and the
  client all already behave correctly around a superseded row (it is not `pending`, so no reader
  sees it).

## Rollback

`git revert` the phase-1 commit. The supersede is additive: without it, `sendNinaMessage` takes
the `openNinaChatTurn → null` path exactly as today, `chatTurnWasSuperseded`'s call site and both
new functions disappear with the revert, and `ninaChatTurnStore.record`'s conditional WHERE is a
no-op difference on healthy rows (every row it touches is `pending` at record time). No data
rewrite is involved: the only rows a revert leaves behind are inert closed rows carrying
`status='failed'`, `error_code='superseded'`, which no reader acts on. The two test files are
deleted with the commit; the two edited suites revert to their committed mocks.
