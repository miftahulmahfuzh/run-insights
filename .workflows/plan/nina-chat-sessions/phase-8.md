# Phase 8: The unread dot clears itself on the newest session

**Plan set:** `NINA_CHAT_SESSIONS_PLAN.md`
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Satisfies:** R9 — the red dot on the Nina tab disappears on its own once he has opened the chat that raised it, with no navigation and no polling
**Depends on:** Phase 5 (which is itself downstream of 1, 2, 3) — this phase edits `app/nina/page.tsx` after phase 5 has deleted its header
**Difficulty:** EASY
**Package:** `components/nina` (+ one new pure module in `lib/nina`)

---

## Goal

After this phase, opening a chat clears the dot **in the same visit**: the page still marks the
session read in `after()`, and the screen then asks the server once for a fresh render so the tab
bar it is carrying agrees with what the runner just read. Mark-read becomes **session-scoped** (so
opening one conversation cannot mark another one's messages read) while the count stays **global**
(so "unread in an older session" still raises a dot, and the partial index
`nina_messages_user_unread_idx` is still the index that answers it, unchanged). Nothing polls, and
no `revalidatePath` is called from a render path — the docs say it does not belong there, and §
"Decisions" below shows the receipt.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no column, no config key.

**Renames:** nothing.

**Creates:**
- `lib/nina/unread.ts` — `ReadableMessage` (interface), `hasUnreadFromNina`, `UnreadSyncState`
  (interface), `shouldRefreshUnreadDot`
- `lib/nina/unread.test.ts` — the vitest suite for both rules (invariant 7)
- `components/nina/NinaUnreadSync.tsx` — `NinaUnreadSync` (`'use client'`, renders `null`)

**Signature changes:** none authored here. This phase only *calls* phase 1's session-scoped
`markNinaMessagesRead`.

**Modifies:**
- `components/nina/NinaUnreadBadge.tsx` — **docstring only**. The rendered element, the query it
  calls, `getUserId`, the `role="status"`/`aria-label` and `NinaUnreadBadgeSlot` are byte-identical.
  The "WHEN IT UPDATES" section currently documents the bug as intended behaviour, and leaving that
  paragraph in place after fixing it is how the next reader re-introduces it.
- `app/nina/page.tsx` — three edits: the import list, one `const` plus a session-scoped `after()`
  call where the global one is today (line 256 on `main`), and one `null`-rendering child mounted
  inside `<AppShell>`.

**Requires (from earlier phases):**
1. **Phase 1** exports a session-scoped mark-read from `lib/nina/queries.ts`.
   **✅ RECONCILED to phase 1's actual shape**, which is the options bag:
   `markNinaMessagesRead(userId, opts?: { sessionId?: string; now?: Date })`. This plan originally
   wrote `markNinaMessagesRead(userId, activeSessionId)`; the call below now reads
   `markNinaMessagesRead(userId, { sessionId: activeSessionId })`. Phase 1 moved `now` from a
   positional parameter into that bag **for this phase's benefit** — its contract says so: a
   `sessionId` behind an optional `now` would have forced
   `markNinaMessagesRead(userId, undefined, id)` here. Nothing else in this phase depends on the
   shape.
2. **Phase 1** leaves `countUnreadNinaMessages(userId)` callable with **no session argument**, and
   still `role = 'nina' AND read_at IS NULL` across all sessions, so it keeps reading
   `nina_messages_user_unread_idx`. `NinaUnreadBadge` calls it exactly as it does today.
   **✅ RECONCILED: phase 1 did exactly that.** Its contract widens the signature to
   `countUnreadNinaMessages(userId, opts?: { sessionId?: string })` — the parameter is **optional**,
   and omitting it means precisely what it means today. The global predicate stands, the partial
   index still serves it, and no new index is needed. H2's feared conflict did not occur.
3. **Phase 3** resolves the active session inside `NinaPage` and leaves its id in scope before the
   `after()` call, and leaves the session's messages in `rows`. This plan names them
   `activeSessionId: string | null` and `rows`. Phase 3 also owns "what happens when there is no
   session at all" (R11's last-session case); this phase handles `null` by doing nothing.
4. **Phase 5** has deleted `app/nina/page.tsx`'s `<header>` (R7), so the `<AppShell>` body starts
   with phase 5's / phase 2's mounts and `<ChatScreen>`. The snippets below are quoted
   post-phase-5.
5. **Phase 2** hides `TabBar` on `/nina` and is the only editor of `components/ui/AppShell.tsx`,
   which renders `NinaUnreadBadgeSlot`. See "What 'the dot disappears' means when the bar is
   hidden".

**Leaves alone (owned by others):** `lib/db/schema.ts`, `drizzle/*` (Phase 1) · `lib/nina/queries.ts`
(Phase 1) · `components/ui/AppShell.tsx`, `components/ui/TabBar.tsx`, `lib/nina/chrome.ts`,
`components/nina/ChatChrome.tsx` (Phase 2) · `components/nina/ChatScreen.tsx`, `lib/nina/actions.ts`,
`lib/nina/gateway.ts`, `lib/nina/load.ts`, `lib/nina/proactive.ts`, `lib/nina/imagejobs.ts`,
`lib/nina/sessionActions.ts` (Phase 3) · `scripts/check-llm-payload-boundary.mjs` (Phase 4) ·
`components/nina/NinaSidebar.tsx` and its rows (Phase 5) · `lib/nina/search.ts` (Phase 6) ·
`components/nina/MessageBubble.tsx`, `MessageList.tsx`, `lib/nina/messageActions.ts` (Phase 7) ·
`components/nina/ChatImages.tsx`, `components/ui/PhotoViewer.tsx` (Phase 9).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/unread.ts` | create | the two pure rules: "was anything of hers unread in what this render is delivering" and "should the screen ask for one fresh render" |
| `lib/nina/unread.test.ts` | create | vitest suite for both (`environment: 'node'`, no jsdom — invariant 7) |
| `components/nina/NinaUnreadSync.tsx` | create | 'use client', renders `null`, fires **at most one** `router.refresh()` per change of the flag |
| `components/nina/NinaUnreadBadge.tsx` | modify | docstring only (`:20-27`, the "WHEN IT UPDATES" block): the dot is no longer "deliberately not live" on `/nina` |
| `app/nina/page.tsx` | modify | imports (`:22-29`), `hadUnread` + session-scoped `after()` (`:248-256`), mount `<NinaUnreadSync>` inside `<AppShell>` (`:258-287`) |

---

## Decisions, with the reasoning

### D1. `revalidatePath` inside `after()` is the wrong fix, and the docs say so

`markNinaMessagesRead`'s docstring (`lib/nina/queries.ts:598`) anticipates "a `revalidatePath` when
[rows] did [change]", and no caller ever made that call. Checked against this repo's Next —
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`, Next 16.3.1:

> `revalidatePath` can be called in **Server Functions and Route Handlers**.
> - **Server Functions**: Updates the UI immediately (if viewing the affected path). Currently, it
>   also causes all previously visited pages to refresh when navigated to again.
> - **Route Handlers**: Marks the path for revalidation. The revalidation is done on the next visit.

A page render is neither. Three consequences, each independently fatal here:

1. **There is nothing to invalidate.** `/nina` awaits `requireUserId()` (cookies), so it is a
   dynamic render with no Full Route Cache entry. `revalidatePath('/nina')` would expire an entry
   that does not exist.
2. **There is no channel to the client.** A Server Function's revalidation rides back on the
   action's own response, which is why it "updates the UI immediately". `after()` runs *after the
   response is finished* (`after.md`: "schedule work to be executed after a response … is
   finished") — the HTML and the RSC payload, dot included, are already on the wire.
3. **It is undocumented in this position.** The API reference lists exactly two call sites and this
   is not one of them; AGENTS.md is explicit that this Next is not the one in training data, so
   "it probably still works" is not a basis to ship.

So the transition unread→read cannot be pushed from the server on this request. It has to be
**pulled** by the client that is already on the screen — once.

### D2. The fix: one `router.refresh()`, decided by a pure rule, at most once per flag change

Same reference, `use-router.md`, Next 16.3.1:

> `router.refresh()`: Refresh the current route. Making a new request to the server, re-fetching
> data requests, and re-rendering Server Components. The client will merge the updated React Server
> Component payload **without losing unaffected client-side React (e.g. `useState`) or browser
> state (e.g. scroll position)**. This clears the Client Cache for the current route…

That is exactly the shape needed: `AppShell` — and therefore `NinaUnreadBadgeSlot` — is rendered
*by* `app/nina/page.tsx`, so it is part of `/nina`'s own payload, and a refresh re-runs
`countUnreadNinaMessages` after `after()` has already committed the UPDATE. `ChatScreen`'s state
survives (the docs' guarantee, and `mergeServerMessages` returns the *same array reference* when
the refreshed list brings nothing new, so React bails out of the render entirely —
`lib/nina/live.ts`).

**This is not polling.** The rejected design in `NinaUnreadBadge`'s docstring is a tick: "a poll
burns a serverless invocation per tick to learn nothing on almost every tick". This is one extra
server render per opening of `/nina`, **and only when the render actually delivered something
unread** — zero when there was nothing to clear, which is the overwhelmingly common case. There is
no timer, no interval, no `setTimeout`.

**The trigger is free.** `messageColumns` already projects `read_at` (`lib/nina/queries.ts:403`) and
`NinaMessageRow.readAt: Date | null` (`:110`) is on every row the page already read, and no
component reads it today. So "was anything of hers unread in what I am about to mark read" is a
pure pass over `rows` — **no extra query, no second count**, which is also why the mechanism cannot
disturb the partial index.

**Rejected alternatives:**
- *A client-side read receipt through a new Server Action* (mark read + `revalidatePath('/', 'layout')`,
  which the docs say purges the whole Client Cache). It is race-free and it would also fix the
  back-navigation residue in D6 — but it is a new `'use server'` surface and a second mark-read
  caller, and this phase is explicitly the smallest in the set. Recorded as Handoff H3 with the
  exact shape, to be built only if D6's residue is observed.
- *A `revalidatePath` from `sendNinaMessage`.* `lib/nina/actions.ts:49` already rules that out for
  its own reason: it "would re-render the server component in the same response and race the reveal"
  (RU-5). Untouched here.
- *Suppressing the dot from `AppShell` when the chrome is `/nina`'s.* Cheaper still — but
  `AppShell.tsx` is phase 2's file, and it does not converge the *other* tabs. Handoff H1.

### D3. What "the most recent chat" means under sessions: read per session, count globally

- **Mark-read is session-scoped.** Opening session A must not stamp `read_at` on session B's
  messages: those are a different conversation he has not looked at, and clearing them would make
  the dot lie in the direction that loses information. Phase 1 wrote the session-scoped query; this
  phase calls it with the active session.
- **The count stays global** — `role = 'nina' AND read_at IS NULL` across every session, which is
  the query as it stands today and therefore the partial index
  `nina_messages_user_unread_idx (user_id, seq) WHERE read_at IS NULL AND role = 'nina'` as it
  stands today. The dot means "there is something of hers you have not seen", which is true whether
  it sits in the newest session or an older one.
- **The two compose into R9 exactly as asked.** Assumption A3 puts every proactive message in the
  *most recent* session, so the messages that raise the dot in practice are in the session `/nina`
  opens by default (A4) — open it, they are marked read, the count goes to zero, the dot goes. And
  for existing users there is no residue at all: phase 1's backfill puts every pre-session message
  into one session, which is that user's most recent, so the whole historical backlog is cleared by
  the first visit.
- **The one case where the dot survives a visit is a case where it should**: an unread message in an
  older session. It clears the moment he opens that session from the sidebar. That is not a stale
  dot, it is an accurate one.

### D4. Opening the sidebar does not count as opening the chat

It lists titles and search results; it does not show a single message body. Mechanically this needs
no code: phase 5's sidebar is an overlay in the same tree (no navigation, no server render of a
session), so nothing marks anything read until he taps a row and lands on `/nina?s=<id>`, which is a
render and therefore a mark. Stated here so that nobody later "fixes" the sidebar by marking read on
open.

### D5. The fix stays anchored to `after()`

`app/nina/page.tsx:248-256` argues the ordering and the argument is untouched by this phase: a
render must not have a side effect (Next may render a segment more than once, and the mark must not
fire for a response that never reached the browser). So the UPDATE stays in `after()`; what this
phase adds is a *reader* of the same fact, computed during the render, that tells the client the
next render will be different.

### D6. The two residues, stated rather than hidden

1. **The `after()` race.** `after()` runs on the same invocation once the response is finished; the
   client's refresh needs a full browser round trip. The UPDATE (one indexed statement) will have
   committed long before the refresh request is served in every realistic case, but it is not
   *ordered* by anything. If the refresh ever loses that race, the refreshed render still reports
   `hadUnread === true`, the flag does not change value, the effect does not re-run, and the dot
   clears on the next navigation — i.e. exactly today's behaviour. **No loop is possible**: the
   effect fires only when the flag's value changes. A nonce-per-render prop that would force a
   second attempt was considered and rejected: it buys a sub-100 ms window at the cost of a concept,
   a second server render, and a prop whose only job is to be different every time.
2. **Back/forward to a tab whose payload predates the read.** Per the glossary
   (`01-app/04-glossary.md`, "Client Cache"): "Pages are not cached by default but **are reused
   during browser back/forward navigation**", and `router.refresh()` clears the Client Cache "for
   the current route" only. So a forward `<Link>` navigation off `/nina` always re-renders and the
   dot is correct, while a *back gesture* to `/` may restore the payload that was rendered before he
   read. Only a Server Function's `revalidatePath('/', 'layout')` purges the whole Client Cache, and
   that is Handoff H3. Note the mirror case is *improved* by this phase: a back gesture **into**
   `/nina` restores a cached payload with no server render at all — so nothing would be marked read
   — and this phase's flag arrives in that cached payload still `true`, which makes the sync fire
   and turns a dead restore into one real render that marks it read.

### D7. What "the dot disappears" means when the bar carrying it is hidden

Phase 2 hides `TabBar` on `/nina` (R1: the chat is full-screen, the bar comes back on a floating
`^`). `components/ui/AppShell.tsx` is still what renders `NinaUnreadBadgeSlot`, and it is still
rendered *inside `/nina`'s payload* whether phase 2 hides the bar by transform or omits it. So on
`/nina` there are exactly three places the answer shows up, and this phase covers all three:

- **The revealed bar.** Pull the bar up with `^` after reading and the badge is the one from this
  render — post-refresh, so no dot. Without this phase it would be the pre-read payload, dot
  painted, which is the user's report in its most literal form.
- **The next screen.** Any forward navigation re-renders that screen's badge against a table where
  `read_at` is set. This already worked; the refresh does not disturb it.
- **A back gesture into `/nina`.** See D6.2.

If phase 2 ends up *omitting* `NinaUnreadBadgeSlot` on `/nina` rather than hiding the bar that holds
it, this phase still does its job (the refresh is about the count, not about the node), and H1
becomes redundant rather than wrong.

---

## Implementation Steps

### Step 1: The pure rules

**File:** `lib/nina/unread.ts` (new)
**Change:** two decisions, in the one place invariant 7 allows them to be tested — `vitest.config.ts`
runs `environment: 'node'`, so a rule that lives inside a component cannot be asserted at all. The
row type is declared **structurally** rather than imported from `lib/nina/queries.ts`, copying
`lib/nina/live.ts`'s `LiveMessage` precedent: phase 1 widens `NinaMessageRow` with `sessionId`,
phase 7 may add `editedAt`, and neither may break this file.

**Code:**

```ts
/**
 * R9's two decisions: whether the render that is happening now is delivering something the runner
 * has not read, and whether the screen should therefore ask the server for one fresh render.
 *
 * ── WHY THERE IS A MODULE HERE AT ALL ─────────────────────────────────────────────────────────
 * Invariant 7. `vitest.config.ts` runs `environment: 'node'` and there is no jsdom in this repo, so
 * a rule that lives inside `NinaUnreadSync` is a rule nothing can assert. The component keeps the
 * `useEffect` and the ref; the *decision* lives here. `lib/nina/chatview.ts` and `lib/nina/reveal.ts`
 * are the shape being copied.
 *
 * ── WHY THE ROW TYPE IS STRUCTURAL ────────────────────────────────────────────────────────────
 * `lib/nina/live.ts`'s `LiveMessage` precedent, and for the same reason: `NinaMessageRow` gains a
 * `session_id` in phase 1 and may gain an `edited_at` in phase 7, and neither has anything to do
 * with this question. Two fields is the whole dependency.
 *
 * ── WHY THIS IS NOT A QUERY ───────────────────────────────────────────────────────────────────
 * `app/nina/page.tsx` has already read the session's rows, and `messageColumns` already projects
 * `read_at` (`lib/nina/queries.ts:403`), so the answer is a pass over an array that is in memory.
 * A second `count(*)` here would be a query added to a render path to learn something the render
 * path already knows — and the schema is emphatic that the unread predicate is the one place in
 * this feature where an extra scan would be felt.
 */

/** The two columns the rule needs. Any `NinaMessageRow` satisfies it. */
export interface ReadableMessage {
  role: 'runner' | 'nina'
  readAt: Date | null
}

/**
 * Was anything of **hers** unread among the rows this render is delivering?
 *
 * `role === 'nina'` because the runner's own messages are never unread to him and the dot's query
 * says the same thing (`role = 'nina' AND read_at IS NULL`). Keeping the two predicates spelled
 * identically is deliberate: this function's whole job is to predict what
 * `countUnreadNinaMessages` will return after `markNinaMessagesRead` has run.
 *
 * The rows are the ACTIVE SESSION's window (phase 3 scopes the read, phase 4's `CHAT_HISTORY_LIMIT`
 * caps it at 200). Both narrowings are the right ones: mark-read is session-scoped, and unread
 * messages are by construction the newest, so they are inside the window. A conversation with more
 * than 200 unread messages of hers in one session would answer `true` anyway — the newest 200
 * contain them.
 */
export function hasUnreadFromNina(rows: readonly ReadableMessage[]): boolean {
  return rows.some((row) => row.role === 'nina' && row.readAt === null)
}

/** What `NinaUnreadSync` knows when it decides. */
export interface UnreadSyncState {
  /** `hasUnreadFromNina` over the rows of the render currently on screen. */
  hadUnread: boolean
  /**
   * The `hadUnread` value this mount has already reacted to, or `null` before the first reaction.
   * Held in a ref by the component, which is why it is a parameter here and not module state.
   */
  syncedFor: boolean | null
}

/**
 * Should the screen ask the server for one fresh render?
 *
 * Only when this render delivered something unread — the render whose `after()` is marking it read
 * — and only once per value of that flag. That second clause is the whole safety argument:
 *
 *   - a render with nothing unread asks for nothing, so an ordinary visit costs zero extra work;
 *   - a refresh that succeeds flips the flag to `false`, which is not a refreshable state, so the
 *     sequence terminates after exactly one extra render;
 *   - a refresh that raced `after()` and lost leaves the flag `true` — the same value already
 *     reacted to — so it does NOT retry. The dot then clears on the next navigation, which is the
 *     pre-R9 behaviour, and an unterminated refresh loop (the one genuinely bad failure available
 *     here) is unreachable;
 *   - a message that arrives later and is delivered by phase 11's service-worker refresh flips the
 *     flag `false` → `true` again, so it is reacted to again. One refresh per arrival, not per tick.
 */
export function shouldRefreshUnreadDot({ hadUnread, syncedFor }: UnreadSyncState): boolean {
  if (!hadUnread) return false
  return syncedFor !== hadUnread
}
```

**Impact:** new pure module, no runtime behaviour on its own. Nothing imports it until step 3.

---

### Step 2: The suite

**File:** `lib/nina/unread.test.ts` (new)
**Change:** assert both rules, including the two properties that would be invisible if broken — that
a clean visit asks for nothing, and that a lost race does not retry.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { hasUnreadFromNina, shouldRefreshUnreadDot, type ReadableMessage } from './unread'

/**
 * Rows are built structurally rather than imported from `lib/nina/queries.ts`, matching
 * `lib/nina/live.test.ts`'s reasoning: phase 1 widens `NinaMessageRow` with a session and phase 7
 * may widen it again, and neither should be able to break the rule this file is about.
 */
const hers = (readAt: Date | null): ReadableMessage => ({ role: 'nina', readAt })
const his = (readAt: Date | null): ReadableMessage => ({ role: 'runner', readAt })

const READ_AT = new Date('2026-09-04T12:00:00.000Z')

describe('hasUnreadFromNina', () => {
  it('is false for an empty conversation', () => {
    expect(hasUnreadFromNina([])).toBe(false)
  })

  it('is false when everything of hers is already read — the ordinary second visit', () => {
    /* The property that keeps this cheap: a visit with nothing to clear must ask for no extra
     * render at all, which is what makes the fix not-a-poll. */
    expect(hasUnreadFromNina([his(null), hers(READ_AT), his(null), hers(READ_AT)])).toBe(false)
  })

  it('IGNORES the runner’s own unread rows', () => {
    /* `read_at` is only ever stamped on hers, so his rows are null forever. Counting them would
     * make every render refreshable and turn this into an infinite loop on the first visit. */
    expect(hasUnreadFromNina([his(null), his(null)])).toBe(false)
  })

  it('is true when one message of hers is unread', () => {
    expect(hasUnreadFromNina([his(READ_AT), hers(READ_AT), hers(null)])).toBe(true)
  })

  it('matches the dot’s own predicate: role nina AND read_at IS NULL', () => {
    expect(hasUnreadFromNina([hers(null)])).toBe(true)
    expect(hasUnreadFromNina([hers(READ_AT)])).toBe(false)
  })
})

describe('shouldRefreshUnreadDot', () => {
  it('refreshes once on the render that delivered unread messages', () => {
    expect(shouldRefreshUnreadDot({ hadUnread: true, syncedFor: null })).toBe(true)
  })

  it('does NOT refresh when nothing was unread', () => {
    expect(shouldRefreshUnreadDot({ hadUnread: false, syncedFor: null })).toBe(false)
    expect(shouldRefreshUnreadDot({ hadUnread: false, syncedFor: true })).toBe(false)
    expect(shouldRefreshUnreadDot({ hadUnread: false, syncedFor: false })).toBe(false)
  })

  it('does NOT refresh twice for the same flag — the lost-race case, and the loop guard', () => {
    /* If the refresh arrived before `after()` committed the UPDATE, the refreshed render still says
     * `true`. Retrying here is what would turn one stale dot into an unbounded loop of server
     * renders; the dot instead clears on the next navigation, exactly as it did before R9. */
    expect(shouldRefreshUnreadDot({ hadUnread: true, syncedFor: true })).toBe(false)
  })

  it('refreshes again when a LATER arrival flips the flag back on', () => {
    /* Phase 11's service worker calls `router.refresh()` on a push; that render can deliver a new
     * unread message of hers. `false -> true` is a new fact and gets its own single refresh. */
    expect(shouldRefreshUnreadDot({ hadUnread: true, syncedFor: false })).toBe(true)
  })
})
```

**Impact:** `npm test` gains 9 assertions. No existing test changes.

---

### Step 3: The one-shot sync

**File:** `components/nina/NinaUnreadSync.tsx` (new)
**Change:** the client half. It renders nothing and exists only to pull one fresh render.

**Why a new file rather than an export inside `NinaUnreadBadge.tsx`:** `'use client'` is a
**file-level** directive, and `NinaUnreadBadge` is an `async` Server Component that awaits
`countUnreadNinaMessages`. The two cannot share a module. This is the phase's only new component,
it renders `null`, and no other phase touches the name.

**Code:**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { shouldRefreshUnreadDot } from '@/lib/nina/unread'

/**
 * R9. The dot the runner just read himself out of existence, actually going away.
 *
 * ── THE BUG THIS FIXES ────────────────────────────────────────────────────────────────────────
 * `app/nina/page.tsx` marks the open session read in `after()` — after the response has been sent —
 * and `NinaUnreadBadge` is a Server Component inside that same response. So the payload the runner
 * is looking at was rendered against a table where his messages were still unread, and nothing
 * re-rendered it. `NinaUnreadBadge`'s docstring used to call that "at most one navigation stale…
 * a fair trade for zero polling"; the user reported the trade as a defect, and he is right: he read
 * everything and the dot was still painted.
 *
 * ── WHY A CLIENT PULL AND NOT A SERVER PUSH ───────────────────────────────────────────────────
 * There is no push available at this point in the request. `revalidatePath` "can be called in
 * Server Functions and Route Handlers" (Next 16.3.1,
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`) — a page
 * render is neither, `/nina` is dynamic so there is no route cache entry to expire anyway, and by
 * the time `after()` runs the response is finished and the dot is already on the wire. So the
 * screen asks, once.
 *
 * `router.refresh()` is the documented tool for exactly this: it re-renders the Server Components
 * of the current route and "the client will merge the updated React Server Component payload
 * without losing unaffected client-side React (e.g. `useState`) or browser state (e.g. scroll
 * position)" (`use-router.md`). `AppShell` — and therefore `NinaUnreadBadgeSlot` — is rendered by
 * `app/nina/page.tsx`, so the badge is inside this route's payload and comes back with a count
 * taken after the UPDATE. `ChatScreen` survives untouched, and `mergeServerMessages` returns the
 * same array reference when the refreshed list brings nothing new, so the conversation does not
 * even re-render.
 *
 * ── WHY THIS IS NOT THE POLL THAT WAS REJECTED ────────────────────────────────────────────────
 * A poll "burns a serverless invocation per tick to learn nothing on almost every tick". This has
 * no timer. It fires when `hadUnread` becomes true — which is once per opening of a chat that
 * actually had something unread in it, and never on a visit with nothing to clear. `lib/nina/unread.ts`
 * owns the decision and its termination argument, and is unit-tested; this file owns only the
 * effect and the ref.
 *
 * The ref holds the flag value already reacted to, which is what makes React's development-only
 * double-invoked effect harmless (the second setup sees its own value and returns) while still
 * allowing a genuine `false -> true` flip — phase 11's service-worker refresh delivering a new
 * message — to get its own single refresh.
 */
