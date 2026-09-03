import type { DateISO } from '@/lib/date/ranges'
import type { SessionInput } from '@/lib/metrics/types'

/**
 * The personal-record catalog's types (F06 plan §7.1). Roadmap §4.5 is the authority on the eleven
 * keys, their units, their qualifiers and their directions; `catalog.ts` is that table encoded as
 * data so a reader can diff the two by eye.
 */

export type RecordKey =
  | 'longest_distance'
  | 'longest_duration'
  | 'fastest_pace_5k'
  | 'fastest_pace_10k'
  | 'fastest_km_split'
  | 'most_kcal'
  | 'most_elevation'
  | 'highest_cadence'
  | 'highest_max_hr'
  | 'best_paced_run'
  | 'earliest_start'

export type RecordDirection = 'max' | 'min'

/**
 * `'bp'` is basis points — see `best_paced_run` in `catalog.ts` for why that unit exists.
 *
 * `'clock'` is a **time of day**, held as seconds past midnight, and it is the same trick for the
 * same reason: `records.value` is `int NOT NULL` for all eleven keys (§4.3), so `earliest_start`
 * stores `25620` rather than `'07:07:00'`. It is emphatically NOT `'s'` — `'s'` is a duration and
 * formats as `1:12:30`, where this formats as a wall clock. Two units over the same primitive,
 * because the two sentences they print are not interchangeable.
 */
export type RecordUnit = 'm' | 's' | 's_per_km' | 'kcal' | 'spm' | 'bpm' | 'bp' | 'clock'

/**
 * Everything `computeRecords` needs about one run, and nothing else. Built by `recompute.ts` from
 * a `runs` row plus one `computeSessionMetrics` call — never by a second implementation of the
 * decoupling or fastest-km arithmetic.
 */
export interface RecordCandidate {
  runId: string
  occurredOn: DateISO
  distanceM: number
  durationSec: number
  /** `runs.avg_pace_sec` — the stored whole-run ratio (D5), never re-derived from splits (D14). */
  avgPaceSec: number
  activeKcal: number | null
  elevationM: number | null
  avgCadence: number | null
  maxHr: number | null
  /** `SessionMetrics.fastestKm.paceSec`. null when the run has no full-km split at all. */
  fastestFullKmPaceSec: number | null
  /** `round(abs(decouplingPct) * 100)`. null when decoupling could not be computed. */
  decouplingBp: number | null
  /** `runs.started_at` as seconds past midnight, 0..86399. null when the screenshot had no time. */
  startedAtSec: number | null
}

export interface RecordDefinition {
  key: RecordKey
  unit: RecordUnit
  direction: RecordDirection
  /** The §4.5 minimum-qualifying-distance rule, plus "the input field is present". */
  qualifies: (c: RecordCandidate) => boolean
  /** null excludes this run from THIS key only — never from the others. */
  valueOf: (c: RecordCandidate) => number | null
}

/** The winner of one key. Absent from a result set entirely when nothing qualified. */
export interface RecordResult {
  key: RecordKey
  runId: string
  value: number
  achievedOn: DateISO
}

/** A `records` row as stored (roadmap §4.3), minus `user_id` and `updated_at`. */
export interface StoredRecord extends RecordResult {
  /** What this key was worth before the current holder took it. null for a first-ever holder. */
  previousValue: number | null
}

/**
 * One reviewed run as the gateway hands it over: a `SessionInput` (splits, zones, recovery) plus
 * the flat `runs` columns the catalog reads directly. `toRecordCandidate` turns it into a
 * `RecordCandidate`; nothing else in `lib/records` sees this shape.
 */
export interface RecordRunRow extends SessionInput {
  /** `runs.avg_pace_sec` — read, never re-derived. */
  avgPaceSec: number
  /** `runs.started_at`, Postgres `time`: `'HH:MM:SS'`, or null when the screenshot had no time. */
  startedAt: string | null
  activeKcal: number | null
  elevationM: number | null
  avgCadence: number | null
  maxHr: number | null
}
