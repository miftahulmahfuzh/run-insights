# Phase 3: Session-scoped chat surface and session lifecycle actions

**Plan set:** `NINA_CHAT_SESSIONS_PLAN.md`
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Satisfies:** R2 (create a new session to focus on a new topic, or return to a previous
conversation), R11 (remove a session) — the user-facing thing this phase serves is that two chats
with Nina are genuinely two chats, in what the screen shows *and* in what she is given to read.
**Depends on:** Phase 1 (session data layer), Phase 2 (full-screen chat chrome)
**Difficulty:** HARD
**Package:** `lib/nina` (with `app/nina` and `components/nina` at the edges)

---

## Goal

After this phase `nina_messages` is partitioned in practice and not merely in schema: `/nina?s=<id>`
renders exactly one session, `sendNinaMessage` writes into exactly one session, and
`getNinaMessageWindow` — the read that becomes Nina's prompt — is scoped to that same session, so a
new session is a topic she cannot see the old one from (assumption A1). All three headless writers
(`sendNinaMessage`, `proactive.ts`, `imagejobs.ts`) resolve a real session before they insert, and
phase 1's optional session parameters become **required**, which is how `tsc` proves no writer was
missed. Removing a session (R11) lands the runner somewhere real — including when it was the one he
was reading, and including when it was his last.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**

- `lib/nina/active.ts` (NEW, pure, no `server-only`, no DB import):
  - `SESSION_PARAM = 's'`
  - `NINA_SESSION_TITLE_MAX_CHARS` — **re-exported, never declared here.** Reconciled: phase 1's
    `lib/nina/sessions.ts` holds the set's one declaration (`= 60`); `active.ts` imports it, clamps
    with it in `sanitizeNinaSessionTitle`, and re-exports it under the **same** name so this
    module's published surface carries it. The re-export is load-bearing twice over:
    `tests/nina.active.test.ts` reads the cap from `@/lib/nina/active`, and phase 4's step 5
    replaces the sanitiser's body with a re-export from `./title`, after which this re-export is
    the only thing keeping the import from going unused and failing `npm run lint`.
  - `parseNinaSessionParam(raw: unknown): string | null`
  - `interface SessionActivity { id: string; pinnedAt: Date | null; createdAt: Date; lastUserMessageAt: Date | null }`
  - `mostRecentSessionId(sessions: readonly SessionActivity[]): string | null`
  - `chooseActiveSession(sessions: readonly SessionActivity[], requestedId: string | null): string | null`
  - `sanitizeNinaSessionTitle(raw: unknown): string | null`
- `lib/nina/sessionResolve.ts` (NEW, `import 'server-only'`, **not** a `'use server'` module):
  - `resolveNinaWriteSession(userId: string): Promise<string>`
  - `resolveNinaSessionForMessage(userId: string, messageId: string | null): Promise<string>`
- `lib/nina/sessionActions.ts` (NEW, `'use server'`):
  - `interface NinaSessionActionResult { ok: boolean; next: string | null }`
  - `interface NinaSessionCreateResult { ok: boolean; sessionId: string | null; next: string | null }`
  - `createNinaChatSession(): Promise<NinaSessionCreateResult>`
  - `renameNinaChatSession(input: { sessionId: string; title: string }): Promise<NinaSessionActionResult>`
  - `setNinaChatSessionPinned(input: { sessionId: string; pinned: boolean }): Promise<NinaSessionActionResult>`
  - `removeNinaChatSession(input: { sessionId: string; activeSessionId: string | null }): Promise<NinaSessionActionResult>`
- `tests/nina.active.test.ts` (NEW)

**Signature changes:**

- `lib/nina/queries.ts`: `listNinaMessages(userId, opts: { limit: number })` ->
  `listNinaMessages(userId, opts: { limit: number; sessionId: string })` — **required**
- `lib/nina/queries.ts`: `getNinaMessageWindow(userId, limit)` ->
  `getNinaMessageWindow(userId, limit, sessionId: string)` — **required**
- `lib/nina/queries.ts`: `insertNinaMessages(userId, rows, sessionId?: string)` ->
  `insertNinaMessages(userId, rows, sessionId: string)` — **the third parameter becomes required.**
  **RECONCILED:** an earlier draft of this contract put `sessionId` on `NinaMessageInsert` (one
  session per ROW); phase 1 owns `queries.ts` and shipped it as a third parameter (one session per
  CALL), and that shape wins. It is also the better one: every caller inserts one turn into one
  conversation, and a per-row session would make "this batch spans two sessions" expressible when
  nothing wants it. `NinaMessageInsert` gains **no** field.
- `lib/nina/load.ts`: `NinaSourceGateway.readMessageWindow(userId, limit)` ->
  `readMessageWindow(userId, limit, sessionId: string)`
- `lib/nina/load.ts`: `loadNinaContext(userId, gateway, now?)` ->
  `loadNinaContext(userId, sessionId: string, gateway, now?)`
- `lib/nina/actions.ts`: `sendNinaMessage`'s input object gains `sessionId: string | null` —
  a **required field of nullable type** (see D3)
- `lib/nina/proactive.ts`: `emitProactiveMessage(userId, detail, facts, context, deps?)` ->
  `emitProactiveMessage(userId, sessionId: string, detail, facts, context, deps?)`
- `components/nina/ChatScreen.tsx`: `ChatScreen` gains a **required** prop
  `sessionId: string | null`

**Semantic change, not a signature change (D4):** `getNinaMessageWindow`'s `olderCount` stops
meaning "messages before this window in the conversation" and starts meaning **"messages this user
has that he is not being shown"** — the window is session-scoped, the `count(*)` stays user-wide.
`NinaSourceGateway.readMessageWindow`'s doc comment and `ConversationFacts.olderMessageCount`'s
reading change with it. No prompt string is edited.

**Deletes:** nothing. No symbol, no file, no config key.

**Renames:** nothing.

**Requires (from earlier phases) — the phase-1 contract I am quoting.** Phase 1's plan does not
exist yet as I write this, so these are the names I have written code against. Where phase 1 chose
a different spelling, the reconciler should change **my** call sites, not phase 1's definitions:

| Symbol | Shape I depend on | Phase |
|---|---|---|
| `lib/db/schema.ts` `ninaChatSessions` | a table with `id` (nanoid(12) PK), `user_id`, `title`, `title_source`, **`pinned_at`** (reconciled: phase 1 stores an INSTANT, not a boolean), `created_at` | 1 |
| `nina_messages.session_id` | `NOT NULL`, FK -> `nina_chat_sessions.id` `ON DELETE CASCADE` | 1 |
| `NinaSessionListRow` | **reconciled to phase 1's name and shape**: `{ id: string; title: string \| null; titleSource: NinaSessionTitleSource \| null; pinnedAt: Date \| null; createdAt: Date; lastUserMessageAt: Date \| null }`. Still a structural superset of my `SessionActivity` once `pinned` is read as `pinnedAt !== null` — see the note under the table | 1 |
| `NinaMessageRow.sessionId` | `string` on the shared `messageColumns` projection | 1 |
| `listNinaSessions(userId)` | `Promise<NinaSessionListRow[]>`, pinned-first then most-recent-user-message desc | 1 |
| `createNinaSession(userId)` | `Promise<NinaSessionRow>`, **callable with no title argument**. **Reconciled:** it returns `title: null`, NOT a placeholder string — phase 1's D7 makes NULL/NULL the ordinary first state and `sessionTitleFor` is the only sanctioned way to render it. Nothing in this phase reads the returned title | 1 |
| `renameNinaSession(userId, sessionId, title)` | `Promise<boolean>`, owner-scoped in SQL | 1 |
| `setNinaSessionPinned(userId, sessionId, pinned)` | `Promise<boolean>`, owner-scoped in SQL | 1 |
| `removeNinaSession(userId, id)` | **reconciled to phase 1's name** (this contract said `deleteNinaSession`). `Promise<boolean>`, owner-scoped in SQL, cascading to messages and their image rows | 1 |
| `getNinaSession(userId, sessionId)` | `Promise<NinaSessionRow \| null>` | 1 |
| the three message functions | already widened by phase 1 with an **optional** session parameter, which this phase makes required | 1 |
| `app/nina/page.tsx` | already carries phase 2's chrome-mode prop on `<AppShell>`; I do not touch that line | 2 |
| `components/nina/ChatScreen.tsx` `COMPOSER_CLEARANCE_PX` | may have been changed by phase 2; I do not touch it | 2 |

**Also requires one ordering property from phase 1 (D3 depends on it):** the list's sort key must
be `coalesce(last_user_message_at, created_at)` and not `last_user_message_at` alone. A session
created by "new chat" has no user message yet, and with a bare `last_user_message_at` it sorts to
the bottom of the list the instant it is created — the runner taps "new chat" and his new chat
appears last. If phase 1 shipped the bare key, this is a one-word fix in phase 1's ordering rule and
it belongs there, not here.

**Leaves alone (owned by others):**

- `lib/db/schema.ts`, `drizzle/**` (Phase 1) — if I need a column phase 1 did not add, that is a
  handoff, not an edit. I need none.
- `scripts/check-llm-payload-boundary.mjs` (Phase 4, sole editor). This phase adds **no model
  call**, so it has no entry to add.
- `lib/nina/title.ts` and the `after()` titler call inside `lib/nina/actions.ts` (Phase 4). I leave
  a named seam and write no call — see Step 8.
- `components/nina/NinaSidebar.tsx`, the `>` button in `ChatChrome.tsx`, and
  `app/nina/page.tsx`'s `<header>` removal (Phase 5). **The header stays in this phase**, exactly as
  it is on `main`.
- `components/nina/MessageBubble.tsx`, `MessageList.tsx`, `ChatImages.tsx`,
  `NinaUnreadBadge.tsx`, everything under `components/ui/` (Phases 2, 5, 7, 8, 9).
- `lib/nina/live.ts`'s `mergeServerMessages` (unowned; see D8 — I solve the session-switch problem
  with a React `key` rather than by editing it).
- `app/nina/page.tsx`'s `after(() => markNinaMessagesRead(userId))` (Phase 8). Unchanged, still
  user-wide. See Handoffs.
