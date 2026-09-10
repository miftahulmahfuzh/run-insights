# Package: components/nina

**Location**: `components/nina`
**Last Updated**: 2026-09-10 (task `P1-CN-A004`, `media-dedupe` phase 2 of 4: write-time content-hash dedup on the runner chat upload path — `Composer` now hashes every pick's COMPRESSED bytes with `contentHashOf` and pre-checks the new owner-scoped `findNinaDuplicateChatImage` before uploading, so a duplicate pick never PUTs, never mints a ticket and never describes, and `ComposerDraftImage` became a discriminated union (`upload` | `deduped`); `ChatScreen` splits the draft and sends `contentHashes` keyed by the STORED pathname plus `dedupedImageIds`, ordering the optimistic bubble fresh → deduped → pinned; the server race-closes at insert over the new pure module `lib/nina/dedupe.ts` — originals first, references second through the same `resolveAttachment` seam as the pinned photo, just-landed blobs released under `after()`, row first blob second, and an invalid hash writes NULL rather than failing a send, invariant 9). Previously (2026-09-10) task `P2-CN-A003`, `job-jump-flash`: the deep-link landing flash's ring on HIS bubbles took the bubble's own fill — the class literal in `MessageBubble.tsx` became `[--nina-flash-ring-color:var(--ink)]`, superseding the 09-09 white ("flicker buat user's bubble itu diganti warnanya jadi putih") after one night, because a 2px `#fff` ring drawn outside a `bg-ink` bubble onto light sky paper was invisible exactly where a `/nina/jobs` deep link always lands, on a bubble of his; her bubbles keep the keyframe's `--accent` default and the `app/globals.css` keyframes are untouched, so the change is that literal plus the three comments recording the decision (the `MessageBubble` header and flash site, `app/globals.css`'s keyframe, and `lib/nina/search.ts`'s landing prose) — the whole chain (`planJobJump` → `ButtonLink` → `ChatScreen.landOn` → `measureQuoteScroll` → `flashMessage` → `MessageBubble`) was proven live in a local prod build in both schemes, the target resting `data-flash=true` in the readable band). Previously (2026-09-09) task `P1-CN-A002` of `search-kbd-and-up-btn` (phase 2 of 2): the rail's `up` became the chat page's bar toggle — the bar's reveal state moved out of `ChatChrome` into a shared `NinaBarProvider` mounted in `AppShell` around both consumers, the panel learned `panelBottomCss`'s bar-lift term (`PANEL_BOTTOM_CSS`) so the revealed bar renders in a reachable strip below the panel, `RAIL_PAD_BOTTOM_CSS` gained the bar gate beside the overlap subtraction, and a text field in the panel's dialog now hides the bar exactly like the composer does). Previously `P1-CN-A001` of `photo-send-chat-icons` (phase 2 of 2): the keyboard channel became one component — `KeyboardOverlapPublisher`, the `visualViewport` subscription and `--nina-kb-overlap` broadcast extracted out of `ChatScreen`, mounted there and scoped to `NinaAboutScreen`'s open viewer — the `/nina/about` attach strip gained the panel's box fix (`bottom: var(--nina-kb-overlap, 0px)` + `attachStripPadBottomCss`), and the sidebar's focus reassert gained a second, box-change trigger (`planBoxReassert` over a `ResizeObserver`). Previously `P1-CN-A001` of `search-kbd-and-up-btn` (phase 1 of 2): the window pin — the keyboard reveal pans the window behind the opaque panel, so a passive `window` `scroll` listener now pins the root scroller while a panel text field holds focus and hands the reading position back on blur. Previously `P2-CN-A000` (`photo-send-chat-icons` phase 1 of 2): the strip's two icon-only sends and `attachNinaPhotoToChat`'s `target`/`sessionId`/`next` contract. First documentation of this package happened twice — an independent `/update-readme` pass on each branch, from two different code states — and this file is their merge.)

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
invariant 8: transitions only, no keyframes — the app's two keyframes (`ri-pulse`, reused by
`TypingIndicator` through `LoadingDots`, and `nina-flash-blink`, the deep-link landing's blink)
both live in `app/globals.css` and are both redefined under `prefers-reduced-motion` there, and a
third keyframe here would have to argue with that file's own conclusion.

**Key Responsibilities:**

- Run one turn of the conversation end to end: optimistic send, the action's return releasing
  `busy`, the poll that brings her bubbles, and the staggered reveal that plays them — with her
  words never fabricated by this package.
- Own the composer: text, photo tiles (compress → hash → owner-scoped pre-check → PUT + describe,
  or — when the bytes are already in the collection — attach the existing photograph with no
  upload, no ticket and no describe at all), the reply strip, the pinned run chip and the pinned
  album photo, and the four-clause "something to send" rule (whose image clause covers BOTH draft
  kinds since media-dedupe P2 — a `deduped` tile is still an image).
- Draw the conversation: day-divided list, bubbles with quote stubs and photo grids and run cards,
  two swipe gestures plus a tap, and the actions sheet — with every gate decided in `lib/`.
- Host the sidebar overlay: URL-held open state, the pinned four-icon rail whose `up` is the chat
  page's bar toggle (one shared bar state, `NinaBarProvider`), the session list with its three row
  actions, search with its persisted semantic toggle, and the keyboard-overlap channel's consumer
  half — the panel ends at the var (lifted above the bar while the bar shows), its focused fields
  are re-asserted on both the clock and the panel's box actually changing, and the window behind it
  is pinned while a field holds focus.
- Serve `/nina/about`: her album and media as two viewer lists over one shared `PhotoViewer`, the
  image-job summary, and the zoomed-photo attach strip — two icon sends (phase 1) ending at the
  keyboard's measured top edge (phase 2).
- Serve `/nina/jobs` and `/nina/jobs/[id]`: the redo/delete controls, the ticking elapsed clock, and
  the detail card whose jump arrives already decided.
- Publish the unread dot and the chrome: the tab bar's hide-on-scroll state machine — its state
  held ONCE in `NinaBarProvider` and worn by the two controls that move it — the floating control
  lane, and the one `router.refresh()` that clears a dot the runner just read to zero.
- Never render `description` — invariant 5. The only prose about a photograph is `glm-4.6v`'s
  private input to her prompt; nothing in this directory receives it, and `alt=""` is the honest
  rendering of that everywhere a Blob photo appears.

## Module map

| File | Kind | Purpose |
|---|---|---|
| `types.ts` | **types only**, no directive | `ChatMessage`, `ChatAvatar`, `ChatMessageState`, `ChatRole` — the client shape of the conversation, mapped from `lib/nina/queries`'s rows on the server so no component knows a column name. No runtime export at all. |
| `ChatScreen.tsx` | `'use client'` | The interactive half of `/nina`. One turn: optimistic send → action returns → poll → staggered reveal. Mounts `KeyboardOverlapPublisher` — the keyboard measurement it used to own inline — and keeps only the numeric mirror for `MessageList`'s bottom pad and the composer's two CSS strings; also the deep-link landings (`?jump=` mount and soft-nav), the photo viewer state, and every notice sentence the screen says. Since media-dedupe P2 its send splits the draft by `source` — tickets for `upload` tiles, ids for `deduped` ones, `contentHashes` keyed by the STORED pathname — and orders the optimistic bubble fresh uploads → deduped tiles → pinned photo, the same three-part order the server writes. |
| `KeyboardOverlapPublisher.tsx` | `'use client'` | The ONE `visualViewport` subscription in the app and the keyboard's ONE broadcast. Empty-deps `resize`/`scroll` subscription (a keystroke never re-subscribes), `keyboardOverlapPx` for the number, `--nina-kb-overlap` set on `:root` and removed — not zeroed — at rest and on unmount, and an optional `onOverlap` callback (read through a latest-ref, called inside the same `sync`) for a consumer that wants the number as a number. Paints null. A component rather than a hook because its consumers are two different ROUTES and `rg KeyboardOverlapPublisher` must answer "who measures the keyboard". |
| `MessageList.tsx` | `'use client'` | The conversation, grouped by day. The page scrolls — no `overflow-y-auto` panel — and `decideAutoScroll` is fed by a passive scroll *sample*, not an effect measurement. Honours R14's `?at=` scroll mark with a `useLayoutEffect` restore. |
| `MessageBubble.tsx` | `'use client'` | One message. Two sides, two extension slots (`quote`, `above`), two `sr-only`-until-focused openers, and three gestures decided in `lib/` (`decideReplySwipe`, `decideMessageActionSwipe`, `decideMessageActionTap`). Marked `'use client'` since phase 7 — the reply gesture forced it, and no `BubbleShell` split was needed. Also carries the landing flash: one `flash` prop — shared by the quote-tap, the search hit and `/nina/jobs`' "Buka chat-nya" deep link alike, and the jobs one always lands on a bubble of his — attaches `app/globals.css`'s `nina-flash-blink` keyframe (hard 2px-ring blinks, `data-flash=true` for the probe) and recolours the ring PER SIDE: hers keep the keyframe's `--accent` default, his take the bubble's own fill, `[--nina-flash-ring-color:var(--ink)]` — the 09-09 white lasted a night, invisible against light sky paper exactly where a jobs deep link lands, while the token flips with the scheme so the ring reads as the bubble briefly thickening in both. The count is not chosen here: `--nina-flash-count` arrives on `MessageList`'s container from `flashBlinkCount(process.env.NINA_FLASH_BLINKS)`. |
| `MessageActionsSheet.tsx` | `'use client'` | Edit / delete / resend / retry in one `Sheet`. Owns its own draft (the `Sheet.tsx` focus-loss lesson, a second time); `key={acting?.id}` upstream is what resets it. Delete is immediate — the owner removed the confirm step by instruction. |
| `Composer.tsx` | `'use client'` | The fixed bar: auto-growing textarea, photo tiles, reply strip, run chip, photo chip, send. Owns its own text — a bug fix written in advance. Takes `bottomCss`/`padBottomCss` as precomputed strings and computes no geometry. Since media-dedupe P2 the tile pipeline is compress → `contentHashOf` → `findNinaDuplicateChatImage` → `planNinaPickUpload`, with the `checking` state between `compressing` and `uploading`; a tile the pre-check matched skips PUT, ticket mint and describe entirely and turns `ready` holding the existing photograph it will attach. |
| `ChatImages.tsx` | **no directive** | The photos inside a bubble, through `MessageBubble`'s `above` slot. `onOpen` absent means the grid is not interactive — phase 6's exact markup. `kinds` parallel array names the tap target honestly (`photoSideOf`). |
| `ChatPhotoActions.tsx` | `'use client'` | Save/attach controls in `PhotoViewer`'s `actions` slot. The `<a download>` cross-origin trap answered with three strategies (`chooseSaveStrategy`: share / download / open) and the fetch started on `pointerdown` so transient activation survives. |
| `AttachmentChip.tsx` | **no directive** | The run pinned to the next message. Compiles into `Composer`'s graph — same reasoning `MessageBubble` carried before phase 7. Not a link: a tap must not throw the runner out of a draft. |
| `PhotoAttachmentChip.tsx` | **no directive** | The album photo pinned to the next message. Deliberately not `AttachmentChip` with a union prop — they can be pinned together, and one renders text the other cannot. |
| `QuoteStub.tsx` | `'use client'` | The quoted strip, above a bubble's text and above the composer's input. A real `<button>` when `onJump` is passed; inert in the composer. `bg-ink-3/20` per RULING E1. |
| `RunAttachmentCard.tsx` | `'use client'` | A run inside the bubble, and the door to it: one `<Link>` to `/r/[id]` whose `onNavigate` (not `onClick`) saves R14's scroll mark. |
| `TypingIndicator.tsx` | **no directive** | Nina, mid-thought. Reuses `LoadingDots` (the app's one loading idiom and its one keyframe); wears her exact bubble shape. The face is an optional prop here and required at every hop above — the asymmetry is deliberate. |
| `NinaSidebar.tsx` | `'use client'` | The full-screen overlay panel, plus `NinaSidebarProvider` (one boolean, one `pushedRef`, shared by the trigger and the panel) and `NinaSidebarTrigger` (a bare 44 px button that renders null outside a provider). Ends its box at `PANEL_BOTTOM_CSS` — `panelBottomCss`'s string: the keyboard's measured top edge plus, while the bar shows, the bar's clearance and the inset the bar pads itself by. Hosts the pinned four-icon rail (`>` close, `up` bar toggle, `+` create, wand) whose `up` dispatches `'toggle'` through `useNinaBar`. Re-asserts focused fields over the keyboard on TWO triggers — the `KEYBOARD_REASSERT_DELAYS_MS` schedule armed by `focusin`, and `planBoxReassert` over a `ResizeObserver` on the panel's own box — and PINS the window behind the panel while a field holds focus, all inside the `open`-keyed effect, sharing one `isKeyboardTextField` guard and one `KEYBOARD_REASSERT_SCROLL_OPTIONS` assert. |
| `NinaBarProvider.tsx` | `'use client'` | The bar state's shared home: one `NinaBarState` (`'hidden' | 'shown'`, resting `'hidden'`) + one stable-identity `dispatch`, and the state machine's ONLY component importer of `lib/nina/chrome`'s `nextBarState`. `useNinaBar()` returns null outside a provider, on the `useNinaSidebar` precedent — unreachable while `AppShell` mounts it around both consumers, and the structural test keeps it so. A provider rather than props because its two consumers are SIBLINGS (`ChatChrome` and the rail's button); the resting state publishes nothing. |
| `SessionList.tsx` | `'use client'` | Every chat in `planSessionList`'s order. Decides nothing; the empty state is reachable in exactly two real states and is built. |
| `SessionRow.tsx` | `'use client'` | One chat: the row (link, or button when it is the open one) and a `⋯` disclosure over pin / rename / remove — a `mode` union with inline panels, `FolderMenu`'s shape. Icon-only actions since `search-clear-and-sidebar-icons`: the words became `aria-label`s verbatim. |
| `NinaSearchField.tsx` | `'use client'` | Sidebar search + the semantic toggle. Measures; `lib/nina/search.ts` decides. Its hit `<Link>`s fire no close callback — the measured production race — and take no props at all, so the seam cannot be re-armed. |
| `useSemanticPref.ts` | `'use client'` | The toggle's persistence — the first `localStorage` in the codebase, via `useSyncExternalStore`, with a module-level listener set and a `storage` listener so two tabs agree. |
| `NewChatButton.tsx` | `'use client'` | The rail's `+`. A `<button>` and not a `<Link>` because the id does not exist until the action runs; `replace`, not `push`; never mints a second empty session (the action reuses the newest empty one). |
| `NinaAboutScreen.tsx` | `'use client'` | `/nina/about`. One `PhotoViewer` over two sections (album / chat), open state derived from `?photo=album.<id>` / `?photo=chat.<id>` — never mirrored into state. Since `P2-CN-A000`: the zoomed-photo attach strip's **two adjacent icon-only sends**, one flight for both. Since `P1-CN-A001`: the strip ends at `var(--nina-kb-overlap, 0px)` with `attachStripPadBottomCss` as its padding gate, fed by the publisher mounted inside the open-viewer fragment. |
| `NinaPhotoGrid.tsx` | `'use client'` | One square grid for both sections — they differ in exactly two ways (the current-photo ring; the gallery's two parties). `alt=""` on every cell; the `<button>` carries the accessible name. |
| `NinaAvatar.tsx` | **no directive** | Her face in a circle at three sizes (28 / 44 / 128 px). The only `next/image` call site among Nina's images — the committed fallback PNG is a build asset; an album Blob URL gets a plain `<img>` under `ninaCropStyle`. |
| `NinaJobList.tsx` | `'use client'` | The job list, rendered by `/nina/jobs` **and** summarised under `/nina/about`'s Media. Every prop serializable; `actions?: boolean` (not a render-prop — a Server Component caller cannot receive one) draws the per-row mutations on the console surface alone. Absence is one sentence worded by the caller. |
| `NinaJobActions.tsx` | `'use client'` | Redo, one tap, no dialog — and delete. `NOTE` is a `Record` over the whole `NinaJobRefusal` union, so a fifth refusal is a build error until it has a sentence. The accessible name names the row (`Coba lagi <title>`), not the button. |
| `NinaJobDetail.tsx` | `'use client'` | `/nina/jobs/[id]`'s card. Every prop serializable; the jump arrives already decided by `planJobJump` on the server. The prompt renders because R1 asked for it by name — it is her generated text, not the private `description`. |
| `NinaJobElapsed.tsx` | `'use client'` | The ticking clock. First render uses the server's `nowMs` on both sides (a wire-time difference is a hydration mismatch; after mount it is only a tick), with the correction riding a 0 ms timer because `react-hooks/set-state-in-effect` is an error. |
| `ChatChrome.tsx` | `'use client'` | `/nina`'s chrome: the tab bar (hidden at rest on this screen) and the floating control lane — a centred pair now, the sidebar's `>` beside the `^v` bar toggle. Owns every bar EFFECT and none of the bar STATE: it reads `bar`/`dispatch` from `useNinaBar` (its button sends `'toggle'`, its focus sync sends `'composer-engaged'` for the composer OR a panel-dialog text field, its 5 s timer sends `'autohide'`) and remains the ONE writer of `--nina-bar-visible` on `:root`. Measures the composer by id with a `ResizeObserver`; decides nothing — `lib/nina/chrome.ts` owns the state machine. |
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
  landing tint — hers `--accent`, his the bubble's own `--ink` fill) and `pollTimer` (the backoff
  wait) never share a handle, so the next person to add a cancel path cannot silently cancel the
  wrong one. Every timed step checks `alive.current`.
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

### The keyboard channel

The keyboard is one measurement and one broadcast, and since phase 2 of `photo-send-chat-icons`
they live in `KeyboardOverlapPublisher`, not in a screen. It subscribes to `visualViewport` (empty
deps — a keystroke in any consumer must never re-subscribe, the same rule the sidebar's
`open`-keyed effect enforces), turns the reading into a number with `keyboardOverlapPx` (which
filters out the URL bar and pinch-zoom, and returns 0 on Android, where the layout viewport really
does shrink — so there the var is never set and no consumer ever moves), and sets
`--nina-kb-overlap` on `:root`. The var is a custom property because the sidebar panel needs the
same number and is a SIBLING (rendered by the page beside `ChatScreen`), so no prop can cross and
`ChatChrome`'s docstring forbids a second subscription; `NINA_BAR_VISIBLE_VAR` is the precedent for
exactly that gap. The var is removed, not zeroed, at rest and on unmount, so the resting geometry
is what an absent var falls back to and nothing survives navigating off the route.

It is a component rather than a hook for two stated reasons: its consumers are two ROUTES, not two
components of one tree (`ChatScreen` on `/nina`, `NinaAboutScreen` on `/nina/about` — never mounted
together, so the one-subscription-per-screen invariant holds by construction, and never a second
concurrent subscription), and it must stay grep-visible — `rg KeyboardOverlapPublisher` answers
"who measures the keyboard", where a call inside a hook's body does not. A consumer that needs the
NUMBER as a number, and not the var, passes `onOverlap` and mirrors the value into its own state:
`ChatScreen` for `MessageList`'s bottom pad and the composer's two CSS strings, `NinaAboutScreen`
for the strip's padding gate. The callback is called synchronously inside the same `sync` that sets
the internal state, so a mirror is never a frame behind the var, and `setState` with an unchanged
number bails out, so a `scroll` event that does not move the measurement costs the consumer
nothing.

`/nina/about`'s mount is SCOPED to the open-viewer fragment, deliberately: the strip is the route's
only reader and exists only while `open != null`, so a page-level mount would run a subscription
with no consumer and publish a var nothing on the route reads. The strip then gets the sidebar
panel's box fix — `bottom: var(--nina-kb-overlap, 0px)` as an INLINE STYLE (the string is constant
and never re-renders; the var underneath is what moves), because it must beat `bottom-0` in the
cascade without depending on utility sort order — plus `attachStripPadBottomCss(kbOverlap)` as its
`paddingBottom`: the old `pb-[calc(1rem+var(--safe-bottom))]` class at rest, byte for byte, and
`'0px'` under the keyboard, on `composerPadBottomCss`'s recorded reasoning that padding by a floor
which is BEHIND the keyboard lifts the input off the keys — the "ada gap diantara chat query field
dengan bagian bawah" report, one route over. The strip needs no reassert, unlike the panel: its
field sits inside NO `overflow-y-auto` container, and Safari's focus reveal scrolls a CONTAINER —
the composer's own distinguishing fact, whose recorded outcome from exactly this shape was "the
composer never lifts". The edge snaps with the keyboard (no transition on `bottom`), deliberately:
a lagging edge would chase the keyboard's own animation and read as a glitch.

