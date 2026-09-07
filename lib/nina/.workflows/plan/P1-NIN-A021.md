> Adopted from `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` phase 3. Source: `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: Tap a bubble to edit or delete it

**Plan set:** `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md`
**Analysis:** `20260907-125041-PHRF_code_analyzer.md`
**Satisfies:** R4 — "user can click any bubble (his or nina's) and choose: edit , delete"
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (rule + tests), `components/nina` (the opener)

---

## Goal

Edit and delete already ship. After this phase they are **reachable with a pointer**: a tap on the
body of any bubble — his or hers, finger or mouse — opens `MessageActionsSheet`, where before this
the only openers were a left swipe on touch and a `sr-only focus:not-sr-only` button, so a mouse
user had none at all. The rule that decides what counts as a tap is one pure function in
`lib/nina/edit.ts` with a unit table beside `decideMessageActionSwipe`'s, and neither swipe changes
by a pixel.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**

- `lib/nina/edit.ts` — `ActionableMessage` (type: `Pick<EditTarget, 'id' | 'confirmed'>`)
- `lib/nina/edit.ts` — `MESSAGE_ACTION_TAP_SLOP_PX = 10` (const)
- `lib/nina/edit.ts` — `BUBBLE_BODY_SELECTOR = '[data-nina-bubble-body]'` (const)
- `lib/nina/edit.ts` — `BUBBLE_INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,[role="button"],[role="link"],[contenteditable="true"]'` (const)
- `lib/nina/edit.ts` — `MessageActionTapGesture` (interface: `dx`, `dy`, `touches`, `zoomScale`, `startedOnBody`, `startedOnInteractive`, `textSelected`)
- `lib/nina/edit.ts` — `MessageActionTapDecision` (type: `'actions' | 'none'`)
- `lib/nina/edit.ts` — `decideMessageActionTap(target: ActionableMessage, gesture: MessageActionTapGesture): MessageActionTapDecision`
- `components/nina/MessageBubble.tsx` — module-private `hasTextSelection()`, `closestMatches()`; a
  `press` ref; `onPointerDown` / `onPointerUp` / `onPointerLeave` handlers
- `components/nina/MessageBubble.tsx` — the DOM attribute `data-nina-bubble-body=""` on the
  bubble's inner `<div>`. **This is the only markup this phase adds.**

**Signature changes:**

- `canActOnMessage(target: EditTarget)` -> `canActOnMessage(target: ActionableMessage)`
  (`lib/nina/edit.ts:106`). A **widening only**: `EditTarget` satisfies `ActionableMessage`
  structurally, the body is untouched, and the one existing caller
  (`ChatScreen.tsx:743`, which passes a full `EditTarget`) still typechecks unchanged.
- `MessageBubble`'s `start` ref type gains three fields (`onBody`, `onInteractive`, `selected`).
  Module-private; no prop, no export.

**Requires (from earlier phases):** nothing. This phase has no `depends_on` and reads no column,
query, action or component that phases 1, 2 or 4 change.

**Leaves alone (owned by others):**

- `components/nina/MessageActionsSheet.tsx` — **Phase 4** adds the Resend item. Not one character
  here: no new item, no new `Mode`, no prop.
- `components/nina/ChatScreen.tsx` — **Phase 4**. **This phase edits ZERO lines of it.**
  `handleRequestActions` (:734) already builds the `EditTarget` and `photoCount` from a
  `ChatMessage`, and `onRequestActions` is already threaded down (:1152). The one line I considered
  and did *not* need is discussed in Step 4.
- `lib/nina/reply.ts` — `decideReplySwipe`, `REPLY_SWIPE_MIN_DISTANCE`, `REPLY_SWIPE_DOMINANCE`.
  **Imported, never edited** (invariant 6). `edit.ts` already imports the two constants at :2.
- `lib/nina/edit.ts` `decideMessageActionSwipe` (:333-347), `MESSAGE_ACTION_EDGE_GUARD_PX` (:276),
  `MessageActionSwipeGesture` (:293) — byte for byte unchanged (invariant 6).
- `lib/nina/messageActions.ts`, `lib/nina/queries.ts`, `lib/nina/actions.ts`, `lib/db/schema.ts`,
  `drizzle/**` — untouched. No DDL (invariant 8).
- `components/nina/MessageList.tsx`, `ChatImages.tsx`, `QuoteStub.tsx`, `RunAttachmentCard.tsx`,
  `components/ui/Sheet.tsx` — read to enumerate the interactive descendants; **not edited.** The
  `closest()` selector was chosen precisely so those four files need no cooperation.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/edit.ts` | modify | `ActionableMessage` inserted above `canActOnMessage`'s docstring (before :95); its signature widened at :106; a new `── the tap ──` block appended after :347 |
| `lib/nina/edit.test.ts` | modify | imports widened (:4-18); a `decideMessageActionTap` describe block appended after :316; one case added to the `canActOnMessage` block |
| `components/nina/MessageBubble.tsx` | modify | header gains an R4 section (after :74); import at :7; two module helpers before :117; a `press` ref and three pointer handlers; `onTouchStart` records three booleans; `onTouchEnd` gains a THIRD check after the swipe check; the inner `<div>` gains `data-nina-bubble-body` and the three pointer props |

Three files. The draft index said ~4; the fourth was a `tests/` file, and Step 3 explains why the
table goes in the existing co-located suite (`lib/nina/edit.test.ts`) instead. The reconciled index
now says 3.

---

## Implementation Steps

### Step 1: `ActionableMessage`, so the bubble can ask the gate without assembling an `EditTarget`

**File:** `lib/nina/edit.ts` — insert immediately above the `canActOnMessage` docstring that
currently begins at :95, then change the signature at :106.

**Change:** `canActOnMessage` reads exactly two of `EditTarget`'s six fields, `id` and `confirmed`.
`MessageBubble` has to consult it (rule 4 of the tap, below) and can produce those two cheaply —
but not `hasImage` / `hasRun`, which RULING E2b puts in `MessageList` "and nowhere else". Naming
the narrow type is a pure widening: nothing about the function's behaviour moves, and its one
caller keeps passing a full `EditTarget`.

**Code:** insert this block, then replace the signature line.

```ts
/**
 * The two `EditTarget` fields `canActOnMessage` actually reads, as a shape a caller can build
 * without knowing what a photo or an attached run is.
 *
 * `EditTarget` satisfies it structurally, so this is a WIDENING and not a change: every existing
 * caller keeps passing the whole target and keeps typechecking. It exists because R4's tap opener
 * has to consult the gate from inside `MessageBubble`, and the alternative was for the bubble to
 * assemble a whole `EditTarget` — which means computing `hasImage` and `hasRun` a second time, in
 * a second file, when RULING E2b deliberately put that computation in `MessageList` and nowhere
 * else.
 */
