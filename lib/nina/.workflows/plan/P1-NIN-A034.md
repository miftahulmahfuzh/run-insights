> Adopted from `NINA_DUP_BUBBLE_REVEAL_PLAN.md` phase 1. Source: `.workflows/plan/nina-dup-bubble-reveal/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Idempotent reveal append (pure helper + call site + tests)

**Plan set:** `NINA_DUP_BUBBLE_REVEAL_PLAN.md`
**Analysis:** `20260911-120011-EGEX_code_analyzer.md`
**Satisfies:** R1 — the root cause (`revealBubbles` is the only bubble-delivery path that does not dedupe on `nina_messages.id`) is removed at its one call site
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `components/nina` (call site), `lib/nina` (helper + tests)

---

## Goal

No interleaving of the screen's two bubble-delivery channels — the poll→reveal path and the page-render→`mergeServerMessages` path — can render the same `nina_messages.id` twice. Today (measured in prod session "gj", 2026-09-11: 4 DB rows, 7 rendered bubbles) a full-route RSC delivery landing mid-reveal pre-delivers the rows the reveal has not appended yet, and the still-running `revealBubbles` loop appends the same ids again. This phase gives the reveal the id guard the merge already has, as one pure, vitest-provable function in the `mergeServerMessages` idiom, and leaves every other behavior — `planReveal`'s stagger, the typing indicator, the `alive.current` guard, the poll/cursor protocol, the merge itself — byte-for-byte as it was.

**Placement decision (one line, as requested):** `lib/nina/live.ts`, not `lib/nina/reveal.ts` — `live.ts` is the module whose charter is "how a delivery becomes the list on screen", so both idempotence rules end up side by side and a reader who edits one sees the other, while `reveal.ts` keeps its single-purpose charter (the schedule's arithmetic), which this phase must not touch.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.
**Renames:** none.
**Creates:**
- `lib/nina/live.ts` — `export interface PollBubble { id: string; body: string; replyToId: string | null }` (the structural restatement of `SentBubble` from `lib/nina/actions.ts:120`; no import — `actions.ts` is a `'use server'` module)
- `lib/nina/live.ts` — `export interface RevealRow extends LiveMessage { role: 'nina'; body: string; dayISO: string; state: 'sent'; replyToId: string | null }` (the structural restatement of the nina half of `ChatMessage` from `components/nina/types.ts:25`; no import — no `lib/nina/*.ts` module imports `components/nina/types`, and both `lib/nina/chatview.ts:28` and `lib/nina/live.test.ts:6` record that rule in prose)
- `lib/nina/live.ts` — `export function appendNewBubbles<T extends LiveMessage>(current: T[], bubbles: readonly PollBubble[], dayISO: string): (T | RevealRow)[]`

  **Signature properties, both verified by compiling a standalone replica against this repo's `tsc` (`--strict --noUncheckedIndexedAccess`) before this plan was written:**
  1. With `T = ChatMessage`, the return type `(ChatMessage | RevealRow)[]` IS assignable to `ChatMessage[]` — the call site needs **no cast** (`RevealRow` is structurally a subset of `ChatMessage`; `ChatMessage`'s other fields are all optional).
  2. The safety does not degrade with drift: widening `ChatMessage` with a REQUIRED field makes `tsc` reject the call site with TS2322 (`Property ... missing in type ... but required in type ...`), so the structural twin is held to the real type at the call site, which is the guarantee an import would have given.
  3. `current` is deliberately a plain `T[]` (not `readonly`) and the bail-out returns it directly, so the nothing-new branch needs no cast inside the helper and none at the call site. `mergeServerMessages` needed `as ChatMessage[]` at its call site (`ChatScreen.tsx:569`) only because its bail-out type includes its `readonly` input's shape; this function does not inherit that.
- `lib/nina/live.test.ts` — a new `describe('appendNewBubbles')` block (6 cases, below).

**Modifies (prose + behavior-neutral plumbing):**
- `lib/nina/live.ts:1-2` — the module header's first sentence now names both delivery channels; a new `── TWO DELIVERIES, ONE LIST, BOTH IDEMPOTENT ──` paragraph is appended to the header. The `── WHY A MERGE AND NOT ... ──` block, `LiveMessage`, and all of `mergeServerMessages` (docstring and body, lines 18-49) are untouched.
- `components/nina/ChatScreen.tsx:32` — named-import line gains `appendNewBubbles` (file convention is case-insensitive alphabetical: `appendNewBubbles, SW_MESSAGE_TYPE, mergeServerMessages`).
- `components/nina/ChatScreen.tsx:1037-1076` — `revealBubbles`'s docstring gains the measured WHY (prod "gj") and the guard-placement argument; the existing "guards on ... nothing else" sentence is corrected, since the append now guards on id too; the body's inline `setMessages([...current, row])` literal becomes the helper call. Loop structure, `planReveal` zip, `sleep`, typing indicator, `alive.current` guard, and `todayInJakarta()` are all preserved.
- `lib/nina/live.test.ts:3` — import line gains `appendNewBubbles`.

**Requires (from earlier phases):** none — this is phase 1.
**Leaves alone (owned by others / explicitly out of scope):** `pollNinaReply` and the cursor protocol (`lib/nina/actions.ts:1994`), `mergeServerMessages`'s body/docstring/contract (`lib/nina/live.ts:34-49`), `planReveal` and every constant in `lib/nina/reveal.ts`, `components/nina/NinaUnreadSync.tsx`, `lib/service-worker.js`, `app/nina/page.tsx`, `components/nina/types.ts`, any server module, any DB migration. No second phase exists in this set; nothing here anticipates one.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/live.ts` | modify | header prose names both channels; new `PollBubble`, `RevealRow`, `appendNewBubbles` appended after line 49. `mergeServerMessages` untouched. |
| `components/nina/ChatScreen.tsx` | modify | import at line 32; `revealBubbles` (docstring + body) at lines 1037-1076 |
| `lib/nina/live.test.ts` | modify | import at line 3; new `describe('appendNewBubbles')` at end of file (after line 70) |

## Implementation Steps

### Step 1: The pure helper in `lib/nina/live.ts`

**File:** `lib/nina/live.ts` — rewrite the module header (lines 1-16) and append the new section after line 49. The complete final file is below; `mergeServerMessages` (lines 18-49) is reproduced verbatim so the implementer can diff the whole file without re-deriving what stayed.

**Code (complete final `lib/nina/live.ts`):**

```ts
/**
 * How a refreshed server list — and, beside it since the "gj" duplication, the poll's bubbles —
 * becomes the list on screen, without stepping on a reveal.
 *
 * ── WHY A MERGE AND NOT `setMessages([...initial])` ───────────────────────────────────────────
 * `ChatScreen` holds three kinds of row that the server list does not describe the same way:
 *   - an OPTIMISTIC row the runner just sent, which has a client-side id until the action returns;
 *   - a row mid-REVEAL, which is persisted (so it IS in the server list) but must not become
 *     `state: 'sent'` yet — RU-5's staggered reveal is the whole illusion, and re-seeding from the
 *     server would make all four of Nina's bubbles appear at once;
 *   - a row the server has and the client has not, which is the entire point of this refresh.
 *
 * Re-seeding wholesale gets all three wrong. The rule below is: **server order, local content.**
 *
 * Kept in `lib/nina/` and not `lib/push/` because it is about the conversation, not about push —
 * push is only what happens to wake it up.
 *
 * ── TWO DELIVERIES, ONE LIST, BOTH IDEMPOTENT ──────────────────────────────────────────────────
 * The refresh is not the only thing that appends. `revealBubbles` appends the poll's bubbles one
 * `sleep` apart, and on prod session "gj" (2026-09-11) a refresh landed mid-reveal: the merge
 * correctly delivered the rows the reveal had not reached yet, and the reveal then appended the
 * same `nina_messages.id`s again — four rows rendered as seven bubbles. `appendNewBubbles`, below,
 * is the reveal's half of this module's contract: both writers now skip ids the list already
 * holds, so no interleaving of the two can render a row twice.
 */