The sidebar has the keyboard's other half, and it is the half a box cannot fix: iOS Safari's focus
reveal scrolls the panel's own `overflow-y-auto` container even when the field was already visible,
and — the channel an assert cannot see at all — it pans the WINDOW behind the opaque panel, lifting
every `position: fixed` element, panel included. The answer is two corrections that both measure
nothing: the panel ASSERTS, on two triggers sharing one guard and one call, and the window is
PINNED:

- **The clock** — one delegated `focusin` listener (inside the `open`-keyed effect, so it cannot
  grow a dependency) arms `KEYBOARD_REASSERT_DELAYS_MS` against the field that took focus, each
  tick guarded by `document.activeElement !== target` so it cannot fire for a field already left.
- **The box** — a `ResizeObserver` on the panel, added inside the SAME `open`-keyed effect (no
  dependency added, so the `Sheet.tsx` trap is not re-sprung), feeds each delivery through
  `planBoxReassert`: the spec fires once on `observe()` with the size the panel already had
  (`'baseline'` — not a change), a delivery repeating the previous size is `'skip'`, and only a
  real change is `'assert'`. This is the trigger the rename-field report proved the clock needs:
  the panel's `bottom` var shrinks the box one React commit LATER than the focus reveal scrolled
  the deck (visualViewport resize → publisher state → effect → style), and if the last tick fired
  before the shrink landed, the field rides out through the container's top edge with nothing
  scheduled to bring it back for a second — by which time it is off screen. The box ARRIVING at
  its new size is the one observable signal that the shrink landed, and it is not a second
  `visualViewport` subscription; it watches an element the effect already holds. `contentRect` is
  the panel's whole box — the panel carries no padding or border of its own.
