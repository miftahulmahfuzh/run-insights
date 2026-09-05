# Phase 2: The composer clears the bar's outer height, so it sits flush

**Plan set:** `TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md`
**Analysis:** `20260905-051414-T4B7_code_analyzer.md`
**Satisfies:** R2 — the query bar and the bottom bar sit flush; the band of conversation between them is gone
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `components/nina`, `lib/nina` (one additive edit in `components/ui`)

---

## Goal

The tab bar's clearance becomes the bar's **outer** height — its 58 px grid plus the 1 px `border-t`
the grid sits under — expressed once, as `TAB_BAR_OUTER_HEIGHT_PX` in `components/ui/TabBar.tsx`,
and read by both `/nina` clearances instead of composed at each call site. After this phase the
composer's bottom edge lands exactly on the bar's top border: no visible band of conversation
between the two bars, and no overlap that would paint `bg-paper/90` over the bar's own rule. Every
prose site that still asserts the old arithmetic says the new one — nine of them, across the seven
files in the *Files* table plus the two test files — and a test fails if anyone re-introduces the
missing pixel.

---

## READ THIS FIRST: every "before" below is post-phase-1

Phase 1 lands before this phase (the set is sequential by necessity — see the index's *Phases*
note). **The tree this phase edits is not the tree on disk today.** Concretely, phase 1 has already:

- deleted `TAB_BAR_FAB_OVERHANG_PX` from `components/ui/TabBar.tsx` (today: `:66`) and its docblock
  (today: `:53–65`);
- simplified the bar's hide transform to `translate: hidden ? '0 100%' : '0 0'`;
- demoted the FAB to a fifth `Tab` cell captioned `New`, and rewritten the file header's FAB
  argument;
- moved **both** clearance constants to the grid height alone, so
  `components/nina/ChatChrome.tsx:77` reads `const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX` and
  `components/nina/ChatScreen.tsx:99` reads `const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX`, with
  the overhang import dropped from both;
- moved `lib/nina/chrome.test.ts`'s `BAR_CLEARANCE` from `78` to `58` (with its JSDoc), and
  `lib/nina/chatview.test.ts`'s **six occurrences of `78`** — four clearance inputs (`:223`, `:231`,
  `:237`, `:241`) and two expected strings (`:224`, `:242`) — to `58`;
- fixed the comments in `components/ui/AppShell.tsx` and `components/nina/NinaSidebar.tsx`, and
  `ROADMAP_v0.1.0.md` §4.8;
- rewritten `components/nina/ChatChrome.tsx:222–226`'s floating-`>` lane comment to name **no
  constant at all** — that region is phase 1's alone and **this phase does not open it** (see
  *Reconciled cross-phase notes*);
- **created** `tests/tabbar.geometry.test.ts`, which this phase extends rather than writes, with
  exactly this shape: `import { describe, expect, it } from 'vitest'`,
  `import { readRepoCode } from './support/importGraph'`, one module-scope
  `const BAR = 'components/ui/TabBar.tsx'`, and two `describe` blocks holding seven `it`s. Phase 1
  pre-declares nothing this phase needs, because an unused constant fails `npm run lint`.

Phase 1 explicitly does **not** touch `lib/nina/chatview.ts`, `lib/nina/chrome.ts` or
`components/nina/Composer.tsx`, so for those three files the text quoted below is today's text and
is exact. For `TabBar.tsx`, `ChatChrome.tsx`, `ChatScreen.tsx` and the two `lib/nina/*.test.ts`
files, the "before" is stated as phase 1 leaves it — and reconciliation replaced this phase's three
original "match an anchor, don't trust the old string" cases with **phase 1's literal output**,
quoted in each step's **Before**. There is no guesswork left in this phase. If any **Before** below
does not match what is on disk when this phase starts, phase 1 did not land as planned: stop and
re-read phase 1 rather than improvising a merge.

**Line numbers** are today's, from the analysis's reference list; they will have drifted by a few
lines after phase 1 (it deletes ~14 lines from `TabBar.tsx` and adds markup). Match on the quoted
identifiers, not on the numbers.

---

## Interface Contract

**Deletes:** nothing. No symbol, no export, no config key. (Phase 1 owns the only deletion in this
set.)

**Renames:** nothing.

**Creates:**
- `TAB_BAR_BORDER_PX` — `components/ui/TabBar.tsx` (exported const, `1`)
- `TAB_BAR_OUTER_HEIGHT_PX` — `components/ui/TabBar.tsx` (exported const, `TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX` = `59`)

**Signature changes:** none. `composerBottomCss(overlapPx, chromeClearancePx)` and
`controlBottomCss({ barState, barClearancePx, composerHeightPx })` keep their exact signatures and
their exact bodies (invariant 4 — `lib/` never imports `components/`).

**Requires (from Phase 1):**
- `pkg components/ui/TabBar.tsx` no longer exports `TAB_BAR_FAB_OVERHANG_PX`; `TAB_BAR_HEIGHT_PX = 58`
  still exists and is still exported.
- `TabBar.tsx`'s grid still carries `h-[58px]` and the `<nav>` still carries `border-t border-rule`
  — the two classes this phase's new constants mirror. If phase 1 changed either, this phase's
  numbers change with it and the mirror comments must be re-derived.
- `components/nina/ChatChrome.tsx:77` reads `const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX` and imports
  `{ TabBar, TAB_BAR_HEIGHT_PX }`.
- `components/nina/ChatScreen.tsx:99` reads `const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX` and
  imports `{ TAB_BAR_HEIGHT_PX }`.
- `lib/nina/chrome.test.ts`'s `BAR_CLEARANCE` is `58`; `lib/nina/chatview.test.ts`'s four clearance
  inputs and two expected strings are `58`.
- `components/nina/ChatChrome.tsx:222–226`'s floating-`>` lane comment **names no constant** — phase
  1 rewrote it that way on purpose, so this phase does not have to reopen it.
- `components/ui/AppShell.tsx` contains **no live `78`** — phase 1 removed the literal from
  `BOTTOM_GAP.chat`'s last paragraph rather than changing it to `58`, so this phase never opens that
  file. (The `78 + 68 + 16 = 162` at `:52` stays as history.)
