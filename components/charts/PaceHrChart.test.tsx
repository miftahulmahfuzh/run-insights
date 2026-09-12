// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PaceHrPoint } from '@/lib/charts'

import { PaceHrChart } from './PaceHrChart'

/**
 * §3.1's outer half. The outer is pure decision logic — which caption, which legend keys, whether
 * the data is even long enough to draw — so the Recharts inner is stubbed and every assertion here
 * is about WHICH decision was made for WHICH input. The inner's rendering contracts live in
 * `PaceHrChartInner.test.tsx`.
 */
const InnerMock = vi.hoisted(() => vi.fn())
vi.mock('./PaceHrChartInner', () => ({ PaceHrChartInner: InnerMock }))

const WITH_HR: PaceHrPoint[] = [
  { km: 1, paceSec: 396, timeSec: 396, hr: 152, cadence: 172, partial: false, distanceM: 1000 },
  { km: 2, paceSec: 410, timeSec: 806, hr: null, cadence: 168, partial: false, distanceM: 1000 },
  { km: 3, paceSec: 452, timeSec: 1258, hr: 175, cadence: 160, partial: true, distanceM: 670 },
]

const NO_HR: PaceHrPoint[] = WITH_HR.map((p) => ({ ...p, hr: null }))

const NO_PARTIAL: PaceHrPoint[] = WITH_HR.slice(0, 2).map((p) => ({ ...p, partial: false }))

/** One full kilometre is not a trend, no matter what the partial rows do. */
const TOO_SHORT: PaceHrPoint[] = [
  { km: 1, paceSec: 396, timeSec: 396, hr: 152, cadence: 172, partial: false, distanceM: 1000 },
  { km: 2, paceSec: 452, timeSec: 848, hr: 175, cadence: 160, partial: true, distanceM: 670 },
]

describe('PaceHrChart (outer)', () => {
  beforeEach(() => {
    InnerMock.mockReset()
    InnerMock.mockReturnValue(<div data-testid="pace-hr-inner" />)
  })

  it('passes every point through to the inner untouched — partials included', async () => {
    render(<PaceHrChart points={WITH_HR} />)
    await screen.findByTestId('pace-hr-inner')

    expect(InnerMock).toHaveBeenCalledTimes(1)
    expect(InnerMock.mock.calls[0]![0]).toEqual({ points: WITH_HR })
  })

  it('titles itself "Pace & heart rate" and states the inverted axis in the default caption', () => {
    render(<PaceHrChart points={NO_PARTIAL} />)

    expect(screen.getByText('Pace & heart rate')).toBeInTheDocument()
    expect(screen.getByText('The pace axis is inverted: higher is faster.')).toBeInTheDocument()
  })

  it('a partial final kilometre earns the * sentence — the marker is explained in words', () => {
    render(<PaceHrChart points={WITH_HR} />)

    expect(
      screen.getByText(
        'The pace axis is inverted: higher is faster. * marks the partial final kilometre.',
      ),
    ).toBeInTheDocument()
  })

  it('the legend always carries Pace, and adds Heart rate only when any split has one', () => {
    const { rerender } = render(<PaceHrChart points={WITH_HR} />)

    expect(screen.getByText('Pace')).toBeInTheDocument()
    expect(screen.getByText('Heart rate')).toBeInTheDocument()

    rerender(<PaceHrChart points={NO_HR} />)
    expect(screen.getByText('Pace')).toBeInTheDocument()
    expect(screen.queryByText('Heart rate')).not.toBeInTheDocument()
  })

  it('ships NO table twin of its own — the splits table below the chart already is one', () => {
    render(<PaceHrChart points={WITH_HR} />)

    // The one sanctioned `table={null}`: a second table here would be duplication, not access.
    expect(screen.queryByText('Table view')).not.toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()
  })

  it('two or more full splits draw the chart', async () => {
    render(<PaceHrChart points={NO_PARTIAL} />)

    expect(await screen.findByTestId('pace-hr-inner')).toBeInTheDocument()
  })

  it('one full split is too short for a per-kilometre trend: EmptySlot, never a one-point line', () => {
    render(<PaceHrChart points={TOO_SHORT} />)

    expect(
      screen.getByText('Too short for a per-kilometre trend — the splits are below.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pace-hr-inner')).not.toBeInTheDocument()
    expect(InnerMock).not.toHaveBeenCalled()
  })

  it('an all-partial run is also too short — a run of stubs draws nothing', () => {
    const allPartial: PaceHrPoint[] = TOO_SHORT.map((p) => ({ ...p, partial: true }))

    render(<PaceHrChart points={allPartial} />)

    expect(
      screen.getByText('Too short for a per-kilometre trend — the splits are below.'),
    ).toBeInTheDocument()
    expect(InnerMock).not.toHaveBeenCalled()
  })

  it('an empty run renders the same honest EmptySlot', () => {
    render(<PaceHrChart points={[]} />)

    expect(
      screen.getByText('Too short for a per-kilometre trend — the splits are below.'),
    ).toBeInTheDocument()
  })
})
