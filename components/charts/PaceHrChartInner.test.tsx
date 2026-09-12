// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { formatBpm, formatCadence, formatPace } from '@/lib/format'
import type { PaceHrPoint } from '@/lib/charts'

import { PaceHrChartInner } from './PaceHrChartInner'

/*
 * §3.1's inner half renders for real. `ResponsiveContainer` measures its parent, and happy-dom has
 * no layout — every measurement comes back zero and the chart inside never mounts. The one
 * sanctioned bypass is below: the container becomes a fixed-size pass-through and everything
 * Recharts-shaped above it (axes, scales, dots, keyboard tooltips) is the real library.
 *
 * Two boundary-guard rules shape the file: the guard scans `.test.tsx` too, so there is no
 * `from 'recharts'` import (the factory's `importOriginal` needs none) and no `yAxisId` anywhere —
 * the dual axis is asserted by counting the rendered y-axis groups instead.
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

/** Twenty-two splits — the shape of the 21.2 km run behind the axis-thinning fix (card #18). */
const SPLITS: PaceHrPoint[] = Array.from({ length: 22 }, (_, i) => {
  const km = i + 1
  const partial = km === 22
  return {
    km,
    paceSec: partial ? 452 : 400 + (i % 5) * 10,
    timeSec: 300 + i * 60,
    hr: km === 5 ? null : 140 + ((i * 3) % 35),
    cadence: km === 7 ? null : 160 + (i % 9),
    partial,
    distanceM: partial ? 670 : 1000,
  }
})

/** The whole x-axis ladder: stride 2, the last row force-appended because it carries the `*`. */
const EXPECTED_TICK_LABELS = ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19', '22*']

function xTickTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map(
    (t) => t.textContent ?? '',
  )
}

function yTickTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recharts-yAxis-tick-labels text')].map(
    (t) => t.textContent ?? '',
  )
}

/** One tick-label element per (text, y) pair, y ascending — top of the chart first. */
function tickLabelsByHeight(
  container: HTMLElement,
  texts: string[],
): { text: string; y: number }[] {
  return [...container.querySelectorAll('.recharts-yAxis-tick-labels text')]
    .map((el) => ({ text: el.textContent ?? '', y: Number(el.getAttribute('y')) }))
    .filter(({ text }) => texts.includes(text))
    .sort((a, b) => a.y - b.y)
}

/** `6'20"` → 380. The inverse of the only pace spelling lib/format allows. */
function parsePace(label: string): number {
  const m = /^(\d+)'(\d+)"$/.exec(label)
  expect(m, `not a pace label: ${label}`).toBeTruthy()
  return Number(m![1]) * 60 + Number(m![2])
}

/**
 * The keyboard path is the accessibilityLayer's whole point: Tab in, arrow through the
 * kilometres, and the custom tooltip is the readout. happy-dom delivers the same events, so the
 * walk below is how every tooltip assertion reaches its kilometre.
 */
function tooltipTextAfter(container: HTMLElement, arrowRights: number): string | null {
  const surface = container.querySelector('svg.recharts-surface')
  expect(surface).not.toBeNull()
  expect(surface).toHaveAttribute('role', 'application')
  fireEvent.focus(surface!)
  for (let i = 0; i < arrowRights; i++) fireEvent.keyDown(surface!, { key: 'ArrowRight' })
  return container.querySelector('.ri-tooltip')?.textContent ?? null
}

