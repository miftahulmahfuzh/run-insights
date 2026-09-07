# Phase 4: Resend a message that was never answered

**Plan set:** `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md`
**Analysis:** `20260907-125041-PHRF_code_analyzer.md`
**Satisfies:** R5 — *"sometimes, user chat message is left unanswered. add option to resend as well (just for user's bubble)"*
**Depends on:** Phase 3 (it ships the tap opener; without it the new item is reachable only by the shipped left-swipe and the focus-only button)
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

A confirmed bubble of his offers **Resend**, and pressing it re-runs Nina's turn for the row that is
already on the server: the sweep runs, a fresh `nina_turns` claim opens against the same
`runner_message_id`, and `startNinaBackgroundTurn` gets a `NinaBackgroundTurnInput` rebuilt from the
persisted row — his text, his photos' descriptions, his quote, his attached run. The screen goes
into the same `awaiting` state a send produces, so her answer arrives through the shipped poll and
the shipped staggered reveal. **No `nina_messages` row is written** (invariant 7), and a resend while
a turn is already live is refused with a reason the sheet shows rather than opening a second claim.

## Interface Contract

**Deletes:** none.

**Renames:** none.

**Creates:**
- `lib/nina/actions.ts` → `export async function resendNinaMessage(input: { messageId: string }): Promise<ResendNinaMessageResult>`
- `lib/nina/actions.ts` → `export type NinaResendRefusal = 'not-found' | 'not-mine' | 'empty' | 'turn-live' | 'failed'`
- `lib/nina/actions.ts` → `export interface ResendNinaMessageResult { ok: boolean; turnId: string | null; cursor: number | null; reason: NinaResendRefusal | null }`
- `lib/nina/actions.ts` → module-private `function resendRefused(reason: NinaResendRefusal): ResendNinaMessageResult`
- `lib/nina/edit.ts` → `export function canResendMessage(target: EditTarget): boolean`, **appended
  at the END of the file, after Phase 3's `── the tap ──` block** (not inserted under
  `canActOnMessage` — RECONCILED, see Step 1)
