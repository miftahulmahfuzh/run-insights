// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ROLLING_MEAN_WEEKS, type VolumeTrendPoint } from '@/lib/charts'
import { formatDayCompact, formatDistanceM } from '@/lib/format'

import { VolumeTrendChartInner } from './VolumeTrendChartInner'

/*
 * §3.5's inner half renders for real. `ResponsiveContainer` measures its parent, and happy-dom has
 * no layout — every measurement comes back zero and the chart inside never mounts. The one
 * sanctioned bypass is below: the container becomes a fixed-size pass-through and everything
 * Recharts-shaped above it (axes, bars, the mean line, keyboard tooltips) is the real library. No
 * `from 'recharts'` import appears here — the boundary guard scans `.test.tsx` too.
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

function mondays(count: number, first: string): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${first}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i * 7)
    return d.toISOString().slice(0, 10)
  })
}

/** Six Mondays, 2026-07-06 through 2026-08-10; weeks 1–3 have no mean yet (honest gap). */
const SIX_WEEKS: VolumeTrendPoint[] = mondays(6, '2026-07-06').map((weekStartISO, i) => ({
  isoWeekKey: `2026-W${28 + i}`,
  weekStartISO,
  distanceM: 30000 + i * 2000,
  runCount: i === 0 ? 1 : 3,
  rollingMeanM: i < ROLLING_MEAN_WEEKS - 1 ? null : 33000,
  isCurrent: i === 5,
}))

/** Five weeks with the current one last — the only shape whose bullet tick survives thinning. */
const FIVE_WEEKS: VolumeTrendPoint[] = mondays(5, '2026-07-06').map((weekStartISO, i) => ({
  isoWeekKey: `2026-W${28 + i}`,
  weekStartISO,
  distanceM: 30000,
  runCount: 2,
  rollingMeanM: i < ROLLING_MEAN_WEEKS - 1 ? null : 30000,
  isCurrent: i === 4,
}))

function xTickTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map(
    (t) => t.textContent ?? '',
  )
}

function tooltipTextAfter(container: HTMLElement, arrowRights: number): string | null {
  const surface = container.querySelector('svg.recharts-surface')
  expect(surface).not.toBeNull()
  fireEvent.focus(surface!)
  for (let i = 0; i < arrowRights; i++) fireEvent.keyDown(surface!, { key: 'ArrowRight' })
  return container.querySelector('.ri-tooltip')?.textContent ?? null
}

describe('VolumeTrendChartInner', () => {
  it('draws one bar per week — current wears the current class, the rest the complete one', () => {
    const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)

    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(6)
    expect(container.querySelectorAll('.ri-bar-current')).toHaveLength(1)
    expect(container.querySelectorAll('.ri-bar-complete')).toHaveLength(5)
  })

  it('the mean line starts at week four: weeks 1–3 draw no dot, because no real window exists', () => {
    const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)

    expect(container.querySelector('.ri-mean-line')).not.toBeNull()
    expect(container.querySelectorAll('.ri-mean-dot')).toHaveLength(
      SIX_WEEKS.length - (ROLLING_MEAN_WEEKS - 1),
    )
  })

  it('twelve labels do not fit at phone width: interval=1 renders every other Monday', () => {
    const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)

    expect(xTickTexts(container)).toEqual(
      [0, 2, 4].map((i) => formatDayCompact(SIX_WEEKS[i]!.weekStartISO)),
    )
  })

  it('the current week tick carries the bullet — the third channel, on the label itself', () => {
    const { container } = render(<VolumeTrendChartInner points={FIVE_WEEKS} />)

    const ticks = xTickTexts(container)
    expect(ticks.at(-1)).toBe(`${formatDayCompact(FIVE_WEEKS[4]!.weekStartISO)} •`)
    expect(ticks.filter((t) => t.includes('•'))).toHaveLength(1)
  })

  it('y ticks are compact kilometres — an axis never prints two decimals', () => {
    const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)

    const yTicks = [...container.querySelectorAll('.recharts-yAxis-tick-labels text')].map(
      (t) => t.textContent ?? '',
    )
    expect(yTicks.length).toBeGreaterThan(1)
    for (const tick of yTicks) expect(tick).toMatch(/^\d+ km$/)
  })

  describe('the keyboard tooltip', () => {
    it('a one-run week reads "1 run", not "1 runs"', () => {
      const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)
      const first = SIX_WEEKS[0]!

      expect(tooltipTextAfter(container, 0)).toBe(
        `week of ${formatDayCompact(first.weekStartISO)}${formatDistanceM(first.distanceM)}1 run`,
      )
    })

    it('a no-mean week omits the mean line instead of printing a null', () => {
      const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)
      const week2 = SIX_WEEKS[2]!

      const text = tooltipTextAfter(container, 2)
      expect(text).toBe(
        `week of ${formatDayCompact(week2.weekStartISO)}${formatDistanceM(week2.distanceM)}3 runs`,
      )
    })

    it('a mean week states the mean with the shared wording', () => {
      const { container } = render(<VolumeTrendChartInner points={SIX_WEEKS} />)
      const week3 = SIX_WEEKS[3]!

      const text = tooltipTextAfter(container, 3)
      expect(text).toBe(
        `week of ${formatDayCompact(week3.weekStartISO)}${formatDistanceM(week3.distanceM)}3 runs` +
          `4-week mean ${formatDistanceM(week3.rollingMeanM!)}`,
      )
    })
  })
})
