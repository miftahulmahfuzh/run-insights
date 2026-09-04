# Phase 2: Full-screen chat chrome: hide the bar, floating `^` / `v`, 5 s auto-hide

**Plan set:** `NINA_CHAT_SESSIONS_PLAN.md`
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Satisfies:** R1 — *"when we click chat, make the chat full screen. so hide the bottom bar completely
(because phone screen size is small). maybe add some floating small ^ button in the bottom middle of
chat query, so we can pull up the bottom bar anytime. add down button as well to hid it. also, auto
hid the bottom bar after 5 seconds"*
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `components/ui`, `components/nina`, `lib/nina`

---

## Goal

`/nina` stops rendering a tab bar. The conversation runs to the bottom of the screen, the composer
sits on the home-indicator inset instead of 78 px above it, and one floating 44 px control just
above the composer pulls the bar back up (`^`), pushes it back down (`v`), and lets it retract on
its own five seconds later. The four other tabbed screens are byte-identical in behaviour: they
still render the bar unconditionally, at the same height, with the same unread dot.

The reveal is a `translate` transition with a `prefers-reduced-motion` escape, not a keyframe
(invariant 8). The reveal state machine, the 5 s rule and the control's vertical offset are pure
functions in a new `lib/nina/chrome.ts` with a co-located vitest suite (invariant 7).

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Renames — READ THIS FIRST, phases 3 and 5:**

- `AppShell`'s prop `bottomGap` -> `screen` (`components/ui/AppShell.tsx:49`). The one call site that
  passes it is `app/nina/page.tsx:259`, which becomes `<AppShell screen="chat">`. Any plan quoting
  `<AppShell bottomGap="chat">` is quoting the pre-phase-2 tree.
  **✅ RECONCILED — this warning was needed and has been acted on.** Phases 3, 5 and 8 each quoted
  `<AppShell bottomGap="chat">` in a code block (phase 5 additionally asserted "`bottomGap` is
  phase 2's and is left exactly as phase 3 left it", which compounded phase 3's stale quote). All
  three now quote `screen="chat"`, and phase 3's hedge — "if phase 2 *added* a chrome-mode prop" —
  was corrected to say that phase 2 *renamed* the existing one. Nothing in this phase changes.
- type `AppShellBottomGap` -> `AppShellScreen` (`components/ui/AppShell.tsx:31`). Nothing imports
  either name today (`grep -rn AppShellBottomGap app components lib tests` returns only its own
  file), so the rename costs one line outside `AppShell`.

**Creates:**

- `lib/nina/chrome.ts` — `NinaBarState`, `NinaChromeEvent`, `CHROME_AUTOHIDE_MS`,
  `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX`, `COMPOSER_RESTING_PX`, `nextBarState`,
  `autoHideDelayMs`, `isControlVisible`, `barToggleGlyph`, `controlBottomCss`.
- `lib/nina/chrome.test.ts`.
- `components/nina/ChatChrome.tsx` — `ChatChrome({ ninaBadge })`.
- `lib/nina/chatview.ts` — `NINA_BAR_VISIBLE_VAR` (`= '--nina-bar-visible'`).
- `components/ui/TabBar.tsx` — the nav gains `id="main-tab-bar"`.

**Signature changes:**

- `TabBar({ ninaBadge })` -> `TabBar({ ninaBadge, hidden })`. `hidden?: boolean`, defaulting to
  `false`, so `app/(app)/loading.tsx` and `app/trends/loading.tsx` keep compiling untouched — the
  same reason `ninaBadge` is optional.
- `AppShell({ children, className, bottomGap })` -> `AppShell({ children, className, screen })`.

**Behaviour changes (no signature change):**

- `composerBottomCss(overlapPx, chromeClearancePx)` now emits
  `calc(<clearance>px * var(--nina-bar-visible, 0) + var(--safe-bottom))` instead of
  `calc(<clearance>px + var(--safe-bottom))`. The keyboard branch is untouched. **The argument keeps
  its meaning** — it is the clearance to apply *while the bar is showing* — which is what lets
  `components/nina/ChatScreen.tsx:545` keep calling it as `composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)`
  with no edit. Three assertions in `lib/nina/chatview.test.ts` change with it.
- `BOTTOM_GAP.chat` `'pb-[calc(10.5rem+var(--safe-bottom))]'` -> `'pb-[calc(8.5rem+var(--safe-bottom))]'`.
- `AppShell` renders `<ChatChrome>` instead of `<TabBar>` when `screen === 'chat'`.

**Deletes:** nothing. No symbol, no file, no config key.

**Requires (from earlier phases):** nothing — `depends_on` is empty.

**Requires to stay true (phases 3, 5, 9 must not break these):**

- `components/nina/Composer.tsx` keeps `id="nina-composer"` on its outer `fixed` wrapper
  (`Composer.tsx:351`). `ChatChrome` measures it, and `ChatScreen.tsx:330` already reads it too.
- `app/nina/page.tsx` keeps rendering the chat inside `AppShell` with `screen="chat"`. Phase 5
  deletes the `<header>` above `<ChatScreen>`; that is top-of-screen geometry and touches nothing
  here.

**Leaves alone (owned by others):**

- `components/nina/ChatScreen.tsx` (phases 3, 7, 9) — including `COMPOSER_CLEARANCE_PX = 78` and
  `COMPOSER_FALLBACK_PX = 146`. Both stay as written; see **Handoffs** for the one that now
  over-estimates.
