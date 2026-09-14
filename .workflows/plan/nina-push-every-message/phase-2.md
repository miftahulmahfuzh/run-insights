# Phase 2: Push when she replies to him

**Plan set:** `NINA_PUSH_EVERY_MESSAGE_PLAN.md`
**Analysis:** `20260914-102749-C7K2_code_analyzer.md`
**Satisfies:** R1 — when Nina answers something the runner said, a push notification is sent
**Depends on:** Phase 1 (`lib/push/payload.ts`'s `NinaPushKind` + the member `'chat_reply'`;
`lib/push/send.ts`'s `notifyNinaPush`)
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

`runNinaBackgroundTurn` — the one function that every reactive reply converges on — sends exactly
one Web Push after her bubbles are committed and her claim is closed, and before the distillation's
10–20 s model call. One call site covers `sendNinaMessage`, `resendNinaTurn`, `reviveNinaChatTurn`
**and** every chained follow-up. The three paths that write no bubble, plus the fourth where
`insertNinaMessages` degrades to `[]`, still send nothing at all.

After this phase, the *nina-offline-reply* design finally closes its own loop: the Server Action
returns before the model is called so the runner can put the phone down, and now the phone tells
him when she answered.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none
**Renames:** none
**Creates:**
- `lib/nina/turnrun.ts` — `NinaTurnNotifier` (exported type)
- `lib/nina/turnrun.ts` — `NinaTurnDeps` (exported interface, one optional field `notify`)
- `tests/nina.turnpush.test.ts` (new file)

**Signature changes:**
- `runNinaBackgroundTurn(input: NinaBackgroundTurnInput)` ->
  `runNinaBackgroundTurn(input: NinaBackgroundTurnInput, deps: NinaTurnDeps = {})`
  — **purely additive and defaulted.** The three positional callers
  (`lib/nina/actions/startTurn.ts:44`, `lib/nina/turnrevive.ts:249`, and the chain's own recursion
  at `lib/nina/turnrun.ts:573`) keep compiling unchanged; only the recursion is edited, and only to
  thread `deps` down.
- `NinaBackgroundTurnInput` is **unchanged**. The seam is deliberately NOT a field on it — see
  Decision D1.

**Requires (from earlier phases) — SETTLED against `phase-1.md`, not assumed:**
- `lib/push/payload.ts` exports `type NinaPushKind` (phase 1, Interface Contract). Read, not
  guessed: phase 1's plan is on disk and spells it.
- That vocabulary includes the member **`'chat_reply'`**, stamped by this phase and by nothing
  else in the set — phase 1's kind table names `runNinaBackgroundTurn` as its only writer.
- `lib/push/send.ts` exports `notifyNinaPush: NinaPushNotifier`, positional
  `(userId, messages, kind)`, returning `Promise<void>`, never throwing (its own `catch`, phase 1
  Step 3). Its `kind` is `NinaPushKind` and not `ProactiveTriggerKind`, which is the whole reason
  phase 1 exists.
- The notifier's return type is not constrained by this phase: `NinaTurnNotifier` declares
  `Promise<unknown>` precisely so phase 1's `Promise<void>` and any future `Promise<PushSendReport>`
  both assign.

**Leaves alone (owned by others):**
- `lib/push/**` (Phase 1) — this phase imports from it and edits nothing in it.
- `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts` (Phase 3)
- `lib/admin/chatPhotoActions.ts` (Phase 4)
- `scripts/nina-image-worker/**`, `.github/workflows/nina-image.yml` (Phase 5)
- `lib/nina/proactive.ts` — plan invariant 1, byte-identical.
- `lib/nina/actions/**`, `lib/nina/turnrevive.ts`, `lib/nina/chatturn.ts` — phase scope forbids it,
  and the defaulted second parameter is what makes touching them unnecessary.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/turnrun.ts` | modify | a `@/lib/push/*` import group (after `:1`); `NinaTurnNotifier` + `NinaTurnDeps` (after `:113`); a defaulted `deps` parameter and a resolved `notify` local (`:129`–`:134`); **the one notify call** after `closed = true` (`:469`); `deps` threaded into the chain's recursion (`:573`) |
| `tests/nina.turnpush.test.ts` | create | nine properties, driving the real `runNinaBackgroundTurn` with only its edges mocked and the notifier injected — no VAPID, no network (plan invariant 7) |

---

## Where the call goes, and why every other position is wrong

Current `lib/nina/turnrun.ts` numbering (643 lines, base `origin/main` @ `0c53636`):

| Line | What is there | Notify? |
|---|---|---|
| `:353` | `chatTurnWasSuperseded` -> `return` | **NO** — she was retargeted; her answer is a duplicate that is never written |
| `:387` | `!ninaSessionExists` -> `return` | **NO** — the conversation was deleted mid-turn; nothing is written |
| `:392` | `result.payload == null` -> close, distill, `return` | **NO** — she produced no bubble; app-authored prose in her mouth is forbidden |
| `:446` | `const rows = await insertNinaMessages(...)` | her bubbles commit here |
| `:458` | `bubbles = rows.map(...)` | the `SentBubble[]` the notifier needs is in hand |
| `:468` | `await closeNinaChatTurn(userId, turnId, source)` | the poll can now see the reply |
| `:469` | `closed = true` | **← THE NOTIFY GOES IMMEDIATELY AFTER THIS LINE** |
| `:482` | `await runNinaDistillation({...})` | 10–20 s model call — the push must beat it |
| `:494` | `await titleNinaSessionIfNeeded(...)` | a third model call |
| `:573` | `await runNinaBackgroundTurn({...})` — the chain recurses | its bubbles land at `:446` again |

**Above `:468` is wrong.** The push wakes the phone, the tap opens `/nina`, and `/nina`'s poll asks
two questions — "is a turn in flight" and "is there anything after my cursor". Both flip only at
`closeNinaChatTurn`. A push sent before the close can land the runner on a screen still showing a
typing indicator for a reply that is already in the database.

**Below `:482` is wrong.** `runNinaDistillation` is a second model call of 10–20 s and
`titleNinaSessionIfNeeded` is a third. Putting the push after them adds up to half a minute of
silence to a reply that is already thirteen to forty-five seconds late.

**A notification for a message that does not exist is the worst outcome available here.** Three
structural exits above `:446` guarantee it can never happen on the discard, the abandon or the
empty payload — the notify sits below all three `return`s. A fourth case is *not* structural and is
guarded explicitly in Step 4: `insertNinaMessages` **returns `[]` rather than throwing** for a
session that is not this user's (`lib/nina/queries/messages.ts`, and `:369`'s own comment says so),
so `bubbles` can be empty on a path that reached the insert. Phase 1's `buildNinaPushPayload`
already returns `null` for an empty list — but the guard lives *here*, at the site that knows what
an empty `bubbles` means, rather than being inherited from a module two files away.

---

## Implementation Steps

### Step 1: import the push seam

**File:** `lib/nina/turnrun.ts:1` — insert a `@/` import group between the `server-only` line and
the existing relative group. This is `lib/nina/proactive.ts:1–7`'s exact layout (`server-only`,
blank line, `@/` group alphabetical, blank line, relative group alphabetical); `turnrun.ts` has no
`@/` group today, so this creates the first one.

**Change:** replace lines 1–3 (`import 'server-only'`, the blank line, and the first relative
import) with:

**Code:**
```ts
import 'server-only'

import type { NinaPushKind } from '@/lib/push/payload'
import { notifyNinaPush } from '@/lib/push/send'

import { titleNinaSessionIfNeeded } from './autotitle'
```

**Impact:** `lib/push/send.ts` joins this module's runtime graph. Three existing suites import
`turnrun.ts` without mocking `@/lib/push/send` — `tests/nina.burstCancel.test.ts` (through
`@/lib/nina/actions`), `tests/nina.turnrevive.test.ts` and `tests/nina.resend.test.ts` — so
`web-push` now loads in those runs. **This was measured, not assumed:** a throwaway vitest run
against the worktree's real config aliases imported `@/lib/push/send`, resolved `web-push`'s CJS
named exports cleanly, and `sendNinaPush('u1', [...], 'chat_reply')` returned
`{ attempted: 0, skipped: 'VAPID not configured: …' }` with `tests/support/setup.ts`'s env — it
never reached `listLivePushSubscriptions` and never touched the database, because
`sendNinaPush` calls `configureVapid()` before the subscription read. No existing suite needs a new
mock.

There is no import cycle: `lib/push/send.ts`'s only edge back into `lib/nina` is
`import type { ProactiveNotifier } from '@/lib/nina/proactive'`, which the compiler erases (that
file's own header at `:29–33` forbids turning it into a value import).

---

### Step 2: declare the seam's two types

**File:** `lib/nina/turnrun.ts:113` — insert immediately after `NinaBackgroundTurnInput`'s closing
brace and before the `/* ── MOVED VERBATIM from lib/nina/actions.ts:1232–1698 … */` banner at
`:115`, separated by one blank line on each side.

**Change:** add the notifier type and the deps bag.

**Code:**
```ts
/**
 * **The notification seam — `lib/nina/proactive.ts`'s `ProactiveNotifier` shape, one union wider.**
 *
 * `ProactiveNotifier` (`proactive.ts:481`) narrows `kind` to `ProactiveTriggerKind`, which is the
 * single type-level reason the reactive path could not simply import `pushNotifier` and call it
 * with `'chat_reply'`. Phase 1 widened `lib/push` rather than that file (plan invariant 1), so this
 * declares the same three parameters against `NinaPushKind` and nothing else differs.
 *
 * **`Promise<unknown>` and not `Promise<void>` is deliberate.** This file awaits the notifier and
 * discards whatever comes back — a phone being reachable has nothing to do with whether a chat turn
 * succeeded. Declaring `Promise<void>` would make this module's type depend on whether phase 1's
 * notifier reports (`Promise<PushSendReport>` is NOT assignable to `Promise<void>`), which is a
 * coupling with no upside: `unknown` accepts both and the value is never read.
 */
export type NinaTurnNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
) => Promise<unknown>

