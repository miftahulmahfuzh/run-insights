import type { ZonePctRow, ZoneRow } from './types'
import { bucketForDistanceM, computeVolumeDelta, paceByBucket } from './week'
import type { DistanceBucket, VolumeDelta } from './week'

/**
 * Monthly rollups (F06 plan §6). Everything here is the week's arithmetic folded over a wider
 * run-set — `computeVolumeDelta` and `paceByBucket` are IMPORTED from `week.ts`, not reimplemented,
 * so "compare two periods" has exactly one definition in this codebase.
 *
 * ACWR deliberately does NOT live here. See `acwr.ts` for why it is not month-scoped.
 */

export interface MonthRunSummary {
  runId: string
  occurredOn: string
  distanceM: number
  durationSec: number
  zones: readonly ZoneRow[]
}

export interface PaceComparison {
  thisMonthSecPerKm: number
  /** null iff no run landed in this bucket last month — there is nothing to compare against. */
  previousMonthSecPerKm: number | null
  /** `this − previous`. Negative = got faster. null whenever the previous side is null. */
  deltaSecPerKm: number | null
}

export interface MonthMetrics {
  /** 'YYYY-MM'. */
  monthKey: string
  volumeM: number
  runCount: number
  volumeDelta: VolumeDelta
  /** One entry per bucket run THIS month. A bucket run only last month is not a trend. */
  paceTrendByBucket: Partial<Record<DistanceBucket, PaceComparison>>
  /** Aggregate zone distribution across every run in the month, raw floats, zone-ascending. */
  zonePct: ZonePctRow[]
}

export function computeMonthMetrics(
  monthKey: string,
  runs: readonly MonthRunSummary[],
  previousMonthRuns: readonly MonthRunSummary[],
): MonthMetrics {
  const volumeM = runs.reduce((a, r) => a + r.distanceM, 0)
  const previousVolumeM = previousMonthRuns.reduce((a, r) => a + r.distanceM, 0)

  const thisPace = paceByBucket(runs)
  const previousPace = paceByBucket(previousMonthRuns)

  const paceTrendByBucket: Partial<Record<DistanceBucket, PaceComparison>> = {}
  // Iterate this month's buckets only. A bucket that appears solely last month has no current
  // value to trend, and emitting one with `thisMonthSecPerKm: 0` would read as "infinitely fast".
  for (const bucket of new Set(runs.map((r) => bucketForDistanceM(r.distanceM)))) {
    const current = thisPace[bucket]
    if (current == null) continue
    const previous = previousPace[bucket] ?? null
    paceTrendByBucket[bucket] = {
      thisMonthSecPerKm: current,
      previousMonthSecPerKm: previous,
      deltaSecPerKm: previous == null ? null : current - previous,
    }
  }

  return {
    monthKey,
    volumeM,
    runCount: runs.length,
    volumeDelta: computeVolumeDelta(volumeM, previousVolumeM),
    paceTrendByBucket,
    zonePct: aggregateZonePct(runs),
  }
}

/**
 * The same `Σ durationSec / Σ zoneTotalSec` shape a week's `z1z2SharePct` uses, generalised to all
 * five zones. Zones with no time anywhere in the month are omitted rather than emitted as 0 —
 * "you spent no time in zone 5" and "zone 5 does not appear in your data" are the same statement
 * here, and a 0% row in a chart legend is noise.
 */
function aggregateZonePct(runs: readonly MonthRunSummary[]): ZonePctRow[] {
  const byZone = new Map<ZoneRow['zone'], number>()
  let total = 0
  for (const run of runs) {
    for (const z of run.zones) {
      byZone.set(z.zone, (byZone.get(z.zone) ?? 0) + z.durationSec)
      total += z.durationSec
    }
  }
  if (total === 0) return []

  return [...byZone.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([zone, durationSec]) => ({ zone, durationSec, pct: (durationSec / total) * 100 }))
}
