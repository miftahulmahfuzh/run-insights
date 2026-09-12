// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { dayIndexToISO, paceTrendLine, type PaceTrendPoint } from '@/lib/charts'
import { formatDayCompact, formatDistanceM, formatPace } from '@/lib/format'

import { PaceTrendChartInner } from './PaceTrendChartInner'

/*
 * §3.6's inner half renders for real. `ResponsiveContainer` measures its parent, and happy-dom has
 * no layout — every measurement comes back zero and the chart inside never mounts. The one
 * sanctioned bypass is below: the container becomes a fixed-size pass-through and everything
 * Recharts-shaped above it (axes, scales, bubbles, keyboard tooltips) is the real library. The
 * file contains no `from 'recharts'` import — the boundary guard scans `.test.tsx` too.
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

const START = '2026-06-29'
const DAYS = 83

const RUNS: PaceTrendPoint[] = [
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

function bubbleWidths(container: HTMLElement): number[] {
  return [...container.querySelectorAll('path.recharts-symbols')].map((s) =>
    Number(s.getAttribute('width')),
  )
}

function tooltipTextAfter(container: HTMLElement, arrowRights: number): string | null {
  const surface = container.querySelector('svg.recharts-surface')
  expect(surface).not.toBeNull()
  fireEvent.focus(surface!)
  for (let i = 0; i < arrowRights; i++) fireEvent.keyDown(surface!, { key: 'ArrowRight' })
  return container.querySelector('.ri-tooltip')?.textContent ?? null
}

describe('PaceTrendChartInner', () => {
  it('draws one bubble per run — the scatter is the whole plot', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
    )

    expect(container.querySelectorAll('path.recharts-symbols')).toHaveLength(RUNS.length)
  })

  it('bubble size tracks distance within the band — bigger run, bigger bubble, every pair', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
    )

    const widths = bubbleWidths(container)
    for (let i = 0; i < RUNS.length; i++) {
      for (let j = 0; j < RUNS.length; j++) {
        const byDistance = Math.sign(RUNS[i]!.distanceM - RUNS[j]!.distanceM)
        const bySize = Math.sign(widths[i]! - widths[j]!)
        expect(bySize).toBe(byDistance)
      }
    }
  })

  it('bubbles stay inside the Z range [36, 150] — an outlier cannot eat the plot', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
    )

    for (const width of bubbleWidths(container)) {
      // range values are AREAS: width = 2·√(area/π)
      expect(width).toBeGreaterThanOrEqual(2 * Math.sqrt(36 / Math.PI) - 0.01)
      expect(width).toBeLessThanOrEqual(2 * Math.sqrt(150 / Math.PI) + 0.01)
    }
  })

  it('the x axis marks the thirds of the window — both ends included — as compact days', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
    )

    const expectedTicks = [0, Math.round(DAYS / 3), Math.round((DAYS * 2) / 3), DAYS]
    const labels = [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map(
      (t) => t.textContent ?? '',
    )
    expect(labels).toEqual(expectedTicks.map((d) => formatDayCompact(dayIndexToISO(START, d))))
    expect(labels[0]).toBe('29 Jun')
  })

  it('the y axis is padded ±15 s and reversed: the fastest tick sits at the top', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
    )

    const paces = RUNS.map((p) => p.avgPaceSec)
    const yLabels = [...container.querySelectorAll('.recharts-yAxis-tick-labels text')]
      .map((el) => ({ text: el.textContent ?? '', y: Number(el.getAttribute('y')) }))
      .sort((a, b) => a.y - b.y)
      .map(({ text }) => text)

    expect(yLabels[0]).toBe(formatPace(Math.min(...paces) - 15))
    expect(yLabels.at(-1)).toBe(formatPace(Math.max(...paces) + 15))
    expect(container.textContent).toContain('PACE (FASTER ↑)')
  })

  it('a supported trend line renders as exactly one segment reference line', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
    )

    expect(paceTrendLine(RUNS)).not.toBeNull()
    expect(container.querySelectorAll('.recharts-reference-line')).toHaveLength(1)
    expect(container.querySelector('.ri-trend-line')).not.toBeNull()
  })

  it('showTrendLine=false draws no line — the §9 gate is decided above, never defaulted here', () => {
    const { container } = render(
      <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine={false} />,
    )

    expect(container.querySelectorAll('.recharts-reference-line')).toHaveLength(0)
  })

  describe('the keyboard tooltip', () => {
    it('reads the first run as date, distance and pace — all through lib/format', () => {
      const { container } = render(
        <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
      )
      const first = RUNS[0]!

      expect(tooltipTextAfter(container, 0)).toBe(
        `${formatDayCompact(first.occurredOn)}${formatDistanceM(first.distanceM)}${formatPace(first.avgPaceSec, true)}`,
      )
    })

    it('arrows reach the last run, where the trend line ends', () => {
      const { container } = render(
        <PaceTrendChartInner points={RUNS} startISO={START} days={DAYS} showTrendLine />,
      )
      const last = RUNS[RUNS.length - 1]!

      expect(tooltipTextAfter(container, RUNS.length - 1)).toBe(
        `${formatDayCompact(last.occurredOn)}${formatDistanceM(last.distanceM)}${formatPace(last.avgPaceSec, true)}`,
      )
    })
  })
})