- `lib/nina/prompts/**` and `lib/nina/context.ts` (unowned, and `nina-character-tuning` is editing
  `prompts/` concurrently on `main`). See D4 for why no prompt string needs to change.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/active.ts` | **create** | the pure "which session, and what may he call it" decisions |
| `tests/nina.active.test.ts` | **create** | unit tests for all of the above (invariant 7) |
| `lib/nina/queries.ts` | modify | `:482` `listNinaMessages`, `:505` `getNinaMessageWindow`, `:536` `insertNinaMessages` — phase 1's optional session parameter becomes required and its `ensureNinaSession` fallback is deleted; `NinaMessageInsert` is **not** touched (reconciled); the window's `count(*)` deliberately stays user-wide |
| `lib/nina/sessionResolve.ts` | **create** | `resolveNinaWriteSession`, `resolveNinaSessionForMessage` — A3's policy, one implementation, three callers |
| `lib/nina/load.ts` | modify | `:92` `readMessageWindow` on the interface, `:129` `loadNinaContext`'s new positional `sessionId`, `:138` the call |
| `lib/nina/gateway.ts` | modify | `:125-157` `readMessageWindow` passes the session through; the `olderCount` doc |
| `tests/nina.gateway.patterns.test.ts` | modify | a new describe block asserting the session reaches `getNinaMessageWindow` |
| `lib/nina/actions.ts` | modify | `:220` input gains `sessionId`, `:395-414` resolve then insert, `:486` context load, `:608` her bubbles, `:809` `messageCount`, plus phase 4's seam |
| `lib/nina/albumActions.ts` | modify | `:45` pass `sessionId: null` — the one out-of-list caller `tsc` finds |
| `lib/nina/proactive.ts` | modify | `:588` `emitProactiveMessage` gains `sessionId`, `:630` the insert, `:717`/`:747` the two entry points resolve it |
| `lib/nina/imagejobs.ts` | modify | `:180-192` `postNinaApologyMessage` resolves the session from the message it is replying to |
| `lib/nina/sessionActions.ts` | **create** | `'use server'`: create, rename, pin/unpin, remove (R2, R4-wiring, R11) |
| `app/nina/page.tsx` | modify | `:116` read `?s=`, `:137` resolve the active session then read one session's messages, `:280` `key` + `sessionId` on `ChatScreen` |
| `components/nina/ChatScreen.tsx` | modify | `:83-120` the new required prop, `:158` the URL comment, `:426` the send, `:510` the dep array |

Fourteen files: three new modules, one new test file, ten modified.

---

## Decisions, with the reasoning the phase brief asked for

### D1 — How the active session is carried: `/nina?s=<id>`, and there is no second URL writer

Assumption A4, and it matches `lib/panel/param.ts`'s habit of putting UI state in the URL for the
reason that file states at length: *"React state is invisible to the phone's back gesture."* A
session is exactly that kind of state — he wants the back gesture to take him to the chat he came
from, and he wants a session to survive a reload.

**The live hazard the brief names does not materialise, and the codebase already arranged for
that.** There are two `history.replaceState` writers on `/nina` today, and both of them
copy-and-delete-by-name rather than rebuilding the query:

- `ChatScreen.tsx:158-165` consumes `?attach=` and `?photo=` in **one** effect, and its comment
  explains why one and not two: *"two independent `replaceState` calls in the same commit would race
  to decide which of them wrote the surviving URL."*
- `components/nina/useChatScroll.ts:64-68` writes R14's `?at=` mark, and its own header says it uses
  *"a `URLSearchParams` copy of the current query **so a future parameter on `/nina` survives**"*.

`?s=` **is** that future parameter. Both writers do `new URLSearchParams(window.location.search)`
and then `delete` only the keys they own, so `?s=` survives both untouched, and `?at=` survives the
arrival of `?s=` for the same reason. **This phase adds no third writer and no `router.replace` on
mount.** `?s=` is written only by *navigation* — a `<Link>` or a `router.push` from phase 5's
sidebar, seeded by the URL my `createNinaChatSession` action returns — which is a user gesture in a
different commit from ChatScreen's mount-time layout effect. The race the comment warns about needs
two writers in one commit; there is one.

The only edit ChatScreen's effect gets is a sentence in its comment saying so, so that a later
phase does not "tidy" the copy-and-delete into a rebuild.

### D2 — A forged, foreign or since-deleted `?s=`: the codebase's split, applied

The split is stated in `app/nina/page.tsx`'s own header, about `?photo=`: *"a bad **link** is
something anyone can type, a bad **send** is a message about a photo he cannot see."*

- **A bad link degrades silently.** `parseNinaSessionParam` returns `null` for anything that is not
  a well-formed id, and `chooseActiveSession` returns the most recent session when the requested id
  is not in the owner-scoped list. So a forged id, another user's id, and an id he deleted on his
  other phone all produce the same thing: his newest chat, painted normally. Nothing leaks which
  ids exist, because "not yours" and "gone" are the same outcome — `lib/nina/queries.ts`'s own
  header rule.
- **A bad send is refused.** `sendNinaMessage` with a non-null `sessionId` that does not resolve to
  a row of his returns `REFUSED`, exactly as `resolveAttachment` does. This one is not a taste
  call: `nina_messages.session_id` is a `NOT NULL` foreign key, so a bad id would fail the INSERT
  and the `catch` would answer `REFUSED` anyway — after losing the sentence he typed. Resolving it
  before STEP 1 costs one indexed read and keeps the failure honest.

**Why validating on the page is not optional.** `listNinaMessages` is owner-scoped, so passing a
foreign `?s=` straight through would return `[]` and paint an empty conversation with a dead id
still in the address bar — precisely the outcome the brief forbids for R11. One extra indexed read
buys the difference between "your newest chat" and "an empty screen".

### D3 — Eager session creation on "new chat", and what `sessionId: null` means

**Eager.** "New chat" is a Server Action that inserts a `nina_chat_sessions` row and returns
`/nina?s=<id>` for the caller to navigate to. Three reasons, in order of weight:

1. **A lazy session cannot be named, and an unnamed session cannot be told apart from the old one.**
   If "new chat" only navigated to a marker (`/nina?new=1`) with no id, the send would have to
   decide which session to write into — and the honest answer available to it, "the most recent
   one", is the *old* session. He taps "new chat" to focus on a new topic and his first message
   lands in the topic he was trying to leave. That is R2 failing at its one sentence.
2. **It keeps the write path a write and the render path a render.** `app/nina/page.tsx`'s own
   comment is explicit that a render must have no side effect — *"Next may render a segment more
   than once, and PPR renders it before a request even exists"* — which is why
   `markNinaMessagesRead` sits in `after()`. Creating a session during render would break that
   rule. A gesture-driven action creating a row does not.
3. **The URL becomes real immediately**, so the back gesture, a reload and a second tab all agree
   about which chat he is in — the whole reason A4 puts it in the URL.

**The cost of eager, and how it is bounded.** An empty session shows in the list. Two mitigations,
both cheap: `createNinaChatSession` **reuses** the newest session when that session has no messages
at all (one `limit: 1` indexed read), so tapping "new chat" three times in a row yields one empty
session rather than three; and phase 1's ordering must coalesce to `created_at` so a fresh session
sorts to the top rather than the bottom (see Requires). The residual case — create a session, chat
in an older one, create again — leaves one empty row, and one empty row in a list he can delete
from is not worth a second mechanism.

**`sessionId: null` on a send therefore means one specific thing: he has no sessions at all.** That
state is reachable in exactly two ways — a runner who has never messaged, and R11's "he removed the
last one" — and in both the page renders the existing `EmptyState` with no session id, because it
must not write during render. A send from that screen carries `null`, and `null` routes to
`resolveNinaWriteSession`, which is the same resolve-or-create policy the cron uses. Two rapid
sends from that screen do not create two sessions: Next dispatches Server Actions one at a time per
client (the guide `lib/nina/actions.ts:41` already quotes), so the second send's resolve finds the
session the first one created.

The field is spelled `sessionId: string | null` and is **required to pass**. That is the
tsc-proof the phase scope asks for: every caller has to decide, and `null` is a decision with a
documented meaning rather than an omission. `insertNinaMessages`'s third parameter, one layer down, is
required **and** non-nullable, because that is where the `NOT NULL` column is.

### D4 — What `olderCount` means now: the window is session-scoped, the count is not

This is the decision that stops A1 from causing a visible regression, so the reasoning matters more
than the diff.

`lib/nina/prompts/system.ts:76` is the only consumer, and its exact words are:

> `"conversation.window"` — the last messages between you, OLDEST FIRST, exactly as they were sent.
> An EMPTY window means you have never spoken to him — introduce yourself and ask his name.
> `"olderMessageCount"` above 0 means there is more history you cannot see; do not pretend to
> remember a specific line from it, use `memory.facts` instead.

Session-scoping **both** halves of `getNinaMessageWindow` would make a brand-new session look, to
her, exactly like a brand-new runner: empty window, `olderMessageCount: 0`, and the prompt tells her
to introduce herself and ask his name. Every new session would open with "hi, I'm Nina, what should
I call you?". That is worse than the bug A1 exists to fix.

So: **the window carries the session predicate; the `count(*)` stays `WHERE user_id = $1`.**
`olderCount` becomes "how many of his messages exist that are not in this window", which covers
both "earlier in this chat" and "in his other chats". Read against the prompt sentence it is not
only still true, it is more precisely true than before — *"there is more history you cannot see"* is
exactly what it now counts, and the caution it triggers (*"do not pretend to remember a specific
line from it"*) is exactly the caution a parallel session calls for. A genuinely new runner still
gets `0`, so the introduce-yourself branch still fires for the one person it is for.

**No prompt string is edited, and that is deliberate twice over.** The sentence is already correct
under the new reading, and `lib/nina/prompts/` is being edited concurrently by the
`nina-character-tuning` orchestration on `main` (the analysis flags this). Rewriting a prompt line
this phase does not need is a merge conflict for nothing.

**One consequence, free, and worth taking.** `lib/nina/actions.ts:809` passes
`context.conversation.window.length` as `messageCount` to the distillation, which
`nameSlotValue` compares against `FIRST_CONVERSATION_MESSAGE_LIMIT = 12` to decide whether they are
still in "the first conversation". With a session-scoped window that number resets in every new
session, so she would re-offer a nickname each time he changes topic. Because the count above is
still user-wide, `window.length + olderMessageCount` is an **exact** global message count at no
extra query — strictly better than the capped-at-40 value the comment there admits to — and it makes
"the first conversation" a property of the relationship rather than of a session, which is what it
means. That fix is one line and it is in this phase's own file.

**One consequence accepted rather than fixed.** `ConversationFacts.daysSinceRunnerSpoke` and
`daysSinceNinaSpoke` are computed from the window alone, so they become per-session: "days since he
spoke *in this chat*". For the cron this is right, because the cron loads context for the very
session it is about to write into (Step 10) — she is measuring silence in the conversation she is
about to open. The edge is a runner who deletes every session and then goes quiet: his newly
created empty session gives `null`, and `evaluateSilence` already treats `null` as "do not fire"
(`proactive.ts:349`, asserted at `tests/nina.proactive.test.ts:174`). So the silence nag is
suppressed until he speaks again. Honest — she has no conversation to have been silent in — and
fixing it would need a user-wide "last runner message" read that no requirement asks for. Noted in
Handoffs.

### D5 — Assumption A3 for the two headless writers, and the state where he has none

One policy, one function, three callers: `resolveNinaWriteSession(userId)` returns the most recent
session and **creates one when there are none**.

- **Create rather than skip.** R11 lets him remove his last session. A cron message that cannot be
  written would be silently dropped, and a proactive message is the one thing that arrives when he
  is not looking — a dropped one is invisible forever. One row is cheaper than a lost message.
- **Most recent by activity, not by list order.** `listNinaSessions` is pinned-first (R4), so
  `listNinaSessions(userId)[0]` is a *pinned* session, which may be months old. Writing tonight's
  nag into a pinned-and-stale topic would be wrong in exactly the way pinning is meant to prevent.
  `mostRecentSessionId` therefore ignores `pinned` and orders on
  `lastUserMessageAt ?? createdAt`, and its docstring says so.

**`imagejobs.ts` does better than A3, and should.** `NinaImageJobArgs.replyToId`
(`lib/nina/imagerecipe.ts:206`) is already *"the runner message that asked"*, and that message row
already carries a `session_id`. So `resolveNinaSessionForMessage` reads the session off the message
being apologised to and falls back to `resolveNinaWriteSession` only when there is no such message
(an avatar job, or a row deleted since). The apology lands in the chat where he asked for the
photo, which is strictly what R22 wanted; A3 is satisfied a fortiori by the fallback.

### D6 — R11's two edge cases, which are the difficulty

Both are answered by one property: **a bare `/nina` always lands somewhere real, including
nowhere.** `chooseActiveSession([], null)` is `null`, and `null` renders the existing `EmptyState`
with a clean URL — not an error, not a blank screen, and not a dead id in the address bar.

- **He removes the session he is reading.** `removeNinaChatSession` takes the `activeSessionId` the
  screen is on, and when that is the row it just deleted it returns `next: '/nina'` — bare, no
  `?s=`. Phase 5 navigates there and the page re-resolves to his newest remaining chat. When it is
  *not* the open row, `next` is `null`, meaning "stay exactly where you are"; `revalidatePath('/nina')`
  has already re-rendered the list, and yanking him out of the conversation he is reading because
  he tidied up a different one would be a bug.
- **He removes the last one.** `next: '/nina'`, no sessions left, `activeSessionId: null`, empty
  state, and the composer still works: a send carries `sessionId: null`, which resolves-or-creates.
  The cron survives by the same function. So the two halves of the edge case — screen and cron —
  are one mechanism, which is the only reason they cannot disagree.

**No `redirect()` from inside the action.** Next 16.3.1 supports it
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`: *"In a Server
Action, `redirect` performs a client-side navigation… By default `redirect` will use `push`… in
Server Actions"*), but this repo has no precedent for it — every one of its ten action modules
returns a result object and calls `revalidatePath`, and the caller navigates. More importantly the
caller here is **phase 5's component**, so returning the destination is the honest seam: phase 5
decides how a destructive control behaves, and a `redirect` buried in my action would take that
decision away from it and default to a pushed history entry pointing at a session that no longer
exists.

**The confirmation is phase 5's, and it must exist.** Deleting a session takes a conversation and
its photographs permanently (A8), there is no undo, and there is no confirm dialog anywhere in this
codebase today. My action does not confirm anything; it deletes. Phase 5's plan already owns that
and its own brief says so.

### D7 — Invariant 2 is untouched, and `maxDuration` stays

This phase adds **no model call**. `sendNinaMessage` still awaits `runNinaTurn` from a Server
Action reached from a client event handler, never from a render path;
`scripts/check-llm-payload-boundary.mjs` greps for exactly that and has nothing new to learn, which
is why phase 4 remains its sole editor. `export const maxDuration = 60` on `app/nina/page.tsx` and
its full comment are **kept verbatim** — the action's 45 s budget is inherited from the page
segment, and the page gains one more indexed read (`listNinaSessions`), not a model call.

The page's read cost goes from four concurrent reads to one indexed read *then* four concurrent
reads. The extra round trip is unavoidable given A4: the URL names a session, and the session has to
be proved his before its messages can be read. It is a single-table index scan on
`(user_id, ...)`, which is what `getCurrentNinaAvatar` already costs on the same page.

### D8 — Switching sessions must not merge the previous session's messages

Found while reading, and it would have shipped as a mystery. `ChatScreen` holds
`useState(() => [...initial])` and reconciles a changed `initial` prop *during render* via
`mergeServerMessages` (`:244-248`), which is "server order + local content" and deliberately keeps
optimistic rows the server has not seen. Navigating from `?s=A` to `?s=B` is the same route with
different search params, so React reconciles the **same component instance** and merges B's server
rows into A's local state: leftovers from the previous conversation, plus a draft quote and an armed
attachment that belong to a message in another chat.

The fix is one attribute at the call site: `key={activeSessionId ?? 'none'}` on `<ChatScreen>`. A
different conversation is a different screen, so a remount discarding every piece of local state is
not a workaround, it is the correct semantics. It also avoids editing `lib/nina/live.ts`, which no
phase in this set owns.

---

## Implementation Steps

### Step 1: `lib/nina/active.ts` — the pure decisions

**File:** `lib/nina/active.ts` (new)
**Change:** everything `/nina` needs to decide *which* session it is looking at, plus the one thing
the runner may change about a session from the screen. Pure, so it is testable under
`vitest.config.ts`'s `environment: 'node'` (invariant 7) and importable from a `'use server'`
module, which may itself export only async functions — the constraint
`lib/nina/albumActions.ts:24` already records.

**Code:**

