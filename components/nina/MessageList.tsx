'use client'

import { useEffect, useRef } from 'react'

import { formatDayCompact } from '@/lib/format'
import {
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  type ScrollCause,
} from '@/lib/nina/chatview'
import { ChatImages } from './ChatImages'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import type { ChatMessage } from './types'

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
}: {
  messages: readonly ChatMessage[]
  /** True while a turn is in flight, and between bubbles of a staggered reveal. */
  typing: boolean
  /** Computed on the server so "Today" cannot disagree between render and hydration. */
  todayISO: string
  /** Changes when the software keyboard opens or closes; a reason to re-check the scroll. */
  keyboardOverlapPx: number
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
               * The `above` slot's images-only branch (RULING E2). Phase 8 widens THIS expression
               * into the two-branch stack — `<div className="space-y-2">` wrapping `ChatImages`
               * and `RunAttachmentCard` — rather than writing a shape of its own; phase 7's quote
               * gets its own `quote` prop on `MessageBubble` and is never nested in here.
               */
              <MessageBubble
                key={message.id}
                message={message}
                above={
                  message.imageUrls != null && message.imageUrls.length > 0 ? (
                    <ChatImages urls={message.imageUrls} />
                  ) : undefined
                }
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
