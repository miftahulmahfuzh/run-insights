import Link from 'next/link'

import { formatDayShort, formatDistanceM, formatPace } from '@/lib/format'

/**
 * A week's runs, side by side — the design brief's §6 ask, and deliberately NOT the `/` list row.
 *
 * On `/trends` the question is comparative ("which of these four was the outlier?"), so the three
 * numbers that answer it line up in fixed columns with tabular figures. On `/` the question is
 * "what was this run?", so the row stacks and leads with distance. Same data, different reading, two
 * components — merging them would compromise both.
 */
export function CompactRunRow({
  run,
}: {
  run: { runId: string; occurredOn: string; distanceM: number; avgPaceSec: number }
}) {
  return (
    <li>
      <Link
        href={`/r/${run.runId}`}
        className="flex items-baseline justify-between gap-3 border-t border-rule-2 py-2.5 text-[13px] tabular-nums"
      >
        <span className="font-semibold text-ink">{formatDayShort(run.occurredOn)}</span>
        <span className="ml-auto font-medium text-ink-2">{formatDistanceM(run.distanceM)}</span>
        <span className="w-[76px] text-right font-medium text-ink-2">
          {formatPace(run.avgPaceSec, true)}
        </span>
      </Link>
    </li>
  )
}
