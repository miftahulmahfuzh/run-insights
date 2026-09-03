import type { RecordDefinition, RecordKey } from './types'

/**
 * Roadmap §4.5, as data. **This list is the contract** — F08 renders exactly these keys and F09's
 * `long_way_home` badge fires off `longest_distance` moving.
 *
 * Where a key measures a **rate**, it names a **minimum qualifying distance**, because "fastest
 * pace" over 400 m is not a record, it is a sprint to the corner. A run that fails a qualifier is
 * excluded from that key alone and still competes for every other one. Keys that measure a
 * magnitude or a moment — the six originals, and F32's `earliest_start` — have no floor: there is
 * nothing about a short run that makes its distance, its energy or its start time less true.
 *
 * **Append-only.** This order is the order the shelf reads in (`RECORD_KEYS`), so a new key goes
 * at the bottom and the existing rows do not move under a returning runner.
 */
export const RECORD_CATALOG: readonly RecordDefinition[] = [
  {
    key: 'longest_distance',
    unit: 'm',
    direction: 'max',
    qualifies: () => true,
    valueOf: (c) => c.distanceM,
  },
  {
    key: 'longest_duration',
    unit: 's',
    direction: 'max',
    qualifies: () => true,
    valueOf: (c) => c.durationSec,
  },

  /**
   * `fastest_pace_5k` / `fastest_pace_10k` compare the **whole-run** average pace among runs at
   * least that long — NOT a best 5 km/10 km segment carved out of a longer run. A 12 km run's
   * overall pace can win `fastest_pace_10k`. Reconstructing a best-effort segment would need
   * per-metre GPS this app never has (roadmap non-goals: no GPX, no route data), so F08's copy
   * must say "your fastest 10 km+ run", never "your 10k PB".
   */
  {
    key: 'fastest_pace_5k',
    unit: 's_per_km',
    direction: 'min',
    qualifies: (c) => c.distanceM >= 5000,
    valueOf: (c) => c.avgPaceSec,
  },
  {
    key: 'fastest_pace_10k',
    unit: 's_per_km',
    direction: 'min',
    qualifies: (c) => c.distanceM >= 10000,
    valueOf: (c) => c.avgPaceSec,
  },

  /** No distance qualifier: a single fast kilometre inside any run is a legitimate thing to hold.
   *  Full kms only — D14's partial row has a pace-equivalent, not a kilometre's worth of effort. */
  {
    key: 'fastest_km_split',
    unit: 's_per_km',
    direction: 'min',
    qualifies: (c) => c.fastestFullKmPaceSec != null,
    valueOf: (c) => c.fastestFullKmPaceSec,
  },

  {
    key: 'most_kcal',
    unit: 'kcal',
    direction: 'max',
    qualifies: (c) => c.activeKcal != null,
    valueOf: (c) => c.activeKcal,
  },
  {
    key: 'most_elevation',
    unit: 'm',
    direction: 'max',
    qualifies: (c) => c.elevationM != null,
    valueOf: (c) => c.elevationM,
  },
  {
    key: 'highest_cadence',
    unit: 'spm',
    direction: 'max',
    qualifies: (c) => c.distanceM >= 5000 && c.avgCadence != null,
    valueOf: (c) => c.avgCadence,
  },
  {
    key: 'highest_max_hr',
    unit: 'bpm',
    direction: 'max',
    qualifies: (c) => c.maxHr != null,
    valueOf: (c) => c.maxHr,
  },

  /**
   * The only key that measures *quality* rather than magnitude: the run whose speed-per-heartbeat
   * held steadiest, i.e. smallest |decoupling|. Stored in **basis points** (`1235` = 12.35%) so
   * `records.value` stays an integer for every key (schema §4.3), consistent with D5.
   */
  {
    key: 'best_paced_run',
    unit: 'bp',
    direction: 'min',
    qualifies: (c) => c.distanceM >= 5000 && c.decouplingBp != null,
    valueOf: (c) => c.decouplingBp,
  },

  /**
   * F32, card #44 — the eleventh key, and the only one that measures **when** rather than what.
   * Seconds past midnight, smallest wins: the earliest the runner has ever set off.
   *
   * **A plain minimum, so a 00:15 start beats a 04:30 one.** Midnight is where this app's day
   * begins and nowhere else: `runs.started_at` is a Postgres `time` carrying no date, and
   * `lib/badges/rules.ts` orders it by lexical string compare from `'00:00:00'` on purpose. A
   * window like `early_bird`'s 05:00–05:30 would read more kindly on a very odd run, and would be
   * a threshold nobody asked for — R-42's objection, one layer up. F32 §1b holds the argument and
   * names the one line to change if that call is ever revisited.
   *
   * **No distance qualifier, deliberately.** §4.5 floors exactly the four keys that measure a
   * *rate*; a start time is not a rate, and the three badges that already read this column
   * (`early_bird`, `late_start`, `dawn_patrol`) all ignore distance for the same reason. Getting
   * up at 04:10 is the same act of will whether what follows is 2 km or 12.
   */
  {
    key: 'earliest_start',
    unit: 'clock',
    direction: 'min',
    qualifies: (c) => c.startedAtSec != null,
    valueOf: (c) => c.startedAtSec,
  },
]

/** Every key, in catalog order. F08 renders the shelf in this order; do not sort it alphabetically. */
export const RECORD_KEYS: readonly RecordKey[] = RECORD_CATALOG.map((d) => d.key)

export function recordDefinition(key: RecordKey): RecordDefinition | undefined {
  return RECORD_CATALOG.find((d) => d.key === key)
}

/** Narrowing guard for a `records.key` string read back out of the database. */
export function isRecordKey(value: unknown): value is RecordKey {
  return typeof value === 'string' && RECORD_KEYS.includes(value as RecordKey)
}
