# Code Analysis: the tab bar's coral FAB, and the gap between `/nina`'s composer and the bar

**Type:** Feature Update (R1 — information architecture) + Bug Investigation (R2 — layout arithmetic)
**Date:** 2026-09-05 05:14 +07
**Session ID:** 20260905-051414-T4B7
**Plan:** `TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/tabbar-new-tab-composer-seam`, branch `feature/tabbar-new-tab-composer-seam` (base `origin/main` @ `e343e34`)

---

## User Input

### Original User Request

```
1. UI revamp: replace the + button to a normal "new" text that does not take more space outside the bottom bar
2. user query dan bottom bar tidak menempel dengan baik, ada gap. check this screenshot

[screenshot attached]
```

### User-Provided Context

One screenshot, a 750×1580-ish iPhone capture of `/nina` with the tab bar revealed. Two things
in it are the whole of the request, and both are measurable from the image:

1. **The `+`** — a coral (`--z5`) circle, roughly 56 px across, sitting centred on the tab bar and
   overhanging its top edge by about a third of its own height. It covers the bottom of the
   conversation: in this capture it sits on top of a white message bubble, and the bubble's text
   (`lagi duduk manis di perpustakaan…`) is legible to its left and right but hidden behind it.
   That is the "more space outside the bottom bar" the request names.

2. **The gap** — the composer strip (`Message Nina`, the photo button, the coral send arrow) does
   not rest on the tab bar. Between the composer's bottom border and the bar's top border there is
   a band of roughly 20 px in which the conversation itself is visible: a white bubble's first line
   shows through, clipped, between the two bars. The user's words for it: *"user query dan bottom
   bar tidak menempel dengan baik, ada gap"* — the query bar and the bottom bar do not sit flush.

The screenshot was not written to disk by the harness, so it is not committed here; this paragraph
is the record of what it showed. **Nothing below depends on the image** — the gap's exact size is
derived from the source arithmetic in *The 19 px band* section, and it agrees with the capture.

### User-Provided Files

None marked with `@`. Every file below was reached from the screenshot by reading the two bars
that appear in it.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Replace the `+` button with a normal "new" text control, one that does not take up space outside the bottom bar |
| R2 | The user's query bar and the bottom bar do not sit flush against each other — there is a gap; close it |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

*R1.* `components/ui/TabBar.tsx` renders `/upload` not as a peer tab but as a raised coral circle
carrying a `+` glyph, absolutely positioned at `-top-5` inside the bar's grid so that 20 px of it
overhangs the bar's top edge and paints over whatever screen is behind. The request is to demote it
to a normal tab cell — the same icon-over-label shape the other four tabs use, labelled with the
word the user gave ("new") — so that the bar occupies exactly its own box and nothing of it
extends above its top edge.

*R2.* `/nina`'s composer is `position: fixed` and computes its own `bottom` in JavaScript, because
it is the app's only fixed bar that stacks above another fixed bar. That computation clears the tab
bar's 58 px **plus the FAB's 20 px overhang** — the overhang has to be cleared, or the coral circle
would be painted across the composer. The bar's own top edge, however, is only 59 px up (58 px grid
+ 1 px `border-t`). The difference is a 19 px band of neither bar, through which the scrolling
conversation is visible. That band is the reported gap.

