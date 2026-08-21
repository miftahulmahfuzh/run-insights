import { roundSharesTo100 } from '@/lib/metrics/round'
import type { ZoneRow } from '@/lib/metrics/types'
import type { ChartRun, ZoneShare } from './types'

/**
 * §3.2's data shape, for one run or for a whole month.
 *
 * **The percent denominator is the sum of the zone rows, not `runs.duration_sec`.** The watch's
 * zone table and its total duration can disagree by a few seconds (auto-pause, GPS gaps), and a
 * five-segment bar whose segments do not fill it because its denominator disagrees with its own
 * parts is a worse bug than a share that is off by a second from the hero duration. §3.2 says so;
 * this line is where it is true.
 */
export function toZoneShares(zones: readonly ZoneRow[]): ZoneShare[] {
  if (zones.length === 0) return []
  const pcts = roundSharesTo100(zones.map((z) => z.durationSec))
  return zones.map((z, i) => ({
    zone: z.zone,
    durationSec: z.durationSec,
    pct: pcts[i] ?? 0,
    minBpm: z.minBpm,
    maxBpm: z.maxBpm,
  }))
}

/** Total zone seconds — the denominator above, exported so a caller can test it for zero. */
export function zoneTotalSec(zones: readonly ZoneRow[]): number {
  return zones.reduce((sum, z) => sum + z.durationSec, 0)
}

/**
 * Zone rows summed across many runs, for `/trends`'s month-aggregate bar (§2.3).
 *
 * Bounds come from the LAST run that carried them, not the first: zone boundaries move when a
 * runner's HRmax observation moves (roadmap §4.4), and the most recent definition is the one a
 * reader of "Z4 164–174" this month would recognise. A month whose runs disagree about zone 4's
 * floor is showing a real transition, and showing the newer boundary is the honest half of it.
 */
export function aggregateZones(runs: readonly ChartRun[]): ZoneRow[] {
  const byZone = new Map<number, ZoneRow>()
  for (const run of runs) {
    for (const z of run.zones) {
      const prev = byZone.get(z.zone)
      byZone.set(z.zone, {
        zone: z.zone,
        durationSec: (prev?.durationSec ?? 0) + z.durationSec,
        minBpm: z.minBpm ?? prev?.minBpm ?? null,
        maxBpm: z.maxBpm ?? prev?.maxBpm ?? null,
      })
    }
  }
  return [...byZone.values()].sort((a, b) => a.zone - b.zone)
}

/**
 * Which zone a heart rate falls in, from the run's own printed bounds — R-30's "colour is that
 * split's dominant zone", which needs a split's HR mapped onto a zone.
 *
 * Uses the run's OWN `run_zones` bounds rather than any global threshold table, because the bounds
 * are per-run data read off the screenshot: two runs three months apart can legitimately carry
 * different zone 4 floors, and colouring an old run by today's boundaries would misreport it.
 *
 * Zone 1 has no floor and zone 5 no ceiling (Apple prints `< 140` and `175+`), so a null bound is
 * an open interval rather than missing data.
 */
export function zoneOfHr(hr: number | null, zones: readonly ZoneRow[]): number | null {
  if (hr == null) return null
  for (const z of zones) {
    const aboveFloor = z.minBpm == null || hr >= z.minBpm
    const belowCeiling = z.maxBpm == null || hr <= z.maxBpm
    if (aboveFloor && belowCeiling) return z.zone
  }
  return null
}
