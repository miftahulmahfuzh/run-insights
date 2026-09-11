# Package: components/nina

**Location**: `components/nina`
**Last Updated**: 2026-09-12 — compacted from 1017 lines and re-verified claim-by-claim against the
tree; the 2026-09-11 changes this file predated are folded in. Per-task record under
[Recent changes](#recent-changes).

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
strongest form: **this package measures, `lib/nina` decides.** Every decision on these screens —
which session a send targets, whether the auto-scroll follows, how far a swipe must travel, when
the tab bar hides, whether a search runs the model, what a refusal means — is a pure,
unit-tested function in `lib/nina/*.ts`, and the component's whole job is to measure the DOM, hand
the numbers over, and render the sentence `lib` picked. The test layout holds the same line. The
repo's single vitest config (F01 owns it; do not write a second) runs `environment: 'node'`, and a
component suite opts into `happy-dom` per file with a `@vitest-environment` docblock — to pin
WIRING only: that a prop is passed, a control carries its label, a provider encloses the right
node. It never re-decides a rule; the rules live in `lib/nina/*.test.ts`. Every file in this
package except `types.ts` has a co-located suite (31 of them, added 2026-09-11), and the
`tests/`-side suites that read this package's files **as text** (`tests/support/importGraph.ts`'s
`readRepoCode`) still hold the properties no render can carry — provider placement, absence, and
the rule that a text guard must never spell the string it forbids.

Two constants govern the rendering, and both are iOS rules that beat the design: **anything a
thumb hits is at least 44 px on its smaller axis** (`size-11` / `min-h-11` — the chat chrome's
control lane included; an old 32 px owner exception has been raised back to the floor), and
**every text input
renders at `max(16px, 1rem)`**, because Safari zooms the viewport when anything smaller takes
focus. Motion is invariant 8: transitions only, no keyframes — the app's two keyframes (`ri-pulse`,
reused by `TypingIndicator` through `LoadingDots`, and `nina-flash-blink`, the deep-link landing's
blink) both live in `app/globals.css` and are both redefined under `prefers-reduced-motion` there.

**Key Responsibilities:**

- Run one turn of the conversation end to end: optimistic send, the action's return releasing
  `busy`, the poll that brings her bubbles, and the staggered reveal that plays them — with her
  words never fabricated by this package.
- Own the composer: text, photo tiles (compress → hash → owner-scoped pre-check → PUT + describe,
  or attach the already-collected photograph with no upload, no ticket and no describe), the reply
  strip, the pinned run chip and the pinned album photo, and the four-clause "something to send"
  rule (whose image clause covers both draft kinds — a `deduped` tile is still an image).
- Draw the conversation: day-divided list, bubbles with quote stubs and photo grids and run cards,
  two swipe gestures plus a tap, and the actions sheet — every gate decided in `lib/`.
- Host the sidebar overlay: URL-held open state, the pinned four-icon rail whose `up` is the chat
  page's bar toggle (one shared bar state, `NinaBarProvider`), the session list with its three row
  actions, search with its persisted semantic toggle, and the keyboard-overlap channel's consumer
  half.
- Serve `/nina/about`: her album and media as two viewer lists over one shared `PhotoViewer`, the
  image-job summary, the zoomed-photo strip — two icon sends, a download, and a close that can
  land on the deep link's origin page.
- Serve `/nina/jobs` and `/nina/jobs/[id]`: the redo/delete controls, the ticking elapsed clock,
  and the detail card whose two facts — the jump and the photograph link — arrive already decided.
- Publish the unread dot and the chrome: the tab bar's hide-on-scroll state machine — its state
  held ONCE in `NinaBarProvider` and worn by the two controls that move it — the floating control
  lane, and the one `router.refresh()` that clears a dot the runner just read to zero.
- Never render `description` — invariant 5. The only prose about a photograph is `glm-4.6v`'s
  private input to her prompt; nothing in this directory receives it, and `alt=""` is the honest
  rendering of that everywhere a Blob photo appears.

## Module map

