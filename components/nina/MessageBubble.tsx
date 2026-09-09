'use client'

import { useRef } from 'react'
import type * as React from 'react'

import { cn } from '@/lib/cn'
import {
  BUBBLE_BODY_SELECTOR,
  BUBBLE_INTERACTIVE_SELECTOR,
  decideMessageActionSwipe,
  decideMessageActionTap,
} from '@/lib/nina/edit'
import { decideReplySwipe, type QuoteView } from '@/lib/nina/reply'
import { QuoteStub } from './QuoteStub'
import type { ChatMessage } from './types'

/**
 * One message. Two sides, two extension slots, and one touch gesture.
 *
 * **Marked `'use client'` since phase 7, and that was checked before it was done (RULING E8).**
 * Phase 4 left the module directive-free because nothing here used a hook; the reply gesture ends
 * that, and the directive is unavoidable. Nobody downstream loses anything: phase 6 does not edit
 * this file and reaches it through `MessageList`; phase 8 fills `above` from `MessageList`; phase
 * 11 states explicitly that it does not touch this file; and phase 13 needs no server-rendered
 * bubble, because attaching an album photo writes a real row and the page navigates to `/nina`,
 * where this renderer draws it. So no `BubbleShell` split is needed — and the directive is
 * recorded here rather than discovered by watching a build fail.
 *
 * ── R12: THE GESTURE, THE STUB, THE FLASH (PHASE 7) ───────────────────────────────────────────
 * Swipe a bubble to the RIGHT to reply to it — either side of the conversation, as in WhatsApp,
 * which is what R12's own "just like whatsapp" asks for and what muscle memory tries first. The
 * decision is `decideReplySwipe`, in `lib/nina/reply.ts`, because a gate that must not eat the
 * chat log's vertical scroll is a rule and rules get asserted (`lib/photos/gallery.ts`'s
 * `decideSwipe` is the precedent, and this file is its second caller-shaped sibling). The two
 * rejected alternatives, on the record: a **long-press** collides with iOS text selection and the
 * native callout menu on a block of selectable prose, which is a real capability in a chat
 * (copying what she said) and not one worth trading; a **tap** would make the bubble itself a
 * button, which breaks text selection just as thoroughly.
 *
 * A gesture is invisible to a keyboard and to VoiceOver, so every bubble also carries a `<button>`
 * that is `sr-only` until it takes focus — the skip-link pattern. It costs one tab stop per
 * message and nothing at all visually, which is the trade this app's design language wants: 200
 * permanently visible reply buttons would be 200 pieces of furniture in a reading surface.
 *
 * **The landing flash is a blink train, and it is a keyframe on purpose.** It started as a
 * `transition-shadow` tint — "no keyframe, no `[animation:…]` call site, and therefore nothing
 * for `tests/motion.reducedMotion.test.ts` to guard" — and that design held until 2026-09-09,
 * when the owner asked for the landing to read at a glance: *"buat highlight biru ini lebih
 * conspicuous, misal buat dia flicker lebih cepat, tiga kali flicker"*. A tint you cannot make
 * flicker is a tint that cannot answer that ask, so the transition is gone and
 * `nina-flash-blink` in `app/globals.css` took its place: hard ~150 ms blinks of a 2px ring, one
 * blink per iteration, the count driven by `--nina-flash-count` (owner-tuned through
 * `NINA_FLASH_BLINKS`, default four). The invariant-8 cost the old paragraph avoided paying is
 * paid now, in the open: the keyframe exists, its `[animation:…]` call site is below, and the
 * suite guards the still redefinition under `@media (prefers-reduced-motion: reduce)` — which
 * gives the reduce setting the old steady ring, held for the animation's duration, instead of
 * strobes. The rest of that paragraph's reading of `app/globals.css` still holds: the
 * `transition-*` utilities in `Chip`, `KindSelector` and `Button` animate colour only, which is
 * not motion, and the `transition-shadow` below now exists for the FAILED ring alone.
 *
 * The COLOUR is per side: hers blink `--accent`; his blink white (`--nina-flash-ring-color`,
 * set below when `mine`) — "flicker buat user's bubble itu diganti warnanya jadi putih". Both
 * quote-tap landings and search-hit landings ride the same `flash` prop, so the reply-to box
 * pointing at one of his bubbles and a search hit inside one blink white alike.
 *
 * The hold is `flashHoldMs(flashBlinks)` — the train plus one cycle of tail — computed in
 * `lib/nina/reply.ts` and measured in `ChatScreen`; at the default four it is the same 1600 ms
 * the old fixed constant held. Nothing lingers after the last blink, because the animation ends
 * off and the steady ring is not applied beside it.
 *
 * ── R8: THE FOURTH GESTURE (PHASE 7 OF THE SESSIONS SET) ──────────────────────────────────────
 * Swipe a bubble to the LEFT to edit or delete it — either side of the conversation. The decision
 * is `decideMessageActionSwipe`, in `lib/nina/edit.ts`, for the same reason the reply gate lives in
 * `lib/nina/reply.ts`: there is no jsdom, so a gate that must not eat the chat log's scroll is a
 * rule and rules get asserted.
 *
 * It had to be a fourth thing. Swipe-right is reply and is not re-litigated; the two alternatives
 * this file rejected above — long-press and tap — are still rejected for the reasons written there,
 * and copying what she said is still a real capability. So leftward is what is left, and it comes
 * with one obligation the reply gesture did not have: `lib/nina/reply.ts` records that "a leftward
 * drag from near the screen edge is how iOS Safari does forward navigation", and his bubbles reach
 * the content's right edge. `MESSAGE_ACTION_EDGE_GUARD_PX` answers that, and it is a unit test.
 *
 * The distance and the dominance are reply's own constants, imported by `edit.ts` rather than
 * re-chosen: two gestures on one element that are unequally hard to perform read as one of them
 * being broken.
 *
 * A gesture is invisible to a keyboard and to VoiceOver, so this bubble now carries a SECOND
 * `sr-only`-until-focused button — two tab stops per message instead of one. The trade is the same
 * one the reply button already made and won: two invisible stops cost nothing visually, and 200
 * permanently visible action buttons would be 200 pieces of furniture in a reading surface.
 *
 * Where the actions actually render is `components/nina/MessageActionsSheet.tsx`, above the
 * document rather than inside it, so nothing here changes the page's scroll height mid-decision.
 *
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
 *
 * ── WHY THESE TWO FILLS AND NOT A COLOURED ONE ────────────────────────────────────────────────
 * Hers is `bg-card` + `shadow-card` at `rounded-card`, which is the app's *only* surface — "White
 * fill, 22px radius, soft shadow, no border" (`components/ui/Card.tsx`). An incoming message is a
 * card floating on sky paper, and the design system already had the answer.
 *
 * His is `bg-ink text-card`, which is the one saturated fill this system endorses: `Chip` calls it
 * "a solid ink slab" and pairs it with the tint of the page "so a chip and a button never disagree
 * about what 'chosen' looks like". Here it means "mine". It also inverts correctly — in dark mode
 * `--ink` is near-white and `--card` is near-navy, so the two sides stay opposites in both schemes.
 *
 * `--accent` is **not** available for this. `Button`'s docstring records the measurement: white on
 * the cyan accent lands near 2:1, well under WCAG's 4.5:1, and "the accent earns its keep on labels
 * and links, where it sits on paper". `--z5` coral is spoken for by the Upload FAB, and `--warn` /
 * `--red` are the attention language and "never decoration" (`docs/design/tokens.css`).
 *
 * ── THE TAIL IS A RADIUS, NOT A TRIANGLE ──────────────────────────────────────────────────────
 * One corner drops from `rounded-card` (22px) to `rounded-chip` (8px) on the side the message came
 * from. That reads as a WhatsApp tail using two radii the system already publishes, and it needs no
 * pseudo-element, no rotated square and no border — which matters, because "no borders on surfaces"
 * is a hard rule and a drawn tail is the classic way people break it.
 *
 * ── 15px, WHERE THE APP'S BODY TEXT IS 13 ─────────────────────────────────────────────────────
 * A deliberate step up, and the only place in the app that takes it for prose. `InsightCard`'s 13px
 * body sits *below* a 19px headline that carries the screen; a chat bubble has nothing above it, so
 * the bubble text IS the screen's content. 15px is an existing step in the scale (it is `Button`'s
 * label size), not a new one, and `leading-[1.5]` keeps the block readable at that size.
 *
 * ── NO ENTRANCE ANIMATION ─────────────────────────────────────────────────────────────────────
 * A bubble appears. It does not slide, fade or scale in. This app has exactly one keyframe and a
 * global reduced-motion escape that redefines it to hold still; a second keyframe for decoration
 * would be the first in the codebase and would have to argue against that file's own conclusion
 * that "the pulse was decoration over a signal that does not need it". The stagger from
 * `lib/nina/reveal.ts` is the only timing on this screen, and it carries real information — that
 * these are four separate things she said.
 *
 * ── PLAIN TEXT, ON PURPOSE ────────────────────────────────────────────────────────────────────
 * `whitespace-pre-wrap` so her line breaks survive, `break-words` so a pasted URL cannot widen the
 * column. No markdown renderer and no `dangerouslySetInnerHTML`: there is no markdown anywhere in
 * this app, and adding one here would be inventing a capability rather than shipping a screen.
 * iOS auto-linking of times and dates is already off app-wide (`app/layout.tsx`'s
 * `formatDetection`), which is what stops "jam 7" turning into a phone number in a bubble.
 */
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

