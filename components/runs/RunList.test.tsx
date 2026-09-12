// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RunList } from './RunList'

/**
 * The list's two contracts, from its own header comment:
 *
 *  1. **Week totals are computed from the rows being listed** — one reduce over the array already on
 *     the page, never a second query that could disagree with what is on screen. Asserting the exact
 *     summed total per divider is what pins that.
 *  2. **Insertion order is preserved, no re-sort.** Input is newest-first (D16), so the current week
 *     is the first divider, rows within a week stay in input order, and this file contains no date
 *     comparison at all.
 *
 * Fixture weeks (2026): W34 = Mon 17–Sun 23 Aug, W33 = Mon 10–16 Aug, W32 = Mon 3–9 Aug.
 * `todayISO` is a Wednesday in W34.
 */

const TODAY = '2026-08-19'

function run(id: string, occurredOn: string, distanceM: number) {
  return { id, occurredOn, distanceM, durationSec: 3600, avgPaceSec: 400, avgHr: null, location: null }
}

const RUNS = [
  run('r1', '2026-08-19', 5000), // Wed, current week
  run('r2', '2026-08-17', 4210), // Mon, current week
  run('r3', '2026-08-12', 10000), // Wed, last week
  run('r4', '2026-08-05', 3000), // Wed, two weeks ago
]

function dividerTexts() {
  return screen.getAllByRole('heading').map((h) => h.textContent ?? '')
}

describe('RunList', () => {
  it('groups by ISO week, newest week first, with the current week headed "This week"', () => {
    render(<RunList runs={RUNS} todayISO={TODAY} />)

    const dividers = dividerTexts()
    expect(dividers).toHaveLength(3)
    expect(dividers[0]).toContain('This week')
    expect(dividers[1]).toContain('Week of 10 Aug 2026')
    expect(dividers[2]).toContain('Week of 3 Aug 2026')
  })

  it('computes each divider’s count and distance from the rows under it', () => {
    render(<RunList runs={RUNS} todayISO={TODAY} />)

    const dividers = dividerTexts()
    // W34: 5000 + 4210 = 9210 m → "9.21 km"; W33: one run; W32: 3000 m.
    expect(dividers[0]).toContain('2 runs')
    expect(dividers[0]).toContain('9.21 km')
    expect(dividers[1]).toContain('1 run') // singular — never "1 runs"
    expect(dividers[1]).toContain('10.00 km')
    expect(dividers[2]).toContain('1 run')
    expect(dividers[2]).toContain('3.00 km')
  })

  it('keeps the input’s newest-first order both across weeks and within one', () => {
    const { container } = render(<RunList runs={RUNS} todayISO={TODAY} />)

    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/r/r1', '/r/r2', '/r/r3', '/r/r4'])
  })

  it('passes each run’s photo count down, and none where the map has no entry', () => {
    render(<RunList runs={RUNS} todayISO={TODAY} photoCounts={{ r1: 2 }} />)

    // The count and the word live in separate nodes (the word is the sr-only span), so read the row.
    const texts = screen.getAllByRole('link').map((a) => a.textContent ?? '')
    expect(texts[0]).toContain('⧉ 2')
    expect(texts[0]).toContain('screenshots')
    expect(texts[1]).not.toContain('screenshots')
    expect(texts[2]).not.toContain('screenshots')
  })

  it('renders nothing but its groups — an empty list is an empty list, not an empty-state card', () => {
    const { container } = render(<RunList runs={[]} todayISO={TODAY} />)

    expect(container.querySelectorAll('section')).toHaveLength(0)
    expect(container.textContent).toBe('')
  })
})