export type ActionableMessage = Pick<EditTarget, 'id' | 'confirmed'>
```

and at :106:

```ts
export function canActOnMessage(target: ActionableMessage): boolean {
  return target.confirmed && isValidId(target.id)
}
```

**Impact:** none observable. `tsc` is the whole test: `ChatScreen.tsx:743` compiles untouched.
Phase 4, if it adds a resend gate to this file, may take `EditTarget` or `ActionableMessage` as it
prefers — both remain valid.

---

### Step 2: the tap rule

**File:** `lib/nina/edit.ts` — append after :347 (end of file), as a new
`/* ── the tap ── */` section under the existing `/* ── the gesture ── */` one.

**Change:** one pure decision, three exported constants, one gesture interface. `ZOOM_EPSILON`
(:283) and `canActOnMessage` are already in this module; `MESSAGE_ACTION_TAP_SLOP_PX` is the only
new number and the test pins it below `REPLY_SWIPE_MIN_DISTANCE`.

**Code:**

```ts
/* ── the tap ───────────────────────────────────────────────────────────────────────────────── */

/**
 * How far a finger or a mouse may travel and still be a tap, in CSS pixels, in EITHER axis.
 *
 * 10, which is the platforms' own answer rather than a guess: Android's `ViewConfiguration` touch
 * slop is 8dp and UIKit allows roughly 10pt before a touch stops being a tap. Taking the larger of
 * the two means a shaky thumb opens the sheet on the first try.
 *
 * It is deliberately far below `REPLY_SWIPE_MIN_DISTANCE` (44), and `edit.test.ts` pins the
 * inequality so the two windows can never grow into each other. The 34 px between them is a DEAD
 * BAND and that is the design: a drag long enough to be ambiguous is neither a tap nor a swipe and
 * does nothing at all. The gesture that guesses on an ambiguous input is the one that opens a
 * delete confirmation nobody asked for.
 */
export const MESSAGE_ACTION_TAP_SLOP_PX = 10

/**
 * The bubble's own prose, marked so a tap can tell it from the empty paper beside it.
 *
 * `MessageBubble`'s touch handlers sit on the `<li>`, which is a full-width flex row: his bubble is
 * `justify-end` inside it, so the left portion of that row is blank. A SWIPE there is unambiguous
 * and is allowed to open the sheet, exactly as it does today. A TAP there is not — tapping the
 * empty part of a conversation is what a reader does when they mean nothing in particular, and
 * that gesture must not open a sheet on whichever row happens to be under it.
 *
 * The `<li>` cannot simply be narrowed instead: that would move the reply gesture's hit area, and
 * invariant 6 says the reply swipe keeps every pixel it has today. So the bubble's own `<div>`
 * carries the attribute and a `closest()` from the element the press landed on answers the
 * question.
 *
 * The literal attribute is written once, in `MessageBubble`'s JSX. This selector is its only
 * reader, and it lives here rather than in the component for the reason every rule in this file
 * lives here: the component measures, `lib/` decides.
 */
export const BUBBLE_BODY_SELECTOR = '[data-nina-bubble-body]'

/**
 * Everything inside a bubble that is already a control, and therefore is not the bubble.
 *
 * Read off the render, top to bottom. `QuoteStub` is a `<button>` whenever it can jump; `ChatImages`
 * wraps each photograph in a `<button>` whenever the viewer is armed; `RunAttachmentCard` is a
 * `next/link` — an `<a>` — to `/r/[id]`; and the bubble itself carries two
 * `sr-only focus:not-sr-only` `<button>`s. So `a` and `button` are the two selectors this render
 * actually needs, and they cover all five controls.
 *
 * The rest of the list is there because the safe direction of error is "that was a control".
 * A missed exclusion opens a sheet over something the runner meant to press; an over-broad
 * selector costs one extra tap on the prose. Anything a later phase hangs in `MessageBubble`'s
 * `above` slot is therefore excluded by default, which is the behaviour a shared slot should have.
 *
 * A `closest()` selector rather than a `data-` attribute on each control, deliberately: the
 * controls live in four other files, three of which this phase does not own, and a selector needs
 * no cooperation from any of them.
 */
export const BUBBLE_INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,summary,[role="button"],[role="link"],[contenteditable="true"]'

/**
 * What the bubble measures from a finished tap, with no DOM types in the signature.
 *
 * Four of the seven fields are `MessageActionSwipeGesture`'s, measured the same way and for the
 * same reasons — see it. The three new ones are BOOLEANS THE COMPONENT COLLAPSES, on
 * `EditTarget.hasImage`'s precedent and for its reason: answering them needs an `Element` and a
 * `Selection`, and this module may not name either.
 */
