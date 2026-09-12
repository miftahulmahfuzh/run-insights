'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { decideAutoScroll, isNearBottom, type ScrollCause } from '@/lib/nina/chatview'
import { resolveRestoreTop, type ChatScrollMark } from '@/lib/nina/scroll'
import { readAnchorRows } from './useChatScroll'

/**
 * The conversation page's scroll behaviour: where the reader is, where the history entry was
 * left, and when the page follows new content to the bottom. Extracted from `MessageList`, which
 * keeps the composition (day grouping, quote resolution, the above slot) and knows nothing about
 * scrolling beyond feeding this hook its inputs.
 *
 * The scroll knowledge is now a three-way split, and this hook is one third of it:
 *
 *   - `lib/nina/chatview.ts` — the pure arithmetic (`decideAutoScroll`, `isNearBottom`), asserted
 *     by its own tests.
 *   - `useChatScroll.ts` — the URL-mark half of R14: reading anchors and writing the mark the
 *     runner's history entry carries. `ChatScreen` owns it; this hook only consumes
 *     `readAnchorRows` and the mark it is handed.
 *   - this file — the behaviour half: sampling, restoring, following.
 *
 * ── WHY THE "WAS HE AT THE BOTTOM" ANSWER IS SAMPLED, NOT MEASURED IN THE EFFECT ──────────────
 * By the time an effect runs, the new bubble is already in the DOM and `scrollHeight` already
 * includes it, so measuring the distance to the bottom *then* always says "far away" and would
 * turn rule 3 of `decideAutoScroll` into "never follow". A passive `scroll` listener keeps the
 * answer up to date instead, and the effect reads the last sample. The listener does no work
 * beyond one comparison, and it holds a ref rather than state so a scroll never re-renders the
 * list.
 *
 * ── WHY THE INPUTS ARE PRIMITIVES, NOT THE MESSAGES ARRAY ─────────────────────────────────────
 * The hook takes `messageCount` and `lastMessageIsFromUser` rather than `messages`. Partly that is
 * RULING E2b's locality kept true — `MessageList` remains the one module that knows
 * `ChatMessage`'s field names — and partly it is honesty about what the cause derivation actually
 * reads: the row count and the last row's sender. The old effect re-ran on every `messages`
 * identity change, including in-place edits that change neither; those runs re-synced refs from
 * the very values this hook now takes as props and returned on a null cause, so skipping them is
 * outcome-identical. The behaviour to preserve is the CAUSE TABLE below, and every cause input is
 * a dependency here by name.
 */
export function useChatPageScroll({
  messageCount,
  lastMessageIsFromUser,
  typing,
  keyboardOverlapPx,
  restoreMark,
}: {
  /** `messages.length` — the growth signal behind the `own-message` and `incoming` causes. */
  messageCount: number
  /** Whether the LAST row is his (`role === 'user'`); turns a growth into `own-message`. */
  lastMessageIsFromUser: boolean
  /** True while a turn is in flight, and between bubbles of a staggered reveal. */
  typing: boolean
  /** Changes when the software keyboard opens or closes; a reason to re-check the scroll. */
  keyboardOverlapPx: number
  /**
   * Phase 8 (R14). The position this history entry was left at, or null. **When it is honoured,
   * the mount's jump-to-newest is skipped** — that jump is `decideAutoScroll`'s correct answer for
   * arriving at a conversation and the wrong answer for coming back to one.
   */
  restoreMark: ChatScrollMark | null
}) {
  const readerNearBottom = useRef(true)
  const mounted = useRef(false)
  const lastCount = useRef(messageCount)
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
    const grew = messageCount > lastCount.current
    const startedTyping = typing && !lastTyping.current
    const viewportMoved = keyboardOverlapPx !== lastOverlap.current
    const first = !mounted.current

    const cause: ScrollCause | null = first
      ? 'mount'
      : grew && lastMessageIsFromUser
        ? 'own-message'
        : grew || startedTyping
          ? 'incoming'
          : viewportMoved
            ? 'viewport'
            : null

    mounted.current = true
    lastCount.current = messageCount
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
  }, [messageCount, lastMessageIsFromUser, typing, keyboardOverlapPx])
}
