# Phase 5: The hidden full-screen sidebar: session list, pin, rename, remove, Nina's circle

**Plan set:** `NINA_CHAT_SESSIONS_PLAN.md`
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Satisfies:** R6 (the sidebar half), R7, R4, R11 — the runner can reach every past conversation
from a full-screen list, pin the ones he keeps coming back to, rename them, remove them, and the
chat itself is finally clean because her face moved into the list.
**Depends on:** Phase 3 (which owns `app/nina/page.tsx` as it stands when this phase opens it), and
transitively Phase 1 (the session rows and the ordering rule) and Phase 2 (`ChatChrome.tsx`'s
floating layer)
**Difficulty:** HARD
**Package:** `components/nina` (with one new pure module in `lib/nina` and one edit each in
`app/nina` and phase 2's `components/nina/ChatChrome.tsx`)

---

## Goal

After this phase `/nina` has no header row and no tab bar: the screen is the conversation and
nothing else (R7). A `>` control in phase 2's floating layer slides a full-screen panel in from the
left (R6). That panel carries Nina's circle — still a link to `/nina/about` — every session in
phase 1's order, and, per row, a pin toggle (R4), a rename field, and a remove control with a
confirmation that names what is about to be lost forever (R11). Two named seams at the top of the
panel are left empty on purpose: one for phase 6's search field, one for R2's create-a-chat control.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**
- The `<header className="mb-5 flex items-center gap-3">…</header>` block in `app/nina/page.tsx`
  (today `app/nina/page.tsx:260-278`; phase 3 will have moved the line numbers, not the block) —
  R7. The `<Link href="/nina/about">` + `<NinaAvatar size="md">` + `<h1>Nina</h1>` + the
  `"Reads every run. Says what she thinks."` line all move into `NinaSidebar`.
- Nothing else. No symbol, no export, no config key is removed anywhere in the repo.

**Renames:** none.

**Creates:**
- `lib/nina/sidebar.ts` — `SIDEBAR_PARAM`, `SIDEBAR_OPEN_VALUE`, `NINA_CHAT_HREF`,
  `isSidebarOpen`, `withSidebarParam`, `sessionDayLabel`, `planSessionList`,
  `planSessionRemoval`, and the types `SidebarSession`, `SidebarRow`, `SidebarList`,
  `SessionRemovalPlan`.
- `lib/nina/sidebar.test.ts` — the vitest suite for all five functions.
- `components/nina/NinaSidebar.tsx` — `NinaSidebarProvider`, `useNinaSidebar`,
  `NinaSidebarTrigger`, `NinaSidebar`, and the type `NinaSidebarAvatar`.
- `components/nina/SessionList.tsx` — `SessionList`.
- `components/nina/SessionRow.tsx` — `SessionRow`.

**Signature changes:**
- `components/nina/ChatChrome.tsx` (phase 2's file): **two lines added, nothing changed.** One
  `import { NinaSidebarTrigger } from './NinaSidebar'` and one `<NinaSidebarTrigger className=… />`
  placed at the left of the floating layer. No prop is added to `ChatChrome`, no existing prop
  changes type, and no existing line is edited. See Step 6 for why the trigger needs no prop.

**Requires (from earlier phases) — five names, and one of them is a hazard:**

1. **Phase 1 / `lib/nina/queries.ts`:** `listNinaSessions(userId)` returning rows that carry at
   least `{ id: string; title: string | null; titleSource: …; pinnedAt: Date | null;
   createdAt: Date; lastUserMessageAt: Date | null }` (phase 1's `NinaSessionListRow`), already in
   the R4+R5 order (pinned first, then most recent runner message descending). **Reconciled: the
   pin field is an INSTANT, `pinnedAt: Date | null`, not the boolean this contract assumed** —
   phase 1's D4 stores when he pinned it. Step 4 derives the boolean this phase's view model wants
   at the one server-side mapping, `pinned: row.pinnedAt !== null`. **This phase never re-sorts.** `planSessionList` preserves input
   order and `lib/nina/sidebar.test.ts` asserts that it does, which is the guard against a
   component growing a second opinion about the ordering.
2. **Phase 1 / `lib/nina/sessions.ts`:** `sessionTitleFor(row)` — **reconciled to phase 1's
   name**; this contract asked for `ninaSessionTitle`. The title-fallback rule, so an
   untitled session renders phase 1's deterministic placeholder rather than a placeholder this
   phase invented. Called **on the server**, in `app/nina/page.tsx`, so the client components
   receive a resolved `string`.
3. **Phase 1 / `lib/nina/sessions.ts`:** `NINA_SESSION_TITLE_MAX_CHARS` (`= 60`).
   **✅ RECONCILED EXACTLY AS ASKED — this import line and this `maxLength` need no change.**
   Reconciliation collapsed four spellings at two values into one declaration, and put it here: in
   phase 1's pure module, under this name, at 60. `sessions.ts` imports nothing at all, so it is
   client-safe by construction; phase 4's `lib/nina/title.ts` imports the same constant instead of
   declaring a rival, and phase 3's `lib/nina/active.ts` does too.

   The hazard this item raised was real and was checked in the worktree: `lib/llm/client.ts:1` and
   `lib/env.ts:1` both open with `import 'server-only'`, so a `title.ts` holding the titler's model
   call would indeed have been unusable from `SessionRow` — exactly the failure
   `components/ui/index.ts` documents at length ("that turned every
   `import { Card } from '@/components/ui'` in a `'use client'` file into a build error"). Phase 4
   answered it twice over: it split the model call out into `lib/nina/autotitle.ts` (blessed — see
   the index's Phase 4 section), *and* the cap now lives in `sessions.ts` regardless. The input's
   cap and the server's refusal are one number, which is the arrangement
   `lib/nina/albumActions.ts` argues for with `NINA_ATTACH_MAX_CHARS`.

   **The stated fallback is not needed and is withdrawn:** keep `maxLength` in Step 5.
4. **Phase 3 / `lib/nina/sessionActions.ts`** (`'use server'`), three functions, called only from
   `SessionRow`. **RECONCILED to phase 3's actual spellings and shapes** — this contract guessed
   `renameNinaSession` / `setNinaSessionPinned` / `removeNinaSession` with an `error?: string`
   result, and phase 3 (which owns the file) wrote:
   ```ts
   export interface NinaSessionActionResult {
     ok: boolean
     /** `'/nina'` means navigate there; `null` means stay. Phase 3 decides, this row obeys. */
     next: string | null
   }
   export async function renameNinaChatSession(input: {
     sessionId: string
     title: string
   }): Promise<NinaSessionActionResult>
   export async function setNinaChatSessionPinned(input: {
     sessionId: string
     pinned: boolean
   }): Promise<NinaSessionActionResult>
   export async function removeNinaChatSession(input: {
     sessionId: string
     activeSessionId: string | null
   }): Promise<NinaSessionActionResult>
   ```
   Three notes on the differences, all of them absorbed inside `SessionRow.tsx`:
   - **The `*ChatSession*` infix is load-bearing, not noise.** Phase 1's `queries.ts` already
     exports `renameNinaSession`, `setNinaSessionPinned` and `removeNinaSession`; phase 3's action
     names differ precisely so the action and the query it wraps are not one name in two layers.
   - **There is no `error` field.** Phase 3 returns `{ ok, next }`. A refusal is `ok: false`, and
     the row renders its own sentence — see the note in Step 5 where the refusal copy now lives.
   - **`removeNinaChatSession` requires `activeSessionId`**, because phase 3 decides the
     destination server-side. See the reconciled removal flow below.
5. **Phase 3 / `app/nina/page.tsx`:** `/nina` **with no `?s=`** must resolve to a real session (the
   most recent) and must render a working screen when the runner has **no** sessions at all. Both
   are already phase 3's stated exit criteria. This phase relies on them instead of duplicating
   them: see D-3 for why removing the open session navigates to the bare `/nina` and why that also
   answers "he removed the last one".
6. **Phase 3 / `app/nina/page.tsx`:** the active session id, resolved from `?s=`, must be available
   as a local binding in the page (it must be, to scope `listNinaMessages`). Step 4 reads it under
   the name `activeSessionId`.

**Leaves alone (owned by others):**
- `components/nina/ChatScreen.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `ChatImages.tsx`,
  `NinaUnreadBadge.tsx`, `Composer.tsx` — phases 3, 7, 8, 9. **Not one character.** The design in
  D-2 exists specifically so that the `>` control can reach the sidebar without editing
  `ChatScreen`, which renders `ChatChrome`.
- `lib/nina/queries.ts`, `lib/db/schema.ts`, `drizzle/**` — phase 1.
- `lib/nina/sessionActions.ts`, `actions.ts`, `active.ts`, `gateway.ts`, `load.ts`, `proactive.ts`,
  `imagejobs.ts` — phase 3. This phase *calls* `sessionActions.ts` and *imports* `SESSION_PARAM`
  from `active.ts` (reconciled — one spelling of `?s=` for the set), and writes in neither. Note
  phase 4 also edits `active.ts` in this same wave, replacing `sanitizeNinaSessionTitle`'s body;
  this phase reads a different symbol and edits no line, so the two do not collide.
- `lib/nina/title.ts` and `scripts/check-llm-payload-boundary.mjs` — phase 4. This phase adds no
  model call, so it has nothing to register.
- `lib/nina/search.ts` and the search field itself — phase 6, which fills `searchSlot`.
- `components/ui/AppShell.tsx`, `TabBar.tsx`, `lib/nina/chatview.ts`, `lib/nina/chrome.ts` —
  phase 2. In particular **`AppShell`'s docstring is deliberately not edited**: it says "`/nina`
  deliberately does not use this: a conversation's identity is a face and a name… See
  `app/nina/page.tsx` for the argument", and Step 4 keeps that argument alive in page.tsx rather
  than deleting it, so the pointer still resolves and phase 2's file stays untouched.
- `after(() => markNinaMessagesRead(userId))` in `app/nina/page.tsx` — phase 8. Step 4 does not
  move it, reorder it, or scope it.
- `app/nina/about/page.tsx`, `NinaAvatar.tsx`, `lib/nina/album.ts` — read and rendered, never
  edited.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/sidebar.ts` | create | the five pure rules: the URL grammar, the query-string writer, the row day label, the list plan, the removal plan |
| `lib/nina/sidebar.test.ts` | create | one vitest suite over all five, `environment: 'node'` |
| `components/nina/NinaSidebar.tsx` | create | the provider that owns the single history-entry ledger, the `>` trigger, and the full-screen panel with Nina's circle and both named seams |
| `components/nina/SessionList.tsx` | create | rows or the empty state, from `planSessionList`'s answer |
| `components/nina/SessionRow.tsx` | create | one row: the navigating label, the `⋯` disclosure, and the pin / rename / remove panels |
| `app/nina/page.tsx` | modify | delete the `<header>` (R7); map `listNinaSessions` rows to `SidebarSession[]` on the server; wrap the tree in `NinaSidebarProvider` and mount `<NinaSidebar>`; rewrite the "WHY THE HEADER IS NOT `ScreenHeader`" docstring block into "WHY THERE IS NO HEADER AT ALL" |
| `components/nina/ChatChrome.tsx` | modify | one import, one `<NinaSidebarTrigger>` at the left of the floating layer |

---

## Decisions, with the reasoning the index asked for

### D-1. An overlay, not a route — and the back gesture is bought back explicitly

The user's words are *"if user press a floating `>` button … it will slide right and take over full
screen"*. A route (`/nina/sessions`) would hand us three things for free that an overlay has to
build: the platform back gesture, focus handling across the transition, and a URL you can link to.
It costs three things that matter more here:

1. **The slide would be a route transition, which this app does not have.** A pushed route paints a
   new screen; making it slide in from the left means either a view transition (new machinery,
   nothing in the repo uses it) or a keyframe (invariant 8 forbids a second one).
2. **`/nina/sessions` is a second screen that has to re-read the conversation to come back to it.**
   The panel exists to *return* to a chat. As an overlay, the chat behind it is still mounted:
   `ChatScreen`'s scroll mark (`useChatScrollMark`), its in-flight reveal and its optimistic rows
   all survive being covered. As a route they are destroyed and rebuilt, and the runner who opened
   the list to check something and closed it again lands at the bottom of a re-fetched
   conversation.
3. **`TabBar` would light up the Nina tab for `/nina/sessions`** (`pathname.startsWith('/nina')`),
   on a screen phase 2 just removed the bar from — a contradiction with no owner, since phase 2
   owns the bar and this phase owns the sidebar.

So: an overlay. The two things a route would have given us are then bought back deliberately, and
they are the only two the exit criteria name:

- **The back gesture closes it**, because the open state lives in the URL as `?sidebar=1`, pushed
  with `window.history.pushState`. This is `components/ui/usePanelParam.ts`'s pattern verbatim,
  including its verified quotation from this repo's own Next
  (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, "Native
  History API"): pushState "integrate[s] into the Next.js Router, allowing you to sync with
  `usePathname` and `useSearchParams`". So the back gesture pops the entry, `useSearchParams`
  re-renders, and the panel slides out through the same code path that slid it in. It also means
  the *server page does not re-render* when the panel opens — `/nina` is four database reads, and a
  `router.push` for a state change that never leaves the client would repeat all four.
- **Focus is not trappable behind it.** `Sheet.tsx`'s three behaviours, ported: the body is
  scroll-locked while open, focus moves to the panel on open and back to the previously-focused
  element on close, `Escape` closes. Plus one thing `Sheet` gets from unmounting and this panel
  cannot: `inert={!open}`. See D-4.

### D-2. Why the `>` control needs no prop, and why that is what makes this phase possible

`ChatChrome` is rendered by `ChatScreen` (phase 2 states it does not touch `app/nina/page.tsx`
"beyond the one prop that selects the chat's chrome mode"), and `ChatScreen` is a file this phase
may not touch. So there is no prop chain from the page — the owner of the session data — down to
the floating layer.

Holding the open state in the URL dissolves the problem. The trigger and the panel share no React
state at all: each reads `?sidebar=1`. So `ChatChrome` can import `NinaSidebarTrigger` and render
it with no props, and `ChatScreen` never learns that a sidebar exists.

One thing *is* shared, and it is not the open flag: **whether this session pushed the history entry
that is currently on top.** `usePanelParam` explains why that bookkeeping cannot be skipped — close
must `history.back()` when we pushed and `replaceState` when we did not, or "Close, Escape and a
backdrop tap each leave a dead entry behind and the number of back-swipes needed to get off `/me`
becomes a function of how many badges the runner looked at". Here the *trigger* pushes and the
*panel* closes, in two different subtrees, so two independent `useRef`s would disagree: the panel
would `replaceState` over an entry the trigger pushed, and every open/close cycle would cost the
runner one dead back-swipe.

Hence `NinaSidebarProvider`, mounted in `app/nina/page.tsx` around both consumers. It is the
smallest possible context — one boolean, two callbacks and one ref — and it exists for exactly one
reason, stated in its docstring. `useNinaSidebar()` returns `null` outside a provider and
`NinaSidebarTrigger` renders nothing in that case, so `ChatChrome` on any future screen with no
sidebar draws no `>` and needs no flag.

*Rejected:* marking the pushed entry in `window.history.state` instead of a ref. Next's App Router
maintains its own router state on every entry and merges into it; writing a discriminator there is
undocumented territory for a saving of one context.

### D-3. What happens when the runner removes the session he is reading (R11's edge case)

`planSessionRemoval` is the rule, and it has exactly two answers:

- **The removed session is not the one open behind the panel** → `{ kind: 'refresh' }`. The row
  vanishes from the list, the panel stays open, and the runner carries on tidying. `router.refresh()`
  re-renders the page on the server, so the new list comes from `listNinaSessions` and the order is
  still phase 1's.
- **It is the one open behind the panel** → `{ kind: 'navigate', href: '/nina' }`, taken with
  `router.replace`.

Three things about that href, because it is the agreement with phase 3 and the plan file for phase 3
did not exist when this was written (`.workflows/plan/nina-chat-sessions/phase-3.md` was absent —
the reconciler should check this section against it):

1. **It is the bare `/nina`, with no `?s=`.** Phase 3 already has to answer "which session does
   `/nina` open when nothing is named" — that is how the fifth tab works. Navigating to the bare
   route *asks phase 3 its own question* instead of this phase computing "the most recent
   remaining session" in a component, which would be a second implementation of phase 1's ordering
   rule living in a file that cannot be unit-tested (invariant 7). The rejected alternative was for
   `removeNinaSession` to return a `nextSessionId` and for the row to navigate to it; it is
   rejected for the same reason and because it widens phase 3's action signature for no gain.
2. **It answers "he removed the last one" with the same branch.** A runner with zero sessions
   navigates to `/nina`, and what `/nina` renders with no sessions is phase 3's problem, already in
   its exit criteria. This phase adds no special case, and the panel behind shows the empty state
   because `listNinaSessions` came back empty.
3. **`replace`, never `push`.** The entry being replaced is the `?sidebar=1` entry the trigger
   pushed, and the one before it is `/nina?s=<the id just deleted>`. Pushing would leave a back
   gesture that lands on a dead session id; replacing removes both the sidebar entry and the reason
   to worry about it. It also closes the panel — `/nina` carries no `sidebar` param — which is the
   right outcome: after deleting the conversation you were reading, being shown where you landed is
   reassuring, and staying in the list would leave the runner guessing what is behind it. The
   asymmetry with the non-active case is deliberate and both halves are asserted in the test suite.

### D-4. The slide, under invariant 8: one transition, no keyframe, and the first `motion-reduce:`

The panel is **always mounted** and its transform is toggled:

```
transition-transform duration-200 ease-out motion-reduce:transition-none
open ? 'translate-x-0' : '-translate-x-full'
```

- **No keyframe.** `tests/motion.reducedMotion.test.ts` only ever looks at `@keyframes` and
  `[animation:…]` call sites, so a `transition-*` is invisible to it — which is the good outcome
  and the same one `MessageBubble` reached for its landing flash ("a colour transition and not an
  animation … nothing for `tests/motion.reducedMotion.test.ts` to guard").
- **Tailwind v4 compiles `translate` to its own longhand, and `transition-transform` covers it.**
  Verified in this repo's installed Tailwind (4.3.3) rather than remembered:
  `node_modules/tailwindcss/dist/lib.js` defines the `transition-transform` utility as
  `transition-property: transform, translate, scale, rotate`. So `-translate-x-full` (which
  compiles to the `translate` property, not `transform`) really is transitioned, and the
  `active:scale-[0.985]` on the `Button`s inside composes with the panel's translate instead of
  overwriting it — which is `TabBar`'s recorded reason for spelling `left-1/2 -translate-x-1/2`
  the way it does.
- **`motion-reduce:transition-none`, and it is the first use of that variant in the codebase**
  (`grep -rn motion-reduce app components` returns only a mention inside `app/globals.css`'s
  prose today). It needs the argument, because `globals.css` deliberately did *not* take this
  route for the pulse: it redefines the keyframe instead, so that "ten sites that must each
  remember a `motion-reduce:` variant" cannot forget. That trick works only for keyframes —
  keyframes cascade by name and a media-query redefinition replaces them wholesale. A `transition`
  has no name to redefine. The only global equivalent would be `* { transition: none }` inside the
  media query, and `globals.css` rules that out in the same breath: the `transition-*` utilities in
  `Chip`, `KindSelector` and `Button` are "deliberately untouched" because they animate colour, and
  a blanket rule would kill them. So the variant goes at the one site that needs it. And this one
  does need it: a full-screen panel travelling the width of the phone is precisely the "sustained"
  movement that file distinguishes from `Button`'s 1.5% press.
- **Always-mounted, rather than mount-on-open with an entrance transition.** Mounting first and
  flipping the transform on the next frame needs a double-`requestAnimationFrame`, and unmounting
  after the exit needs `transitionend` — which **never fires under `transition-none`**, so the
  reduced-motion path would strand the panel mounted and open. Keeping it mounted removes both. The
  cost is that the session rows render on every `/nina` load; they are already in hand from the
  server read, so the cost is DOM, not a query.
- **An off-screen `position: fixed` panel does not create a horizontal scrollbar.** Fixed-position
  boxes do not contribute to the scrollable overflow region of the initial containing block, so
  `-translate-x-full` at `inset-0` is safe with no `overflow-x` clamp on `<body>` — which matters
  because this phase may not touch `AppShell` or the root layout.
- **`inert={!open}` is what an always-mounted overlay owes the keyboard and the screen reader.**
  `Sheet` gets this for free by returning `null`; this panel cannot. `inert` is a boolean prop in
  React 19 (`@types/react`, `inert?: boolean | undefined`; this repo is on `react@19.2.8`), it
  removes the subtree from focus order and from the accessibility tree, and `aria-hidden` is set
  alongside it for engines that do not implement it yet.

### D-5. R11's confirmation — the one genuinely dangerous control in the set

Removing a session hard-deletes the conversation, and through
`nina_messages.session_id`'s cascade and `nina_message_images.message_id`'s existing one, the photos
in it (assumption A8). There is no archive flag — the Scope section rules one out — so **there is no
undo**, and the confirmation is the only thing between a mis-tap and a lost conversation.

What is built, and what each part is for:

1. **The control is two levels deep, not one.** The row itself carries no destructive button. A
   `⋯` disclosure opens a menu; the menu's "Remove" opens a confirm panel; the confirm panel's
   "Remove chat" is the third deliberate tap. A scroll cannot reach any of it — see D-6.
2. **The confirm panel names the chat and says what goes.** "*Remove "Marathon block"? Every
   message in this chat and every photo in it goes with it, permanently — there is no undo.*" The
   title is quoted because the row above it may have scrolled and because a title is what the
   runner recognises.
3. **The safe answer sits where the tap is heading.** The confirm panel's buttons are "Keep it"
   first and "Remove chat" second, and the panel's three lines of copy push both below where the
   menu's "Remove" button was. A double-tap or a fat-finger repeat lands on prose or on "Keep it",
   never on the destructive button. This is the one property `FolderMenu` and `RetryExtraction` do
   not state, and it is free.
4. **`window.confirm` is not used**, for the reason `components/review/RetryExtraction.tsx` already
   put on the record: on iOS it is "a system dialog that reads as an error". Inline confirmation in
   place is this codebase's shape for a destructive act — `RetryExtraction`,
   `components/admin/PhotoMoveBar.tsx` and `components/admin/FolderMenu.tsx`'s delete panel are
   three existing instances.
5. **A typed confirmation phrase is deliberately *not* used**, although the codebase has one:
   `MemoryLedger`'s purge makes the operator type `ADMIN_PURGE_CONFIRMATION`. That is an admin
   screen, operated rarely, wiping a whole ledger. This is a per-row tidy-up on the runner's own
   list, and it is the *reason the feature exists* — R11 was added so the list can be kept short.
   A typed phrase per removal would be friction on the happy path, and friction people learn to
   type without reading is not a safeguard.
6. **What is deliberately missing, and where it went.** The panel would be measurably safer if it
   said "42 messages and 3 photos", and it does not, because a count is not on
   `listNinaSessions`'s rows and adding it means editing `lib/nina/queries.ts` — phase 1's file,
   which this phase must not touch. That is filed in **Handoffs** as a one-line follow-up
   (`messageCount` on the list query, interpolated into the copy) rather than smuggled in here.

### D-6. Where the row controls live — three of them, on a phone, on a scrolling list

The row's primary action is *navigate to this chat*. Three secondary actions have to fit beside it
without a scroll ever triggering one.

- **Rejected: a swipe.** `lib/nina/reply.ts`'s `decideReplySwipe` is the precedent for a gesture
  built honestly (four rules, maximum touch count, zoom epsilon, dominance ratio), and it is the
  precedent for *not* doing this here too. Its own rule 4 exists because the gesture "must not eat
  the chat log's vertical scroll"; a session list is a shorter, denser vertical scroll where the
  same competition is worse. And it cannot carry three actions — WhatsApp-style swipe affords one.
  Most decisively: R11 is destructive and irreversible, and a gesture whose failure mode is being
  confused with a scroll is the worst possible trigger for it.
- **Rejected: a long-press.** On the record in `MessageBubble`'s docstring — it "collides with iOS
  text selection and the native callout menu on a block of selectable prose". A session title is
  selectable prose too.
- **Rejected: a tap on the row.** The row's tap is the navigation. Also on the record: a tap
  "would make the bubble itself a button, which breaks text selection just as thoroughly".
- **Chosen: a `⋯` disclosure button, 44 px, a sibling of the row's link.** `FolderMenu` and
  `MemoryLedger`'s `FactRow` are the shape — a `mode` union, one inline panel per mode, one `run()`
  owning the pending flag and the error line, and a Cancel that just resets `mode`. A sibling and
  not a child, because a `<button>` inside an `<a>` is invalid HTML and breaks the link's hit
  testing.
- **The pin *state* is on the row; the pin *control* is in the menu.** A pinned row shows a small
  pin glyph next to its day label. Making that glyph tappable would put a one-tap mutation back
  into the scroll path for the sake of saving a tap on the action the runner performs least often.
- **The panels expand inline, below the row, and are not absolutely positioned** — the one place
  this diverges from `FolderMenu`, whose panels are `absolute` because its trigger "renders inline
  in `FolderTree`'s `Row`, which is a 200 px flex line". This sidebar is the full width of the
  phone and scrolls vertically; an absolute panel would be clipped by the panel's own
  `overflow-y-auto` and would need a z-index above rows it does not own. Inline expansion needs
  neither.

### D-7. The rename input — the configuration `Sheet` lost the iOS keyboard on

A text field inside a modal surface is exactly what cost "one digit per keyboard" on the review
screen. `Sheet.tsx` records the mechanism: `onClose` was a dependency of the effect that calls
`panelRef.current?.focus()`, every call site passes an inline arrow, so a keystroke re-rendered the
parent, minted a new `onClose`, tore the effect down, re-ran it, and focus left the input.

`NinaSidebar`'s effect is written the same way and for the same reason: `closeRef` holds the latest
`closeSidebar`, and the effect's dependency array is **`[open]` alone**. A keystroke in the rename
field changes `SessionRow`'s local state, not `open`, so the effect does not re-run and focus stays
where the runner put it. The comment in the code says so, because the next person to add a
dependency to that array will drop the keyboard again.

Two more things the field does *not* do:

- **It does not validate.** `FolderMenu`'s header states the rule this repo follows: "THE SERVER
  OWNS EVERY REFUSAL … so there is exactly one place a rule lives and no chance of a control that
  permits what the action refuses (or, worse, forbids what it would have allowed)". Phase 4 owns
  the rename validation rule; the row renders whatever sentence the action returns in `error`.
- **It does not re-implement a length cap.** `maxLength={NINA_SESSION_TITLE_MAX_CHARS}`, imported
  — the `NINA_ATTACH_MAX_CHARS` arrangement, and the reason contract item 3 above is a hazard
  rather than a detail.

### D-8. What a row shows: title, pin state, and a relative day — not a snippet

- **A relative day, not a message snippet.** Three reasons, in order of weight. A snippet is
  message text, which `listNinaSessions` does not return and which would cost either a query change
  in phase 1's file or a second read per session. The day makes the *order legible*: R5's sort key
  is the most recent runner message, so the row explains why it is where it is, and a list whose
  order you can see is a list you can trust. And the reading-app stance — "if you're deciding
  between adding something and leaving it out, leave it out" — which `app/nina/page.tsx` already
  invokes to keep clocks off bubbles.
- **The vocabulary is the chat's own.** `'Today'` or `formatDayCompact(dayISO)`, which is exactly
  `MessageList`'s day divider (`day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)`).
  The list and the conversation name a day the same way.
- **Computed on the server (invariant 4).** `sessionDayLabel` lives in `lib/nina/sidebar.ts` and is
  called from `app/nina/page.tsx`, where `todayInJakarta()` and `jakartaDayOf` already are. The
  client components receive a finished `string | null`. This is stricter than `MessageList`, which
  calls `formatDayCompact` in a client component over a server-computed `dayISO`; concentrating it
  server-side costs nothing here and keeps the invariant literally true for the new surface.
- **A session with no runner message yet gets `null` and renders no day**, not `'—'`. `formatDay*`
  returns a `MISSING` marker for a bad input, and printing it beside a live chat would read as a
  fault rather than as "nothing has been said yet".

### D-9. Which row is the current one, when the chat behind is invisible

The panel is opaque and full-screen, so the runner cannot see the conversation the highlight refers
to. A tint alone would be a claim he cannot check. So the active row gets three things:

1. **The app's one surface.** `bg-card shadow-card rounded-card` — `Card.tsx`'s "white fill, 22px
   radius, soft shadow, no border". Every other row is bare paper. The active chat is the only
   *thing* on the list; the rest are references to things.
2. **The word "Open"**, in the meta line beside the day. Furniture, and worth it: it is the only
   unambiguous statement available when the evidence is hidden behind the panel.
3. **`aria-current="page"`**, which is `TabBar`'s spelling for exactly this idea.

And the active row is **a `<button>` that closes the panel**, where every other row is a `<Link>`.
Navigating to the session you are already reading is a no-op that costs a server round trip and a
history entry; closing the panel is what the tap means. The element type is therefore conditional,
which the component states out loud.

### D-10. "No more top bar" versus `AppShell`'s `ScreenHeader` contract

`app/nina/page.tsx` carries a block titled "WHY THE HEADER IS NOT `ScreenHeader`", and
`AppShell.tsx` points at it ("`/nina` deliberately does not use this … See `app/nina/page.tsx` for
the argument"). This phase deletes the markup that argument produced, so the argument has to be
replaced rather than removed — and the replacement is not "the header was a mistake":

> `ScreenHeader`'s contract is a name and at most one link, and a conversation's identity is a
> face. That was true and still is. What changed is where the identity belongs: on a phone the
> conversation *is* the screen (R1), and a 44 px face plus a 26 px name plus a caption was 96 px of
> the reading surface spent restating which of five tabs you are on. R7 moves the identity to where
> it is a *destination* — the sidebar, next to the list of her conversations, where it is also the
> door to `/nina/about` it became in phase 13. So `/nina` still declines `ScreenHeader`, now for a
> stronger reason: it has no header at all.

Keeping the block (rewritten) in page.tsx is also what lets `AppShell`'s sentence stay accurate
without editing phase 2's file.

### D-11. The two seams, named and empty

- **`searchSlot` — phase 6.** Rendered directly under Nina's circle and above the list, which is
  where R6 puts it ("at the top of the sidebar we can search all chat as well") and where the
  search field and its persisted toggle will sit. This phase renders `null` there and sketches no
  input, because a field with no action behind it is a control that lies.
- **`newChatSlot` — R2, phase 3.** Between the search seam and the list. **Read Step 4's note
  before deleting the header:** if phase 3 put its create-a-chat control inside the header row this
  phase removes, that control *moves into this seam* — it is not deleted. R2 is not in this phase's
  `satisfies` list, so this phase relocates phase 3's control and designs none of its own.

---

## Implementation Steps

### Step 1: `lib/nina/sidebar.ts` — the five rules

**File:** `lib/nina/sidebar.ts` (new)
**Change:** The pure module. Invariant 7: `vitest.config.ts` is `environment: 'node'`, so anything
in a component cannot be tested at all. Everything here is called from both a Server Component and
a client component, which is the `lib/nina/chatview.ts` / `lib/photos/gallery.ts` shape.

**Code:**

```ts
import { formatDayCompact } from '@/lib/format'

/**
 * The hidden full-screen sidebar's rules — F35 R6/R7/R4/R11, phase 5.
 *
 * ── WHY THESE ARE HERE AND NOT IN THE COMPONENT ───────────────────────────────────────────────
 * Invariant 7. `vitest.config.ts` runs `environment: 'node'` with no jsdom, so a decision that
 * lives inside a `'use client'` component cannot be asserted by anything in this repo. Four of the
 * five functions below decide something a reviewer would otherwise have to take on trust: which
 * query string the panel writes, which row is marked open, what a row's day says, and where the
 * screen goes when the runner removes the conversation he is reading. `lib/nina/chatview.ts` is
 * the same carve-out one screen over.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
 * **The ordering.** Pinned-first-then-most-recent-runner-message is phase 1's rule, decided in SQL
 * by `listNinaSessions` and asserted against `lib/nina/sessions.ts`. `planSessionList` PRESERVES
 * the order it is given and the suite asserts that it does; a second opinion about "newest" living
 * next to the index that answers it is the thing `lib/nina/album.ts` warns about in the same words.
 *
 * **The title fallback.** Also phase 1's (`sessionTitleFor`), resolved on the server before a
 * `SidebarSession` is built, so an untitled chat reads the same in the list as anywhere else.
 */

/** The query parameter that holds the panel open. `usePanelParam`'s habit: UI state in the URL. */
export const SIDEBAR_PARAM = 'sidebar'

/**
 * The only value that opens it.
 *
 * A strict grammar rather than truthiness, for `decodePanelDates`'s reason: a parameter whose
 * spelling is loose is a parameter two writers disagree about, and this URL already has two other
 * writers (phase 3's `?s=`, and `ChatScreen`'s `useLayoutEffect` that strips `?attach=`/`?photo=`).
 */
export const SIDEBAR_OPEN_VALUE = '1'

/**
 * The chat, with nothing named.
 *
 * Load-bearing in `planSessionRemoval`: navigating HERE asks phase 3 "which session is the most
 * recent one" instead of answering it in a component. See the phase 5 plan, D-3.
 */
export const NINA_CHAT_HREF = '/nina'

/** One row's worth of session, as the panel needs it. Every string is server-resolved. */
export interface SidebarSession {
  id: string
  /** Already through phase 1's `sessionTitleFor`, so this is never null and never a placeholder
   *  this phase invented. */
  title: string
  /** `/nina?s=<id>`, built on the server so the parameter's spelling lives in one place. */
  href: string
  pinned: boolean
  /** `'Today'`, `'3 Sep'`, or null when nothing has been said in this chat yet. */
  dayLabel: string | null
}

export interface SidebarRow {
  session: SidebarSession
  /** True for the one session open behind the panel. See D-9 for how that reads. */
  active: boolean
}

export type SidebarList = { kind: 'empty' } | { kind: 'rows'; rows: SidebarRow[] }

export type SessionRemovalPlan =
  | { kind: 'refresh' }
  | { kind: 'navigate'; href: typeof NINA_CHAT_HREF }

/** Is the panel open, according to the URL? */
export function isSidebarOpen(raw: string | null | undefined): boolean {
  return raw === SIDEBAR_OPEN_VALUE
}

/**
 * The query string to write when opening or closing the panel.
 *
 * A `URLSearchParams` copy of what is already there, never a hand-built string: `/nina` carries
 * `?s=` from phase 3 and may carry `?at=` from `lib/nina/scroll.ts`, and neither may be dropped by
 * a panel opening on top of them. `URLSearchParams.set` keeps an existing key in place, so opening
 * twice is idempotent rather than duplicative.
 *
 * Returns `''` when nothing is left, which the caller spells as the bare pathname — the same
 * `query ? '?' + query : window.location.pathname` shape `usePanelParam` and `ChatScreen` both use.
 *
 * The caller passes `window.location.search` and NOT `useSearchParams().toString()`, deliberately:
 * `ChatScreen`'s mount-time `replaceState` strips `?attach=`/`?photo=` behind React's back, so a
 * snapshot from the hook can be one write stale and would resurrect a parameter that was
 * deliberately consumed. `window.location` is the only reading that cannot be stale.
 */
export function withSidebarParam(search: string, open: boolean): string {
  const params = new URLSearchParams(search)
  if (open) params.set(SIDEBAR_PARAM, SIDEBAR_OPEN_VALUE)
  else params.delete(SIDEBAR_PARAM)
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * A row's day, in the conversation's own vocabulary.
 *
 * `MessageList`'s divider is `day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)`,
 * and this is the same expression so that the list and the chat cannot name a day two ways. Called
 * on the SERVER (invariant 4): `app/nina/page.tsx` already holds `todayInJakarta()` and
 * `jakartaDayOf`, and a formatted instant in a client component is the hydration mismatch that
 * file documents in three places.
 *
 * `null` in, `null` out — a chat with no runner message yet renders no day rather than
 * `lib/format.ts`'s missing-value marker, which beside a live chat would read as a fault.
 */
export function sessionDayLabel(dayISO: string | null, todayISO: string): string | null {
  if (dayISO === null) return null
  if (dayISO === todayISO) return 'Today'
  return formatDayCompact(dayISO)
}

/**
 * The list, as rows, with the open one marked — or the empty state.
 *
 * ORDER IS PRESERVED, NOT DECIDED. `listNinaSessions` already ordered these (R4 pinned-first, then
 * R5's most-recent-runner-message descending) and the suite asserts this function does not touch
 * it. `map` rather than a re-sort is the whole point.
 *
 * `activeSessionId` is null only when the runner has no sessions at all, or on a URL phase 3
 * declined to resolve; nothing matches, nothing is marked, and the panel still lists every row.
 */
export function planSessionList(input: {
  sessions: readonly SidebarSession[]
  activeSessionId: string | null
}): SidebarList {
  const { sessions, activeSessionId } = input
  if (sessions.length === 0) return { kind: 'empty' }
  return {
    kind: 'rows',
    rows: sessions.map((session) => ({
      session,
      active: activeSessionId !== null && session.id === activeSessionId,
    })),
  }
}

/**
 * Where the screen goes after a session is removed (R11).
 *
 * Two answers, and the *href* is the valuable half of them. Removing a chat the runner is not
 * reading is a list change: refresh, the row disappears, the panel stays open on the list he is
 * still tidying. Removing the one he IS reading has to land somewhere real — and it lands on the
 * BARE `/nina`, which asks phase 3 "which session opens when none is named" instead of this phase
 * re-deriving "the most recent remaining one" in a component that cannot be tested.
 *
 * That is also, at no extra cost, the answer to "he removed his last session": `/nina` with none
 * left is phase 3's empty screen, which is already in phase 3's exit criteria.
 *
 * The caller takes the navigate branch with `router.replace`, never `push`. The entry being
 * replaced is the panel's own pushed entry, and the one under it is `?s=<the id just deleted>`.
 *
 * ── RECONCILED: THE INPUT IS PHASE 3'S ANSWER, NOT A SECOND OPINION ─────────────────────────
 * This rule used to take `removedIsActive: boolean` and derive the href itself, which meant the
 * client and phase 3's `removeNinaChatSession` were each deciding where to land. Phase 3's action
 * already returns `next: string | null` — `'/nina'` when the removed session was the open one,
 * `null` when it was not — and it decides that with the session ids it has just proved ownership
 * of. So this function maps that answer onto the two things a screen can do. The two halves still
 * agree on every case (`'/nina'` + `replace`, or stay + `refresh`) and both are still asserted in
 * the suite; the difference is that only one of them decides.
 */
export function planSessionRemoval(input: { next: string | null }): SessionRemovalPlan {
  return input.next === null ? { kind: 'refresh' } : { kind: 'navigate', href: input.next }
}
```

**Impact:** New module, no importers yet. `npm test` picks it up through
`include: ['lib/**/*.test.ts', …]`.

---

### Step 2: `lib/nina/sidebar.test.ts` — the suite

**File:** `lib/nina/sidebar.test.ts` (new)
**Change:** One suite per rule. The two cases that matter most are "`planSessionList` does not
re-order" (the guard against a component growing a second opinion about phase 1's ordering) and
"`planSessionRemoval` navigates to the bare `/nina`" (the written-down agreement with phase 3).

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  isSidebarOpen,
  NINA_CHAT_HREF,
  planSessionList,
  planSessionRemoval,
  sessionDayLabel,
  SIDEBAR_OPEN_VALUE,
  SIDEBAR_PARAM,
  withSidebarParam,
  type SidebarSession,
} from './sidebar'

function session(id: string, over: Partial<SidebarSession> = {}): SidebarSession {
  return {
    id,
    title: `Chat ${id}`,
    href: `/nina?s=${id}`,
    pinned: false,
    dayLabel: 'Today',
    ...over,
  }
}

describe('isSidebarOpen', () => {
  it('opens only on the exact value', () => {
    expect(isSidebarOpen(SIDEBAR_OPEN_VALUE)).toBe(true)
  })

  it('is closed for a missing parameter', () => {
    expect(isSidebarOpen(null)).toBe(false)
    expect(isSidebarOpen(undefined)).toBe(false)
  })

  it('is closed for anything else, including truthy spellings', () => {
    // A loose grammar is a parameter two writers disagree about. `?sidebar=true` is not ours.
    for (const raw of ['', '0', 'true', 'yes', 'on', '1 ', '01']) {
      expect(isSidebarOpen(raw), raw).toBe(false)
    }
  })
})

describe('withSidebarParam', () => {
  it('adds the flag to an empty query', () => {
    expect(withSidebarParam('', true)).toBe(`?${SIDEBAR_PARAM}=${SIDEBAR_OPEN_VALUE}`)
  })

  it('keeps the active session and any scroll mark', () => {
    // The regression this exists for: phase 3's ?s= is what the panel is layered over, and losing
    // it would navigate the runner out of the conversation he opened the list from.
    expect(withSidebarParam('?s=abc&at=42', true)).toBe('?s=abc&at=42&sidebar=1')
  })

  it('accepts a search string with or without the leading question mark', () => {
    expect(withSidebarParam('s=abc', true)).toBe('?s=abc&sidebar=1')
  })

  it('is idempotent — opening twice does not duplicate the flag', () => {
    const once = withSidebarParam('?s=abc', true)
    expect(withSidebarParam(once, true)).toBe(once)
  })

  it('removes the flag in place, leaving the other parameters alone', () => {
    expect(withSidebarParam('?s=abc&sidebar=1&at=42', false)).toBe('?s=abc&at=42')
  })

  it('returns the empty string when closing leaves nothing', () => {
    // The caller spells this as the bare pathname, so /nina never keeps a stray "?".
    expect(withSidebarParam('?sidebar=1', false)).toBe('')
    expect(withSidebarParam('', false)).toBe('')
  })
})

describe('sessionDayLabel', () => {
  it('says Today for today', () => {
    expect(sessionDayLabel('2026-09-04', '2026-09-04')).toBe('Today')
  })

  it('uses the compact day for anything else', () => {
    expect(sessionDayLabel('2026-09-01', '2026-09-04')).toBe('1 Sep')
  })

  it('renders nothing for a chat with no runner message yet', () => {
    // Not lib/format.ts's missing marker: beside a live chat that reads as a fault.
    expect(sessionDayLabel(null, '2026-09-04')).toBeNull()
  })
})

describe('planSessionList', () => {
  it('is empty for no sessions', () => {
    expect(planSessionList({ sessions: [], activeSessionId: null })).toEqual({ kind: 'empty' })
  })

  it('preserves the order it was given', () => {
    // THE GUARD. listNinaSessions already applied R4 (pinned first) and R5 (most recent runner
    // message descending). A re-sort here would be a second opinion about the ordering living
    // where no test could see it — which is exactly what this phase promised not to write.
    const sessions = [
      session('c', { pinned: true, dayLabel: '1 Sep' }),
      session('a', { dayLabel: 'Today' }),
      session('b', { dayLabel: '3 Sep' }),
    ]
    const plan = planSessionList({ sessions, activeSessionId: null })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.map((row) => row.session.id)).toEqual(['c', 'a', 'b'])
  })

  it('marks exactly the open session', () => {
    const plan = planSessionList({
      sessions: [session('a'), session('b'), session('c')],
      activeSessionId: 'b',
    })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.filter((row) => row.active).map((row) => row.session.id)).toEqual(['b'])
  })

  it('marks nothing when no session is active', () => {
    const plan = planSessionList({ sessions: [session('a')], activeSessionId: null })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.every((row) => !row.active)).toBe(true)
  })

  it('marks nothing when the active id is not in the list', () => {
    // A forged or since-deleted ?s= degrades silently, exactly as ?attach= and ?photo= do.
    const plan = planSessionList({ sessions: [session('a')], activeSessionId: 'gone' })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.every((row) => !row.active)).toBe(true)
  })

  it('does not alias the input array', () => {
    const sessions = [session('a')]
    const plan = planSessionList({ sessions, activeSessionId: 'a' })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows[0]?.session).toBe(sessions[0])
    expect(plan.rows).not.toBe(sessions)
  })
})

describe('planSessionRemoval', () => {
  it('refreshes when phase 3 says to stay', () => {
    expect(planSessionRemoval({ next: null })).toEqual({ kind: 'refresh' })
  })

  it('navigates where phase 3 says, which for the open chat is the BARE /nina', () => {
    // The agreement with phase 3, written down. No ?s=: which session opens when none is named is
    // phase 3's rule, and it is also the answer when the runner just removed his last session.
    // Reconciled: the href arrives in the action's `next`, so this asserts the pass-through AND
    // pins the contract's value.
    expect(planSessionRemoval({ next: NINA_CHAT_HREF })).toEqual({
      kind: 'navigate',
      href: NINA_CHAT_HREF,
    })
    expect(NINA_CHAT_HREF).toBe('/nina')
    expect(NINA_CHAT_HREF).not.toContain('?')
  })
})
```

**Impact:** `npm test` gains one file, ~20 cases, no database and no jsdom.

---

### Step 3: `components/nina/NinaSidebar.tsx` — the provider, the trigger, the panel

**File:** `components/nina/NinaSidebar.tsx` (new)
**Change:** Three exports. The provider owns the one thing the trigger and the panel must agree
about (did *we* push the history entry). The trigger is the `>` control phase 2's layer places. The
panel is the full-screen overlay carrying Nina's circle (R7), both seams, and the list.

**Code:**

```tsx
'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

import { cn } from '@/lib/cn'
import type { NinaCropInput } from '@/lib/nina/crop'
import {
  isSidebarOpen,
  planSessionList,
  SIDEBAR_PARAM,
  withSidebarParam,
  type SidebarSession,
} from '@/lib/nina/sidebar'
import { NinaAvatar } from './NinaAvatar'
import { SessionList } from './SessionList'

/**
 * The hidden full-screen sidebar — F35 R6, and the new home of Nina's circle (R7).
 *
 * ── AN OVERLAY, NOT A ROUTE, AND THE TWO THINGS THAT COST ─────────────────────────────────────
 * R6 says the panel "slide[s] right and take[s] over full screen", which is an overlay. A route
 * (`/nina/sessions`) would have handed us the back gesture and focus handling for free and cost
 * three things instead: a route transition this app does not have (invariant 8 forbids a second
 * keyframe), the destruction of the mounted chat behind it — `ChatScreen`'s scroll mark, its
 * in-flight reveal and its optimistic rows all survive being *covered* and none survive being
 * unmounted — and a `TabBar` that would light the Nina tab on a screen phase 2 just removed the
 * bar from. So the two free things are bought back here, deliberately:
 *
 *   - **the back gesture**, because the open state is `?sidebar=1` in the URL, pushed with
 *     `window.history.pushState`. `components/ui/usePanelParam.ts` verified against this repo's
 *     own Next that pushState "integrate[s] into the Next.js Router, allowing you to sync with
 *     `usePathname` and `useSearchParams`", so a back gesture pops the entry and the panel closes
 *     through the same code that opened it — with NO server re-render of a page that is four
 *     database reads;
 *   - **focus**, via `Sheet.tsx`'s three behaviours (body scroll lock, focus in on open and back
 *     out on close, Escape) plus `inert` for the one thing `Sheet` gets from unmounting.
 *
 * No `<Suspense>` boundary is needed around `useSearchParams` for `usePanelParam`'s reason: the
 * caveat applies to a statically rendered route, and `/nina` opens with `requireUserId()`, so it
 * is dynamically rendered and the hook resolves during the server render. `npm run build` is what
 * actually proves that.
 *
 * ── WHY THERE IS A PROVIDER FOR ONE BOOLEAN AND ONE REF ───────────────────────────────────────
 * The `>` trigger lives inside phase 2's `ChatChrome`, which is rendered by `ChatScreen` — a file
 * this phase may not touch — so there is no prop chain from the page down to it. Holding the open
 * flag in the URL dissolves that: the trigger and the panel each read it and share no state.
 *
 * One thing genuinely is shared, and it is not the flag. `usePanelParam` explains why closing must
 * `history.back()` when we pushed and `replaceState` when we did not: otherwise every close leaves
 * a dead entry and "the number of back-swipes needed to get off [the screen] becomes a function of
 * how many [times the runner opened it]". Here the TRIGGER pushes and the PANEL closes, in two
 * different subtrees, so two independent refs would disagree and the panel would replace over an
 * entry the trigger pushed. Hence one ref, in one provider, mounted in `app/nina/page.tsx` around
 * both. Marking the entry in `window.history.state` instead was rejected: the App Router maintains
 * its own state on every entry and merges into it, which is undocumented ground to stand on for
 * the saving of one context.
 *
 * `useNinaSidebar()` returns null outside a provider and `NinaSidebarTrigger` then renders nothing,
 * so `ChatChrome` on a future screen with no sidebar draws no `>` and needs no flag for it.
 *
 * ── THE SLIDE (INVARIANT 8) ───────────────────────────────────────────────────────────────────
 * `transition-transform` on `-translate-x-full → translate-x-0`. No keyframe, so
 * `tests/motion.reducedMotion.test.ts` has nothing to guard — the outcome `MessageBubble` reached
 * for its landing flash. Tailwind v4 compiles `translate` to its own longhand and defines
 * `transition-transform` as `transition-property: transform, translate, scale, rotate` (verified in
 * `node_modules/tailwindcss/dist/lib.js`, 4.3.3), so the translate really is transitioned and the
 * `active:scale-[0.985]` on the buttons inside composes with it rather than overwriting it — the
 * property `TabBar`'s docstring records.
 *
 * `motion-reduce:transition-none` is the FIRST use of that variant in this codebase and needs its
 * argument, because `app/globals.css` deliberately took the other route for the pulse: it
 * redefines the keyframe, so ten call sites cannot each forget a variant. That trick only works
 * for keyframes, which cascade by name; a transition has no name to redefine, and the global
 * equivalent — `* { transition: none }` inside the query — would kill the colour transitions in
 * `Chip`, `KindSelector` and `Button` that the same file calls "deliberately untouched". A
 * full-screen panel crossing the phone is the sustained movement that file distinguishes from
 * `Button`'s 1.5% press, so the variant goes at the one site that needs it.
 *
 * ── WHY THE PANEL IS ALWAYS MOUNTED ───────────────────────────────────────────────────────────
 * Mounting on open needs a double `requestAnimationFrame` to have something to transition FROM,
 * and unmounting after the exit needs `transitionend` — which never fires under
 * `transition-none`, so the reduced-motion path would strand the panel open. Staying mounted
 * removes both, at the cost of DOM for rows the server read anyway. An off-screen
 * `position: fixed` box does not contribute to the viewport's scrollable overflow, so there is no
 * horizontal scrollbar and no `overflow-x` clamp is needed on a layout file this phase may not
 * touch. `inert={!open}` is what the closed panel owes the keyboard and the screen reader:
 * `Sheet` gets that from returning null, this cannot, and `inert` is a boolean prop in React 19.
 */

export interface NinaSidebarAvatar {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
}

interface NinaSidebarContextValue {
  open: boolean
  openSidebar: () => void
  closeSidebar: () => void
}

const NinaSidebarContext = React.createContext<NinaSidebarContextValue | null>(null)

/** Null outside a provider, on purpose: a `ChatChrome` with no sidebar draws no `>`. */
export function useNinaSidebar(): NinaSidebarContextValue | null {
  return React.useContext(NinaSidebarContext)
}

export function NinaSidebarProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const open = isSidebarOpen(searchParams.get(SIDEBAR_PARAM))

  /**
   * Only this session's own history entry is ours to pop. It resets whenever the panel closes —
   * which is exactly what the back gesture produces: the entry pops, the parameter disappears, and
   * the next open pushes a fresh one. `usePanelParam`'s `pushedRef`, one level up so the trigger
   * and the panel cannot disagree about it.
   */
  const pushedRef = React.useRef(false)
  React.useEffect(() => {
    if (!open) pushedRef.current = false
  }, [open])

  /**
   * `window.location.search` and NOT `searchParams.toString()`.
   *
   * `ChatScreen` strips `?attach=` and `?photo=` in a mount-time `replaceState`, behind React's
   * back. A snapshot from the hook can therefore be one write stale, and writing it would
   * resurrect a parameter that was deliberately consumed — re-arming an album photo for a second
   * send. `window.location` is the only reading of this URL that cannot be stale, and it is the
   * same source `ChatScreen`'s own effect reads.
   */
  const openSidebar = React.useCallback(() => {
    const next = withSidebarParam(window.location.search, true)
    window.history.pushState(null, '', next === '' ? window.location.pathname : next)
    pushedRef.current = true
  }, [])

  const closeSidebar = React.useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
      return
    }
    const next = withSidebarParam(window.location.search, false)
    window.history.replaceState(null, '', next === '' ? window.location.pathname : next)
  }, [])

  const value = React.useMemo<NinaSidebarContextValue>(
    () => ({ open, openSidebar, closeSidebar }),
    [open, openSidebar, closeSidebar],
  )

  return <NinaSidebarContext.Provider value={value}>{children}</NinaSidebarContext.Provider>
}

/**
 * R6's floating `>`, at the bottom-left corner.
 *
 * **It carries no positioning of its own, and that is deliberate.** The floating controls sit just
 * above the composer, whose `bottom` is computed from `TAB_BAR_HEIGHT_PX`,
 * `TAB_BAR_FAB_OVERHANG_PX`, the composer's own height and `--safe-bottom` — the three numbers the
 * analysis calls load-bearing and which are already spelled twice by necessity. Phase 2's
 * `ChatChrome` owns that geometry; spelling it a third time here is how a control ends up floating
 * over the composer on one device and under the keyboard on another. So this renders a bare 44 px
 * button and takes a `className` for whoever places it.
 *
 * `size-11` is 44 px, the iOS tap-target floor, which is the same reason `NinaAvatar`'s `md` is.
 */
export function NinaSidebarTrigger({ className }: { className?: string }) {
  const sidebar = useNinaSidebar()
  if (sidebar === null) return null

  return (
    <button
      type="button"
      aria-label="Buka daftar chat"
      aria-expanded={sidebar.open}
      onClick={sidebar.openSidebar}
      className={cn(
        'grid size-11 place-items-center rounded-pill bg-card text-ink-2 shadow-card',
        'transition-[opacity,transform] active:scale-[0.97]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path
          d="m9 6 6 6-6 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function NinaSidebar({
  avatar,
  sessions,
  activeSessionId,
  searchSlot = null,
  newChatSlot = null,
}: {
  /** `ninaAvatarView`'s three render fields. NOT its `description` — nothing here reads that. */
  avatar: NinaSidebarAvatar
  /** Already ordered by `listNinaSessions` (R4 then R5). Never re-sorted below this line. */
  sessions: readonly SidebarSession[]
  activeSessionId: string | null
  /**
   * **PHASE 6 SEAM — the search field and its persisted semantic-search toggle.**
   *
   * Rendered directly under Nina's circle and above the list, which is where R6 puts it: "at the
   * top of the sidebar we can search all chat as well. add a toggle at the right side of the
   * search field". Phase 5 renders nothing here and sketches no input, because a field with no
   * action behind it is a control that lies. Phase 6 owns `lib/nina/search.ts`, the search action,
   * the toggle and its persistence key, and fills this slot.
   */
  searchSlot?: React.ReactNode
  /**
   * **PHASE 3 / R2 SEAM — the create-a-chat control.**
   *
   * R2 is not in phase 5's `satisfies` list, so this phase designs no create control. It does
   * RELOCATE one: if phase 3 put its "new chat" control in the header row phase 5 deletes, that
   * control moves into this slot rather than being removed. See the phase 5 plan, Step 4.
   */
  newChatSlot?: React.ReactNode
}) {
  const sidebar = useNinaSidebar()
  const open = sidebar?.open ?? false
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  /**
   * **The `Sheet.tsx` trap, and this panel has the field that triggered it.**
   *
   * `Sheet` records the cost precisely: `onClose` was a dependency of the effect that also calls
   * `panelRef.current?.focus()`, every call site passes an inline arrow, so one keystroke inside
   * the sheet re-rendered the parent, minted a new `onClose`, tore the effect down and re-ran it —
   * focus left the input and iOS dropped the keyboard. "One digit per keyboard, on the screen whose
   * whole purpose is careful correction."
   *
   * This panel contains the rename field, which is the same configuration. So the effect below
   * keys on `open` ALONE and reads the latest close through this ref. **Do not add a dependency to
   * that array.** A keystroke changes `SessionRow`'s local state, not `open`, so the effect does
   * not re-run and the keyboard stays up.
   */
  const closeRef = React.useRef<() => void>(() => {})
  React.useEffect(() => {
    closeRef.current = sidebar?.closeSidebar ?? (() => {})
  }, [sidebar])

  React.useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    /*
     * The panel itself, not the search field — `Sheet`'s reason, and it matters more here: this
     * panel is opened from a chat where the composer may already have the keyboard up, and
     * focusing the panel is what puts it away. Raising a second keyboard for a field the runner
     * has not asked for would cover the list he opened the panel to read.
     */
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  const list = planSessionList({ sessions, activeSessionId })

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={open || undefined}
      aria-hidden={!open || undefined}
      aria-labelledby={titleId}
      inert={!open}
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-paper outline-none',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* The app's column, so the panel is not a full-bleed sheet of paper on a wide viewport.
          `--safe-top` is the notch inset; `PhotoViewer` is the precedent for a full-screen overlay
          honouring it, and `--safe-bottom` closes the other end because there is no tab bar under
          this panel to pad it. */}
      <div className="mx-auto w-full max-w-[470px] px-5 pt-[calc(1.25rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
        <header className="mb-6 flex items-start gap-3">
          {/*
            R7: the circle moved here, and phase 13's promise moves with it. Still a `<Link>` to
            `/nina/about` and not a `<button>` — it is a navigation, so it keeps the platform's
            long-press, middle-click and back behaviour and Next prefetches the route. Still
            `size-11`, 44 px, the tap-target floor phase 4 chose "for when phase 13 makes it a
            link", so no geometry changed on the way across.

            Navigating to `/nina/about` drops `?sidebar=1`, so the panel closes on its own, and the
            back gesture returns to it open. Nothing extra is wired for that.
          */}
          <Link href="/nina/about" aria-label="Buka detail Nina" className="rounded-pill">
            <NinaAvatar
              size="md"
              src={avatar.src}
              natural={avatar.natural}
              crop={avatar.crop}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink"
            >
              Nina
            </h2>
            <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
              Reads every run. Says what she thinks.
            </p>
          </div>
          {/* A real dismiss control with a name, `Sheet`'s reason for its own. 44 px. */}
          <button
            type="button"
            onClick={() => closeRef.current()}
            aria-label="Tutup daftar chat"
            className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-pill text-[19px] font-semibold text-ink-3"
          >
            ✕
          </button>
        </header>

        {searchSlot !== null && <div className="mb-4">{searchSlot}</div>}
        {newChatSlot !== null && <div className="mb-4">{newChatSlot}</div>}

        <SessionList
          list={list}
          activeSessionId={activeSessionId}
          onClose={() => closeRef.current()}
        />
      </div>
    </div>
  )
}
```

**Impact:** New file. Nothing imports it until Steps 4 and 6. `NinaAvatar` is safe to render from a
client component: `lib/nina/album.ts` is pure with a single type import and `lib/nina/crop.ts` has
none, which is why `components/admin/CircleFrame.tsx` — a `'use client'` file — already imports
`NINA_AVATAR_FALLBACK_SRC` from it.

---

### Step 4: `app/nina/page.tsx` — delete the header, mount the sidebar

**File:** `app/nina/page.tsx` — the header block is at `260-278` on `main`; phase 3 rewrites much of
this file first, so **apply this as four surgical edits and not as a file replacement.** A
whole-file rewrite here would reverse-apply phase 3's commit, which is the exact failure that
destroyed committed work on this repo once (`admin-album-file-manager`, 2026-09-04: "a partial stage
built from a reconstructed blob reverse-applied a peer's commit, invisible to every pre-commit gate
because the working tree was always right").

**Change 4a — the docstring block.** Replace the block currently headed
`── WHY THE HEADER IS NOT ScreenHeader ──` with the block below. `components/ui/AppShell.tsx` points
at this argument ("See `app/nina/page.tsx` for the argument") and this phase may not edit that file,
so the argument is *rewritten*, never deleted.

```
 * ── WHY THERE IS NO HEADER AT ALL (R7) ────────────────────────────────────────────────────────
 * Until phase 5 this screen built its own header row — her face at 44px, her name at the same
 * `text-[26px] font-bold tracking-[-0.02em]` every other screen title uses, one quiet line under
 * it — because `ScreenHeader`'s contract is "a name on the left, at most one plain-text link on
 * the right" and a conversation's identity is a face, not a title and a link.
 *
 * **That argument was right and it is why the row is now gone.** What changed is where an identity
 * belongs. On a phone the conversation IS the screen (R1 took the tab bar off it for the same
 * reason), and 96px of reading surface spent restating which of five tabs you are on is the most
 * expensive caption in the app. R7 moves the identity to where it is a DESTINATION instead of a
 * label: `components/nina/NinaSidebar.tsx`, at the top of the list of her conversations, where the
 * circle is also still the door to `/nina/about` that phase 13 made it. Same avatar, same 44px,
 * same `<Link>`, same `ninaAvatarView` source — the markup moved and nothing about it changed.
 *
 * So `/nina` still declines `ScreenHeader`, now for a stronger reason than before: it has no
 * header. `getCurrentNinaAvatar` is still read here, because the sidebar is rendered from this
 * Server Component and a client component cannot await her face.
```

**Change 4b — imports.** `NinaAvatar` and `Link` are no longer used by this file *if* phase 3 left
no other `<Link>` in it; `tsc` and `eslint` will say so. Add:

```ts
import { NinaSidebar, NinaSidebarProvider } from '@/components/nina/NinaSidebar'
import { formatDayCompact } from '@/lib/format'
import { SESSION_PARAM } from '@/lib/nina/active'
import { sessionTitleFor } from '@/lib/nina/sessions'
import { NINA_CHAT_HREF, sessionDayLabel, type SidebarSession } from '@/lib/nina/sidebar'
```

`formatDayCompact` is imported by `sidebar.ts`, not here — drop that line unless a direct use
appears. `jakartaDayOf` and `todayInJakarta` are already imported by this file
(`app/nina/page.tsx:9`).

**Change 4c — the view model, on the server.** Insert after the existing `const avatar =
ninaAvatarView(avatarRow)` line (today `app/nina/page.tsx:166`).

**RECONCILED — reuse phase 3's bindings; add no read of your own.** Phase 3's Step 13 already does
`const sessions = await listNinaSessions(userId)` and
`const activeSessionId = chooseActiveSession(sessions, parseNinaSessionParam(sessionParam))`, both
**above** the `Promise.all` and deliberately so: it is on the critical path because
`listNinaMessages` cannot run until the session is known. So both bindings are in scope under
exactly the names this step uses, and this phase must **not** add `listNinaSessions(userId)` as a
fifth element of the `Promise.all` — that would issue the same query twice in one render. The
conditional fallback this step originally carried ("if phase 3 does not hold the list…") is deleted:
phase 3 does hold it.

```ts
  /*
   * The sidebar's rows — F35 R6/R4/R11, phase 5.
   *
   * **Every cross-phase dependency in this phase is concentrated here, on purpose.** The three
   * client components below take a plain view model and import nothing from phase 1: the ordering
   * came out of `listNinaSessions` in SQL, the title fallback is `sessionTitleFor`, the day string
   * is `lib/format.ts` on the server (invariant 4), and `?s=`'s spelling comes from phase 3's
   * `SESSION_PARAM` rather than a literal. So a rename anywhere upstream is fixed in this block and
   * nowhere else. (**Reconciled:** this expression used to hardcode `s`; phase 3 exports the
   * constant, phase 6's `searchHitHref` imports it too, and one grammar with one owner is the point.)
   *
   * `map` and not `sort`: R4 (pinned first) and R5 (most recent runner message descending) were
   * decided by the query, and `planSessionList` asserts in its own suite that nothing downstream
   * re-orders them.
   */
  const sidebarSessions: SidebarSession[] = sessions.map((row) => ({
    id: row.id,
    title: sessionTitleFor(row),
    href: `${NINA_CHAT_HREF}?${SESSION_PARAM}=${row.id}`,
    /* Reconciled: phase 1 stores `pinnedAt: Date | null` (its D4 — an instant, so pins can be
     * ordered among themselves). The sidebar only ever asks "is it pinned", so the boolean is
     * derived here, once, on the server. */
    pinned: row.pinnedAt !== null,
    dayLabel: sessionDayLabel(
      row.lastUserMessageAt == null ? null : jakartaDayOf(row.lastUserMessageAt),
      todayISO,
    ),
  }))
```

`todayISO` is `todayInJakarta()`. If phase 3 does not already hold it in a binding, add
`const todayISO = todayInJakarta()` above this block and pass `todayISO` to `<ChatScreen>` in place
of the inline `todayInJakarta()` call it has today (`app/nina/page.tsx:282`) — one expression
hoisted, no behaviour change, and it stops the same clock being read twice in one render.

**Change 4d — the returned tree.** Replace the `<header>…</header>` block (today
`app/nina/page.tsx:260-278`) with nothing, and wrap the shell's children in the provider with the
panel as the last child. `<ChatScreen …>`'s props are phase 3's and are passed through untouched;
`screen` is phase 2's and is left exactly as phase 3 left it. **RECONCILED: the prop is
`screen`, not `bottomGap`** — phase 2 renamed `AppShell`'s `bottomGap` -> `screen` (and the type
`AppShellBottomGap` -> `AppShellScreen`), so `app/nina/page.tsx:259` reads `<AppShell screen="chat">`
by the time this phase opens the file. Do not reintroduce the old name.

```tsx
  return (
    <AppShell screen="chat">
      {/*
        R7: no header row. The face, the name and the quiet line all moved into `NinaSidebar`; see
        the block at the top of this file for why that is the same argument and not a reversal.

        `NinaSidebarProvider` wraps BOTH consumers, and that is its whole reason for existing: the
        `>` trigger lives inside phase 2's `ChatChrome` (rendered by `ChatScreen`) and the panel is
        the sibling below, so the one piece of state they must agree about — whether this session
        pushed the history entry the back gesture will pop — has to live above both.

        The panel is LAST in the tree. It is `fixed inset-0`, so paint order does not depend on it,
        but the linear reading order does: the conversation is this screen's content and a list of
        other conversations is not.
      */}
      <NinaSidebarProvider>
        <ChatScreen
          initial={initial}
          todayISO={todayISO}
          userId={userId}
          pending={pending}
          pendingPhoto={pendingPhoto}
        />

        <NinaSidebar
          avatar={{ src: avatar.src, natural: avatar.natural, crop: avatar.crop }}
          sessions={sidebarSessions}
          activeSessionId={activeSessionId}
        />
      </NinaSidebarProvider>
    </AppShell>
  )
```

`avatar` is destructured field by field rather than spread, so `ninaAvatarView`'s `description`
cannot travel to a client component by accident — the same care `pendingPhoto` takes two blocks up.

**⚠ Before deleting the header, check it for phase 3's create-a-chat control.** If phase 3 put a
"new chat" button in that row, it does **not** get deleted: pass it into the panel's
`newChatSlot` instead, e.g.

```tsx
        <NinaSidebar
          avatar={{ src: avatar.src, natural: avatar.natural, crop: avatar.crop }}
          sessions={sidebarSessions}
          activeSessionId={activeSessionId}
          newChatSlot={<NewChatButton />}
        />
```

R2 is phase 3's requirement, not this phase's, so this phase relocates that control and designs
none of its own. If phase 3 put it in `ChatChrome` or in `ChatScreen` instead, leave `newChatSlot`
unpassed and the seam empty.

**Impact:** The header row disappears (R7). The page gains one read's worth of mapping and one
overlay. `after(() => markNinaMessagesRead(userId))` is untouched — phase 8's. `maxDuration = 60`
is untouched. No new query, no model call: invariant 4 holds and the guard script is not edited.

---

### Step 5: `components/nina/SessionList.tsx` and `components/nina/SessionRow.tsx`

**File:** `components/nina/SessionList.tsx` (new)
**Change:** Rows or the empty state, from `planSessionList`'s answer. Nothing is decided here.

**Code:**

```tsx
'use client'

import { EmptyState } from '@/components/ui/EmptyState'
import type { SidebarList } from '@/lib/nina/sidebar'
import { SessionRow } from './SessionRow'

/**
 * Every chat, in phase 1's order — F35 R2's history list, R4's pinned-first.
 *
 * This component decides NOTHING. `planSessionList` chose between rows and the empty state and
 * marked the open one; the order came out of `listNinaSessions` in SQL. Both facts are asserted in
 * `lib/nina/sidebar.test.ts`, which is the only place they can be (invariant 7: `vitest.config.ts`
 * is `environment: 'node'`).
 *
 * ── THE EMPTY STATE, AND WHEN IT IS EVEN REACHABLE ────────────────────────────────────────────
 * Almost never: phase 1's migration backfills every existing message into one session per user, so
 * a runner with a conversation has at least one row. It is reachable in exactly two states — a
 * brand-new runner, and one who has just removed his last chat (R11) — and both are real, so it is
 * built rather than assumed away.
 *
 * `EmptyState` and not a bespoke block: it is "the one shape absence takes in this app", dashed
 * rather than a card so it reads as "this will fill up" rather than as an error, and it ships zero
 * client JS. Its `action` slot is deliberately left empty here — the create-a-chat control is R2's
 * and lives in the panel's `newChatSlot` above this list, where it is also reachable when the list
 * is NOT empty. One control, one place.
 */
export function SessionList({
  list,
  activeSessionId,
  onClose,
}: {
  list: SidebarList
  /* Reconciled: passed straight through to `SessionRow`, which hands it to phase 3's
   * `removeNinaChatSession` so the SERVER decides where a removal lands. `row.active` is the same
   * fact reduced to a boolean and is used only for the row's own styling. */
  activeSessionId: string | null
  onClose: () => void
}) {
  if (list.kind === 'empty') {
    return (
      <EmptyState
        title="Belum ada chat"
        description="Chat baru akan muncul di sini, yang terbaru di atas."
      />
    )
  }

  return (
    <ul className="space-y-1.5">
      {list.rows.map((row) => (
        <li key={row.session.id}>
          <SessionRow
            session={row.session}
            active={row.active}
            activeSessionId={activeSessionId}
            onClose={onClose}
          />
        </li>
      ))}
    </ul>
  )
}
```

**File:** `components/nina/SessionRow.tsx` (new)
**Change:** One row: the navigating label, the `⋯` disclosure, and the three panels. This is the
only file in the phase that imports a Server Action.

**Code:**

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import {
  removeNinaChatSession,
  renameNinaChatSession,
  setNinaChatSessionPinned,
  type NinaSessionActionResult,
} from '@/lib/nina/sessionActions'
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'
import { planSessionRemoval, type SidebarSession } from '@/lib/nina/sidebar'

/**
 * One chat in the sidebar, with its three secondary actions — F35 R4 (pin), R3's manual half
 * (rename) and R11 (remove).
 *
 * ── THE AFFORDANCE IS A `⋯` DISCLOSURE, AND THREE ALTERNATIVES ARE ON THE RECORD ──────────────
 * The row's primary action is "open this chat". Three secondary actions have to fit beside it on a
 * phone-width, vertically-scrolling list without a scroll ever firing one.
 *
 *   - **Not a swipe.** `decideReplySwipe` is the precedent for building a gesture honestly and
 *     also the precedent for not building one here: its fourth rule exists because the gesture
 *     "must not eat the chat log's vertical scroll", and a denser list is a worse place for that
 *     competition. It affords one action, not three. And R11 is irreversible — a trigger whose
 *     failure mode is being mistaken for a scroll is the worst available one for a permanent
 *     delete.
 *   - **Not a long-press.** On the record in `MessageBubble`: it "collides with iOS text selection
 *     and the native callout menu on a block of selectable prose". A chat title is selectable
 *     prose too.
 *   - **Not a tap on the row.** The row's tap is the navigation, and making the row a button
 *     "breaks text selection just as thoroughly".
 *
 * So: a 44px `⋯` button, a SIBLING of the row's link and not a child (a `<button>` inside an `<a>`
 * is invalid and breaks the link's hit testing). `components/admin/FolderMenu.tsx` and
 * `MemoryLedger`'s `FactRow` are the shape — a `mode` union, one panel per mode, one `run()` that
 * owns the pending flag and the error line, and a Cancel that just resets `mode`.
 *
 * The PIN STATE is on the row; the PIN CONTROL is in the menu. A tappable pin glyph would put a
 * one-tap mutation back into the scroll path to save a tap on the action performed least often.
 *
 * ── THE PANELS EXPAND INLINE, WHICH IS WHERE THIS DIVERGES FROM `FolderMenu` ───────────────────
 * `FolderMenu`'s panels are `absolute` because its trigger "renders inline in `FolderTree`'s `Row`,
 * which is a 200px flex line". This sidebar is the full width of the phone and scrolls vertically;
 * an absolute panel would be clipped by the panel's own `overflow-y-auto` and would need a z-index
 * over rows it does not own. Inline expansion needs neither.
 *
 * ── THE SERVER OWNS EVERY REFUSAL ─────────────────────────────────────────────────────────────
 * `FolderMenu`'s rule, quoted: nothing here pre-validates a title, so "there is exactly one place
 * a rule lives and no chance of a control that permits what the action refuses (or, worse, forbids
 * what it would have allowed)". Phase 4 owns the rename validation rule; this row renders whatever
 * sentence comes back in `error`. The ONE thing borrowed is the cap, as
 * `NINA_SESSION_TITLE_MAX_CHARS` — the arrangement `lib/nina/albumActions.ts` argues for with
 * `NINA_ATTACH_MAX_CHARS`, so the input's `maxLength` and the server's clamp are one number.
 *
 * ── R11's CONFIRMATION IS THE ONE GENUINELY DANGEROUS CONTROL IN THIS SET ─────────────────────
 * Removing a chat hard-deletes its messages and, through the cascades, their photo rows. There is
 * no archive flag and therefore no undo, so the confirmation is the only thing between a mis-tap
 * and a lost conversation. Four properties, each doing a job:
 *
 *   1. **Three deliberate taps**, not one: `⋯` → Remove → Remove chat.
 *   2. **The copy names the chat and says what goes**, because the row above may have scrolled and
 *      because a title is what the runner recognises.
 *   3. **The safe answer sits where the finger is heading.** "Keep it" comes first, and three lines
 *      of copy push both buttons below where the menu's "Remove" was, so a double-tap lands on
 *      prose or on "Keep it" — never on the destructive button.
 *   4. **No `window.confirm`**, for `RetryExtraction`'s recorded reason: on iOS it is "a system
 *      dialog that reads as an error".
 *
 * A typed confirmation phrase — `MemoryLedger`'s `ADMIN_PURGE_CONFIRMATION` — was considered and
 * rejected: that is an admin screen wiping a whole ledger, this is the per-row tidy-up R11 was
 * added FOR, and friction people learn to type without reading is not a safeguard. The copy would
 * be measurably better if it named a message count; that needs a column on
 * `listNinaSessions`, which is phase 1's file and out of this phase's scope, and it is filed as a
 * handoff rather than smuggled in.
 *
 * ── THE ACTIVE ROW IS A BUTTON, NOT A LINK ────────────────────────────────────────────────────
 * Navigating to the chat you are already reading costs a server round trip and a history entry to
 * change nothing. Closing the panel is what that tap means. So the element type is conditional,
 * and the open row also says the word "Open" — furniture, and worth it: the panel is opaque and
 * full-screen, so the runner cannot see the conversation a highlight would be pointing at.
 */
type RowMode = 'idle' | 'menu' | 'rename' | 'remove'

export function SessionRow({
  session,
  active,
  activeSessionId,
  onClose,
}: {
  session: SidebarSession
  active: boolean
  /* Reconciled: phase 3's `removeNinaChatSession` takes `{ sessionId, activeSessionId }` and
   * returns `next`, so the destination after a removal is decided once, on the server, from ids it
   * has proved ownership of. This row reports which session its URL is showing; it does not decide
   * where to go. */
  activeSessionId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = React.useState<RowMode>('idle')
  const [draft, setDraft] = React.useState(session.title)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /**
   * Every panel's submit, so the pending flag, the error line and the mode reset cannot get out of
   * step — `FolderMenu`'s `run()`, same reason. A refusal leaves the panel OPEN with the server's
   * sentence in it: closing it would throw away the only explanation the runner is going to get.
   */
  function run(
    action: () => Promise<NinaSessionActionResult>,
    onOk: (result: NinaSessionActionResult) => void,
  ) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        /* RECONCILED: phase 3's `NinaSessionActionResult` is `{ ok, next }` — it carries NO
         * `error` sentence. `ok: false` is the whole refusal, so the sentence is this row's, in one
         * place, in his language. Phase 4 still owns the RULE that produces the refusal
         * (`sanitizeNinaSessionTitle` — empty, invisible-only, or over the cap); what changed is
         * that the row supplies the words rather than rendering the server's. */
        setError('Tidak bisa. Coba nama lain.')
        return
      }
      onOk(outcome)
    })
  }

  function open(next: RowMode) {
    setError(null)
    setMode(next)
    // A rename starts from the name it has: fixing a typo in one character should be a keystroke
    // and not a retype. `FolderMenu` prefills for the same reason.
    if (next === 'rename') setDraft(session.title)
  }

  const pin = () =>
    run(
      () => setNinaChatSessionPinned({ sessionId: session.id, pinned: !session.pinned }),
      () => {
        setMode('idle')
        // The list reorders on the SERVER (R4 pinned-first, R5 within it), so a refresh is the
        // whole update. Re-sorting the rows here would be the second opinion this phase promised
        // not to write.
        router.refresh()
      },
    )

  const rename = () =>
    run(
      () => renameNinaChatSession({ sessionId: session.id, title: draft }),
      () => {
        setMode('idle')
        router.refresh()
      },
    )

  const remove = () =>
    run(
      () => removeNinaChatSession({ sessionId: session.id, activeSessionId }),
      (result) => {
        /* RECONCILED: the DESTINATION is phase 3's answer, not this component's. Phase 3's action
         * returns `next` — `'/nina'` to navigate, `null` to stay — so `planSessionRemoval` maps
         * that answer onto the two things the screen can do instead of recomputing "was this the
         * active one" a second time on the client. One decision, one owner, and the pure rule
         * (and its suite) survive unchanged in shape. */
        const plan = planSessionRemoval({ next: result.next })
        if (plan.kind === 'navigate') {
          /*
           * `replace`, never `push`. The entry being replaced is the panel's own pushed entry and
           * the one under it is `?s=<the id just deleted>`; pushing would leave a back gesture that
           * lands on a dead session. It also drops `?sidebar=1`, so the panel closes and the runner
           * sees where he landed — which after deleting the conversation he was reading is the
           * reassuring outcome, not a surprise.
           *
           * The href is the BARE `/nina`: which chat opens when none is named is phase 3's rule,
           * and asking it is also, for free, the answer to "he removed his last one".
           */
          router.replace(plan.href)
          return
        }
        setMode('idle')
        router.refresh()
      },
    )

  const label = (
    <>
      <span className="block truncate text-[15px] leading-[1.35] font-semibold">
        {session.title}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
        {session.pinned && <PinIcon />}
        {session.dayLabel !== null && <span>{session.dayLabel}</span>}
        {active && <span className="font-semibold text-ink-2">Open</span>}
      </span>
    </>
  )

  return (
    <div
      className={cn(
        'rounded-card px-3 py-2',
        // `Card.tsx`'s one surface for the open chat; bare paper for a reference to another one.
        active ? 'bg-card shadow-card' : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        {active ? (
          <button
            type="button"
            aria-current="page"
            onClick={onClose}
            className="min-w-0 flex-1 text-left text-ink"
          >
            {label}
          </button>
        ) : (
          <Link href={session.href} className="min-w-0 flex-1 text-left text-ink">
            {label}
          </Link>
        )}

        <button
          type="button"
          aria-label={`Aksi untuk ${session.title}`}
          aria-expanded={mode !== 'idle'}
          onClick={() => (mode === 'idle' ? open('menu') : setMode('idle'))}
          className="grid size-11 shrink-0 place-items-center rounded-pill text-[17px] font-semibold text-ink-3"
        >
          {mode === 'idle' ? '⋯' : '✕'}
        </button>
      </div>

      {mode === 'menu' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="md" variant="secondary" loading={pending} onClick={pin}>
            {session.pinned ? 'Lepas pin' : 'Pin ke atas'}
          </Button>
          <Button size="md" variant="secondary" onClick={() => open('rename')}>
            Ganti nama
          </Button>
          <Button size="md" variant="destructive" onClick={() => open('remove')}>
            Hapus
          </Button>
        </div>
      )}

      {mode === 'rename' && (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault()
            rename()
          }}
        >
          <Field label="Nama chat" error={error ?? undefined}>
            <Input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              /* The cap, imported and not re-implemented — one number for the input and the
                 server's clamp. Everything else the server refuses in its own words. */
              maxLength={NINA_SESSION_TITLE_MAX_CHARS}
              autoComplete="off"
              enterKeyHint="done"
              className="font-semibold"
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="md" loading={pending}>
              Simpan
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode('menu')}
            >
              Batal
            </Button>
          </div>
        </form>
      )}

      {mode === 'remove' && (
        <div className="mt-2 rounded-card border border-red/40 bg-paper-2 p-3.5">
          <p className="max-w-[54ch] text-[13px] leading-[1.5] font-semibold text-red">
            Hapus “{session.title}”? Semua pesan di chat ini dan semua foto di dalamnya ikut
            terhapus, permanen — tidak bisa dibatalkan.
          </p>
          {active && (
            <p className="mt-2 max-w-[54ch] text-[12px] leading-[1.5] font-medium text-ink-2">
              Ini chat yang sedang kamu baca. Setelah dihapus kamu akan dibawa ke chat terbaru yang
              masih ada.
            </p>
          )}
          {error !== null && (
            <p className="mt-2 text-[12px] font-semibold text-red">{error}</p>
          )}
          {/* "Keep it" first, and the copy above has already pushed both buttons below where the
              menu's "Hapus" was — so a double-tap cannot reach the destructive one. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="md"
              variant="secondary"
              disabled={pending}
              onClick={() => setMode('menu')}
            >
              Simpan chat ini
            </Button>
            <Button size="md" variant="destructive" loading={pending} onClick={remove}>
              Hapus chat
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A thumbtack at 14px. Hand-written SVG for `TabBar`'s reason — "four glyphs is not worth a
 * package, and an icon font would be a second webfont on a page whose first is already Poppins".
 * `aria-hidden`, because the row's pin STATE is decoration next to a title that already reads; the
 * pin ACTION carries its own accessible name in the menu.
 */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M7.5 9.5a4.5 4.5 0 1 1 9 0c0 1.7-1 3-2 3.6-.6.4-1 1-1 1.7v.2h-3v-.2c0-.7-.4-1.3-1-1.7-1-.6-2-1.9-2-3.6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 15v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
```

**Impact:** Three Server Actions gain their only call sites. `router.refresh()` re-renders
`app/nina/page.tsx`, so the reordered list comes from `listNinaSessions` and no client code sorts
anything. The `<li key={session.id}>` in `SessionList` means a reorder moves the DOM node rather
than rebuilding it, so an open panel on a row that just got pinned survives its own reorder.

**Copy note for the reconciler:** the user-facing strings above are Indonesian, matching this
screen's existing voice (`aria-label="Buka detail Nina"` in the header being replaced, and
`/nina`'s conversation language). If phase 3's and phase 6's new copy is English, align all three at
reconciliation — one language per surface, decided once.

---

### Step 6: `components/nina/ChatChrome.tsx` — place the `>` control

**File:** `components/nina/ChatChrome.tsx` (phase 2's file, created by phase 2; **two lines added,
nothing edited**)
**Change:** Import the trigger and render it at the left of the floating layer that already holds
`^`/`v`.

**This is deliberately not a whole-file code block.** Phase 2 owns this file and wrote it after this
plan; replacing it with a reconstruction would reverse-apply phase 2's commit — the failure mode the
plan index's "Waves" section describes from `admin-album-file-manager`. The two additions are:

```tsx
import { NinaSidebarTrigger } from './NinaSidebar'
```

and, inside the element that positions phase 2's floating controls:

```tsx
        {/*
          R6's `>`: the sidebar's door, at the bottom-left corner. It lives HERE and not in
          `NinaSidebar` because the floating layer's `bottom` is computed from
          `TAB_BAR_HEIGHT_PX`, `TAB_BAR_FAB_OVERHANG_PX`, the composer's own height and
          `--safe-bottom` — the numbers `AppShell` says out loud are "spelled twice by necessity".
          A third spelling in another file is how a control ends up over the composer on one device
          and under the keyboard on another. Phase 5 owns the button; phase 2 owns where it sits.

          It needs NO props: its state is `?sidebar=1` in the URL, so it shares nothing with the
          panel and `ChatScreen` never learns a sidebar exists. Outside a `NinaSidebarProvider` it
          renders null, so a `ChatChrome` on a screen with no sidebar simply has no `>`.
        */}
        <NinaSidebarTrigger className="absolute left-0" />
```

Two notes for whoever applies this:

- **`absolute left-0` assumes phase 2's floating controls sit in a `relative` row centred over the
  composer.** If phase 2 built them as individually `fixed` elements instead, the trigger takes the
  same `fixed bottom-…` expression phase 2 computed for `^`/`v`, with `left-5` in place of the
  horizontal centring — `left-5` because `AppShell`'s column has 20px gutters (`p-5`) and R6 says
  "bottom left corner", which means the corner of the reading column, not of the glass.
- **If phase 2 left a named slot prop for this** (its plan says it "left you a seam for `>`"), pass
  `<NinaSidebarTrigger />` into that slot and drop the wrapper. The trigger carries no positioning
  of its own precisely so that either shape works.

**Impact:** `/nina` grows one floating control. Phase 2's state machine, its 5 s auto-hide and its
`^`/`v` toggle are untouched: the trigger is a plain button that writes the URL. While the panel is
open it is covered by the panel's `z-50` (the chrome layer is at most `z-40`, matching `Composer`),
so phase 2's auto-hide timer ticking behind an opaque overlay is invisible and harmless.

---

## Verification

**Build:** `npm run lint && npm run format:check && npm run typecheck && npm run build`

**Tests:**
```
npm test
npm run ci:f08-guard
npm run ci:llm-payload-guard
npm run ci:data-layer-guard
npm run ci:client-secret-guard
```
- `npm test` must include `lib/nina/sidebar.test.ts` (~20 cases) and
  `tests/motion.reducedMotion.test.ts` must still pass — it will, because this phase adds no
  keyframe and no `[animation:…]` call site.
- `ci:f08-guard` matters more than it looks: its third rule fails on an interpolated value followed
  by a unit, or on any `Intl.NumberFormat` outside `lib/format.ts`. Nothing in this phase formats a
  number — the day label comes from `formatDayCompact` — and that is the property the guard checks.
- `ci:llm-payload-guard` passes unchanged: this phase adds no model call and does not edit the
  guard script (phase 4 is its only author).

**Manual check, on a phone or a phone-sized viewport:**
1. `/nina` shows **no header row and no tab bar** — the newest bubble and the composer, nothing
   else (R7 plus phase 2's R1).
2. Tap the `>` at the bottom-left: the panel slides in from the left and covers the screen. Her
   circle is at the top; tapping it opens `/nina/about`; the back gesture returns with the panel
   still open.
3. The list is pinned-first, then most recent runner message first. The chat you came from is on a
   white card, says "Open", and tapping it closes the panel instead of navigating.
4. `⋯` → "Pin ke atas": the row jumps to the top and the glyph appears in its meta line. `⋯` again
   → "Lepas pin": it falls back into date order.
5. `⋯` → "Ganti nama": type into the field on a real iPhone. **The keyboard must not close between
   keystrokes** — that is the `Sheet` regression this phase's `[open]`-only effect exists to avoid.
   Save; the row's title changes and the panel closes.
6. `⋯` → "Hapus" on a chat you are *not* reading: the confirm copy names it; "Simpan chat ini"
   backs out; "Hapus chat" removes the row and leaves the panel open on the rest of the list.
7. `⋯` → "Hapus" on the chat you *are* reading: the extra line appears, and confirming lands on a
   real conversation with the panel closed. Then back-swipe: it must **not** return to the deleted
   session's URL.
8. Remove every chat: the panel shows the dashed empty state and `/nina` still renders.
9. The back gesture closes the panel from any state, and closing it twice in a row does not
   accumulate history entries — after open/close/open/close, one back press leaves `/nina`.
10. With "Reduce Motion" on in iOS Accessibility settings, the panel appears and disappears with no
    slide, and nothing else on the screen changes.
11. With a keyboard: `Tab` from the chat reaches the trigger; opening moves focus into the panel;
    `Escape` closes it and focus returns to the trigger. With the panel closed, `Tab` never lands
    on anything inside it (that is `inert`).

**Exit criteria:**
- `/nina` renders no header row and no tab bar.
- The `>` control slides a full-screen panel in from the left; it closes with the platform back
  gesture, with `Escape`, and with its own `✕`, and it never leaves a dead history entry.
- The panel lists every session pinned-first then most-recent-runner-message-first, with no sort in
  any component.
- Nina's circle inside the panel still links to `/nina/about` and still comes from
  `getCurrentNinaAvatar` through `ninaAvatarView`.
- Pin, rename and remove each work; the list reorders after each; removing the open session lands on
  a real conversation and removing the last one leaves the screen working.
- Focus cannot be tabbed into the closed panel, and the rename field keeps the iOS keyboard for the
  whole word.
- `lib/nina/sidebar.test.ts` asserts the ordering is preserved and that the removal href — the one
  phase 3's action returns as `next` — is the bare `/nina`.

---

## Handoffs

1. **R2's create-a-chat control → phase 3.** `NinaSidebar`'s `newChatSlot` is the named, documented
   seam. R2 is not in this phase's `satisfies` list, so this phase designs no create control; if
   phase 3's control was in the header row this phase deletes, Step 4 *moves* it into the slot
   rather than removing it. Until something fills the slot the panel lists chats and cannot start
   one — which is correct for phase 5 in isolation and must not survive the set.
2. **R6's search field and semantic toggle → phase 6.** `NinaSidebar`'s `searchSlot`, directly under
   her circle and above the list, which is where R6 puts them. Phase 6 also owns `lib/nina/search.ts`
   and the toggle's persistence key; nothing about the search is sketched here. Phase 6 will edit
   `NinaSidebar.tsx` after this phase — it should add a prop pass-through and nothing else.
   **Reconciled, on how phase 6 fills the slot:** `searchSlot` is a prop defaulting to `null`, and
   phase 6 does **not** edit `app/nina/page.tsx` (phases 3, 5 and 8 own it). So phase 6 renders
   `<NinaSearchField onNavigate={…} />` *at the slot inside `NinaSidebar.tsx`* — one import, one
   element, exactly as its Files table says — and takes the close callback its required `onNavigate`
   prop needs from `useNinaSidebar()`, which this phase exports for precisely that kind of consumer.
   The prop stays for any future caller; the default stops being `null`.
3. **A message count in R11's confirmation copy → ✅ AVAILABLE, phase 1 already wrote the query.**
   The panel is measurably safer reading "42 messages and 3 photos go with it" instead of "every
   message and every photo". **Reconciled:** phase 1's contract already exports
   `countNinaSessionMessages(userId, sessionId)`, added expressly *"phase 5's confirmation dialog
   needs it"*, and its handoff repeats that. It is a per-session count, so it belongs on the
   confirm panel opening rather than on every list row — one call from `SessionRow`'s
   `open('confirm')` transition, or a server-side count folded into `sidebarSessions` if the row
   should show it without a round trip. Either is inside this phase; nothing is owed by phase 1. A
   photo count is still not available and is still a follow-up card.
4. **`NINA_SESSION_TITLE_MAX_CHARS` must be client-safe. ✅ RESOLVED IN RECONCILIATION.** It is
   declared once, at 60, in phase 1's pure `lib/nina/sessions.ts` — the module this contract asked
   for — and phases 3 and 4 both import it rather than declaring rivals. `sessions.ts` imports
   nothing at all, so there is no `server-only` reachability question to answer. Phase 4 separately
   split its model call out into `lib/nina/autotitle.ts`, so `lib/nina/title.ts` is client-safe too.
   **Keep `maxLength`; the fallback is withdrawn.** See contract item 3 and the index's
   Reconciliation Log.
5. **The unread dot and the sidebar → phase 8.** Phase 8 decides whether *opening the sidebar*
   counts as opening the chat. This phase deliberately does not touch
   `after(() => markNinaMessagesRead(userId))` and does not mark anything read; the panel is a list
   of conversations, not a reading of one. Phase 8 also edits `app/nina/page.tsx` after this phase,
   so it should expect the `NinaSidebarProvider` wrapper around `<ChatScreen>` and
   `<NinaSidebar>`.
6. **A per-row unread indicator is not built.** A chat with an unread message from her is
   indistinguishable in this list from one without. It is a genuinely good idea, it is not in R6 or
   R9, and it needs an unread count per session out of phase 1's queries — so it is a card, not a
   drive-by.
7. **`components/nina/.workflows/package_readme.md` will need the three new components** and the
   moved header. Left to the set's documentation pass rather than done here.
8. **One language per surface.** This phase's copy is Indonesian, matching `/nina`'s existing
   `aria-label`s. If phases 3 and 6 wrote English strings into the same panel, align them at
   reconciliation.

---

## Rollback

This phase is one commit on `feature/nina-chat-sessions` and is UI-only — no migration, no schema,
no query. `git revert <phase 5 commit>` restores it exactly:

- the four new files (`lib/nina/sidebar.ts`, its test, and the three components) disappear with
  nothing importing them;
- `app/nina/page.tsx` gets its `<header>` back, along with the `<Link>`/`NinaAvatar` imports and
  the "WHY THE HEADER IS NOT `ScreenHeader`" docstring — which is why Step 4a *rewrites* that block
  instead of deleting it: the revert restores a coherent argument rather than a hole that
  `AppShell`'s docstring points at;
- `components/nina/ChatChrome.tsx` loses one import and one element, and phase 2's `^`/`v` and its
  5 s auto-hide are untouched by both the change and its reversal.

Nothing downstream breaks on revert *except* the two seams: phase 6's search field and, if it went
there, phase 3's create control lose their mount point. If either has already landed, revert this
phase and those together, or re-home their controls first. Phases 1, 2, 3, 4 and 7 are unaffected —
this phase adds no export they consume.
