'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ZONES, type ZoneDriftWeek } from '@/lib/charts'
import { formatDayCompact, formatPercent } from '@/lib/format'

/**
 * §3.7 — zone share per week over the same twelve weeks as §3.5, as a stacked area.
 *
 * The question is "is my training becoming more polarised, or just uniformly hard?", which is
 * part-to-whole over time, which is a stacked area. The y axis is always 0–100: a stack that does
 * not fill would invite reading the gap as something.
 *
 * The five hues are the same `--z1..--z5` as the run-detail zone bar, in the same order, because
 * "zone" is one concept with one palette everywhere in the app — a reader who has internalised the
 * bar reads this chart for free.
 *
 * A week with no heart-rate data is a **gap**, not five zeros: `null` values with
 * `connectNulls={false}`, so the area breaks rather than claiming an easy week.
 */
export function ZoneDriftChartInner({ weeks }: { weeks: readonly ZoneDriftWeek[] }) {
  const data = weeks.map((w) => ({
    label: formatDayCompact(w.weekStartISO) + (w.isCurrent ? ' •' : ''),
    weekStartISO: w.weekStartISO,
    hasData: w.hasData,
    z1: w.hasData ? w.sharePct[1] : null,
    z2: w.hasData ? w.sharePct[2] : null,
    z3: w.hasData ? w.sharePct[3] : null,
    z4: w.hasData ? w.sharePct[4] : null,
    z5: w.hasData ? w.sharePct[5] : null,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} accessibilityLayer margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} interval={1} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tickLine={false}
          axisLine={false}
          width={30}
          tickFormatter={(v: number) => formatPercent(v)}
        />
        <Tooltip
          cursor={{ className: 'recharts-tooltip-cursor' }}
          content={({ active, label }) => {
            if (!active) return null
            const row = data.find((d) => d.label === label)
            if (!row) return null
            return (
              <div className="ri-tooltip">
                <p className="ri-tooltip-label">week of {formatDayCompact(row.weekStartISO)}</p>
                {row.hasData ? (
                  ZONES.map((zone) => (
                    <p key={zone}>
                      Z{zone} {formatPercent(row[`z${zone}` as const] ?? 0)}
                    </p>
                  ))
                ) : (
                  <p>no heart-rate data</p>
                )}
              </div>
            )
          }}
        />
        {ZONES.map((zone) => (
          <Area
            key={zone}
            type="linear"
            dataKey={`z${zone}`}
            stackId="zones"
            className={`ri-zone-${zone} ri-zone-area`}
            // The fills ARE the data here, unlike a line chart's context wash, so full opacity.
            fillOpacity={1}
            isAnimationActive={false}
            connectNulls={false}
            dot={false}
            activeDot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
