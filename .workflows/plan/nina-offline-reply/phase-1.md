# Phase 1: In-flight truth on reopen — claim-read cold load + honest give-up

**Plan set:** `NINA_OFFLINE_REPLY_PLAN.md`
**Analysis:** `20260911-124226-N1RA_code_analyzer.md`
**Satisfies:** R2
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` + page/screen
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-offline-reply` (branch `feature/nina-offline-reply`)

---

## Goal

Reopening `/nina` while a turn is genuinely live must show the typing indicator and start the
poll — at any age up to the server's honest wall clock, not just the first 90 s. Today the cold
load decides "she is thinking" with a message-age heuristic that expires at `NINA_TURN_STALE_MS`
(`ninaAwaitingByMessage`, `lib/nina/turnflight.ts:125`), while a turn — a chained burst
especially — legitimately runs to `NINA_BACKGROUND_BUDGET_MS` = 240 s. A runner who reopens at
t ∈ (90 s, 240 s) gets a quiet screen and no poll, and her reply lands unobserved until a manual
refresh (analysis gap G1). And the open tab's own give-up reuses the 90 s deadline
(`NINA_TURN_POLL_GIVE_UP_MS = NINA_TURN_STALE_MS`, `lib/nina/turnflight.ts:32`), so it calls a
living chain dead and stops polling at 90 s (gap G2).

This phase closes both by giving the cold load the one piece of truth it never had — the
session's pending `nina_turns` claim, the same indexed read `pollNinaReply` already makes — and
by repointing the client give-up at the background budget. `pollNinaReply`'s disjunct
(`lib/nina/actions.ts:2052`, `live || ninaAwaitingByMessage(newest, now)`) becomes the cold
load's disjunct too, so page and poll share ONE definition of "unanswered" (plan invariant 5),
asserted in `lib/nina/turnflight.test.ts`. No logic in the poll, the send path, or any claim
writer changes; `NINA_TURN_STALE_MS` stays 90 000 and keeps every job it has (sweep, supersede
window, poll expiry). A dead turn still stops the poll via the server's authoritative
`awaiting: false` within ~90 s; the give-up's remaining job is the poll that cannot reach the
server at all, and it now spans the server's full honest wall clock instead of lying about a live
chain.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none. No exported symbol is removed; `drizzle/` gains no file; no test file is
deleted.

**Renames:** none. `NINA_TURN_POLL_GIVE_UP_MS` KEEPS its name (its two importers —
`components/nina/ChatScreen.tsx:44` and `lib/nina/turnflight.test.ts:7` — keep compiling
untouched); only its value changes.

**Creates:** nothing new is exported and no new file is created. `lib/nina/turnflight.ts` stays
a zero-import module — the claim reaches `ninaFlightView` as a plain `Date`, never as a
`PendingNinaChatTurn`, precisely so this file never imports `chatturn.ts` (which carries
`server-only` and `lib/db`).

**Signature changes:**
- `lib/nina/turnflight.ts` — `ninaFlightView` gains an optional third parameter:
  ```ts
  export function ninaFlightView(
    rows: readonly NinaFlightRow[],
    nowMs: number,
    liveClaimCreatedAt?: Date | null,
  ): NinaFlightView
  ```
  Default `null`, so every two-argument call (all three existing tests, and any caller that has
  not migrated) computes exactly the old answer. `NinaFlightView`'s shape is unchanged —
  `{ awaiting: boolean; cursor: number }` — so `ChatScreen`'s prop type needs nothing.
- `lib/nina/turnflight.ts` — `export const NINA_TURN_POLL_GIVE_UP_MS` changes value from
  `NINA_TURN_STALE_MS` (90 000) to `NINA_BACKGROUND_BUDGET_MS` (240 000). It is RELOCATED below
  `NINA_BACKGROUND_BUDGET_MS` in the file (a `const` initializer cannot reference a later
  declaration — top-level TDZ), and it keeps its name.
- No other exported signature changes. `ninaAwaitingByMessage(newest, nowMs)` keeps its exact
  signature and semantics; `NINA_TURN_STALE_MS` stays `90_000`.

**Consumed by phase 2 (the reason this contract matters):**
- `app/nina/page.tsx` carries the claim read in ONE named place: the SIXTH element of the
  existing `Promise.all`, destructured as `pendingTurn`
  (`activeSessionId === null ? Promise.resolve(null) : getPendingNinaChatTurn(userId,
  activeSessionId)`), with exactly ONE consumption site:
  `const flight = ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)`.
  Phase 2's revive must be awaited BEFORE that read (revive sweeps stale claims and may open a
  fresh one; a racing read would compute "not awaiting" for a turn revive just re-fired — the
  G1×G3 ordering trap). The element is commented as a seam for exactly that move.
- `ninaFlightView`'s third parameter is how the revive's effect reaches the cold load with NO
  further signature change: after phase 2 hoists the revive above the read, the same call
  simply observes the claim revive opened.
