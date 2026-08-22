/**
 * The chart-data barrel. Import from `@/lib/charts`, never from its files, so a rename inside this
 * directory is invisible to the routes and components that consume it — the same discipline
 * `lib/metrics/index.ts` applies one layer down.
 *
 * Everything here is pure: rows in, rows out, no I/O, no clock, no formatting. See `types.ts` for
 * the three rules and why they matter.
 */

export type {
  ChartRun,
  MonthWeekBucket,
  PaceHrPoint,
  PaceTrendPoint,
  VolumeTrendPoint,
  ZoneDriftWeek,
  ZoneShare,
} from './types'

export {
  fastestSlowestFullKm,
  hrDomain,
  kmAxisTicks,
  MAX_AXIS_LABELS,
  paceDomain,
  toPaceHrPoints,
} from './paceHr'
export { aggregateZones, toZoneShares, zoneOfHr, zoneTotalSec } from './zones'
export { monthWeekBucketRanges, weeksInMonth } from './weeksInMonth'
export { lastIsoWeeks, type TrendWeek } from './window'
export { ROLLING_MEAN_WEEKS, TREND_WEEKS, toVolumeTrend, weeksWithRuns } from './volumeTrend'
export {
  BUCKET_LABELS,
  BUCKET_ORDER,
  dayIndexToISO,
  defaultBucket,
  paceTrendLine,
  toPaceTrendPoints,
  type PaceTrendLine,
} from './paceTrend'
export { toZoneDrift, ZONES } from './zoneDrift'
