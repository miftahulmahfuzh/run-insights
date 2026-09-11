// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PaceHrPoint } from '@/lib/charts'
import type { ZoneRow } from '@/lib/metrics'

import { SplitsTable } from './SplitsTable'

/**
 * §3.3's read-only splits table — the pace/HR chart's accessible twin. The DOM-level contracts
 * that matter here, per the file's own header: the partial row is carried on four independent
 * channels (D14/R-30), the numeric columns carry their own gutter (F16's `6'36"154154` bug), and
 * the bar's scale is the slowest FULL kilometre, with the partial's fill clamped onto its
 * shortened track.
 *
 * Pace/HR bar *arithmetic* is asserted as parsed percentages (`toBeCloseTo`), not as style
 * strings: `(670 / 1000) * 100` is float noise away from 67, and pinning the noise would make
 * the test a snapshot of IEEE 754.
 */

const ZONES: ZoneRow[] = [
  { zone: 1, durationSec: 600, minBpm: null, maxBpm: 140 },
  { zone: 2, durationSec: 300, minBpm: 140, maxBpm: 154 },
  { zone: 3, durationSec: 400, minBpm: 154, maxBpm: 164 },
  { zone: 4, durationSec: 500, minBpm: 164, maxBpm: 174 },
  { zone: 5, durationSec: 100, minBpm: 174, maxBpm: null },
]

function point(overrides: Partial<PaceHrPoint> & { km: number }): PaceHrPoint {
  return {
    paceSec: 400,
    timeSec: 400,
    hr: 165,
    cadence: 170,
    partial: false,
    distanceM: 1000,
    ...overrides,
  }
}

/** Two full kilometres and a partial third — the canonical run's shape. */
const POINTS: PaceHrPoint[] = [
  point({ km: 1, paceSec: 400, hr: 165, cadence: 170, timeSec: 400 }),
  point({ km: 2, paceSec: 500, hr: 150, cadence: 168, timeSec: 500 }),
  point({ km: 3, paceSec: 430, hr: null, cadence: null, timeSec: 288, partial: true, distanceM: 750 }),
]

function bodyRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('tbody tr')]
}

function barOf(row: HTMLElement): { track: HTMLElement; fill: HTMLElement } {
  const track = row.children[1]!.firstElementChild as HTMLElement
  return { track, fill: track.firstElementChild as HTMLElement }
}

function widthPct(el: HTMLElement): number {
  return parseFloat(el.style.width)
}