export function NinaUnreadSync({ hadUnread }: { hadUnread: boolean }) {
  const router = useRouter()
  /* `null` and not `false`: "not yet reacted to anything" is a third state, and conflating it with
     "last saw false" would make the very first render's `true` look like a flip we had handled. */
  const syncedForRef = useRef<boolean | null>(null)

  useEffect(() => {
    const refresh = shouldRefreshUnreadDot({ hadUnread, syncedFor: syncedForRef.current })
    /* Recorded BEFORE the early return, and for both values: a `false` render is what a later
       arrival flips away from, so it has to be remembered too. */
    syncedForRef.current = hadUnread
    if (!refresh) return
    router.refresh()
  }, [hadUnread, router])

  return null
}
```

**Impact:** one `null`-rendering client component in the `/nina` bundle. On a visit with nothing
unread it does nothing at all. On a visit that cleared something it costs one extra server render of
`/nina`.

---

### Step 4: Session-scoped mark-read, and the flag

**File:** `app/nina/page.tsx:22-29` (the `lib/nina/queries` import) and `:248-256` (the `after()`
block, quoted below as it stands on `main`; phase 3 will have added the session resolution above it
and phase 5 will have removed the header below it, neither of which touches these lines)

**Change (a) — imports.** Add the two new modules. The `queries` import list is unchanged in
membership: `markNinaMessagesRead` is still the symbol, only its arguments change.

**Code:**

```tsx
import { ChatScreen } from '@/components/nina/ChatScreen'
import { NinaUnreadSync } from '@/components/nina/NinaUnreadSync'
import type { ChatMessage } from '@/components/nina/types'
import { AppShell } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf, todayInJakarta } from '@/lib/date/ranges'
import { listRunAttachments } from '@/lib/db/queries'
import { isValidId } from '@/lib/id'
import { ninaAvatarView } from '@/lib/nina/album'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  indexAttachments,
  parseNinaPhotoParam,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
