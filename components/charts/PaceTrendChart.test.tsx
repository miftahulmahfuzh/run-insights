// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatPaceDelta } from '@/lib/format'
import type { PaceTrendPoint } from '@/lib/charts'

import { PaceTrendChart } from './PaceTrendChart'

/**
 * §3.6's outer half — the one genuinely client-stateful chart. Its decisions, and the ones under
 * test: the filter OPENS on the busiest band, is single-select, keeps every chip visible even when
 * its band is empty, and gates the trend line on §9 (the outer's `allowTrendLine`, never the
 * inner's default). The caption sentence must agree with the inverted axis: a negative delta is an
 * improvement and the sentence says so in words.
 *
 * The Recharts inner is stubbed; its rendering contracts live in `PaceTrendChartInner.test.tsx`.
 */
const InnerMock = vi.hoisted(() => vi.fn())
vi.mock('./PaceTrendChartInner', () => ({ PaceTrendChartInner: InnerMock }))

const START = '2026-06-29'
const DAYS = 83

/** Four 10Ks at exactly −6 s/km per week — a line the regression must find, signed correctly. */
const TENS_GETTING_FASTER: PaceTrendPoint[] = [
  {
    runId: 't1',
    occurredOn: '2026-06-29',
    avgPaceSec: 420,
    distanceM: 10000,
    bucket: '10k',
    dayIndex: 0,
  },
  {
    runId: 't2',
    occurredOn: '2026-07-06',
    avgPaceSec: 414,
    distanceM: 11000,
    bucket: '10k',
    dayIndex: 7,
  },
  {
    runId: 't3',
    occurredOn: '2026-07-13',
    avgPaceSec: 408,
    distanceM: 10500,
    bucket: '10k',
    dayIndex: 14,
  },
  {
    runId: 't4',
    occurredOn: '2026-07-20',
    avgPaceSec: 402,
    distanceM: 12000,
    bucket: '10k',
    dayIndex: 21,
  },
]

const FIVES: PaceTrendPoint[] = [
  {
    runId: 'f1',
    occurredOn: '2026-07-01',
    avgPaceSec: 360,
    distanceM: 5000,
    bucket: '5k',
    dayIndex: 2,
  },
  {
    runId: 'f2',
    occurredOn: '2026-07-15',
    avgPaceSec: 366,
    distanceM: 5500,
    bucket: '5k',
    dayIndex: 16,
  },
]

const ONE_HALF: PaceTrendPoint[] = [
  {
    runId: 'h1',
    occurredOn: '2026-08-01',
    avgPaceSec: 390,
    distanceM: 21000,
    bucket: 'half',
    dayIndex: 33,
  },
]

const MIXED = [...TENS_GETTING_FASTER, ...FIVES, ...ONE_HALF]

