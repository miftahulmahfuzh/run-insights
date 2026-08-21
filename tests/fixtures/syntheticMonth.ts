import type { MonthRunSummary } from '@/lib/metrics/month'
import { syntheticWeek } from './syntheticWeek'

/**
 * August 2026 and July 2026, hand-built for the month rollup (F06 plan §6).
 *
 * August is the §5.5 synthetic week plus one long run, so the month's arithmetic is checkable
 * against numbers already verified one scope down. July is deliberately a slower, shorter month
 * in the same two buckets, so `paceTrendByBucket` has a real previous value to compare against —
 * and one bucket ('half') that exists only in August, which must trend against `null` rather than
 * against a fabricated zero.
 *
 *   AUGUST   5000 / 1800   10670 / 4716   8000 / 3040   22000 / 9900   = 45670 m
 *   JULY     6000 / 2400   12000 / 5400                                = 18000 m
 */
export const syntheticMonth: MonthRunSummary[] = [
  ...syntheticWeek,
  {
    runId: 'run_long_aug',
    occurredOn: '2026-08-29',
    distanceM: 22000,
    durationSec: 9900,
    zones: [
      { zone: 1, durationSec: 900, minBpm: null, maxBpm: 140 },
      { zone: 2, durationSec: 6000, minBpm: 141, maxBpm: 151 },
      { zone: 3, durationSec: 3000, minBpm: 152, maxBpm: 163 },
    ],
  },
]

export const syntheticPreviousMonth: MonthRunSummary[] = [
  {
    runId: 'run_jul_a',
    occurredOn: '2026-07-06',
    distanceM: 6000,
    durationSec: 2400, // 400 s/km
    zones: [{ zone: 2, durationSec: 2400, minBpm: 141, maxBpm: 151 }],
  },
  {
    runId: 'run_jul_b',
    occurredOn: '2026-07-20',
    distanceM: 12000,
    durationSec: 5400, // 450 s/km
    zones: [{ zone: 3, durationSec: 5400, minBpm: 152, maxBpm: 163 }],
  },
]