import { listOpenNinaImageJobs } from '@/lib/nina/imagejobs'
import {
  getCurrentNinaAvatar,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  listNinaMessages,
  markNinaMessagesRead,
} from '@/lib/nina/queries'
import { hasUnreadFromNina } from '@/lib/nina/unread'
```

> `import Link from 'next/link'` and `import { NinaAvatar } from '@/components/nina/NinaAvatar'` are
> **phase 5's** to delete along with the header (R7). This phase does not touch either line; if
> phase 5 has landed they are already gone. `import { after } from 'next/server'` stays.

**Change (b) — the flag and the scoped mark.** Replace the whole `after()` block with the block
below, in place (`main`'s `:248-256`). `activeSessionId` is phase 3's resolved session (Requires 3).

**Code:**

```tsx
  /*
   * F33 phase 10 — the unread dot's other half, now session-scoped (R2) and no longer stale (R9).
   *
   * IN `after()` AND NOT INLINE, for the two reasons phase 10 gave and this phase does not
   * re-litigate: a render must not have a side effect (Next may render a segment more than once,
   * and PPR renders it before a request even exists), and marking read BEFORE the response is sent
   * would clear the dot for a page load that failed on the way to the browser. `after` needs no
   * request API here — `userId` and the session were resolved at the top of this component and are
   * closed over — and `markNinaMessagesRead` is one indexed UPDATE, so invariant 4 still holds.
   *
   * SESSION-SCOPED, because opening this conversation says nothing about another one. Marking
   * every session read on any visit would clear a dot raised by messages he has not seen, which is
   * the one direction of error that loses information. The dot's own COUNT stays global
   * (`countUnreadNinaMessages`, unchanged, still reading the partial index
   * `nina_messages_user_unread_idx`): "there is something of hers you have not read" is true
   * wherever it sits. Assumption A3 then makes R9 fall out — proactive messages land in the most
   * recent session, which is the one this page opens by default (A4), so opening the chat is what
   * clears them.
   *
   * `hadUnread` IS WHAT MAKES THE DOT GO AWAY WITHOUT A NAVIGATION. This render is delivering rows
   * that `after()` is about to mark read, so the badge in this very payload is already wrong.
   * `NinaUnreadSync` reads the flag and asks for exactly one fresh render — see its docstring for
   * why a `revalidatePath` from here cannot work in Next 16.3.1, and `lib/nina/unread.ts` for why
   * the sequence terminates. It costs nothing when there was nothing unread, which is most visits:
   * `read_at` is already on every row (`messageColumns`), so the flag is a pass over an array, not
   * a query.
   */
  const hadUnread = hasUnreadFromNina(rows)
  if (activeSessionId !== null) {
    after(() => markNinaMessagesRead(userId, { sessionId: activeSessionId }))
  }
