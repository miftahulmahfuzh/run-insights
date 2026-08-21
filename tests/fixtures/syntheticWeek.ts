import type { WeekRunSummary } from '@/lib/metrics/week'
import type { ZoneRow } from '@/lib/metrics/types'
import { canonicalSession } from './canonicalRun'

/**
 * **A hand-built week, because the shipped fixture is a single run.**
 *
 * Nothing here is derived from a screenshot; every number is worked by hand in F06 plan §5.5 so
 * the test has a known-correct expected value rather than a value copied back out of the
 * implementation it is meant to check. The canonical run sits in the middle of it, unchanged, so
 * the week aggregate and the session metrics cannot drift apart.
 *
 * Week 2026-W34 — Mon 17 Aug to Sun 23 Aug 2026:
 *
 *   Mon 17 Aug   5000 m   1800 s   Z1+Z2 1650 / 1800 s of zone data
 *   Thu 20 Aug  10670 m   4716 s   Z1+Z2  129 / 4595 s   (the canonical run)
 *   Sat 22 Aug   8000 m   3040 s   Z1+Z2 1400 / 2800 s
 *
 *   volume        23670 m
 *   longest       10670 m
 *   z1z2Share     3179 / 9195 = 34.57%
 *   vs 20000 m    +18.35% -> +18 (rounded at ≥10%) -> jumpWarning
 *   buckets       5000 -> '5k';  10670 and 8000 -> '10k'
 */
export const SYNTHETIC_WEEK_KEY = '2026-W34'
export const SYNTHETIC_WEEK_PREVIOUS_VOLUME_M = 20000

const zones = (z1: number, z2: number, z3: number, z4: number, z5: number): ZoneRow[] => [
  { zone: 1, durationSec: z1, minBpm: null, maxBpm: 140 },
  { zone: 2, durationSec: z2, minBpm: 141, maxBpm: 151 },
  { zone: 3, durationSec: z3, minBpm: 152, maxBpm: 163 },
  { zone: 4, durationSec: z4, minBpm: 164, maxBpm: 174 },
  { zone: 5, durationSec: z5, minBpm: 175, maxBpm: null },
]

export const syntheticWeek: WeekRunSummary[] = [
  {
    runId: 'run_mon_easy',
    occurredOn: '2026-08-17',
    distanceM: 5000,
    durationSec: 1800,
    zones: zones(900, 750, 150, 0, 0),
  },
  {
    runId: canonicalSession.runId,
    occurredOn: canonicalSession.occurredOn,
    distanceM: canonicalSession.distanceM,
    durationSec: canonicalSession.durationSec,
    zones: canonicalSession.zones,
  },
  {
    runId: 'run_sat_steady',
    occurredOn: '2026-08-22',
    distanceM: 8000,
    durationSec: 3040,
    zones: zones(200, 1200, 1000, 400, 0),
  },
]
