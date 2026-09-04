# Plan: Nina chat sessions, full-screen chat, and message editing

**Slug:** `nina-chat-sessions`
**Date:** 2026-09-04 22:33 +07:00
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-chat-sessions`
**Branch:** `feature/nina-chat-sessions` (base: `origin/main` @ `0a924ba`)
**Phases:** 9
**Status:** in progress — 1 of 9 phases complete (phase 2); a phase is complete when its row in the Phases table is ticked ✅, which is the authoritative per-phase record because the phases land in parallel; the set is reviewed and merged as a whole
**Card:** `miftahulmahfuzh/run-insights#77` (parent; phases are its sub-issues #78-#86)
**Coordinator:** —

---

## Why

The user's rationale, verbatim. The reasons are the specification — in particular R8, which asks for
a capability that only makes sense once you accept *why* it is being asked for.

> 1.UI update , when we click chat, make the chat full screen. so hide the bottom bar completely (because phone screen size is small). maybe add some floating small ^ button in the bottom middle of chat query ,so we can pull up the bottom bar anytime . add down button as well to hid it. also, auto hid the bottom bar after 5 seconds
>
> 1.To make the chat with Nina more organized, implement the chat sessions feature. 2.Users should be able to create a new chat session (so they can focus on a new topic) or return to previous conversations via session history, which displays a list of all past sessions .
>
> 3.after first interaction in a new session (user then nina) , llm will automatically create an appropriate title for the session (3-4 words). then user can also edit the session name manually.
>
> 4.user can also pin some sessions to the top.
>
> 5.we sort session by the most recent user message in each of the session, sorted from the most recent to the oldest
>
> 6.i think we should add a hidden sidebar. if user press a floating > button at the bottom left corner, it will slide right and take over full screen (phone screen size is small, so make sidebar take full screen). at the top of the sidebar we can search all chat as well. add a toggle at the right side of the search field (persist the toggle across app usage) to enable semantic search, so we can search using llm as well.
>
> 7.right now at the top we show Nina circle top bar .  move this Nina circle to inside of sidebar. so there is no more of this top bar, just clean chat
>
> 8. sometimes the interaction is embarassing or redundant. so , to keep nina context clean, give user the ability to edit his message, edit nina message, or delete his message, or delete nina message. this requirement is weird, but this is because nina will keep using previous history as context, so we need to give user the capability to make this context more "accurate"
>
> 9. UI bug: there is a red dot chat notification. but make sure this red dot will disappear on its own if user has opened the most recent chat
>
> 10. UI improvement: make user be able to click any image in the chat. clicking it will show the image full screen. add a download icon on the bottom right so user can also download the image, also add attach icon so user can attach this image to his new chat
>
> additional requirement: please give user the capability to remove a session as well

**R8 is not weird, and the plan treats it as load-bearing rather than as a courtesy.** The user has
identified the real consequence himself: `getNinaMessageWindow` reads the newest 40 rows straight
out of `nina_messages` on every turn, so the conversation *is* the prompt. An embarrassing or
redundant exchange is not merely visible — it is an input to everything she says next. Editing a
row is therefore editing her context, which is exactly what he asked for and exactly why phase 7 is
a data-layer change with a UI on top rather than the reverse.

**R2's real scope, for the same reason.** "Focus on a new topic" is a claim about what she reads,
not about what the screen shows. Phase 3 scopes `readMessageWindow` to the active session
(assumption A1). Without that, a new session would look new and behave exactly like the old one.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Full-screen chat: hide the bottom bar, a floating `^` to pull it up, a down button to hide it, auto-hide after 5 s | 2 |
| R2 | Chat sessions: create a new one, or return to a previous conversation through a session-history list | 1, 3 |
| R3 | An LLM writes a 3-4 word title after the first user→Nina exchange; the user can also rename manually | 4 |
| R4 | Pin sessions to the top | 1, 5 |
| R5 | Sort sessions by the most recent **user** message, newest first | 1 |
| R6 | A hidden full-screen sidebar behind a floating `>` button, with search-all-chats and a persisted semantic-search toggle | 5, 6 |
| R7 | Move the Nina circle into the sidebar; no more top bar, just clean chat | 5 |
| R8 | Edit and delete his messages and hers, to keep Nina's context accurate | 7 |
| R9 | The red dot must disappear on its own once the most recent chat has been opened | 8 |
| R10 | Tap a chat image for full screen, with a download icon and an attach-to-new-chat icon | 9 |
| R11 | Remove a session | 1, 3, 5 |

**This mapping is final and it survived reconciliation unchanged.** Every `R` is served, no `R` is
served by a phase whose **Satisfies** line does not claim it, and no phase's steps serve an `R`
outside its own line — the nine plans' headers were checked one by one against this table. The one
requirement that came close to moving was **R10**: phase 9 needed a two-line change in
`app/nina/page.tsx` that no phase owned, and the choice was to credit part of R10 to phase 8 or to
give phase 9 an ordering edge so it could make the change itself. The edge was chosen, so R10 stays
whole in phase 9 — see the Reconciliation Log.

**R11 composes, checked in three halves.** Phase 1 supplies the cascade (`ON DELETE CASCADE` on
`nina_messages.session_id`, and through `nina_message_images.message_id`'s existing cascade the image
rows too) plus `removeNinaSession` and `countNinaSessionMessages`; phase 3 supplies the action
(`removeNinaChatSession`, which decides the destination and returns it as `next`) and both edge
cases — removing the session he is reading lands on the bare `/nina`, and removing the last one is
the same branch, with `ensureNinaSession` keeping the cron alive per assumption A3; phase 5 supplies
the confirmation and obeys `next`. The three fit: phase 5 no longer recomputes the destination, and
phase 1's `countNinaSessionMessages` — written expressly for phase 5's dialog — means the
confirmation can say how much is about to be lost.

## Scope

**In scope**

- A `nina_chat_sessions` table, a `nina_messages.session_id` column, and a migration that backfills
  every existing message into one session per user so the conversation reads unchanged after deploy.
- Session lifecycle: create, open, rename, pin/unpin, **remove** (R11) — and the ordering rule
  (pinned first, then most-recent-user-message descending). Removing a session is a hard delete that
  takes its messages and their image rows with it; it is not an archive flag, because an archived
  session that still answers `getNinaMessageWindow` would defeat the point of removing it.
- Session scoping of **both** reads that matter: the screen's `listNinaMessages` and the prompt's
  `getNinaMessageWindow`.
- Two new model calls, both behind Server Actions and both registered in the llm-payload guard: the
  3-4 word titler, and semantic search.
- `/nina`'s chrome: no tab bar, no top header, floating `^` / `v` / `>` controls, a 5 s auto-hide.
- A full-screen sidebar carrying Nina's circle, the session list and the search field.
- Message edit and delete for both roles, with the prompt window as the acceptance criterion.
- Wiring `ChatImages`'s existing `onOpen` to `PhotoViewer`, plus a download control and an
  attach-to-composer control.

**Out of scope, and why**

- **`pgvector` and an embedding backfill.** R6 says "search using llm as well"; assumption A7 reads
  that as a model pass over SQL-narrowed candidates. A vector index is a larger feature with a
  migration, a backfill and an ongoing write path, and nothing in the request asks for it.
- **Partitioning the memory ledger.** `nina_memory_slots` and `nina_memory_facts` stay global
  (assumption A2). They are the long-term memory; per-session memory would make her forget his
  nickname when he opens a new topic.
- **A session per proactive message.** Cron and `after()` triggers land in the most recent session
  (assumption A3). A session per evening nag would bury the list the feature exists to organise.
- **Reaping the blobs orphaned by a deleted message.** The rows cascade; the bytes stay. That is the
  existing `reap-orphaned-blobs` skill's job and it does not cover `nina/` yet — worth its own card,
  not worth widening this set.
- **The tab bar on the other four screens.** R1 is about `/nina` only. `/`, `/trends`, `/me` and
  `/upload` keep their bar unconditionally.
- **`/nina/about`, the album, and `/admin/nina`.** Untouched. Phase 5 moves the *link* to Nina's
  circle into the sidebar; the page it opens does not change.