| File | Kind | Purpose |
|---|---|---|
| `types.ts` | types only | `ChatMessage`, `ChatAvatar`, `ChatMessageState`, `ChatRole` — the client shape of the conversation, mapped from `lib/nina/queries`'s rows on the server so no component knows a column name. No runtime export. |
| `ChatScreen.tsx` | `'use client'` | The interactive half of `/nina`. One turn: optimistic send → action returns → poll → idempotent staggered reveal — the turn section is its contract. Mounts `KeyboardOverlapPublisher` and keeps only the numeric mirror; owns the deep-link landings (`?jump=`), the photo viewer state, and every notice sentence. |
| `KeyboardOverlapPublisher.tsx` | `'use client'` | The ONE `visualViewport` subscription in the app and the keyboard's ONE broadcast — empty-deps, `--nina-kb-overlap` on `:root` (removed, not zeroed, at rest), optional `onOverlap` mirror. Renders null. A component, not a hook: its consumers are two ROUTES, and `rg KeyboardOverlapPublisher` must answer "who measures the keyboard". |
| `MessageList.tsx` | `'use client'` | The conversation, grouped by day. The page scrolls — no `overflow-y-auto` panel — and `decideAutoScroll` is fed by a passive scroll *sample*. Honours R14's `?at=` scroll mark with a `useLayoutEffect` restore; sets `--nina-flash-count` from the server-resolved `flashBlinks` prop. |
| `MessageBubble.tsx` | `'use client'` | One message. Two sides, two extension slots (`quote`, `above`), two `sr-only`-until-focused openers, three gestures decided in `lib/`. Carries the landing flash: the `flash` prop attaches `nina-flash-blink` (`data-flash=true` for the probe) and recolours the ring per side — hers keep the keyframe's `--accent` default, his take the bubble's own fill (`[--nina-flash-ring-color:var(--ink)]`; the 09-09 white lasted a night, invisible against light paper exactly where a jobs deep link lands). |
| `MessageActionsSheet.tsx` | `'use client'` | Edit / delete / resend / retry in one `Sheet`. Owns its own draft (the `Sheet.tsx` focus-loss lesson, twice); `key={acting?.id}` upstream resets it. Delete is immediate — the owner removed the confirm step. |
| `Composer.tsx` | `'use client'` | The fixed bar: auto-growing textarea, photo tiles, reply strip, run chip, photo chip, send. Owns its own text; takes `bottomCss`/`padBottomCss` as precomputed strings and computes no geometry. The tile pipeline (compress → `contentHashOf` → `findNinaDuplicateChatImage` → `planNinaPickUpload`, with the `checking` state) is the dedup section's. |
| `ChatImages.tsx` | no directive | The photos inside a bubble, through `MessageBubble`'s `above` slot. `onOpen` absent means not interactive; `kinds` parallel array names the tap target honestly (`photoSideOf`). |
| `ChatPhotoActions.tsx` | `'use client'` | Save/attach controls in `PhotoViewer`'s `actions` slot — two floating `bg-ink/70` discs over the shared `components/ui/useSavePhoto` ladder (import the hook; never re-grow the machinery here). `onAttach: (() => void) \| null` — `null` means the control does not render (an optimistic row has no `imageIds` yet). |
| `AttachmentChip.tsx` | no directive | The run pinned to the next message. Compiles into `Composer`'s graph. Not a link: a tap must not throw the runner out of a draft. |
| `PhotoAttachmentChip.tsx` | no directive | The album photo pinned to the next message. Deliberately not `AttachmentChip` with a union prop — they can be pinned together, and one renders text the other cannot. |
| `QuoteStub.tsx` | `'use client'` | The quoted strip, above a bubble's text and above the composer's input. A real `<button>` when `onJump` is passed; inert in the composer. `bg-ink-3/20` per RULING E1. |
| `RunAttachmentCard.tsx` | `'use client'` | A run inside the bubble, and the door to it: one `<Link>` to `/r/[id]` whose `onNavigate` (not `onClick`) saves R14's scroll mark. |
| `TypingIndicator.tsx` | no directive | Nina, mid-thought. Reuses `LoadingDots` and wears her exact bubble shape. The face is an optional prop here and required at every hop above — the asymmetry is deliberate. |
| `NinaSidebar.tsx` | `'use client'` | The full-screen overlay panel, plus `NinaSidebarProvider` (one boolean, one `pushedRef`) and `NinaSidebarTrigger` (a bare 44 px button that renders null outside a provider). Ends its box at `PANEL_BOTTOM_CSS`; hosts the pinned four-icon rail (`>` close, `up` bar toggle, `+` create, wand). The reassert's two triggers and the window pin live inside the `open`-keyed effect — the sidebar section is the contract. |
| `NinaBarProvider.tsx` | `'use client'` | The bar state's shared home: one `NinaBarState` (resting `'hidden'`) + one stable-identity `dispatch`, the machine's ONLY component importer of `lib/nina/chrome`'s `nextBarState`. `useNinaBar()` returns null outside a provider — unreachable while `AppShell` mounts it around both consumers, and the structural test keeps it so. |
| `SessionList.tsx` | `'use client'` | Every chat in `planSessionList`'s order. Decides nothing; the empty state is reachable in exactly two real states and is built. |
| `SessionRow.tsx` | `'use client'` | One chat: the row (link, or button when it is the open one) and a `⋯` disclosure over pin / rename / remove — a `mode` union with inline panels. Icon-only actions; the words became `aria-label`s verbatim; the rename field's `✕` clears without folding the keyboard. |
| `NinaSearchField.tsx` | `'use client'` | Sidebar search + the semantic toggle. Measures; `lib/nina/search.ts` decides. Its hit `<Link>`s fire no close callback — the measured production race — and take no props at all, so the seam cannot be re-armed. |
| `useSemanticPref.ts` | `'use client'` | The toggle's persistence — one of the codebase's two `localStorage` keys (the `ri:` prefix convention `lib/nina/search.ts` documents), via `useSyncExternalStore`, with a module-level listener set and a `storage` listener so two tabs agree; degrades to tab-lifetime when the store refuses. |
| `NewChatButton.tsx` | `'use client'` | The rail's `+`. A `<button>` and not a `<Link>` because the id does not exist until the action runs; `replace`, not `push`; never mints a second empty session (the action reuses the newest empty one). |
| `NinaAboutScreen.tsx` | `'use client'` | `/nina/about`. One `PhotoViewer` over two sections, open state derived from `?photo=album.<id>` / `?photo=chat.<id>` — never mirrored into state; the codec lives in `lib/nina/album.ts`. Optional `resolvedPhoto` (the server's answer for a `chat.<id>` the 200-newest window dropped) and `returnTo` (the deep link's decoded origin page). The strip — two icon-only sends on one flight, a `useSavePhoto` download, ending at the keyboard var — is the about section. |
| `NinaPhotoGrid.tsx` | `'use client'` | One square grid for both sections — they differ in exactly two ways (the current-photo ring; the gallery's two parties). `alt=""` on every cell; the `<button>` carries the accessible name. |
| `NinaAvatar.tsx` | no directive | Her face in a circle at three sizes (28 / 44 / 128 px). The only `next/image` call site among Nina's images — the committed fallback PNG is a build asset; an album Blob URL gets a plain `<img>` under `ninaCropStyle`. Re-exports `NINA_AVATAR_SRC` (the fallback constant from `lib/nina/album`). |
| `NinaJobList.tsx` | `'use client'` | The job list, rendered by `/nina/jobs` **and** summarised under `/nina/about`'s Media. Every prop serializable; `actions?: boolean` (not a render-prop — a Server Component caller cannot receive one) draws the per-row mutations on the console surface alone. |
| `NinaJobActions.tsx` | `'use client'` | Redo, one tap, no dialog — and delete. `NOTE` is a `Record` over the whole `NinaJobRefusal` union, so a fifth refusal is a build error until it has a sentence. The accessible name names the row (`Coba lagi <title>`), not the button. |
| `NinaJobDetail.tsx` | `'use client'` | `/nina/jobs/[id]`'s card. Every prop serializable; both facts arrive already decided — `planJobJump` (targets the EARLIEST bubble carrying the photograph, which also rescues rows whose `replyToId` dangled) and `planJobPhoto` (`NinaJobPhoto`, REQUIRED; `kind: 'none'` renders nothing — the icon's absence is the statement). One "Catatan foto" section renders `sidecar ?? prompt`; the separate Prompt section is gone — it repeated the sidecar the prompt already ships inside. |
| `NinaJobElapsed.tsx` | `'use client'` | The ticking clock. First render uses the server's `nowMs` on both sides (a wire-time difference is a hydration mismatch; after mount it is only a tick), with the correction riding a 0 ms timer because `react-hooks/set-state-in-effect` is an error. |
| `ChatChrome.tsx` | `'use client'` | `/nina`'s chrome: the tab bar (hidden at rest on this screen) and the floating control lane. Owns every bar EFFECT and none of the bar STATE (reads `bar`/`dispatch` from `useNinaBar`) and remains the ONE writer of `--nina-bar-visible` on `:root`. Measures the composer by id with a `ResizeObserver`; decides nothing — `lib/nina/chrome.ts` owns the state machine. |
| `NinaUnreadBadge.tsx` | async Server Component | The unread dot, counted from `lib/nina/queries` on the partial unread index, global across sessions (mark-read is the session-scoped half). `getUserId`, not `requireUserId` — it renders inside `AppShell` where there may be no session. `NinaUnreadBadgeSlot` is its `Suspense` wrapper with `fallback={null}`. |
| `NinaUnreadSync.tsx` | `'use client'` | The dot the runner just read himself out of existence, actually going away: exactly one `router.refresh()` when `hadUnread` flips, no timer; the rule and its termination argument in `lib/nina/unread.ts`. |
| `useChatScroll.ts` | `'use client'` | R14's DOM half: read `[id^="nina-msg-"]` rows in document order, write the scroll mark by `replaceState` against `window.location.search` (never the possibly-stale hook snapshot). Zero arithmetic — `lib/nina/scroll.ts` decides. |

## The turn: how a send becomes her reply

`ChatScreen` is the package's centre of gravity. The facts worth having before editing it:

- **Nothing is inside a transition.** `useState` setters defer inside `startTransition`, and
  `useOptimistic` discards its state when the transition ends — the exact frame the first bubble
  is supposed to appear in. Plain `useState` and a plain async handler are the correct tools. The
  same argument is why her bubbles arrive through a poll returning data and not a
  `router.refresh()`: a refresh would deliver the whole burst through `mergeServerMessages` in one
  frame.
- **`busy` covers the action, not the turn.** `sendNinaMessage` persists his message and returns
  before the model is reached (F36 R6), so `busy` is released on the action's return. The server's
  claim on `nina_turns` is what stops that becoming a second concurrent model call.
- **The arrival loop is one sequential async loop, not a `setInterval`** — a tick cannot fire
  while a reveal is mid-stagger, by construction. It stops on the *server's* `awaiting`, not on
  "did I just receive something", because a burst chains.