- `NINA_TURN_POLL_GIVE_UP_MS` and the flight predicates are phase 1's and must not be re-touched
  by phase 2 (plan index: phase 2 "Does not touch" them).

**Requires (from earlier phases):** none — phase 1 has no dependencies.

**Leaves alone (owned by others or out of scope):**
- `lib/nina/actions.ts` — UNTOUCHED, byte for byte. The send path (STEP 0–1c), `pollNinaReply`'s
  logic (`:1994–2069`), `startNinaBackgroundTurn`/`runNinaBackgroundTurn`
  (`:1203`/`:1245`), `resendNinaMessage` (`:1784`), the chain bounds. `pollNinaReply`'s comment
  at `:2022` ("its own give-up at `NINA_TURN_POLL_GIVE_UP_MS` is what stops a database outage
  from polling for ever") stays TRUE under the new value — no edit needed there.
- `lib/nina/chatturn.ts` — every writer body untouched: `openNinaChatTurn`, `supersedeNinaChatTurn`,
  `ninaChatTurnStore`, `closeNinaChatTurn`, `sweepStaleNinaChatTurns`, `getPendingNinaChatTurn`
  (read as-is, including its deliberate return of EXPIRED pending rows —
  `lib/nina/chatturn.ts:88-90`). The page does NOT sweep: sweeping is a write, and the page
  stays "indexed reads + `after()`" (the sweep's own docstring at `:408-411` rules the page out).
- The revive, reveal mechanics, `resendNinaMessage` UI, any migration, `NINA_TURN_STALE_MS`
  itself, `maxDuration = 300` (`app/nina/page.tsx:146`, literal).
- `lib/db/schema.ts` — no migration, no index change (`tests/db.schema.nina.test.ts` pins
  `nina_turns` to exactly one index). `npm run db:check` stays clean.
- `app/nina/about/page.tsx:139` and `app/nina/jobs/page.tsx:64` — their comments quote
  `ninaFlightView(rows, Date.now())` as the `react-hooks/purity` precedent; the call keeps that
  shape (see Step 6's note), so both stay true.

**Deviation from the index, for the reconciler:** the index's phase-1 row says "Files: 4". This
plan touches 5 — the fifth (`lib/admin/imageGenTestView.ts`) is a COMMENT-ONLY truth fix: its
docstring at `:200-206` argues from the old give-up identity
("`NINA_TURN_POLL_GIVE_UP_MS` is deliberately set to the server's own deadline, because a chat
turn that has not answered by then never will"), which this phase ends. No behavior, no import,
no test reaches it; conflict-free with phase 2.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/turnflight.ts` | modify | rewrite `NINA_TURN_STALE_MS`'s docstring (lines 20–29); delete the give-up const + docstring (lines 31–32); insert the give-up at its new home after `NINA_TURN_CHAIN_MAX` (after line 94) with the new value and rationale; rewrite `ninaAwaitingByMessage`'s docstring (lines 110–124); rewrite `ninaFlightView`'s docstring and body (lines 139–157) |
| `app/nina/page.tsx` | modify | add the `getPendingNinaChatTurn` import (after line 20); "FIVE reads" → "SIX reads" (line 199); the destructure gains `pendingTurn` (line 206); the `Promise.all` gains a SIXTH element after `reviveNinaImageJobs(userId),` (after line 258); rewrite the flight block (lines 273–291) |
| `components/nina/ChatScreen.tsx` | modify | COMMENT-ONLY: rewrite the `flight` prop docstring (lines 265–286) and the give-up comment (lines 1094–1098). The import block (lines 43–47) and the give-up check (line 1135) are untouched — the name survived |
| `lib/nina/turnflight.test.ts` | modify | replace the give-up identity test (lines 52–56) with the budget pairing; insert the page/poll agreement describe (between the `ninaAwaitingByMessage` and `ninaFlightView` describes, after line 120); append three claim-parameter tests inside the `ninaFlightView` describe (after line 135) |
| `lib/admin/imageGenTestView.ts` | modify | COMMENT-ONLY: rewrite the give-up-identity paragraph of `NINA_IMAGE_TEST_GIVE_UP_MS`'s docstring (lines 200–206) |

## Implementation Steps

### Step 1: `lib/nina/turnflight.ts` — the stale deadline loses its second job

Replace the docstring above `NINA_TURN_STALE_MS` (lines 20–29). The constant's value and its
server-side jobs (sweep deadline, supersede window, poll expiry) are untouched; only the
"it is also the client's give-up" paragraph — now false — dies.

```ts
/**
 * A `nina_turns` chat row still `pending` after this long is a turn whose process died — killed
 * mid-flight, or cut off by the segment's ceiling. `sweepStaleNinaChatTurns` closes it, and both
 * the client and the poll stop waiting for it.
 *
 * **It is no longer the client's give-up.** For its whole life it was, on the argument that the
 * poll that gives up is the poll that has already been told the row is dead — and the argument had
 * a hole the measured data closed: a chained burst legitimately runs two to three times longer
 * than 90 s, so a tab that gave up here called a LIVING turn dead. The give-up now pairs with
 * `NINA_BACKGROUND_BUDGET_MS` below; what stops a dead turn's poll is the server's own
 * `awaiting: false`, back within this deadline. `lib/extract/constants.ts` still states the old
 * identity for the extraction path, and it still holds there: a polled extraction's honest wall
 * clock IS its stale deadline.
 */
export const NINA_TURN_STALE_MS = 90_000
```

Then DELETE lines 31–32 outright (the one-line docstring and
`export const NINA_TURN_POLL_GIVE_UP_MS = NINA_TURN_STALE_MS`). Nothing may reference the
constant between its old home and its new one; the file's next declaration after the deletion is
`NINA_TURN_POLL_INTERVALS_MS`'s docstring at (old) line 34, which is unaffected. The blank line
count around the backoff block stays as it is.

### Step 2: `lib/nina/turnflight.ts` — the give-up, repointed at the honest wall clock

Insert AFTER `export const NINA_TURN_CHAIN_MAX = 2` (line 94), BEFORE `ninaPollDelayFor`
(line 96) — after the budget it reads, which a top-level `const` initializer requires.

```ts
/**
 * The client's give-up, and since the offline-reply set it is the server's HONEST WALL CLOCK —
 * `NINA_BACKGROUND_BUDGET_MS`, the budget the background turn actually runs inside — not the
 * stale deadline it was identical to before (see `NINA_TURN_STALE_MS`'s note for why that
 * identity died). It sits below the budget here for a mechanical reason as well as a logical one:
 * the initializer reads it, and a `const` cannot lean on a declaration that comes later.
 *
 * ── WHO STOPS THE POLL, AND WHEN ──────────────────────────────────────────────────────────────
 *
 *   A DEAD turn — the server stops it, inside ~90 s. The sweep closes the claim at
 *               `NINA_TURN_STALE_MS`, the next poll reads `getPendingNinaChatTurn`, finds no fresh
 *               claim and an old message, and answers the authoritative `awaiting: false`
 *               (`pollNinaReply`, `lib/nina/actions.ts:2045` + `:2052`). The give-up is not needed
 *               and does not fire.
 *   A LIVE turn — the server stops it too, when her rows land and nothing of his is unanswered.
 *   NO SERVER   — the give-up is the only thing that ends it: the poll that cannot reach the
 *               server at all (`ok: false` forever — an offline phone) has learned nothing from
 *               anyone.
 *
 * So the number must cover the longest HONEST run, which is a full chained burst: the first turn
 * plus `NINA_TURN_CHAIN_MAX` follow-up links, each a `NINA_TURN_BUDGET.overall` model call plus
 * loads, inserts and a distillation (~50–70 s per link) — ~150–210 s, inside 240 s. At the old
 * 90 s the tab raised the 'no-reply' notice for a turn that was alive and stopped polling; her
 * chained replies landed unobserved until a refresh (analysis gap G2). Raising the backstop does
 * not stretch an outage: the client treats a failed poll as "try again", and the server's
 * `awaiting: false` still ends every wait it can reach. The backstop now only stops the tab
 * lying about a live chain.
 */
export const NINA_TURN_POLL_GIVE_UP_MS = NINA_BACKGROUND_BUDGET_MS
```

### Step 3: `lib/nina/turnflight.ts` — `ninaAwaitingByMessage`'s docstring catches up

Replace the docstring above `ninaAwaitingByMessage` (lines 110–124). The function BODY is
untouched — it is the shared disjunct the poll already calls and the page is about to OR with the
claim; only the paragraph claiming the cold load uses it ALONE is false now.

```ts
/**
 * **"Is there a message of his that has not been answered yet?"** — from the messages alone.
 *
 * TRUE iff the newest row in the session is HIS and it is younger than the deadline. Both halves
 * matter. Without the first, a screen would wait for a reply that already arrived. Without the
 * second, a message she never answered a week ago would put a typing indicator on the screen
 * forever and start a poll on every page load for the rest of time.
 *
 * **It is one disjunct of the shared answer, never the whole answer.** `pollNinaReply` ORs it
 * with the live claim (`lib/nina/actions.ts:2052`) and, since the offline-reply set, so does the
 * cold load — `ninaFlightView` takes the claim's `createdAt` and ORs the same way. The claim
 * covers a turn honestly still running past this deadline (a chained burst runs to
 * `NINA_BACKGROUND_BUDGET_MS`); this window covers the half-second hand-off gap between two
 * chained turns, where one claim has closed and the next has not yet opened.
 *
 * Alone it errs in one direction only: a turn that died at 5 s leaves the window saying
 * "awaiting" until 90 s, and the first poll's authoritative answer corrects the screen inside two
 * seconds. That direction of error is the safe one — it starts a poll that finds the truth,
 * rather than hiding a reply that is already on the way.
 */
export function ninaAwaitingByMessage(newest: NinaFlightRow | null, nowMs: number): boolean {
```

### Step 4: `lib/nina/turnflight.ts` — `ninaFlightView` takes the claim

Replace `ninaFlightView`'s docstring and body (lines 139–157). This is the phase's one signature
change. Note what the parameter deliberately ISN'T: the whole `PendingNinaChatTurn`. Taking a
`Date` keeps this module zero-import — importing the row type would drag `chatturn.ts`'s
`server-only` + `lib/db` into a file whose header promises "nothing here imports a database, an
env reader or `server-only`".

```ts
/**
 * The cold-load view: the rows the page has already read, PLUS the session's pending `nina_turns`
 * claim. Pure and zero-import, so `app/nina/page.tsx` and this suite share it with the poll's
 * answer.
 *
 * `rows` is OLDEST FIRST, which is what `listNinaMessages` returns and what the page renders
 * straight down; the newest row is therefore the last one.
 *
 * `liveClaimCreatedAt` is `getPendingNinaChatTurn`'s hit for the SAME session — `null` when there
 * is no claim or no session at all. That read returns an EXPIRED pending row too (its docstring
 * says so), so the freshness comparison below is load-bearing, and it is the same one
 * `pollNinaReply` applies before trusting its own claim read: fresh claim OR the message window —
 * exactly the disjunct at `lib/nina/actions.ts:2052`. ONE definition of "unanswered" for the cold
 * load and the poll, asserted as page/poll agreement in `lib/nina/turnflight.test.ts` (plan
 * invariant 5).
 *
 * The claim disjunct is what closes analysis gap G1: the message window expires at
 * `NINA_TURN_STALE_MS` while a turn — a chained burst especially — honestly runs to
 * `NINA_BACKGROUND_BUDGET_MS`, so a runner who reopened at t ∈ (90 s, 240 s) used to get a quiet
 * screen, no poll, and a reply that landed unobserved. The parameter's default is equally
 * deliberate: with no fresh claim AND an old message there is nothing in flight, and the screen
 * opens quiet — the dead turn is phase 2's revive, not this view's business.
 *
 * `cursor: 0` for an empty conversation. `nina_messages.seq` is a `bigserial` starting at 1, so 0
 * is below every row that can exist and "everything after 0" is "everything" — which is the
 * correct answer for a screen holding nothing.
 */
export function ninaFlightView(
  rows: readonly NinaFlightRow[],
  nowMs: number,
  liveClaimCreatedAt: Date | null = null,
): NinaFlightView {
  const newest = rows.length === 0 ? null : (rows[rows.length - 1] ?? null)
  /* The poll's own freshness line (`actions.ts:2029`), pointed at the claim instead of the row —
   * exclusive at the boundary, exactly like `ninaAwaitingByMessage`'s. */
  const claimLive =
    liveClaimCreatedAt !== null && nowMs - liveClaimCreatedAt.getTime() < NINA_TURN_STALE_MS
  return {
    awaiting: claimLive || ninaAwaitingByMessage(newest, nowMs),
    cursor: newest?.seq ?? 0,
  }
}
```

The `NinaFlightView` interface (lines 131–137) and the module header's zero-import paragraph
(lines 4–10) stay as they are: the header already names `app/nina/page.tsx` as one of the three
runtimes, and "the cold-load heuristic that decides whether a freshly rendered screen should
start polling" describes the consumer, not the mechanism, so it survives this phase. If the
implementer prefers, updating "the cold-load heuristic" to "the cold load's in-flight view" is
permitted but not required.

### Step 5: `app/nina/page.tsx` — the claim read joins the `Promise.all`

Three edits.

**(a)** Add the import after line 20 (`} from '@/lib/nina/attach'`):

```ts
import { getPendingNinaChatTurn } from '@/lib/nina/chatturn'
```

**(b)** Line 199's read count is now wrong — "FIVE reads now, all indexed" becomes SIX:

```ts
   * Invariant 4 holds, and it holds for a longer reason than it used to. SIX reads now, all
   * indexed; on the rare stale path a handful of UPDATEs; and `reviveNinaImageJobs`, which
```

(rest of that paragraph unchanged).

**(c)** The destructure (line 206) gains the sixth name:

```ts
  const [rows, , avatarRow, photoRow, , pendingTurn] = await Promise.all([
```

(element 2, `listOpenNinaImageJobs`, was already skipped; now element 5, `reviveNinaImageJobs`,
is too). And the SIXTH element goes after `reviveNinaImageJobs(userId),` (line 258), before the
closing `])`:

```ts
    /*
     * **The claim read (offline-reply set, R2 — analysis gap G1).** The session's pending
     * `nina_turns` row: the SAME indexed read `pollNinaReply` makes as the third leg of its own
     * `Promise.all` (`lib/nina/actions.ts:2016`), so the cold load answers "is she thinking" from
     * the same truth the open tab polls. `null` when there is no active session, on the
     * `?photo=` branch's `Promise.resolve(null)` idiom right above — a runner with no conversation
     * pays nothing at all.
     *
     * `ninaFlightView` below applies the freshness, because `getPendingNinaChatTurn` deliberately
     * returns an EXPIRED pending row too (its docstring says so). The fresh claim is the disjunct
     * the message window could never be: the window expires at `NINA_TURN_STALE_MS` while a turn
     * — a chained burst especially — honestly runs to `NINA_BACKGROUND_BUDGET_MS`, so a runner
     * who reopened at t ∈ (90 s, 240 s) got a quiet screen, no poll, and a reply that landed
     * unobserved. With the claim, the cold load and the poll share one definition of
     * "unanswered", which `lib/nina/turnflight.test.ts` asserts (plan invariant 5).
     *
     * ── SEAM FOR PHASE 2 — THE ORDERING IS ALREADY PINNED ────────────────────────────────────────
     * Phase 2's chat-turn revive must speak BEFORE this read: it sweeps stale claims and may open
     * a fresh one, and a read that raced it could compute "not awaiting" for a turn it just
     * re-fired — G1 re-created by the fix for G3. RESOLVED IN RECONCILIATION, one way, no fork:
     * phase 2 inserts `await reviveNinaChatTurn(...)` ABOVE the `Promise.all` below, and THIS read
     * STAYS its sixth element, exactly where it is. That is the whole fix — the `Promise.all` is
     * awaited after the revive, so this read already observes what revive did, and nothing in
     * phase 1's layout moves. (The read is kept in this ONE named element (`pendingTurn`) with
     * this ONE consumption site — the `ninaFlightView` call below — so the guarantee is checkable
     * by eye.)
     *
     * READ-ONLY, like everything else in this render: an expired claim is passed through as-is
     * and `ninaFlightView` declines to trust it. Sweeping it is a write, and this page stays
     * "indexed reads + `after()`" — the write belongs to phase 2's revive (and
     * `sweepStaleNinaChatTurns`'s own docstring already rules the page out as its caller).
     */
    activeSessionId === null
      ? Promise.resolve(null)
      : getPendingNinaChatTurn(userId, activeSessionId),
```

### Step 6: `app/nina/page.tsx` — the flight block consumes it

Replace the comment block and call at lines 273–291. ONE hardness rule in here:
`Date.now()` MUST stay in argument position. `react-hooks/purity` flags a hoisted
`const now = Date.now()` in an async Server Component but lets the argument-position read past —
`app/nina/jobs/page.tsx:56-64` quotes this exact call as its own precedent, and hoisting the
clock to a binding would flip that lint rule on this file.

```ts
  /*
   * **F36 R6 + offline-reply R2. Is a turn already in flight for the conversation this render is
   * painting?**
   *
   * Two disjuncts, and `ninaFlightView` owns both, spelled exactly the way `pollNinaReply` spells
   * its own answer (`lib/nina/actions.ts:2052`): a FRESH live claim for this session —
   * `pendingTurn` above, whose expiry the flight view applies because `getPendingNinaChatTurn`
   * hands back expired rows too — OR the message window (the newest row is his and younger than
   * `NINA_TURN_STALE_MS`, which covers the half-second hand-off gap between two chained turns
   * where no claim is open). One definition of "unanswered" for the cold load and the poll, and
   * the suite asserts the agreement. One honest silence too: with no fresh claim AND an old
   * message there is nothing in flight, so the screen opens quiet — the dead turn is phase 2's
   * revive, not this render's business.
   *
   * `cursor` rides along because the screen needs somewhere to resume from, and the newest row's
   * `seq` is exactly that. Invariant 4 is untouched: one extra indexed read inside the
   * `Promise.all` above, arithmetic over rows already in hand, no model call anywhere near the
   * render.
   *
   * `Date.now()` stays in ARGUMENT position on purpose: `react-hooks/purity` lets a Server
   * Component's one-shot render read the clock there and would flag a binding —
   * `app/nina/jobs/page.tsx` quotes this exact call as its own precedent.
   */
  const flight = ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)
```

`pendingTurn`'s type flows out of the tuple as `PendingNinaChatTurn | null` (the ternary's
`Promise<null>` branch unioned with `Promise<PendingNinaChatTurn>`); no type import is needed
and none should be added.

### Step 7: `components/nina/ChatScreen.tsx` — the two docstrings (comment-only)

No logic change in this file: the import block (lines 43–47) keeps `NINA_TURN_POLL_GIVE_UP_MS`
under its existing name, and the check at line 1135
(`const expired = Date.now() - startedAt >= NINA_TURN_POLL_GIVE_UP_MS`) is untouched — the
constant "moves" and the code follows it.

**(a)** The `flight` prop docstring (lines 265–286) argues "zero extra queries" and "a cold load
has no claim row in hand" — both false after this phase:

```ts
  /**
   * **F36 R6. Whether a turn is already in flight when this screen mounts, and where the poll
   * resumes from.**
   *
   * Computed on the server by `ninaFlightView` from the rows `app/nina/page.tsx` has ALREADY read
   * plus the session's pending `nina_turns` claim — the same indexed read the poll itself makes.
   *
   * It is what makes "the app does not care whether user close the app" true for the case that
   * actually happens: he sends, locks his phone, comes back forty seconds later. Without it the
   * reopened screen would show his message with no indicator and no poll, and her reply would only
   * appear if he happened to reload again. With it, the screen mounts already awaiting.
   *
   * `awaiting` is the POLL'S OWN disjunct — a fresh live claim OR "the newest row is his and it is
   * younger than `NINA_TURN_STALE_MS`" — so a turn honestly still running past the 90 s window (a
   * chained burst runs to ~210 s) starts the poll on a cold load, and a dead turn (claim swept,
   * message old) starts nothing. The first poll's answer remains authoritative and corrects either
   * seed inside two seconds.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and for the reason `sessionId` and
   * `pendingPhoto` are: `app/nina/page.tsx` is the one caller and `tsc` should be what notices if
   * it stops passing it. An optional prop defaulting to "not awaiting" would turn a broken page
   * into a chat that silently never polled.
   */
```

**(b)** The give-up comment (lines 1094–1098) documents the dead identity as live fact:

```ts
   * ── THE GIVE-UP ─────────────────────────────────────────────────────────────────────────────
   * `NINA_TURN_POLL_GIVE_UP_MS` is `NINA_BACKGROUND_BUDGET_MS` — the server's honest wall clock —
   * and no longer the 90 s stale deadline it was identical to before (asserted as the pairing in
   * `lib/nina/turnflight.test.ts`). The real stop for a DEAD turn is the server's own
   * `awaiting: false`: the claim read is authoritative, the sweep closes a dead row within
   * `NINA_TURN_STALE_MS`, and the next poll says stop within ~90 s without this backstop's help.
   * What is left for the backstop is the poll that cannot reach the server at all — an offline
   * phone, where every request fails and no server answer is ever coming — and it must span the
   * longest HONEST run so it never fires over a living turn: the first turn plus
   * `NINA_TURN_CHAIN_MAX` (2) chained follow-ups at ~50 s each is ~210 s, inside
   * `NINA_BACKGROUND_BUDGET_MS` = 240 s. At the old 90 s this loop called a living chain dead,
   * raised the notice, and her remaining replies landed unobserved.
```

### Step 8: `lib/nina/turnflight.test.ts` — the pairing replaces the identity

Replace the test at lines 52–56. All imports already present
(`NINA_BACKGROUND_BUDGET_MS` is imported at line 5 for the chain tests). Do NOT add a
`give-up > NINA_TURN_STALE_MS` assertion: on the budget block's documented Branch B fallback
(budget 45 000, stale 90 000) it would be false and would break the documented degradation — the
scope is the pairing and only the pairing. The neighboring tests (the stale-vs-turn guard at
lines 58–62 and both chain-budget inequalities at lines 64–94) stay byte-for-byte.

```ts
  it('gives up at the background budget, not at the stale deadline', () => {
    /* The pairing, and it is new. The give-up spent its life identical to NINA_TURN_STALE_MS on
     * the argument that the poll that gives up has already been told the row is dead. A chained
     * burst honestly runs past 90 s, so the notice was a lie for a live chain (analysis G2). The
     * server's `awaiting: false` — the claim read — stops a dead turn's poll; the backstop's
     * remaining job is the poll that cannot reach the server at all, and it now spans the
     * server's full honest wall clock. */
    expect(NINA_TURN_POLL_GIVE_UP_MS).toBe(NINA_BACKGROUND_BUDGET_MS)
  })
```

### Step 9: `lib/nina/turnflight.test.ts` — the page/poll agreement, under the new disjunct

Insert this describe AFTER the `ninaAwaitingByMessage` describe (after line 120), BEFORE
`describe('ninaFlightView')`. This is invariant 5's assertion and the G1 case pinned: the page's
half and the poll's half must answer identically for every combination of claim freshness and
newest-row state.

```ts
describe('the cold load and the poll agree on "unanswered"', () => {
  /**
   * `pollNinaReply`'s disjunct, transcribed from `lib/nina/actions.ts:2045` and `:2052`:
   *
   *     const expired = pending !== null && now - pending.createdAt.getTime() >= NINA_TURN_STALE_MS
   *     const live = pending !== null && !expired
   *     const awaiting = live || ninaAwaitingByMessage(newest, now)
   *
   * A pure unit test cannot import a `'use server'` module, so this transcription stands in for
   * the action. **If you change the poll's disjunct, change this helper in the same commit** —
   * this file is what asserts the page and the poll cannot disagree (plan invariant 5).
   */
  const pollAwaiting = (claimCreatedAt: Date | null, newest: NinaFlightRow | null): boolean => {
    const expired = claimCreatedAt !== null && NOW - claimCreatedAt.getTime() >= NINA_TURN_STALE_MS
    const live = claimCreatedAt !== null && !expired
    return live || ninaAwaitingByMessage(newest, NOW)
  }

  /** The page's half: `ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)`. */
  const pageAwaiting = (
    rows: readonly NinaFlightRow[],
    claimCreatedAt: Date | null,
  ): boolean => ninaFlightView(rows, NOW, claimCreatedAt).awaiting

  /** A claim opened `ageMs` ago, or `null` for "no pending row for this session". */
  const claim = (ageMs: number | null): Date | null =>
    ageMs === null ? null : new Date(NOW - ageMs)

  it('a FRESH claim says awaiting even with the message window expired — the G1 case', () => {
    /* Reopen at t ∈ (90 s, 240 s), mid-turn or mid-chain. The heuristic alone says quiet; the
     * claim is the disjunct that starts the poll and lands her bubbles without a refresh. */
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 3)]
    expect(pageAwaiting(rows, claim(60_000))).toBe(true)
    expect(pollAwaiting(claim(60_000), rows[rows.length - 1] ?? null)).toBe(true)
  })

  it('no claim and an old message says quiet — the dead turn, which only phase 2 revives', () => {
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 3)]
    expect(pageAwaiting(rows, null)).toBe(false)
    expect(pollAwaiting(null, rows[rows.length - 1] ?? null)).toBe(false)
  })

  it('an EXPIRED claim is trusted by neither side — getPendingNinaChatTurn returns one anyway', () => {
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 3)]
    expect(pageAwaiting(rows, claim(NINA_TURN_STALE_MS + 1_000))).toBe(false)
    expect(pollAwaiting(claim(NINA_TURN_STALE_MS + 1_000), rows[rows.length - 1] ?? null)).toBe(
      false,
    )
  })

  it('with no claim at all, the message window alone answers — both directions', () => {
    const fresh = [row('runner', 5_000, 3)]
    expect(pageAwaiting(fresh, null)).toBe(true)
    expect(pollAwaiting(null, fresh[fresh.length - 1] ?? null)).toBe(true)

    const hers = [row('nina', 1_000)]
    expect(pageAwaiting(hers, null)).toBe(false)
    expect(pollAwaiting(null, hers[hers.length - 1] ?? null)).toBe(false)
  })

  it('a fresh claim outranks her newest row — the persisting tail, where both are true', () => {
    /* Reachable for a moment while her rows are going in: her bubbles exist, the claim is still
     * `pending`+`persisting`. The window alone would say "answered"; the claim says "not yet". */
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 2), row('nina', 1_000, 3)]
    expect(pageAwaiting(rows, claim(5_000))).toBe(true)
    expect(pollAwaiting(claim(5_000), rows[rows.length - 1] ?? null)).toBe(true)
  })
})
```

### Step 10: `lib/nina/turnflight.test.ts` — `ninaFlightView`'s third parameter, as a unit

Append INSIDE the existing `describe('ninaFlightView')` block, after its `cursor 0` test
(line 135). The three existing tests stay untouched — they are now also the proof that the
optional parameter defaults to the old behavior.

```ts
  it('flips awaiting on a FRESH claim alone, cursor unmoved', () => {
    /* The G1 case as a unit: window expired, claim live, poll starts. */
    const view = ninaFlightView(
      [row('runner', NINA_TURN_STALE_MS + 30_000, 7)],
      NOW,
      new Date(NOW - 60_000),
    )
    expect(view).toEqual({ awaiting: true, cursor: 7 })
  })

  it('ignores an EXPIRED claim — the read hands one back deliberately', () => {
    /* Exclusive at the boundary, exactly like the message window: at exactly STALE the claim is
     * not fresh. */
    const view = ninaFlightView(
      [row('runner', NINA_TURN_STALE_MS + 30_000, 7)],
      NOW,
      new Date(NOW - NINA_TURN_STALE_MS),
    )
    expect(view).toEqual({ awaiting: false, cursor: 7 })
  })

  it('defaults the claim to null, so every two-argument call behaves exactly as before', () => {
    expect(ninaFlightView([row('runner', 5_000, 7)], NOW)).toEqual({ awaiting: true, cursor: 7 })
  })
