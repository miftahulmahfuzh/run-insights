// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ZoneShare } from '@/lib/charts'

import { ZoneBar } from './ZoneBar'

/**
 * §3.2's five-zone bar, as five divs and deliberately zero Recharts. The DOM-level contracts:
 * "no data" renders EmptySlot and never five 0% segments (§9), a zero-second zone renders no
 * segment at all but keeps its label and its table row, the 3px minimum keeps a real slice
 * findable, and the printed percentages are always the true, unclamped shares.
 */

const SHARES: ZoneShare[] = [
  { zone: 1, durationSec: 600, pct: 25, minBpm: null, maxBpm: 140 },
  { zone: 2, durationSec: 300, pct: 12, minBpm: 140, maxBpm: 154 },
  { zone: 3, durationSec: 1500, pct: 63, minBpm: 154, maxBpm: 164 },
]

describe('ZoneBar', () => {
  it('no zone rows renders the empty slot with the default sentence — never five 0% segments', () => {
    render(<ZoneBar shares={[]} />)

    expect(screen.getByText('No heart-rate data for this run.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('all-zero durations are also "no data": a zero-second run is not an effortless run', () => {
    render(
      <ZoneBar
        shares={[
          { zone: 1, durationSec: 0, pct: 0, minBpm: null, maxBpm: 140 },
          { zone: 2, durationSec: 0, pct: 0, minBpm: 140, maxBpm: 154 },
        ]}
      />,
    )

    expect(screen.getByText('No heart-rate data for this run.')).toBeInTheDocument()
  })

  it('the empty sentence can be reworded by the caller', () => {
    render(<ZoneBar shares={[]} emptyMessage="No HR zones this month." />)

    expect(screen.getByText('No HR zones this month.')).toBeInTheDocument()
  })

  it('the bar is one image with the whole story in its accessible name', () => {
    render(<ZoneBar shares={SHARES} />)

    const bar = screen.getByRole('img')
    expect(bar).toHaveAttribute(
      'aria-label',
      'Zone 1, 25%, 10:00. Zone 2, 12%, 5:00. Zone 3, 63%, 25:00',
    )
  })

  it('one segment per zone with time in it, sized to its true share', () => {
    const { container } = render(<ZoneBar shares={SHARES} />)

    const segments = [...container.querySelectorAll('[role="img"] > span')]
    expect(segments).toHaveLength(3)
    expect(parseFloat(segments[0]!.style.width)).toBeCloseTo(25) // 600 / 2400
    expect(parseFloat(segments[1]!.style.width)).toBeCloseTo(12.5) // 300 / 2400
    expect(parseFloat(segments[2]!.style.width)).toBeCloseTo(62.5) // 1500 / 2400
  })

  it('a zero-second zone renders no segment — but keeps its label and its table row', () => {
    const { container } = render(
      <ZoneBar shares={[...SHARES, { zone: 5, durationSec: 0, pct: 0, minBpm: 174, maxBpm: null }]} />,
    )

    expect(container.querySelectorAll('[role="img"] > span')).toHaveLength(3)
    // The labels list maps every share, not only the drawn ones.
    const labels = screen.getAllByRole('listitem')
    expect(labels).toHaveLength(4)
    expect(labels[3]).toHaveTextContent('Z5')
    // …and the table twin maps every share too.
    expect(screen.getAllByRole('row')).toHaveLength(5) // header + 4 zones
  })

  it('every segment carries the 3px minimum, so a real slice can never vanish', () => {
    const { container } = render(<ZoneBar shares={SHARES} />)

    for (const segment of container.querySelectorAll('[role="img"] > span')) {
      expect(segment.style.minWidth).toBe('3px')
    }
  })

  it('each segment wears its own zone colour', () => {
    const { container } = render(<ZoneBar shares={SHARES} />)

    const segments = [...container.querySelectorAll('[role="img"] > span')]
    expect(segments[0]).toHaveClass('bg-z1')
    expect(segments[1]).toHaveClass('bg-z2')
    expect(segments[2]).toHaveClass('bg-z3')
  })

  it('the labels list pairs every zone number with its printed share', () => {
    render(<ZoneBar shares={SHARES} />)

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Z1')
    expect(items[0]).toHaveTextContent('25%')
    expect(items[2]).toHaveTextContent('Z3')
    expect(items[2]).toHaveTextContent('63%')
  })

  it('renders the §3.2 caption sentence when given, and nothing when not', () => {
    const { rerender } = render(
      <ZoneBar shares={SHARES} caption="90.6% of this run was Z4 or harder." />,
    )

    expect(screen.getByText('90.6% of this run was Z4 or harder.')).toBeInTheDocument()

    rerender(<ZoneBar shares={SHARES} />)
    expect(screen.queryByText(/Z4 or harder/)).not.toBeInTheDocument()
  })

  describe('the table twin, reachable without hover', () => {
    it('sits inside a disclosure with zone, range, time and share', () => {
      render(<ZoneBar shares={SHARES} />)

      expect(screen.getByText('Zone table')).toBeInTheDocument()
      const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
      expect(headers).toEqual(['Zone', 'Range', 'Time', 'Share'])

      const rows = screen.getAllByRole('row')
      expect(rows).toHaveLength(4) // header + 3 zones
      expect(rows[1]).toHaveTextContent('Z1')
      expect(rows[1]).toHaveTextContent('under 140 bpm')
      expect(rows[1]).toHaveTextContent('10:00')
      expect(rows[3]).toHaveTextContent('154–164 bpm')
    })

    it('an open floor reads "and up", and no bounds at all read "no range"', () => {
      render(
        <ZoneBar
          shares={[
            { zone: 5, durationSec: 100, pct: 100, minBpm: 174, maxBpm: null },
          ]}
        />,
      )

      expect(screen.getByText('174 bpm and up')).toBeInTheDocument()
    })

    it('both bounds null degrades to "no range", never to missing data', () => {
      render(
        <ZoneBar
          shares={[{ zone: 1, durationSec: 100, pct: 100, minBpm: null, maxBpm: null }]}
        />,
      )

      expect(screen.getByText('no range')).toBeInTheDocument()
    })
  })
})