export interface MessageActionTapGesture {
  /** `end.clientX - start.clientX`. A tap has no direction, so only the MAGNITUDE is read. */
  dx: number
  /** `end.clientY - start.clientY`. Same, and it is what makes a scroll not a tap. */
  dy: number
  /** The MAXIMUM concurrent touches seen at any point in the interaction. 1 for a mouse. */
  touches: number
  /** `visualViewport.scale` at the end of the interaction; 1 when the page is not zoomed. */
  zoomScale: number
  /**
   * True when the interaction BEGAN inside the bubble's own prose —
   * `closest(BUBBLE_BODY_SELECTOR)` from the element the press landed on. False for the empty
   * paper beside the bubble. See `BUBBLE_BODY_SELECTOR` for why the row is wider than the bubble.
   */
  startedOnBody: boolean
  /**
   * True when the interaction BEGAN on a control inside the bubble —
   * `closest(BUBBLE_INTERACTIVE_SELECTOR)`.
   *
   * The START and not the end, and the browser agrees with that choice: a `click` whose press and
   * release are on different elements fires on their common ancestor, so a press that begins on a
   * photograph and lifts over the text opens neither the viewer nor this sheet. Consulting the end
   * as well would be a second sample for a case where doing nothing and doing something are
   * equally defensible.
   */
  startedOnInteractive: boolean
  /**
   * True when a non-collapsed text selection existed at ANY point in the interaction — sampled at
   * the start and again at the end, the way `touches` is a maximum rather than a final count.
   *
   * Both samples are load-bearing and they catch different things. At the END: a short drag that
   * selected a few characters without travelling far, and iOS's long-press selection callout —
   * which is how this rule keeps the promise `MessageBubble`'s header made, that copying what she
   * said stays a real capability. At the START: a click on a bubble that already carries a
   * selection is the click that DISMISSES that selection, and the browser collapses it on
   * `pointerdown`, so by the time the release could be asked the evidence is gone.
   */
  textSelected: boolean
}

export type MessageActionTapDecision = 'actions' | 'none'

/**
 * Whether a finished tap or click on a bubble should open the action menu — R4's opener.
 *
 * The capability it opens shipped in `75a9c34`; what never shipped was a way to ask for it with a
 * pointer. A LEFT swipe and a focus-revealed button were the only two openers, so a mouse had none
 * at all, and the user's words are "user can click any bubble (his or nina's) and choose: edit,
 * delete". This function is that click, expressed as rules because `vitest.config.ts` is
 * `environment: 'node'` and a rendered-scenario test would prove one gesture where these prove the
 * gate — the same argument this file's header makes for existing.
 *
 * ── WHY A TAP IS ALLOWED NOW, WHEN `MessageBubble`'s HEADER REJECTED ONE TWICE ────────────────
 * That header rejected a tap because it would "make the bubble itself a button, which breaks text
 * selection just as thoroughly" as a long press. The objection is ANSWERED here rather than
 * overruled, and it is answered in three places at once: nothing becomes a `<button>` (a bubble
 * contains buttons and cannot be one), no `role` and no `tabIndex` are added, and `textSelected`
 * gives the platform's own selection gesture right of way over the opener. The bubble stays
 * selectable prose that happens to answer a tap. The long press stays the selection gesture, and
 * it needs no rule of its own: a long press leaves a selection, and a selection refuses the tap.
 *
 * ── THE SEVEN RULES, IN THE ORDER THEY MATTER ─────────────────────────────────────────────────
 *   1. it must have STARTED on the bubble's prose. The row is full-width and the paper beside a
 *      bubble is not the bubble;
 *   2. it must not have started on a control. The photo grid, the quote stub, the run card and the
 *      two `sr-only` buttons all own their own presses;
 *   3. no selection at either end — see `textSelected`;
 *   4. the row has to be actionable, and `canActOnMessage` IS that gate, reused rather than
 *      restated. **The refusal here is SILENT, and that is the one place a tap and a swipe
 *      deliberately differ.** `ChatScreen.handleRequestActions` answers a rejected swipe with an
 *      `edit-unavailable` notice, because "the runner performed a deliberate gesture and a gesture
 *      that does nothing reads as a broken screen". A tap on the bubble he sent one second ago is
 *      not deliberate — it is a thumb still resting where the send target was — and a notice for
 *      it would be noise on the happy path. So an optimistic row opens nothing and says nothing,
 *      and the swipe's notice is untouched;
 *   5. one finger. The MAXIMUM seen during the interaction, as everywhere else on this screen,
 *      because a pinch that begins with one finger down must still lose;
 *   6. not on a zoomed page. Same epsilon and same reason as `decideMessageActionSwipe` and
 *      `decideReplySwipe`: `visualViewport.scale` settles a hair above 1 after a pinch-release, and
 *      while the page is zoomed a small movement is the reader panning, not choosing;
 *   7. it must not have TRAVELLED, in either axis. `dx` is read as a magnitude — a tap has no
 *      direction, and that is exactly what keeps this decision from re-litigating either swipe:
 *      reply owns rightward past 44 px, actions owns leftward past 44 px, and a tap owns the 10 px
 *      around zero. The three windows are disjoint by construction and `edit.test.ts` pins it.
 *
 * There is no timer anywhere in here, which is the second half of why this is a tap and not a long
 * press: `MessageBubble`'s header rejected the long press partly on the timer, the cancel path and
 * the haptic story it would need, and the plan set's Decisions table settled the fork the same way.
 */
