import { avgPaceSecPerKm } from './pace'
import type { ZoneRow } from './types'

/**
 * Weekly rollups (F06 plan §5). Pure, like everything else in this directory: the caller fetches
 * `getRunsInIsoWeek` (reviewed-only, D16) and hands the rows in.
 */

export type DistanceBucket = '5k' | '10k' | 'half' | 'full' | 'other'

/**
 * Training-run buckets around race-EQUIVALENT efforts, not race distances.
 *
 * An 8 km run and an 11 km run are the same kind of session to a runner, and comparing "this
 * week's 10k-effort pace" across them is meaningful; comparing an 8 km run against a 21 km one is
 * not. The boundaries are an explicitly tunable MVP heuristic — no fixture asserts them, and
 * moving one is a product decision, not a bug fix.
 */
export function bucketForDistanceM(distanceM: number): DistanceBucket {
  if (distanceM < 3500) return 'other'
  if (distanceM < 7000) return '5k'
  if (distanceM < 15000) return '10k'
  if (distanceM < 30000) return 'half'
  return 'full'
}

/**
 * Period-over-period comparison. A structural mirror of `expense-tracking`'s `computeDelta` —
 * same divide-by-zero branch, same "1dp under 10%, 0dp above" rule, same ±0.5% flat band —
 * because the shape of comparing two periods honestly does not change with the domain.
 */
export type VolumeDelta =
  /** Nothing run in either week. There is no comparison to make, and "0%" would imply there was. */
  | { kind: 'none' }
  /** Last week was zero and this one is not. The percentage is +∞; say what happened instead. */
  | { kind: 'first'; currentM: number }
  | {
      kind: 'pct'
      /** Signed and rounded. −100 when volume went to zero. */
      pct: number
      direction: 'up' | 'down' | 'flat'
      currentM: number
      previousM: number
    }

export function computeVolumeDelta(currentM: number, previousM: number): VolumeDelta {
  if (previousM <= 0 && currentM <= 0) return { kind: 'none' }
  if (previousM <= 0) return { kind: 'first', currentM }

  const raw = ((currentM - previousM) / previousM) * 100
  // 0.4% precision on a 24 km week is noise; 0.4% on a 3% change is the whole signal.
  const pct = Math.abs(raw) < 10 ? Math.round(raw * 10) / 10 : Math.round(raw)
  const direction: 'up' | 'down' | 'flat' = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down'

  return { kind: 'pct', pct, direction, currentM, previousM }
}

/**
 * The period-scope companion to `flags.ts`'s seven session codes.
 *
 * `jumpWarning` is a boolean on `WeekMetrics` because "week volume jumped" has no meaning at
 * session scope — but F07's insight memory (R-19) diffs *codes* between two periods to work out
 * what is new, resolved or persisting, so a period-scoped concern needs a code to be diffable at
 * all. It is declared here, next to the rule that decides it, rather than in the narrative layer:
 * the catalog of things this app is willing to flag stays entirely F06's, and a narrator that
 * coins its own code is a narrator making a claim nobody wrote or tested.
 *
 * `acwr.ts` exports `ACWR_OUT_OF_RANGE` for the same reason and on the same terms.
 */
export const VOLUME_JUMP = 'VOLUME_JUMP'

/** One reviewed run, reduced to what a week rollup reads. */
export interface WeekRunSummary {
  runId: string
  occurredOn: string
  distanceM: number
  durationSec: number
  zones: readonly ZoneRow[]
}

export interface WeekMetrics {
  /** ISO week key, '2026-W34'. See `lib/date/ranges.ts` for why 2026-W01 starts in 2025. */
  weekKey: string
  volumeM: number
  runCount: number
  /** null iff `runCount === 0`. */
  longestRunM: number | null
  /** Share of aggregate zone time spent in zones 1–2. null iff no run carried zone data. */
  z1z2SharePct: number | null
  volumeDelta: VolumeDelta
  /** IMPLEMENTATION_PLAN §4's ">10% jump" warning. Increases only — see below. */
  jumpWarning: boolean
  /** s/km per bucket, distance-WEIGHTED. Buckets with no run this week are absent, not zero. */
  avgPaceByBucket: Partial<Record<DistanceBucket, number>>
}

/**
 * `previousWeekVolumeM` is passed in rather than fetched: this function is pure, and the caller
 * already has to run one range query per week for the chart anyway.
 *
 * **`avgPaceByBucket` is distance-weighted**, `avgPaceSecPerKm(Σ distance, Σ duration)` — never a
 * mean of each run's own `avg_pace_sec`. A 5 km recovery jog and a 15 km tempo must not count
 * equally toward one number; the run that covered more ground weighs more, which is what "this
 * week's pace at that effort" means.
 *
 * **`jumpWarning` fires only on an increase.** A taper or a rest week is not a training-load
 * warning however large the drop, and flagging one would train the runner to ignore the flag. It
 * is a boolean on this object rather than a session `FlagCode` because "week volume jumped" has
 * no meaning at session scope, and F07 treats the seven-code session catalog as closed.
 */
export function computeWeekMetrics(
  weekKey: string,
  runs: readonly WeekRunSummary[],
  previousWeekVolumeM: number,
): WeekMetrics {
  const volumeM = runs.reduce((a, r) => a + r.distanceM, 0)
  const runCount = runs.length
  const longestRunM = runCount === 0 ? null : Math.max(...runs.map((r) => r.distanceM))

  let easySec = 0
  let zoneTotalSec = 0
  for (const run of runs) {
    for (const z of run.zones) {
      zoneTotalSec += z.durationSec
      if (z.zone <= 2) easySec += z.durationSec
    }
  }
  const z1z2SharePct = zoneTotalSec > 0 ? (easySec / zoneTotalSec) * 100 : null

  const volumeDelta = computeVolumeDelta(volumeM, previousWeekVolumeM)
  const jumpWarning =
    volumeDelta.kind === 'pct' && volumeDelta.direction === 'up' && volumeDelta.pct > 10

  return {
    weekKey,
    volumeM,
    runCount,
    longestRunM,
    z1z2SharePct,
    volumeDelta,
    jumpWarning,
    avgPaceByBucket: paceByBucket(runs),
  }
}

/** Shared with `month.ts`'s pace trend — one reduction, two callers, no second implementation. */
export function paceByBucket(
  runs: readonly { distanceM: number; durationSec: number }[],
): Partial<Record<DistanceBucket, number>> {
  const totals = new Map<DistanceBucket, { distanceM: number; durationSec: number }>()
  for (const run of runs) {
    const bucket = bucketForDistanceM(run.distanceM)
    const acc = totals.get(bucket) ?? { distanceM: 0, durationSec: 0 }
    acc.distanceM += run.distanceM
    acc.durationSec += run.durationSec
    totals.set(bucket, acc)
  }

  const out: Partial<Record<DistanceBucket, number>> = {}
  for (const [bucket, acc] of totals) out[bucket] = avgPaceSecPerKm(acc.distanceM, acc.durationSec)
  return out
}
