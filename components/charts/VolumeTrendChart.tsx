'use client'

import dynamic from 'next/dynamic'

import { ROLLING_MEAN_WEEKS, type VolumeTrendPoint } from '@/lib/charts'
import { formatDayCompact, formatDistanceM } from '@/lib/format'
import { ChartFrame, ChartSkeleton, LegendKey, TableTwin } from './ChartFrame'

const Inner = dynamic(
  () => import('./VolumeTrendChartInner').then((m) => m.VolumeTrendChartInner),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={168} />,
  },
)

/**
 * §3.5's outer half.
 *
 * **This chart does not move when the Week/Month switcher above it moves.** It is a rolling window
 * of the last twelve ISO weeks, independent of anything selected on the rest of the screen — §2.3's
 * non-conflation rule, and the reason its title says "last 12 weeks" out loud.
 */
export function VolumeTrendChart({ points }: { points: readonly VolumeTrendPoint[] }) {
  const hasMean = points.some((p) => p.rollingMeanM != null)

  return (
    <ChartFrame
      title="Weekly volume · last 12 weeks"
      height={168}
      legend={
        <>
          <LegendKey className="ri-bar-complete" variant="bar">
            Weekly distance
          </LegendKey>
          {hasMean && (
            <LegendKey className="ri-mean-line recharts-curve">
              {ROLLING_MEAN_WEEKS}-week mean
            </LegendKey>
          )}
        </>
      }
      caption={
        hasMean
          ? undefined
          : `The ${ROLLING_MEAN_WEEKS}-week mean appears once there are ${ROLLING_MEAN_WEEKS} weeks behind it.`
      }
      table={
        <TableTwin columns={['Week', 'Runs', 'Distance', `${ROLLING_MEAN_WEEKS}-wk mean`]}>
          {points.map((p) => (
            <tr key={p.isoWeekKey} className="border-t border-rule-2">
              <td className="py-1.5 font-semibold text-ink">
                {formatDayCompact(p.weekStartISO)}
                {p.isCurrent && <span className="text-ink-3"> •</span>}
              </td>
              <td className="py-1.5 text-right text-ink-2">{p.runCount}</td>
              <td className="py-1.5 text-right text-ink-2">{formatDistanceM(p.distanceM)}</td>
              <td className="py-1.5 text-right text-ink-2">
                {p.rollingMeanM == null ? '—' : formatDistanceM(p.rollingMeanM)}
              </td>
            </tr>
          ))}
        </TableTwin>
      }
    >
      <Inner points={points} />
    </ChartFrame>
  )
}
