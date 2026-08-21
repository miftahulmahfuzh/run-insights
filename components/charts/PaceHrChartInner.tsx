'use client'

import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { hrDomain, paceDomain, type PaceHrPoint } from '@/lib/charts'
import { formatBpm, formatPace } from '@/lib/format'

/**
 * §3.1 — pace and heart rate per kilometre. **The signature chart, and the app's only dual-axis
 * one.** §12 is the waiver in full and R-25 upholds it; the short version is that the two series
 * are two readings of the same kilometre, both axes are anchored to the run's own min/max rather
 * than tuned, the claim the chart makes is one F06 already proved arithmetically, and every value
 * is also printed in the splits table directly below.
 *
 * **The guardrail: `yAxisId` appears in this file and nowhere else in `components/charts`.**
 * `scripts/check-f08-boundaries.mjs` fails the build if a second file declares one. If a future
 * chart wants two scales, that is a new decision needing its own justification of §12's depth —
 * this waiver does not generalise.
 *
 * Everything Recharts-shaped lives in this file, behind the outer component's `dynamic()` import,
 * so a session that never opens a run never downloads the library (§7).
 */

/** Up is always faster, everywhere in this app. The axis says so in words, not only by reversal. */
const PACE_AXIS_LABEL = 'PACE (FASTER ↑)'

export function PaceHrChartInner({ points }: { points: readonly PaceHrPoint[] }) {
  const data = [...points]
  const last = data[data.length - 1]
  const paceScale = paceDomain(data)
  const hrScale = hrDomain(data)
  const hasHr = hrScale !== null

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        // Recharts 3's keyboard path: Tab into the chart, arrow through the kilometres, and the
        // same readout a pointer produces is announced. §11 verifies it by tabbing.
        accessibilityLayer
        margin={{ top: 16, right: 8, bottom: 4, left: 0 }}
      >
        <CartesianGrid vertical={false} />

        <XAxis
          dataKey="km"
          tickLine={false}
          // `11*` — the same non-colour partial marker as the splits table, so a reader scanning
          // only the axis still sees it (D14, third channel).
          tickFormatter={(km: number) => {
            const point = data.find((p) => p.km === km)
            return point?.partial ? `${km}*` : String(km)
          }}
          interval={0}
          minTickGap={0}
        />

        <YAxis
          yAxisId="pace"
          // REVERSED: domain[0] renders at the top, and paceDomain returns fastest-first.
          reversed
          domain={paceScale ?? ['auto', 'auto']}
          tickLine={false}
          axisLine={false}
          width={46}
          tickFormatter={(sec: number) => formatPace(sec)}
          label={{ value: PACE_AXIS_LABEL, angle: -90, position: 'insideLeft', offset: 8 }}
        />

        {hasHr && (
          <YAxis
            yAxisId="hr"
            orientation="right"
            domain={hrScale}
            tickLine={false}
            axisLine={false}
            width={30}
          />
        )}

        <Tooltip
          // One tooltip, every series, snapped to the kilometre rather than to a dot: 414 / 11
          // splits is a ~34px band, comfortably past the 24px floor and past what a thumb needs.
          cursor={{ className: 'recharts-tooltip-cursor' }}
          content={({ active, label }) => {
            if (!active) return null
            const point = data.find((p) => p.km === label)
            if (!point) return null
            return (
              <div className="ri-tooltip">
                <p className="ri-tooltip-label">
                  km {point.km}
                  {point.partial ? ' · partial' : ''}
                </p>
                <p>pace {formatPace(point.paceSec, true)}</p>
                {point.hr != null && <p>HR {formatBpm(point.hr)}</p>}
                {point.cadence != null && <p>{point.cadence} spm</p>}
              </div>
            )
          }}
        />

        <Line
          yAxisId="pace"
          type="linear"
          dataKey="paceSec"
          name="Pace"
          className="ri-pace-line"
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props) => <SeriesDot {...props} kind="pace" data={data} />}
          activeDot={{ r: 5, className: 'ri-pace-dot', strokeWidth: 2 }}
        >
          {/* Endpoint labels only — the last split is the punchline of a fatigue story, and
              labelling all eleven would bury it. */}
          <LabelList
            valueAccessor={(_entry: unknown, index: number) =>
              index === data.length - 1 && last ? formatPace(last.paceSec) : ''
            }
            position="top"
            offset={10}
            className="ri-endpoint"
          />
        </Line>

        {hasHr && (
          <Line
            yAxisId="hr"
            type="linear"
            dataKey="hr"
            name="HR"
            className="ri-hr-line"
            strokeWidth={2}
            isAnimationActive={false}
            // A split with no HR is a gap, not a straight line drawn through missing data.
            connectNulls={false}
            dot={(props) => <SeriesDot {...props} kind="hr" data={data} />}
            activeDot={{ r: 5, className: 'ri-hr-dot', strokeWidth: 2 }}
          >
            <LabelList
              valueAccessor={(_entry: unknown, index: number) =>
                index === data.length - 1 && last?.hr != null ? String(last.hr) : ''
              }
              position="top"
              offset={10}
              className="ri-endpoint"
            />
          </Line>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * A dot per split, bigger on the last one, and **dashed on the partial kilometre**.
 *
 * Dashing is banned for gridlines (it competes with real data) but is exactly right as a
 * "this one is different" cue on a single point: it reads at a glance, survives greyscale, and does
 * not spend a hue that already means something else in this app.
 */
function SeriesDot({
  cx,
  cy,
  index,
  kind,
  data,
}: {
  cx?: number
  cy?: number
  index?: number
  kind: 'pace' | 'hr'
  data: readonly PaceHrPoint[]
}) {
  if (cx == null || cy == null || index == null) return <g />
  const point = data[index]
  const isLast = index === data.length - 1
  const className = point?.partial
    ? 'ri-partial-dot'
    : kind === 'pace'
      ? 'ri-pace-dot'
      : 'ri-hr-dot'

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isLast ? 4.5 : 3}
      strokeWidth={2}
      className={className}
      // The dots are decoration over a line whose values are all in the table below.
      aria-hidden="true"
    />
  )
}