- **The window** — the conversation behind the panel scrolls the WINDOW (`MessageList` calls
  `window.scrollTo`), and the reveal's second act pans the layout viewport itself; `nearest` is
  structurally blind to that channel, because a fixed element's layout geometry is unchanged by a
  window scroll and for the root scroller it computes zero every time. So the window gets a
  corrector that measures nothing and schedules nothing: the offset is captured at focus-in
  (BEFORE the keyboard has moved anything — the pan rides the keyboard's rise, hundreds of ms
  later), a `{ passive: true }` `window` `scroll` listener pins the root scroller to 0/0 for as
  long as the armed field holds focus, and the captured reading position is handed back on
  focus-out and in the effect's cleanup. Event-driven, so there is no timing hole — each frame of
  the keyboard-rise pan fires the event and is countered within it — and self-loop-safe by
  arithmetic: the listener's own `scrollTo` fires a scroll whose handler reads 0/0 and returns.
  The pin is attached on arm and removed on disarm (a field→field move disarms, re-captures and
  re-arms), and the disarm is idempotent; the effect's cleanup calls it rather than trusting the
  blur, because whether a closed-over field's `focusout` was delivered is not observable from
  here. Each clock tick also pins — a no-op whenever the listener got there first.

Both triggers resolve to one assert: whatever holds focus RIGHT NOW, qualified by
`isKeyboardTextField` (INPUT / TEXTAREA / contenteditable, and nothing else — the panel itself
takes focus on open via `tabIndex={-1}` and its buttons take focus on tap, and neither has text a
keyboard could hide), then `scrollIntoView(KEYBOARD_REASSERT_SCROLL_OPTIONS)` —
`{ block: 'nearest', behavior: 'instant' }` as a lib constant so the second trigger cannot quietly
grow a `smooth`. `nearest` walks every scrollable ancestor and computes zero scroll on an
already-visible field, which is why over-firing is cheap and under-firing is the one failure the
rule must not do (`planBoxReassert` rounds nothing — a sub-pixel change is a change), and why the
keyboard CLOSING — the box growing back — re-asserts for free and fixes the mirrored case (field
scrolled out, keyboard folds) at no cost. The pin's guards mirror the same discipline: text fields
only, `activeElement` checked at FIRE time, every write reading first and writing only when the
numbers are wrong, and `behavior: 'instant'` throughout.

