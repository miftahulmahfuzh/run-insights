'use client'

import { useRef } from 'react'
import type * as React from 'react'

import { cn } from '@/lib/cn'
import { decideMessageActionSwipe } from '@/lib/nina/edit'
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
 * **The landing flash is a colour transition and not an animation.** A one-off tint that fades is
 * `transition-shadow` on a `data-` attribute: no keyframe, no `[animation:…]` call site, and
 * therefore nothing for `tests/motion.reducedMotion.test.ts` to guard — which is the good outcome,
 * because that suite would otherwise require a fifth keyframe *and* a still redefinition of it
 * under `@media (prefers-reduced-motion: reduce)`. It is also the honest reading of
 * `app/globals.css`'s own line: the `transition-*` utilities in `Chip`, `KindSelector` and
 * `Button` are "deliberately untouched" by the reduced-motion escape because they "animate colour
 * only, which is not motion". `QUOTE_FLASH_MS` is 1600 — long enough to survive a smooth scroll
 * (~500 ms) plus the eye finding the line, short enough to be gone before it becomes decoration.
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
  /** True while this is the message a quote tap just scrolled to. Holds for `QUOTE_FLASH_MS`. */
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
   * ONE `touchend`, TWO decisions (R8). Reply is consulted first and returns; the action menu is
   * consulted only for a drag reply rejected. They cannot both fire, because reply requires
   * `dx > 0` and the menu requires `dx < 0` — but the ordering is written out anyway rather than
   * left to the sign, so that invariant 9 ("the reply swipe is not re-litigated") is visible in
   * the control flow and not merely true.
   */
  const start = useRef<{ x: number; y: number; touches: number } | null>(null)

  function onTouchStart(event: React.TouchEvent<HTMLLIElement>) {
    const touch = event.touches[0]
    if (touch === undefined) return
    start.current = { x: touch.clientX, y: touch.clientY, touches: event.touches.length }
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
    if (actions === 'actions') onRequestActions(message)
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
