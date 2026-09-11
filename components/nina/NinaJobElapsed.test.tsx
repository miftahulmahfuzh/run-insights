// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Real jobview math: `formatJobSeconds` and `jobElapsedSeconds` are the units this span speaks,
// and computing the expected strings from them (not retyping "1:05") is what keeps this test
// honest if the formatting ever changes.
import { NinaJobElapsed } from './NinaJobElapsed'
import { formatJobSeconds, jobElapsedSeconds } from '@/lib/nina/jobview'

const START = 1_790_000_000_000
const RENDER_NOW = START + 10_000

function elapsed() {
  return screen.getByText(/\d/).closest('span') as HTMLElement
}

describe('NinaJobElapsed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the first paint is the SERVER’s reading — no `Date.now()` in render', () => {
    // No fake timers here on purpose: if the component read the clock during render, this render
    // would differ from `nowMs` by whatever the test process spends between the two lines — the
    // exact hydration mismatch the prop exists to prevent.
    render(<NinaJobElapsed startedAtMs={START} nowMs={RENDER_NOW} running />)
    expect(elapsed().textContent).toBe(formatJobSeconds(10))
  })

  it('running: the wire-time correction lands on the first tick, then it counts', () => {
    vi.useFakeTimers()
    vi.setSystemTime(RENDER_NOW + 400) // the payload took 400ms to arrive
    render(<NinaJobElapsed startedAtMs={START} nowMs={RENDER_NOW} running />)
    expect(elapsed().textContent).toBe(formatJobSeconds(10))

    // The 0 ms timer re-derives from the browser clock: the owed correction, one tick after mount.
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(elapsed().textContent).toBe(formatJobSeconds(jobElapsedSeconds(START, Date.now())))

    // The interval keeps deriving — never incrementing — so a throttled tab catches up instead of
    // drifting: 2.5 s of timer time later, the value is the whole seconds of the real clock.
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(elapsed().textContent).toBe(formatJobSeconds(jobElapsedSeconds(START, Date.now())))
    expect(elapsed().textContent).toBe(formatJobSeconds(12))
  })

  it('not running: one frozen string, and no timer is ever started', () => {
    vi.useFakeTimers()
    vi.setSystemTime(RENDER_NOW)
    render(<NinaJobElapsed startedAtMs={START} nowMs={RENDER_NOW} running={false} />)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    // `nina_turns` has no finished_at — counting forever would be a lie that grows every second.
    expect(elapsed().textContent).toBe(formatJobSeconds(10))
  })

  it('a clock skew that would read negative is floored at zero, on both halves', () => {
    vi.useFakeTimers()
    vi.setSystemTime(START - 500)
    render(<NinaJobElapsed startedAtMs={START} nowMs={START} running />)
    expect(elapsed().textContent).toBe(formatJobSeconds(0))

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(elapsed().textContent).toBe(formatJobSeconds(jobElapsedSeconds(START, Date.now())))
    expect(elapsed().textContent).toBe(formatJobSeconds(0))
  })

  it('className rides the span', () => {
    render(<NinaJobElapsed startedAtMs={START} nowMs={RENDER_NOW} running={false} className="tabular-nums" />)
    expect(elapsed().className).toContain('tabular-nums')
  })
})
