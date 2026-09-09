# Phase 1: The keyboard stops eating the sidebar's fields; the search field clears

**Plan set:** `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md`
**Analysis:** `20260909-082156-S3AR_code_analyzer.md`
**Satisfies:** R1 (keyboard lifts the search field off-screen), R2 (✕ in the search field: clears query AND results, keyboard stays up)
**Depends on:** none — first phase
**Difficulty:** HARD
**Package:** `components/nina` + `lib/nina`

---

## Goal

The R1 bug's surviving mechanism — iOS Safari's focus reveal scrolling the panel's own
`overflow-y-auto` container, which the already-shipped `bottom: var(--nina-kb-overlap)` box fix
cannot see — is closed by a panel-level `focusin` listener that re-asserts the focused text
field's visibility on a tested, pure schedule (`KEYBOARD_REASSERT_DELAYS_MS` in
`lib/nina/chatview.ts`). The search field gains the R2 ✕: rendered only when there is text, one
tap empties the query and the results and leaves focus in the input so the keyboard stays up.

Both fixes cover the rename field for free (phase 2's surface): the listener is delegated at the
panel, and any text field inside the open panel is covered.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**
- `KEYBOARD_REASSERT_DELAYS_MS` (`lib/nina/chatview.ts`, exported `const`, type
  `readonly number[]`, value `[0, 120, 300, 600, 1000]`) — placed in the `── the iOS keyboard ──`
  section, after `NINA_KEYBOARD_OVERLAP_VAR` (line 226), before `composerBottomCss`'s doc block.
- `describe('KEYBOARD_REASSERT_DELAYS_MS', …)` in `lib/nina/chatview.test.ts` — 4 `it` blocks.

**Renames:** none.

**Deletes:** none (the input's `type="search"` value becomes `type="text"` — same attribute, new
value; no other `type="search"` exists in the repo, verified by grep).

**Signature changes:** none. `NinaSidebar` and `NinaSearchField` keep their exact props. The
`React.useEffect` in `NinaSidebar` keeps its dependency array **exactly `[open]`** — the new
listener and timers live INSIDE that effect, so nothing about its keyed-on-`open`-alone rule
(NinaSidebar.tsx:253-270) changes.

**Requires (from earlier phases):** none.

**Leaves alone (owned by others):**
- `components/nina/SessionRow.tsx` (phase 2), `components/nina/NewChatButton.tsx` (phase 3),
  `components/nina/ChatScreen.tsx` (its `visualViewport` subscription stays the ONE — invariant 2;
  this phase adds zero `visualViewport` references, verify with
  `grep -c visualViewport components/nina/NinaSidebar.tsx components/nina/NinaSearchField.tsx` →
  `0`), `lib/nina/search.ts` (rules unchanged).
- In `lib/nina/chatview.ts`: `keyboardOverlapPx`, `KEYBOARD_MIN_PX`, `NINA_BAR_VISIBLE_VAR`,
  `NINA_KEYBOARD_OVERLAP_VAR`, `composerBottomCss`, `composerPadBottomCss` — read/imported, never
  edited (phase 3 imports the composer arithmetic verbatim).
- The panel's layout/markup in `NinaSidebar.tsx` — no restructure (phase 3 owns the scroll-area +
  bottom-rail restructure). The only markup-adjacent change is ONE comment paragraph appended
  inside the inline `bottom:` style block.

