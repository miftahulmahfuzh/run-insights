// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Acwr } from '@/lib/metrics'

import { AcwrTile } from './AcwrTile'

/**
 * The injury-load tile's two contracts:
 *
 *  1. **Withheld below 28 days of history.** A 4-day "chronic" load is not a chronic load, so the
 *     tile renders "—" and says why — it never shows a ratio computed against a made-up baseline.
 *  2. **Flagged as a fact, not an alarm, and only outside 0.8–1.3.** The tile states where the
 *     number sits and prints the band, so "outside" is readable without looking the range up. The
 *     soft-amber wash is the only signalling — there is no "⚠️" and no medical claim, and the
 *     in-range tile must NOT wear it.
 */

function acwr(overrides: Partial<Acwr> = {}): Acwr {
  return {
    asOf: '2026-08-19',
    acuteKm: 32.5,
    chronicWeeklyAvgKm: 30.95,
    ratio: 1.05,
    insufficientHistory: false,
    ...overrides,
  }
}

describe('AcwrTile', () => {
  it('withholds the ratio entirely while history is insufficient — "—" plus the reason', () => {
    render(<AcwrTile acwr={acwr({ insufficientHistory: true, ratio: null })} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Needs four weeks of history before a 7-day-to-28-day ratio means anything.',
      ),
    ).toBeInTheDocument()
    // The band is not printed here — there is no ratio for it to describe.
    expect(screen.queryByText(/usual/)).not.toBeInTheDocument()
  })

  it('a null ratio with "sufficient" history still gets the withheld tile, not NaN', () => {
    // The guard is `insufficientHistory || ratio == null` — either alone withholds. This is the
    // branch that catches a chronic side of exactly 0 km.
    render(<AcwrTile acwr={acwr({ ratio: null })} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/Training load · 7d ÷ 28d/)).not.toBeInTheDocument()
  })

  it('inside the band: the ratio to two decimals, the inputs, and "inside the usual 0.8–1.3 range"', () => {
    render(<AcwrTile acwr={acwr()} />)

    expect(screen.getByText('Training load · 7d ÷ 28d')).toBeInTheDocument()
    expect(screen.getByText('1.05')).toBeInTheDocument()
    expect(
      screen.getByText(
        '32.50 km this week against a 30.95 km four-week average — inside the usual 0.8–1.3 range.',
      ),
    ).toBeInTheDocument()
  })

  it.each([
    ['below the band', acwr({ ratio: 0.6 })],
    ['above the band', acwr({ ratio: 1.8 })],
  ])(
    '%s: the tile says "outside the usual 0.8–1.3 range" and wears the soft-amber wash',
    (_name, a) => {
      const { container } = render(<AcwrTile acwr={a} />)

      expect(screen.getByText(/outside the usual 0\.8–1\.3 range/)).toBeInTheDocument()
      expect(container.firstElementChild).toHaveClass('bg-warn-soft')
    },
  )

  it.each([
    ['the lower bound 0.8 is inside (flagged only OUTSIDE 0.8–1.3)', 0.8],
    ['the upper bound 1.3 is inside', 1.3],
  ])('%s', (_name, ratio) => {
    const { container } = render(<AcwrTile acwr={acwr({ ratio })} />)

    expect(screen.getByText(/inside the usual/)).toBeInTheDocument()
    expect(container.firstElementChild).not.toHaveClass('bg-warn-soft')
  })

  it('an in-range tile wears the plain paper fill, never the warning wash', () => {
    const { container } = render(<AcwrTile acwr={acwr()} />)

    expect(container.firstElementChild).toHaveClass('bg-paper-2')
    expect(container.firstElementChild).not.toHaveClass('bg-warn-soft')
  })
})