```

> **✅ RECONCILED — both shapes checked against the plans as written, and the code above is final.**
> Phase 1 spelled the query with an options bag, so the call is
> `markNinaMessagesRead(userId, { sessionId: activeSessionId })` — written that way above.
> Phase 3 **does** name the resolved session `activeSessionId`, typed `string | null`
> (`const activeSessionId = chooseActiveSession(sessions, parseNinaSessionParam(sessionParam))`),
> and it **does** tolerate having none: its D3 refuses to create a session in a render path, so
> `null` is a real state both for a runner who has never messaged and for R11's runner who just
> removed his last one. **So the `if` guard stays.** `hadUnread` is computed regardless: with no
> session there are no rows, so it is `false`.

**Impact:** mark-read stops touching other sessions. `hadUnread` is a new local with no cost.

---

### Step 5: Mount the sync

**File:** `app/nina/page.tsx:258-287` (the returned tree; quoted **post-phase-5**, i.e. with the
`<header>` and its avatar `<Link>` gone — R7)
**Change:** render `<NinaUnreadSync>` inside `<AppShell>`, immediately before `<ChatScreen>`.

**Code:**

```tsx
  return (
    <AppShell screen="chat">
      {/* R9. Renders nothing. It exists so the tab bar's dot agrees with what he just read: this
          payload was built before `after()` marked the session read, so on a visit that cleared
          something the screen asks for one fresh render. See `components/nina/NinaUnreadSync.tsx`.
          Deliberately OUTSIDE `ChatScreen`, which owns the conversation and is phases 3/7/9's file;
          this is chrome bookkeeping and has no business inside the message list. */}
      <NinaUnreadSync hadUnread={hadUnread} />

      <ChatScreen
        initial={initial}
        todayISO={todayInJakarta()}
        userId={userId}
        pending={pending}
        pendingPhoto={pendingPhoto}
      />
    </AppShell>
  )
}
```

> **Do not restate phase 2's, 3's or 5's props.** **Reconciled: the prop is `screen="chat"`** —
> phase 2 renamed `AppShell`'s `bottomGap` -> `screen` (and `AppShellBottomGap` -> `AppShellScreen`),
> so the tag reads `<AppShell screen="chat">` by the time this phase opens the file, and the snippet
> above is quoted that way. Its value may become phase 2's no-bar
> case, `ChatScreen` gains a session prop from phase 3, and phase 5 mounts its sidebar and phase 2's
> `ChatChrome` in this same tree. Keep all of those exactly as they are and insert only the
> `<NinaUnreadSync>` line — its position among siblings is irrelevant because it renders `null`.

**Impact:** `/nina` now converges on a correct dot within one visit.

---

### Step 6: Stop documenting the bug as a feature

**File:** `components/nina/NinaUnreadBadge.tsx` (docstring only, replacing `:20-27`'s "WHEN IT
UPDATES" section)
**Change:** the file currently tells the next reader that the staleness is a deliberate trade. It was
— until the user filed it as R9. The component itself does not change: the count stays global (D3),
`getUserId` stays (a signed-out `AppShell` and two `loading.tsx` files still render this), and the
element, `role="status"` and `aria-label` are untouched.

**Code (the complete file):**

```tsx
import { Suspense } from 'react'

