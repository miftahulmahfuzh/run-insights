# Package: components/nina

**Location**: `components/nina`
**Last Updated**: 2026-09-09 (task `P2-CN-A000`, `photo-send-chat-icons` phase 1: the `/nina/about` attach strip's "Kirim ke chat" button became two adjacent icon-only sends — `send-horizontal` for the most-recent session, `message-square-plus` for a brand-new one — with `attachNinaPhotoToChat` gaining the required `target` input and `sessionId`/`next` result fields, and the screen pushing `result.next`. First documentation of this package.)

## Overview

`components/nina` is the whole client view layer of Nina, the app's AI chat companion: the
conversation itself (`/nina`), her detail page (`/nina/about`), the image-generation queue's
runner-facing face (`/nina/jobs`), and the full-screen session sidebar that overlays the chat. It
holds no data access of its own — reads arrive as props from the Server Components in `app/nina/`,
and every write leaves through a Server Action in `lib/nina/`. The one deliberate exception is
`NinaUnreadBadge.tsx`, an async Server Component *inside* this directory, mounted by `AppShell`
behind its own `Suspense` slot; it is the answer to "a client tab bar needs a database count", not
a breach of the boundary.

The organising rule is the one every other view package in this repo carries, stated here in its
strongest form: **this package measures, `lib/nina` decides.** vitest runs
`environment: 'node'` with no jsdom, so a rule that lives in a component cannot be asserted in this
repo at all. Every decision on these screens — which session a send targets, whether the auto-scroll
follows, how far a swipe must travel, when the tab bar hides, whether a search runs the model, what
a refusal means — is a pure, unit-tested function in `lib/nina/*.ts`, and the component's whole job
is to measure the DOM, hand the numbers over, and render the sentence `lib` picked. That is why most
of this package has no test file and why that is correct rather than a gap: the suites that *do*
reference it (`tests/nina.attachTargets.test.ts`, `nina.chatPhoto.test.ts`, `nina.chatAvatar.test.ts`,
`nina.sidebarProvider.test.ts`, `tabbar.geometry.test.ts`) read its files **as text** to pin
properties no pure function can carry — wiring, absence, and accessible names — never to render one.

Two constants govern the rendering, and both are iOS rules that beat the design: **anything a thumb
hits is at least 44 px on its smaller axis** (`size-11` / `min-h-11`; the chat-page chrome pair's
32 px discs are a recorded owner exception that does not travel — the sidebar's rail raised them
back to 44 px the moment they sat 6 px from a rival), and **every text input renders at
`max(16px, 1rem)`**, because Safari zooms the viewport when anything smaller takes focus. Motion is
invariant 8: transitions only, no keyframes — the app's single keyframe (`ri-pulse`, reused by
`TypingIndicator` through `LoadingDots`) is redefined under `prefers-reduced-motion` in
`app/globals.css`, and a second decorative keyframe here would have to argue with that file's own
conclusion.

**Key Responsibilities:**

- Run one turn of the conversation end to end: optimistic send, the action's return releasing
  `busy`, the poll that brings her bubbles, and the staggered reveal that plays them — with her
  words never fabricated by this package.
- Own the composer: text, photo tiles (compress → PUT → describe → sendable ticket), the reply
  strip, the pinned run chip and the pinned album photo, and the four-clause "something to send"
  rule that mirrors the server's exactly.
- Draw the conversation: day-divided list, bubbles with quote stubs and photo grids and run cards,
  two swipe gestures plus a tap, and the actions sheet — with every gate decided in `lib/`.
- Host the sidebar overlay: URL-held open state, the pinned four-icon rail, the session list with
  its three row actions, search with its persisted semantic toggle, and the keyboard-overlap
  channel.
- Serve `/nina/about`: her album and media as two viewer lists over one shared `PhotoViewer`, the
  image-job summary, and the zoomed-photo attach strip whose two icon sends are this set's phase 1.
- Serve `/nina/jobs` and `/nina/jobs/[id]`: the redo/delete controls, the ticking elapsed clock, and
  the detail card whose jump arrives already decided.
- Publish the unread dot and the chrome: the tab bar's hide-on-scroll state machine, the floating
  control lane, and the one `router.refresh()` that clears a dot the runner just read to zero.
- Never render `description` — invariant 5. The only prose about a photograph is `glm-4.6v`'s
  private input to her prompt; nothing in this directory receives it, and `alt=""` is the honest
  rendering of that everywhere a Blob photo appears.

## Module map