**For phase 3 (what it must know):** the open panel div (`panelRef`) carries a delegated
`focusin` listener with timer cleanup in the effect's teardown, and `NinaSidebar` imports
`KEYBOARD_REASSERT_DELAYS_MS` from `@/lib/nina/chatview`. The listener works for fields at ANY
nesting depth under the panel div (`focusin` bubbles), so phase 3's inner scroll area keeps it
working — but the restructure must (a) keep text fields descendants of the panel div,
(b) keep the listener block and its cleanup inside the `[open]`-keyed effect verbatim, and
(c) re-import nothing. Quote `NinaSidebar.tsx` as it looks AFTER this phase.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/chatview.ts` | modify | one new exported const `KEYBOARD_REASSERT_DELAYS_MS` + its doc comment, inserted after line 226; nothing else in the file is touched |
| `lib/nina/chatview.test.ts` | modify | import `KEYBOARD_REASSERT_DELAYS_MS`; one new `describe` block after the `keyboardOverlapPx` block (after line 217) |
| `components/nina/NinaSidebar.tsx` | modify | import line 8 gains `KEYBOARD_REASSERT_DELAYS_MS`; the `[open]`-keyed effect (lines 272–300) gains the delegated `focusin` listener + timers (full replacement below); one comment paragraph appended inside the `bottom:` style block (before line 338's closing `*/`) |
| `components/nina/NinaSearchField.tsx` | modify | import line 4 gains `useId`; a new header-doc section between lines 61 and 63; two new hooks after line 71; the field row (lines 152–213) restructured: `type="text"`, `htmlFor` label, `inputRef`, conditional `pr-11`, the ✕ button |

No file is created or deleted. No CSS, no config, no schema, no migrations.

## Implementation Steps

### Step 1: The pure reassertion schedule

**File:** `lib/nina/chatview.ts:226` (insert between `NINA_KEYBOARD_OVERLAP_VAR` and the
`composerBottomCss` doc comment that starts at line 228)
**Change:** one new export in the `── the iOS keyboard ──` section. It is the schedule half of
the fix whose box half (`NINA_KEYBOARD_OVERLAP_VAR`) already shipped; a constant rather than a
function because there is nothing to compute, and in `lib/nina/` because
`vitest.config.ts` is `environment: 'node'` and a rule that lives in a component cannot be tested
(plan invariant 8).
**Code:**

```ts
/**
 * When `NinaSidebar`'s panel re-asserts the focused field's visibility, in ms after the field
 * gained focus inside the open panel — the schedule half of the fix whose box half is
 * `NINA_KEYBOARD_OVERLAP_VAR` above.
 *
 * ── WHY ASSERT AT ALL, WHEN THE PANEL ALREADY ENDS AT THE KEYBOARD ────────────────────────────
 * `bottom: var(--nina-kb-overlap, 0px)` ends the panel's BOX at the keyboard's measured top edge,
 * and the owner's report survived it, because the search field sits at the top of a tall content
 * block inside the panel's OWN `overflow-y-auto` container — and when the keyboard opens over a
 * field inside a scrollable container, iOS Safari scrolls THAT CONTAINER as its "reveal": a
 * `scrollTop` the panel's box geometry says nothing about. The var then shrinks the panel a beat
 * later (visualViewport resize → React state → effect → style), the container keeps its scrolled
 * offset, and the field rides up out of the container's top edge with the keyboard holding the
 * bottom of the glass. The composer never lifts, and it is the one fixed element on this screen
 * that is inside no scroll container at all — the distinguishing fact.
 *
 * So the panel ASSERTS rather than measures: on each focus into one of its text fields, it calls
 * `scrollIntoView({ block: 'nearest', behavior: 'instant' })` on that field — which walks EVERY
 * scrollable ancestor at once (the panel's own container and the document) and corrects whichever
 * one Safari scrolled, without needing to know which fired. It is idempotent: `nearest` on an
 * already-visible element computes zero scroll, so an assert with nothing to correct costs
 * nothing, keyboard or no keyboard.
 *
 * ── WHY A SCHEDULE, AND WHY THESE NUMBERS ────────────────────────────────────────────────────
 * The frame in which Safari performs its reveal is not observable from here — there is no event
 * for "a container was scrolled by the reveal", and a second `visualViewport` subscription is the
 * thing `ChatChrome`'s docstring forbids. Asserting repeatedly across the window in which the
 * keyboard and the panel's box are still settling turns "catch the one right moment" into "be
 * right at every moment", and the whole rule is five numbers:
 *
 *   - `0` — the same frame as the focus. Whatever the reveal scrolled, it scrolled it
 *     synchronously with the focus event, before any keyboard animation began.
 *   - `120` — mid-rise. The iOS keyboard animation runs ~300 ms and the visual viewport moves
 *     most of its total in its first half.
 *   - `300` — at the animation's end, where the reveal's second pass often fires: the layout has
 *     settled but the panel's `bottom` var is still one React commit behind.
 *   - `600` — clear of the whole chain, not just the animation: the `visualViewport` resize →
 *     `setOverlap` → style-write round trip that finally shrinks the panel, and any re-reveal
 *     Safari performs against the new box.
 *   - `1000` — the tail, for a slow first dispatch on an overloaded phone. And it is the END, on
 *     purpose: after one second the scroll position is the runner's own act, and an assert that
 *     kept firing would drag the panel back every time he scrolled the focused field away to
 *     read beside it.
 *
 * `readonly number[]` because the component must not be able to mutate the schedule it runs on.
 * The component measures (focus landed, focus still held); this decides when.
 */