import { getUserId } from '@/lib/auth/requireUserId'
import { countUnreadNinaMessages } from '@/lib/nina/queries'

/**
 * The unread dot on the Nina tab — F33 R3's cheapest and most constant piece of proactivity. A
 * message she wrote in `after()` or in the evening cron is invisible until the runner opens the
 * app; this is what tells him there is something there.
 *
 * ── WHY A SERVER COMPONENT INSIDE A CLIENT TAB BAR ──────────────────────────────────────────────
 * `TabBar` is `'use client'` (it needs `usePathname` for `aria-current`) and a client component
 * cannot await a count. The three alternatives were all worse: a client fetch needs a route
 * handler, and D7 sanctions five of those for reasons that have not changed; a poll burns a
 * serverless invocation per tick to learn nothing on almost every tick; and threading a number down
 * from every page means editing seven call sites including two `loading.tsx` files that cannot
 * fetch at all. Passing a server-rendered node into a client component as a prop is the framework's
 * own answer, and it keeps the count out of the client bundle entirely.
 *
 * ── WHEN IT UPDATES ─────────────────────────────────────────────────────────────────────────────
 * On every server render of a tabbed screen, which in practice means every navigation — **plus one
 * render on the chat screen itself, which is R9.** This docstring used to say the dot was
 * "deliberately NOT live" and that being "at most one navigation stale is a fair trade for zero
 * polling". The trade was real and the user filed it as a bug: he opens `/nina`, reads everything,
 * and the dot is still painted, because `app/nina/page.tsx` marks the session read in `after()` —
 * after this payload was rendered — and nothing re-rendered the bar carrying it.
 *
 * The trade is now paid off without a poll. `components/nina/NinaUnreadSync.tsx` fires exactly one
 * `router.refresh()` when, and only when, the render it arrived in delivered unread messages of
 * hers; the refreshed render counts after the UPDATE, so the dot goes. There is still no timer, no
 * interval and no route handler, and a visit with nothing to clear still costs nothing at all.
 * `lib/nina/unread.ts` holds the rule and the argument for why the sequence terminates.
 *
 * ── WHY THE COUNT IS STILL GLOBAL UNDER SESSIONS ────────────────────────────────────────────────
 * `countUnreadNinaMessages` deliberately takes no session: `role = 'nina' AND read_at IS NULL`
 * across every session is the dot's meaning — "there is something of hers you have not read" — and
 * it is also what keeps this query on the partial index `nina_messages_user_unread_idx`, which the
 * schema notes exists for this one query and which runs on every render of every tabbed screen.
 * MARK-read is the half that is session-scoped: opening one conversation says nothing about
 * another, so a message left unread in an older session correctly keeps the dot until he opens that
 * session. Assumption A3 (proactive messages land in the most recent session) is what makes the
 * common case clear itself on the first visit.
 *
 * ── WHY `getUserId` AND NOT `requireUserId` ─────────────────────────────────────────────────────
 * This renders inside `AppShell`, which `/`'s signed-out state also renders, and which the two
 * `loading.tsx` files render with no session resolved at all. `requireUserId()` would
 * `redirect('/')` from inside a loading fallback, which is a soft-404 of the kind
 * `app/(app)/loading.tsx` already warns about. No session means no dot.
 */