| File | Kind | Purpose |
|---|---|---|
| `types.ts` | **types only**, no directive | `ChatMessage`, `ChatAvatar`, `ChatMessageState`, `ChatRole` — the client shape of the conversation, mapped from `lib/nina/queries`'s rows on the server so no component knows a column name. No runtime export at all. |
| `ChatScreen.tsx` | `'use client'` | The interactive half of `/nina`. One turn: optimistic send → action returns → poll → staggered reveal. Also owns the keyboard measurement (until phase 2 extracts it), the deep-link landings (`?jump=` mount and soft-nav), the photo viewer state, and every notice sentence the screen says. |
| `MessageList.tsx` | `'use client'` | The conversation, grouped by day. The page scrolls — no `overflow-y-auto` panel — and `decideAutoScroll` is fed by a passive scroll *sample*, not an effect measurement. Honours R14's `?at=` scroll mark with a `useLayoutEffect` restore. |
| `MessageBubble.tsx` | `'use client'` | One message. Two sides, two extension slots (`quote`, `above`), two `sr-only`-until-focused openers, and three gestures decided in `lib/` (`decideReplySwipe`, `decideMessageActionSwipe`, `decideMessageActionTap`). Marked `'use client'` since phase 7 — the reply gesture forced it, and no `BubbleShell` split was needed. |
| `MessageActionsSheet.tsx` | `'use client'` | Edit / delete / resend / retry in one `Sheet`. Owns its own draft (the `Sheet.tsx` focus-loss lesson, a second time); `key={acting?.id}` upstream is what resets it. Delete is immediate — the owner removed the confirm step by instruction. |
| `Composer.tsx` | `'use client'` | The fixed bar: auto-growing textarea, photo tiles, reply strip, run chip, photo chip, send. Owns its own text — a bug fix written in advance. Takes `bottomCss`/`padBottomCss` as precomputed strings and computes no geometry. |
| `ChatImages.tsx` | **no directive** | The photos inside a bubble, through `MessageBubble`'s `above` slot. `onOpen` absent means the grid is not interactive — phase 6's exact markup. `kinds` parallel array names the tap target honestly (`photoSideOf`). |
| `ChatPhotoActions.tsx` | `'use client'` | Save/attach controls in `PhotoViewer`'s `actions` slot. The `<a download>` cross-origin trap answered with three strategies (`chooseSaveStrategy`: share / download / open) and the fetch started on `pointerdown` so transient activation survives. |
| `AttachmentChip.tsx` | **no directive** | The run pinned to the next message. Compiles into `Composer`'s graph — same reasoning `MessageBubble` carried before phase 7. Not a link: a tap must not throw the runner out of a draft. |
| `PhotoAttachmentChip.tsx` | **no directive** | The album photo pinned to the next message. Deliberately not `AttachmentChip` with a union prop — they can be pinned together, and one renders text the other cannot. |
| `QuoteStub.tsx` | `'use client'` | The quoted strip, above a bubble's text and above the composer's input. A real `<button>` when `onJump` is passed; inert in the composer. `bg-ink-3/20` per RULING E1. |
| `RunAttachmentCard.tsx` | `'use client'` | A run inside the bubble, and the door to it: one `<Link>` to `/r/[id]` whose `onNavigate` (not `onClick`) saves R14's scroll mark. |
| `TypingIndicator.tsx` | **no directive** | Nina, mid-thought. Reuses `LoadingDots` (the app's one loading idiom and its one keyframe); wears her exact bubble shape. The face is an optional prop here and required at every hop above — the asymmetry is deliberate. |
| `NinaSidebar.tsx` | `'use client'` | The full-screen overlay panel, plus `NinaSidebarProvider` (one boolean, one `pushedRef`, shared by the trigger and the panel) and `NinaSidebarTrigger` (a bare 44 px button that renders null outside a provider). Ends its box at the keyboard's measured top edge via `--nina-kb-overlap`; hosts the pinned four-icon rail; asserts focused fields over the keyboard on `KEYBOARD_REASSERT_DELAYS_MS`. |
| `SessionList.tsx` | `'use client'` | Every chat in `planSessionList`'s order. Decides nothing; the empty state is reachable in exactly two real states and is built. |
| `SessionRow.tsx` | `'use client'` | One chat: the row (link, or button when it is the open one) and a `⋯` disclosure over pin / rename / remove — a `mode` union with inline panels, `FolderMenu`'s shape. Icon-only actions since `search-clear-and-sidebar-icons`: the words became `aria-label`s verbatim. |
| `NinaSearchField.tsx` | `'use client'` | Sidebar search + the semantic toggle. Measures; `lib/nina/search.ts` decides. Its hit `<Link>`s fire no close callback — the measured production race — and take no props at all, so the seam cannot be re-armed. |
| `useSemanticPref.ts` | `'use client'` | The toggle's persistence — the first `localStorage` in the codebase, via `useSyncExternalStore`, with a module-level listener set and a `storage` listener so two tabs agree. |
| `NewChatButton.tsx` | `'use client'` | The rail's `+`. A `<button>` and not a `<Link>` because the id does not exist until the action runs; `replace`, not `push`; never mints a second empty session (the action reuses the newest empty one). |
| `NinaAboutScreen.tsx` | `'use client'` | `/nina/about`. One `PhotoViewer` over two sections (album / chat), open state derived from `?photo=album.<id>` / `?photo=chat.<id>` — never mirrored into state. Since `P2-CN-A000`: the zoomed-photo attach strip's **two adjacent icon-only sends**, one flight for both. |
| `NinaPhotoGrid.tsx` | `'use client'` | One square grid for both sections — they differ in exactly two ways (the current-photo ring; the gallery's two parties). `alt=""` on every cell; the `<button>` carries the accessible name. |
| `NinaAvatar.tsx` | **no directive** | Her face in a circle at three sizes (28 / 44 / 128 px). The only `next/image` call site among Nina's images — the committed fallback PNG is a build asset; an album Blob URL gets a plain `<img>` under `ninaCropStyle`. |
| `NinaJobList.tsx` | `'use client'` | The job list, rendered by `/nina/jobs` **and** summarised under `/nina/about`'s Media. Every prop serializable; `actions?: boolean` (not a render-prop — a Server Component caller cannot receive one) draws the per-row mutations on the console surface alone. Absence is one sentence worded by the caller. |
| `NinaJobActions.tsx` | `'use client'` | Redo, one tap, no dialog — and delete. `NOTE` is a `Record` over the whole `NinaJobRefusal` union, so a fifth refusal is a build error until it has a sentence. The accessible name names the row (`Coba lagi <title>`), not the button. |
| `NinaJobDetail.tsx` | `'use client'` | `/nina/jobs/[id]`'s card. Every prop serializable; the jump arrives already decided by `planJobJump` on the server. The prompt renders because R1 asked for it by name — it is her generated text, not the private `description`. |
| `NinaJobElapsed.tsx` | `'use client'` | The ticking clock. First render uses the server's `nowMs` on both sides (a wire-time difference is a hydration mismatch; after mount it is only a tick), with the correction riding a 0 ms timer because `react-hooks/set-state-in-effect` is an error. |
| `ChatChrome.tsx` | `'use client'` | `/nina`'s chrome: the tab bar (hidden at rest on this screen) and the floating `>` / `^v` control lane. Measures the composer by id with a `ResizeObserver`; decides nothing — `lib/nina/chrome.ts` owns the state machine. Publishes `--nina-bar-visible` on `:root`. |
| `NinaUnreadBadge.tsx` | **async Server Component** | The unread dot, counted from `lib/nina/queries` on the partial unread index, global across sessions (mark-read is the session-scoped half). `getUserId`, not `requireUserId` — it renders inside `AppShell` where there may be no session. `NinaUnreadBadgeSlot` is its `Suspense` wrapper with `fallback={null}`. |
| `NinaUnreadSync.tsx` | `'use client'` | The dot the runner just read himself out of existence, actually going away: exactly one `router.refresh()` when `hadUnread` flips, no timer, the rule and its termination argument in `lib/nina/unread.ts`. |
| `useChatScroll.ts` | `'use client'` | R14's DOM half: read `[id^="nina-msg-"]` rows in document order, write the scroll mark by `replaceState` against `window.location.search` (never the possibly-stale hook snapshot). Zero arithmetic — `lib/nina/scroll.ts` decides. |

## The turn: how a send becomes her reply

`ChatScreen` is the package's centre of gravity, and its shape is one long argument with the obvious
implementation. The facts worth having before editing it:

- **Nothing is inside a transition.** Next 16's own guide says `useState` setters defer inside
  `startTransition`, and `useOptimistic` discards its state when the transition ends — which is the
  exact frame the first bubble is supposed to appear in. Plain `useState` and a plain async handler
  are the correct tools here, not the lazy ones. The same argument is why her bubbles arrive through
  a poll returning data and not a `router.refresh()`: a refresh would deliver the whole burst
  through `mergeServerMessages` in one frame.
- **`busy` covers the action, not the turn.** `sendNinaMessage` persists his message and returns
  before the model is reached (F36 R6), so `busy` is released on the action's return and he can send
  again while she is still answering. The server's claim on `nina_turns` is what stops that becoming
  a second concurrent model call.
- **The arrival loop is one sequential async loop, not a `setInterval`** — a tick must not fire
  while a reveal is mid-stagger, and awaiting each step makes that impossible by construction. It
  stops on the *server's* `awaiting` ("is anything of his unanswered"), not on "did I just receive
  something", because a burst chains. `NINA_TURN_POLL_GIVE_UP_MS` matches the server's
  `NINA_TURN_STALE_MS` (asserted in `lib/nina/turnflight.test.ts`) and exists for the offline phone.
- **Three timer refs, deliberately separate.** `timer` (the reveal's sleeps), `flashTimer` (the
  landing tint) and `pollTimer` (the backoff wait) never share a handle, so the next person to add a
  cancel path cannot silently cancel the wrong one. Every timed step checks `alive.current`.
- **The failure states are both honest, and neither is a fake Nina message.** A thrown or refused
  send is `'send-failed'`; a turn that produced nothing is `'no-reply'`, raised by the poll. Putting
  app-authored words in her mouth would teach the runner to distrust every other bubble.
- **A send patches the list; an edit patches the list; nothing refreshes.** A refresh literally
  cannot deliver an edit — `mergeServerMessages` is server order, LOCAL content, so the local copy
  wins. The action returns the canonical text and it is mapped onto local state. The list *does*
  adopt a changed `initial` prop, but during render (`seenInitial` + `setMessages` inline, the
  documented "adjust state when a prop changes" pattern), because `react-hooks/set-state-in-effect`
  rejects the effect form and an effect would paint the stale list for a frame.
- **URL discipline.** One mount-time `useLayoutEffect` strips `?attach=`, `?photo=` and `?jump=` by
  NAME from a `URLSearchParams` copy, so `?s=` and `?at=` survive; a fourth parameter joins that
  delete list, it never gets a new effect. There is never two URL writers in one commit — the
  soft-nav `?jump=` watcher is the one sanctioned second writer, and it runs in the navigation's own
  commit. `app/nina/page.tsx` also keys `<ChatScreen key={activeSessionId ?? 'none'}>`, so a session
  switch remounts rather than merging two conversations' local state.

### The keyboard channel (and what phase 2 does to it)

Today `ChatScreen` owns the app's only `visualViewport` subscription and broadcasts the measured
overlap as `--nina-kb-overlap` on `:root` — a custom property because the sidebar panel needs the
same number and is a SIBLING (rendered by the page beside this component), so no prop can cross and
`ChatChrome`'s docstring forbids a second subscription. The var is removed, not zeroed, at rest and
on unmount, so the resting geometry is what an absent var falls back to.

**Phase 2 (`P1-CN-A001`, pending) moves that subscription.** A new `components/nina/
KeyboardOverlapPublisher.tsx` becomes the one implementation and the one broadcast;
`ChatScreen` renders it and keeps only a numeric mirror for the composer's offset, and
`NinaAboutScreen` mounts it (scoped to the open-viewer fragment — its only reader is the strip) to
end the strip's box at `var(--nina-kb-overlap, 0px)` exactly as the sidebar panel already does.
The cross-phase invariant it upholds: exactly one publisher implementation, never two concurrent
`visualViewport` subscriptions on one screen. Do not add a second one in the meantime — `ChatChrome`
chose composer focus over `visualViewport` for its own hide logic for the same reason.

The sidebar has the keyboard's other half, and it is the half a box cannot fix: iOS Safari's focus
reveal scrolls the panel's own `overflow-y-auto` container even when the field was already visible.
The answer is to assert rather than measure — one delegated `focusin` listener (inside the
`open`-keyed effect, so it cannot grow a dependency) arms `KEYBOARD_REASSERT_DELAYS_MS` against the
field that took focus, and each tick `scrollIntoView({ block: 'nearest', behavior: 'instant' })`
corrects whichever ancestor Safari moved. Phase 2 re-triggers that schedule from the panel's box
actually changing, not only on the fixed delay list.

## The attach strip (phase 1 of `photo-send-chat-icons`, just landed)

`NinaAboutScreen`'s zoomed-photo strip used to be one full-width labelled `Button`. It is now **two
adjacent icon-only `Button`s in one row**, and the pair is one flight wide:

- **`send-horizontal`, `aria-label="Kirim ke chat"`** — the send that shipped with F33 R26, kept
  byte-identical on the server: `attachNinaPhotoToChat` still calls `sendNinaMessage` with
  `sessionId: null`, so his most-recent conversation is chosen by the action's own resolution. Only
  the caller's navigation changed.
- **`message-square-plus`, `aria-label="Kirim ke chat baru"`** — the new target: the action calls
  the sidebar rail's own `createNinaChatSession` FIRST (an eager create that reuses the newest
  *empty* session — its recorded anti-litter rule — which is the plan's reading of "always a new
  chat session": never a conversation that already has content), then names that session explicitly
  on the send. `null` would re-resolve to his most recent, which is the conversation he may have
  been trying to leave.

The contract, from `lib/nina/albumActions.ts`:

- `NinaAttachInput.target: NinaAttachTarget` (`'recent' | 'new'`) is **required** — `tsc` is the
  thing that notices a caller that forgot to decide, the required-nullable shape `sendNinaMessage`
  gives `sessionId`. Anything that is not `'new'` reads as `'recent'`.
- `NinaAttachResult` carries `ok`, `userMessageId`, `sessionId` (where the photograph actually
  LANDED — `sendNinaMessage`'s own answer, ownership re-proved; `null` iff `!ok`) and `next`
  (`'/nina?${SESSION_PARAM}=<sessionId>'`, `null` iff `!ok`).
- The screen pushes **`result.next`** and spells no URL of its own: `router.refresh()` first (so the
  pushed conversation renders the row just written), then `router.push(result.next)`. The bare
  `router.push('/nina')` is gone. The one cost of `'new'` is stated rather than discovered: a send
  that refuses after the create leaves the empty session behind — the same state one tap of the
  rail's `+` leaves, deletable from the list, and re-entered on retry because of the reuse branch.
- Presentation: `variant="secondary"` because primary is ink-on-ink against the strip's
  `bg-ink/95`; `flex-1` each, splitting the row the labelled button owned; both glyph SVGs are
  Lucide (`send-horizontal`, `message-square-plus` — lucide-static 1.42.0) fetched verbatim and
  inlined module-privately, `aria-hidden` at 18 px, per `SessionRow`'s collection note and
  `AdminNav`'s before it.
- State: the old `attaching` boolean became `sending: NinaAttachTarget | null` — **one flight, two
  controls**: `sending` names which button shows the pulsing dots, and `disabled={sending !== null}`
  on both keeps the other unreachable mid-send (the rename form's loading/disabled split, one flight
  wider). The strip sits at `z-70`, above `PhotoViewer`'s `z-60`, as a sibling overlay —
  `PhotoViewer` is shared with three review surfaces that must not grow this button, and its bottom
  row is already the dot pager.

**For a phase-2 reader: why the test suite asserts the LANDED session id.**
`tests/nina.attachTargets.test.ts` mocks both collaborators and — in the `'new'`-target test —
expects `result.sessionId` to be `LANDED_SESSION_ID`, the id its mocked `sendNinaMessage` landed in,
**not** `CREATED_SESSION_ID`, the id the mocked `createNinaChatSession` returned. That is a settled
contradiction, not a typo: the plan's own test block first wrote the create's id while its mocked
send landed elsewhere, which contradicted the plan's own Interface Contract (`sessionId` is
`sendNinaMessage`'s own answer, `null` iff `!ok`), the reconciled action code, and the suite's
fourth test. The TEST's expectation was corrected to the landed id (recorded in `todos.md` under
`P2-CN-A000` → Decided; re-pointing the shared `SENT` fixture at the create's id instead would have
broken the `'recent'`-target tests). The divergence is then load-bearing: a separate test makes the
two collaborators disagree on purpose (`OTHER_LANDED_ID`) and asserts `next` follows the landed id —
so if `next` ever started life from the create's copy instead of the send's answer, that assertion
is what catches it. When phase 2 edits `NinaAboutScreen`, this suite is the wiring guard for the
strip: the aria-labels verbatim, no quoted literal surviving, both targets wired, one shared flight,
and `router.push(result.next)` with no `router.push('/nina')`.

## The sidebar overlay

The panel is an **overlay, not a route**, and the reasoning is worth preserving: a route would
destroy the mounted chat behind it (scroll mark, in-flight reveal and optimistic rows survive being
*covered* and none survive being unmounted) and light the Nina tab on a screen with no tab bar. The
two things a route would have bought are bought back deliberately:

- **The back gesture**: open state is `?sidebar=1`, pushed by the trigger. `NinaSidebarProvider`
  exists because the TRIGGER pushes and the PANEL closes in two different subtrees, so the
  `pushedRef` deciding `back()` vs `replaceState` must be one ref — two would replace over an entry
  the trigger pushed. `AppShell` wraps the chat shell in the provider (as a sibling of `<main>`),
  which is itself the fix for a shipped bug: the page used to own it, `ChatChrome` rendered outside
  it, and the trigger drew nothing.
- **Focus**: `Sheet`'s three behaviours (body scroll lock, focus in on open and back out on close,
  Escape) plus `inert={!open}` for the one thing `Sheet` gets from unmounting.

Two measured rules live here and are easy to regress:

- **The `Sheet.tsx` trap**: the panel's open/close effect keys on `open` ALONE and reads the latest
  close through `closeRef`, because this panel contains the rename field — an unstable `onClose`
  dependency reaching a focused input is the exact bug that cost "one digit per keyboard" on the
  review screen. **Do not add a dependency to that array.**
- **No close beside a push, ever.** `NinaSearchField`'s hit `<Link>`s, the rail's wand and the
  avatar `<Link>` all navigate without calling `closeRef`: the close path pops a pushed entry, and
  firing it in the same tick as a `<Link>`'s push raced a back against a forward — measured in
  production (2026-09-08), where every search hit opened the conversation the runner was already in.
  A hit href carries no `sidebar` key, so the navigation itself closes the panel through the URL
  that opened it. `NinaSearchField` takes no props at all, so the race cannot be re-armed.

The panel is always mounted (mount-on-open needs a double `rAF` to transition FROM; exit needs
`transitionend`, which never fires under `transition-none`), slides on `transition-transform` with
the codebase's first `motion-reduce:transition-none`, and — since `search-clear-and-sidebar-icons` —
is a **two-deck column**: a scroll region (`header, search, list`, `overflow-y-auto
overscroll-contain`) over a shrink-0 **four-icon rail** (`>` close, `up` scroll-to-top, `+` create,
wand to `/nina/jobs`) pinned to the panel's bottom edge, which is the keyboard's measured top edge —
so the rail stays reachable with the keyboard up, which the two full-width rows it replaced never
were. The rail's floor mirrors the composer's own `padding-bottom` decomposition, re-spelled in CSS
because this panel has no numeric overlap — only the var.

The session rows carry the third icon-only conversion (`SessionRow`): pin / rename / remove as
glyphs whose words survive verbatim as `aria-label`s, the rename field's own `✕` that clears without
folding the keyboard (`onPointerDown` `preventDefault()`, then re-focus; the same convention as the
search field's `✕` — one idiom, two fields), and a delete that fires on the tap (`#136` removed the
confirmation panel; the guards that survive are two deliberate taps, `loading={pending}`, 44 px
targets, and no `window.confirm`). A refused removal leaves the MENU open with the sentence in it;
`NinaSessionActionResult` carries `{ ok, next }` and no prose, so the row supplies the words while
the server owns the rule.

## `/nina/about`, the jobs surfaces, and the shared idioms

`NinaAboutScreen` derives its viewer from the URL (`?photo=album.<id>` / `?photo=chat.<id>` — a dot
and not a colon because `URLSearchParams` leaves a dot unencoded), pushes on open, replaces on page,
and closes with `back()` only when this mount pushed — `usePanelParam`'s rule, and the reason a
deleted photo closes the viewer instead of crashing it. The album and the Media section are two
sections of ONE viewer list each: swiping inside the album must not wander into his chat photos.
The job summary below Media reuses `/nina/jobs`' own `NinaJobList` (bounded by `ABOUT_JOB_LIMIT`),
supplies its own `emptyText`, and its "Semua" link is navigation, not a count.

`NinaJobList`'s two-caller shape is the package's seam discipline in one component: every prop is a
string/number/boolean (it renders inside a `'use client'` screen AND a Server Component page, and a
function is not serializable across that boundary — which is also why `actions` is a boolean and not
a render-prop), the order is the SQL's, and when `actions` is absent the markup is byte-for-byte
what the read-only surface shipped. `NinaJobElapsed`'s clock is the hydration pattern in miniature:
both first renders use the server's `nowMs`, the browser's clock is consulted only from the
interval, and the wire-time correction rides a 0 ms timer because setting state directly in an
effect body is a lint error here.

Idioms shared across the package (introduce nothing new next to them):

- **`bg-ink-3/20` is THE inset surface** (RULING E1): `--ink-3` is a mid-grey in both schemes, so an
  alpha of it composites correctly over `bg-ink`, `bg-card` and `bg-paper` alike, where
  `bg-paper-2` inverts. Used by `ChatImages`, `QuoteStub`, `RunAttachmentCard`,
  `PhotoAttachmentChip`, `NinaPhotoGrid`.
- **A plain `<img>` for every Blob-hosted photo** — they are already compressed by whoever wrote the
  row, and `next/image` would re-optimise finished files on a paid transform quota. `NinaAvatar`'s
  committed-fallback branch is the one `next/image` call site.
- **`alt=""` on photographs; the accessible name on the button** — there is no honest alt text, and
  the only description that exists is invariant 5's private prose.
- **The 16 px input floor** in `Composer` and `MessageActionsSheet`; the 44 px floor on every
  control; `size-[18px]`/`size-5` glyphs at `strokeWidth 2.4` inlined module-privately (Lucide-lineage
  or house-drawn; "three glyphs is still not worth a package").
- **Icon-only means the word became the `aria-label` verbatim** — never a new sentence, never
  quoted-literal text left in the file (the attachTargets suite asserts the absence).
- **One flight per control cluster**: `loading={pending}` names the firing control, `disabled`
  guards the rest (`SessionRow`'s menu buttons, the strip's two sends, `NinaJobActions`' `aria-busy`).

## Exported API

The package has no barrel; consumers import per file. What crosses its boundary:

| Export | From | Notes |
|---|---|---|
| `ChatScreen` | `ChatScreen.tsx` | Props all REQUIRED (`initial`, `todayISO`, `userId`, `sessionId`, `pending`, `pendingPhoto`, `flight`, `avatar`) on the RULING E2b habit: one caller, and `tsc` should notice a missing prop — an optional default here turned a broken route into a chat that silently wrote into the wrong session or never polled. |
| `NinaSidebar`, `NinaSidebarProvider`, `NinaSidebarTrigger`, `useNinaSidebar`, `NinaSidebarAvatar` | `NinaSidebar.tsx` | `useNinaSidebar()` returns `null` outside a provider, on purpose — a `ChatChrome` with no sidebar draws no `>`. |
| `NinaSearchField` | `NinaSearchField.tsx` | Zero props. Its hits are `<Link>`s; the prop it used to take is gone rather than optional. |
| `useSemanticPref` | `useSemanticPref.ts` | `readonly [boolean, (next) => void]`, cross-tab via `storage`, degrade-to-tab-lifetime when the store refuses. |
| `SessionList` | `SessionList.tsx` | `{ list: SidebarList, activeSessionId, onClose }` — decides nothing. |
| `SessionRow` | `SessionRow.tsx` | `{ session, active, activeSessionId, onClose }` — the server decides where a removal lands (`planSessionRemoval`). |
| `NewChatButton` | `NewChatButton.tsx` | `{ onNavigate, className? }` — the refusal path closes the panel; success `router.replace`s the action's `next`. |
| `NinaAboutScreen` | `NinaAboutScreen.tsx` | `{ avatar, album, gallery, jobs, jobsNowMs }` — all mapped server-side; `jobs` arrives as `NinaJobListItem[]` in phase 4's own shape. |
| `NinaPhotoGrid`, `NinaGridCell` | `NinaPhotoGrid.tsx` | `{ cells, onOpen }`; `isCurrent` draws the ring (the album sets it; the gallery never does). |
| `NinaJobList` | `NinaJobList.tsx` | `{ items, nowMs, emptyText, actions?, className? }` — `actions` set by `/nina/jobs` alone. |
| `NinaJobActions`, `NinaJobDetail`, `NinaJobElapsed` | `NinaJob*.tsx` | All props serializable; the jump and the stage arrive already decided. |
| `ChatChrome` | `ChatChrome.tsx` | `{ ninaBadge?: ReactNode }` — mounted by `AppShell`, which constructs the badge slot on the server and passes the node in. |
| `NinaUnreadBadge`, `NinaUnreadBadgeSlot` | `NinaUnreadBadge.tsx` | The async Server Component and its `Suspense` slot. |
| `NinaUnreadSync` | `NinaUnreadSync.tsx` | `{ hadUnread }`; renders null. |
| `NinaAvatar`, `NINA_AVATAR_SRC` | `NinaAvatar.tsx` | `size` `'sm' | 'md' | 'xl'`; passing nothing renders phase 4's committed face exactly. |
| `ChatImages` | `ChatImages.tsx` | `{ urls, kinds?, onOpen? }` — absent `onOpen` means not interactive. |
| `ChatPhotoActions` | `ChatPhotoActions.tsx` | Rendered through `PhotoViewer`'s `actions` slot. |
| `MessageList`, `MessageBubble`, `MessageActionsSheet` | their files | Internal to the screen except for `MessageList`'s callbacks; `MessageActionsSheet` is keyed by `acting?.id` upstream. |
| `Composer`, `ComposerDraftImage` | `Composer.tsx` | `onSend` must be referentially stable; `bottomCss`/`padBottomCss` are a PAIR and neither is optional. |
| `AttachmentChip`, `PhotoAttachmentChip`, `QuoteStub`, `RunAttachmentCard`, `TypingIndicator` | their files | Leaf renderers; `QuoteStub`'s `mine` is whose bubble it sits INSIDE, not whose message is quoted. |
| `readAnchorRows`, `useChatScrollMark` | `useChatScroll.ts` | The scroll mark's DOM half; `RunAttachmentCard` and `ChatScreen` are its consumers. |
| `ChatMessage`, `ChatAvatar`, `ChatMessageState`, `ChatRole` | `types.ts` | Types only — the serialization boundary between `app/nina/page.tsx` and this package. |

## Dependencies

### External

- `react` — the whole surface: `useState`/`useRef`/`useEffect`/`useLayoutEffect`/`useMemo`/
  `useCallback`/`useTransition`, `createContext`, `useSyncExternalStore` (`useSemanticPref`), and
  `Suspense` (`NinaUnreadBadgeSlot`).
- `next/link`, `next/navigation` — `<Link>` for every navigation that is one; `useRouter` for
  `refresh`/`push`/`replace`; `useSearchParams` for the URL-derived states.
- `next/image` — `NinaAvatar`'s committed-fallback branch only.
- `@vercel/blob/client` — `Composer`'s `upload()` against `/api/upload` (the compress-and-PUT half
  really is parallel across tiles; the describe half serializes because Server Actions dispatch one
  at a time per client).

### Internal

- `@/lib/nina/actions` — `sendNinaMessage`, `pollNinaReply`, `resendNinaMessage`, `describeNinaImage`,
  plus `SentBubble` / `NinaResendRefusal` types. The only path to the model on any of these screens.
- `@/lib/nina/albumActions` — `attachNinaPhotoToChat`, `NinaAttachTarget` (the strip's two sends).
- `@/lib/nina/sessionActions` — `createNinaChatSession`, `renameNinaChatSession`,
  `removeNinaChatSession`, `setNinaChatSessionPinned`, `NinaSessionActionResult`.
- `@/lib/nina/messageActions`, `jobActions`, `searchActions` — the edit/delete, redo/delete, and
  search writes.
- `@/lib/nina/chatview` — `composerBottomCss`, `composerPadBottomCss`, `keyboardOverlapPx`,
  `NINA_KEYBOARD_OVERLAP_VAR`, `KEYBOARD_REASSERT_DELAYS_MS`. The geometry the components measure
  for and never compute.
- `@/lib/nina/chrome` — the tab bar state machine (`nextBarState`, `autoHideDelayMs`,
  `controlBottomCss`), `NINA_CHROME_CONTROL_CLASS`, `NINA_BAR_VISIBLE_VAR`.
- `@/lib/nina/sidebar`, `sessions`, `active`, `search`, `edit`, `reply`, `scroll`, `reveal`,
  `turnflight`, `live`, `chatphotos`, `jobview`, `attach`, `album`, `images`, `unread`, `queries` —
  every decision listed in the Overview lives in one of these; the component imports the function,
  measures, and renders the answer.
- `@/lib/auth/requireUserId` — `getUserId` only (in `NinaUnreadBadge`; the redirecting variant would
  soft-404 from inside a loading fallback).
- `@/lib/photos/compressForNina`, `@/lib/photos/save` — the pick pipeline and the save strategies.
- `@/lib/cn`, `@/lib/id`, `@/lib/format`, `@/lib/date/ranges` — the usual utilities; formatting
  happens on the server and arrives formatted.
- `@/components/ui` — `Button` (`loading`/`variant`/`md` carry the mis-tap and 44 px guarantees),
  `ButtonLink`, `Card`, `Field`/`Input`, `CONTROL_CLASS`, `Sheet`, `TabBar` +
  `TAB_BAR_OUTER_HEIGHT_PX`, `EmptyState`, `PhotoViewer` + `ViewerPhoto`, `LoadingDots`.

**No file in this directory imports `zod`, `server-only`, or the database client** — the one
database read (`countUnreadNinaMessages`) sits behind the async Server Component that is allowed to
make it, and every type that erases at compile time (`ChatMessage`, `RunAttachment`, `SidebarSession`,
…) is imported freely.

## Reverse Dependencies

### Primary consumers

- `app/nina/page.tsx` — `ChatScreen` (keyed on `activeSessionId`), `NinaSidebar`, `NinaUnreadSync`,
  and `ChatMessage` as a type. It resolves `?s=` owner-scoped before anything renders, maps
  `lib/nina/queries`'s rows onto `ChatMessage` field by field (never spreading — `description` cannot
  ride along), and destructures `ninaAvatarView` the same careful way.
- `app/nina/about/page.tsx` — `NinaAboutScreen`, its only mount site. Three indexed reads, no model
  call, no `loading.tsx`.
- `app/nina/jobs/page.tsx` / `app/nina/jobs/[id]/page.tsx` — `NinaJobList` (with `actions`) and
  `NinaJobDetail`.
- `components/ui/AppShell.tsx` — `ChatChrome` (with the server-built `NinaUnreadBadgeSlot` node),
  `NinaSidebarProvider` (wrapping the chat shell so the trigger and the panel share one ref).

### Test consumers

None that import anything here, and by design — `environment: 'node'` cannot render a client
component. Five suites instead read package files **as text** via `tests/support/importGraph.ts`'s
`readRepoCode`, holding properties no pure function can carry:

- `tests/nina.attachTargets.test.ts` — `NinaAboutScreen.tsx`: the strip's wiring (aria-labels, both
  targets, one shared flight, `router.push(result.next)`, no bare `/nina` push). Its action half
  mocks `sendNinaMessage` and `createNinaChatSession` and composes both send paths through the real
  `attachNinaPhotoToChat`.
