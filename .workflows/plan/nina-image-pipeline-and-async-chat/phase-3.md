# Phase 3: WhatsApp-style send: instant persist, durable background turn

**Plan set:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md`
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Satisfies:** R6 — "i send the message, it quickly shown that the message is sent, then the app does not care whether user close the app or not, because nina will send the answer either way." **Plus part of R8** (reconciled in): Step 6d abandons a background turn whose session was deleted mid-flight, closing the distillation race phase 6 identified and this phase widens. Phase 6 owns the purge itself; this phase owns not re-creating what it purged. **This does not add a dependency on phase 6.**
**Depends on:** Phase 2
**Difficulty:** HARD
**Package:** `lib/nina`, `components/nina`

---

## Goal

`sendNinaMessage` stops awaiting the model. It persists the runner's message, its image rows and a
claim on the turn, and returns in well under a second; the 13–45 s model turn, the persist of her
bubbles, the distillation and the auto-title all run in a server-owned background task that outlives
the browser. An open tab learns she has answered through a bounded poll and reveals her bubbles with
the same staggered `planReveal` schedule it uses today; a closed tab needs nothing, because the rows
are in the database and the next render has them. A turn that dies mid-flight is closed by a sweep
with a recorded reason instead of leaving a runner message silently orphaned.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**
- `SendNinaMessageResult.bubbles` (`lib/nina/actions.ts:105`) — she has not spoken yet when the
  action returns, so the field can only ever be `[]`.
- `SendNinaMessageResult.unavailable` (`lib/nina/actions.ts:108`) — same reason: "she could not
  answer" is not knowable at return time.
- `NinaAttachResult.unavailable` (`lib/nina/albumActions.ts:39`) — the same field one layer up. Its
  only consumer, `components/nina/NinaAboutScreen.tsx:189`, reads `result.ok` and never this field,
  so **phase 5's file is not touched.**

**Renames:** none.

**Creates:**
- `lib/nina/turnflight.ts` — new zero-import module. Exports `NINA_TURN_STALE_MS`,
  `NINA_TURN_POLL_INTERVALS_MS`, `NINA_TURN_POLL_MID_AFTER_ATTEMPTS`,
  `NINA_TURN_POLL_LATE_AFTER_ATTEMPTS`, `NINA_TURN_POLL_GIVE_UP_MS`, `NINA_BACKGROUND_BUDGET_MS`,
  `NINA_TURN_CHAIN_MAX`, `ninaPollDelayFor`, `ninaAwaitingByMessage`, `ninaFlightView`,
  types `NinaFlightRow` / `NinaFlightView`.
- `lib/nina/turnflight.test.ts` — new co-located suite.
- `lib/nina/chatturn.ts` — new `server-only` module. Exports `openNinaChatTurn`,
  `getPendingNinaChatTurn`, `ninaChatTurnStore`, `closeNinaChatTurn`, `sweepStaleNinaChatTurns`,
  `ninaSessionExists`, `CHAT_TURN_PHASE_RUNNING`, `CHAT_TURN_PHASE_PERSISTING`.
  (`ninaSessionExists` is Step 6d's, added during reconciliation to close the race phase 6 found.)
- `lib/nina/queries.ts` — new export `listNinaMessagesAfter(userId, opts)`.
- `lib/nina/gateway.ts` — `STATUS_BY_SOURCE` becomes `export const STATUS_BY_SOURCE` (currently
  private at `lib/nina/gateway.ts:418`). No behaviour change; one keyword.
- `lib/nina/actions.ts` — new exported Server Action `pollNinaReply`; new exported interfaces
  `NinaReplyPoll`, `NinaBackgroundTurnInput`; new **non-exported** `runNinaBackgroundTurn`.
- `components/nina/ChatScreen.tsx` — new required prop `flight: NinaFlightView`.

**Signature changes:**
- `sendNinaMessage(...): Promise<SendNinaMessageResult>` — the input is UNCHANGED; the result
  becomes `{ ok, userMessageId, sessionId, cursor, turnId }`.
- `attachNinaPhotoToChat(...): Promise<NinaAttachResult>` — result becomes `{ ok, userMessageId }`.
- `ChatScreen` gains one required prop; `app/nina/page.tsx` passes it.

**Requires (from earlier phases):**
- **Phase 2 owns the durable-background convention and I consume it at exactly one call site**
  (Step 6, `startNinaBackgroundTurn`). **RESOLVED: phase 2 chose `after()`, in as many words** —
  its Interface Contract reads *"The durability primitive is `next/server`'s `after()`. Not a
  floating promise, not a fetch to an internal route, not a queue."* So the call site ships exactly
  as written here and the conditional is closed. Phase 2 also sanctions the nesting this creates
  (`runNinaTurn` inside `after()`, with a `generate_image` tool call registering a second, nested
  `after()` for `fireNinaImageGeneration`), quoting the Next 16.3.1 reference at `:56`:
  *"`after` can be nested inside other `after` calls."* Verified in
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`.
- **Phase 2's contract point 2 binds this phase and is worth restating: the `after()` budget is the
  invoking route SEGMENT's `maxDuration`.** I must not relocate `runNinaTurn` into a new route
  handler or any segment that does not carry 300, and I must not lower either literal. I do neither
  — the background turn is registered from the same Server Action `app/nina/page.tsx` already owns.
- **Phase 2 raises `app/nina/page.tsx`'s `maxDuration` from 60 to 300.** A Server Action's timeout is
  the page segment's, and `after()` runs for that same budget (`next/dist/docs/01-app/
  03-api-reference/04-functions/after.md`: *"`after` will run for the platform's default or
  configured max duration of your route"*). **I do not set `maxDuration`.** See *"If phase 2's probe
  failed"* below for the two literals that move if the ceiling is really 60 s.

**Leaves alone (owned by others):**
- `scripts/nina-image-worker.ts`, `.github/workflows/nina-image.yml`, `tests/nina.imageworker.test.ts` (Phase 1)
- `lib/nina/imagedispatch.ts`, `lib/nina/imagerecipe.ts`, `lib/nina/imagegen.ts`,
  `lib/nina/selfiegen.ts`, `lib/nina/avatargen.ts`, `app/nina/page.tsx`'s `maxDuration` line (Phase 2)
- `lib/nina/imagejobs.ts`, `app/nina/jobs/*`, `components/nina/NinaSidebar.tsx` (Phase 4)
- `components/nina/NinaAboutScreen.tsx`, `app/nina/about/page.tsx` (Phase 5)
- `lib/nina/queries.ts`'s `removeNinaSession` (§10 sessions), `lib/nina/sessionActions.ts`,
  `lib/db/schema.ts`, `drizzle/**` (Phase 6). **This phase adds no migration and changes no
  column — and neither does any other phase in this set; see the index's *Decisions*.** I do add
  one function to `lib/nina/queries.ts` (`listNinaMessagesAfter`, Step 4) and one symbol to its
  `drizzle-orm` import; that import block is the only region phase 6 and I share, and Step 4
  carries the merged list both plans now specify.
- `tests/integration/` (Phase 7)

**Three files I touch that another phase also touches — RECONCILED, all three checked against the
shipped source:**

| File | My edit | Their edit | Collide? |
|---|---|---|---|
| `app/nina/page.tsx` | one `import`, three lines building `flight` (after `todayISO`, ~:222), one JSX prop (~:399) | Phase 2 changes the literal `60` on `:128`, rewrites the docblock above it, rewrites the paragraph at `:178-183`, and appends a FIFTH element to the `Promise.all` at `:184-195` | **No.** My `flight` is computed AFTER the `Promise.all` from `rows`, which phase 2 leaves as the first destructured binding. Disjoint hunks in both directions. |
| `components/nina/ChatScreen.tsx` | `handleSend`, a new poll effect, a new prop, `revealBubbles` extracted, the `:62` header sentence (9a-pre) | Phase 4 adds a deep-link scroll | **No** — verified anchor by anchor below. |
| `lib/nina/queries.ts` | one new function after `:907`, one symbol in the `drizzle-orm` import | Phase 6 rewrites `removeNinaSession` (`:803-834`) and adds two symbols to the same import | **The import block only.** Both plans now specify the same merged list; see Step 4's block. |

**Shape left for phase 4 (the deep-link scroll) — VERIFIED, not asserted.** Phase 4 named five
anchors it needs preserved. Each was located in the shipped file and checked against this phase's
actual edit ranges:

| # | Anchor | Shipped at | This phase |
|---|---|---|---|
| 1 | the `?attach=`/`?photo=` strip `useLayoutEffect`, and its single `replaceState` | `:253-260`, `replaceState` at `:259` | **untouched** — no step of mine enters `:230-262` |
| 2 | `handleJumpToQuote` + its `planQuoteScroll` measurement | `:440-475`, `planQuoteScroll` at `:454` | **untouched** — `revealBubbles` (9f) is inserted *after* it, before `handleSend` |
| 3 | the `flashTimer` ref and the `flashId` state | `:272` and **`:186`** | **untouched** — see 9d's boundary note: `flashId` at `:186` is OUTSIDE my state-block replacement, and 9e only *appends* `pollTimer` and one `clearTimeout` line beside `flashTimer` |
| 4 | the `alive` ref | `:265` | **untouched** — read by my poll and reveal, never redeclared |
| 5 | the `'quote-missing'` Notice member and its copy | `:75` and `:87` | **untouched** — 9b adds a comment above `'no-reply'` only |

Two rules for phase 4, both still exact: the `useLayoutEffect` at `:253` is still the file's **only**
`replaceState` writer, so a new URL param must be deleted inside that same effect rather than by a
second one (its own docstring at `:249` says so in as many words); and `revealBubbles` is the sole
appender of Nina's rows, so a deep-link scroll must not call it. The one thing that moved is the
reveal — it is now the `revealBubbles` callback (Step 9f) rather than an inline loop in
`handleSend`, and phase 4 does not touch it. `MessageList`'s props, including `flashId={flashId}`
(`:761`) and `onJumpToQuote={handleJumpToQuote}` (`:763`), are outside every range I edit.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/turnflight.ts` | create | Zero-import constants + the three pure predicates the client, the page and the poll all share. |
| `lib/nina/turnflight.test.ts` | create | The schedule arithmetic and the awaiting predicate, as tests. |
| `lib/nina/chatturn.ts` | create | The chat turn's claim on `nina_turns`: open, read, record, close, sweep, **plus `ninaSessionExists` (Step 6d)**. Mirrors `lib/nina/imagejobs.ts`. |
| `lib/nina/gateway.ts` | modify | `:418` — export `STATUS_BY_SOURCE` so `chatturn.ts` reuses the one map. |
| `lib/nina/queries.ts` | modify | after `:907` — add `listNinaMessagesAfter`. |
| `lib/nina/actions.ts` | modify | `:99-116` result type; `:464-478` capture `seq`; `:538-751` the split; new `runNinaBackgroundTurn`, `startNinaBackgroundTurn`, `pollNinaReply`. |
| `lib/nina/albumActions.ts` | modify | `:36-42` drop `unavailable`; `:57-61` drop it from the return. |
| `components/nina/ChatScreen.tsx` | modify | `:71-92` notice comments; `:110-171` the `flight` prop; `:172-176` state; `:266-280` a `pollTimer` ref; `:545-716` `handleSend` + `revealBubbles` + the poll effect; `:722` the typing derivation. |
| `app/nina/page.tsx` | modify | `:236` build `flight`; `:399` pass it. **Not `:128`.** |

Nine files. No new route, no migration, no schema change, no CI-guard edit.

---

## Implementation Steps

### Step 1: The pure module — constants, the poll schedule, and the awaiting predicate

**File:** `lib/nina/turnflight.ts` (new)
**Change:** One zero-import module so the client's give-up threshold, the server's deadline and the
page's cold-load heuristic are literally the same numbers. This is the `lib/nina/imagerecipe.ts`
idiom (zero imports, shared by two runtimes) and the `lib/extract/constants.ts` +
`components/extract/useExtractionStatus.ts` idiom (a poll schedule as arithmetic, with
`tests/extract.pollSchedule.test.ts` proving the budget closes) applied to the chat turn.

**Code:**

```ts
/**
 * **When is Nina still answering, how often do we ask, and when do we stop asking.**
 *
 * ── WHY THIS IS A ZERO-IMPORT MODULE ──────────────────────────────────────────────────────────
 * Three runtimes read these numbers and they must not drift: `lib/nina/actions.ts` (the server's
 * deadline and its sweep), `components/nina/ChatScreen.tsx` (the client's poll schedule and its
 * give-up), and `app/nina/page.tsx` (the cold-load heuristic that decides whether a freshly
 * rendered screen should start polling at all). `lib/nina/imagerecipe.ts` is the precedent — the
 * same reasoning, one feature over — and it is why nothing here imports a database, an env reader
 * or `server-only`.
 *
 * ── THE ONE PROPERTY EVERY NUMBER BELOW SERVES ────────────────────────────────────────────────
 * `NINA_TURN_BUDGET.overall` is 45 s (`lib/nina/turn.ts:76`). A turn also costs one context load,
 * one history load and one tuning read up front and up to four row inserts at the end — call it
 * 5 s of slack, so a healthy turn is done inside 50 s. `NINA_TURN_STALE_MS` is 90 s: 1.8x that,
 * which is the same ratio and the same literal `lib/extract/constants.ts`'s `STALE_PENDING_MS`
 * chose against a 34 s median. A turn still `pending` at 90 s is dead, not slow.
 */

/**
 * A `nina_turns` chat row still `pending` after this long is a turn whose process died — killed
 * mid-flight, or cut off by the segment's ceiling. `sweepStaleNinaChatTurns` closes it, and both
 * the client and the poll stop waiting for it.
 *
 * **It is also the client's give-up**, deliberately: the poll that gives up is the poll that has
 * already been told the row is dead, so the runner's last request is the one that makes the screen
 * honest. `lib/extract/constants.ts` states the identity for the extraction path in the same words.
 */
export const NINA_TURN_STALE_MS = 90_000

/** The client's give-up. Identical to the server's deadline, on purpose — see above. */
export const NINA_TURN_POLL_GIVE_UP_MS = NINA_TURN_STALE_MS

/**
 * The backoff. Fifteen live `glm-5.3` calls measured 10.2–16.4 s (the reveal module's own note), so
 * the first six polls are close together — a 1.5 s lag on a 13 s wait is invisible — and then it
 * relaxes, because a turn still running at 30 s is a turn running long and will not finish in the
 * next second either.
 */