```ts
import { isValidId } from '@/lib/id'

/**
 * **The active session: which chat `/nina` is looking at, and what the runner may call it.**
 *
 * ── WHY THE SESSION IS IN THE URL (ASSUMPTION A4) ─────────────────────────────────────────────
 * `lib/panel/param.ts` states the argument for `/me`'s open panel and every word of it applies
 * here: React state is invisible to the phone's back gesture. With the active session in
 * `useState`, a back-swipe out of a chat would leave `/nina` altogether, and tapping through to a
 * run and coming back would land on whichever session the server happened to pick. A query
 * parameter makes the open conversation an ordinary history entry.
 *
 * ── ONE LETTER, `s`, AND WHY THAT IS NOT TOO TERSE ────────────────────────────────────────────
 * This parameter is typed by nobody and read by one page. It sits beside `attach`, `photo` and
 * `at` on the same URL, and it is the one of the four a runner might actually share, so short is a
 * small kindness. The grammar is a bare id — no `kind:` prefix — because unlike `?photo=` there is
 * exactly one table it can name (`parseNinaPhotoParam`'s header explains when a prefix earns its
 * keep, and this is the other case).
 *
 * ── WHY THIS FILE IS PURE, AND SEPARATE FROM PHASE 1's `sessions.ts` ──────────────────────────
 * Two consumers make purity mandatory. `lib/nina/sessionActions.ts` is a `'use server'` module,
 * which may export only async functions, so a constant a form needs for `maxLength` cannot live
 * there (`lib/nina/albumActions.ts` hit the same wall and resolved it the same way). And
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so a rule that lives in a component
 * or in a module that opens a database connection cannot be tested at all.
 *
 * Phase 1's `lib/nina/sessions.ts` is the neighbouring file and the plural is the difference:
 * that one orders the LIST and supplies a title fallback for a session with no name yet; this one
 * answers "which one is he in" for a single request. They are not two halves of one thing and
 * neither imports the other.
 */

/** The single query parameter that names the open session. `/nina?s=<nanoid(12)>`. */
export const SESSION_PARAM = 's'

/**
 * How long a session title may be, in characters, after sanitising.
 *
 * **RECONCILED: this phase no longer declares the number.** Sixty is right for the reason below,
 * but phase 1 landed the same cap first in `lib/nina/sessions.ts`, and four spellings of one
 * constant across four phases is the drift reconciliation exists to remove. So this module
 * IMPORTS `NINA_SESSION_TITLE_MAX_CHARS` and re-exports it under the SAME name — no alias, no
 * second spelling, no second value. The re-export is deliberate rather than incidental: this
 * module's own suite reads the cap from `@/lib/nina/active`, and phase 4 replaces the sanitiser's
 * body below with a re-export from `./title`, after which this line is the only remaining consumer
 * of the import and the only reason the file still lints.
 *
 * The reason the number matters is unchanged: R3's automatic titles are 3-4 words, so this is not
 * a constraint on the titler — it is the ceiling on a MANUAL rename, and its job is to stop a
 * pasted paragraph becoming a row in the sidebar. The input's `maxLength` (phase 5's `SessionRow`)
 * and the server's clamp are one value, which is the only arrangement in which they cannot
 * disagree — exactly the reason `NINA_ATTACH_MAX_CHARS` lives in `lib/nina/album.ts` rather than in
 * the action that clamps. `lib/nina/sessions.ts` imports nothing at all, so a `'use client'` row
 * can read the constant with no argument about bundles.
 */
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'

/**
 * Published again under the same name, so `@/lib/nina/active` exposes the cap it clamps with and
 * a caller that already imports `SESSION_PARAM` from here does not need a second import path.
 * One declaration (phase 1's `lib/nina/sessions.ts`), one name, one value — a re-export is not a
 * second declaration, and there is no alias.
 */
export { NINA_SESSION_TITLE_MAX_CHARS }

/**
 * `unknown -> id | null`.
 *
 * **Takes `unknown` on purpose**, on `parseNinaPhotoParam`'s precedent and for its stated reason:
 * the caller is `app/nina/page.tsx`, where a `searchParams` value is
 * `string | string[] | undefined`, and a repeated `?s=a&s=b` is a malformed link rather than an
 * interesting case. A shape check that refuses to be handed the wrong shape is a shape check with
 * a second bug in it.
 *
 * A miss is `null`, and `null` is NOT an error — see `chooseActiveSession`. This function proves
 * only that the string could be one of our ids; whether it is one of HIS is a question only the
 * database can answer.
 */
export function parseNinaSessionParam(raw: unknown): string | null {
  if (!isValidId(raw)) return null
  return raw
}

/**
 * The two fields "which session is newest" actually depends on, plus the one it deliberately
 * ignores.
 *
 * Phase 1's `NinaSessionListRow` is a structural superset of this **except for one field**, so the
 * page passes its rows straight in with one field derived — the same arrangement `PatternRun` has
 * with `getReviewedRunWindow`'s row shape (`lib/nina/gateway.ts` says so).
 *
 * **RECONCILED: phase 1 stores `pinnedAt: Date | null`, not `pinned: boolean`**, so this interface
 * takes phase 1's field verbatim. Naming it `pinned: boolean` here would have cost a mapping step
 * in `app/nina/page.tsx` for a field nothing in this file reads, and this docstring's whole claim
 * is that there is no mapping step.
 */
export interface SessionActivity {
  id: string
  /**
   * **Read by nothing in this file, and that is the decision.** Pinning (R4) is a preference about
   * where a session sits in the LIST; it is not a claim about which conversation he is in. A
   * pinned session can be months old, so defaulting to it would drop him into a stale topic every
   * time he opened the chat — the opposite of what pinning it was for. It is declared here so the
   * omission reads as a choice rather than as an oversight.
   *
   * `pinnedAt` and not `pinned`, matching phase 1's `NinaSessionListRow` field for field so the
   * page passes its rows in unmapped. An instant rather than a flag is phase 1's decision (its D4:
   * "pins partition rather than sort"); nothing here reads it either way.
   */
  pinnedAt: Date | null
  createdAt: Date
  /** R5's sort key. `null` for a session created but not yet spoken in. */
  lastUserMessageAt: Date | null
}

/**
 * When a session was last ACTIVE, for the purpose of "which one is newest".
 *
 * `lastUserMessageAt ?? createdAt`, and the fallback is load-bearing rather than defensive: a
 * session created a second ago by "new chat" has no user message, and without the coalesce it
 * would rank as the oldest thing he owns — so tapping "new chat" and then opening `/nina` with no
 * `?s=` would take him back to the conversation he just left.
 */
function activityAt(session: SessionActivity): number {
  return (session.lastUserMessageAt ?? session.createdAt).getTime()
}

/**
 * The most recently active session, or `null` when he has none.
 *
 * ── WHY NOT `listNinaSessions(userId)[0]` ─────────────────────────────────────────────────────
 * Because that list is pinned-first (R4). Its first element is whichever session he pinned, which
 * may be his oldest. This function is the answer to a different question and has to be computed
 * separately; conflating the two is how a proactive message ends up in a pinned-and-abandoned
 * topic.
 *
 * Ties are broken by `createdAt` and then by `id`, so the answer never depends on the order the
 * array happened to arrive in. Two sessions can genuinely tie: `nina_messages.sent_at` uses
 * `defaultNow()`, which returns the same instant for every row written in one `db.batch`.
 */
export function mostRecentSessionId(sessions: readonly SessionActivity[]): string | null {
  let best: SessionActivity | null = null
  for (const session of sessions) {
    if (best === null) {
      best = session
      continue
    }
    const candidate = activityAt(session)
    const incumbent = activityAt(best)
    if (candidate > incumbent) {
      best = session
      continue
    }
    if (candidate < incumbent) continue
    const candidateCreated = session.createdAt.getTime()
    const incumbentCreated = best.createdAt.getTime()
    if (candidateCreated > incumbentCreated) {
      best = session
      continue
    }
    if (candidateCreated === incumbentCreated && session.id > best.id) best = session
  }
  return best?.id ?? null
}

/**
 * **`/nina`'s one routing decision.** Which session does this request render?
 *
 * The requested id wins only if it is in the list — and the list came back from an owner-scoped
 * read, so membership is the ownership proof (invariant 3's rule: an id from a URL is a claim, a
 * row that came back from an owner-scoped read is a fact).
 *
 * ── A MISS IS A SILENT FALLBACK, NOT AN ERROR ─────────────────────────────────────────────────
 * A forged id, another runner's id and an id he deleted on his other phone are the same outcome:
 * his newest chat, painted normally. That is `app/nina/page.tsx`'s existing answer for `?attach=`
 * and `?photo=` — *"a bad LINK is something anyone can type"* — and it also means nothing here
 * leaks which session ids exist. The hard refusal lives one layer down in `sendNinaMessage`, where
 * the id is about to become a NOT NULL foreign key on a persisted row.
 *
 * `null` — he has no sessions at all — is a real answer and not a failure. It is reachable two
 * ways: a runner who has never messaged, and R11's runner who removed his last session. The page
 * renders its empty state, and a send from that screen resolves-or-creates on the server, because
 * a render must not write.
 */
export function chooseActiveSession(
  sessions: readonly SessionActivity[],
  requestedId: string | null,
): string | null {
  if (requestedId !== null && sessions.some((session) => session.id === requestedId)) {
    return requestedId
  }
  return mostRecentSessionId(sessions)
}

/**
 * A manual rename (R3's second half), sanitised — or `null` for "that is not a title".
 *
 * Trim, collapse every run of whitespace to one space, strip the control characters a paste can
 * carry, then clamp to `NINA_SESSION_TITLE_MAX_CHARS`. Empty after all that is `null`, and the action
 * refuses rather than writing it: a session with a blank name is a blank row in the sidebar, which
 * is worse than the placeholder it replaced. Clearing a title is not a feature anybody asked for —
 * he can rename it to something else.
 *
 * **This function is phase 4's seam.** Phase 4 owns "the manual-rename validation rule" and may
 * replace this body with the rule in `lib/nina/title.ts`; the name and signature are what
 * `sessionActions.ts` calls, so a swap is one file and no call site. What phase 4 must NOT do is
 * add a second sanitiser beside this one.
 */
export function sanitizeNinaSessionTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  /* eslint-disable-next-line no-control-regex -- a pasted title can carry NULs and newlines, and
   * the column is a single-line label. */
  const collapsed = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null
  return collapsed.slice(0, NINA_SESSION_TITLE_MAX_CHARS)
}
```

**Impact:** nothing yet — no caller. `npm run lint`, `format:check` and `typecheck` pass on their
own.

---

### Step 2: `tests/nina.active.test.ts` — the unit tests invariant 7 requires

**File:** `tests/nina.active.test.ts` (new)
**Change:** assert every rule in Step 1, in the `tests/nina.<topic>.test.ts` convention.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_SESSION_TITLE_MAX_CHARS,
  SESSION_PARAM,
  chooseActiveSession,
  mostRecentSessionId,
  parseNinaSessionParam,
  sanitizeNinaSessionTitle,
  type SessionActivity,
} from '@/lib/nina/active'

/**
 * Phase 3's pure rules (invariant 7). The interesting ones are not the happy paths: they are the
 * coalesce onto `createdAt` (without it a session created by "new chat" sorts last and the runner
 * is sent back to the topic he just left), the deliberate blindness to `pinned` (a pinned session
 * may be months old and must not become the default screen), and the silent fallback on a bad
 * `?s=` (R11 lets him delete the session a bookmark names).
 */
function session(over: Partial<SessionActivity> & { id: string }): SessionActivity {
  return {
    pinnedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastUserMessageAt: null,
    ...over,
  }
}

describe('SESSION_PARAM', () => {
  it('is the single letter the plan fixed', () => {
    expect(SESSION_PARAM).toBe('s')
  })
})

describe('parseNinaSessionParam', () => {
  it('accepts a well-formed id', () => {
    expect(parseNinaSessionParam('abcDEF012_-')).toBeNull()
    expect(parseNinaSessionParam('abcDEF012_-x')).toBe('abcDEF012_-x')
  })

  it('refuses the wrong shape rather than guessing', () => {
    expect(parseNinaSessionParam(undefined)).toBeNull()
    expect(parseNinaSessionParam(null)).toBeNull()
    expect(parseNinaSessionParam('')).toBeNull()
    expect(parseNinaSessionParam('too-short')).toBeNull()
    expect(parseNinaSessionParam('waaaaaaaaaaaaaaaaay-too-long')).toBeNull()
    expect(parseNinaSessionParam('has spaces!!')).toBeNull()
  })

  it('refuses a repeated parameter, which arrives as an array', () => {
    expect(parseNinaSessionParam(['abcDEF012_-x', 'abcDEF012_-y'])).toBeNull()
  })
})

describe('mostRecentSessionId', () => {
  it('is null when he has no sessions', () => {
    expect(mostRecentSessionId([])).toBeNull()
  })

  it('orders on the last user message', () => {
    const rows = [
      session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: new Date('2026-03-01T00:00:00Z') }),
      session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: new Date('2026-05-01T00:00:00Z') }),
      session({ id: 'cccccccccccc', lastUserMessageAt: new Date('2026-04-01T00:00:00Z') }),
    ]
    expect(mostRecentSessionId(rows)).toBe('bbbbbbbbbbbb')
  })

  it('falls back to createdAt for a session nobody has spoken in yet', () => {
    const rows = [
      session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: new Date('2026-05-01T00:00:00Z') }),
      /* "New chat", tapped one second ago. It has no user message; without the coalesce this row
       * would rank oldest and `/nina` would reopen the conversation he just left. */
      session({ id: 'bbbbbbbbbbbb', createdAt: new Date('2026-06-01T00:00:00Z') }),
    ]
    expect(mostRecentSessionId(rows)).toBe('bbbbbbbbbbbb')
  })

  it('ignores pinnedAt — a pinned session is not the default screen', () => {
    const rows = [
      session({
        id: 'aaaaaaaaaaaa',
        pinnedAt: new Date('2026-01-01T00:00:00Z'),
        lastUserMessageAt: new Date('2025-01-01T00:00:00Z'),
      }),
      session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: new Date('2026-06-01T00:00:00Z') }),
    ]
    expect(mostRecentSessionId(rows)).toBe('bbbbbbbbbbbb')
  })

  it('breaks a tie deterministically, not by array order', () => {
    const at = new Date('2026-06-01T00:00:00Z')
    const a = session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: at, createdAt: at })
    const b = session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: at, createdAt: at })
    expect(mostRecentSessionId([a, b])).toBe('bbbbbbbbbbbb')
    expect(mostRecentSessionId([b, a])).toBe('bbbbbbbbbbbb')
  })
})

describe('chooseActiveSession', () => {
  const rows = [
    session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: new Date('2026-03-01T00:00:00Z') }),
    session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: new Date('2026-05-01T00:00:00Z') }),
  ]

  it('honours a requested session he owns', () => {
    expect(chooseActiveSession(rows, 'aaaaaaaaaaaa')).toBe('aaaaaaaaaaaa')
  })

  it('degrades silently to the newest for a forged, foreign or deleted id', () => {
    expect(chooseActiveSession(rows, 'zzzzzzzzzzzz')).toBe('bbbbbbbbbbbb')
  })

  it('defaults to the newest with no parameter at all', () => {
    expect(chooseActiveSession(rows, null)).toBe('bbbbbbbbbbbb')
  })

  it('is null when he has removed every session (R11)', () => {
    expect(chooseActiveSession([], 'aaaaaaaaaaaa')).toBeNull()
    expect(chooseActiveSession([], null)).toBeNull()
  })
})

describe('sanitizeNinaSessionTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeNinaSessionTitle('  tempo   run   plan  ')).toBe('tempo run plan')
  })

  it('flattens a pasted multi-line title into one line', () => {
    expect(sanitizeNinaSessionTitle('tempo\nrun\tplan')).toBe('tempo run plan')
  })

  it('clamps to the exported maximum', () => {
    const long = 'x'.repeat(NINA_SESSION_TITLE_MAX_CHARS + 40)
    expect(sanitizeNinaSessionTitle(long)).toHaveLength(NINA_SESSION_TITLE_MAX_CHARS)
  })

  it('refuses a blank rename rather than writing an empty row', () => {
    expect(sanitizeNinaSessionTitle('')).toBeNull()
    expect(sanitizeNinaSessionTitle('   ')).toBeNull()
    expect(sanitizeNinaSessionTitle('\n\t')).toBeNull()
    expect(sanitizeNinaSessionTitle(undefined)).toBeNull()
    expect(sanitizeNinaSessionTitle(42)).toBeNull()
  })
})
```

**Impact:** `npm test` gains one suite. Note the first assertion in `parseNinaSessionParam` is
intentionally a pair: `'abcDEF012_-'` is eleven characters and must fail, `'abcDEF012_-x'` is
twelve and must pass — the boundary `lib/id.ts`'s `ID_RE` enforces.

---

### Step 3: `lib/nina/queries.ts` — the session parameters become required

**File:** `lib/nina/queries.ts` `:482` (`listNinaMessages`), `:505`
(`getNinaMessageWindow`), `:536` (`insertNinaMessages`)
**Change:** flip phase 1's optional session parameter to required on the three message functions
that carry the partition, and settle `olderCount`'s meaning (D4).

**This is the one place my code and phase 1's overlap.** Phase 1 landed these functions with an
*optional* session parameter so the tree compiled with no caller changed; this step removes the
option. Where phase 1's body differs from what is written below, keep phase 1's body and change
only the signature, the `where` clause and the doc comment — **except** in
`getNinaMessageWindow`, where the second statement's scope is this phase's decision and the block
below is authoritative.

**Code — `insertNinaMessages`'s signature.** **RECONCILED: `NinaMessageInsert` is NOT touched.**
An earlier draft of this step put `sessionId` on the row interface; phase 1 owns `queries.ts` and
shipped the session as a **third parameter** on the function — one session per CALL, not per row —
and that shape stands. It is also the shape the domain wants: all three writers insert one turn
into one conversation, and a per-row session would make "this batch spans two conversations"
expressible when nothing wants it. So this step changes the parameter from optional to required and
deletes phase 1's `ensureNinaSession` fallback branch, which is what phase 1's handoff asks for.

```ts
/**
 * ── THE SESSION IS REQUIRED, AND THAT IS THE PROOF (PHASE 3, R2) ────────────────────────────────
 * Phase 1 shipped it optional so the tree compiled with no caller touched, and resolved an omitted
 * session through `ensureNinaSession`. Phase 3 removes both the option and the fallback, and that
 * is not tidying — it is the proof. `nina_messages.session_id` is `NOT NULL`, there are exactly
 * three writers of this table (`lib/nina/actions.ts`, `lib/nina/proactive.ts`,
 * `lib/nina/imagejobs.ts`), and two of them run with no runner present and no session in view. A
 * defaulted parameter would let one of them keep compiling while writing into the wrong
 * conversation, which is invisible until Nina answers a question from another topic. Required means
 * `tsc` names every writer that has not decided — and all three now resolve through
 * `lib/nina/sessionResolve.ts`, where A3's policy lives once.
 *
 * Nullable nowhere below this line. `sendNinaMessage`'s INPUT is `string | null` because "he has no
 * sessions yet" is a real state a client can be in; by the time a row is being inserted that has
 * been resolved to an id.
 *
 * The ownership check phase 1 wrote around the explicit branch STAYS: a session id that exists but
 * is someone else's is exactly what invariant 3 is about, so an unowned session still returns `[]`
 * and `actions.ts`'s existing `throw new Error('insertNinaMessages returned no row')` still turns
 * that into a visible send failure.
 */