- `tests/nina.chatPhoto.test.ts` — `ChatImages`, `MessageList`, `ChatScreen`, `ChatPhotoActions`,
  `NinaAboutScreen`.
- `tests/nina.chatAvatar.test.ts` — `TypingIndicator`, `MessageList`, `ChatScreen`, `types.ts` (the
  avatar prop is required at every hop above the optional leaf).
- `tests/nina.sidebarProvider.test.ts` — `NinaSidebar`, `ChatChrome`, `NinaSearchField` (the
  no-close-beside-a-push rule).
- `tests/tabbar.geometry.test.ts` — `ChatChrome`, `ChatScreen` (the clearance constants agree).

For the same reason the docstrings in those files are written never to *spell* the strings the
guards assert: a text guard cannot tell an explanation from a reintroduction.

## Concurrency

The package is cooperative-async, not threaded, and its safety comes from structure rather than
locks:

- **One sequential poll loop** (`ChatScreen`) — awaiting each step in order means a tick can never
  land inside a reveal, and there is no interval to race the reveal's `sleep`.
- **One flight per control cluster** — `busy` / `pending` / `sending` gate re-entry; Server Actions
  dispatch one at a time per client anyway, so two menus cannot land two writes concurrently.
- **Gesture guards, not flags**: `alive.current` (unmount + StrictMode), `cursorRef` (the poll's
  cursor, a ref because it is read inside the loop), `dropped` (`Composer` tiles), `requestRef`
  (`NinaSearchField` — a Server Action cannot be cancelled, so every run takes an id and a stale
  response is dropped), `pushedRef` (one per provider), `syncedForRef` (`NinaUnreadSync`, tri-state).