- `components/nina/Composer.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `ChatImages.tsx`,
  `NinaUnreadBadge.tsx`.
- `app/nina/page.tsx` beyond line 259.
- `lib/db/**`, `drizzle/**`, `lib/nina/queries.ts`, `lib/nina/actions.ts`, `scripts/*.mjs`,
  `app/globals.css`.
- `app/(app)/page.tsx`, `app/me/page.tsx`, `app/trends/page.tsx`, `app/r/[id]/page.tsx`,
  `app/nina/about/page.tsx` — every one uses `AppShell`'s default, and the default is unchanged.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/chrome.ts` | create | the reveal state machine, the 5 s rule, the control's offset — pure |
| `lib/nina/chrome.test.ts` | create | its suite, plus one source assertion for invariant 8 |
| `components/nina/ChatChrome.tsx` | create | the client component that owns the state and renders the bar + the floating control |
| `components/ui/TabBar.tsx` | modify | `:74` signature gains `hidden`; `:84-88` nav gains an id, a `transition-[translate]`, `inert` and an inline `translate` |
| `components/ui/AppShell.tsx` | modify | `:31` type rename; `:33-44` `BOTTOM_GAP.chat` literal; `:46-71` prop rename and the chrome branch |
| `lib/nina/chatview.ts` | modify | `:182-199` `composerBottomCss` emits the var-gated clearance; new `NINA_BAR_VISIBLE_VAR` |
| `lib/nina/chatview.test.ts` | modify | `:217-230` the three `composerBottomCss` assertions, plus one new case |
| `app/nina/page.tsx` | modify | `:259` `bottomGap="chat"` -> `screen="chat"` — the ONE prop, and the only line touched |

---

## Decisions, with the reasoning on the record

### D1. Where the state lives: a new `ChatChrome`, which renders `TabBar` rather than sitting beside it

`AppShell` has no `'use client'` and must not gain one. It is imported by five server pages, and
`tests/share.bundle.test.ts` exists because that import graph already leaked a session read once
(F33 phase 10 put `getUserId()` inside `TabBar`, and `/s/[token]`'s barrel import went red). A
`'use client'` `AppShell` would push the shell of `/`, `/me`, `/trends`, `/r/[id]` and `/nina` into
the client bundle for one boolean.

The state cannot live in `TabBar` either, and the reason is physical rather than architectural: when
the bar is hidden it is translated off-screen, so a control *inside* it would be unreachable — which
is the entire reason R1 asks for a floating one.

So the state lives in the smallest client component that can render both the bar and the control:
`components/nina/ChatChrome.tsx`. `AppShell` picks the chrome and keeps doing exactly what its own
docstring already describes for the unread dot — constructing `<NinaUnreadBadgeSlot />` on the
server and handing it down as a `ReactNode` — with one extra hop. That docstring is the precedent
and this is its mirror image: the badge is server work passed *into* a client bar, and the
hidden-bar boolean is client state passed *into* the same bar, from the layer above it.

`AppShell` importing from `components/nina/` is not new: it already imports `NinaUnreadBadge` from
there. `AppShell -> ChatChrome -> TabBar` and `AppShell -> TabBar` form no cycle, because `TabBar`
imports neither.

### D2. One control, not two — and how the glyph is chosen

One button whose glyph flips. The user named both `^` and `v`, and two permanently-visible buttons
would mean that in every state one of them is a no-op: a `v` while the bar is already hidden does
nothing, and it is still a 44 px target sitting on the conversation. A single control is also the
only version that has an honest accessible name — `aria-expanded` plus `aria-controls="main-tab-bar"`
says "this discloses that thing", which is exactly what it does, and a screen reader then announces
the state rather than the arrow.

The rule is `barToggleGlyph(state)` in `chrome.ts`: `'up'` when hidden, `'down'` when shown. It is
one line, and it is in the pure module because it is the *rule* R1 states, and because a component
cannot be tested in this repo (`environment: 'node'`, no jsdom).

### D3. The 5 s timer, the composer's focus, and the keyboard

**Rule: engaging the composer hides the bar immediately; the 5 s timer never runs while the composer
is engaged; releasing the composer never re-shows the bar.**

The naive rule — pause the timer while the composer has focus — is worse than it looks on iOS.
Safari does not resize the layout viewport for the keyboard (`keyboardOverlapPx`'s docstring, and
`ChatScreen`'s `visualViewport` subscription exist for precisely this), so with a keyboard up the
composer is lifted onto the keyboard's top edge and the tab bar is *behind* the keyboard. A "shown"
bar in that state is shown and invisible; the paused timer then fires the instant he blurs, hiding a
bar he never saw. That is a worse outcome than the one the phase brief warns about.

Hiding on engage gets the brief's requirement for free: the bar can never hide mid-sentence, because
it is never showing mid-sentence.

**Focus, not the keyboard, is the signal**, and that is a portability decision. `keyboardOverlapPx`
returns 0 on Android, where the layout viewport *does* shrink so `innerHeight - visualHeight` is
~0 — the measurement is iOS-shaped by design. Focus inside `#nina-composer` is true on both, and it
is the *cause* of the keyboard rather than a proxy for it. `ChatChrome` therefore needs no
`visualViewport` subscription at all, and does not duplicate `ChatScreen`'s.

**The control itself retracts while the composer is engaged** (`isControlVisible(engaged)`). Two
reasons, and the first is decisive: with a keyboard up, the control's computed offset puts it behind
the keyboard, so it is a button that cannot be pressed. The second is that a floating chevron over
the conversation while he is typing is clutter with nothing to do — the bar is already hidden and
the only thing the control could do is show it, under a keyboard.

`releasing` deliberately does not restore anything. `nextBarState(state, 'composer-released')`
returns `state` unchanged, because a bar that pops back up when he taps away from the textarea would
be the app deciding for him.

### D4. Motion: a `translate` transition, no keyframe, and why this one earns a `motion-reduce:` escape

Invariant 8 and `tests/motion.reducedMotion.test.ts`: the app has exactly one keyframe (`ri-pulse`)
with one global escape. The reveal is `transition-[translate] duration-200 ease-out` on the nav, so
no keyframe is added and that guard's "defines no keyframe that nothing uses" case is untouched.

`transition-[translate]` and not `transition-transform`, for the reason `TabBar`'s own docstring
already states: Tailwind v4 compiles `translate` and `scale` to **separate CSS longhands**, so the
property that actually changes here is `translate`. Naming it explicitly removes the question of
whether v4's `transition-transform` shorthand happens to include the longhands.

It gets `motion-reduce:transition-none`, while `Chip`, `KindSelector` and `Button`'s transitions
correctly do not. `app/globals.css` draws that line out loud: colour is not motion, and `Button`'s
`active:scale-[0.985]` is "a 1.5% press held as long as the finger is down — discrete tap feedback,
not the sustained oscillation this setting exists to suppress". A 58 px bar sliding the full height
of itself across the bottom of the screen is positional motion of a large object, which is on the
other side of that line. With the escape the bar simply *is* where it is going, in one frame; the
destination never changes, only the journey — the same formulation `decideAutoScroll` uses.

### D5. `z-index`: the control is on the composer's rung, and never over Send

The ladder today: `TabBar` `z-30`, `Composer` `z-40` (`Composer.tsx:352`), `Sheet` `z-50`
(`Sheet.tsx:89`), `PhotoViewer` `z-60` (`PhotoViewer.tsx:184`).

The control lane is `z-40` — the same rung as the composer, because they are one stack that moves
together. Equal `z-index` means DOM order decides, and `AppShell` renders `<ChatChrome>` *after*
`<main>` (which contains the composer), so the lane paints above it. That matters only for the one
frame in which the composer is growing and the lane has not been re-measured yet.

It is **below `Sheet`**, deliberately: phase 5's full-screen sidebar must cover the lane, and a
floating chevron on top of a sidebar would be a control pointing at chrome the sidebar has replaced.

**It never sits over Send.** The Send button is `size-11` at the right end of the composer's
`flex items-end` row, inside the composer's box (`Composer.tsx:504-512`). The lane is positioned
*entirely above* the composer's top edge — `controlBottomCss` adds the composer's measured height
plus an 8 px gap — and the toggle is in the centre cell of a three-column grid. There is no overlap
with the composer's box at all, at any composer height.

### D6. How the composer learns the bar is gone, without editing `ChatScreen`

`ChatScreen.tsx` is phase 3's file and holds both `COMPOSER_CLEARANCE_PX` and the
`composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)` call. This phase must build and pass on its own,
so the composer's geometry has to be correct with that call site unchanged.

The mechanism is a CSS custom property acting as a 0/1 flag. `composerBottomCss` emits
`calc(78px * var(--nina-bar-visible, 0) + var(--safe-bottom))`, and `ChatChrome` sets
`--nina-bar-visible: 1` on `document.documentElement` **only while the bar is shown**.

Three things make this the right shape rather than a trick:

1. **The default is the truth.** The var is absent on first paint, during SSR, and on every screen
   that is not `/nina`. `var(--nina-bar-visible, 0)` substitutes `0`, so the composer paints at
   `calc(0px + var(--safe-bottom))` — the correct hidden-state position — with no hydration jump.
   Setting the var on hide instead of on show would put a 78 px settle into the first paint of every
   `/nina` load, which is exactly the "composer floats in mid-air" failure the phase brief names.
2. **The argument keeps its meaning.** `chromeClearancePx` is still "the chrome below the composer",
   now qualified as "while the bar is showing". `ChatScreen` compiles untouched and the number 78 is
   not respelled anywhere new.
3. **It self-heals.** The effect's cleanup removes the property, so hiding the bar and unmounting
   `ChatChrome` (navigating away from `/nina`) both restore the default. There is no state to leak
   onto another route.

Rejected: a React context (the composer is not a descendant of `ChatChrome`, and threading a prop
through `ChatScreen` is out of scope); a wrapper `<div>` around `<main>` and the chrome carrying an
inline style (it adds a DOM node to all five tabbed screens to serve one, and a plain div is one
`transform` away from becoming the containing block for every fixed child under it); and a
`:root:has(#nina-chrome[data-bar='hidden'])` rule in `app/globals.css` (it works, but `globals.css`
is not in this phase's scope and phase 5 is the other candidate to edit it).

### D7. The composer moves instantly; only the bar animates

Flipping the flag changes the composer's `bottom` in one frame — a 78 px reposition with no
transition, because `Composer.tsx` has none on `bottom` and this phase does not edit it.

That is the right answer, not a limitation. Adding `transition-[bottom]` to the composer would also
animate the **keyboard lift**, which must be instantaneous: it is chasing Safari's own keyboard
animation, and `decideAutoScroll`'s fourth rule already records what happens when something animates
against a layout that has already moved — "a 300 ms smooth scroll chasing it reads as a glitch".

So the reveal reads as: the bar slides up over 200 ms while the composer and the control settle into
their new position in the first frame. Rejected alongside it: registering the clearance with
`@property` so the length itself could interpolate — three elements read that value, it would be the
repo's first `@property`, and it buys 200 ms of prettiness on a control the runner pressed on purpose.

### D8. The bar hides by 100% **plus 20 px**, and this is the trap

`translate-y-full` is not enough, and on a device with no home-indicator inset it leaves the FAB
visibly poking above the bottom of the screen.

Measure upward from the viewport bottom. The nav's border box is `1px` (`border-t`) + `58px`
(`h-[58px]`) + `var(--safe-bottom)` (its inline `paddingBottom`), so it spans `[0, 59+safe]`. The
FAB is `absolute -top-5` inside the `relative` grid container, which spans `[safe, safe+58]`, so the
FAB's top is at `safe+78` and its `size-14` box spans `[safe+22, safe+78]`. Clearing it needs
`D >= safe+78`. `translate-y-full` gives `D = 59+safe`. **Shortfall: 19 px** — and with `--safe-bottom: 0`
on a device with no notch, 20 px of coral circle sits on screen with the bar "hidden".

So the transform is `translate: 0 calc(100% + <TAB_BAR_FAB_OVERHANG_PX>px)`, written as an **inline
style computed from the TypeScript constant** rather than as a `translate-y-[calc(100%+20px)]` class.
`AppShell`'s docstring complains that "Tailwind cannot read a constant, so a change to any of them
changes this literal"; here the constant is readable, so the literal is not spelled a third time.

## The geometry, every spelling enumerated

| Spelling | File | Today | After this phase |
|---|---|---|---|
| `TAB_BAR_HEIGHT_PX = 58` | `TabBar.tsx:51` | 58 | **unchanged.** The bar's height does not change; it translates. |
| `TAB_BAR_FAB_OVERHANG_PX = 20` | `TabBar.tsx:54` | 20 | **unchanged**, and gains a second reader: the hide transform (D8). |
| `h-[58px]` | `TabBar.tsx:~90` | 58 px | **unchanged.** Still the twin of `TAB_BAR_HEIGHT_PX`. |
| `-top-5` | `TabBar.tsx:~100` | 20 px | **unchanged.** Still the twin of `TAB_BAR_FAB_OVERHANG_PX`. |
| the hide transform | `TabBar.tsx` (new) | — | `translate: 0 calc(100% + ${TAB_BAR_FAB_OVERHANG_PX}px)`, from the constant, not a literal. |
| `BOTTOM_GAP.tabs = 'pb-[calc(6rem+var(--safe-bottom))]'` | `AppShell.tsx:35` | 96 px | **unchanged.** The other four screens keep their bar and their gap. |
| `BOTTOM_GAP.chat = 'pb-[calc(10.5rem+var(--safe-bottom))]'` | `AppShell.tsx:43` | 168 px | **`'pb-[calc(8.5rem+var(--safe-bottom))]'` = 136 px.** Derived below. |
| `composerBottomCss` idle emission | `chatview.ts:198` | `calc(78px + var(--safe-bottom))` | `calc(78px * var(--nina-bar-visible, 0) + var(--safe-bottom))` |
| `composerBottomCss` keyboard emission | `chatview.ts:196` | `${overlap}px` | **unchanged.** Every clearance term is behind the keyboard either way. |
| `COMPOSER_CLEARANCE_PX = 78` | `ChatScreen.tsx:74` | 78 | **unchanged, and not edited** (phase 3 owns the file). Its meaning narrows to "the clearance while the bar is showing", which is what the flag applies it to. |
| `COMPOSER_FALLBACK_PX = 146` | `ChatScreen.tsx:81` | 146 | **unchanged, and not edited.** Now over-estimates by 78 px in the hidden state — harmless, and handed off. |
| `KEYBOARD_MIN_PX = 120` | `chatview.ts:139` | 120 | **unchanged.** Nothing here touches the keyboard measurement. |
| `CHROME_CONTROL_PX` | `chrome.ts` (new) | — | 44 — the iOS tap-target floor `app/nina/page.tsx:262` already cites, and `Composer`'s own `size-11` controls. |
| `CHROME_CONTROL_GAP_PX` | `chrome.ts` (new) | — | 8 — between the control's box and the composer's top edge. |
| `COMPOSER_RESTING_PX` | `chrome.ts` (new) | — | 68 = `py-3` (24) + `min-h-11` (44), the composer's height with no reply strip, no chip and no tiles. The same 68 that `COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68` already spells. |

**How 8.5 rem is derived, and what it costs.** The existing literal is `78 + 68 + 16 = 162`, written
as `10.5rem = 168px` — rounded up to the nearest half-rem. Applying the same rule with no bar:
`68` (composer, resting) `+ 8` (`CHROME_CONTROL_GAP_PX`) `+ 44` (`CHROME_CONTROL_PX`) `+ 12`
(breathing, so the newest bubble is not flush against the control) `= 132`, rounded up to
`8.5rem = 136px`.

So the conversation gets **32 px** more of the screen, and the bottom of the screen stops being a
navigation bar. That is the honest accounting: the bar was never painted over content (the old
168 px cleared it), so the reclaim is the bar's 78 px of clearance minus the 52 px the control lane
costs. The requirement's literal ask — the bar is gone — is what carries the rest.

**What is deliberately not covered by 136 px.** With the bar *revealed*, the composer rises 78 px and
the lane rises with it, so for those five seconds the last bubble sits behind the composer. The
padding is not made dynamic, because it is the document's height: changing it would move the scroll
position every time the bar toggles, and `MessageList`'s auto-scroll would then chase it. A runner
who pulls up the bar is on his way to another tab, not re-reading the last line. And a composer
*grown* by a reply strip, a run chip, a photo chip or a tile row is taller than 68 px and overlaps
the last bubble — which the old 168 px literal did too, since it was also derived from a resting
composer. Neither is a regression and neither is fixed here.

---

## Implementation Steps

### Step 1: `lib/nina/chrome.ts` — the rules

**File:** `lib/nina/chrome.ts` (new)
**Change:** The whole reveal decision, as pure functions with no DOM types in any signature.
**Code:**

```ts
/**
 * `/nina`'s chrome, as pure rules (R1).
 *
 * The tab bar is hidden on the conversation screen and one floating control pulls it back up,
 * pushes it back down, and lets it retract by itself after five seconds. Every part of that which
 * is a decision rather than markup lives here.
 *
 * Same argument as `lib/nina/chatview.ts`, `lib/nina/reveal.ts` and `lib/photos/gallery.ts` before
 * it: `vitest.config.ts` runs `environment: 'node'` with an `include` matching `*.test.ts`, so
 * there is no jsdom, no `visualViewport`, no timer to advance inside a rendered component and no
 * element to measure. A rule that lives in a component cannot be asserted in this repo at all.
 *
 * No DOM types appear in any signature. The component measures; this decides — `chatview.ts`'s
 * header, verbatim, and the same division of labour.
 *
 * ── WHY ENGAGING THE COMPOSER HIDES THE BAR RATHER THAN PAUSING THE TIMER ─────────────────────
 * The obvious rule is "do not auto-hide while he is typing", because a bar that retracts
 * mid-sentence is worse than one that never retracts. On iOS that rule is a trap. Safari does not
 * resize the layout viewport when the software keyboard opens (`keyboardOverlapPx`'s docstring is
 * the long version), so the composer is lifted onto the keyboard's top edge and the tab bar — which
 * is `fixed bottom-0` — sits *behind* the keyboard. A bar that is "shown" there is shown and
 * invisible, and the paused timer fires the instant he blurs, hiding a bar he never saw.
 *
 * Hiding on engage gives the same guarantee by a shorter route: the bar cannot retract mid-sentence
 * because it is never showing mid-sentence.
 *
 * ── WHY FOCUS, AND NOT THE KEYBOARD, IS THE SIGNAL ───────────────────────────────────────────
 * `keyboardOverlapPx` is an iOS measurement by construction: it reads
 * `innerHeight - visualHeight - visualOffsetTop`, and Android *does* resize the layout viewport, so
 * that difference is ~0 there and the function correctly returns 0. Focus inside the composer is
 * true on both platforms, and it is the *cause* of the keyboard rather than a proxy for it. So the
 * caller subscribes to focus, not to `visualViewport`, and does not duplicate the subscription
 * `ChatScreen` already owns.
 *
 * ── WHY RELEASING NEVER RESTORES ANYTHING ────────────────────────────────────────────────────
 * `'composer-released'` returns the state unchanged. A bar that pops back up when he taps away from
 * the textarea is the app overruling a decision he made with the toggle.
 */

