import type { RecordRunRow } from '@/lib/records/recompute'
import type { SplitRow } from '@/lib/metrics/types'
import { canonicalRecordRun } from './canonicalRun'

/**
 * Three runs, hand-built so every one of the eleven record keys has a verifiable winner and every
 * qualifier has something it excludes (F06 plan §7.4).
 *
 *   A — the canonical run. Long, hard, badly paced. Wins on magnitude. Starts at 07:07.
 *   B — synthetic, EARLIER, six perfectly uniform kilometres. Wins on quality, and on the clock.
 *   C — 2 km. Well-formed but too short for four of the eleven keys, which is its entire job, and
 *       it carries NO start time — the one thing that excludes a run from `earliest_start`.
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
  /* 05:12 = 18720 s, earlier than A's 07:07, so B holds `earliest_start` as well as the quality
     keys. Its date is also earlier, which keeps the tie-break tests reading the same way. */
  startedAt: '05:12:00',
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
  /* No start time at all — the screenshot did not print one. C therefore competes for every key
     with no distance floor EXCEPT `earliest_start`, which is what a null input qualifier means. */
  startedAt: null,
  activeKcal: 150,
  elevationM: 2,
  avgCadence: 180,
  maxHr: 175,
}

export const recordRuns: RecordRunRow[] = [runA, runB, runC]