describe('SplitsTable', () => {
  it('renders one row per kilometre with the header: KM, the drawn bar, PACE, HR, CAD', () => {
    const { container } = render(
      <SplitsTable points={POINTS} zones={ZONES} fastestKm={1} slowestKm={2} />,
    )

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['KM', 'Pace, drawn', 'PACE', 'HR', 'CAD'])
    // "Pace, drawn" is screen-reader-only: the visible header cell is the bar itself.
    expect(screen.getByText('Pace, drawn')).toHaveClass('sr-only')
    expect(bodyRows(container)).toHaveLength(3)
  })

  it('renders nothing for a run with no splits — an empty table is not a kind of data', () => {
    const { container } = render(<SplitsTable points={[]} zones={ZONES} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('formats every column through lib/format: 6\'40", not 400', () => {
    const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

    const first = bodyRows(container)[0]!
    expect(first.textContent).toContain('6\'40"')
    expect(first.textContent).toContain('165')
    expect(first.textContent).toContain('170')
  })

  it('a missing HR or cadence renders an em dash, never NaN', () => {
    const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

    const partial = bodyRows(container)[2]!
    expect(partial.textContent).toContain('—')
  })

  it('names the fastest and slowest full kilometres under their pace', () => {
    render(<SplitsTable points={POINTS} zones={ZONES} fastestKm={1} slowestKm={2} />)

    expect(screen.getByText('fastest')).toBeInTheDocument()
    expect(screen.getByText('slowest')).toBeInTheDocument()
  })

  it('no fastest/slowest named when neither is passed', () => {
    render(<SplitsTable points={POINTS} zones={ZONES} />)

    expect(screen.queryByText('fastest')).not.toBeInTheDocument()
    expect(screen.queryByText('slowest')).not.toBeInTheDocument()
  })

  describe('the partial row, on its four channels', () => {
    it('channel 1: the KM cell reads 3* with the real distance on a second line', () => {
      const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

      const partial = bodyRows(container)[2]!
      const kmCell = partial.children[0]!
      expect(kmCell.textContent).toContain('3*')
      expect(kmCell.textContent).toContain('0.75 km')
    })

    it('channel 3: the row is a different KIND of row — left rule and one-step-off fill', () => {
      const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

      const partial = bodyRows(container)[2]!
      expect(partial).toHaveClass('border-l-[3px]', 'border-l-ink-3', 'bg-paper-2')
      // …and the full rows are none of those things.
      expect(bodyRows(container)[0]).not.toHaveClass('bg-paper-2')
    })

    it('channel 4: the partial’s track is shortened to the distance actually run', () => {
      const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

      const { track } = barOf(bodyRows(container)[2]!)
      expect(widthPct(track)).toBeCloseTo(75) // 750 m of the 1000 m track
      const { track: full } = barOf(bodyRows(container)[0]!)
      expect(widthPct(full)).toBeCloseTo(100)
    })

    it('the caption states the partial once, in a sentence that says what it is', () => {
      render(<SplitsTable points={POINTS} zones={ZONES} />)

      expect(
        screen.getByText(
          'km 3 is partial — 0.75 km at 7\'10"/km, 4:48 elapsed. It is left out of every pace average.',
        ),
      ).toBeInTheDocument()
    })

    it('no partial row, no caption', () => {
      render(
        <SplitsTable points={[point({ km: 1 })]} zones={ZONES} />,
      )

      expect(
        screen.queryByText(/is partial/),
      ).not.toBeInTheDocument()
    })
  })

  describe('the pace bar: length is pace, colour is the split’s zone', () => {
    it('the fill is measured against the slowest FULL kilometre', () => {
      const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

      // slowest full pace is 500; km 1's 400 fills 80% of it.
      expect(widthPct(barOf(bodyRows(container)[0]!).fill)).toBeCloseTo(80)
      expect(widthPct(barOf(bodyRows(container)[1]!).fill)).toBeCloseTo(100)
    })

    it('the partial’s pace is excluded from the scale and its fill clamped to its track', () => {
      // The partial's 900 s/km is far slower than any full km: unclamped it would overflow
      // a track that is already shortened.
      const { container } = render(
        <SplitsTable
          points={[
            point({ km: 1, paceSec: 500 }),
            point({ km: 2, paceSec: 900, partial: true, distanceM: 750, timeSec: 602 }),
          ]}
          zones={ZONES}
        />,
      )

      const { fill } = barOf(bodyRows(container)[1]!)
      expect(widthPct(fill)).toBeCloseTo(100)
      // And the caption quotes the clamped-against pace, not a normalised one.
      expect(screen.getByText(/15'00"\/km/)).toBeInTheDocument()
    })

    it('the fill colour is the split’s dominant zone from the run’s OWN bounds', () => {
      const { container } = render(<SplitsTable points={POINTS} zones={ZONES} />)

      // km 1's HR 165 sits in zone 4 (164–174) of this run; km 2's 150 in zone 2 (140–154).
      expect(barOf(bodyRows(container)[0]!).fill).toHaveClass('bg-z4')
      expect(barOf(bodyRows(container)[1]!).fill).toHaveClass('bg-z2')
    })

    it('no HR, or an HR inside no zone, renders the miss fill — never a zone colour', () => {
      const zones: ZoneRow[] = [{ zone: 1, durationSec: 1, minBpm: 140, maxBpm: 154 }]
      const { container } = render(
        <SplitsTable
          points={[
            point({ km: 1, hr: null }),
            point({ km: 2, hr: 130, paceSec: 420, timeSec: 420 }),
          ]}
          zones={zones}
        />,
      )

      expect(barOf(bodyRows(container)[0]!).fill).toHaveClass('bg-miss')
      // 130 is under this run's zone 1 floor — not "zone 1", not a colour at all.
      expect(barOf(bodyRows(container)[1]!).fill).toHaveClass('bg-miss')
    })

    it('an HR above every bounded zone lands in the open-ceiling zone 5', () => {
      const { container } = render(<SplitsTable points={[point({ km: 1, hr: 182 })]} zones={ZONES} />)

      expect(barOf(bodyRows(container)[0]!).fill).toHaveClass('bg-z5')
    })
  })
})
