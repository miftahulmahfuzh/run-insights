'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import {
  CHAT_SCROLL_PARAM,
  decodeChatScrollMark,
  encodeChatScrollMark,
  pickScrollAnchor,
  type ChatScrollMark,
  type ScrollAnchorRow,
} from '@/lib/nina/scroll'

/**
 * R14's DOM half. Two jobs, and not one line of arithmetic between them.
 *
 * ── READING THE ANCHORS ───────────────────────────────────────────────────────────────────────
 * Phase 4 put `id={`nina-msg-${message.id}`}` on every `<li>` in `MessageBubble`, and phase 7 uses
 * it to jump to a quote's target. That attribute is also the whole reason this phase does not need
 * a ref registry, a context, or an observer:
 * `document.querySelectorAll('[id^="nina-msg-"]')` returns the rendered messages in document
 * order, which is exactly `pickScrollAnchor`'s input contract.
 *
 * ── WRITING THE MARK ──────────────────────────────────────────────────────────────────────────
 * `window.history.replaceState`, the F24 idiom (`components/ui/usePanelParam.ts`): a
 * `URLSearchParams` copy of the current query so a future parameter on `/nina` survives, `null`
 * state so Next's patched history keeps its own `__NA` marker, and REPLACE rather than push —
 * pushing here would cost the runner an extra back-swipe to leave the chat and would put a second
 * `/nina` entry between them and the run they are about to open.
 *
 * `saveMark` reads `window.location.search` rather than the `searchParams` snapshot: the write has
 * to be against whatever the URL is at the moment of the tap, and a stale render closure is the
 * classic way that goes wrong.
 */

/** `[id^="nina-msg-"]` in document order, in document coordinates. */
export function readAnchorRows(): ScrollAnchorRow[] {
  const nodes = document.querySelectorAll<HTMLElement>('[id^="nina-msg-"]')
  const scrollY = window.scrollY
  const rows: ScrollAnchorRow[] = []
  for (const node of nodes) {
    rows.push({
      messageId: node.id.slice('nina-msg-'.length),
      top: node.getBoundingClientRect().top + scrollY,
    })
  }
  return rows
}

export function useChatScrollMark(): {
  /** The mark on this history entry, or null. Decoded once per render of the URL. */
  mark: ChatScrollMark | null
  /** Measure now and write the mark onto this entry. Call it as the runner leaves. */
  saveMark: () => void
} {
  const searchParams = useSearchParams()
  const raw = searchParams.get(CHAT_SCROLL_PARAM)

  const mark = useMemo(() => decodeChatScrollMark(raw), [raw])

  const saveMark = useCallback(() => {
    const next = pickScrollAnchor(readAnchorRows(), window.scrollY)
    const params = new URLSearchParams(window.location.search)
    if (next === null) params.delete(CHAT_SCROLL_PARAM)
    else params.set(CHAT_SCROLL_PARAM, encodeChatScrollMark(next))
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])

  return { mark, saveMark }
}
