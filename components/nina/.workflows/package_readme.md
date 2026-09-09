# Package: components/nina

**Location**: `components/nina`
**Last Updated**: 2026-09-09 13:16 (P1-CN-A002 — shared bar state, the rail's `up` toggle, the panel's bar-lift geometry)

## Overview

Nina's entire runner-facing UI: the chat screen (`ChatScreen` and its conversation surface), the
hidden full-screen sidebar (session list, search, the bottom icon rail), the About/album screen,
the image-generation jobs screens, and the unread dot on the tab bar. Everything here is
presentational React — components own gesture handling, DOM geometry and hydration, while every
decision that can be asserted without a DOM lives one level down in `lib/nina/*`
(invariant 7: this repo's vitest runs `environment: 'node'`, so no component is ever rendered in a test).

**Key Responsibilities:**
- Render the `/nina` conversation: day-grouped message list, bubbles with quote/photo/run slots,
  the composer with its pinned draft attachments, optimistic sends and reply/edit gestures
- Render the sidebar panel — an overlay held open by `?sidebar=1` in the URL, not a route — with
  its provider/trigger/panel trio, session list, search field and four-icon bottom rail
- Hold `/nina`'s tab-bar state ONCE (`NinaBarProvider`) so its two controls — the chat page's
  floating toggle and the sidebar rail's `up` — can never disagree (see
  [The shared bar state](#the-shared-bar-state-ninabarprovidertsx) below)
- Keep iOS Safari's keyboard reveal from moving the panel or the page behind it (see
  [the `[open]` effect](#the-open-effect-and-the-keyboard-reveal-guard) below)
- Serve the About screen (avatar, album grid, PhotoViewer with attach controls) and the jobs
  list/detail screens
- Ship the unread badge as a Server Component passed as a prop into the client `TabBar`

## Module Inventory

| File | Exports | Role |
| --- | --- | --- |
| `types.ts` | `ChatRole`, `ChatMessageState`, `ChatMessage`, `ChatAvatar` | View models the client renders. **Not database rows** — `app/nina/page.tsx` maps `lib/nina/queries.ts` rows onto these, and that mapping is the only place that knows the schema |
| `ChatScreen.tsx` | `ChatScreen` | The conversation screen orchestrator (largest file in the package): send/resend/poll, optimistic rows, `?s=`/`?attach=`/`?photo=` parameter handling, keyboard-overlap measurement (`--nina-kb-overlap`), typing indicator, `PhotoViewer` wiring |
| `MessageList.tsx` | `MessageList` | Day grouping, auto-scroll decisions (`decideAutoScroll`), quote resolution, scroll-mark restore |
| `MessageBubble.tsx` | `MessageBubble` | One message: two sides, `above`/`quote` slots, reply/edit swipe + tap gestures |
| `MessageActionsSheet.tsx` | `MessageActionsSheet` | Rewrite/remove sheet (`Sheet.tsx` modal — chosen because it changes no document geometry) |
| `Composer.tsx` | `Composer`, `ComposerDraftImage` | Text input, photo pick + client compression, Blob upload, pinned draft chips, quote stub |
| `ChatImages.tsx` | `ChatImages` | Photos inside a bubble (plain `<img>`; RULING E1's `bg-ink-3/20` inset surface) |
| `RunAttachmentCard.tsx` | `RunAttachmentCard` | A run inside the bubble and the door back to it (uses `useChatScrollMark`) |
| `QuoteStub.tsx` | `QuoteStub` | WhatsApp-style quoted strip above bubble text and above the composer |
| `AttachmentChip.tsx` / `PhotoAttachmentChip.tsx` | each | Pinned run / pinned photo on the composer. Deliberately two components, not a union prop |
| `TypingIndicator.tsx` | `TypingIndicator` | Reuses `LoadingDots` + the app's one `ri-pulse` keyframe; `aria-hidden` |
| `useChatScroll.ts` | `readAnchorRows`, `useChatScrollMark` | R14's DOM half: read `[id^="nina-msg-"]` anchors, write the scroll mark with `history.replaceState` |
| `ChatChrome.tsx` | `ChatChrome` | `/nina`'s chrome: every bar EFFECT — focus sync, auto-hide timer, the one `NINA_BAR_VISIBLE_VAR` publisher, the panel-fields-hide-the-bar rule — plus the floating `>`/toggle lane; reads the bar state from `NinaBarProvider` instead of owning it (R2) |
| `NinaBarProvider.tsx` | `NinaBarProvider`, `useNinaBar` | The shared bar state (R2): one `NinaBarState` + one `dispatch`, and the state machine's ONLY component importer. See [The shared bar state](#the-shared-bar-state-ninabarprovidertsx) |
| `NinaSidebar.tsx` | `NinaSidebarProvider`, `useNinaSidebar`, `NinaSidebarTrigger`, `NinaSidebar`, `NinaSidebarAvatar` | The hidden full-screen panel. See [The sidebar surface](#the-sidebar-surface) |
| `SessionList.tsx` / `SessionRow.tsx` | each | The chat history list and its row (rename/pin/remove; decides nothing itself) |
| `NinaSearchField.tsx` | `NinaSearchField` | Debounced search + persisted semantic toggle; its hits are `<Link>`s |
| `NewChatButton.tsx` | `NewChatButton` | R2's create control — closes first, `router.replace`s on refusal |
| `NinaUnreadBadge.tsx` | `NinaUnreadBadge` (async Server Component), `NinaUnreadBadgeSlot` | Unread dot; the Slot adds the `Suspense` boundary so `AppShell` stays synchronous |
| `NinaUnreadSync.tsx` | `NinaUnreadSync` | Revalidates the dot the runner just read out of existence (`after()` ordering bug) |
| `NinaAvatar.tsx` | `NinaAvatar`, re-exports `NINA_AVATAR_SRC` | Her face in a circle; the package's one `next/image` call site |
| `NinaAboutScreen.tsx` | `NinaAboutScreen` | About page: avatar, album grid, viewer, attach-to-chat controls |
| `NinaPhotoGrid.tsx` | `NinaPhotoGrid`, `NinaGridCell` | Square grid shared by album and gallery |
| `NinaJobList.tsx` / `NinaJobDetail.tsx` / `NinaJobActions.tsx` / `NinaJobElapsed.tsx` | each | The "Proses foto" jobs list, detail, redo/delete actions, ticking elapsed clock |
| `useSemanticPref.ts` | `useSemanticPref` | The codebase's first `localStorage` — the semantic-search toggle, cross-tab via `useSyncExternalStore` |

Client/server split: everything is `'use client'` except `AttachmentChip`, `ChatImages`,
`NinaAvatar`, `NinaUnreadBadge` (an async Server Component), `PhotoAttachmentChip`,
`TypingIndicator` and `types.ts` — the first five compile into whichever client graph imports them,
which is the documented mechanism by which a server-rendered node reaches the client `TabBar`.

## Exported API

### View-model types (`types.ts`)

```ts
type ChatRole = 'user' | 'nina'
type ChatMessageState = 'sending' | 'sent' | 'failed'
interface ChatMessage {
  id: string
  role: ChatRole
  body: string                    // plain text — there is no markdown renderer in this app
  dayISO: string                  // Asia/Jakarta day, computed on the server only
  state: ChatMessageState
  replyToId: string | null        // raw id; whether it renders as a quote is MessageList's question
  imageUrls?: readonly string[]   // public Blob URLs, at most NINA_MAX_CHAT_IMAGES
  imageIds?: readonly string[]    // parallel array — the attach-existing feature needs row ids
  imageKinds?: readonly string[]  // parallel array — 'upload' | 'generated', NOT derivable from role
  attachment?: RunAttachment | null
}
interface ChatAvatar {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
}
```

The three parallel arrays exist because replacing `imageUrls` with an object array would be a
breaking change to `app/nina/page.tsx`'s mapping (RULING E2b). `imageKinds` is required because a
runner re-attaching one of Nina's selfies writes `kind: 'generated'` onto a `role: 'user'` message.
The `description` column is deliberately absent and must never be added (invariant 5).

`NinaSidebarAvatar` (in `NinaSidebar.tsx`) is structurally identical to `ChatAvatar` and
deliberately a separate declaration: the sidebar is a sibling of `<main>`, and `ChatScreen`
importing from `NinaSidebar.tsx` would contradict `ChatChrome.tsx`'s stated boundary.

### The sidebar surface (`NinaSidebar.tsx`, 849 lines)

#### `NinaSidebarProvider`
```tsx
function NinaSidebarProvider({ children }: { children: React.ReactNode })
```
Holds the URL-derived `open` flag (`isSidebarOpen(searchParams.get('sidebar'))`) plus one shared
`pushedRef` — "did THIS session push the history entry". The provider exists because the `>`
trigger lives in `ChatChrome` (rendered by `AppShell` as a sibling of `<main>`) while the panel is
rendered by the page: two subtrees that must agree about whether a close pops or replaces. Closing
calls `window.history.back()` when this session pushed and `replaceState` when it did not.

`openSidebar` reads `window.location.search`, **not** the `searchParams` snapshot — `ChatScreen`
strips `?attach=`/`?photo=` with a mount-time `replaceState` behind React's back, so a snapshot can
be one write stale, and writing one back would resurrect a consumed parameter (re-arming an album
photo for a second send).

#### `useNinaSidebar`
```ts
function useNinaSidebar(): { open: boolean; openSidebar: () => void; closeSidebar: () => void } | null
```
Returns **null outside a provider, on purpose**: a `ChatChrome` on a screen with no sidebar draws
no `>` and needs no flag for it. This null is silent by design and is the subject of the
provider-placement gotcha below.

#### `NinaSidebarTrigger`
```tsx
function NinaSidebarTrigger({ className }: { className?: string })
```
The floating `>` at the bottom-left of the chat. Carries **no positioning of its own** — it
renders a bare 44 px button (`NINA_CHROME_CONTROL_CLASS`) and takes a `className` for whoever
places it, because `ChatChrome` owns the floating-control geometry and spelling it a third time is
how a control ends up under the keyboard on one device.

#### `NinaSidebar`
```tsx
function NinaSidebar(props: {
  avatar: NinaSidebarAvatar
  sessions: readonly SidebarSession[]      // already ordered by listNinaSessions; never re-sorted
  activeSessionId: string | null
  searchSlot?: React.ReactNode             // default: <NinaSearchField />
  newChatSlot?: React.ReactNode            // default: <NewChatButton onNavigate={() => closeRef.current()} />
})
```
The always-mounted full-screen overlay. `inert={!open}` covers the keyboard/screen-reader cost of
not unmounting; `-translate-x-full → translate-x-0` with `transition-transform` (no keyframe, so
`tests/motion.reducedMotion.test.ts` has nothing to guard) plus `motion-reduce:transition-none` at
the one site that needs it. The inline `bottom` is `PANEL_BOTTOM_CSS` — `panelBottomCss`'s string,
held at module level because every input is a constant: the keyboard's measured top edge
(`--nina-kb-overlap`), plus — while the bar shows — the bar's clearance and the safe-bottom the bar
pads itself by, so the revealed bar renders in a reachable strip BELOW the panel's opaque `z-50`
fill. The string is constant, the vars underneath it move, and `transition-transform` being
transform-only is why the edge snaps with the keyboard and with the bar.

Both slots have defaults and are **replace**, not additive. The layout is a two-deck column: a
scroll deck (`flex-1 overflow-y-auto overscroll-contain` — header with avatar link, title and ✕,
search slot, `SessionList`; it keeps **no ref** — the scroll-to-top handle is gone with R2's
repurposing of `up`, so nothing scrolls the deck programmatically any more) over a pinned
four-icon rail (`>` close, `up` bar toggle, `+` new chat, wand → `/nina/jobs`). The rail's floor
`RAIL_PAD_BOTTOM_CSS` is the composer's own padding floor **quoted, not called** — both of
`composerPadBottomCss`'s gates are re-spelled in CSS (subtract the overlap var; and, since R2, the
bar gate too — the panel now LIFTS above the bar instead of covering it, so an ungated floor would
double-count the inset the bar's own `padding-bottom` carries) and the comment in the file is the
pin: change the floor in `composerPadBottomCss`, change it here.

### The shared bar state (`NinaBarProvider.tsx`)

#### `NinaBarProvider`
```tsx
function NinaBarProvider({ children }: { children: React.ReactNode })
```
Holds one `NinaBarState` (`'hidden' | 'shown'`, resting `'hidden'`) in local state — moved out of
`ChatChrome`'s `useState` by R2. The provider exists because the rail's `up` and the chat page's
toggle must move ONE bar, and the panel is `ChatChrome`'s SIBLING: `AppShell` renders `<main>`
(the panel rides in through the page) and the chrome side by side, so no prop chain reaches from
one to the other, and two local states would be two bars that can disagree. Same shape of problem
as `NinaSidebarProvider`'s `pushedRef`, same answer — one provider around the same `shell` node,
mounted in `AppShell` beside the sidebar's (`NinaBarProvider` wraps `NinaSidebarProvider`, which
still encloses `{shell}` directly; the structural test pins that nesting).

The resting state is `'hidden'` — `/nina`'s and every screen's: the provider is mounted only on
the chat screen, and nothing publishes `NINA_BAR_VISIBLE_VAR` until `ChatChrome`'s own effect sees
`'shown'`.

#### `useNinaBar`
```ts
function useNinaBar(): { bar: NinaBarState; dispatch: (event: NinaChromeEvent) => void } | null
```
Null **outside a provider, on the `useNinaSidebar` precedent**: a consumer mounted outside its own
provider degrades instead of crashing the screen. Unreachable today — `AppShell` mounts the
provider around both consumers — and the structural test in `tests/nina.sidebarProvider.test.ts`
is what keeps it so.

- `dispatch` is the state machine's **only door**. `NinaBarProvider.tsx` is the only component
  that imports `lib/nina/chrome.ts`'s `nextBarState`; consumers name events, not methods —
  `dispatch('toggle' | 'autohide' | 'composer-engaged' | 'composer-released')` — so every call
  site reads as the machine's own rule and there is no second way to say "be hidden". `'toggle'`
  has exactly two senders, both buttons (the chat page's and the rail's); the other two non-noop
  events are `ChatChrome`'s effects'.
- `dispatch` has stable identity (`useCallback` with empty deps), so consumers may name it in
  their own effect dependency arrays without re-subscribing.
- The var's writer set is unchanged: `ChatChrome` is still the ONE writer of
  `NINA_BAR_VISIBLE_VAR`, and the rail's button reading this state costs no var and no writer.

### Hooks

#### `useChatScroll` (`useChatScroll.ts`)
```ts
function readAnchorRows(): ScrollAnchorRow[]   // [id^="nina-msg-"] in document order, document coords
function useChatScrollMark(): {
  mark: ChatScrollMark | null   // decoded once per render of the URL
  saveMark: () => void          // measure now, write ?ms= onto this entry via history.replaceState
}
```
No ref registry, no observer: `MessageBubble`'s `id` attributes are the entire mechanism. Writes
go through `window.location.search`, never the hook's snapshot.

#### `useSemanticPref` (`useSemanticPref.ts`)
```ts
function useSemanticPref(): readonly [boolean, (next: boolean) => void]
```
The semantic-search toggle, persisted in `localStorage` (`NINA_SEMANTIC_PREF_KEY`). Built on
`useSyncExternalStore` so the server render *and hydration* read `getServerSnapshot` (`false`) and
the stored value flips one frame after hydration — the documented contract, not a mismatch. A
module-level `storage` listener set keeps two tabs in agreement, and every `localStorage` access
is guarded: a throw (private mode, full quota) falls back to a module-level value, so the toggle
keeps working for the life of the tab and simply does not survive a reload.

### Screen and leaf components

`ChatScreen`, `NinaAboutScreen`, `NinaJobList`, `NinaJobDetail` take server-resolved props and own
no data fetching; `app/nina/*` pages are their only callers (see Reverse Dependencies). `NinaJobElapsed`
takes `nowMs` as a prop so the first client render reads the server's clock — the hydration
mismatch its whole content would otherwise be.

## Internal Architecture

### The `[open]` effect and the keyboard-reveal guard

`NinaSidebar`'s show-time `React.useEffect` is keyed on **`open` alone** and carries everything
that must happen while the panel is showing. (The file's other component-body effect is the
two-line `closeRef` sync, keyed on `sidebar`; this is the one with the rule.) The keying is the
`Sheet.tsx` trap's answer: `Sheet` had
`onClose` in the dependency array of an effect that also calls `panelRef.current?.focus()`, and
with inline-arrow call sites every keystroke re-ran the effect and dropped the iOS keyboard. This
panel contains the rename field, so the latest close callback reaches the effect through
`closeRef` instead. **Do not add a dependency to that array** — a keystroke changes `SessionRow`'s
local state, not `open`.

While open, the effect: locks body scroll, focuses the panel div itself (not the search field —
the panel is opened from a chat whose composer may already hold the keyboard), installs a
document-level Escape handler via `closeRef`, and runs the two-channel defence against iOS Safari's
focus reveal:

1. **The deck channel (pre-existing).** The panel's own `overflow-y-auto` container gets scrolled
   by the reveal even when the field is already visible. A delegated `focusin` listener on the
   panel arms the `KEYBOARD_REASSERT_DELAYS_MS` schedule (`[0, 120, 300, 600, 1000]`, from
   `lib/nina/chatview.ts`); each tick re-asserts `target.scrollIntoView({ block: 'nearest',
   behavior: 'instant' })`, which walks every scrollable ancestor and corrects whichever one moved.
   Idempotent — `nearest` on a visible element computes zero.

2. **The window channel (added by phase P1-CN-A001).** The conversation behind the opaque panel
   scrolls the *window* (`MessageList` calls `window.scrollTo`), and the reveal's second act pans
   the layout viewport — every `position: fixed` element rides up with it, panel included.
   `nearest` is structurally blind to that channel (a fixed element's layout geometry is unchanged
   by a window scroll, so for the root scroller it computes zero every time). The window therefore
   gets its own corrector that measures nothing and schedules nothing.

The window pin's five closure-local bindings, all inside the effect (so none can grow into a
dependency and break the keyed-on-`open`-alone rule):

- `focusedField: HTMLElement | null` — the text field the pin is armed for. The lifetime lock:
  the listener is added on arm and removed on disarm, and the `activeElement` check at fire time is
  the second lock on it.
- `capturedScroll: { x, y } | null` — the window offset read at focus-in, **before** the keyboard
  has moved anything (the reveal's pan rides the keyboard's rise, hundreds of ms later). This is
  the reading position the conversation behind the panel is owed back.
- `onWindowScroll` — the pin. A `window` `scroll` listener, `{ passive: true }`: returns when
  `activeElement !== focusedField` or the scroll is already 0/0, else
  `scrollTo({ left: 0, top: 0, behavior: 'instant' })`. Event-driven, so there is no timing hole —
  each frame of the keyboard-rise pan fires the event and is countered within it. Self-loop-safe by
  arithmetic: its own `scrollTo` fires a scroll whose handler reads 0/0 and returns.
- `disarmPin` — idempotent disarm: nulls `focusedField`, removes the listener, restores
  `capturedScroll` (returning early if the window is already there, so the restore cannot run twice
  against a capture that is already gone). Called from focus-out, from the arm path around a
  field→field move, and from the effect's cleanup.
- `onPanelFocusOut` — folds the pin when focus leaves the armed field (`event.target !==
  focusedField` returns). The panel div's own focus-out — from the `focus()` on open — arrives with
  `focusedField` still null and is a no-op, which is the guard's point.

Arm path (`onPanelFocusIn`): text fields only (`INPUT` / `TEXTAREA` / contenteditable — only a text
field raises the keyboard these correctors answer); a focus into a *different* field runs
`disarmPin()` first, re-captures, re-attaches, then cancels the running timer schedule and arms a
fresh one, so exactly one schedule is live at a time. Every tick double-checks
`document.activeElement === target` at fire time, so a blur turns each late tick into a no-op, and
each tick also pins the window (a no-op whenever the listener got there first). All writes are
`behavior: 'instant'` — the layout has already moved and a chase reads as a glitch.

Cleanup: removes all three listeners, clears the timers, calls `disarmPin()` itself rather than
trusting the blur (a panel closed over a focused field tears the effect down, and whether that
field's `focusout` has been delivered is not observable from here), restores the body overflow, and
refocuses `previouslyFocused`. There is deliberately **no second `visualViewport` subscription**
(invariant 2) — neither corrector measures.

### Provider/trigger/panel topology

`AppShell` (a Server Component) wraps its whole shell in TWO providers when `screen === 'chat'` —
`NinaBarProvider` around `NinaSidebarProvider` around `{shell}` — which puts `{children}` (the
page → the panel) and `ChatChrome` (→ the trigger and the chat page's bar toggle) under both. The
sidebar provider is the original: its `pushedRef` is the one piece of state the trigger and the
panel must agree about. The bar provider is R2's, on the same argument — the rail's `up` (inside
`{children}`) and `ChatChrome`'s toggle must move one bar state. The bar provider sits OUTSIDE so
the sidebar provider keeps enclosing `{shell}` directly, which is the shape the structural test's
first describe pins. `app/nina/page.tsx` renders either provider a second time **never** — the
structural test asserts the sidebar one's absence, and the page contains `<NinaSidebar` but no
`<NinaSidebarProvider>`.

Rendering a client provider from `AppShell` is a boundary, not a conversion: the file has no
`'use client'` and must not gain one (five server pages import it; `tests/share.bundle.test.ts`
exists because that import graph leaked a session read once already).

### The bar: one state, two buttons, one var writer

The decision half stays in `lib/nina/chrome.ts` (`nextBarState`, `autoHideDelayMs`,
`isControlVisible`, `barToggleGlyph`) — pure, unit-tested, reachable from a node-environment suite.
`NinaBarProvider` owns the state and the single `dispatch`; `ChatChrome` owns every EFFECT, none of
which changed in kind when the state moved out of it:

- **the focus sync** — a `document`-level `focusin`/`focusout` pair that computes "a keyboard is
  up" and dispatches `'composer-engaged'` when it is. The composer's textarea is one surface; R2
  adds the second: any text field (`INPUT` / `TEXTAREA` / contenteditable) inside the sidebar
  panel's `[role="dialog"]`. `chrome.ts`'s rule is about KEYBOARDS, not about the composer — a bar
  shown under a keyboard is shown and invisible — and the panel's search and rename fields raise
  the same keyboard. `focusout` is read one task later (`setTimeout(0)`), which is what keeps the
  textarea→Send move — and now the panel's search→rename move — from blinking the bar.
- **the auto-hide timer** — `autoHideDelayMs(bar, keyboardEngaged)`: 5 s, restarted by a toggle
  through the effect cleanup, paused while a keyboard is up anywhere (a panel field just hid the
  bar anyway).
- **the `NINA_BAR_VISIBLE_VAR` publisher** — set only while the state is `'shown'`, removed on
  hide and on unmount. Still `ChatChrome`, still one effect, still the var's ONLY writer.
  `NinaSidebar` reads it (`PANEL_BOTTOM_CSS`'s lift, `RAIL_PAD_BOTTOM_CSS`'s gate) and never
  writes it.

The predicate over DOM types (`isTextFocusInDialog`) lives in `ChatChrome`, not in `lib/` — that
file's signatures carry no DOM types. Its field half is spelled twice on purpose: the panel's own
`focusin` filter (in the `[open]` effect above) filters its assert listener, this one filters the
bar's engage rule — different questions about the same DOM. The dialog half is `[role="dialog"]`:
the panel is the only dialog mounted on `/nina` that contains text fields, so `closest` reads
membership without `ChatChrome` holding a ref into another component's DOM.

The geometry half is `lib/nina/chatview.ts`'s new `panelBottomCss`: the keyboard term the panel
already carried, plus a bar term — `(${clearance}px + var(--safe-bottom)) *
var(--nina-bar-visible, 0)` — with the inset INSIDE the multiplication, so the hidden geometry
stays byte-equal to the pre-R2 string. The two terms can sum for a frame (rail tap, then a field
tapped; the keyboard rule hides the bar a commit later), which is the honest arithmetic for two
independent `:root` channels. The clearance is `TAB_BAR_OUTER_HEIGHT_PX` passed as an argument —
`lib/` never imports `components/` — and the pure arithmetic is unit-tested in
`lib/nina/chatview.test.ts`.

### Data Flow

Server pages (`app/nina/page.tsx`, `app/nina/about/page.tsx`, `app/nina/jobs/*`) read the database
through `lib/nina/queries` and the view builders, map rows onto `types.ts` / `SidebarSession` /
job-view props, and render these components. Gestures call Server Actions from `lib/nina/*`
(`sessionActions`, `searchActions`, `jobActions`, `albumActions`, `actions`) and either refresh or
patch optimistic state (`ChatMessageState: 'sending' → 'sent' | 'failed'`). UI state that must
survive a navigation lives in the URL (`?sidebar=1`, `?s=`, `?attach=`, `?photo=`, the scroll
mark), written with `pushState`/`replaceState` against `window.location.search`. The one exception
is `useSemanticPref`'s `localStorage` key, argued in its header: the preference has no server
consumer and must survive across app usage, which a query parameter on one history entry cannot do.
The bar state is the mirror case: React context in `NinaBarProvider`, deliberately in no URL and no
storage — it is chrome, not navigable state, so it resets to `'hidden'` whenever the chat screen's
provider unmounts. Geometry that must cross between sibling components travels the other published
channel, the `:root` custom properties (`--nina-kb-overlap`, `--nina-bar-visible`).

## Dependencies

### External Packages
- `react` — every file; hooks up to `useSyncExternalStore` (the localStorage store)
- `next/link`, `next/navigation` (`useSearchParams`, `useRouter`), `next/image` (one call site:
  `NinaAvatar` — committed local art at unknown intrinsic size; Blob photos are plain `<img>`)
- `@vercel/blob/client` (`upload`) — `Composer`'s direct-to-Blob photo upload

### Internal Packages
- `lib/nina/*` is the load-bearing dependency — the components are the thin half of a deliberate
  split: `chatview` (keyboard overlap var, bar-visible var, reassert delays, auto-scroll, composer
  pad, `panelBottomCss`), `sidebar`
  (`SIDEBAR_PARAM`, `isSidebarOpen`, `withSidebarParam`, `planSessionList`, `SidebarSession`),
  `chrome` (`NINA_CHROME_CONTROL_CLASS`, the bar state machine — `nextBarState` has exactly one
  component importer, `NinaBarProvider.tsx`), `edit`, `reply`, `attach`, `scroll`, `search`,
  `crop`, `images`, `jobview`, `jobActions`, `sessionActions`, `searchActions`, `albumActions`,
  `unread`, `live`, `reveal`, `turnflight`, `album`, `chatphotos`. Rule of thumb: if a decision
  could be asserted in a node-environment test, it belongs there, not here
- `lib/cn`, `lib/id`, `lib/format`, `lib/date/ranges`, `lib/photos/save`, `lib/photos/compressForNina`,
  `lib/auth/requireUserId`
- `components/ui/*` — `Button`, `TabBar`, `Sheet`, `PhotoViewer`, `EmptyState`, `Field`, `CONTROL_CLASS`

### React Runtime
No worker or timer long-lived beyond an effect. `NinaSidebar`'s `[open]` effect installs and removes
`setTimeout` schedules (`reassertTimers`), a `passive` window scroll listener, panel
`focusin`/`focusout` listeners and a document `keydown` listener. `ChatChrome` owns the same shape
one level out: document `focusin`/`focusout` listeners, the one-task `setTimeout(0)` deferral (held
in a ref so it cannot fire after unmount), the auto-hide `setTimeout` and the `ResizeObserver` on
`#nina-composer` — each installed and removed by the effect that needs it. `useSemanticPref` holds
the only module-level state in the package (a listener `Set` and the write-failure fallback), which
is tab-lifetime by design.

## Reverse Dependencies

### Primary Consumers
- `app/nina/page.tsx` — `ChatScreen`, `NinaSidebar`, `NinaUnreadSync`, and the `ChatMessage` type;
  also the only place that maps DB rows onto the view models
- `components/ui/AppShell.tsx` — `ChatChrome`, `NinaBarProvider` and `NinaSidebarProvider` (both
  wrap the shell on the chat screen, bar outside sidebar), `NinaUnreadBadgeSlot` (passed as a prop
  into the client `TabBar`)
- `app/nina/about/page.tsx` — `NinaAboutScreen`
- `app/nina/jobs/page.tsx` — `NinaJobList`; `app/nina/jobs/[id]/page.tsx` — `NinaJobDetail`

### Test Consumers
- `tests/nina.sidebarProvider.test.ts` — structural assertions **on the source text** (no jsdom in
  this repo): the sidebar provider wraps the shell rather than sitting inside it, the page renders
  no second provider, the trigger still returns null outside a provider, and a search hit leaves
  the panel by navigation alone (plain `<Link>`, no `onClick` beside its href; the sidebar does not
  hand the search field its close callback). R2 adds a second describe with the same method: the
  bar provider exists with its nullable hook, `AppShell` mounts it OUTSIDE the sidebar provider
  around the same `{shell}` node (`/<NinaBarProvider>\s*<NinaSidebarProvider>\{shell\}/`), and both
  consumers — `ChatChrome` and `NinaSidebar` — read the state through `useNinaBar()`. Provider
  misplacement is invisible to every other gate: a consumer outside its provider takes the null
  branch and the control silently does nothing, all unit tests green

## Concurrency

This package is not designed for concurrent use in any cross-thread sense — it is React client
components on the main thread. The relevant guarantees:
- Every listener and timer is installed and removed by the same effect; the pin listener's lifetime
  is doubly bound (removed on disarm, `activeElement` check at fire time)
- `useSemanticPref`'s module state is intentionally shared across mounts and synchronized across
  tabs via the `storage` event
- `NinaUnreadBadge` is an async Server Component and is never awaited on the client — the
  `Suspense` boundary in `NinaUnreadBadgeSlot` is the only concurrency surface

## Error Handling

No custom error types and no thrown errors cross this package's boundary. Failure modes:
- Server Actions return result unions (`NinaSessionActionResult`, `NinaJobActionResult`,
  `NinaPickRejectionReason`, …) that components render as refusals, never as exceptions
- A failed send becomes `ChatMessageState: 'failed'` on the optimistic row — the text stays in the
  bubble; resend is offered through `canResendMessage`
- `localStorage` throws are caught in `useSemanticPref` and degrade to tab-lifetime memory; a
  broken control must never be the degradation
- Photo saving picks a strategy (`chooseSaveStrategy`) instead of assuming `<a download>` works —
  cross-origin, the attribute is ignored and the browser navigates

## Performance

- Plain `<img>` for every Blob-backed photo (already compressed to ~120–200 KB by the writer; a
  paid `next/image` transform buys nothing); `next/image` only for `NinaAvatar`
- The search field debounces (`searchDebounceMs`); the reassert schedule is bounded (five ticks)
  and cancelled on refocus and on cleanup
- The window pin is a `{ passive: true }` listener that reads-and-returns on every scroll where
  nothing is wrong — the common case
- The panel is always mounted: that trades DOM for the removal of both a double-rAF mount dance and
  a `transitionend`-based exit that would strand the panel open under reduced motion
- `transition-transform` only, so the keyboard edge snaps instead of lagging a transition

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
```tsx
// app/nina/page.tsx — panel + screen as siblings, server-mapped props
<NinaSidebar avatar={…} sessions={…} activeSessionId={…} />
<ChatScreen initial={…} todayISO={…} userId={…} sessionId={…} … />
```

### Gotchas
- **Provider placement is load-bearing and its failure is silent — for BOTH providers now.**
  `NinaSidebarTrigger` and `useNinaBar` both return null outside a provider, and a null is
  indistinguishable from "no sidebar here" / "the bar is just hidden". This exact bug shipped once
  (F35: the page's provider was inside `{children}` while `ChatChrome` was a sibling of it, and
  2513 green tests did not notice). The structural test now guards the shape for the sidebar
  provider AND the bar provider; keep both in `AppShell`, keep `NinaBarProvider` OUTSIDE
  `NinaSidebarProvider` so the sidebar one still encloses `{shell}` directly, and never add a
  second of either in a page
- **`NINA_BAR_VISIBLE_VAR` has one writer.** `ChatChrome`'s publish effect sets it while the bar
  is shown and removes it otherwise; `NinaSidebar` only READS it (the panel's lift, the rail
  floor's gate). A second writer is how the panel and the bar start disagreeing about where the
  glass ends
- **Do not add dependencies to the `[open]` effect.** A keystroke inside the rename field must not
  re-run it — that is the `Sheet` trap that cost one digit per keyboard
- **Never fire `closeRef` beside a `<Link>`'s push.** The close path pops a pushed entry; running
  both in one tick races a back against a forward on the same entry (measured in production,
  2026-09-08, on this panel's own search hits). Links leave the panel by navigation alone — their
  hrefs carry no `sidebar` key
- **History writes read `window.location.search`, never the `searchParams` snapshot** — `ChatScreen`'s
  mount-time `replaceState` can be one write ahead of React
- **`RAIL_PAD_BOTTOM_CSS` quotes `composerPadBottomCss`** — the halving and the 3.25px are that
  function's and `TabBar`'s numbers, and since R2 BOTH gates are re-spelled: the overlap
  subtraction and the `* (1 - var(--nina-bar-visible))` complement (the panel lifts above the bar
  now, so an ungated floor double-counts the inset the bar's own padding carries). Change the
  floor or its gates there, change them here. The same holds for the panel's own
  `PANEL_BOTTOM_CSS`: it is `panelBottomCss`'s string with `TAB_BAR_OUTER_HEIGHT_PX` as the
  clearance, held at module level precisely so it never re-renders
- **The `description` column never reaches a client component** (invariant 5); likewise nothing in
  this package re-sorts `sessions` — `planSessionList` preserves `listNinaSessions`' order and the
  tests assert that it does
- **No component in this package is rendered by a test** (`environment: 'node'`). If you are about
  to introduce a decision that needs jsdom to verify, move it into `lib/nina/*` instead

## Notes

- Documentation Created: 2026-09-09 12:45 — initial creation via `/update-readme` for task
  P1-CN-A001 (the sidebar's window-scroll keyboard-reveal pin)
- Updated: 2026-09-09 13:16 — P1-CN-A002 (the rail's `up` shows the main bar exactly like the chat
  page's toggle): added `NinaBarProvider.tsx` to the inventory and the API section, moved the bar
  state out of `ChatChrome`'s description into the shared provider, recorded the panel-fields
  hide-the-bar rule, the panel's `panelBottomCss` bar-lift, the rail floor's bar gate, and the
  removal of `listScrollRef`/`onScrollToTop` with the scroll-to-top handle
- The package's docstrings are the real specification; each file's header records the requirement
  (R-numbers), the alternative rejected, and the measurement that decided it. This README is a map
  of that territory, not a replacement for it
- The keyboard-reveal defence is two channels: the deck assert (`focusin` +
  `KEYBOARD_REASSERT_DELAYS_MS` → `scrollIntoView({ block: 'nearest' })`) and the window pin
  (capture at focus-in, `scrollTo(0, 0)` while focused, restore on focus-out and on cleanup). The
  plan for the pin is `.workflows/plan/P1-CN-A001.md`; its set-mate P1-CN-A002's plan is
  `.workflows/plan/P1-CN-A002.md`
- One drift note from P1-CN-A002, recorded because a future grep will trip on it again: a plan
  invariant promised exactly 3 dependency arrays in `NinaSidebar.tsx`, but the count is 5 at base
  and after the phase — the plan miscounted the base (two `}, [])` `useCallback` arrays and the
  `closeRef` sync predate it). The invariant itself holds: the `[open]`-keyed effect's array is
  exactly `[open]`, and no array gained a dependency
