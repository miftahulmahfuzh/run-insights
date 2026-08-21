/**
 * The boundary types for every deterministic number in the app (F06, plan §2).
 *
 * Two rules govern this file, and both are load-bearing:
 *
 *  1. **`HrMax` / `HrMaxSource` are RE-EXPORTED, never redeclared.** F02's `./hrMax` owns the only
 *     definition. A second, structurally-identical declaration would compile fine and then drift
 *     the day one of them gains a field — which is exactly how two "sources of truth" are born.
 *
 *  2. **Nothing here is formatted for display.** Every field is a plain `number | null`,
 *     JSON-serialisable, and crosses the server→client boundary as-is. No `"7'22\""` strings, no
 *     `%` suffixes, no presentation rounding. `lib/format.ts` (roadmap §4.2) is the only place a
 *     number becomes text, and it is the only place that decides `10.67 km` over `10,67KM`.
 *
 * Field names match F03's Drizzle columns exactly (`distanceM`, `paceSec`, `hr`, `cadence`), so a
 * query result feeds `computeSessionMetrics` with no adapter layer in between. The one deliberate
 * exception is `SessionInput.avgHrBpm` — `runs.avgHr` — spelled with its unit because a bare
 * `avgHr` next to `avgHrPctMax` reads ambiguously in the formulas.
 */

export type { HrMax, HrMaxSource } from './hrMax'
import type { HrMax } from './hrMax'

/** One `run_splits` row. `partial` is roadmap D14's flag, and §3.1 is why it exists. */
export interface SplitRow {
  km: number
  timeSec: number
  paceSec: number
  hr: number | null
  cadence: number | null
  partial: boolean
}

/** One `run_zones` row. `minBpm` is null for zone 1, `maxBpm` for zone 5 — Apple prints no bound. */
export interface ZoneRow {
  zone: 1 | 2 | 3 | 4 | 5
  durationSec: number
  minBpm: number | null
  maxBpm: number | null
}

/**
 * The post-workout heart-rate pair (R-9: `runs.end_hr_bpm`, `runs.hr_1min_post_bpm`).
 *
 * `null` for the whole object when a run has no recovery reading at all — a manual entry, or a
 * screenshot whose heart-rate screen was not uploaded. The +2 min reading the extractor also
 * captures has no column and no metric; see R-9.
 */
export interface RecoveryInput {
  endHrBpm: number | null
  hrAt1MinBpm: number | null
}

/** Everything `computeSessionMetrics` reads. One run's own rows, nothing else, no I/O. */
export interface SessionInput {
  runId: string
  /** 'YYYY-MM-DD', the Asia/Jakarta calendar day (roadmap D6). */
  occurredOn: string
  distanceM: number
  durationSec: number
  avgHrBpm: number | null
  splits: readonly SplitRow[]
  zones: readonly ZoneRow[]
  recovery: RecoveryInput | null
}

export interface FastestSlowestKm {
  km: number
  paceSec: number
}

export interface ZonePctRow {
  zone: 1 | 2 | 3 | 4 | 5
  durationSec: number
  /** The RAW float share, 0..100. Never pre-rounded — see `roundSharesTo100`'s warning. */
  pct: number
}

export interface SessionMetrics {
  runId: string
  /**
   * The denominator that produced `avgHrPctMax`, carried through so the UI can label its
   * provenance (roadmap §4.4: "the UI shows it") and so R-11 can freeze it into `insights.payload`.
   */
  hrMaxUsed: HrMax | null
  /** null iff `hrMaxUsed` is null OR `avgHrBpm` is null. Never 0, never a substituted constant. */
  avgHrPctMax: number | null
  /** Pa:Hr decoupling, %. Positive = aerobic drift. null iff fewer than 2 full-km splits (§3.3). */
  decouplingPct: number | null
  /** Second-half mean pace minus first-half mean pace, s/km. Positive = slowed down. */
  splitDriftSecPerKm: number | null
  /** Population standard deviation of full-km paces, seconds. */
  paceSdSec: number | null
  /** Last full km's cadence minus the first full km's. Negative = faded. */
  cadenceFadeSpm: number | null
  fastestKm: FastestSlowestKm | null
  slowestKm: FastestSlowestKm | null
  /** `[]` iff the run has no zone rows. */
  zonePct: ZonePctRow[]
  /** Z4+Z5 share. null iff total zone time is 0 — never 0, which would read as "all easy". */
  hardPct: number | null
  /** `endHrBpm − hrAt1MinBpm`. null if either reading is missing. Bigger is better. */
  hrRecovery1MinBpm: number | null
  /** How many rows actually fed the split-based metrics, so a caller can say "not enough data". */
  fullSplitCount: number
}