- `components/nina/MessageActionsSheet.tsx` → new **required** prop `onResend: (id: string) => Promise<string | null>` (resolves `null` on success; otherwise the sentence to render as the sheet's `refusal`)
- `components/nina/MessageActionsSheet.tsx` → module-private `async function resend()`
- `components/nina/ChatScreen.tsx` → `handleResendMessage` (`useCallback`), and module-private `const RESEND_REFUSAL_TEXT: Record<NinaResendRefusal, string>`
- `tests/nina.resend.test.ts` (new file)

**Signature changes:**
- `MessageActionsSheet` gains one required prop (above). `ChatScreen` is its only caller and passes it in the same commit, so the tree stays green.
- **No change to `startNinaBackgroundTurn`.** It stays a module-private `function` in `lib/nina/actions.ts` and is called from inside the same module — see Step 2's note. Nothing is exported to make this phase work.

**Requires (from earlier phases) — RECONCILED, and this section now describes `lib/nina/edit.ts`
AS PHASE 3 LEAVES IT, not as `origin/main` has it:**

- Phase 3 has landed a pure tap decision in `lib/nina/edit.ts` and a pointer opener in
  `components/nina/MessageBubble.tsx`. The dependency is product-level (a mouse can open the sheet
  at all) **plus two facts about `lib/nina/edit.ts` this phase must build on:**
  1. **`canActOnMessage`'s signature has widened** from `(target: EditTarget)` to
     `(target: ActionableMessage)`, where `ActionableMessage = Pick<EditTarget, 'id' | 'confirmed'>`
     is a new export Phase 3 inserts above `canActOnMessage`'s docstring. This is a pure widening:
     `canResendMessage` keeps taking a full `EditTarget` (it reads `.mine`, which
     `ActionableMessage` does not carry) and its `canActOnMessage(target)` call still typechecks,
     because `EditTarget` satisfies `ActionableMessage` structurally. Phase 3's Step 1 confirms
     both shapes stay valid for this phase.
  2. **Phase 3 appends a `── the tap ──` section at the foot of the file** — `MESSAGE_ACTION_TAP_SLOP_PX`,
     `BUBBLE_BODY_SELECTOR`, `BUBBLE_INTERACTIVE_SELECTOR`, `MessageActionTapGesture`,
     `MessageActionTapDecision`, `decideMessageActionTap`. **`canResendMessage` goes AFTER all of
     it**, which is what keeps the two phases' hunks from touching (see Step 1).
- **Phase 3 edits ZERO lines of `components/nina/ChatScreen.tsx`** — its own Step 4e states this in
  as many words ("Zero lines of `ChatScreen.tsx` change, which leaves the file entirely to phase
  4"). So every line number quoted for that file below is valid exactly as written at
  `origin/main` @ `e6c68d6`. Phase 3 also touches neither
  `components/nina/MessageActionsSheet.tsx` nor `lib/nina/actions.ts`. Anchor on quoted text
  anyway, as a habit — but nothing in this set moves those integers.

**Leaves alone (owned by others):**
- `lib/nina/actions.ts` → `resolveAttachment` (`:183-233`) and the attach `insertNinaMessageImages`
  block (`:562-576`) — **phase 1 owns those, in this same file.** Ranges corrected by the
  reconciler against the branch; the draft's `:183-236` / `:552-574` were both slightly off.
  This phase's footprint in `actions.ts` is one added name in the `./queries` import statement
  (`:26-36`) and one new block inserted at `:1022`, between `runNinaBackgroundTurn`'s closing brace
  (`:1021`) and `export interface NinaReplyPoll` (`:1024`).
  **VERIFIED DISJOINT — phases 1 and 4 need no dependency edge and may run concurrently.** The
  nearest pair of hunks is ~446 lines apart (phase 1 ends at `:576`, this phase begins at `:1022`),
  and phase 1's only import edit is a *separate statement* — `import { ninaPhotoProvenance } from
  './attach'`, which sorts to `:9`, seventeen lines above the `./queries` block this phase touches.
  Phase 1 adds **no** `./queries` name, so this phase's test mock factory needs no change on its
  account either.
- `insertNinaMessages`, `insertNinaMessageImages`, `pollNinaReply`, `lib/nina/turnflight.ts`,
  `lib/nina/messageActions.ts`, `lib/nina/queries.ts`, `components/nina/MessageBubble.tsx`.
- Phase 1's provenance columns and all DDL (invariant 8 — this phase writes no migration).
- `components/admin/*` and `lib/admin/*` (phases 1 and 2).
- No new bubble chrome: no "unanswered" badge, no retry icon, no ring.
  `MessageBubble.tsx:254-255` records that choice — *"a row whose send threw keeps a red hairline so
  the runner can see which line to try again, without an icon, a badge or a retry button"* — and the
  plan index puts it out of scope.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/actions.ts` | modify | one name added to the `./queries` import statement (`:26-36`); `resendNinaMessage` + its two exported types + one private helper inserted at `:1022`. Disjoint from Phase 1's hunks (`:9`, `:183-233`, `:562-576`) — no edge needed |
| `lib/nina/edit.ts` | modify | `canResendMessage` **appended at the end of the file**, after Phase 3's `── the tap ──` block. RECONCILED: the draft put it at `:109`, two lines below the signature line Phase 3 rewrites |
| `lib/nina/edit.test.ts` | modify | one `describe('canResendMessage', …)` block **appended at the end of the file**, after Phase 3's `decideMessageActionTap` describe; `canResendMessage` added to the `./edit` import block **as Phase 3 leaves it**. RECONCILED: the draft inserted at `:73` and quoted the pre-Phase-3 import |
| `components/nina/MessageActionsSheet.tsx` | modify | `onResend` prop (`:54-70`); `resend()` after `confirmDelete` (`:122`); the menu item + refusal line inserted at `:165`; `disabled={pending}` on the two existing menu buttons |
| `components/nina/ChatScreen.tsx` | modify | import (`:10`); `RESEND_REFUSAL_TEXT` at `:141`; `handleResendMessage` at `:823`; `onResend` prop at `:1213` |
| `tests/nina.resend.test.ts` | create | the action's suite — refusals, invariant 7, the claim, the cursor, and the rebuilt turn input |

Six files. No migration, no new env var, no entry in
`scripts/check-llm-payload-boundary.mjs` (`lib/nina/actions.ts` is already the sanctioned call site
for `runNinaTurn`, `distillNinaMemory` and `titleNinaSessionIfNeeded`, and this phase adds no new
model-calling symbol — invariant 5 holds mechanically, verified against the script).

---

## Decisions settled before Step 1

**D-a. The cursor a resend returns is the NEWEST persisted `seq` in that conversation, and the
client applies it as a `Math.max`.**

`pollNinaReply` polls `listNinaMessagesAfter`, whose predicate is
`gt(ninaMessages.seq, opts.afterSeq)` (`lib/nina/queries.ts:1109`) — strictly greater. So
`cursor = X` means "the client already holds everything through `seq` X". Three candidate values,
and only one is safe:

- **The resent row's own `seq`** — WRONG. `pollNinaReply` filters to `role === 'nina'`, so his own
  row cannot come back twice; but every bubble *of hers* between that row and the client's real
  position would be re-delivered and re-revealed. A resend of an older message would repaint half
  the conversation.
- **Leave the client's `cursorRef` untouched** — nearly safe, and rejected for one measured reason:
  `cursorRef` is written only by the send and by the poll (`ChatScreen.tsx:291`, `:923`), while the
  service-worker push path (`SW_MESSAGE_TYPE`) delivers rows through `router.refresh()` →
  `mergeServerMessages` **without touching it**. After a push-driven refresh the client HOLDS rows
  whose `seq` exceeds `cursorRef`, and a poll resumed from there would duplicate them.
- **The newest persisted `seq` at the moment of the resend** — CHOSEN. Read with the same one-row
  indexed query `pollNinaReply` already uses (`listNinaMessages(userId, { limit: 1, sessionId })`,
  which returns the newest row for `limit: 1` — `queries.ts:1064-1076` scans `ORDER BY seq DESC` and
  reverses in TypeScript). It is `>=` every row the client can hold, and the resent turn's bubbles
  are inserted with a strictly higher `seq`, so the first poll asks for exactly the set the resend
  produced: no duplicate, and nothing of the answer skipped.

The `Math.max` on the client covers the two remaining directions: the fallback below (a failed
cursor read degrades to `row.seq`), and a poll landing between the server's read and the client's
assignment — reachable, because `awaiting` can legitimately be true while a resend is accepted.

The one thing this deliberately skips is a row of hers written between the client's position and
the resend by *another tab's* turn. That is `pollNinaReply`'s own settled stance for the mirror case
— *"The other tab gets them the way it always has, on the next server render"* — and it is the safe
direction: a missed bubble appears on reload, a duplicated one is a conversation that reads wrong
until the tab is closed.

**D-b. `turnId === null` is a REFUSAL here, not the ordinary outcome it is on the send path.**
On a send, a null means "a turn is already running and will chain onto this message", and his
message is saved either way — reporting failure would mark a perfectly persisted row as failed. On a
resend there is nothing new to persist: a live turn means the message is already going to be
answered, so the honest answer is `reason: 'turn-live'` and a sentence, not a silent no-op that
leaves the runner tapping.

**D-c. `imageDescriptions` is rebuilt from the row's own `nina_message_images`, not left `[]`.**
`runNinaBackgroundTurn`'s chain passes `imageDescriptions: []` and argues the photographs *"reach
her through `loadNinaContext`"*. That argument does not hold: `lib/nina/gateway.ts:164` hardcodes
`imageDescriptions: []` for every window row, which the plan index records as a real gap and puts
explicitly out of scope. So a resend that passed `[]` would re-answer a photo message as if the
photo were not there. This phase rebuilds the array from `getNinaMessageImagesForMessages` with the
same `NINA_DESCRIPTION_UNAVAILABLE` substitution the send path uses, and **does not touch the
gateway** — fixing that would change what she knows in every conversation, which nobody asked for.

**D-d. `'empty'` is a reachable refusal, not defensive padding.** `removeChatPhotoAction`
(`lib/admin/chatPhotoActions.ts:305-309`) deletes only the image row when
`isNinaPhotoCarrierMessage` is false, and that predicate is `message.role !== 'nina' → false`
(`lib/admin/chatPhotos.ts:292`). An operator removing the photo from a caption-less runner message
therefore leaves a runner row with `body: ''`, no images and no run. Re-running a turn for it would
hand `glm-5.3` nothing to answer. Refuse, in the same shape `sendNinaMessage`'s floor refuses.

**D-e. `'not-mine'` is its own reason, and that leaks nothing.** The file's standing rule — "not
his" and "not there" are the same outcome — is about *ownership*, so a foreign id must be
indistinguishable from a missing one, and it is: both are `'not-found'`. A role mismatch is a row he
owns, so naming it costs him nothing and makes the log and the test honest. The sheet never offers
Resend on her bubbles; the action refuses anyway, on `redoNinaImageJob`'s stated precedent — *a
control is not a guard*.

**D-f. Refusals surface in the SHEET, not as a `Notice`.** `Notice` gains no member. The sheet
already owns a `refusal` line for locally-decided refusals, it is the surface covering the screen at
the moment of the tap, and a notice rendered underneath it would be invisible until the sheet
closed. The callback therefore resolves `Promise<string | null>` — `null` means "done, close" —
which keeps the sheet free of both the Server Action and the reason vocabulary. `ChatScreen` owns
the sentences, exactly as it owns `NOTICE_TEXT`.

---

## Implementation Steps

### Step 1: The pure gate

**File:** `lib/nina/edit.ts` — **append at the very end of the file**, after Phase 3's
`decideMessageActionTap` closing brace.

**RECONCILED — this moved, and the reason matters.** The draft inserted here at `:109`, between
`canActOnMessage`'s closing brace (`:108`) and the `/* ── what an edit means ── */` divider
(`:110`). That is two lines below `:106`, which is **the exact line Phase 3 rewrites** when it
widens `canActOnMessage(target: EditTarget)` to `canActOnMessage(target: ActionableMessage)` — and
Phase 3 also inserts a ~12-line `ActionableMessage` block immediately above `:95`. Two hunks that
close means a hand-resolved merge at best, and this phase depends on Phase 3 precisely so it does
not have to fight it. Phase 3's own Handoffs asked for this in writing: *"If it adds a gate to
`lib/nina/edit.ts` (e.g. a `canResendMessage`), **append it after the `── the tap ──` block** so the
two phases' hunks cannot collide."* Honoured.

**Change:** one exported predicate, appended in its own section. It still *composes* with
`canActOnMessage` — it just no longer sits next to it in the file, and the docstring says where the
gate it calls actually lives.

**Two facts about the post-Phase-3 file this code relies on**, both confirmed by Phase 3's Step 1:

- `canActOnMessage` now takes `ActionableMessage` (`= Pick<EditTarget, 'id' | 'confirmed'>`). The
  call below passes a full `EditTarget`, which satisfies that shape structurally, so it typechecks
  unchanged.
- `canResendMessage` keeps taking **`EditTarget`** and not `ActionableMessage`, because it reads
  `.mine`, which the narrow shape deliberately does not carry.

**Code:**

```ts
/* ── the resend gate ──────────────────────────────────────────────────────────────────────── */

/**
 * Whether this message may be RESENT — R5, and his bubbles only.
 *
 * ── WHY IT IS DOWN HERE AND NOT BESIDE `canActOnMessage` ──────────────────────────────────────
 * It composes with that gate and would read better next to it, and it is here anyway: R4's phase
 * rewrites `canActOnMessage`'s signature line and inserts `ActionableMessage` just above it, and
 * two phases editing adjacent lines of one file is a merge conflict for no gain. `EditTarget` is
 * still the parameter type — this predicate reads `.mine`, which `ActionableMessage` does not
 * carry — and `canActOnMessage` accepts it structurally.
 *
 * ── WHY THIS IS A FUNCTION AND NOT `picked.mine &&` IN THE SHEET ──────────────────────────────
 * Because it is the second rule in this file with two clauses that come from different places, and
 * because the sheet is the one surface that must never be the authority on it. `canActOnMessage`
 * carries the two exclusions this screen produces — a client-minted `local-…` id and a row whose
 * send threw — and `mine` carries the user's own words: *"add option to resend as well (just for
 * user's bubble)"*. Written here, both are asserted in node; written in markup, neither is.
 *
 * ── THERE IS DELIBERATELY NO "WAS THIS ANSWERED" CLAUSE ───────────────────────────────────────
 * The plan index settled it: a client-side answered/unanswered test would be a second authority on
 * turn state beside `nina_turns`, which `openNinaChatTurn` already owns. Resend is offered on every
 * confirmed bubble of his, and `resendNinaMessage` refuses with `'turn-live'` when a claim is
 * already live. Refusing at the action is honest; hiding the item on a guess is not.
 *
 * Note what this does NOT exclude: a message that carries no text at all. An image-only message is
 * a legitimate send (`sendNinaMessage`'s R10 floor) and therefore a legitimate resend. The one
 * genuinely empty case — a runner row whose only photo an operator removed — is not visible from
 * `EditTarget` (`hasImage` is computed off the URLs the bubble holds, which is the right shape for
 * every other rule here), so the ACTION refuses it with `'empty'`. One clause per authority.
 */
export function canResendMessage(target: EditTarget): boolean {
  return canActOnMessage(target) && target.mine
}
```

**Impact:** `lib/nina/edit.ts` gains one export. No existing behaviour changes; nothing else in the
module reads it.

---

### Step 2: `resendNinaMessage`

**File:** `lib/nina/actions.ts` — two edits.

**2a. The import.** `lib/nina/actions.ts:26-36` currently reads (line range corrected by the
reconciler — the statement opens at `:26`, not `:28`). Phase 1 does **not** touch this statement;
its own new import is a separate `./attach` line that sorts to `:9`:

```ts
import {
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
  listNinaMessages,
  listNinaMessagesAfter,
  readNinaTuning,
} from './queries'
```

Replace with (one name added, alphabetical position kept):

```ts
import {
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
  listNinaMessages,
  listNinaMessagesAfter,
  readNinaTuning,
} from './queries'
```

Everything else the new action needs is already imported: `requireUserId`, `isValidId`,
`NINA_DESCRIPTION_UNAVAILABLE`, `openNinaChatTurn`, `sweepStaleNinaChatTurns`, and
`type NinaMessageRow`.

**2b. The action.** Insert at `lib/nina/actions.ts:1022` — after `runNinaBackgroundTurn`'s closing
brace (`:1021`) and before `export interface NinaReplyPoll` (`:1024`).

**Why here and not in `messageActions.ts`:** the seam this action needs —
`startNinaBackgroundTurn` and `NinaBackgroundTurnInput` — is module-private to `actions.ts`, and
`messageActions.ts`'s header states its own reason for staying isolated from this file (*"these two
functions share nothing with `sendNinaMessage` except `requireUserId`"*). Exporting the `after()`
seam to satisfy a second module would put this repo's durable-background-work convention behind a
public name in two files. The plan index already assigns `resendNinaMessage` to `actions.ts`.

**Why this line and not after `sendNinaMessage`:** `function` declarations hoist, so both positions
compile. This one is ~446 lines away from phase 1's nearest region in the same file
(`resolveAttachment` at `:183-233`, the attach INSERT at `:562-576`), which is the difference
between a clean merge and a hand-resolved one — and it is why phases 1 and 4 need no dependency
edge despite sharing this file. **Do not move it up next to `sendNinaMessage`**: that would put it
inside phase 1's neighbourhood and reintroduce the collision.

**Code:**

```ts
/**
 * **R5: re-run the turn for a message that is already on the server.**
 *
 * > *"sometimes, user chat message is left unanswered. add option to resend as well (just for
 * > user's bubble)"*
 *
 * A turn can die silently — the invocation is killed, the segment's ceiling cuts it off — and
 * `sweepStaleNinaChatTurns` closes the claim ninety seconds later. What is left is a persisted
 * runner row with no answer, and until this action there was no way to ask again except retyping
 * the sentence, which writes a second copy of it into the conversation Nina reads as context.
 *
 * ── IT IS `sendNinaMessage` FROM STEP 1c ONWARD, AND NOTHING BEFORE IT ────────────────────────
 * Sweep, open a claim, hand the turn to `after()`. Every step above STEP 1c on the send path exists
 * to turn an untrusted request into a persisted row — validation, ticket verification, the reply
 * target, the run, the session, the INSERT — and all of it has already happened for this message.
 * So this action re-derives the turn's INPUT from the row instead of from a request, and writes
 * nothing.
 *
 * ── INVARIANT 7 IS THE WHOLE POINT: THERE IS NO `insertNinaMessages` HERE ─────────────────────
 * Not a nearly-empty one, not a conditional one. A second copy of his sentence on screen — and in
 * the 40-row window `getNinaMessageWindow` hands her on every later turn — is a failed feature, and
 * it is the one failure the user would notice immediately. `tests/nina.resend.test.ts` asserts the
 * two insert functions are never reached by this action's own body.
 *
 * ── NO MODEL CALL IS ADDED (INVARIANT 5) ─────────────────────────────────────────────────────
 * The descriptions this hands her were paid for once, by `describeNinaImage` on the composer's
 * upload path or by `describeNinaImages` in `after()`. Nothing is re-described, nothing is
 * re-uploaded, and `scripts/check-llm-payload-boundary.mjs` gains no entry: `lib/nina/actions.ts`
 * is already the sanctioned call site for every model-calling symbol the background turn reaches.
 *
 * ── THE BUDGET PAIRING IS INHERITED, NOT RE-ARGUED ───────────────────────────────────────────
 * This calls `startNinaBackgroundTurn`, whose docstring carries it: a Server Action's timeout is
 * the invoking page segment's, `after()` runs for that same budget, and `app/nina/page.tsx` carries
 * `export const maxDuration = 300`. This action ships in the same module and is reached from the
 * same segment, so `NINA_BACKGROUND_BUDGET_MS` means here exactly what it means on the send path.
 * Do not relocate it into a route handler that does not carry 300 — that is a silent truncation.
 */
export type NinaResendRefusal =
  /** Malformed id, not his, or gone. "Not his" and "not there" are one answer, by this file's rule. */
  | 'not-found'
  /** It is one of HER bubbles. The sheet never offers it; a control is not a guard. */
  | 'not-mine'
  /** No text, no photo, no run — nothing for her to answer. See the guard below for how that happens. */
  | 'empty'
  /**
   * A turn already owns this conversation, so the message is going to be answered anyway.
   *
   * **This is where a resend and a send part company.** On the send path a null `turnId` is the
   * ordinary burst case and reporting it as a failure would mark a perfectly persisted message as
   * failed. Here there is nothing new to persist, so a null is the only thing that happened, and
   * saying so is the difference between a runner who waits and a runner who taps again.
   */
  | 'turn-live'
  /** The claim could not be opened. The row is untouched; one more tap is the whole recovery. */
  | 'failed'

export interface ResendNinaMessageResult {
  ok: boolean
  /** The `nina_turns.id` this resend opened. Null on every refusal. */
  turnId: string | null
  /**
   * **`nina_messages.seq` of the newest row in this conversation when the resend was accepted** —
   * where `pollNinaReply` must resume from. Null on every refusal.
   *
   * NOT the resent row's own `seq`, and the difference is a duplicated bubble.
   * `listNinaMessagesAfter`'s predicate is `seq > afterSeq`, and `pollNinaReply` returns HER rows
   * from that set — so a cursor pointing at the resent message would re-deliver every bubble of
   * hers that already sits between it and the client's real position, and the reveal would repaint
   * them. The newest `seq` is `>=` everything the client can be holding, and her answer to this
   * resend is inserted strictly above it, so the first poll asks for exactly the new set.
   *
   * The client applies it as `Math.max(cursorRef.current, cursor)`, which is not belt-and-braces:
   * a poll can legitimately be in flight when a resend is accepted, and the fallback below can
   * return a value behind the client's position.
   */
  cursor: number | null
  reason: NinaResendRefusal | null
}

/** One shape for every refusal, so a caller has one branch and no `undefined`. */
function resendRefused(reason: NinaResendRefusal): ResendNinaMessageResult {
  return { ok: false, turnId: null, cursor: null, reason }
}

export async function resendNinaMessage(input: {
  messageId: string
}): Promise<ResendNinaMessageResult> {
  /* FIRST, above any use of an argument. A Server Action is an untrusted POST endpoint whether or
   * not a button exists for it — `messageActions.ts`'s four-line rule, unchanged. */
  const userId = await requireUserId()

  /* A `/nina` id that cannot be one of ours should never reach the database. An optimistic
   * `local-…` id lands here too, and `canResendMessage` has already refused it on the client; this
   * is the server half of the same rule, not a substitute for it. */
  if (!isValidId(input?.messageId)) return resendRefused('not-found')

  /*
   * OWNER-SCOPED, so a foreign id comes back as `[]` and "not his" is indistinguishable from "not
   * there" — invariant 4, and the same read `editNinaMessage` opens with. It also hands over
   * everything the turn input needs: `sessionId`, `body`, `replyToId`, `runId` and `seq` are all in
   * `messageColumns`.
   */
  const [row] = await getNinaMessagesByIds(userId, [input.messageId])
  if (row === undefined) return resendRefused('not-found')
  /* R5 is "just for user's bubble". Re-running a turn for one of HER rows would ask her to answer
   * herself, and `runNinaBackgroundTurn` would stamp the reply's `reply_to_id` at a bubble of her
   * own. The sheet does not offer it; this refuses it anyway. */
  if (row.role !== 'runner') return resendRefused('not-mine')

  /*
   * HIS PHOTOS, AND WHY THEY ARE READ RATHER THAN ASSUMED ABSENT.
   *
   * `runNinaBackgroundTurn`'s own chain passes `imageDescriptions: []` and argues the photographs
   * reach her through `loadNinaContext`. They do not: `lib/nina/gateway.ts:164` hardcodes
   * `imageDescriptions: []` for every window row. That gap is real and is out of scope for this
   * set — it changes what she knows in every conversation — so this path carries the descriptions
   * itself, exactly as `sendNinaMessage` does, and the substitution is the same one: a row whose
   * description is null becomes `NINA_DESCRIPTION_UNAVAILABLE`, which tells her honestly that her
   * eyes failed on that one rather than letting her invent what was in it (invariant 5: text, never
   * an image part).
   *
   * `getNinaMessageImagesForMessages` is ordered by `sort_order`, which is the order the bubble
   * renders them in, so she is told about them in the order he sees them.
   */
  const images = await getNinaMessageImagesForMessages(userId, [row.id])

  /*
   * `sendNinaMessage`'s floor, asked of the ROW instead of of the request. `null` for an empty body
   * is what the send path passes and what `runNinaTurn` expects; the empty string would read as a
   * message he sent with no words when in fact he sent a photograph.
   *
   * The refusal below is REACHABLE, and not by any client bug: `removeChatPhotoAction` deletes only
   * the image row when `isNinaPhotoCarrierMessage` is false, and that predicate is false for every
   * runner row — so an operator removing the photo from a caption-less message of his leaves
   * exactly this state. Handing `glm-5.3` a turn with nothing in it would spend money to be told
   * nothing; refusing names the state instead.
   */
  const runnerText = row.body.trim().length > 0 ? row.body : null
  if (runnerText === null && images.length === 0 && row.runId === null) {
    return resendRefused('empty')
  }

  /*
   * The quote, re-resolved. Same shape and same degradation as STEP 0b of the send path: a target
   * that has since been deleted (`reply_to_id` is `ON DELETE SET NULL`, so this is already null in
   * that case) or that a scoped read cannot see becomes "no quote", and the resend still happens.
   * The alternative — refusing because the message he was answering is gone — would withhold the
   * answer to his message over a missing quote header.
   */
  let quotedRow: NinaMessageRow | null = null
  if (row.replyToId !== null) {
    try {
      const found = await getNinaMessagesByIds(userId, [row.replyToId])
      quotedRow = found[0] ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the reply target for a resend', {
        error: String(cause),
      })
    }
  }

  /*
   * THE SWEEP, and on this path it is closer to the point than it is on the send path. The most
   * common reason a message is sitting unanswered is a turn that died; its claim stands until
   * something closes it, and `openNinaChatTurn` below is what needs it gone. It can never cost the
   * caller: `openNinaChatTurn` applies `NINA_TURN_STALE_MS` itself, so an expired claim does not
   * block a new one even when this fails — the sweep is what makes the LEDGER honest about it.
   */
  try {
    await sweepStaleNinaChatTurns(userId)
  } catch (cause) {
    console.warn('[nina] chat turn sweep failed on a resend', { error: String(cause) })
  }

  let turnId: string | null = null
  try {
    turnId = await openNinaChatTurn(userId, {
      /* HIS row's session, read off the row. Never a client-supplied one: she answers in the
       * conversation she was asked in, and there is no case in which a reply belongs anywhere
       * else. */
      sessionId: row.sessionId,
      runnerMessageId: row.id,
      /* 0 — this is a turn a runner asked for, not a chained follow-up. The chain's own bound is
       * `NINA_TURN_CHAIN_MAX` and it is measured from here, exactly as a send's is. */
      depth: 0,
    })
  } catch (cause) {
    console.warn('[nina] could not open a chat turn for a resend', { error: String(cause) })
    return resendRefused('failed')
  }
  /* See `NinaResendRefusal['turn-live']`: on a send this is the ordinary outcome, here it is the
   * only thing that happened. */
  if (turnId === null) return resendRefused('turn-live')

  /*
   * THE CURSOR. One indexed single-row read — the same one `pollNinaReply` issues — and it is read
   * AFTER the claim is open on purpose: from here to the end of this function nothing writes to
   * `nina_messages`, because `startNinaBackgroundTurn` only REGISTERS the turn and `after()` does
   * not run until the response has gone out. So the newest row now is the newest row the client can
   * be holding, and her answer will sit strictly above it.
   *
   * A failed read degrades to the resent row's own `seq` rather than refusing: his turn is already
   * claimed and about to run, and losing that over a cursor read would be the worse outcome. The
   * client's `Math.max` is what makes the degradation harmless.
   */
  let cursor: number
  try {
    const [newest] = await listNinaMessages(userId, { limit: 1, sessionId: row.sessionId })
    cursor = newest?.seq ?? row.seq
  } catch (cause) {
    console.warn('[nina] could not read the resend cursor', { error: String(cause) })
    cursor = row.seq
  }

  /*
   * The turn, rebuilt field by field from the row. Spelled out rather than spread from anything,
   * because every field has a reason and `tsc` should be what notices if `NinaBackgroundTurnInput`
   * ever gains one this path forgot.
   */
  startNinaBackgroundTurn({
    userId,
    sessionId: row.sessionId,
    turnId,
    runnerMessageId: row.id,
    runnerText,
    imageDescriptions: images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
    quotedRow,
    attachedRunId: row.runId,
    depth: 0,
    /* NOW, not the message's `created_at`. This is the wall clock the chain and the background
     * budget are measured against, and the message may be a day old — dating the budget from it
     * would exhaust it before the first link ran. */
    startedAtMs: Date.now(),
  })

  return { ok: true, turnId, cursor, reason: null }
}
```

**Impact:**
- `lib/nina/actions.ts` gains one exported function and two exported types. Nothing existing is
  read differently; `sendNinaMessage`, `pollNinaReply` and `runNinaBackgroundTurn` are untouched.
- One new `nina_turns` row per accepted resend, closed by the ordinary path
  (`closeNinaChatTurn` after her bubbles land, or the `finally`, or the 90 s sweep).
- The chain cannot misfire off a resend: `runNinaBackgroundTurn` chains only when the newest row in
  the session is his, and her bubbles land above every existing row — so after a successful resend
  the newest row is hers. When the turn produces nothing it `return`s from inside the `try` and the
  chain block is skipped entirely.

---

### Step 3: The sheet's Resend item

**File:** `components/nina/MessageActionsSheet.tsx` — four edits.

**3a. The import.** `:8-13` currently reads:

```tsx
import {
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
} from '@/lib/nina/edit'
```

Replace with:

```tsx
import {
  canResendMessage,
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
} from '@/lib/nina/edit'
```

**3b. The prop.** `:54-70` currently reads:

```tsx
export function MessageActionsSheet({
  target,
  photoCount,
  onClose,
  onSubmitEdit,
  onConfirmDelete,
}: {
  /** The message the gesture picked, or null — which renders nothing at all. */
  target: EditTarget | null
  /** How many photos this message carries, for the confirmation's disclosure. */
  photoCount: number
  onClose: () => void
  /** Resolves true when the row was written and the caller has patched its list. */
  onSubmitEdit: (id: string, body: string) => Promise<boolean>
  /** Resolves true when the row is gone and the caller has dropped it. */
  onConfirmDelete: (id: string) => Promise<boolean>
}) {
```

Replace with:

```tsx
export function MessageActionsSheet({
  target,
  photoCount,
  onClose,
  onSubmitEdit,
  onConfirmDelete,
  onResend,
}: {
  /** The message the gesture picked, or null — which renders nothing at all. */
  target: EditTarget | null
  /** How many photos this message carries, for the confirmation's disclosure. */
  photoCount: number
  onClose: () => void
  /** Resolves true when the row was written and the caller has patched its list. */
  onSubmitEdit: (id: string, body: string) => Promise<boolean>
  /** Resolves true when the row is gone and the caller has dropped it. */
  onConfirmDelete: (id: string) => Promise<boolean>
  /**
   * R5. Re-run Nina's turn for this message. **Resolves `null` when the turn was claimed** — the
   * cue to close, exactly as `true` is for the two above — and otherwise the SENTENCE to show as
   * this sheet's refusal.
   *
   * ── WHY A STRING AND NOT A BOOLEAN, WHEN ITS SIBLINGS ARE BOOLEANS ───────────────────────────
   * Because a resend has a refusal that is not a failure — a turn is already running for this
   * conversation, so the message will be answered anyway — and the runner has to be told which of
   * the two happened. The sheet is the surface covering the screen at that moment: `ChatScreen`'s
   * `Notice` strip renders BEHIND it and would not be read until the sheet closed, so a notice
   * would be a message delivered to nobody.
   *
   * The COPY still belongs to `ChatScreen`, which already owns `NOTICE_TEXT`, so this component
   * imports no Server Action and never learns the refusal vocabulary — the same boundary
   * `onSubmitEdit` and `onConfirmDelete` keep.
   *
   * REQUIRED rather than optional, on RULING E2b's habit: `ChatScreen` is the one caller and `tsc`
   * should be what notices if it stops passing it. An optional callback defaulting to a no-op is
   * how a menu item comes to do nothing at all.
   */
  onResend: (id: string) => Promise<string | null>
}) {
```

**3c. The handler.** Insert after `confirmDelete`'s closing brace (`:122`), before `return (`
(`:124`):

```tsx
  /**
   * R5. One tap, one claim.
   *
   * `pending` is the SHARED flag the other two use, so an edit, a delete and a resend cannot
   * overlap — and the two menu buttons gain `disabled={pending}` below for the same reason: leaving
   * `menu` mode mid-resend would strand the spinner on a button nobody can see.
   *
   * The refusal is rendered rather than thrown away, and the sheet STAYS OPEN on one: 'she is
   * already answering that one' is information the runner needs while the message is still in front
   * of him, and closing the sheet would leave him with a tap that visibly did nothing.
   */
  async function resend() {
    if (pending) return
    setRefusal(null)
    setPending(true)
    const refused = await onResend(picked.id)
    setPending(false)
    if (refused === null) {
      onClose()
      return
    }
    setRefusal(refused)
  }
```

**3d. The menu item.** `:154-170` currently reads:

```tsx
          <Button
            fullWidth
            variant="secondary"
            onClick={() => {
              setRefusal(null)
              setValue(picked.body)
              setMode('edit')
            }}
          >
            Edit {whose}
          </Button>

          <Button fullWidth variant="destructive" onClick={() => setMode('confirm')}>
            Delete {whose}
          </Button>
        </div>
      )}
```

Replace with:

```tsx
          <Button
            fullWidth
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setRefusal(null)
              setValue(picked.body)
              setMode('edit')
            }}
          >
            Edit {whose}
          </Button>

          {/*
            R5, and HIS bubbles only — `canResendMessage` is the gate, in `lib/nina/edit.ts` beside
            `canActOnMessage`, so "which bubbles offer a resend" is a rule with a unit test rather
            than a condition in markup. There is no "was this answered" test here: the plan index
            settled that a client-side one would be a second authority on turn state beside
            `nina_turns`, and `resendNinaMessage` refuses when a claim is already live.

            Between Edit and Delete deliberately. Delete stays last because it is the destructive
            one, and Resend is the only item here that changes nothing about the message.
          */}
          {canResendMessage(picked) && (
            <>
              <Button fullWidth variant="secondary" loading={pending} onClick={resend}>
                Resend your message
              </Button>
              {/*
                Invariant 7, in the runner's own words. He is about to press a button labelled
                "resend" on a message that is already in the log, and the thing he will reasonably
                fear is a second copy of it appearing. It cannot: the action re-opens a turn for
                this exact row and never calls `insertNinaMessages`.
              */}
              <p className="text-[11px] font-medium text-ink-3">
                She answers the message that is already here. Nothing gets sent twice.
              </p>
            </>
          )}

          {/* The resend's refusal. `menu` mode had no refusal line before this phase; `edit` mode's
              own copy of it is unchanged, and both read the same state. */}
          {refusal !== null && <p className="text-[11px] font-semibold text-red">{refusal}</p>}

          <Button
            fullWidth
            variant="destructive"
            disabled={pending}
            onClick={() => setMode('confirm')}
          >
            Delete {whose}
          </Button>
        </div>
      )}