**The two are one mechanism.** R1's overhang is R2's gap: the composer is lifted 20 px because the
FAB reaches 20 px up, and the moment the FAB stops reaching up, 19 of the gap's 19 px have no
reason to exist. This is a real coupling in the code, not a coincidence of phrasing, and the plan
is ordered by it (R1's phase first) rather than pretending the two are independent.

**Success Criteria**

- R1: no part of `<nav id="main-tab-bar">` paints above its own border box. `/upload` is reachable
  from a tab cell that looks like Runs, Nina, Trends and Me — glyph above a caption — and the
  caption reads the word the user asked for. `aria-current` still marks it on `/upload`.
- R1: the bar's hide transform on `/nina` is `translate: 0 100%` and nothing remains on screen —
  today `100%` alone would leave 20 px of coral circle visible, which is why
  `TAB_BAR_FAB_OVERHANG_PX` is added to the translate.
- R2: with the bar revealed, the composer's bottom border and the bar's top border are adjacent.
  No pixel of the conversation is visible between them at any `--safe-bottom` value, including 0.
- Both: `npx tsc --noEmit`, `npm run lint` and `npx vitest run` green; the two geometry test files
  (`lib/nina/chrome.test.ts`, `lib/nina/chatview.test.ts`) updated where they name the old numbers.

**Key Considerations**

- **`--safe-bottom` cancels.** Both the bar's padding and the composer's clearance carry the
  home-indicator inset, and it appears exactly once in `composerBottomCss`'s output — outside the
  bar-visible multiplier, because the inset is the phone's and not the bar's. The gap arithmetic is
  therefore independent of the device, which matches the screenshot: the capture is a
  home-indicator phone and the gap is there anyway.
- **Tailwind cannot read a TypeScript constant.** Every one of these numbers is spelled twice by
  necessity — once as an arbitrary value in a class, once as an exported constant — and the files
  say so out loud in three places. Any change to the geometry has to move both spellings, and the
  comments that assert the arithmetic are load-bearing documentation that goes stale silently.
- **`lib/` never imports `components/`.** `controlBottomCss` and `composerBottomCss` take the
  clearance as a *parameter* for this reason. So the pure functions need no signature change; only
  the constants their callers compose change. This is why R2 is a small, well-contained phase.
- **The bar is hidden by default on `/nina`.** `NINA_BAR_VISIBLE_VAR` is absent unless the bar is
  showing, `var()` substitutes `0`, and the composer sits on the inset alone. The gap exists only
  in the revealed state — which is the state the screenshot captured, and the only state R2 is
  about.
- **`AppShell`'s `chat` bottom padding is deliberately fixed, not dynamic** (see its comment): the
  document's height must not follow the reveal, or the scroll position moves each time the bar
  toggles. R2 must not make that padding dynamic to close the gap.
- The roadmap's §4.8 route table describes the FAB as "centre, raised, coral … a circular FAB
  breaking the bar's top edge, not a peer of the others", with a paragraph of argument for why.
  R1 overrules that design intent. The roadmap is documentation of intent, so it is part of the
  change rather than collateral: leaving it asserting a shape the code no longer has is how the
  next reader concludes the code is wrong.

---

## Analysis Scope

### Explicitly Mentioned Files

None. Entry was the screenshot.

### Discovered Related Files

- `components/ui/TabBar.tsx` — the bar, the FAB, and both geometry constants
- `components/nina/ChatChrome.tsx` — composes `BAR_CLEARANCE_PX` from them; owns the reveal state
- `components/nina/ChatScreen.tsx` — composes `COMPOSER_CLEARANCE_PX` from them; renders `Composer`
- `components/nina/Composer.tsx` — the fixed query bar; takes `bottomCss` as a prop
- `lib/nina/chatview.ts` — `composerBottomCss`, `NINA_BAR_VISIBLE_VAR`
- `lib/nina/chrome.ts` — `controlBottomCss`, the floating `>`/`^` lane's arithmetic
- `components/ui/AppShell.tsx` — `BOTTOM_GAP`, the two hard-coded bottom paddings
- `components/nina/NinaSidebar.tsx` — comment naming the three numbers (doc only)
- `lib/nina/chrome.test.ts` — `BAR_CLEARANCE = 78`, plus source-text assertions against `TabBar.tsx`
- `lib/nina/chatview.test.ts` — five assertions with `78` as the clearance input
- `ROADMAP_v0.1.0.md` §4.8 — the route table's Upload row

---

## Current Dataflow

### Entry Point: `<TabBar>`

**Location:** `components/ui/TabBar.tsx:101`
**Trigger:** rendered by `AppShell` as a sibling of `<main>`, on every screen; `/nina` renders it
through `ChatChrome` instead so the reveal state can drive it.
**Input:** `{ ninaBadge?: React.ReactNode; hidden?: boolean }`, both optional.
**Validation:** none. `usePathname()` is the only client dependency, used for `aria-current`.

**Transform — the grid (`TabBar.tsx:146`):**

```
<div className="relative mx-auto grid h-[58px] w-full max-w-[470px] grid-cols-5 items-center">
```

Five columns for four tabs. `TABS` (line 68) holds Runs, Nina, Trends, Me; cells 1, 2, 4, 5 are
`<Tab>`s and cell 3 is a `flex justify-center` wrapper holding the FAB:

```
<Link href="/upload" aria-label="Upload a run"
      className="absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center
                 rounded-full bg-z5 text-white shadow-card active:scale-[0.97]">
```

`absolute -top-5` against the `relative` grid, so it is **out of flow**: it consumes no column
width and paints 20 px above the grid's top edge. `size-14` is 56 px, so 36 px of it is inside the
bar and 20 px is outside — the number `TAB_BAR_FAB_OVERHANG_PX` names.

**Exit points:** five `<Link>`s. No side effects; the bar works before hydration.

### The two exported constants

**Location:** `components/ui/TabBar.tsx:51`, `:66`

| constant | value | mirrors | consumed by |
|---|---|---|---|
| `TAB_BAR_HEIGHT_PX` | `58` | `h-[58px]` on the grid | `ChatChrome`, `ChatScreen` |
| `TAB_BAR_FAB_OVERHANG_PX` | `20` | `-top-5` on the FAB | `ChatChrome`, `ChatScreen`, and the bar's own hide transform |

The second is used **twice inside the file it is declared in** (line 143):

```
translate: hidden ? `0 calc(100% + ${TAB_BAR_FAB_OVERHANG_PX}px)` : '0 0',
```

with the header comment explaining why `100%` alone is 19 px short: the nav's border box is
`1 + 58 + safe`, the FAB's box spans `safe+22` to `safe+78` measured up from the viewport bottom,
so clearing it needs `safe + 78` and `100%` is `59 + safe`.

### Processing chain: the composer's `bottom`

1. **`ChatScreen`** — `components/nina/ChatScreen.tsx:99`
   ```
   const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX   // 78
   ```
   and at line 774:
   ```
   bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
   ```
   `overlap` is `keyboardOverlapPx(...)` — the visual-viewport measurement of the software
   keyboard, `0` when there is none.

2. **`composerBottomCss`** — `lib/nina/chatview.ts:230`
   ```
   if (overlapPx > 0) return `${Math.round(overlapPx)}px`
   return `calc(${clearance}px * var(--nina-bar-visible, 0) + var(--safe-bottom))`
   ```
   With no keyboard and the bar showing: `calc(78px * 1 + var(--safe-bottom))`.
   With no keyboard and the bar hidden: the variable is **absent**, `var()` substitutes `0`, and
   the result is `calc(0px + var(--safe-bottom))`. That default is deliberate — `/nina`'s resting
   state is a hidden bar, so the hidden geometry is also the SSR answer and there is no reposition
   on hydration.

3. **`Composer`** — `components/nina/Composer.tsx:349`
   ```
   <div id="nina-composer"
        className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
        style={{ bottom: bottomCss }}>
   ```
   Its own `border-t` is the composer's bottom-most... **top** edge; it has no bottom border and no
   bottom padding, on purpose: the comment at `chatview.ts:213` records that padding it by
   `--safe-bottom` a second time "would open a gap", since the chrome below it already pads by the
   inset.

4. **`ChatChrome`** — `components/nina/ChatChrome.tsx:77`
   ```
   const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX        // 78
   ```
   feeds `controlBottomCss({ barState, barClearancePx, composerHeightPx })` (`lib/nina/chrome.ts:187`),
   which returns `calc(${clearance + composer + 8}px + var(--safe-bottom))` — the floating `>` and
   `^` lane, which must sit above the composer, which must sit above the bar. A third spelling of
   the same sum.

5. **`ChatChrome`** also writes the CSS variable (`:161`):
   ```
   if (bar !== 'shown') return
   root.style.setProperty('--nina-bar-visible', '1')
   return () => { root.style.removeProperty('--nina-bar-visible') }
   ```
   `:root`, because `AppShell` renders `<main>` (containing `ChatScreen` → `Composer`) and the
   chrome as **siblings** — a custom property is the only channel that crosses that gap.

### State changes

None persisted. The reveal is `useState<NinaBarState>` in `ChatChrome`, hidden by default,
auto-hiding after `CHROME_AUTOHIDE_MS = 5000` unless the composer holds focus.

### Exit points

Paint only. No network, no storage, no logs.

---

## The 19 px band — R2's mechanism, derived

Measured upward from the viewport's bottom edge, with the bar **shown** and no keyboard:

| edge | expression | px (safe = S) |
|---|---|---|
| bar's outer bottom | `bottom: 0` | `0` |
| bar's grid bottom | its own `padding-bottom: var(--safe-bottom)` | `S` |
| bar's grid top | `+ h-[58px]` | `S + 58` |
| **bar's top border** | `+ 1px border-t` | **`S + 59`** |
| FAB's box top | `absolute -top-5` above the grid top, `size-14` | `S + 78` |
| **composer's bottom edge** | `calc(78px * 1 + var(--safe-bottom))` | **`S + 78`** |

`(S + 78) − (S + 59) = 19`. The inset cancels, so the band is 19 px on every device, and the
conversation — `<main>`, `z`-below both bars — is what is painted in it. That is the gap in the
screenshot, and its size in the capture is consistent with 19 CSS px at that device scale.

Two facts follow, and they are the whole of the plan:

- **18 of those 19 px are the FAB's**, and they disappear the moment the FAB stops overhanging.
  R1 does that. After R1, with `clearance = TAB_BAR_HEIGHT_PX` alone, the composer's bottom edge is
  at `S + 58` and the bar's top border at `S + 59` — the composer would now **overlap** the bar's
  border by 1 px rather than gap from it. Painted, that reads as flush: `bg-paper/90` over the
  bar's `border-rule`. But it is an overlap arrived at by accident, and the composer's own
  `border-t` is not what is at that edge.
- **The last 1 px is the bar's `border-t`**, which no clearance term has ever accounted for. The
  honest clearance is the bar's **outer** height — `58 + 1` — which puts the composer's bottom edge
  exactly on the bar's top border, touching it and not crossing it. That is R2's fix, and it is a
  distinct change from R1: it is true whether or not a FAB exists, and it is wrong today for a
  reason that has nothing to do with the FAB.

---

## Key Data Structures

### `TABS` — `components/ui/TabBar.tsx:68`

```
const TABS = [
  { href: '/', label: 'Runs', icon: RunsIcon },
  { href: '/nina', label: 'Nina', icon: NinaIcon },
  { href: '/trends', label: 'Trends', icon: TrendsIcon },
  { href: '/me', label: 'Me', icon: MeIcon },
] as const
```

Four entries for a five-column grid. `/upload` is **not** in it — it is the hand-written `<Link>`
in cell 3. Consumed positionally at lines 147, 149, 170, 171 (`TABS[0]`, `[1]`, `[2]`, `[3]`).

### `Tab` — `components/ui/TabBar.tsx:187`

```
{ href: string; label: string; icon: (props: {className: string}) => React.ReactNode;
  active: boolean; badge?: React.ReactNode }
```

Renders `flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold`, with
the icon inside `<span className="relative grid size-5 place-items-center">` and the label below.
`active ? 'text-ink' : 'text-ink-3'`. This is the shape R1 moves `/upload` into.

### `NinaBarState` — `lib/nina/chrome.ts:41`

`'hidden' | 'shown'`. Transitions in `nextBarState`; `'hidden'` is the initial and the auto-hide
destination.

### `AppShellScreen` / `BOTTOM_GAP` — `components/ui/AppShell.tsx:43`

```
tabs: 'pb-[calc(6rem+var(--safe-bottom))]',    // "58px bar + the FAB's overhang + breathing room"
chat: 'pb-[calc(7.5rem+var(--safe-bottom))]',  // 68 composer + 8 gap + 32 control + 12
```

`tabs` is 96 px and its comment attributes 78 of it to the bar and the FAB. `chat`'s comment says
`TAB_BAR_HEIGHT_PX` and `TAB_BAR_FAB_OVERHANG_PX` "are deliberately NOT in this sum any more —
the bar is not below the composer on this screen".

---

## Dependencies

### Configuration / Environment

- `--safe-bottom`, defined in `app/globals.css` from `env(safe-area-inset-bottom)`, inert without
  `viewport-fit=cover` in `app/layout.tsx` (already set, and load-bearing).
- `--nina-bar-visible`, written on `document.documentElement` by `ChatChrome`, read by
  `composerBottomCss`'s output. Absent means hidden.
- `--z5`, the coral the FAB is painted in (`bg-z5`).

### External Services

None. This is paint.

### Test harness

`vitest.config.ts` runs `environment: 'node'` with `include` matching `*.test.ts` — **no jsdom**.
So there is no rendered-DOM test available for either requirement: the geometry is asserted through
the pure functions in `lib/nina/`, and `lib/nina/chrome.test.ts:196` additionally asserts against
`TabBar.tsx`'s **source text** (`readFileSync`), for the reduced-motion rule. That source-text
technique is the only mechanism in the repo that can assert something about the bar's markup, and
it is the one available to R1.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `TAB_BAR_HEIGHT_PX` | `components/ui/TabBar.tsx:51` | def | `components/ui` |
| `TAB_BAR_FAB_OVERHANG_PX` | `components/ui/TabBar.tsx:66` | def | `components/ui` |
| `TAB_BAR_FAB_OVERHANG_PX` | `components/ui/TabBar.tsx:143` | call (hide transform) | `components/ui` |
| the FAB `<Link href="/upload">` | `components/ui/TabBar.tsx:152–168` | def | `components/ui` |
| `TABS` | `components/ui/TabBar.tsx:68`, used `:147,149,170,171` | def · call | `components/ui` |
| `Tab` | `components/ui/TabBar.tsx:187` | def | `components/ui` |
| both constants | `components/nina/ChatChrome.tsx:6` | import | `components/nina` |
| `BAR_CLEARANCE_PX` | `components/nina/ChatChrome.tsx:77` | def (78) | `components/nina` |
| `controlBottomCss(...)` | `components/nina/ChatChrome.tsx:214` | call | `components/nina` |
| `TAB_BAR_FAB_OVERHANG_PX` | `components/nina/ChatChrome.tsx:224` | doc | `components/nina` |
| both constants | `components/nina/ChatScreen.tsx:8` | import | `components/nina` |
| `COMPOSER_CLEARANCE_PX` | `components/nina/ChatScreen.tsx:99` | def (78) | `components/nina` |
| `composerBottomCss(...)` | `components/nina/ChatScreen.tsx:774` | call | `components/nina` |
| `composerBottomCss` | `lib/nina/chatview.ts:230` | def | `lib/nina` |
| `NINA_BAR_VISIBLE_VAR` | `lib/nina/chatview.ts:201` | def | `lib/nina` |
| the 78 arithmetic | `lib/nina/chatview.ts:203–229` | doc | `lib/nina` |
| `controlBottomCss` | `lib/nina/chrome.ts:187` | def | `lib/nina` |
| `barClearancePx` doc naming both constants | `lib/nina/chrome.ts:189` | doc | `lib/nina` |
| `BAR_CLEARANCE = 78` | `lib/nina/chrome.test.ts:18` | test | `lib/nina` |
| `controlBottomCss` cases | `lib/nina/chrome.test.ts:90–180` | test | `lib/nina` |
| `TabBar.tsx` source assertions | `lib/nina/chrome.test.ts:196–213` | test | `lib/nina` |
| `composerBottomCss(0, 78)` ×5 | `lib/nina/chatview.test.ts:218–249` | test | `lib/nina` |
| `bottomCss` prop | `components/nina/Composer.tsx:153`, used `:351` | call | `components/nina` |
| the 78 in the header | `components/nina/Composer.tsx:34,86` | doc | `components/nina` |
| `BOTTOM_GAP.tabs` (`6rem`) | `components/ui/AppShell.tsx:47` | def | `components/ui` |
| `BOTTOM_GAP.chat` comment naming both constants | `components/ui/AppShell.tsx:61` | doc | `components/ui` |
| both constants | `components/nina/NinaSidebar.tsx:166–167` | doc | `components/nina` |
| `TAB_BAR_HEIGHT_PX` | `components/ui/PhotoViewer.tsx:253` | doc | `components/ui` |
| Upload row, §4.8 | `ROADMAP_v0.1.0.md:484` | doc | — |

**Not affected:** `keyboardOverlapPx`, `decideAutoScroll`, `groupIntoDays`, `isNearBottom`,
`nextBarState`, `autoHideDelayMs`, `isControlVisible`, `barToggleGlyph`. The keyboard branch of
`composerBottomCss` returns before the clearance is read, so every keyboard case is untouched by
both requirements.

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `components/ui/TabBar.tsx` | the FAB becomes a fifth `Tab`; `TAB_BAR_FAB_OVERHANG_PX` is deleted and the hide transform simplifies to `0 100%`; the header's whole FAB argument is rewritten | 1 |
| 2 | `components/nina/ChatChrome.tsx` | `BAR_CLEARANCE_PX` loses its overhang term (P1), then gains the border term (P2) | 1, 2 |
| 3 | `components/nina/ChatScreen.tsx` | `COMPOSER_CLEARANCE_PX`, same two edits | 1, 2 |
| 4 | `lib/nina/chrome.test.ts` | `BAR_CLEARANCE = 78`'s value and its comment; new source assertions that nothing overhangs | 1, 2 |
| 5 | `lib/nina/chatview.test.ts` | five `78` inputs and the comments that call 78 "the idle clearance" | 1, 2 |
| 6 | `components/ui/AppShell.tsx` | `BOTTOM_GAP.tabs`'s comment attributes 20 px to a FAB that is gone; `chat`'s comment names the deleted constant | 1 |
| 7 | `components/nina/NinaSidebar.tsx` | comment names the deleted constant | 1 |
| 8 | `components/nina/Composer.tsx` | header says "clears 78 px" | 2 |
| 9 | `lib/nina/chatview.ts` | `composerBottomCss`'s doc enumerates the terms, one of which is gone; the border term is new | 2 |
| 10 | `lib/nina/chrome.ts` | `barClearancePx`'s doc names the deleted constant | 2 |
| 11 | `ROADMAP_v0.1.0.md` §4.8 | the Upload row asserts a shape the code no longer has | 1 |
| 12 | `components/ui/PhotoViewer.tsx:253` | mentions `TAB_BAR_HEIGHT_PX` only, which does not change — **read to confirm, expected no edit** | — |

**This document describes. The plan files prescribe.**