## The upload dedup (media-dedupe P2)

Since `P1-CN-A004` a photograph enters the conversation through a hash before it enters Blob.
The decision module is `lib/nina/dedupe.ts` — pure, unit-tested with no database, no DOM and no
mock, and client-safe with exactly two imports (`attach`'s provenance rule and
`lib/photos/contentHash`'s hash) because this package is one of its three readers. Its consumers
split exactly along the client/server line:

- **The composer consumes `planNinaPickUpload`.** After `compressForNina` returns, EVERY pick is
  hashed — `contentHashOf(compressed.file)`, the exact bytes a PUT would carry (invariant 4: a
  different re-encode is honestly two objects, not a dedup miss), a millisecond against a PUT
  that is a round trip and a permanent object — and then `findNinaDuplicateChatImage` asks the
  owner's collection whether an ORIGINAL with these bytes already exists (one indexed,
  owner-scoped lookup). `planNinaPickUpload` turns the two answers into one of two outcomes:
  `attach-existing` — the tile never uploads, never mints a ticket, never pays the 8–11 s
  describe, and jumps straight to `ready` holding the existing photograph it will attach — or
  `upload`, the old pipeline, hash in hand for the race-close. The tile pipeline gained one
  state for it (`checking`), and the dedup is deliberately INVISIBLE to him: a deduplicated tile
  shows the same thumbnail, joins `ready` like any other, sends like any other. The pre-check is
  a Server Action, so — like the describe half — it serializes per client across tiles; the
  compress-and-PUT half stays parallel.
- **The action consumes the rest, and no component calls it.** `normalizeClaimedContentHash`
  (a claim is format-checked, never signature-checked — the same trust class as
  `width`/`height`/`bytes`; trimmed, and uppercase hex REJECTED rather than folded, because
  `contentHashOf` emits lowercase and one spelling is what phase 4's sweep compares against),
  `partitionNinaUploadClaims`, and `ninaUploadInsertRow` are the send's STEP 1b vocabulary.
  Phase 3's generated and admin paths deliberately do NOT reuse this module (`planNinaImageWrite`
  and `planChatPhotoAddWrite` are its reconciled siblings — three modules, three jobs, do not
  merge them), so this path is the only one whose decisions a client component reads.

The degrade rule is invariant 9 at every floor, and it is why a pick can never fail BECAUSE of
dedup: an uncomputable hash is null and the tile uploads as it always did; a thrown pre-check is
caught to null (the tile uploads; the race-close at send time still holds the hash); an invalid
claim writes NULL, never a send error; a failed keeper LOOKUP degrades to fresh. The whole ladder
lands on "writes the photograph, maybe twice" — never on "a row pointing at nothing" and never on
"loses the message".

**The send carries the split.** `ComposerDraftImage` is a discriminated union now:
`{ source: 'upload', ticket, url, pathname, contentHash }` or
`{ source: 'deduped', url, imageId }` — the `url` of a `deduped` entry exists for the optimistic
bubble only; the payload is the ID, never a URL, on `resolveAttachment`'s recorded reasoning.
`ChatScreen` filters the draft by `source` and sends three fields: `imageTickets` for the uploads
only, `dedupedImageIds` for the deduped ones (capped at `NINA_MAX_CHAT_IMAGES` exactly like the
tickets), and `contentHashes` — keyed by the STORED pathname the ticket itself carries, NOT
index-aligned, because the server's STEP 0 already dedupes claims by pathname and one filter
between pairing and use would point hashes at the wrong rows. The optimistic bubble re-orders to
match the server: fresh uploads, then deduplicated tiles, then the pinned album photo — one
three-part order on both sides of the wire.

**Reference semantics — the pinned photo's seam, minus its refusal.** A deduplicated tile rides
the exact seam the pinned album photo has ridden since F37: `resolveAttachment` re-proves
ownership per id (untrusted like every other id in the payload), an ORPHAN keeper is re-parented
by R4's adopt arm rather than doubled, and a live keeper is written as a REFERENCE row — the
keeper's `blob_url`/`pathname` copied, the KEEPER's `kind` (`photoSideOf` keeps telling the truth
about whose photograph it is), provenance flattened to the ORIGINAL through
`ninaPhotoProvenance`, and the description preferring the keeper but falling back to the
just-paid-for claim's — the one place a reference takes a description the attach arm never has.
The reference row carries NO `contentHash`: the hash belongs to whoever owns the bytes, and this
path's hashes are client claims (phase 3's generated references DO carry theirs, because there
the writer measured the bytes itself — the per-path rule is "a reference row carries the hash
only when its writer held the bytes"). Where the seam parts company with the pinned photo: a
keeper that died mid-compose DROPS the tile and sends the message (warned), it does not refuse —
the pinned photo is what the send is ABOUT, a deduplicated tile is a photograph he happens to be
re-sending. And RULING B1's refusal rule gained its FIFTH disjunct: a send made entirely of
references is still a send. The composer's four-clause guard is unchanged and stays correct — a
`deduped` tile is still an image in the draft.

**The race-close (STEP 1b), row first, blob second.** The composer's pre-check ran before the
keeper row could exist, so the action asks the same question again at insert time — one indexed
`(user_id, content_hash)` lookup per DISTINCT hash (phase 1's partial index, never a scan), then
`partitionNinaUploadClaims`: a DB keeper wins over everything (EVERY claim with that hash becomes
a reference to it, the first included, because the keeper predates this send), and same-send
twins — the same file picked twice in one batch, both tiles past the pre-check because neither
row existed yet — split first-fresh, later-reference. The originals insert FIRST, in one
statement, so their ids exist; the references insert second; only then is a release REGISTERED,
and it runs under `after()`: each just-landed blob goes through `releaseBlobIfUnreferenced` (the
reference-checked delete, which would rather leave an orphan for `reap-orphaned-blobs` than
delete shared bytes), so the rows always exist before the bytes they orphaned can vanish —
invariant 3 spelled as control flow.

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
is what catches it. This suite is the wiring guard for the strip: the aria-labels verbatim, no
quoted literal surviving, both targets wired, one shared flight, and `router.push(result.next)`
with no `router.push('/nina')`.

Phase 2 of the set (`P1-CN-A001`) then changed the strip's GEOMETRY and nothing else about it: the
container swapped its `pb-[calc(1rem+var(--safe-bottom))]` class for the inline
`bottom: var(--nina-kb-overlap, 0px)` + `attachStripPadBottomCss` pair (see "The keyboard channel"
above), and the publisher was mounted inside the same `open != null` fragment. The wiring this
suite guards — labels, targets, one flight, `result.next` — is untouched, and the suite passed
over the change unedited.

## The sidebar overlay

The panel is an **overlay, not a route**, and the reasoning is worth preserving: a route would
destroy the mounted chat behind it (scroll mark, in-flight reveal and optimistic rows survive being
*covered* and none survive being unmounted) and light the Nina tab on a screen with no tab bar. The
two things a route would have bought are bought back deliberately:

- **The back gesture**: open state is `?sidebar=1`, pushed by the trigger. `NinaSidebarProvider`
  exists because the TRIGGER pushes and the PANEL closes in two different subtrees, so the
  `pushedRef` deciding `back()` vs `replaceState` must be one ref — two would replace over an entry
  the trigger pushed. `AppShell` wraps the chat shell in the provider (as a sibling of `<main>`),
  with `NinaBarProvider` OUTSIDE it on the same argument (below), which is itself the fix for a
  shipped bug: the page used to own it, `ChatChrome` rendered outside it, and the trigger drew
  nothing.
- **Focus**: `Sheet`'s three behaviours (body scroll lock, focus in on open and back out on close,
  Escape) plus `inert={!open}` for the one thing `Sheet` gets from unmounting.

