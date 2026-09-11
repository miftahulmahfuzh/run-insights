// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The hook's DOM half: `next/navigation` is the one mock (the URL reads come through
// `useSearchParams`, which needs a router scope this renderer lacks) — the history writes, the
// anchor query and the codec stay real, because `saveMark` writing THIS entry is the contract.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import { readAnchorRows, useChatScrollMark } from './useChatScroll'
import { CHAT_SCROLL_PARAM, type ChatScrollMark } from '@/lib/nina/scroll'

let latest: { mark: ChatScrollMark | null; saveMark: () => void } | null = null

function Probe() {
  latest = useChatScrollMark()
  return null
}

function anchors(ids: string[]) {
  for (const id of ids) {
    const el = document.createElement('div')
    el.id = `nina-msg-${id}`
    document.body.appendChild(el)
  }
}

afterEach(() => {
  for (const el of document.querySelectorAll('[id^="nina-msg-"]')) el.remove()
  window.history.replaceState(null, '', '/nina')
})

describe('readAnchorRows', () => {
  it('returns the rendered messages in document order, ids sliced clean', () => {
    anchors(['msg000000003', 'msg000000001', 'msg000000002'])
    const rows = readAnchorRows()
    expect(rows.map((row) => row.messageId)).toEqual([
      'msg000000003',
      'msg000000001',
      'msg000000002',
    ])
    // happy-dom lays nothing out, so every rect is 0 — the document coordinate is scrollY + 0.
    expect(rows.every((row) => row.top === 0)).toBe(true)
  })
})

describe('useChatScrollMark', () => {
  it('reads the mark on this history entry through the real codec', () => {
    window.history.replaceState(null, '', `/nina?${CHAT_SCROLL_PARAM}=msg000000001~120`)
    render(<Probe />)
    expect(latest?.mark).toEqual({ messageId: 'msg000000001', offset: 120 })
  })

  it('no parameter, no mark — the ordinary entry has nothing to restore', () => {
    render(<Probe />)
    expect(latest?.mark).toBeNull()
  })

  it('saveMark measures now and writes the mark onto THIS entry', () => {
    anchors(['msg000000001'])
    render(<Probe />)

    latest?.saveMark()
    // Every anchor sits at document coordinate 0 under happy-dom, so the first row is the pick
    // and the offset is 0 — written through `history.replaceState`, REPLACE, never a push.
    // (`URLSearchParams` spells the offset separator percent-encoded on the wire.)
    expect(window.location.search).toBe(`?${CHAT_SCROLL_PARAM}=msg000000001%7E0`)
  })

  it('saveMark with nothing to anchor DELETES the parameter instead of writing a fake mark', () => {
    window.history.replaceState(null, '', `/nina?${CHAT_SCROLL_PARAM}=msg000000009~40`)
    render(<Probe />)

    latest?.saveMark()
    expect(window.location.search).toBe('')
  })

  it('the write preserves whatever else lives on the entry', () => {
    window.history.replaceState(null, '', `/nina?s=sess-1`)
    anchors(['msg000000001'])
    render(<Probe />)

    latest?.saveMark()
    expect(window.location.search).toContain('s=sess-1')
    const written = new URLSearchParams(window.location.search).get(CHAT_SCROLL_PARAM)
    expect(written).toBe('msg000000001~0')
  })
})
