# Code Analysis: I.search — the sidebar keyboard lift (R1) and the rail's `up` button (R2)

**Type:** Bug Investigation + Feature Update
**Date:** 2026-09-09 11:28 +0700
**Session ID:** 20260909-112804-K4B7
**Plan:** `SEARCH_KBD_AND_UP_BTN_PLAN.md` (2 phase(s))
**Worktree:** `/home/miftah/.worktrees/run-insights/search-kbd-and-up-btn` — branch `feature/search-kbd-and-up-btn` (base `origin/main` @ `5ccae06`)

---

## User Input

### Original User Request

> work on a new worktree from origin/main
> /analyze
> I.search
> 1. bug: saat ini, saat saya mengklik "Search all chats" , text search field nya terangkat keatas oleh keyboard. sehingga apa yang diketik user tidak kelihatan. kita sudah coba fix ini , tapi bug still persists, saat keyboard muncul, search query field masih terangkat keatas
> 2. UI change: kita sudah tambahkan tombol up yang merupakan bagian dari 4 tombol icons yang baru, ubah fungsinya untuk menunjukkan main app bottom bar. persis sama dengan tombol up di chat page

### User-Provided Context

- R1 is a **repeat report**. The fix the owner refers to is `64034d0` "fix(nina-sidebar): re-assert the focused field over the keyboard; search ✕ clears query and results" (landed on `origin/main` today at 10:44 via `7bace70`), which itself built on the `--nina-kb-overlap` panel-box fix. The owner states the bug **still persists** after that fix. That commit's own drift notes record that **no on-device check was run** ("manual device checks (iPhone XS Max keyboard reveal…) not run — no device this session").
- "Search all chats" is the placeholder of the sidebar's search `<input>` (`components/nina/NinaSearchField.tsx:203`); "mengklik" it = focusing it, which raises the keyboard.
- The "4 tombol icons" is the sidebar panel's bottom rail (`NinaSidebar.tsx:596-695`): `>` close, `up`, `+` new chat, wand (Proses foto). The `up` button currently scrolls the session list to its top (`aria-label="Ke atas"`).
- "tombol up di chat page" is `ChatChrome`'s bar toggle (`components/nina/ChatChrome.tsx:246-273`): reveals the main app `TabBar` (the five-tab bottom navigation), which auto-hides after 5 s.

### User-Provided Files

- (none marked `@`)

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Bug: after tapping the sidebar's "Search all chats" field, the keyboard lifts the search field up out of view, so what the user types is not visible. A previous fix did not hold — when the keyboard appears, the search query field is still lifted upward. |
| R2 | UI change: repurpose the rail's `up` button (one of the 4 new icon buttons) to show the main app bottom bar, exactly like the up button on the chat page. |

---

## Detailed Requirements Understanding

**Problem/Requirement statement (R1).** On the owner's device (iPhone XS Max, the design target), tapping the search input in the open sidebar panel raises the keyboard, and the field — together with the panel content around it — is displaced upward far enough that the typed query is not visible. Two shipped mechanisms have not closed it:

1. **The box half** — the panel's inline `bottom: var(--nina-kb-overlap, 0px)` (`NinaSidebar.tsx:514`) ends the panel at the keyboard's measured top edge.
2. **The assert half** — a delegated `focusin` listener on the panel (`NinaSidebar.tsx:402-425`) re-asserts the focused field's visibility on the pure schedule `KEYBOARD_REASSERT_DELAYS_MS = [0, 120, 300, 600, 1000]` (`lib/nina/chatview.ts`) via `target.scrollIntoView({ block: 'nearest', behavior: 'instant' })`.

The report survives both. The surviving mechanism is one the shipped assert **cannot see**:

- `scrollIntoView({ block: 'nearest' })` is a **no-op for any scroll that leaves the focused element inside the layout viewport's scrollport**. A `position: fixed` element's layout geometry is unchanged by a window/document scroll, so a reveal that scrolls the **root scroller** (window) leaves `nearest` computing zero — the assert corrects nothing.
- The root scroller on `/nina` is genuinely scrollable: `MessageList` scrolls the **window** (`window.scrollTo({ top, behavior: 'instant' })`, `components/nina/MessageList.tsx:163,223`), so the document carries real scrollable overflow behind the opaque panel.
- The panel's body scroll lock is `document.body.style.overflow = 'hidden'` (`NinaSidebar.tsx:362`) — the repo's own `Sheet`-inherited idiom, which blocks *user* scrolling but does not stop WebKit's programmatic keyboard-reveal scroll of the root scroller.
- The composer never exhibits this bug because it sits in **no scroll container at all** — and this repo's own measurement (`ChatScreen.tsx:584-586`) is that Safari "will not scroll fixed chrome into view". A field *inside a scrollable container* (the panel's `overflow-y-auto` deck) is the differentiator that makes the panel's field reveal-eligible where the composer is not. Which scroller WebKit picks for a given reveal — the deck, the root, or both in sequence — is not observable from code, and the shipped assert only answers for the deck.

A second, non-code possibility the analysis must record honestly: the report may have been taken against a bundle that predated `64034d0`'s deploy (authored 09:40, merged 10:44-10:49 today; no service worker exists — `lib/pwa.ts` is manifest-only — but an already-open tab or installed PWA window shows old JS until a fresh load). The plan takes the report at face value and closes both code channels regardless; every added correction is an idempotent no-op when nothing is wrong, so it is correct whether or not the shipped half was ever exercised on device.

**Success criteria (R1).** With the sidebar open on a device, tapping the search field raises the keyboard and the field stays fully visible above it — typed characters legible at all times — including when the conversation behind the panel is scrolled (non-zero `window.scrollY`) before the panel opened. Rename fields inside the panel keep the same guarantee (they ride the same listener). No regression: closing the panel restores the conversation's prior scroll position; the composer's behavior is untouched.

**Problem/Requirement statement (R2).** The rail's `up` button (`NinaSidebar.tsx:650-665`, `aria-label="Ke atas"`, currently `onScrollToTop` — scrolls the list deck to `top: 0`) must instead do what the chat page's toggle does: reveal the main app `TabBar`. "Persis sama" = the chat page's semantics: a toggle (`hidden ⇄ shown` via `nextBarState`), a 5 s auto-hide (`CHROME_AUTOHIDE_MS`, `autoHideDelayMs`), glyph flip up/down (`barToggleGlyph`), `aria-expanded` + `aria-controls="main-tab-bar"`, and the keyboard rule (focusing a text field hides the bar — `nextBarState(current, 'composer-engaged')`, whose docstring records that a bar shown under a keyboard is shown and invisible).

The structural fact R2 must answer: the `TabBar` is rendered by `ChatChrome` (`AppShell.tsx:149-153`), which owns the bar state as **local** `useState`; the panel is a sibling subtree and cannot reach it. And visibility: the bar is `fixed … z-30` (`TabBar.tsx:216`) while the panel is `fixed inset-0 z-50 bg-paper` (`NinaSidebar.tsx:478`) — a bar flipped to "shown" behind the open panel is invisible and untouchable. The chat page's own answer to this geometry already exists: when the bar shows, the fixed chrome above it **lifts by the bar's clearance** (`NINA_BAR_VISIBLE_VAR` gates the composer's `bottom` and the control lane's `bottom`). The panel must do the same: its `bottom` gains a bar-lift term gated on the same var, so the bar renders in its own strip below the panel's lifted bottom edge — reachable, while the rail rides up with the panel.

**Success criteria (R2).** With the panel open, tapping `up` slides the main `TabBar` up in a strip below the panel (panel + rail lifted above it); it auto-hides after 5 s; tapping again hides it immediately; the button's glyph and `aria-expanded` flip with the state exactly as the chat page's does; focusing the search field (keyboard) hides the bar; tapping a tab navigates (the route change unmounts panel and chrome together). The chat page's own toggle keeps working unchanged, and the two controls share one state so they can never disagree.

**Key considerations / constraints.**