export async function NinaUnreadBadge() {
  const userId = await getUserId()
  if (userId == null) return null

  const unread = await countUnreadNinaMessages(userId)
  if (unread === 0) return null

  return (
    <span
      /* `-right-1 -top-1` against the `size-5` icon box `Tab` puts around the glyph. Absolute, so
         it never participates in that grid and never nudges the label. */
      className="absolute -top-1 -right-1 size-2.5 rounded-full bg-z5 ring-2 ring-card"
      /* A count is not rendered: at one user and one Nina, "there is something" is the entire
         message, and a number on a 10px tab label is noise. The screen-reader text carries the
         count because there it costs nothing. */
      role="status"
      aria-label={`${unread} unread ${unread === 1 ? 'message' : 'messages'} from Nina`}
    />
  )
}

/**
 * The mountable wrapper: the badge is an async component and `AppShell` renders synchronously, so
 * the suspense boundary lives here rather than being repeated at the call site. `fallback={null}`
 * because a skeleton dot would be a lie — the honest states are "no dot yet" and "dot".
 */
export function NinaUnreadBadgeSlot() {
  return (
    <Suspense fallback={null}>
      <NinaUnreadBadge />
    </Suspense>
  )
}
```

**Impact:** none at runtime. It stops the next reader from restoring the staleness on purpose.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`) then `npm run build`
**Tests:**
```
npx vitest run lib/nina/unread.test.ts
npm test
npm run lint
npm run format:check
npm run ci:data-layer-guard
npm run ci:client-secret-guard
npm run ci:llm-payload-guard
```
No guard's table changes: this phase adds no query (so nothing for `ci:data-layer-guard`'s
unscoped-read counter), no model call (`ci:llm-payload-guard` is phase 4's file and stays untouched),
and `NinaUnreadSync` names no secret (`ci:client-secret-guard` RULE 1).

**Manual check** — the four that matter, in order:

1. **The reported bug.** With an unread message from her (write one with the evening cron, or set
   `read_at = NULL` on her newest row), open `/nina` from another tab. Reveal the bar with phase 2's
   `^` **without navigating**: no dot. Network shows exactly one extra RSC request for `/nina`
   immediately after load.
2. **The clean visit costs nothing.** Reload `/nina` with everything already read: **no** second RSC
   request. This is the assertion that separates the fix from a poll.
3. **The other session keeps its dot.** Leave a message of hers unread in session B, open session A
   from the sidebar: the dot is still there, and session B's messages still show unread in the
   database. Then open B from the sidebar — the dot goes.
4. **The sidebar is not a read.** Open the sidebar over an unread session and close it without
   tapping a row: nothing is marked read.

**Exit criteria:**
- Open `/nina`, read her newest messages, stay on the page — the dot is gone with no navigation
  (checked on the revealed bar, since phase 2 hides it by default).
- A visit with nothing unread issues no extra render.
- A message that arrives later while the page is open is delivered by phase 11's refresh and gets
  its own single sync; there is no timer anywhere in the phase (`grep -rn "setInterval\|setTimeout"`
  over this phase's diff is empty).
- `markNinaMessagesRead` is called with the active session and never marks another session's rows.
- `countUnreadNinaMessages` is byte-identical, so the partial index
  `nina_messages_user_unread_idx` is still the index the dot reads.
- `npm run lint`, `format:check`, `typecheck`, `npm test` and every `ci:*-guard` pass.

## Handoffs

- **H1 → Phase 2. ✅ CLOSED as moot; nothing to ask for.** `components/ui/AppShell.tsx` is phase
  2's file and it is what renders `NinaUnreadBadgeSlot`. **Reconciliation checked what phase 2
  actually does: it hides the bar by TRANSFORM, not by omission** — `TabBar` gains
  `hidden?: boolean` and `AppShell` renders `<ChatChrome ninaBadge={<NinaUnreadBadgeSlot />} />` on
  `/nina`, so the badge is still in `/nina`'s payload and D7's first bullet (pull the bar up with
  `^` and see the post-refresh badge) is the case that actually applies. This phase never depended
  on it either way.
- **H2 → Phase 1. ✅ CLOSED: not a conflict. Nothing is owed by either phase.** This phase needs
  `countUnreadNinaMessages(userId)` to remain callable with **no** session argument and to keep the
  global `role = 'nina' AND read_at IS NULL` predicate, because that is what keeps it on the partial
  index `nina_messages_user_unread_idx`. Phase 1 shipped the session parameter as an **optional**
  options-bag field (`opts?: { sessionId?: string }`), so the global call is still the default and
  still the one `NinaUnreadBadge` makes. No global overload has to be added, and no index is added
  here — which the plan set forbids. **This mattered: R9 works only because the mark is per-session
  and the count is global**, and reconciliation confirmed all four phases implement that split.
  Phase 3 leaves the `after()` user-wide and hands it here (its handoff 9); phase 5 states it does
  not move, reorder or scope it; this phase scopes only the mark; phase 1 supports both.
- **H3 → a follow-up card, outside this set (R9's residue, not R9).** A back gesture to `/` can
  restore a Client-Cache payload rendered before the read (glossary: pages "are reused during
  browser back/forward navigation"), and `router.refresh()` clears the Client Cache for the current
  route only. The full fix is a `'use server'` `syncNinaRead(sessionId)` that calls
  `markNinaMessagesRead` and, **only when it returns > 0** — which is the use its docstring has been
  waiting for — calls `revalidatePath('/', 'layout')`, the one documented way to purge the whole
  Client Cache; `NinaUnreadSync` would call it instead of `router.refresh()`. It is a new Server
  Action surface and a second mark-read caller, which is why it is not in this phase. Worth a card
  only if the residue is observed on a real phone.
- **H4 → nobody, deliberately.** `read_at` is now read by a component-adjacent path for the first
  time (through `hasUnreadFromNina`). It is a timestamp used as a boolean and never rendered, so
  invariant 4's "rendered strings come from `lib/format.ts`" does not apply and no formatter is
  needed. If a later phase ever wants to *show* "read at 21:04", that is a new formatter in
  `lib/format.ts`, not a `toLocaleTimeString` in a bubble.

## Rollback

Self-contained and UI-only, so `git revert` of this phase's single commit is complete:

1. `git revert <phase-8 commit>` — or by hand: delete `lib/nina/unread.ts`,
   `lib/nina/unread.test.ts` and `components/nina/NinaUnreadSync.tsx`; drop the `<NinaUnreadSync>`
   line, the `hadUnread` const and the two new imports from `app/nina/page.tsx`; restore
   `NinaUnreadBadge.tsx`'s docstring.
2. **Keep the session argument on `markNinaMessagesRead`.** Reverting *that* line to the global call
   would make a visit to one session mark every session read — a data change, not a UI one. If the
   revert is happening because the refresh misbehaves, revert steps 3-5 and leave step 4's `after()`
   call session-scoped.
3. No migration, no schema, no query and no index is touched, so there is nothing to undo in the
   database and the dot returns to being one navigation stale.