- **The cold load starts from the poll's own disjunct** (P1-RI-A038). `ninaFlightView` computes
  `awaiting` from the session's pending `nina_turns` claim — a fresh live claim, read by
  `app/nina/page.tsx` as the `Promise.all`'s sixth element — OR the newest-row heuristic
  (`ninaAwaitingByMessage`): a turn honestly still running past the 90 s window starts the poll on
  a cold load, and a dead turn (claim swept, message old) starts nothing. The first poll's answer
  remains authoritative and corrects either seed inside two seconds.
- **The give-up pairs with the server's own budget, not the stale deadline** (P1-RI-A038).
  `NINA_TURN_POLL_GIVE_UP_MS` is `NINA_BACKGROUND_BUDGET_MS` (240 s) — wide enough for a first
  turn plus `NINA_TURN_CHAIN_MAX` (2) chained follow-ups (~210 s), which the old 90 s
  `NINA_TURN_STALE_MS` identity declared dead mid-chain. The real stop for a dead turn is the
  server's `awaiting: false`; the backstop exists for the poll that cannot reach the server at all
  (an offline phone). Asserted as the pairing in `lib/nina/turnflight.test.ts`.
- **The reveal's append is id-idempotent** (P1-NIN-A034). Bubbles are appended through
  `appendNewBubbles` (`lib/nina/live.ts`) INSIDE the state updater, so a full-route RSC delivery
  landing mid-reveal — `mergeServerMessages` pre-delivering rows the stagger has not reached — can
  collapse the remaining reveal into one frame (cosmetic, accepted) but can never render an id
  twice. Prod proof: session "gj" rendered 7 bubbles for 4 committed rows before the guard.
- **Three timer refs, deliberately separate** — `timer` (the reveal's sleeps), `flashTimer` (the
  landing tint), `pollTimer` (the backoff wait). Every timed step checks `alive.current`.
- **The failure states are both honest, and neither is a fake Nina message.** A thrown or refused
  send is `'send-failed'`; a turn that produced nothing is `'no-reply'`, raised by the poll.
- **A send patches the list; an edit patches the list; nothing refreshes.** `mergeServerMessages`
  is server order, LOCAL content, so a refresh cannot deliver an edit. The list adopts a changed
  `initial` prop during render (`seenInitial` + `setMessages` inline — the documented
  "adjust state when a prop changes" pattern), because `react-hooks/set-state-in-effect` rejects
  the effect form and an effect would paint the stale list for a frame.
- **URL discipline.** One mount-time `useLayoutEffect` strips `?attach=`, `?photo=` and `?jump=`
  by NAME from a `URLSearchParams` copy, so `?s=` and `?at=` survive; a fourth parameter joins
  that delete list, it never gets a new effect. The soft-nav `?jump=` watcher is the one sanctioned
  second URL writer. `app/nina/page.tsx` keys `<ChatScreen key={activeSessionId ?? 'none'}>`, so a
  session switch remounts rather than merging two conversations' local state.

## The keyboard channel

One measurement and one broadcast, in `KeyboardOverlapPublisher` — not in a screen. It subscribes
to `visualViewport` with empty deps (a keystroke never re-subscribes), turns the reading into a
number with `keyboardOverlapPx` (filters out the URL bar and pinch-zoom; returns 0 on Android,
where the layout viewport really does shrink), and sets `--nina-kb-overlap` on `:root` — removed,
not zeroed, at rest and on unmount. The var is a custom property because the sidebar panel needs
the same number and is a SIBLING no prop can reach; it is a component rather than a hook because
its consumers are two ROUTES never mounted together (one-subscription-per-screen by construction)
and it must stay grep-visible. A consumer wanting the NUMBER passes `onOverlap` (called inside the
same `sync`; an unchanged number bails out): `ChatScreen` for `MessageList`'s bottom pad and the
composer's two CSS strings, `NinaAboutScreen` for the strip's padding gate.

`/nina/about`'s mount is SCOPED to the open-viewer fragment — the strip is the route's only
reader — and the strip gets the sidebar panel's box fix: `bottom: var(--nina-kb-overlap, 0px)` as
an INLINE STYLE (beats `bottom-0` without depending on utility sort order), plus
`attachStripPadBottomCss(kbOverlap)` as its `paddingBottom` — the old resting class byte for byte,
`'0px'` under the keyboard, because padding by a floor that is BEHIND the keyboard lifts the input
off the keys. No transition on `bottom`: a lagging edge would chase the keyboard's own animation
and read as a glitch.

The sidebar has the keyboard's other half, and it is the half a box cannot fix — iOS Safari's
focus reveal scrolls the panel's own `overflow-y-auto` container AND pans the window behind the
opaque panel. Three corrections, all measuring nothing:

- **The clock** — one delegated `focusin` listener (inside the `open`-keyed effect) arms
  `KEYBOARD_REASSERT_DELAYS_MS` against the field that took focus, each tick guarded by
  `document.activeElement !== target`.
- **The box** — a `ResizeObserver` on the panel, in the SAME effect (no dependency added), each
  delivery decided by `planBoxReassert`: `'baseline'` on `observe()`, `'skip'` on a repeat,
  `'assert'` on a real change (sub-pixel is a change). This is the trigger the rename-field report
  proved the clock needs: the panel's `bottom` var shrinks the box one React commit LATER than the
  focus reveal scrolled the deck, and the box ARRIVING is the one observable signal the shrink
  landed.
- **The window** — the reveal pans the layout viewport itself, which `nearest` is structurally
  blind to for a fixed element. The offset is captured at focus-in (before the keyboard has moved
  anything), a `{ passive: true }` `window` `scroll` listener pins the root scroller to 0/0 while
  the armed field holds focus, and the reading position is handed back on focus-out and in the
  cleanup. Event-driven (no timing hole), self-loop-safe by arithmetic (its own `scrollTo` reads
  0/0 and returns), attached on arm and removed on disarm.

All three resolve to one assert: whatever holds focus RIGHT NOW, qualified by
`isKeyboardTextField`, then `scrollIntoView(KEYBOARD_REASSERT_SCROLL_OPTIONS)` — a lib constant so
a `smooth` cannot quietly grow. Over-firing is cheap (`nearest` computes zero on a visible field);
under-firing is the one failure the rule must not do. The keyboard CLOSING re-asserts for free and
fixes the mirrored case at no cost.

## The upload dedup (media-dedupe, complete 4/4)

A photograph enters the conversation through a hash before it enters Blob. The decision module is
`lib/nina/dedupe.ts` — pure, unit-tested with no database, no DOM and no mock, client-safe with
exactly two imports — and its consumers split along the client/server line:

- **The composer consumes `planNinaPickUpload`.** After `compressForNina` returns, EVERY pick is
  hashed — `contentHashOf(compressed.file)`, the exact bytes a PUT would carry — and
  `findNinaDuplicateChatImage` asks the owner's collection whether an ORIGINAL with these bytes
  already exists. `planNinaPickUpload` returns `attach-existing` (the tile never uploads, never
  mints a ticket, never pays the 8–11 s describe, jumps to `ready` holding the photograph it will
  attach) or `upload` (the old pipeline, hash in hand for the race-close). The dedup is
  deliberately INVISIBLE to him: same thumbnail, same `ready`, same send. The pre-check is a
  Server Action, so it serializes per client across tiles; the compress-and-PUT half stays
  parallel.
- **The action consumes the rest, and no component calls it**: `normalizeClaimedContentHash`
  (trimmed; uppercase hex REJECTED, because `contentHashOf` emits lowercase and one spelling is
  what the sweep compares against), `partitionNinaUploadClaims`, `ninaUploadInsertRow`, and —
  since the perceptual twin gate (P1-NIN-A035) — `applyPerceptualKeepers`, which folds
  same-photo/different-resolution re-uploads onto their keeper before the byte-exact partition
  runs. The generated and admin paths deliberately do NOT reuse this module (three modules, three
  jobs, do not merge them).