- `tests/tabbar.geometry.test.ts` exists, imports `{ describe, expect, it } from 'vitest'` and
  `{ readRepoCode } from './support/importGraph'`, and declares
  `const BAR = 'components/ui/TabBar.tsx'` at module scope. This phase **reuses `BAR`** and appends;
  it edits neither of phase 1's two `describe` blocks.

**Also owned by this phase** (added at reconciliation, so they have a named owner):
- `components/ui/TabBar.tsx:45–50` — `TAB_BAR_HEIGHT_PX`'s docblock (Step 1a). Doc only.
- `lib/nina/chatview.ts:189` — the "78 px settle" inside `NINA_BAR_VISIBLE_VAR`'s docblock (Step 5a).
- `lib/nina/chrome.ts:189` — `barClearancePx`'s JSDoc (Step 6). **This is the step that makes phase
  1's repo-wide `TAB_BAR_FAB_OVERHANG_PX` grep return empty** (index `## Decisions` D9).

**Leaves alone (owned by others):**
- **All markup in `components/ui/TabBar.tsx`** — the `<nav>`, the grid, the five `Tab` cells, the
  hide transform, the file header, `TABS`, `Tab`, the icons. Phase 1 owns the bar's shape and it is
  final. This phase's only code change in that file is two `export const` lines inserted after
  `TAB_BAR_HEIGHT_PX`.
- `components/ui/AppShell.tsx` — `BOTTOM_GAP` in value **and** comment (Phase 1, D6).
- `components/nina/NinaSidebar.tsx` (Phase 1).
- `ROADMAP_v0.1.0.md` (Phase 1).
- The reveal state machine (`nextBarState`, `autoHideDelayMs`, `CHROME_AUTOHIDE_MS`,
  `isControlVisible`, `barToggleGlyph`) and their tests.
- The keyboard branch: `keyboardOverlapPx`, and `composerBottomCss`'s `overlapPx > 0` early return.
- `components/ui/PhotoViewer.tsx:253` — read and confirmed: it names `TAB_BAR_HEIGHT_PX` only as an
  example of the "Tailwind cannot read a constant" coupling, which is still true and still that
  constant. **No edit.**

---

## Reconciled cross-phase notes

Reconciliation settled every cross-phase question this phase raised. Nothing here is open.

**1. `lib/nina/chrome.ts:189` — RESOLVED, this phase owns it (index `## Decisions` D9).** The draft
index gave phase 1 an exit criterion demanding `TAB_BAR_FAB_OVERHANG_PX` appear nowhere in the repo,
while its does-not-touch list handed `lib/nina/chrome.ts` to phase 2 — and `:189` names that
constant in a JSDoc. Both could not hold at the end of phase 1. Ownership won, on the rung of the
index's own phase boundaries. Phase 1's criterion is narrowed to "no *executable* reference, and the
only textual reference left is the doc comment phase 2 owns"; **this phase's Step 6 is that comment's
named owner, and Step 6 is what makes the repo-wide grep true.** Phase 1 does not touch the file.

**2. `components/nina/ChatChrome.tsx:222–226` — REMOVED FROM THIS PHASE (one owner per region).**
This phase's draft claimed the floating-`>` lane comment (its old Step 2c / "U1"); phase 1 also
claimed it, and phase 1 runs first. Phase 1 rewrites it to name **no constant at all**, precisely so
it survives this phase unchanged: "the lane's `bottom` is computed from the tab bar's clearance, the
composer's measured height and `--safe-bottom`". That sentence is true before and after the clearance
changes which constant it reads, so there is nothing here for this phase to fix. **Do not open that
region.** Step 2c is deleted; only the import and `BAR_CLEARANCE_PX` change in this file.

**3. Two doc sites this phase claims that the draft index's phase-2 owns-list did not name.** Both
are inside files no other phase touches, and both are required by invariant 8 (a comment that
asserts arithmetic is part of the change). Reconciliation added both to the index's phase-2 **Owns**
list, so they now have a named owner:

