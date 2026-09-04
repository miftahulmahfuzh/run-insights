'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { EmptyState } from '@/components/ui/EmptyState'
import { TAB_BAR_FAB_OVERHANG_PX, TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
import { todayInJakarta } from '@/lib/date/ranges'
import { sendNinaMessage } from '@/lib/nina/actions'
import { composerBottomCss, keyboardOverlapPx } from '@/lib/nina/chatview'
import { QUOTE_FLASH_MS, buildQuote, planQuoteScroll, type QuoteView } from '@/lib/nina/reply'
import { planReveal } from '@/lib/nina/reveal'
import { Composer, type ComposerDraftImage } from './Composer'
import { MessageList } from './MessageList'
import type { ChatMessage } from './types'

/**
 * The interactive half of `/nina`: one turn, from the runner pressing send to Nina's last bubble.
 *
 * ── WHY THIS IS NOT INSIDE A TRANSITION ───────────────────────────────────────────────────────
 * Next 16's own interactive-apps guide is explicit that "inside a transition, `useState` setters
 * are deferred until the transition completes". A staggered reveal is a sequence of `setState`
 * calls separated by real time, so wrapping the turn in `startTransition` or `useActionState`
 * would batch all four bubbles to the end and deliver them in one frame — RU-5, inverted. For the
 * same reason the guide's `useOptimistic` pattern is wrong here: optimistic state is discarded
 * when the transition ends, and that is exactly the frame the first bubble is supposed to appear
 * in. Plain `useState` and a plain async handler are the correct tools, not the lazy ones.
 *
 * ── WHY NOTHING IS REFRESHED AFTERWARDS ───────────────────────────────────────────────────────
 * Phase 3 persists the runner's message and every bubble before the action returns, so a reload
 * renders exactly what is on screen. Calling `router.refresh()` would re-render the server list
 * underneath a reveal still in progress and make her bubbles blink out and back. The rows this
 * component appends are the same rows the server would send.
 *
 * ── WHY THE PAGE DID NOT AWAIT THE MODEL ──────────────────────────────────────────────────────
 * The same boundary that guards `getOrCreateInsight`, and now guards Nina's turn (invariant 4,
 * enforced by `scripts/check-llm-payload-boundary.mjs`): a turn is a 13-16 s model call. The page
 * renders the stored conversation from indexed reads, and the model is only ever reached from
 * here, on an event, after the screen is already useful. `components/insights/InsightTrigger.tsx`
 * is the same shape one interaction earlier.
 *
 * ── THE TWO FAILURE STATES, AND WHY NEITHER IS A FAKE NINA MESSAGE ────────────────────────────
 * A thrown action is a send that did not happen; a returned `unavailable` or an empty `bubbles`
 * array is phase 3's documented silence after a repair also failed. They are told apart because
 * they call for different things — try again, versus she has nothing to say. Neither is rendered
 * as a bubble. Putting app-authored words in her mouth would be the fabrication `lib/llm/narrate.ts`
 * refuses ("the only safe fallback for prose is the absence of prose"), and it would teach the
 * runner to distrust every other bubble on the screen. R22's in-character apology is a genuinely
 * different case — a *tool* failing mid-turn, which phase 12 owns, and where Nina really is the one
 * who should speak.
 */

type Notice = 'send-failed' | 'no-reply' | 'quote-missing'

const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
  /* R12's honest end of the degradation. The quote rendered, so the target existed when the page
   * loaded; it is simply not among the rows on screen — deleted since, or further back than this
   * screen goes. Saying so beats a tap that does nothing. */
  'quote-missing': 'That message isn’t on this screen any more, so there’s nowhere to jump to.',
}

/** The chrome the composer sits above: the bar, plus the FAB's overhang past the bar's top edge. */
const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX

/**
 * Fallback for `obstructedBottomPx` if `#nina-composer` cannot be measured — the clearance plus
 * one composer row. Only reachable if the composer has not mounted, which it always has by the
 * time a quote is tappable.
 */
const COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68