export const KEYBOARD_REASSERT_DELAYS_MS: readonly number[] = [0, 120, 300, 600, 1000]
```

**Impact:** additive; no importer yet until Step 3. Typecheck and all existing tests stay green
after this step alone.

### Step 2: The schedule's tests

**File:** `lib/nina/chatview.test.ts:3-13` (import block) and `:217` (insert after the
`keyboardOverlapPx` describe closes, before the `composerBottomCss` describe at line 219)
**Change:** add the import (alphabetical position: after `KEYBOARD_MIN_PX`, before
`NINA_BAR_VISIBLE_VAR` — the file's import list is case-insensitively alphabetical) and one new
describe block. The assertions pin the SHAPE (ascending, first 0, last past the whole settle
chain, integer ms), not the literal numbers, so the schedule can be retuned by editing the one
line in `chatview.ts` with its reasons still attached.
**Code** — the import block becomes:

```ts
import {
  composerBottomCss,
  composerPadBottomCss,
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  keyboardOverlapPx,
  KEYBOARD_MIN_PX,
  KEYBOARD_REASSERT_DELAYS_MS,
  NINA_BAR_VISIBLE_VAR,
  STICK_TO_BOTTOM_PX,
} from './chatview'
```

and the new block (inserted between the `keyboardOverlapPx` and `composerBottomCss` describes):

```ts
describe('KEYBOARD_REASSERT_DELAYS_MS', () => {
  it('asserts in the same frame as the focus, before anything has moved', () => {
    // Safari's reveal scroll happens synchronously with the focus event, so the first assert owes
    // the schedule no delay at all — a schedule that started at 50 ms would spend its first frame
    // trusting the very scroll it exists to correct.
    expect(KEYBOARD_REASSERT_DELAYS_MS.at(0)).toBe(0)
  })

  it('is strictly ascending', () => {
    // Every timer is armed when the focus lands, so an equal pair fires one assert where two were
    // promised, and a descending pair asserts the later moment first. The previous delay rides in
    // a closure variable rather than an index, which keeps `noUncheckedIndexedAccess` out of it.
    let previous = -Infinity
    for (const delay of KEYBOARD_REASSERT_DELAYS_MS) {
      expect(delay).toBeGreaterThan(previous)
      previous = delay
    }
  })

  it('keeps asserting past the whole keyboard-settle chain, not just the animation', () => {
    // The animation is ~300 ms, but the panel's box shrinks one visualViewport-resize → React
    // state → effect → style round trip AFTER it, and Safari re-reveals against the new box. The
    // last delay must clear the entire chain: 600 is twice the animation and past the round trip.
    expect(KEYBOARD_REASSERT_DELAYS_MS.at(-1)).toBeGreaterThanOrEqual(600)
  })

  it('is made of non-negative integer milliseconds', () => {
    // These go straight into `window.setTimeout`. A fractional or negative delay fires at a
    // moment nobody chose; the rule is asserted here because the component that runs it cannot
    // be tested (`vitest.config.ts` is `environment: 'node'`).
    for (const delay of KEYBOARD_REASSERT_DELAYS_MS) {
      expect(Number.isInteger(delay)).toBe(true)
      expect(delay).toBeGreaterThanOrEqual(0)
    }
  })
})
```

**Impact:** additive. `npm test` green after Steps 1–2 alone.

### Step 3: The panel-level focus reassertion (R1)

**File:** `components/nina/NinaSidebar.tsx:8` (import), `:272-300` (the `[open]`-keyed effect —
full replacement), `:330-340` (comment append inside the `bottom:` style block)
**Change:** import the schedule; add ONE delegated `focusin` listener on the panel div inside the
existing open-keyed effect, alongside the Escape keydown listener it already owns — same shape,
same teardown. The dependency array stays **exactly `[open]`** (the rule documented at
NinaSidebar.tsx:253-270 — a keystroke must not re-run this effect, or the keyboard drops). A
`focusin` DOM listener rather than React's `onFocusCapture` because it keeps the whole lifecycle
(timers included) inside the keyed effect where it tears down with open/close, and cannot grow a
render-body dependency that would break the rule. NO `visualViewport` reference is added
(invariant 2) — the assert needs no measurement.

The import at line 8 becomes:

```ts
import { KEYBOARD_REASSERT_DELAYS_MS, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'
```

The effect at lines 272–300 becomes, in full (everything outside the marked region is verbatim
from the current file):

```tsx
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

    /*
     * ── R1'S SURVIVING HALF: THE PANEL'S SCROLL, WHICH THE BOX FIX CANNOT SEE ───────────────────
     *
     * The inline `bottom: var(--nina-kb-overlap)` below ends the panel's BOX at the keyboard's
     * top edge, and the owner's report survived it — because the search field sits at the top of
     * a tall content block inside the panel's OWN `overflow-y-auto` container, and iOS Safari's
     * focus reveal scrolls that CONTAINER even though the field was already visible: a scrollTop
     * the box says nothing about. The var shrinks the panel a commit later, the container keeps
     * its scrolled offset, and the field rides out through the container's top edge. The composer
     * never lifts, and it is the one fixed element on this screen inside no scroll container.
     *
     * The answer is to ASSERT rather than measure. One delegated `focusin` listener on the panel
     * — same shape as the Escape listener below it, torn down by the same cleanup, and incapable
     * of growing a dependency that would break this effect's keyed-on-`open`-ALONE rule — arms
     * the schedule from `lib/nina/chatview.ts` (`KEYBOARD_REASSERT_DELAYS_MS`; invariant 8 — a
     * rule in a component cannot be tested) against the field that just took focus, and each
     * tick calls `scrollIntoView({ block: 'nearest' })` on it, which walks EVERY scrollable
     * ancestor (this container and the document) and corrects whichever one Safari scrolled.
     * Idempotent: `nearest` on an already-visible element computes zero scroll. And NO second
     * `visualViewport` subscription (invariant 2) — the assert needs no measurement at all.
     *
     * Three guards, each earning its line:
     *   - text fields only (`INPUT` / `TEXTAREA` / contenteditable): the panel itself takes focus
     *     on open above, and neither the panel nor a button has text the keyboard could hide;
     *   - `document.activeElement === target` at FIRE time, not schedule time: a blur or a focus
     *     move within the window means the armed field is no longer the one on screen, and
     *     asserting it would fight the runner — the guard turns every late tick into a no-op;
     *   - a new focus into the panel CANCELS the running schedule and arms a fresh one, so
     *     exactly one schedule is live at a time (search field → rename field moves restart it).
     */
    let reassertTimers: number[] = []
    const panel = panelRef.current
    const onPanelFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        !target.isContentEditable
      ) {
        return
      }

      for (const timer of reassertTimers) window.clearTimeout(timer)
      reassertTimers = KEYBOARD_REASSERT_DELAYS_MS.map((delay) =>
        window.setTimeout(() => {
          if (document.activeElement !== target) return
          /* `instant`, never `smooth`: the layout has already moved under the runner and a 300 ms
             chase reads as a glitch — `decideAutoScroll`'s 'viewport' rule, and no new motion. */
          target.scrollIntoView({ block: 'nearest', behavior: 'instant' })
        }, delay),
      )
    }
    panel?.addEventListener('focusin', onPanelFocusIn)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      panel?.removeEventListener('focusin', onPanelFocusIn)
      for (const timer of reassertTimers) window.clearTimeout(timer)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])