export function decideMessageActionTap(
  target: ActionableMessage,
  gesture: MessageActionTapGesture,
): MessageActionTapDecision {
  const { dx, dy, touches, zoomScale, startedOnBody, startedOnInteractive, textSelected } = gesture
  if (!startedOnBody) return 'none'
  if (startedOnInteractive) return 'none'
  if (textSelected) return 'none'
  if (!canActOnMessage(target)) return 'none'
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'none'
  if (touches > 1) return 'none'
  if (Number.isFinite(zoomScale) && zoomScale > 1 + ZOOM_EPSILON) return 'none'
  if (Math.abs(dx) > MESSAGE_ACTION_TAP_SLOP_PX) return 'none'
  if (Math.abs(dy) > MESSAGE_ACTION_TAP_SLOP_PX) return 'none'
  return 'actions'
}
```

**Impact:** additive. No existing export changes behaviour. `ZOOM_EPSILON` stays module-private and
is now read by two functions, which is what it was always for.

---

### Step 3: the table, beside the swipe's

**File:** `lib/nina/edit.test.ts` — widen the import block (:4-18), add one case to the
`canActOnMessage` describe (after :71), and append a new describe after :316.

**Change:** The phase brief says "tests in `tests/`". The existing suite for this module is
**co-located** at `lib/nina/edit.test.ts` — `vitest.config.ts` includes `lib/**/*.test.ts` for
exactly this — and the brief's own instruction was that the new table "should sit beside"
`decideMessageActionSwipe`'s. Beside it wins: a second file in `tests/` would split one module's
rules across two suites, and `tests/` in this repo holds cross-module and app-level suites, not
`lib/nina` unit tables. **This is the one deviation from the brief's literal wording, and it is
deliberate.**

**Code:** replace the import block at :4-18 with:

```ts
import {
  BUBBLE_BODY_SELECTOR,
  BUBBLE_INTERACTIVE_SELECTOR,
  EDIT_MAX_CHARS_HERS,
  EDIT_MAX_CHARS_MINE,
  MESSAGE_ACTION_EDGE_GUARD_PX,
  MESSAGE_ACTION_TAP_SLOP_PX,
  applyMessageDeletion,
  applyMessageEdit,
  canActOnMessage,
  decideMessageActionSwipe,
  decideMessageActionTap,
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
  type MessageActionSwipeGesture,
  type MessageActionTapGesture,
} from './edit'
import { REPLY_SWIPE_DOMINANCE, REPLY_SWIPE_MIN_DISTANCE } from './reply'
```

Add this case to the `canActOnMessage` describe, after :71:

```ts
  /* The signature widened to `ActionableMessage` so `MessageBubble` can ask the gate without
   * assembling a whole `EditTarget`. Both shapes are the same call. */
  it('accepts the narrow shape a bubble can build, as well as a whole EditTarget', () => {
    expect(canActOnMessage({ id: ID, confirmed: true })).toBe(true)
    expect(canActOnMessage({ id: ID, confirmed: false })).toBe(false)
    expect(canActOnMessage({ id: 'local-6f0c1d2e-aaaa', confirmed: true })).toBe(false)
  })
```

Append after :316:

```ts
/* ── decideMessageActionTap — R4's opener ──────────────────────────────────────────────────── */

