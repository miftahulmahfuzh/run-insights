// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MonthWeekBucket } from '@/lib/charts'

import { WeeksInMonthChart } from './WeeksInMonthChart'

/**
 * §3.4's outer half — thin by design, so the tests concentrate on the one thing it owns: the
 * caption. A bar that is structurally short because its week straddles a month boundary looks
 * exactly like a bad week, and the caption is the only honest fix — so its four states (no
 * partials, one partial, two partials, current week, and every combination) are spelled out here
 * word for word.
 *
 * The Recharts inner is stubbed; its rendering contracts live in
 * `WeeksInMonthChartInner.test.tsx`.
 */
const InnerMock = vi.hoisted(() => vi.fn())
vi.mock('./WeeksInMonthChartInner', () => ({ WeeksInMonthChartInner: InnerMock }))

function bucket(overrides: Partial<MonthWeekBucket>): MonthWeekBucket {
  return {
    isoWeekKey: '2026-W31',
    clippedStartISO: '2026-07-27',
    clippedEndISO: '2026-08-02',
    distanceM: 10000,
    runCount: 2,
    isPartial: false,
    isCurrent: false,
    ...overrides,
  }
}

describe('WeeksInMonthChart (outer)', () => {
  beforeEach(() => {
    InnerMock.mockReset()
    InnerMock.mockReturnValue(<div data-testid="weeks-in-month-inner" />)
  })

  it('passes the buckets through untouched', async () => {
    const buckets = [bucket({})]

    render(<WeeksInMonthChart buckets={buckets} />)
    await screen.findByTestId('weeks-in-month-inner')

    expect(InnerMock).toHaveBeenCalledTimes(1)
    expect(InnerMock.mock.calls[0]![0]).toEqual({ buckets })
  })

  it('titles itself "Weeks this month"', () => {
    render(<WeeksInMonthChart buckets={[bucket({})]} />)

    expect(screen.getByText('Weeks this month')).toBeInTheDocument()
  })

  it('clean weeks need no caption at all', () => {
    render(
      <WeeksInMonthChart
        buckets={[
          bucket({}),
          bucket({
            isoWeekKey: '2026-W32',
            clippedStartISO: '2026-08-03',
            clippedEndISO: '2026-08-09',
          }),
        ]}
      />,
    )

    expect(screen.queryByText(/partial week/)).not.toBeInTheDocument()
    expect(screen.queryByText(/in progress/)).not.toBeInTheDocument()
  })

  it('one straddling week is named in words, start–end', () => {
    render(<WeeksInMonthChart buckets={[bucket({ isPartial: true })]} />)

    expect(
      screen.getByText(
        '27 Jul–2 Aug is a partial week — the rest of that week falls in another month.',
      ),
    ).toBeInTheDocument()
  })

  it('two straddling weeks switch to the plural sentence, joined with "and"', () => {
    render(
      <WeeksInMonthChart
        buckets={[
          bucket({ isPartial: true }),
          bucket({
            isoWeekKey: '2026-W32',
            clippedStartISO: '2026-08-03',
            clippedEndISO: '2026-08-09',
          }),
          bucket({
            isoWeekKey: '2026-W35',
            clippedStartISO: '2026-08-24',
            clippedEndISO: '2026-08-30',
            isPartial: true,
          }),
        ]}
      />,
    )

    expect(
      screen.getByText(
        '27 Jul–2 Aug and 24 Aug–30 Aug are partial weeks — the rest of those weeks falls in another month.',
      ),
    ).toBeInTheDocument()
  })

  it('the in-progress week gets its own sentence', () => {
    render(<WeeksInMonthChart buckets={[bucket({ isCurrent: true })]} />)

    expect(screen.getByText('This week is still in progress.')).toBeInTheDocument()
    expect(screen.queryByText(/partial week/)).not.toBeInTheDocument()
  })

  it('partial and current together read as one caption, partials first', () => {
    render(<WeeksInMonthChart buckets={[bucket({ isPartial: true, isCurrent: true })]} />)

    expect(
      screen.getByText(
        '27 Jul–2 Aug is a partial week — the rest of that week falls in another month. ' +
          'This week is still in progress.',
      ),
    ).toBeInTheDocument()
  })

  it('the twin marks partial weeks with a * on the week range and prints every bucket', () => {
    render(
      <WeeksInMonthChart
        buckets={[
          bucket({ isPartial: true }),
          bucket({
            isoWeekKey: '2026-W32',
            clippedStartISO: '2026-08-03',
            clippedEndISO: '2026-08-09',
            distanceM: 25000,
            runCount: 4,
          }),
        ]}
      />,
    )

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Week',
      'Runs',
      'Distance',
    ])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('27 Jul – 2 Aug')
    expect(rows[1]).toHaveTextContent('*')
    expect(rows[2]).toHaveTextContent('3 Aug – 9 Aug')
    expect(rows[2]?.textContent).not.toContain('*')
    expect(rows[2]).toHaveTextContent('25.00 km')
  })
})