export async function insertNinaMessages(
  userId: string,
  rows: readonly NinaMessageInsert[],
  sessionId: string,
): Promise<NinaMessageRow[]> {
  if (rows.length === 0) return []

  // Phase 1's `if (sessionId == null) target = await ensureNinaSession(userId)` branch is DELETED
  // here; the parameter is required, so there is nothing to fall back from.
  const owned = await getNinaSession(userId, sessionId)
  if (owned == null) return []
  const target = owned.id
```

**Code — `listNinaMessages`:**

```ts
/**
 * The last `limit` messages **of one session**, returned **OLDEST FIRST** — display order, which
 * is what `app/nina/page.tsx` renders straight down the page.
 *
 * The query itself is `ORDER BY seq DESC LIMIT n` and the array is reversed in TypeScript,
 * because "the newest n" is an index-backed descending scan of n rows while "the oldest n of the
 * tail" is not expressible without knowing where the tail starts. Reversing `n <= 200` items is
 * free; reading the whole conversation to reverse it would not be.
 *
 * ── `sessionId` IS REQUIRED (PHASE 3, R2) ─────────────────────────────────────────────────────
 * Phase 1 shipped it optional to keep the tree green; this is the phase that removes the option.
 * `nina_messages.seq` remains the total order (invariant 6) — the session is a WHERE clause, not a
 * re-sort, and no per-session sequence exists.
 *
 * The caller is expected to have proved the session is his (`chooseActiveSession` over
 * `listNinaSessions`), but the `user_id` predicate stays anyway: invariant 3 says every statement
 * in this file scopes on the owner, and a foreign session id here comes back as `[]` rather than
 * as somebody else's conversation.
 */
export async function listNinaMessages(
  userId: string,
  opts: { limit: number; sessionId: string },
): Promise<NinaMessageRow[]> {
  const rows = await db
    .select(messageColumns)
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, opts.sessionId)))
    .orderBy(desc(ninaMessages.seq))
    .limit(opts.limit)

  return rows.reverse()
}
```

**Code — `getNinaMessageWindow`. This body is authoritative over phase 1's:**

```ts
/**
 * `readMessageWindow`'s query: the last `limit` messages **of one session**, oldest-first, plus
 * how many of his messages exist that this window does not show.
 *
 * ── THE WINDOW IS SESSION-SCOPED. THE COUNT IS NOT. (PHASE 3, D4) ────────────────────────────
 * The asymmetry is deliberate and it is the whole of assumption A1's safety margin, so it must not
 * be "fixed" into symmetry.
 *
 * The WINDOW carries the session predicate because that is what R2 means: "focus on a new topic"
 * is a claim about what Nina is GIVEN TO READ, not only about what the screen shows. Without this
 * line a new session would look new and behave exactly like the old one.
 *
 * The COUNT stays `WHERE user_id = $1` because of what the prompt does with it.
 * `lib/nina/prompts/system.ts` reads: *"An EMPTY window means you have never spoken to him —
 * introduce yourself and ask his name. `olderMessageCount` above 0 means there is more history you
 * cannot see."* Scope the count to the session as well and every new session presents to her as a
 * brand-new runner: empty window, zero older, so she introduces herself and asks his name again.
 * Left user-wide, `olderCount` reads as "how much of his history you are not being shown" — which
 * is exactly true, covers both "earlier in this chat" and "in his other chats", and keeps the
 * introduce-yourself branch for the one person it is for. No prompt string had to change.
 *
 * `olderCount` is a SQL `count(*)` minus the window's length — never `allMessages.length - limit`,
 * which would mean materialising the whole conversation to compute one integer. One batch, so the
 * count and the window are the same snapshot.
 */
export async function getNinaMessageWindow(
  userId: string,
  limit: number,
  sessionId: string,
): Promise<{ messages: NinaMessageRow[]; olderCount: number }> {
  const [rows, countRows] = await db.batch([
    db
      .select(messageColumns)
      .from(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId)))
      .orderBy(desc(ninaMessages.seq))
      .limit(limit),

    /* USER-WIDE ON PURPOSE. See the header — this is not a missed predicate. */
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaMessages)
      .where(eq(ninaMessages.userId, userId)),
  ])

  const total = countRows[0]?.total ?? 0
  return { messages: rows.reverse(), olderCount: Math.max(0, total - rows.length) }
}
```

**Code — `insertNinaMessages`'s `values` mapping.** Only the one added line; the rest of the
function (including the `.returning(messageColumns)` and the `sort` on `seq`) is unchanged:

```ts
  const inserted = await db
    .insert(ninaMessages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        /* Phase 3. `target` is the required third parameter, proved owned above — so there is no
         * `??` here, no default, and no per-row session: a writer that has not resolved a session
         * does not compile. */
        sessionId: target,
        role: row.role,
        text: row.body,
        source: row.source ?? 'chat',
        turnId: row.turnId ?? null,
        replyToId: row.replyToId ?? null,
        runId: row.runId ?? null,
      })),
    )
    .returning(messageColumns)
```

**Impact:** the tree does not compile again until Steps 5-11 land. Every error `tsc` reports is a
writer or reader that had not decided which conversation it was in — that is the acceptance test
for this phase's completeness, and the errors should be worked through rather than silenced.

---

### Step 4: `lib/nina/sessionResolve.ts` — A3's policy, once

**File:** `lib/nina/sessionResolve.ts` (new)
**Change:** the one implementation of "which session does a message with no session in view go
into", used by `sendNinaMessage`, `proactive.ts` and `imagejobs.ts`.

**Code:**

```ts
import 'server-only'

import { mostRecentSessionId } from './active'
import { createNinaSession, getNinaMessagesByIds, listNinaSessions } from './queries'

/**
 * **Which session does a message with no session in view go into? (Assumption A3.)**
 *
 * Three writers of `nina_messages` exist and two of them run with nobody looking:
 * `lib/nina/proactive.ts`'s five cron and `after()` triggers, and `lib/nina/imagejobs.ts`'s R22
 * apology. `lib/nina/actions.ts` is the third and it normally has a session from the URL — except
 * in the one state R11 creates, where the runner has removed every session and the screen has no
 * id to send. All three land here, and there is exactly one policy so they cannot disagree.
 *
 * ── WHY THIS IS NOT A `'use server'` MODULE ───────────────────────────────────────────────────
 * A `'use server'` file's exports are HTTP endpoints. These two functions take a `userId` the
 * caller resolved and would create a session for anyone who could POST to them. `import
 * 'server-only'` is the right boundary: reachable from the server, not addressable from a browser.
 *
 * ── WHY IT IS NOT IN `queries.ts` ─────────────────────────────────────────────────────────────
 * "The most recent session, and create one if there is none" is a POLICY (A3), not a read.
 * `queries.ts` owns the statements — `listNinaSessions`, `createNinaSession` — and this file owns
 * the sentence that composes them. Same split as `lib/nina/gateway.ts`, whose header states the
 * rule: every decision about what a fact IS lives outside the file that fetches it.
 */

/**
 * The runner's most recently active session, **creating one when he has none**.
 *
 * ── WHY CREATE RATHER THAN GIVE UP ────────────────────────────────────────────────────────────
 * R11 lets him remove his last session, so "he has none" is a state the cron must survive. A
 * proactive message that cannot be written is silently lost — and a proactive message is the one
 * thing that arrives when he is not looking, so a lost one is invisible forever. One row costs
 * less than that. `createNinaSession` supplies phase 1's deterministic placeholder title, so the
 * list never shows a name that is a lie and no model call happens here (invariant 2).
 *
 * ── WHY `mostRecentSessionId` AND NOT `listNinaSessions(...)[0]` ──────────────────────────────
 * That list is pinned-first (R4), so its head may be a session he pinned months ago. Tonight's nag
 * belongs in the conversation he is actually having. `mostRecentSessionId` ignores `pinned` for
 * exactly this reason and its docstring says so.
 *
 * ── ON RACING ─────────────────────────────────────────────────────────────────────────────────
 * Two concurrent callers finding no session both create one, and the loser's session is an empty
 * row he can delete. Not worth a lock: Next dispatches Server Actions one at a time per client, so
 * the two-rapid-sends case cannot happen from one browser, and the cron runs one pass per user.
 */
export async function resolveNinaWriteSession(userId: string): Promise<string> {
  const sessions = await listNinaSessions(userId)
  const existing = mostRecentSessionId(sessions)
  if (existing !== null) return existing

  const created = await createNinaSession(userId)
  return created.id
}

/**
 * The session a specific message of his lives in, falling back to `resolveNinaWriteSession`.
 *
 * **This is how R22's apology beats A3 rather than merely satisfying it.**
 * `NinaImageJobArgs.replyToId` is already *"the runner message that asked"*
 * (`lib/nina/imagerecipe.ts:206`), and that row carries a `session_id`. So an apology for a photo
 * that never arrived lands in the conversation where he asked for it, not in whichever chat
 * happens to be newest twenty minutes later. The fallback is A3's rule and covers the two honest
 * misses: an avatar job, which has no runner message at all, and a message deleted since the job
 * opened (phase 7 makes that reachable).
 *
 * `getNinaMessagesByIds` is owner-scoped, so a foreign or vanished id comes back empty and takes
 * the fallback rather than reaching into somebody else's conversation. A read failure is warned and
 * swallowed for the same reason the callers swallow theirs: the apology is worth more than the
 * precision of where it lands.
 */
export async function resolveNinaSessionForMessage(
  userId: string,
  messageId: string | null,
): Promise<string> {
  if (messageId !== null) {
    try {
      const [row] = await getNinaMessagesByIds(userId, [messageId])
      if (row != null) return row.sessionId
    } catch (cause) {
      console.warn('[nina] could not resolve a session from a message', {
        userId,
        error: String(cause),
      })
    }
  }
  return resolveNinaWriteSession(userId)
}
```

**Impact:** none on its own. Depends on `NinaMessageRow.sessionId` from phase 1.

---

### Step 5: `lib/nina/load.ts` — the gateway interface and `loadNinaContext`

**File:** `lib/nina/load.ts:92` (the interface method) and `:129-139` (the function head and the
call)
**Change:** `readMessageWindow` and `loadNinaContext` both take the session. Nothing else in the
file moves — `CONTEXT_MESSAGE_WINDOW`, `RECENT_RUN_LIMIT` and `MEMORY_FACT_LIMIT` are untouched.

**Code — the interface member, replacing lines 88-95:**

```ts
  /**
   * The last `limit` messages **of one session** (R2, assumption A1), oldest first, plus how many
   * of his messages exist that this window does not show.
   *
   * ── `sessionId` IS WHY R2 IS NOT JUST A UI CHANGE ─────────────────────────────────────────
   * "Focus on a new topic" is a claim about what she is given to read. Scope only the screen and a
   * new session looks new and behaves exactly like the old one.
   *
   * ── `olderCount` IS NOT SESSION-SCOPED, AND THAT IS ON PURPOSE ────────────────────────────
   * It counts every message of his that this window does not carry — earlier in this session and
   * everything in his other sessions alike. `prompts/system.ts` turns it into "there is more
   * history you cannot see", which is exactly what that number now means; scoping it to the
   * session too would make every new session present as a runner she has never met.
   * `lib/nina/queries.ts`'s `getNinaMessageWindow` carries the full argument.
   *
   * Still a COUNT in SQL, not `all.length - limit` in TypeScript.
   */
  readMessageWindow(
    userId: string,
    limit: number,
    sessionId: string,
  ): Promise<{ messages: MessageInput[]; olderCount: number }>
