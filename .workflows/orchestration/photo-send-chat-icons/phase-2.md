# Phase 2: Keyboard channel: about strip box fix + rename re-assert

**Plan set:** `PHOTO_SEND_CHAT_ICONS_PLAN.md`
**Analysis:** `20260909-112330-P7K2_code_analyzer.md`
**Satisfies:** R3 — "mengedit nama session … keyboard mendorong text field ke atas, membuat text field tidak terlihat di layar"; the photo-question field is the other member of the class
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `components/nina` + `lib/nina`

---

## Goal

`/nina/about`'s photo-question strip gains the same keyboard protection the composer and the
sidebar panel already have — a measured `--nina-kb-overlap` on `:root`, ending the strip's box at
the keyboard's top edge — and the sidebar's rename field stops relying on a fixed-delay schedule
alone: the panel now re-asserts the focused field when its box *actually changes*, which is the
moment the schedule misses. The one `visualViewport` subscription in the app moves out of
`ChatScreen` into a shared component both routes render, so "one publisher implementation" is a
fact of the tree and not a convention.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**
- `ChatScreen`'s two keyboard effects — the `visualViewport` subscription
  (`components/nina/ChatScreen.tsx:589-609`) and the `:root` broadcast
  (`components/nina/ChatScreen.tsx:622-632`). *Behavior moves into `KeyboardOverlapPublisher`;
  nothing is lost.* `ChatScreen`'s import of `keyboardOverlapPx` and `NINA_KEYBOARD_OVERLAP_VAR`
  from `@/lib/nina/chatview` goes with them.
- `NinaAboutScreen`'s strip class `pb-[calc(1rem+var(--safe-bottom))]`
  (`components/nina/NinaAboutScreen.tsx:350` as Phase 1 leaves it — Phase 1 keeps the container
  tag byte-identical, but its state rename and handler rewrite shift the line; its own steps cite
  the pre-Phase-1 `:339`) — replaced by an inline `paddingBottom` from `attachStripPadBottomCss`.
  Nothing else in that class string changes.
- The inline `{ block: 'nearest', behavior: 'instant' }` literals inside `NinaSidebar`'s reassert
  effect (`components/nina/NinaSidebar.tsx:421`) — replaced by
  `KEYBOARD_REASSERT_SCROLL_OPTIONS`, and the hand-spelled tag guard (`:407-413`) by
  `isKeyboardTextField`. Same truth table; no behavior change.

**Renames:** none.

**Creates:**
- `components/nina/KeyboardOverlapPublisher.tsx` — `'use client'`, named export
  `KeyboardOverlapPublisher`, props `{ onOverlap?: (overlapPx: number) => void }`, renders `null`.
  Owns the app's ONE `visualViewport` subscription and the `NINA_KEYBOARD_OVERLAP_VAR` write/remove
  on `document.documentElement`.
