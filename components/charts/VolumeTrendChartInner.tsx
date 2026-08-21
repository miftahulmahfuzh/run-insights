'use client'

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { VolumeTrendPoint } from '@/lib/charts'
import { formatDayCompact, formatDistanceCompact, formatDistanceM } from '@/lib/format'

/**
 * §3.5 — twelve weeks of distance, with a 4-week trailing mean over the top.
 *
 * **Not a dual-axis chart.** Both series are kilometres on one scale; the only second y-axis in the
 * whole app is in `PaceHrChartInner.tsx` (§12's guardrail, checked in CI). This is the sanctioned
 * "one series is the point, the rest is context" form.
 *
 * `connectNulls={false}` is the honest half of the rolling mean: weeks 1–3 have no real 4-week
 * window, so the line begins at week 4 with a visible gap before it rather than a guessed value
 * drawn at full confidence.
 */
export function VolumeTrendChartInner({ points }: { points: readonly VolumeTrendPoint[] }) {
  const data = points.map((p) => ({
    ...p,
    label: formatDayCompact(p.weekStartISO) + (p.isCurrent ? ' •' : ''),
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        accessibilityLayer
        margin={{ top: 12, right: 4, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          // Twelve labels do not fit at 414px; every other one does, and the tooltip and the table
          // twin both carry the exact week for any bar a reader wants to name.
          interval={1}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={38}
          tickFormatter={(m: number) => formatDistanceCompact(m)}
        />
        <Tooltip
          cursor={{ className: 'recharts-tooltip-cursor' }}
          content={({ active, label }) => {
            if (!active) return null
            const point = data.find((p) => p.label === label)
            if (!point) return null
            return (
              <div className="ri-tooltip">
                <p className="ri-tooltip-label">week of {formatDayCompact(point.weekStartISO)}</p>
                <p>{formatDistanceM(point.distanceM)}</p>
                <p>
                  {point.runCount} {point.runCount === 1 ? 'run' : 'runs'}
                </p>
                {point.rollingMeanM != null && (
                  <p>4-week mean {formatDistanceM(point.rollingMeanM)}</p>
                )}
              </div>
            )
          }}
        />
        <Bar dataKey="distanceM" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
          {data.map((point) => (
            <Cell
              key={point.isoWeekKey}
              className={point.isCurrent ? 'ri-bar-current' : 'ri-bar-complete'}
            />
          ))}
        </Bar>
        <Line
          type="linear"
          dataKey="rollingMeanM"
          className="ri-mean-line"
          strokeWidth={2}
          isAnimationActive={false}
          connectNulls={false}
          dot={{ r: 2.5, strokeWidth: 2, className: 'ri-mean-dot' }}
          activeDot={{ r: 4, strokeWidth: 2, className: 'ri-mean-dot' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