/** Kept in step with `LIVE_MESSAGE_TYPE` in `lib/service-worker.js`. */
export const SW_MESSAGE_TYPE = 'nina:new'

/** The only property this rule needs. `ChatMessage` (phase 4, widened by 6/7/8) satisfies it. */
export interface LiveMessage {
  id: string
}

/**
 * Server order, local content, local-only rows appended.
 *
 * Returns the **same array reference** when nothing changed, so a `useEffect` that calls
 * `setMessages(mergeServerMessages(current, initial))` on every refresh does not force a render
 * for a refresh that brought nothing new. React bails out of a state update that returns the
 * identical value.
 */
export function mergeServerMessages<T extends LiveMessage>(
  local: readonly T[],
  server: readonly T[],
): T[] | readonly T[] {
  const localById = new Map(local.map((message) => [message.id, message]))
  const merged: T[] = server.map((row) => localById.get(row.id) ?? row)

  const serverIds = new Set(server.map((row) => row.id))
  for (const message of local) {
    if (!serverIds.has(message.id)) merged.push(message)
  }

  const unchanged =
    merged.length === local.length && merged.every((message, i) => message === local[i])
  return unchanged ? local : merged
}

/*
 * ── THE OTHER WRITER: THE REVEAL ───────────────────────────────────────────────────────────────
 * `revealBubbles` (`components/nina/ChatScreen.tsx`) appends the poll's bubbles one `sleep` apart,
 * from inside a state updater — so what it appends must be decided against the list AS REACT WILL
 * COMMIT IT, not as the caller last saw it: a merge can land in any gap between two sleeps. Both
 * shapes below are restated structurally rather than imported, for the same reason `LiveMessage`
 * above is: `SentBubble` lives in the `'use server'` module `lib/nina/actions.ts`, `ChatMessage`
 * in `components/nina/types.ts`, and this file keeps to the conversation's rule with neither.
 */

