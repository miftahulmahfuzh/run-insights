'use client'

import dynamic from 'next/dynamic'

import type { PaceHrPoint } from '@/lib/charts'
import { ChartFrame, ChartSkeleton, LegendKey } from './ChartFrame'
import { EmptySlot } from '@/components/ui/EmptyState'

/**
 * §3.1's outer half. This file exists to be as small as possible.
 *
 * `ssr: false` inside `dynamic()` is illegal in a Server Component under Next 16 / React 19, so the
 * `dynamic()` call has to live in a file that already carries `'use client'` — and that file should
 * do nothing else, so that everything Recharts-shaped stays behind the lazy boundary. A session
 * that opens `/` and `/upload` and never a run detail page downloads none of it (§7).
 */
const Inner = dynamic(() => import('./PaceHrChartInner').then((m) => m.PaceHrChartInner), {
  ssr: false,
  loading: () => <ChartSkeleton height={186} />,
})

export function PaceHrChart({ points }: { points: readonly PaceHrPoint[] }) {
  const fullSplits = points.filter((p) => !p.partial)
  const hasHr = points.some((p) => p.hr != null)

  return (
    <ChartFrame
      title="Pace & heart rate"
      height={186}
      legend={
        <>
          <LegendKey className="ri-pace-line recharts-curve">Pace</LegendKey>
          {hasHr && <LegendKey className="ri-hr-line recharts-curve">Heart rate</LegendKey>}
        </>
      }
      caption={
        points.some((p) => p.partial)
          ? 'The pace axis is inverted: higher is faster. * marks the partial final kilometre.'
          : 'The pace axis is inverted: higher is faster.'
      }
      /* §3.1: the splits table directly below IS this chart's table twin — same eleven rows, every
         value printed, adjacent on the page. A second table here would be duplication, not access. */
      table={null}
    >
      {fullSplits.length < 2 ? (
        /* dataviz's own "is it even a chart?" check: two points is the floor for a line to mean
           anything. Below it, the numbers are all in the splits table and the honest thing is to
           say so rather than draw a one-point trend. */
        <EmptySlot>Too short for a per-kilometre trend — the splits are below.</EmptySlot>
      ) : (
        <Inner points={points} />
      )}
    </ChartFrame>
  )
}
