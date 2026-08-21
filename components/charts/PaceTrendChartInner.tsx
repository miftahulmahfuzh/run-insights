'use client'

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { dayIndexToISO, paceTrendLine, type PaceTrendPoint } from '@/lib/charts'
import { formatDayCompact, formatDistanceM, formatPace } from '@/lib/format'

/**
 * §3.6 — one distance band's runs over the last twelve weeks, as a scatter.
 *
 * **The y axis is inverted, exactly as in §3.1.** "Up is faster" is a global rule in this app, not a
 * per-chart trick: a reader who learns it on the run-detail chart must not have to relearn it here.
 * A single y scale, so no waiver is involved.
 *
 * **Size is distance, scaled within the selected band's own range** — the band has already equalised
 * the big jumps, so the bubble encodes the variance that remains (10.1 km vs 11.9 km inside "10K")
 * rather than re-encoding what the filter already handled.
 *
 * One series, so no legend box: the card title plus the active filter chip already say what is
 * plotted (marks-and-anatomy). The trend line is the same hue at full opacity, because it is a
 * statistic about these points and not a second series.
 */
export function PaceTrendChartInner({
  points,
  startISO,
  days,
  showTrendLine = true,
}: {
  points: readonly PaceTrendPoint[]
  startISO: string
  days: number
  showTrendLine?: boolean
}) {
  const line = showTrendLine ? paceTrendLine(points) : null

  const paces = points.map((p) => p.avgPaceSec)
  const padSec = 15
  const yDomain: [number, number] = [Math.min(...paces) - padSec, Math.max(...paces) + padSec]

  const distances = points.map((p) => p.distanceM)
  const zDomain: [number, number] = [Math.min(...distances), Math.max(...distances)]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart accessibilityLayer margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          type="number"
          dataKey="dayIndex"
          domain={[0, days]}
          ticks={[0, Math.round(days / 3), Math.round((days * 2) / 3), days]}
          tickLine={false}
          tickFormatter={(day: number) => formatDayCompact(dayIndexToISO(startISO, day))}
        />
        <YAxis
          type="number"
          dataKey="avgPaceSec"
          // Inverted: the fastest pace renders at the top. Same rule, same direction, every chart.
          reversed
          domain={yDomain}
          tickLine={false}
          axisLine={false}
          width={46}
          tickFormatter={(sec: number) => formatPace(sec)}
          label={{ value: 'PACE (FASTER ↑)', angle: -90, position: 'insideLeft', offset: 8 }}
        />
        {/* Bubble radius, not a colour ramp: distance is a magnitude, and the palette is spoken for. */}
        <ZAxis type="number" dataKey="distanceM" range={[36, 150]} domain={zDomain} />
        <Tooltip
          cursor={{ strokeDasharray: 'none' }}
          content={({ active, payload }) => {
            const point = active ? (payload?.[0]?.payload as PaceTrendPoint | undefined) : undefined
            if (!point) return null
            return (
              <div className="ri-tooltip">
                <p className="ri-tooltip-label">{formatDayCompact(point.occurredOn)}</p>
                <p>{formatDistanceM(point.distanceM)}</p>
                <p>{formatPace(point.avgPaceSec, true)}</p>
              </div>
            )
          }}
        />
        <Scatter data={[...points]} className="ri-scatter" isAnimationActive={false} />
        {line && (
          /* A segment reference line, so the regression is drawn only across the range it was fitted
             on — extending it to the axis edges would imply data on both sides that does not exist. */
          <ReferenceLine
            className="ri-trend-line"
            strokeWidth={2}
            segment={[
              { x: line.from.dayIndex, y: line.from.paceSec },
              { x: line.to.dayIndex, y: line.to.paceSec },
            ]}
          />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  )
}