/**
 * The poll's DTO for one of her rows — `SentBubble` in `lib/nina/actions.ts`, restated. A
 * structural twin, held to the real thing by `tsc` at the call site rather than by an import: the
 * caller passes `SentBubble[]`, so if that type ever stops matching, the caller stops compiling.
 */
export interface PollBubble {
  id: string
  body: string
  replyToId: string | null
}

/**
 * The row `revealBubbles` appends for one of her bubbles — the nina half of `ChatMessage`
 * (`components/nina/types.ts`), restated. `appendNewBubbles` returns `(T | RevealRow)[]`, which is
 * assignable to `ChatMessage[]` exactly while every REQUIRED `ChatMessage` field is present here —
 * so widening the component type with a required field fails at the call site instead of silently
 * dropping it from her new bubbles.
 */
export interface RevealRow extends LiveMessage {
  role: 'nina'
  body: string
  dayISO: string
  state: 'sent'
  replyToId: string | null
}

/**
 * Append the poll's bubbles to the list on screen — but only the ones it does not already hold.
 *
 * This is the function the prod "gj" duplication (2026-09-11: four `nina_messages` rows, seven
 * bubbles rendered) bought. `revealBubbles` used to append each polled bubble unconditionally, and
 * a refresh landing mid-reveal left the list with the same id twice — once from
 * `mergeServerMessages`'s pre-delivery, once from the still-running reveal. The fix lives where the
 * second writer lives: the id check runs INSIDE the updater, against the state React will actually
 * commit, so it holds for every interleaving rather than for the ones a caller can foresee.
 *
 * Returns the **same array reference** when nothing is new — an empty batch, or a batch the merge
 * has already delivered — so the state update becomes a no-op for React instead of a re-render:
 * the same bail-out `mergeServerMessages` gives the refresh, on the other channel.
 *
 * `current` is a plain `T[]`, not `readonly`, so the nothing-new branch can return it as the next
 * state with no cast anywhere — `mergeServerMessages` needed `as ChatMessage[]` at its call site
 * because its bail-out type includes its `readonly` input's shape; this function does not inherit
 * that.
 */
