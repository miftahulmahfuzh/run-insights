import { addDays, isoWeekKeyOf, isoWeekRange, type DateISO } from '@/lib/date/ranges'

/** One whole ISO week of a rolling window. Unclipped, by definition — see `weeksInMonth.ts`. */
export interface TrendWeek {
  isoWeekKey: string
  weekStartISO: DateISO
  /** Inclusive Sunday. Half-open ranges are for SQL; a chart bucket's label needs its last day. */
  weekEndISO: DateISO
  isCurrent: boolean
}

/**
 * The `count` most recent whole ISO weeks ending at the week that owns `anchorISO`, oldest first.
 *
 * Shared by §3.5's volume trend and §3.7's zone drift **on purpose**: the two charts sit directly
 * above and below each other and their whole value is being read side by side, so a reader must be
 * able to trace one week's bar to the same week's band. Two independent window computations is how
 * that silently stops being true. This is the opposite case from `weeksInMonth`, which solves a
 * different problem and must not share code with either.
 *
 * `anchorISO` is a parameter, never `new Date()`: one Jakarta "today" is computed per render, so a
 * page that renders across midnight cannot show two different windows in two charts.
 */
export function lastIsoWeeks(anchorISO: DateISO, count: number): TrendWeek[] {
  const anchorWeekStart = isoWeekRange(isoWeekKeyOf(anchorISO)).startISO
  const out: TrendWeek[] = []
  for (let i = count - 1; i >= 0; i--) {
    const weekStartISO = addDays(anchorWeekStart, -7 * i)
    const weekEndISO = addDays(weekStartISO, 6)
    out.push({
      isoWeekKey: isoWeekKeyOf(weekStartISO),
      weekStartISO,
      weekEndISO,
      isCurrent: anchorISO >= weekStartISO && anchorISO <= weekEndISO,
    })
  }
  return out
}