```

**Impact:** the sheet gains one required prop and one menu item on his bubbles. Her bubbles render
exactly what they render today. The `edit` and `confirm` modes are untouched apart from the two
`disabled={pending}` attributes, which can only fire in a state that did not exist before this
phase.

---

### Step 4: The screen's handler

**File:** `components/nina/ChatScreen.tsx` — four edits. Line numbers are `origin/main` @ `e6c68d6`
and are **exact**: RECONCILED — Phase 3 edits zero lines of this file (its Step 4e says so
outright), and no other phase in this set opens it, so nothing shifts these integers. This phase is
the file's sole owner.

**4a. The import.** `:10` currently reads:

```tsx
import { pollNinaReply, sendNinaMessage, type SentBubble } from '@/lib/nina/actions'
```

Replace with:

```tsx
import {
  pollNinaReply,
  resendNinaMessage,
  sendNinaMessage,
  type NinaResendRefusal,
  type SentBubble,
} from '@/lib/nina/actions'
```

**4b. The refusal copy.** Insert at `:141`, after `NOTICE_TEXT`'s closing brace (`:140`) and before
the `COMPOSER_CLEARANCE_PX` docstring (`:142`):

```tsx
/**
 * R5's five refusals, in the runner's language.
 *
 * ── WHY THIS IS NOT A `Notice` ────────────────────────────────────────────────────────────────
 * `Notice` gains no member, and that is a decision rather than an omission. Every sentence here is
 * read while the actions sheet is covering the screen, and the notice strip renders underneath it —
 * a notice raised from a sheet interaction is a sentence delivered to nobody until the sheet
 * closes. So these go back to the sheet, through `handleResendMessage`'s return value, and land in
 * the `refusal` line the sheet already had for locally-decided refusals.
 *
 * The COPY lives here rather than in the sheet for the reason `NOTICE_TEXT` lives here: the sheet
 * must not learn the action's vocabulary, and this file already owns every sentence this screen
 * says.
 *
 * 'turn-live' is the one that is not a failure, and its wording says so: nothing went wrong, and
 * the message he is looking at is going to be answered without him doing anything else.
 */
