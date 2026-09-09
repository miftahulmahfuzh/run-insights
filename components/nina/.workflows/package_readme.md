# Package: components/nina

**Location**: `components/nina`
**Last Updated**: 2026-09-09 12:45 (initial creation)

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
| `ChatChrome.tsx` | `ChatChrome` | `/nina`'s chrome: tab bar auto-hide, floating pull-up control, renders `NinaSidebarTrigger` |
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

### The sidebar surface (`NinaSidebar.tsx`, 803 lines)

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
the one site that needs it. The inline `bottom: var(--nina-kb-overlap, 0px)` ends the panel's box
at the keyboard's measured top edge — the string is constant, the var underneath it moves, and
`transition-transform` being transform-only is why the edge snaps with the keyboard.

Both slots have defaults and are **replace**, not additive. The layout is a two-deck column: a
scroll deck (`flex-1 overflow-y-auto overscroll-contain`, held by `listScrollRef` — header with
avatar link, title and ✕, search slot, `SessionList`) over a pinned four-icon rail (`>` close,
`up` scroll-to-top, `+` new chat, wand → `/nina/jobs`). The rail's floor `RAIL_PAD_BOTTOM_CSS` is
the composer's own padding floor **quoted, not called** — its two gates are re-spelled in CSS
(subtract the overlap var; drop the tab-bar gate because the `z-50` panel covers the bar) and the
comment in the file is the pin: change the floor in `composerPadBottomCss`, change it here.

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

`NinaSidebar`'s one `React.useEffect` is keyed on **`open` alone** and carries everything that must
happen while the panel is showing. The keying is the `Sheet.tsx` trap's answer: `Sheet` had
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

`AppShell` (a Server Component) wraps its whole shell in `NinaSidebarProvider` when
`screen === 'chat'`, which puts `{children}` (the page → the panel) and `ChatChrome` (→ the
trigger) under one provider. `app/nina/page.tsx` renders a second provider **never** — the
structural test asserts its absence.

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

## Dependencies

### External Packages
- `react` — every file; hooks up to `useSyncExternalStore` (the localStorage store)
- `next/link`, `next/navigation` (`useSearchParams`, `useRouter`), `next/image` (one call site:
  `NinaAvatar` — committed local art at unknown intrinsic size; Blob photos are plain `<img>`)
- `@vercel/blob/client` (`upload`) — `Composer`'s direct-to-Blob photo upload

### Internal Packages
- `lib/nina/*` is the load-bearing dependency — the components are the thin half of a deliberate
  split: `chatview` (keyboard overlap var, reassert delays, auto-scroll, composer pad), `sidebar`
  (`SIDEBAR_PARAM`, `isSidebarOpen`, `withSidebarParam`, `planSessionList`, `SidebarSession`),
  `chrome` (`NINA_CHROME_CONTROL_CLASS`, bar state), `edit`, `reply`, `attach`, `scroll`, `search`,
  `crop`, `images`, `jobview`, `jobActions`, `sessionActions`, `searchActions`, `albumActions`,
  `unread`, `live`, `reveal`, `turnflight`, `album`, `chatphotos`. Rule of thumb: if a decision
  could be asserted in a node-environment test, it belongs there, not here
- `lib/cn`, `lib/id`, `lib/format`, `lib/date/ranges`, `lib/photos/save`, `lib/photos/compressForNina`,
  `lib/auth/requireUserId`
- `components/ui/*` — `Button`, `TabBar`, `Sheet`, `PhotoViewer`, `EmptyState`, `Field`, `CONTROL_CLASS`

### React Runtime
No worker or timer long-lived beyond an effect: `setTimeout` schedules (`reassertTimers`), a
`passive` window scroll listener, panel `focusin`/`focusout` listeners and a document `keydown`
listener, all installed and removed inside the same `[open]` effect. `useSemanticPref` holds the
only module-level state in the package (a listener `Set` and the write-failure fallback), which is
tab-lifetime by design.

