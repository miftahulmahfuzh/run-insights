// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The hook's DOM half: `next/navigation` is the one mock (the URL read comes through
// `useSearchParams`, which needs a router scope this renderer lacks) — the anchor query and the
// restore arithmetic stay real, on `useChatScroll.test.tsx`'s own precedent.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import { readJobAnchorRows, useJobListScrollRestore } from './useJobListScroll'

function Probe() {
  useJobListScrollRestore()
  return null
}

function rows(ids: string[]) {
  for (const id of ids) {
    const el = document.createElement('li')
    el.id = `nina-job-${id}`
    document.body.appendChild(el)
  }
}

afterEach(() => {
  // Each test spies on `window.scrollTo` fresh; restore before the next one spies again, or the
  // count includes calls the previous test's own spy already recorded.
  vi.restoreAllMocks()
  for (const el of document.querySelectorAll('[id^="nina-job-"]')) el.remove()
  window.history.replaceState(null, '', '/nina/jobs')
})

describe('readJobAnchorRows', () => {
  it('returns the rendered rows in document order, ids sliced clean', () => {
    rows(['job000000003', 'job000000001', 'job000000002'])
    const found = readJobAnchorRows()
    expect(found.map((row) => row.jobId)).toEqual(['job000000003', 'job000000001', 'job000000002'])
    // happy-dom lays nothing out, so every rect is 0 — the document coordinate is scrollY + 0.
    expect(found.every((row) => row.top === 0)).toBe(true)
  })
})

describe('useJobListScrollRestore', () => {
  it('scrolls to the resolved position when the anchor row is present', () => {
    window.history.replaceState(null, '', '/nina/jobs?at=job000000001~-40')
    rows(['job000000001'])
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(<Probe />)

    // anchorTop (0) - offset (-40), clamped into a 0-height happy-dom document → 0.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('does nothing when there is no mark on the entry', () => {
    rows(['job000000001'])
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(<Probe />)

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does nothing when the mark names a row that is not on the page', () => {
    window.history.replaceState(null, '', '/nina/jobs?at=job000000009~0')
    rows(['job000000001'])
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(<Probe />)

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