export const NINA_TURN_POLL_INTERVALS_MS = { initial: 1_500, mid: 2_500, late: 4_000 } as const
export const NINA_TURN_POLL_MID_AFTER_ATTEMPTS = 6
export const NINA_TURN_POLL_LATE_AFTER_ATTEMPTS = 14

/**
 * **The background task's own wall-clock budget, and the one literal phase 2's outcome moves.**
 *
 * A Server Action's timeout is the PAGE SEGMENT's (`app/nina/page.tsx`), and `after()` runs for
 * that same budget — Next 16.3.1's `after` reference: *"`after` will run for the platform's default
 * or configured max duration of your route."* Phase 2 raises that segment from 60 to 300 after its
 * Fluid-compute probe.
 *
 *   probe PASSED (300 s ceiling)  -> 240_000 here, `NINA_TURN_CHAIN_MAX` 2. One turn is ~50 s and a
 *                                    distillation is ~20 s, so three chained links are ~210 s and
 *                                    fit with 90 s of margin.
 *   probe FAILED  (60 s ceiling)  -> change this to 45_000 and `NINA_TURN_CHAIN_MAX` to 0. The
 *                                    split still works and is still strictly better than today,
 *                                    because the 60 s is no longer partly spent with the runner
 *                                    watching a grey bubble. He simply has to send again to get a
 *                                    burst answered, which is what the 'no-reply' notice tells him.
 *
 * **THE TWO LITERALS MOVE TOGETHER, AND THE SUITE ENFORCES THE HALF THAT BITES.** The inequality
 * `lib/nina/turnflight.test.ts` asserts is about the FOLLOW-UP links, not the first one:
 *
 *     NINA_TURN_CHAIN_MAX * (NINA_TURN_BUDGET.overall + 25_000)
 *       <= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall
 *
 * which is exactly `runNinaBackgroundTurn`'s own wall-clock guard, written as arithmetic. Branch A:
 * `2 * 70_000 = 140_000 <= 240_000 - 45_000 = 195_000`. Branch B: `0 <= 45_000 - 45_000 = 0`. Both
 * hold. Lower this to 45_000 and leave the chain at 2 and it reads `140_000 <= 0` and fails, which
 * is the dangerous direction and the one worth failing on: a chain that starts links the invocation
 * cannot finish spends money on turns that get killed mid-flight.
 *
 * (An earlier draft asserted `(CHAIN_MAX + 1) * perLink <= BUDGET`, which counted the FIRST link
 * against a budget that does not bound it — `runNinaTurn` bounds itself with `NINA_TURN_BUDGET`,
 * and the response has already gone out. That formulation is arithmetically false on Branch B —
 * `70_000 <= 45_000` — so the documented Branch B values would have failed the suite the moment
 * anyone took that branch. Corrected during reconciliation.)
 *
 * Nothing else in this phase depends on which of the two it is.
 */
export const NINA_BACKGROUND_BUDGET_MS = 240_000

/**
 * How many FOLLOW-UP turns one background task may run for messages that arrived while it was
 * working. See `runNinaBackgroundTurn`'s chain, and `NINA_BACKGROUND_BUDGET_MS` above for why the
 * number is 2 and when it must be 0.
 */
export const NINA_TURN_CHAIN_MAX = 2

/** The delay before poll number `attempts` (0-based). Pure; `pollDelayFor` one feature over. */
export function ninaPollDelayFor(attempts: number): number {
  if (attempts >= NINA_TURN_POLL_LATE_AFTER_ATTEMPTS) return NINA_TURN_POLL_INTERVALS_MS.late
  if (attempts >= NINA_TURN_POLL_MID_AFTER_ATTEMPTS) return NINA_TURN_POLL_INTERVALS_MS.mid
  return NINA_TURN_POLL_INTERVALS_MS.initial
}

/** The two fields the awaiting question needs off the newest row of a conversation. */
export interface NinaFlightRow {
  role: 'runner' | 'nina'
  seq: number
  createdAt: Date
}

/**
 * **"Is there a message of his that has not been answered yet?"** — from the messages alone.
 *
 * TRUE iff the newest row in the session is HIS and it is younger than the deadline. Both halves
 * matter. Without the first, a screen would wait for a reply that already arrived. Without the
 * second, a message she never answered a week ago would put a typing indicator on the screen
 * forever and start a poll on every page load for the rest of time.
 *
 * This is a HEURISTIC where `app/nina/page.tsx` uses it (a cold load has no claim row in hand) and
 * it is exactly right where `pollNinaReply` uses it (the poll ORs it with the live claim). The two
 * can disagree for at most one poll interval: a turn that died at 5 s leaves the heuristic saying
 * "awaiting" until 90 s, and the first poll's authoritative answer corrects the screen inside two
 * seconds. That direction of error is the safe one — it starts a poll that finds the truth, rather
 * than hiding a reply that is already on the way.
 */
export function ninaAwaitingByMessage(newest: NinaFlightRow | null, nowMs: number): boolean {
  if (newest === null) return false
  if (newest.role !== 'runner') return false
  return nowMs - newest.createdAt.getTime() < NINA_TURN_STALE_MS
}

/** What `app/nina/page.tsx` hands `ChatScreen`. */
export interface NinaFlightView {
  /** Start the typing indicator and the poll on mount. */
  awaiting: boolean
  /** `nina_messages.seq` of the newest row on screen — where the poll resumes from. */
  cursor: number
}

/**
 * The cold-load view, computed from rows the page has already read. **Zero extra queries** — the
 * whole reason this is a pure function over `listNinaMessages`'s output rather than a fifth read in
 * the page's `Promise.all`.
 *
 * `rows` is OLDEST FIRST, which is what `listNinaMessages` returns and what the page renders
 * straight down; the newest row is therefore the last one.
 *
 * `cursor: 0` for an empty conversation. `nina_messages.seq` is a `bigserial` starting at 1, so 0 is
 * below every row that can exist and "everything after 0" is "everything" — which is the correct
 * answer for a screen holding nothing.
 */
export function ninaFlightView(rows: readonly NinaFlightRow[], nowMs: number): NinaFlightView {
  const newest = rows.length === 0 ? null : (rows[rows.length - 1] ?? null)
  return {
    awaiting: ninaAwaitingByMessage(newest, nowMs),
    cursor: newest?.seq ?? 0,
  }
}
```

**Impact:** Nothing yet — nothing imports it until Step 6.

---

### Step 2: The pure module's suite

**File:** `lib/nina/turnflight.test.ts` (new)
**Change:** The budget arithmetic asserted rather than asserted-in-prose, on
`tests/extract.pollSchedule.test.ts`'s pattern.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { NINA_TURN_BUDGET } from './turn'
import {
  NINA_BACKGROUND_BUDGET_MS,
  NINA_TURN_CHAIN_MAX,
  NINA_TURN_POLL_GIVE_UP_MS,
  NINA_TURN_POLL_INTERVALS_MS,
  NINA_TURN_POLL_LATE_AFTER_ATTEMPTS,
  NINA_TURN_POLL_MID_AFTER_ATTEMPTS,
  NINA_TURN_STALE_MS,
  ninaAwaitingByMessage,
  ninaFlightView,
  ninaPollDelayFor,
  type NinaFlightRow,
} from './turnflight'

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0)
const row = (role: 'runner' | 'nina', ageMs: number, seq = 1): NinaFlightRow => ({
  role,
  seq,
  createdAt: new Date(NOW - ageMs),
})

describe('the poll backoff schedule', () => {
  it('starts at 1.5 s, steps to 2.5 s after six attempts and 4 s after fourteen', () => {
    expect(ninaPollDelayFor(0)).toBe(NINA_TURN_POLL_INTERVALS_MS.initial)
    expect(ninaPollDelayFor(NINA_TURN_POLL_MID_AFTER_ATTEMPTS - 1)).toBe(
      NINA_TURN_POLL_INTERVALS_MS.initial,
    )
    expect(ninaPollDelayFor(NINA_TURN_POLL_MID_AFTER_ATTEMPTS)).toBe(
      NINA_TURN_POLL_INTERVALS_MS.mid,
    )
    expect(ninaPollDelayFor(NINA_TURN_POLL_LATE_AFTER_ATTEMPTS)).toBe(
      NINA_TURN_POLL_INTERVALS_MS.late,
    )
    expect(ninaPollDelayFor(9_999)).toBe(NINA_TURN_POLL_INTERVALS_MS.late)
  })

  it('sees a typical 16 s turn land within one interval of it landing', () => {
    let elapsed = 0
    let attempts = 0
    while (elapsed < 16_000) {
      elapsed += ninaPollDelayFor(attempts)
      attempts += 1
    }
    expect(elapsed - 16_000).toBeLessThanOrEqual(NINA_TURN_POLL_INTERVALS_MS.mid)
    /* …without hammering. A dozen or so requests, not a hundred. */
    expect(attempts).toBeLessThan(14)
  })

  it('gives up exactly where the server declares the turn dead', () => {
    /* They are the same number on purpose: the poll that gives up is the poll that has already
     * been told the row is stale, so the notice it raises is a fact and not a timeout. */
    expect(NINA_TURN_POLL_GIVE_UP_MS).toBe(NINA_TURN_STALE_MS)
  })

  it('does not stop asking before a healthy turn could possibly have finished', () => {
    /* The failure this guards: someone tunes NINA_TURN_BUDGET up and the client starts calling a
     * working turn dead. 45 s of model budget plus loads and inserts must fit inside 90 s. */
    expect(NINA_TURN_STALE_MS).toBeGreaterThan(NINA_TURN_BUDGET.overall + 20_000)
  })

  it('keeps every FOLLOW-UP link inside what is left of the background budget', () => {
    /*
     * One link is a turn plus a distillation. The inequality is about the CHAINED links only, and
     * it is `runNinaBackgroundTurn`'s own guard written as arithmetic:
     *
     *     if (Date.now() - startedAtMs >= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall)
     *
     * The FIRST link is not counted, because nothing gates it on this budget — `runNinaTurn`
     * bounds itself with NINA_TURN_BUDGET and the response went out before it started.
     *
     * Branch A: 2 * 70_000 = 140_000 <= 240_000 - 45_000 = 195_000.
     * Branch B: 0            <=  45_000 - 45_000 =       0.
     *
     * This is the tripwire for phase 2's probe failing and only ONE of the two literals moving.
     * Lower the budget to 45_000 and leave the chain at 2 and it reads 140_000 <= 0 and fails —
     * which is the dangerous direction: a chain that starts links the invocation cannot finish
     * spends $0.00 on tokens that get killed mid-flight and leaves a `pending` row for the sweep.
     */
    const perLink = NINA_TURN_BUDGET.overall + 25_000
    expect(NINA_TURN_CHAIN_MAX * perLink).toBeLessThanOrEqual(
      NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall,
    )
  })

  it('never claims a background budget smaller than one turn', () => {
    /* The other half of the pair, and it is what stops the budget being lowered ALONE into
     * something that cannot hold even the first link. Branch A: 240_000 >= 45_000. Branch B:
     * 45_000 >= 45_000, which is the exact statement "there is room for the turn and nothing
     * after it". */
    expect(NINA_BACKGROUND_BUDGET_MS).toBeGreaterThanOrEqual(NINA_TURN_BUDGET.overall)
  })
})

describe('ninaAwaitingByMessage', () => {
  it('is false for an empty conversation', () => {
    expect(ninaAwaitingByMessage(null, NOW)).toBe(false)
  })

  it('is false when the newest row is hers — she has answered', () => {
    expect(ninaAwaitingByMessage(row('nina', 1_000), NOW)).toBe(false)
  })

  it('is true when the newest row is his and it is fresh', () => {
    expect(ninaAwaitingByMessage(row('runner', 5_000), NOW)).toBe(true)
  })

  it('is FALSE for an old unanswered message, so an ancient screen does not poll forever', () => {
    /* The one that would have shipped as a bug: without the age bound, every load of a
     * conversation whose last word was his would start a 90 s poll, for ever. */
    expect(ninaAwaitingByMessage(row('runner', NINA_TURN_STALE_MS + 1), NOW)).toBe(false)
  })

  it('is exclusive at the boundary', () => {
    expect(ninaAwaitingByMessage(row('runner', NINA_TURN_STALE_MS), NOW)).toBe(false)
    expect(ninaAwaitingByMessage(row('runner', NINA_TURN_STALE_MS - 1), NOW)).toBe(true)
  })
})

describe('ninaFlightView', () => {
  it('reads the LAST row, because the page renders oldest first', () => {
    const view = ninaFlightView([row('runner', 5_000, 7), row('nina', 4_000, 8)], NOW)
    expect(view).toEqual({ awaiting: false, cursor: 8 })
  })

  it('carries the newest seq as the cursor even while awaiting', () => {
    const view = ninaFlightView([row('nina', 9_000, 11), row('runner', 2_000, 12)], NOW)
    expect(view).toEqual({ awaiting: true, cursor: 12 })
  })

  it('answers cursor 0 for an empty conversation — below every seq a bigserial can assign', () => {
    expect(ninaFlightView([], NOW)).toEqual({ awaiting: false, cursor: 0 })
  })
})
```

**Impact:** `npm test` gains 13 cases. Note the import of `NINA_TURN_BUDGET` from `./turn` — that is
a type-and-const import of a module that imports `server-only`, which `vitest.config.ts` aliases to
`tests/support/serverOnlyStub.ts`; `lib/nina/turn.test.ts` already imports the same module the same
way, so no new machinery is needed.

---

### Step 3: Export the one `source → status` map

**File:** `lib/nina/gateway.ts:418`
**Change:** `const STATUS_BY_SOURCE` becomes `export const STATUS_BY_SOURCE`. `chatturn.ts` closes a
chat turn with the same three-line mapping `dbNinaTurnStore` uses, and the file's own comment says
that map "lives at the single write site, which is the only place that can drift" — so the answer to
a second reader is to export it, not to copy it.

**Code:**

```ts
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
 *
 * ── EXPORTED, BECAUSE THERE ARE NOW TWO WRITE SITES AND STILL ONE MAP (F36 R6) ────────────────
 * `lib/nina/chatturn.ts` closes a background chat turn by UPDATING a row it opened before the model
 * was called, rather than INSERTing one after. It needs the identical translation, and the
 * paragraph above is the argument for handing it this constant instead of letting it spell a second
 * one: the drift this map exists to prevent is exactly what a copy would reintroduce.
 */
export const STATUS_BY_SOURCE = {
  llm: 'ok',
  llm_repair: 'repaired',
  unavailable: 'failed',
} as const satisfies Record<NinaTurnSource, NinaTurnStatus>
```

