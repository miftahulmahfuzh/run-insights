// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn(), replace: vi.fn() }),
}))

// The real constants: the point of this component is that it routes on ONE of the two strings the
// worker posts and ignores the other, so importing them keeps the test honest if either moves.
import { SW_MESSAGE_TYPE, SW_NAVIGATE_MESSAGE_TYPE } from '@/lib/nina/live'
import { PushTapNavigator } from './PushTapNavigator'

/**
 * The component is one listener and one call. What is pinned here is the decision tree around it:
 * WHICH message routes, which does not, which url is refused, and that the listener goes away with
 * the component. `navigator.serviceWorker` is a hand-rolled container stub because happy-dom has
 * none — the same `defineProperty` / `delete` idiom `PushSetupCard.test.tsx` uses.
 */
function installContainer() {
  const listeners = new Set<(event: MessageEvent) => void>()
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.add(listener)
      },
      removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.delete(listener)
      },
    },
    configurable: true,
  })
  return {
    count: () => listeners.size,
    post: (data: unknown) => {
      /* A copy, so a listener that removes itself mid-dispatch cannot corrupt the walk. */
      for (const listener of [...listeners]) listener({ data } as MessageEvent)
    },
  }
}

beforeEach(() => {
  routerPush.mockReset()
})

afterEach(() => {
  /*
   * This project's afterEach hooks run in REVERSE registration order, so the global
   * `afterEach(cleanup)` in `tests/support/setup.ts` would unmount AFTER this hook deleted
   * `navigator.serviceWorker` — and the component's own cleanup effect calls
   * `navigator.serviceWorker.removeEventListener(...)`, which throws on `undefined`. Unmounting
   * here, before the delete, keeps the deletion order correct regardless of registration order.
   */
  cleanup()
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('PushTapNavigator', () => {
  it('publishes nothing — it is a listener wearing a component', () => {
    installContainer()
    const { container } = render(<PushTapNavigator />)
    expect(container.firstElementChild).toBeNull()
  })

  it('routes to the url the worker sent with the tap', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: '/nina?s=sess-1&jump=msg-2' })

    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/nina?s=sess-1&jump=msg-2')
  })

  it('ignores the live-arrival message — every push posts that one to every window', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    /* If this routed, the app would navigate on ARRIVAL rather than on a tap: `nina:new` goes to
     * every open window on every single push, which is `ChatScreen`'s refresh signal, not a
     * destination. */
    sw.post({ type: SW_MESSAGE_TYPE })
    sw.post({ type: SW_MESSAGE_TYPE, url: '/nina' })

    expect(routerPush).not.toHaveBeenCalled()
  })

  it('ignores anything that is not a message of this shape', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    sw.post(null)
    sw.post('nina:navigate')
    sw.post({ url: '/nina' })
    sw.post({ type: 'some-other-worker', url: '/nina' })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: 42 })

    expect(routerPush).not.toHaveBeenCalled()
  })

  it('refuses a url that is not a same-origin path', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    /* A registered worker outlives the deploy that shipped it, and the string came off the
     * network. `//host/path` is the one that matters: it starts with `/` and is not us. */
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: 'https://evil.example/nina' })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: '//evil.example/nina' })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: 'nina' })

    expect(routerPush).not.toHaveBeenCalled()
  })

  it('takes its listener with it when it unmounts', () => {
    const sw = installContainer()
    const { unmount } = render(<PushTapNavigator />)
    expect(sw.count()).toBe(1)

    unmount()
    expect(sw.count()).toBe(0)

    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: '/nina' })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('renders on a browser with no service worker at all', () => {
    /* No `installContainer()`: `/login` in a browser that has never heard of a service worker still
     * has to render, and the guard is what makes the root layout safe to mount this from. */
    const { container } = render(<PushTapNavigator />)
    expect(container.firstElementChild).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
