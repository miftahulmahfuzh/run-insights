/**
 * The metrics barrel. Import from `@/lib/metrics`, not from its files, so a later split or rename
 * inside this directory is invisible to F07/F08/F09.
 *
 * `hrMax` is RE-EXPORTED here, never redeclared: F02 owns that file, and roadmap §4.4's "no
 * feature may compute HRmax any other way" only holds if there is exactly one place to import it
 * from.
 */

export { resolveHrMax, type HrMax } from './hrMax'

export type { SessionInput, SplitRow, ZonePctRow, ZoneRow } from './types'

export { computeSessionMetrics } from './session'
export { evaluateSessionFlags, type Flag } from './flags'
export {
  bucketForDistanceM,
  computeWeekMetrics,
  DISTANCE_BUCKETS,
  paceByBucket,
  VOLUME_JUMP,
  type DistanceBucket,
  type VolumeDelta,
} from './week'
export { computeMonthMetrics } from './month'
export {
  ACWR_OUT_OF_RANGE,
  ACWR_SWEET_SPOT,
  computeAcwr,
  isAcwrOutOfRange,
  type Acwr,
} from './acwr'