Two measured rules live here and are easy to regress:

- **The `Sheet.tsx` trap**: the panel's open/close effect keys on `open` ALONE and reads the latest
  close through `closeRef`, because this panel contains the rename field — an unstable `onClose`
  dependency reaching a focused input is the exact bug that cost "one digit per keyboard" on the
  review screen. **Do not add a dependency to that array.** The reassert's box observer and the
  window pin live INSIDE that same effect for this reason — the `ResizeObserver` needs the panel
  element the effect already holds, and one keystroke in the rename field must still never tear
  either down.
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
overscroll-contain`) over a shrink-0 **four-icon rail** (`>` close, `up` bar toggle, `+` create,
wand to `/nina/jobs`) pinned to the panel's bottom edge, which is `PANEL_BOTTOM_CSS`: the keyboard's
measured top edge plus — while the bar shows — the bar's clearance and the safe-bottom the bar pads
itself by, so the revealed bar renders in a reachable strip BELOW the panel's opaque `z-50` fill.
The string is `panelBottomCss`'s with `TAB_BAR_OUTER_HEIGHT_PX` as the clearance, held at module
level because every input is a constant; the vars underneath it move, and `transition-transform`
being transform-only is why the edge snaps with the keyboard and with the bar. The rail's floor
`RAIL_PAD_BOTTOM_CSS` is the composer's own `padding-bottom` decomposition QUOTED, not called —
both of `composerPadBottomCss`'s gates are re-spelled in CSS (subtract the overlap var; and, since
the panel LIFTS above the bar instead of covering it, the `* (1 - var(--nina-bar-visible))`
complement too — an ungated floor would double-count the inset the bar's own `padding-bottom`
carries), and the comment in the file is the pin: change the floor or its gates in
`composerPadBottomCss`, change them here. The rail replaced two full-width rows and stays reachable
with the keyboard up, which they never were. The scroll deck carries no ref: the scroll-to-top
handle `up` used to be is gone with its repurposing into the bar toggle, so nothing scrolls the
deck programmatically any more — the focus assertion in the `open`-keyed effect addresses the
focused ELEMENT, whose `scrollIntoView` walks every scrollable ancestor.

### The bar: one state, two buttons, one var writer

The bar's reveal state is held ONCE, in `NinaBarProvider`, and worn by the two controls that move
it — the chat page's `^v` toggle and the rail's `up` — so they can never disagree. The provider
exists because the panel is `ChatChrome`'s SIBLING: `AppShell` renders `<main>` (the panel rides in
through the page) and the chrome side by side, so no prop chain reaches from one to the other, and
two local states would be two bars. Same shape of problem as `NinaSidebarProvider`'s `pushedRef`,
same answer, one nesting: `NinaBarProvider` wraps `NinaSidebarProvider`, which still encloses
`{shell}` directly — the shape `tests/nina.sidebarProvider.test.ts`'s second describe pins.

The decision half stays in `lib/nina/chrome.ts` (`NinaBarState`, `NinaChromeEvent`, `nextBarState`,
`autoHideDelayMs`, `isControlVisible`, `barToggleGlyph`) — pure, unit-tested, reachable from a
node-environment suite — and `NinaBarProvider.tsx` is that machine's only component importer.
Consumers name events, not methods: `dispatch('toggle' | 'autohide' | 'composer-engaged' |
'composer-released')`, so every call site reads as the machine's own rule and there is no second way
to say "be hidden". `'toggle'` has exactly two senders, both buttons. `dispatch` has stable identity
(`useCallback` with empty deps), so consumers may name it in their own effect dependency arrays
without re-subscribing. `useNinaBar()` returns null outside a provider, on the `useNinaSidebar`
precedent — a consumer mounted outside its provider degrades instead of crashing; unreachable while
`AppShell` mounts it around both consumers, and the structural test is what keeps it so. The
resting state is `'hidden'` — `/nina`'s and every screen's: the provider is mounted only on the
chat screen, and nothing publishes `NINA_BAR_VISIBLE_VAR` until `ChatChrome`'s own effect sees
`'shown'`.

`ChatChrome` owns every EFFECT, none of which changed in kind when the state moved out of it:

- **the focus sync** — a `document`-level `focusin`/`focusout` pair that dispatches
  `'composer-engaged'` when a keyboard-raising field holds focus. The composer's textarea is one
  surface; the sidebar panel's text fields are the second: any `INPUT` / `TEXTAREA` / contenteditable
  inside the panel's `[role="dialog"]` engages the same rule, because `chrome.ts`'s rule is about
  KEYBOARDS, not about the composer — a bar shown under a keyboard is shown and invisible, and the
  panel's search and rename fields raise the same keyboard. `focusout` is read one task later
  (`setTimeout(0)`, held in a ref so it cannot fire after unmount), which is what keeps a
  textarea→Send — and now a search→rename — move from blinking the bar.
- **the auto-hide timer** — `autoHideDelayMs(bar, keyboardEngaged)`: 5 s, restarted by a toggle
  through the effect cleanup, paused while a keyboard is up anywhere (a panel field just hid the
  bar anyway).
- **the `NINA_BAR_VISIBLE_VAR` publisher** — set only while the state is `'shown'`, removed on hide
  and on unmount. Still `ChatChrome`, still one effect, still the var's ONLY writer. `NinaSidebar`
  reads it (`PANEL_BOTTOM_CSS`'s lift, `RAIL_PAD_BOTTOM_CSS`'s gate) and never writes it.

The geometry half is `lib/nina/chatview.ts`'s `panelBottomCss`: the keyboard term the panel already
carried, plus a bar term — `(${clearance}px + var(--safe-bottom)) * var(--nina-bar-visible, 0)` —
with the inset INSIDE the multiplication, so the hidden geometry stays byte-equal to the pre-bar
string (an inset added OUTSIDE the gate would lift the panel one inset above the keyboard's edge
with the bar HIDDEN — the unpainted-strip defect `composerBottomCss`'s docstring records at length,
one surface over). The two terms can sum for a frame (rail tap, then a field tapped; the keyboard
rule hides the bar a commit later), which is the honest arithmetic for two independent `:root`
channels. The clearance is `TAB_BAR_OUTER_HEIGHT_PX` passed as an argument — `lib/` never imports
`components/` — and the pure arithmetic is unit-tested in `lib/nina/chatview.test.ts`.

One predicate over DOM types lives in `ChatChrome` rather than in `lib/` (`isTextFocusInDialog`):
that file's signatures carry no DOM types. Its field half is spelled twice on purpose — the panel's
own `focusin` filter (in the `[open]` effect) filters its assert listener, this one filters the
bar's engage rule; different questions about the same DOM. The dialog half is `[role="dialog"]`:
the panel is the only dialog mounted on `/nina` that contains text fields, so `closest` reads
membership without `ChatChrome` holding a ref into another component's DOM.

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
| `KeyboardOverlapPublisher` | `KeyboardOverlapPublisher.tsx` | `{ onOverlap?: (overlapPx: number) => void }` — the callback is optional because the `:root` var needs no consumer; renders null. Mount it; never subscribe to `visualViewport` yourself. |
| `NinaBarProvider`, `useNinaBar` | `NinaBarProvider.tsx` | `{ children }`. `useNinaBar()` returns `{ bar: NinaBarState, dispatch: (event: NinaChromeEvent) => void } | null` — null outside a provider, on the `useNinaSidebar` precedent. `dispatch` has stable identity; `nextBarState` decides, the provider only forwards. |
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
| `Composer`, `ComposerDraftImage` | `Composer.tsx` | `onSend` must be referentially stable; `bottomCss`/`padBottomCss` are a PAIR and neither is optional. `ComposerDraftImage` is a discriminated union since media-dedupe P2 — `upload` (ticket, url, stored pathname, contentHash) or `deduped` (url, imageId); a `deduped` entry's `url` is for the optimistic bubble, the payload is the id. |
| `AttachmentChip`, `PhotoAttachmentChip`, `QuoteStub`, `RunAttachmentCard`, `TypingIndicator` | their files | Leaf renderers; `QuoteStub`'s `mine` is whose bubble it sits INSIDE, not whose message is quoted. |
| `readAnchorRows`, `useChatScrollMark` | `useChatScroll.ts` | The scroll mark's DOM half; `RunAttachmentCard` and `ChatScreen` are its consumers. |
| `ChatMessage`, `ChatAvatar`, `ChatMessageState`, `ChatRole` | `types.ts` | Types only — the serialization boundary between `app/nina/page.tsx` and this package. |

## Dependencies

### External

- `react` — the whole surface: `useState`/`useRef`/`useEffect`/`useLayoutEffect`/`useMemo`/
  `useCallback`/`useTransition`, `createContext` (`NinaBarProvider` and `NinaSidebarProvider`),
  `useSyncExternalStore` (`useSemanticPref`), and `Suspense` (`NinaUnreadBadgeSlot`).
- `next/link`, `next/navigation` — `<Link>` for every navigation that is one; `useRouter` for
  `refresh`/`push`/`replace`; `useSearchParams` for the URL-derived states.
- `next/image` — `NinaAvatar`'s committed-fallback branch only.
- `@vercel/blob/client` — `Composer`'s `upload()` against `/api/upload` (the compress-and-PUT half
  really is parallel across tiles; the describe half serializes because Server Actions dispatch one
  at a time per client).

### Internal

- `@/lib/nina/actions` — `sendNinaMessage`, `pollNinaReply`, `resendNinaMessage`, `describeNinaImage`,
  `findNinaDuplicateChatImage` (the pick pre-check, media-dedupe P2), plus `SentBubble` /
  `NinaResendRefusal` types. The only path to the model on any of these screens.
- `@/lib/nina/dedupe` — `planNinaPickUpload`, the composer's whole per-tile dedup decision as a
  value (media-dedupe P2). The module's other exports — `normalizeClaimedContentHash`,
  `ninaUploadInsertRow`, `partitionNinaUploadClaims` — are the ACTION's STEP 1b vocabulary; no
  component imports them, and the module stays pure and client-safe with exactly two imports
  (`attach`, `photos/contentHash`) because this package is one of its three readers.
- `@/lib/nina/albumActions` — `attachNinaPhotoToChat`, `NinaAttachTarget` (the strip's two sends).
- `@/lib/nina/sessionActions` — `createNinaChatSession`, `renameNinaChatSession`,
  `removeNinaChatSession`, `setNinaChatSessionPinned`, `NinaSessionActionResult`.
- `@/lib/nina/messageActions`, `jobActions`, `searchActions` — the edit/delete, redo/delete, and
  search writes.
- `@/lib/nina/chatview` — `composerBottomCss`, `composerPadBottomCss`, `attachStripPadBottomCss`,
  `panelBottomCss` (the panel's keyboard-plus-bar `bottom`), `keyboardOverlapPx`, and the two
  `:root` channels `NINA_KEYBOARD_OVERLAP_VAR` and `NINA_BAR_VISIBLE_VAR`, plus the reassert's
  shared vocabulary: `KEYBOARD_REASSERT_DELAYS_MS`, `KEYBOARD_REASSERT_SCROLL_OPTIONS`,
  `isKeyboardTextField`, `planBoxReassert` (+ the `KeyboardFieldLike` / `PanelBoxSize` shapes). The
  geometry the components measure for and never compute.
- `@/lib/nina/chrome` — the tab bar state machine (`NinaBarState`, `NinaChromeEvent`, `nextBarState`
  — whose only component importer is `NinaBarProvider.tsx` — `autoHideDelayMs`, `isControlVisible`,
  `barToggleGlyph`, `controlBottomCss`) and `NINA_CHROME_CONTROL_CLASS`.
- `@/lib/nina/sidebar`, `sessions`, `active`, `search`, `edit`, `reply`, `scroll`, `reveal`,
  `turnflight`, `live`, `chatphotos`, `jobview`, `attach`, `album`, `images`, `unread`, `queries` —
  every decision listed in the Overview lives in one of these; the component imports the function,
  measures, and renders the answer.
- `@/lib/auth/requireUserId` — `getUserId` only (in `NinaUnreadBadge`; the redirecting variant would
  soft-404 from inside a loading fallback).
- `@/lib/photos/compressForNina`, `@/lib/photos/contentHash`, `@/lib/photos/save` — the pick
  pipeline, `contentHashOf` (webcrypto sha-256 over the exact compressed bytes — browser-native,
  so the composer and the server compute the one string), and the save strategies.
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
  ride along), and destructures `ninaAvatarView` the same careful way. It renders neither provider a
  second time — the structural test asserts the sidebar one's absence.
- `app/nina/about/page.tsx` — `NinaAboutScreen`, its only mount site. Three indexed reads, no model
  call, no `loading.tsx`.
- `app/nina/jobs/page.tsx` / `app/nina/jobs/[id]/page.tsx` — `NinaJobList` (with `actions`) and
  `NinaJobDetail`.
- `components/ui/AppShell.tsx` — `ChatChrome` (with the server-built `NinaUnreadBadgeSlot` node),
  `NinaBarProvider` and `NinaSidebarProvider` (both wrapping the chat shell when `screen ===
  'chat'`; the bar provider sits OUTSIDE so the sidebar one still encloses `{shell}` directly).
  Rendering client providers from here is a boundary, not a conversion: the file has no `'use
  client'` and must not gain one (five server pages import it; `tests/share.bundle.test.ts` exists
  because that import graph leaked a session read once already).

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
- `tests/nina.sidebarProvider.test.ts` — `AppShell`, `NinaSidebar`, `NinaBarProvider`, `ChatChrome`,
  `NinaSearchField`. Two describes, one method: the sidebar provider wraps `{shell}` rather than
  sitting inside it (`<NinaSidebarProvider>{shell}</NinaSidebarProvider>`), the page renders no
  second provider, the trigger still returns null outside a provider, and a search hit leaves the
  panel by navigation alone; and — since the bar provider — `NinaBarProvider.tsx` exists with its
  nullable hook, `AppShell` mounts it OUTSIDE the sidebar provider around the same `{shell}` node,
  and both consumers read the state through `useNinaBar()`. Provider misplacement is invisible to
  every other gate: a consumer outside its provider takes the null branch and the control silently
  does nothing, all unit tests green.