## Reverse Dependencies

### Primary Consumers
- `app/nina/page.tsx` — `ChatScreen`, `NinaSidebar`, `NinaUnreadSync`, and the `ChatMessage` type;
  also the only place that maps DB rows onto the view models
- `components/ui/AppShell.tsx` — `ChatChrome`, `NinaSidebarProvider` (wraps the shell on the chat
  screen), `NinaUnreadBadgeSlot` (passed as a prop into the client `TabBar`)
- `app/nina/about/page.tsx` — `NinaAboutScreen`
- `app/nina/jobs/page.tsx` — `NinaJobList`; `app/nina/jobs/[id]/page.tsx` — `NinaJobDetail`

### Test Consumers
- `tests/nina.sidebarProvider.test.ts` — structural assertions **on the source text** (no jsdom in
  this repo): the provider wraps the shell rather than sitting inside it, the page renders no
  second provider, the trigger still returns null outside a provider, and a search hit leaves the
  panel by navigation alone (plain `<Link>`, no `onClick` beside its href; the sidebar does not
  hand the search field its close callback)

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
// components/ui/AppShell.tsx — provider above BOTH consumers
return screen === 'chat' ? <NinaSidebarProvider>{shell}</NinaSidebarProvider> : shell
```
```tsx
// app/nina/page.tsx — panel + screen as siblings, server-mapped props
<NinaSidebar avatar={…} sessions={…} activeSessionId={…} />
<ChatScreen initial={…} todayISO={…} userId={…} sessionId={…} … />
```

### Gotchas
- **Provider placement is load-bearing and its failure is silent.** `NinaSidebarTrigger` returns
  null outside a provider — indistinguishable from "no sidebar here". This exact bug shipped once
  (F35: the page's provider was inside `{children}` while `ChatChrome` was a sibling of it, and
  2513 green tests did not notice). The structural test now guards the shape; keep the provider in
  `AppShell` and never add a second one in a page
- **Do not add dependencies to the `[open]` effect.** A keystroke inside the rename field must not
  re-run it — that is the `Sheet` trap that cost one digit per keyboard
- **Never fire `closeRef` beside a `<Link>`'s push.** The close path pops a pushed entry; running
  both in one tick races a back against a forward on the same entry (measured in production,
  2026-09-08, on this panel's own search hits). Links leave the panel by navigation alone — their
  hrefs carry no `sidebar` key
- **History writes read `window.location.search`, never the `searchParams` snapshot** — `ChatScreen`'s
  mount-time `replaceState` can be one write ahead of React
- **`RAIL_PAD_BOTTOM_CSS` quotes `composerPadBottomCss`** — the halving and the 3.25px are that
  function's and `TabBar`'s numbers. Change the floor there, change it here
- **The `description` column never reaches a client component** (invariant 5); likewise nothing in
  this package re-sorts `sessions` — `planSessionList` preserves `listNinaSessions`' order and the
  tests assert that it does
- **No component in this package is rendered by a test** (`environment: 'node'`). If you are about
  to introduce a decision that needs jsdom to verify, move it into `lib/nina/*` instead

## Notes

- Documentation Created: 2026-09-09 12:45 — initial creation via `/update-readme` for task
  P1-CN-A001 (the sidebar's window-scroll keyboard-reveal pin)
- The package's docstrings are the real specification; each file's header records the requirement
  (R-numbers), the alternative rejected, and the measurement that decided it. This README is a map
  of that territory, not a replacement for it
- The keyboard-reveal defence is now two channels: the deck assert (`focusin` +
  `KEYBOARD_REASSERT_DELAYS_MS` → `scrollIntoView({ block: 'nearest' })`) and the window pin
  (capture at focus-in, `scrollTo(0, 0)` while focused, restore on focus-out and on cleanup). The
  plan for the pin is `.workflows/plan/P1-CN-A001.md`; a second phase (P1-CN-A002) is in flight in
  this set
