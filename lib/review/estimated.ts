import type { EstimatedValues } from '@/lib/schema/detailsPrinted'

/**
 * **The one rule for "is this value still the chart's estimate?"** — read by the review screen to
 * draw the "Estimated from the pace chart" labels, and by `commitReview` on the SERVER to decide
 * `runs.distance_estimated` / `runs.splits_estimated`. One function for both, so the label the
 * runner saw and the flag the run stores cannot disagree.
 *
 * PURE MODULE — the review screen is a client component.
 *
 * Assumption A5: typing a different distance makes it the runner's value; splits stay estimated
 * while the run keeps any row (an edited row is still a row the chart produced the shape of), and
 * removing every row clears it.
 */

/** Metre resolution: `runs.distance_m` is an integer, and every draft round-trips through it. */
function sameDistance(a: number, b: number): boolean {
  return Math.round(a * 1000) === Math.round(b * 1000)
}

export function distanceIsEstimated(
  estimated: EstimatedValues,
  draftDistanceKm: number | null,
): boolean {
  return (
    estimated.distanceKm !== null &&
    draftDistanceKm !== null &&
    sameDistance(draftDistanceKm, estimated.distanceKm)
  )
}

export function splitsAreEstimated(estimated: EstimatedValues, splitCount: number): boolean {
  return estimated.splits && splitCount > 0
}
