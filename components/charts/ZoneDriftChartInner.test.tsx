// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ZONES, type ZoneDriftWeek } from '@/lib/charts'
import { formatDayCompact, formatPercent } from '@/lib/format'

import { ZoneDriftChartInner } from './ZoneDriftChartInner'

/*
 * §3.7's inner half renders for real. `ResponsiveContainer` measures its parent, and happy-dom has
 * no layout — every measurement comes back zero and the chart inside never mounts. The one
 * sanctioned bypass is below: the container becomes a fixed-size pass-through and everything
 * Recharts-shaped above it (axes, the stacked areas, keyboard tooltips) is the real library. No
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

const SHARES = { 1: 40, 2: 25, 3: 20, 4: 10, 5: 5 }

const WEEKS: ZoneDriftWeek[] = [
  {
    isoWeekKey: '2026-W31',
    weekStartISO: '2026-07-27',
    hasData: true,
    sharePct: { ...SHARES },
    isCurrent: false,
  },
  // The gap week: plotted as a gap, never as five zeros.
  {
    isoWeekKey: '2026-W32',
    weekStartISO: '2026-08-03',
    hasData: false,
    sharePct: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    isCurrent: false,
  },
  {
    isoWeekKey: '2026-W33',
    weekStartISO: '2026-08-10',
    hasData: true,
    sharePct: { 1: 30, 2: 25, 3: 25, 4: 10, 5: 10 },
    isCurrent: false,
  },
  {
    isoWeekKey: '2026-W34',
    weekStartISO: '2026-08-17',
    hasData: true,
    sharePct: { 1: 20, 2: 20, 3: 30, 4: 20, 5: 10 },
    isCurrent: true,
  },
]

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

describe('ZoneDriftChartInner', () => {
  it('stacks exactly five areas, one per zone, each in the shared zone palette class', () => {
    const { container } = render(<ZoneDriftChartInner weeks={WEEKS} />)

    expect(container.querySelectorAll('.recharts-area')).toHaveLength(ZONES.length)
    for (const zone of ZONES) {
      expect(container.querySelectorAll(`.ri-zone-${zone}`)).toHaveLength(1)
    }
    expect(container.querySelectorAll('.ri-zone-area')).toHaveLength(ZONES.length)
  })

  it('the y axis is the fixed 0–100 share scale, ticked at 0/50/100', () => {
    const { container } = render(<ZoneDriftChartInner weeks={WEEKS} />)

    const yTicks = [...container.querySelectorAll('.recharts-yAxis-tick-labels text')].map(
      (t) => t.textContent ?? '',
    )
    expect(yTicks).toEqual(['0%', '50%', '100%'])
  })

  it('twelve labels do not fit at phone width: interval=1 renders every other week', () => {
    const { container } = render(<ZoneDriftChartInner weeks={WEEKS} />)

    expect(xTickTexts(container)).toEqual(
      [0, 2].map((i) => {
        const tick = formatDayCompact(WEEKS[i]!.weekStartISO)
        return WEEKS[i]!.isCurrent ? `${tick} •` : tick
      }),
    )
  })

  describe('the keyboard tooltip', () => {
    it('a data week reads out all five zone shares', () => {
      const { container } = render(<ZoneDriftChartInner weeks={WEEKS} />)
      const first = WEEKS[0]!

      expect(tooltipTextAfter(container, 0)).toBe(
        `week of ${formatDayCompact(first.weekStartISO)}` +
          ZONES.map((z) => `Z${z} ${formatPercent(first.sharePct[z])}`).join(''),
      )
    })

    it('a no-HR week reads "no heart-rate data" — a gap, never five zeros', () => {
      const { container } = render(<ZoneDriftChartInner weeks={WEEKS} />)

      const text = tooltipTextAfter(container, 1)
      expect(text).toBe(`week of ${formatDayCompact(WEEKS[1]!.weekStartISO)}no heart-rate data`)
      expect(text).not.toContain('Z1')
    })
  })
})