The degrade rule is invariant 9 at every floor: an uncomputable hash is null and the tile uploads;
a thrown pre-check degrades to null; an invalid claim writes NULL, never a send error; a failed
keeper lookup degrades to fresh. A pick can never fail BECAUSE of dedup — the whole ladder lands
on "writes the photograph, maybe twice", never on "a row pointing at nothing".

**The send carries the split.** `ComposerDraftImage` is a discriminated union — `upload` (ticket,
url, stored pathname, contentHash) or `deduped` (url, imageId; the `url` exists for the optimistic
bubble only, the payload is the ID). `ChatScreen` filters by `source` and sends `imageTickets`,
`dedupedImageIds`, and `contentHashes` keyed by the STORED pathname (NOT index-aligned — the
server dedupes claims by pathname first). The optimistic bubble re-orders to match the server:
fresh uploads, then deduplicated tiles, then the pinned album photo.

**Reference semantics and the race-close.** A deduplicated tile rides the pinned photo's seam:
`resolveAttachment` re-proves ownership per id, an orphan keeper is adopted rather than doubled, a
live keeper is written as a REFERENCE row (no `contentHash` — a reference carries the hash only
when its writer held the bytes), and a keeper that died mid-compose DROPS the tile and sends the
message rather than refusing. RULING B1's fifth disjunct: a send made entirely of references is
still a send. At insert, one indexed `(user_id, content_hash)` lookup per DISTINCT hash re-asks
the composer's question: a DB keeper wins over everything; same-send twins split first-fresh,
later-reference. Originals insert first, references second, and only then is a blob release
REGISTERED under `after()` — the rows always exist before the bytes they orphaned can vanish.

## `/nina/about`: the viewer, the strip, the return leg

The viewer's open state is DERIVED from the URL (`?photo=album.<id>` / `?photo=chat.<id>` — a dot
because `URLSearchParams` leaves a dot unencoded), pushed on open, replaced on page. The whole
codec lives in `lib/nina/album.ts` (`encodeAboutPhoto` / `decodeAboutPhoto` / `aboutViewerLists`)
because the server page parses the very parameter this screen derives its state from. The album
and Media section are one viewer list each — swiping inside the album must not wander into his
chat photos.

- **`resolvedPhoto`** (optional, nullable): the server's answer for a `chat.<id>` the
  `NINA_GALLERY_LIMIT` (200) newest window dropped — resolved through `getNinaMessageImage`, mapped
  through `galleryPhotos` (`description` never crosses), appended to the chat arm at the END. Every
  viewer reader reads the merged list, so paging and the delete control reach a resolved photo;
  the Media grid keeps mapping `gallery`. An unresolvable id still falls out the bottom as a
  closed viewer, never an error.
- **`returnTo`** (optional, nullable; `decodeAboutReturnTo` sanitized on the server): the deep
  link's origin page via `?return=`. The close is three-rung: `back()` when THIS mount pushed (the
  screen's own gesture — undoing a grid tap must stay a back even if a `?return=` sits in the
  URL); else `router.push(returnTo)` — a deep link has no entry of ours beneath it, so the origin
  travels in the link and the close PUSHES it (production request: closing a viewer opened from
  Detail foto must land back on Detail foto; the push leaves the `?photo=` entry in history, so
  back-swiping from Detail foto re-opens the viewer); else strip the parameter in place.
- **The attach strip** — two adjacent icon-only `Button`s in one row, ONE flight (`sending:
  NinaAttachTarget | null` names the pulsing button and disables the other): `send-horizontal`
  "Kirim ke chat" (`sessionId: null` — the action's own most-recent resolution, byte-identical
  server behaviour) and `message-square-plus` "Kirim ke chat baru" (`createNinaChatSession` FIRST
  — which reuses the newest *empty* session — then an explicit `sessionId`, because `null` would
  re-resolve to the conversation he may have been trying to leave). The screen pushes
  `result.next` — `router.refresh()` first, then `router.push(result.next)` — and spells no URL of
  its own. `target` is REQUIRED on `NinaAttachInput`; `tsc` is what notices a caller that forgot
  to decide. The stated cost of `'new'`: a send that refuses after the create leaves the empty
  session behind — the same state one tap of the rail's `+` leaves.
- **The download** (R5): `useSavePhoto` on the strip, for BOTH sections, derived through
  `viewerLists` (never the raw `gallery` prop — the resolved deep-link photo is not in it), with
  its two outcomes merged into the notice line the sends and delete share.
- **The delete** exists for HIS photographs only (the album is an avatar — no delete, never was);
  the hidden control is not the authorization — the action refuses a `generated` id on its own.

`tests/nina.attachTargets.test.ts` is the strip's wiring guard. Its `'new'`-target test expects
`result.sessionId` to be the id the mocked send LANDED in, not the id the mocked create returned —
a settled contradiction, corrected on purpose: `sessionId` is `sendNinaMessage`'s own answer per
the plan's own Interface Contract, and a separate test makes the two collaborators disagree on
purpose and asserts `next` follows the LANDED id.

## The sidebar overlay, and the bar

The panel is an **overlay, not a route**: a route would destroy the mounted chat behind it and
light the Nina tab on a screen with no tab bar. What a route would have bought is bought back:

- **The back gesture**: open state is `?sidebar=1`, pushed by the trigger. `NinaSidebarProvider`
  exists because the TRIGGER pushes and the PANEL closes in two different subtrees — the
  `pushedRef` deciding `back()` vs `replaceState` must be one ref. `AppShell` wraps the chat shell
  in it, with `NinaBarProvider` OUTSIDE (below).
- **Focus**: `Sheet`'s three behaviours plus `inert={!open}` for the one thing `Sheet` gets from
  unmounting. The panel is always mounted (mount-on-open needs a double `rAF` to transition FROM;
  exit needs `transitionend`), slides on `transition-transform` with the codebase's first
  `motion-reduce:transition-none`, and is a two-deck column: a scroll region over a shrink-0
  four-icon rail (`>` close, `up` bar toggle, `+` create, wand to `/nina/jobs`).

Two measured rules live here and are easy to regress:

- **The `Sheet.tsx` trap**: the panel's open/close effect keys on `open` ALONE and reads the latest
  close through `closeRef` — an unstable `onClose` dependency reaching a focused input cost "one
  digit per keyboard" on the review screen. **Do not add a dependency to that array.** The box
  observer and the window pin live INSIDE that same effect for this reason.
- **No close beside a push, ever.** `NinaSearchField`'s hit `<Link>`s, the rail's wand and the
  avatar `<Link>` all navigate without calling `closeRef`: the close path pops a pushed entry, and
  firing it beside a `<Link>`'s push raced a back against a forward — measured in production
  (2026-09-08), where every search hit opened the conversation the runner was already in. A hit
  href carries no `sidebar` key, so the navigation itself closes the panel; the field takes no
  props, so the race cannot be re-armed.

The panel's bottom edge is `PANEL_BOTTOM_CSS` — `panelBottomCss`'s string: the keyboard's measured
top edge plus, while the bar shows, `TAB_BAR_OUTER_HEIGHT_PX` and the safe-bottom the bar pads
itself by, so the revealed bar renders in a reachable strip BELOW the panel's opaque fill. The
rail floor `RAIL_PAD_BOTTOM_CSS` is the composer's `padding-bottom` decomposition QUOTED, not
called — both gates (the overlap subtraction, and the `* (1 - var(--nina-bar-visible))` complement,
because the panel LIFTS above the bar instead of covering it) are re-spelled in CSS. The comment in
the file is the pin: change the floor or its gates in `composerPadBottomCss`, change them here.

