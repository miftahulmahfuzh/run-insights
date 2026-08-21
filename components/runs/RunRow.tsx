import Link from 'next/link'

import {
  formatBpm,
  formatDayShort,
  formatDistanceM,
  formatDuration,
  formatPace,
} from '@/lib/format'

/**
 * One row of `/` — §2.1. **A Server Component: no state, no callback, no client bundle.**
 *
 * The whole row is the link, not a "view" affordance inside it. On a 414px screen a 44pt target
 * that fills the row is the difference between a list you can flick through one-handed and one you
 * have to aim at.
 *
 * Three lines, in a fixed order that never changes between rows: identity (day, and the photo count
 * if any), the two numbers that say what the run WAS (distance, duration), and the two that say how
 * it FELT (pace, average heart rate). A reader scanning the column reads down, not across.
 */
export function RunRow({
  run,
  photoCount = 0,
}: {
  run: {
    id: string
    occurredOn: string
    distanceM: number
    durationSec: number
    avgPaceSec: number
    avgHr: number | null
    location: string | null
  }
  photoCount?: number
}) {
  return (
    <li>
      <Link
        href={`/r/${run.id}`}
        className="block rounded-card bg-card p-4 shadow-card active:scale-[0.995]"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-ink">
            {formatDayShort(run.occurredOn)}
          </span>
          {photoCount > 0 && (
            <span className="text-[11px] font-medium text-ink-3">
              {/* The glyph is decorative; the count and the word carry it. */}
              <span aria-hidden="true">⧉ </span>
              {photoCount}
              <span className="sr-only"> screenshots</span>
            </span>
          )}
        </div>

        <p className="mt-1 text-[19px] font-semibold text-ink tabular-nums">
          {formatDistanceM(run.distanceM)}
          <span className="text-ink-3"> · </span>
          {formatDuration(run.durationSec)}
        </p>

        <p className="mt-0.5 text-[13px] font-medium text-ink-2 tabular-nums">
          {formatPace(run.avgPaceSec, true)} avg
          {run.avgHr != null && (
            <>
              <span className="text-ink-3"> · </span>
              {formatBpm(run.avgHr)} avg
            </>
          )}
          {run.location && <span className="text-ink-3"> · {run.location}</span>}
        </p>
      </Link>
    </li>
  )
}
