'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { MonthWeekBucket } from '@/lib/charts'
import { formatDayCompact, formatDistanceCompact, formatDistanceM } from '@/lib/format'

/**
 * §3.4 — distance per ISO week within the selected calendar month. The Nike-Run-Club chart.
 *
 * A bar rather than a line, for the same reason the sibling app's month chart is: a week is a
 * discrete, completed (or in-progress) bucket, and the reader's question is a magnitude comparison
 * against a common baseline.
 *
 * **`minPointSize` is deliberately absent.** A zero-distance week — an injury week, a taper — draws
 * as a true zero. A sympathy sliver would claim a run that never happened, which is the same class
 * of lie as the zone bar's clamp would be if the clamp changed the printed number.
 *
 * Three ordinal steps of ONE hue, never three colours: complete, partial-at-the-boundary, and
 * still-in-progress. Colour never carries it alone — the tick gets a `•` for the current week and
 * the caption names the partial ones in words.
 */
export function WeeksInMonthChartInner({ buckets }: { buckets: readonly MonthWeekBucket[] }) {
  const data = buckets.map((b) => ({
    ...b,
    label: formatDayCompact(b.clippedStartISO) + (b.isCurrent ? ' •' : ''),
  }))
  const tallest = data.reduce(
    (best, b, i) => (b.distanceM > (data[best]?.distanceM ?? -1) ? i : best),
    0,
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} accessibilityLayer margin={{ top: 18, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} interval={0} />
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
            const bucket = data.find((b) => b.label === label)
            if (!bucket) return null
            return (
              <div className="ri-tooltip">
                <p className="ri-tooltip-label">
                  {formatDayCompact(bucket.clippedStartISO)} –{' '}
                  {formatDayCompact(bucket.clippedEndISO)}
                </p>
                <p>{formatDistanceM(bucket.distanceM)}</p>
                <p>
                  {bucket.runCount} {bucket.runCount === 1 ? 'run' : 'runs'}
                </p>
              </div>
            )
          }}
        />
        <Bar dataKey="distanceM" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {data.map((bucket) => (
            <Cell
              key={bucket.isoWeekKey + bucket.clippedStartISO}
              className={
                bucket.isCurrent
                  ? 'ri-bar-current'
                  : bucket.isPartial
                    ? 'ri-bar-partial'
                    : 'ri-bar-complete'
              }
            />
          ))}
          {/* Direct-label only the tallest bar: the reader already has the month total as the hero
              number above, so this chart's marginal information is "which week was biggest". */}
          <LabelList
            valueAccessor={(_entry: unknown, index: number) =>
              index === tallest && data[index] && data[index]!.distanceM > 0
                ? formatDistanceCompact(data[index]!.distanceM)
                : ''
            }
            position="top"
            offset={8}
            className="ri-endpoint"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