### The bar: one state, two buttons, one var writer

The bar's reveal state is held ONCE, in `NinaBarProvider`, and worn by the two controls that move
it — the chat page's `^v` toggle and the rail's `up`. The provider exists because the panel is
`ChatChrome`'s SIBLING: `AppShell` renders them side by side, so no prop chain reaches from one to
the other. Nesting is load-bearing: `NinaBarProvider` wraps `NinaSidebarProvider`, which still
encloses `{shell}` directly — `tests/nina.sidebarProvider.test.ts` pins the shape for BOTH
providers, because a consumer outside its provider takes the null branch and silently does
nothing, all unit tests green (this exact bug shipped once, F35).

The decision half stays in `lib/nina/chrome.ts` (`NinaBarState`, `NinaChromeEvent`, `nextBarState`,
`autoHideDelayMs`, `isControlVisible`, `barToggleGlyph`). Consumers name events, not methods:
`dispatch('toggle' | 'autohide' | 'composer-engaged' | 'composer-released')` — `'toggle'` has
exactly two senders, both buttons. `dispatch` has stable identity. The resting state is `'hidden'`
and publishes nothing. `ChatChrome` owns every EFFECT: the `document`-level focus sync (one task
delayed, so a textarea→Send move cannot blink the bar; a text field anywhere in the panel's
`[role="dialog"]` engages the same rule — the rule is about KEYBOARDS, not the composer), the 5 s
auto-hide timer (paused while a keyboard is up), and the `NINA_BAR_VISIBLE_VAR` publisher — set
only while shown, removed on hide and unmount, ONE writer; `NinaSidebar` only reads it.

The session rows carry the icon-only conversion (`SessionRow`): pin / rename / remove as glyphs
whose words survive verbatim as `aria-label`s, and a delete that fires on the tap (the guards that
survive: two deliberate taps, `loading={pending}`, 44 px targets, no `window.confirm`). A refused
removal leaves the MENU open with the sentence in it; `NinaSessionActionResult` carries
`{ ok, next }` and no prose, so the row supplies the words while the server owns the rule.

## Shared idioms (introduce nothing new next to them)

- **`bg-ink-3/20` is THE inset surface** (RULING E1): a mid-grey's alpha composites correctly over
  `bg-ink`, `bg-card` and `bg-paper` alike, where `bg-paper-2` inverts. Used by `ChatImages`,
  `QuoteStub`, `RunAttachmentCard`, `PhotoAttachmentChip`, `NinaPhotoGrid`.
- **A plain `<img>` for every Blob-hosted photo** — already compressed by whoever wrote the row;
  `next/image` would re-optimise finished files on a paid transform quota. `NinaAvatar`'s
  committed-fallback branch is the one `next/image` call site.
- **`alt=""` on photographs; the accessible name on the button** — there is no honest alt text,
  and the only description that exists is invariant 5's private prose.
- **The 16 px input floor** in `Composer` and `MessageActionsSheet`; the 44 px floor on every
  control; `size-[18px]`/`size-5` glyphs at `strokeWidth 2.4`, inlined module-privately — copied
  verbatim from Lucide (`lucide-static` is NOT a dependency; the paths ARE the copy).
- **Icon-only means the word became the `aria-label` verbatim** — never a new sentence, never
  quoted-literal text left in the file (the attachTargets suite asserts the absence).
- **One flight per control cluster**: `loading={pending}`/`sending` names the firing control,
  `disabled` guards the rest.

## Exported API

The package has no barrel; consumers import per file. What crosses its boundary:

| Export | From | Notes |
|---|---|---|
| `ChatScreen` | `ChatScreen.tsx` | Props all REQUIRED (`initial`, `todayISO`, `userId`, `sessionId`, `pending`, `pendingPhoto`, `flight`, `avatar`, `flashBlinks`) on the RULING E2b habit: one caller, and `tsc` should notice a missing prop — an optional default here turned a broken route into a chat that silently wrote into the wrong session. `flashBlinks` is `flashBlinkCount(process.env.NINA_FLASH_BLINKS)`, resolved on the server. |
| `KeyboardOverlapPublisher` | `KeyboardOverlapPublisher.tsx` | `{ onOverlap?: (overlapPx: number) => void }` — optional because the `:root` var needs no consumer; renders null. Mount it; never subscribe to `visualViewport` yourself. |
| `NinaBarProvider`, `useNinaBar` | `NinaBarProvider.tsx` | `{ children }`. `useNinaBar()` returns `{ bar, dispatch } \| null` — null outside a provider. `dispatch` has stable identity; `nextBarState` decides, the provider only forwards. |
| `NinaSidebar`, `NinaSidebarProvider`, `NinaSidebarTrigger`, `useNinaSidebar`, `NinaSidebarAvatar` | `NinaSidebar.tsx` | `useNinaSidebar()` returns `null` outside a provider, on purpose — a `ChatChrome` with no sidebar draws no `>`. |
| `NinaSearchField` | `NinaSearchField.tsx` | Zero props. Its hits are `<Link>`s; the prop it used to take is gone rather than optional. |
| `useSemanticPref` | `useSemanticPref.ts` | `readonly [boolean, (next) => void]`, cross-tab via `storage`, degrade-to-tab-lifetime when the store refuses. |
| `SessionList` | `SessionList.tsx` | `{ list: SidebarList, activeSessionId, onClose }` — decides nothing. |
| `SessionRow` | `SessionRow.tsx` | `{ session, active, activeSessionId, onClose }` — the server decides where a removal lands (`planSessionRemoval`). |
| `NewChatButton` | `NewChatButton.tsx` | `{ onNavigate, className? }` — the refusal path closes the panel; success `router.replace`s the action's `next`. |
| `NinaAboutScreen` | `NinaAboutScreen.tsx` | `{ avatar, album, gallery, jobs, jobsNowMs, resolvedPhoto?, returnTo? }` — all mapped server-side; `jobs` arrives as `NinaJobListItem[]`. |
| `NinaPhotoGrid`, `NinaGridCell` | `NinaPhotoGrid.tsx` | `{ cells, onOpen }`; `isCurrent` draws the ring (the album sets it; the gallery never does). |
| `NinaJobList` | `NinaJobList.tsx` | `{ items, nowMs, emptyText, actions?, className? }` — `actions` set by `/nina/jobs` alone. |
| `NinaJobActions`, `NinaJobDetail`, `NinaJobElapsed` | `NinaJob*.tsx` | All props serializable; the jump, the stage and the photograph fact arrive already decided. |
| `ChatChrome` | `ChatChrome.tsx` | `{ ninaBadge?: ReactNode }` — mounted by `AppShell`, which constructs the badge slot on the server and passes the node in. |
| `NinaUnreadBadge`, `NinaUnreadBadgeSlot` | `NinaUnreadBadge.tsx` | The async Server Component and its `Suspense` slot. |
| `NinaUnreadSync` | `NinaUnreadSync.tsx` | `{ hadUnread }`; renders null. |
| `NinaAvatar`, `NINA_AVATAR_SRC` | `NinaAvatar.tsx` | `size` `'sm' \| 'md' \| 'xl'` (28/44/128); passing nothing renders the committed face. |
| `ChatImages` | `ChatImages.tsx` | `{ urls, kinds?, onOpen? }` — absent `onOpen` means not interactive. |
| `ChatPhotoActions` | `ChatPhotoActions.tsx` | `{ url, label, onAttach: (() => void) \| null }`; rendered through `PhotoViewer`'s `actions` slot; `null` hides the attach control. |
| `MessageList`, `MessageBubble`, `MessageActionsSheet` | their files | Internal to the screen except `MessageList`'s callbacks (`flashBlinks` among its props); `MessageActionsSheet` is keyed by `acting?.id` upstream. |
| `Composer`, `ComposerDraftImage` | `Composer.tsx` | `onSend` must be referentially stable; `bottomCss`/`padBottomCss` are a PAIR and neither is optional. `ComposerDraftImage` is a discriminated union — `upload` (ticket, url, stored pathname, contentHash) or `deduped` (url, imageId); a `deduped` entry's `url` is for the optimistic bubble, the payload is the id. |
| `AttachmentChip`, `PhotoAttachmentChip`, `QuoteStub`, `RunAttachmentCard`, `TypingIndicator` | their files | Leaf renderers; `QuoteStub`'s `mine` is whose bubble it sits INSIDE, not whose message is quoted. |
| `readAnchorRows`, `useChatScrollMark` | `useChatScroll.ts` | The scroll mark's DOM half; `RunAttachmentCard` and `ChatScreen` are its consumers. |
| `ChatMessage`, `ChatAvatar`, `ChatMessageState`, `ChatRole` | `types.ts` | Types only — the serialization boundary between `app/nina/page.tsx` and this package. |

