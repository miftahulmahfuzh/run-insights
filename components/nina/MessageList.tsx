'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { formatDayCompact } from '@/lib/format'
import {
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  type ScrollCause,
} from '@/lib/nina/chatview'
import { resolveQuote, type QuoteCandidate } from '@/lib/nina/reply'
import { resolveRestoreTop, type ChatScrollMark } from '@/lib/nina/scroll'
import { ChatImages } from './ChatImages'
import { MessageBubble } from './MessageBubble'
import { RunAttachmentCard } from './RunAttachmentCard'
import { TypingIndicator } from './TypingIndicator'
import type { ChatMessage } from './types'
import { readAnchorRows } from './useChatScroll'

/**
 * The conversation, grouped by day, newest at the bottom.
 *
 * ── WHY THE PAGE SCROLLS AND NOT A PANEL ──────────────────────────────────────────────────────
 * There is no `overflow-y-auto` container here. A chat pane sized in `dvh` has to fight two things
 * iOS does to the document and does correctly: the collapsing URL bar, and the keyboard changing
 * the visible area without changing the layout viewport. Letting the document scroll hands both
 * back to the platform, and it is also the reading-app answer — a conversation is a document with
 * the composer as its last row, not a viewport with a feed inside it.
 *
 * ── WHY THE "WAS HE AT THE BOTTOM" ANSWER IS SAMPLED, NOT MEASURED IN THE EFFECT ──────────────
 * By the time an effect runs, the new bubble is already in the DOM and `scrollHeight` already
 * includes it, so measuring the distance to the bottom *then* always says "far away" and would
 * turn rule 3 of `decideAutoScroll` into "never follow". A passive `scroll` listener keeps the
 * answer up to date instead, and the effect reads the last sample. The listener does no work
 * beyond one comparison, and it holds a ref rather than state so a scroll never re-renders the
 * list.
 *
 * The day divider reuses `RunList`'s week-divider recipe exactly — `text-[11px] font-semibold
 * tracking-[0.06em] text-ink-3 uppercase`, and "Today" in place of a date for the current day for
 * the same reason that file gives: a reader at the bottom of his own conversation knows what day
 * it is, and the date is noise there but only there.
 *
 * **There is no per-message timestamp**, deliberately. See `app/nina/page.tsx`.
 */
