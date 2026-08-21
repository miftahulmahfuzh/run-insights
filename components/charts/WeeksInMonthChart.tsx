'use client'

import dynamic from 'next/dynamic'

import type { MonthWeekBucket } from '@/lib/charts'
import { formatDayCompact, formatDistanceM } from '@/lib/format'
import { ChartFrame, ChartSkeleton, TableTwin } from './ChartFrame'

const Inner = dynamic(
  () => import('./WeeksInMonthChartInner').then((m) => m.WeeksInMonthChartInner),
  { ssr: false, loading: () => <ChartSkeleton height={168} /> },
)

/**
 * §3.4's outer half — thin by design (see `PaceHrChart.tsx` for why).
 *
 * The caption is not decoration: a bar that is structurally short because its week straddles a month
 * boundary looks exactly like a bad week, and the only honest fix is to say which bars those are.
 */
export function WeeksInMonthChart({ buckets }: { buckets: readonly MonthWeekBucket[] }) {
  const partials = buckets.filter((b) => b.isPartial)
  const current = buckets.find((b) => b.isCurrent)

  const caption = [
    partials.length > 0 &&
      `${partials
        .map((b) => `${formatDayCompact(b.clippedStartISO)}–${formatDayCompact(b.clippedEndISO)}`)
        .join(
          ' and ',
        )} ${partials.length === 1 ? 'is a partial week' : 'are partial weeks'} — the rest of ${partials.length === 1 ? 'that week' : 'those weeks'} falls in another month.`,
    current && 'This week is still in progress.',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ChartFrame
      title="Weeks this month"
      height={168}
      caption={caption || undefined}
      table={
        <TableTwin columns={['Week', 'Runs', 'Distance']}>
          {buckets.map((b) => (
            <tr key={b.isoWeekKey + b.clippedStartISO} className="border-t border-rule-2">
              <td className="py-1.5 font-semibold text-ink">
                {formatDayCompact(b.clippedStartISO)} – {formatDayCompact(b.clippedEndISO)}
                {b.isPartial && <span className="text-ink-3"> *</span>}
              </td>
              <td className="py-1.5 text-right text-ink-2">{b.runCount}</td>
              <td className="py-1.5 text-right text-ink-2">{formatDistanceM(b.distanceM)}</td>
            </tr>
          ))}
        </TableTwin>
      }
    >
      <Inner buckets={buckets} />
    </ChartFrame>
  )
}
