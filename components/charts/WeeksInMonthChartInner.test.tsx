// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MonthWeekBucket } from '@/lib/charts'
import { formatDayCompact, formatDistanceCompact, formatDistanceM } from '@/lib/format'

import { WeeksInMonthChartInner } from './WeeksInMonthChartInner'

/*
 * §3.4's inner half renders for real. `ResponsiveContainer` measures its parent, and happy-dom has
 * no layout — every measurement comes back zero and the chart inside never mounts. The one
 * sanctioned bypass is below: the container becomes a fixed-size pass-through and everything
 * Recharts-shaped above it (axes, bars, the tallest-bar label, keyboard tooltips) is the real
 * library. No `from 'recharts'` import appears here — the boundary guard scans `.test.tsx` too.
 */
vi.mock('recharts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('recharts')>()
  const ReactMod = await import('react')
  function FixedSize({
    children,
  }: {
    children: React.ReactElement<{ width?: number; height?: number }>
  }) {
    return ReactMod.cloneElement(children, { width: 600, height: 300 })
  }
  return { ...mod, ResponsiveContainer: FixedSize }
})

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

const BUCKETS: MonthWeekBucket[] = [
  bucket({ isPartial: true }),
  bucket({
    isoWeekKey: '2026-W32',
    clippedStartISO: '2026-08-03',
    clippedEndISO: '2026-08-09',
    distanceM: 25000,
    runCount: 4,
  }),
  // The injury week: zero distance draws as a true zero, and labels nothing.
  bucket({
    isoWeekKey: '2026-W33',
    clippedStartISO: '2026-08-10',
    clippedEndISO: '2026-08-16',
    distanceM: 0,
    runCount: 0,
  }),
  bucket({
    isoWeekKey: '2026-W34',
    clippedStartISO: '2026-08-17',
    clippedEndISO: '2026-08-23',
    distanceM: 8000,
    runCount: 1,
    isCurrent: true,
  }),
]

function xTickTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map(
    (t) => t.textContent ?? '',
  )
}

function endpointTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.ri-endpoint')]
    .map((el) => el.textContent ?? '')
    .filter((t) => t !== '')
}

function tooltipTextAfter(container: HTMLElement, arrowRights: number): string | null {
  const surface = container.querySelector('svg.recharts-surface')
  expect(surface).not.toBeNull()
  fireEvent.focus(surface!)
  for (let i = 0; i < arrowRights; i++) fireEvent.keyDown(surface!, { key: 'ArrowRight' })
  return container.querySelector('.ri-tooltip')?.textContent ?? null
}

describe('WeeksInMonthChartInner', () => {
  it('draws one bar per week with distance — a zero week draws as a true zero, no sympathy sliver', () => {
    const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)

    // Four buckets, three rectangles: the zero-distance week draws nothing at all.
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3)
  })

  it('bars wear the three ordinal steps of one hue: current, partial, complete', () => {
    const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)

    expect(container.querySelectorAll('.ri-bar-partial')).toHaveLength(1)
    expect(container.querySelectorAll('.ri-bar-current')).toHaveLength(1)
    expect(container.querySelectorAll('.ri-bar-complete')).toHaveLength(1)
  })

  it('only the tallest week is direct-labelled, in compact kilometres', () => {
    const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)

    expect(endpointTexts(container)).toEqual([formatDistanceCompact(25000)])
  })

  it('a month of nothing labels nothing — the zero guard beats the tallest-bar rule', () => {
    const { container } = render(
      <WeeksInMonthChartInner
        buckets={[
          bucket({ distanceM: 0, runCount: 0 }),
          bucket({
            isoWeekKey: '2026-W32',
            clippedStartISO: '2026-08-03',
            clippedEndISO: '2026-08-09',
            distanceM: 0,
            runCount: 0,
          }),
        ]}
      />,
    )

    expect(endpointTexts(container)).toEqual([])
  })

  it('every bucket is tick-labelled — interval=0 — and the current one carries the bullet', () => {
    const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)

    const ticks = xTickTexts(container)
    expect(ticks).toEqual([
      formatDayCompact('2026-07-27'),
      formatDayCompact('2026-08-03'),
      formatDayCompact('2026-08-10'),
      `${formatDayCompact('2026-08-17')} •`,
    ])
  })

  it('y ticks are compact kilometres, never two decimals', () => {
    const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)

    const yTicks = [...container.querySelectorAll('.recharts-yAxis-tick-labels text')].map(
      (t) => t.textContent ?? '',
    )
    expect(yTicks.length).toBeGreaterThan(1)
    for (const tick of yTicks) expect(tick).toMatch(/^\d+ km$/)
  })

  describe('the keyboard tooltip', () => {
    it('names the week by its clipped range, then distance and runs', () => {
      const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)
      const first = BUCKETS[0]!

      expect(tooltipTextAfter(container, 0)).toBe(
        `${formatDayCompact(first.clippedStartISO)} – ${formatDayCompact(first.clippedEndISO)}` +
          `${formatDistanceM(first.distanceM)}2 runs`,
      )
    })

    it('a one-run week reads "1 run", not "1 runs"', () => {
      const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)
      const current = BUCKETS[3]!

      const text = tooltipTextAfter(container, 3)
      expect(text).toBe(
        `${formatDayCompact(current.clippedStartISO)} – ${formatDayCompact(current.clippedEndISO)}` +
          `${formatDistanceM(current.distanceM)}1 run`,
      )
    })

    it('a zero week still answers when asked — the bar is silent, the tooltip is not', () => {
      const { container } = render(<WeeksInMonthChartInner buckets={BUCKETS} />)
      const zero = BUCKETS[2]!

      const text = tooltipTextAfter(container, 2)
      expect(text).toBe(
        `${formatDayCompact(zero.clippedStartISO)} – ${formatDayCompact(zero.clippedEndISO)}` +
          `${formatDistanceM(zero.distanceM)}0 runs`,
      )
    })
  })
})