export function ChatScreen({
  initial,
  todayISO,
  userId,
}: {
  /** The stored conversation, oldest first, mapped on the server. */
  initial: readonly ChatMessage[]
  /** From the server, so "Today" cannot differ between render and hydration. */
  todayISO: string
  /**
   * Phase 6. Passed straight through to `Composer`, which needs it to build
   * `nina/<userId>/chat/<id>.jpg`. Not a secret and not a capability: `/api/upload` re-derives the
   * owner from the session and refuses any pathname that does not match it.
   */
  userId: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
  /** Phase 7 (R12). The message being replied to, or null for an ordinary send. */
  const [draftQuote, setDraftQuote] = useState<QuoteView | null>(null)
  /** Phase 7. The message a jump just landed on. Held for `QUOTE_FLASH_MS`, then cleared. */
  const [flashId, setFlashId] = useState<string | null>(null)

  // Every timed step checks this before touching state. StrictMode double-invokes effects in
  // development and a runner can navigate away mid-reveal; both would otherwise set state on an
  // unmounted tree. `InsightTrigger` uses the same guard for the same reason.
  const alive = useRef(true)
  const timer = useRef<number | null>(null)
  /*
   * Separate from `timer` on purpose. `timer` is the reveal's `setTimeout` handle; sharing it
   * would mean a quote tap mid-reveal cancels the reveal's `sleep` and strands the remaining
   * bubbles behind a typing indicator that never resolves.
   */
  const flashTimer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  /*
   * The iOS keyboard. Safari does not resize the layout viewport when it opens, so a fixed
   * composer would sit behind it and Safari will not scroll fixed chrome into view. `visualViewport`
   * is the only honest measurement; `keyboardOverlapPx` turns it into a number and filters out the
   * URL bar and pinch-zoom. Empty deps, so a keystroke never re-subscribes.
   */
  useEffect(() => {
    const vv = window.visualViewport
    if (vv == null) return
    const sync = () => {
      setOverlap(
        keyboardOverlapPx({
          innerHeight: window.innerHeight,
          visualHeight: vv.height,
          visualOffsetTop: vv.offsetTop,
          scale: vv.scale,
        }),
      )
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timer.current = window.setTimeout(resolve, ms)
    })

  /**
   * Arm a reply (R12). `buildQuote` rather than `resolveQuote`, because the target is the message
   * in hand — there is nothing to look up.
   */
  const handleReply = useCallback((message: ChatMessage) => {
    setNotice(null)
    setDraftQuote(
      buildQuote({
        id: message.id,
        mine: message.role === 'user',
        text: message.body,
        /* The same two booleans `MessageList` computes, for the same reason (RULING E2b), and
         * spelled the same way so the strip in the composer and the stub in the bubble cannot
         * disagree about whether the target was a photo. */
        hasImage: (message.imageUrls?.length ?? 0) > 0,
        hasRun: false, // phase 8: `message.attachment != null`
      }),
    )
  }, [])

  /**
   * R12's second half: tapping a quote scrolls to the message it names, and says which one it
   * landed on.
   *
   * The DOM read is deliberate and is the only DOM read on this screen besides the keyboard's.
   * `getElementById` on phase 4's `nina-msg-${id}` anchor is the one honest source for where a
   * message actually is: React knows the order of the rows, not their pixel heights, which depend
   * on wrapping, on a quote stub, and on an image. A missing element is the degradation path, not
   * an error — the row was on screen when the page rendered and is not now.
   *
   * `getBoundingClientRect().top` on the composer, rather than a constant, because the obstruction
   * is the composer's height (which the reply strip, a tile row and a multi-line draft all change)
   * plus its offset (clearance, or the keyboard).
   */
  const handleJumpToQuote = useCallback((targetId: string) => {
    const element = document.getElementById(`nina-msg-${targetId}`)
    if (element === null) {
      setNotice('quote-missing')
      return
    }

    const composer = document.getElementById('nina-composer')
    const obstructedBottomPx =
      composer === null
        ? COMPOSER_FALLBACK_PX
        : Math.max(0, window.innerHeight - composer.getBoundingClientRect().top)

    const rect = element.getBoundingClientRect()
    const plan = planQuoteScroll({
      targetTop: rect.top + window.scrollY,
      targetHeight: rect.height,
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
      /* This screen's header scrolls away with the document; nothing is fixed at the top. */
      obstructedTopPx: 0,
      obstructedBottomPx,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: plan.behavior })

    /* The tint runs whether or not the page moved: `kind: 'none'` means the target was already on
     * screen, which is exactly the case where a scroll alone would identify nothing. */
    setNotice(null)
    setFlashId(targetId)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      if (alive.current) setFlashId(null)
    }, QUOTE_FLASH_MS)
  }, [])

  const handleSend = useCallback(
    async (draft: { body: string; images: readonly ComposerDraftImage[] }) => {
      if (busy) return

      const body = draft.body
      const imageUrls = draft.images.map((image) => image.url)
      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      /* Read once and cleared immediately: the strip must disappear the moment the message is in
       * the log, and the optimistic row has to carry the same pointer the action will persist. */
      const replyToMessageId = draftQuote?.targetId ?? null
      setDraftQuote(null)
      setNotice(null)
      setMessages((current) => [
        ...current,
        {
          id: localId,
          role: 'user',
          body,
          dayISO,
          state: 'sending',
          replyToId: replyToMessageId,
          /* Already on the CDN — the describe pre-pass uploaded it before send was possible — so
           * the optimistic row shows the same URL the server row will carry. No object URL to
           * revoke, and no flicker when the real row lands. */
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        },
      ])
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({
          body,
          imageTickets: draft.images.map((image) => image.ticket),
          replyToMessageId,
        })
      } catch {
        result = null
      }
      if (!alive.current) return

      if (result === null || !result.ok) {
        setTyping(false)
        setBusy(false)
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return
      }

      // Adopt the server's id for the runner's own row, so phase 7 can quote it and phase 8 can
      // anchor to it. Until this point it carried a client-minted `local-` id.
      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      const bubbles = result.bubbles
      if (bubbles.length === 0) {
        // `unavailable` and a merely empty reply read the same to the runner — he does not care
        // *why* she said nothing. The distinction stays in the result type, not in the copy.
        setTyping(false)
        setBusy(false)
        setNotice('no-reply')
        return
      }

      const plan = planReveal(bubbles.map((b) => b.body))
      for (const [index, bubble] of bubbles.entries()) {
        const gap = plan[index] ?? 0
        if (gap > 0) {
          setTyping(true)
          await sleep(gap)
          if (!alive.current) return
        }
        // The indicator stays up while there is another thought coming, and drops with the last.
        setTyping(index < bubbles.length - 1)
        setMessages((current) => [
          ...current,
          {
            id: bubble.id,
            role: 'nina',
            body: bubble.body,
            dayISO: todayInJakarta(),
            state: 'sent',
            /*
             * HER OWN QUOTE, ON THE OPTIMISTIC REVEAL. She may have replied to a specific message,
             * and phase 3 puts her `reply_to_id` on the FIRST bubble only ("a four-bubble reply is
             * one answer to one message"). A hard `null` here would mean the quote only appeared on
             * the next server render of `/nina` — R12's UI lagging the database by a page load, for
             * two lines. RULING B1 assigned those two lines to phase 7, which already edits
             * `lib/nina/actions.ts` where `SentBubble` is declared.
             */
            replyToId: bubble.replyToId,
          },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy, draftQuote],
  )

  return (
    <>
      {messages.length === 0 && !typing ? (
        <EmptyState
          title="Nina has not started yet"
          description="Say something and she will answer. She has read every run you have logged, so she already has opinions."
        />
      ) : (
        <MessageList
          messages={messages}
          typing={typing}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
          flashId={flashId}
          onReply={handleReply}
          onJumpToQuote={handleJumpToQuote}
        />
      )}

      {notice !== null && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">{NOTICE_TEXT[notice]}</p>
      )}

      {/* The spoken half of the typing indicator. The dots themselves are `aria-hidden`. */}
      <p className="sr-only" role="status" aria-live="polite">
        {typing ? 'Nina is typing' : ''}
      </p>

      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        userId={userId}
        reply={draftQuote}
        onCancelReply={() => setDraftQuote(null)}
      />
    </>
  )
}