**Impact:** None at runtime. `dbNinaTurnStore` below it is unchanged.

---

### Step 4: The messages-after-a-cursor read

**File:** `lib/nina/queries.ts` — insert immediately after `listNinaMessages` ends at `:907`
**Change:** One indexed read the poll needs and no existing function provides.

**Code:**

```ts
/**
 * **The poll's read (F36 R6): everything in one session newer than a `seq` the client already
 * holds, oldest first.**
 *
 * ── WHY A CURSOR AND NOT A RE-READ OF THE WHOLE WINDOW ────────────────────────────────────────
 * `ChatScreen` polls this every 1.5–4 s while a turn is in flight, and it needs exactly the rows it
 * does not have — because those rows are then handed to `planReveal`, which staggers them. Handing
 * back the whole 200-row window instead would mean the client diffing it, and `mergeServerMessages`
 * (the diff it already has) deliberately delivers everything in ONE frame. That is correct for a
 * push-driven refresh and wrong here: it would collapse RU-5's four-bubble reveal into a single
 * paint, which is the exact inversion `ChatScreen`'s header spends a paragraph forbidding.
 *
 * `seq` is a `bigserial` and therefore a total order Postgres assigns (invariant 6), so "> cursor"
 * is a strict, gap-tolerant cursor: a row inserted concurrently gets a higher `seq` and is simply
 * on the next poll.
 *
 * `limit` is a safety rail, not a page size. A turn emits at most `MAX_BUBBLES` (4) and a burst can
 * add a handful of his own rows, so 50 is far past anything a single poll can legitimately see; a
 * poll that hits it is a poll whose caller lost its cursor.
 *
 * The `user_id` predicate stays alongside the session predicate, exactly as `messageScope` requires
 * (invariant 3): a forged `sessionId` from a client comes back as `[]`, never as somebody else's
 * conversation.
 */
export async function listNinaMessagesAfter(
  userId: string,
  opts: { sessionId: string; afterSeq: number; limit?: number },
): Promise<NinaMessageRow[]> {
  return db
    .select(messageColumns)
    .from(ninaMessages)
    .where(and(messageScope(userId, opts.sessionId), gt(ninaMessages.seq, opts.afterSeq)))
    .orderBy(asc(ninaMessages.seq))
    .limit(opts.limit ?? 50)
}
```

**Impact:** `lib/nina/queries.ts:1-14` imports `and, asc, desc, eq, gte, inArray, isNotNull, isNull,
max, or, sql, type SQL` (verified verbatim against the shipped file) — **`gt` is not among them and
must be added** (alphabetically, between `eq` and `gte`). `gte` is the wrong operator here: the
cursor is exclusive, because the client already holds the row at `afterSeq`. `asc`, `and` and
`messageColumns` are all already in scope — note `messageColumns` is a module-private `const`
(`:485`), which is exactly why this function belongs inside this file rather than beside the poll.

> **COLLISION, RECONCILED: phase 6 edits this same import block.** Phase 6's Step 1 adds `exists`
> and `ne` for its `removeNinaSession` purge, and its plan spells the block out as a full
> replacement — which, written independently, would have dropped this phase's `gt` (or been
> dropped by it, depending on landing order). Neither phase depends on the other, so either order
> is possible.
>
> **Both plans now specify the SAME merged list. Write exactly this, whichever phase lands first;
> the other then finds its own symbol already present and changes nothing:**
>
> ```ts
> import {
>   and, asc, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, max, ne, or, sql, type SQL,
> } from 'drizzle-orm'
> ```
>
> (Spell it one-per-line as the file already does.) An unused import fails `npm run lint`, so if
> **this** phase lands first, add `gt` only and leave `exists`/`ne` to phase 6; if phase 6 lands
> first, add `gt` to what it left. The merged list above is the destination, not a licence to
> import a symbol the file does not yet use. The two phases touch disjoint FUNCTIONS in this file
> (`removeNinaSession` at `:803-834` versus a new function after `:907`), so the import block is
> the only shared region.

---

### Step 5: The chat turn's claim on `nina_turns`

**File:** `lib/nina/chatturn.ts` (new)
**Change:** The durable marker that answers three questions with one row — *is she still answering*,
*may a second send start a second model call*, and *did this turn die*. It is `lib/nina/imagejobs.ts`
transposed one `kind` over, and deliberately so: that lifecycle is shipped, proven, and already
uses `status='pending'` + `error_code`-as-phase + a stale sweep on this exact table.

**No migration and no schema change.** `nina_turns` already carries `kind='chat'` (written today by
`dbNinaTurnStore`), `status`, `error_code`-as-phase and `args jsonb`. Nothing counts chat turns —
`countNinaTurnsSince` is called only with `'image'` (`lib/nina/imagejobs.ts:81`) — and every image
read filters `kind='image'`, so a `pending` chat row is invisible to phases 1, 2 and 4.

**Code:**

```ts
import 'server-only'

import { and, desc, eq, lt } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'

import { STATUS_BY_SOURCE } from './gateway'
import { insertNinaTurn } from './queries'
import { ninaModel, type NinaTurnSource, type NinaTurnStore } from './turn'
import { NINA_TURN_STALE_MS } from './turnflight'

/**
 * **The chat turn's life on `nina_turns`, once the turn stopped happening inside the request that
 * asked for it (F36 R6).**
 *
 * ── WHY A ROW AT ALL, WHEN "THE NEWEST MESSAGE IS HIS" ALREADY SAYS SHE IS THINKING ───────────
 * Because that predicate answers one of the three questions and this row answers all three.
 *
 *   1. *Is she still answering?* — the predicate answers it, and `ninaAwaitingByMessage` is exactly
 *      it. But it cannot tell a turn that is running from a turn that died four seconds in.
 *   2. *May this send start a model call?* — it cannot answer this at all. Without a claim, a
 *      three-message burst ("eh" / "nina" / "gimana", which is how this app is actually used)
 *      starts three concurrent turns, spends three times the money, and paints up to twelve
 *      bubbles. The claim makes the second and third sends free: they persist, they return, and the
 *      turn already running picks them up (see `runNinaBackgroundTurn`'s chain).
 *   3. *Did it die?* — a sweep needs something to claim exactly once, or two tabs rendering at the
 *      same moment both "recover" the same turn. A conditional UPDATE on a row is the repo's
 *      existing answer to that, and it is `sweepStaleNinaImageJobs`'s answer verbatim.
 *
 * ── WHY `nina_turns` AND NOT A NINTH TABLE ────────────────────────────────────────────────────
 * `lib/nina/imagejobs.ts`'s header already argued this and the argument is unchanged: a chat turn IS
 * a model call Nina makes, the table exists for exactly one row per model call, and it already
 * carries `status`, `error_code`, `latency_ms`, `input_tokens`, `output_tokens` and `tool_calls`.
 * The only thing that changes is WHEN the row is written: `dbNinaTurnStore` inserts it after the
 * call, and this module opens it before, so there is something to claim. **It is still one row per
 * turn** — see `ninaChatTurnStore`, which UPDATEs rather than INSERTs.
 *
 * ── PHASE, NOT STATUS ─────────────────────────────────────────────────────────────────────────
 * The same two-meanings-in-one-column convention `imagejobs.ts` documents. While `status='pending'`,
 * `error_code` is the phase: `'running'` (the model is being called) then `'persisting'` (the model
 * answered and her rows are going in). When `status` leaves `'pending'`, `error_code` is a failure
 * reason or NULL.
 */

export const CHAT_TURN_PHASE_RUNNING = 'running'
export const CHAT_TURN_PHASE_PERSISTING = 'persisting'

const PENDING_PHASES: readonly string[] = [CHAT_TURN_PHASE_RUNNING, CHAT_TURN_PHASE_PERSISTING]

/**
 * What the row carries in `args` for a chat turn. **`nina_turns.args` is untyped `jsonb` on
 * purpose** — the schema's own words, "this table must not become the thing phase 12 has to migrate
 * to add a tenth field to its own job shape" — and the same latitude covers this shape. It is
 * written for the sweep and for a human reading the ledger; nothing renders it. Phase 4's job pages
 * read `args` only on `kind='image'` rows, so they never see this.
 */
export interface NinaChatTurnArgs {
  sessionId: string
  /** The `nina_messages.id` this turn is answering. */
  runnerMessageId: string
  /** 0 for the turn a send started; 1 and 2 for chained follow-ups. */
  depth: number
}

export interface PendingNinaChatTurn {
  id: string
  createdAt: Date
  phase: string
}

/**
 * The live claim for one session, or null. **Returns an EXPIRED pending row too** — the caller
 * applies `NINA_TURN_STALE_MS` and decides whether to sweep it, because "there is a dead row here"
 * and "there is no row here" call for different things.
 *
 * `desc(createdAt) limit 1`: there is at most one pending chat row per session by construction, and
 * taking the newest is the correct degradation if the accepted race in `openNinaChatTurn` ever
 * produced two.
 */
export async function getPendingNinaChatTurn(
  userId: string,
  sessionId: string,
): Promise<PendingNinaChatTurn | null> {
  const rows = await db
    .select({
      id: ninaTurns.id,
      createdAt: ninaTurns.createdAt,
      errorCode: ninaTurns.errorCode,
      args: ninaTurns.args,
    })
    .from(ninaTurns)
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, 'chat'), eq(ninaTurns.status, 'pending')),
    )
    .orderBy(desc(ninaTurns.createdAt))
    .limit(8)

  for (const row of rows) {
    const args = row.args as Partial<NinaChatTurnArgs> | null
    if (args?.sessionId !== sessionId) continue
    if (row.errorCode == null || !PENDING_PHASES.includes(row.errorCode)) continue
    return { id: row.id, createdAt: row.createdAt, phase: row.errorCode }
  }
  return null
}

/**
 * Open the claim, or refuse because one is already live for this session.
 *
 * Returns the new `nina_turns.id`, or **null when a live turn already owns this conversation** —
 * which is not a failure and must not be reported as one: his message IS saved, and the turn that
 * is already running will chain onto it.
 *
 * ── THE RACE, NAMED, PRICED, AND ACCEPTED PERMANENTLY ─────────────────────────────────────────
 * This is a read-then-write and there is no unique index to make it atomic. **That is a settled
 * decision, not a deferral.** An earlier draft of this plan pointed at "phase 6's migration" —
 * there is no such thing: phase 6 deliberately generates NO migration (its own contract argues an
 * FK cannot tell a deleted sentence from a deleted conversation, and cannot be added against a
 * database that already holds dangling pointers), and **no phase in this set generates one**.
 * `npm run db:check` must be clean at the end of every phase and `drizzle/` must gain no file.
 * See the plan index's *Decisions*.
 *
 * So the race is priced instead. Next dispatches Server Actions **one at a time per client** (its
 * own Server Actions guide, quoted in `sendNinaMessage`'s header), so the ordinary double-text
 * cannot race at all: the second send waits for the first to return. The window is two DIFFERENT
 * clients — two tabs, or a phone and a laptop — sending inside the same ~50 ms. For one user with
 * one toy, that is rare enough to name and cheap enough to lose.
 *
 * The blast radius of losing it is that she answers twice. Both replies are real replies to real
 * messages, nothing is fabricated (invariant 7), and the second turn's context contains the first
 * message, so the conversation stays coherent. A duplicate, not a corruption. **Do not "fix" it
 * with a lock table, and do not add an index to this table without re-opening the whole
 * no-migration decision** — the index would be the set's only migration, and the reason there are
 * none is that every one of them was found to cost more than the thing it prevented.
 */
export async function openNinaChatTurn(
  userId: string,
  args: NinaChatTurnArgs,
): Promise<string | null> {
  const live = await getPendingNinaChatTurn(userId, args.sessionId)
  if (live !== null && Date.now() - live.createdAt.getTime() < NINA_TURN_STALE_MS) return null

  return insertNinaTurn(userId, {
    kind: 'chat',
    /* Stamped at open, not at close, for `openNinaImageJob`'s reason: a row that failed should
     * still say which model it was reaching for. `ninaChatTurnStore` overwrites it with the model
     * the call actually used, which is the same string unless the env changed mid-turn. */
    model: ninaModel(),
    status: 'pending',
    errorCode: CHAT_TURN_PHASE_RUNNING,
    args,
  })
}

/**
 * **The `NinaTurnStore` `runNinaTurn` is handed for a background chat turn, so the pre-opened row
 * is UPDATED instead of a second row being INSERTed.**
 *
 * Injected through `{ ...productionDeps(), store: ninaChatTurnStore(turnId) }` — the same one-word
 * override `sendNinaMessage` already uses for `toolSet`, and the reason `productionDeps` is
 * exported at all (`lib/nina/turn.ts:832`). Nothing in `turn.ts` changes.
 *
 * ── IT DOES NOT CLOSE THE ROW, AND THAT IS THE WHOLE POINT ────────────────────────────────────
 * `runNinaTurn` calls `store.record` the moment the model answers — BEFORE her bubbles are
 * persisted. If this set `status='ok'` there, the claim would drop while the screen still had
 * nothing to show, and the very next poll would report "not in flight, no new rows" and raise the
 * 'no-reply' notice for a reply that was one insert away. So this records the METRICS and advances
 * the phase to `'persisting'`, and `closeNinaChatTurn` — called after the bubbles land — is what
 * ends the turn. Two writes, one row, and no window in which the truth is unreadable.
 */
export function ninaChatTurnStore(turnId: string): NinaTurnStore {
  return {
    async record(userId, row) {
      await db
        .update(ninaTurns)
        .set({
          model: row.model,
          promptVersion: row.promptVersion,
          tuningRevision: row.tuningRevision,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          toolCalls: row.toolCalls,
          latencyMs: row.latencyMs,
          errorCode: CHAT_TURN_PHASE_PERSISTING,
        })
        .where(
          and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, turnId), eq(ninaTurns.kind, 'chat')),
        )
    },
  }
}

/**
 * End the turn. Called after her rows are in — or from the background task's `finally`, so a throw
 * anywhere between the model answering and the insert committing still leaves a closed row with a
 * reason on it instead of a `pending` row for the sweep to find.
 *
 * `source` is `NinaTurnSource` and `STATUS_BY_SOURCE` is `gateway.ts`'s one map (see its header).
 * `failure` overrides it for the case the model answered fine and OUR write threw: `'ok'` would be
 * a lie and `'unavailable'` would blame the vendor.
 */
export async function closeNinaChatTurn(
  userId: string,
  turnId: string,
  source: NinaTurnSource,
  failure?: string,
): Promise<void> {
  const status = failure != null ? 'failed' : STATUS_BY_SOURCE[source]
  const errorCode =
    failure != null ? failure : source === 'unavailable' ? 'unavailable' : null

  await db
    .update(ninaTurns)
    .set({ status, errorCode })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, turnId),
        eq(ninaTurns.kind, 'chat'),
        /* Idempotent: a row somebody else already closed is left exactly as they closed it. */
        eq(ninaTurns.status, 'pending'),
      ),
    )
}

/**
 * **The recovery mechanism, and it is the whole of "a runner message with no reply must not be
 * silently orphaned".**
 *
 * A chat turn still `pending` after `NINA_TURN_STALE_MS` is a turn whose process is gone: the
 * instance was killed, the segment's ceiling cut it, or the persist threw somewhere the `finally`
 * could not reach. This closes it `failed`/`stale`, and that single UPDATE is what makes the state
 * legible: the ledger says a turn died and when, the poll stops reporting it as in flight, and the
 * next send is free to open a new one.
 *
 * ── WHAT IT DELIBERATELY DOES *NOT* DO, AND WHY ───────────────────────────────────────────────
 * It does not retry, and it does not write an apology bubble. `sweepStaleNinaImageJobs` does both —
 * correctly, for images, because `lib/nina/imagefail.ts`'s apologies are the plan's *sanctioned*
 * in-character strings (invariant 7) and because an image job's arguments are in the row so a retry
 * is exactly reproducible. Neither holds here. Any sentence this code put in Nina's mouth about a
 * turn that failed would be app-authored prose rendered as her bubble, which invariant 7 and
 * `ChatScreen`'s own header forbid in as many words; and an automatic retry on a render path is a
 * model call the runner did not ask for, on a path that just proved it can die, with no bound on
 * how often a page load can fire it.
 *
 * **The recovery he actually gets is better than either.** His message was persisted before the
 * model was ever called — that ordering is `sendNinaMessage`'s documented contract and this phase
 * preserves it — so nothing is lost. The screen tells him plainly ('no-reply', whose existing copy
 * already reads *"Your message is saved — send another and she will pick it up"*), and that
 * sentence is now literally true rather than nearly true: `loadNinaContext` reads the session's
 * message window, so his unanswered message is in the very next turn's context. One tap recovers
 * it, and the tap is his, so no money moves without him.
 *
 * Called from `sendNinaMessage` (before opening a turn — the cheapest possible place, and the exact
 * moment it matters) and from `pollNinaReply` only when the poll has actually seen an expired
 * pending row. It is NOT called from `app/nina/page.tsx`: that file is phase 2's this cycle, and
 * putting it there would buy nothing the send does not already buy.
 */
export async function sweepStaleNinaChatTurns(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const olderThan = new Date(now.getTime() - NINA_TURN_STALE_MS)

  const closed = await db
    .update(ninaTurns)
    .set({ status: 'failed', errorCode: 'stale' })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'chat'),
        eq(ninaTurns.status, 'pending'),
        lt(ninaTurns.createdAt, olderThan),
      ),
    )
    .returning({ id: ninaTurns.id })

  if (closed.length > 0) {
    console.warn('[nina] swept dead chat turns', { userId, count: closed.length })
  }
  return closed.length
}
```