- **One `visualViewport` subscription** — `ChatScreen`'s today, the shared publisher from phase 2.
  **One schedule at a time** in the sidebar's focus reassert, cancelled and re-armed per focus.
- **Cross-tab** only in `useSemanticPref`: a module-level listener set plus the `storage` event, so
  `/admin/nina`'s opened tab and this one agree.
- `reactStrictMode` double-invocation is answered the same way everywhere: decide purely (in `lib/`
  or before any `set`), hand `setState` a value, and never decide inside an updater — F17 measured
  two blobs minted from one pick otherwise.

## Error Handling

There are no error classes here. Failures surface as strings a human reads, at the granularity the
human can act on, and the vocabulary is one-directional: **the server owns the refusal, this package
owns the words** (`NinaSessionActionResult` and `NinaJobActionResult` carry discriminants, not prose;
`NinaAttachResult` carries `ok`, not a sentence). The record pattern is exhaustive `Record` maps so
a new union member is a build error until it has a sentence: `NOTICE_TEXT` and `RESEND_REFUSAL_TEXT`
(`ChatScreen`), `REJECTION_TEXT` (`Composer`), `NOTE` (`NinaJobActions`).

- **Send/turn**: `'send-failed'` (throw or refusal — the row turns red and stays) vs `'no-reply'`
  (the poll's give-up or an empty turn — his message is saved, one more tap gets an answer). Neither
  is ever a fabricated bubble.
- **Refused actions keep their panel open** with the sentence in it (`SessionRow`'s `run()`,
  `MessageActionsSheet`'s `refusal`, `NinaJobActions`' `note`), because the panel is the only place
  the explanation exists; a successful action closes it.
- **The one refusal that is not a failure** gets wording that says so: `'turn-live'` (she is already
  answering), and `'edit-unavailable'` (an optimistic row has nothing to edit yet).
- **Deliberately silent**: `AbortError` from a dismissed share sheet (`ChatPhotoActions` — a person
  changing their mind must produce silence), a failed search transport (`NinaSearchField` clears the
  spinner; the model's own failure arrives as `mode: 'text'`), a failed `localStorage` write
  (degrades to tab-lifetime), and `localStorage` reads under private mode.
- Nothing throws across the action boundary without being caught into `null` first, so a network
  drop and a refusal are distinguishable states rather than an unhandled rejection.

## Performance

- **The document scrolls, not a panel** — no `dvh` container fighting the collapsing URL bar and the
  keyboard; the auto-scroll decision reads a continuously-maintained ref sample instead of measuring
  inside an effect.
- **`mergeServerMessages` returns the same array reference when nothing changed**, so a `router.refresh()`
  that brought nothing new costs no render (and `viewerPhotos` is `useMemo`'d on the one row the
  overlay shows, not on `messages`).
- **The unread count is one partial-indexed query** per render of a tabbed screen, no polling
  anywhere; the dot clears through exactly one refresh per real unread visit.
- **Photos are compressed client-side before the PUT**; every render path uses plain `<img>` at
  already-final sizes; the describe pre-pass overlaps the runner typing rather than the turn budget.
- **Poll backoff** (`ninaPollDelayFor`) with a give-up ceiling shared with the server's staleness;
  a failed poll attempt says nothing and retries rather than ending the wait early.
- **The sidebar panel stays mounted** — DOM for rows the server read anyway, in exchange for no
  double-rAF mount and no stranded reduced-motion exit.

## Usage

### Mounting the screen

```tsx
// app/nina/page.tsx — after requireUserId(); ?s= already resolved owner-scoped.
<ChatScreen
  key={activeSessionId ?? 'none'}
  initial={rows}            // ChatMessage[], oldest first, mapped on the server
  todayISO={todayInJakarta()}
  userId={userId}
  sessionId={activeSessionId}
  pending={pendingRun}      // RunAttachment | null, from ?attach=
  pendingPhoto={pendingPhoto} // NinaExistingPhoto | null, from ?photo=
  flight={ninaFlightView(rows, now)}
  avatar={avatarView}       // the SAME ninaAvatarView the sidebar gets
/>
```

### Gotchas

- **Do not render `description` anywhere in this package.** Not in a bubble, not in an `alt`, not in
  a chip. Invariant 5, and the mapping layer is field-by-field precisely so it cannot ride along.
- **Do not decide anything here that `lib/nina` could decide.** No jsdom means no test can hold it.
  The component measures; `lib` answers; a new rule belongs in a `lib/nina/*.test.ts`.
- **Do not add a second `visualViewport` subscription.** `ChatChrome`'s docstring forbids it; the
  keyboard's one channel is the `:root` var (and, after phase 2, the one publisher component).
- **Do not add a dependency to `NinaSidebar`'s `open`-keyed effect.** The `Sheet.tsx` trap cost "one
  digit per keyboard"; the latest close reaches that effect through `closeRef`.
- **Do not call a close callback beside a `<Link>` push.** A back and a forward raced on one entry in
  production and every search hit opened the wrong conversation. The href drops `?sidebar=1`; let the
  navigation close the panel.
- **Do not push a URL the server should spell.** The strip pushes `result.next`; `SessionRow` replaces
  the removal's `next`; `NewChatButton` replaces the create's `next`. A screen that spells `/nina?s=…`
  itself is a second grammar that can drift from `lib/nina/active.ts`.
- **Do not make the `'recent'` attach branch differ from what shipped.** Same `sessionId: null`, same
  resolution; unknown `target` values coalesce to `'recent'` on purpose.
- **Do not key `Composer` on anything that changes, and do not remove `MessageActionsSheet`'s key.**
  The first is the focus-loss fix; the second is how the sheet's draft resets when a different message
  is picked. They are the same rule pointed in opposite directions, and each is right where it is.
- **Do not set `enterKeyHint` on the composer textarea.** `"send"` relabelled the return key the owner
  reads as DONE and made it send; the placeholder carries the hint now, and the phone's return key
  makes a newline.
- **Do not add `text-[15px]` to an input** or drop any control below 44 px. Both floors have recorded
  reports behind them.
- **Do not write a second upload path or re-upload an existing photo.** `attachExisting` is an id the
  server proves ownership of; a URL is neither a ticket nor a pointer.
- **Do not sort sessions, jobs or search hits client-side.** The order is the SQL's; re-sorting is
  the second opinion the phase promised not to write.
- **Do not add a keyframe here.** Transitions only; the pulse is the app's one animation and it is
  neutralised globally. `motion-reduce:transition-none` lives at the sidebar because a transition has
  no name to redefine.
- **Do not reintroduce `bg-paper-2` as an inset surface.** RULING E1: `bg-ink-3/20`, verified against
  both schemes.
- **Do not add a URL writer to `ChatScreen`'s commit.** New parameters join the mount-time strip
  effect's by-name delete list; `?s=` and `?at=` must survive it.
- **Do not give `TypingIndicator`'s avatar a required-looking default upstream.** Optional at the
  leaf, required at every hop above: the asymmetry is how the "typing row ignores the album" bug got
  fixed and stays fixed.
- **Do not assert on a rendered component in a test.** There is no jsdom. Assert the pure rule in
  `lib/`, or read the source as text and never spell the string you are forbidding in the file you
  are reading.

## Notes

**Phase 2 of this plan set is pending** (`P1-CN-A001`, "Keyboard channel: about strip box fix +
rename re-assert"): it creates `components/nina/KeyboardOverlapPublisher.tsx` (the one
`visualViewport` subscription + the `--nina-kb-overlap` broadcast + an optional numeric mirror),
changes `ChatScreen.tsx` to render it instead of owning the two keyboard effects, and mounts it in
`NinaAboutScreen`'s open-viewer fragment so the strip's container ends at
`bottom: var(--nina-kb-overlap, 0px)` with a matching `paddingBottom` (`attachStripPadBottomCss`)
replacing its `pb-[…]` class — the same box fix the sidebar panel ships, for the same exposure R3
reported on the rename field. It also re-triggers the sidebar's focus reassert when the panel's box
actually changes rather than only on `KEYBOARD_REASSERT_DELAYS_MS`. Nothing in phase 1's surface
(the strip's two sends, the action, the suite) is its territory; the suite stays the wiring guard.

**Known, accepted limitations**: `NinaSearchField`'s semantic pass costs a model call per debounced
query (700 ms debounce, `shouldRunSemantic` gates it); Server Actions serialize the describe
pre-pass per tile; the unread dot is global across sessions (mark-read is session-scoped, and A3
makes the common case clear itself); the sidebar panel keeps its rows in the DOM while closed
(`inert`, not unmounted); a repeated soft-nav `?jump=` to a byte-identical URL may deduplicate into
no re-land (the first tap landed; a nonce in the URL was rejected).

History in brief: F33 built her page, album, promises and the first attach ("Kirim ke chat");
F34 added the album-photo handoff; F35 added sessions, the sidebar, the search field and
`?jump=`; F36 split the send from the turn (poll + staggered reveal, `busy` on the action);
`search-jump-pinpoint` landed the soft-nav landing and the tap-to-pinpoint; `search-clear-and-sidebar-icons`
made the session rows' actions icon-only, added the rename field's `✕`, re-asserted focused fields
over the keyboard, and rebuilt the sidebar as a two-deck column with the pinned four-icon rail;
`photo-send-chat-icons` phase 1 (`P2-CN-A000`, this documentation's trigger) made the attach strip
two icon-only sends with an explicit target and a pushed `next`.

## Documentation Created

2026-09-09 — initial creation via `/update-readme`, following task **P2-CN-A000**
(`photo-send-chat-icons` phase 1 of 2). That task replaced the `/nina/about` strip's single labelled
send with two adjacent icon-only `Button`s (`send-horizontal` → most-recent session, server behaviour
byte-identical; `message-square-plus` → always a conversation with no prior content, composed from
`createNinaChatSession` + an explicit `sessionId`), gave `attachNinaPhotoToChat` its required
`target: NinaAttachTarget` input and `sessionId`/`next` result fields, renamed the screen's
`attaching` state to `sending: NinaAttachTarget | null` (one flight, two controls), and made the
screen push `result.next`. It also settled a plan-internal contradiction in the new suite's
`'new'`-target expectation — `result.sessionId` is the id the mocked send LANDED in, not the
create's id, per the plan's own Interface Contract — which is documented above under "The attach
strip" for the phase-2 reader. The suite is `tests/nina.attachTargets.test.ts`.
