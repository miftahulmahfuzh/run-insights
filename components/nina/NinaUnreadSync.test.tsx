// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, replace: vi.fn(), push: vi.fn() }),
}))

// Real `shouldRefreshUnreadDot`: the decision and its termination argument are lib/nina/unread.ts's,
// already unit-tested there. What this file owns is the effect and the ref — the tests below drive
// renders the way the app produces them and pin when exactly the one refresh fires.
import { NinaUnreadSync } from './NinaUnreadSync'

describe('NinaUnreadSync', () => {
  beforeEach(() => {
    routerRefresh.mockReset()
  })

  it('publishes nothing — it is an effect wearing a component', () => {
    const { container } = render(<NinaUnreadSync hadUnread={false} />)
    expect(container.firstElementChild).toBeNull()
  })

  it('a chat that opened with unread fires exactly one refresh', () => {
    const { rerender } = render(<NinaUnreadSync hadUnread />)
    expect(routerRefresh).toHaveBeenCalledTimes(1)
    // The refreshed render still reports unread (the count is from the same payload), and the
    // second setup sees its own value — the development double-invoke is harmless by construction.
    rerender(<NinaUnreadSync hadUnread />)
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it('a visit with nothing to clear costs nothing at all', () => {
    const { rerender } = render(<NinaUnreadSync hadUnread={false} />)
    rerender(<NinaUnreadSync hadUnread={false} />)
    rerender(<NinaUnreadSync hadUnread={false} />)
    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it('a false render is remembered, so a later arrival gets its own single refresh', () => {
    const { rerender } = render(<NinaUnreadSync hadUnread />)
    expect(routerRefresh).toHaveBeenCalledTimes(1)

    // The refresh lands; the dot is gone in the next payload.
    rerender(<NinaUnreadSync hadUnread={false} />)
    expect(routerRefresh).toHaveBeenCalledTimes(1)

    // A service-worker delivery flips the flag again — a genuine false → true, one refresh.
    rerender(<NinaUnreadSync hadUnread />)
    expect(routerRefresh).toHaveBeenCalledTimes(2)
    rerender(<NinaUnreadSync hadUnread />)
    expect(routerRefresh).toHaveBeenCalledTimes(2)
  })
})
