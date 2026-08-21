import { isoWeekKeyOf, type DateISO } from '@/lib/date/ranges'
import { formatDistanceM, isoWeekLabel } from '@/lib/format'
import { RunRow } from './RunRow'

/**
 * §2.1 — the runs list, grouped by ISO week, newest week first and newest run first inside it.
 *
 * **The week divider's totals are computed from the rows being listed, never from a second query.**
 * Two queries answering "how far did I run this week" is two chances to disagree with each other on
 * the same screen; one reduce over the array already on the page cannot.
 *
 * Not sticky. The expense tracker made the same call for the same reason: nothing publishes a
 * header-height token to key a sticky offset off, and a divider that sticks under a header it
 * cannot measure lands on top of the first row.
 */

export interface RunListRow {
  id: string
  occurredOn: DateISO
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  location: string | null
}

export function RunList({
  runs,
  todayISO,
  photoCounts = {},
}: {
  /** Reviewed-only and newest-first, exactly as `listRuns` returns them (D16). */
  runs: readonly RunListRow[]
  /** Jakarta "today", passed in so "THIS WEEK" cannot mean two things in one render (D6). */
  todayISO: DateISO
  photoCounts?: Record<string, number>
}) {
  const currentWeek = isoWeekKeyOf(todayISO)

  // A Map preserves insertion order, and the input is already sorted newest-first, so the groups
  // come out newest-first with no second sort and no date comparison in this file.
  const groups = new Map<string, RunListRow[]>()
  for (const run of runs) {
    const key = isoWeekKeyOf(run.occurredOn)
    const bucket = groups.get(key)
    if (bucket) bucket.push(run)
    else groups.set(key, [run])
  }

  return (
    <div className="space-y-7">
      {[...groups].map(([weekKey, weekRuns]) => (
        <section key={weekKey}>
          <WeekDivider
            weekKey={weekKey}
            isCurrent={weekKey === currentWeek}
            runCount={weekRuns.length}
            distanceM={weekRuns.reduce((sum, r) => sum + r.distanceM, 0)}
          />
          <ul className="mt-3 space-y-3">
            {weekRuns.map((run) => (
              <RunRow key={run.id} run={run} photoCount={photoCounts[run.id] ?? 0} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * `THIS WEEK · 3 RUNS · 24.10 KM`.
 *
 * "This week" rather than "Week of 17 Aug 2026" for the current one, because a reader looking at
 * the top of their own list knows which week they are in and the date is noise there — but only
 * there. Every other divider is dated, since scrolling back three months without dates is guessing.
 */
export function WeekDivider({
  weekKey,
  isCurrent,
  runCount,
  distanceM,
}: {
  weekKey: string
  isCurrent: boolean
  runCount: number
  distanceM: number
}) {
  return (
    <h2 className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
      <span className="text-accent">{isCurrent ? 'This week' : isoWeekLabel(weekKey)}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">
        {runCount} {runCount === 1 ? 'run' : 'runs'}
      </span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{formatDistanceM(distanceM)}</span>
    </h2>
  )
}