describe('decideMessageActionTap', () => {
  function tap(patch: Partial<MessageActionTapGesture> = {}): MessageActionTapGesture {
    return {
      dx: 1,
      dy: -2,
      touches: 1,
      zoomScale: 1,
      startedOnBody: true,
      startedOnInteractive: false,
      textSelected: false,
      ...patch,
    }
  }

  it('opens the sheet for a still press on a confirmed bubble', () => {
    expect(decideMessageActionTap(target(), tap())).toBe('actions')
  })

  it('opens the sheet on HER bubble too — R4 is both sides', () => {
    expect(decideMessageActionTap(target({ mine: false }), tap())).toBe('actions')
  })

  /* Rule 1. The `<li>` is a full-width row; the paper beside a bubble is not the bubble. */
  it('refuses a press that began in the empty paper beside the bubble', () => {
    expect(decideMessageActionTap(target(), tap({ startedOnBody: false }))).toBe('none')
  })

  /* Rule 2. The photo grid, the quote stub, the run card and the two sr-only buttons. */
  it('refuses a press that began on a control inside the bubble', () => {
    expect(decideMessageActionTap(target(), tap({ startedOnInteractive: true }))).toBe('none')
  })

  /* Rule 3. Copying what she said stays a real capability — MessageBubble's header. */
  it('refuses while text is selected, at either end of the interaction', () => {
    expect(decideMessageActionTap(target(), tap({ textSelected: true }))).toBe('none')
  })

  /* Rule 4, and it is SILENT here where the swipe's refusal is a notice. */
  it('refuses an optimistic row: a local- id is not a database row', () => {
    expect(decideMessageActionTap(target({ id: 'local-6f0c1d2e-aaaa' }), tap())).toBe('none')
  })

  it('refuses a row whose send has not been confirmed', () => {
    expect(decideMessageActionTap(target({ confirmed: false }), tap())).toBe('none')
  })

  it('takes the narrow ActionableMessage shape the bubble builds', () => {
    expect(decideMessageActionTap({ id: 'aBcD1234efGH', confirmed: true }, tap())).toBe('actions')
  })

  /* Rule 5. */
  it('refuses two fingers, counted as the maximum seen during the interaction', () => {
    expect(decideMessageActionTap(target(), tap({ touches: 2 }))).toBe('none')
  })

  /* Rule 6, with the swipes' own epsilon for a settled pinch. */
  it('refuses a zoomed page but accepts a scale that merely settled above 1', () => {
    expect(decideMessageActionTap(target(), tap({ zoomScale: 1.4 }))).toBe('none')
    expect(decideMessageActionTap(target(), tap({ zoomScale: 1.000000000000002 }))).toBe('actions')
  })

  /* Rule 7, both axes, at the boundary. */
  it('accepts movement of exactly the slop and refuses one pixel more, in x', () => {
    expect(decideMessageActionTap(target(), tap({ dx: MESSAGE_ACTION_TAP_SLOP_PX }))).toBe('actions')
    expect(decideMessageActionTap(target(), tap({ dx: MESSAGE_ACTION_TAP_SLOP_PX + 1 }))).toBe(
      'none',
    )
  })

  it('accepts movement of exactly the slop and refuses one pixel more, in y', () => {
    expect(decideMessageActionTap(target(), tap({ dy: -MESSAGE_ACTION_TAP_SLOP_PX }))).toBe(
      'actions',
    )
    expect(decideMessageActionTap(target(), tap({ dy: MESSAGE_ACTION_TAP_SLOP_PX + 1 }))).toBe(
      'none',
    )
  })

  it('reads dx as a magnitude, because a tap has no direction', () => {
    expect(decideMessageActionTap(target(), tap({ dx: 6 }))).toBe('actions')
    expect(decideMessageActionTap(target(), tap({ dx: -6 }))).toBe('actions')
  })

  it('refuses a gesture with non-finite numbers', () => {
    expect(decideMessageActionTap(target(), tap({ dx: Number.NaN }))).toBe('none')
    expect(decideMessageActionTap(target(), tap({ dy: Number.POSITIVE_INFINITY }))).toBe('none')
  })

  /* ── the three windows are disjoint, and this is the assertion that keeps them so ────────── */

  it('leaves a gap between the tap window and either swipe window', () => {
    expect(MESSAGE_ACTION_TAP_SLOP_PX).toBeLessThan(REPLY_SWIPE_MIN_DISTANCE)
  })

  it('refuses every drag the actions swipe accepts, and vice versa (invariant 6)', () => {
    const dx = -REPLY_SWIPE_MIN_DISTANCE
    expect(decideMessageActionSwipe({ dx, dy: 0, touches: 1, zoomScale: 1, startX: 200, viewportWidth: 414 })).toBe(
      'actions',
    )
    expect(decideMessageActionTap(target(), tap({ dx, dy: 0 }))).toBe('none')

    const still = 2
    expect(
      decideMessageActionSwipe({
        dx: still,
        dy: 0,
        touches: 1,
        zoomScale: 1,
        startX: 200,
        viewportWidth: 414,
      }),
    ).toBe('none')
    expect(decideMessageActionTap(target(), tap({ dx: still, dy: 0 }))).toBe('actions')
  })

  it('refuses reply’s own rightward swipe, so the reply gesture keeps it', () => {
    expect(decideMessageActionTap(target(), tap({ dx: REPLY_SWIPE_MIN_DISTANCE, dy: 0 }))).toBe(
      'none',
    )
  })

  /* ── the two selectors are contracts with `MessageBubble`, so their shape is asserted ────── */

  it('names the bubble body by the data attribute MessageBubble writes', () => {
    expect(BUBBLE_BODY_SELECTOR).toBe('[data-nina-bubble-body]')
  })

  it('covers every control this bubble actually renders', () => {
    /* QuoteStub and ChatImages and the two sr-only buttons are `button`; RunAttachmentCard is a
     * next/link, which is an `a`. A control added to the `above` slot later is excluded by one of
     * the generic clauses rather than by a later bug report. */
    for (const selector of ['a', 'button', '[role="button"]', '[role="link"]']) {
      expect(BUBBLE_INTERACTIVE_SELECTOR.split(',')).toContain(selector)
    }
  })
})
```

**Impact:** ~20 new cases. `target()` and `ID` at :21-34 are reused, unchanged. Note that the
long `decideMessageActionSwipe(...)` call inside the disjointness test will be re-wrapped by
Prettier at printWidth 100 — run `npm run format` or accept its wrapping rather than fighting it.

---

### Step 4: the opener

**File:** `components/nina/MessageBubble.tsx`

Four edits. Nothing else in the file moves, and both existing swipe checks keep every line they
have today.

#### 4a — the header section

Insert after :74 (the blank line following "…nothing here changes the page's scroll height
mid-decision.") and before the `── WHY THESE TWO FILLS…` rule at :75:

```
 * ── R4: THE TAP, AND WHY THIS FILE'S OWN REJECTION OF ONE IS ANSWERED AND NOT OVERRULED ──────
 * Tap a bubble — either side, finger or mouse — to edit or delete it. The capability has shipped
 * since `75a9c34`; the openers had not. A left swipe is invisible until you find it and a mouse
 * cannot perform one at all, so on a desktop pointer this screen had NO opener, and the user's
 * words are "user can click any bubble (his or nina's) and choose: edit , delete".
 *
 * The two paragraphs above reject a tap twice, on the grounds that it "would make the bubble
 * itself a button, which breaks text selection just as thoroughly" as a long press. That objection
 * is answered rather than overruled, and this is the list of answers:
 *
 *   - **Nothing becomes a `<button>`.** It could not: the bubble CONTAINS buttons (the photo grid,
 *     the quote stub, the two `sr-only` ones) and a nested interactive element is invalid markup
 *     and an AT regression. Nor does the body get `role="button"` — that would announce the whole
 *     message as a control, swallow its text as the control's name, and demand a `tabIndex` and an
 *     Enter/Space handler, i.e. a THIRD tab stop per message on a screen that already argued
 *     carefully for two. The body gains one `data-` attribute and three pointer handlers. No
 *     `role`, no `tabIndex`, no `aria-*`, no `cursor-pointer` (an I-beam over selectable prose is
 *     telling the truth), no `select-none`, and no `preventDefault()` anywhere.
 *   - **The selection gesture wins.** `decideMessageActionTap` refuses whenever a non-collapsed
 *     selection exists at either end of the interaction, so a drag-select, a double-click and iOS's
 *     long-press callout all keep working, and the click that DISMISSES a selection is refused too
 *     because the sample is taken at the press, before the browser collapses it.
 *   - **The keyboard and VoiceOver path does not move.** The `sr-only focus:not-sr-only` button
 *     below is still the AT opener, unchanged, and it is still the answer to "a gesture is
 *     invisible to a screen reader". A pointer affordance with no ARIA is exactly what the swipe
 *     already is.
 *
 * TWO INPUT PATHS, AND THEY CANNOT DOUBLE-FIRE. Touch is decided in `onTouchEnd`, third, after the
 * reply check and the actions-swipe check — see the comment on `start`. The mouse is decided in
 * `onPointerUp` on the bubble's own `<div>`, FILTERED TO `event.pointerType === 'mouse'`. There is
 * deliberately no `onClick` on the bubble body at all, which is what makes mobile Safari's
 * synthetic post-`touchend` click a non-event: it has nothing to hit. Filtering on `pointerType`
 * rather than remembering "the last interaction was a touch" is the other half of that choice —
 * the flag is mutable state with a lifetime spanning events, and on a touchscreen laptop it says
 * "touch" while the runner reaches for the trackpad. `'pen'` is routed to the touch path with
 * `'touch'`, on purpose: iPadOS dispatches Apple Pencil as touch events as well, so claiming it
 * here would be the one real double-fire.
 *
 * The tap is measured from the bubble's own `<div>` and not from the `<li>`, because the `<li>` is
 * a full-width flex row and the blank paper beside a bubble is not the bubble. The `<li>` keeps its
 * hit area exactly as it is — invariant 6 — so the touch path answers the same question with
 * `closest(BUBBLE_BODY_SELECTOR)` instead.
