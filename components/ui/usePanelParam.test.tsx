// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePanelParam } from './usePanelParam'

/**
 * The open detail panel, held in the URL. The hook's whole design is three verbs with three
 * different history effects — `open` PUSHES (so the back gesture closes the panel),
 * `setExpanded` REPLACES (a pushed list entry would cost a second back-swipe and collapse the
 * list the runner came back to see), and `close` undoes the entry ONLY when this mount pushed
 * one, falling back to replaceState for a deep link or a return from `/r/<id>`. The tests here
 * hold each verb to its own effect, plus the `pushedRef` reset that lets a back gesture hand
 * close back to the replace branch.
 *
 * `useSearchParams` is mocked to read a controlled query string, because the hook's own contract
 * with Next 16 is `window.history` — verified against this repo's bundled docs, per the file's
 * header — so what is under test is the hook's history traffic, not the router's.
 */

const { queryString } = vi.hoisted(() => ({ queryString: { current: '' } }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(queryString.current),
}))

function renderPanelParam() {
  return renderHook(() => usePanelParam())
}

/** Point the mocked search params at a new query and re-render the hook. */
function navigateTo(query: string, utils: ReturnType<typeof renderPanelParam>) {
  queryString.current = query
  act(() => {
    utils.rerender()
  })
}

describe('usePanelParam — reading', () => {
  beforeEach(() => {
    queryString.current = ''
  })

  it('no parameter: nothing open, nothing expanded', () => {
    const { result } = renderPanelParam()

    expect(result.current.selection).toBeNull()
    expect(result.current.expanded).toBe(false)
  })

  it('?panel=badge.early_bird names a badge panel', () => {
    queryString.current = '?panel=badge.early_bird'
    const { result } = renderPanelParam()

    expect(result.current.selection).toEqual({ kind: 'badge', key: 'early_bird' })
  })

  it('?panel=record.most_kcal names a record panel — one parameter, not one per surface', () => {
    queryString.current = '?panel=record.most_kcal'
    const { result } = renderPanelParam()

    expect(result.current.selection).toEqual({ kind: 'record', key: 'most_kcal' })
  })

  it('a URL is user-typed input: malformed values close rather than crash', () => {
    queryString.current = '?panel=badge.'
    const { result } = renderPanelParam()
    expect(result.current.selection).toBeNull()
  })

  it('?dates=1 expands — but only when a panel is actually open', () => {
    queryString.current = '?panel=badge.early_bird&dates=1'
    const { result } = renderPanelParam()
    expect(result.current.expanded).toBe(true)
  })

  it('?dates=1 with no panel expands nothing — the flag is subordinate to panel', () => {
    queryString.current = '?dates=1'
    const { result } = renderPanelParam()

    expect(result.current.selection).toBeNull()
    expect(result.current.expanded).toBe(false)
  })

  it('any dates value but 1 is shut — one spelling means one thing', () => {
    queryString.current = '?panel=badge.x&dates=true'
    const { result } = renderPanelParam()

    expect(result.current.expanded).toBe(false)
  })
})

describe('usePanelParam — open', () => {
  beforeEach(() => {
    queryString.current = ''
  })

  it('pushes ONE entry the back gesture can undo, with the date list shut', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.open({ kind: 'badge', key: 'early_bird' })
    })

    expect(pushState).toHaveBeenCalledWith(null, '', '?panel=badge.early_bird')
    expect(window.location.search).toBe('?panel=badge.early_bird')
    pushState.mockRestore()
  })

  it('opening a second badge replaces the value and drops the first badge’s expanded list', () => {
    queryString.current = '?panel=badge.old&dates=1'
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.open({ kind: 'badge', key: 'other' })
    })

    // A fresh open shows the badge, not the last badge's dates.
    expect(pushState).toHaveBeenCalledWith(null, '', '?panel=badge.other')
    pushState.mockRestore()
  })

  it('a future query parameter survives a panel opening on top of it', () => {
    queryString.current = '?tab=week&panel=badge.old'
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.open({ kind: 'badge', key: 'other' })
    })

    expect(pushState).toHaveBeenCalledWith(null, '', '?tab=week&panel=badge.other')
    pushState.mockRestore()
  })
})

describe('usePanelParam — setExpanded', () => {
  beforeEach(() => {
    queryString.current = '?panel=badge.x'
  })

  it('replaces in place — never a second history entry', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.setExpanded(true)
    })

    expect(replaceState).toHaveBeenCalledWith(null, '', '?panel=badge.x&dates=1')
    expect(pushState).not.toHaveBeenCalled()
    replaceState.mockRestore()
    pushState.mockRestore()
  })

  it('collapsing drops the parameter rather than writing dates=0', () => {
    queryString.current = '?panel=badge.x&dates=1'
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.setExpanded(false)
    })

    expect(replaceState).toHaveBeenCalledWith(null, '', '?panel=badge.x')
    replaceState.mockRestore()
  })

  it('no panel open: a no-op — ?dates=1 never lands on a bare /me', () => {
    queryString.current = ''
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.setExpanded(true)
    })

    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    replaceState.mockRestore()
    pushState.mockRestore()
  })

  it('other parameters survive the round trip', () => {
    queryString.current = '?tab=week&panel=badge.x'
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.setExpanded(true)
    })

    expect(replaceState).toHaveBeenCalledWith(null, '', '?tab=week&panel=badge.x&dates=1')
    replaceState.mockRestore()
  })
})

describe('usePanelParam — close', () => {
  beforeEach(() => {
    queryString.current = ''
  })

  it('closes what we pushed with history.back — no dead entry left behind', () => {
    const back = vi.spyOn(window.history, 'back')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.open({ kind: 'badge', key: 'x' })
    })
    act(() => {
      result.current.close()
    })

    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
    back.mockRestore()
    replaceState.mockRestore()
  })

  it('a deep link was not ours to pop: close replaces in place, dropping both parameters', () => {
    queryString.current = '?panel=badge.deep'
    const back = vi.spyOn(window.history, 'back')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderPanelParam()

    act(() => {
      result.current.close()
    })

    // back() here would navigate OFF the app — replaceState drops the parameter instead.
    expect(replaceState).toHaveBeenCalledWith(null, '', window.location.pathname)
    expect(back).not.toHaveBeenCalled()
    back.mockRestore()
    replaceState.mockRestore()
  })

  it('after the back gesture closed the panel for us, close() has no entry of ours left to pop', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    const utils = renderPanelParam()

    act(() => {
      utils.result.current.open({ kind: 'badge', key: 'x' })
    })
    expect(back).not.toHaveBeenCalled()

    // The gesture pops the entry `open` pushed and the router reports the parameter gone:
    // the hook's effect must then reset pushedRef, or close() would back() into the run
    // the runner just came from.
    navigateTo('?panel=badge.x', utils)
    navigateTo('', utils)

    act(() => {
      utils.result.current.close()
    })

    expect(replaceState).toHaveBeenCalledWith(null, '', window.location.pathname)
    // The stubbed back() was never touched: the gesture (simulated above) is the only thing
    // that ever pops this entry, and pushedRef's reset is what kept close() off it.
    expect(back).not.toHaveBeenCalled()
    back.mockRestore()
    replaceState.mockRestore()
  })
})