```

Then append one paragraph inside the inline `bottom:` style comment (currently lines 330–338; the
addition goes after the "…lagging a transition behind it." paragraph and before the closing `*/`
at line 338). The style declaration itself is untouched:

```tsx
        {/*
         * …the existing paragraphs of this comment, verbatim, ending "…lagging a transition
         * behind it." …
         *
         * This edge fixes the panel's BOX. The panel's SCROLL is the other half of the bug —
         * Safari's focus reveal scrolls the panel's own `overflow-y-auto` container, which no box
         * can unscroll — and the `focusin` listener in the `open`-keyed effect above is what
         * corrects it, on `KEYBOARD_REASSERT_DELAYS_MS`' schedule.
         */}
        bottom: `var(${NINA_KEYBOARD_OVERLAP_VAR}, 0px)`,
```

(Only the new paragraph is added; the ellipsis above marks the existing text — do not rewrite it.)

**Impact:** behaviour is new only while the panel is open and a text field inside it gains focus;
closed-panel renders are untouched (the effect returns before attaching anything, and the panel is
`inert` regardless). The listener is on the panel div, so fields nested anywhere below it — the
search field today, `SessionRow`'s rename input in phase 2, whatever the phase-3 restructure puts
inside the new scroll area — are all covered by bubbling. `grep -c visualViewport
components/nina/NinaSidebar.tsx` must still return 0.

### Step 4: The search ✕ (R2)

**File:** `components/nina/NinaSearchField.tsx:4` (import), `:61-63` (header-doc section),
`:70-71` (hooks), `:152-213` (the field row — full replacement)
**Change:** the input becomes `type="text"` (keeping `enterKeyHint="search"`); the label pairs by
`htmlFor` from outside a new `relative` wrapper (a button inside a `<label>` is non-conforming —
a label's content model admits no labelable element but its own control); a ref and id are added;
the ✕ renders only when `text !== ''`, with a 44 px hit area, the panel header's ✕ skin, an
Indonesian accessible name, and a `pointerdown` `preventDefault()` so the tap never blurs the
input — the keyboard never folds (the one convention the rename field's ✕, phase 2, shares); the
input gains `pr-11` while the ✕ is on screen so no character runs under it. `CONTROL_CLASS`'s
`text-base` (16 px Safari zoom guard, invariant 7) is untouched.

The import at line 4 becomes:

```ts
import { useEffect, useId, useRef, useState } from 'react'
```

The header doc gains this section, inserted between the "WHY THE LINK FIRES NO CLOSE CALLBACK"
section (ends at line 61) and the "MOTION (INVARIANT 8)" section (starts at line 63):

```tsx
 * ── THE ✕ IN THE FIELD'S RIGHT END (R2), AND WHY THE INPUT IS `type="text"` ──────────────────
 * The owner's ask has two halves that must land as ONE tap: the query AND the results go, and the
 * keyboard stays up so the next query can be typed straight away. `type="search"` would draw
 * Safari's own small clear glyph on iOS — an affordance this code cannot size to the 44 px floor,
 * cannot give an accessible name, and cannot teach the two-part clear to — while Chrome Android
 * draws none at all. So the input is `type="text"` and the ✕ below is the ONE clear affordance,
 * on every browser, with a target, a name ("Hapus pencarian") and semantics this component owns;
 * `enterKeyHint="search"` stays, so the keyboard's return key still reads SEARCH and still
 * commits through the Enter handler.
 *
 * The tap does three things — `setText('')`, `setResult(null)`, `inputRef.current?.focus()` —
 * and deliberately nothing to `requestRef`: the emptied query re-runs the effect above, whose
 * bump drops any in-flight response and whose cleanup cancels the pending debounce, so the clear
 * cannot race a search it just deleted. Nulling `result` is honest state, not decoration: the
 * `active` gate already hides every results block the moment the query empties, but keeping the
 * old `result` would let a clear-then-retype of the SAME query pass `fresh` on the first
 * keystroke back and repaint the stale answer as though it were this search's.
 *
 * And the keyboard never folds on the way: the ✕ cancels its own `pointerdown`
 * (`preventDefault()`), so the tap moves focus NOWHERE — the input never blurs, and iOS has no
 * blur to fold the keyboard over. The `focus()` in the click handler is the net for the paths
 * pointer events do not cover: a keyboard user's Enter on the button, and focus already
 * elsewhere. The same convention the rename field's ✕ (phase 2) wears — one idiom, two fields.
