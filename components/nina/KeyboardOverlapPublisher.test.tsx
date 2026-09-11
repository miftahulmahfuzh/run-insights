// @vitest-environment happy-dom
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Real `keyboardOverlapPx`: the 120px URL-bar floor and the pinch-zoom guard are the semantics
// under test, and the publisher's job is to run them on the ONE subscription and broadcast the
// answer — to the var and to the callback, in the same synchronous stroke.
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
import { NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'

type Listener = (event: Event) => void

/** A controllable `visualViewport`: the test moves it and fires its events by hand. */
function makeViewport() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    height: 800,
    offsetTop: 0,
    scale: 1,
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener)
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener(new Event(type))
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

let viewport = makeViewport()
const realDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')

function install(innerHeight: number) {
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
}

function rootVar() {
  return document.documentElement.style.getPropertyValue(NINA_KEYBOARD_OVERLAP_VAR)
}

afterEach(() => {
  document.documentElement.style.removeProperty(NINA_KEYBOARD_OVERLAP_VAR)
  viewport = makeViewport()
  if (realDescriptor) Object.defineProperty(window, 'visualViewport', realDescriptor)
})

describe('KeyboardOverlapPublisher', () => {
  it('a keyboard overlap reaches the var and the callback in the same synchronous stroke', () => {
    install(800)
    viewport.height = 560 // 800 − 560 − 0 = 240 ≥ KEYBOARD_MIN_PX
    const onOverlap = vi.fn()
    render(<KeyboardOverlapPublisher onOverlap={onOverlap} />)

    expect(rootVar()).toBe('240px')
    // Called by the mount-time sync, not by an event — the first measurement owes no frame.
    expect(onOverlap).toHaveBeenCalledWith(240)
  })

  it('below the 120px floor (the URL bar) nothing is published — removed, not zeroed', () => {
    install(800)
    viewport.height = 790 // overlap 10
    render(<KeyboardOverlapPublisher />)
    expect(rootVar()).toBe('')
    expect(document.documentElement.style.getPropertyValue(NINA_KEYBOARD_OVERLAP_VAR)).toBe('')
  })

  it('a pinch-zoom is not a keyboard: scale above 1 publishes nothing', () => {
    install(800)
    viewport.height = 560
    viewport.scale = 2
    render(<KeyboardOverlapPublisher />)
    expect(rootVar()).toBe('')
  })

  it('resize re-measures in place — the same subscription, a new answer', () => {
    install(800)
    viewport.height = 790
    const onOverlap = vi.fn()
    render(<KeyboardOverlapPublisher onOverlap={onOverlap} />)
    expect(rootVar()).toBe('')

    viewport.height = 560
    act(() => {
      viewport.fire('resize')
    })
    expect(rootVar()).toBe('240px')
    // A scroll that moves nothing still reports, but reports the SAME number: the internal
    // setState bails out, so no consumer re-renders and the var is rewritten with itself.
    act(() => {
      viewport.fire('scroll')
    })
    expect(rootVar()).toBe('240px')
    expect(onOverlap).toHaveBeenLastCalledWith(240)
  })

  it('the subscription is EMPTY-DEPS: a new onOverlap never re-subscribes, but is the one heard', () => {
    install(800)
    viewport.height = 560
    const first = vi.fn()
    const { rerender } = render(<KeyboardOverlapPublisher onOverlap={first} />)
    const subscribed = viewport.listenerCount('resize') + viewport.listenerCount('scroll')

    const second = vi.fn()
    rerender(<KeyboardOverlapPublisher onOverlap={second} />)
    expect(viewport.listenerCount('resize') + viewport.listenerCount('scroll')).toBe(subscribed)

    act(() => {
      viewport.fire('resize')
    })
    expect(second).toHaveBeenCalledWith(240)
    // The latest-ref means the stale closure is never called again.
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('unmount removes the var — nothing leaks onto the route the runner navigated to', () => {
    install(800)
    viewport.height = 560
    const { unmount } = render(<KeyboardOverlapPublisher />)
    expect(rootVar()).toBe('240px')

    unmount()
    expect(rootVar()).toBe('')
  })

  it('with no visualViewport at all it subscribes to nothing and publishes nothing', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    render(<KeyboardOverlapPublisher />)
    expect(rootVar()).toBe('')
  })
})