## Dependencies

### External

- `react` — the whole surface: hooks, `createContext` (both providers), `useSyncExternalStore`
  (`useSemanticPref`), `Suspense` (`NinaUnreadBadgeSlot`).
- `next/link`, `next/navigation` — `<Link>` for every navigation that is one; `useRouter` for
  `refresh`/`push`/`replace`; `useSearchParams` for the URL-derived states.
- `next/image` — `NinaAvatar`'s committed-fallback branch only.
- `@vercel/blob` — `Composer`'s `upload()` against `/api/upload` (the compress-and-PUT half is
  parallel across tiles; the describe and dedup pre-check halves serialize because Server Actions
  dispatch one at a time per client).

### Internal

- `@/lib/nina/actions` — `sendNinaMessage`, `pollNinaReply`, `resendNinaMessage`,
  `describeNinaImage`, `findNinaDuplicateChatImage`, plus `SentBubble` / `NinaResendRefusal` types.
  The only path to the model on any of these screens. (Since nina-offline-reply P2 the runner
  mechanics live in the server-only `lib/nina/turnrun.ts` / `turnrevive.ts`; this package's import
  surface is unchanged.)
- `@/lib/nina/dedupe` — `planNinaPickUpload` (the composer's whole per-tile decision as a value).
  The module's other exports are the ACTION's STEP 1b vocabulary; no component imports them.
- `@/lib/nina/albumActions` — `attachNinaPhotoToChat`, `deleteNinaChatPhoto`, `NinaAttachTarget`.
- `@/lib/nina/sessionActions` — `createNinaChatSession`, `renameNinaChatSession`,
  `removeNinaChatSession`, `setNinaChatSessionPinned`, `NinaSessionActionResult`.
- `@/lib/nina/messageActions`, `jobActions`, `searchActions` — the edit/delete, redo/delete, and
  search writes.
- `@/lib/nina/chatview` — `composerBottomCss`, `composerPadBottomCss`, `attachStripPadBottomCss`,
  `panelBottomCss`, `keyboardOverlapPx`, `decideAutoScroll`, and the two `:root` channel constants
  `NINA_KEYBOARD_OVERLAP_VAR` / `NINA_BAR_VISIBLE_VAR`, plus the reassert's shared vocabulary
  (`KEYBOARD_REASSERT_DELAYS_MS`, `KEYBOARD_REASSERT_SCROLL_OPTIONS`, `isKeyboardTextField`,
  `planBoxReassert`). The geometry the components measure for and never compute.
- `@/lib/nina/chrome` — the tab bar state machine (`NinaBarState`, `NinaChromeEvent`,
  `nextBarState` — whose only component importer is `NinaBarProvider.tsx` — `autoHideDelayMs`,
  `isControlVisible`, `barToggleGlyph`, `controlBottomCss`) and `NINA_CHROME_CONTROL_CLASS`.
- `@/lib/nina/album` — the about codec (`encodeAboutPhoto` / `decodeAboutPhoto` /
  `aboutViewerLists` / `aboutPhotoHref` / `decodeAboutReturnTo` / `aboutPhotoIdOutsideGallery`),
  the gallery limits, `photoSideOf`, `ninaAvatarView`, `NINA_AVATAR_FALLBACK_SRC`.
- `@/lib/nina/sidebar`, `sessions`, `active`, `search`, `edit`, `reply`, `scroll`, `reveal`, `live`,
  `turnflight`, `jobview`, `unread`, `queries` — every decision listed in the Overview lives in one
  of these; the component imports the function, measures, and renders the answer.
- `@/lib/auth/requireUserId` — `getUserId` only (in `NinaUnreadBadge`; the redirecting variant
  would soft-404 from inside a loading fallback).
- `@/lib/photos/compressForNina`, `@/lib/photos/contentHash`, `@/lib/photos/save` — the pick
  pipeline, `contentHashOf` (webcrypto sha-256 over the exact compressed bytes, so the composer
  and the server compute the one string), and the save strategies behind `useSavePhoto`.
- `@/components/ui` — `Button` (`loading`/`variant` carry the mis-tap and 44 px guarantees),
  `ButtonLink`, `Card`, `Field`/`Input`, `CONTROL_CLASS`, `Sheet`, `TabBar` +
  `TAB_BAR_OUTER_HEIGHT_PX`, `EmptyState`, `PhotoViewer` + `ViewerPhoto`, `LoadingDots`,
  `useSavePhoto` + `SAVE_NOTICE_TEXT` (the shared download ladder).

**No file in this directory imports `zod`, `server-only`, or the database client** — the one
database read (`countUnreadNinaMessages`) sits behind the async Server Component that is allowed
to make it, and every type that erases at compile time is imported freely.

## Reverse Dependencies

### Primary consumers

- `app/nina/page.tsx` — `ChatScreen` (keyed on `activeSessionId`), `NinaSidebar`, `NinaUnreadSync`,
  and `ChatMessage` as a type. It resolves `?s=` owner-scoped before anything renders, reads the
  pending `nina_turns` claim into `ninaFlightView`, resolves `flashBlinkCount` for `flashBlinks`,
  maps `lib/nina/queries`'s rows onto `ChatMessage` field by field (never spreading —
  `description` cannot ride along), and renders neither provider a second time.
- `app/nina/about/page.tsx` — `NinaAboutScreen`, its only mount site. Three indexed reads plus the
  deep-link resolution (`aboutPhotoIdOutsideGallery` → `getNinaMessageImage` → `galleryPhotos`) and
  the `?return=` decode; no model call, no `loading.tsx`; the Media job summary is bounded by the
  page's own `ABOUT_JOB_LIMIT` (5).
- `app/nina/jobs/page.tsx` / `app/nina/jobs/[id]/page.tsx` — `NinaJobList` (with `actions`) and
  `NinaJobDetail`.
- `components/ui/AppShell.tsx` — `ChatChrome` (with the server-built `NinaUnreadBadgeSlot` node),
  `NinaBarProvider` and `NinaSidebarProvider` (both wrapping the chat shell when `screen ===
  'chat'`; the bar provider sits OUTSIDE so the sidebar one still encloses `{shell}` directly).
  Rendering client providers from here is a boundary, not a conversion: the file has no `'use
  client'` and must not gain one (`tests/share.bundle.test.ts` exists because that import graph
  leaked a session read once already).

### Test consumers