**Impact:** Add `lt` to this file's `drizzle-orm` import (`import { and, desc, eq, lt } from
'drizzle-orm'`). No other module changes. `insertNinaTurn` and `NinaTurnStore` are used exactly as
`imagejobs.ts` and `gateway.ts` use them.

---

### Step 6: The split — `sendNinaMessage` returns at STEP 2

**File:** `lib/nina/actions.ts`
**Change:** Three edits inside one file.

**6a. The result type** — replace `lib/nina/actions.ts:99-116`:

```ts
export interface SendNinaMessageResult {
  ok: boolean
  userMessageId: string | null
  /**
   * **The conversation his message actually landed in (F36 R6).**
   *
   * New, and the client genuinely cannot do without it: `input.sessionId` may be `null` — "he has
   * no sessions at all" is a real state — and in that case this action RESOLVES OR CREATES one. The
   * screen then has to poll for her reply, and a poll needs a session id. Before the split the
   * client never needed to know, because the bubbles came back in this same return value.
   *
   * Null iff `!ok`.
   */
  sessionId: string | null
  /**
   * `nina_messages.seq` of the runner's row — where `pollNinaReply` resumes from.
   *
   * A `seq` rather than an id because `seq` is a `bigserial` Postgres assigns, so it is a total
   * order and `> cursor` is a complete, gap-tolerant description of "everything I have not seen".
   * Null iff `!ok`.
   */
  cursor: number | null
  /**
   * The `nina_turns.id` of the background turn this send started, or **null when a turn was already
   * running for this conversation** — which is a normal outcome, not a failure. His message is
   * saved either way; the turn already in flight chains onto it (see `runNinaBackgroundTurn`).
   *
   * The client does not branch on it. It is here because a null makes a log line and a test able to
   * say which of the two happened, and phase 7's integration test drives its assertions off it.
   */
  turnId: string | null
}

const REFUSED: SendNinaMessageResult = {
  ok: false,
  userMessageId: null,
  sessionId: null,
  cursor: null,
  turnId: null,
}
```

`SentBubble` (`:75-97`) is UNCHANGED and stays exported — `pollNinaReply` returns it, so phase 4's
and phase 7's references to that type still resolve.

**6b. Capture the `seq`** — replace `lib/nina/actions.ts:464-478`:

```ts
  let runnerMessageId: string
  let runnerSeq: number
  try {
    const [row] = await insertNinaMessages(
      userId,
      [{ role: 'runner', body: text, replyToId: quotedRow?.id ?? null, runId }],
      sessionId,
    )
    if (row == null) throw new Error('insertNinaMessages returned no row')
    runnerMessageId = row.id
    /* F36 R6. The poll cursor, and it costs nothing: `insertNinaMessages` already `returning`s the
     * whole `messageColumns` projection, and `seq` is in it. */
    runnerSeq = row.seq
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }
```

**6c. The split itself** — replace everything from `lib/nina/actions.ts:538` (the `/*` opening the
STEP 2 comment) through `:751` (the final `return`) with the following. Steps 2–7 are unchanged in
content; they have moved wholesale into `runNinaBackgroundTurn`, below.

```ts
  /*
   * ── STEP 1c — THE CLAIM, AND THE LINE THIS ACTION NOW RETURNS ON (F36 R6) ────────────────────
   *
   * Everything above this comment is unchanged and still synchronous, and that is the requirement
   * rather than an accident. R6 is "i send the message, it quickly shown that the message is sent";
   * what makes that honest is that his row, his photos and his attached run are all committed
   * before the word "sent" appears. Everything below — the context load, the 13-45 s model call,
   * the persist of her bubbles, the distillation, the auto-title — happens after the response is
   * out, on the server, whether or not the browser is still there.
   *
   * ── THE WRITE ORDER THIS FILE'S HEADER CALLS PART OF THE CONTRACT IS PRESERVED, AND THE SPLIT
   *    IS WHAT MAKES IT OBVIOUS ─────────────────────────────────────────────────────────────────
   * The header: *"`loadNinaContext` reads the conversation window out of `nina_messages`, so a
   * message not yet written is a message SHE CANNOT SEE. Insert first, then build the context."*
   * The cut is placed exactly between the insert and the context load, so the ordering is no longer
   * a convention two hundred lines apart — it is the boundary between the function that returns and
   * the function that thinks.
   *
   * ── THE SWEEP RUNS HERE, WHICH IS THE CHEAPEST HONEST PLACE FOR IT ──────────────────────────
   * One conditional UPDATE against an indexed predicate, on a path that is already writing rows. A
   * turn that died is closed at the exact moment its deadness starts to matter — the moment he
   * sends again — and `openNinaChatTurn` below is then free to open a new claim. See
   * `sweepStaleNinaChatTurns` for why it does not retry and does not apologise.
   */
  try {
    await sweepStaleNinaChatTurns(userId)
  } catch (cause) {
    /* A sweep that could not run must never cost him a send. The worst case is that
     * `openNinaChatTurn` refuses because a dead claim is still standing, and his message is picked
     * up by his next send — which is the same outcome the notice already promises. */
    console.warn('[nina] chat turn sweep failed', { error: String(cause) })
  }

  let turnId: string | null = null
  try {
    turnId = await openNinaChatTurn(userId, { sessionId, runnerMessageId, depth: 0 })
  } catch (cause) {
    console.warn('[nina] could not open a chat turn', { error: String(cause) })
  }

  /*
   * `turnId === null` is the ORDINARY burst case: a turn is already running for this conversation,
   * so this message needs no second model call — the running turn chains onto it when it finishes.
   * It is also what a failed open degrades to, and the two want the same handling, because in both
   * of them the honest state is "his message is saved and something will answer it or the sweep
   * will call it dead". Returning `ok: false` here would mark a perfectly persisted message as
   * failed on screen, which is the one thing R6 exists to stop.
   */
  if (turnId !== null) {
    startNinaBackgroundTurn({
      userId,
      sessionId,
      turnId,
      runnerMessageId,
      runnerText: text.length > 0 ? text : null,
      imageDescriptions: [
        ...images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
        ...(attached === null ? [] : [attached.description ?? NINA_DESCRIPTION_UNAVAILABLE]),
      ],
      quotedRow,
      attachedRunId: runId,
      depth: 0,
      startedAtMs: Date.now(),
    })
  }

  return { ok: true, userMessageId: runnerMessageId, sessionId, cursor: runnerSeq, turnId }
}

/**
 * **The seam phase 2 owns, isolated to three lines so consuming its convention is a three-line
 * change and not a rewrite (F36 R6).**
 *
 * `after()` is already this module's convention for work that must outlive the response — STEP 6's
 * distillation and STEP 7's auto-title both use it, and both note that it "throws E468 outside a
 * request scope, which is exactly why the CALL is here in the `'use server'` module". The same
 * reasoning applies at four hundred times the duration, and Next 16.3.1's `after` reference is
 * explicit that it is the right primitive: *"`after` allows you to schedule work to be executed
 * after a response is finished"*, it is supported in Server Functions, and *"`after` will run for
 * the platform's default or configured max duration of your route"* — which on Vercel means the
 * invocation is held open by `waitUntil` until the callback settles. **That is the whole of "the
 * app does not care whether user close the app or not": the wall clock belongs to the server.**
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN INLINE `after()` ───────────────────────────────────────
 * Phase 2 establishes this repo's convention for durable server-owned background work, and its plan
 * names two candidates: `after()`, or a fetch to an internal route so the remaining wall clock is a
 * fresh invocation's. **If phase 2 chose the route hop, replace this body and nothing else** — the
 * input type, the caller, the chain and the whole client half are unaffected. If phase 2's probe
 * failed and the ceiling is really 60 s, this body is still correct; what changes is
 * `NINA_BACKGROUND_BUDGET_MS` and `NINA_TURN_CHAIN_MAX` in `lib/nina/turnflight.ts`, and the two
 * values are documented there.
 *
 * ── NESTED `after()` IS SANCTIONED, WHICH MATTERS MORE THAN IT LOOKS ─────────────────────────
 * The turn below can call `generate_image` or `set_avatar`, and `fireNinaImageDispatch` fires its
 * doorbell inside its own `after()`. That is now an `after()` inside an `after()`. Next's reference
 * sanctions it in as many words — *"`after` can be nested inside other `after` calls"* — so the
 * image path keeps working through the split with no change to phase 1's or phase 2's files.
 */
function startNinaBackgroundTurn(input: NinaBackgroundTurnInput): void {
  after(() => runNinaBackgroundTurn(input))
}

/**
 * Everything `sendNinaMessage` used to do between STEP 2 and STEP 7, as one value.
 *
 * `quotedRow` travels whole rather than as a pre-built `QuotedMessageInput`, because the
 * `sentAtLabel` half of that object is read out of `context.conversation.window` — which does not
 * exist until the background task loads it (invariant 3: this file does not format an instant).
 *
 * `imageDescriptions` is precomputed by the caller so the verified ticket claims and the resolved
 * attachment do not have to travel; they are the only thing the turn wanted from them.
 */
export interface NinaBackgroundTurnInput {
  userId: string
  sessionId: string
  turnId: string
  runnerMessageId: string
  runnerText: string | null
  imageDescriptions: readonly string[]
  quotedRow: NinaMessageRow | null
  attachedRunId: string | null
  /** 0 for the turn a send started; 1 and 2 for chained follow-ups. */
  depth: number
  /** `Date.now()` at the send, so every link of a chain shares one wall-clock budget. */
  startedAtMs: number
}

/**
 * **The turn, after the response has gone out.**
 *
 * Steps 2 through 7 are the ones `sendNinaMessage` used to run inline, moved here verbatim in
 * content and in order. What is new is the bookkeeping around them: the claim opened before the
 * call is closed after her rows land, a `finally` guarantees the row never stays `pending` because
 * of a throw we could see, and a bounded chain answers messages that arrived while this was working.
 *
 * ── IT NEVER THROWS ─────────────────────────────────────────────────────────────────────────
 * There is nobody to throw at. The response left thirteen to forty-five seconds ago. Every failure
 * mode ends in a closed `nina_turns` row with a reason on it and a warning in the log, which is
 * what the ledger is for.
 */