const RESEND_REFUSAL_TEXT: Record<NinaResendRefusal, string> = {
  'not-found': 'That message isn’t on the server any more, so there’s nothing to resend.',
  'not-mine': 'Only your own messages can be resent.',
  empty: 'There’s nothing left in that message for her to answer.',
  'turn-live': 'She’s already working on this chat — that one is next, give her a moment.',
  failed: 'That couldn’t be resent just now. Try it again in a moment.',
}
```

**4c. The handler.** Insert at `:823`, after `handleDeleteMessage`'s `}, [])` (`:822`) and before
the `revealBubbles` docstring (`:824`):

```tsx
  /**
   * R5, resending. Resolves `null` when the turn was claimed — the sheet's cue to close — and
   * otherwise the sentence for the sheet to show.
   *
   * ── IT PRODUCES THE SAME AWAITING STATE A SEND PRODUCES, AND THAT IS THE WHOLE UI ─────────────
   * `handleSend`'s last three lines are `setLiveSessionId` / `cursorRef.current = result.cursor` /
   * `setAwaiting(true)`, and everything after that is machinery this phase reuses untouched: the
   * arrival loop starts on `awaiting`, `showTyping` raises the indicator, and `revealBubbles` runs
   * `planReveal` on whatever the poll returns. So a resend adds no poll, no timer and no second
   * rhythm — it just tells the shipped one that something is coming.
   *
   * `liveSessionId` is deliberately NOT adopted from the result: the message being resent is on
   * this screen, so it is in the conversation this screen is already polling. A resend cannot
   * create a session the way a first send can.
   *
   * ── THE CURSOR IS TAKEN AS A MAXIMUM ─────────────────────────────────────────────────────────
   * `result.cursor` is the newest `seq` the server saw when it accepted the resend, which is `>=`
   * every row this screen holds — so resuming there asks for exactly the rows the resent turn
   * produces and cannot re-deliver a bubble of hers that is already on screen. `Math.max` covers
   * the two ways it could still arrive stale: the action degrades to the resent row's own `seq` if
   * its cursor read fails, and a poll may legitimately land between the server's read and this
   * assignment, because `awaiting` can be true while a resend is accepted.
   *
   * `setNotice(null)` matters more here than it looks: the notice on screen when he taps Resend is
   * almost always 'no-reply', which is exactly the sentence that sent him here. Leaving it up while
   * she is answering again would contradict the indicator.
   */
  const handleResendMessage = useCallback(async (id: string): Promise<string | null> => {
    let result: Awaited<ReturnType<typeof resendNinaMessage>> | null = null
    try {
      result = await resendNinaMessage({ messageId: id })
    } catch {
      result = null
    }
    if (!alive.current) return null

    if (result === null || !result.ok) {
      /* A thrown action has no reason to report, and 'failed' is what it means: the row is
       * untouched and one more tap is the whole recovery. */
      return RESEND_REFUSAL_TEXT[result?.reason ?? 'failed']
    }

    setNotice(null)
    if (result.cursor !== null) {
      cursorRef.current = Math.max(cursorRef.current, result.cursor)
    }
    setAwaiting(true)
    return null
  }, [])