```

**Code — the function head and the `Promise.all`, replacing lines 129-141:**

```ts
export async function loadNinaContext(
  userId: string,
  /**
   * **Which conversation she is in (R2, phase 3).** Positional and second, because every caller
   * knows it before it knows anything else: `sendNinaMessage` has just written his message into
   * it, and `proactive.ts` resolved it in order to write into it. Required rather than optional so
   * `tsc` names any future caller that has not decided — the same reason the queries below it are
   * required.
   *
   * It reaches exactly one of the six gateway reads. The memory ledger stays GLOBAL
   * (assumption A2): `nina_memory_slots` and `nina_memory_facts` are the long-term memory, and
   * partitioning them would make her forget his nickname the moment he opened a new topic.
   */
  sessionId: string,
  gateway: NinaSourceGateway,
  now: Date = new Date(),
): Promise<NinaContext> {
  const [identity, slots, facts, window, firedPatterns, nags] = await Promise.all([
    gateway.readIdentity(userId),
    gateway.readMemorySlots(userId),
    gateway.readMemoryFacts(userId, MEMORY_FACT_LIMIT),
    gateway.readMessageWindow(userId, CONTEXT_MESSAGE_WINDOW, sessionId),
    gateway.readFiredPatterns(userId),
    gateway.readNags(userId),
  ])
```

Everything from `const [profileRow, allRuns, ...]` to the closing `}` of the function is unchanged.

**Impact:** three callers break (`actions.ts:486`, `proactive.ts:717`, `proactive.ts:747`) and are
fixed in Steps 8 and 10.

**One note for the reader of `load.ts:59`.** That file's warning — *"Do not lower
`CONTEXT_MESSAGE_WINDOW` below `FIRST_CONVERSATION_MESSAGE_LIMIT` (12), because phase 5 reads
`context.conversation.window.length` instead of a real message count"* — is about to stop being
load-bearing, because Step 8 changes that caller to pass an exact count. The constant stays at 40
and the comment stays as written; it is a warning about a number, not about this change.

---

### Step 6: `lib/nina/gateway.ts` — pass the session through

**File:** `lib/nina/gateway.ts:125-157`
**Change:** the one DTO boundary gains one argument. The three-spelling translation
(`text: row.body`, `sentAt: row.createdAt`) is untouched — RULING A1 stands.

**Code — replacing the whole `readMessageWindow` member:**

```ts
  async readMessageWindow(userId, limit, sessionId) {
    /*
     * ── ONE CALL. This is the DTO boundary, and this map is the whole of it. ──────────────────
     *
     * `getNinaMessageWindow` returns `{ messages, olderCount }` — which is *exactly* the shape
     * phase 2's `readMessageWindow` declares, so there is nothing to assemble. The property phase
     * 1 keeps: `olderCount` is a SQL `COUNT`, not `all.length - limit`, which would need the whole
     * history in memory to answer a question about its size.
     *
     * **PHASE 3 (R2, ASSUMPTION A1): `sessionId` IS THE POINT OF THIS PHASE.** This line is the
     * one that makes a new session a new topic rather than a new tab on the same conversation.
     * `readMessageWindow` -> `getNinaMessageWindow` is the path from rows to the prompt, and if
     * only `listNinaMessages` had been scoped, the screen would show a fresh chat while Nina went
     * on reading the last forty messages of the old one.
     *
     * `olderCount` comes back user-wide by design — see `getNinaMessageWindow`'s header. It is
     * "history you cannot see", which is what `prompts/system.ts` says it is, and what keeps her
     * from re-introducing herself in every new session.
     *
     * **The three-spelling translation happens here and ONLY here** (RULING A1): the columns are
     * `text` / `sent_at`, `queries.ts`'s DTO is `body` / `createdAt` uniformly in every function
     * because they all select through one shared `messageColumns`, and phase 2's `MessageInput` is
     * `text` / `sentAt`. Two lines below are that boundary. Neither side is to be "fixed" to match
     * the other.
     */
    const { messages: rows, olderCount } = await getNinaMessageWindow(userId, limit, sessionId)
    const messages: MessageInput[] = rows.map((row) => ({
      id: row.id,
      role: row.role,
      text: row.body,
      sentAt: row.createdAt,
      replyToId: row.replyToId,
      runId: row.runId,
      /* Phase 6 populates this from `nina_message_images.description`. `[]`, never null — phase
       * 2's `MessageInput` says so, and an empty array is what "no images on this message" is. */
      imageDescriptions: [],
    }))
    return { messages, olderCount }
  },
```

**Impact:** `dbNinaSourceGateway` satisfies the widened interface. No import is added to this file,
which matters — `tests/nina.gateway.patterns.test.ts` mocks `@/lib/nina/queries` with an exact
export list, and a new import from that module would fail the mock at runtime.

---

### Step 7: `tests/nina.gateway.patterns.test.ts` — assert the session reaches the query

**File:** `tests/nina.gateway.patterns.test.ts` — append a new `describe` block at the end; the
existing `vi.mock` factories and the `readFiredPatterns` / `readNags` blocks are untouched.

**A correction to the brief, stated rather than quietly worked around.** The brief says this test
"will break when [`getNinaMessageWindow`'s] signature widens". It does not: the mock at `:44` is a
`vi.fn()` inside a module factory, the factory's export list is unchanged by a widened signature,
and no test in the file ever calls `readMessageWindow`. So there is nothing to repair — which is
worse than a break, because it means the phase's central claim is unasserted. What the file
actually needs is the **positive** assertion, and this is the right file for it: it is already the
one place that exercises `dbNinaSourceGateway` with `@/lib/nina/queries` mocked, and its header
already explains why a phase-boundary property belongs in a test rather than in a type.

**Code — appended, plus one added line at the top of the file:**

```ts
// add to the existing import from '@/lib/nina/queries' at the top of the file:
//   import { getNinaMemorySlots, getNinaMessageWindow, getNinaNags } from '@/lib/nina/queries'

/**
 * **Phase 3's exit test, and it is a phase-boundary assertion exactly as `readFiredPatterns`'s
 * above is.**
 *
 * R2's own words are that a new session exists so he can "focus on a new topic", and assumption A1
 * reads that as a claim about what Nina is GIVEN TO READ. The path that decides it is
 * `loadNinaContext` -> `readMessageWindow` -> `getNinaMessageWindow`, and the failure mode is
 * silent in the same way the phase-9 stub was: every type checks, every other test passes, and she
 * simply goes on reading the last forty messages of a conversation the screen no longer shows.
 * So the property under test is "the session id survives the gateway", not the mapping — which is
 * one line and obvious, and which would still be one line and obvious with the id dropped.
 *
 * The companion property is the asymmetry (phase 3's D4): the window is scoped, `olderCount` is
 * passed through untouched from a user-wide count, and a test that "tidied" the count into the
 * session would take out the guard that stops her introducing herself in every new session.
 */
describe('readMessageWindow — the session reaches the query (phase 3, R2/A1)', () => {
  const messageWindow = vi.mocked(getNinaMessageWindow)

  it('passes the session id through to getNinaMessageWindow', async () => {
    messageWindow.mockResolvedValue({ messages: [], olderCount: 0 })

    await dbNinaSourceGateway.readMessageWindow('user_1', 40, 'sessionAAAAA')

    expect(messageWindow).toHaveBeenCalledWith('user_1', 40, 'sessionAAAAA')
  })

  it('returns olderCount untouched, so the user-wide count survives the boundary', async () => {
    messageWindow.mockResolvedValue({
      messages: [
        {
          id: 'msgAAAAAAAAA',
          seq: 9,
          sessionId: 'sessionAAAAA',
          role: 'runner',
          body: 'pagi',
          createdAt: new Date('2026-09-04T00:00:00Z'),
          source: 'chat',
          turnId: null,
          replyToId: null,
          runId: null,
          readAt: null,
        },
      ],
      /* Messages of his that this window does not show — including everything in his OTHER
       * sessions. Non-zero with a one-message window is the normal case after a new session is
       * opened, and it is what keeps `prompts/system.ts`'s "you have never spoken to him" branch
       * from firing on a runner she has known for months. */
      olderCount: 312,
    })

    const result = await dbNinaSourceGateway.readMessageWindow('user_1', 40, 'sessionAAAAA')

    expect(result.olderCount).toBe(312)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]?.text).toBe('pagi')
  })
})
```

**Impact:** `npm test` asserts A1. If phase 1's `NinaMessageRow` carries fields beyond the ten
above, add them to the fixture — the mock's resolved value must satisfy the row type.

---

### Step 8: `lib/nina/actions.ts` — `sendNinaMessage` takes and writes a session

**File:** `lib/nina/actions.ts` — `:220` (the input object), a new block after `:402`, `:406` (his
row), `:486` (the context load), `:608` (her bubbles), `:809` (`messageCount`), and a new comment
after `:646`.
**Change:** five edits and one comment. **The write order in the header is not disturbed**: his row
is still inserted before `loadNinaContext` runs, for the reason that header gives — *"a message not
yet written is a message SHE CANNOT SEE"* — and the session resolution slots in *before* the insert,
where `resolveAttachment` already sits, so a bad session costs one indexed read and nothing else.

**8a. The input field.** Added after `attachExisting`, as the last member of the object:

```ts
  /**
   * **Phase 3 (R2). Which conversation this message joins.**
   *
   * A REQUIRED field of a NULLABLE type, which is the whole design in one line. Required, because
   * `nina_messages.session_id` is `NOT NULL` and there are exactly three writers of that table:
   * making every caller decide is how `tsc` proves none of them was missed. Nullable, because
   * "he has no sessions at all" is a real state a client can legitimately be in — reachable by a
   * runner who has never messaged, and by R11's runner who just removed his last session — and in
   * that state the screen has no id to send. A render must not write, so the page cannot create
   * one for him; this action can, and does.
   *
   *   a well-formed id he owns -> the message lands there
   *   a forged, foreign or deleted id -> REFUSED (see below)
   *   null -> `resolveNinaWriteSession`: his most recent session, created if he has none
   *
   * **The miss is a refusal, not a degradation, and it is the `resolveAttachment` split.**
   * `app/nina/page.tsx` degrades a bad `?s=` silently to his newest chat, because *"a bad LINK is
   * something anyone can type"*. Here the id is about to become a `NOT NULL` foreign key on a
   * persisted row: an unowned id would fail the INSERT and lose the sentence he typed, and writing
   * his message into a conversation he did not name would be worse than refusing. Same reasoning,
   * opposite answer, one layer apart — exactly as the header describes for `?photo=`.
   */
  sessionId: string | null
```

**8b. The resolution, inserted immediately after the last refusal (`actions.ts:402`) and before
`let runnerMessageId`.** It must be after every refusal, because `resolveNinaWriteSession` may
create a row and an empty send must not:

```ts
  /*
   * STEP 0e — THE SESSION (R2). Resolved AFTER every refusal above and BEFORE the runner's row,
   * and both halves of that sentence are load-bearing.
   *
   * After the refusals, because the `null` branch may CREATE a session and a stray Enter key must
   * not leave an empty conversation behind. Before the row, because `nina_messages.session_id` is
   * a `NOT NULL` foreign key — the same reason STEP 0c reads the run and STEP 0d reads the blob
   * rather than letting the INSERT discover the problem.
   *
   * `getNinaSession` is owner-scoped, so "not his" and "does not exist" come back as the same
   * `null`, which is what the refusal needs and is `queries.ts`'s standing rule.
   */
  let sessionId: string
  if (input?.sessionId == null) {
    /* He has no sessions — a runner who has never messaged, or R11's runner who removed his last
     * one. Same policy the cron uses (assumption A3), so the message lands somewhere findable and
     * the two paths cannot disagree about where. */
    try {
      sessionId = await resolveNinaWriteSession(userId)
    } catch (cause) {
      console.warn('[nina] could not resolve a session for the send', { error: String(cause) })
      return REFUSED
    }
  } else {
    const requestedSessionId = isValidId(input.sessionId) ? input.sessionId : null
    const owned =
      requestedSessionId === null ? null : await getNinaSession(userId, requestedSessionId)
    if (owned === null) return REFUSED
    sessionId = owned.id
  }
```

**8c. His row** — `actions.ts:406-408` becomes:

```ts
  let runnerMessageId: string
  try {
    const [row] = await insertNinaMessages(
      userId,
      [{ role: 'runner', body: text, replyToId: quotedRow?.id ?? null, runId }],
      sessionId,
    )
    if (row == null) throw new Error('insertNinaMessages returned no row')
    runnerMessageId = row.id
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }
```

**8d. The context load** — `actions.ts:485-488` becomes:

```ts
  const [context, history] = await Promise.all([
    /* The session is the second argument now (phase 3). She reads the window of THIS conversation
     * and the memory ledger of the whole relationship — assumptions A1 and A2, in one call. */
    loadNinaContext(userId, sessionId, dbNinaSourceGateway),
    dbNinaToolGateway.loadRunHistory(userId),
  ])
```

**8e. Her bubbles** — `actions.ts:608-615` becomes:

```ts
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        replyToId: index === 0 ? replyToId : null,
      })),
      /* The same session his message went into. She is answering in the conversation she was asked
       * in; there is no case in which a reply belongs anywhere else. One session for the whole
       * batch, which is why it is a parameter and not a field. */
      sessionId,
    )
```

**8f. `scheduleDistillation`'s `messageCount`** — `actions.ts:806-812`. The whole `identity` block
and the comment above the function change:

```ts
/**
 * The `after()` wrapper, so the two exit paths schedule one identical pass.
 *
 * **`messageCount` is an exact count and still costs no query (phase 3).** It used to be
 * `context.conversation.window.length` — the 40-message window, "exact everywhere below 40", which
 * was fine while there was one conversation. Session-scoping the window (assumption A1) broke
 * that: the length resets in every new session, so `nameSlotValue`'s
 * `FIRST_CONVERSATION_MESSAGE_LIMIT` check would latch on again and she would re-offer him a
 * nickname every time he changed topic.
 *
 * `window.length + olderMessageCount` is the repair and it is free, because phase 3 deliberately
 * left `olderCount` user-wide (see `getNinaMessageWindow`): the sum is every message he has ever
 * exchanged with her, across every session, computed from two numbers already in hand. That is
 * strictly better than what this comment used to promise, and it makes "the first conversation" a
 * property of the relationship rather than of a session — which is what the phrase means.
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
        messageCount:
          input.context.conversation.window.length +
          input.context.conversation.olderMessageCount,
      },
    })
  })
}
```

**8g. Phase 4's seam.** A comment and nothing else, placed immediately after the
`scheduleDistillation({...})` call on the SUCCESS path (`actions.ts:639-646`), above the final
`return`:

```ts
  /*
   * ── PHASE 4's SEAM: THE SESSION TITLER FIRES HERE (R3) ───────────────────────────────────────
   * Phase 4 owns `lib/nina/title.ts` and the `after()` hook that calls it, and this is the line it
   * is expected to add — one statement, right here, and no other edit to this function:
   *
   *     after(() => titleNinaSessionIfNeeded(userId, sessionId))
   *
   * Four properties of this spot, so phase 4 does not have to rediscover them:
   *
   *  1. **`sessionId` is in scope**, resolved by STEP 0e and unchanged since.
   *  2. **This is the only exit worth firing on.** R3's trigger is "the first interaction (user
   *     then nina)", and this is the path where both rows exist. The `result.payload == null`
   *     return above it is a turn where she said nothing, so there is no exchange to title yet.
   *  3. **`after()` and not `await`.** A titler is a model call; awaiting it would add seconds to
   *     a turn that already cost 13-45 s, and invariant 2 is enforced by grep either way.
   *     `after()` throws E468 outside a request scope, which is why the CALL belongs in this
   *     `'use server'` module and never inside `title.ts` — the lesson `scheduleDistillation`
   *     above records.
   *  4. **`after()` can run more than once and two tabs can race**, so the idempotence is the
   *     titler's ("has this session already got a title from the model?"), not this line's.
   *
   * Phase 3 deliberately writes the comment and not the call: `lib/nina/title.ts` does not exist
   * yet, and a phase that leaves a broken import behind is a phase that did not build.
   */