- `lib/nina/chatview.ts` additions: `KeyboardFieldLike`, `isKeyboardTextField`,
  `KEYBOARD_REASSERT_SCROLL_OPTIONS`, `PanelBoxSize`, `BoxReassertVerdict`, `planBoxReassert`,
  `attachStripPadBottomCss`. All pure; no DOM types in any signature (the file header's rule).
- `lib/nina/chatview.test.ts` gains five describes (co-located, per `vitest.config.ts`'s
  `lib/**/*.test.ts` include and this module's existing suite — no second file for one module).

**Signature changes:** none on any existing exported symbol.

**Requires (from Phase 1):**
- The attach strip's outermost element is still the container
  `fixed inset-x-0 bottom-0 z-70 flex flex-col gap-2 bg-ink/95 px-4 …` with the control rows
  INSIDE it, and Phase 1 has not given that container its own `bottom` inline style, its own
  keyboard padding gate, or any `visualViewport`/`--nina-kb-overlap` machinery. Phase 1 owns the
  strip's CHILDREN; this phase owns only the container tag and what is mounted beside it.
- Phase 1 has not renamed/moved `NinaAboutScreen` (the component) or changed its props — verified:
  its `attaching` -> `sending` rename is component-private state, which Step 4b below quotes as
  Phase 1 leaves it.

**Leaves alone (owned by others):** the strip's control rows' logic and markup (Phase 1);
`components/ui/PhotoViewer.tsx`; the composer and `composerBottomCss`/`composerPadBottomCss`
(read as precedent only); `components/nina/SessionRow.tsx` and every session action;
`sendNinaMessage` / `attachNinaPhotoToChat`; `app/nina/about/page.tsx` (the server page is
untouched — the publisher mounts inside the client screen).

**Cross-phase invariant this phase upholds:** exactly one publisher implementation, and never two
concurrent `visualViewport` subscriptions on one screen. `/nina` (via `ChatScreen`) and
`/nina/about` (via `NinaAboutScreen`) are different routes and never mounted together.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/chatview.ts` | modify | six new pure exports after `KEYBOARD_REASSERT_DELAYS_MS` (`:275`) and after `composerPadBottomCss` (`:374`) |
| `components/nina/KeyboardOverlapPublisher.tsx` | create | the shared publisher: subscription + `:root` broadcast + optional numeric mirror |
| `components/nina/ChatScreen.tsx` | modify | drop `keyboardOverlapPx`/`NINA_KEYBOARD_OVERLAP_VAR` imports; delete the two effects at `:583-633`; render the publisher; comment the `overlap` state at `:338` |
| `components/nina/NinaAboutScreen.tsx` | modify | import the publisher + two chatview symbols; one `useState` mirror; mount the publisher in the open-viewer fragment (post-Phase-1 `:335-337`); the strip container tag (post-Phase-1 `:350`) gains `bottom` + `paddingBottom` inline styles and loses the `pb-[…]` class |
| `components/nina/NinaSidebar.tsx` | modify | import block (`:8`); the `open`-keyed effect (`:357-442`) gains the shared guard/constants and a `ResizeObserver` trigger; cleanup disconnects it. Deps stay `[open]` ALONE |
| `lib/nina/chatview.test.ts` | modify | import block (`:3-14`) widens; five describes appended after `composerPadBottomCss` (`:353`) |

## Implementation Steps

### Step 1: The pure rules in `lib/nina/chatview.ts`
**File:** `lib/nina/chatview.ts:275` (after `KEYBOARD_REASSERT_DELAYS_MS`) and `lib/nina/chatview.ts:374` (after `composerPadBottomCss`)
**Change:** add the reassert decision rules (which target qualifies, when a box change counts, the
scroll args) and the strip's padding gate. No imports needed; no existing symbol touched.

Insert after `KEYBOARD_REASSERT_DELAYS_MS` (line 275, before the `composerBottomCss` section
comment):

```ts
/**
 * The shape of an element the panel's reassert is willing to assert on — the DOM's own `tagName`
 * and `isContentEditable`, and nothing else.
 *
 * Deliberately not `HTMLElement`: this file's header rule is no DOM types in a signature, and
 * these two fields are all the decision reads. `HTMLElement` satisfies the interface
 * structurally, so a caller passes the element it already holds with no cast and no wrapper, and
 * a test in `environment: 'node'` passes a plain object — which is the whole reason the rule
 * lives here and not in the component (invariant 5; there is no jsdom to render a field into).
 */
export interface KeyboardFieldLike {
  readonly tagName: string
  readonly isContentEditable: boolean
}

/**
 * Whether an element is a text field the software keyboard could open for — the one guard both of
 * `NinaSidebar`'s reassert triggers share.
 *
 * `INPUT` / `TEXTAREA` / `contenteditable`, and nothing else — the exact truth table the panel's
 * `focusin` listener has carried since the search-field incident, lifted here so the second
 * trigger (the box-change one, same phase) cannot grow a second, drifting copy. The panel itself
 * takes focus on open (`tabIndex={-1}`) and its buttons take focus on tap, and neither has text a
 * keyboard could hide; asserting on them would scroll the list under a reader who is only moving
 * through it.
 */
export function isKeyboardTextField(field: KeyboardFieldLike | null): boolean {
  if (field === null) return false
  return field.tagName === 'INPUT' || field.tagName === 'TEXTAREA' || field.isContentEditable
}

/**
 * The one `scrollIntoView` call the panel's reassert makes, as data.
 *
 * `block: 'nearest'` walks every scrollable ancestor (the panel's own `overflow-y-auto` deck and
 * the document) and corrects whichever one Safari's focus reveal scrolled — and computes zero
 * scroll on an already-visible field, so an assert with nothing to correct costs nothing.
 * `behavior: 'instant'`, never `smooth`: the layout has already moved under the runner and a
 * 300 ms chase reads as a glitch — `decideAutoScroll`'s 'viewport' rule, and no new motion.
 *
 * A constant rather than a literal at two call sites so the second trigger cannot quietly grow a
 * `smooth`.
 */
export const KEYBOARD_REASSERT_SCROLL_OPTIONS = {
  block: 'nearest',
  behavior: 'instant',
} as const

/** The panel's box, as the `ResizeObserver` reports it: the content rect's two dimensions. */
export interface PanelBoxSize {
  readonly width: number
  readonly height: number
}

/** What a `ResizeObserver` delivery on the panel calls for. See `planBoxReassert`. */
export type BoxReassertVerdict = 'baseline' | 'skip' | 'assert'

/**
 * Whether a `ResizeObserver` delivery on the sidebar panel means "the box actually changed —
 * assert the focused field now". The when-half of the reassert, next to
 * `KEYBOARD_REASSERT_DELAYS_MS`' clock-half.
 *
 *   - `'baseline'` — the first delivery, which the spec fires on `observe()` with the size the
 *     panel already had. Nothing changed. Asserting here would scroll the list on every open,
 *     before any field exists to protect.
 *   - `'skip'` — a delivery whose rect is the one before it. The observer can fire without the
 *     panel's box having moved; an assert on that is work with nothing to correct.
 *   - `'assert'` — a real change. This is the moment the clock-half misses: Safari's focus reveal
 *     scrolls the deck, the `bottom` var shrinks the panel one React commit later, and if the
 *     last scheduled tick fired before the shrink landed, the focused field rides out through the
 *     container's top edge — the residue the rename-field report survives. The box ARRIVING at
 *     its new size is the one observable signal that the shrink landed, and it needs no second
 *     `visualViewport` subscription and no new dependency on the `open`-keyed effect.
 *
 * Exact `===` on both numbers, no rounding: an assert is idempotent (`'nearest'` on a visible
 * field computes zero scroll), so over-firing is cheap and under-firing — skipping a real change
 * — is the one thing this rule must not do.
 */
export function planBoxReassert(
  previous: PanelBoxSize | null,
  next: PanelBoxSize,
): BoxReassertVerdict {
  if (previous === null) return 'baseline'
  if (previous.width === next.width && previous.height === next.height) return 'skip'
  return 'assert'
}
```

Insert after `composerPadBottomCss` (line 374, at the end of the file):

```ts
/**
 * The photo-question strip's own `padding-bottom`, as a CSS length — `composerPadBottomCss`'s
 * exact gate, on the one fixed bar that is not the composer's: `/nina/about`'s attach strip
 * (`components/nina/NinaAboutScreen.tsx`), which ends at the keyboard's top edge through
 * `NINA_KEYBOARD_OVERLAP_VAR` the same way the panel does.
 *
 * The strip's resting floor is what its old `pb-[calc(1rem+var(--safe-bottom))]` class spelled:
 * 1rem of glass under the send row plus the phone's home-indicator inset. With the keyboard up
 * the whole floor goes to `'0px'`, on the composer's recorded reasoning: the keyboard's top edge
 * is the floor, the inset is behind it, and padding by either would lift the input row off the
 * keys — the gap the owner reported as "ada gap diantara chat query field dengan bagian bawah",
 * one route over. The strip's send row keeps its own `py-2`-equivalent spacing inside the row, so
 * the flush look is the composer's flush look and not a cramped one.
 *
 * Zeroing the 1rem too (not just the inset term) is the deliberate reading of "the same gate":
 * `composerPadBottomCss` zeroes its WHOLE floor when the overlap is positive, keeping only the
 * row's own padding, and a kept 1rem would paint a dead 16 px band of `bg-ink/95` between the
 * send control and the keys — the lifted look, in miniature.
 *
 * `'0px'` rather than `'0'`: a length going into `style.paddingBottom`, on
 * `composerPadBottomCss`'s recorded reason. Takes the overlap and not the var, for the reason the
 * composer takes it: the strip's consumer mirrors the publisher's number into state, and a
 * CSS-computable "is the overlap positive" gate does not exist without a second `:root` variable,
 * which would be a second channel to keep honest.
 */
export function attachStripPadBottomCss(overlapPx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return '0px'
  return 'calc(1rem + var(--safe-bottom))'
}
```

**Impact:** additive only; every existing symbol and test untouched. `tests/tabbar.geometry.test.ts`
still passes.

### Step 2: The shared publisher — `components/nina/KeyboardOverlapPublisher.tsx`
**File:** `components/nina/KeyboardOverlapPublisher.tsx` (new file)
**Change:** the whole file, below. The two effects are `ChatScreen.tsx:589-609` and `:622-632`
moved verbatim, with the one addition a shared component needs — the `onOverlap` mirror, read
through a latest-ref so an inline caller arrow cannot strand the subscription on a stale closure.

```tsx
'use client'

import * as React from 'react'

import { keyboardOverlapPx, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'

/**
 * The ONE `visualViewport` subscription in the app, and the keyboard's ONE broadcast.
 *
 * ── WHY A COMPONENT AND NOT A HOOK ─────────────────────────────────────────────────────────────
 * The consumers are two routes, not two components of one tree: `ChatScreen` on `/nina` and
 * `NinaAboutScreen` on `/nina/about`. A hook would have to be called by both anyway; a component
 * that renders `null` can be dropped into a fragment beside the thing it measures for, with no
 * ref-forwarding and no return-value plumbing, and it is grep-visible — `rg KeyboardOverlapPublisher`
 * answers "who measures the keyboard" for the next invariant-4 argument, where a call inside a
 * hook's body does not.
 *
 * ── THE INVARIANT THIS COMPONENT IS ────────────────────────────────────────────────────────────
 * No second concurrent `visualViewport` subscription on one screen (`ChatChrome`'s docstring
 * records the rule). The routes that render this are `/nina` and `/nina/about` — different routes,
 * never mounted together — and within a route this is mounted once. `NINA_KEYBOARD_OVERLAP_VAR`'s
 * docstring in `lib/nina/chatview.ts` carries the broadcast's own reasoning: a `:root` custom
 * property because the panel that reads it is a SIBLING, not a descendant, and `NINA_BAR_VISIBLE_VAR`
 * is the precedent for exactly that gap.
 *
 * ── THE SEMANTICS, MOVED UNCHANGED FROM `ChatScreen` ───────────────────────────────────────────
 * `keyboardOverlapPx` filters the URL bar and pinch-zoom (`KEYBOARD_MIN_PX = 120`, and `scale > 1`
 * is "no keyboard"). The subscription is EMPTY-DEPS, so a keystroke never re-subscribes — the same
 * rule the sidebar panel's `open`-keyed effect enforces for the same reason. The var is REMOVED,
 * not zeroed, at zero and on unmount: the resting geometry (`inset-0` / `bottom-0`) is what an
 * unread var falls back to, and nothing survives navigating off the route. On Android
 * `keyboardOverlapPx` returns 0 always — the layout viewport really does shrink there — so the var
 * is never set and no consumer ever moves.
 *
 * ── `onOverlap` ────────────────────────────────────────────────────────────────────────────────
 * A consumer that needs the NUMBER as a number, and not the var — `ChatScreen`'s composer
 * geometry, `NinaAboutScreen`'s padding gate — passes a callback and mirrors the value into its
 * own state. Called synchronously inside the same `sync` that sets the internal state, so the
 * mirror is never a frame behind the var; `setState` with an unchanged number bails out, so a
 * `scroll` event that does not move the measurement costs the consumer nothing. Read through a
 * latest-ref: the subscription is empty-deps and must never re-subscribe because a render minted a
 * new inline arrow.
 */
export function KeyboardOverlapPublisher({
  onOverlap,
}: {
  onOverlap?: (overlapPx: number) => void
}) {
  const [overlap, setOverlap] = React.useState(0)

  /** The latest `onOverlap`, so the empty-deps subscription below cannot capture a stale one. */
  const onOverlapRef = React.useRef(onOverlap)
  React.useEffect(() => {
    onOverlapRef.current = onOverlap
  })

  /*
   * The measurement. Empty deps: `visualViewport` does not change identity, and a keystroke in
   * any consumer must never re-subscribe — `NinaSidebar`'s keyed-on-`open`-ALONE rule, for the
   * same keyboard-drop reason.
   */
  React.useEffect(() => {
    const vv = window.visualViewport
    if (vv == null) return
    const sync = () => {
      const next = keyboardOverlapPx({
        innerHeight: window.innerHeight,
        visualHeight: vv.height,
        visualOffsetTop: vv.offsetTop,
        scale: vv.scale,
      })
      setOverlap(next)
      onOverlapRef.current?.(next)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  /*
   * The broadcast. Removed — not zeroed — whenever the overlap is zero, and on unmount, so the
   * resting geometry is what an unread var falls back to and nothing leaks onto another route.
   */
  React.useEffect(() => {
    const root = document.documentElement
    if (overlap > 0) {
      root.style.setProperty(NINA_KEYBOARD_OVERLAP_VAR, `${overlap}px`)
    } else {
      root.style.removeProperty(NINA_KEYBOARD_OVERLAP_VAR)
    }
    return () => {
      root.style.removeProperty(NINA_KEYBOARD_OVERLAP_VAR)
    }
  }, [overlap])

  /** Measures and broadcasts; paints nothing. */
  return null
}
```

**Impact:** new file only; nothing imports it yet, so the tree still builds exactly as before this
step.

### Step 3: `ChatScreen` renders the publisher instead of owning the effects
**File:** `components/nina/ChatScreen.tsx:25-30` (imports), `:338` (state comment), `:583-633` (the two effects), `:1434-1436` (JSX mount)
**Change:** three edits.

**3a. Imports** — replace lines 25-30:

```tsx
import {
  composerBottomCss,
  composerPadBottomCss,
  keyboardOverlapPx,
  NINA_KEYBOARD_OVERLAP_VAR,
} from '@/lib/nina/chatview'
```

with:

```tsx
import { composerBottomCss, composerPadBottomCss } from '@/lib/nina/chatview'
```

and add to the relative-import block (after `./Composer`, alphabetical):

```tsx
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
```

so the block reads:

```tsx
import { ChatPhotoActions } from './ChatPhotoActions'
import { Composer, type ComposerDraftImage } from './Composer'
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
import { MessageActionsSheet } from './MessageActionsSheet'
import { MessageList } from './MessageList'
import type { ChatAvatar, ChatMessage } from './types'
import { useChatScrollMark } from './useChatScroll'
```

**3b. The state at line 338** — replace:

```tsx
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
```

with:

```tsx
  const [notice, setNotice] = useState<Notice | null>(null)
  /**
   * The keyboard's overlap in px, measured by `KeyboardOverlapPublisher` below. The publisher owns
   * the subscription and the `:root` broadcast; this is a MIRROR of the number, kept because this
   * screen's own consumers want the number and not the var — `MessageList`'s bottom pad and the
   * composer's two CSS strings (`composerBottomCss` / `composerPadBottomCss`).
   */
  const [overlap, setOverlap] = useState(0)
```

**3c. The two effects** — delete lines 583-633 in full: the comment block beginning `/*\n * The iOS
keyboard. Safari does not resize…`, the `useEffect` subscription ending `}, [])`, the comment block
beginning `/*\n * The keyboard's one broadcast…`, and the `useEffect` broadcast ending
`}, [overlap])`. The deletion runs from the line after `const viewerAttachId = …` (`:580-581`) to
the line before `const sleep = (ms: number) =>` (`:634`).

**3d. The mount** — replace the head of the return (`:1434-1436`):

```tsx
  return (
    <>
      {messages.length === 0 && !showTyping ? (
```

with:

```tsx
  return (
    <>
      {/*
        The keyboard's ONE subscription and ONE broadcast, extracted from the two effects this
        component used to carry (the semantics' docstring lives on the component).
        `setOverlap` mirrors the number into this screen's state for `MessageList` and the
        composer; the `:root` var is how the sidebar panel — this component's SIBLING, rendered by
        the page beside it — reads the same measurement without a second subscription.
      */}
      <KeyboardOverlapPublisher onOverlap={setOverlap} />

      {messages.length === 0 && !showTyping ? (
```

**Impact:** behavior-identical on `/nina` — same measurement, same var, same timing (the mirror is
set in the same event tick the state used to be). The composer's
`keyboardOverlapPx={overlap}` / `bottomCss` / `padBottomCss` props are untouched.

### Step 4: `/nina/about` mounts the publisher and the strip gets the box fix
**File:** `components/nina/NinaAboutScreen.tsx:7-19` (imports), `:99-103` (state, as Phase 1
leaves it), `:335-337` (mount), `:350` (container tag) — all positions POST-Phase-1

> **Phase-1 note, for /implement:** the quotes and anchors below are taken from the tree as
> **Phase 1 leaves it**, not from the working tree at `5ccae06` this plan was first written
> against. Phase 1 renames `attaching` to `sending` with a two-line comment (+2 lines at `:100`)
> and rewrites the `attach` handler (+9 lines), so every position below the handler shifts by
> +11, and its Step 2a adds `type NinaAttachTarget` to the `albumActions` import. The hunks below
> already quote that reconciled shape — do not re-derive them from the base tree. Phase 1 owns
> the strip's CHILDREN (the notice, the question input, the icon row) and this phase owns the
> CONTAINER tag. Apply Step 4d to the container's opening tag ONLY — whatever children Phase 1
> rendered inside the strip stay exactly as Phase 1 left them. Do not paste this step's inner
> JSX over Phase 1's rows.

**4a. Imports** — the head of the file becomes (new lines marked in the surrounding block):

```tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { attachStripPadBottomCss, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'
import { NinaJobList } from './NinaJobList'
import { NinaPhotoGrid, type NinaGridCell } from './NinaPhotoGrid'
import { NinaAvatar } from './NinaAvatar'
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
import { attachNinaPhotoToChat, type NinaAttachTarget } from '@/lib/nina/albumActions'
import {
  NINA_ATTACH_MAX_CHARS,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'
import { NINA_JOBS_HREF, type NinaJobListItem } from '@/lib/nina/jobview'
```

(The two new lines are the `chatview` import after the `PhotoViewer` import, and the
`KeyboardOverlapPublisher` import before `attachNinaPhotoToChat`. The `albumActions` line is
Phase 1's — its Step 2a added `type NinaAttachTarget` there, and this phase must keep it: the
`sending` state Step 4b quotes is typed by it.)

**4b. State** — Phase 1 renamed `attaching` to `sending: NinaAttachTarget | null` and gave it a
two-line comment, so the state block is five lines (`:99-103`) and the pre-Phase-1 anchor this
plan first quoted no longer exists. Replace the block AS PHASE 1 LEAVES IT:

```tsx
  const [question, setQuestion] = React.useState('')
  /* Which send is in flight — `'recent'` or `'new'` — or `null` when neither is. One flight for
   * two controls: it names the button that shows the dots and disables the other one. */
  const [sending, setSending] = React.useState<NinaAttachTarget | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
```

with the five lines unchanged and `kbOverlap` appended after `notice`:

```tsx
  const [question, setQuestion] = React.useState('')
  /* Which send is in flight — `'recent'` or `'new'` — or `null` when neither is. One flight for
   * two controls: it names the button that shows the dots and disables the other one. */
  const [sending, setSending] = React.useState<NinaAttachTarget | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  /**
   * R3. The keyboard's overlap in px, mirrored from the publisher mounted below. The strip's
   * `bottom` reads the `:root` var and needs no state; this mirror exists only for the NUMBER the
   * padding gate wants (`attachStripPadBottomCss`) — the same division `ChatScreen` draws between
   * its `overlap` state and the var the sidebar panel reads.
   */
  const [kbOverlap, setKbOverlap] = React.useState(0)
```

**4c. The mount** — insert before `<PhotoViewer` (post-Phase-1 `:337`; Phase 1 does not touch the
fragment opening, so the anchor below still matches byte for byte):

```tsx
      {open != null && (
        <>
          <PhotoViewer
```

with:

```tsx
      {open != null && (
        <>
          {/*
            ── R3: THE KEYBOARD CHANNEL, MOUNTED SCOPED TO THE OPEN VIEWER ───────────────────────
            `ChatScreen` is not mounted on this route (`app/nina/about/page.tsx` renders this
            screen inside `AppShell` and nothing else), so nothing published
            `--nina-kb-overlap` here and the strip below had NO keyboard protection at all — the
            member of the class with strictly less than the sidebar panel, which at least had the
            var and the reassert.

            Page-level vs scoped-to-open: SCOPED, deliberately. This publisher's only reader is
            the strip, and the strip exists only while `open != null`, so a page-level mount would
            run a `visualViewport` subscription with no consumer — and would publish a var that
            nothing on this route reads while no photo is open. The cost side is nil: the
            subscriber starts before the strip can be tapped (same commit), and its unmount
            removes the var, so closing the viewer leaves nothing behind. The invariant holds by
            construction: `/nina` and `/nina/about` are different routes, never mounted together,
            so this is never a second concurrent subscription on one screen.
          */}
          <KeyboardOverlapPublisher onOverlap={setKbOverlap} />
          <PhotoViewer
```

**4d. The strip's box fix** — replace the container's opening tag at `:350` (post-Phase-1; Phase 1
left the tag's `className` byte-identical to what shipped, so the anchor below still matches):

```tsx
          <div className="fixed inset-x-0 bottom-0 z-70 flex flex-col gap-2 bg-ink/95 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
```

with:

```tsx
          {/*
            ── R3: THE BOX FIX, `NinaSidebar.tsx:514`'s EXACT PATTERN ────────────────────────────
            iOS does not shrink the layout viewport when the keyboard opens, so this strip —
            `fixed` at `bottom-0`, inside no scroll container — runs on behind the keys and
            Safari's focus reveal answers by lifting the whole fixed overlay off the top of the
            glass: the field the runner just tapped leaves through the top of the screen, which is
            the bug he reported. Ending the strip at the keyboard's MEASURED top edge puts the
            field inside the visible region — the same fix the composer ships as
            `composerBottomCss`, reached here as a `:root` custom property because the
            subscription lives in the publisher above.

            An inline style rather than a Tailwind arbitrary value, because it must beat
            `bottom-0`'s `bottom: 0` in the cascade without depending on utility sort order. The
            string is CONSTANT — it never re-renders, whatever the keyboard does; the var
            underneath it is what moves. Absent (no keyboard, Android, pre-hydration) it
            substitutes `0px`, which is exactly `bottom-0`, so the resting strip and the server's
            HTML never differ. The edge SNAPS with the keyboard — no transition on `bottom` — and
            that is kept deliberately: the strip has no `transition-all` to accidentally catch the
            property, and a lagging edge would chase the keyboard's own animation and read as a
            glitch (`decideAutoScroll`'s 'viewport' rule).

            ── WHY THE BOX ALONE IS THE WHOLE CURE HERE, AND NO REASSERT IS NEEDED ──────────────
            The sidebar needed a reassert because its field sits INSIDE an `overflow-y-auto`
            deck, and Safari's reveal scrolls THAT CONTAINER — a scrollTop no box can unscroll.
            This strip is inside no scroll container at all, the composer's distinguishing fact,
            and the composer's recorded outcome from exactly this shape was "the composer never
            lifts". The padding gate is the one refinement the box needs: with the strip's bottom
            edge on the keys, the old `1rem + var(--safe-bottom)` floor would hold the input row
            ~50 px off the keyboard — padding by a floor that is behind the keyboard, which is the
            same class of mistake `composerPadBottomCss`'s docstring records. `attachStripPadBottomCss`
            is that function's gate on this bar's own floor.
          */}
          <div
            className="fixed inset-x-0 bottom-0 z-70 flex flex-col gap-2 bg-ink/95 px-4 pt-3"
            style={{
              bottom: `var(${NINA_KEYBOARD_OVERLAP_VAR}, 0px)`,
              paddingBottom: attachStripPadBottomCss(kbOverlap),
            }}
          >
```

Everything between this opening tag and its matching `</div>` (the notice line, the question
input, the icon row — Phase 1's territory, quoted in phase-1.md's "The strip as Phase 2 must
quote it") is untouched by this phase.

**Impact:** on `/nina/about` with the keyboard up, the strip's bottom edge sits on the keyboard's
top edge and the question field stays visible; with no keyboard the rendered geometry is
byte-identical to today (the var is absent → `0px`; the padding string equals the class it
replaces). The server page is untouched.

### Step 5: The sidebar's reassert gains the box-change trigger
**File:** `components/nina/NinaSidebar.tsx:8` (import), `:357-442` (the `open`-keyed effect)
**Change:** two edits. The effect's dependency array stays `[open]` ALONE — the `Sheet.tsx` trap
documented at `:339-355` is why: a keystroke in the rename field must never tear this effect down,
and `ResizeObserver`, `planBoxReassert` and the constants are module imports, not reactive values,
so none of them becomes a dependency.

**5a. Import** — replace `:8`:

```ts
import { KEYBOARD_REASSERT_DELAYS_MS, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'
```

with:

```ts
import {
  isKeyboardTextField,
  KEYBOARD_REASSERT_DELAYS_MS,
  KEYBOARD_REASSERT_SCROLL_OPTIONS,
  NINA_KEYBOARD_OVERLAP_VAR,
  planBoxReassert,
  type PanelBoxSize,
} from '@/lib/nina/chatview'
```

**5b. The effect** — replace the whole block `:357-442` with the block below. Everything from the
`open` guard through the `focusin` arming is the existing code with its guard and scroll args
replaced by the shared rule (identical truth table); everything from the `R3` comment to
`boxObserver.observe(panel)` is new; the cleanup gains one line.

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

    /**
     * The assert itself, shared by both triggers below: qualify whatever holds focus RIGHT NOW
     * and `scrollIntoView` it. The tag guard is `isKeyboardTextField`'s — the same three-way test
     * the `focusin` listener below makes on its own target — and `KEYBOARD_REASSERT_SCROLL_OPTIONS`
     * is the same `{ block: 'nearest', behavior: 'instant' }` the schedule's ticks have always
     * used, as a constant so the second trigger cannot quietly grow a `smooth`.
     */
    const assertFocusedField = () => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return
      if (!isKeyboardTextField(active)) return
      active.scrollIntoView(KEYBOARD_REASSERT_SCROLL_OPTIONS)
    }

    const onPanelFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!isKeyboardTextField(target)) return

      for (const timer of reassertTimers) window.clearTimeout(timer)
      reassertTimers = KEYBOARD_REASSERT_DELAYS_MS.map((delay) =>
        window.setTimeout(() => {
          if (document.activeElement !== target) return
          /* `instant`, never `smooth`: the layout has already moved under the runner and a 300 ms
             chase reads as a glitch — `decideAutoScroll`'s 'viewport' rule, and no new motion. */
          target.scrollIntoView(KEYBOARD_REASSERT_SCROLL_OPTIONS)
        }, delay),
      )
    }
    panel?.addEventListener('focusin', onPanelFocusIn)

    /*
     * ── R3: THE SECOND TRIGGER — THE BOX ARRIVING, NOT THE CLOCK ────────────────────────────────
     *
     * The rename field is the report that survived the schedule above. The failure is a RACE the
     * five delays cannot win reliably: Safari's focus reveal scrolls the deck, the panel's
     * `bottom` var shrinks the box one React commit LATER (visualViewport resize → publisher
     * state → effect → style), and if the last tick fired before the shrink landed, the field
     * rides out through the container's top edge and nothing fires again for a second — by which
     * time it is off screen.
     *
     * The box ARRIVING at its new size is the one observable signal that the shrink landed, and a
     * `ResizeObserver` on the panel is how that signal is received. It is NOT a second
     * `visualViewport` subscription (invariant 4): the observer watches this panel's own box,
     * which is a layout fact about an element this effect already holds, not a viewport
     * measurement — and it lives INSIDE this same `open`-keyed effect, cleaning up with it, so
     * the `Sheet.tsx` trap is not re-sprung: no dependency is added to the array, and one
     * keystroke in the rename field still never tears anything down.
     *
     * `planBoxReassert` carries the whole when-rule — the spec fires once on `observe()` (the
     * baseline, not a change), a delivery can repeat the previous size (skip), and only a real
     * change asserts. The assert is `assertFocusedField`'s: whatever holds focus at this moment,
     * if it is a text field — the same guards as the `focusin` listener, evaluated at fire time,
     * with no armed target to go stale. On the keyboard CLOSING the box grows back, the assert
     * runs, and `nearest` on a visible field computes zero scroll — idempotent, so the closing
     * direction costs nothing and fixes the mirrored case (field scrolled out, keyboard folds)
     * for free.
     *
     * `contentRect` is the panel's whole box here: the panel carries no padding and no border
     * (`fixed inset-0 flex flex-col bg-paper outline-none`), so its content rect IS its box, and
     * the rail's `border-t` is inside a child.
     */
    let lastBox: PanelBoxSize | null = null
    const boxObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry == null) return
      const next: PanelBoxSize = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
      const verdict = planBoxReassert(lastBox, next)
      lastBox = next
      if (verdict !== 'assert') return
      assertFocusedField()
    })
    if (panel !== null) boxObserver.observe(panel)

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
      boxObserver.disconnect()
      for (const timer of reassertTimers) window.clearTimeout(timer)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])
```

**Impact:** the rename field (and the search field) is re-asserted at the moment the panel's box
actually changes, closing the race the fixed schedule lost; the schedule itself is unchanged and
still runs; no new effect dependency; `tests/nina.sidebarProvider.test.ts` is untouched and still
passes.

### Step 6: The rules' tests — appended to the module's own suite
**File:** `lib/nina/chatview.test.ts:3-14` (imports) and `lib/nina/chatview.test.ts:353` (append at end)
**Change:** two edits. The module already has a co-located suite — `keyboardOverlapPx`,
`KEYBOARD_REASSERT_DELAYS_MS` and both composer functions are tested there — so these rules join
it rather than minting a second file for one module. The existing `KEYBOARD_REASSERT_DELAYS_MS`
describes already pin the schedule; nothing about the schedule changes, so nothing is added for
it.

**6a. Imports** — replace lines 3-14:

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

with:

```ts
import {
  attachStripPadBottomCss,
  composerBottomCss,
  composerPadBottomCss,
  decideAutoScroll,
  groupIntoDays,
  isKeyboardTextField,
  isNearBottom,
  keyboardOverlapPx,
  KEYBOARD_MIN_PX,
  KEYBOARD_REASSERT_DELAYS_MS,
  KEYBOARD_REASSERT_SCROLL_OPTIONS,
  NINA_BAR_VISIBLE_VAR,
  NINA_KEYBOARD_OVERLAP_VAR,
  planBoxReassert,
  STICK_TO_BOTTOM_PX,
  type KeyboardFieldLike,
  type PanelBoxSize,
} from './chatview'
```

**6b. The new describes** — append at the end of the file, after the `composerPadBottomCss`
describe's closing `})`:

```ts
describe('isKeyboardTextField', () => {
  // The shared guard both of the panel's reassert triggers consult. The DOM behaviour it feeds —
  // `scrollIntoView` on a live field — cannot run here (`environment: 'node'`); what is asserted
  // is the whole decision, which is the part a rule can carry.

  const field = (tagName: string, isContentEditable = false): KeyboardFieldLike => ({
    tagName,
    isContentEditable,
  })

  it('takes the three keyboard-opening elements', () => {
    expect(isKeyboardTextField(field('INPUT'))).toBe(true)
    expect(isKeyboardTextField(field('TEXTAREA'))).toBe(true)
    expect(isKeyboardTextField(field('DIV', true))).toBe(true)
  })

  it('refuses everything else the panel can focus', () => {
    // The panel itself (`tabIndex={-1}`) and its buttons take focus on open/tap; asserting on
    // them would scroll the list under a reader who is only moving through it. SELECT is pinned
    // false to lock the rule to the original three-way guard it replaced, so a widening is a
    // decision about this line, not a silent one.
    expect(isKeyboardTextField(field('DIV'))).toBe(false)
    expect(isKeyboardTextField(field('BUTTON'))).toBe(false)
    expect(isKeyboardTextField(field('A'))).toBe(false)
    expect(isKeyboardTextField(field('SELECT'))).toBe(false)
  })

  it('refuses the absence of an element', () => {
    expect(isKeyboardTextField(null)).toBe(false)
  })
})

describe('planBoxReassert', () => {
  const box = (width: number, height: number): PanelBoxSize => ({ width, height })

  it('records the observer spec baseline instead of asserting on it', () => {
    // ResizeObserver fires once on observe() with the size the panel already had. Asserting
    // there would scroll the list on every open, before any field exists to protect.
    expect(planBoxReassert(null, box(390, 844))).toBe('baseline')
  })

  it('skips a delivery that repeats the previous box', () => {
    expect(planBoxReassert(box(390, 844), box(390, 844))).toBe('skip')
  })

  it('asserts on a real change — the keyboard shrink the schedule raced', () => {
    // 812 -> 500 is the panel's box arriving at the keyboard's top edge: the moment the fixed
    // delays can miss, because the last tick may have fired before the shrink landed.
    expect(planBoxReassert(box(390, IPHONE_HEIGHT), box(390, 500))).toBe('assert')
  })

  it('asserts on a width change too (rotation)', () => {
    expect(planBoxReassert(box(390, IPHONE_HEIGHT), box(IPHONE_HEIGHT, 390))).toBe('assert')
  })

  it('treats a sub-pixel change as a change — under-firing is the one failure the rule must not do', () => {
    expect(planBoxReassert(box(390, IPHONE_HEIGHT), box(390, IPHONE_HEIGHT + 0.5))).toBe('assert')
  })
})

describe('KEYBOARD_REASSERT_SCROLL_OPTIONS', () => {
  it('is nearest + instant, the one assert both triggers share', () => {
    // `instant` is the whole point: the layout has already moved under the runner and a smooth
    // chase reads as a glitch. A constant, so the second trigger cannot quietly grow a `smooth`.
    expect(KEYBOARD_REASSERT_SCROLL_OPTIONS).toEqual({ block: 'nearest', behavior: 'instant' })
  })
})

describe('attachStripPadBottomCss', () => {
  const RESTING = 'calc(1rem + var(--safe-bottom))'

  it('is the old pb-[calc(1rem+var(--safe-bottom))] class, byte for byte, at rest', () => {
    // The resting geometry must be exactly what the replaced class spelled: with no keyboard,
    // nothing on /nina/about moves.
    expect(attachStripPadBottomCss(0)).toBe(RESTING)
  })

  it('zeroes the whole floor under the keyboard — the composer gate, on this bar', () => {
    // `KEYBOARD_HEIGHT` is this suite's own plausible overlap. The keyboard's top edge is the
    // floor and the inset is behind it; padding by either lifts the input off the keys, which is
    // `composerPadBottomCss`'s recorded mistake one route over.
    expect(attachStripPadBottomCss(KEYBOARD_HEIGHT)).toBe('0px')
    expect(attachStripPadBottomCss(KEYBOARD_HEIGHT)).not.toBe('0')
  })

  it('answers the no-keyboard degenerate inputs with the resting floor', () => {
    // The same degradation `composerBottomCss`/`composerPadBottomCss` get: unmeasurable and
    // negative mean "no keyboard", and a NaN must not decide geometry.
    for (const overlap of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -120]) {
      expect(attachStripPadBottomCss(overlap)).toBe(RESTING)
    }
  })
})

describe('NINA_KEYBOARD_OVERLAP_VAR', () => {
  it('is the channel the strip and the panel both spell', () => {
    expect(NINA_KEYBOARD_OVERLAP_VAR).toBe('--nina-kb-overlap')
  })
})
```

**Impact:** additive to the existing suite; no existing describe touched.
`npx vitest run lib/nina/chatview.test.ts` must pass green before the phase is called done.

## Verification

**Build:**
```
npm run build
```
(The worktree needs `.env.local` and `npm install` before any of these run — a fresh worktree has
neither.)

**Tests:**
```
npx vitest run lib/nina/chatview.test.ts
npm test
```

**Typecheck / lint:**
```
npm run typecheck
npm run lint
```

**Manual check (device-optional):** on `/nina/about`, open a photo, tap "Tanya soal foto ini" —
the strip's bottom edge must sit on the keyboard's top edge and the input must stay visible. In
the sidebar, `⋯` → pencil → tap the "Nama chat" input — the field must still be visible after the
keyboard's open animation settles, including on the run where the box shrink lands after the last
scheduled tick.

**Exit criteria:**
1. `planBoxReassert`, `isKeyboardTextField`, `KEYBOARD_REASSERT_SCROLL_OPTIONS` and
   `attachStripPadBottomCss` are the pure rules the components consult, and their describes pass in
   `lib/nina/chatview.test.ts`.
2. `grep -rln "window.visualViewport" components/` returns exactly three files:
   `components/nina/KeyboardOverlapPublisher.tsx` (the ONE subscription),
   `components/ui/PhotoViewer.tsx` and `components/nina/MessageBubble.tsx` (read-only `.scale`
   reads, no listeners) — and `ChatScreen.tsx` is no longer among them. One publisher
   implementation, mounted once per route, on routes that are never concurrent. (The
   nearer-sounding `grep visualViewport | grep addEventListener` is useless here: the two tokens
   never share a line in this tree's style, so it matches nothing both before and after this
   phase — a gate that cannot fail proves nothing.)
3. The strip container carries `bottom: var(--nina-kb-overlap, 0px)` inline and its resting
   padding string is byte-identical to the class it replaced; the sidebar effect's dependency
   array is still exactly `[open]`.
4. Build, typecheck, lint and the full suite pass.
5. **Verification shape, stated honestly:** this codebase cannot reproduce an iOS keyboard in
   vitest (`environment: 'node'` — no DOM, no `visualViewport`, no `ResizeObserver`, no scroll
   container). This phase's verification IS the pure rules' tests + build + the existing suites +
   the mechanism's recorded precedent — `NinaSidebar.tsx:373-426` documents the identical
   search-field incident and its fix, and `composerPadBottomCss`'s docstring records
   "the composer never lifts" as the outcome of the box fix on a fixed element inside no scroll
   container, which is the strip's exact situation. The on-device outcome is the owner's
   acceptance step, as it was for the composer and the panel before this phase.

## Handoffs

None forward — this is the set's last phase. Two observations recorded rather than acted on:

- **`NinaAboutScreen`'s `attach()` navigates with `router.push(result.next)`** — Phase 1 landed
  that (both targets push `/nina?s=<sessionId>`), so the bare `router.push('/nina')` this plan was
  first written against is gone. No interaction with this phase: the push lives on the send path
  this phase does not touch, and `kbOverlap` and the publisher mount are unaffected.
- **`PhotoViewer`'s own swipe surface** sits under the strip and has no text input, so it needs no
  keyboard channel; nothing to hand off.

## Rollback

`git revert` of this phase's commit range on `worktree-photo-send-chat-icons` restores, in one
move: `ChatScreen`'s two inline effects (the tree's original, behavior-identical subscription),
the strip's class-only padding and unguarded `bottom-0`, and the schedule-only reassert. Phase 1's
send paths are untouched by the revert — the publisher file and the test file simply disappear,
and nothing else imports them. `/nina/about` returns to "no keyboard channel at all"; the rename
field returns to the fixed-delay schedule that the report says is not enough.
