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

/**
 * The most tick labels §3.1's x-axis can carry, measured rather than chosen.
 *
 * At an iPhone-class 390 px viewport the plot area is ~226 px: `main` is `max-w-[470px] p-5` (350),
 * `ChartFrame`'s card is `p-5` (310), then the pace axis takes 46, the HR axis 30 and `margin.right`
 * 8. At Recharts' 12 px tick font a two-digit label is ~14 px, so with a readable gap that band
 * holds eight to eleven labels.
 *
 * **Eleven, not eight, and the difference is a screenshot.** Card #18 measured both ends: an
 * eleven-row run renders clean and a 22-row one renders as `101112…2021 22*`. Eleven is therefore a
 * density observed to work, and capping there means a short run's axis is left *exactly* as it was —
 * which is what keeps F19's committed `docs/media/07-run-chart.png`, a photograph of an eleven-row
 * run, pixel-valid. A tidier cap of six would have been more airy and would have re-shot the README.
 *
 * Sized for the NARROWEST viewport and never measured per render: at a full 470 px column the plot
 * is ~306 px and would hold about fifteen. That is the same mobile-first call `ChartFrame`'s fixed
 * heights and these axes' fixed widths already make.
 */
export const MAX_AXIS_LABELS = 11

/**
 * Candidate strides, in `1, 2, 5 × 10ⁿ` form — the classic nice-number ladder.
 *
 * Round strides only, because a reader scanning a kilometre axis expects stops at 2s, 5s and 10s.
 * A stride picked purely to satisfy the label budget produces labels at km 1, 4, 7, 13, which is
 * legible and still reads as noise.
 */
const STRIDES = [1, 2, 5, 10, 20, 50] as const

/**
 * Which kilometres §3.1's x-axis actually labels — the fix for card #18.
 *
 * **Labels thin; data does not.** Every split keeps its dot, its tooltip and its keyboard stop, and
 * the splits table directly below still prints every row. That is F08's table-twin rule earning its
 * keep: thinning labels on this particular chart costs no access at all, because this chart's twin
 * is a table that was already going to print all 22 numbers.
 *
 * Two rules, and both are load-bearing:
 *
 *  1. **The stride counts ROWS, not kilometres.** `km` runs `1..n` through F04/F05 today, so the two
 *     look identical on real data — but the crowding check below compares distances between ticks,
 *     and comparing a km gap against a row stride is meaningless the moment those diverge. Index
 *     space is the only space in which both halves of this function are talking about the same unit.
 *
 *  2. **The last row is force-appended, because it carries the `*`.** D14's partial marker is a
 *     non-colour third channel painted on the final tick by the axis's `tickFormatter`; a stride
 *     that happened to skip that row would delete the marker silently. Its neighbour is popped when
 *     it sits less than a stride away, since two adjacent labels are the smear this fixes.
 *
 * On the reported 21.2 km run: stride 2 gives 1,3,…,21, then km 22 displaces km 21 → eleven labels,
 * ending `19` and `22*`.
 */
export function kmAxisTicks(points: readonly PaceHrPoint[], maxLabels = MAX_AXIS_LABELS): number[] {
  if (points.length === 0) return []

  const stride =
    STRIDES.find((s) => Math.ceil(points.length / s) <= maxLabels) ??
    /* Past 550 splits the ladder runs out. Cannot arise through F04/F05 — the same "cannot happen
       is not the same as produces a plausible wrong number" reasoning as the partial remainder
       above — so the budget is honoured with an unround stride rather than silently exceeded. */
    Math.ceil(points.length / maxLabels)

  const lastIndex = points.length - 1
  const indices: number[] = []
  for (let i = 0; i < points.length; i += stride) indices.push(i)

  if (indices[indices.length - 1] !== lastIndex) {
    if (lastIndex - indices[indices.length - 1]! < stride) indices.pop()
    indices.push(lastIndex)
  }

  return indices.map((i) => points[i]!.km)
}
