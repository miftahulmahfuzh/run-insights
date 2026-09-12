/**
 * The metrics barrel. Import from `@/lib/metrics`, not from its files, so a later split or rename
 * inside this directory is invisible to F07/F08/F09.
 *
 * `hrMax` is RE-EXPORTED here, never redeclared: F02 owns that file, and roadmap §4.4's "no
 * feature may compute HRmax any other way" only holds if there is exactly one place to import it
 * from.
 */

export {
  hrMaxTransitionAt,
  resolveHrMax,
  resolveHrMaxAsOf,
  tanakaEstimate,
  type HrMax,
  type HrMaxSource,
  type HrMaxTransition,
} from './hrMax'

export type {
  FastestSlowestKm,
  SessionInput,
  SessionMetrics,
  SplitRow,
  ZonePctRow,
  ZoneRow,
} from './types'

export { roundSharesTo100 } from './round'
export { avgPaceSecPerKm } from './pace'
export { computeSessionMetrics } from './session'
export { evaluateSessionFlags, FLAG_THRESHOLDS, type Flag, type FlagCode } from './flags'
export {
  bucketForDistanceM,
  computeVolumeDelta,
  computeWeekMetrics,
  paceByBucket,
  VOLUME_JUMP,
  type DistanceBucket,
  type VolumeDelta,
  type WeekRunSummary,
} from './week'
export { computeMonthMetrics, type MonthRunSummary } from './month'
export {
  ACWR_OUT_OF_RANGE,
  ACWR_SWEET_SPOT,
  computeAcwr,
  isAcwrOutOfRange,
  type Acwr,
  type DailyLoadPoint,
} from './acwr'
