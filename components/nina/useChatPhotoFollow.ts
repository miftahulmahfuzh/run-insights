'use client'

import { useEffect, useRef } from 'react'

import type { QuoteScroll } from '@/lib/nina/reply'

/**
 * R2. While the full-screen photo overlay is open, keep the conversation BEHIND it showing the
 * bubble that sent the photograph currently on screen.
 *
 * The user asked for it in these words: *"we need to auto-scroll the chat history to follow the
 * current viewed photo. e.g: after i swipe right 3 times, then when i exit full-view, i will see
 * the bubble that sent this photo."* Following live is what makes the second half fall out of the
 * first: there is no close-time special case anywhere, because by the time the overlay closes the
 * page is already where it needs to be.
 *
 * ── WHY SCROLLING UNDER A LOCKED BODY WORKS ───────────────────────────────────────────────────
 * `PhotoViewer` sets `document.body.style.overflow = 'hidden'` for its lifetime. Per CSS Overflow,
 * `hidden` is "scrollable, but with no scrolling user interface" — programmatic `window.scrollTo`
 * still applies. It is `clip` that would forbid it, and nothing in this app sets that.
 *
 * ── WHY IT TAKES THE MEASUREMENT AS AN ARGUMENT ───────────────────────────────────────────────
 * `planScroll` is `useQuoteLanding`'s `measureQuoteScroll`, which reads the `#nina-msg-<id>` anchor
 * and the composer and hands the geometry to `planQuoteScroll` — the ONE function that decides
 * where a named bubble has to sit so the composer does not cover it. R12's quote tap, R1's `?jump=`
 * mount landing and its soft-nav landing all route through it already. This hook owns no geometry
 * of its own on purpose: a second rule about that band would drift the first time the composer's
 * height changed, and injecting the measurement is also what lets this be tested without one.
 *
 * ── WHY IT DOES NOT MOVE FOR THE BUBBLE THE OVERLAY WAS OPENED ON ─────────────────────────────
 * The runner tapped a photograph in that bubble, so it is on screen by definition. Moving the page
 * under an overlay they have just opened would cost them the reading position they came from and
 * buy nothing — `followed.current === null` is "this is the first owner we have seen for this
 * overlay", and it only records.
 *
 * ── WHY `'instant'`, AND WHY NO FLASH ─────────────────────────────────────────────────────────
 * `'instant'` because the movement happens behind an opaque overlay: nobody can watch it, and a
 * smooth scroll would still be travelling when the next swipe arrives. No flash because the user
 * asked to SEE the bubble, not to have it highlighted — `flashMessage`'s blink train is
 * `useQuoteLanding`'s vocabulary for an arrival from elsewhere, and restarting its timer on every
 * page turn would burn it out long before the overlay closed.
 *
 * ── WHY NO URL IS WRITTEN (invariant 7) ───────────────────────────────────────────────────────
 * This moves the document and nothing else. `ChatScreen`'s mount-time `useLayoutEffect` and
 * `useQuoteLanding`'s soft-nav strip are the two sanctioned `replaceState` writers, one per commit,
 * and `tests/nina.chatPhoto.test.ts` counts them.
 */
export function useChatPhotoFollow({
  messageId,
  planScroll,
}: {
  /** The bubble owning the photograph on screen, or `null` when the overlay is closed. */
  messageId: string | null
  /** `useQuoteLanding`'s `measureQuoteScroll`. `null` means that bubble is not in the document. */
  planScroll: (targetId: string) => QuoteScroll | null
}) {
  /**
   * The owner we last acted on for THIS opening of the overlay, or `null` while it is closed.
   *
   * A ref and not state: nothing renders from it, and writing it in state would re-render the
   * screen — and therefore the overlay — once per page turn for no reader. Resetting it on close
   * is what makes the next opening start fresh rather than scrolling because the previous session
   * happened to end on another bubble. It is also what makes StrictMode's development double-run
   * of this effect a no-op: the second run sees its own value and returns.
   */
  const followed = useRef<string | null>(null)

  useEffect(() => {
    if (messageId === null) {
      followed.current = null
      return
    }
    if (followed.current === null) {
      followed.current = messageId
      return
    }
    if (followed.current === messageId) return
    followed.current = messageId

    const plan = planScroll(messageId)
    /* `null` is the bubble being outside the rendered window — nothing to scroll to, and nothing
     * to say about it. `'none'` is `planQuoteScroll` answering that it is already comfortably in
     * the readable band, inside its 8px tolerance. Both are "do nothing", for different reasons. */
    if (plan === null || plan.kind !== 'scroll') return
    window.scrollTo({ top: plan.top, behavior: 'instant' })
  }, [messageId, planScroll])
}
