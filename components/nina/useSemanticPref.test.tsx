// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The hook under test, with its REAL store: happy-dom ships localStorage, and the key and codec
// are lib/nina/search's — round-tripping through them is how the persistence promise is pinned
// without this file learning (and hardcoding) the encoding.
import { useSemanticPref } from './useSemanticPref'
import { NINA_SEMANTIC_PREF_KEY, decodeSemanticPref } from '@/lib/nina/search'

function Toggle() {
  const [semantic, setSemantic] = useSemanticPref()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={semantic}
      onClick={() => setSemantic(!semantic)}
    >
      AI
    </button>
  )
}

function toggle() {
  return screen.getByRole('switch')
}

afterEach(() => {
  // The unavailable-store test swaps the store out from under `window`; restore the real one
  // BEFORE anything clears it — the fake has no `clear` to call.
  if (realLocalStorage) {
    Object.defineProperty(window, 'localStorage', realLocalStorage)
    realLocalStorage = undefined
  }
  window.localStorage.clear()
  vi.restoreAllMocks()
})

let realLocalStorage: PropertyDescriptor | undefined

describe('useSemanticPref', () => {
  it('starts off — the server render and the first client paint agree by construction', () => {
    render(<Toggle />)
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem(NINA_SEMANTIC_PREF_KEY)).toBeNull()
  })

  it('ON persists through the real key, and decodes back to ON', () => {
    render(<Toggle />)
    fireEvent.click(toggle())

    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    const stored = window.localStorage.getItem(NINA_SEMANTIC_PREF_KEY)
    expect(stored).not.toBeNull()
    expect(decodeSemanticPref(stored)).toBe(true)
  })

  it('OFF removes the key rather than storing a negative', () => {
    render(<Toggle />)
    fireEvent.click(toggle())
    fireEvent.click(toggle())

    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem(NINA_SEMANTIC_PREF_KEY)).toBeNull()
  })

  it('a storage event from ANOTHER tab moves a mounted hook — two tabs never disagree', () => {
    render(<Toggle />)
    expect(toggle()).toHaveAttribute('aria-checked', 'false')

    // The other tab wrote its own value; `storage` fires here, in every OTHER document.
    window.localStorage.setItem(NINA_SEMANTIC_PREF_KEY, '1')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: NINA_SEMANTIC_PREF_KEY }))
    })

    expect(toggle()).toHaveAttribute('aria-checked', 'true')
  })

  it('a storage event for a different key is ignored', () => {
    render(<Toggle />)
    window.localStorage.setItem('something-else', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
  })

  it('an unavailable store degrades to tab-lifetime memory — the toggle still works', () => {
    // THE LAST destructive test in the file: the hook's fallback is module-level by design (it has
    // to outlive a mount), so this poisons the module for everyone after it — nothing follows.
    // happy-dom's store is its own class, so the store itself is swapped, not `Storage.prototype`.
    realLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
    let refused = false
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          refused = true
          throw new Error('Safari private mode')
        },
        removeItem: () => {},
      },
    })
    render(<Toggle />)

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    expect(refused).toBe(true)
    // The store never got the write, so the degradation is "not persisted" — never "stops
    // responding", and never a broken control.
  })
})