```

**4d. The prop.** `:1212-1213` currently reads:

```tsx
        onConfirmDelete={handleDeleteMessage}
      />
```

Replace with:

```tsx
        onConfirmDelete={handleDeleteMessage}
        onResend={handleResendMessage}
      />
```

**Impact:** one more callback through an element that already remounts on the target's id. No change
to `messages`, to the reveal, to the poll loop or to the notice strip's existing members. A resend
while `awaiting` is already true calls `setAwaiting(true)` with the same value, so React bails out
of the update and the running poll is not restarted.

---

### Step 5: Tests

**File:** `lib/nina/edit.test.ts` — two edits.

**5a.** Add `canResendMessage` to the `./edit` import block, alphabetically between
`canActOnMessage` and `decideMessageActionSwipe`.

**RECONCILED — quote the block AS PHASE 3 LEAVES IT, not as `origin/main` has it.** Phase 3
replaces this same import block (its Step 3) with a wider one carrying `BUBBLE_BODY_SELECTOR`,
`BUBBLE_INTERACTIVE_SELECTOR`, `MESSAGE_ACTION_TAP_SLOP_PX`, `decideMessageActionTap` and
`type MessageActionTapGesture`. The draft here quoted the pre-Phase-3 nine-name block, which would
have silently reverted five of Phase 3's imports and broken its ~20 new cases. The block to write
is Phase 3's plus one name:

```ts
import {
  BUBBLE_BODY_SELECTOR,
  BUBBLE_INTERACTIVE_SELECTOR,
  EDIT_MAX_CHARS_HERS,
  EDIT_MAX_CHARS_MINE,
  MESSAGE_ACTION_EDGE_GUARD_PX,
  MESSAGE_ACTION_TAP_SLOP_PX,
  applyMessageDeletion,
  applyMessageEdit,
  canActOnMessage,
  canResendMessage,
  decideMessageActionSwipe,
  decideMessageActionTap,
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
  type MessageActionSwipeGesture,
  type MessageActionTapGesture,
} from './edit'
```

If any of Phase 3's five names is missing from the file when this phase starts, **stop**: Phase 3
has not landed, and this phase's `Depends on: 3` was not honoured.

**5b.** **Append at the end of the file**, after Phase 3's `describe('decideMessageActionTap', …)`
block. RECONCILED: the draft inserted at `:73`, immediately after the `canActOnMessage` describe's
closing `})` (`:72`) — but Phase 3 adds a case *inside* that describe (its Step 3, "after :71"), so
`:72` is no longer the closing brace and the two hunks would overlap. Appending puts this phase's
block below everything Phase 3 wrote, and both suites' hunks stay disjoint:

```ts
/* ── canResendMessage ─────────────────────────────────────────────────────────────────────── */