/** Whether the tab bar is on screen. `'hidden'` is `/nina`'s resting state. */
export type NinaBarState = 'hidden' | 'shown'

/**
 * Everything that can move the bar.
 *
 * A string union rather than a discriminated one: none of the four carries a payload, and
 * `nextBarState` is total over it, so `tsc` catches a fifth event the day someone adds one.
 */
export type NinaChromeEvent = 'toggle' | 'autohide' | 'composer-engaged' | 'composer-released'

/**
 * R1's literal: "auto hid the bottom bar after 5 seconds".
 *
 * Five seconds is long enough to read four labels and press one, and short enough that a bar pulled
 * up by accident goes away without a second interaction.
 */
export const CHROME_AUTOHIDE_MS = 5_000

/**
 * The floating control's tap target.
 *
 * 44 px is the iOS floor, and this repo says so twice already: `app/nina/page.tsx` calls
 * `size-11` "already 44 px — the iOS tap-target floor", and every round control in `Composer` is
 * `size-11` with a `size-4` or `size-5` glyph inside it. R1 asks for a "small" button; a small
 * glyph in the app's standard target is what small means here, and 36 px would be below the floor.
 */
export const CHROME_CONTROL_PX = 44

/** Between the control's box and the composer's top edge. Enough to read as floating, not as chrome. */
export const CHROME_CONTROL_GAP_PX = 8

/**
 * The composer with nothing armed: `py-3` (24) + `min-h-11` (44).
 *
 * The same 68 that `ChatScreen`'s `COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68` already
 * spells. Used only when `#nina-composer` cannot be measured, which is the frame before the
 * observer's first callback.
 */
export const COMPOSER_RESTING_PX = 68

/**
 * The state machine. Total over `NinaChromeEvent`, and every transition is one line of R1.
 *
 * `'autohide'` is idempotent on purpose: a timer that fires after the runner has already pressed
 * `v` must not toggle the bar back on, and making the event mean "be hidden" rather than "flip"
 * is what removes that race from the caller.
 */
export function nextBarState(state: NinaBarState, event: NinaChromeEvent): NinaBarState {
  if (event === 'toggle') return state === 'hidden' ? 'shown' : 'hidden'
  if (event === 'autohide') return 'hidden'
  if (event === 'composer-engaged') return 'hidden'
  return state
}

/**
 * How long to wait before hiding, or `null` for "run no timer".
 *
 * `null` rather than `0` or `Infinity`: the caller's cleanest shape is an effect that returns early,
 * and a delay of 0 would mean "hide immediately", which is a different rule.
 */
export function autoHideDelayMs(state: NinaBarState, composerEngaged: boolean): number | null {
  if (state !== 'shown') return null
  if (composerEngaged) return null
  return CHROME_AUTOHIDE_MS
}

/**
 * Whether the floating control is on screen at all.
 *
 * It retracts while the composer is engaged, and the first reason is decisive: with a keyboard up
 * the composer is lifted onto it and the control's computed offset puts the control *behind* the
 * keyboard, so it is a button that cannot be pressed. The second is that a chevron floating over
 * the conversation while he types is clutter whose only available action is "show a bar under a
 * keyboard".
 */
