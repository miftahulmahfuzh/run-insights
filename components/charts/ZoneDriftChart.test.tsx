// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ZoneDriftWeek } from '@/lib/charts'
import { formatPercent } from '@/lib/format'

import { ZoneDriftChart } from './ZoneDriftChart'

/**
 * §3.7's outer half. The caption is the story-in-words discipline: it names the MOST RECENT week
 * WITH heart-rate data — which is not necessarily the last row — and prints its zone-5 and
 * easy-zone shares. The twin, by contrast, prints every week including the no-data ones, because a
 * table row that says "no heart-rate data" is information and a blank row is not. Both contracts,
 * and the EmptySlot gate, are pinned here.
 *
 * The Recharts inner is stubbed; its rendering contracts live in `ZoneDriftChartInner.test.tsx`.
 */
const InnerMock = vi.hoisted(() => vi.fn())
vi.mock('./ZoneDriftChartInner', () => ({ ZoneDriftChartInner: InnerMock }))

function week(overrides: Partial<ZoneDriftWeek>): ZoneDriftWeek {
  return {
    isoWeekKey: '2026-W31',
    weekStartISO: '2026-07-27',
    hasData: true,
    sharePct: { 1: 40, 2: 25, 3: 20, 4: 10, 5: 5 },
    isCurrent: false,
    ...overrides,
  }
}

/** The last week has NO data; the most recent populated one is second-to-last, with its own mix. */
const WEEKS: ZoneDriftWeek[] = [
  week({}),
  week({
    isoWeekKey: '2026-W32',
    weekStartISO: '2026-08-03',
    hasData: false,
    sharePct: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  }),
  week({
    isoWeekKey: '2026-W33',
    weekStartISO: '2026-08-10',
    sharePct: { 1: 30, 2: 25, 3: 25, 4: 10, 5: 10 },
  }),
  week({
    isoWeekKey: '2026-W34',
    weekStartISO: '2026-08-17',
    isCurrent: true,
    hasData: false,
    sharePct: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  }),
]

const POPULATED_BEFORE_LAST = WEEKS[2]!

describe('ZoneDriftChart (outer)', () => {
  beforeEach(() => {
    InnerMock.mockReset()
    InnerMock.mockReturnValue(<div data-testid="zone-drift-inner" />)
  })

  it('passes the weeks through untouched', async () => {
    render(<ZoneDriftChart weeks={WEEKS} />)
    await screen.findByTestId('zone-drift-inner')

    expect(InnerMock).toHaveBeenCalledTimes(1)
    expect(InnerMock.mock.calls[0]![0]).toEqual({ weeks: WEEKS })
  })

  it('titles itself "Zone drift · last 12 weeks" and legends all five zones', () => {
    render(<ZoneDriftChart weeks={WEEKS} />)

    expect(screen.getByText('Zone drift · last 12 weeks')).toBeInTheDocument()
    // Scoped to spans: the twin's column headers spell Z1..Z5 too, but the legend is the span row.
    for (const zone of ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']) {
      expect(screen.getByText(zone, { selector: 'span' })).toBeInTheDocument()
    }
  })

  it('the caption speaks for the most recent week WITH data — not merely the last row', () => {
    render(<ZoneDriftChart weeks={WEEKS} />)

    const latest = POPULATED_BEFORE_LAST
    expect(
      screen.getByText(
        `Most recent week with heart-rate data: ${formatPercent(latest.sharePct[5])} in zone 5, ` +
          `${formatPercent(latest.sharePct[1] + latest.sharePct[2])} in zones 1–2.`,
      ),
    ).toBeInTheDocument()
  })

  it('no populated week at all means no caption, the honest EmptySlot, and no chart', () => {
    const empty = WEEKS.map((w) => ({
      ...w,
      hasData: false,
      sharePct: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }))

    render(<ZoneDriftChart weeks={empty} />)

    expect(screen.queryByText(/Most recent week/)).not.toBeInTheDocument()
    expect(screen.getByText('No heart-rate data in the last twelve weeks.')).toBeInTheDocument()
    expect(InnerMock).not.toHaveBeenCalled()
  })

  it('the twin prints every week — data weeks as five shares, no-data weeks as a stated absence', () => {
    render(<ZoneDriftChart weeks={WEEKS} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Week',
      'Z1',
      'Z2',
      'Z3',
      'Z4',
      'Z5',
    ])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(5) // header + four weeks

    const dataRow = rows[1]!
    expect(dataRow).toHaveTextContent('27 Jul')
    expect(dataRow).toHaveTextContent('40%')
    expect(dataRow).toHaveTextContent('5%')

    const gapRow = rows[2]!
    expect(gapRow).toHaveTextContent('no heart-rate data')
    expect(gapRow.textContent).not.toContain('%')

    // Even the current-but-empty week is stated, never blanked.
    expect(rows[4]).toHaveTextContent('no heart-rate data')
  })

  it('a no-data row really spans the five zone columns', () => {
    const { container } = render(<ZoneDriftChart weeks={WEEKS} />)

    const gapCell = [...container.querySelectorAll('td[colspan]')]
    expect(gapCell).toHaveLength(2) // weeks 2 and 4 are the gaps
    expect(gapCell[0]).toHaveTextContent('no heart-rate data')
  })
})