export function appendNewBubbles<T extends LiveMessage>(
  current: T[],
  bubbles: readonly PollBubble[],
  dayISO: string,
): (T | RevealRow)[] {
  const seen = new Set(current.map((message) => message.id))
  const fresh = bubbles.filter((bubble) => {
    /* The id joins the set AS IT PASSES, not afterwards: a batch that carried one id twice would
     * otherwise append it twice. `listNinaMessagesAfter` cannot produce that today — row ids are
     * unique — but the promise this function makes is about ids, not about one caller's current
     * impossibility. */
    if (seen.has(bubble.id)) return false
    seen.add(bubble.id)
    return true
  })
  if (fresh.length === 0) return current

  return [
    ...current,
    ...fresh.map(
      (bubble): RevealRow => ({
        id: bubble.id,
        role: 'nina',
        body: bubble.body,
        // An input, not a computation — this stays a pure function `vitest` can prove without a
        // clock. `planReveal` made the same call, for the same reason.
        dayISO,
        state: 'sent',
        /*
         * HER OWN QUOTE. She may have replied to a specific message, and the server puts her
         * `reply_to_id` on the FIRST bubble only ("a four-bubble reply is one answer to one
         * message"). A hard `null` here would mean the quote only appeared on the next server
         * render of `/nina`. (Moved verbatim with the row it described, from the inline literal
         * this function replaced in `revealBubbles`.)
         */
        replyToId: bubble.replyToId,
      }),
    ),
  ]
}
```

**Impact:** additive only — nothing imports this file except `ChatScreen` (line 32) and its own test, so no other consumer can shift. The helper is pure: no clock, no React, no server import; `environment: 'node'` vitest can prove all of it.

### Step 2: The call site in `revealBubbles`

**File:** `components/nina/ChatScreen.tsx:32` — the import line.

**Code (old):**
```ts
import { SW_MESSAGE_TYPE, mergeServerMessages } from '@/lib/nina/live'
```
**Code (new):**
```ts
import { appendNewBubbles, SW_MESSAGE_TYPE, mergeServerMessages } from '@/lib/nina/live'
```

**File:** `components/nina/ChatScreen.tsx:1037-1076` — the whole `revealBubbles` docstring and body. Replace the old block (quoted below so the implementer can verify the anchor) with the new block. Nothing else in the file changes.

**Code (old — for anchoring only, do not keep):**
```tsx
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

**Code (new — complete replacement):**
```tsx
  /**
   * RU-5's staggered reveal, lifted verbatim out of `handleSend` so the SEND path and the POLL path
   * cannot drift into two different rhythms. It is the only writer of `typing` besides the poll's
   * own start and stop.
   *
   * It guards on `alive.current` at every timed step, and on `id` presence at the append — the one
   * other guard it has, and the reason it can share a list with `mergeServerMessages`. Callers are
   * sequential by construction — the poll loop awaits this before deciding whether to keep polling
   * — so there is no second reveal to interleave with, and the single `timer` handle stays safe.
   *
   * ── WHY THE APPEND SKIPS IDS ALREADY ON SCREEN (prod "gj", 2026-09-11: 4 rows, 7 bubbles) ────
   * Every bubble here used to be appended unconditionally, and on prod session "gj" that rendered
   * seven bubbles from the four rows the database holds. A full-route RSC delivery of `/nina` had
   * landed mid-reveal — its `read_at` sits 14 ms after the turn's INSERT, so its payload carried
   * all four committed rows — and `mergeServerMessages`, correctly by its own rule, delivered the
   * three bubbles the reveal had not reached yet. The reveal then appended its own copies of the
   * same `nina_messages.id`s: two channels into one list, and only the merge deduped. The guard
   * sits INSIDE the updater (`appendNewBubbles`), so the check reads the list as React will commit
   * it — a merge that lands in any gap between two sleeps is already on screen for the next
   * iteration.
   *
   * ── WHY THE GUARD LIVES HERE AND NOT IN THE MERGE ────────────────────────────────────────────
   * Because the merge is already correct: server order, local content, id-deduped — the sanctioned
   * ONE-FRAME delivery for a refresh, whose contract the header above documents for a COMPLETED
   * list. The defect was the other writer holding no contract at all, and that defect is one
   * missing `id` check wide. Making the merge reveal-aware (routing new nina rows through the
   * stagger) would put a second writer on the reveal's rhythm to fix it. What a mid-reveal merge
   * still does — collapse the remaining stagger into one frame — is cosmetic, and explicitly
   * accepted (invariant 4 of `NINA_DUP_BUBBLE_REVEAL_PLAN.md`); what it can no longer do is render
   * an id twice.
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
      /*
       * The APPEND alone is idempotent — `appendNewBubbles` returns the list untouched when the
       * merge has already delivered this id. The SLEEP above is not skipped: the stagger is keyed
       * to the batch as the poll received it, and pruning the plan for ids already on screen would
       * need a synchronous read of `messages` that this updater-only shape deliberately refuses as
       * a second source of truth. So a mid-reveal merge can leave a gap where a bubble already
       * sits — the accepted collapse — while the id itself can no longer appear twice.
       */
      setMessages((current) => appendNewBubbles(current, [bubble], todayInJakarta()))
    }
    setTyping(false)
  }, [])
```