export function MessageBubble({
  message,
  above,
  quote,
  flash = false,
  onReply,
  onJumpToQuote,
  onRequestActions,
}: {
  message: ChatMessage
  /**
   * Rendered inside the bubble, above the text and BELOW `quote`. **The seam for phases 6 and 8**
   * — the images (6) and the attached-run card (8) hang here, composed by `MessageList`.
   *
   * **The reply quote is not in this slot** — it has its own `quote` prop, because it must always
   * sit at the very top of the bubble, above an image and above a run card, which is where every
   * chat app puts it and is not a guarantee an unordered slot can make. RULING E2 settled this in
   * phase 7's favour and removed phase 8's competing expression, which nested its quote inside
   * `above`. Render order, top to bottom: **quote stub → images → run card → text**. The quote
   * says what he is answering; the images and the card are what he is handing over; the text is
   * the message.
   *
   * The pattern for an inset block is `InsightCard`'s, with one substitution:
   * `rounded-field bg-ink-3/20 p-3.5`, **not** `bg-paper-2`. `bg-paper-2` is near-white in light
   * mode and near-navy in dark, so inside a `bg-ink` bubble it inverts and reads as a hole in one
   * scheme. `--ink-3` is `#93a2b0` in light and `#7c8d9b` in dark (`app/globals.css`) — a
   * mid-grey in both — so one class works on both sides with no per-side branch and no variant
   * plumbing (RULING E1). Each inset block owns its own bottom margin, so the stack needs none.
   */
  above?: React.ReactNode
  /**
   * Resolved by `MessageList` through `resolveQuote`, against the rows on screen. Null renders a
   * plain message — which is the documented degradation for a target that was deleted, is older
   * than the rendered window, or belongs to an unconfirmed send.
   */
  quote?: QuoteView | null
  /** True while this is the message a landing just landed on; blinks for `flashHoldMs(flashBlinks)`. */
  flash?: boolean
  /** Arm a reply to this message. Omitted makes the bubble inert, as on a read-only page. */
  onReply?: (message: ChatMessage) => void
  /** Tap on the quote stub: scroll to `targetId`. */
  onJumpToQuote?: (targetId: string) => void
  /**
   * R8. Open the edit/delete surface for this message — from a LEFT swipe, or from the second
   * focus-revealed button below. Omitted makes the bubble read-only in that respect, exactly as an
   * omitted `onReply` does, and the two are independent: a surface may offer one without the other.
   *
   * It hands over the whole `ChatMessage` rather than an id, because `ChatScreen` needs its role,
   * its body, its `state` and its `imageUrls` to build the `EditTarget` and to disclose the photo
   * count — all of which it would otherwise have to look up in the list it just handed down.
   */
  onRequestActions?: (message: ChatMessage) => void
}) {
  const mine = message.role === 'user'

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

  return (
    <li
      /*
       * A stable DOM id per message. Phase 7 needs exactly this to scroll a tapped quote to its
       * target; it costs one attribute now and would cost a re-read of every row later.
       */
      id={`nina-msg-${message.id}`}
      data-role={message.role}
      data-flash={flash ? 'true' : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
    >
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
           * The landing flash (R12: "clicking … will automatically scroll to that message"; a
           * scroll that does not say WHICH message it landed on has done half the job):
           * `nina-flash-blink` in `app/globals.css`, one hard blink per iteration, applied
           * INSTEAD of a steady ring and never beside one so the element's own box-shadow under
           * the animation is none and the train ends clean.
           *
           * The COUNT is not ours to choose — `--nina-flash-count` is set on `MessageList`'s
           * container from `flashBlinkCount(process.env.NINA_FLASH_BLINKS)` (owner-tuned in the
           * Vercel env; the `, 4` is only the fallback if that var ever stops arriving, and a
           * var() in the shorthand is what lets the count stay a value rather than a stop
           * rewrite). The COLOUR is: hers blink `--accent` (the keyframe's default); HIS blink
           * white — the owner's ask, "flicker buat user's bubble itu diganti warnanya jadi
           * putih", both for a quote tap landing on his bubble and for a search hit landing on
           * one — and against `bg-ink` a white rim reads as the bubble itself flashing, in both
           * schemes. The `transition-shadow` under the animation is not the flash's: it exists
           * for the FAILED ring above, which is a real class-driven shadow change and fades as
           * one. See the header for the whole story.
           */
          'transition-shadow duration-300',
          flash && mine && '[--nina-flash-ring-color:#fff]',
          flash && '[animation:nina-flash-blink_0.32s_linear_var(--nina-flash-count,_4)]',
        )}
      >
        {quote != null && (
          <QuoteStub quote={quote} mine={mine} onJump={onJumpToQuote} className="-mx-1 mb-2" />
        )}
        {above}
        {message.body}

        {/*
          The non-gesture paths. Invisible until focused, so a keyboard and VoiceOver can do what a
          thumb does with a swipe. Two stops per message now (R8) — see the header for why that is
          still the right trade, and note that the reply stop comes FIRST because the reply gesture
          came first and muscle memory in a screen reader is muscle memory too.
        */}
        {onReply !== undefined && (
          <button
            type="button"
            onClick={() => onReply(message)}
            className={cn(
              'sr-only focus:not-sr-only focus:relative focus:mt-2 focus:inline-block',
              'focus:rounded-chip focus:px-2 focus:py-1 focus:text-[12px] focus:font-semibold',
              mine ? 'focus:bg-card/20 focus:text-card' : 'focus:bg-paper-2 focus:text-accent',
              'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            )}
          >
            Reply to this message
          </button>
        )}

        {onRequestActions !== undefined && (
          <button
            type="button"
            onClick={() => onRequestActions(message)}
            className={cn(
              'sr-only focus:not-sr-only focus:relative focus:mt-2 focus:inline-block',
              'focus:rounded-chip focus:px-2 focus:py-1 focus:text-[12px] focus:font-semibold',
              mine ? 'focus:bg-card/20 focus:text-card' : 'focus:bg-paper-2 focus:text-accent',
              'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            )}
          >
            Edit or delete this message
          </button>
        )}
      </div>
    </li>
  )
}