```

#### 4b — the import

Replace :7:

```ts
import {
  BUBBLE_BODY_SELECTOR,
  BUBBLE_INTERACTIVE_SELECTOR,
  decideMessageActionSwipe,
  decideMessageActionTap,
} from '@/lib/nina/edit'
```

#### 4c — two module helpers

Insert immediately above `export function MessageBubble({` (:117), after the header comment block:

```ts
/**
 * Is there a live text selection right now? Sampled at both ends of an interaction and folded into
 * one boolean for `decideMessageActionTap` — see `MessageActionTapGesture.textSelected` for why
 * both samples are needed.
 *
 * `toString().length > 0` as well as `!isCollapsed`, because a range that spans an element boundary
 * without covering a character reports as non-collapsed and is not a selection anybody made.
 */
function hasTextSelection(): boolean {
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed) return false
  return selection.toString().length > 0
}

/**
 * Does the element a press landed on sit inside something matching `selector`?
 *
 * `closest()` needs an `Element` and a React event's `target` is typed `EventTarget`; a press can
 * also land on a text node, whose `parentElement` is the element we want. Anything else answers
 * false rather than throwing — a bubble must not break because a gesture reported something odd.
 */
function closestMatches(node: EventTarget | null, selector: string): boolean {
  if (node instanceof Element) return node.closest(selector) !== null
  if (node instanceof Node) return node.parentElement?.closest(selector) != null
  return false
}
```

#### 4d — the refs and the handlers

Replace the block at :172-231 (the `start` ref comment through the end of `onTouchEnd`) with this.
The `decideReplySwipe` call and its early return are **identical to the current file**; the
`decideMessageActionSwipe` call and its `startX` comment are **identical to the current file**; the
only additions are the three booleans recorded at `touchstart`, the third check at the end of
`onTouchEnd`, the `press` ref, and the three pointer handlers.

```tsx
  /*
   * The gesture, measured in the component and decided in `lib/`. `touches` is the MAXIMUM seen
   * during the drag and not the count at `touchend`, because a pinch that starts with one finger
   * down must still lose — the same reason `PhotoViewer` tracks it that way. A ref and not state:
   * a drag in progress must not re-render 200 bubbles.
   *
   * ONE `touchend`, THREE decisions (R8, then R4). Reply is consulted first and returns; the
   * action swipe second; the TAP LAST, so a tap is only what neither swipe claimed. They cannot
   * collide on the numbers either — reply needs `dx > +44`, the swipe needs `dx < -44` and the tap
   * needs `|dx| <= 10` — but the ordering is written out anyway rather than left to the arithmetic,
   * so that invariant 6 ("the reply swipe is not re-litigated") is visible in the control flow and
   * not merely true.
   *
   * `onBody`, `onInteractive` and `selected` are sampled at `touchstart` and not at `touchend`, all
   * three for the same kind of reason: where a press landed is a fact about the START of a gesture,
   * and a live selection is destroyed by the press itself.
   */
  const start = useRef<{
    x: number
    y: number
    touches: number
    onBody: boolean
    onInteractive: boolean
    selected: boolean
  } | null>(null)

  /**
   * The mouse's own press, kept apart from the touch one because the two paths are decided in
   * different handlers on different elements and must never read each other's coordinates.
   *
   * `id` is `event.pointerId`, and it is checked at release: a `pointerup` on this bubble can
   * belong to a press that began on another one, and pairing the release with an unrelated start
   * coordinate is how a drag would be mistaken for a tap.
   */
  const press = useRef<{
    id: number
    x: number
    y: number
    onInteractive: boolean
    selected: boolean
  } | null>(null)

  function onTouchStart(event: React.TouchEvent<HTMLLIElement>) {
    const touch = event.touches[0]
    if (touch === undefined) return
    start.current = {
      x: touch.clientX,
      y: touch.clientY,
      touches: event.touches.length,
      onBody: closestMatches(event.target, BUBBLE_BODY_SELECTOR),
      onInteractive: closestMatches(event.target, BUBBLE_INTERACTIVE_SELECTOR),
      selected: hasTextSelection(),
    }
  }

  function onTouchMove(event: React.TouchEvent<HTMLLIElement>) {
    const from = start.current
    if (from === null) return
    from.touches = Math.max(from.touches, event.touches.length)
  }

  function onTouchEnd(event: React.TouchEvent<HTMLLIElement>) {
    const from = start.current
    start.current = null
    if (from === null) return
    if (onReply === undefined && onRequestActions === undefined) return
    const touch = event.changedTouches[0]
    if (touch === undefined) return

    const dx = touch.clientX - from.x
    const dy = touch.clientY - from.y
    const zoomScale = window.visualViewport?.scale ?? 1

    if (onReply !== undefined) {
      const reply = decideReplySwipe({ dx, dy, touches: from.touches, zoomScale })
      if (reply === 'reply') {
        onReply(message)
        return
      }
    }

    if (onRequestActions === undefined) return
    const actions = decideMessageActionSwipe({
      dx,
      dy,
      touches: from.touches,
      zoomScale,
      /* Where the drag BEGAN. The edge guard is about the start, not the end — a drag that
       * finishes in the middle of the screen but began under Safari's forward-navigation zone is
       * the case it exists for. */
      startX: from.x,
      viewportWidth: window.innerWidth,
    })
    if (actions === 'actions') {
      onRequestActions(message)
      return
    }

    /*
     * THIRD (R4), and only for a touch neither swipe claimed. `textSelected` is the OR of both
     * samples: one at the press, which is the only moment a selection about to be dismissed is
     * still observable, and one now, which catches a short drag-select and iOS's long-press
     * callout. A refusal here is silent by design — see `decideMessageActionTap`'s rule 4.
     */
    const tap = decideMessageActionTap(
      { id: message.id, confirmed: message.state === 'sent' },
      {
        dx,
        dy,
        touches: from.touches,
        zoomScale,
        startedOnBody: from.onBody,
        startedOnInteractive: from.onInteractive,
        textSelected: from.selected || hasTextSelection(),
      },
    )
    if (tap === 'actions') onRequestActions(message)
  }

  /*
   * The mouse path (R4). Bound to the bubble's own `<div>`, filtered to `pointerType === 'mouse'`,
   * and with no `onClick` anywhere near it — see the header for why those three facts are what stop
   * a touch tap from opening the sheet twice.
   */
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      onInteractive: closestMatches(event.target, BUBBLE_INTERACTIVE_SELECTOR),
      selected: hasTextSelection(),
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const from = press.current
    press.current = null
    if (from === null || from.id !== event.pointerId) return
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    if (onRequestActions === undefined) return

    const tap = decideMessageActionTap(
      { id: message.id, confirmed: message.state === 'sent' },
      {
        dx: event.clientX - from.x,
        dy: event.clientY - from.y,
        /* A mouse is one pointer. `startedOnBody` is answered by WHERE THIS HANDLER IS BOUND — the
         * bubble's own `<div>` — rather than by a `closest()` call that could only ever say true. */
        touches: 1,
        zoomScale: window.visualViewport?.scale ?? 1,
        startedOnBody: true,
        startedOnInteractive: from.onInteractive,
        textSelected: from.selected || hasTextSelection(),
      },
    )
    if (tap === 'actions') onRequestActions(message)
  }

  /*
   * A press that leaves the bubble has stopped being a candidate tap, and dropping it here is what
   * stops a stale start coordinate from ever pairing with a later release on this same bubble.
   * `pointerleave` does not fire when the pointer moves onto a descendant, so a press that travels
   * from the text onto a photograph is unaffected.
   */
  function onPointerLeave() {
    press.current = null
  }