**Impact:** the happy path is byte-for-byte behavior-identical (same gaps from `planReveal`, same typing cadence, same row shape with `todayInJakarta()` evaluated per bubble as before, same `alive.current` bail-outs, same `useCallback` deps — still `[]` because the closure reads no state). The only behavioral change: when the list already holds a bubble's id, the updater returns the same reference and React skips the render. `SentBubble` remains the loop's input type — `PollBubble` is `lib`'s structural view of it, and `SentBubble` is assignable to `PollBubble` field-for-field.

### Step 3: The tests

**File:** `lib/nina/live.test.ts:3` — the import line.

**Code (old):**
```ts
import { SW_MESSAGE_TYPE, mergeServerMessages } from './live'
```
**Code (new):**
```ts
import { appendNewBubbles, SW_MESSAGE_TYPE, mergeServerMessages } from './live'
```

**File:** `lib/nina/live.test.ts` — append this `describe` block at the end of the file (after the `mergeServerMessages` describe, which ends at line 70).

**Code (complete):**
```ts
describe('appendNewBubbles', () => {
  /**
   * The poll's DTO (`SentBubble` in `lib/nina/actions.ts`), restated structurally for the same
   * reason `Row` above is: the real one lives in a `'use server'` module, and a test of a pure
   * rule needs none of it.
   */
  const bubble = (id: string, body = `body of ${id}`, replyToId: string | null = null) => ({
    id,
    body,
    replyToId,
  })

  it('appends every bubble when none of their ids are on screen — the happy poll path', () => {
    const current = [row('user-1')]
    const appended = appendNewBubbles(
      current,
      [bubble('b1'), bubble('b2'), bubble('b3'), bubble('b4')],
      '2026-09-11',
    )
    expect(appended.map((m) => m.id)).toEqual(['user-1', 'b1', 'b2', 'b3', 'b4'])
  })

  it('returns the SAME REFERENCE for an empty batch, so React bails out of the update', () => {
    /* The poll that heard nothing. Without the bail-out, every poll tick that brought nothing
     * would still re-render the whole conversation for a list that did not change. */
    const current = [row('user-1')]
    expect(appendNewBubbles(current, [], '2026-09-11')).toBe(current)
  })

  it('returns the SAME REFERENCE when the merge already delivered every id — the merge-won case', () => {
    /* A refresh whose payload carried the whole turn: the reveal's batch is spent before its first
     * `sleep` resolves, and the only correct answer is to append nothing at all. */
    const current = [row('user-1'), row('b1'), row('b2'), row('b3'), row('b4')]
    const batch = [bubble('b1'), bubble('b2'), bubble('b3'), bubble('b4')]
    expect(appendNewBubbles(current, batch, '2026-09-11')).toBe(current)
  })

  it('skips only the ids already present, and appends the rest IN ORDER — the measured interleaving', () => {
    /* prod session "gj", 2026-09-11, the shape that produced the report: the merge pre-delivered
     * b1's three siblings after the reveal had appended b1, so the list held b1 and the batch
     * [b1..b4] had exactly [b2, b3, b4] left to add. The old unconditional append added all four
     * instead — that is where the 7-bubble screen came from. */
    const current = [row('user-1'), row('b1')]
    const appended = appendNewBubbles(
      current,
      [bubble('b1'), bubble('b2'), bubble('b3'), bubble('b4')],
      '2026-09-11',
    )
    expect(appended.map((m) => m.id)).toEqual(['user-1', 'b1', 'b2', 'b3', 'b4'])
    // Something WAS appended, so the reference must have changed — the bail-out is for the
    // nothing-new cases the two tests above pin, not a blanket identity.
    expect(appended).not.toBe(current)
  })

  it('builds the exact row shape `revealBubbles` has always appended — nothing more, nothing less', () => {
    /* The construction moved here from the inline literal in `ChatScreen`; this is the assertion
     * that it did not change on the way. A field gained or renamed here desyncs the reveal from
     * what the merge builds for the same row. */
    const appended = appendNewBubbles([], [bubble('b1', 'she replied', 'user-1')], '2026-09-11')
    expect(appended[0]).toEqual({
      id: 'b1',
      role: 'nina',
      body: 'she replied',
      dayISO: '2026-09-11',
      state: 'sent',
      replyToId: 'user-1',
    })
  })

  it('appends an id the batch itself repeats exactly once', () => {
    /* `listNinaMessagesAfter` cannot return one row twice today — ids are unique — but the promise
     * is about ids, so the batch feeds the same seen-set the list does. */
    const appended = appendNewBubbles([row('user-1')], [bubble('b1'), bubble('b1')], '2026-09-11')
    expect(appended.map((m) => m.id)).toEqual(['user-1', 'b1'])
  })
})
```