- `components/ui/TabBar.tsx:45–50` — `TAB_BAR_HEIGHT_PX`'s own docblock says it is exported
  *because* `/nina`'s composer computes its bottom from it. After this phase the composer reads the
  outer height, so the sentence is false. Doc only; **no code line moves** (Step 1a). Verified: this
  docblock is what phase 1 leaves **verbatim** (phase 1's Interface Contract commits to it), so
  Step 1a's **Before** is exact.
- `lib/nina/chatview.ts:189` — "would put a 78 px settle into the first paint", inside
  `NINA_BAR_VISIBLE_VAR`'s docblock. It is a clearance figure and this phase's own exit grep looks
  for it (Step 5a). It is in this phase's **Files** table, not only in a note.

**4. `components/nina/ChatScreen.tsx:106` (`COMPOSER_FALLBACK_PX`) is edited by neither phase.**
Verified in the tree: it is `COMPOSER_CLEARANCE_PX + 68`, a derived value. It follows 146 -> 126 in
phase 1 and 126 -> 127 here, and its docstring ("the clearance plus one composer row") stays true
throughout. **No edit, in either phase.**

**5. File count:** the draft index said 7 for this phase; the real count is **9**, and the index now
says 9.

---

## Files

| File | Action | What changes |
|---|---|---|
| `components/ui/TabBar.tsx` | modify | **additive**: `TAB_BAR_BORDER_PX` and `TAB_BAR_OUTER_HEIGHT_PX` after `TAB_BAR_HEIGHT_PX` (`:51`); `TAB_BAR_HEIGHT_PX`'s docblock (`:45–50`) stops claiming the composer reads it. No markup. |
| `components/nina/ChatChrome.tsx` | modify | import (`:6`) → `TAB_BAR_OUTER_HEIGHT_PX`; `BAR_CLEARANCE_PX` and its docblock (`:71–77`). **Not** the lane comment at `:222–226` — phase 1's, and it names no constant |
| `components/nina/ChatScreen.tsx` | modify | import (`:8`) → `TAB_BAR_OUTER_HEIGHT_PX`; `COMPOSER_CLEARANCE_PX` and its doc (`:98–99`) |
| `components/nina/Composer.tsx` | modify | header doc only: "clears 78 px" → 59 with the reason (`:33–39`), and the `obstructedBottomPx` paragraph (`:92`) |
| `lib/nina/chatview.ts` | modify | doc only: the "78 px settle" (`:189`) and `composerBottomCss`'s docblock (`:203–229`). Body and signature untouched. |
| `lib/nina/chrome.ts` | modify | doc only: `controlBottomCss`'s docblock (`:167–185`) and `barClearancePx`'s JSDoc (`:189`). Body and signature untouched. |
| `lib/nina/chrome.test.ts` | modify | `BAR_CLEARANCE` 58 → 59 + its JSDoc; one `it` title that names the FAB overhang |
| `lib/nina/chatview.test.ts` | modify | the five clearance inputs 58 → 59 and the two assertion strings |
| `tests/tabbar.geometry.test.ts` | modify (extend) | **append** two new `describe` blocks — the constants' arithmetic, and that both clearances are the **outer** height — plus two merged imports and two new `*_SRC` constants. Phase 1's two blocks and its `BAR` constant are not edited |

Nine files.

---

## Implementation Steps

### Step 1a: `TAB_BAR_HEIGHT_PX` stops claiming to be the clearance

**File:** `components/ui/TabBar.tsx:45–51`
**Change:** doc only. The docblock currently justifies the export by pointing at `/nina`'s composer,
which after this phase reads `TAB_BAR_OUTER_HEIGHT_PX` instead. Redirect it, and say what this
constant *is*: the grid, not the bar.

**Before** (unchanged by phase 1):

```ts
/**
 * The bar's own height, matching `h-[58px]` below. Exported because `/nina`'s composer is the
 * app's first fixed bar that stacks *above* the tab bar and has to compute its own `bottom` in
 * JavaScript (`lib/nina/chatview.ts`). **If the class changes, change this with it** — Tailwind
 * cannot read a TypeScript constant, so the number is spelled twice by necessity.
 */
export const TAB_BAR_HEIGHT_PX = 58
```

**Code** (complete replacement):

```ts
/**
 * The **grid's** own height, matching `h-[58px]` below. **If the class changes, change this with
 * it** — Tailwind cannot read a TypeScript constant, so the number is spelled twice by necessity.
 *
 * This is the grid and not the bar: the nav's border box is this plus `TAB_BAR_BORDER_PX`, and the
 * bar's top *edge* is therefore `TAB_BAR_OUTER_HEIGHT_PX` up. Anything positioning itself against
 * that edge wants the outer height — which is what `/nina`'s composer, the app's first fixed bar
 * that stacks *above* the tab bar and computes its own `bottom` in JavaScript
 * (`lib/nina/chatview.ts`), reads. Still exported on its own because the outer height is derived
 * from it, and because `components/ui/AppShell.tsx` and `components/ui/PhotoViewer.tsx` cite it by
 * name when they explain their own Tailwind literals.
 */
export const TAB_BAR_HEIGHT_PX = 58
```

**Impact:** none at runtime. Removes the one sentence that would otherwise send the next reader to
the wrong constant.

---

### Step 1b: the two new constants

**File:** `components/ui/TabBar.tsx`, immediately after `export const TAB_BAR_HEIGHT_PX = 58` (today
`:51`; post-phase-1 the next thing below it is a blank line and then `const TABS = [`, because phase
1 deleted `TAB_BAR_FAB_OVERHANG_PX` and its docblock from between them).

**Change:** insert two exported constants with the mirror comments invariant 3 requires. Nothing
else in this file changes.

**Code** (insert verbatim, with one blank line above and below):

```ts
/**
 * The bar's `border-t`, in px — 1, matching the `border-t` on the `<nav>` above. Spelled as a
 * number for the same reason `TAB_BAR_HEIGHT_PX` is: the composer stacked above this bar computes
 * its own `bottom` in JavaScript and has to add this term, and Tailwind cannot read a TypeScript
 * constant. **If that class changes — a different width, or no border at all — change this with
 * it**, or every clearance built on it is wrong by exactly the difference.
 */
export const TAB_BAR_BORDER_PX = 1

/**
 * The bar's **outer** height — 59 px: the grid plus the `border-t` the grid sits under. This, and
 * not `TAB_BAR_HEIGHT_PX`, is what a fixed bar stacked above the tab bar must clear, because the
 * border is part of the nav's border box and the bar's top border IS its top edge.
 *
 * MEASURED (R2): the border was never a term in any clearance. `/nina`'s composer cleared the grid
 * plus the old Upload FAB's overhang, the bar's top edge sat a pixel above the grid, and the
 * scrolling conversation was visible through the seam between the two bars — still 1 px of it once
 * the overhang was gone. The sum lives here rather than in `ChatChrome` and `ChatScreen` because a
 * caller cannot forget a term that is inside the constant.
 */
export const TAB_BAR_OUTER_HEIGHT_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX
```

**Impact:** purely additive; nothing imports these yet at the end of this step, and the tree still
compiles. Every later step in this phase reads them.

---

### Step 2a: `ChatChrome`'s import

**File:** `components/nina/ChatChrome.tsx:6`
**Change:** swap the constant.

**Before** (as phase 1 leaves it):

```ts
import { TabBar, TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
```

**Code:**

```ts
import { TabBar, TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'
```

**Impact:** `TAB_BAR_HEIGHT_PX` is no longer referenced in this file.

---

### Step 2b: `BAR_CLEARANCE_PX` becomes the outer height

**File:** `components/nina/ChatChrome.tsx:71–77`
**Change:** the docblock keeps its shape — a named constant with a one-line derivation — with the
derivation rewritten and the measured bug recorded.

**Before** (exact — this is phase 1's Step 7 output, verbatim; replace the whole docblock and the
`const` together):

```ts
/**
 * What the bar occupies when it is showing: its own height, and that is now the whole of it.
 *
 * It used to be `TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX` — 78 — because `/upload` was a raised
 * coral circle reaching 20 px above the bar's top edge, and a composer that cleared only the bar
 * would have sliced the top off it. `/upload` is a normal tab cell now
 * (`components/ui/TabBar.tsx`), nothing paints above the nav's border box, and the constant that
 * named the overhang no longer exists. The same figure `ChatScreen`'s `COMPOSER_CLEARANCE_PX`
 * computes, because both are positioning against the same bar.
 */
const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX
```

**Code** (complete replacement of the docblock and the const):

```ts
/**
 * What the bar occupies when it is showing: its **outer** height — the 58 px grid plus the 1 px
 * `border-t` the grid sits under, which is the bar's actual top edge. The same constant
 * `ChatScreen`'s `COMPOSER_CLEARANCE_PX` reads, because both are positioning against the same bar.
 *
 * MEASURED (R2): the border was never in this sum. The clearance cleared the grid alone, the bar's
 * top border sat a pixel above it, and the composer floated over the seam with the conversation
 * showing through — 1 px of it even after the Upload FAB's overhang was gone. The border is part of
 * the nav's border box, so the outer height is the honest clearance, and it is one constant rather
 * than a sum spelled at two call sites.
 */
const BAR_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX
```

**Impact:** the floating `>`/`^` lane rises 1 px more when the bar is shown
(`controlBottomCss` gets `59` instead of `58`), which is correct — the lane sits above the composer,
which sits above the bar. Nothing else in the file changes; `barClearancePx: BAR_CLEARANCE_PX` at
`:214` is untouched.

---

### Step 2c: DELETED at reconciliation — the lane comment is phase 1's

`components/nina/ChatChrome.tsx:222–226`'s floating-`>` JSX comment listed the terms of the lane's
`bottom` and named `TAB_BAR_FAB_OVERHANG_PX`. **Phase 1 owns and rewrites it**, to name no constant
at all — "the lane's `bottom` is computed from the tab bar's clearance, the composer's measured
height and `--safe-bottom`" — which stays true after this phase changes which constant that
clearance reads. There is nothing left here to fix.

**Do not open that region.** This phase's only edits to `ChatChrome.tsx` are Step 2a (the import)
and Step 2b (`BAR_CLEARANCE_PX` and its docblock). If the comment still names
`TAB_BAR_FAB_OVERHANG_PX` when this phase starts, phase 1 did not land as planned — stop and say so
rather than fixing it here, because the plan set's ownership map is then wrong and the reconciliation
log needs to know.

---

### Step 3: `COMPOSER_CLEARANCE_PX` becomes the outer height

**File:** `components/nina/ChatScreen.tsx:8` and `:98–99`
**Change:** the import and the constant, with its one-line doc grown to record the bug.

**Before** (as phase 1 leaves it):

```ts
import { TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
```

```ts
/**
 * The chrome the composer sits above: the bar's own height, and nothing else. It was `58 + 20`
 * while `/upload` was a raised coral circle overhanging the bar's top edge; the circle is a normal
 * tab cell now, so the overhang term — and the constant that named it — are gone.
 */
const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX
```

(That docblock is phase 1's Step 9 output, verbatim — **not** the one-line
`/** The chrome the composer sits above: the bar's own height. */` this plan's draft quoted, which
was today's pre-phase-1 text with the sum removed. Corrected at reconciliation.)

**Code** — the import line:

```ts
import { TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'
```

**Code** — the constant and its doc:

```ts
/**
 * The chrome the composer sits above: the bar's **outer** height — its 58 px grid plus the 1 px
 * `border-t` the grid sits under, which is the bar's actual top edge.
 *
 * MEASURED (R2): the border was never in this sum, so the composer's bottom edge landed a pixel
 * below the bar's top border and the scrolling conversation showed through the seam between them.
 * `ChatChrome`'s `BAR_CLEARANCE_PX` is the same constant for the same reason.
 */
const COMPOSER_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX
```

**Impact:** `composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)` at `:774` now emits
`calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))` — R2, delivered.
`COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68` (`:106`) follows automatically from **126** —
where phase 1 left it, having taken it from 146 — **to 127**; its doc says "the clearance plus one
composer row", which stays true, so **it is not edited** by this phase or by phase 1. Verified in
the tree: it is a derived value, so neither phase opens that line. That fallback is only reachable
when `#nina-composer` cannot be measured.

---

### Step 4: `Composer`'s header stops claiming 78 px

**File:** `components/nina/Composer.tsx:33–39`, and `:92`
**Change:** doc only. This file is untouched by phase 1, so both "before"s are exact.

**Before** (`:33–39`):

```ts
 * ── THE FIXED BAR'S GEOMETRY ──────────────────────────────────────────────────────────────────
 * `bottomCss` is computed by `composerBottomCss` in `lib/nina/chatview.ts` and clears 78 px of
 * chrome: the tab bar's 58 px plus the Upload FAB's 20 px overhang above the bar's top edge. The
 * FAB is not optional to clear — the composer is at `z-40` and the bar at `z-30`, so a bar sitting
 * flush on the tab bar's top edge would slice the top off the coral circle. The home-indicator
 * inset rides in that same offset rather than in this element's padding, because the tab bar below
 * already pads by it and counting it twice would open a gap.
```

**Code** (complete replacement of those seven lines):

```ts
 * ── THE FIXED BAR'S GEOMETRY ──────────────────────────────────────────────────────────────────
 * `bottomCss` is computed by `composerBottomCss` in `lib/nina/chatview.ts` and clears 59 px of
 * chrome: the tab bar's OUTER height, which is its 58 px grid plus the 1 px `border-t` the grid
 * sits under. The border is not a rounding error — it is the bar's top edge, so a clearance of 58
 * leaves this bar floating one pixel above the bar below it with the conversation visible through
 * the seam. That was R2's reported gap, and 59 is what makes the two flush. The home-indicator
 * inset rides in that same offset rather than in this element's padding, because the tab bar below
 * already pads by it and counting it twice would open a gap.
```

**Before** (`:89–94`):

```ts
 * The wrapper also gains `id="nina-composer"`, which `ChatScreen` measures. `planQuoteScroll`
 * needs `obstructedBottomPx`, and that number is not a constant: it is this bar's own height
 * (which grows with the reply strip, with a tile row and with a multi-line draft) plus its `bottom`
 * offset (the tab bar and FAB clearance, or the keyboard). One `getBoundingClientRect().top` on
 * this element answers all of it exactly, and every alternative re-derives what the browser
 * already knows.
```

**Code** (complete replacement of those six lines):

```ts
 * The wrapper also gains `id="nina-composer"`, which `ChatScreen` measures. `planQuoteScroll`
 * needs `obstructedBottomPx`, and that number is not a constant: it is this bar's own height
 * (which grows with the reply strip, with a tile row and with a multi-line draft) plus its `bottom`
 * offset (the tab bar's outer height, or the keyboard). One `getBoundingClientRect().top` on this
 * element answers all of it exactly, and every alternative re-derives what the browser already
 * knows.
```

**Impact:** none at runtime. Removes the last prose in a component that argues for clearing a FAB
that no longer exists.

---

### Step 5a: the "78 px settle"

**File:** `lib/nina/chatview.ts:189`
**Change:** doc only, one number, inside `NINA_BAR_VISIBLE_VAR`'s docblock.

**Before** (exact — phase 1 does not touch this file):

```ts
 * would put a 78 px settle into the first paint of every conversation.
```

**Code:**

```ts
 * would put a 59 px settle into the first paint of every conversation.
```

**Impact:** none. Covered by the index's own exit criterion (no clearance figure of `78` left in
this file).

---

### Step 5b: `composerBottomCss`'s docblock

**File:** `lib/nina/chatview.ts:203–229`
**Change:** doc only. The enumerated terms lose the overhang and gain the border; the multiplier
paragraph's `78` becomes `59` and its constant name becomes the outer height. **The
`--safe-bottom`-is-outside-the-multiplier paragraph is kept verbatim** — it is still true and still
the reason the composer is not padded twice. No signature change, no behaviour change.

**Before** (exact, lines 203–229):

```ts
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
```

**Code** (complete replacement):

```ts
/**
 * The composer's `bottom`, as a CSS length.
 *
 * With no keyboard it clears the fixed chrome below it — but only when there IS chrome below it.
 * On `/nina` the tab bar is hidden by default (R1), so `chromeClearancePx` is the clearance to
 * apply **while the bar is showing**, and it is multiplied by `NINA_BAR_VISIBLE_VAR`, which is `1`
 * only then. The terms are the bar's own grid, the 1 px `border-t` the grid sits under — the two
 * together are the bar's outer height, and the border is its real top edge — and the
 * home-indicator inset the bar pads itself by.
 *
 * The inset is honoured **here and not as the composer's own padding** — the composer sits above
 * chrome that already pads by `--safe-bottom`, so padding it a second time would open a gap. It is
 * outside the multiplication for the same reason it is outside the keyboard branch: the inset is
 * the phone's, not the bar's, and it is there whether or not the bar is.
 *
 * With a keyboard, the keyboard's top edge is the floor and every one of those terms is behind it.
 * That branch is unchanged by R1: a bar behind the keyboard clears nothing either way.
 *
 * The border term is R2, and it is worth saying why it was missing: a clearance of the grid alone
 * (58) puts this bar's bottom edge one pixel BELOW the bar's top border, so the conversation shows
 * through the seam. The caller passes the outer height (59) and the two are flush.
 *
 * ── WHY A MULTIPLIER AND NOT A LENGTH ────────────────────────────────────────────────────────
 * `calc(<length> * <number>)` keeps the number 59 in this function, where the caller already
 * passes it, instead of moving it into whichever component writes the variable. The flag then says
 * one thing only — is the bar on screen — and cannot disagree with `TAB_BAR_OUTER_HEIGHT_PX` about
 * how tall the bar is. A `var(--nina-bar-clearance, 0px)` form would make this argument dead and
 * put the geometry in two places.
 *
 * Returns a string because that is what the style attribute takes, and because `var(--safe-bottom)`
 * cannot be resolved in JavaScript — `env(safe-area-inset-bottom)` is only readable to CSS.
 */
```

**Impact:** none at runtime. The function body (`:230–234`) is **not** touched:

```ts
export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
  const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
  return `calc(${clearance}px * var(${NINA_BAR_VISIBLE_VAR}, 0) + var(--safe-bottom))`
}
```

---

### Step 6: `controlBottomCss`'s docblock and `barClearancePx`'s JSDoc

**File:** `lib/nina/chrome.ts:167–189`
**Change:** doc only. Two things go: the "tab bar's centre FAB — which spans the 22-78 px band"
paragraph (the FAB is gone, and `78` is a clearance figure the index's exit criterion greps for), and
`barClearancePx`'s JSDoc naming the two old constants. **The body and the signature are untouched.**

**Before** (exact — phase 1 does not touch this file):

```ts
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
```

**Code** (complete replacement, down to and including the `}): string {` line):

```ts
/**
 * The control lane's `bottom`, as a CSS length.
 *
 * Entirely above the composer: the bar's clearance when the bar is showing, plus the composer's
 * measured height, plus the gap, plus the home-indicator inset. That is what keeps the lane clear
 * of the composer's Send button at every composer height, and clear of the tab bar itself — the
 * bar's OUTER height is the whole of what it has to rise past, because no part of the bar paints
 * above its own top border: the raised centre FAB that used to overhang it by 20 px is now an
 * ordinary tab cell, and the bar occupies exactly its own border box.
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
  /** `TAB_BAR_OUTER_HEIGHT_PX`, passed in — `lib/` never imports `components/`. */
  barClearancePx: number
  /** `#nina-composer`'s measured height, or 0 before the first measurement. */
  composerHeightPx: number
}): string {
```

**Impact:** none at runtime. Lines `:194–204` (the destructure, the two clamps, the returned
template) are **not** touched. This step is also what makes phase 1's "no
`TAB_BAR_FAB_OVERHANG_PX` anywhere" criterion true repo-wide.

---

### Step 7: `lib/nina/chrome.test.ts`

**File:** `lib/nina/chrome.test.ts:18–19`, and the `it` title at ≈`:115`
**Change:** the named input moves 58 → 59 with its JSDoc, and the one test title that still describes
the FAB describes the border instead. Every `controlBottomCss` expectation is written in terms of
`BAR_CLEARANCE` and `COMPOSER_RESTING_PX`, so **no expectation body changes** — this is the whole
edit to this file.

**Before** (exact — this is phase 1's Step 12 output, verbatim; replace the JSDoc and the `const`
together):

```ts
/**
 * `TAB_BAR_HEIGHT_PX` — the whole of the bar, now that nothing overhangs its top edge. Spelled
 * here rather than imported so the test names its own input, and because `vitest.config.ts` runs
 * `environment: 'node'`: the numbers this suite asserts on must not depend on a component.
 */
const BAR_CLEARANCE = 58
```

**Code:**

```ts
/**
 * `TAB_BAR_OUTER_HEIGHT_PX`: the bar's 58 px grid plus the 1 px `border-t` the grid sits under.
 * Spelled here so the test names its own input, and 59 rather than 58 because the border is part of
 * the nav's border box — a lane that clears only the grid clears one pixel too little.
 */
const BAR_CLEARANCE = 59
```

**Before** (exact — phase 1's Step 12 already replaced this title; the body is the tree's, unchanged
by phase 1. Anchor on the `barState: 'shown'` case inside `describe('controlBottomCss')`):

```ts
  it('rises by the bar when the bar is shown', () => {
    expect(
      controlBottomCss({
        barState: 'shown',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(
      `calc(${BAR_CLEARANCE + COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`,
    )
  })
```

**Code** (complete replacement of that `it` block):

```ts
  it("rises by the bar's outer height when the bar is shown", () => {
    // Outer, not the grid: the `border-t` is the bar's top edge, and the lane sits above the
    // composer, which sits on that edge. R2's missing pixel was missing here too.
    expect(
      controlBottomCss({
        barState: 'shown',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(
      `calc(${BAR_CLEARANCE + COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`,
    )
  })
```

**Impact:** the suite's arithmetic follows the constant. Note the double-quoted title: Prettier
(`singleQuote: true`) keeps double quotes on a string containing an apostrophe, so this is
format-stable. The `describe('the reveal is a transition with a reduced-motion escape')` block at the
bottom of the file (`:196–213`) is **not** touched — it is phase 1's territory and its three
assertions are about `transition-[translate]`, `motion-reduce:transition-none` and `@keyframes`, all
unaffected by this phase.

---

### Step 8: `lib/nina/chatview.test.ts`

**File:** `lib/nina/chatview.test.ts:218–250`
**Change:** the **four clearance inputs** 58 → 59 and the **two expected strings** with them (six
occurrences of the number, verified against the tree), plus a block comment saying where 59 comes
from. Nothing else in the file changes.

**Before** (exact — this is phase 1's Step 13 output, verbatim: phase 1 replaced this whole
`describe` block, moving six occurrences of `78` to `58`):

```ts
describe('composerBottomCss', () => {
  it('clears nothing but the home-indicator inset while the bar is hidden', () => {
    // R1: `/nina`'s resting state. The flag is absent, `var()` substitutes 0, and the composer sits
    // on the inset. This is also the SSR and pre-hydration answer, which is why the default is the
    // hidden geometry and not the showing one.
    expect(composerBottomCss(0, 58)).toBe(
      'calc(58px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })

  it('names the variable the chrome writes', () => {
    // Spelled once, in `chatview.ts`, and read by `ChatChrome`. If the constant and the emission
    // ever disagree the composer stops following the bar and nothing else notices.
    expect(composerBottomCss(0, 58)).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
  })

  it('sits on the keyboard when there is one', () => {
    // Every term of the idle clearance is behind the keyboard, so none of it is added — and that
    // is true whether or not the bar is showing, which is why this branch is untouched by R1.
    expect(composerBottomCss(KEYBOARD_HEIGHT, 58)).toBe('336px')
  })

  it('treats unmeasurable input as no keyboard', () => {
    expect(composerBottomCss(NaN, 58)).toBe(
      'calc(58px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    expect(composerBottomCss(0, NaN)).toBe(
      'calc(0px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })
})
```

The fifth `it` passes `NaN` as the clearance and is **unchanged by this phase** — that is why the
count is four inputs and not five.

**Code** (complete replacement of the whole `describe('composerBottomCss', …)` block — today
`:218–250`, the last block in the file):

```ts
describe('composerBottomCss', () => {
  // 59 is the tab bar's outer height: `TAB_BAR_HEIGHT_PX` (58) + `TAB_BAR_BORDER_PX` (1). The
  // border is the bar's top edge, so a composer clearing 58 floats a pixel above it — R2's gap.
  // `tests/tabbar.geometry.test.ts` is what ties this literal back to those two constants.

  it('clears nothing but the home-indicator inset while the bar is hidden', () => {
    // R1: `/nina`'s resting state. The flag is absent, `var()` substitutes 0, and the composer sits
    // on the inset. This is also the SSR and pre-hydration answer, which is why the default is the
    // hidden geometry and not the showing one.
    expect(composerBottomCss(0, 59)).toBe(
      'calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })

  it('names the variable the chrome writes', () => {
    // Spelled once, in `chatview.ts`, and read by `ChatChrome`. If the constant and the emission
    // ever disagree the composer stops following the bar and nothing else notices.
    expect(composerBottomCss(0, 59)).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
  })

  it('sits on the keyboard when there is one', () => {
    // Every term of the idle clearance is behind the keyboard, so none of it is added — and that
    // is true whether or not the bar is showing, which is why this branch is untouched by R1 and
    // by R2 alike: the border is behind the keyboard too.
    expect(composerBottomCss(KEYBOARD_HEIGHT, 59)).toBe('336px')
  })

  it('treats unmeasurable input as no keyboard', () => {
    expect(composerBottomCss(NaN, 59)).toBe(
      'calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    expect(composerBottomCss(0, NaN)).toBe(
      'calc(0px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })
})
```

**Impact:** the pure function's contract is asserted at the number the app now passes. No import
changes — the file already imports `composerBottomCss`, `NINA_BAR_VISIBLE_VAR` and
`KEYBOARD_HEIGHT`.

---

### Step 9: extend `tests/tabbar.geometry.test.ts`

**File:** `tests/tabbar.geometry.test.ts` — created by phase 1; this step **appends** to it and
merges its import header. If the file does not exist, phase 1 has not landed: stop, do not create it.

**Change:** two new `describe` blocks at the end of the file, plus (a) **two** module-path constants
— `CHROME_SRC` and `SCREEN_SRC` — and (b) two import statements merged into the existing header.

**RECONCILED:** this plan's draft declared a third constant, `TAB_BAR_SRC`, "so it cannot collide
with whatever names phase 1 chose". Phase 1's name is now known: it declares
`const BAR = 'components/ui/TabBar.tsx'` at module scope. **Reuse `BAR`.** A second constant holding
the same path is exactly the second spelling of one fact that the rest of this phase exists to
remove.

**9a — merge the import header.** Phase 1's file already has `import { describe, expect, it } from 'vitest'`
and `import { readRepoCode } from './support/importGraph'`. Add these two, keeping the repo's import
order (packages, then `@/`, then relative — so both go **between** the `vitest` line and the
`./support/importGraph` line) and **without duplicating** anything phase 1 already imported:

```ts
import {
  TAB_BAR_BORDER_PX,
  TAB_BAR_HEIGHT_PX,
  TAB_BAR_OUTER_HEIGHT_PX,
} from '@/components/ui/TabBar'
import { composerBottomCss } from '@/lib/nina/chatview'
```

Importing those constants out of a `'use client'` `.tsx` works under `environment: 'node'` — verified
empirically by running exactly this import in this repo's suite before writing this plan.
`TabBar.tsx` pulls in `next/link` and `next/navigation`, but neither does anything at module scope,
and `usePathname` is only called during render.

This does **not** contradict phase 1, whose two blocks are source scans by choice rather than by
necessity: phase 1's assertions are about *markup* (class strings, `<Tab />` count, `TABS` order),
which has no importable value at all. The two techniques coexist in one file and each block's
docstring says which it uses and why — invariant 7 permits both explicitly.

**9b — append these two blocks** at the end of the file, verbatim:

```ts
/*
 * ── R2: THE COMPOSER CLEARS THE BAR'S OUTER HEIGHT ────────────────────────────────────────────
 *
 * MEASURED: with the bar revealed on `/nina`, the composer did not rest on it — a band of the
 * scrolling conversation was visible between the composer's bottom border and the bar's top
 * border. Most of that band was the raised Upload FAB's 20 px overhang, which the composer had to
 * clear or the coral circle would have been sliced. The LAST PIXEL of it was the bar's own
 * `border-t`, which no clearance term had ever accounted for: the nav's border box is 1 px of
 * border plus the 58 px grid, so the bar's top edge is 59 px up and a composer clearing 58 is one
 * pixel short of touching it. Removing the FAB fixed 18 px of a 19 px gap and left this.
 *
 * WHICH TECHNIQUE, AND WHY. The two constant blocks below IMPORT the constants: `TabBar.tsx` is
 * `'use client'` and reaches `next/link` and `next/navigation`, but neither runs at module scope,
 * so the values import cleanly under `environment: 'node'` — the same thing
 * `tests/panel.render.test.ts` and `tests/badges.render.test.ts` do with other components.
 *
 * The clearance block is a SOURCE SCAN instead, and deliberately. `BAR_CLEARANCE_PX` and
 * `COMPOSER_CLEARANCE_PX` are module-private constants inside two large client components, one of
 * which reaches Server Actions and the database through `lib/nina/actions` — there is nothing to
 * import, and no way to render them without a DOM this repo's suite does not have (`ChatChrome`'s
 * own docstring says a rule living in a component "cannot be asserted in this repo at all").
 * `tests/nina.sidebarProvider.test.ts` established the answer for exactly this shape of question:
 * scan the text, because it proves the rule for every branch rather than for the one that ran.
 */

/* `BAR` is phase 1's, declared at the top of this file; these two are new. */
const CHROME_SRC = 'components/nina/ChatChrome.tsx'
const SCREEN_SRC = 'components/nina/ChatScreen.tsx'

describe("the tab bar's outer height is the grid plus its border", () => {
  it('spells the border as 1 px', () => {
    expect(TAB_BAR_BORDER_PX).toBe(1)
  })

  it('is the sum of the grid and the border, and is 59', () => {
    expect(TAB_BAR_OUTER_HEIGHT_PX).toBe(TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX)
    expect(TAB_BAR_OUTER_HEIGHT_PX).toBe(59)
  })

  it('mirrors two classes the bar actually carries', () => {
    // Invariant 3. Each constant exists only because Tailwind cannot read it, so if the class it
    // mirrors is edited away the constant becomes a lie and every clearance built on it is wrong
    // by exactly that much. This is the cheapest possible alarm for that.
    const bar = readRepoCode(BAR)
    expect(bar).toContain('h-[58px]')
    expect(bar).toContain('border-t')
  })
})

describe("both of /nina's clearances are the bar's OUTER height", () => {
  it('ChatChrome composes the control lane off the outer height', () => {
    const chrome = readRepoCode(CHROME_SRC)
    expect(chrome).toMatch(/const BAR_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX\b/)
    // This is what re-introducing the 1 px gap looks like, and this is the line that fails.
    expect(chrome).not.toMatch(/const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX\b/)
  })

  it('ChatScreen composes the composer off the outer height', () => {
    const screen = readRepoCode(SCREEN_SRC)
    expect(screen).toMatch(/const COMPOSER_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX\b/)
    expect(screen).not.toMatch(/const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX\b/)
  })

  it('and neither re-derives the sum at the call site', () => {
    // A caller cannot forget a term that lives inside the constant — that is the whole reason the
    // sum is in `TabBar.tsx`. Adding `+ TAB_BAR_BORDER_PX` back here would be the second spelling
    // this design exists to remove, and the third file to disagree about how tall the bar is.
    for (const file of [CHROME_SRC, SCREEN_SRC]) {
      const code = readRepoCode(file)
      expect(code).toContain('TAB_BAR_OUTER_HEIGHT_PX')
      expect(code).not.toContain('TAB_BAR_BORDER_PX')
    }
  })

  it('emits a composer bottom that lands exactly on the bar top border', () => {
    // R2's exit criterion, joined end to end: the constant the components compose, through the
    // pure function that turns it into CSS. 59px measured up from the viewport bottom IS the bar's
    // top border, so the composer's bottom edge is ON it — no gap, and no overlap that would paint
    // `bg-paper/90` over the bar's own rule (decision D7).
    expect(composerBottomCss(0, TAB_BAR_OUTER_HEIGHT_PX)).toBe(
      'calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))',
    )
  })
})
```

**Impact:** the missing pixel can no longer come back silently. Note `readRepoCode` strips comments,
so none of these assertions can fire on the prose that explains them — and `h-[58px]`, `border-t`
and the two `const` lines are all real code, so none of them can be hidden by a comment either.
`TAB_BAR_HEIGHT_PX` is not a substring of `TAB_BAR_OUTER_HEIGHT_PX`, so the two negative matches
above cannot be satisfied by the positive ones.

---

## Verification

**Preflight:** the worktree **already has `node_modules`** — `npm ci` has been run in
`/home/miftah/.worktrees/run-insights/tabbar-new-tab-composer-seam`. Run `npm ci` there **only if
`node_modules` is absent**; do not run it unconditionally (a mid-set `npm ci` is a known way to break
a concurrently running peer session).

**Pre-change baseline, measured on the unmodified tree:**
`npx vitest run lib/nina/chrome.test.ts lib/nina/chatview.test.ts` passes **48/48**. Phase 1 keeps
that at 48/48 (it changes inputs, not case counts) and adds 7 `it`s in
`tests/tabbar.geometry.test.ts`; this phase adds 6 more there. Any number below those is this
phase's, not the tree's.

**Build:**

```
npx tsc --noEmit
npm run lint
```

**Tests:**

```
npx vitest run lib/nina/chatview.test.ts lib/nina/chrome.test.ts tests/tabbar.geometry.test.ts
npx vitest run
```

**Static checks:**

```
# Nothing anywhere still names the constant phase 1 deleted — this phase's Step 6 clears the last
# one, lib/nina/chrome.ts:189, which is what finally makes this grep return empty.
#
# THE EXCLUSIONS ARE PART OF THE CRITERION, not conveniences. `.workflows/**` (including
# `.workflows/package_readme.md`, `.workflows/todos.md` and every prior plan under
# `.workflows/plan/`), the root `*_code_analyzer.md` files and the root `*_PLAN.md` files are
# records of their own moment: no phase in this set edits them, so grepping them would make an
# exit criterion that can never go green. See the index's `## Scope` and `## Decisions` D10.
grep -rn "TAB_BAR_FAB_OVERHANG_PX" --include="*.ts" --include="*.tsx" --include="*.md" . \
  | grep -v node_modules | grep -v '\.workflows/' \
  | grep -v '_code_analyzer\.md' | grep -v '_PLAN\.md'

# no clearance figure of 78 left in any live geometry site
grep -rn "\b78\b" lib/nina/chatview.ts lib/nina/chrome.ts lib/nina/chatview.test.ts \
  lib/nina/chrome.test.ts components/nina/Composer.tsx components/nina/ChatChrome.tsx \
  components/nina/ChatScreen.tsx
```

Both must come back empty. (`TEXTAREA_MAX_PX` and the `78.2 s` vision latencies elsewhere in
`lib/nina` are not clearance figures and are not in that file list.)

**Manual check:** `/nina` on a phone or a narrow viewport. Tap the floating `^` to reveal the bar:
the composer's bottom border should sit directly on the bar's top rule with no conversation visible
between them, and the bar's own `border-rule` line should still be visible (not covered by the
composer's translucent `bg-paper/90`). Then focus the textarea — the keyboard branch takes over and
the composer sits on the keyboard, unchanged. Tap `v` (or wait 5 s): the bar slides fully off and the
composer drops to the home-indicator inset. Repeat with the sidebar `>` open to confirm the floating
lane still clears the composer.

**Exit criteria:**

- `composerBottomCss(0, COMPOSER_CLEARANCE_PX)` returns
  `calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))`, and
  `tests/tabbar.geometry.test.ts` asserts it from the constant rather than from a literal.
- `TAB_BAR_OUTER_HEIGHT_PX === TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX === 59`, and both new constants
  carry the comment saying which Tailwind class they mirror.
- Both `/nina` clearances read `= TAB_BAR_OUTER_HEIGHT_PX` — one constant, no sum at either call
  site — and a test fails if either goes back to the grid height.
- No prose in `TabBar.tsx`, `ChatChrome.tsx`, `ChatScreen.tsx`, `Composer.tsx`, `chatview.ts`,
  `chrome.ts` or the two `lib/nina` test files states the old arithmetic.
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` all green.

---

## Handoffs

This is the last phase of the set; nothing is left for a later phase. What was found and
**deliberately not done**:

- **`COMPOSER_ID` is spelled in three files** (`'nina-composer'` in `ChatChrome.tsx`,
  `ChatScreen.tsx` and `Composer.tsx`). `ChatChrome`'s own docstring already flags this as "a
  cleanup for whoever next edits `Composer`". Not this phase's requirement — R2 is one pixel of
  geometry, and a shared-id refactor touches three files for no observable change.
- **`components/ui/PhotoViewer.tsx:253`** names `TAB_BAR_HEIGHT_PX` in a comment. Read and confirmed
  correct: it cites the constant as the precedent for "Tailwind cannot read a constant", and it means
  the grid height, which did not change. No edit — matching the analysis's expectation for impact
  point 12.
- **`lib/nina/chrome.ts:111`**'s "the same 68 that `ChatScreen`'s
  `COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68` already uses" stays exactly right: the 68 is a
  composer row, not a clearance, and it did not move.
- **`BOTTOM_GAP.tabs` stays `6rem`** (D6) and its comment is phase 1's. This phase does not open
  `AppShell.tsx` at all — closing the seam by shrinking the document's bottom padding is explicitly
  ruled out by invariant 6.
- **A rendered-DOM assertion of the flush edge** is impossible here (invariant 7, no jsdom). The
  source scan in Step 9 is the strongest available substitute, and its docstring says so.

**Everything this phase flagged for the reconciler is now settled** — see *Reconciled cross-phase
notes* above and the index's `## Reconciliation Log`. In one line each: `lib/nina/chrome.ts:189` is
**this phase's** (D9), and Step 6 is what makes phase 1's repo-wide grep true;
`components/nina/ChatChrome.tsx:222–226` is **phase 1's alone** and Step 2c is deleted;
`components/ui/TabBar.tsx:45–50` and `lib/nina/chatview.ts:189` are **this phase's** and are now
named in the index's phase-2 **Owns** list; `components/nina/ChatScreen.tsx:106`
(`COMPOSER_FALLBACK_PX`) is edited by **neither** phase. No open question remains in this set.

---

## Rollback

`git revert` this phase's single commit. It reverts cleanly on its own: the two new constants go away
with the callers that read them, both clearances return to `TAB_BAR_HEIGHT_PX`, the two test files
return to 58, and `tests/tabbar.geometry.test.ts` loses its two appended blocks and keeps phase 1's.
The observable result is phase 1's own exit state — the `New` tab, no overhang, and a 1 px seam under
the composer.

Reverting **phase 1** while this phase is in place does **not** work, and the index says so: this
phase declares `TAB_BAR_OUTER_HEIGHT_PX` beside constants phase 1 rewrote, so a phase-1 revert
reinstates `TAB_BAR_FAB_OVERHANG_PX` and the raised FAB above a composer that clears only 59 px. To
back the whole thing out: revert this phase, then phase 1 — or drop the branch
(`git branch -D feature/tabbar-new-tab-composer-seam` plus `git worktree remove`), which is the
complete rollback while the branch is unmerged.
