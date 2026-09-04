# Code Analysis: Nina chat sessions, full-screen chat, and message editing

**Type:** Feature Implementation (with one bug fix, R9, and two UI updates, R1/R10)
**Date:** 2026-09-04 22:33 +07:00
**Session ID:** 20260904-223303-S3K9
**Plan:** `NINA_CHAT_SESSIONS_PLAN.md` (9 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-chat-sessions`, branch `feature/nina-chat-sessions` (base `origin/main` @ `0a924ba`)

---

## User Input

### Original User Request

> 1.UI update , when we click chat, make the chat full screen. so hide the bottom bar completely (because phone screen size is small). maybe add some floating small ^ button in the bottom middle of chat query ,so we can pull up the bottom bar anytime . add down button as well to hid it. also, auto hid the bottom bar after 5 seconds
> 1.To make the chat with Nina more organized, implement the chat sessions feature. 2.Users should be able to create a new chat session (so they can focus on a new topic) or return to previous conversations via session history, which displays a list of all past sessions .
> 3.after first interaction in a new session (user then nina) , llm will automatically create an appropriate title for the session (3-4 words). then user can also edit the session name manually.
> 4.user can also pin some sessions to the top.
> 5.we sort session by the most recent user message in each of the session, sorted from the most recent to the oldest
> 6.i think we should add a hidden sidebar. if user press a floating > button at the bottom left corner, it will slide right and take over full screen (phone screen size is small, so make sidebar take full screen). at the top of the sidebar we can search all chat as well. add a toggle at the right side of the search field (persist the toggle across app usage) to enable semantic search, so we can search using llm as well.
> 7.right now at the top we show Nina circle top bar .  move this Nina circle to inside of sidebar. so there is no more of this top bar, just clean chat
> 8. sometimes the interaction is embarassing or redundant. so , to keep nina context clean, give user the ability to edit his message, edit nina message, or delete his message, or delete nina message. this requirement is weird, but this is because nina will keep using previous history as context, so we need to give user the capability to make this context more "accurate"
> 9. UI bug: there is a red dot chat notification. but make sure this red dot will disappear on its own if user has opened the most recent chat
> 10. UI improvement: make user be able to click any image in the chat. clicking it will show the image full screen. add a download icon on the bottom right so user can also download the image, also add attach icon so user can attach this image to his new chat

And, sent while this analysis was being written:

> additional requirement: please give user the capability to remove a session as well

### User-Provided Context

None beyond the prose above. No error messages, no logs. The prompt's own numbering restarts at
`1.` after the first paragraph, so the first paragraph is one requirement and the second numbered
list runs 1..10 with its items 1 and 2 both describing the same deliverable (the sessions feature
and its history list). R11 arrived as a follow-up message a few minutes later and is numbered after
the original ten rather than folded into R2, so that the phase that ships it is checkable.

### User-Provided Files

None marked with `@`. Every file below was discovered by exploration.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Chat goes full screen: hide the bottom tab bar completely, a floating small `^` button at the bottom middle of the chat query to pull the bar back up, a down button to hide it again, and auto-hide after 5 seconds |
| R2 | Chat sessions: create a new session to focus on a new topic, or return to a previous conversation through a session-history list of all past sessions |
| R3 | After the first interaction in a new session (his message, then hers), an LLM writes a 3-4 word title for it; the user can also rename the session manually |
| R4 | The user can pin sessions to the top |
| R5 | Sessions sort by the most recent **user** message in each session, newest first |
| R6 | A hidden sidebar: a floating `>` button at the bottom-left slides it right to take over the full screen; a search-all-chats field at its top; a toggle to its right — persisted across app usage — enabling LLM semantic search |
| R7 | Move the Nina circle out of the top bar and into the sidebar; the top bar is gone, leaving clean chat |
| R8 | Edit his message, edit Nina's message, delete his message, delete Nina's message — so the history Nina reads as context stays accurate |
| R9 | Bug: the red-dot chat notification must clear itself once the user has opened the most recent chat |
| R10 | Tap any image in the chat to see it full screen; a download icon at the bottom right; an attach icon to attach that image to a new message |
| R11 | The user can remove a session |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

`/nina` today is one unbounded conversation per user. `nina_messages` has no partition column: the
screen renders the newest 200 rows (`CHAT_HISTORY_LIMIT`) and Nina's prompt reads the newest 40
(`CONTEXT_MESSAGE_WINDOW`), both scoped only by `user_id`. Every requirement except R1, R9 and R10
is downstream of introducing a session partition, because "focus on a new topic" is precisely a
statement about **what Nina is given to read**, not only about what the screen shows.

Three requirements are not about sessions at all and can be read on their own terms:

- **R1** is chrome geometry. The tab bar is rendered unconditionally by `AppShell`, and the
  composer's `bottom` is computed from the bar's height plus the Upload FAB's overhang
  (`composerBottomCss(overlap, TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX)`). Hiding the bar is
  therefore two coupled changes — the bar's own visibility, and the number the composer clears.
- **R9** is a real bug with an identified mechanism, below.
- **R10** is mostly already built. `components/ui/PhotoViewer.tsx` is the app's one full-screen
  overlay and already handles pinch-zoom, paging and Escape; `ChatImages` already accepts an
  `onOpen` prop and `MessageList` deliberately does not pass it. `ChatImages`'s own docstring says
  so in as many words: *"Wiring it is two lines plus viewer state in `ChatScreen`, and it should be
  its own card."* What is genuinely new is the download control and the attach control.

**R9's mechanism, from the code.** The dot is `countUnreadNinaMessages(userId)` — `role = 'nina'
AND read_at IS NULL` — rendered by `NinaUnreadBadgeSlot` inside `AppShell`, and cleared by
`after(() => markNinaMessagesRead(userId))` in `app/nina/page.tsx`. The clearing is real, but the
badge is a Server Component whose only refresh trigger is *a server render of another tabbed
screen*: `NinaUnreadBadge`'s own docstring states "It is deliberately NOT live… A dot that is at
most one navigation stale is a fair trade for zero polling." So the observed bug is exactly that
staleness — open `/nina`, read everything, and the dot stays painted until the next navigation,
because nothing re-renders the bar that carries it. `markNinaMessagesRead` returns a changed-row
count "so phase 10 can skip a `revalidatePath` when nothing did", and **no caller ever makes that
call** — the revalidation the comment anticipates was never written. Under sessions the same
question also gains a second half: *which* messages count as read when the runner opened one
session and not another.

**R8's real cost is the prompt, not the UI.** Editing or deleting a bubble is a row mutation, and
the row is read back into the model's context by `getNinaMessageWindow` on the next turn — which is
the entire point the user makes. Three collateral facts matter and are all visible in the schema:
`nina_messages.reply_to_id` is a self-FK with `ON DELETE SET NULL` (so deleting a quoted message
degrades a quote to plain text, already the documented behaviour); `nina_message_images.message_id`
cascades (so deleting a message deletes its photos' rows, leaving orphaned blobs the
`shots/`-style reaper does not cover); and `nina_memory_slots.source_message_id` /
`nina_memory_facts.source_message_id` are **plain text columns with no FK**, so a deleted message
leaves a dangling pointer in the memory ledger rather than cascading a fact away. That last one is
a decision to make, not a bug to fix — the distilled fact may still be true after the message that
produced it is gone.

**R6's semantic search has no existing substrate.** There is no `pgvector`, no embeddings column and
no embedding client anywhere in the tree (`grep -rn "embedding\|pgvector\|vector("` over `lib/` and
`drizzle/` returns nothing). Two clients exist: `lib/llm/client.ts` (`@anthropic-ai/sdk` against
`api.z.ai/api/anthropic`, model `env.LLM_MODEL`) and `lib/llm/vision.ts` (bare `fetch` against the
Chat Completions endpoint). So "search using llm as well" must be implemented as a model call over
candidate rows, not as a vector search, unless a vector column is introduced — and a model call
puts it under invariant 4 (never awaited in a render path) and therefore in a Server Action, the
same shape `describeNinaImage` already has.

**R6's persisted toggle has no precedent either.** `grep -rn "localStorage"` over `lib`,
`components` and `app` returns nothing, and `grep -rln "cookies()"` returns nothing. The app
persists client preferences nowhere today; the closest thing is `lib/panel/param.ts` and
`usePanelParam`, which persist UI state in the URL. So the storage mechanism for this one boolean is
a genuine open choice.

**Success Criteria**

1. `/nina` renders exactly one session's messages, and Nina's prompt window is scoped to that same
   session.
2. Every existing message survives the migration inside a session, in order, and the conversation
   reads unchanged after deploy.
3. A new session can be created, listed, opened, pinned and renamed from the sidebar.
3b. A session can be **removed**, and removing it takes its messages with it (R11).
4. A session that has seen one user message and one Nina reply acquires a 3-4 word title without
   the runner waiting for it.
5. The session list is ordered pinned-first, then by the most recent **user** message descending.
6. `/nina` shows no tab bar and no top header; the `^`/`v` and `>` floating controls behave as
   described, and the bar auto-hides 5 s after being pulled up.
7. A message can be edited or deleted, and the next turn's prompt reflects the change.
8. The dot disappears without a navigation once the newest session has been opened.
9. Tapping a chat image opens `PhotoViewer`, which can download it and attach it to a new message.
10. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and every `ci:*-guard`
    pass at the end of each phase.

**Key Considerations**

- **Invariant 4 is enforced by grep.** `scripts/check-llm-payload-boundary.mjs` fails the build if a
  named expensive symbol is awaited from a page render, and it lists four entry points today. Both
  new model calls (R3's titler, R6's semantic search) belong in that table, and the guard's own
  header says all entries ship in one commit from the phase that owns the file — so exactly one
  phase may edit it, or the set gets three merge conflicts in one guard.
- **`scripts/check-data-layer-invariants.mjs` counts unscoped reads in `lib/db/queries.ts`** and
  fails when a new exception appears. Session queries go in `lib/nina/queries.ts`, which that guard
  does not read — but every one of them must still take `userId` first, because invariant 7
  (ownership proved in SQL, not by a foreign key) is the rule the whole file is written to.
- **`nina_messages.seq` is a `bigserial` total order.** It is the sort key, the React key, the
  prompt-window cursor and the read watermark. A session partition must not replace it; sessions
  slice it.
- **Three writers of `nina_messages` exist, not one.** `lib/nina/actions.ts` (the runner's turn),
  `lib/nina/proactive.ts` (the five cron/`after()` triggers) and `lib/nina/imagejobs.ts` (R22's
  in-character apology for a failed generation). Every one needs a session to write into, and two
  of them run with no runner present and no session in view — so "which session does a proactive
  message land in" is a design decision the migration cannot dodge.
- **iOS geometry is load-bearing and already documented.** `composerBottomCss`, `keyboardOverlapPx`
  and `AppShell`'s `BOTTOM_GAP` literals encode the bar's 58 px, the FAB's 20 px overhang and
  `--safe-bottom`. Tailwind cannot read a TypeScript constant, so those numbers are spelled twice
  by necessity and the files say so; R1 changes what they mean and must change both spellings.
- **`components/nina/MessageBubble.tsx` already owns a touch gesture** (swipe-right to reply,
  decided by `decideReplySwipe`), and its docstring records why long-press and tap were rejected:
  long-press collides with iOS text selection, and tap would break selection outright. R8's
  edit/delete affordance must not re-litigate that by taking either gesture.
- **The app has one keyframe and a global reduced-motion escape.** `MessageBubble`'s header and
  `tests/motion.reducedMotion.test.ts` are explicit: a second keyframe would be the first in the
  codebase. R6's sidebar slide and R1's bar reveal are motion, and must be built as transitions with
  a reduced-motion answer, not as new keyframes.
- **An unrelated orchestration is in flight on `main`** (`nina-character-tuning`, 6 phases, touching
  `lib/nina/prompts/` and the persona). This set branches off `origin/main` @ `0a924ba` and does not
  read those files; conflicts, if any, resolve at pull-request time.

**Assumptions** — each is called out at the phase that acts on it, and each is a place the user may
overrule cheaply:

- **A1.** Session scoping applies to Nina's prompt window, not only to the screen. "Focus on a new
  topic" is meaningless if she still reads the last 40 messages across every session.
- **A2.** The memory ledger (`nina_memory_slots`, `nina_memory_facts`) stays **global**, not
  per-session. It is the long-term memory and `lib/nina/load.ts` calls it "the fact ledger… the
  long-term memory"; partitioning it would make her forget his nickname when he opens a new topic.
- **A3.** Proactive messages land in the runner's **most recent session** rather than in a session
  of their own, because they are conversation and a session per cron message would flood the list.
- **A4.** The active session is carried in the URL (`/nina?s=<id>`), matching the app's existing
  `usePanelParam` habit of putting UI state in the URL, and defaults to the most recent session.
- **A5.** Deleting a message deletes its `nina_message_images` rows (the FK already cascades) and
  leaves the blobs; distilled memory facts pointing at it are **kept**, because a fact may be true
  after the sentence that produced it is gone.
- **A6.** The semantic-search toggle persists in `localStorage`. It is a device preference with no
  server consumer, and the alternative — a column or a memory slot — makes a round trip to render a
  checkbox.
- **A8.** Removing a session removes its messages (`nina_messages.session_id` cascades) and, with
  them, their `nina_message_images` rows through the cascade that already exists. It is a hard
  delete, not an archive flag: the user's stated reason for R8 is that stale history pollutes her
  context, and an archived session that still answers `getNinaMessageWindow` would defeat R11 the
  same way. The blobs are left, exactly as in A5.
- **A7.** Semantic search is an LLM pass over candidate rows already narrowed by a SQL text match,
  not a vector index. Adding `pgvector` plus an embedding backfill is a larger feature than the
  requirement asks for, and this degrades honestly when the model is unavailable.

---

## Analysis Scope

### Explicitly Mentioned Files

None. Everything below was found by exploration.

### Discovered Related Files

| File | Why it is in scope |
|---|---|
| `lib/db/schema.ts` | `ninaMessages`, `ninaMessageImages`, `ninaMemorySlots`, `ninaMemoryFacts` definitions and indexes |
| `lib/nina/queries.ts` | every message read and write; 1882 lines, §4 is the conversation |
| `lib/nina/actions.ts` | `sendNinaMessage`, `describeNinaImage`; the runner's write path |
| `lib/nina/gateway.ts` | `readMessageWindow` — the bridge from rows to the prompt |
| `lib/nina/load.ts` | `loadNinaContext`, `CONTEXT_MESSAGE_WINDOW = 40` |
| `lib/nina/context.ts` | `buildNinaContext`, `conversationFacts` — what she is shown |
| `lib/nina/proactive.ts` | second writer of `nina_messages` (five triggers) |
| `lib/nina/imagejobs.ts` | third writer (R22's apology) |
| `lib/nina/chatview.ts` | `groupIntoDays`, `decideAutoScroll`, `keyboardOverlapPx`, `composerBottomCss` |
| `lib/nina/scroll.ts` | `resolveRestoreTop`, the `?at=` history mark |
| `lib/nina/reply.ts` | `resolveQuote`, `decideReplySwipe`, `QUOTE_FLASH_MS` |
| `app/nina/page.tsx` | the screen: four reads, the header row, `after(markNinaMessagesRead)` |
| `components/nina/ChatScreen.tsx` | the client half: send, reveal, keyboard, live refresh |
| `components/nina/MessageList.tsx` | day grouping, auto-scroll, quote resolution, the `above` slot |
| `components/nina/MessageBubble.tsx` | the bubble, the reply swipe, the `sr-only` reply button |
| `components/nina/ChatImages.tsx` | the in-bubble photo grid, with an unwired `onOpen` |
| `components/nina/Composer.tsx` | the fixed composer bar, its geometry and its pickers |
| `components/nina/NinaUnreadBadge.tsx` | R9's dot |
| `components/nina/NinaAvatar.tsx` | R7's circle |
| `components/nina/types.ts` | `ChatMessage`, the view model |
| `components/ui/AppShell.tsx` | renders `TabBar` unconditionally; owns `BOTTOM_GAP` |
| `components/ui/TabBar.tsx` | the bar, `TAB_BAR_HEIGHT_PX`, `TAB_BAR_FAB_OVERHANG_PX` |
| `components/ui/PhotoViewer.tsx` | R10's overlay, already built |
| `components/ui/Sheet.tsx` | the modal precedent: scroll lock, focus move, `onCloseRef` |
| `lib/photos/gallery.ts` | `decideSwipe`, `stepIndex` — the viewer's gesture rules |
| `lib/llm/client.ts` | `narrativeClient()`, `narrativeModel()` |
| `drizzle/0003_nina_avatar_folders.sql`, `drizzle/meta/_journal.json` | migration convention |
| `scripts/check-llm-payload-boundary.mjs` | the guard both new model calls must join |
| `scripts/check-data-layer-invariants.mjs` | the unscoped-read counter |

---

## Current Dataflow

### Entry Point: `GET /nina`

**Location:** `app/nina/page.tsx:118` (`export default async function NinaPage`)
**Trigger:** navigation to the fifth tab, or a deep link carrying `?attach=<runId>` / `?photo=avatar:<id>`
**Input:** `searchParams` only — `attach`, `photo`, and `at` (read client-side by `useChatScrollMark`)
**Segment config:** `export const maxDuration = 60`, present so `sendNinaMessage`'s 45 s budget is not
cut short by the platform default (a Server Action inherits the *page's* timeout)

**Reads, in order:**

1. `requireUserId()`
2. `parseNinaPhotoParam(photoParam)` — pure, decides which table branch 4 reads
3. a four-element `Promise.all`:
   - `listNinaMessages(userId, { limit: 200 })` → `NinaMessageRow[]`, oldest first
   - `listOpenNinaImageJobs(userId)` — **called for its side effect**; sweeps stale image jobs and
     may write an apology message
   - `getCurrentNinaAvatar(userId)` → `NinaAvatarRow | null`
   - `getNinaAvatar` / `getNinaMessageImage`, or `Promise.resolve(null)`
4. `getNinaMessageImagesForMessages(userId, rows.map(r => r.id))` — one query, grouped in a `Map`
5. `listRunAttachments(userId, [...attachedIds])` — the union of every `run_id` on screen plus `?attach=`

**Transform:** `rows.map(...)` builds `ChatMessage[]` — `dayISO` from `jakartaDayOf(row.createdAt)`,
`state: 'sent'`, `replyToId` passed through as a **pointer**, `imageUrls` from the map, `attachment`
from `indexAttachments`. This mapping is the only code in the feature that knows a column name.

**Exit:** `<AppShell bottomGap="chat">` → a `<header>` with the avatar `<Link>` to `/nina/about` and
an `<h1>Nina</h1>` → `<ChatScreen initial todayISO userId pending pendingPhoto />`

**Side effect:** `after(() => markNinaMessagesRead(userId))` — one indexed UPDATE, deliberately in
`after()` so a render has no side effect and a failed response does not clear the dot.

### Processing Chain: sending a message

1. **`Composer.submit()`** — `components/nina/Composer.tsx`
   - owns its own `value`, so a keystroke re-renders nothing above it (the `Sheet` focus-loss lesson)
   - photos are compressed and uploaded on *pick*, then described by `describeNinaImage` (a
     `glm-4.6v` pass), which returns a **signed ticket**; send carries tickets, never URLs
   - `canSend` is `body || images || attachment || photo`

2. **`ChatScreen.handleSend(draft)`** — `components/nina/ChatScreen.tsx:~380`
   - re-checks the same four disjuncts (the comment insists both sides stay identical)
   - appends an optimistic `ChatMessage` with a `local-<uuid>` id and `state: 'sending'`
   - `setTyping(true)`, then `await sendNinaMessage({...})`
   - on success adopts `result.userMessageId`, then walks `planReveal(bodies)` appending one bubble
     per gap with `setTyping(index < last)` — deliberately **not** inside a transition, because a
     transition would batch the reveal into one frame
   - two failure states, neither rendered as a Nina bubble: `send-failed` and `no-reply`

3. **`sendNinaMessage(input)`** — `lib/nina/actions.ts:220`, `'use server'`
   - `requireUserId()`; shape-checks `runId` and `attachExisting`; verifies image tickets
   - refuses when body, tickets, `runId` and `attachExisting` are all empty
   - `resolveAttachment` proves ownership of an already-owned blob **before** any write
   - **STEP 1**: `insertNinaMessages(userId, [{ role: 'runner', body, replyToId, runId }])` —
     his row is written *first*, because `loadNinaContext` reads the window out of `nina_messages`
     and a row not yet written is a row she cannot see
   - image rows via `insertNinaMessageImages`
   - `loadNinaContext(userId, dbNinaSourceGateway)` → `NinaContext`
   - `runNinaTurn({ userId, context, history, sourceMessageId, runnerText })` — a 13-16 s
     `glm-5.3` call with up to `MAX_TOOL_ROUNDS = 2` tool round trips
   - `insertNinaMessages(userId, bubbles)` — **one multi-row INSERT**, so `seq` comes out ascending
     in emission order; `reply_to_id` on the first bubble only
   - `after()` → `scheduleDistillation(...)` → `distillNinaMemory` (a second model call)
   - returns `{ ok, userMessageId, bubbles: SentBubble[], unavailable }`

4. **`loadNinaContext(userId, gateway)`** — `lib/nina/load.ts:129`
   - `Promise.all` over six gateway reads, then `Promise.all` over six more DB reads
   - `gateway.readMessageWindow(userId, 40)` → `getNinaMessageWindow(userId, 40)`, which is a
     `db.batch` of `ORDER BY seq DESC LIMIT 40` (reversed in TS) plus a SQL `count(*)`, yielding
     `{ messages, olderCount }` — the number that lets the prompt say "there are 312 earlier messages"
   - `buildNinaContext` turns all of it into `NinaContext`; `conversationFacts` shapes the window

### Data Persistence

**`nina_messages`** — `lib/db/schema.ts:718`

| column | type | note |
|---|---|---|
| `id` | `text` PK | `nanoid(12)`, appears in URLs, in `reply_to_id` and in the DOM (`#nina-msg-<id>`) |
| `seq` | `bigserial` | the total order. Assigned by Postgres, never reused. Sort key, cursor and watermark |
| `user_id` | `text` FK → `user.id` cascade | |
| `role` | `text` `$type<NinaRole>` | `'runner'` \| `'nina'` — *not* `user`/`assistant` |
| `text` | `text` | the DTO spelling is `body`; `queries.ts` is where the two meet |
| `source` | `text` `$type<NinaMessageSource>` default `'chat'` | `'chat'` plus five proactive kinds |
| `turn_id` | `text`, **no FK** | an audit pointer must not be able to block a delete |
| `reply_to_id` | `text` self-FK, `ON DELETE SET NULL` | a deleted target degrades a quote to plain text |
| `run_id` | `text` FK → `runs.id`, `ON DELETE SET NULL` | |
| `sent_at`, `delivered_at`, `read_at` | `timestamptz` | `read_at` is the unread predicate |

**Indexes:** `nina_messages_user_seq_idx (user_id, seq)`; the **partial**
`nina_messages_user_unread_idx (user_id, seq) WHERE read_at IS NULL AND role = 'nina'`, which the
schema notes runs "on every page render of every tabbed screen"; `nina_messages_reply_to_idx`;
`nina_messages_user_run_idx (user_id, run_id)`.

**`nina_message_images`** — `lib/db/schema.ts:802`. `message_id` FK **cascades** ("an image with no
message is nothing"). `user_id` is denormalised so the gallery read proves ownership without a join.
`description` is `glm-4.6v`'s private prose, for the prompt only — `app/nina/page.tsx` explicitly
drops it and nothing in `components/` may read it. Indexes:
`nina_message_images_message_idx`, `nina_message_images_user_created_idx (user_id, created_at DESC)`.

**`nina_memory_slots` / `nina_memory_facts`** — both carry `source_message_id` as a **plain `text`
column with no foreign key**. Deleting a message therefore leaves a dangling pointer rather than
cascading a fact away.

**Migrations:** `drizzle/0000…0003`, `drizzle-kit generate` style, `--> statement-breakpoint`
separators, snapshots in `drizzle/meta/`. The next file is `0004`.

### Exit Points

- the rendered `/nina` screen
- `SendNinaMessageResult` back to `ChatScreen`
- `after()` → `distillNinaMemory` (memory writes), `pushNotifier` (Web Push)
- `lib/service-worker.js`'s `push` handler posts `{ type: 'nina:new' }` to every open window;
  `ChatScreen` hears it on `navigator.serviceWorker` and calls `router.refresh()`, and
  `mergeServerMessages` reconciles server order with local content during render (not in an effect)

---

## Key Data Structures

### `NinaMessageRow` — `lib/nina/queries.ts:100`
`{ id, seq, role, body, createdAt, source, turnId, replyToId, runId, readAt }`.
Produced by a shared `messageColumns` projection; consumed by `app/nina/page.tsx`, `gateway.ts` and
`memory.ts`. **No session field exists.**

### `ChatMessage` — `components/nina/types.ts`
`{ id, role: 'user' | 'nina', body, dayISO, state, replyToId, imageUrls?, attachment? }`.
A view model, not a row — the indirection is why a column rename cannot reach a component. `role` is
`'user'` here and `'runner'` in the database; `app/nina/page.tsx` narrows structurally.

### `SendNinaMessageResult` — `lib/nina/actions.ts:94`
`{ ok, userMessageId, bubbles: SentBubble[], unavailable }`. `ok` is about the request,
`unavailable` is about her; `ok: true, unavailable: true` is the normal degraded turn.

### Chrome constants
`TAB_BAR_HEIGHT_PX = 58` and `TAB_BAR_FAB_OVERHANG_PX = 20` (`components/ui/TabBar.tsx`);
`COMPOSER_CLEARANCE_PX = 78` and `COMPOSER_FALLBACK_PX = 146` (`ChatScreen.tsx`);
`BOTTOM_GAP.chat = 'pb-[calc(10.5rem+var(--safe-bottom))]'` (`AppShell.tsx`). The comment on that
literal is explicit: "Tailwind cannot read a constant, so a change to any of them changes this
literal."

### `ViewerPhoto` — `components/ui/PhotoViewer.tsx`
`{ url, kind, label? }`, deliberately narrower than `ReviewPhoto`. Four callers today
(`ScreenshotStrip`, `SheetSource`, `PhotoInclusionList`, and the album). The public share page is
explicitly **not** a caller and must not become one.

---

## Dependencies

**Configuration / environment:** `env.LLM_API_KEY`, `env.LLM_BASE_URL`, `env.LLM_MODEL` (all via
`lib/env.ts`, which crashes the build when absent); `AUTH_SECRET` (image tickets);
`BLOB_READ_WRITE_TOKEN`.

**External services:** `api.z.ai` Anthropic-shaped endpoint (`glm-5.3`, narrative + Nina turns) and
Chat-Completions endpoint (`glm-4.6v`, vision); Vercel Blob; Neon Postgres; Web Push; GitHub Actions
(the image-generation worker).

**CI guards that will fail a careless change:** `ci:openrouter-guard`, `ci:data-layer-guard`,
`ci:client-secret-guard`, `ci:f08-guard`, `ci:llm-payload-guard`, `ci:f11-guard`, `badges:check`,
plus `lint`, `format:check`, `typecheck` and `vitest`.

**Testing:** `vitest.config.ts` runs `environment: 'node'` — **no jsdom**. Every rule on this screen
is therefore a pure function in `lib/` with a unit test (`chatview.test.ts`, `scroll.test.ts`,
`reply.test.ts`, `reveal.test.ts`, `images.test.ts`, `attach.test.ts`), and components are not
rendered in tests. Any new decision R1, R6 or R8 introduces must follow that shape or it cannot be
tested at all.

---

## Reference List

Every site that touches the conversation, the chrome, or the dot.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaMessages` | `lib/db/schema.ts:718` | def | `lib/db` |
| `ninaMessageImages` | `lib/db/schema.ts:802` | def | `lib/db` |
| `nina_messages_user_unread_idx` | `lib/db/schema.ts:~775` | def (partial index) | `lib/db` |
| `messageColumns` projection | `lib/nina/queries.ts` §4 | def | `lib/nina` |
| `listNinaMessages` | `lib/nina/queries.ts:482` | def | `lib/nina` |
| `listNinaMessages` | `app/nina/page.tsx:138` | call | `app/nina` |
| `getNinaMessageWindow` | `lib/nina/queries.ts:505` | def | `lib/nina` |
| `getNinaMessageWindow` | `lib/nina/gateway.ts:144` | call | `lib/nina` |
| `getNinaMessageWindow` | `tests/nina.gateway.patterns.test.ts:44` | test (mock) | `tests` |
| `insertNinaMessages` | `lib/nina/queries.ts:536` | def | `lib/nina` |
| `insertNinaMessages` | `lib/nina/actions.ts:406`, `:608` | call (his row, her bubbles) | `lib/nina` |
| `insertNinaMessages` | `lib/nina/proactive.ts:630` | call (five triggers) | `lib/nina` |
| `insertNinaMessages` | `lib/nina/imagejobs.ts:186` | call (R22 apology) | `lib/nina` |
| `getNinaMessagesByIds` | `lib/nina/queries.ts:565` | def | `lib/nina` |
| `countUnreadNinaMessages` | `lib/nina/queries.ts:581` | def | `lib/nina` |
| `countUnreadNinaMessages` | `components/nina/NinaUnreadBadge.tsx:37` | call | `components/nina` |
| `markNinaMessagesRead` | `lib/nina/queries.ts:600` | def | `lib/nina` |
| `markNinaMessagesRead` | `app/nina/page.tsx:256` | call (in `after()`) | `app/nina` |
| `hasProactiveMessageForRun` | `lib/nina/queries.ts:632` | def | `lib/nina` |
| `insertNinaMessageImages` | `lib/nina/queries.ts:653` | def | `lib/nina` |
| `listNinaMessageImages` | `lib/nina/queries.ts:695` | def | `lib/nina` |
| `getNinaMessageImage` | `lib/nina/queries.ts:721` | def | `lib/nina` |
| `getNinaMessageImagesForMessages` | `lib/nina/queries.ts:742` | def | `lib/nina` |
| `readMessageWindow` | `lib/nina/load.ts:81` (interface), `gateway.ts:144` (impl) | def · impl | `lib/nina` |
| `CONTEXT_MESSAGE_WINDOW = 40` | `lib/nina/load.ts:64` | config | `lib/nina` |
| `CHAT_HISTORY_LIMIT = 200` | `app/nina/page.tsx:~95` | config | `app/nina` |
| `sendNinaMessage` | `lib/nina/actions.ts:220` | def (`'use server'`) | `lib/nina` |
| `describeNinaImage` | `lib/nina/actions.ts:715` | def (`'use server'`) | `lib/nina` |
| `TabBar` | `components/ui/TabBar.tsx:~95` | def | `components/ui` |
| `TabBar` | `components/ui/AppShell.tsx:~68` | call (unconditional) | `components/ui` |
| `TAB_BAR_HEIGHT_PX`, `TAB_BAR_FAB_OVERHANG_PX` | `components/ui/TabBar.tsx` | def | `components/ui` |
| `AppShell`, `BOTTOM_GAP`, `AppShellBottomGap` | `components/ui/AppShell.tsx` | def | `components/ui` |
| `ScreenHeader` | `components/ui/AppShell.tsx` | def (`/nina` deliberately does not use it) | `components/ui` |
| `composerBottomCss` | `lib/nina/chatview.ts:195` | def | `lib/nina` |
| `composerBottomCss` | `components/nina/ChatScreen.tsx` (Composer's `bottomCss`) | call | `components/nina` |
| `keyboardOverlapPx`, `KEYBOARD_MIN_PX` | `lib/nina/chatview.ts:167`, `:139` | def | `lib/nina` |
| `decideAutoScroll`, `isNearBottom`, `groupIntoDays` | `lib/nina/chatview.ts` | def | `lib/nina` |
| `resolveRestoreTop`, `ChatScrollMark` | `lib/nina/scroll.ts` | def | `lib/nina` |
| `useChatScrollMark`, `readAnchorRows` | `components/nina/useChatScroll.ts` | def | `components/nina` |
| `decideReplySwipe`, `resolveQuote`, `buildQuote`, `planQuoteScroll` | `lib/nina/reply.ts` | def | `lib/nina` |
| `ChatImages` (`onOpen` unwired) | `components/nina/ChatImages.tsx` | def | `components/nina` |
| `ChatImages` | `components/nina/MessageList.tsx` (`above` slot) | call, no `onOpen` | `components/nina` |
| `PhotoViewer`, `ViewerPhoto` | `components/ui/PhotoViewer.tsx` | def | `components/ui` |
| `decideSwipe`, `stepIndex` | `lib/photos/gallery.ts` | def | `lib/photos` |
| `NinaUnreadBadge`, `NinaUnreadBadgeSlot` | `components/nina/NinaUnreadBadge.tsx` | def | `components/nina` |
| `NinaAvatar` | `components/nina/NinaAvatar.tsx` | def | `components/nina` |
| `NinaAvatar` + `<h1>Nina</h1>` header | `app/nina/page.tsx` (the top bar R7 removes) | call | `app/nina` |
| `ninaAvatarView`, `getCurrentNinaAvatar` | `lib/nina/album.ts`, `queries.ts:1054` | def | `lib/nina` |
| `SW_MESSAGE_TYPE`, `mergeServerMessages` | `lib/nina/live.ts` | def | `lib/nina` |
| `narrativeClient`, `narrativeModel` | `lib/llm/client.ts` | def | `lib/llm` |
| llm-payload guard table (4 entries) | `scripts/check-llm-payload-boundary.mjs` | config (CI) | `scripts` |
| unscoped-read exception list | `scripts/check-data-layer-invariants.mjs` | config (CI) | `scripts` |
| migration journal | `drizzle/meta/_journal.json` | config | `drizzle` |

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `lib/db/schema.ts` | new `nina_chat_sessions`; `nina_messages.session_id`; session indexes | 1 |
| 2 | `drizzle/0004_*.sql` + `drizzle/meta/` | the migration **and the backfill** of every existing message into one session | 1 |
| 3 | `lib/nina/queries.ts` | session CRUD **including delete (R11)**; every message read and write gains a session; unread per session; the list query (pin-first, last-user-message desc) | 1 |
| 4 | `components/ui/TabBar.tsx` | the bar must be hideable; the two geometry constants gain a meaning | 2 |
| 5 | `components/ui/AppShell.tsx` | `TabBar` stops being unconditional; `BOTTOM_GAP` gains the no-bar case | 2 |
| 6 | `lib/nina/chatview.ts` | `composerBottomCss` must clear *nothing* when the bar is hidden | 2 |
| 7 | new `lib/nina/chrome.ts` | the 5 s auto-hide and the reveal state, as pure rules with unit tests | 2 |
| 8 | new `components/nina/ChatChrome.tsx` | the floating `^` / `v` controls (and, from phase 5, `>`) | 2 |
| 9 | `app/nina/page.tsx` | reads one session; drops the header (R7); mounts the sidebar; scoped `markNinaMessagesRead` | 3, 5, 8 |
| 10 | `components/nina/ChatScreen.tsx` | the active session threaded through; viewer state; edit/delete handlers | 3, 7, 9 |
| 11 | `lib/nina/actions.ts` | `sendNinaMessage` takes a session; fires the titler in `after()` | 3, 4 |
| 12 | `lib/nina/gateway.ts` + `lib/nina/load.ts` | `readMessageWindow` scoped to the session (assumption A1) | 3 |
| 13 | `lib/nina/proactive.ts`, `lib/nina/imagejobs.ts` | both writers need a session (assumption A3) | 3 |
| 14 | new `lib/nina/sessionActions.ts` | create / rename / pin / **remove (R11)**, `'use server'` | 3 |
| 15 | new `lib/nina/title.ts` | the 3-4 word titler and its prompt | 4 |
| 16 | `scripts/check-llm-payload-boundary.mjs` | **one phase only** adds both new entries (titler, semantic search) | 4 |
| 17 | new `components/nina/NinaSidebar.tsx`, `SessionList.tsx`, `SessionRow.tsx` | R6's surface, R7's circle, R4's pin, R2's history, R11's remove control | 5 |
| 18 | new `lib/nina/sessions.ts` | pure list ordering and title rules, unit-tested | 1, 5 |
| 19 | new `lib/nina/search.ts` + `searchActions.ts` | text search, then the LLM pass; the persisted toggle's key | 6 |
| 20 | new `lib/nina/messageActions.ts`, `lib/nina/edit.ts` | R8's mutations and their rules | 7 |
| 21 | `components/nina/MessageBubble.tsx`, `MessageList.tsx` | the edit/delete affordance, without touching the reply swipe | 7 |
| 22 | `components/nina/NinaUnreadBadge.tsx` | R9: the dot must clear without a navigation | 8 |
| 23 | `components/nina/ChatImages.tsx` | pass `onOpen` through at last | 9 |
| 24 | `components/ui/PhotoViewer.tsx` | the download control and the attach control, as optional props | 9 |
| 25 | `tests/*` and `lib/nina/*.test.ts` | one suite per new pure rule | every phase |

**This document describes. The plan files prescribe.**
