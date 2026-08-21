import type { SplitRow } from '@/lib/metrics/types'
import type { PaceHrPoint } from './types'

/**
 * §3.1's data shape. Pure re-shaping of `run_splits` — no metric, no formatting.
 *
 * The one piece of arithmetic here is the **partial row's real distance**, and it is arithmetic
 * rather than a stored column because nothing stores it: `run_splits` has `km`, `time_sec` and
 * `pace_sec`, and D14's whole point is that the last row's `km` is a label rather than a distance.
 * The run's own `distance_m` minus a kilometre per full split is the remainder, which for the
 * canonical fixture is `10670 − 10 × 1000 = 670` — the number §11 asserts.
 *
 * A run with two partial rows cannot happen through F04/F05 (Apple prints one short final
 * kilometre, and F05's checks flag anything else), but the remainder is split evenly across them
 * rather than dumped on the first, because "cannot happen" is not the same as "produces a
 * plausible-looking wrong number when it does".
 */
export function toPaceHrPoints(splits: readonly SplitRow[], runDistanceM: number): PaceHrPoint[] {
  const fullCount = splits.filter((s) => !s.partial).length
  const partialCount = splits.length - fullCount
  const remainderM = Math.max(0, runDistanceM - fullCount * 1000)
  const perPartialM = partialCount > 0 ? Math.round(remainderM / partialCount) : 0

  return splits.map((split) => ({
    km: split.km,
    paceSec: split.paceSec,
    timeSec: split.timeSec,
    hr: split.hr,
    cadence: split.cadence,
    partial: split.partial,
    distanceM: split.partial ? perPartialM : 1000,
  }))
}

/**
 * The pace axis's domain, in `[fastest, slowest]` order with a fixed 20 s pad on each end.
 *
 * Returned as domain-order-fastest-first because §3.1's axis is **reversed**: Recharts renders
 * `domain[0]` at the top when `reversed` is set, and the top of a pace axis in this app is always
 * the faster number. The pad is a constant, never a percentage of the range — a percentage pad
 * expands with a run's own variance, which is exactly the "domain tuned for drama" the dual-axis
 * waiver (§12) promises not to do.
 */
export function paceDomain(points: readonly PaceHrPoint[], padSec = 20): [number, number] | null {
  const paces = points.map((p) => p.paceSec).filter((p) => Number.isFinite(p))
  if (paces.length === 0) return null
  return [Math.min(...paces) - padSec, Math.max(...paces) + padSec]
}

/** The HR axis's domain, standard orientation, fixed 10 bpm pad. Same anti-drama rule as above. */
export function hrDomain(points: readonly PaceHrPoint[], padBpm = 10): [number, number] | null {
  const hrs = points.map((p) => p.hr).filter((h): h is number => h != null)
  if (hrs.length === 0) return null
  return [Math.min(...hrs) - padBpm, Math.max(...hrs) + padBpm]
}

/**
 * The fastest and slowest FULL kilometre, for the splits table's emphasis (§3.3).
 *
 * Excludes the partial row even though its `paceSec` is a valid pace: highlighting "fastest split:
 * km 11" on a 0.67 km row reads as a badge for a sprint that never happened, which is D14's
 * failure mode stated as a UI bug rather than an arithmetic one. On the fixture the winner is
 * km 1 at 396 s.
 */
export function fastestSlowestFullKm(points: readonly PaceHrPoint[]): {
  fastestKm: number | null
  slowestKm: number | null
} {
  const full = points.filter((p) => !p.partial)
  if (full.length < 2) return { fastestKm: null, slowestKm: null }
  let fastest = full[0]!
  let slowest = full[0]!
  for (const p of full) {
    if (p.paceSec < fastest.paceSec) fastest = p
    if (p.paceSec > slowest.paceSec) slowest = p
  }
  return { fastestKm: fastest.km, slowestKm: slowest.km }
}