```

The hooks — after `const [semantic, setSemantic] = useSemanticPref()` (line 71), before the
`result` state block, add:

```tsx
  /* The ✕'s handle on the field it clears: `focus()` after the clear is 2b — the keyboard never
     folds between the tap and the next keystroke. */
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
```

The field row at lines 152–213 becomes, in full (the AI switch and its comment are verbatim; the
Enter handler and its comment are verbatim; only the wrapper/label/input/✕ are new):

```tsx
      <div className="flex items-center gap-2">
        {/*
          The wrapper — not the label — is `relative`, because the ✕ pins to the INPUT's box and
          a label's content model admits no button (no labelable element but its own control).
          `Field`'s own suffix slot is the precedent for the shape: an adornment inside the
          control's box hangs off a `relative` parent of the input, and the label pairs by
          `htmlFor` instead of wrapping. The accessible name is unchanged: "Search all chats".
        */}
        <div className="relative min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            Search all chats
          </label>
          <input
            ref={inputRef}
            id={inputId}
            /* `type="text"`, not `type="search"` — the header's ✕ section: Safari's native clear
               glyph cannot be sized, named, or taught the two-part clear, and Chrome Android
               draws none at all. `enterKeyHint="search"` keeps the blue SEARCH key. */
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={SEARCH_QUERY_MAX_CHARS}
            placeholder="Search all chats"
            /* No `autoFocus`: the sidebar opens to a session list, and raising the phone keyboard
               over it on every open would hide the thing the runner came for. */
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onKeyDown={(event) => {
              /*
               * The keyboard's blue SEARCH key (and desktop Enter, which is the same commit)
               * releases the field — the owner's ask, and `Composer`'s send handler is the
               * precedent word for word: "can you automatically hide the keyboard after user press
               * send? right now i have to manually click Done everytime to hide this stupid
               * keyboard". Blurring whatever holds focus folds the keyboard in the same frame.
               *
               * `isComposing` first, for `Composer`'s exact reason: an IME's Enter commits a
               * candidate, and must not fold the keyboard mid-word. And nothing needs flushing on
               * the way out — the search runs on its own debounce as the runner types, and the
               * field keeps its text and its results through the blur.
               */
              if (event.key !== 'Enter') return
              if (event.nativeEvent.isComposing) return
              event.preventDefault()
              event.currentTarget.blur()
            }}
            /* `pr-11` only while the ✕ is on screen: the ✕ owns the field's last 44 px and no
               character may run under it, while the EMPTY field keeps its full-width placeholder
               padding. `pr` beats `CONTROL_CLASS`'s `px-4` on the right by CSS source order —
               `HeroFields`' "km"-suffix input (`className="pr-10"` over the same class) is the
               precedent, and `cn` is a plain join, so source order is the only referee. */
            className={cn(CONTROL_CLASS, 'h-11', text !== '' && 'pr-11')}
          />
          {/*
            The ✕ — both halves of the ask as one tap. 2a: the query AND the results go
            (`setText('')` + `setResult(null)` — see the header for why the null is load-bearing
            and why `requestRef` needs no touch). 2b: `onPointerDown` calls `preventDefault()`, so
            the tap never moves focus out of the input and iOS never gets a blur to fold the
            keyboard over; the `focus()` in the click handler is the net for what pointer events
            do not cover — a keyboard user's Enter on the button, focus already elsewhere.

            Rendered only when there is text: an ✕ over an empty field is a control that lies.
            `inset-y-0 right-0 w-11` is a 44 px target filling the field's height (invariant 4),
            the skin is the panel header's own ✕ convention (`rounded-pill`, a 19 px glyph,
            `text-ink-3`), and `active:opacity-70` with no transition is the hit rows' discrete
            press feedback — nothing for invariant 8 to answer. The rename field's ✕ (phase 2)
            wears this same skin and event strategy: one convention, two fields.
          */}
          {text !== '' && (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setText('')
                setResult(null)
                inputRef.current?.focus()
              }}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
            >
              ✕
            </button>
          )}
        </div>

        {/*
          `role="switch"` with `aria-checked`, and not `Chip`'s `aria-pressed`. `Chip`'s own comment
          argues for exactly this distinction: "a screen reader that announces 'selected' for a
          filter chip has told the user nothing about whether tapping it again turns it off". A
          persisted setting is a switch, and a switch announces "on"/"off".

          `h-11` is 44 px, the iOS tap-target floor that `Chip` and `NinaAvatar` both hold to.
        */}
        <button
          type="button"
          role="switch"
          aria-checked={semantic}
          onClick={() => setSemantic(!semantic)}
          title="Rank results by meaning, using the language model"
          className={cn(
            'inline-flex h-11 shrink-0 items-center rounded-pill px-3.5',
            'text-[13px] font-semibold transition-colors',
            semantic ? 'bg-ink text-card' : 'bg-paper-2 text-ink-2',
          )}
        >
          <span>AI</span>
        </button>
      </div>