describe('PaceHrChartInner', () => {
  it('renders one real chart surface with the dual axis the §12 waiver grants', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    expect(container.querySelector('svg.recharts-surface')).not.toBeNull()
    // Two y-axis groups: pace on the left, HR on the right — the app's only dual-axis chart.
    expect(container.querySelectorAll('.recharts-yAxis')).toHaveLength(2)
  })

  it('labels exactly eleven kilometres, thinning by stride and force-appending the partial', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    expect(xTickTexts(container)).toEqual(EXPECTED_TICK_LABELS)
    expect(xTickTexts(container)).toHaveLength(11)
  })

  it('the partial kilometre is announced on the axis itself as `22*` — the third channel', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    expect(xTickTexts(container).at(-1)).toBe('22*')
    expect(xTickTexts(container)).not.toContain('22')
  })

  it('the shared pace-axis sentence renders on the left axis', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    expect(container.textContent).toContain('PACE (FASTER ↑)')
  })

  it('the pace axis is reversed: faster is always higher, tick by tick', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    const paceTicks = tickLabelsByHeight(
      container,
      yTickTexts(container).filter((t) => /^\d+'\d+"$/.test(t)),
    )
    expect(paceTicks.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < paceTicks.length; i++) {
      expect(parsePace(paceTicks[i]!.text)).toBeGreaterThanOrEqual(
        parsePace(paceTicks[i - 1]!.text),
      )
    }
  })

  it('the HR axis is standard orientation: higher bpm sits higher on the page', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    const hrTicks = tickLabelsByHeight(
      container,
      yTickTexts(container).filter((t) => /^\d+$/.test(t)),
    )
    expect(hrTicks.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < hrTicks.length; i++) {
      expect(Number(hrTicks[i]!.text)).toBeLessThanOrEqual(Number(hrTicks[i - 1]!.text))
    }
  })

  it('every split gets a pace dot; the enlarged dots are exactly the partial final pair', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    // km 1..21 wear the plain pace class at r=3; km 22 (the punchline) is the partial dot at 4.5.
    const paceDots = [...container.querySelectorAll('circle.ri-pace-dot')]
    expect(paceDots).toHaveLength(21)
    expect(paceDots.every((d) => d.getAttribute('r') === '3')).toBe(true)

    const partialDots = [...container.querySelectorAll('circle.ri-partial-dot')]
    expect(partialDots).toHaveLength(2) // one per series — same kilometre, same cue
    expect(partialDots.map((d) => d.getAttribute('r'))).toEqual(['4.5', '4.5'])
  })

  it('the partial dot replaces the kind dot on BOTH series — one cue, not two', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    // km 22 is partial and has HR, so exactly two dots wear the partial class: one per line.
    expect(container.querySelectorAll('circle.ri-partial-dot')).toHaveLength(2)
  })

  it('a split without HR is a gap, not a guessed point: no dot is drawn there', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    // 21 splits carry HR; km 22 of those wears the partial class; km 5 is the gap.
    expect(container.querySelectorAll('circle.ri-hr-dot')).toHaveLength(20)
  })

  it('only the punchline is labelled: the last pace and the last HR, nothing between', () => {
    const { container } = render(<PaceHrChartInner points={SPLITS} />)

    const last = SPLITS[SPLITS.length - 1]!
    const endpointTexts = [...container.querySelectorAll('.ri-endpoint')]
      .map((el) => el.textContent ?? '')
      .filter((t) => t !== '')
    expect(endpointTexts).toEqual([formatPace(last.paceSec), String(last.hr)])
  })

  it('no HR anywhere means ONE y-axis, no HR line, and no HR endpoint label', () => {
    const withoutHr = SPLITS.map((p) => ({ ...p, hr: null }))
    const { container } = render(<PaceHrChartInner points={withoutHr} />)

    expect(container.querySelectorAll('.recharts-yAxis')).toHaveLength(1)
    expect(container.querySelectorAll('circle.ri-hr-dot')).toHaveLength(0)
    expect(container.querySelectorAll('circle.ri-partial-dot')).toHaveLength(1)
    const endpointTexts = [...container.querySelectorAll('.ri-endpoint')]
      .map((el) => el.textContent ?? '')
      .filter((t) => t !== '')
    expect(endpointTexts).toEqual([formatPace(SPLITS[SPLITS.length - 1]!.paceSec)])
  })

  describe('the keyboard tooltip (the §11 walk)', () => {
    it('is not on the page before the reader arrives', () => {
      const { container } = render(<PaceHrChartInner points={SPLITS} />)

      expect(container.querySelector('.ri-tooltip')).toBeNull()
    })

    it('focus lands on km 1 and prints pace, HR and cadence through lib/format', () => {
      const { container } = render(<PaceHrChartInner points={SPLITS} />)
      const first = SPLITS[0]!

      expect(tooltipTextAfter(container, 0)).toBe(
        `km ${first.km}pace ${formatPace(first.paceSec, true)}HR ${formatBpm(first.hr!)}${formatCadence(first.cadence!)}`,
      )
    })

    it('arrows walk the kilometres in order, past the thinned axis labels', () => {
      const { container } = render(<PaceHrChartInner points={SPLITS} />)
      // km 4 was thinned OFF the axis; the keyboard still reaches it. Labels thin; data does not.
      const km4 = SPLITS[3]!

      expect(tooltipTextAfter(container, 3)).toBe(
        `km ${km4.km}pace ${formatPace(km4.paceSec, true)}HR ${formatBpm(km4.hr!)}${formatCadence(km4.cadence!)}`,
      )
    })

    it('the partial kilometre reads "km 22 · partial"', () => {
      const { container } = render(<PaceHrChartInner points={SPLITS} />)
      const last = SPLITS[SPLITS.length - 1]!

      expect(tooltipTextAfter(container, 21)).toBe(
        `km ${last.km} · partialpace ${formatPace(last.paceSec, true)}HR ${formatBpm(last.hr!)}${formatCadence(last.cadence!)}`,
      )
    })

    it('a split with no HR omits the HR line instead of printing a null', () => {
      const { container } = render(<PaceHrChartInner points={SPLITS} />)
      const km5 = SPLITS[4]!

      const text = tooltipTextAfter(container, 4)
      expect(text).toContain(`km ${km5.km}`)
      expect(text).not.toContain('HR')
      expect(text).not.toContain('bpm')
    })

    it('a split with no cadence omits the cadence line instead of printing a null', () => {
      const { container } = render(<PaceHrChartInner points={SPLITS} />)
      const km7 = SPLITS[6]!

      const text = tooltipTextAfter(container, 6)
      expect(text).toContain(`km ${km7.km}`)
      expect(text).not.toContain('spm')
    })
  })
})