```

**8h. Imports.** Added to the existing import blocks at the top of the file:

```ts
import { getNinaSession, insertNinaMessageImages, insertNinaMessages, /* …existing… */ } from './queries'
import { resolveNinaWriteSession } from './sessionResolve'
```

Concretely: add `getNinaSession` to the alphabetised `from './queries'` list (which already holds
`getNinaAvatar`, `getNinaMessageImage`, `getNinaMessagesByIds`, `insertNinaMessageImages`,
`insertNinaMessages`), and add the one new `./sessionResolve` import line after `./queries`.
`isValidId` is already imported at `:6`.

**Impact:** `sendNinaMessage`'s two callers now fail to compile — `ChatScreen` (Step 14) and
`albumActions` (Step 9). That is the point.

---

### Step 9: `lib/nina/albumActions.ts` — the caller `tsc` finds

**File:** `lib/nina/albumActions.ts:45-49`
**Change:** one field. This file is not in any phase's `owns` list and is found only because the
required field breaks it — which is exactly the argument for making the field required.

**Code — replacing the body of `attachNinaPhotoToChat`:**

```ts
export async function attachNinaPhotoToChat(input: NinaAttachInput): Promise<NinaAttachResult> {
  const body = input.body.trim().slice(0, NINA_ATTACH_MAX_CHARS)
  const result = await sendNinaMessage({
    body,
    attachExisting: { kind: input.kind, id: input.id },
    /*
     * Phase 3 (R2). `null`, and it is the right answer rather than a placeholder: he is on
     * `/nina/about` with the album open, there is no session in view, and "no session in view"
     * resolves to his most recent conversation (assumption A3). The caller then navigates to
     * `/nina`, which resolves the SAME session — so the photo he just sent is on the screen he
     * lands on. Naming a session here would mean the album knowing about a parameter that belongs
     * to the chat.
     */
    sessionId: null,
  })
  return {
    ok: result.ok,
    userMessageId: result.userMessageId,
    unavailable: result.unavailable,
  }
}
```

**Impact:** `lib/nina/album.test.ts` does not import this module (its comment at `:164` explains it
deliberately avoids pulling a `'use server'` module in), so no test changes.

---

### Step 10: `lib/nina/proactive.ts` — the cron resolves a session

**File:** `lib/nina/proactive.ts:588` (the signature), `:630-640` (the insert), `:717-731` and
`:745-753` (the two entry points)
**Change:** `emitProactiveMessage` gains a second positional `sessionId`; both entry points resolve
it before loading context, so the window she reads is the conversation she is about to speak in.

**Code — the signature and the insert.** Replacing the head of `emitProactiveMessage` and its
`insertNinaMessages` call; everything between them (`proactive`, `history`, `runTurn`, the
`result.payload == null` guard) is unchanged:

```ts
export async function emitProactiveMessage(
  userId: string,
  /**
   * **Which conversation she speaks into (assumption A3, phase 3).**
   *
   * Resolved by the CALLER rather than here, because the caller also has to load the context —
   * and the context's window must be the window of this same session, or she measures silence in
   * one conversation while writing into another. One resolution, two uses, no way for them to
   * disagree.
   *
   * A3's reasoning, restated: a proactive message is conversation, so it belongs in a conversation.
   * A session per evening nag would bury the list this feature exists to organise.
   */
  sessionId: string,
  detail: ProactiveDetail,
  facts: ProactiveFacts,
  context: NinaContext,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
```

```ts
  let messageIds: string[] = []
  let bubbles: Array<{ id: string; body: string }> = []
  try {
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body) => ({
        role: 'nina' as const,
        body,
        /* The `source` IS trigger 1's marker and is the reason `hasProactiveMessageForRun` can
         * ask its question at all. Every row of the turn carries it, and `run_id` with it. */
        source: detail.kind,
        runId: detail.kind === 'run_committed' ? detail.runId : null,
      })),
      /* Phase 3. The session the caller resolved and loaded her context from. */
      sessionId,
    )
    bubbles = rows.map((row) => ({ id: row.id, body: row.body }))
    messageIds = rows.map((row) => row.id)
  } catch (cause) {
    /* Nothing was written, so nothing is marked, so the next invocation tries again. That is the
     * correct outcome and it is why the marker write is below this and not above it. */
    console.warn('[nina proactive] could not persist her message', {
      userId,
      kind: detail.kind,
      error: String(cause),
    })
    return NOT_EMITTED('could not persist the message')
  }
```

**Code — `emitRunCommitted`'s body**, replacing lines 706-731 (the docstring above it is unchanged):

```ts
export async function emitRunCommitted(
  input: {
    userId: string
    runId: string
    occurredOn: DateISO
    recordKeys: readonly string[]
    badgeKeys: readonly string[]
  },
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const at = now()

  /* Idempotence for trigger 1 is the message row itself: two tabs committing the same extraction,
   * or a retried `after()`, must not produce two reactions to one run. BEFORE the session
   * resolution below, because that resolution may CREATE a row and a duplicate trigger must cost
   * nothing. */
  if (await hasProactiveMessageForRun(input.userId, input.runId)) {
    return NOT_EMITTED('already reacted to this run')
  }

  /* Phase 3, assumption A3. His most recent conversation, created if R11 left him with none — the
   * cron has to survive a runner who deleted every chat, because a proactive message he never
   * receives is invisible forever. Resolved BEFORE the context load so the window she reads is the
   * window of the conversation she is about to write into. */
  const sessionId = await resolveNinaWriteSession(input.userId)

  const context = await loadNinaContext(input.userId, sessionId, dbNinaSourceGateway, at)
  const facts = await loadProactiveFacts(input.userId, context, at)

  return emitProactiveMessage(
    input.userId,
    sessionId,
    {
      kind: 'run_committed',
      runId: input.runId,
      occurredOn: input.occurredOn,
      recordKeys: input.recordKeys,
      badgeKeys: input.badgeKeys,
    },
    facts,
    context,
    deps,
  )
}
```

**Code — `evaluateAndEmitForUser`'s body**, replacing lines 740-754 (docstring unchanged):

```ts
export async function evaluateAndEmitForUser(
  userId: string,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const at = now()

  /*
   * Phase 3, assumption A3. Same resolution as `emitRunCommitted`, and it happens BEFORE
   * `decideProactive` deliberately: `daysSinceRunnerSpoke` comes out of the context window, which
   * is now per-session, so the decision has to be made about the same conversation the message
   * will land in. Resolving after the decision would let her decide "he has been silent for
   * eleven days" from one chat and then say it in another.
   *
   * The one accepted consequence, stated: a runner who removes every session gets a freshly
   * created empty one, whose window is empty, so `daysSinceRunnerSpoke` is `null` and
   * `evaluateSilence` does not fire (it already treats `null` as "do not fire" — see its guard
   * below and `tests/nina.proactive.test.ts`). She has no conversation to have been silent in, and
   * the nag resumes the moment he speaks.
   */
  const sessionId = await resolveNinaWriteSession(userId)

  const context = await loadNinaContext(userId, sessionId, dbNinaSourceGateway, at)
  const facts = await loadProactiveFacts(userId, context, at)

  const decision = decideProactive(facts)
  if (!decision.fire) return NOT_EMITTED(decision.reason)

  return emitProactiveMessage(userId, sessionId, decision.detail, facts, context, deps)
}
```

**Code — the import**, added to the top of the file after the `./queries` import:

```ts
import { resolveNinaWriteSession } from './sessionResolve'
```

**Impact:** `lib/review/actions.ts:72` calls `emitRunCommitted` with an unchanged input object, so
it does not change. `app/api/cron/nina/route.ts:139` calls `evaluateAndEmitForUser(userId)`,
unchanged. `tests/nina.cron.test.ts:30` mocks the whole module (`vi.mock('@/lib/nina/proactive',
() => ({ evaluateAndEmitForUser: vi.fn() }))`), so it does not change either. Nothing outside this
file calls `emitProactiveMessage`.

---

### Step 11: `lib/nina/imagejobs.ts` — the apology lands where he asked

**File:** `lib/nina/imagejobs.ts:180-192`
**Change:** `postNinaApologyMessage` resolves the session itself. Its two callers
(`failNinaImageJob:160` and `sweepStaleNinaImageJobs:264`) are **unchanged**, because both already
pass the one thing the resolution needs.

**Code — replacing the whole function, docstring included:**

```ts
/**
 * **R22's whole visible surface.** One `nina_messages` row, her words, nothing else.
 *
 * There is no error code in it, no status, no provider, no "please try again", and no button. The
 * runner is told, by his friend, that there is no photo. That is the entire feature.
 *
 * ── WHICH CONVERSATION IT LANDS IN (PHASE 3, R2) ──────────────────────────────────────────────
 * The one he asked in. `replyToId` is already *"the runner message that asked, so the photo or the
 * apology quotes it"* (`NinaImageJobArgs`), and that row carries a `session_id` — so
 * `resolveNinaSessionForMessage` reads the answer off the message rather than guessing at it. This
 * is strictly better than assumption A3's "the most recent session", which for a job opened twenty
 * minutes ago may no longer be the same chat: an apology arriving in a conversation he was not
 * having is worse than no apology, because it is Nina appearing to answer something he never said.
 *
 * A3 is still the fallback and covers the two honest misses — an avatar job, which has no runner
 * message at all (`failNinaImageJob` skips the apology for those, but the sweep's `args` may be
 * null), and a message deleted since the job opened, which phase 7 makes reachable.
 *
 * The resolution is one indexed read on a path that is already writing a row, and it runs at most
 * six times a day (the generation cap), so its cost is not worth optimising away by threading a
 * session through `NinaImageJobArgs` — which would also mean a schema-shaped decision about rows
 * already in flight, and `jsonb` args written before this phase carry no session at all.
 */
export async function postNinaApologyMessage(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  replyToId: string | null
}): Promise<void> {
  const sessionId = await resolveNinaSessionForMessage(input.userId, input.replyToId)

  await insertNinaMessages(
    input.userId,
    [
      {
        role: 'nina',
        body: ninaImageApology(input.kind, input.jobId),
        source: 'chat',
        turnId: input.jobId,
        replyToId: input.replyToId,
      },
    ],
    sessionId,
  )
}
```

**Code — the import**, added after the existing `./queries` import at `:19`:

```ts
import { resolveNinaSessionForMessage } from './sessionResolve'
```

**Impact:** `tests/nina.imagefail.test.ts` and `tests/nina.imagedispatch.test.ts` exercise this
area; if either asserts on `insertNinaMessages`'s argument shape it needs the new field in its
expectation. Check both when running the suite — the change is additive, so a `toEqual` on the
insert payload is the only thing that can fail.

---

### Step 12: `lib/nina/sessionActions.ts` — create, rename, pin, remove

**File:** `lib/nina/sessionActions.ts` (new)
**Change:** the four lifecycle mutations R2, R4 and R11 need, as Server Actions phase 5 calls.

**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { SESSION_PARAM, mostRecentSessionId, sanitizeNinaSessionTitle } from './active'
import {
  createNinaSession,
  removeNinaSession,
  listNinaMessages,
  listNinaSessions,
  renameNinaSession,
  setNinaSessionPinned,
} from './queries'

/**
 * **The session lifecycle: create (R2), rename (R3's manual half), pin (R4), remove (R11).**
 *
 * ── WHY A SEPARATE FILE FROM `lib/nina/actions.ts` ────────────────────────────────────────────
 * The same isolation argument `lib/nina/albumActions.ts` makes in its own header, and it is
 * stronger here: `actions.ts` is edited by phases 3, 4 and (through `SentBubble`) 7, while these
 * four functions are read by phase 5 and nothing else. Keeping them apart means phase 5's sidebar
 * imports a file no other phase is holding open.
 *
 * ── WHY EVERY ACTION RETURNS A RESULT AND NAVIGATES NOTHING ───────────────────────────────────
 * Next 16.3.1 permits `redirect()` inside a Server Action — it performs a client-side navigation,
 * pushing a history entry by default. This file does not use it, for two reasons. The repo has no
 * precedent: all ten of its action modules return a result object and call `revalidatePath`, and
 * the caller navigates (`lib/push/actions.ts`, `lib/admin/memoryActions.ts`, `app/actions/share.ts`).
 * And the caller here belongs to ANOTHER PHASE — phase 5 owns the sidebar and the destructive
 * control's confirmation, so a redirect buried in this file would take a decision away from it and
 * default to a pushed entry pointing at a session that no longer exists.
 *
 * `next` is therefore the seam: a URL when the caller MUST move, `null` for "stay exactly where
 * you are, the revalidate has already refreshed the list".
 *
 * ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────────────────────────
 * **It does not confirm anything.** `removeNinaChatSession` deletes a conversation and, through
 * two cascades, its photographs' rows — permanently, with no archive flag and no undo (assumption
 * A8). There is no confirm dialog anywhere in this codebase today, so the confirmation is the only
 * thing standing between a mis-tap and a lost conversation, and it is PHASE 5's, on the control
 * that calls this. If phase 5 ships the control without one, that is the bug — not this file.
 *
 * **It makes no model call**, so it has no entry in `scripts/check-llm-payload-boundary.mjs` and
 * phase 4 remains that file's only editor (invariant 2). R3's titler is a model call and lives in
 * phase 4's `lib/nina/title.ts`; `renameNinaChatSession` below is the manual path only.
 *
 * ── OWNERSHIP IS PROVED IN SQL, ONCE ──────────────────────────────────────────────────────────
 * Invariant 3. Every `queries.ts` function below takes `userId` first and puts it in the `WHERE`,
 * so a foreign session id comes back `false` and there is no separate `getNinaSession` pre-check
 * to go stale beside it. A session id from a client is a claim; a row that came back from an
 * owner-scoped write is a fact.
 */

export interface NinaSessionActionResult {
  ok: boolean
  /**
   * Where the caller should navigate, or `null` for "stay put".
   *
   * Only `removeNinaChatSession` ever returns non-null, and only when it deleted the session the
   * screen was reading. `revalidatePath('/nina')` has already re-rendered the list, so a rename or
   * a pin needs no navigation at all.
   */
  next: string | null
}

export interface NinaSessionCreateResult {
  ok: boolean
  sessionId: string | null
  next: string | null
}

/**
 * **"New chat" (R2).** Creates the session EAGERLY and hands back the URL that opens it.
 *
 * ── WHY EAGER AND NOT LAZY ────────────────────────────────────────────────────────────────────
 * A lazy session has no id, so the URL cannot name it — and then the first send has to guess which
 * conversation it belongs to. The only answer available to a send with no id is "the most recent
 * session", which is the OLD one: he taps "new chat" to focus on a new topic and his first message
 * lands in the topic he was trying to leave. That is R2 failing at its one sentence. Eager also
 * keeps the write in a write path: `app/nina/page.tsx` may not create a session during render,
 * because *"Next may render a segment more than once, and PPR renders it before a request even
 * exists"* — its own words about why `markNinaMessagesRead` sits in `after()`.
 *
 * ── THE COST OF EAGER, AND THE ONE MITIGATION WORTH HAVING ────────────────────────────────────
 * An empty session shows in the list. So: if his newest session has no messages at all, that IS
 * the new chat and this returns it instead of creating a second one. Tapping "new chat" three
 * times in a row therefore yields one empty session rather than three. One `limit: 1` indexed
 * read buys that.
 *
 * It is deliberately not more clever than that. Create a session, chat in an older one, then
 * create again and you get one empty row — and one empty row, in a list he can delete from
 * (R11), is not worth a second mechanism.
 *
 * No `revalidatePath` on the reuse branch: nothing was written, so there is nothing to invalidate.
 */
export async function createNinaChatSession(): Promise<NinaSessionCreateResult> {
  const userId = await requireUserId()

  const sessions = await listNinaSessions(userId)
  const newestId = mostRecentSessionId(sessions)
  if (newestId !== null) {
    const anyMessage = await listNinaMessages(userId, { limit: 1, sessionId: newestId })
    if (anyMessage.length === 0) {
      return { ok: true, sessionId: newestId, next: `/nina?${SESSION_PARAM}=${newestId}` }
    }
  }

  /* No title argument: phase 1's `createNinaSession` supplies its own deterministic placeholder.
   * A title from a model call here would be a model call in a mutation the runner is waiting on,
   * and phase 4's titler runs in `after()` after the first real exchange instead. */
  const created = await createNinaSession(userId)
  revalidatePath('/nina')
  return { ok: true, sessionId: created.id, next: `/nina?${SESSION_PARAM}=${created.id}` }
}

/**
 * **A manual rename (R3's second half).**
 *
 * The sanitising is `sanitizeNinaSessionTitle`'s, in `lib/nina/active.ts`, where it is pure and
 * unit-tested (invariant 7) and where phase 4 can replace its body with the rule from
 * `lib/nina/title.ts` without touching this call site. A blank rename is refused rather than
 * written: a session with no name is a blank row in the sidebar, which is worse than the
 * placeholder it replaced, and "clear the title" is not a capability anyone asked for.
 *
 * **This action does not touch `title_source`.** Phase 4 owns the field and the rule it exists
 * for — that a manually chosen name is never overwritten by the titler — and phase 1 owns the
 * column. If phase 1's `renameNinaSession` does not already stamp the source, that is phase 4's
 * one-line addition inside `queries.ts` and not a second write from here.
 */
export async function renameNinaChatSession(input: {
  sessionId: string
  title: string
}): Promise<NinaSessionActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.sessionId)) return { ok: false, next: null }

  const title = sanitizeNinaSessionTitle(input?.title)
  if (title === null) return { ok: false, next: null }

  const ok = await renameNinaSession(userId, input.sessionId, title)
  if (ok) revalidatePath('/nina')
  return { ok, next: null }
}

/**
 * **Pin or unpin (R4).** One action for both directions rather than two, because the caller is a
 * toggle and it already knows which way it is going — and because two actions would let a
 * double-tap send "pin" twice and read as flaky.
 *
 * The ORDERING that pinning buys is phase 1's pure rule, rendered by phase 5. This action only
 * flips the flag; `revalidatePath('/nina')` is what makes the list reorder, and Next's own note is
 * that revalidation in a Server Function *"updates the UI immediately (if viewing the affected
 * path)"*, which is the whole interaction.
 */
export async function setNinaChatSessionPinned(input: {
  sessionId: string
  pinned: boolean
}): Promise<NinaSessionActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.sessionId)) return { ok: false, next: null }

  const ok = await setNinaSessionPinned(userId, input.sessionId, input?.pinned === true)
  if (ok) revalidatePath('/nina')
  return { ok, next: null }
}

/**
 * **Remove a session (R11), and the two edge cases that are the whole difficulty.**
 *
 * A HARD DELETE (assumption A8). `nina_messages.session_id` cascades, and through
 * `nina_message_images.message_id`'s existing cascade the photos' rows go with it. Not an archive
 * flag: the runner's stated reason for the neighbouring requirement is that stale history pollutes
 * Nina's context, and an archived session that still answered `getNinaMessageWindow` would defeat
 * R11 exactly the way it would defeat R8.
 *
 * **What is deliberately NOT cleaned up, stated rather than discovered later.** The Vercel Blob
 * objects behind those image rows stay — nothing dereferences them and the `reap-orphaned-blobs`
 * skill does not cover `nina/` yet (the plan's scope section says so and gives it its own card).
 * And `nina_memory_facts.source_message_id` / `nina_memory_slots.source_message_id` are plain
 * `text` columns with **no** foreign key, so a distilled fact whose source message just vanished
 * keeps a dangling pointer instead of cascading away — which is the right outcome and the same one
 * assumption A5 reaches for a deleted message: a fact may still be true after the sentence that
 * produced it is gone.
 *
 * ── EDGE CASE 1: HE REMOVED THE SESSION HE WAS READING ────────────────────────────────────────
 * `next: '/nina'` — bare, with no `?s=`. The page re-resolves to his newest remaining chat, so he
 * lands somewhere real rather than on an empty screen with a dead id in the URL.
 *
 * ── EDGE CASE 2: HE REMOVED HIS LAST SESSION ──────────────────────────────────────────────────
 * The same `next: '/nina'`, and the same resolution answers it: `chooseActiveSession([], null)` is
 * `null`, the page renders its empty state with a clean URL, and a send from there carries
 * `sessionId: null`, which `resolveNinaWriteSession` turns into a fresh session. The cron survives
 * by calling that same function. The screen and the cron are one mechanism, which is the only
 * reason they cannot disagree.
 *
 * ── AND WHEN IT WAS SOME OTHER SESSION: `next: null` ──────────────────────────────────────────
 * He tidied up a chat he was not reading. `revalidatePath('/nina')` has already re-rendered the
 * list; navigating would yank him out of the conversation he is in, which would be a bug.
 *
 * `activeSessionId` is REQUIRED and nullable for the reason `ChatScreen`'s `pendingPhoto` is
 * (RULING E2b): the caller is one component, and `tsc` should be the thing that notices if it
 * stops passing it. An optional field defaulting to "not the open one" would silently strand him
 * on a deleted session exactly once — the case that matters most.
 */
export async function removeNinaChatSession(input: {
  sessionId: string
  activeSessionId: string | null
}): Promise<NinaSessionActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.sessionId)) return { ok: false, next: null }

  const removed = await removeNinaSession(userId, input.sessionId)
  /* Not his, or already gone. Same outcome, no navigation, nothing invalidated — and the caller is
   * told, because a delete control that reports success on a row that is still there is worse than
   * one that reports failure. */
  if (!removed) return { ok: false, next: null }

  revalidatePath('/nina')

  const wasOpen = input.activeSessionId === input.sessionId
  return { ok: true, next: wasOpen ? '/nina' : null }
}
```

