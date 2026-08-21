import type { DateISO } from '@/lib/date/ranges'
import type { ChartRun, VolumeTrendPoint } from './types'
import { lastIsoWeeks } from './window'

/** §3.5's window: twelve weeks, ending at the week the anchor day falls in. */
export const TREND_WEEKS = 12

/** The trailing window the mean averages over. Four weeks is a mesocycle; three is noise. */
export const ROLLING_MEAN_WEEKS = 4

/**
 * §3.5 — weekly distance as bars, plus a 4-week trailing mean as a line, on ONE shared axis.
 *
 * Both series are kilometres, so this is not a second dual-axis chart: it is the sanctioned "one
 * series is the point, the rest is context" form. §12's waiver covers exactly one chart, and this
 * is not it.
 *
 * **The mean's first three points are `null`, not estimated.** A "4-week mean" computed from one
 * week is a single week's distance drawn at the same line weight as the real thing next to it,
 * which reads as equally confident and is not. A visible gap is the honest rendering, and it is
 * index-based rather than history-based on purpose: the line is a statement about the twelve weeks
 * ON THIS CHART, so every value it plots must be derivable from bars the reader can see.
 */
export function toVolumeTrend(
  runs: readonly ChartRun[],
  anchorISO: DateISO,
  weeks = TREND_WEEKS,
): VolumeTrendPoint[] {
  const window = lastIsoWeeks(anchorISO, weeks)

  const totals = window.map((week) => {
    const inWeek = runs.filter(
      (r) => r.occurredOn >= week.weekStartISO && r.occurredOn <= week.weekEndISO,
    )
    return {
      distanceM: inWeek.reduce((sum, r) => sum + r.distanceM, 0),
      runCount: inWeek.length,
    }
  })

  return window.map((week, i) => {
    const enoughHistory = i >= ROLLING_MEAN_WEEKS - 1
    const slice = totals.slice(i - ROLLING_MEAN_WEEKS + 1, i + 1)
    return {
      isoWeekKey: week.isoWeekKey,
      weekStartISO: week.weekStartISO,
      distanceM: totals[i]!.distanceM,
      runCount: totals[i]!.runCount,
      rollingMeanM: enoughHistory
        ? Math.round(slice.reduce((sum, t) => sum + t.distanceM, 0) / ROLLING_MEAN_WEEKS)
        : null,
      isCurrent: week.isCurrent,
    }
  })
}

/**
 * How many of the window's weeks carry at least one run — §9's gate for the derived lines.
 *
 * Both the rolling mean and the pace-trend regression are withheld below four, because a two-point
 * "trend" line is not a trend, it is a ruler. The bars themselves are always meaningful, even at
 * n=1, and are never withheld.
 */
export function weeksWithRuns(points: readonly VolumeTrendPoint[]): number {
  return points.filter((p) => p.runCount > 0).length
}