- **One `visualViewport` subscription** on the screen (`ChatScreen.tsx:584`), by `ChatChrome`'s docstring rule — R1's guard must not measure; it asserts and listens.
- **The `[open]`-keyed effect's dependency array stays exactly `[open]`** (`NinaSidebar.tsx:357-442`, the `Sheet.tsx` trap) — every new listener/timer lives inside it.
- **`lib/` never imports `components/`** — any new pure CSS arithmetic in `lib/nina/chatview.ts` takes the bar clearance as an argument, the way `controlBottomCss` does.
- **Invariant 8 (motion)**: no new keyframes; scroll corrections are `instant`; the bar keeps its existing `transition-[translate]`.
- **vitest is `environment: 'node'`** — DOM listener behaviour is not unit-assertable in this repo; the pure surfaces (schedule, CSS arithmetic, state machine) are where tests go.
- **Verification ceiling**: the decisive check for R1 is on-device (the owner's XS Max); automated gates are typecheck, build, the existing suite, and structural greps. The plan must say so rather than imply a green suite proves the bug fixed.

---

## Analysis Scope

### Explicitly Mentioned Files

- (none — target inferred: the `/nina` sidebar panel, its search field, the rail, and the chat page's bar chrome)

### Discovered Related Files

- `components/nina/NinaSearchField.tsx` — the field itself (`placeholder="Search all chats"` at :203); no keyboard/scroll code of its own
- `components/nina/NinaSidebar.tsx` — the panel: box fix (:482-515), assert effect (:357-442), scroll deck (:527), rail (:596-695)
- `lib/nina/chatview.ts` — `keyboardOverlapPx`, `KEYBOARD_MIN_PX`, `NINA_BAR_VISIBLE_VAR` (:201), `NINA_KEYBOARD_OVERLAP_VAR` (:218), `KEYBOARD_REASSERT_DELAYS_MS`, `composerBottomCss`, `composerPadBottomCss`
- `components/nina/ChatScreen.tsx` — the ONE `visualViewport` subscription (:583-599) and the `--nina-kb-overlap` publisher (:607-626)
- `components/nina/ChatChrome.tsx` — bar state owner: `useState<NinaBarState>` (:85), focus sync (:122-141), autohide (:148-155), var publisher (:166-176), the toggle (:246-273)
- `lib/nina/chrome.ts` — `NinaBarState`, `nextBarState`, `autoHideDelayMs`, `isControlVisible`, `barToggleGlyph`, `CHROME_AUTOHIDE_MS`
- `components/ui/TabBar.tsx` — `#main-tab-bar`, `fixed inset-x-0 bottom-0 z-30`, `hidden` prop → `translate: '0 100%'` + `inert` (:195-256), `TAB_BAR_OUTER_HEIGHT_PX` (= 40)
- `components/ui/AppShell.tsx` — renders `ChatChrome` as `{children}`'s sibling (:149-153); mounts `NinaSidebarProvider` around both (:157) — the measured precedent for a provider that must wrap siblings
- `components/nina/MessageList.tsx` — **window scroller** (:163, :223 `window.scrollTo`), reads `window.scrollY` for scroll marks (:118, :209)
- `components/nina/SessionRow.tsx` — the panel's rename `<input>`s (second beneficiary of R1's listener)
- `app/layout.tsx` — viewport meta: no `interactive-widget` key (Android stays `resizes-visual`); `viewportFit: 'cover'`
- `app/globals.css` — `--safe-bottom` (:62); no html/body overflow rules
- `lib/pwa.ts` — manifest-only install contract, no service worker
- `lib/nina/sidebar.ts`, `components/nina/SessionList.tsx`, `components/nina/NewChatButton.tsx` — list data + the rail's third cell (read-only context)

---

## Current Dataflow

### Entry Point: tapping the search field inside the open sidebar panel

**Location:** `components/nina/NinaSearchField.tsx:193-234` (input), mounted at `components/nina/NinaSidebar.tsx:585` inside the scroll deck (:527)
**Trigger:** `pointerdown`/`focus` on the `<input type="text">` — no code focuses it programmatically (deliberate: no `autoFocus`, :204-205)
**Input Schema:** none (uncontrolled value mirror `text` state)
**Next Step:** browser raises the software keyboard; the focus event fans out to three listeners (below)

### Processing Chain: the keyboard opens over the panel

1. **`ChatScreen`'s `visualViewport` subscription** — `components/nina/ChatScreen.tsx:583-599`
   - `vv resize`/`scroll` → `setOverlap(keyboardOverlapPx({ innerHeight, visualHeight, visualOffsetTop, scale }))`
   - `keyboardOverlapPx` (`lib/nina/chatview.ts:167`): `innerHeight − visualHeight − visualOffsetTop`, 0 below `KEYBOARD_MIN_PX` (120) or when zoomed
   - effect at `ChatScreen.tsx:607-626` publishes the number as `--nina-kb-overlap` on `documentElement` (removed when 0 / on unmount)

2. **The panel's box half** — `NinaSidebar.tsx:482-515`
   - inline `style.bottom: var(--nina-kb-overlap, 0px)` — the panel's border box ends at the keyboard's top edge; constant string, never re-renders; the rail (:616-619) is the panel's last flex child and rides the edge, floored by `RAIL_PAD_BOTTOM_CSS` (:236) which zeroes when the overlap is published

3. **The panel's assert half** — `NinaSidebar.tsx:402-425` (inside the `[open]` effect, :357-442)
   - delegated `focusin` on the panel → filter to `INPUT`/`TEXTAREA`/contenteditable → cancel the running timers → arm `KEYBOARD_REASSERT_DELAYS_MS` (`lib/nina/chatview.ts`, `[0, 120, 300, 600, 1000]`) → each tick: guard `document.activeElement === target`, then `target.scrollIntoView({ block: 'nearest', behavior: 'instant' })`
   - coverage: corrects a **container** scrollTop (the deck) on the schedule; **cannot** correct a window/root-scroller reveal (a fixed element's layout geometry does not change, so `nearest` computes zero), and does not observe scrolls arriving after the last tick
   - teardown (:435-441): removes both document listeners, clears timers, restores `body.overflow` and the previously-focused element

4. **The window's state** — `components/nina/MessageList.tsx:163,223`
   - the conversation behind the panel scrolls the **window**; `window.scrollY` is legitimately non-zero while reading history, and the document is tall enough to reveal-scroll. Nothing in the codebase pins or restores it while the panel is open. **No shipped code touches the window channel.**

### Processing Chain: the chat page's bar toggle (R2's reference behaviour)

1. **State** — `ChatChrome.tsx:85` `useState<NinaBarState>('hidden')`; `'hidden'` is `/nina`'s resting state
2. **Toggle** — `onToggle` (:178-180) → `setBar(nextBarState(current, 'toggle'))` (`lib/nina/chrome.ts:144-149`)
3. **Keyboard rule** — document-level `focusin`/`focusout` (:122-141) → `composerEngaged = #nina-composer contains activeElement` → engaged hides the bar (`nextBarState(current, 'composer-engaged')`); `focusout` is deferred one task (`focusTimer`, :130-133) so intra-composer focus moves don't blink
4. **Auto-hide** — :148-155, `autoHideDelayMs(bar, composerEngaged)` → `CHROME_AUTOHIDE_MS` (5 000) → `nextBarState(current, 'autohide')` (idempotent-hide)
5. **Publishers** — var effect (:166-176): `bar === 'shown'` → `NINA_BAR_VISIBLE_VAR = '1'` on `documentElement`, cleanup removes; consumers: `composerBottomCss`/`composerPadBottomCss`/`controlBottomCss` lift the composer and the floating lane by `TAB_BAR_OUTER_HEIGHT_PX` (40) `+ var(--safe-bottom)`
6. **Render** — `<TabBar hidden={bar === 'hidden'} />` (:186): `translate: '0 100%' ⇄ '0 0'` + `inert` (`TabBar.tsx:214,238`); the toggle button (:246-273) flips glyph `M6 14l6-6 6 6` ⇄ `M6 10l6 6 6-6` via `barToggleGlyph`, `aria-expanded`, `aria-controls="main-tab-bar"`, labels "Show/Hide the main navigation"

### The rail's `up` button today (R2's subject)

- `NinaSidebar.tsx:461-466` `onScrollToTop` — reads `listScrollRef` (:452, attached to the scroll deck :527), `matchMedia('(prefers-reduced-motion: reduce)')` at tap time, `el.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })`
- button `NinaSidebar.tsx:650-665` — `aria-label="Ke atas"`, glyph `M6 14l6-6 6 6` (ChatChrome's toggle chevron), `RAIL_CONTROL_CLASS`
- no test references `Ke atas`, `onScrollToTop`, or the rail button (verified: `grep tests/`)

### Data Persistence

None in scope. No DB writes, no cache. The semantic-search toggle's persistence (`useSemanticPref`) is untouched by both requirements.

### Exit Points

- R1: no server round-trip; purely client scroll/focus behaviour. Side effects to watch: `window.scrollTo` pins and restores; `body.overflow` lock/restore (already shipped).
- R2: navigation via the revealed `TabBar`'s `<Link>`s (full route change; `/nina` unmounts panel + chrome; `NINA_BAR_VISIBLE_VAR` cleanup runs via effect teardown). The var publisher is the only cross-component state channel.

---

## Key Data Structures

### `NinaBarState` / `NinaChromeEvent`
**Location:** `lib/nina/chrome.ts:43,51`
`'hidden' | 'shown'`; events `'toggle' | 'autohide' | 'composer-engaged' | 'composer-released'`. Total transition fn `nextBarState` (:144-149). Currently owned as **local state** in `ChatChrome` — the fact R2 must change.

### `KEYBOARD_REASSERT_DELAYS_MS`
**Location:** `lib/nina/chatview.ts` (exported const, `readonly number[]`, `[0, 120, 300, 600, 1000]`)
The pure assert schedule; 4 unit tests in `lib/nina/chatview.test.ts`. Unchanged by both phases (the schedule itself is not the defect).

### `NINA_BAR_VISIBLE_VAR` / `NINA_KEYBOARD_OVERLAP_VAR`
**Location:** `lib/nina/chatview.ts:201,218`
`:root` custom properties; the sanctioned cross-sibling channels. R2 reuses the first (panel lift); R1 adds no var.

### Panel geometry constants
**Location:** `NinaSidebar.tsx:236` `RAIL_PAD_BOTTOM_CSS` (rail floor, zeroes under keyboard), `TabBar.tsx:78,87,100` `TAB_BAR_HEIGHT_PX` (39) / `TAB_BAR_BORDER_PX` (1) / `TAB_BAR_OUTER_HEIGHT_PX` (40)

---

## Dependencies

### Configuration / Environment / External Services

- `viewportFit: 'cover'` + `--safe-bottom` (`env(safe-area-inset-bottom)`) — the lift arithmetic's inset term
- No `interactive-widget` in the viewport meta — Android Chrome stays `resizes-visual`; `keyboardOverlapPx` returns 0 there by construction; both requirements' code paths are iOS-facing with Android safe no-ops
- No service worker (`lib/pwa.ts`) — deployed-bundle staleness is a fresh-load question only
- Design target: iPhone XS Max (`docs/design-brief.md`), Poppins, Tailwind v4 (`translate` longhand rules in `TabBar.tsx:217-230`)

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `NinaSearchField` (input, placeholder) | `components/nina/NinaSearchField.tsx:194-234` | def (the R1 surface) | components/nina |
| panel `bottom: var(--nina-kb-overlap)` | `components/nina/NinaSidebar.tsx:482-515` | def (box half) | components/nina |
| `focusin` assert listener | `components/nina/NinaSidebar.tsx:402-425` | def (assert half) | components/nina |
| `[open]` effect (owns both listeners) | `components/nina/NinaSidebar.tsx:357-442` | def | components/nina |
| `body` scroll lock | `components/nina/NinaSidebar.tsx:360-362` | def | components/nina |
| `RAIL_PAD_BOTTOM_CSS` | `components/nina/NinaSidebar.tsx:236` | def/config | components/nina |
| `onScrollToTop` + `listScrollRef` | `components/nina/NinaSidebar.tsx:452,461-466` | def (R2 deletes/repurposes) | components/nina |
| rail `up` button | `components/nina/NinaSidebar.tsx:650-665` | def (R2 rewrites) | components/nina |
| rail (`>`/`+`/wand) | `components/nina/NinaSidebar.tsx:616-695` | def (context) | components/nina |
| `KEYBOARD_REASSERT_DELAYS_MS` | `lib/nina/chatview.ts` + `lib/nina/chatview.test.ts` | def + test | lib/nina |
| `keyboardOverlapPx`, `KEYBOARD_MIN_PX` | `lib/nina/chatview.ts:141-193` | def | lib/nina |
| `NINA_BAR_VISIBLE_VAR` | `lib/nina/chatview.ts:201` | def | lib/nina |
| `composerBottomCss` / `composerPadBottomCss` | `lib/nina/chatview.ts:~280-380` | def (R2's precedent for var-gated lift) | lib/nina |
| `visualViewport` subscription (the ONE) | `components/nina/ChatScreen.tsx:583-599` | def | components/nina |
| `--nina-kb-overlap` publisher | `components/nina/ChatScreen.tsx:607-626` | def | components/nina |
| bar state (`useState`), focus sync, autohide | `components/nina/ChatChrome.tsx:85,122-141,148-155` | def (R2 relocates state) | components/nina |
| var publisher (bar) | `components/nina/ChatChrome.tsx:166-176` | def | components/nina |
| chat toggle button | `components/nina/ChatChrome.tsx:246-273` | def (R2's mirror source) | components/nina |
| `nextBarState` / `autoHideDelayMs` / `barToggleGlyph` / `isControlVisible` | `lib/nina/chrome.ts:144-185,157-161,172-174` | def + test | lib/nina |
| `TabBar` (`#main-tab-bar`, hidden translate, z-30) | `components/ui/TabBar.tsx:195-256` | def | components/ui |
| `TAB_BAR_OUTER_HEIGHT_PX` | `components/ui/TabBar.tsx:100` | def/config | components/ui |
| `AppShell` chrome mount + provider wrap | `components/ui/AppShell.tsx:131-158` | def (R2 wires provider here) | components/ui |
| window scroller (`window.scrollTo`) | `components/nina/MessageList.tsx:163,223` | call (the unguarded channel) | components/nina |
| rename input in panel | `components/nina/SessionRow.tsx:~380-410` | def (R1's second beneficiary) | components/nina |
| sidebar provider mount (sibling-sharing precedent) | `components/ui/AppShell.tsx:104-131` | def/doc | components/ui |
| `tests/nina.sidebarProvider.test.ts` | `tests/` | test (close-path rules R2 must keep) | tests |

---

## Impact Points (files that WILL need changes)

1. `components/nina/NinaSidebar.tsx` — **both phases** (this is the declared dependency edge): R1 extends the `[open]` effect (window-scroll pin/restore + captured-deck guard); R2 rewrites the rail's `up` button, the panel's `bottom` style, `RAIL_PAD_BOTTOM_CSS`, and removes `onScrollToTop`/`listScrollRef`-as-scroll-handle
2. `components/nina/ChatChrome.tsx` — R2: bar state moves from local `useState` to a shared context; the focus sync gains the panel-dialog rule
3. `components/ui/AppShell.tsx` — R2: mounts the new provider around the same `shell` node `NinaSidebarProvider` already wraps
4. `lib/nina/chatview.ts` + `lib/nina/chatview.test.ts` — R2: a pure panel-bottom arithmetic (var-gated bar lift) beside `composerBottomCss`
5. `components/nina/NinaBarProvider.tsx` (new) — R2: the context provider/hook, `NinaSidebar.tsx`'s provider precedent
6. `lib/nina/chatview.test.ts` / possibly a small `tests/` addition — R2's pure arithmetic tests; R1 has no new pure surface (schedule and rules already exist) and must say so

**This document describes. The plan files prescribe.**
