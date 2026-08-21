import type { RecordRunRow } from '@/lib/records/recompute'
import type { SplitRow } from '@/lib/metrics/types'
import { canonicalRecordRun } from './canonicalRun'

/**
 * Three runs, hand-built so every one of the ten record keys has a verifiable winner and every
 * qualifier has something it excludes (F06 plan §7.4).
 *
 *   A — the canonical run. Long, hard, badly paced. Wins on magnitude.
 *   B — synthetic, EARLIER, six perfectly uniform kilometres. Wins on quality.
 *   C — 2 km. Well-formed but too short for four of the ten keys, which is its entire job.
 */

/** `n` identical full kilometres — the textbook "perfectly even effort" run. */
function uniformSplits(count: number, paceSec: number, hr: number, cadence: number): SplitRow[] {
  return Array.from({ length: count }, (_, i) => ({
    km: i + 1,
    timeSec: paceSec,
    paceSec,
    hr,
    cadence,
    partial: false,
  }))
}

export const runA: RecordRunRow = canonicalRecordRun

/**
 * Identical pace AND identical HR in both halves, so speed-per-heartbeat is unchanged by
 * construction and `decouplingBp` is exactly 0 — the best possible value for `best_paced_run`.
 * Dated BEFORE run A so the tie-break tests have a defined "who got there first".
 */
export const runB: RecordRunRow = {
  runId: 'run_b_even',
  occurredOn: '2026-07-11',
  distanceM: 6000,
  durationSec: 1800,
  avgHrBpm: 150,
  splits: uniformSplits(6, 300, 150, 170),
  zones: [{ zone: 2, durationSec: 1800, minBpm: 141, maxBpm: 151 }],
  recovery: { endHrBpm: 150, hrAt1MinBpm: 120 },
  avgPaceSec: 300,
  activeKcal: 380,
  elevationM: 5,
  avgCadence: 170,
  maxHr: 170,
}

/** Too short for `fastest_pace_5k`, `fastest_pace_10k`, `highest_cadence` and `best_paced_run`. */
export const runC: RecordRunRow = {
  runId: 'run_c_short',
  occurredOn: '2026-07-25',
  distanceM: 2000,
  durationSec: 560,
  avgHrBpm: 160,
  splits: uniformSplits(2, 280, 160, 180),
  zones: [{ zone: 3, durationSec: 560, minBpm: 152, maxBpm: 163 }],
  recovery: null,
  avgPaceSec: 280,
  activeKcal: 150,
  elevationM: 2,
  avgCadence: 180,
  maxHr: 175,
}

export const recordRuns: RecordRunRow[] = [runA, runB, runC]