describe('canResendMessage', () => {
  it('accepts a confirmed message of his', () => {
    expect(canResendMessage(target())).toBe(true)
  })

  /* R5's own words: "just for user's bubble". */
  it('refuses one of Nina’s, however confirmed it is', () => {
    expect(canResendMessage(target({ mine: false }))).toBe(false)
  })

  it('inherits both of canActOnMessage’s exclusions', () => {
    expect(canResendMessage(target({ id: 'local-6f0c1d2e-aaaa' }))).toBe(false)
    expect(canResendMessage(target({ confirmed: false }))).toBe(false)
  })

  /*
   * The DECISION, pinned so nobody reintroduces it: there is no "was this answered" clause. A
   * client-side answered/unanswered test would be a second authority on turn state beside
   * `nina_turns`; `resendNinaMessage` refuses with 'turn-live' instead.
   */
  it('offers a resend on every confirmed bubble of his, answered or not', () => {
    expect(canResendMessage(target({ body: 'ini udah dijawab' }))).toBe(true)
    expect(canResendMessage(target({ body: '' , hasImage: true }))).toBe(true)
  })

  it('never diverges from canActOnMessage on one of his', () => {
    for (const patch of [{}, { confirmed: false }, { id: '' }, { hasRun: true }]) {
      const his = target({ ...patch, mine: true })
      expect(canResendMessage(his)).toBe(canActOnMessage(his))
    }
  })
})
```

**File:** `tests/nina.resend.test.ts` — new.

The mock set below is **measured, not guessed**: it was run against this worktree and it both
imports `lib/nina/actions.ts` and drives a registered `after()` callback through to `runNinaTurn`.
Two facts it depends on:

- `resendNinaMessage` never calls `authEnv()` (only `sendNinaMessage`'s STEP 0 ticket verification
  does), and `AUTH_SECRET` is **not** stubbed by `tests/support/setup.ts`. So this suite must not
  reach the send path — it does not.
- `vi.mock`'s factory replaces the whole module, so the `@/lib/nina/queries` factory has to list
  **every** name `lib/nina/actions.ts` imports from it. If phase 1 adds one, this factory needs it
  too — see Handoffs.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R5: a resend re-runs the turn for a row that is already there, and writes nothing.**
 *
 * Five properties, in the order they would hurt if they were wrong:
 *
 *   1. **INVARIANT 7.** `insertNinaMessages` and `insertNinaMessageImages` are never reached by
 *      this action's own body. A second copy of his sentence would be a second copy in the 40-row
 *      window Nina reads as context on every later turn, which is the one failure the user would
 *      see immediately.
 *   2. **The claim, not the message.** One `openNinaChatTurn` against the SAME
 *      `runner_message_id`, at `depth: 0`, in the row's own session — and a null from it is a
 *      REFUSAL here (`'turn-live'`), unlike on the send path where it is the ordinary burst case.
 *   3. **The turn input is rebuilt from the row.** `runnerText` from `text`,
 *      `imageDescriptions` from the message's own `nina_message_images` with the
 *      `NINA_DESCRIPTION_UNAVAILABLE` substitution, `quotedRow` from `reply_to_id`,
 *      `attachedRunId` from `run_id`. Passing `[]` for the descriptions would re-answer a photo
 *      message as if the photo were not there, because `lib/nina/gateway.ts:164` hardcodes
 *      `imageDescriptions: []` for window rows.
 *   4. **Ownership is proved before anything happens**, and "not his" reads identically to "not
 *      there" (invariant 4). `requireUserId` is called above the shape check.
 *   5. **The cursor is the newest `seq`, not the resent row's.** `pollNinaReply` polls
 *      `seq > afterSeq` and returns HER rows from that set, so the resent row's own `seq` would
 *      re-deliver every bubble of hers that already sits above it.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `next/server`, `@/lib/auth/requireUserId`, `@/lib/nina/queries`, `@/lib/nina/chatturn`, and — for
 * the LAST block only, which drains the deferred turn — `@/lib/nina/load`, `@/lib/nina/gateway`,
 * `@/lib/nina/turn`, `@/lib/nina/distill` and `@/lib/nina/autotitle`. `lib/nina/actions.ts` itself
 * is the real module, which is the point: `tests/nina.jobActions.test.ts` established this exact
 * arrangement one feature over, and its reason applies verbatim — mocking the module under test
 * would have made every property above untestable.
 */

/* ── the edges ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `vi.hoisted`, because `vi.mock`'s factory is lifted above every declaration in this file.
 *
 * `deferred` collects what `startNinaBackgroundTurn` hands `after()`. On this path the collected
 * callback IS the turn, so the suite owns the ordering — `tests/nina.jobActions.test.ts`'s
 * arrangement and its stated reason.
 */
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

const requireUserId = vi.fn<() => Promise<string>>()
const getNinaMessagesByIds = vi.fn()
const getNinaMessageImagesForMessages = vi.fn()
const insertNinaMessages = vi.fn()
const insertNinaMessageImages = vi.fn()
const listNinaMessages = vi.fn()
const readNinaTuning = vi.fn()

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))

/* Every name `lib/nina/actions.ts` imports from `./queries`. A factory replaces the whole module,
 * so a missing one is an import error rather than an undefined at call time. */
vi.mock('@/lib/nina/queries', () => ({
  getNinaAvatar: vi.fn(),
  getNinaMessageImage: vi.fn(),
  getNinaMessageImagesForMessages: (...a: unknown[]) => getNinaMessageImagesForMessages(...a),
  getNinaMessagesByIds: (...a: unknown[]) => getNinaMessagesByIds(...a),
  getNinaSession: vi.fn(),
  insertNinaMessageImages: (...a: unknown[]) => insertNinaMessageImages(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaMessagesAfter: vi.fn(),
  readNinaTuning: (...a: unknown[]) => readNinaTuning(...a),
}))

const openNinaChatTurn = vi.fn()
const sweepStaleNinaChatTurns = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  sweepStaleNinaChatTurns: (...a: unknown[]) => sweepStaleNinaChatTurns(...a),
}))

/* The background turn's own edges. Mocked so the deferred callback can be DRAINED — which is the
 * only way to read the `NinaBackgroundTurnInput` this phase rebuilds, since
 * `startNinaBackgroundTurn` closes over it. `runNinaTurn` answers `payload: null`, the honest
 * "she could not answer" outcome, so the drain writes no rows of hers and property 1 stays
 * assertable end to end. */
const loadNinaContext = vi.fn()
const runNinaTurn = vi.fn()

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
vi.mock('@/lib/nina/distill', () => ({ runTurnDistillation: vi.fn() }))
vi.mock('@/lib/nina/autotitle', () => ({ titleNinaSessionIfNeeded: vi.fn() }))

/* ── the fixture ───────────────────────────────────────────────────────────────────────────── */

const USER = 'u1'
/** 12 chars, so `isValidId` passes. */
const HIS = 'msgrunner001'
const HERS = 'msgnina00001'
const QUOTED = 'msgquoted001'
const SESSION = 'ses000000001'
const TURN = 'turn00000001'
const RUN = 'run000000001'

/** The one row the owner-scoped read comes back with. `messageColumns`'s shape. */
function runnerRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: HIS,
    seq: 40,
    sessionId: SESSION,
    role: 'runner' as const,
    body: 'lari gw kemaren gimana menurut lo?',
    createdAt: new Date('2026-09-06T00:14:00.000Z'),
    source: 'chat' as const,
    turnId: null,
    replyToId: null,
    runId: null,
    readAt: null,
    photoOnly: false,
    ...over,
  }
}

type Actions = typeof import('@/lib/nina/actions')
let actions: Actions

beforeEach(async () => {
  deferred.length = 0
  vi.clearAllMocks()

  requireUserId.mockResolvedValue(USER)
  getNinaMessagesByIds.mockResolvedValue([runnerRow()])
  getNinaMessageImagesForMessages.mockResolvedValue([])
  /* The newest row in the session — where the poll must resume from. Above his 40. */
  listNinaMessages.mockResolvedValue([runnerRow({ id: HERS, seq: 57, role: 'nina' })])
  openNinaChatTurn.mockResolvedValue(TURN)
  sweepStaleNinaChatTurns.mockResolvedValue(undefined)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)
  readNinaTuning.mockResolvedValue({ relationship: 'friend' })
  loadNinaContext.mockResolvedValue({ conversation: { window: [] } })
  runNinaTurn.mockResolvedValue({ source: 'unavailable', payload: null })

  actions = await import('@/lib/nina/actions')
})

/* ── refusals ──────────────────────────────────────────────────────────────────────────────── */

describe('resendNinaMessage authenticates first and refuses before it claims', () => {
  it('calls requireUserId above the shape check', async () => {
    const result = await actions.resendNinaMessage({ messageId: 'not-an-id' })

    expect(requireUserId).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, turnId: null, cursor: null, reason: 'not-found' })
    /* A malformed id costs no query, opens no claim and defers no turn. */
    expect(getNinaMessagesByIds).not.toHaveBeenCalled()
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('answers a message that is not his exactly as it answers one that never existed', async () => {
    /* `getNinaMessagesByIds`'s WHERE carries `userId`, so a foreign id comes back empty — and it
     * must come back with the SAME word an unknown id gets, or the refusal tells a caller which
     * ids are real. */
    getNinaMessagesByIds.mockResolvedValue([])

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.reason).toBe('not-found')
    expect(openNinaChatTurn).not.toHaveBeenCalled()
  })

  it('refuses one of HER rows, even though no button would have offered one', async () => {
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ id: HERS, role: 'nina' })])

    const result = await actions.resendNinaMessage({ messageId: HERS })

    expect(result.reason).toBe('not-mine')
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('refuses a row an operator emptied: no text, no photo, no run', async () => {
    /* Reachable without any client bug — `removeChatPhotoAction` deletes only the image row for a
     * runner message, since `isNinaPhotoCarrierMessage` is false for every role but Nina's. */
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ body: '   ' })])
    getNinaMessageImagesForMessages.mockResolvedValue([])

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.reason).toBe('empty')
    expect(openNinaChatTurn).not.toHaveBeenCalled()
  })

  it('resends an image-only message, because an image alone is a valid send', async () => {
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ body: '' })])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'a man in a blue singlet, mid-stride', sortOrder: 0 },
    ])

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.ok).toBe(true)
    expect(deferred).toHaveLength(1)
  })

  it('reports a live turn as its own outcome instead of opening a second claim', async () => {
    /* THE ONE PLACE A RESEND AND A SEND PART COMPANY. On the send path a null is the ordinary burst
     * case; here it is the only thing that happened, and the runner has to be told. */
    openNinaChatTurn.mockResolvedValue(null)

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result).toEqual({ ok: false, turnId: null, cursor: null, reason: 'turn-live' })
    expect(deferred).toHaveLength(0)
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('reports a claim that could not be opened as failed, and writes nothing', async () => {
    openNinaChatTurn.mockRejectedValue(new Error('neon: connection reset'))

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.reason).toBe('failed')
    expect(deferred).toHaveLength(0)
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })
})

/* ── the claim, the cursor, and invariant 7 ───────────────────────────────────────────────── */

describe('an accepted resend claims a turn for the row that is already there', () => {
  it('never writes a message row or an image row', async () => {
    await actions.resendNinaMessage({ messageId: HIS })

    /* Asserted BEFORE the deferred turn is drained, and deliberately: her bubbles are the
     * background turn's legitimate write, and invariant 7 is about THIS action's body. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
    expect(insertNinaMessageImages).not.toHaveBeenCalled()
  })

  it('sweeps, then opens ONE claim against the same runner_message_id at depth 0', async () => {
    await actions.resendNinaMessage({ messageId: HIS })

    expect(sweepStaleNinaChatTurns).toHaveBeenCalledWith(USER)
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(openNinaChatTurn).toHaveBeenCalledWith(USER, {
      sessionId: SESSION,
      runnerMessageId: HIS,
      depth: 0,
    })
  })

  it('claims the turn even when the sweep throws', async () => {
    /* A sweep that could not run must never cost him the resend: `openNinaChatTurn` applies
     * `NINA_TURN_STALE_MS` itself, so an expired claim does not block a new one. */
    sweepStaleNinaChatTurns.mockRejectedValue(new Error('neon: statement timeout'))

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.ok).toBe(true)
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
  })

  it('returns the NEWEST seq as the cursor, never the resent row’s own', async () => {
    /* `pollNinaReply` polls `seq > afterSeq` and returns HER rows from that set. His row is 40 and
     * the newest row is 57, so a cursor of 40 would re-deliver — and re-reveal — every bubble of
     * hers between them. */
    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.cursor).toBe(57)
    expect(result.cursor).not.toBe(40)
    expect(listNinaMessages).toHaveBeenCalledWith(USER, { limit: 1, sessionId: SESSION })
  })

  it('falls back to the row’s own seq when the cursor read fails, rather than refusing', async () => {
    listNinaMessages.mockRejectedValue(new Error('neon: connection reset'))

    const result = await actions.resendNinaMessage({ messageId: HIS })

    /* The turn is already claimed and about to run; losing it over a cursor read would be worse.
     * `ChatScreen` takes the value as a `Math.max`, so a stale one cannot lower its position. */
    expect(result).toEqual({ ok: true, turnId: TURN, cursor: 40, reason: null })
    expect(deferred).toHaveLength(1)
  })

  it('defers exactly one background turn', async () => {
    await actions.resendNinaMessage({ messageId: HIS })
    expect(deferred).toHaveLength(1)
  })
})

/* ── the rebuilt turn input ───────────────────────────────────────────────────────────────── */

describe('the background turn is rebuilt from the persisted row', () => {
  it('carries his own text, his photos’ descriptions, his quote and his run', async () => {
    getNinaMessagesByIds
      /* the resend target */
      .mockResolvedValueOnce([runnerRow({ replyToId: QUOTED, runId: RUN })])
      /* the quote target, resolved second */
      .mockResolvedValueOnce([runnerRow({ id: QUOTED, seq: 12, role: 'nina', body: 'gimana?' })])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'a man in a blue singlet, mid-stride', sortOrder: 0 },
      /* An undescribed row: the vision pass failed, or has not run. */
      { id: 'img000000002', description: null, sortOrder: 1 },
    ])

    const result = await actions.resendNinaMessage({ messageId: HIS })
    expect(result.ok).toBe(true)
    expect(deferred).toHaveLength(1)

    /* Draining the deferred callback is the only way to read the input
     * `startNinaBackgroundTurn` closed over. */
    await deferred[0]!()

    expect(runNinaTurn).toHaveBeenCalledOnce()
    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]

    expect(turnInput.sourceMessageId).toBe(HIS)
    expect(turnInput.runnerText).toBe('lari gw kemaren gimana menurut lo?')
    expect(turnInput.attachedRunId).toBe(RUN)
    /* The quote reached her, resolved from `reply_to_id` against an owner-scoped read. */
    expect((turnInput.quoted as { id: string } | null)?.id).toBe(QUOTED)

    /*
     * THE SUBSTITUTION, and why this array is not `[]`. `runNinaBackgroundTurn`'s chain passes `[]`
     * on the argument that photographs reach her through `loadNinaContext` — but
     * `lib/nina/gateway.ts:164` hardcodes `imageDescriptions: []` for every window row, so on a
     * resend `[]` would mean she is never told the photo exists. An undescribed row becomes the
     * honest sentence rather than silence.
     */
    const descriptions = turnInput.imageDescriptions as readonly string[]
    expect(descriptions).toHaveLength(2)
    expect(descriptions[0]).toBe('a man in a blue singlet, mid-stride')
    expect(descriptions[1]).toContain('could not see it')

    /* Still nothing of HIS was written — the drain only reaches her side, and she said nothing. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('passes runnerText as null for a photo-only message, not as an empty string', async () => {
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ body: '' })])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'her, on the mat', sortOrder: 0 },
    ])

    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    /* `''` would read as a message he sent with no words; `null` is what the send path passes for
     * a message that IS a photograph. */
    expect(turnInput.runnerText).toBeNull()
  })

  it('closes the claim when she answers with nothing, so the poll stops', async () => {
    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    expect(closeNinaChatTurn).toHaveBeenCalled()
  })
})
```