- **A markdown renderer in bubbles.** Still none, deliberately (`MessageBubble`'s header).

## Invariants

Every phase must hold all of these. The first five are the repo's, already enforced; the last four
are this set's.

1. **The tree builds and the suite passes at the end of every phase.** `npm run lint`,
   `npm run format:check`, `npm run typecheck`, `npm test`, and every `ci:*-guard` script.
2. **No model call is ever awaited in a page render path** (invariant 4), enforced by
   `scripts/check-llm-payload-boundary.mjs`. Both new model calls join that guard's table, and
   **only phase 4 may edit that file** — its own header explains that splitting the table across
   phases produces one merge conflict per phase and a window in each where the new call is
   unguarded.
3. **Every query in `lib/nina/queries.ts` takes `userId` first and proves ownership in SQL.** A
   session id or a message id from a client is a claim; a row that came back from an owner-scoped
   read is a fact. `resolveAttachment` is the pattern.
4. **Rendered strings come from `lib/format.ts`, on the server.** No new date or number formatting
   in a component. `dayISO` stays server-computed — a formatted instant in a client component is
   the classic hydration mismatch, and the codebase says so in three places.
5. **`nina_message_images.description` never reaches a component.** It is `glm-4.6v`'s private prose
   and Nina's prompt is its only consumer. This includes phase 9's viewer, which is handed URLs.
6. **`nina_messages.seq` remains the total order.** Sessions *slice* it; nothing re-sorts by
   `sent_at`, and no phase introduces a per-session sequence.
7. **Decisions live in pure functions under `lib/`, with unit tests.** `vitest.config.ts` runs
   `environment: 'node'` — there is no jsdom, so a rule that lives in a component cannot be tested.
   `lib/nina/chatview.ts` and `lib/photos/gallery.ts` are the precedents and the shape to copy.
8. **No new CSS keyframe.** The app has exactly one, with a global reduced-motion escape
   (`tests/motion.reducedMotion.test.ts` guards it). The sidebar slide and the bar reveal are
   `transition-*` on transform/opacity, with a `prefers-reduced-motion` answer.
9. **The reply swipe is not re-litigated.** `MessageBubble`'s swipe-right-to-reply, and its recorded
   reasons for rejecting long-press and tap, stand. Phase 7's affordance must be a third thing.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | Coordinator | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|-------------|--------|------|
| 1 ✅ | Session data layer: schema, migration, backfill, scoped queries | R2, R4, R5, R11 | `lib/db`, `lib/nina`, `drizzle` | 8 | — | HARD | `.workflows/plan/nina-chat-sessions/phase-1.md` | — | P1-DB-A001 | miftahulmahfuzh/run-insights#78 |
| 2 ✅ | Full-screen chat chrome: hide the bar, floating `^` / `v`, 5 s auto-hide | R1 | `components/ui`, `components/nina`, `lib/nina` | 8 | — | NORMAL | `.workflows/plan/nina-chat-sessions/phase-2.md` | — | P1-RI-A006 | miftahulmahfuzh/run-insights#79 |
| 3 | Session-scoped chat surface and session lifecycle actions | R2, R11 | `app/nina`, `lib/nina`, `components/nina` | 14 | 1, 2 | HARD | `.workflows/plan/nina-chat-sessions/phase-3.md` | — | P1-RI-A007 | miftahulmahfuzh/run-insights#80 |
| 4 | Automatic session titling, and the rename path | R3 | `lib/nina`, `scripts` | 7 | 3 | NORMAL | `.workflows/plan/nina-chat-sessions/phase-4.md` | — | P1-RI-A008 | miftahulmahfuzh/run-insights#81 |
| 5 | The hidden full-screen sidebar: session list, pin, rename, remove, Nina's circle | R6, R7, R4, R11 | `components/nina`, `app/nina`, `lib/nina` | 7 | 3 | HARD | `.workflows/plan/nina-chat-sessions/phase-5.md` | — | P1-RI-A009 | miftahulmahfuzh/run-insights#82 |
| 6 | Search all chats, with the persisted semantic-search toggle | R6 | `lib/nina`, `components/nina` | 7 | 4, 5 | NORMAL | `.workflows/plan/nina-chat-sessions/phase-6.md` | — | P1-RI-A010 | miftahulmahfuzh/run-insights#83 |
| 7 | Editing and deleting messages, his and hers | R8 | `lib/nina`, `components/nina` | 8 | 3 | HARD | `.workflows/plan/nina-chat-sessions/phase-7.md` | — | P1-RI-A011 | miftahulmahfuzh/run-insights#84 |
| 8 | The unread dot clears itself on the newest session | R9 | `components/nina`, `app/nina`, `lib/nina` | 5 | 5 | EASY | `.workflows/plan/nina-chat-sessions/phase-8.md` | — | P1-RI-A012 | miftahulmahfuzh/run-insights#85 |
| 9 | Tap an image: full screen, download, attach to a new message | R10 | `components/nina`, `components/ui`, `lib/photos`, `app/nina` | 12 | 7, 8 | NORMAL | `.workflows/plan/nina-chat-sessions/phase-9.md` | — | P1-RI-A013 | miftahulmahfuzh/run-insights#86 |

Waves the `Depends on` column implies: **W1** = 1 ‖ 2 · **W2** = 3 · **W3** = 4 ‖ 5 ‖ 7 ·
**W4** = 6 ‖ 8 · **W5** = 9.

**Three changes reconciliation made to this table.** Phase 6 gained a dependency on **4**, because
its own contract calls phase 4's `rankNinaSearchHits` guard entry a hard build dependency and only
phase 4 may write that file; 4 and 5 are both in wave 3, so this costs no extra wave and only makes
the declared DAG match the real requirement. Phase 9 gained a dependency on **8** and moved
into a wave of its own, because the two-line change to `app/nina/page.tsx` that R10's attach control
needs (phase 9's H1) was owned by nobody, and the set's own convention — "where two phases want the
same file, the later one declares the edge" — assigns it to the later writer. And every `Files`
count is now each plan's actual `files_touched` rather than the draft's estimate; phase 3 (14) and
phase 9 (12) were the two the draft most under-counted, and phase 4's 7 is explained in its own D1
(the titler splits into a pure module and a `server-only` one, each with a suite).

**Why some edges are file edges, stated out loud.** Phase 8 depends on 5 and phase 9 on 7 for a
reason that is not logical order: concurrent phases run in *one* worktree and share *one* git index,
and that has already destroyed committed work on this repo once (`admin-album-file-manager`, 7
phases, 2026-09-04 — a partial stage built from a reconstructed blob reverse-applied a peer's
commit, invisible to every pre-commit gate because the working tree was always right). `app/nina/page.tsx`
is wanted by phases 3, 5 and 8; `ChatScreen.tsx` by 3, 7 and 9; `MessageList.tsx` by 7 and 9. Where
two phases want the same file, the later one declares the edge. Every parallel pair below is
genuinely file-disjoint, and each phase's **Does not touch** line is what makes that checkable.

**The reconciled multi-writer ledger, verified file by file.** Every one of these is strictly
ordered by the DAG above, so no two writers of any file ever run in the same wave:

| File | Writers, in order | Waves |
|---|---|---|
| `app/nina/page.tsx` | 2 (the one prop) -> 3 -> 5 -> 8 -> 9 | 1, 2, 3, 4, 5 |
| `lib/nina/queries.ts` | 1 -> 3 -> 7 | 1, 2, 3 |
| `components/nina/ChatScreen.tsx` | 3 -> 7 -> 9 | 2, 3, 5 |
| `components/nina/MessageList.tsx` | 7 -> 9 | 3, 5 |
| `components/nina/ChatChrome.tsx` | 2 (creates) -> 5 | 1, 3 |
| `components/nina/NinaSidebar.tsx` | 5 (creates) -> 6 | 3, 4 |
| `lib/nina/actions.ts` | 3 -> 4 | 2, 3 |
| `lib/nina/active.ts` | 3 (creates) -> 4 | 2, 3 |
| `scripts/check-llm-payload-boundary.mjs` | 4, alone (invariant 2); 6 depends on its entry | 3 |
| `lib/nina/sessions.ts` | 1, alone; 3, 4 and 5 import it | 1 |

`app/nina/page.tsx` has five writers, which is one more than the draft expected — phase 2's single
prop rename was not in the draft's list, and phase 9 was added by reconciliation. Each later writer
now quotes the file **after** its predecessors; the three plans that quoted `<AppShell
bottomGap="chat">` (phases 3, 5, 8) were quoting the pre-phase-2 tree and have been corrected.

### Phase 1 — Session data layer: schema, migration, backfill, scoped queries
**Satisfies:** R2, R4, R5, R11
**Owns:** `lib/db/schema.ts` (the new `ninaChatSessions` table, `nina_messages.session_id`, the
indexes both need); `drizzle/0004_*.sql` and `drizzle/meta/`; `lib/nina/queries.ts` §4 (every
message read and write gains a session parameter, plus session CRUD and the list query); a new pure
`lib/nina/sessions.ts` for the ordering and title-fallback rules, with tests — **including
`NINA_SESSION_TITLE_MAX_CHARS = 60`, which reconciliation made the set's one and only title cap**
(phases 3, 4 and 5 import it and declare nothing; see the Reconciliation Log). Its title fallback is
`sessionTitleFor`, and phase 5 renders that rather than `session.title`. Its pin field is
`pinnedAt: Date | null` — an instant, not a boolean — and phases 3 and 5 take it as such.
**Does not touch:** any component, any `app/` route, `lib/nina/actions.ts`, `proactive.ts`,
`imagejobs.ts`, `gateway.ts` — phase 3 is the phase that re-points the callers. This phase widens
signatures **with a defaulted or optional session parameter** so the tree still compiles and the
existing callers keep working unchanged; phase 3 then makes it required. That two-step is what buys
invariant 1 at this boundary.
**Decides, and must state its reasoning:** whether `session_id` is nullable (and what a NULL means
after the backfill) — **decided: `NOT NULL`, D1**; whether `nina_messages.session_id` cascades on session delete — **R11 makes this a
requirement rather than a detail**: removing a session must take its messages with it, and through
`nina_message_images.message_id`'s existing cascade their image rows too, so `ON DELETE CASCADE` is
the shape and the plan must say what it deliberately does *not* clean up (the blobs, and any
`nina_memory_facts.source_message_id` pointing into the removed session — neither has an FK); whether the list's sort key is a stored
`last_user_message_at` column maintained by the writer or a correlated subquery over
`nina_messages` (R5 asks specifically for the most recent **user** message, so `role = 'runner'` is
in the predicate either way) — **decided: derived at read time, no stored column (D3), which is what
makes phase 7's delete correct for free**; and how the pin ordering composes with it —
**decided: pins partition rather than sort (D4)**.
**The backfill is the risk, and it is not optional.** Every existing row must end up in exactly one
session per user, in `seq` order, with a title that is not a lie — a deterministic placeholder, not
an LLM call from a migration. A deploy that leaves rows with no session is a runner whose entire
conversation vanished from his screen.
**Exit criteria:** `npm run db:check` passes; the migration applies to a copy of production and
`SELECT count(*) FROM nina_messages WHERE session_id IS NULL` is 0; `listNinaSessions` returns
pinned-first then most-recent-user-message-descending, asserted by a unit test on the pure ordering
rule; **deleting a session row leaves no orphaned `nina_messages` and no orphaned
`nina_message_images` (R11)**; the existing suite is green with no caller changed.

### Phase 2 — Full-screen chat chrome: hide the bar, floating `^` / `v`, 5 s auto-hide
**Satisfies:** R1
**Owns:** `components/ui/AppShell.tsx` (`TabBar` stops being unconditional; a third `BOTTOM_GAP`
case for "no bar"); `components/ui/TabBar.tsx` (a hidden state, and the transform that reveals it);
`lib/nina/chatview.ts`'s `composerBottomCss` (it must clear nothing when the bar is gone); a new
pure `lib/nina/chrome.ts` holding the reveal state machine and the 5 s timer rule, with tests; a new
`components/nina/ChatChrome.tsx` rendering the floating controls.
**Does not touch:** `app/nina/page.tsx` beyond the one prop that selects the chat's chrome mode;
`ChatScreen.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `Composer.tsx`'s internals, anything under
`lib/db`, and the other four tabbed screens — their bar is unconditional and stays so.
**Decides, and must state its reasoning:** where the state lives, given that `AppShell` has no
`'use client'` and `TabBar` does (the `ninaBadge`-as-a-node trick in `AppShell` is the precedent for
passing server-rendered work into a client bar, and a hidden-bar boolean is the reverse problem);
what the 5 s timer does when the composer has focus or the keyboard is open (a bar that hides itself
mid-sentence is worse than one that stays); and whether `^`/`v` are one toggle or two controls — the
user asked for both glyphs, so the honest reading is one button whose glyph flips.
**The geometry is the trap.** `TAB_BAR_HEIGHT_PX = 58`, `TAB_BAR_FAB_OVERHANG_PX = 20`,
`COMPOSER_CLEARANCE_PX = 78`, `COMPOSER_FALLBACK_PX = 146` and
`BOTTOM_GAP.chat = 'pb-[calc(10.5rem+var(--safe-bottom))]'` all encode the same three numbers, and
`AppShell` says out loud that "Tailwind cannot read a constant, so a change to any of them changes
this literal". Every one of those spellings is in this phase's scope, and a change to one without
the others is a composer that floats or a bubble sliced by the bar.
**Exit criteria:** `/nina` renders with no visible tab bar and the newest bubble is not obscured; the
floating control reveals the bar, the glyph flips, and the bar hides again 5 s later; the transition
holds still under `prefers-reduced-motion`; `keyboardOverlapPx`'s existing tests still pass and the
new `chrome.ts` rules have their own.

### Phase 3 — Session-scoped chat surface and session lifecycle actions
**Satisfies:** R2, R11
**Owns:** `app/nina/page.tsx` (resolves the active session from `?s=`, defaults to the most recent,
reads one session's messages); `components/nina/ChatScreen.tsx` (the session id threaded to the
send path); `lib/nina/actions.ts` (`sendNinaMessage` takes and writes a session);
`lib/nina/gateway.ts` + `lib/nina/load.ts` (`readMessageWindow` scoped — assumption A1);
`lib/nina/proactive.ts` and `lib/nina/imagejobs.ts` (both writers resolve a session — assumption
A3); a new `lib/nina/sessionActions.ts` (`'use server'`: create, rename, pin, delete). It makes
phase 1's optional session parameters **required**, which is how `tsc` proves no writer was missed.

**The names this phase owns, fixed by reconciliation** (phase 5 calls them and was guessing):
`createNinaChatSession`, `renameNinaChatSession`, `setNinaChatSessionPinned` and
`removeNinaChatSession({ sessionId, activeSessionId })`, all returning `{ ok, next }` where `next`
is `'/nina'` to navigate or `null` to stay. The `*ChatSession*` infix is load-bearing: phase 1's
`queries.ts` already exports `renameNinaSession`, `setNinaSessionPinned` and `removeNinaSession`, so
the action and the query it wraps must not share one name. `removeNinaChatSession` is also where the
"where do I land after a removal" decision lives — **once**, on the server.
**Does not touch:** `lib/db/schema.ts` or `drizzle/` (phase 1 owns the shape); the guard script
(phase 4 owns it); `components/nina/MessageBubble.tsx`, `MessageList.tsx`, `ChatImages.tsx`,
`NinaUnreadBadge.tsx`; `components/ui/*`.
**Decides, and must state its reasoning:** how the active session is carried (assumption A4 says
`?s=<id>`, matching `usePanelParam`'s habit — and note `ChatScreen` already rewrites the query
string in a `useLayoutEffect` to consume `?attach=` and `?photo=`, so a second writer of that URL
must not race the first); what happens on a forged or foreign `?s=` (the codebase's answer for
`?attach=` and `?photo=` is silent degradation, and for a *send* it is refusal — the same split
applies); whether an empty session is created eagerly on "new chat" or lazily on first send (an
eager row shows an empty session in the list; a lazy one has no id to put in the URL); what
`olderCount` means now that the count is per-session; and **R11's two edge cases, which are the whole
difficulty of removing a session**: what `/nina?s=<id>` renders when the runner removes the session
he is currently reading (it must land somewhere real, not on an empty screen with a dead id in the
URL), and what happens when he removes the *last* session — because assumption A3 sends every
proactive message to "the most recent session", and a user with none is a state the cron must
survive.
**Exit criteria:** two sessions hold different conversations; a turn sent in one does not appear in
the other and — the real test — Nina's prompt for a turn in the new session contains none of the old
session's messages; a proactive message written with no session in view lands somewhere findable;
**removing the open session navigates to a real one and removing the last one leaves the screen and
the cron both working (R11)**; `tests/nina.gateway.patterns.test.ts` is updated for the widened
`getNinaMessageWindow` mock.

### Phase 4 — Automatic session titling, and the rename path
**Satisfies:** R3
**Owns:** **two** new modules where this draft named one — **and reconciliation blessed the split**:

- a new **pure** `lib/nina/title.ts` (the prompt, the 3-4 word constraint, the parse and the
  sanitiser, as pure functions with tests) — no `server-only`, no `db`, no `lib/llm`; it imports one
  type from `@anthropic-ai/sdk` and `NINA_SESSION_TITLE_MAX_CHARS` from phase 1's `sessions.ts`;
- a new `lib/nina/autotitle.ts` carrying **the model call**, opening with `import 'server-only'`, and
  exporting the guarded symbol `titleNinaSessionIfNeeded`.

**Why the split is blessed, checked against the worktree and not taken on faith.** `lib/llm/client.ts:1`
and `lib/env.ts:1` both open with `import 'server-only'` (so does `lib/nina/gateway.ts:1`), so any
module holding the titler's model call cannot be imported from a client bundle. Two live paths reach
this phase's pure rules from `'use client'` files: phase 5's `SessionRow` reads the character cap for
its rename input's `maxLength`, and phase 6's pure `lib/nina/search.ts` — imported by the
`'use client'` `NinaSearchField` — takes `SESSION_PARAM` out of `lib/nina/active.ts`, which
re-exports this phase's `sanitizeNinaSessionTitle`. One file holding both the rules and the call
would have turned either of those into the exact build error `components/ui/index.ts` documents at
length. It is also the shape phase 6 independently chose for the same reason (pure `search.ts`
beside `server-only` `semantic.ts`), and the shape `lib/llm/narrate.ts` and `lib/nina/distill.ts`
already have inside one file. **The index's "~5 files" estimate becomes 7**, and that is the reason.

It also owns the `after()` hook in `lib/nina/actions.ts` that fires the titler, at the named seam
phase 3 leaves for it; the manual-rename validation rule; and
`scripts/check-llm-payload-boundary.mjs` — **the only phase that may edit that file**, adding both
this titler and phase 6's semantic-search entry in one commit, exactly as that guard's own header
demands. Reconciliation confirmed sole authorship: all eight other plans list that script under
"leaves alone", and phase 6's entry is registered under the name phase 6 actually exports
(`rankNinaSearchHits`, sanctioning `lib/nina/semantic.ts` and `lib/nina/searchActions.ts`). It also
repairs that guard's own header, which claimed "FOUR ENTRY POINTS. THIS TABLE IS COMPLETE" while
`GUARDED_CALLS` has held **five** since `resolveNinaPromises` landed — verified in the file. The
count becomes seven and the missing `resolveNinaPromises` bullet is written.
**Does not touch:** `app/nina/page.tsx`, any sidebar component (phase 5 renders the rename UI and
calls phase 3's `renameNinaChatSession`), `lib/db/schema.ts`, `drizzle/`, `lib/nina/queries.ts`,
`lib/nina/sessions.ts`. It **declares no character cap of its own** — reconciliation put the set's
single `NINA_SESSION_TITLE_MAX_CHARS = 60` in phase 1's `sessions.ts` and this phase imports it.
**Decides, and must state its reasoning:** the trigger condition — "first interaction (user then
nina)" means one runner row plus one Nina row in this session, and the check must be idempotent
because `after()` can run more than once and two tabs can race; which client and model
(`narrativeClient()` speaks Anthropic Messages and `narrativeModel()` is `glm-5.3`, and
`maxRetries: 0` is deliberate); what "3-4 words" means when the model returns seven, or a sentence,
or an empty string (truncate, refuse, or keep the placeholder — a bad title is worse than none
because it is what the list shows); whether a manual title is ever overwritten by the titler
(it must not be — `title_source` is the field that makes that decision cheap); and whether the
titler ever sees `nina_message_images.description` (invariant 5 says the *component* may not; the
prompt may, and that is a distinction to state rather than assume).
**Exit criteria:** a fresh session titled within one `after()` of its first exchange, 3-4 words, no
model call awaited in a render path; a manually renamed session keeps its name across further turns;
the titler fires exactly once per session under a double-invoked `after()`; `npm run ci:llm-payload-guard`
passes with both new entries present.

### Phase 5 — The hidden full-screen sidebar: session list, pin, rename, remove, Nina's circle
**Satisfies:** R6, R7, R4, R11
**Owns:** a new `components/nina/NinaSidebar.tsx` and the row components under it, plus a new pure
`lib/nina/sidebar.ts` with tests; the `>` control added to phase 2's `ChatChrome.tsx`; `app/nina/page.tsx`'s header — **deleted**, with `NinaAvatar`
and Nina's name moved inside the sidebar (R7); the pin / rename / delete row controls, calling phase
3's `sessionActions`; the session list rendering, ordered by phase 1's pure rule.
**Reconciled, four spellings it had guessed:** it calls phase 3's `renameNinaChatSession` /
`setNinaChatSessionPinned` / `removeNinaChatSession` (not the `queries.ts` names), renders phase 1's
`sessionTitleFor` (not an invented `ninaSessionTitle`), derives `pinned` from phase 1's
`pinnedAt !== null`, and **reuses phase 3's `sessions` and `activeSessionId` bindings in
`app/nina/page.tsx` rather than reading `listNinaSessions` a second time**. Its
`NINA_SESSION_TITLE_MAX_CHARS` import from `lib/nina/sessions.ts` was already right and is
unchanged.
**Does not touch:** `ChatScreen.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `ChatImages.tsx`,
`NinaUnreadBadge.tsx`, `lib/nina/queries.ts`, `lib/db/schema.ts`, the guard script. It leaves a
named, documented seam for phase 6's search field at the top of the sidebar rather than sketching
one.
**Decides, and must state its reasoning:** whether the sidebar is a route (`/nina/sessions`) or an
overlay in the same tree — the user said "slide right and take over full screen", which is an
overlay, and `components/ui/Sheet.tsx` is the app's one modal surface and carries the three
behaviours that matter (body scroll lock, focus in and back out, and the `onCloseRef` trap that cost
one keyboard per keystroke on the review screen); how the slide satisfies invariant 8 with no new
keyframe; how the **remove** control confirms (R11 — and this is the one destructive action in the
whole set: it takes a conversation and its photos permanently, there is no confirm dialog anywhere
in this codebase today, and an undo would need the archive flag the scope section rules out, so the
confirmation is the only thing standing between a mis-tap and a lost conversation); and how "the top bar is gone" interacts with `AppShell`'s `ScreenHeader` contract,
which `/nina` already declined to use.
**Exit criteria:** `/nina` shows no header row and no tab bar; the `>` control slides a full-screen
sidebar in from the left; it lists every session pinned-first then most-recent-user-message-first;
Nina's circle inside it still links to `/nina/about`; pin, rename and delete each work and the list
reorders; the sidebar closes with the platform back gesture and does not trap focus behind it.

### Phase 6 — Search all chats, with the persisted semantic-search toggle
**Satisfies:** R6
**Owns:** **four modules and two components, where this draft named one file** — reconciliation
recorded the layout the plan actually chose, and it is the same pure/`server-only` split phase 4
made for the same reason:

- a new **pure** `lib/nina/search.ts` (query normalisation, LIKE escaping, the term split, the
  debounce rule, snippet extraction, text ranking, semantic candidate assembly, the ranking parse
  and the href), with tests. Its one import is `SESSION_PARAM` from phase 3's `lib/nina/active.ts`,
  so `?s=` has one spelling in the set;
- a new `lib/nina/semantic.ts` (`import 'server-only'`) exporting **`rankNinaSearchHits`** — the
  guarded symbol, in its own module precisely so phase 4's guard can sanction the definition site;
- a new `lib/nina/searchActions.ts` (`'use server'`) exporting exactly `searchNinaChats`, plus the
  private candidate-narrowing SQL (deliberately **not** in `lib/nina/queries.ts` — phase 1's file);
- `components/nina/useSemanticPref.ts` and `components/nina/NinaSearchField.tsx`, and the
  persistence key for the toggle;
- one edit to phase 5's `NinaSidebar.tsx`: it renders `<NinaSearchField>` at phase 5's named
  `searchSlot` seam, taking the close callback its required `onNavigate` prop needs from phase 5's
  `useNinaSidebar()`. It does **not** edit `app/nina/page.tsx`, so the slot is filled in-file.
**Does not touch:** `scripts/check-llm-payload-boundary.mjs` — phase 4 already registered this
call, which is the whole reason that file has one author; `lib/db/schema.ts`; anything on the chat
surface.
**Decides, and must state its reasoning:** how the toggle persists (assumption A6 says
`localStorage`, and this would be the **first** use of it in the codebase — `grep -rn "localStorage"`
over `lib`, `components` and `app` returns nothing today, and neither does `cookies()`, so the
choice needs an argument and a hydration-safe read); what the plain-text search actually queries
(message text and session titles, `ILIKE` or `to_tsvector` — Neon has both, and one is an index
decision); what semantic search is given, given assumption A7 (SQL-narrowed candidates, not the
whole conversation — the model has a context limit and this is a search box, not a turn); what it
returns when the model is unavailable (fall back to the text results and say so — silence would read
as "no matches"); and whether a hit navigates to the session or to the message (`nina_messages.seq`
plus the existing `?at=` scroll mark make the message reachable, so deep-linking to it is the
better answer if it is cheap).
**Exit criteria:** typing in the sidebar's field lists matching sessions and messages across all
sessions; the toggle survives a reload; with the toggle on, a query that shares no words with a
message still finds it; with the model unavailable, results degrade to text matching rather than
erroring; no model call in a render path.

### Phase 7 — Editing and deleting messages, his and hers
**Satisfies:** R8
**Owns:** a new `lib/nina/messageActions.ts` (`'use server'`: edit and delete, both owner-scoped);
a new pure `lib/nina/edit.ts` (what may be edited, what an empty edit means, how a delete composes
with a quote) with tests; the `updateNinaMessage` / `deleteNinaMessage` queries; the affordance in
`components/nina/MessageBubble.tsx` and its wiring through `MessageList.tsx` and `ChatScreen.tsx`.
**Does not touch:** `ChatImages.tsx` or `components/ui/PhotoViewer.tsx` (phase 9 owns both);
`app/nina/page.tsx`; the sidebar; `lib/db/schema.ts` unless an `edited_at` column is judged
necessary — and if it is, this phase writes migration `0005` and says why a nullable timestamp is
worth a migration.
**Decides, and must state its reasoning:** the affordance, which may not be a swipe-right (taken by
reply), a long-press (rejected on the record: it collides with iOS text selection and the native
callout, and copying what she said is a real capability) or a plain tap (breaks selection outright)
— so it is a fourth thing, and it needs a keyboard and VoiceOver path exactly as the reply button
got its `sr-only`-until-focused treatment; whether Nina's own words being editable is recorded as
what it is (the user asked for it precisely so the context can be corrected, and the plan should say
plainly that the edited text becomes what she "said" on the next turn); what happens to a message's
photos on delete (the FK cascades — assumption A5 — and the blobs are deliberately left, which is
out of scope but must be *stated*, not silently accepted); what happens to a distilled memory fact
whose `source_message_id` points at a deleted row (no FK exists, so nothing cascades; A5 keeps the
fact); and whether an edit is visible as an edit.
**Exit criteria:** editing a message changes the row and the next turn's prompt window contains the
new text; deleting one removes it from the screen and from the prompt; a quote pointing at a deleted
message degrades to plain text rather than throwing (the `ON DELETE SET NULL` behaviour
`resolveQuote` already documents); a foreign message id is refused, not degraded; the reply swipe
still works on every bubble.

### Phase 8 — The unread dot clears itself on the newest session
**Satisfies:** R9
**Owns:** `components/nina/NinaUnreadBadge.tsx` (docstring only); `app/nina/page.tsx`'s `after()`
mark-read call, now session-scoped; a new pure `lib/nina/unread.ts` with tests, and a
`null`-rendering `components/nina/NinaUnreadSync.tsx` that fires at most one `router.refresh()` per
change of the flag.

**Reconciled, and this is the one that decides whether R9 works at all.** The call is
`markNinaMessagesRead(userId, { sessionId: activeSessionId })` — phase 1's options-bag shape, not
the positional `(userId, activeSessionId)` this plan assumed; phase 1 moved `now` into that bag
expressly so this phase would not have to write
`markNinaMessagesRead(userId, undefined, id)`. **The mark is per session, the count is global**, and
all four relevant phases were checked to implement exactly that: phase 1 ships the session parameter
as *optional* on both `markNinaMessagesRead` and `countUnreadNinaMessages`, so
`countUnreadNinaMessages(userId)` stays callable with no session argument and keeps reading the
partial index `nina_messages_user_unread_idx`; phase 3 leaves the `after()` user-wide and hands it
here; phase 5 does not move it. This phase's own H2 warned that a *required* session argument on the
count would be a conflict needing a global overload — **it did not happen**, and no index is added.
Phase 3's `activeSessionId` (typed `string | null`) and `rows` are both confirmed in scope in
`NinaPage` above the `after()`, so the `if (activeSessionId !== null)` guard stays: phase 3
deliberately tolerates a runner with no sessions rather than writing to the database in a render
path.
**Does not touch:** `lib/db/schema.ts`, `drizzle/`, `ChatScreen.tsx`, the sidebar's internals,
`MessageList.tsx`.
**The mechanism is already identified, and the phase must fix the real one.** `markNinaMessagesRead`
works; the dot is stale because `NinaUnreadBadge` is a Server Component whose only refresh trigger
is a server render of another tabbed screen — its docstring says "It is deliberately NOT live… at
most one navigation stale is a fair trade for zero polling", and that trade is exactly what the user
is reporting as a bug. `markNinaMessagesRead` already returns a changed-row count "so phase 10 can
skip a `revalidatePath` when nothing did", and **no caller has ever made that call**. So the fix is
most likely a `revalidatePath` (or a targeted refresh) on the transition from unread to read, not a
new query — and it must not reintroduce the polling that comment rejects.
**Decides, and must state its reasoning:** what "the most recent chat" means under sessions — the
newest session, or every session (assumption A3 puts proactive messages in the most recent session,
so opening it should clear them, and a message sitting unread in an *older* session arguably should
still show a dot); whether opening the sidebar counts as opening the chat; and whether the fix
belongs in `after()`, which is where the mark already lives and which runs after the response is
sent.
**Exit criteria:** open `/nina`, read her newest messages, stay on the page — the dot is gone with no
navigation; a message that arrives while the page is open still raises it; no polling; the partial
index `nina_messages_user_unread_idx` is still the index the count reads.

### Phase 9 — Tap an image: full screen, download, attach to a new message
**Satisfies:** R10
**Owns:** `components/nina/ChatImages.tsx` (pass `onOpen` at last — the prop has existed since phase
6 of F33 and its docstring says wiring it "should be its own card"); `components/nina/MessageList.tsx`
and `ChatScreen.tsx` (viewer state and the `onOpen` thread); `components/ui/PhotoViewer.tsx` (a
download control and an attach control, both **optional props** so the four existing callers are
byte-identical in behaviour).
**Also owns, assigned by reconciliation:** the two-hunk image-id/kind mapping in
`app/nina/page.tsx`. This plan identified it as required for the attach control (its H1), correctly
declined to make it — phase 8 was concurrent in the draft DAG and `app/nina/page.tsx` is shared —
and asked to be told who owned it. **Nobody did.** Reconciliation fixed the ordering rather than the
ownership: this phase now declares `Depends on: 7, 8`, which serialises that file to 3 -> 5 -> 8 -> 9
and lets phase 9 make the change itself. R10 therefore stays whole in one phase, instead of being
split across a phase that ships it and a phase that cannot test it. The hunks turn the
`urlsByMessage` loop into a `photosByMessage` loop carrying ids and kinds and add `imageIds` /
`imageKinds` to the `initial` mapping; `getNinaMessageImagesForMessages` already selects both
columns, so no query changes, and `description` stays dropped on the floor at that same boundary
(invariant 5).

**Does not touch:** `lib/db/schema.ts`, `lib/nina/queries.ts`, the sidebar, `MessageBubble.tsx`, and
nothing in `app/nina/page.tsx` beyond the two hunks above — not the `?s=` resolution or the reads
(phase 3), not the sidebar mounts (phase 5), not the `after()` block or the `<NinaUnreadSync>` mount
(phase 8), not `<AppShell screen="chat">` (phase 2).
**Decides, and must state its reasoning:** how the download works on iOS Safari, where a
`<a download>` on a cross-origin Blob URL does not save (this is the part of R10 most likely to
quietly not work, and the phase must say what it actually does — a fetch-to-`blob:` then download, or
the platform share sheet, or opening in a new tab); how "attach this image to his new chat" reuses
the existing machinery rather than re-uploading — `sendNinaMessage`'s `attachExisting: { kind, id }`
already exists for exactly this and is owner-scoped, and `/nina?photo=image:<id>` is already a
supported deep link parsed by `parseNinaPhotoParam`, so the honest implementation is to reuse both
and the plan must check that `kind: 'image'` really is wired end to end; whether the viewer pages
across every image in the conversation or only the ones in the tapped bubble (`ViewerPhoto[]` and
`stepIndex` wrap circularly, so the answer changes what the dots mean); and what `label` each photo
gets, since `PhotoViewer` falls back to `SCREEN_KIND_LABEL[kind] ?? kind` and would otherwise
announce the literal word "generated".
**Exit criteria:** tapping any chat image opens the full-screen viewer with pinch-zoom and paging
intact; the download control saves the file on a real iPhone, or the plan states precisely what it
does instead and why; the attach control arms the composer with that photo and a send persists a
row pointing at the same blob with no re-upload; the four existing `PhotoViewer` call sites are
unchanged in behaviour.

## Reconciliation Log

Twenty-six cross-phase items were checked across two rounds. **Nineteen were real conflicts and are
resolved by edits to the plan files**; seven were reported or suspected conflicts that turned out to
be consistent, and are recorded because a future reader will otherwise re-open them. Nothing is
deferred. The last row is round 2's — a defect that round 1's own title-cap fix introduced and did
not notice.

| Conflict | Phases | Resolution |
|---|---|---|
| **The session-title cap had four spellings at two values.** Phase 1 `SESSION_TITLE_MAX_CHARS = 80` in `sessions.ts`; phase 3 `NINA_SESSION_TITLE_MAX = 60` in `active.ts`; phase 4 `NINA_SESSION_TITLE_MAX_CHARS = 60` in `title.ts`; phase 5 importing that name from `sessions.ts`. Phases 1 and 4 each instructed the other to import from it. | 1, 3, 4, 5 | **One declaration: `NINA_SESSION_TITLE_MAX_CHARS = 60` in `lib/nina/sessions.ts`.** Phase 5's spelling and path (its import needed no change at all), phase 3's and 4's value. Phase 1 renamed its constant and dropped 80; phase 3's `active.ts` now imports instead of declaring; phase 4's `title.ts` imports instead of declaring and mints no alias. Phase 4's proposal — keep 80 as a wider storage clamp — was overruled: it leaves two numbers and three names alive, phase 1 asked for the opposite in writing and owns the module, and `sessions.ts` imports nothing at all so it is client-safe by construction. 60 over 80 because two planners chose 60 for the *rule* while phase 1's own docstring called 80 "the STORAGE guard and nothing more"; the number the input caps with must be the number the server stores. |
| **Phase 4 split the index's single `lib/nina/title.ts` into a pure `title.ts` plus a `server-only` `autotitle.ts`.** | 4 (vs. the index) | **Blessed, and the index's Phase 4 section now says so.** The reasons were verified in the worktree, not taken on faith: `lib/llm/client.ts:1`, `lib/env.ts:1` and `lib/nina/gateway.ts:1` all open with `import 'server-only'`, and two live paths reach the pure rules from `'use client'` files — phase 5's `SessionRow` (the cap, for `maxLength`) and phase 6's `search.ts` -> `NinaSearchField` (`SESSION_PARAM` out of `active.ts`, which re-exports the sanitiser). One module holding both the rules and the model call breaks either. The import-cycle reason is now moot (the cap left both files) but was never load-bearing; the split stands on `server-only` alone. Phase 4's file count is 7, not the draft's ~5. |
| **The llm-payload guard's header said "FOUR ENTRY POINTS. THIS TABLE IS COMPLETE" while `GUARDED_CALLS` held five.** | 4 | **Phase 4's repair confirmed correct against the real file.** The five are `getOrCreateInsight`, `runNinaTurn`, `distillNinaMemory`, `resolveNinaPromises`, `describeNinaImage`; only `resolveNinaPromises` has no bullet. Count becomes seven with the two new entries, three bullets added. **Sole authorship confirmed:** all eight other plans list `scripts/check-llm-payload-boundary.mjs` under "leaves alone". |
| **Phase 6's guarded symbol had to match what phase 4 registered.** | 4, 6 | **No conflict — verified identical.** Phase 4 registered `rankNinaSearchHits` sanctioning exactly `lib/nina/semantic.ts` and `lib/nina/searchActions.ts`, read verbatim off phase 6's contract. Phase 6 keeps its names; no rename either way. The index's draft credited phase 6 with a single `lib/nina/search.ts`; the real layout is four modules plus two components and the index now records it. |
| **Phase 8 assumed `markNinaMessagesRead(userId, activeSessionId)`.** | 1, 8 | **Phase 1's shape wins:** `markNinaMessagesRead(userId, { sessionId: activeSessionId })`. Phase 1 moved `now` from a positional parameter into that options bag expressly so phase 8 would not have to pass `undefined` through it. Phase 8's call and its reconciliation note are rewritten. |
| **Phase 8 needed `countUnreadNinaMessages(userId)` to stay callable with no session argument (its H2: "a genuine conflict if it went the other way").** | 1, 8 | **No conflict — phase 1 shipped it optional** (`opts?: { sessionId?: string }`), so the global call is still the default, the global predicate stands and the partial index `nina_messages_user_unread_idx` still serves it. No global overload is needed and no index is added, which the set forbids. **This is what makes R9 work**, so it is recorded rather than left implicit. |
| **Phase 8 assumed `activeSessionId` and `rows` were in scope in `NinaPage` before the `after()`.** | 3, 8 | **No conflict — both confirmed** in phase 3's Step 13: `const activeSessionId = chooseActiveSession(...)` typed `string \| null`, and `rows` from the `Promise.all`, both above the `after()` phase 8 replaces. Phase 8's `if (activeSessionId !== null)` guard **stays**, because phase 3's D3 deliberately tolerates a runner with no sessions rather than writing to the database in a render path. |
| **"Mark-read per session, count global" had to be implemented that way by every phase that touches it.** | 1, 3, 5, 8 | **No conflict — verified in all four.** Phase 1 makes the session parameter optional on both queries; phase 3 leaves the `after()` user-wide and hands it to phase 8 (its handoff 9); phase 5 states it does not move, reorder or scope it; phase 8 scopes only the mark. A global mark-read would have cleared another session's unread messages; a per-session count would have needed an index phase 8 is forbidden to add. Neither happens. |
| **Phases 3, 5 and 8 all quoted `<AppShell bottomGap="chat">`** — the pre-phase-2 spelling. Phase 2 renames the prop to `screen` and warned about exactly this; phase 5 compounded it by asserting "`bottomGap` is phase 2's and is left exactly as phase 3 left it". | 2, 3, 5, 8 | **All three code blocks now quote `screen="chat"`**, and the prose with them. Phase 3's hedge — "if phase 2 *added* a chrome-mode prop" — was corrected: phase 2 *renamed* the existing one (`bottomGap` -> `screen`, `AppShellBottomGap` -> `AppShellScreen`). Phase 2 itself needed no change and now records that the warning was acted on. |
| **`app/nina/page.tsx` read `listNinaSessions` twice.** Phase 3 awaits it before the `Promise.all` (deliberately, on the critical path); phase 5 planned to add it "as a fifth element of the existing `Promise.all`". | 3, 5 | **Phase 5 reuses phase 3's `sessions` and `activeSessionId` bindings and adds no read.** Its conditional fallback ("if phase 3 does not hold the list…") is deleted, because phase 3 does hold it. |
| **Phase 5 required `ninaSessionTitle(row)`; phase 1 exports `sessionTitleFor`.** | 1, 5 | **Phase 1's name wins** (it owns the module, and its handoff already told phase 5 to render `sessionTitleFor(session)` rather than `session.title`). Phase 5's requirement, its `app/nina/page.tsx` import and its mapping are repointed. |
| **Phases 3 and 5 both expected `pinned: boolean`; phase 1 stores `pinnedAt: Date \| null`.** | 1, 3, 5 | **Phase 1's row shape wins** (its D4: pins are an instant so they can be ordered among themselves). Phase 3's `SessionActivity` takes `pinnedAt` verbatim, which preserves its "structural superset, no mapping step" property for a field it deliberately ignores; phase 5 derives `pinned: row.pinnedAt !== null` at its one server-side mapping. |
| **Phase 3 required a row type named `NinaChatSessionRow` with `title: string`.** | 1, 3 | **Phase 1's names and nullability win:** `NinaSessionRow` / `NinaSessionListRow`, with `title: string \| null` and `titleSource`. Phase 3's requires table is corrected. |
| **Phase 3 required `deleteNinaSession(userId, sessionId)`; phase 1 exports `removeNinaSession(userId, id)`.** | 1, 3 | **Phase 1's name wins**; phase 3's import and its one call site in `sessionActions.ts` are repointed. |
| **Phase 3 expected `createNinaSession` to return "phase 1's own deterministic placeholder title".** | 1, 3 | **It returns `title: null`.** Phase 1's D7 makes NULL/NULL the ordinary first state and `sessionTitleFor` the only sanctioned way to render it. Phase 3's requires row is corrected; nothing in phase 3 reads the returned title. |
| **Phase 5 guessed phase 3's action names, input shapes and result shape** (`renameNinaSession` / `setNinaSessionPinned` / `removeNinaSession`, returning `{ ok, error? }`, with `removeNinaSession({ sessionId })`). | 3, 5 | **Phase 3's spellings win** — `renameNinaChatSession`, `setNinaChatSessionPinned`, `removeNinaChatSession({ sessionId, activeSessionId })`, returning `{ ok, next }`. The `*ChatSession*` infix is load-bearing: phase 1's `queries.ts` already exports the three shorter names, so the action and the query it wraps must not collide. Phase 5's imports, its three call sites and its `run()` helper are rewritten; because `{ ok, next }` carries no `error`, the refusal sentence is now the row's own, in one place. `activeSessionId` is threaded through `SessionList` into `SessionRow`. |
| **The destination after removing a session was decided twice** — server-side by phase 3's action (returning `next`) and client-side by phase 5's `planSessionRemoval({ removedIsActive })`. | 3, 5 | **Phase 3 decides; phase 5 obeys.** `planSessionRemoval` now takes `{ next: string \| null }` and maps the action's answer onto refresh-or-navigate, so the rule stays pure and unit-tested (invariant 7) without holding a second opinion. Both halves already agreed on every case — `/nina` with `router.replace`, or stay and `refresh` — so no behaviour changes; only one of them now decides. Its two suite cases are updated. |
| **`insertNinaMessages` had two incompatible shapes.** Phase 1: a third parameter `sessionId?: string` (one session per call). Phase 3: `sessionId: string` on `NinaMessageInsert` (one session per row). | 1, 3 | **Phase 1's third parameter wins**, made **required** by phase 3, with phase 1's `ensureNinaSession` fallback branch deleted there as phase 1's handoff asks. `NinaMessageInsert` gains no field. It is also the better shape: all three writers insert one turn into one conversation, and a per-row session would make "this batch spans two conversations" expressible when nothing wants it. Phase 3's four call sites are rewritten to pass the session as the third argument. |
| **`?s=` was spelled three ways** — phase 3's `SESSION_PARAM = 's'` constant, phase 5's `` `/nina?s=${row.id}` `` literal, phase 6's literal `'s'`. | 3, 5, 6 | **`SESSION_PARAM` from `lib/nina/active.ts` is the one grammar**; phases 5 and 6 import it. Both plans had already flagged the duplication and invited this fix. `active.ts` is pure and client-safe after reconciliation, which phase 6 needs because `NinaSearchField` is `'use client'` — the same path phase 4's D1 relies on. |
| **Phase 7 reserved a conditional step against phase 1's session ordering key** (a stored `last_user_message_at` would go stale when the newest runner message is deleted). | 1, 7 | **Void — no step is owed.** Phase 1's D3 derives the sort key at read time and its D7 lists that column under "not added, deliberately"; its handoff instructs phase 7 by name not to add a maintenance write. Phase 7's hazard section is closed rather than left conditional, and `removeNinaMessage` touches `nina_messages` and nothing else. |
| **Phase 9's H1 — a required two-hunk change to `app/nina/page.tsx` — was owned by nobody.** Phase 9 declined it because phase 8 was concurrent in the draft DAG and asked the reconciler to assign it explicitly. Without it, `attachableIdAt` returns `null` and R10's attach control does not render at all. | 8, 9 | **Assigned to phase 9, with a new `Depends on: 8` edge**, per the set's own rule that the later writer of a shared file declares the edge. `app/nina/page.tsx` is now strictly serialised 2 -> 3 -> 5 -> 8 -> 9, so phase 9 makes the change itself and **R10 stays whole in one phase** rather than being split across a phase that ships it and a phase that cannot test it. The cost is one extra wave: **W5 = 9**. |
| **Phase 6's guard entry is a hard dependency on phase 4, and the draft DAG did not declare it.** Phase 6 depended only on 5. | 4, 6 | **Edge 6 -> 4 added.** Phase 6's own Requires item 1 calls the `rankNinaSearchHits` entry a hard build dependency, and phase 4 is that file's sole permitted author (invariant 2). Both 4 and 5 sit in wave 3, so phase 6 stays in wave 4 and the wave structure is unchanged — the edge exists so that the declared order matches the real one and a swarm cannot start phase 6 while its guard entry is missing, which would land the new model call unguarded exactly while it is new. |
| **Phase 7 quoted `lib/nina/queries.ts:617`**, a line number from `main`, for a file written by phases 1 and 3 before it. | 1, 3, 7 | **Phase 7 now quotes phase 1's named §4c seam** rather than a line number, and its requires block records that queries.ts is written 1 -> 3 -> 7. Its two additions are new functions at that seam and touch none of the statements phase 3 edits, so the three writers do not overlap. |
| **Phase 3's `sanitizeNinaSessionTitle` code block contained literal NUL and 0x1F bytes** where it meant the escapes `\x00-\x1f` — the control characters that broke `grep` on `phase-3.md`. Copied out verbatim it would not have passed `format:check`, let alone compiled. | 3 | **Fixed to the two-character escapes.** `phase-3.md` is now byte-clean and greppable. Phase 4, which moves this function's body into `title.ts`, already wrote the escapes correctly. |
| **Phase 3's handoff 1 called the coalesced sort key "the single most likely reconciliation item in this plan".** | 1, 3 | **No conflict — phase 1 already coalesces**, and by the same rule: `sessionActivityAt` returns `lastUserMessageAt ?? createdAt`, in a pure function rather than a SQL `ORDER BY`. A session created by "new chat" sorts to the top, which is what the handoff existed to ensure. Marked resolved in both plans. |
| **Phase 8's H1 asked phase 2 to consider omitting `NinaUnreadBadgeSlot` on `/nina`.** | 2, 8 | **Moot — phase 2 hides the bar by transform, not omission.** `TabBar` gains `hidden?: boolean` and `AppShell` renders `<ChatChrome ninaBadge={<NinaUnreadBadgeSlot />} />`, so the badge is still in `/nina`'s payload and phase 8's D7 first bullet is the case that applies. R9 remains satisfiable. |
| **Phase 6 fills phase 5's `searchSlot`, which is a prop on a component phase 6 does not mount.** | 5, 6 | **No conflict, and the mechanism is now written down.** Phase 6 does not edit `app/nina/page.tsx` (phases 3, 5, 8, 9 own it), so it renders `<NinaSearchField onNavigate={…} />` at the slot *inside* `NinaSidebar.tsx` — one import, one element, as its Files table says — and takes the close callback its required `onNavigate` prop needs from phase 5's exported `useNinaSidebar()`. The prop survives for any future caller; its default stops being `null`. |
| **Phase 5 writes `?sidebar=` with the History API while phase 3 forbids a second writer of the chat URL.** | 3, 5 | **No conflict.** Phase 3's prohibition (its handoff 7) is about `?s=`, which phase 5 only ever changes by navigation (`<Link>` / `router.replace`). `?sidebar=` is a different parameter, written from event handlers that read `window.location` at the time of the gesture, so it cannot race `ChatScreen`'s mount-time `replaceState` that strips `?attach=` and `?photo=`. |
| **ROUND 2 — round 1's title-cap fix left `lib/nina/active.ts` with a private import and no export, breaking two things downstream of it.** Round 1 turned phase 3's *declaration* of `NINA_SESSION_TITLE_MAX_CHARS` into a plain `import` from phase 1's `sessions.ts`, which is right — but the constant had been an **export** of `active.ts`, and two consumers still read it there: phase 3's own `tests/nina.active.test.ts` imports it from `@/lib/nina/active` (so that suite would not compile), and phase 4's step 5 — which deletes `sanitizeNinaSessionTitle`'s body from `active.ts` — would then leave the import with no consumer at all, failing `npm run lint` on an unused import. Phase 4 had also written that the test reads the cap "from `active.ts`'s own import", which a test cannot do. | 1, 3, 4 | **`active.ts` re-exports the cap under the same name.** Phase 3 keeps the value import, clamps with it, and adds `export { NINA_SESSION_TITLE_MAX_CHARS }` beside it; its contract bullet and module docstring now record that the re-export is load-bearing instead of saying it "re-exports nothing". Phase 4's step 5 is told **not** to delete either line, because once the body moves to `title.ts` the re-export is the import's only remaining consumer, and its Impact note now says the test imports the cap *from* `active.ts`. **Phase 1 remains the set's single declaration** — a same-name re-export is not a second declaration and mints no alias, so resolution 1 is preserved exactly. Phase 4's Files table also claimed `title.ts` creates "the cap"; corrected to "imports it, declares none". |

**Round 2 — verification pass. Everything else held; one defect found and fixed.**

Round 1 reported `contract_changed: true`, so this round re-checked each of its declared resolutions
in every file that resolution touches, and then re-derived the structure round 1 had changed. One
defect was found — the row above — and it was fixed in `phase-3.md` and `phase-4.md` rather than
recorded as a question, because it has exactly one build-green answer.

Verified present and mutually consistent: the single `NINA_SESSION_TITLE_MAX_CHARS = 60` in phase
1's `sessions.ts`, with no second declaration anywhere, no surviving `NINA_SESSION_TITLE_MAX` or
`SESSION_TITLE_MAX_CHARS` spelling, and the two remaining mentions of `80` confined to the
historical reconciliation prose of phases 1 and 4 — the schema column is `title: text('title')`
with no `varchar` length and no CHECK constraint, so no storage clamp survives; the blessed
pure/`server-only` `title.ts` / `autotitle.ts` split, recorded in this index's Phase 4 section; the
guard script's sole authorship (all eight other plans list it under "leaves alone") with its header
prose, its bullet list and `GUARDED_CALLS` now agreeing at **seven**, the missing
`resolveNinaPromises` bullet written, and `rankNinaSearchHits` registered against exactly the two
paths phase 6 exports it from; `markNinaMessagesRead(userId, { sessionId: activeSessionId })` in
phase 8 matching phase 1's `opts: { sessionId?: string; now?: Date } = {}` argument for argument,
with `countUnreadNinaMessages(userId)` still callable globally and the partial index
`nina_messages_user_unread_idx` intact — so R9 works; `insertNinaMessages`'s one surviving shape,
the required third parameter, used identically at all four call sites in `actions.ts` (two),
`proactive.ts` and `imagejobs.ts`, with `NinaMessageInsert` gaining no field; phase 5 adding no
second `listNinaSessions` read; `planSessionRemoval({ next })` mapping phase 3's server-side
decision rather than holding a second opinion; and **all nine plan files byte-clean** — a
byte-level census found zero control characters other than tab and newline in any of them, so phase
3's `\x00-\x1f` is the two-character escape sequence it should be.

Structure re-derived after round 1's DAG change: every `Depends on` line points strictly backward
and matches the phase table above (phase 9 carries both `7` and `8`; phase 6 carries both `5` and
`4`); each `Files` count matches its plan's own table (phase 3 = 14, phase 4 = 7, phase 9 = 12);
every wave is **file-disjoint**, checked path by path — W1 (1 ‖ 2), W3 (4 ‖ 5 ‖ 7) and W4 (6 ‖ 8)
have empty pairwise intersections; all eight multi-writer files land in strictly increasing waves
(`app/nina/page.tsx` 2->3->5->8->9 across waves 1-5, `lib/nina/queries.ts` 1->3->7,
`ChatScreen.tsx` 3->7->9, `MessageList.tsx` 7->9, `ChatChrome.tsx` 2->5, `NinaSidebar.tsx` 5->6,
`lib/nina/actions.ts` 3->4, and the eighth is `lib/nina/active.ts` 3->4), with every later writer
quoting post-edit state — no plan still quotes `<AppShell bottomGap="chat">` except phase 2's own
before-state and its rollback steps. R1-R11 are each still claimed by at least one phase's
**Satisfies** line and the Requirements table matches them; all 25 Impact Points in the analysis are
still owned; and phase 1 still changes zero call sites, so its optional-then-required two-step keeps
the tree green at that boundary.

## Open Questions

**None.** Every one of the twenty-six items above is resolved in the plan files themselves, and the
set is ready for `/analyze-orchestrator`. Round 2 verified that claim rather than restating it: it
re-read each of round 1's resolutions in every file the resolution touches, found exactly one place
where a resolution had been applied to three files and not the fourth, and fixed it — see the
round-2 row and note above.

That is a claim worth being precise about, because the section's whole purpose is to stop a
contradiction reaching nine unattended sessions. What it means here: there is no place left where
two plans instruct their sessions differently about the same symbol, file, signature or ordering. It
does **not** mean nothing was left undone — several plans name work they deliberately do not do
(a `nina/` blob reaper; `nina_messages.turn_id`, which the schema claims phase 3 of F33 stamps and
no caller ever has; re-titling a session whose first exchange was a false start; a photo count in
R11's confirmation; `ConversationFacts.olderMessageCount`'s now-imprecise doc comment). Each of
those is recorded in the owning plan's handoffs as a follow-up card with a reason, and each is
consistent with this index's **Scope** section. A phase declining work with a stated reason is not a
contradiction; two phases claiming the same work, or assuming different spellings of it, is — and
that is what the log above closes.

The one item that required a judgement rather than a lookup was the **title cap's value**: nothing
in the user's request names a number, so 60-over-80 is an adjudication between two values the plans
had already declared, made on the grounds recorded in the log and in phase 4's D3. It is flagged
here so the repo owner can overrule it with one edit to `lib/nina/sessions.ts` if he wants 80 — but
it is not left open, because leaving it open would mean four sessions each picking a cap.

## Rollback

**Per phase.** Every phase is one commit on `feature/nina-chat-sessions`, and the set is merged
`--no-ff` so each stays reachable — `git revert -m 1 <phase commit>` backs one out after the merge.
Phases 2, 5, 6, 8 and 9 are UI-only and revert cleanly.

**The two that do not.** Phase 1 ships migration `0004`, and phase 7 may ship `0005`. Reverting the
code without reverting the database leaves a column nothing writes, which is harmless; reverting the
**database** after phase 3 has shipped is not, because `session_id` is then load-bearing and
dropping it merges every session back into one conversation. So: drop the column only while phases
3-9 are all reverted, and never after production has written a second session.

**As a whole.** `git branch -D feature/nina-chat-sessions` and
`git worktree remove ~/.worktrees/run-insights/nina-chat-sessions`, before the pull request merges.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_CHAT_SESSIONS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_CHAT_SESSIONS_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_CHAT_SESSIONS_PLAN.md