The component suites live CO-LOCATED (31 files, one per module except `types.ts`), each opting
into `happy-dom` with a `@vitest-environment` docblock against the global `node` default, driving
the real component through `@testing-library/react` with the `lib/nina` collaborators mocked
(e.g. `ChatScreen.test.tsx` mocks `sendNinaMessage`/`resendNinaMessage`/`pollNinaReply`). They pin
wiring and render states — what a send gates, which control pulses, that a control does not
render — and deliberately not decisions.

Five `tests/` suites still read this package's files **as text** via `readRepoCode`, for
properties no render can carry: `nina.attachTargets.test.ts` (the strip's wiring — aria-labels,
both targets, one shared flight, `router.push(result.next)`, no bare `/nina` push; its action half
composes both send paths through the real `attachNinaPhotoToChat`),
`nina.chatPhoto.test.ts`, `nina.chatAvatar.test.ts` (the avatar prop is required at every hop
above the optional leaf), `nina.sidebarProvider.test.ts` (both providers' mount shape in
`AppShell`, the nullable hooks, no second provider in a page — the failure mode that is invisible
to every other gate), and `tabbar.geometry.test.ts` (the clearance constants agree). The docstrings
in guarded files are written never to *spell* the strings the guards assert: a text guard cannot
tell an explanation from a reintroduction.

The decisions themselves are tested in `lib/` — `chatview.test.ts` (the keyboard truth tables),
`turnflight.test.ts` (the budget pairing), `live.test.ts` (`appendNewBubbles`), `dedupe.test.ts`
plus `chatDedupe.test.ts` (the dedup, edges mocked over the real `sendNinaMessage`), `jobview`,
`scroll`, `chrome`, `search`, `unread`, `album` — none of which import or render anything here.

## Concurrency

The package is cooperative-async, not threaded, and its safety comes from structure rather than
locks:

- **One sequential poll loop** (`ChatScreen`) — awaiting each step in order means a tick can never
  land inside a reveal; the reveal's append is id-idempotent on top (`appendNewBubbles`), so the
  one other writer (a mid-reveal merge) cannot double a bubble.
- **One flight per control cluster** — `busy` / `pending` / `sending` gate re-entry; Server Actions
  dispatch one at a time per client anyway.
- **Gesture guards, not flags**: `alive.current` (unmount + StrictMode), `cursorRef`, `dropped`
  (`Composer` tiles), `requestRef` (`NinaSearchField` — a Server Action cannot be cancelled, so
  every run takes an id and a stale response is dropped), `pushedRef` (one per provider),
  `syncedForRef` (`NinaUnreadSync`, tri-state).
- **One `visualViewport` subscription** — `KeyboardOverlapPublisher`'s, mounted once on `/nina` and
  once (scoped to the open viewer) on `/nina/about`, two routes never mounted together. **One
  schedule at a time** in the reassert; **one `ResizeObserver`** per open, verdict-gated by
  `planBoxReassert`; **one window pin at a time**, its listener attached on arm and removed on
  disarm.
- **Cross-tab** only in `useSemanticPref`: a module-level listener set plus the `storage` event.
- `reactStrictMode` double-invocation is answered the same way everywhere: decide purely (in `lib/`
  or before any `set`), hand `setState` a value, and never decide inside an updater — F17 measured
  two blobs minted from one pick otherwise.

## Error Handling

There are no error classes here. Failures surface as strings a human reads, and the vocabulary is
one-directional: **the server owns the refusal, this package owns the words** (`NinaSessionActionResult`,
`NinaJobActionResult`, `NinaAttachResult` carry discriminants, not prose). The record pattern is
exhaustive `Record` maps so a new union member is a build error until it has a sentence:
`NOTICE_TEXT` and `RESEND_REFUSAL_TEXT` (`ChatScreen`), `REJECTION_TEXT` (`Composer`),
`NOTE` (`NinaJobActions`).