export function isControlVisible(composerEngaged: boolean): boolean {
  return !composerEngaged
}

/**
 * Which arrow the one control shows. `'up'` reveals, `'down'` hides.
 *
 * The user named both glyphs; this is the reading that makes both of them true without putting a
 * permanently dead second button on the conversation. Semantic rather than a character, so the
 * component owns the SVG path and the accessible name and this module owns the rule.
 */
export function barToggleGlyph(state: NinaBarState): 'up' | 'down' {
  return state === 'hidden' ? 'up' : 'down'
}

/**
 * The control lane's `bottom`, as a CSS length.
 *
 * Entirely above the composer: the bar's clearance when the bar is showing, plus the composer's
 * measured height, plus the gap, plus the home-indicator inset. That is what keeps the lane clear
 * of the composer's Send button at every composer height, and clear of the tab bar's centre FAB —
 * which spans the 22-78 px band above the viewport bottom and is the one thing a bottom-centre
 * control must never cover.
 *
 * The inset is honoured here and not as the lane's own padding, for the reason
 * `composerBottomCss` gives: everything in this stack sits above chrome that already pads by
 * `--safe-bottom`, so padding twice opens a gap.
 *
 * A string, because that is what the style attribute takes and because `var(--safe-bottom)` is
 * `env(safe-area-inset-bottom)`, which is readable only to CSS.
 *
 * Degenerate input is the resting screen, not an error: a non-finite or non-positive composer
 * height means "not measured yet" and falls back to `COMPOSER_RESTING_PX`; a non-finite or negative
 * clearance contributes nothing. A hidden bar contributes no clearance whatever the argument says.
 */
export function controlBottomCss(input: {
  barState: NinaBarState
  /** `TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX`, passed in — `lib/` never imports `components/`. */
  barClearancePx: number
  /** `#nina-composer`'s measured height, or 0 before the first measurement. */
  composerHeightPx: number
}): string {
  const { barState, barClearancePx, composerHeightPx } = input
  const clearance =
    barState === 'shown' && Number.isFinite(barClearancePx) && barClearancePx > 0
      ? Math.round(barClearancePx)
      : 0
  const composer =
    Number.isFinite(composerHeightPx) && composerHeightPx > 0
      ? Math.round(composerHeightPx)
      : COMPOSER_RESTING_PX
  return `calc(${clearance + composer + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`
}
```

**Impact:** New module, no callers yet. Nothing breaks.

---

### Step 2: `lib/nina/chrome.test.ts` — the suite

**File:** `lib/nina/chrome.test.ts` (new)
**Change:** Assert every rule above, plus the one property `tsc` and `eslint` cannot see: that the
reveal has a reduced-motion escape.
**Code:**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  autoHideDelayMs,
  barToggleGlyph,
  CHROME_AUTOHIDE_MS,
  CHROME_CONTROL_GAP_PX,
  COMPOSER_RESTING_PX,
  controlBottomCss,
  isControlVisible,
  nextBarState,
  type NinaBarState,
} from './chrome'

/** `TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX`. Spelled here so the test names its own input. */
const BAR_CLEARANCE = 78

describe('CHROME_AUTOHIDE_MS', () => {
  it('is exactly the five seconds the requirement asks for', () => {
    // R1's only number. Asserted rather than assumed, because a "5 s auto-hide" that is 3 s is a
    // silently wrong feature rather than a broken one.
    expect(CHROME_AUTOHIDE_MS).toBe(5000)
  })
})

describe('nextBarState', () => {
  it('flips on a toggle, both ways', () => {
    expect(nextBarState('hidden', 'toggle')).toBe('shown')
    expect(nextBarState('shown', 'toggle')).toBe('hidden')
  })

  it('hides on autohide, and is idempotent', () => {
    // The timer means "be hidden", not "flip". A fired timer arriving after he already pressed `v`
    // must not toggle the bar back on — that race is removed here rather than in the component.
    expect(nextBarState('shown', 'autohide')).toBe('hidden')
    expect(nextBarState('hidden', 'autohide')).toBe('hidden')
  })

  it('hides the moment the composer is engaged', () => {
    // The whole of D3: the bar cannot retract mid-sentence because it is never showing mid-sentence.
    expect(nextBarState('shown', 'composer-engaged')).toBe('hidden')
    expect(nextBarState('hidden', 'composer-engaged')).toBe('hidden')
  })

  it('never restores anything when the composer is released', () => {
    // A bar that pops back up on blur is the app overruling the toggle he pressed.
    expect(nextBarState('hidden', 'composer-released')).toBe('hidden')
    expect(nextBarState('shown', 'composer-released')).toBe('shown')
  })
})

describe('autoHideDelayMs', () => {
  it('runs the timer only for a shown bar with a free composer', () => {
    expect(autoHideDelayMs('shown', false)).toBe(CHROME_AUTOHIDE_MS)
  })

  it('runs no timer while the composer is engaged', () => {
    // Not because it would hide mid-sentence — `composer-engaged` already hid it — but so that a
    // stale timer cannot be pending across a focus change.
    expect(autoHideDelayMs('shown', true)).toBeNull()
  })

  it('runs no timer for an already hidden bar', () => {
    expect(autoHideDelayMs('hidden', false)).toBeNull()
    expect(autoHideDelayMs('hidden', true)).toBeNull()
  })
})

describe('isControlVisible', () => {
  it('retracts the control while the composer is engaged', () => {
    // With a keyboard up the lane is behind it, so this is a button that could not be pressed.
    expect(isControlVisible(true)).toBe(false)
    expect(isControlVisible(false)).toBe(true)
  })
})

describe('barToggleGlyph', () => {
  it('shows the up arrow when there is a bar to pull up', () => {
    expect(barToggleGlyph('hidden')).toBe('up')
  })

  it('shows the down arrow when there is a bar to push down', () => {
    expect(barToggleGlyph('shown')).toBe('down')
  })
})

describe('controlBottomCss', () => {
  it('clears a resting composer and the gap when the bar is hidden', () => {
    expect(
      controlBottomCss({
        barState: 'hidden',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
  })

  it('ignores the clearance entirely while the bar is hidden', () => {
    // The clearance is an argument, not a state. A hidden bar occupies nothing, whatever it says.
    const hidden = controlBottomCss({
      barState: 'hidden',
      barClearancePx: BAR_CLEARANCE,
      composerHeightPx: COMPOSER_RESTING_PX,
    })
    const noBarAtAll = controlBottomCss({
      barState: 'hidden',
      barClearancePx: 0,
      composerHeightPx: COMPOSER_RESTING_PX,
    })
    expect(hidden).toBe(noBarAtAll)
  })

  it('rises by the bar and the FAB overhang when the bar is shown', () => {
    expect(
      controlBottomCss({
        barState: 'shown',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(`calc(${BAR_CLEARANCE + COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
  })

  it('rides up with a composer that has grown', () => {
    // A reply strip, a run chip, a photo chip and a tile row all make the composer taller. The lane
    // is measured off it rather than assumed, which is the only version that cannot end up behind
    // the composer's `z-40` background.
    expect(
      controlBottomCss({ barState: 'hidden', barClearancePx: BAR_CLEARANCE, composerHeightPx: 190 }),
    ).toBe(`calc(${190 + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
  })

  it('falls back to a resting composer before the first measurement', () => {
    for (const height of [0, -20, NaN, Number.POSITIVE_INFINITY]) {
      expect(
        controlBottomCss({
          barState: 'hidden',
          barClearancePx: BAR_CLEARANCE,
          composerHeightPx: height,
        }),
      ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
    }
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    for (const clearance of [NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(
        controlBottomCss({
          barState: 'shown',
          barClearancePx: clearance,
          composerHeightPx: COMPOSER_RESTING_PX,
        }),
      ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
    }
  })

  it('rounds a fractional measurement rather than emitting a fractional length', () => {
    // `getBoundingClientRect().height` is a double. `calc(68.328125px + …)` is valid CSS and an
    // unreadable diff.
    expect(
      controlBottomCss({ barState: 'hidden', barClearancePx: 0, composerHeightPx: 68.328125 }),
    ).toBe(`calc(${68 + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
  })

  it('is total over the state union', () => {
    const states: NinaBarState[] = ['hidden', 'shown']
    for (const barState of states) {
      expect(
        controlBottomCss({ barState, barClearancePx: BAR_CLEARANCE, composerHeightPx: 68 }),
      ).toMatch(/^calc\(\d+px \+ var\(--safe-bottom\)\)$/)
    }
  })
})

/**
 * Invariant 8, for the one property no type and no lint rule can see.
 *
 * `tests/motion.reducedMotion.test.ts` guards `@keyframes` and their escapes; this reveal is a
 * `transition-*`, so that suite is silent about it by design. `tests/pwa.install.test.ts` is the
 * precedent for the technique and says the same of an install contract — asserted here or not
 * asserted at all — and takes the same approach: read the source as text and assert properties of
 * it.
 *
 * Here rather than in `tests/` because the rule and its enforcement belong together, and this
 * module is where the rule lives.
 */
describe('the reveal is a transition with a reduced-motion escape', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../components/ui/TabBar.tsx', import.meta.url)),
    'utf8',
  )

  it('animates the translate longhand, which is what Tailwind v4 compiles to', () => {
    expect(source).toContain('transition-[translate]')
  })

  it('holds still under prefers-reduced-motion', () => {
    expect(source).toContain('motion-reduce:transition-none')
  })

  it('adds no keyframe', () => {
    // A second keyframe would be the first in the codebase. `app/globals.css` owns the only one.
    expect(source).not.toContain('@keyframes')
    expect(source).not.toContain('[animation:')
  })
})
```

**Impact:** `npm test` gains one file. Nothing else changes.

---

### Step 3: `lib/nina/chatview.ts` — the composer clears nothing when the bar is gone

**File:** `lib/nina/chatview.ts:182-199`
**Change:** Publish the flag's name, and gate the clearance behind it. The keyboard branch and the
signature are untouched, so `ChatScreen.tsx:545` compiles unedited.
**Code:** replace the block from the `/**` opening the `composerBottomCss` docstring (line 182) to
the closing `}` (line 199) with:

```ts
/**
 * The CSS custom property that says whether `/nina`'s tab bar is currently on screen.
 *
 * `'1'` while the bar is shown; **absent** otherwise, which is the load-bearing half. `/nina`'s
 * resting state is a hidden bar, so the default has to be the hidden geometry: an absent variable
 * substitutes `0`, the composer paints on the home-indicator inset, and there is no reposition
 * between the server's HTML and the first client frame. Setting the variable on *hide* instead
 * would put a 78 px settle into the first paint of every conversation.
 *
 * Set by `components/nina/ChatChrome.tsx` on `document.documentElement`, and removed by that
 * effect's cleanup — so hiding the bar and navigating off `/nina` both restore the default and
 * nothing leaks onto another route.
 *
 * A custom property rather than a prop, because the composer is not a descendant of the component
 * that owns the reveal state: `AppShell` renders `<main>` (which contains `ChatScreen`, which
 * renders `Composer`) and the chrome as siblings. `:root` is the nearest thing both inherit from,
 * and a custom property is the one channel that crosses that gap without threading a boolean
 * through three components that have no other use for it.
 */