**Impact:** the existing `describe('SW_MESSAGE_TYPE')` and `describe('mergeServerMessages')` blocks are untouched; the file's `row()` factory (line 15) is reused, keeping the whole file on structural rows. `noUncheckedIndexedAccess` is on — `appended[0]` is `(Row | RevealRow) | undefined`, which `expect(...).toEqual(...)` accepts, so no `as` is needed anywhere in the tests.

## Verification

All commands run from `/home/miftah/.worktrees/run-insights/nina-dup-bubble-reveal`.

**Format:** `npx prettier --check lib/nina/live.ts lib/nina/live.test.ts components/nina/ChatScreen.tsx`
**Tests:** `npx vitest run lib/nina/live.test.ts lib/nina/reveal.test.ts` (the touched suite plus its nearest neighbor), then the full gate `npm test`
**Types:** `npm run typecheck` (= `next typegen && tsc --noEmit` — vitest does not typecheck; run this or the errors surface only in a deploy)

**Worktree caveat (from prior landings, holds here):** this worktree's `node_modules` is a SYMLINK to the primary checkout. That passes vitest and tsc but Turbopack's build rejects it, so a full `next build` is NOT runnable here as-is; the typecheck gate above is this phase's build evidence, and the land worktree runs the real union gate (real install + build) at merge time. `.env.local` is present.

**Manual check (optional, the illusion's feel):** send a message in `/nina` on a local prod build and watch the four bubbles stagger as before — the rhythm must be indistinguishable from `origin/main`. The behavioral delta only exists under a mid-reveal refresh, which is not practically stageable by hand; the unit tests are the proof for that case.

**Exit criteria:** for every interleaving of (poll batch, merge delivery) — none, partial overlap, full overlap — the rendered list contains each `nina_messages.id` at most once, proven by the four interleaving tests; `appendNewBubbles` returns the same array reference when nothing is new; `npm test` and `npm run typecheck` pass; the staggered reveal's happy path is unchanged (same `planReveal` gaps, typing indicator, `alive` guard).

## Handoffs

- **The racing render's trigger** (which event produced the mid-reveal RSC delivery — `NinaUnreadSync`, a reload, framework revalidation) stays indeterminate, per the plan set's declared out-of-scope. Nothing to hand to another phase: the fix is trigger-independent by construction (the guard sits inside the updater), and the analysis document records the search's dead ends. No other phase exists in this set.
- **Nothing else found** that belongs to another phase: no other call site appends nina rows (`handleSend`'s literal at line 1412 is the runner's own optimistic user row, a different shape and a different requirement), and `revealBubbles`'s only caller is the poll loop (line 1158), whose contract — including the doc-commented rule at line 742 that some paths MUST NOT call the reveal — is untouched.

## Rollback

Three files, no migrations, no data, no config:

    git checkout -- lib/nina/live.ts lib/nina/live.test.ts components/nina/ChatScreen.tsx

or, once committed, `git revert` the single commit on `feature/nina-dup-bubble-reveal`. The set as a whole rolls back the same way — one branch, one merge.