/**
 * The background turn's injectable edges — today exactly one, and `ProactiveDeps`'s shape
 * (`proactive.ts:487`) on purpose so there is one convention in `lib/nina` and not two.
 *
 * **It is a second, DEFAULTED parameter and not a field on `NinaBackgroundTurnInput`** — see the
 * runner's own signature below for the reason.
 */
export interface NinaTurnDeps {
  /** Defaults to `notifyNinaPush`. A test passes its own and reaches no network (invariant 7). */
  notify?: NinaTurnNotifier
}
```

**Impact:** two new exports. Both are imported by `tests/nina.turnpush.test.ts` (Step 6), so `knip`
sees real import edges for each and reports neither as dead — `knip.ts` keeps
`ignoreExportsUsedInFile: false` on purpose, so an export used only inside `turnrun.ts` *would*
be reported.

---

### Step 3: take the deps and resolve the notifier

**File:** `lib/nina/turnrun.ts:129` — the function signature and its opening locals (`:129`–`:134`).

**Change:** add the defaulted second parameter and resolve `notify` beside the other turn-scoped
locals, above the `try`. This is `emitProactiveMessage`'s arrangement
(`proactive.ts:613`: `const notify = deps.notify ?? pushNotifier`) verbatim in shape.

**Code:** replace lines 129–134 with:
```ts
export async function runNinaBackgroundTurn(
  input: NinaBackgroundTurnInput,
  /*
   * **A SECOND, DEFAULTED PARAMETER — not a field on `NinaBackgroundTurnInput`.**
   *
   * Two reasons, and the second is the load-bearing one:
   *
   *   · every existing caller keeps compiling untouched. `startNinaBackgroundTurn`
   *     (`./actions/startTurn.ts:44`), `reviveNinaChatTurn` (`./turnrevive.ts:249`) and the chain
   *     below all pass the input positionally, and this plan set's scope says editing them would be
   *     duplicate work and three more chances to get it wrong;
   *   · `NinaBackgroundTurnInput` is a **DTO**, and two of its three builders assemble it from
   *     DATABASE ROWS — the revive rebuilds a dead turn's input out of `nina_messages`, and the
   *     chain rebuilds one out of `listNinaMessages`' newest row. A function has no column to be
   *     rebuilt from, so putting the seam on that type would make every builder decide what to do
   *     about a field none of them can source.
   */
  deps: NinaTurnDeps = {},
): Promise<void> {
  const { userId, sessionId, turnId, runnerMessageId } = input
  /* The default is the real Web Push sender and it never throws — because `notifyNinaPush` has its
   * OWN catch (phase 1, `send.ts`), not because the machinery under it is safe. `sendNinaPush`
   * itself CAN reject: `listLivePushSubscriptions` is a database round trip outside its `try`. What
   * IS free is the no-keys case — with no VAPID in the environment `sendNinaPush` catches
   * `pushEnv()` and returns `skipped` before touching the database, so a suite with neither keys
   * nor a network keeps passing against the real notifier. Note the difference from
   * `proactive.ts:615-619`, whose default is `pushNotifier` and DOES propagate; that is why the
   * call site below has a `try` of its own as well. */
  const notify = deps.notify ?? notifyNinaPush
  let source: NinaTurnSource = 'unavailable'
  let failure: string | undefined = 'crashed'
  let closed = false
  let bubbles: SentBubble[] = []
```

**Impact:** none at any call site. `deps` is defaulted, so `runNinaBackgroundTurn(input)` is still
a legal call, and `typeof runNinaBackgroundTurn` still accepts every argument list it accepts today.

---

### Step 4: the one notify call

**File:** `lib/nina/turnrun.ts:469` — insert immediately after `closed = true` and before the
`/* * STEP 6 — the distillation (R4). …` banner at `:471`, separated by one blank line on each side.

**Change:** the phase's whole substance.

**Code:**
```ts
    /*
     * ── R1: THE PUSH. The reply is committed and the claim is closed; now tell the phone. ───────
     *
     * **This one site covers four entry points.** `sendNinaMessage` (`./actions/send.ts:927`),
     * `resendNinaTurn` (`./actions/resend.ts:237`), `reviveNinaChatTurn` (`./turnrevive.ts:249`)
     * and the chain below all converge on this function, and the chain's follow-up bubbles land at
     * the same `insertNinaMessages` twenty lines above. A fifth copy in each of those files would
     * be four chances to get the ordering wrong.
     *
     * ── THE POSITION IS THE DESIGN, IN BOTH DIRECTIONS ──────────────────────────────────────────
     * BELOW the close, because `/nina`'s poll asks two questions — "is a turn in flight" and "is
     * there anything after my cursor" — and BOTH flip at `closeNinaChatTurn` and nowhere else. A
     * push sent one statement earlier wakes him, he taps, and the screen he lands on is still
     * showing a typing indicator for a reply that is already in the database.
     *
     * ABOVE the distillation, because `runNinaDistillation` is a second model call of 10-20 s and
     * `titleNinaSessionIfNeeded` under it is a third. This reply is already 13-45 s old — the whole
     * point of the nina-offline-reply design is that he put the phone down — and spending another
     * half minute before buzzing it would give the delay back.
     *
     * ── IT CAN NEVER FIRE FOR A MESSAGE THAT DOES NOT EXIST ─────────────────────────────────────
     * Three exits above write no bubble and all three `return` before this line: the supersession
     * discard (`:353`), the deleted-session abandon (`:387`), and the null payload (`:392`). The
     * fourth case is NOT structural and is what `bubbles.length` guards: `insertNinaMessages`
     * degrades to `[]` rather than throwing for a session that is not this user's (see `:369`), so
     * a turn CAN reach here with nothing committed. Phase 1's `buildNinaPushPayload` would also
     * return null for an empty list, but the guard belongs at the site that knows what an empty
     * `bubbles` MEANS, not two modules away.
     *
     * ── ITS OWN `try`, AND IT LOGS RATHER THAN THROWS (plan invariant 2) ─────────────────────────
     * `proactive.ts:702-706` exactly. A push that fails must not cost him the distillation, the
     * auto-title or the chain, and it must certainly not turn a turn that SUCCEEDED into one the
     * ledger records as 'crashed' — `closed` is already true, so the `finally` below will not
     * re-close the row, but the enclosing `catch` at `:496` would still log this turn as failed.
     * Awaited rather than fire-and-forget, again like proactive: two subscriptions is the realistic
     * maximum, we are inside `after()`'s 240 s budget with a 10-20 s model call still to come, and
     * a deterministic order is what makes this testable at all.
     */
    if (bubbles.length > 0) {
      try {
        await notify(userId, bubbles, 'chat_reply')
      } catch (cause) {
        console.warn('[nina] reply notify failed', { turnId, error: String(cause) })
      }
    }
```

**Impact:** one push per committed reply. `bubbles` is `SentBubble[]` — `{ id, body, replyToId }` —
which is structurally assignable to `ReadonlyArray<{ id: string; body: string }>` with no mapping
(`replyToId` is an excess property, and excess-property checking does not apply to a variable
reference). Phase 1's `buildNinaPushPayload` takes the first non-blank body and drops the rest, so a
four-bubble reply is one notification by construction, and `PUSH_NOTIFICATION_TAG = 'nina'` means it
replaces any earlier Nina notification in the tray rather than stacking.

---

### Step 5: thread `deps` through the chain's recursion

**File:** `lib/nina/turnrun.ts:573` — the `await runNinaBackgroundTurn({ … })` call that closes at
`:584`. The long comment block at `:556–572` above it is unchanged.

**Change:** pass `deps` as the second argument.

**Code:** replace lines 573–584 with:
```ts
    await runNinaBackgroundTurn(
      {
        userId,
        sessionId,
        turnId: nextTurnId,
        runnerMessageId: newest.id,
        runnerText: newest.body.length > 0 ? newest.body : null,
        imageDescriptions: [],
        quotedRow: null,
        attachedRunId: newest.runId,
        depth: input.depth + 1,
        startedAtMs: input.startedAtMs,
      },
      /* The chain inherits the caller's seam. In production this is `{}` and the default resolves
       * to the same `notifyNinaPush` either way — but a test that injects a notifier and then never
       * sees the chained link's push would be asserting the wrong thing, and a future dep that is
       * NOT interchangeable with its default would silently revert to production behaviour one
       * link in. The link is a full turn: it commits its own bubbles at the same insert and it
       * sends its own push. */
      deps,
    )
```

**Impact:** a burst that produces two replies produces two pushes, one per committed link — which
is correct: the tray collapses them onto the single `'nina'` tag and `renotify: true` buzzes again,
so he is told about the follow-up rather than about a stale first answer.

---

### Step 6: the test

**File:** `tests/nina.turnpush.test.ts` — new.

**Change:** drive the **real** `runNinaBackgroundTurn` with only its edges mocked, exactly as
`tests/nina.turnrevive.test.ts` and `tests/nina.burstCancel.test.ts` do (both of which state the
reason in their own headers: mocking the module under test makes every property untestable). This
suite calls the runner **directly** rather than through a Server Action, because the function *is*
the unit and `next/server`'s `after()` is not part of what this phase changed.

`beforeEach` uses **`vi.resetAllMocks()`**, not `clearAllMocks` — a failed test's unconsumed
`mockResolvedValueOnce` otherwise ghosts into the next test, and Tests 6 and 7 both use once-queues.

**Code:**
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runNinaBackgroundTurn, type NinaTurnDeps, type NinaTurnNotifier } from '@/lib/nina/turnrun'

/**
 * **R1: a reply the background turn commits sends exactly one push — and a reply it never commits
 * sends none.**
 *
 * Nine properties, in the order they would hurt if they were wrong:
 *
 *   1. **A committed reply notifies once**, with the rows `insertNinaMessages` returned and the
 *      kind `'chat_reply'`.
 *   2. **The order is insert -> close -> notify -> distill.** Below the close so the poll can
 *      already see the reply; above the distillation's 10-20 s model call so the buzz is not held
 *      behind it.
 *   3. **The supersession discard notifies nothing** — her answer is a duplicate and is never
 *      written.
 *   4. **The deleted-session abandon notifies nothing** — the conversation is gone.
 *   5. **A null payload notifies nothing** — she produced no bubble; the turn still closes and
 *      still distills.
 *   6. **An insert that degrades to `[]` notifies nothing** — `insertNinaMessages` returns an empty
 *      array rather than throwing for a session that is not this user's, and a notification for a
 *      message that does not exist is the worst outcome available on this path.
 *   7. **A chained follow-up sends its own push** — the seam is threaded through the recursion.
 *   8. **A notify rejection costs nothing** — the rows, the closed claim, the distillation, the
 *      auto-title and the chain all still happen (plan invariant 2).
 *   9. **The default seam is the real push sender** — no `deps`, and `lib/push/send`'s notifier is
 *      what gets called.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `@/lib/nina/queries`, `@/lib/nina/chatturn`, `@/lib/nina/load`, `@/lib/nina/gateway`,
 * `@/lib/nina/turn`, `@/lib/nina/distill`, `@/lib/nina/autotitle` — the same set
 * `tests/nina.burstCancel.test.ts` mocks, for the same reason. `turnrun.ts` itself is real.
 * `@/lib/push/send` is mocked so property 9 can observe the default WITHOUT depending on the
 * absence of `VAPID_*` from the environment; every other property drives an injected notifier. No
 * test in this file can reach a push service (plan invariant 7).
 */

/* ── the edges ─────────────────────────────────────────────────────────────────────────────── */

const insertNinaMessages = vi.fn()
const listNinaMessages = vi.fn()
const readNinaTuning = vi.fn()
const bumpNinaShortcutUses = vi.fn()

vi.mock('@/lib/nina/queries', () => ({
  /* Every name `turnrun.ts` imports. A missing one is an import error, not an undefined. */
  bumpNinaShortcutUses: (...a: unknown[]) => bumpNinaShortcutUses(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: (...a: unknown[]) => readNinaTuning(...a),
}))

const chatTurnWasSuperseded = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()
const openNinaChatTurn = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: (...a: unknown[]) => chatTurnWasSuperseded(...a),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  supersedeNinaChatTurn: vi.fn(),
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
  /* The burst walk reads this. Vitest THROWS on an export the factory omits, which would crash the
   * turn before its model call — the value is the real literal, though no test here reads it. */
  NINA_BURST_MAX_MESSAGES: 6,
  productionDeps: () => ({}),
  runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
}))
vi.mock('@/lib/nina/distill', () => ({
  runTurnDistillation: (...a: unknown[]) => runTurnDistillation(...a),
}))
vi.mock('@/lib/nina/autotitle', () => ({
  titleNinaSessionIfNeeded: (...a: unknown[]) => titleNinaSessionIfNeeded(...a),
}))

/* Property 9 only: the DEFAULT seam. Every other property injects, so this mock is idle for them. */
const notifyNinaPush = vi.fn()
vi.mock('@/lib/push/send', () => ({
  notifyNinaPush: (...a: unknown[]) => notifyNinaPush(...a),
  pushNotifier: vi.fn(),
  sendNinaPush: vi.fn(),
}))

/* ── the fixture ───────────────────────────────────────────────────────────────────────────── */

const USER = 'u1'
const SESSION = 'ses000000001'
const HIS = 'msgrunner001'
const TURN = 'turn00000001'
const TURN2 = 'turn00000002'

/** Her answer, as `insertNinaMessages` returns it — the rows the notification is built from. */
function ninaRows() {
  return [
    { id: 'msgnina00001', seq: 42, body: 'iya, makan bareng yuk', replyToId: HIS },
    { id: 'msgnina00002', seq: 43, body: 'abis itu kita jalan', replyToId: null },
  ]
}

/** The chained link's answer, distinct so property 7 can tell the two pushes apart. */
function chainedRows() {
  return [{ id: 'msgnina00003', seq: 44, body: 'jam 12 ya', replyToId: null }]
}

/** A `runNinaTurn` answer with a real payload — every no-push exit must be a CHOICE, not silence. */
function answeredResult() {
  return {
    source: 'llm' as const,
    payload: { bubbles: ['iya, makan bareng yuk', 'abis itu kita jalan'], memoryWrites: [] },
    usage: { inputTokens: 1_234, outputTokens: 567 },
    trace: { model: 'glm-5.3', promptVersion: 7, rounds: 0, toolCalls: [], latencyMs: 13_000 },
    firedShortcutIds: [],
  }
}

/** The turn's input at depth 0, as `startNinaBackgroundTurn` builds it. */
function turnInput(overrides: { depth?: number } = {}) {
  return {
    userId: USER,
    sessionId: SESSION,
    turnId: TURN,
    runnerMessageId: HIS,
    runnerText: 'mau makan apa lunch?',
    imageDescriptions: [] as readonly string[],
    quotedRow: null,
    attachedRunId: null,
    depth: overrides.depth ?? 0,
    /* NOW, so the chain's wall-clock guard (240 s budget minus a 45 s turn) never trips. */
    startedAtMs: Date.now(),
  }
}

const notify = vi.fn<NinaTurnNotifier>()
const deps: NinaTurnDeps = { notify }

beforeEach(() => {
  /* `resetAllMocks`, not `clearAllMocks`: properties 6 and 7 queue `mockResolvedValueOnce`, and an
   * unconsumed once-value from a failed test ghosts into the next one. */
  vi.resetAllMocks()

  insertNinaMessages.mockResolvedValue(ninaRows())
  /* The newest row in the session is HERS, so the chain's guard exits and an ordinary turn stays
   * one turn deep. Property 7 overrides this. */
  listNinaMessages.mockResolvedValue([
    { id: 'msgnina00001', seq: 42, role: 'nina', body: 'iya', runId: null },
  ])
  readNinaTuning.mockResolvedValue({ relationship: 'friend' })
  bumpNinaShortcutUses.mockResolvedValue(undefined)

  chatTurnWasSuperseded.mockResolvedValue(false)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)
  openNinaChatTurn.mockResolvedValue(TURN2)

  /* Shaped for everything the turn reads off the context: the window (the burst walk, the
   * ownership set, `recentRunnerTexts`, the chain guard), and the memory slots, runner identity
   * and `olderMessageCount` that `runNinaDistillation` maps in. */
  loadNinaContext.mockResolvedValue({
    conversation: { window: [], olderMessageCount: 0 },
    memory: { slots: [] },
    runner: { fullName: 'Test Runner', nickname: null },
  })
  runNinaTurn.mockResolvedValue(answeredResult())
  runTurnDistillation.mockResolvedValue(undefined)
  titleNinaSessionIfNeeded.mockResolvedValue(undefined)

  notify.mockResolvedValue(undefined)
  notifyNinaPush.mockResolvedValue(undefined)
})

/* ── 1 & 2: the reply that lands ───────────────────────────────────────────────────────────── */

describe('a reply the turn commits', () => {
  it('notifies once, with the committed rows and the chat_reply kind', async () => {
    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(USER, ninaRows(), 'chat_reply')
  })

  it('notifies after the insert and the close, and before the distillation', async () => {
    await runNinaBackgroundTurn(turnInput(), deps)

    const insertOrder = insertNinaMessages.mock.invocationCallOrder[0]!
    const closeOrder = closeNinaChatTurn.mock.invocationCallOrder[0]!
    const notifyOrder = notify.mock.invocationCallOrder[0]!
    const distillOrder = runTurnDistillation.mock.invocationCallOrder[0]!

    /* Below the close, because the poll's two questions both flip there — a push that beats the
     * close lands him on a screen still showing a typing indicator. */
    expect(insertOrder).toBeLessThan(closeOrder)
    expect(closeOrder).toBeLessThan(notifyOrder)
    /* Above the distillation, which is a 10-20 s model call on a reply already 13-45 s old. */
    expect(notifyOrder).toBeLessThan(distillOrder)
  })
})

/* ── 3, 4, 5, 6: every path that writes no bubble ──────────────────────────────────────────── */

describe('a turn that writes no bubble', () => {
  it('sends nothing when the turn was superseded mid-flight', async () => {
    chatTurnWasSuperseded.mockResolvedValue(true)

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).not.toHaveBeenCalled()
    /* And it really was a DISCARD, not an absence of an answer: she had one. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('sends nothing when the session was deleted mid-turn', async () => {
    ninaSessionExists.mockResolvedValue(false)

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).not.toHaveBeenCalled()
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('sends nothing when she produced no payload, and still closes and distills', async () => {
    runNinaTurn.mockResolvedValue({ ...answeredResult(), payload: null })

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).not.toHaveBeenCalled()
    expect(insertNinaMessages).not.toHaveBeenCalled()
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when the insert degrades to an empty array', async () => {
    /* `insertNinaMessages` returns `[]` rather than throwing for a session that is not this user's.
     * The turn reaches the notify line with nothing committed, and the `bubbles.length` guard is
     * the only thing between that and a notification for a message that does not exist. */
    insertNinaMessages.mockResolvedValue([])

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(insertNinaMessages).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
    /* The turn is otherwise unchanged — this is a guard, not a new exit. */
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
  })
})

/* ── 7: the chain ──────────────────────────────────────────────────────────────────────────── */

describe('a chained follow-up', () => {
  it('sends its own push', async () => {
    /* The newest row is HIS after the first turn, so the chain opens a second claim and recurses;
     * after the second turn it is HERS, so the chain stops one link deep. */
    listNinaMessages
      .mockResolvedValueOnce([{ id: 'msgrunner002', seq: 44, role: 'runner', body: 'eh', runId: null }])
      .mockResolvedValue([{ id: 'msgnina00003', seq: 45, role: 'nina', body: 'jam 12 ya', runId: null }])
    insertNinaMessages.mockResolvedValueOnce(ninaRows()).mockResolvedValue(chainedRows())

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(openNinaChatTurn).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenNthCalledWith(1, USER, ninaRows(), 'chat_reply')
    /* The seam reached the recursion. Without `deps` threaded at the chain's call site this second
     * assertion fails while the first passes — which is exactly the bug it exists to catch. */
    expect(notify).toHaveBeenNthCalledWith(2, USER, chainedRows(), 'chat_reply')
  })
})

/* ── 8: invariant 2 ────────────────────────────────────────────────────────────────────────── */

describe('a notify that fails', () => {
  it('costs the turn nothing', async () => {
    notify.mockRejectedValue(new Error('apn: 503'))
    listNinaMessages.mockResolvedValue([
      { id: 'msgrunner002', seq: 44, role: 'runner', body: 'eh', runId: null },
    ])

    await runNinaBackgroundTurn(turnInput({ depth: 1 }), deps)

    /* The rows, the closed claim, the distillation and the auto-title are all untouched … */
    expect(insertNinaMessages).toHaveBeenCalledTimes(1)
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
    expect(titleNinaSessionIfNeeded).toHaveBeenCalledWith(USER, SESSION)
    /* … and the claim is never re-closed with a failure reason, because the turn did not fail. */
    expect(closeNinaChatTurn).toHaveBeenCalledTimes(1)
    /* … and the chain still runs: `depth: 1` is under NINA_TURN_CHAIN_MAX and the newest row is his.
     * `openNinaChatTurn` answering TURN2 means the swallow did not eat the rest of the function. */
    expect(openNinaChatTurn).toHaveBeenCalled()
  })
})

/* ── 9: the default ────────────────────────────────────────────────────────────────────────── */

describe('the default seam', () => {
  it('is lib/push/send’s notifier when no deps are passed', async () => {
    await runNinaBackgroundTurn(turnInput())

    expect(notifyNinaPush).toHaveBeenCalledTimes(1)
    expect(notifyNinaPush).toHaveBeenCalledWith(USER, ninaRows(), 'chat_reply')
    /* The injected double was never wired on this call — the production default really is the path. */
    expect(notify).not.toHaveBeenCalled()
  })
})
```

**Impact:** a new suite. It never calls `after()`, never imports a Server Action module, and never
reaches `web-push` — `@/lib/push/send` is mocked in this file and every behavioural property injects
its own notifier.

**Note for the implementer on Test 8:** `depth: 1` is under `NINA_TURN_CHAIN_MAX` (`= 2`), so the
chain runs. `openNinaChatTurn` is asserted as *called* rather than the recursion being drained,
because the recursed link would immediately re-read `listNinaMessages` and chain again at depth 2,
where the cap stops it — that is two links, which is fine but is the chain's own suite's business,
not this one's.

---

## Verification

**Build:** `npm run typecheck` — i.e. `next typegen && tsc --noEmit`. Run it from the worktree root
(`/home/miftah/.worktrees/run-insights/nina-push-every-message`), which already has `.env.local` and
a real `npm install`. **`vitest` does not typecheck**, so this is not optional and is the gate that
catches a wrong `NinaPushKind` member or a `kind` still narrowed to `ProactiveTriggerKind`.

**Lint:** `npm run lint`, then `npm run format:check` (prettier: no semicolons, single quotes,
`printWidth: 100` — every code block above is already written to it).

**Tests:**
- `npx vitest run tests/nina.turnpush.test.ts` — the new suite.
- `npx vitest run tests/nina.burstCancel.test.ts tests/nina.turnrevive.test.ts tests/nina.resend.test.ts`
  — the three suites that import `turnrun.ts` without mocking `@/lib/push/send`. They must stay
  green with `web-push` newly in their graph. *(Measured before this plan was written: importing
  `@/lib/push/send` under this repo's vitest aliases resolves `web-push`'s CJS named exports and
  `sendNinaPush` returns `skipped: 'VAPID not configured: …'` with `attempted: 0`, without touching
  the database.)*
- `npm test` — the full suite.

**Also run:** `npm run ci:llm-payload-guard`. `scripts/check-llm-payload-boundary.mjs` keys its
sanction lists on file paths and lists `lib/nina/turnrun.ts` twice (for `runNinaTurn` and for
`titleNinaSessionIfNeeded`). This phase adds no guarded symbol and moves nothing, so the guard
should be untouched — run it to prove that rather than to discover it.

**Also run:** `npm run knip`. `NinaTurnNotifier` and `NinaTurnDeps` are both imported by the new
test, so neither should appear in the report; `knip.ts` keeps `ignoreExportsUsedInFile: false`, so
an export only `turnrun.ts` used would be flagged.

**Manual check (production only — `VAPID_*` is Production-scope on Vercel, so a preview deployment
cannot send a push at all):** send Nina a message on the XS Max with the PWA installed and
notifications enabled, lock the phone, and wait. It buzzes with her first bubble ~13–45 s later.
Then send three messages in a row without waiting; the burst's chained follow-up buzzes again on the
same tray tag.

**Exit criteria:**
- A reply written by `runNinaBackgroundTurn` sends exactly one push carrying the **first** bubble,
  stamped `kind: 'chat_reply'`.
- A chained follow-up sends its own.
- None of the four no-bubble paths (supersession, session-gone, null payload, empty insert) sends
  anything.
- A notify failure leaves the rows, the closed claim, the distillation, the auto-title and the chain
  untouched, and the turn is not logged as failed.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` all pass.
- `lib/nina/actions/**`, `lib/nina/turnrevive.ts`, `lib/nina/chatturn.ts`, `lib/nina/proactive.ts`,
  `lib/push/**`, `lib/admin/**` and `scripts/**` are untouched in this phase's diff.

## Assumptions

- **A-P1-a — settled, no longer an assumption.** `NinaPushKind` and the member `'chat_reply'` are
  phase 1's, read off `phase-1.md`'s Interface Contract. So is the name `notifyNinaPush` and its
  `(userId, messages, kind)` parameter order.
- **A-P1-b.** `notifyNinaPush` never throws, because phase 1 gives it its own `catch` — *not*
  because the sender under it is safe. `sendNinaPush` genuinely can reject: `listLivePushSubscriptions`
  sits outside its `try`. This phase wraps the call in a `try` regardless, per plan invariant 2 —
  belt to that brace.
- Phase 1 does not change `sendNinaPush`, `buildNinaPushPayload` or `NinaPushPayload.v`, and
  `pushNotifier` changes only by gaining one typed local with identical runtime (phase 1, Step 4).
  Confirmed against `phase-1.md`; the Verification section's probe result therefore still holds.

## Decisions

**D1 — the seam is a defaulted second parameter, not a field on `NinaBackgroundTurnInput`.** The
phase scope asked for this to be stated. Two reasons, recorded in the code at Step 3: three callers
pass the input positionally and must keep compiling untouched, and — the stronger one — two of the
input's three builders assemble it from *database rows* (`turnrevive.ts` rebuilds a dead turn's
input from `nina_messages`; the chain rebuilds one from `listNinaMessages`' newest row). A function
has no column to be rebuilt from. `ProactiveDeps` is the same shape for the same reason
(`emitProactiveMessage(..., deps: ProactiveDeps = {})`), so this leaves `lib/nina` with one
convention rather than two.

**D2 — `NinaTurnNotifier` returns `Promise<unknown>`, not `Promise<void>`.** `Promise<X>` is not
assignable to `Promise<void>`, so declaring `void` would make this module's type depend on whether
phase 1's notifier returns a `PushSendReport`. The value is awaited and discarded either way.

**D3 — the push is awaited, not fire-and-forget.** Matching `proactive.ts:702`. Two subscriptions is
the realistic maximum, the function is inside `after()`'s 240 s budget with a 10–20 s model call
still ahead of it, and a deterministic order is what makes Test 2 possible at all.

**D4 — the `bubbles.length > 0` guard is duplicated between here and phase 1's payload builder, on
purpose.** `buildNinaPushPayload` already returns `null` for an empty list, but the guard belongs at
the site that knows *why* `bubbles` can be empty (`insertNinaMessages` degrading to `[]` for a
foreign session). Removing it would make this file's most important invariant enforceable only by
reading another package.

## Handoffs

Found while reading, deliberately left:

- **`sendNinaMessage`, `resendNinaTurn`, `reviveNinaChatTurn` and `startNinaBackgroundTurn` need no
  edit at all** — this is the phase's whole point, and it is recorded here so a reviewer does not
  read their absence from the diff as an oversight. `lib/nina/actions/startTurn.ts:44` and
  `lib/nina/turnrevive.ts:249` both call `runNinaBackgroundTurn(input)` positionally and keep
  compiling because `deps` is defaulted.
- **`imagerun.ts`, `imagejobs.ts` (R1, phase 3)** — a photograph asked for in a chat turn is
  answered ~78 s later by `finishSelfie`, and the apology up to 20 min later. Both write
  `nina_messages` rows that this phase's call site never sees, because they land outside
  `runNinaBackgroundTurn`. **Not this phase's R even though it shares R1's id** — phase 3 owns those
  two files.
- **`lib/admin/chatPhotoActions.ts` (R2, phase 4)** — that file's comment at `:780` already expects
  the bubble to arrive "by service-worker refresh", which today never fires. Out of scope here on
  both counts: it is another phase's file *and* another requirement.
- **`scripts/nina-image-worker/finish.ts` (R1, phase 5)** — the off-platform host, under different
  module rules; it cannot import `lib/push/send.ts` at all.
- **`ProactiveNotifier` and `NinaTurnNotifier` are now two declarations of nearly the same shape**
  (`proactive.ts:481` and `turnrun.ts`, differing only in the `kind` union). Collapsing them into
  one type in `lib/push` would be tidier, but it edits `lib/nina/proactive.ts`, which plan
  invariant 1 forbids to every phase in this set. Leave it; it is a candidate for a later card, not
  a drive-by.
- **`tests/nina.turnrevive.test.ts:347–357`'s source-text guard** asserts `turnrun.ts` still opens
  with `import 'server-only'` and is not a `'use server'` module. Step 1 keeps `import 'server-only'`
  as the first statement, so that guard stays green — noted because it is a *text* assertion over a
  file this phase edits, and text assertions are the ones that break silently.

## Rollback

`git revert` this phase's single commit. It adds a parameter with a default, two exported types, one
guarded `try`/`catch`, one threaded argument and one new test file; it removes nothing, changes no
schema, adds no dependency and alters no wire format. Reverting it leaves `lib/push` (phase 1) and
phases 3–5 fully working — their call sites are in different files and do not import anything this
phase created.

If only the *behaviour* needs to stop without a deploy, the runner turns notifications off on `/me`,
which revokes the subscription; `sendNinaPush` then returns `skipped: 'no live subscriptions'` and
this call site becomes a no-op with no code change.
