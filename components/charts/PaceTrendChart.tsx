'use client'

import dynamic from 'next/dynamic'
import * as React from 'react'

import { Chip } from '@/components/ui/Chip'
import { EmptySlot } from '@/components/ui/EmptyState'
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  defaultBucket,
  paceTrendLine,
  type PaceTrendPoint,
} from '@/lib/charts'
import type { DistanceBucket } from '@/lib/metrics/week'
import { formatDayCompact, formatDistanceM, formatPace, formatPaceDelta } from '@/lib/format'
import { ChartFrame, ChartSkeleton, TableTwin } from './ChartFrame'

const Inner = dynamic(() => import('./PaceTrendChartInner').then((m) => m.PaceTrendChartInner), {
  ssr: false,
  loading: () => <ChartSkeleton height={176} />,
})

/**
 * §3.6's outer half, and **the one genuinely client-stateful piece in this whole feature.**
 *
 * The band filter is a `useState`, not a `?band=` query param, because it changes nothing the server
 * computed: all twelve weeks of points are already on the page and filtering is an array filter.
 * Contrast `/trends`'s scope switcher, which IS a URL param because it changes which rows get
 * queried. Getting this distinction right is the difference between an instant tap and a round trip.
 *
 * **Single-select, never multi.** Mixing bands defeats the entire point of the chart — a 5 km at
 * 6'30" is not progress over a 15 km at 7'00" (IMPLEMENTATION_PLAN §6), and a filter that can show
 * both at once is just the undifferentiated scatter this design exists to avoid.
 *
 * Every bucket keeps its chip even with no runs in it, so the reader can see the band exists and
 * that it is empty — §9's rule. The plot area says so in words rather than showing a bare axis.
 */
export function PaceTrendChart({
  points,
  startISO,
  days,
  allowTrendLine = true,
}: {
  points: readonly PaceTrendPoint[]
  startISO: string
  days: number
  /**
   * False until four weeks of running exist (§9). A regression over three weeks of history is a
   * ruler, not a trend, however many points happen to sit in the selected band.
   */
  allowTrendLine?: boolean
}) {
  const initial = React.useMemo(() => defaultBucket(points), [points])
  const [bucket, setBucket] = React.useState<DistanceBucket>(initial)

  const filtered = React.useMemo(() => points.filter((p) => p.bucket === bucket), [points, bucket])
  const line = React.useMemo(
    () => (allowTrendLine ? paceTrendLine(filtered) : null),
    [filtered, allowTrendLine],
  )

  return (
    <ChartFrame
      title="Pace trend · last 12 weeks"
      // The chip row lives inside the plot area rather than in the title row (five chips do not fit
      // beside a heading at 414px), so this height carries chips + plot + axis band.
      height={222}
      controls={
        <span className="text-[11px] font-medium text-ink-3">{BUCKET_LABELS[bucket].range}</span>
      }
      caption={
        line
          ? // The label agrees with the eye: the axis is already inverted, so a negative number is
            // an improvement and the sentence says which without asking the reader to flip a sign.
            `${formatPaceDelta(line.perWeekSec)} per week across ${filtered.length} runs — ${line.perWeekSec < 0 ? 'getting faster' : line.perWeekSec > 0 ? 'getting slower' : 'holding steady'} at this distance.`
          : filtered.length > 0
            ? allowTrendLine
              ? 'A trend line needs at least four runs at this distance.'
              : 'A trend line appears after four weeks of running.'
            : undefined
      }
      table={
        filtered.length > 0 ? (
          <TableTwin columns={['Date', 'Distance', 'Pace']}>
            {filtered.map((p) => (
              <tr key={p.runId} className="border-t border-rule-2">
                <td className="py-1.5 font-semibold text-ink">{formatDayCompact(p.occurredOn)}</td>
                <td className="py-1.5 text-right text-ink-2">{formatDistanceM(p.distanceM)}</td>
                <td className="py-1.5 text-right text-ink-2">{formatPace(p.avgPaceSec, true)}</td>
              </tr>
            ))}
          </TableTwin>
        ) : null
      }
    >
      <div className="flex h-full flex-col">
        <div className="mb-1 flex flex-wrap gap-2">
          {BUCKET_ORDER.map((option) => (
            <Chip
              key={option}
              selected={option === bucket}
              onClick={() => setBucket(option)}
              className="h-9 px-3 text-[12px]"
            >
              {BUCKET_LABELS[option].label}
            </Chip>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {filtered.length === 0 ? (
            <EmptySlot>No runs in this range in the last twelve weeks.</EmptySlot>
          ) : (
            <Inner
              points={filtered}
              startISO={startISO}
              days={days}
              showTrendLine={allowTrendLine}
            />
          )}
        </div>
      </div>
    </ChartFrame>
  )
}