async function runNinaBackgroundTurn(input: NinaBackgroundTurnInput): Promise<void> {
  const { userId, sessionId, turnId, runnerMessageId } = input
  let source: NinaTurnSource = 'unavailable'
  let failure: string | undefined = 'crashed'
  let closed = false
  let context: NinaContext | null = null
  let relationship: NinaRelationship | null = null
  let bubbles: SentBubble[] = []

  try {
    /*
     * STEP 2 — the two reads, concurrently. `loadNinaContext` reads the recent-20 window and
     * `loadRunHistory` reads the whole reviewed history; both are one `db.batch` over the same
     * bounded table, and running them together makes the duplication cost one round trip of wall
     * clock instead of two. `getReviewedRunsWithChildren` therefore runs twice per turn, which is
     * ACCEPTED at this size: ~200 rows a year, one user. The clean fix is one optional parameter on
     * `loadNinaContext` and it should move together with `lib/insights/load.ts` and
     * `recomputeRecords`, in one card, because all three re-read the same history and all three
     * stop being fine at the same moment.
     *
     * **This runs AFTER his row is committed and that has not changed** — see STEP 1c's note.
     */
    const [loadedContext, history, tuning] = await Promise.all([
      loadNinaContext(userId, sessionId, dbNinaSourceGateway),
      dbNinaToolGateway.loadRunHistory(userId),
      /* THE TUNING, read LIVE on every turn with no cache — which is what makes a slider on
       * `/admin/nina` immediate. Third in an existing `Promise.all` on purpose: one indexed
       * single-row read against a connection this turn is opening anyway. */
      readNinaTuning(userId),
    ])
    context = loadedContext
    relationship = tuning.relationship

    /*
     * `sentAtLabel` comes from the context window when the quoted message is in it, and is null
     * when it is not. That is invariant 3 rather than laziness: `'Tue 2 Sep 07:14'` is spelled by
     * `conversationFacts`, and formatting a second one here would make this the app's second
     * authority on how an instant is written.
     */
    const target = input.quotedRow
    const quoted: QuotedMessageInput | null =
      target === null
        ? null
        : {
            id: target.id,
            mine: target.role === 'runner',
            text: target.body,
            sentAtLabel:
              loadedContext.conversation.window.find((turn) => turn.id === target.id)
                ?.sentAtLabel ?? null,
          }

    /* STEP 3 — the turn. 13–45 s. Never throws for a model problem.
     *
     * INVARIANT 5 IS ENFORCED BY THIS ARGUMENT AND NOWHERE ELSE. `imageDescriptions` is TEXT.
     * There is no code path in this file that puts an image part into `runNinaTurn`, and there must
     * never be one: `glm-5.3` answers 200 and silently drops an image block, so sending one is not
     * an error, it is a lie.
     *
     * `toolSet` is `NINA_FULL_TOOL_SET` and `store` is the chat turn's own — the same one-word
     * override idiom, twice. `ninaChatTurnStore` UPDATEs the row opened before the call instead of
     * INSERTing a second one, so `nina_turns` still holds exactly one row per turn; see its header
     * for why it advances the phase rather than closing the row.
     */
    const result = await runNinaTurn(
      {
        userId,
        context: loadedContext,
        tuning,
        history,
        sourceMessageId: runnerMessageId,
        runnerText: input.runnerText,
        imageDescriptions: input.imageDescriptions,
        quoted,
        attachedRunId: input.attachedRunId,
      },
      { ...productionDeps(), toolSet: NINA_FULL_TOOL_SET, store: ninaChatTurnStore(turnId) },
    )
    source = result.source

    if (result.payload == null) {
      /*
       * She could not answer, but HE still spoke, and R4 is "every single thing". His message is
       * persisted with an id, so distilling it is both possible and the honest reading of the
       * requirement — a turn where she failed is not a turn where he said nothing.
       *
       * **No bubble is written.** `runNinaTurn`'s silence is silence; app-authored prose in her
       * mouth is what invariant 7 and `ChatScreen`'s header forbid. The screen says so in its own
       * voice, through the 'no-reply' notice, once the poll sees the turn close with nothing new.
       */
      failure = undefined
      await closeNinaChatTurn(userId, turnId, source)
      closed = true
      await runNinaDistillation({
        userId,
        runnerText: input.runnerText ?? '',
        sourceMessageId: runnerMessageId,
        ninaBubbles: [],
        memoryWrites: [],
        context: loadedContext,
        relationship: tuning.relationship,
      })
      return
    }

    /*
     * STEP 4 — `replyToMessageId`, re-checked against rows this user owns. The model produced this
     * id, and a well-formed id is not proof of ownership (the Server Actions guide's own warning).
     * The context window she was given is the authoritative list of what she could legitimately be
     * answering, so it is also the cheapest check — no extra query.
     */
    const ownedIds = new Set(loadedContext.conversation.window.map((turn) => turn.id))
    const replyToId =
      result.payload.replyToMessageId != null && ownedIds.has(result.payload.replyToMessageId)
        ? result.payload.replyToMessageId
        : null

    /*
     * STEP 5 — one row per bubble (RU-5), in ONE multi-row `INSERT`.
     *
     * **Emission order comes free**, because Postgres evaluates `nextval` once per row in `VALUES`
     * order — the first bubble gets the lower `seq`, always. It is one round trip instead of four
     * and it is atomic, so a half-written four-bubble reply can no longer come from a partial
     * insert. `replyToId` goes on the FIRST bubble only: a four-bubble reply is one answer to one
     * message, and quoting the same message four times would render four identical quote headers.
     *
     * ── `turnId` IS NOW STAMPED, AND IT WAS NOT BEFORE ──────────────────────────────────────────
     * `nina_messages.turn_id`'s own schema comment says "Phase 3 stamps it onto every message the
     * turn emitted", and the analysis measured **0 of 48 rows carrying one** — because the row did
     * not exist until after the messages were written. Opening the turn first is what makes the
     * documented contract satisfiable, so it is satisfied here rather than left as a second gap.
     * Nothing renders it; it is the audit join, and the column carries no foreign key precisely so
     * that it can never block a delete.
     */
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        turnId,
        replyToId: index === 0 ? replyToId : null,
      })),
      /* The same session his message went into. She is answering in the conversation she was asked
       * in; there is no case in which a reply belongs anywhere else. */
      sessionId,
    )
    bubbles = rows.map((row) => ({ id: row.id, body: row.body, replyToId: row.replyToId }))

    /*
     * The claim drops HERE — after her rows are committed and not one statement earlier. The poll
     * asks two questions of the server ("is a turn in flight" and "is there anything after my
     * cursor"), and closing the claim before the rows exist would let a poll land in the gap and
     * read a true "no" to both, raising 'no-reply' for a reply that was mid-insert. See
     * `ninaChatTurnStore`'s header.
     */
    failure = undefined
    await closeNinaChatTurn(userId, turnId, source)
    closed = true

    /*
     * STEP 6 — the distillation (R4). AWAITED here rather than scheduled in a nested `after()`,
     * and the change is a simplification rather than a reversal. The original reason for `after()`
     * was that awaiting a 10-20 s model call would leave him "watching an idle screen after the
     * bubbles have landed" — but there is no screen waiting on this function at all any more; the
     * response went out before the turn even started. Both forms run inside the same segment budget
     * (`after` is the platform's `waitUntil`, not a new invocation), so nesting would buy nothing
     * and would make the ordering against the chain below unpredictable.
     *
     * `runTurnDistillation` never throws, so there is no `try` around it and nothing to swallow.
     */
    await runNinaDistillation({
      userId,
      runnerText: input.runnerText ?? '',
      sourceMessageId: runnerMessageId,
      ninaBubbles: bubbles.map((bubble) => bubble.body),
      memoryWrites: result.payload.memoryWrites ?? [],
      context: loadedContext,
      relationship: tuning.relationship,
    })

    /*
     * STEP 7 — the session's name (R3). **This exit and no other**: R3's trigger is "the first
     * interaction (user then nina)", and this is the only path on which both rows exist.
     * `titleNinaSessionIfNeeded` never throws and makes no call at all for a session that already
     * has a name; its idempotence is `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL`,
     * not this line's, so two racing tabs are already handled.
     */
    await titleNinaSessionIfNeeded(userId, sessionId)
  } catch (cause) {
    console.warn('[nina] background turn failed', { turnId, error: String(cause) })
  } finally {
    /*
     * The row must never be left `pending` by a throw we were in a position to see. If it is, the
     * only thing that closes it is the 90-second sweep — which is correct but slow, and the screen
     * spends that whole time showing a typing indicator for a turn that is already dead.
     * `closeNinaChatTurn`'s own `WHERE status = 'pending'` makes this a no-op when the happy path
     * already closed it, so the `closed` flag is belt to that brace rather than the guard itself.
     */
    if (!closed) {
      try {
        await closeNinaChatTurn(userId, turnId, source, failure ?? 'crashed')
      } catch (cause) {
        console.warn('[nina] could not close a chat turn', { turnId, error: String(cause) })
      }
    }
  }

  /*
   * ── THE CHAIN: MESSAGES THAT ARRIVED WHILE SHE WAS TYPING ────────────────────────────────────
   * This is the other half of `openNinaChatTurn` refusing a second claim. A burst — "eh", "nina",
   * "gimana", which is exactly how this app gets used — persists three rows and starts ONE turn.
   * The second and third messages would otherwise sit unanswered until he sent a fourth.
   *
   * So when this turn is done, it asks one indexed question: is the newest row in this conversation
   * his? If it is, it opens a fresh claim and runs one more turn for it. That turn's context
   * contains every message of the burst AND her reply to the first, so she answers the remainder
   * coherently instead of four times in parallel.
   *
   * BOUNDED TWICE, because an unbounded chain is a machine for spending money: by `depth` against
   * `NINA_TURN_CHAIN_MAX`, and by wall clock against `NINA_BACKGROUND_BUDGET_MS` measured from the
   * original send. The wall-clock bound is what makes this correct under BOTH of phase 2's
   * outcomes: with a 60 s ceiling the budget is exhausted after the first link and the chain simply
   * does not start, with no code change beyond the two literals `turnflight.ts` documents.
   *
   * Hitting either bound loses nothing. The unanswered messages are still in the database, still in
   * her next context window, and his next send starts a turn that sees all of them.
   */
  if (input.depth >= NINA_TURN_CHAIN_MAX) return
  if (Date.now() - input.startedAtMs >= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall) return

  try {
    const [newest] = await listNinaMessages(userId, { limit: 1, sessionId })
    if (newest == null || newest.role !== 'runner') return

    const nextTurnId = await openNinaChatTurn(userId, {
      sessionId,
      runnerMessageId: newest.id,
      depth: input.depth + 1,
    })
    if (nextTurnId === null) return

    /*
     * A DIRECT `await`, not another `after()`. We are already inside the background task's budget,
     * and nesting would add a scheduling hop without adding a second of wall clock —
     * `NINA_BACKGROUND_BUDGET_MS` is the segment's, not the callback's.
     *
     * `imageDescriptions: []` and `quotedRow: null` are correct rather than lossy. Those two inputs
     * describe what is attached to THIS message right now; the photographs themselves reach her
     * through `loadNinaContext`, which reads `nina_messages` joined to `nina_message_images` for
     * the whole window (see STEP 1b's note in `sendNinaMessage`). So she can still see a photo sent
     * mid-burst. A quote is genuinely absent: the runner armed it against a send that has already
     * been answered, and re-quoting it on a follow-up would put the same quote header on two turns.
     */
    await runNinaBackgroundTurn({
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
    })
  } catch (cause) {
    console.warn('[nina] chained turn failed', { turnId, error: String(cause) })
  }
}
```

**Impact:**
- `lib/nina/actions.ts`'s imports gain: `listNinaMessages` and `type NinaContext` are already
  imported (`NinaContext` as a type at `:10`); add `listNinaMessages` to the `'./queries'` import
  block at `:18-26`; add `import { NINA_TURN_BUDGET, productionDeps, runNinaTurn, type
  NinaTurnSource } from './turn'` (widening the existing `:32` import); add
  `import { closeNinaChatTurn, ninaChatTurnStore, openNinaChatTurn, sweepStaleNinaChatTurns } from
  './chatturn'`; add `import { NINA_BACKGROUND_BUDGET_MS, NINA_TURN_CHAIN_MAX,
  ninaAwaitingByMessage } from './turnflight'`.
- `scheduleDistillation` (`:913-931`) is **renamed to `runNinaDistillation`** and loses its
  `after()` wrapper — it is now called from inside the background task, which is already after the
  response. Replace its body with the plain `await runTurnDistillation({ … })` call it wraps today,
  keep every line of its docstring, and add: *"The `after()` that used to be here moved to
  `startNinaBackgroundTurn`, which now wraps the whole turn. Wrapping this again would be an
  `after()` inside an `after()` for no budget gain."* Its two call sites are both in
  `runNinaBackgroundTurn`.

  **It also gains the session-existence guard — Step 6d below. This phase owns that guard**,
  because this phase owns `runNinaDistillation` and the background runner it is called from.
- **The `runNinaTurn` payload-boundary guard stays green with no edit to
  `scripts/check-llm-payload-boundary.mjs` — and the REASON has been corrected against the real
  script, because an earlier draft got the mechanism wrong in a way that would mislead the next
  person to move this code.**

  The guard's engine (`:174–183`) is: for each walked file under `app`/`lib`/`components`,
  `if (guard.sanctioned.includes(path)) continue`, then
  `new RegExp(\`\\b${guard.symbol}\\s*\\(\`).test(source)` over the comment-stripped whole file.
  **Sanctioning is strictly PER-FILE, never per-callsite**, and `lib/nina/actions.ts` is in
  `runNinaTurn`'s sanctioned list (`:107`). So the guard is satisfied by *which file the call lives
  in*, full stop — **not** by `runNinaBackgroundTurn` being non-exported (the guard cannot see
  export status) and not by anything about its name.

  That still makes keeping the background runner inside `lib/nina/actions.ts` the right call, for
  the reason the guard exists: a new module would be a new file calling `runNinaTurn` from outside
  the sanctioned set, and the honest response would be to add it to the table rather than to route
  around it. `lib/nina/chatturn.ts` deliberately contains no call to `runNinaTurn`, which is why it
  can be a separate module.

  Two related facts, verified and worth knowing before anyone leans harder on this guard:
  `runNinaBackgroundTurn` itself has **no** `GUARDED_CALLS` entry, so nothing stops a future file
  from calling it; and `runTurnDistillation` is **not** a guarded symbol either (only
  `distillNinaMemory` is, and `runTurnDistillation` is its unguarded public wrapper). Neither is
  this phase's to fix — both are pre-existing holes in the shipped table — but neither should be
  mistaken for protection this phase is relying on.
- A `'use server'` module may export only async functions: `startNinaBackgroundTurn`,
  `runNinaBackgroundTurn` and `runNinaDistillation` are **not exported**, and
  `NinaBackgroundTurnInput` is a type (erased), so the rule holds.

---

### Step 6d: Abandon a background turn whose session has been deleted

**File:** `lib/nina/actions.ts` — `runNinaBackgroundTurn` (the persist point, and
`runNinaDistillation`'s two call sites)
**Change:** one owner-scoped existence check, and one early return.

**This step exists because phase 6 found the bug and it lands in this phase's files.** Phase 6
purges a deleted session's distilled memory in the same transaction as the delete. Its handoff
names the hole that reopens immediately afterwards, and this phase is what widens it:

> *"Phase 3 moves `runTurnDistillation` out of `after()` and into a durable background task. That
> lengthens an existing window: if the runner deletes a session while a turn's distillation is
> still in flight, the distillation writes `nina_memory_facts` / `nina_memory_slots` rows stamped
> with a `source_message_id` that no longer exists — re-creating exactly the orphan class this
> phase purges."*

The race is real today (the `after()` window is short but non-zero) and this phase takes it from
milliseconds to **up to 240 seconds**, which is the difference between a curiosity and a thing that
will actually happen: a turn is 13–45 s and a chain is up to three of them, and deleting a
conversation you have just finished talking in is an entirely ordinary gesture.

**This phase does NOT depend on phase 6 and must not be made to.** The guard is correct on its own
terms with or without phase 6: writing Nina's bubbles, her distilled facts, or a session title into
a conversation the runner has deleted is wrong regardless of who cleans up afterwards. Phase 6's
`npm run nina:memory-reap` remains the standing backstop for whatever slips through — the two are
belt and braces, and neither is a substitute for the other.

**Where the check goes, and why there.** `nina_messages.session_id` is `NOT NULL` with an
`ON DELETE CASCADE` to `nina_chat_sessions`, so a deleted session takes the runner's message with
it. `insertNinaMessages(userId, rows, sessionId)` already returns `[]` rather than throwing for a
session that is not the caller's — including one that no longer exists — so the *bubble* write is
already safe. What is not safe is everything that follows it: the distillation writes rows keyed to
a `source_message_id` that is gone, and `titleNinaSessionIfNeeded` names a session that no longer
exists. So the guard goes immediately after the model returns and before anything is persisted, and
again is unnecessary anywhere else.

**Code — insert immediately before `STEP 5`'s `insertNinaMessages` call, and take the same branch
in the `result.payload == null` arm before its `runNinaDistillation`:**

```ts
    /*
     * ── THE SESSION MAY HAVE BEEN DELETED WHILE SHE WAS THINKING (phase 6's handoff) ──────────
     * Up to `NINA_BACKGROUND_BUDGET_MS` has passed since the response went out, and
     * `removeNinaChatSession` is one tap away in the sidebar the whole time. Every write below is
     * a write into a conversation that may no longer exist:
     *
     *   · her bubbles — `insertNinaMessages` already degrades to `[]` here, so this is belt;
     *   · **the distillation** — `nina_memory_facts` / `nina_memory_slots` rows stamped with a
     *     `source_message_id` whose row the cascade has already destroyed. That is precisely the
     *     orphan class phase 6 purges, re-created milliseconds after the purge ran, and it is the
     *     one that actually reaches her: `loadNinaContext` reads the session's message window but
     *     the WHOLE relationship's memory ledger, so an orphaned fact is permanent pollution;
     *   · the auto-title — naming a row that is gone.
     *
     * One indexed owner-scoped read answers it. Cheap on a path that has just spent 13-45 s on a
     * model call, and it runs once per turn rather than once per write.
     *
     * ABANDONING IS THE WHOLE RESPONSE. Nothing is written, nothing is retried, nothing is
     * re-homed into another conversation — a reply to a conversation he deleted does not belong in
     * the one he kept. The claim is closed with a reason (`'session-gone'`) in the `finally`, so
     * the ledger says what happened and no sweep has to guess.
     */
    if (!(await ninaSessionExists(userId, sessionId))) {
      console.warn('[nina] session was deleted mid-turn; abandoning', { turnId, sessionId })
      failure = 'session-gone'
      return
    }
```

**Code — the read, added to `lib/nina/chatturn.ts` (this phase's own module, so no other phase's
file is touched):**

```ts
/**
 * Does this conversation still exist, and is it his?
 *
 * One row, one index (`nina_chat_sessions`' primary key plus the owner predicate — invariant 5: a
 * foreign id is indistinguishable from a deleted one, and both mean "do not write here").
 *
 * It lives in this module rather than in `lib/nina/queries.ts` for a reconciliation reason worth
 * recording: `lib/nina/queries.ts` is phase 6's file this cycle, and this is the one read this
 * phase needs that phase 6 does not provide. One extra function in a module this phase already
 * creates costs nothing; a fourth cross-phase edit to a shared file costs a merge.
 */
export async function ninaSessionExists(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: ninaChatSessions.id })
    .from(ninaChatSessions)
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, sessionId)))
    .limit(1)
  return rows.length > 0
}
```

Add `ninaChatSessions` to `lib/nina/chatturn.ts`'s `@/lib/db/schema` import.

**And the same guard on the CHAIN.** The follow-up link re-reads the conversation and opens a fresh
claim; both are pointless if the session is gone, and `listNinaMessages` against a deleted session
returns `[]` so the chain already exits — but exiting *by accident* is not the same as exiting on
purpose. Add, immediately before the chain's `listNinaMessages` call:

```ts
    if (!(await ninaSessionExists(userId, sessionId))) return
```

**Impact:** one indexed read per turn, plus one per chained link. `closeNinaChatTurn` gains one more
possible `error_code` value, `'session-gone'`, which is a `failed` row like any other and which
nothing renders — phase 4's job pages read `kind='image'` only. Add to
`lib/nina/turnflight.test.ts` nothing: this is a database property, not an arithmetic one.

**Cross-reference for whoever reads this at 3am:** phase 6's `npm run nina:memory-reap` is the
backstop, and phase 6's script header already says so in as many words. This guard is the fix; that
script is what catches the case where the delete lands in the microseconds between this check and
the distillation's own write. Neither is being asked to do the other's job.

---

### Step 7: The poll action

**File:** `lib/nina/actions.ts` — append after `sendNinaMessage`'s block
**Change:** The one new Server Action.

**Code:**

```ts
export interface NinaReplyPoll {
  ok: boolean
  /**
   * **"Is there a message of his that has not been answered yet?"** — the client's whole stop
   * condition, in one boolean, answered by the server so the screen never has to guess.
   *
   * TRUE while a `nina_turns` chat claim is live for this conversation, and ALSO true in the
   * hand-off gap where one chained turn has closed and the next has not yet opened — because the
   * second disjunct is "the newest row is his and it is fresh", which is exactly what is true in
   * that gap. Without the disjunct the screen would stop polling for a quarter of a second and miss
   * the whole of a chained reply.
   */
  awaiting: boolean
  /** Her new bubbles since `afterSeq`, oldest first. Empty while she is still thinking. */
  bubbles: SentBubble[]
  /** The cursor to send next time. Unchanged from the input when nothing new arrived. */
  cursor: number
}

/**
 * **How an open tab learns that Nina has answered (F36 R6).**
 *
 * ── WHY A POLL AND NOT THE PUSH SEAM THAT ALREADY EXISTS ─────────────────────────────────────
 * `lib/nina/live.ts`'s `SW_MESSAGE_TYPE = 'nina:new'` and `lib/service-worker.js`'s
 * `notifyOpenWindows` are a real, shipped wake-up channel, and this phase leaves them completely
 * untouched: a proactive push still refreshes the screen exactly as it does today. They are the
 * wrong mechanism for THIS path, for two independent reasons.
 *
 *   1. **A push must show a notification.** The service worker's own comment records the platform
 *      rule — a `push` handler that shows nothing "counts against the app's push budget" on iOS —
 *      so the worker cannot suppress the tray for a tab the runner is staring at. Pushing every
 *      chat reply would buzz his phone for every message he sends while watching the screen. That
 *      is a worse app than the one he has.
 *   2. **A push arrives as `router.refresh()`, which hands down a whole new `initial` and lands
 *      through `mergeServerMessages` — in ONE frame.** RU-5's staggered reveal is a sequence of
 *      `setState` calls separated by real time, and `ChatScreen`'s header spends a paragraph on why
 *      it must not be collapsed. Delivering four bubbles at once is precisely that collapse. The
 *      poll returns the bubbles as DATA, so `planReveal` still runs on them.
 *
 * ── AND A CLOSED TAB NEEDS NOTHING AT ALL ────────────────────────────────────────────────────
 * Say it plainly, because it is the part of R6 people build for twice: her rows are committed by
 * the background task, `app/nina/page.tsx` reads them with `listNinaMessages` on the next render,
 * and they are simply there. No queue, no replay, no reconnection. The only thing the tab being
 * closed changes is that nobody is watching, and the requirement is that this does not matter.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────────────────────
 * ONE round trip: a `db.batch` of three statements against three indexes. Against the measured
 * 13-16 s turn the backoff spends about nine of them, and it stops the instant `awaiting` goes
 * false. `lib/extract/constants.ts` is the precedent — a polled 34 s job with the same shape.
 *
 * ── IT IS AN UNTRUSTED POST ENDPOINT LIKE EVERY OTHER ACTION ─────────────────────────────────
 * `requireUserId()` first; `sessionId` is shape-checked and then proved by `messageScope`'s
 * `user_id AND session_id` predicate, so a forged id returns `[]` rather than another
 * conversation. It writes nothing except, on the rare expired-claim path, the sweep's own
 * conditional UPDATE.
 */
export async function pollNinaReply(input: {
  sessionId: string | null
  afterSeq: number
}): Promise<NinaReplyPoll> {
  const userId = await requireUserId()

  const afterSeq = Number.isFinite(input?.afterSeq) ? Math.max(0, Math.floor(input.afterSeq)) : 0
  const sessionId =
    typeof input?.sessionId === 'string' && isValidId(input.sessionId) ? input.sessionId : null
  /* No conversation, nothing to wait for. Reachable for a runner who has never messaged. */
  if (sessionId === null) return { ok: true, awaiting: false, bubbles: [], cursor: afterSeq }

  let fresh: NinaMessageRow[]
  let newestRows: NinaMessageRow[]
  let pending: Awaited<ReturnType<typeof getPendingNinaChatTurn>>
  try {
    /* Three indexed reads, one round trip. Spelled as three separate `let`s and a plain tuple
     * destructure rather than a nested pattern, so `tsc` infers each element rather than widening
     * the tuple to a union of the three row shapes. */
    ;[fresh, newestRows, pending] = await Promise.all([
      listNinaMessagesAfter(userId, { sessionId, afterSeq }),
      listNinaMessages(userId, { limit: 1, sessionId }),
      getPendingNinaChatTurn(userId, sessionId),
    ])
  } catch (cause) {
    console.warn('[nina] reply poll failed', { error: String(cause) })
    /* `ok: false` and `awaiting: true`: a poll that could not read the database has learned
     * NOTHING, and reporting "she is not answering" would be a claim it cannot make. The client
     * treats this as "try again", and its own give-up at `NINA_TURN_POLL_GIVE_UP_MS` is what stops
     * a database outage from polling for ever. */
    return { ok: false, awaiting: true, bubbles: [], cursor: afterSeq }
  }

  const newest = newestRows[0] ?? null
  const now = Date.now()
  const expired = pending !== null && now - pending.createdAt.getTime() >= NINA_TURN_STALE_MS
  if (expired) {
    /*
     * The claim outlived its deadline, so the process behind it is gone. Close it HERE rather than
     * only on his next send: this is the moment the screen is asking, and `lib/extract`'s own note
     * is the argument — "the poll that gives up is the poll that closes the row, so the runner's
     * last request is the one that makes the state honest". One conditional UPDATE, on the rare
     * path only, and never on the ~29 healthy polls of a turn that is simply still running.
     */
    try {
      await sweepStaleNinaChatTurns(userId, new Date(now))
    } catch (cause) {
      console.warn('[nina] chat turn sweep failed in poll', { error: String(cause) })
    }
  }

  const live = pending !== null && !expired
  /*
   * The two disjuncts. `live` is authoritative and covers a turn that is running. The message
   * predicate covers the hand-off gap between two chained turns, and it is the SAME pure function
   * `app/nina/page.tsx` uses for its cold-load heuristic — one definition of "unanswered", asserted
   * in `lib/nina/turnflight.test.ts`, so the screen and the server cannot come to disagree.
   */
  const awaiting = live || ninaAwaitingByMessage(newest, now)

  /*
   * HER bubbles only. His own rows come back from `listNinaMessagesAfter` too — a second tab may
   * have sent one — and appending them here would duplicate a bubble the sending tab already has
   * optimistically. The other tab gets them the way it always has, on the next server render.
   */
  const hers = fresh.filter((row) => row.role === 'nina')

  return {
    ok: true,
    awaiting,
    bubbles: hers.map((row) => ({ id: row.id, body: row.body, replyToId: row.replyToId })),
    /* The cursor advances past EVERY row read, not just hers, so a message from another tab is not
     * re-read on every subsequent poll. */
    cursor: fresh.length === 0 ? afterSeq : (fresh[fresh.length - 1]?.seq ?? afterSeq),
  }
}
```

**Impact:** `lib/nina/actions.ts`'s imports gain `listNinaMessagesAfter` (from `'./queries'`),
`getPendingNinaChatTurn` (from `'./chatturn'`) and `NINA_TURN_STALE_MS` (from `'./turnflight'`).

---

### Step 8: The album action stops promising something it cannot know

**File:** `lib/nina/albumActions.ts:36-42` and `:57-61`
**Change:** Drop `unavailable`. `components/nina/NinaAboutScreen.tsx` reads only `result.ok`, so
phase 5's file is untouched.

**Code:**

```ts
export interface NinaAttachResult {
  ok: boolean
  userMessageId: string | null
}
```

and the return:

```ts
  return {
    ok: result.ok,
    userMessageId: result.userMessageId,
  }
}
```

Add to this file's header, under the existing "WHY THERE IS NO REVEAL ANIMATION ON THIS PATH" block:

```
 * ── AND WHY `unavailable` IS GONE (F36 R6) ────────────────────────────────────────────────────
 * `sendNinaMessage` no longer waits for the model, so at the moment this returns there is no answer
 * to the question "could she reply". The field could only ever have been `false`. What the caller
 * does instead is unchanged and was already right: it navigates to `/nina`, whose Server Component
 * reads `listNinaMessages` — so his photo is on screen immediately, and her reply appears through
 * `ChatScreen`'s poll, which that page starts because the newest row is his.
```

**Impact:** `attachNinaPhotoToChat`'s caller compiles unchanged. The attach path gets the WhatsApp
behaviour for free: the navigation lands on a screen that is already awaiting.

---

### Step 9: `ChatScreen` — sent on return, revealed on arrival

**File:** `components/nina/ChatScreen.tsx`

**9a-pre. The header sentence that this phase makes false.** `components/nina/ChatScreen.tsx:62`
reads, verbatim:

> *"A thrown action is a send that did not happen; a returned `unavailable` or an empty `bubbles`
> array is phase 3's documented silence after a repair also failed."*

This phase **deletes both `SendNinaMessageResult.unavailable` and `SendNinaMessageResult.bubbles`**,
so that sentence names two fields that no longer exist, in the paragraph a reader opens this file
to read. Replace it with:

```
 * A thrown or refused action is a send that did not happen. A turn that produced nothing — she
 * declined, the model was unavailable, or the background task died and the sweep closed it — is
 * learned from `pollNinaReply` returning `awaiting: false` with no new bubbles, because after the
 * split the action returns long before she has said anything.
```

The rest of that paragraph — the two-failure-states argument and why neither is a fake Nina
message — is unchanged and is more true than before, not less.

**9a. The header** — append to the block ending at `:69`, immediately before `type Notice`:

```
 * ── WHAT THE SPLIT CHANGED, AND WHAT IT DELIBERATELY DID NOT (F36 R6) ─────────────────────────
 * `sendNinaMessage` no longer waits for the model. It persists his message and returns, so the
 * bubble goes `sent` on the ACTION'S RETURN rather than on Nina's reply — which is the whole of
 * R6's "i send the message, it quickly shown that the message is sent". Her bubbles arrive
 * afterwards, through `pollNinaReply`, and the staggered reveal above runs on ARRIVAL instead of on
 * return.
 *
 * **Every word of the transition argument above still holds, and the poll is why it holds harder.**
 * The reveal is still a sequence of `setState` calls separated by real time, so it is still outside
 * `startTransition` / `useActionState` / `useOptimistic` for exactly the reasons given — and the
 * arrival path had to be a poll returning DATA rather than a `router.refresh()`, precisely because
 * a refresh delivers all four bubbles through `mergeServerMessages` in one frame. See
 * `pollNinaReply`'s own header for the two reasons the push seam is not used here.
 *
 * **`busy` now covers the ACTION, not the turn.** It used to be held for the whole 13-45 s, which
 * is the grey state R6 is about. It is released the moment the action returns, so a second message
 * can be sent while she is still answering — WhatsApp's actual behaviour. The server's claim on
 * `nina_turns` is what stops that becoming a second concurrent model call.
 *
 * **The failure states are unchanged and neither is still a fake Nina message.** A thrown or
 * refused action is 'send-failed'. A turn that produced nothing — she declined, or the background
 * task died and the sweep closed it — is 'no-reply', raised by the poll rather than by the send.
 * Its existing copy is now more true than it was: his message really was persisted before the model
 * was called, and `loadNinaContext` reads the session window, so "send another and she will pick it
 * up" describes a mechanism rather than a hope.
```

**9b. The `no-reply` copy's comment** — `:76-78`. The STRING is unchanged (it is already correct);
add above it:

```ts
  /* Raised by the POLL, not by the send (F36 R6). Three states read the same to the runner and are
   * deliberately not told apart in the copy: she answered with nothing, the model was unavailable,
   * or the background turn died and the sweep closed it. He does not care which; he cares that his
   * message is safe and that one more tap gets him an answer. Both halves are now literally true. */
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
```

**9c. The prop** — add to the destructured props at `:110` and to the props type after
`pendingPhoto` (`:171`):

```ts
  /**
   * **F36 R6. Whether a turn is already in flight when this screen mounts, and where the poll
   * resumes from.**
   *
   * Computed on the server by `ninaFlightView` from the rows `app/nina/page.tsx` has ALREADY read —
   * zero extra queries, which is why it is a pure function over `listNinaMessages`'s output and not
   * a fifth read in that page's `Promise.all`.
   *
   * It is what makes "the app does not care whether user close the app" true for the case that
   * actually happens: he sends, locks his phone, comes back forty seconds later. Without it the
   * reopened screen would show his message with no indicator and no poll, and her reply would only
   * appear if he happened to reload again. With it, the screen mounts already awaiting.
   *
   * `awaiting` is a HEURISTIC here — a cold load has no claim row in hand, so it is "the newest row
   * is his and it is younger than `NINA_TURN_STALE_MS`". The first poll's answer is authoritative
   * and corrects it inside two seconds. `ninaAwaitingByMessage`'s docstring carries the argument
   * for why that direction of error is the safe one.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and for the reason `sessionId` and
   * `pendingPhoto` are: `app/nina/page.tsx` is the one caller and `tsc` should be what notices if
   * it stops passing it. An optional prop defaulting to "not awaiting" would turn a broken page
   * into a chat that silently never polled.
   */
  flight: NinaFlightView
```

Import: `import { ninaPollDelayFor, NINA_TURN_POLL_GIVE_UP_MS, type NinaFlightView } from
'@/lib/nina/turnflight'` and widen `'@/lib/nina/actions'` to `import { pollNinaReply,
sendNinaMessage } from '@/lib/nina/actions'`.

**9d. State** — replace `:172-176`.

> **Verified against the shipped file, and the boundary matters.** The real declarations are
> `messages` / `typing` (`:179`) / `busy` (`:180`) / `notice` / `overlap`, and then
> **`const [flashId, setFlashId] = useState<string | null>(null)` at `:186`, which is OUTSIDE this
> replacement and must survive it untouched.** `flashId` and its `flashTimer` ref (`:272`) are
> phase 4's anchors 3 — it needs both for the deep-link flash. Replace the contiguous block that
> ends at `overlap`; do not sweep the whole `useState` region.

```ts
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  /** Mid-reveal: the pause between two of her bubbles. Distinct from `awaiting`; see the render. */
  const [typing, setTyping] = useState(false)
  /**
   * F36 R6. She has a message of his that she has not answered, so the poll is running and the
   * indicator is up. Seeded from the server so a cold load mid-turn already shows it.
   */
  const [awaiting, setAwaiting] = useState(flight.awaiting)
  /**
   * F36 R6. The conversation the poll asks about. Seeded from the prop and REPLACED by the send's
   * answer, because `sessionId` may legitimately be `null` — "he has no sessions at all" — and the
   * ACTION is what resolves or creates one. Without adopting it, the first message of a brand-new
   * runner would send fine and then be polled for in a conversation the client cannot name.
   */
  const [liveSessionId, setLiveSessionId] = useState(sessionId)
  /**
   * F36 R6. `nina_messages.seq` of the newest row this screen holds — the poll's cursor. A REF and
   * not state: it is read inside the poll loop and written by both the send and the poll, and a
   * stale closure over it would re-read the same rows for ever. Nothing renders from it.
   */
  const cursorRef = useRef(flight.cursor)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
```

**9e. The poll's own timer ref** — in the block at `:266-280`, beside `timer` and `flashTimer`:

```ts
  /*
   * Its own handle, on `flashTimer`'s exact reasoning. The poll's backoff wait and the reveal's
   * `sleep` never overlap — the loop awaits one then the other — but sharing `timer` would mean the
   * next person to add a cancel path silently cancels the wrong one.
   */
  const pollTimer = useRef<number | null>(null)
```

and add to the unmount cleanup at `:274-278`:

```ts
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
```

**9f. `revealBubbles`, extracted** — insert immediately before `handleSend` (`:545`):

```ts
  /**
   * RU-5's staggered reveal, lifted verbatim out of `handleSend` so the SEND path and the POLL path
   * cannot drift into two different rhythms. It is the only writer of `typing` besides the poll's
   * own start and stop.
   *
   * It guards on `alive.current` at every timed step and on nothing else. Callers are sequential by
   * construction — the poll loop awaits this before deciding whether to keep polling — so there is
   * no second reveal to interleave with, and the single `timer` handle stays safe.
   */
  const revealBubbles = useCallback(async (bubbles: readonly SentBubble[]) => {
    const plan = planReveal(bubbles.map((b) => b.body))
    for (const [index, bubble] of bubbles.entries()) {
      const gap = plan[index] ?? 0
      if (gap > 0) {
        setTyping(true)
        await sleep(gap)
        if (!alive.current) return
      }
      // The indicator stays up while there is another thought coming, and drops with the last.
      setTyping(index < bubbles.length - 1)
      setMessages((current) => [
        ...current,
        {
          id: bubble.id,
          role: 'nina',
          body: bubble.body,
          dayISO: todayInJakarta(),
          state: 'sent',
          /*
           * HER OWN QUOTE. She may have replied to a specific message, and the server puts her
           * `reply_to_id` on the FIRST bubble only ("a four-bubble reply is one answer to one
           * message"). A hard `null` here would mean the quote only appeared on the next server
           * render of `/nina`.
           */
          replyToId: bubble.replyToId,
        },
      ])
    }
    setTyping(false)
  }, [])
```

`SentBubble` must be imported as a type: widen the actions import to
`import { pollNinaReply, sendNinaMessage, type SentBubble } from '@/lib/nina/actions'`.

**9g. The poll loop** — insert immediately after `revealBubbles`:

```ts
  /**
   * **The arrival loop (F36 R6).** Runs while `awaiting` is true and stops itself the moment the
   * server says there is nothing outstanding.
   *
   * ── ONE SEQUENTIAL ASYNC LOOP, NOT A `setInterval` ───────────────────────────────────────────
   * Because a tick must not fire while the previous request is in flight, and — the part that
   * matters — because a tick must not fire while a REVEAL is in progress. An interval would race
   * the reveal's own `sleep` for the shared timer handle and could deliver a second batch of
   * bubbles into the middle of the first batch's stagger. Awaiting each step in order makes both
   * impossible by construction rather than by a guard someone has to remember.
   *
   * ── WHY IT DOES NOT STOP ON THE FIRST BUBBLES ────────────────────────────────────────────────
   * Because a burst chains: the server may answer his first message, then open a second turn for
   * the two he sent while she was typing. The stop condition is the server's `awaiting`, which is
   * "is anything of his unanswered", not "did I just receive something".
   *
   * ── THE GIVE-UP ─────────────────────────────────────────────────────────────────────────────
   * `NINA_TURN_POLL_GIVE_UP_MS` is the same number as the server's `NINA_TURN_STALE_MS`, asserted
   * in `lib/nina/turnflight.test.ts`. By the time it fires, the server has already closed the row
   * as dead, so the notice it raises is a fact. It exists for the case where the poll ITSELF cannot
   * reach the server — an offline phone — where no server answer is coming at all.
   */
  useEffect(() => {
    if (!awaiting) return
    let cancelled = false

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        pollTimer.current = window.setTimeout(resolve, ms)
      })

    const stop = (notice: Notice | null) => {
      setAwaiting(false)
      setTyping(false)
      if (notice !== null) setNotice(notice)
    }

    const run = async () => {
      const startedAt = Date.now()
      let attempts = 0

      while (!cancelled && alive.current) {
        await wait(ninaPollDelayFor(attempts))
        if (cancelled || !alive.current) return
        attempts += 1

        let result: Awaited<ReturnType<typeof pollNinaReply>> | null = null
        try {
          result = await pollNinaReply({
            sessionId: liveSessionId,
            afterSeq: cursorRef.current,
          })
        } catch {
          result = null
        }
        if (cancelled || !alive.current) return

        const expired = Date.now() - startedAt >= NINA_TURN_POLL_GIVE_UP_MS

        if (result === null || !result.ok) {
          /* The poll itself failed. It has learned nothing, so it says nothing and tries again —
           * until the give-up, which is the only thing that ends an offline wait. */
          if (expired) stop('no-reply')
          continue
        }

        cursorRef.current = result.cursor

        if (result.bubbles.length > 0) {
          setNotice(null)
          /*
           * `setAwaiting(false)` BEFORE the reveal when the server says nothing is outstanding, so
           * the indicator is owned by `typing` alone for the duration of the stagger. Flipping it
           * re-runs this effect's cleanup and sets `cancelled`, which is harmless: `revealBubbles`
           * guards on `alive.current`, and this iteration returns immediately afterwards.
           */
          if (!result.awaiting) setAwaiting(false)
          await revealBubbles(result.bubbles)
          if (cancelled || !alive.current) return
          if (!result.awaiting) return
          continue
        }

        if (!result.awaiting) {
          /* Nothing outstanding and nothing new: she said nothing, or the turn is dead and the
           * server has closed it. One notice covers all of it — see NOTICE_TEXT's comment. */
          stop('no-reply')
          return
        }
        if (expired) {
          stop('no-reply')
          return
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
    }
  }, [awaiting, liveSessionId, revealBubbles])
```

**9h. `handleSend`** — replace the block from `:640` (`setBusy(true)`) to the end of the callback at
`:716`, keeping everything above it (the refusal guard, the optimistic row, the unpinning) exactly as
it is:

```ts
      setBusy(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({
          body,
          imageTickets: draft.images.map((image) => image.ticket),
          replyToMessageId,
          runId: sending?.runId ?? null,
          attachExisting:
            sendingPhoto === null ? null : { kind: sendingPhoto.kind, id: sendingPhoto.id },
          sessionId,
        })
      } catch {
        result = null
      }
      if (!alive.current) return

      /*
       * **`busy` is released HERE (F36 R6).** It used to be held for the whole 13-45 s turn, and
       * that is the grey composer R6 is about. The action's own round trip is one insert and one
       * conditional insert, so this is well under a second and the Send button is live again while
       * she is still answering — which is what WhatsApp does. The server's claim on `nina_turns` is
       * what stops the next message becoming a second concurrent model call.
       */
      setBusy(false)

      if (result === null || !result.ok) {
        setAwaiting(false)
        setTyping(false)
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return
      }

      // Adopt the server's id for the runner's own row, so a quote can name it and the actions
      // sheet can act on it. Until this point it carried a client-minted `local-` id.
      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      /*
       * The three things the poll needs, all of them facts the server just established.
       *
       * `sessionId` is adopted because the prop may have been `null` — "he has no sessions at all"
       * is a real state and the ACTION resolves or creates one. `cursor` is his row's `seq`, so the
       * first poll asks for everything strictly after his own message. `awaiting` goes true
       * unconditionally on a successful send, INCLUDING when `result.turnId` is null: a null turn
       * id means a turn was already running and will chain onto this message, so something is very
       * much still coming.
       */
      if (result.sessionId !== null) setLiveSessionId(result.sessionId)
      if (result.cursor !== null) cursorRef.current = result.cursor
      setAwaiting(true)
    },
    [busy, draftQuote, attachment, photo, sessionId],
  )
```

Delete the `setTyping(true)` that sat beside the old `setBusy(true)` at `:641` — `awaiting` now
drives the indicator from the moment the action returns, and raising it before the round trip would
show Nina typing in response to a message that had not been accepted yet.

**9i. The render** — `:718-728` and `:747-752`. `typing` is replaced by the derived flag in the two
places it is read:

```ts
  /*
   * F36 R6. The indicator is up while the SERVER owes an answer (`awaiting`) and between two of her
   * bubbles mid-reveal (`typing`). Two pieces of state and one derived flag, rather than one
   * overloaded boolean, because the poll and the reveal legitimately own different stretches of the
   * same wait and each must be able to end its own without ending the other's.
   *
   * This is the honest signal R6 asks for: it means "she is answering", where the grey bubble it
   * replaces meant "your message has not been saved yet" — which was never what the runner read it
   * as, and is no longer true for even a second.
   */
  const showTyping = awaiting || typing
```

Then: `messages.length === 0 && !showTyping` in the empty-state condition; `typing={showTyping}` on
`<MessageList>`; and `{showTyping ? 'Nina is typing' : ''}` in the `aria-live` region.

**Impact:** `components/nina/TypingIndicator.tsx` is **not edited**. It becomes the honest
turn-in-flight signal purely by being driven from `awaiting`, which is what its docstring already
describes it as. Invariant 8 holds: no new keyframe — it still animates through `ri-pulse` via
`LoadingDots`, which `app/globals.css` already neutralises under `prefers-reduced-motion`.

---

### Step 10: The page hands the screen its flight view

**File:** `app/nina/page.tsx`

**10a.** Add the import beside the other `@/lib/nina/*` imports:

```ts
import { ninaFlightView } from '@/lib/nina/turnflight'
```

**10b.** Immediately after `const todayISO = todayInJakarta()` (`:225`):

```ts
  /*
   * **F36 R6. Is a turn already in flight for the conversation this render is painting?**
   *
   * ZERO EXTRA QUERIES. `rows` is `listNinaMessages`'s output — oldest first — and the question is
   * answered by its last element: the newest row is his, and it is younger than
   * `NINA_TURN_STALE_MS`. `ninaFlightView` is that predicate as a pure function so the page, the
   * poll action and the client cannot come to disagree about what "unanswered" means; its suite
   * asserts the agreement.
   *
   * A HEURISTIC, and knowingly. This render cannot see the `nina_turns` claim without a fifth read,
   * and it does not need to: `ChatScreen` starts a poll on the strength of it, and the poll's first
   * answer — which DOES read the claim — is authoritative within two seconds. The one direction it
   * errs in is starting a poll that finds nothing, which is a single indexed batch. The opposite
   * error, hiding a reply that is on its way, is the one that would matter.
   *
   * `cursor` rides along because the screen needs somewhere to resume from, and the newest row's
   * `seq` is exactly that. Invariant 4 is untouched: this is arithmetic over rows already in hand.
   */
  const flight = ninaFlightView(rows, Date.now())
```

**10c.** Pass it on `<ChatScreen>` (`:399`), after `pendingPhoto`:

```tsx
          pendingPhoto={pendingPhoto}
          flight={flight}
```

**Impact:** `NinaMessageRow` structurally satisfies `NinaFlightRow` (`role`, `seq`, `createdAt`), so
no mapping is needed. **`export const maxDuration = 60` at `:128` is NOT touched — that line is
phase 2's.**

---

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck`
**Lint:** `npm run lint`
**Tests:** `npm test`
**Guards:** `npm run ci:llm-payload-guard` (the one this phase could plausibly break — it must pass
with **no edit** to `scripts/check-llm-payload-boundary.mjs`), then the other five:
`ci:openrouter-guard`, `ci:client-secret-guard`, `ci:data-layer-guard`, `ci:f08-guard`,
`ci:f11-guard`.

**Existing tests that assert `sendNinaMessage` returns bubbles: there are none.** Verified by
`grep -rn "sendNinaMessage\|planReveal\|mergeServerMessages" tests/ lib/ components/` — the only
non-comment hits are `lib/nina/albumActions.ts` (the call, handled in Step 8) and
`components/nina/ChatScreen.tsx` (the call, handled in Step 9). `lib/nina/album.test.ts:164` states
the reason in its own words: *"anything from a `'use server'` module pulls `sendNinaMessage` and
therefore `requireUserId`"*, so the suites deliberately test the pure modules around it instead.
Concretely:

| Suite | Touches this phase? | What happens |
|---|---|---|
| `lib/nina/live.test.ts` | No | `mergeServerMessages` and `SW_MESSAGE_TYPE` are both unchanged. Must stay green untouched — it is the proof the push seam still works. |
| `lib/nina/reveal.test.ts` | No | `planReveal` is unchanged; only its caller moved. |
| `lib/nina/turn.test.ts` | No | `runNinaTurn`, `NinaTurnStore` and `productionDeps` are unchanged. |
| `lib/nina/album.test.ts` | No | Tests `NINA_ATTACH_MAX_CHARS`, not the action's result shape. |
| `lib/nina/distill.test.ts` | No | `runTurnDistillation`'s signature is unchanged; only its `after()` wrapper moved. |
| `tests/db.schema.nina.test.ts` | No | No column, index or migration changes. |
| `lib/nina/turnflight.test.ts` | **New** | 13 cases (Step 2). |

**Manual check:**
1. `npm run dev`, open `/nina`, send a message with the network panel open. The `sendNinaMessage`
   POST must complete in **under a second** and the bubble must lose its grey state on that
   response — not thirteen seconds later. `pollNinaReply` POSTs then appear on the backoff.
2. Send, and **close the tab** before she answers. Wait 30 s, reopen `/nina`. Her reply is there.
3. Send, then **lock the screen** for 20 s and come back. The typing indicator is up on mount
   (the `flight` prop) and her reply reveals with its stagger.
4. Send three messages in quick succession. Exactly **two** `nina_turns` rows with `kind='chat'`
   appear (the first turn plus one chained follow-up), not three, and she answers coherently.
5. Kill the dev server mid-turn, restart it, reload `/nina`, send anything. The orphaned row is now
   `status='failed'`, `error_code='stale'`, and the previous message is answered by the new turn's
   context.
6. `select kind, status, error_code, count(*) from nina_turns group by 1,2,3` — no chat row is left
   `pending` after a completed interaction, and `nina_messages.turn_id` is populated on her bubbles
   (it was 0 of 48 rows before this phase).

**Exit criteria:**
- The send action returns in under a second on a real message, and the bubble reads `sent` on that
  return.
- A reply persisted while the tab was closed is on screen after a reload, with no manual step.
- A reply persisted while the tab was open appears through the poll, revealed one bubble at a time.
- A killed background turn leaves a `failed`/`stale` `nina_turns` row and the 'no-reply' notice —
  never a fabricated Nina bubble.
- `npm test`, `npm run lint`, `npm run typecheck` and all six guards are green.

---

## Handoffs

**From phase 2 — RECONCILED, both halves closed.** (1) The durable-background convention is
`after()`, decided in phase 2's Interface Contract, so `startNinaBackgroundTurn` ships exactly as
written and there is no route-hop variant to switch to. (2) **If phase 2's probe FAILED** and
`app/nina/page.tsx` keeps `maxDuration = 60`, change **two literals in `lib/nina/turnflight.ts`,
together**: `NINA_BACKGROUND_BUDGET_MS` to `45_000` and `NINA_TURN_CHAIN_MAX` to `0`. Nothing else
in this phase moves — not the split, not the poll, not the claim. Both literals are documented at
their declarations, this instruction is reproduced verbatim in the plan index's *Decisions* table
(the only channel a session that never opens phase 2's file will read), and
`lib/nina/turnflight.test.ts`'s two budget cases fail loudly if the budget is lowered while the
chain is left at 2. **The chain-inequality assertion was corrected during reconciliation** — the
draft's `(CHAIN_MAX + 1) * perLink <= BUDGET` was arithmetically false on Branch B, so the
documented Branch B values would have failed the suite the moment anyone took that branch. See
Step 2.

**To phase 4 (R1, the deep-link scroll).** `components/nina/ChatScreen.tsx` is left with
`handleJumpToQuote`, `flashId`/`flashTimer`, `QUOTE_FLASH_MS`, `planQuoteScroll`, `useChatScrollMark`
and every `<MessageList>` prop untouched — that is the whole surface the jump needs. Two rules:
the `useLayoutEffect` at `:250` is still the file's only `replaceState` writer, so a new URL param
must be deleted inside that same effect rather than by a second one; and `revealBubbles` is the sole
appender of Nina's rows — a deep-link scroll must not call it.

**To phase 4 (R1, the job list) — and the containment was AUDITED during reconciliation, not
assumed.** `nina_turns` now carries `kind='chat'` rows in `status='pending'` with `args` populated
(`{ sessionId, runnerMessageId, depth }`), which is a new state for that table: before this phase,
`dbNinaTurnStore` only ever INSERTed a chat row *after* the call, already terminal. Every reader
was checked against the shipped source and every one of them is scoped:

| Reader | Owner | `kind = 'image'` in its `WHERE`? |
|---|---|---|
| `sweepStaleNinaImageJobs` (`imagejobs.ts:256`) | shipped | yes |
| `listOpenNinaImageJobs` (`:326`) | shipped | yes |
| `getNinaImageJob` (`:348`) | shipped | yes |
| `claimJob` (`scripts/nina-image-worker.ts:264`) | phase 1 | yes — `where kind = 'image'` |
| `claimNinaImageJob` | phase 2 | yes — `eq(ninaTurns.kind, 'image')` |
| `listRevivableNinaImageJobs` | phase 2 | yes |
| `listNinaImageJobs`, `getNinaImageJobDetail` | phase 4 | yes — both |
| `countNinaTurnsSince` | shipped | called with `'image'` at exactly one site (`imagejobs.ts:81`), verified by grep |

So a `pending` chat row is invisible to the daily cap, to both claim paths, to the give-up sweep and
to phase 4's two new reads. **Phase 4's widened projection must keep the filter** — it does — or the
job list will show chat turns. Two non-readers for completeness: `failNinaImageJob` addresses a row
by exact `id` and needs no `kind` predicate, and the worker's `preflight` queries
`information_schema.columns`, not `nina_turns`, so `kind` is irrelevant there.

One value phase 4 should know about from this side: `closeNinaChatTurn` can write
`error_code = 'session-gone'` (Step 6d) on a `kind='chat'` row. Nothing in phase 4 renders it,
because nothing in phase 4 reads chat rows.

**To phase 7 (R5, the end-to-end test).** **The seam is `pollNinaReply`.** The test drives
`sendNinaMessage` (which returns `{ ok, sessionId, cursor, turnId }` synchronously), then polls
`pollNinaReply({ sessionId, afterSeq: cursor })` until `awaiting` is false — a deterministic wait on
a real database rather than a sleep. `turnId` is non-null exactly when this send started a turn, so
the test can assert it did. If the harness cannot let `after()` settle, the alternative seam is the
`nina_turns` claim itself: `getPendingNinaChatTurn(userId, sessionId)` going from non-null to null is
the turn's completion, observable in SQL.

**Deliberately NOT done, and why (each belongs on its own card):**
- **A push notification for an ordinary chat reply.** `pollNinaReply`'s header carries the argument:
  the platform requires a `push` handler to show a notification, so the service worker cannot
  suppress the tray for a tab he is looking at, and every message he sent would buzz his phone.
  `lib/service-worker.js` and `lib/push/*` are untouched; the proactive push path still works.
- **A retry of a dead turn.** `sweepStaleNinaChatTurns`'s header carries the argument: an automatic
  model call from a recovery path spends money he did not ask for, and any apology it wrote would be
  app-authored prose in Nina's mouth (invariant 7).
- **A unique index making `openNinaChatTurn` atomic — DECIDED AGAINST, permanently, not deferred.**
  The earlier draft called it "phase 6's". Phase 6 generates no migration and neither does any
  other phase in this set, so there was no phase to defer it to; leaving the pointer would have
  been a dangling forward reference to work nobody was doing. The race is named, bounded and priced
  at the function: Next serialises Server Actions per client, so only two *different* clients
  inside ~50 ms can collide, and the cost of collision is one duplicate reply — not a corruption,
  not a fabrication, and cheaper than the set's only migration. If it is ever observed in practice,
  it is its own card, and the fix is a partial unique index on `(user_id, kind)` where
  `status = 'pending'` and `kind = 'chat'`.
- **The double `getReviewedRunsWithChildren` read per turn.** Pre-existing; the STEP 2 comment
  already names the one-card fix (`loadNinaContext` + `lib/insights/load.ts` + `recomputeRecords`).
- **A jsdom test of `ChatScreen`.** `vitest.config.ts` is `environment: 'node'` with no jsdom, which
  is why `lib/nina/reveal.ts` was extracted in the first place. `lib/nina/turnflight.ts` follows the
  same rule and carries every decidable rule of this phase.

---

## Rollback

`git revert` the phase's single commit. Nine files, no migration, no column change, no CI-guard
change, so the revert is complete: `sendNinaMessage` awaits the turn again and `ChatScreen` goes back
to a grey bubble.

Two artefacts survive a revert, and both are inert:
- `nina_turns` rows with `kind='chat'` and `status='pending'` written before the revert. Nothing
  after the revert reads them — `countNinaTurnsSince` is only ever called with `'image'`, and every
  image query filters `kind='image'`. They sit in the ledger as a record that the phase ran.
- `nina_messages.turn_id` values on her bubbles. The column has always existed, carries no foreign
  key by design, and nothing renders it.

A partial rollback is available and is worth naming, because it is the likely response to a bad
production surprise: reverting **only Step 9's `handleSend`** — awaiting nothing but re-adding a
single `pollNinaReply` call before releasing `busy` — restores the blocking feel while keeping the
durable background turn. The server half stands on its own.
