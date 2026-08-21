'use client'

import dynamic from 'next/dynamic'

import { ZONES, type ZoneDriftWeek } from '@/lib/charts'
import { formatDayCompact, formatPercent } from '@/lib/format'
import { EmptySlot } from '@/components/ui/EmptyState'
import { ChartFrame, ChartSkeleton, LegendKey, TableTwin } from './ChartFrame'

const Inner = dynamic(() => import('./ZoneDriftChartInner').then((m) => m.ZoneDriftChartInner), {
  ssr: false,
  loading: () => <ChartSkeleton height={168} />,
})

/**
 * §3.7's outer half. The caption states the most recent week's zone-5 share in words — the same
 * "the story is the endpoint" discipline as every other chart here, done in HTML rather than as an
 * SVG label so it is selectable, translatable by the browser, and legible under a thumb.
 */
export function ZoneDriftChart({ weeks }: { weeks: readonly ZoneDriftWeek[] }) {
  const populated = weeks.filter((w) => w.hasData)
  const latest = [...populated].reverse()[0]

  return (
    <ChartFrame
      title="Zone drift · last 12 weeks"
      height={168}
      legend={ZONES.map((zone) => (
        <LegendKey key={zone} className={`ri-zone-${zone}`} variant="bar">
          Z{zone}
        </LegendKey>
      ))}
      caption={
        latest
          ? `Most recent week with heart-rate data: ${formatPercent(latest.sharePct[5])} in zone 5, ${formatPercent(latest.sharePct[1] + latest.sharePct[2])} in zones 1–2.`
          : undefined
      }
      table={
        <TableTwin columns={['Week', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5']}>
          {weeks.map((w) => (
            <tr key={w.isoWeekKey} className="border-t border-rule-2">
              <td className="py-1.5 font-semibold text-ink">{formatDayCompact(w.weekStartISO)}</td>
              {w.hasData ? (
                ZONES.map((zone) => (
                  <td key={zone} className="py-1.5 text-right text-ink-2">
                    {formatPercent(w.sharePct[zone])}
                  </td>
                ))
              ) : (
                <td colSpan={5} className="py-1.5 text-right text-ink-3">
                  no heart-rate data
                </td>
              )}
            </tr>
          ))}
        </TableTwin>
      }
    >
      {populated.length === 0 ? (
        <EmptySlot>No heart-rate data in the last twelve weeks.</EmptySlot>
      ) : (
        <Inner weeks={weeks} />
      )}
    </ChartFrame>
  )
}