export function MessageList({
  messages,
  typing,
  todayISO,
  keyboardOverlapPx,
  restoreMark,
  flashId = null,
  onReply,
  onJumpToQuote,
  onRequestActions,
}: {
  messages: readonly ChatMessage[]
  /** True while a turn is in flight, and between bubbles of a staggered reveal. */
  typing: boolean
  /** Computed on the server so "Today" cannot disagree between render and hydration. */
  todayISO: string
  /** Changes when the software keyboard opens or closes; a reason to re-check the scroll. */
  keyboardOverlapPx: number
  /**
   * Phase 8 (R14). The position this history entry was left at, or null. **When it is honoured,
   * the mount's jump-to-newest is skipped** — that jump is `decideAutoScroll`'s correct answer for
   * arriving at a conversation and the wrong answer for coming back to one.
   */
  restoreMark: ChatScrollMark | null
  /** Phase 7. The message a quote tap just landed on; it holds a tint for `QUOTE_FLASH_MS`. */
  flashId?: string | null
  /** Phase 7. A swipe, or the focus-revealed button, arming a reply to this message. */
  onReply?: (message: ChatMessage) => void
  /** Phase 7. A tap on a quote stub: scroll to the message it names. */
  onJumpToQuote?: (targetId: string) => void
  /**
   * R8. A LEFT swipe, or the second focus-revealed button, asking to edit or delete this message.
   * Threaded straight through, exactly as `onReply` is: this component composes bubbles and does
   * not decide what a bubble's actions are.
   */
  onRequestActions?: (message: ChatMessage) => void
}) {
  const readerNearBottom = useRef(true)
  const mounted = useRef(false)
  const lastCount = useRef(messages.length)
  const lastTyping = useRef(typing)
  const lastOverlap = useRef(keyboardOverlapPx)

  // Sample where the reader is, continuously and cheaply, so the effect below has an answer that
  // predates the DOM change it is reacting to.
  useEffect(() => {
    const sample = () => {
      readerNearBottom.current = isNearBottom({
        scrollTop: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
      })
    }
    sample()
    window.addEventListener('scroll', sample, { passive: true })
    window.addEventListener('resize', sample)
    return () => {
      window.removeEventListener('scroll', sample)
      window.removeEventListener('resize', sample)
    }
  }, [])

  /**
   * R14's restore. Did we honour the mark? `null` = not decided yet, `true` = we scrolled,
   * `false` = there was no mark or its anchor is gone. Read by the effect below, which must not
   * jump to the newest message on a mount we already positioned.
   *
   * A LAYOUT effect, unlike everything else on this screen: it runs before the browser paints, so
   * the runner never sees the bottom of the conversation flash past on the way to where they were.
   * The `requestAnimationFrame` re-application is not belt-and-braces — a web font settling or
   * phase 6's images finishing decode moves the anchor after layout, and re-deriving the same pure
   * number from the anchor's new position is the entire reason the mark stores a message and an
   * offset instead of a pixel.
   */
  const restoredRef = useRef<boolean | null>(null)

  useLayoutEffect(() => {
    if (restoreMark === null) {
      restoredRef.current = false
      return
    }

    const apply = (): boolean => {
      const anchor = readAnchorRows().find((row) => row.messageId === restoreMark.messageId)
      const top = resolveRestoreTop({
        mark: restoreMark,
        anchorTop: anchor?.top ?? null,
        geometry: {
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight,
        },
      })
      if (top === null) return false
      window.scrollTo({ top, behavior: 'instant' })
      return true
    }

    restoredRef.current = apply()
    if (restoredRef.current !== true) return

    const frame = window.requestAnimationFrame(() => {
      apply()
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [restoreMark])

  useEffect(() => {
    const grew = messages.length > lastCount.current
    const startedTyping = typing && !lastTyping.current
    const viewportMoved = keyboardOverlapPx !== lastOverlap.current
    const first = !mounted.current

    const cause: ScrollCause | null = first
      ? 'mount'
      : grew && messages[messages.length - 1]?.role === 'user'
        ? 'own-message'
        : grew || startedTyping
          ? 'incoming'
          : viewportMoved
            ? 'viewport'
            : null

    mounted.current = true
    lastCount.current = messages.length
    lastTyping.current = typing
    lastOverlap.current = keyboardOverlapPx
    if (cause === null) return

    /*
     * R14. The layout effect above already put this screen where the runner left it, so the
     * mount's jump to the newest message must not run. Only 'mount' is suppressed: a bubble
     * arriving after the restore, or the keyboard opening, is a live event and still moves the
     * page under phase 4's rules. `isNearBottom` is re-sampled because the restore moved us
     * without firing a scroll event the sampler could see.
     */
    if (cause === 'mount' && restoredRef.current === true) {
      readerNearBottom.current = isNearBottom({
        scrollTop: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
      })
      return
    }

    const decision = decideAutoScroll({
      cause,
      readerNearBottom: readerNearBottom.current,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (decision === 'none') return

    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: decision === 'jump' ? 'instant' : 'smooth',
    })
    // A jump lands at the bottom, so the sample is stale by one frame; correct it now rather than
    // wait for a scroll event that an 'instant' scroll may not fire.
    readerNearBottom.current = true
  }, [messages, typing, keyboardOverlapPx])

  /*
   * The candidate set every quote resolves against: the rows on this screen and nothing else. A
   * `reply_to_id` pointing outside it — deleted, or older than `CHAT_HISTORY_LIMIT` — resolves to
   * null and the message renders as plain text, which is the documented degradation and the reason
   * `resolveQuote` returns null instead of throwing.
   *
   * Memoised on `messages` because it is O(n) and this component re-renders on every state change
   * the screen makes (typing, keyboard, reveal), not only when a row arrives.
   *
   * `hasImage` / `hasRun` are computed HERE and nowhere else (RULING E2b). This is the one module
   * that already imports `ChatMessage`, so it is the one module that may know the field names:
   * phase 6's `imageUrls` is plural and phase 8's `attachment` is an object, and
   * `lib/nina/reply.ts` knows about neither. `hasRun` is the LITERAL `false` at phase 7's landing,
   * because `ChatMessage.attachment` does not exist yet and `tsc` would say so. Phase 8's one-line
   * edit here is `hasRun: message.attachment != null` — it flips one boolean and the run branch of
   * `quoteMediaOf`, already shipped and already tested, starts firing. That is the entire cost of
   * shipping a reachable-but-dead branch now, and it is why no later phase touches
   * `lib/nina/reply.ts`.
   */
  const candidates = useMemo<QuoteCandidate[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        mine: message.role === 'user',
        text: message.body,
        hasImage: (message.imageUrls?.length ?? 0) > 0,
        hasRun: message.attachment != null, // phase 8, wired here — see the block above
      })),
    [messages],
  )

  return (
    <div className="space-y-5">
      {groupIntoDays(messages).map((day) => (
        <section key={day.dayISO}>
          <h2 className="text-center text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)}
          </h2>
          {/* 8px between bubbles: on the 4pt base (4, 8, 12, 16, 22, 28) even though `space-y-2`
              is a step this codebase had not needed before a conversation existed. */}
          <ul className="mt-3 space-y-2">
            {day.messages.map((message) => (
              /*
               * The `above` slot's two-branch stack (RULING E2), widened here by phase 8 from
               * phase 6's images-only branch. Phase 7's quote gets its own `quote` prop on
               * `MessageBubble` and is never nested in here, so the render order inside the bubble
               * is quote stub -> images -> run card -> text.
               *
               * Each inset block owns its own `mb-2` — the gap to the message text below the slot,
               * which is what lets a single-block `above` render with no wrapper margin — while
               * the wrapper's `space-y-2` is the gap BETWEEN the blocks when there are two.
               */
              <MessageBubble
                key={message.id}
                message={message}
                quote={resolveQuote(message.replyToId, candidates)}
                above={
                  (message.imageUrls != null && message.imageUrls.length > 0) ||
                  message.attachment != null ? (
                    <div className="space-y-2">
                      {message.imageUrls != null && message.imageUrls.length > 0 ? (
                        <ChatImages urls={message.imageUrls} />
                      ) : null}
                      {message.attachment != null ? (
                        <RunAttachmentCard attachment={message.attachment} />
                      ) : null}
                    </div>
                  ) : undefined
                }
                flash={message.id === flashId}
                onReply={onReply}
                onJumpToQuote={onJumpToQuote}
                onRequestActions={onRequestActions}
              />
            ))}
          </ul>
        </section>
      ))}

      {typing && (
        <ul className="space-y-2">
          <TypingIndicator />
        </ul>
      )}
    </div>
  )
}