**Impact:** no caller until phase 5. `tsc` and the guards pass; `revalidatePath` on a literal path
needs no `type` argument (Next requires one only for a path containing a dynamic segment).

---

### Step 13: `app/nina/page.tsx` — resolve the session, read one session

**File:** `app/nina/page.tsx:1-29` (imports), `:114-120` (the params), `:137-165` (the reads),
`:280-286` (the `ChatScreen` call)
**Change:** four edits. **`export const maxDuration = 60` and its full comment stay verbatim**
(D7). **The `<header>` stays** — phase 5 removes it (R7), not this phase. **RECONCILED: phase 2
did not *add* a chrome-mode prop, it RENAMED the existing one** — `bottomGap` -> `screen`,
`components/ui/AppShell.tsx:49`, with `app/nina/page.tsx:259` becoming `<AppShell screen="chat">`.
The opening tag below is therefore quoted **post-phase-2**. Do not reintroduce `bottomGap`.

**Code — the imports.** Add to the existing blocks:

```ts
import {
  SESSION_PARAM,
  chooseActiveSession,
  parseNinaSessionParam,
} from '@/lib/nina/active'
import {
  getCurrentNinaAvatar,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  listNinaMessages,
  listNinaSessions,
  markNinaMessagesRead,
  type NinaMessageRow,
} from '@/lib/nina/queries'
```

**Code — the component, from its opening brace through the end of the `Promise.all`:**

```tsx
export default async function NinaPage({ searchParams }: PageProps<'/nina'>) {
  const userId = await requireUserId()
  const {
    [ATTACH_PARAM]: attachParam,
    [PHOTO_PARAM]: photoParam,
    [SESSION_PARAM]: sessionParam,
  } = await searchParams
  /* Parsed BEFORE the reads, because which table to read is what the grammar decides. Pure, so it
   * costs nothing and cannot fail; `null` means "no photo on this link" and every branch below
   * short-circuits on it. */
  const photoPointer = parseNinaPhotoParam(photoParam)

  /*
   * ── R2's ROUTING DECISION, AND WHY IT IS ITS OWN READ ─────────────────────────────────────────
   * `?s=<id>` names the open conversation (assumption A4), and `listNinaMessages` cannot run until
   * it is known — so this one indexed read sits on the critical path ahead of the `Promise.all`
   * below rather than inside it. That extra round trip is the price of A4 and it is worth paying:
   * `listNinaMessages` is owner-scoped, so passing a forged `?s=` straight through would come back
   * `[]` and paint an EMPTY conversation with a dead id still in the address bar. One index scan
   * on `(user_id, …)` buys the difference between that and "your newest chat". Invariant 4 is
   * untouched — still no model call, still nothing unindexed.
   *
   * A MISS DEGRADES SILENTLY, exactly as `?attach=` and `?photo=` do: a forged id, another
   * runner's id and an id he deleted on his other phone all resolve to his most recently active
   * session. `chooseActiveSession` carries the argument, including why it ignores `pinned`.
   *
   * `null` IS A REAL ANSWER — he has no sessions at all. Reachable two ways: a runner who has
   * never messaged, and R11's runner who just removed his last one. The screen renders
   * `ChatScreen`'s existing empty state, and a send from it carries `sessionId: null`, which the
   * ACTION resolves-or-creates. Creating one here would be a database write in a render path,
   * which the `after()` below exists to avoid.
   *
   * Phase 5 renders this same list in the sidebar, ordered by phase 1's pinned-first rule; this
   * page reads it only to answer "which one". Two questions, one query.
   */
  const sessions = await listNinaSessions(userId)
  const activeSessionId = chooseActiveSession(sessions, parseNinaSessionParam(sessionParam))

  /*
   * Two reads, concurrently — and the second one is here for its SIDE EFFECT.
   * `listOpenNinaImageJobs` sweeps stale image jobs first (phase 12), so ARRIVING ON THIS PAGE IS
   * ITSELF R22's LAST GUARANTEE: a job that GitHub never ran gets its apology written by the act of
   * the runner coming to look for the photo. That is the one mechanism in the phase that still
   * works when Actions is disabled, the PAT is revoked, or the workflow's `schedule:` has been
   * switched off for repository inactivity — none of which the app can detect.
   *
   * The returned rows are deliberately unused here; phase 15 is what renders "generating...". A
   * swept apology is written concurrently with this read, so it appears on the NEXT navigation
   * rather than this one — and since phase 3 it is written into the session the runner ASKED in
   * (`postNinaApologyMessage` resolves it from the message it replies to), which is not necessarily
   * the session this render is showing. That is correct and it is the same one-load lag this
   * screen already accepts.
   *
   * Invariant 4 holds: two indexed reads and, on the rare stale path, a handful of UPDATEs. No
   * model call is awaited in a render path — the generation itself is on a GitHub runner.
   */
  const [rows, , avatarRow, photoRow] = await Promise.all([
    /*
     * R2. ONE session's messages. `Promise.resolve` on the empty branch rather than a conditional
     * `await` after the block, on the `?photo=` branch's precedent below: keeping it inside the
     * `Promise.all` means the empty case costs nothing and the ordinary case still overlaps the
     * other three reads.
     */
    activeSessionId === null
      ? Promise.resolve<NinaMessageRow[]>([])
      : listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT, sessionId: activeSessionId }),
    listOpenNinaImageJobs(userId),
    /*
     * F33 phase 13 (R17). A THIRD indexed read, not a model call: `getCurrentNinaAvatar` is a
     * single-row lookup on the partial unique index `nina_avatars_user_current_unq`, so it costs
     * about what reading a column off `profiles` costs and invariant 4 is untouched.
     *
     * `null` is a real answer and not a failure — phase 13's D-2 rules that there is no seed row,
     * so "no row" means the committed `public/nina/avatar-001.png`. `ninaAvatarView` is the one
     * function that knows it, and the detail page calls the same one, so the header and the hero
     * cannot disagree about which face is hers.
     */
    getCurrentNinaAvatar(userId),
    /*
     * F34 R2. A FOURTH indexed read, and only when the link asked for one — see the header. Both
     * branches are single-row primary-key lookups scoped to `user_id`, so "not his" and "gone" come
     * back as the same `null` and neither leaks which ids exist.
     *
     * `Promise.resolve(null)` rather than a conditional `await` after the block: keeping it inside
     * the `Promise.all` means the read overlaps the other three instead of adding a round trip to
     * the critical path of a link that was clicked from another tab.
     */
    photoPointer === null
      ? Promise.resolve(null)
      : photoPointer.kind === 'avatar'
        ? getNinaAvatar(userId, photoPointer.id)
        : getNinaMessageImage(userId, photoPointer.id),
  ])
  const avatar = ninaAvatarView(avatarRow)
```

Everything from `const pendingPhoto: NinaExistingPhoto | null = ...` down to and including
`after(() => markNinaMessagesRead(userId))` is **unchanged**. In particular the `after()` stays
user-wide; phase 8 owns making it session-scoped.

**Code — the `return`, replacing lines 258-289:**

```tsx
  return (
    <AppShell screen="chat">
      <header className="mb-5 flex items-center gap-3">
        {/*
          R17's first tap level: her face is a door. `size-11` is already 44 px — the iOS
          tap-target floor — which phase 4 chose "for when phase 13 makes it a link", so no
          geometry changes here.

          A `<Link>` and not a `<button>`: it is a navigation, so it gets the platform's own
          long-press, middle-click and back behaviour for free, and Next prefetches the route.

          **PHASE 5 DELETES THIS WHOLE HEADER (R7)** and moves the avatar and her name into the
          sidebar. Phase 3 leaves it exactly as it found it: two phases editing one file is the
          hazard this plan set declared its file edges for, and a header removed here would collide
          with the phase that owns the surface it moves to.
        */}
        <Link href="/nina/about" aria-label="Buka detail Nina" className="rounded-pill">
          <NinaAvatar size="md" src={avatar.src} natural={avatar.natural} crop={avatar.crop} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      {/*
        ── `key` IS LOAD-BEARING (PHASE 3, D8). DO NOT REMOVE IT. ────────────────────────────────
        `ChatScreen` holds the conversation in `useState` and reconciles a changed `initial` prop
        DURING RENDER through `mergeServerMessages`, which is "server order + local content" and
        deliberately keeps optimistic rows the server has not seen yet. Navigating from `?s=A` to
        `?s=B` is the same route with different search params, so without a key React reconciles
        the SAME component instance and merges session B's server rows into session A's local
        state: leftover bubbles from the previous chat, plus a draft quote and an armed attachment
        pointing at messages in a conversation he has left.

        A different conversation is a different screen, so remounting and discarding every piece of
        local state is not a workaround — it is the correct semantics. `'none'` covers the
        no-sessions case so the key is never `undefined`.
      */}
      <ChatScreen
        key={activeSessionId ?? 'none'}
        initial={initial}
        todayISO={todayInJakarta()}
        userId={userId}
        sessionId={activeSessionId}
        pending={pending}
        pendingPhoto={pendingPhoto}
      />
    </AppShell>
  )
}
```

**Impact:** `/nina` renders one session. `PageProps<'/nina'>`'s `searchParams` is
`Promise<Record<string, string | string[] | undefined>>`, so `sessionParam` arrives as
`string | string[] | undefined` and `parseNinaSessionParam(raw: unknown)` takes it directly — the
same arrangement `parseNinaPhotoParam` already has with `photoParam`.

---