```

### Step 11: `lib/admin/imageGenTestView.ts` — comment-only truth fix

Replace the second paragraph of `NINA_IMAGE_TEST_GIVE_UP_MS`'s docstring (lines 200–206). The
old text argues from "`NINA_TURN_POLL_GIVE_UP_MS` is deliberately set to the server's own
deadline, because a chat turn that has not answered by then never will" — the exact identity
Step 2 ends. The local argument (why THIS bound must not be the image stale deadline) is
unchanged in force; only the false cross-reference goes. No code, no import, no test.

```ts
 * ── AND WHY IT IS NOT `NINA_IMAGE_STALE_MS` ──────────────────────────────────────────────────
 * The chat poll's give-up pairs with the server's honest wall clock (`NINA_BACKGROUND_BUDGET_MS`),
 * because the server's own claim read is what actually stops a dead turn — but a give-up must
 * still be SHORTER than the thing it watches is allowed to run, or it is no backstop at all. This
 * one must NOT be `NINA_IMAGE_STALE_MS`: the server's deadline for an image job is twenty minutes,
 * and a tab that read the database for twenty minutes to learn something already visible on
 * `/nina/jobs` would be a poll with no bound in practice. So when this clock runs out the panel
 * says the job is STILL OPEN — which is true — rather than "failed", which would not be.
 * `STALE_PENDING_MS` makes the same distinction for extractions.