```

**Impact:** the input keeps its accessible name, its Enter behaviour, its 16 px text and its
`h-11`; only the clear affordance changes. The `type` switch drops WebKit's native clear glyph and
desktop-Escape-to-clear (which no touch user has and which cleared only the text — the exact
half-clear this ✕ replaces). The panel's R1 listener (Step 3) treats the ✕'s `focus()` as any
other focus: it arms the schedule, which asserts an already-visible field and computes zero scroll.

## Verification

This worktree is fresh — it has **no `.env.local` and no `node_modules`** (verified), and
`lib/env.ts` validates 14 vars at load, so build/typecheck/test all die until both are in place
(repo convention for every fresh worktree):

```
cd /home/miftah/.worktrees/run-insights/search-clear-and-sidebar-icons
cp /home/miftah/run-insights/.env.local .
npm install
```

Then, in order:

```
npm run typecheck     # next typegen && tsc --noEmit (strict, noUncheckedIndexedAccess)
npm test              # vitest run — includes the new KEYBOARD_REASSERT_DELAYS_MS block
npm run build         # next build
npm run format:check  # prettier, printWidth 100, no-semi, single quotes, tailwind class order
```

`npx vitest run lib/nina/chatview.test.ts` runs the new block alone while iterating. If
`format:check` flags a file, `npx prettier --write <file>` it — `npm run format` is repo-wide and
this is a dedicated worktree, but keep the diff scoped by formatting only the four touched files.

**Invariants to re-check by command (not by eye):**

```
grep -c visualViewport components/nina/NinaSidebar.tsx components/nina/NinaSearchField.tsx   # → 0 and 0
grep -n "}, \[open\])" components/nina/NinaSidebar.tsx                                       # the effect's dep array is still exactly [open]
grep -rn "type=\"search\"" components/ app/ lib/                                             # → no matches
```

**Manual check** (device of record: iPhone XS Max — the Safari reveal cannot be reproduced under
`environment: 'node'`, which is precisely why the schedule is a tested pure rule and the assert is
idempotent):

1. Open a chat, tap the `>` trigger, tap "Search all chats", type — the field stays fully visible
   above the keyboard through the whole rise; every keystroke is on screen.
2. Tap a session's `⋯` → "Ganti nama", tap into the name field — same outcome, via the same
   listener (proves the delegation is not search-field-specific).
3. Type a query with results on screen → the ✕ is at the field's right end → one tap: field
   empties, every results block (hits, pending line, "No matches.", degraded notice, cap notice)
   disappears, keyboard stays up, caret in the field.
4. Clear, then retype the same query — "Searching…" shows and the results that appear answer the
   new run (the `setResult(null)` case).
5. Tap the ✕, then immediately scroll the list with a finger — after ~1 s the panel does not
   yank back (the schedule's deliberate end).

**Exit criteria** (all must hold):

- `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check` all green.
- `lib/nina/chatview.test.ts` has the four new passing assertions (ascending / first 0 / last ≥
  600 / non-negative integers).
- On keyboard-open over ANY text field inside the open panel, the focused field is re-asserted
  visible over the keyboard-animation window via `scrollIntoView({ block: 'nearest', behavior:
  'instant' })` — idempotent, scheduled purely, zero new `visualViewport` subscriptions.
- The ✕ renders only when `text !== ''`; one tap clears `text` AND `result` and leaves focus in
  the input.
- The `[open]` dependency array of the sidebar's focus effect is byte-identical to before.

## Handoffs

- **Phase 3 (sidebar bottom rail / panel restructure):** must quote `NinaSidebar.tsx` as it looks
  AFTER this phase — the `focusin` listener, its timer cleanup, and the
  `KEYBOARD_REASSERT_DELAYS_MS` import are load-bearing. Constraints for the restructure: keep
  every text field a descendant of the panel div (`focusin` bubbles from any depth, including the
  new inner scroll area); keep the listener block and its teardown inside the `[open]`-keyed
  effect; do not add a dependency to that array. The appended paragraph in the `bottom:` style
  comment is part of the file's record now.
- **Phase 2 (rename ✕ in `SessionRow.tsx`):** no lib work and no panel work is needed — the
  Step-3 listener already covers the rename input (it is a panel descendant; `focusin` bubbles).
  Phase 2's ✕ and this phase's are ONE convention, aligned at reconciliation: same event
  strategy (`onPointerDown` preventDefault + `focus()` in the click handler), same structural
  pattern (relative wrapper + absolute `w-11` ✕ + conditional `pr-*`), same skin (the panel
  header's ✕: `rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70`, raw glyph
  child whose name the `aria-label` overrides); only the Indonesian aria-label differs per field
  ("Hapus pencarian" here, "Kosongkan nama" there) and the wrapper — phase 2 hangs its ✕ inside
  `Field`'s own `relative` wrapper rather than building one. Two files, no shared control (the
  repo's no-shared-icon-module convention).
- **Not done here, on purpose:** any change to `NewChatButton.tsx`, the "Proses foto" Link, or
  the panel's layout (R5, phase 3); any icon work in `SessionRow` (R3, phase 2).

## Rollback

This phase is one commit on `feature/search-clear-and-sidebar-icons` (four files, all additive:
one export, one describe block, one effect block + import + comment paragraph, one markup
restructure). `git revert <sha>` restores the pre-phase file states; nothing outside the four
files references `KEYBOARD_REASSERT_DELAYS_MS` at base, so the revert cannot strand an importer.
No schema, migration, config, or CSS accompanies it — whole-set rollback stays as the plan index
describes (delete the branch).