function chip(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

describe('PaceTrendChart (outer)', () => {
  beforeEach(() => {
    InnerMock.mockReset()
    InnerMock.mockReturnValue(<div data-testid="pace-trend-inner" />)
  })

  it('the chip row is complete and reads shortest to longest, empty bands included', () => {
    render(<PaceTrendChart points={MIXED} startISO={START} days={DAYS} />)

    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Short', '5K', '10K', 'Half', 'Full'])
  })

  it('opens on the busiest band — 10K here — and shows its range beside the title', async () => {
    render(<PaceTrendChart points={MIXED} startISO={START} days={DAYS} />)
    await screen.findByTestId('pace-trend-inner')

    expect(chip('10K')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('5K')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('7 to 15 km')).toBeInTheDocument()

    const props = InnerMock.mock.calls.at(-1)![0] as { points: PaceTrendPoint[] }
    expect(props.points).toEqual(TENS_GETTING_FASTER)
  })

  it('the table twin prints exactly the runs in the selected band — date, distance, pace', () => {
    render(<PaceTrendChart points={MIXED} startISO={START} days={DAYS} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Date',
      'Distance',
      'Pace',
    ])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(5) // header + four 10Ks
    expect(rows[1]).toHaveTextContent('29 Jun')
    expect(rows[1]).toHaveTextContent('10.00 km')
    expect(rows[1]).toHaveTextContent(`7'00"/km`)
    expect(rows[4]).toHaveTextContent('12.00 km')
  })

  it('is single-select: tapping 5K moves the selection, the plot and the twin together', async () => {
    render(<PaceTrendChart points={MIXED} startISO={START} days={DAYS} />)
    await screen.findByTestId('pace-trend-inner')

    fireEvent.click(chip('5K'))

    expect(chip('10K')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('5K')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('3.5 to 7 km')).toBeInTheDocument()

    const props = InnerMock.mock.calls.at(-1)![0] as { points: PaceTrendPoint[] }
    expect(props.points).toEqual(FIVES)
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + two 5Ks
  })

  it('the caption agrees with the inverted axis: −6 s/km reads as "getting faster"', () => {
    render(<PaceTrendChart points={TENS_GETTING_FASTER} startISO={START} days={DAYS} />)

    const expected = `${formatPaceDelta(-6)} per week across 4 runs — getting faster at this distance.`
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('a rising line reads as "getting slower", never as an arithmetic chore', () => {
    const slowing: PaceTrendPoint[] = TENS_GETTING_FASTER.map((p, i) => ({
      ...p,
      avgPaceSec: 402 + i * 6,
      runId: `s${i}`,
    }))

    render(<PaceTrendChart points={slowing} startISO={START} days={DAYS} />)

    const expected = `${formatPaceDelta(6)} per week across 4 runs — getting slower at this distance.`
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('a perfectly flat line is "holding steady", not "+0"', () => {
    const flat: PaceTrendPoint[] = TENS_GETTING_FASTER.map((p) => ({
      ...p,
      avgPaceSec: 410,
      runId: `fl-${p.runId}`,
    }))

    render(<PaceTrendChart points={flat} startISO={START} days={DAYS} />)

    expect(
      screen.getByText('0 s/km per week across 4 runs — holding steady at this distance.'),
    ).toBeInTheDocument()
  })

  it('fewer than four runs in the band withholds the line AND says what would earn it', () => {
    const twoTens: PaceTrendPoint[] = TENS_GETTING_FASTER.slice(0, 2)

    render(<PaceTrendChart points={twoTens} startISO={START} days={DAYS} />)

    expect(
      screen.getByText('A trend line needs at least four runs at this distance.'),
    ).toBeInTheDocument()
  })

  it('allowTrendLine=false replaces the line with the four-weeks sentence — the §9 gate is the outer', async () => {
    render(
      <PaceTrendChart
        points={TENS_GETTING_FASTER}
        startISO={START}
        days={DAYS}
        allowTrendLine={false}
      />,
    )
    await screen.findByTestId('pace-trend-inner')

    expect(
      screen.getByText('A trend line appears after four weeks of running.'),
    ).toBeInTheDocument()

    const props = InnerMock.mock.calls.at(-1)![0] as { showTrendLine: boolean }
    expect(props.showTrendLine).toBe(false)
  })

  it('an empty band keeps its chip, shows the honest EmptySlot, and drops the twin', async () => {
    render(<PaceTrendChart points={MIXED} startISO={START} days={DAYS} />)
    await screen.findByTestId('pace-trend-inner')

    expect(InnerMock).toHaveBeenCalledTimes(1)
    fireEvent.click(chip('Full'))

    expect(screen.getByText('No runs in this range in the last twelve weeks.')).toBeInTheDocument()
    expect(screen.queryByTestId('pace-trend-inner')).not.toBeInTheDocument()
    expect(InnerMock).toHaveBeenCalledTimes(1) // not re-queried for nothing
    expect(screen.queryByText('Table view')).not.toBeInTheDocument()
    expect(screen.queryByRole('row')).not.toBeInTheDocument()
    expect(screen.queryByText(/per week across/)).not.toBeInTheDocument()
  })

  it('no runs at all still renders the full chip row, opened on 10K', () => {
    render(<PaceTrendChart points={[]} startISO={START} days={DAYS} />)

    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(chip('10K')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('No runs in this range in the last twelve weeks.')).toBeInTheDocument()
  })
})