**Impact:** two suites. `lib/nina/edit.test.ts` gains one describe block; `tests/nina.resend.test.ts`
is new and is the first unit suite in the repo to drive an action out of `lib/nina/actions.ts` — the
mock set has been executed against this worktree, so the import graph is known to load.

---

## Verification

**Build:** `npm run lint && npm run typecheck`
**Tests:** `npx vitest run` (and, focused: `npx vitest run tests/nina.resend.test.ts lib/nina/edit.test.ts`)
**Guards:** `npm run ci:llm-payload-guard` — must stay clean with **no new entry**; this phase adds
no model-calling symbol and no new call site (`lib/nina/actions.ts` is already sanctioned for
`runNinaTurn`, `distillNinaMemory` and `titleNinaSessionIfNeeded`).
**DDL:** `npm run db:check` clean and `drizzle/` gains no file — invariant 8, phase 1 owns the one
migration in this set.

**Manual check** (`npm run dev`, `/nina`):

1. Tap one of his confirmed bubbles → the sheet offers **Edit**, **Resend your message**, **Delete**.
2. Tap one of hers → **Edit** and **Delete** only. No Resend, on any of her bubbles, including a
   photo bubble.
3. Send a message, and while the typing indicator is up, tap that bubble → Resend → the sheet stays
   open and shows *"She's already working on this chat…"*. No second bubble appears, and
   `nina_turns` has exactly one `pending` chat row for the session.