export const NINA_BAR_VISIBLE_VAR = '--nina-bar-visible'

/**
 * The composer's `bottom`, as a CSS length.
 *
 * With no keyboard it clears the fixed chrome below it — but only when there IS chrome below it.
 * On `/nina` the tab bar is hidden by default (R1), so `chromeClearancePx` is the clearance to
 * apply **while the bar is showing**, and it is multiplied by `NINA_BAR_VISIBLE_VAR`, which is `1`
 * only then. The terms are the bar's own height, the FAB's overhang above the bar's top edge, and
 * the home-indicator inset the bar pads itself by.
 *
 * The inset is honoured **here and not as the composer's own padding** — the composer sits above
 * chrome that already pads by `--safe-bottom`, so padding it a second time would open a gap. It is
 * outside the multiplication for the same reason it is outside the keyboard branch: the inset is
 * the phone's, not the bar's, and it is there whether or not the bar is.
 *
 * With a keyboard, the keyboard's top edge is the floor and every one of those terms is behind it.
 * That branch is unchanged by R1: a bar behind the keyboard clears nothing either way.
 *
 * ── WHY A MULTIPLIER AND NOT A LENGTH ────────────────────────────────────────────────────────
 * `calc(<length> * <number>)` keeps the number 78 in this function, where the caller already
 * passes it, instead of moving it into whichever component writes the variable. The flag then says
 * one thing only — is the bar on screen — and cannot disagree with `TAB_BAR_HEIGHT_PX` about how
 * tall it is. A `var(--nina-bar-clearance, 0px)` form would make this argument dead and put the
 * geometry in two places.
 *
 * Returns a string because that is what the style attribute takes, and because `var(--safe-bottom)`
 * cannot be resolved in JavaScript — `env(safe-area-inset-bottom)` is only readable to CSS.
 */
