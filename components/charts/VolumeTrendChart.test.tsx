// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLLING_MEAN_WEEKS, type VolumeTrendPoint } from '@/lib/charts'
import { formatDistanceM } from '@/lib/format'

import { VolumeTrendChart } from './VolumeTrendChart'

/**
 * §3.5's outer half. This chart is a fixed rolling window and deliberately obeys nothing else on
 * the screen — the contracts under test are its legend (the mean key appears only when a mean
 * exists), its caption (which teaches the rule instead of guessing a value for weeks 1–3), and its
 * table twin, which is where the current-week bullet and every null mean get their honest `—`.
 *
 * The Recharts inner is stubbed; its rendering contracts live in `VolumeTrendChartInner.test.tsx`.
 */
const InnerMock = vi.hoisted(() => vi.fn())
vi.mock('./VolumeTrendChartInner', () => ({ VolumeTrendChartInner: InnerMock }))

/** Twelve Mondays, 2026-06-08 through 2026-08-24; the last is the current week. */
const WEEK_STARTS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(`2026-06-08T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + i * 7)
  return d.toISOString().slice(0, 10)
})

const FULL_WINDOW: VolumeTrendPoint[] = WEEK_STARTS.map((weekStartISO, i) => ({
  isoWeekKey: `2026-W${24 + i}`,
  weekStartISO,
  distanceM: 40000 + i * 1000,
  runCount: 3,
  rollingMeanM: i < ROLLING_MEAN_WEEKS - 1 ? null : 43000 + i * 500,
  isCurrent: i === 11,
}))

const NO_MEAN_YET: VolumeTrendPoint[] = FULL_WINDOW.map((p) => ({ ...p, rollingMeanM: null }))

describe('VolumeTrendChart (outer)', () => {
  beforeEach(() => {
    InnerMock.mockReset()
    InnerMock.mockReturnValue(<div data-testid="volume-trend-inner" />)
  })

  it('passes the whole window through to the inner untouched', async () => {
    render(<VolumeTrendChart points={FULL_WINDOW} />)
    await screen.findByTestId('volume-trend-inner')

    expect(InnerMock).toHaveBeenCalledTimes(1)
    expect(InnerMock.mock.calls[0]![0]).toEqual({ points: FULL_WINDOW })
  })

  it('titles itself with the window it actually plots — twelve weeks, said out loud', () => {
    render(<VolumeTrendChart points={FULL_WINDOW} />)

    expect(screen.getByText('Weekly volume · last 12 weeks')).toBeInTheDocument()
  })

  it('the legend carries the bar key always and the mean key only when a mean exists', () => {
    const { rerender } = render(<VolumeTrendChart points={FULL_WINDOW} />)

    expect(screen.getByText('Weekly distance')).toBeInTheDocument()
    expect(screen.getByText('4-week mean')).toBeInTheDocument()

    rerender(<VolumeTrendChart points={NO_MEAN_YET} />)
    expect(screen.getByText('Weekly distance')).toBeInTheDocument()
    expect(screen.queryByText('4-week mean')).not.toBeInTheDocument()
  })

  it('with no mean yet, the caption states the rule instead of drawing a guessed line', () => {
    render(<VolumeTrendChart points={NO_MEAN_YET} />)

    expect(
      screen.getByText('The 4-week mean appears once there are 4 weeks behind it.'),
    ).toBeInTheDocument()
  })

  it('with a mean present, the caption gets out of the way', () => {
    render(<VolumeTrendChart points={FULL_WINDOW} />)

    expect(screen.queryByText(/mean appears once there are/)).not.toBeInTheDocument()
  })

  it('the twin prints all twelve weeks, current-week bullet included', () => {
    render(<VolumeTrendChart points={FULL_WINDOW} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Week',
      'Runs',
      'Distance',
      '4-wk mean',
    ])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(13) // header + twelve weeks

    expect(rows[1]).toHaveTextContent('8 Jun')
    const currentRow = rows[12]!
    expect(currentRow).toHaveTextContent('24 Aug')
    expect(currentRow).toHaveTextContent('•')
    // Only the current week carries the bullet.
    expect(rows[11]?.textContent).not.toContain('•')
  })

  it('a week with no mean yet prints an em dash, never a blank and never a zero', () => {
    render(<VolumeTrendChart points={FULL_WINDOW} />)

    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('—')
    expect(rows[4]).toHaveTextContent(formatDistanceM(43000 + 3 * 500))
  })
})
