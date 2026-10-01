// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuoteScroll } from '@/lib/nina/reply'

import { useChatPhotoFollow } from './useChatPhotoFollow'

/**
 * R2's rule, at DOM level. The scroll ARITHMETIC is `planQuoteScroll`'s and is proven in
 * `lib/nina/reply.test.ts` as a pure function; the measurement is `useQuoteLanding`'s. What is
 * left over — and what this file proves — is WHEN the follow fires: not for the bubble the overlay
 * was opened on, once per change of owner, never twice for the same one, and not at all when the
 * bubble is outside the rendered window.
 *
 * `planScroll` is injected, which is the point of the hook taking it as an argument: no composer,
 * no anchors and no layout are needed to state the rule, and happy-dom lays nothing out anyway.
 */

function Probe({
  messageId,
  planScroll,
}: {
  messageId: string | null
  planScroll: (targetId: string) => QuoteScroll | null
}) {
  useChatPhotoFollow({ messageId, planScroll })
  return null
}

const scrollTo = (top: number): QuoteScroll => ({ kind: 'scroll', top, behavior: 'instant' })

afterEach(() => {
  // Each test spies on `window.scrollTo` fresh; restore before the next one spies again, or the
  // count includes calls the previous test's own spy already recorded.
  vi.restoreAllMocks()
})

describe('useChatPhotoFollow', () => {
  it('moves nothing for the bubble the overlay was opened on', () => {
    // The runner tapped a photograph in it, so it is on screen by definition — and moving the page
    // under an overlay they just opened would cost them the position they came from.
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const planScroll = vi.fn(() => scrollTo(900))

    render(<Probe messageId="m1" planScroll={planScroll} />)

    expect(spy).not.toHaveBeenCalled()
    expect(planScroll).not.toHaveBeenCalled()
  })

  it('scrolls to the new owner, instantly, when a swipe crosses into another bubble', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const planScroll = vi.fn(() => scrollTo(1240))

    const { rerender } = render(<Probe messageId="m1" planScroll={planScroll} />)
    rerender(<Probe messageId="m3" planScroll={planScroll} />)

    expect(planScroll).toHaveBeenCalledWith('m3')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ top: 1240, behavior: 'instant' })
  })

  it('does nothing while the paging stays inside one bubble', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const planScroll = vi.fn(() => scrollTo(1240))

    const { rerender } = render(<Probe messageId="m1" planScroll={planScroll} />)
    rerender(<Probe messageId="m3" planScroll={planScroll} />)
    rerender(<Probe messageId="m3" planScroll={planScroll} />)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the owning bubble is outside the rendered window', () => {
    // `measureQuoteScroll` returns null when `#nina-msg-<id>` is not in the document. That is the
    // degradation path, not an error: there is nothing to scroll to, and nothing to say about it
    // from behind a full-screen overlay.
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    const { rerender } = render(<Probe messageId="m1" planScroll={() => null} />)
    rerender(<Probe messageId="m3" planScroll={() => null} />)

    expect(spy).not.toHaveBeenCalled()
  })

  it('does nothing when the plan says the bubble is already in the readable band', () => {
    // `planQuoteScroll` answers `{ kind: 'none' }` inside its 8px tolerance.
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const planScroll = vi.fn((): QuoteScroll => ({ kind: 'none' }))

    const { rerender } = render(<Probe messageId="m1" planScroll={planScroll} />)
    rerender(<Probe messageId="m3" planScroll={planScroll} />)

    expect(planScroll).toHaveBeenCalledWith('m3')
    expect(spy).not.toHaveBeenCalled()
  })

  it('starts fresh after the overlay closes, so re-opening elsewhere does not jump', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const planScroll = vi.fn(() => scrollTo(1240))

    const { rerender } = render(<Probe messageId="m1" planScroll={planScroll} />)
    rerender(<Probe messageId={null} planScroll={planScroll} />)
    rerender(<Probe messageId="m9" planScroll={planScroll} />)

    expect(spy).not.toHaveBeenCalled()
  })
})