```

#### 4e — the JSX

The `<li>` at :234-246 is **unchanged**. On the inner `<div>` (:247), add four attributes above
`className` — the `data-` attribute and the three handlers:

```tsx
      <div
        /* The bubble's prose, named for `BUBBLE_BODY_SELECTOR` (R4). The touch path asks
           `closest()` for it because its handlers are on the full-width `<li>`; the mouse path gets
           the answer from the DOM by being bound here. No `role`, no `tabIndex`, no `aria-*` — see
           the header. */
        data-nina-bubble-body=""
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        className={cn(
          'max-w-[85%] px-4 py-2.5 text-[15px] leading-[1.5] font-medium break-words whitespace-pre-wrap',
          mine
            ? 'rounded-card rounded-br-chip bg-ink text-card'
            : 'rounded-card rounded-bl-chip bg-card text-ink shadow-card',
          // Two quiet states, both of which leave the text readable. An optimistic row is dimmed
          // while it is unconfirmed; a row whose send threw keeps a red hairline so the runner can
          // see which line to try again, without an icon, a badge or a retry button.
          message.state === 'sending' && 'opacity-60',
          message.state === 'failed' && 'ring-1 ring-red',
          /*
           * The landing tint (R12: "clicking … will automatically scroll to that message"; a
           * scroll that does not say WHICH message it landed on has done half the job). A colour
           * transition rather than a keyframe — see the header. `ring` rather than a background
           * swap so the bubble's own fill, and therefore its text contrast, never moves.
           */
          'transition-shadow duration-300',
          flash && 'ring-2 ring-accent',
        )}
      >