### Step 14: `components/nina/ChatScreen.tsx` — the session id on the send path

**File:** `components/nina/ChatScreen.tsx:83-120` (props), `:144-165` (the URL comment),
`:426-441` (the send), `:510` (the dep array)
**Change:** one required prop, one field on the send, one dep, and one paragraph of comment.
**`COMPOSER_CLEARANCE_PX` and `COMPOSER_FALLBACK_PX` are not touched** — phase 2 owns that
geometry and may already have changed them.

**Code — the prop, added to the destructure and to the type. The destructure becomes:**

```tsx
export function ChatScreen({
  initial,
  todayISO,
  userId,
  sessionId,
  pending,
  pendingPhoto,
}: {
```

**and the following member is added to the props type, between `userId` and `pending`:**

```tsx
  /**
   * **R2. The conversation this screen is reading, and the one a send writes into.**
   *
   * Resolved on the server from `?s=` against an owner-scoped list, so by the time it is here it
   * is a session he owns — see `chooseActiveSession`. It is passed straight through to
   * `sendNinaMessage` and read by nothing else in this component; the screen does not need to know
   * a session's title, its pin state or its position in the list, and phase 5's sidebar is where
   * all three live.
   *
   * `null` means he has NO sessions at all — a runner who has never messaged, or R11's runner who
   * just removed his last one. The send carries the `null` through, and the ACTION resolves it (or
   * creates a session), because a render must not write. Nothing on this screen branches on it:
   * `messages` is `[]` in that state, so the existing `EmptyState` already renders.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and the same reasoning `pendingPhoto`
   * carries: `app/nina/page.tsx` is the one caller and `tsc` should be the thing that notices if
   * it stops passing it. An optional prop defaulting to `null` would turn a broken route into a
   * chat that quietly wrote every message into whichever session happened to be newest.
   *
   * **`app/nina/page.tsx` also keys this component on it** (`key={activeSessionId ?? 'none'}`),
   * so a session switch remounts rather than merging the previous conversation's local state into
   * this one. That key is not decoration — see the comment at the call site.
   */
  sessionId: string | null
```

**Code — the URL comment, replacing lines 144-157 (the `useLayoutEffect` body at 158-165 is
UNCHANGED):**

```tsx
  /*
   * **`?attach=` AND `?photo=` are consumed, not left lying on the entry.** They have done their
   * job the moment they are in state, and leaving them would re-arm the composer on the way back:
   * send the message, tap its card, come back with the back-swipe, and the POP would re-render this
   * page from a URL still asking for the same run — pinning a run the runner already sent. `?photo=`
   * has the sharper version of the same problem, because the tab it opened in stays open: a reload
   * of that tab would re-arm the same album photo and invite a second send of it.
   *
   * ONE effect deleting both, not two: `replaceState` on a `URLSearchParams` copy so R14's `at`
   * (which may be written onto this same entry later, or may already be on it) survives untouched,
   * and two independent `replaceState` calls in the same commit would race to decide which of them
   * wrote the surviving URL. The F24 idiom, and the reason it is `replace`: this entry is where we
   * already are.
   *
   * ── AND SINCE PHASE 3, `?s=` SURVIVES IT FOR EXACTLY THE SAME REASON ────────────────────────
   * The session parameter (R2, assumption A4) names the open conversation and MUST outlive this
   * effect: deleting it would drop him back to his newest chat one frame after the page painted.
   * It survives because this effect copies the query and deletes two keys BY NAME rather than
   * rebuilding it — the property `useChatScroll.ts`'s header already anticipated when it wrote
   * that its own copy exists "so a future parameter on `/nina` survives". `?s=` is that
   * parameter. **So do not "simplify" the two `delete` calls into a freshly built
   * `URLSearchParams`**, and do not add a third `replaceState` to this component: phase 3
   * deliberately writes `?s=` by NAVIGATION only — a `<Link>` or a `router.push` from a user
   * gesture — so there is never a second writer of this URL in the same commit as this effect,
   * which is the race the paragraph above is about.
   */
```

**Code — the send, replacing lines 426-441:**

```tsx
        result = await sendNinaMessage({
          body,
          imageTickets: draft.images.map((image) => image.ticket),
          replyToMessageId,
          runId: sending?.runId ?? null,
          /*
           * F34 R2, and the whole of "we dont actually reupload the photo into the chat, but just
           * some kind of pointer to the existing file". An id and a kind, never a URL: the field
           * has existed since F33 phase 13 and `resolveAttachment` proves ownership against
           * `user_id` before a row is written, which is strictly more than a signed ticket could
           * prove. The `url` this component holds is for the chip and for the optimistic bubble;
           * it is not sent, and a tampered one buys nothing.
           */
          attachExisting:
            sendingPhoto === null ? null : { kind: sendingPhoto.kind, id: sendingPhoto.id },
          /*
           * R2. The conversation this message joins. Read from the prop rather than from the URL,
           * because the server already proved this session is his — re-reading `?s=` here would
           * re-introduce an untrusted claim the page has already resolved.
           *
           * `null` is passed through deliberately: it means he has no sessions, and the action
           * resolves-or-creates. Refusing on the client instead would leave the composer enabled
           * with nowhere to send, which is the "enabled Send button that silently refuses" the
           * refusal-parity comment above warns about.
           */
          sessionId,
        })
```

**Code — the dep array, replacing line 510:**

```tsx
    [busy, draftQuote, attachment, photo, sessionId],
  )
```

**Impact:** the tree compiles again. `handleSend` closes over `sessionId`, so the dep is required —
`react-hooks/exhaustive-deps` would flag it otherwise, and a stale closure would send to the
previous session for one render after a switch (mostly hidden by the `key` remount, which is not a
reason to omit the dep).

---

## Verification

**Build:**

```
npm run lint && npm run format:check && npm run typecheck
```

`npm run typecheck` is the load-bearing one and it runs `next typegen && tsc --noEmit`, so
`PageProps<'/nina'>` resolves. **Every error it reports between Steps 3 and 14 is a message writer
or reader that had not decided which conversation it was in** — that is the acceptance test the
phase scope names, and the errors are to be worked through, never silenced with a default.

**Tests:**

```
npm test
npm run ci:llm-payload-guard && npm run ci:data-layer-guard
```

`ci:llm-payload-guard` must pass **unchanged** — this phase adds no model call and does not edit
`scripts/check-llm-payload-boundary.mjs` (phase 4 is its sole editor). `ci:data-layer-guard` reads
`lib/db/queries.ts`, which this phase does not touch. Also worth running, because they exercise the
files Steps 10 and 11 edit: `tests/nina.cron.test.ts`, `tests/nina.proactive.test.ts`,
`tests/nina.imagefail.test.ts`, `tests/nina.imagedispatch.test.ts`. All four should pass without
edits; the only plausible break is a `toEqual` on an `insertNinaMessages` payload, which now carries
one more field.

**Manual check** — in order, because each step sets up the next:

1. `/nina` with no `?s=`. The existing conversation renders (phase 1's backfill put it in one
   session). The URL stays bare — nothing rewrote it.
2. Call `createNinaChatSession()` and open the `next` URL it returns. Empty chat, `?s=<newid>` in
   the address bar. Send "apa kabar". Her reply must not reference anything from the old session —
   **this is R2's real test, and it is about the prompt, not the screen.**
3. Go back to `/nina?s=<oldid>`. The old conversation is intact and the new message is not in it.
   Then forward again: no bubbles from the old session leak into the new one (D8's `key`).
4. Load `/nina?s=zzzzzzzzzzzz` and `/nina?s=nonsense`. Both paint the newest chat, silently, with no
   error and no empty screen.
5. `/nina?s=<id>&at=<mark>&attach=<runId>`. After paint, `attach` is gone from the URL and **both
   `s` and `at` are still there** (D1).
6. R11, case 1: `removeNinaChatSession({ sessionId: <open one>, activeSessionId: <same> })` returns
   `next: '/nina'`; navigating there lands on a real chat.
7. R11, case 2: remove every session. `/nina` renders the empty state with a clean URL. Send a
   message from it — it must succeed and a session must appear. Then run the cron
   (`evaluateAndEmitForUser`) against a user with zero sessions: it must not throw, and its message
   must be findable.
8. Confirm the proactive path: with two sessions, trigger a run commit. The message lands in the
   most recently active session, not in the pinned one.
9. `SELECT count(*) FROM nina_messages WHERE session_id IS NULL` is still 0 after all of the above.

**Exit criteria:**

- Two sessions hold different conversations, and a turn sent in one does not appear in the other.
- **Nina's prompt for a turn in the new session contains none of the old session's messages** —
  asserted mechanically by `tests/nina.gateway.patterns.test.ts`'s new block, and observably by
  manual check 2.
- She does **not** re-introduce herself or re-ask his nickname in a new session (D4).
- A proactive message written with no session in view lands in his most recently active session, and
  R22's apology lands in the session he asked in.
- Removing the open session navigates to a real one; removing the last one leaves both the screen
  and the cron working.
- A forged `?s=` degrades silently; a forged `sessionId` on a send is refused.
- `npm run typecheck` passes with **no** optional session parameter left on
  `listNinaMessages`, `getNinaMessageWindow` or `insertNinaMessages`.

---

## Handoffs

Work found while planning and deliberately left to the phase that owns it.

1. **Phase 1 — the list's sort key must coalesce. ✅ RESOLVED IN RECONCILIATION — nothing to do.**
   Phase 1's `sessions.ts` already coalesces, and by the same rule: `sessionActivityAt` returns
   `session.lastUserMessageAt ?? session.createdAt`, and phase 1's D3 puts the ordering in that pure
   function rather than in a SQL `ORDER BY` at all. A session created by "new chat" therefore sorts
   to the TOP, not the bottom, which is what this handoff was written to prevent. My
   `mostRecentSessionId` coalesces identically, so the resolution order and the display order agree
   about what "active" means.
2. **Phase 1 — `NinaSessionListRow` must expose `lastUserMessageAt` and `createdAt` as `Date`s on
   the row. ✅ RESOLVED — it does.** (Reconciled: the type's name is phase 1's `NinaSessionListRow`,
   not `NinaChatSessionRow`, and the pin field is `pinnedAt: Date | null`, not `pinned: boolean`;
   `SessionActivity` above was changed to match field for field.) Phase 1 derives
   `lastUserMessageAt` at read time — there is no stored column, by its D3 — and returns it as a
   `Date`. My `SessionActivity` is a structural subset of it, so no mapping step exists to hide a
   mismatch.
3. **Phase 4 — the titler's call site is written as a comment in `lib/nina/actions.ts` (Step 8g)
   and nothing else.** `sessionId` is in scope there; the success path is the only exit worth firing
   on; idempotence is the titler's, because `after()` can run twice.
4. **Phase 4 — `sanitizeNinaSessionTitle` in `lib/nina/active.ts` is the manual-rename seam.**
   Replace its body if phase 4's rule differs; do not add a second sanitiser. **Reconciled: the cap
   is no longer this phase's to protect.** `NINA_SESSION_TITLE_MAX_CHARS` (`= 60`) is declared once,
   in phase 1's `lib/nina/sessions.ts`; `active.ts` imports it, phase 4's `lib/nina/title.ts`
   imports it, and phase 5's input reads the same number for `maxLength`. The constraint this
   handoff was defending still holds — the constant lives in a pure module a `'use client'` file can
   import — it is just satisfied by phase 1's module instead of by this one.
5. **Phase 4 — `title_source` is not written by `renameNinaChatSession`.** If the "a manual title is
   never overwritten by the titler" rule needs the rename to stamp it, that stamp belongs inside
   phase 1's `renameNinaSession` (one column on a write that already runs), not as a second write
   from my action.
6. **Phase 5 — the destructive confirmation is yours, and this phase's action has none.**
   `removeNinaChatSession` deletes a conversation and its photographs permanently, with no archive
   flag and no undo. Also: honour `next` — `'/nina'` means navigate (prefer `router.replace`, so
   the back gesture cannot return to a deleted session), `null` means stay.
7. **Phase 5 — write `?s=` by NAVIGATION only.** A `<Link href={next}>` or a `router.push`/`replace`
   from a gesture. Do **not** add a `history.replaceState` for it: D1's whole argument is that there
   is no second writer of this URL in the same commit as `ChatScreen`'s mount-time effect.
8. **Phase 5 — the empty-chat copy.** `ChatScreen`'s `EmptyState` says "Nina has not started yet",
   which is right for a runner with no sessions and slightly off for a new session inside a long
   relationship. Left alone deliberately (it is one string and phase 5 owns the surface that creates
   new sessions); change it there if it reads badly.
9. **Phase 8 — `markNinaMessagesRead(userId)` in `app/nina/page.tsx`'s `after()` is untouched and
   still user-wide.** So opening session B currently marks messages read in session A too. Your
   plan's "Decides" section asks exactly this question; phase 3 states the current behaviour rather
   than pre-empting the answer. `countUnreadNinaMessages` is likewise unchanged.
10. **Unowned, worth a card — `daysSinceRunnerSpoke` after a total wipe.** It is computed from the
    session window, so a runner who removes every session and then goes quiet gets a freshly created
    empty session, `null`, and no silence nag until he speaks again (D4). Fixing it needs a
    user-wide "last runner message" read that no requirement asks for.
11. **Unowned, already in the plan's scope section — the blobs.** Removing a session cascades its
    `nina_message_images` rows and leaves the Vercel Blob objects. `reap-orphaned-blobs` does not
    cover `nina/` yet.
12. **Unowned — `lib/nina/context.ts`'s `ConversationFacts.olderMessageCount` doc comment** still
    reads "How many messages exist before the window", which is now imprecise (it counts his other
    sessions too). Left alone on purpose: `context.ts` is in no phase's `owns` list, the field's one
    consumer is a prompt string that is still accurate, and `nina-character-tuning` is editing
    `lib/nina/prompts/` concurrently on `main`. One comment, cheapest to fix in whichever phase
    next has a reason to open that file.

---

## Rollback

**This phase alone.** One commit on `feature/nina-chat-sessions`, so `git revert <phase-3 commit>`
backs it out and leaves phases 1 and 2 in place: `session_id` becomes a column nothing reads,
`getNinaMessageWindow` goes back to the whole conversation, and `/nina` renders every message again.
The three new files (`lib/nina/active.ts`, `sessionResolve.ts`, `sessionActions.ts`) and
`tests/nina.active.test.ts` disappear with it, which is fine because nothing outside this phase
imports them — until phase 5 lands.

**Once phase 5 has landed, this phase is no longer independently revertable**: the sidebar imports
`sessionActions` and `SESSION_PARAM`, so reverting phase 3 alone would break the build. Revert 5,
then 3, in that order — and 4 before either, if it has landed, since its `after()` hook lives in
this phase's `sendNinaMessage`.

**Do not revert the database.** The plan index's rollback section is explicit and this phase is the
line it draws: once phase 3 has shipped, `session_id` is load-bearing, and dropping the column
merges every session back into one conversation. Drop it only while phases 3-9 are all reverted, and
never after production has written a second session.