4. Wait for a message to be left unanswered (or close the claim by hand), tap it → Resend → the
   sheet closes, the typing indicator comes up, and her reply arrives bubble by bubble through the
   staggered reveal. **Count his bubbles before and after: the number is unchanged.**
5. Reload. The conversation holds one copy of his message and her new answer.
6. `select count(*) from nina_messages where role = 'runner' and session_id = …` is the same integer
   before and after a resend.

**Exit criteria:**
- Resend appears only on his confirmed bubbles, never on hers, and never on an optimistic row.
- Pressing it puts the screen into the same `awaiting` state a send produces, and her answer arrives
  through the existing poll and the existing reveal — no new timer, no new poll, no new notice.
- **No second copy of his message appears**, on screen or in `nina_messages`.
- A resend while a turn is already running is refused with a visible reason and opens no second
  claim.
- `npm run lint`, `npm run typecheck` and `npx vitest run` are all green.

---

## Handoffs

**Shared files — all three RESOLVED by the reconciler; nothing here is left to a phase session:**

1. **`lib/nina/actions.ts` — shared with phase 1, disjoint, no edge.** Phase 1 owns
   `resolveAttachment` (`:183-233`) and the attach INSERT (`:562-576`); this phase owns a new block
   at `:1022` and one added name in the `./queries` import statement (`:26-36`). The nearest hunks
   are ~446 lines apart. **The import statements do not even collide:** phase 1's addition is
   `import { ninaPhotoProvenance } from './attach'`, a *new statement* sorting to `:9`, seventeen
   lines above the `./queries` block. Phases 1 and 4 therefore run concurrently.
2. **`tests/nina.resend.test.ts`'s `@/lib/nina/queries` mock factory — verified complete, no
   change needed.** A `vi.mock` factory replaces the whole module, so every name
   `lib/nina/actions.ts` imports from `./queries` must appear in it. The factory below lists all
   ten (the nine at `:26-36` plus `getNinaMessageImagesForMessages`, which this phase adds), and
   **phase 1 adds no `./queries` import at all** — `ninaPhotoProvenance` comes from `./attach`,
   which this suite does not mock. So the factory is correct as written whatever order the two
   phases land in.
3. **`lib/nina/edit.ts` and `lib/nina/edit.test.ts` — sequenced by `Depends on: 3`, and this phase
   now quotes them POST-PHASE-3.** The draft put `canResendMessage` at `:109`, two lines below the
   signature line phase 3 rewrites, and quoted the pre-phase-3 test import block. Both are fixed:
   `canResendMessage` is **appended at the end of `edit.ts`** after phase 3's `── the tap ──`
   section (phase 3's Handoffs asked for exactly this), the `describe` is **appended at the end of
   `edit.test.ts`** after phase 3's `decideMessageActionTap` block, and the import block quoted in
   Step 5a is phase 3's widened one plus `canResendMessage`. `canActOnMessage`'s widened
   `ActionableMessage` parameter is compatible with the `EditTarget` this phase passes it.

**`components/nina/MessageActionsSheet.tsx` and `components/nina/ChatScreen.tsx` are this phase's
alone.** Phase 3 edits zero lines of either — verified against its plan, not assumed.

**Left for another phase, deliberately:**

- **`lib/nina/gateway.ts:164`'s hardcoded `imageDescriptions: []`.** Found while writing D-c; it is
  why this phase carries the descriptions itself. Fixing it changes what Nina knows in every
  conversation and the plan index lists it as out of scope for this set. **Not R5's** — it belongs
  in a card of its own.
- **`runNinaBackgroundTurn`'s chain comment** claiming photographs reach her through
  `loadNinaContext`. Same root cause, same card. This phase does not edit that comment.
- **A "resend" affordance on a FAILED optimistic row.** `canResendMessage` refuses one
  (`confirmed: false`), and correctly: there is no server row to re-run. Retrying a failed *send* is
  a different feature — it would need the composer's draft, its tickets and its pinned photo — and
  nobody asked for it. `MessageBubble`'s red hairline stays the whole answer.
- **Any unanswered badge, retry icon or ring on a bubble.** Out of scope by the plan index and by
  `MessageBubble.tsx:254-255`'s own note. Not deferred — declined.
- **A `Notice` member for a resend.** Declined, per D-f. If a later phase ever needs a resend
  outcome visible after the sheet closes, `RESEND_REFUSAL_TEXT` is the copy to reuse.

## Rollback

`git revert` the phase's commit. Nothing else is required, and nothing is left behind:

- **No DDL, no migration, no env var.** `drizzle/` is untouched by this phase.
- **`nina_turns` is unaffected.** A resend opens and closes an ordinary chat claim through the
  shipped `openNinaChatTurn` / `closeNinaChatTurn` pair, so any claim a resend opened before the
  revert closes itself — or is closed by the 90 s sweep — exactly as a send's would.
- **No row of `nina_messages` or `nina_message_images` was written by this phase at any point**
  (invariant 7), so there is no data to unwind. Any bubble of hers that a resend produced is a real
  reply to a real message and stays, which is the correct outcome.
- The sheet loses one item and `ChatScreen` loses one handler; the shipped edit, delete, reply swipe
  and action swipe are untouched by the revert because this phase did not modify their logic.