- `tests/tabbar.geometry.test.ts` — `ChatChrome`, `ChatScreen` (the clearance constants agree).

For the same reason the docstrings in those files are written never to *spell* the strings the
guards assert: a text guard cannot tell an explanation from a reintroduction.

The keyboard's decision rules are tested in `lib/` instead — `lib/nina/chatview.test.ts` holds
`isKeyboardTextField`'s truth table, `planBoxReassert`'s three verdicts (including the
sub-pixel-change-is-a-change case), the shared scroll options, `attachStripPadBottomCss`'s
resting/keyboard/degenerate answers, and `panelBottomCss`'s bar-lift arithmetic. No suite reads
`KeyboardOverlapPublisher` as text; its one-subscription invariant is carried by its own docstring
and `ChatChrome`'s, and by the mount being the only thing the two routes do. `NinaBarProvider`, by
contrast, IS read as text — provider misplacement is the failure no rendered test could see, so its
existence, its nullable hook and its mount shape are pinned structurally.

The dedup follows the same shape one layer over: `tests/nina.dedupe.test.ts` asserts
`lib/nina/dedupe`'s decisions pure (no database, no DOM, no mock) and
`tests/nina.chatDedupe.test.ts` drives the real `sendNinaMessage` with only the edges mocked
(`requireUserId`; `next/server`'s `after` captured so the row-before-blob order is provable; the
`queries` module spread over its real export list; `blobRelease`) — neither imports nor
text-reads anything here, and the composer's half of the decision is asserted through
`planNinaPickUpload`, not through a render.

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
- **One `visualViewport` subscription** — `KeyboardOverlapPublisher`'s, mounted once on `/nina` and
  once (scoped to the open viewer) on `/nina/about`, two routes that are never mounted together.
  **One schedule at a time** in the sidebar's focus reassert, cancelled and re-armed per focus;
  **one `ResizeObserver`** on the panel per open — disconnected on cleanup and verdict-gated by
  `planBoxReassert` so a delivery that moved nothing asserts nothing; and **one window pin at a
  time** — its `scroll` listener is attached on arm and removed on disarm, the lifetime doubly bound
  (removal on disarm, the `activeElement` check at fire time), so it never outlives the field it
  defends.
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
  spinner; the model's own failure arrives as `mode: 'text'`), an uncomputable content hash and a
  failed duplicate pre-check (`Composer` — both degrade the tile to an ordinary upload; invariant
  9's client half is that a pick never fails BECAUSE of dedup), a failed `localStorage` write
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
  already-final sizes; the describe pre-pass overlaps the runner typing rather than the turn budget;
  and since media-dedupe P2 a duplicate pick costs one hash and one indexed lookup instead of a
  PUT, a permanent Blob object and the 8–11 s describe.
- **Poll backoff** (`ninaPollDelayFor`) with a give-up ceiling shared with the server's staleness;
  a failed poll attempt says nothing and retries rather than ending the wait early.
- **The sidebar panel stays mounted** — DOM for rows the server read anyway, in exchange for no
  double-rAF mount and no stranded reduced-motion exit.
- **The window pin is a `{ passive: true }` listener that reads-and-returns** on every scroll where
  nothing is wrong — the common case — and the bar state is plain React context: the resting screen
  publishes no var at all.

## Usage

### Mounting topology

```tsx
// components/ui/AppShell.tsx — both providers above BOTH consumers; the bar provider
// sits outside so the sidebar provider keeps enclosing {shell} directly
return screen === 'chat' ? (
  <NinaBarProvider>
    <NinaSidebarProvider>{shell}</NinaSidebarProvider>
  </NinaBarProvider>
) : (
  shell
)
```

### Mounting the screen

```tsx
// app/nina/page.tsx — after requireUserId(); ?s= already resolved owner-scoped.
<NinaSidebar avatar={avatarView} sessions={rows} activeSessionId={activeSessionId} />
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
- **Provider placement is load-bearing, and its failure is silent — for BOTH providers.**
  `NinaSidebarTrigger` and `useNinaBar` both return null outside a provider, and a null is
  indistinguishable from "no sidebar here" / "the bar is just hidden". This exact bug shipped once
  (F35: the page's provider was inside `{children}` while `ChatChrome` was a sibling of it, and 2513
  green tests did not notice). Keep both providers in `AppShell`, keep `NinaBarProvider` OUTSIDE
  `NinaSidebarProvider` so the sidebar one still encloses `{shell}` directly, and never add a second
  of either in a page — the structural test guards the shape for both.
- **`NINA_BAR_VISIBLE_VAR` has one writer.** `ChatChrome`'s publish effect sets it while the bar is
  shown and removes it otherwise; `NinaSidebar` only READS it (the panel's lift, the rail floor's
  gate). A second writer is how the panel and the bar start disagreeing about where the glass ends.
- **`RAIL_PAD_BOTTOM_CSS` quotes `composerPadBottomCss`; `PANEL_BOTTOM_CSS` is `panelBottomCss`'s
  string.** The halving and the 3.25 px are that function's and `TabBar`'s numbers, and BOTH gates
  are re-spelled in the rail's CSS — the overlap subtraction and the bar complement. Change the floor
  or its gates there, change them here. The panel's own string is held at module level precisely so
  it never re-renders.
- **Do not add a second `visualViewport` subscription.** `ChatChrome`'s docstring forbids it; the
  keyboard's one channel is `KeyboardOverlapPublisher` plus the `:root` var. Mount the publisher
  (scoped to the fragment whose reader needs it, as `/nina/about` does); never subscribe directly
  and never set `NINA_KEYBOARD_OVERLAP_VAR` by hand.
- **Do not widen the reassert's guards from the components.** `isKeyboardTextField` (a fourth tag?),
  `planBoxReassert` (a rounding step?), and the scroll options (`smooth`?) are `lib/nina/chatview`'s
  decisions with a test file waiting for each; both triggers share them so they cannot drift.
- **Do not add a dependency to `NinaSidebar`'s `open`-keyed effect.** The `Sheet.tsx` trap cost "one
  digit per keyboard"; the latest close reaches that effect through `closeRef`, and both reassert
  triggers and the window pin live inside it for the same reason.
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
  server proves ownership of; a URL is neither a ticket nor a pointer. The same rule gained a third
  spelling with media-dedupe P2: a `deduped` tile sends `imageId`, never its `url`, and the send's
  `contentHashes` is keyed by the STORED pathname the ticket carries — never index-aligned against
  the claims, and never uppercased by hand (`normalizeClaimedContentHash` rejects uppercase on
  purpose, so phase 4's sweep compares one spelling).
- **Do not sort sessions, jobs or search hits client-side.** The order is the SQL's; re-sorting is
  the second opinion the phase promised not to write.
- **Do not add a keyframe here.** Transitions only; the app's two animations — the pulse and the
  landing blink (`nina-flash-blink`) — are both keyframes in `app/globals.css`, each neutralised
  globally there. `motion-reduce:transition-none` lives at the sidebar because a transition has
  no name to redefine.
- **Do not reintroduce `bg-paper-2` as an inset surface.** RULING E1: `bg-ink-3/20`, verified against
  both schemes.
- **Do not add a URL writer to `ChatScreen`'s commit.** New parameters join the mount-time strip
  effect's by-name delete list; `?s=` and `?at=` must survive it. And history writes read
  `window.location.search`, never the `searchParams` snapshot — `ChatScreen`'s mount-time
  `replaceState` can be one write ahead of React.
- **Do not give `TypingIndicator`'s avatar a required-looking default upstream.** Optional at the
  leaf, required at every hop above: the asymmetry is how the "typing row ignores the album" bug got
  fixed and stays fixed.
- **Do not assert on a rendered component in a test.** There is no jsdom. Assert the pure rule in
  `lib/`, or read the source as text and never spell the string you are forbidding in the file you
  are reading.

## Notes

**Both plan sets are complete (2/2 each).** `photo-send-chat-icons` phase 2 (`P1-CN-A001`,
"Keyboard channel: about strip box fix + rename re-assert") created
`components/nina/KeyboardOverlapPublisher.tsx` (the one `visualViewport` subscription + the
`--nina-kb-overlap` broadcast + the optional `onOverlap` mirror), changed `ChatScreen` to render it
instead of owning the two keyboard effects, mounted it in `NinaAboutScreen`'s open-viewer fragment
so the strip's container ends at `bottom: var(--nina-kb-overlap, 0px)` with `attachStripPadBottomCss`
replacing its `pb-[…]` class — the same box fix the sidebar panel ships, for the same exposure R3
reported on the rename field — and re-triggered the sidebar's focus reassert when the panel's box
actually changes (`planBoxReassert` over a `ResizeObserver` inside the same `open`-keyed effect)
rather than only on `KEYBOARD_REASSERT_DELAYS_MS`. It also lifted the reassert's shared vocabulary —
`isKeyboardTextField`, `KEYBOARD_REASSERT_SCROLL_OPTIONS`, `planBoxReassert` — into
`lib/nina/chatview.ts` with tests in `chatview.test.ts`.
`search-kbd-and-up-btn` phase 1 (`P1-CN-A001`, the window pin) added the keyboard defence's second
channel — the window behind the opaque panel, pinned at 0/0 while a panel text field holds focus and
restored on blur and on cleanup. Its phase 2 (`P1-CN-A002`, "rail `up` toggles the main TabBar")
moved the bar state out of `ChatChrome` into `NinaBarProvider`, gave the rail's `up` the chat page
toggle's job, added `panelBottomCss`'s bar-lift term and the rail floor's bar gate, and extended the
bar's keyboard rule to the panel's dialog fields. Nothing in the strip's phase-1 surface (the two
sends, the action, the suite) changed through any of it; the suite stayed the wiring guard.

**media-dedupe is the set now running (phase 2 of 4 landed here, `P1-CN-A004`).** Phase 1
(`P1-DB-A006`) added `nina_message_images.content_hash` and `lib/photos/contentHash.ts`; phase 2
wired the runner upload path to it end to end (the section above). Phase 3 (the generated and
admin paths) deliberately does NOT import `lib/nina/dedupe.ts` — it ships its own zero-import
decision module and its own admin plan — and phase 4 backfills the column and sweeps existing
duplicates; the hash-less reference rows phase 2 writes are the expected NULLs phase 4's pass-1
fill owns, not drift.

**Known, accepted limitations**: `NinaSearchField`'s semantic pass costs a model call per debounced
query (700 ms debounce, `shouldRunSemantic` gates it); Server Actions serialize the describe
pre-pass and the dedup pre-check per tile; the unread dot is global across sessions (mark-read is
session-scoped, and A3 makes the common case clear itself); the sidebar panel keeps its rows in the
DOM while closed (`inert`, not unmounted); a repeated soft-nav `?jump=` to a byte-identical URL may
deduplicate into no re-land (the first tap landed; a nonce in the URL was rejected).

History in brief: F33 built her page, album, promises and the first attach ("Kirim ke chat");
F34 added the album-photo handoff; F35 added sessions, the sidebar, the search field and
`?jump=`; F36 split the send from the turn (poll + staggered reveal, `busy` on the action);
`search-jump-pinpoint` landed the soft-nav landing and the tap-to-pinpoint; `search-clear-and-sidebar-icons`
made the session rows' actions icon-only, added the rename field's `✕`, re-asserted focused fields
over the keyboard, and rebuilt the sidebar as a two-deck column with the pinned four-icon rail;
`photo-send-chat-icons` phase 1 (`P2-CN-A000`) made the attach strip two icon-only sends with an
explicit target and a pushed `next`, and its phase 2 (`P1-CN-A001`) extracted the keyboard channel
into `KeyboardOverlapPublisher`, gave the `/nina/about` strip the panel's box fix, and gave the
sidebar's reassert its box-change trigger; `search-kbd-and-up-btn` phase 1 (`P1-CN-A001`) pinned the
window behind the panel over a focused field, and its phase 2 (`P1-CN-A002`) made the rail's `up`
the chat page's bar toggle through the shared `NinaBarProvider`, lifted the panel above the revealed
bar, and gated the rail floor by the bar var.

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

2026-09-09 — updated following task **P1-CN-A001** (`photo-send-chat-icons` phase 2 of 2, R3:
"mengedit nama session — keyboard mendorong text field ke atas sehingga tidak terlihat di layar",
with the photo-question field fixed under the same mechanism). It created
`KeyboardOverlapPublisher.tsx` — the one `visualViewport` subscription and `--nina-kb-overlap`
broadcast, its semantics moved verbatim out of the two effects `ChatScreen` used to carry, plus the
optional `onOverlap` mirror callback — mounted it from `ChatScreen` (`onOverlap={setOverlap}`) and
from `NinaAboutScreen` inside the open-viewer fragment, gave the strip
`bottom: var(--nina-kb-overlap, 0px)` + `attachStripPadBottomCss` (the old
`pb-[calc(1rem+var(--safe-bottom))]` at rest, `'0px'` under the keyboard), and added the sidebar
reassert's second trigger: a `ResizeObserver` on the panel inside the existing `open`-keyed effect,
its deliveries decided by the new pure `planBoxReassert` / `isKeyboardTextField` /
`KEYBOARD_REASSERT_SCROLL_OPTIONS` in `lib/nina/chatview.ts` (tested in `chatview.test.ts`).

Refreshed there: the header line, two Key Responsibilities bullets, the module map (a new
`KeyboardOverlapPublisher` row; `ChatScreen`, `NinaSidebar` and `NinaAboutScreen` re-spelled), the
keyboard-channel section rewritten out of its phase-2-future tense, a closing paragraph on the
attach strip, the `Sheet.tsx` trap bullet, the export table, the `chatview` dependency bullet, a
test-consumer note, the concurrency bullet, three gotchas, and that section. Phase 1's sections
stood as written.

2026-09-09 — merged with this package's OTHER first documentation. This file was written twice,
independently, from two different code states: the passes above on the `photo-send-chat-icons`
branch, and a separate `/update-readme` pass on the `search-kbd-and-up-btn` branch (created
2026-09-09 12:45 for that set's `P1-CN-A001` window pin; updated 13:16 for `P1-CN-A002`'s shared bar
state — a tree that had the bar state and the window pin but neither the publisher nor the strip).
The merge of the two code lines left the two documents contradicting each other about the same files
(`NinaSidebar`'s rail, `ChatChrome`'s bar state, `lib/nina/chatview.ts`'s exports), so they are
reconciled here against the merged tree. The merge refreshed: the header chain (all four tasks,
newest first — note that the two sets each minted a `P1-CN-A001`, so the chain names the set for
every entry), the sidebar and chrome Key Responsibilities bullets, the module map (a new
`NinaBarProvider` row; `ChatChrome` and `NinaSidebar` re-spelled; the rail's `up` corrected from
scroll-to-top to bar toggle, and the scroll-to-top handle recorded as removed), the keyboard-channel
section (the window pin added beside the two reassert triggers), the sidebar-overlay section (the
panel's bar-lift geometry, the gated rail floor) plus a new "The bar: one state, two buttons, one
var writer" subsection, the export table (`NinaBarProvider`/`useNinaBar`), the dependency bullets
(`panelBottomCss` under `chatview`; `NINA_BAR_VISIBLE_VAR` moved from the `chrome` bullet to the
`chatview` one, where the constant actually lives; `chrome`'s bullet re-spelled around
`nextBarState`'s single importer and `barToggleGlyph`), the AppShell consumer bullet and the
`nina.sidebarProvider` test-consumer bullet (its second describe), the concurrency, performance and
gotcha additions, the `AppShell` mounting-topology snippet, and this section.

2026-09-10 — updated following task **P1-CN-A004** (`media-dedupe` phase 2 of 4, "write-time
content-hash dedup on the runner chat upload path"). `Composer` gained the hash-and-pre-check
pipeline — `contentHashOf` over the compressed bytes for EVERY pick, `findNinaDuplicateChatImage`
before any PUT, `planNinaPickUpload` deciding, the `checking` tile state, and the `Tile.existing`
escape hatch that skips ticket mint and describe on a match — and `ComposerDraftImage` became a
discriminated union (`upload` / `deduped`). `ChatScreen`'s send splits the draft into
`imageTickets` + `contentHashes` (keyed by stored pathname) + `dedupedImageIds` and re-orders the
optimistic bubble fresh → deduped → pinned. The server half — the degrade-don't-refuse tile
resolution, RULING B1's fifth refusal disjunct, and the STEP 1b partition with its race-close and
row-first-blob-second `after()` releases — lives in `lib/nina/actions.ts` over the new pure module
`lib/nina/dedupe.ts`, and is documented here because this package's composer is one of the
module's two code consumers and the optimistic order is this package's half of the contract. New
suites: `tests/nina.dedupe.test.ts` (the pure decisions) and `tests/nina.chatDedupe.test.ts` (the
action behaviour, edges mocked).

Refreshed there: the header line, two Key Responsibilities bullets, the module map (`Composer` and
`ChatScreen` re-spelled), the new "The upload dedup" section, the export table's `Composer` row,
the dependency bullets (`actions` extended, a new `dedupe` bullet, `photos/contentHash` added), a
test-consumer note, a Performance bullet, an Error Handling bullet, the upload-path gotcha, the
Notes, and this section.