```

### What this phase must NOT touch (restated, from the set's scope)

- The send path: `lib/nina/actions.ts` STEP 0–1c.
- Any claim WRITER body: `lib/nina/chatturn.ts`'s `openNinaChatTurn`, `supersedeNinaChatTurn`,
  `ninaChatTurnStore`, `closeNinaChatTurn`, `sweepStaleNinaChatTurns`.
- `pollNinaReply`'s logic — the disjunct at `:2052` is quoted, not edited.
- Reveal mechanics, `resendNinaMessage`, phase 2's revive, any migration.
- `NINA_TURN_STALE_MS` (stays `90_000`) and `maxDuration = 300` (stays a literal).
- `lib/nina/turnflight.ts`'s other constants: the backoff table, `NINA_BACKGROUND_BUDGET_MS`,
  `NINA_TURN_CHAIN_MAX`, and both chain-budget inequality tests.

## Verification

The worktree is fresh: **`npm install` has NOT been run** and there is no `node_modules`. Run it
first (a real install — a symlinked `node_modules` passes vitest+tsc but Turbopack rejects it),
and copy the env file the repo's gates expect:

```bash
cd /home/miftah/.worktrees/run-insights/nina-offline-reply
npm install
cp /home/miftah/run-insights/.env.local .env.local   # lib/env.ts validates 14 vars at load
npx next typegen && npx tsc --noEmit
npx vitest run lib/nina/turnflight.test.ts tests/nina.burstCancel.test.ts lib/nina/chatturn.test.ts
```

(`burstCancel` and `chatturn` are canaries: both transitively import the edited module through
`lib/nina/actions.ts` / `lib/nina/chatturn.ts`; if a Step 1–4 edit broke module init, they fail
before the full suite does.) Then the full gate when convenient: `npm test`. No migration was
added anywhere in this phase — assert `git status --porcelain drizzle/` is empty.

**Manual check (optional, needs a live turn):** send a message, wait ~100 s (past the old
heuristic, well inside a turn or chain), force-reload `/nina`. Expect the typing indicator up and
the poll running from the cold load alone, and her bubbles arriving without a second send. Then
the dead-turn case: kill the server side (or wait past the budget) and reload — expect a quiet
screen with no notice, which is honest: nothing is in flight (revive is phase 2's).

**Exit criteria (from the plan index):** reopening `/nina` while a turn or chain is genuinely
live (any age up to the budget) starts the typing indicator and the poll, and bubbles land
without a refresh; a dead turn still stops the poll via the server's own `awaiting: false` within
~90 s; typegen + tsc + vitest green.

## Handoffs

- **Phase 2** must quote `app/nina/page.tsx` AS THIS PHASE LEAVES IT: the claim read is the
  sixth `Promise.all` element named `pendingTurn` (with the SEAM FOR PHASE 2 comment), consumed
  at the single `ninaFlightView` call. The composition is PINNED (reconciled, no fork): phase 2
  inserts `await reviveNinaChatTurn(userId, activeSessionId)` BETWEEN `chooseActiveSession` and
  the `Promise.all`, and moves NOTHING of this phase's output — the claim read stays the sixth
  element inside the `Promise.all`. Ordering falls out mechanically: revive completes → the
  `Promise.all` (with the claim read) runs → `ninaFlightView` consumes it, so the read observes
  the sweep and any fresh claim revive opened. The final page sequence is: sessions read →
  `chooseActiveSession` → `await reviveNinaChatTurn` (only when `activeSessionId !== null`) →
  `Promise.all` (including the `pendingTurn` claim read) → `ninaFlightView(rows, Date.now(),
  pendingTurn?.createdAt ?? null)`.
- **Phase 2** does not touch `NINA_TURN_POLL_GIVE_UP_MS`, the flight predicates, `ChatScreen`,
  or the pairing test (the plan index says so; this phase owns them).
- **The reconciler**: the Files count is 5, not the index's 4 — the fifth
  (`lib/admin/imageGenTestView.ts`) is the comment-only truth fix from Step 11, verified against
  the source (its docstring at `:200-206` states the give-up identity this phase ends, so the
  fix is load-bearing, not a ride-along). The index row has been corrected to 5.

## Rollback

`git revert` the phase-1 commit range. Everything here is additive reads and a constant
re-pointing: without it, the cold load computes `ninaFlightView(rows, Date.now())` (the third
parameter defaults to `null` — the two-argument behavior is preserved by the signature itself),
the give-up returns to the stale deadline, and the pre-phase-1 reopen behavior is restored
exactly. No schema, no data, no action surface, nothing to clean up out-of-band; the claim read
disappears with the reverted page edit, and `drizzle/` never gained a file.