```

Everything from `{quote != null && (` (:268) to the closing `</li>` is unchanged.

**Impact:**

- A mouse click on any confirmed bubble's prose opens the shipped sheet. A finger tap does the
  same. Nothing else on the screen changes behaviour.
- `ChatScreen` needs no edit. `handleRequestActions` re-runs `canActOnMessage` on the full
  `EditTarget` it builds; because the tap already passed the same gate on the same two fields, that
  re-check cannot fail and the `edit-unavailable` notice cannot appear from a tap. **The one line I
  considered adding there was a "the tap was silent" branch, and it is not needed: the silence is
  produced by not calling `onRequestActions` at all.** Zero lines of `ChatScreen.tsx` change, which
  leaves the file entirely to phase 4.
- `NinaJobDetail`/read-only surfaces that render bubbles without `onRequestActions` are unaffected:
  every path returns early when the prop is absent, exactly as the swipe does.

---

## Verification

**Build:** `npm run lint` and `npm run typecheck` (from the worktree root;
`/home/miftah/.worktrees/run-insights/nina-photo-refs-and-bubble-actions` already has `.env.local`
and `node_modules`, which `lib/env.ts` needs before any of these run).

**Tests:** `npx vitest run lib/nina/edit.test.ts` for the table, then `npx vitest run` for the
whole suite — the widened `canActOnMessage` signature touches a shared module and the full run is
what proves nothing else moved.

**Format:** `npx prettier --check lib/nina/edit.ts lib/nina/edit.test.ts components/nina/MessageBubble.tsx`
(printWidth 100, no semicolons, single quotes — `npm run format` fixes wrapping).

**Manual check.** `PORT=3100 npm run dev` — not 3000, which on this machine is habitually held by
another process that 302s everything to `/login`. Then at `/nina`:

*Mouse:*
1. click the prose of one of his bubbles -> the sheet opens on "Message" with Edit/Delete;
2. click one of hers -> same sheet, "Nina's message" in both labels;
3. click a photograph in a bubble -> the photo viewer, NOT the sheet;
4. click a quote stub -> it scrolls and flashes, NOT the sheet;
5. click a run attachment card -> navigates to `/r/[id]`, NOT the sheet;
6. drag across a bubble's text to select it -> no sheet, selection intact;
7. click once more inside that bubble to dismiss the selection -> no sheet (this is the
   sample-at-press rule); click again -> the sheet;
8. click the blank paper beside a bubble -> nothing;
9. right-click a bubble -> the browser's own menu, no sheet;
10. send a message and click it while it is still dimmed -> nothing at all, and **no notice**.

*Touch* (DevTools device emulation dispatches `pointerType: 'touch'` plus touch events, so it
exercises the touch path and not the mouse one):
11. tap a bubble -> the sheet;
12. swipe right on a bubble -> the composer arms a reply, unchanged;
13. swipe left on a bubble -> the sheet, unchanged;
14. swipe left starting within ~24 px of the right edge -> nothing, unchanged;
15. tap the blank paper beside a bubble -> nothing;
16. tap a photograph -> the viewer.

*Keyboard:* Tab through a bubble -> "Reply to this message" then "Edit or delete this message"
appear in that order and both still work. **Exactly two stops per message**, as before.

**Exit criteria:** a tap or click on the body of any bubble — his or hers — opens the shipped sheet;
a tap on a photo still opens the viewer, a tap on a quote stub still jumps, a tap on a run card
still navigates; a swipe still replies and still opens the sheet; a tap on blank paper or on an
optimistic (`sending`) bubble opens nothing and shows no notice; selecting text in a bubble is
unaffected; `npm run lint`, `npm run typecheck` and `npx vitest run` are all green.

---

## Handoffs

- **Phase 4 (R5, Resend) — RECONCILED, and the file-sharing rules below are now binding on both
  sides.** It owns `MessageActionsSheet.tsx`, `ChatScreen.tsx` and `lib/nina/actions.ts`; this
  phase touches none of the three, and phase 4's plan now records that it is their sole owner.
  What phase 4 builds on is the contract above — in particular that its Resend item needs **no new
  opener**, because every tap and every swipe now reaches the same `onRequestActions` ->
  `handleRequestActions` -> `acting` path.

  The two files both phases open are `lib/nina/edit.ts` and `lib/nina/edit.test.ts`, and phase 4's
  plan has been edited to match this phase's post-state:
  - **`canResendMessage` is appended at the END of `lib/nina/edit.ts`, after the `── the tap ──`
    block** — this phase's request, now written into phase 4's Step 1. Its draft put it at `:109`,
    two lines below the `canActOnMessage` signature this phase rewrites at `:106`, which would
    have been a hand-resolved merge.
  - **Its `describe('canResendMessage', …)` is appended at the END of `lib/nina/edit.test.ts`**,
    after the `decideMessageActionTap` describe this phase appends. Its draft inserted at `:73`,
    just after the `canActOnMessage` describe's closing `})` — but this phase adds a case *inside*
    that describe, so `:73` moves.
  - **Phase 4 quotes this phase's widened `./edit` import block**, not `origin/main`'s, and adds
    `canResendMessage` to it. Its draft quoted the pre-widening block, which would have reverted
    five of this phase's imports.
  - `canResendMessage` keeps taking `EditTarget` (it reads `.mine`); the widened
    `canActOnMessage(target: ActionableMessage)` accepts that structurally, so nothing about this
    phase's Step 1 constrains it. `ActionableMessage` is available to phase 4 if a two-field shape
    is ever enough.
- **A desktop hover-revealed action affordance.** Slack and Telegram put message actions behind a
  hover toolbar precisely so a single click stays free. R4 says "click", so a click is what shipped
  — but a hover chevron is the natural follow-up if the first click of a **double-click** proves
  annoying in practice (see Risks). Not this phase: no requirement asks for it and it would be new
  chrome on a reading surface this app has argued hard to keep empty.
- **A swipe in the blank paper beside a bubble still opens that bubble's sheet.** Pre-existing, and
  left exactly as it is: narrowing it means changing the `<li>`'s hit area, which invariant 6
  forbids for the reply swipe. Only the TAP is scoped to the bubble body.
- **A jsdom/rendered-scenario test of the two handlers.** Out of scope by design, not by omission:
  `vitest.config.ts` is `environment: 'node'` and `lib/nina/edit.ts`'s own header argues that a
  rendered test "would prove one gesture" where the table "proves the rules". Changing the test
  environment is a repo-wide decision and belongs to no phase in this set.
- **`lib/nina/reply.ts`** stays unedited, as its own header guarantees. This phase imports
  `REPLY_SWIPE_MIN_DISTANCE` only inside the test, which already imported it.

---

## Rollback

`git revert` the single commit. Nothing else is needed and nothing is left behind:

- no migration, no column, no server action, no row written (invariant 8, and no DDL anywhere in
  this phase);
- the widened `canActOnMessage` signature reverts with it, and its one caller was never changed;
- the `data-nina-bubble-body` attribute is inert markup that goes with the revert;
- the swipe openers and the `sr-only` focus button were never touched, so after a revert the sheet
  still has both of the openers it shipped with — the screen returns to exactly its pre-phase state
  and R4 is simply un-served again.

If phase 4 has already landed on top, revert only this commit: phase 4 adds an item to a sheet whose
other two openers still work, so it degrades to "Resend is reachable by a swipe" rather than
breaking.