export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
  const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
  return `calc(${clearance}px * var(${NINA_BAR_VISIBLE_VAR}, 0) + var(--safe-bottom))`
}
```

**Impact:** `ChatScreen` renders the composer at `calc(78px * 0 + var(--safe-bottom))` until
`ChatChrome` sets the flag. Three assertions in `chatview.test.ts` change (step 4). No other caller
exists — `grep -rn composerBottomCss app components lib` returns `chatview.ts`, `chatview.test.ts`
and `ChatScreen.tsx:545` only.

---

### Step 4: `lib/nina/chatview.test.ts` — the emission's new shape

**File:** `lib/nina/chatview.test.ts:217-230`
**Change:** Replace the whole `describe('composerBottomCss')` block.
**Code:**

```ts
describe('composerBottomCss', () => {
  it('clears nothing but the home-indicator inset while the bar is hidden', () => {
    // R1: `/nina`'s resting state. The flag is absent, `var()` substitutes 0, and the composer sits
    // on the inset. This is also the SSR and pre-hydration answer, which is why the default is the
    // hidden geometry and not the showing one.
    expect(composerBottomCss(0, 78)).toBe(
      'calc(78px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })

  it('names the variable the chrome writes', () => {
    // Spelled once, in `chatview.ts`, and read by `ChatChrome`. If the constant and the emission
    // ever disagree the composer stops following the bar and nothing else notices.
    expect(composerBottomCss(0, 78)).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
  })

  it('sits on the keyboard when there is one', () => {
    // Every term of the idle clearance is behind the keyboard, so none of it is added — and that
    // is true whether or not the bar is showing, which is why this branch is untouched by R1.
    expect(composerBottomCss(KEYBOARD_HEIGHT, 78)).toBe('336px')
  })

  it('treats unmeasurable input as no keyboard', () => {
    expect(composerBottomCss(NaN, 78)).toBe(
      'calc(78px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    expect(composerBottomCss(0, NaN)).toBe(
      'calc(0px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })
})
```

And add `NINA_BAR_VISIBLE_VAR` to the import at `lib/nina/chatview.test.ts:3-11`, which becomes:

```ts
import {
  composerBottomCss,
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  keyboardOverlapPx,
  KEYBOARD_MIN_PX,
  NINA_BAR_VISIBLE_VAR,
  STICK_TO_BOTTOM_PX,
} from './chatview'
```

**Impact:** The suite matches the new emission. `keyboardOverlapPx`'s own cases, `groupIntoDays`,
`isNearBottom` and `decideAutoScroll` are untouched — the file's other four `describe` blocks do not
change a line.

---

### Step 5: `components/ui/TabBar.tsx` — a hidden state

**File:** `components/ui/TabBar.tsx:54` (docstring addendum), `:74` (signature), `:84-88` (the nav)
**Change:** One optional prop, an id for `aria-controls`, the transition and the transform.

First, extend the `TAB_BAR_FAB_OVERHANG_PX` docstring at line 53-54, replacing:

```ts
/** How far the FAB overhangs the bar's top edge, matching `-top-5` below. Same coupling. */
export const TAB_BAR_FAB_OVERHANG_PX = 20
```

with:

```ts
/**
 * How far the FAB overhangs the bar's top edge, matching `-top-5` below. Same coupling.
 *
 * **It is also why `hidden` cannot be `translate-y-full`** (R1). Measuring up from the viewport
 * bottom: the nav's border box is 1 px of `border-t` plus the 58 px grid plus its own
 * `--safe-bottom` padding, so `100%` is `59px + safe`. The FAB is `absolute -top-5` inside the
 * `relative` grid container, which starts at `safe`, so the FAB's top is at `safe + 78` and its
 * `size-14` box spans `safe+22` to `safe+78`. Clearing it needs `safe + 78`, and `100%` is 19 px
 * short of that — on a device with no home-indicator inset, 20 px of coral circle would sit on
 * screen with the bar supposedly hidden. So the transform is `100%` plus this constant, written
 * as an inline style so the number is read from here rather than spelled a fourth time in a
 * Tailwind arbitrary value.
 */
export const TAB_BAR_FAB_OVERHANG_PX = 20
```

Then replace the signature and its docstring's last paragraph. The block currently at lines 64-74
ends with:

```ts
export function TabBar({ ninaBadge }: { ninaBadge?: React.ReactNode } = {}) {
```

Replace that one line with:

```ts
/**
 * `hidden` is R1's whole of this file: `/nina` is a full-screen conversation with no tab bar, and
 * one floating control in `components/nina/ChatChrome.tsx` slides this one back up.
 *
 * Optional with a `false` default, for the same reason `ninaBadge` is optional: `app/(app)/loading.tsx`
 * and `app/trends/loading.tsx` render a bare `<AppShell>`, and `/`, `/upload`, `/trends` and `/me`
 * keep their bar unconditionally. The four of them are byte-identical in behaviour after this
 * change — a `transition-[translate]` on an element whose translate never changes does nothing.
 *
 * **`inert`, not `aria-hidden` and not `hidden`.** A bar translated off screen is still in the tab
 * order and still reachable by a screen reader, which would put five navigation links behind the
 * conversation. The `hidden` attribute would remove it from layout and take the transition with it.
 * `inert` removes it from focus and from the accessibility tree while leaving it painted and
 * animatable, which is exactly the state it is in. React 19.2 takes it as a boolean.
 */
export function TabBar({
  ninaBadge,
  hidden = false,
}: { ninaBadge?: React.ReactNode; hidden?: boolean } = {}) {
```

Then replace the `<nav>`'s opening tag, lines 84-88:

```tsx
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
```

with:

```tsx
    <nav
      /* `ChatChrome`'s toggle points `aria-controls` at this, so the control announces what it
         discloses rather than announcing an arrow. Unconditional, and inert on the four screens
         that have no toggle. */
      id="main-tab-bar"
      aria-label="Main"
      inert={hidden}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm',
        /*
         * INVARIANT 8. A `transition-*`, never a keyframe — the app has exactly one keyframe
         * (`ri-pulse`) with one global reduced-motion escape, and `tests/motion.reducedMotion.test.ts`
         * guards that. `transition-[translate]` and not `transition-transform` because Tailwind v4
         * compiles `translate` and `scale` to separate CSS longhands (see this file's header), so
         * `translate` is the property that actually changes here and naming it removes the question.
         *
         * `motion-reduce:transition-none` while `Chip`, `KindSelector` and `Button` correctly have
         * no escape: `app/globals.css` draws that line — colour is not motion, and a 1.5 % press
         * held under a finger is discrete tap feedback. A 58 px bar travelling its own height
         * across the bottom of the screen is on the other side of it. With the escape the bar is
         * simply where it is going, in one frame; the destination never changes, only the journey.
         */
        'transition-[translate] duration-200 ease-out motion-reduce:transition-none',
      )}
      style={{
        paddingBottom: 'var(--safe-bottom)',
        /* Both ends written explicitly. `translate`'s initial value is `none`, and interpolating a
           length against `none` is a spec corner this does not need to rely on. See
           `TAB_BAR_FAB_OVERHANG_PX` for why `100%` alone leaves the FAB on screen. */
        translate: hidden ? `0 calc(100% + ${TAB_BAR_FAB_OVERHANG_PX}px)` : '0 0',
      }}
    >
```

**Impact:** `/`, `/upload`, `/trends`, `/me`, `/r/[id]`, `/nina/about` and both `loading.tsx` files
render the bar exactly where they did — `hidden` defaults to `false`, `translate: '0 0'` is the
identity, and `inert` is omitted when false. `cn` is already imported at line 6.

---

### Step 6: `components/nina/ChatChrome.tsx` — the state, the bar, the control

**File:** `components/nina/ChatChrome.tsx` (new)
**Change:** The one client component that owns the reveal.
**Code:**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type * as React from 'react'

import { TabBar, TAB_BAR_FAB_OVERHANG_PX, TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
import { NINA_BAR_VISIBLE_VAR } from '@/lib/nina/chatview'
import {
  autoHideDelayMs,
  barToggleGlyph,
  controlBottomCss,
  isControlVisible,
  nextBarState,
  type NinaBarState,
} from '@/lib/nina/chrome'

/**
 * `/nina`'s chrome: no tab bar, and one floating control that pulls it back up (R1).
 *
 * ── WHY THE STATE IS HERE AND NOT IN `AppShell` OR IN `TabBar` ───────────────────────────────
 * `AppShell` has no `'use client'` and must not gain one. Five server pages import it, and
 * `tests/share.bundle.test.ts` exists because that import graph leaked a session read once already
 * (F33 phase 10 put `getUserId()` inside `TabBar`, and `/s/[token]`'s barrel import went red).
 * Turning the shell of `/`, `/me`, `/trends`, `/r/[id]` and `/nina` into client components for one
 * boolean is not a trade worth making.
 *
 * `TabBar` cannot hold it either, and the reason is physical rather than architectural: when the
 * bar is hidden it is translated off screen, so a control *inside* it would be unreachable — which
 * is the entire reason R1 asks for a floating one.
 *
 * So the state lives in the smallest client component that can render both, and `AppShell` keeps
 * doing exactly what its own docstring describes for the unread dot: it constructs
 * `<NinaUnreadBadgeSlot />` on the server and hands it down as a `ReactNode`, now through one more
 * hop. The badge is server work passed into a client bar; the hidden-bar boolean is client state
 * passed into the same bar from the layer above it. Same seam, opposite direction.
 *
 * ── THE THREE THINGS THIS COMPONENT MEASURES, AND THE FOUR IT DECIDES NOTHING ABOUT ──────────
 * It measures `#nina-composer`'s height, whether focus is inside it, and nothing else. Every rule —
 * what the toggle does, when the timer runs, which glyph shows, where the lane sits — is a pure
 * function in `lib/nina/chrome.ts` with a unit test, because `vitest.config.ts` runs
 * `environment: 'node'` and a rule that lives in a component cannot be asserted in this repo at
 * all. `lib/nina/chatview.ts`'s header is the pattern: the component measures; that decides.
 *
 * ── WHY IT SUBSCRIBES TO FOCUS AND NOT TO `visualViewport` ───────────────────────────────────
 * `ChatScreen` already owns a `visualViewport` subscription for the composer's keyboard lift, and
 * duplicating it would put two listeners on the same events. It is also the wrong signal here:
 * `keyboardOverlapPx` is an iOS measurement by construction and returns 0 on Android, where the
 * layout viewport really does shrink. Focus inside the composer is true on both, and it is the
 * *cause* of the keyboard rather than a proxy for it.
 *
 * ── PRE-HYDRATION ────────────────────────────────────────────────────────────────────────────
 * The bar renders hidden in the server HTML and the control renders with it, so the resting screen
 * is correct before hydration. The control does nothing until hydration — which is true of
 * everything else on this screen already: the composer cannot send, the reply swipe does not
 * swipe, and a quote does not jump.
 */

/**
 * The composer's outer `fixed` wrapper, set in `components/nina/Composer.tsx` and already measured
 * by `components/nina/ChatScreen.tsx`'s quote-scroll handler.
 *
 * Read by id rather than by a ref, because the composer is not this component's child — it is
 * rendered inside `<main>`, and this is chrome rendered beside it. The id is that component's
 * public anchor and it has two readers now; the literal is spelled in three files and a shared
 * constant is a cleanup for whoever next edits `Composer`.
 */
const COMPOSER_ID = 'nina-composer'

/**
 * What the bar occupies when it is showing: its own height plus the FAB's overhang above its top
 * edge, which the composer must clear or it would slice the top off the coral circle. The same sum
 * `ChatScreen`'s `COMPOSER_CLEARANCE_PX` computes from the same two constants, because both are
 * positioning against the same bar.
 */
const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX

export function ChatChrome({ ninaBadge }: { ninaBadge?: React.ReactNode } = {}) {
  const [bar, setBar] = useState<NinaBarState>('hidden')
  const [composerEngaged, setComposerEngaged] = useState(false)
  const [composerHeightPx, setComposerHeightPx] = useState(0)
  /** The one deferred read below, held so it cannot fire after unmount. */
  const focusTimer = useRef<number | null>(null)

  /*
   * The composer's height. A `ResizeObserver` and not a one-off measurement, because the composer
   * grows: a reply strip, a run chip, a photo chip, a tile row and a multi-line draft each add to
   * it, and a lane positioned off a constant would end up behind its `z-40` background. Same tool
   * and same reason as `components/admin/CropStudio.tsx:73`, which measures its own frame.
   *
   * Empty deps: the observer is on an element that outlives every state change here. A change to
   * the composer's `bottom` — the flag flipping, or the keyboard — does not resize it and does not
   * need to fire this, because `controlBottomCss` composes the clearance itself.
   */
  useEffect(() => {
    const composer = document.getElementById(COMPOSER_ID)
    if (composer === null) return
    const measure = () => setComposerHeightPx(composer.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  /*
   * Whether focus is inside the composer — and, when it arrives, the bar going away with it.
   *
   * Both are set in one place rather than deriving the second from the first in another effect,
   * which would cost a render and put two writers on the same piece of state.
   *
   * `focusout` fires BEFORE focus lands, while `document.activeElement` is still `<body>`, so it is
   * read one task later. Without that deferral, moving focus *within* the composer — the textarea
   * to Send, which is what pressing send is — would read as a release and then as a re-engage, and
   * the toggle would blink out and back on every send.
   */
  useEffect(() => {
    const sync = () => {
      const composer = document.getElementById(COMPOSER_ID)
      const engaged = composer !== null && composer.contains(document.activeElement)
      setComposerEngaged(engaged)
      if (engaged) setBar((current) => nextBarState(current, 'composer-engaged'))
    }
    const onFocusIn = () => sync()
    const onFocusOut = () => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
      focusTimer.current = window.setTimeout(sync, 0)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
    }
  }, [])

  /*
   * R1's five seconds. `autoHideDelayMs` returns `null` for every state that should run no timer,
   * so this effect is an early return rather than a condition, and the cleanup means a toggle
   * pressed at 4.9 s restarts the clock instead of racing it.
   */
  useEffect(() => {
    const delay = autoHideDelayMs(bar, composerEngaged)
    if (delay === null) return
    const id = window.setTimeout(() => {
      setBar((current) => nextBarState(current, 'autohide'))
    }, delay)
    return () => window.clearTimeout(id)
  }, [bar, composerEngaged])

  /*
   * The one channel to the composer, which is not a descendant of this component: `AppShell`
   * renders `<main>` and the chrome as siblings, so `:root` is the nearest thing both inherit
   * from. `composerBottomCss` reads this variable and multiplies its clearance by it.
   *
   * Set only while the bar is SHOWN. The absent default is the hidden geometry, which is what makes
   * the server's HTML and the first client frame agree — see `NINA_BAR_VISIBLE_VAR`. The cleanup
   * runs on every hide and on unmount, so navigating off `/nina` leaves nothing behind.
   */
  useEffect(() => {
    if (bar !== 'shown') return
    const root = document.documentElement
    root.style.setProperty(NINA_BAR_VISIBLE_VAR, '1')
    return () => root.style.removeProperty(NINA_BAR_VISIBLE_VAR)
  }, [bar])

  const onToggle = useCallback(() => {
    setBar((current) => nextBarState(current, 'toggle'))
  }, [])

  const glyph = barToggleGlyph(bar)

  return (
    <>
      <TabBar ninaBadge={ninaBadge} hidden={bar === 'hidden'} />

      {isControlVisible(composerEngaged) && (
        /*
         * The control lane: the full 470 px column, pinned entirely ABOVE the composer's top edge.
         *
         * `z-40` — the composer's own rung, because the two are one stack that moves together.
         * Equal `z-index` means DOM order decides, and `AppShell` renders this after `<main>`, so
         * the lane paints above the composer in the one frame where the composer has grown and the
         * observer has not caught up. Below `Sheet` (`z-50`) on purpose: phase 5's full-screen
         * sidebar must cover this, since a chevron on top of a sidebar points at chrome the sidebar
         * has replaced.
         *
         * `pointer-events-none` on the lane and `pointer-events-auto` on the button: the lane spans
         * the column, and without this it would swallow taps on the newest bubble — including
         * `MessageBubble`'s swipe-to-reply.
         *
         * A three-column grid rather than `justify-between`, so the toggle is centred on the screen
         * and stays centred whatever the left cell holds. R1 asks for it "in the bottom middle".
         */
        <div
          className="pointer-events-none fixed inset-x-0 z-40 mx-auto grid max-w-[470px] grid-cols-3 items-end px-5"
          style={{
            bottom: controlBottomCss({
              barState: bar,
              barClearancePx: BAR_CLEARANCE_PX,
              composerHeightPx,
            }),
          }}
        >
          {/*
            PHASE 5's SEAM — R6's floating `>` button, "at the bottom left corner".
            It goes in this cell. Whatever phase 5 puts here must carry `pointer-events-auto`
            (the lane is `pointer-events-none`) and must not change the lane's `grid-cols-3`, which
            is what keeps the toggle centred on the screen rather than centred in the space the `>`
            leaves over. If phase 5 needs the `>` to stay reachable while the composer has focus,
            that is a change to `isControlVisible` in `lib/nina/chrome.ts` — one rule, one test —
            and not a second visibility condition here.
          */}
          <div className="justify-self-start" />

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={bar === 'shown'}
            aria-controls="main-tab-bar"
            aria-label={glyph === 'up' ? 'Show the main navigation' : 'Hide the main navigation'}
            className="pointer-events-auto grid size-11 place-items-center justify-self-center rounded-pill bg-card/95 text-ink-2 shadow-card ring-1 ring-rule backdrop-blur-sm active:scale-[0.97]"
          >
            {/*
              One control, one glyph, flipped by `barToggleGlyph`. The user named both `^` and `v`;
              two permanent buttons would mean one of them is always a no-op occupying 44 px of the
              conversation. `aria-expanded` plus `aria-controls` is what makes the single control
              honest to a screen reader: it announces the disclosure state, not the arrow.

              `size-11` is 44 px, the iOS tap-target floor this repo cites twice, with a `size-4`
              glyph inside it — which is what "small" means here and what every round control in
              `Composer` already does.
            */}
            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
              <path
                d={glyph === 'up' ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="justify-self-end" />
        </div>
      )}
    </>
  )
}
```

**Impact:** New component. Rendered only by `AppShell` when `screen === 'chat'`, which is `/nina`
only. Nothing else imports it.

---

### Step 7: `components/ui/AppShell.tsx` — the bar stops being unconditional

**File:** `components/ui/AppShell.tsx:1-71`
**Change:** The import, the type and prop rename, the `chat` gap literal, and the chrome branch.
**Code:** replace lines 1-71 (from the first `import` through the closing `}` of `AppShell`) with:

```tsx
import type * as React from 'react'

import { ChatChrome } from '@/components/nina/ChatChrome'
import { NinaUnreadBadgeSlot } from '@/components/nina/NinaUnreadBadge'
import { cn } from '@/lib/cn'
import { TabBar } from './TabBar'

/**
 * The frame every tabbed screen sits in: a 470px column, 20px gutters, and enough bottom padding to
 * clear whatever fixed chrome that screen has.
 *
 * **Which screens get the bar, and why it is a prop rather than a layout file.** Roadmap §4.8 names
 * `/`, `/upload`, `/trends` and `/me` as the four tabs, and **F33 adds `/nina` as the fifth**;
 * `/x/[id]`, `/r/[id]/edit`, `/onboarding` and `/s/[token]` are pushed screens or standalone pages
 * with no bar at all. `/r/[id]` is the one case the roadmap and F08's own wireframes read
 * differently — §4.8 calls it a pushed screen, and §2.2's wireframe draws the bar at the bottom of
 * it. **The wireframe wins**: a run detail page is where a reader lands from a share link or after
 * a commit and then wants to go somewhere, and a screen with no way out is worse than one whose
 * chrome slightly over-claims.
 *
 * Not a route-group `layout.tsx` because `/upload`, `/x/*` and `/r/[id]/edit` are F04/F05's screens
 * with their own full-bleed chrome, and wrapping them by directory would take a layout decision
 * away from the feature that owns them.
 */

/**
 * Which chrome a screen gets, and therefore how much room the frame leaves at the bottom for it.
 *
 * **One prop for both, because they cannot be allowed to disagree.** A screen whose padding clears
 * a bar it does not render ends in a strip of empty paper; a screen that renders a bar its padding
 * does not clear ends in a sliced bubble. Two props would make both states expressible.
 *
 *   - `'tabs'` — the four tabs. The bar, and nothing above it.
 *   - `'chat'` — `/nina` (R1). **No bar at all**, a fixed composer, and one floating control that
 *     pulls the bar up on request (`components/nina/ChatChrome.tsx`). The user's reason is the
 *     requirement: "make the chat full screen. so hide the bottom bar completely (because phone
 *     screen size is small)".
 *
 * Renamed from `bottomGap` / `AppShellBottomGap` in this phase, because the value now selects the
 * chrome as well as the gap and the old name described half of what it does.
 */
export type AppShellScreen = 'tabs' | 'chat'

const BOTTOM_GAP: Record<AppShellScreen, string> = {
  // 58px bar + the FAB's overhang + breathing room, then the safe-area inset on top.
  tabs: 'pb-[calc(6rem+var(--safe-bottom))]',
  /*
   * R1. NO BAR: the composer's own 68px (a 44px control in a py-3 bar), the 8px gap above it, the
   * floating control's 44px tap target, and 12px so the newest bubble is not flush against it.
   * 68 + 8 + 44 + 12 = 132, rounded up to the nearest half-rem — the same rounding that made the
   * pre-R1 literal `10.5rem` (168px) out of 78 + 68 + 16 = 162.
   *
   * Those numbers are `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX` and `COMPOSER_RESTING_PX` in
   * `lib/nina/chrome.ts`, plus `Composer`'s own geometry; Tailwind cannot read a constant, so a
   * change to any of them changes this literal. `TAB_BAR_HEIGHT_PX` and `TAB_BAR_FAB_OVERHANG_PX`
   * are deliberately NOT in this sum any more — the bar is not below the composer on this screen.
   *
   * FIXED, not dynamic. This padding is the document's height: making it follow the reveal would
   * move the scroll position every time the bar toggles, and `MessageList`'s auto-scroll would
   * chase it. So while the bar is showing, the composer rises 78px and the last bubble sits behind
   * it for those five seconds — which is the right trade, because a runner who pulls up the bar is
   * on his way to another tab, not re-reading the last line.
   */
  chat: 'pb-[calc(8.5rem+var(--safe-bottom))]',
}

export function AppShell({
  children,
  className,
  screen = 'tabs',
}: {
  children: React.ReactNode
  className?: string
  screen?: AppShellScreen
}) {
  return (
    <>
      <main
        className={cn('mx-auto min-h-dvh w-full max-w-[470px] p-5', BOTTOM_GAP[screen], className)}
      >
        {children}
      </main>
      {/* F33 phase 10. `AppShell` has no `'use client'`, so it can construct the server-rendered
          element that `TabBar` — which does — then renders as a child. That is what puts the
          unread count on the tab without a client fetch, a poll, or a prop threaded through every
          page. Its own `<Suspense fallback={null}>` lives inside the slot.

          R1 adds one hop for the conversation screen and keeps the same seam: `ChatChrome` is the
          client component that owns the reveal state, and it renders `TabBar` with the badge it
          was handed. The state cannot live here (this file must stay a Server Component — five
          pages import it, and `tests/share.bundle.test.ts` exists because this import graph leaked
          a session read once already) and it cannot live in `TabBar` either, because a hidden bar
          is translated off screen and a control inside it would be unreachable. */}
      {screen === 'chat' ? (
        <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />} />
      ) : (
        <TabBar ninaBadge={<NinaUnreadBadgeSlot />} />
      )}
    </>
  )
}
```

`ScreenHeader` below line 71 is untouched.

**Impact:** `/`, `/me`, `/trends`, `/r[id]`, `/nina/about` and both `loading.tsx` files pass no
`screen`, get `'tabs'`, and render exactly what they did. `/nina` needs step 8. `AppShell ->
ChatChrome -> TabBar` is not a cycle; `TabBar` imports neither. `/s/[token]` does not reach this
file (`tests/share.bundle.test.ts:73`) so its graph assertions are unaffected.

---

### Step 8: `app/nina/page.tsx` — the one prop

**File:** `app/nina/page.tsx:259`
**Change:** One line, and nothing else in the file.
**Code:** replace

```tsx
    <AppShell bottomGap="chat">
```

with

```tsx
    <AppShell screen="chat">
```

**Impact:** `/nina` renders with no tab bar, `pb-[calc(8.5rem+var(--safe-bottom))]`, and
`ChatChrome`. **The `<header>` at lines 260-278 and the `<ChatScreen>` at 280-286 are not touched** —
phase 5 deletes the header (R7) and phase 3 rewrites the props.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`)
**Lint / format:** `npm run lint && npm run format:check`
**Tests:** `npm test`

Specifically green, and worth naming because they are the ones this phase could break:

- `lib/nina/chrome.test.ts` — new, all of it.
- `lib/nina/chatview.test.ts` — `keyboardOverlapPx`'s cases must still pass untouched; only
  `composerBottomCss`'s block changed.
- `tests/motion.reducedMotion.test.ts` — must still find its keyframes and its call sites and must
  still report no unused keyframe. This phase adds no keyframe and no `[animation:…]`.
- `tests/share.bundle.test.ts` — `/s/[token]`'s graph must still contain neither
  `components/ui/AppShell.tsx` nor `components/ui/TabBar.tsx`.
- `tests/ui.sheetFocus.test.ts`, `tests/ui.photoViewer.test.ts` — untouched components, asserted
  here because the `z-index` ladder was reasoned about.

**Guards:** `npm run ci:openrouter-guard && npm run ci:data-layer-guard && npm run
ci:client-secret-guard && npm run ci:f08-guard && npm run ci:llm-payload-guard && npm run
ci:f11-guard`. None of them reads a file in this phase, and this phase edits none of their tables —
`scripts/check-llm-payload-boundary.mjs` in particular is phase 4's sole property.

**Manual check**, at a 390x844 viewport with the device toolbar on:

1. `/nina` — no tab bar anywhere. The composer sits on the bottom edge, the floating chevron points
   **up** just above it, and the newest bubble is fully readable above the chevron.
2. Press the chevron. The bar slides up over ~200 ms, the composer and the chevron settle 78 px
   higher in one frame, the glyph flips to **down**, and the coral `+` is centred and fully round.
3. Wait. At five seconds the bar slides back down and the glyph flips to **up**. Nothing of the FAB
   is left on screen — check this with the device's safe-area inset set to 0, which is where
   `translate-y-full` would have left 20 px of coral visible.
4. Press the chevron, then press it again before five seconds. The bar goes straight down and no
   stale timer moves it afterwards.
5. Press the chevron, then tap into the composer. The bar goes down immediately and the chevron
   disappears. Type; nothing appears or moves. Tap a bubble to blur; the chevron returns and the bar
   stays down.
6. Arm a reply by swiping a bubble right, then blur the composer. The composer is taller and the
   chevron has ridden up with it — not behind it.
7. In DevTools, set "Emulate CSS prefers-reduced-motion: reduce" and press the chevron. The bar is
   simply there, with no travel.
8. Keyboard only: Tab through `/nina`. Focus never lands on a link inside the hidden bar. Reveal the
   bar with the chevron (Space/Enter) and the five tabs become reachable; let it hide and they leave
   the tab order again.
9. `/`, `/upload`, `/trends`, `/me`, `/r/<id>` and `/nina/about` — the bar is exactly where it was,
   the unread dot still renders on the Nina tab, and nothing has moved by a pixel.

**Exit criteria:**

- `/nina` renders with no visible tab bar and the newest bubble is not obscured by the composer or
  by the floating control.
- The floating control reveals the bar, its glyph flips, and the bar hides itself again five seconds
  later; a second press hides it immediately.
- Focusing the composer hides the bar and retracts the control; blurring restores the control and
  does not restore the bar.
- The reveal holds still under `prefers-reduced-motion`, and no `@keyframes` was added.
- The hidden bar is out of the tab order and out of the accessibility tree.
- `keyboardOverlapPx`'s existing tests pass unchanged, `lib/nina/chrome.test.ts` passes, and the
  four other tabbed screens are unchanged.

## Handoffs

**To phase 3 (`components/nina/ChatScreen.tsx`):**

1. `COMPOSER_FALLBACK_PX = 146` (`ChatScreen.tsx:81`) now over-estimates. It is the obstruction
   `planQuoteScroll` uses when `#nina-composer` cannot be measured, and with the bar hidden the real
   obstruction is 68 px, not 146. Deliberately not changed here: the file is phase 3's, the path is
   only reachable before the composer mounts, and the consequence is a quote jump that scrolls
   slightly further than it needs to. If phase 3 touches it, `COMPOSER_CLEARANCE_PX + 68` should
   become plain `68`, and `COMPOSER_CLEARANCE_PX` itself should stay at 78 — it is still the
   showing-state clearance and `composerBottomCss` still multiplies it by the flag.
2. **Do not add `transition-[bottom]` to `#nina-composer`** to smooth the 78 px reposition. It would
   also animate the keyboard lift, which must be instantaneous because it is tracking Safari's own
   keyboard animation — `decideAutoScroll`'s fourth rule records what animating against an
   already-moved layout looks like. Rejected here on the record rather than left open.
3. Phase 3 must keep `id="nina-composer"` on the composer's outer wrapper. `ChatChrome` measures it
   and reads focus containment from it.

**To phase 5 (`components/nina/NinaSidebar.tsx`, `ChatChrome.tsx`'s `>` button):**

4. The seam is the left cell of `ChatChrome`'s control lane, marked with a `PHASE 5's SEAM` comment
   in step 6. Constraints, all stated in that comment: keep `pointer-events-auto` on the button
   (the lane is `pointer-events-none`), keep the lane's `grid-cols-3` (it is what centres the
   toggle on the screen rather than in the space the `>` leaves), and if the `>` must survive the
   composer having focus, change `isControlVisible` in `lib/nina/chrome.ts` — one rule, one test —
   rather than adding a second visibility condition in the component.
5. If the sidebar is a `Sheet`, it is `z-50` and covers the `z-40` lane with no coordination needed.
   If it is not, phase 5 owns making the lane not float over its own surface.
6. Phase 5 deletes `/nina`'s `<header>` (R7). That is top-of-screen geometry and interacts with
   nothing here — `BOTTOM_GAP.chat` is a bottom padding and `AppShell`'s `p-5` top padding is
   untouched.

**Cleanups, deliberately not done:**

7. `'nina-composer'` is now a string literal in three files (`Composer.tsx:351`,
   `ChatScreen.tsx:330`, `ChatChrome.tsx`). A shared constant belongs to whoever next edits
   `Composer.tsx`, which is nobody in this set.
8. `BOTTOM_GAP.chat`'s 136 px assumes a resting 68 px composer. A composer grown by a reply strip, a
   run chip, a photo chip or a tile row overlaps the newest bubble — which the pre-R1 168 px literal
   did too, for the same reason. Fixing it means a dynamic padding, which is rejected in the
   `BOTTOM_GAP` comment for the scroll-position reason.
9. `AppShell`'s `screen` prop could reasonably grow a `'plain'` case for `/x/[id]`, `/onboarding`
   and `/r/[id]/edit`, which today render no `AppShell` at all. Out of scope: R1 is about `/nina`.

## Rollback

This phase is one commit and reverts alone: `git revert <phase-2 commit>`. It ships no migration,
touches no query, and writes no row.

By hand, if a revert is not clean:

1. `rm lib/nina/chrome.ts lib/nina/chrome.test.ts components/nina/ChatChrome.tsx`
2. `components/ui/AppShell.tsx` — drop the `ChatChrome` import, rename `screen` back to `bottomGap`
   and `AppShellScreen` back to `AppShellBottomGap`, restore
   `chat: 'pb-[calc(10.5rem+var(--safe-bottom))]'`, and restore the unconditional
   `<TabBar ninaBadge={<NinaUnreadBadgeSlot />} />`.
3. `components/ui/TabBar.tsx` — drop `hidden` from the signature, and restore the `<nav>`'s original
   className string and its `style={{ paddingBottom: 'var(--safe-bottom)' }}`.
4. `lib/nina/chatview.ts` — drop `NINA_BAR_VISIBLE_VAR` and restore
   `return \`calc(${clearance}px + var(--safe-bottom))\``.
5. `lib/nina/chatview.test.ts` — restore the three original `composerBottomCss` assertions and drop
   `NINA_BAR_VISIBLE_VAR` from the import.
6. `app/nina/page.tsx:259` — `screen="chat"` back to `bottomGap="chat"`.

**If phase 3 or 5 has already landed**, step 6 is the only one that can conflict, and only over that
one attribute name.
