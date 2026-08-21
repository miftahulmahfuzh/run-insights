/**
 * The one place distance and duration become a pace.
 *
 * F05 writes `runs.avg_pace_sec` with this at commit time (roadmap D5 — derived once, stored for
 * cheap sorting), and week/month bucket averages call it again over summed distance and summed
 * duration. Nothing anywhere else re-divides inline: two implementations of one division is how a
 * run detail page and a trends chart end up disagreeing by a second about the same run.
 *
 * Returns an INTEGER (roadmap §4.2: pace is stored and carried as whole seconds per km). The
 * rounding is deliberate and lossy at the last second; every consumer wants a whole number.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────
 * This is the WHOLE-RUN ratio, and it correctly includes the final partial kilometre because it
 * divides by the run's true distance. D14's exclusion rule applies to statistics built by
 * aggregating individual split ROWS (§3.1), never to this. Do not "fix" a pace average by
 * re-deriving it from the splits array — that would drop the partial km's real distance and make
 * every run look very slightly faster than it was.
 */
export function avgPaceSecPerKm(distanceM: number, durationSec: number): number {
  if (distanceM <= 0) return 0
  return Math.round(durationSec / (distanceM / 1000))
}
