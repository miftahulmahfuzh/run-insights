'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { EmptyState } from '@/components/ui/EmptyState'
import { TAB_BAR_FAB_OVERHANG_PX, TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
import { todayInJakarta } from '@/lib/date/ranges'
import { sendNinaMessage } from '@/lib/nina/actions'
import { composerBottomCss, keyboardOverlapPx } from '@/lib/nina/chatview'
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

type Notice = 'send-failed' | 'no-reply'

const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
}

/** The chrome the composer sits above: the bar, plus the FAB's overhang past the bar's top edge. */
const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX

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

  // Every timed step checks this before touching state. StrictMode double-invokes effects in
  // development and a runner can navigate away mid-reveal; both would otherwise set state on an
  // unmounted tree. `InsightTrigger` uses the same guard for the same reason.
  const alive = useRef(true)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
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

  const handleSend = useCallback(
    async (draft: { body: string; images: readonly ComposerDraftImage[] }) => {
      if (busy) return

      const body = draft.body
      const imageUrls = draft.images.map((image) => image.url)
      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      setNotice(null)
      setMessages((current) => [
        ...current,
        {
          id: localId,
          role: 'user',
          body,
          dayISO,
          state: 'sending',
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
          },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy],
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
      />
    </>
  )
}