- **Send/turn**: `'send-failed'` (throw or refusal — the row turns red and stays) vs `'no-reply'`
  (the poll's give-up or an empty turn — his message is saved, one more tap gets an answer).
  Neither is ever a fabricated bubble.
- **Refused actions keep their panel open** with the sentence in it; a successful action closes it.
- **The one refusal that is not a failure** gets wording that says so: `'turn-live'`,
  `'edit-unavailable'`.
- **Deliberately silent**: `AbortError` from a dismissed share sheet (inside `useSavePhoto`), a
  failed search transport (`NinaSearchField` clears the spinner; the model's own failure arrives as
  `mode: 'text'`), an uncomputable hash and a failed duplicate pre-check (`Composer` — invariant
  9's client half), a failed `localStorage` write, and `localStorage` reads under private mode.
- Nothing throws across the action boundary without being caught into `null` first, so a network
  drop and a refusal are distinguishable states rather than an unhandled rejection.

## Performance

- **The document scrolls, not a panel** — no `dvh` container fighting the collapsing URL bar and
  the keyboard; the auto-scroll decision reads a continuously-maintained ref sample.
- **`mergeServerMessages` returns the same array reference when nothing changed**, and
  `appendNewBubbles` bails to the same reference when nothing is new — a delivery that brings
  nothing costs no render.
- **The unread count is one partial-indexed query** per render of a tabbed screen, no polling.
- **Photos are compressed client-side before the PUT**; render paths use plain `<img>` at
  already-final sizes; a duplicate pick costs one hash and one indexed lookup instead of a PUT, a
  permanent Blob object and the 8–11 s describe.
- **Poll backoff** (`ninaPollDelayFor`) under a give-up ceiling paired with the server's own
  budget; a failed poll attempt says nothing and retries.
- **The sidebar panel stays mounted** — DOM for rows the server read anyway, in exchange for no
  double-rAF mount and no stranded reduced-motion exit.
- **The window pin is a `{ passive: true }` listener that reads-and-returns** on the common case,
  and the bar state is plain React context: the resting screen publishes no var at all.

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
// app/nina/page.tsx — after requireUserId(); ?s= already resolved owner-scoped;
// the pending nina_turns claim and flashBlinkCount already read.
<NinaSidebar avatar={avatarView} sessions={rows} activeSessionId={activeSessionId} />
<ChatScreen
  key={activeSessionId ?? 'none'}
  initial={rows}            // ChatMessage[], oldest first, mapped on the server
  todayISO={todayInJakarta()}
  userId={userId}
  sessionId={activeSessionId}
  pending={pendingRun}      // RunAttachment | null, from ?attach=
  pendingPhoto={pendingPhoto} // NinaExistingPhoto | null, from ?photo=
  flight={ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)}
  avatar={avatarView}       // the SAME ninaAvatarView the sidebar gets
  flashBlinks={flashBlinkCount(process.env.NINA_FLASH_BLINKS)}
/>
```

### Gotchas

- **Do not render `description` anywhere in this package.** Not in a bubble, not in an `alt`, not
  in a chip. Invariant 5, and the mapping layer is field-by-field precisely so it cannot ride
  along.
- **Do not decide anything here that `lib/nina` could decide.** Decisions are pure functions with
  lib-side tests; component suites pin wiring, never rules. A new rule belongs in a
  `lib/nina/*.test.ts`.
- **Provider placement is load-bearing, and its failure is silent — for BOTH providers.** Both
  hooks return null outside a provider, indistinguishable from "not here". Keep both in `AppShell`,
  `NinaBarProvider` OUTSIDE `NinaSidebarProvider`, never a second of either in a page — the
  structural test guards the shape, because 2513 green unit tests did not notice when it broke
  (F35).
- **`NINA_BAR_VISIBLE_VAR` has one writer** (`ChatChrome`); `NINA_KEYBOARD_OVERLAP_VAR` has one
  setter (`KeyboardOverlapPublisher`). Mount the publisher (scoped to the fragment whose reader
  needs it); never subscribe to `visualViewport` yourself, never set either var by hand.
- **Do not widen the reassert's guards from the components.** `isKeyboardTextField`,
  `planBoxReassert`, the scroll options are `lib/nina/chatview`'s decisions with a test file
  waiting for each.
- **Do not add a dependency to `NinaSidebar`'s `open`-keyed effect.** The `Sheet.tsx` trap cost
  "one digit per keyboard"; the latest close reaches it through `closeRef`, and the reassert
  triggers and window pin live inside it for the same reason.
- **Do not call a close callback beside a `<Link>` push.** A back and a forward raced on one entry
  in production. Let the navigation close the panel.
- **Do not push a URL the server should spell.** The strip pushes `result.next`; `SessionRow`
  replaces the removal's `next`; `NewChatButton` replaces the create's `next`. A screen that
  spells `/nina?s=…` itself is a second grammar that can drift from `lib/nina/active.ts`.
- **Do not key `Composer` on anything that changes, and do not remove `MessageActionsSheet`'s
  key.** The same rule pointed in opposite directions, and each is right where it is.
- **Do not set `enterKeyHint` on the composer textarea.** `"send"` relabelled the return key the
  owner reads as DONE; the placeholder carries the hint, and the return key makes a newline.
- **Do not add `text-[15px]` to an input** or drop any control below 44 px. Both floors have
  recorded reports behind them.
- **Do not write a second upload path or re-upload an existing photo.** `attachExisting` is an id
  the server proves ownership of; a `deduped` tile sends `imageId`, never its `url`;
  `contentHashes` is keyed by the STORED pathname — never index-aligned, never uppercased by hand.
- **Do not sort sessions, jobs or search hits client-side.** The order is the SQL's.
- **Do not add a keyframe here.** Transitions only; both keyframes live in `app/globals.css`,
  neutralised under `prefers-reduced-motion` there. `motion-reduce:transition-none` lives at the
  sidebar because a transition has no name to redefine.
- **Do not reintroduce `bg-paper-2` as an inset surface.** RULING E1: `bg-ink-3/20`.
- **Do not add a URL writer to `ChatScreen`'s commit.** New parameters join the mount-time strip
  effect's by-name delete list; `?s=` and `?at=` must survive it. History writes read
  `window.location.search`, never the `searchParams` snapshot.
- **Do not give `TypingIndicator`'s avatar a required-looking default upstream.** Optional at the
  leaf, required at every hop above — that asymmetry is how the "typing row ignores the album" bug
  got fixed and stays fixed.
- **A component suite asserts wiring, a text guard asserts structure, and neither spells the
  string the other forbids.** The runner config is singular (F01 owns it); `happy-dom` arrives per
  file via docblock, never a second config.

## Notes

**Known, accepted limitations**: `NinaSearchField`'s semantic pass costs a model call per debounced
query (700 ms debounce, `shouldRunSemantic` gates it); Server Actions serialize the describe
pre-pass and the dedup pre-check per tile; the unread dot is global across sessions (mark-read is
session-scoped); the sidebar panel keeps its rows in the DOM while closed (`inert`, not
unmounted); a repeated soft-nav `?jump=` to a byte-identical URL may deduplicate into no re-land
(the first tap landed; a nonce in the URL was rejected).

History in brief: F33 built her page, album and the first attach; F34 added the album-photo
handoff; F35 added sessions, the sidebar, the search field and `?jump=`; F36 split the send from
the turn (poll + staggered reveal); `search-jump-pinpoint` landed the soft-nav landing;
`search-clear-and-sidebar-icons` made the row actions icon-only, rebuilt the sidebar as a
two-deck column, and added the keyboard reassert's clock; `photo-send-chat-icons` made the strip
two sends (P2-CN-A000) and extracted the keyboard channel (P1-CN-A001); `search-kbd-and-up-btn`
pinned the window (P1-CN-A005) and made the rail's `up` the bar toggle through the shared
`NinaBarProvider` (P1-CN-A002); `media-dedupe` (4/4, 2026-09-10/11) put the hash before the bytes;
`job-photo-link` pointed the detail card at the earliest bubble and the photograph.

## Recent changes

- **2026-09-12 — this compaction.** Cut from 1017 lines to ~half by converting phase narrative to
  present tense and merging the duplicated changelogs (the old header blob and the four
  `Documentation Created` entries said the same things twice). Every claim re-verified against the
  tree: prop surfaces, `lib/nina` export names, the `turnflight` constants, the test inventory,
  the `lucide-static`-is-not-a-dependency fact, `ABOUT_JOB_LIMIT`'s home. Corrections folded in
  are the entries below.
- **2026-09-11 — `nina-offline-reply` (P1-RI-A038 + P1-RI-A039).** The cold load's `awaiting`
  became the poll's own disjunct (fresh `nina_turns` claim via the page's sixth `Promise.all`
  read), and `NINA_TURN_POLL_GIVE_UP_MS` moved from the 90 s stale identity to
  `NINA_BACKGROUND_BUDGET_MS` (240 s), so a living chained burst is no longer declared dead
  offline. Phase 2 moved the send runner into the server-only `turnrun.ts`/`turnrevive.ts`; this
  package's surface did not change.
- **2026-09-11 — `nina-dup-bubble-reveal` (P1-NIN-A034).** `appendNewBubbles` made the reveal's
  append id-idempotent after prod rendered 7 bubbles for 4 rows.
- **2026-09-11 — detail card + jump.** The Prompt section is gone — one "Catatan foto" section
  renders `sidecar ?? prompt` (517ff2e); the jump targets the earliest bubble carrying the
  photograph (93d981a).
- **2026-09-11 — the component-test campaign.** 31 co-located `happy-dom` suites, one per module
  except `types.ts` (7a40ee2 → 247f506). The old claim that this package could not be rendered in
  a test was falsified by them; the Overview and Reverse Dependencies sections now describe the
  real layout.
- **2026-09-11 — perceptual twin gate (P1-NIN-A035).** `applyPerceptualKeepers` in
  `lib/nina/dedupe.ts` folds same-photo/different-resolution re-uploads onto their keeper.
- **2026-09-10 — `media-dedupe` completed (4/4).** Phase 2 (P1-CN-A004) is the composer + send
  split documented above; phases 3/4 covered the other write paths, the backfill and the sweep.
  The "phase 2 of 4 now running" note this file used to carry is retired.
- **2026-09-10 — deep-link close + download.** The `returnTo` prop and the three-rung close
  (e3b34e1); `useSavePhoto` shared across all four photo surfaces, the strip gained its download,
  and `ChatPhotoActions` became a thin wrapper (e7c5a18).
- **2026-09-10 — `job-photo-link` (P1-RI-A032 + P1-RI-A033).** The about codec moved to
  `lib/nina/album.ts` with `resolvedPhoto`; `NinaJobDetail`'s control row became the two icon-only
  `ButtonLink`s.
- **2026-09-10 — flash ring (P2-CN-A003).** His bubbles' landing flash takes the bubble's own
  `--ink` fill, superseding the one-night white.
- **2026-09-09 — bar + window + publisher.** `NinaBarProvider` and the bar-lift geometry
  (P1-CN-A002), the window pin (P1-CN-A005), `KeyboardOverlapPublisher` and the strip's box fix
  (P1-CN-A001), the strip's two sends (P2-CN-A000). First documented 2026-09-09 by two independent
  `/update-readme` passes on two branches, merged here against the reconciled tree.
