import {
  formatBpm,
  formatCadence,
  formatClockSec,
  formatDistanceM,
  formatDuration,
  formatKcal,
  formatPace,
  formatPercent,
} from '@/lib/format'
import { recordDefinition } from './catalog'
import type { RecordKey } from './types'

/**
 * How the eleven record keys are *named* and *rendered*. F06 owns what a record IS; F09 owns the shelf
 * that shows it, and this is the shelf's half — kept next to the catalog rather than inside a
 * component, so `/me` and F11's share page cannot disagree about what `fastest_pace_10k` is called.
 *
 * **The label carries the qualifier.** `fastest_pace_10k` is the fastest *whole-run average* among
 * runs of 10 km or more — not a best 10 km segment carved out of a longer run, which this app has
 * no GPS trace to reconstruct (roadmap non-goals). `catalog.ts` is explicit that the copy must say
 * "your fastest 10 km+ run" and never "your 10k PB", so the qualifier is printed in the label
 * itself and cannot be dropped by a caller that only renders `label`.
 */
export const RECORD_LABELS: Record<RecordKey, string> = {
  longest_distance: 'Longest distance',
  longest_duration: 'Longest duration',
  fastest_pace_5k: 'Fastest pace, 5 km+',
  fastest_pace_10k: 'Fastest pace, 10 km+',
  fastest_km_split: 'Fastest single kilometre',
  most_kcal: 'Most active energy',
  most_elevation: 'Most elevation',
  highest_cadence: 'Highest cadence, 5 km+',
  highest_max_hr: 'Highest max heart rate',
  best_paced_run: 'Steadiest run, 5 km+',
  /* No qualifier to carry, so none is printed: `earliest_start` has no distance floor (F32 §1c).
     "Earliest start" and not "Earliest run" — the record is the moment the runner set off, and the
     run itself may have been the shortest one they ever did. */
  earliest_start: 'Earliest start',
}

/**
 * A stored `records.value` as text, routed by the key's unit — every one of them through
 * `lib/format.ts` (R-23), so the shelf spells `10.67 km` exactly the way the run detail page does.
 *
 * `best_paced_run` is the one key needing arithmetic on the way out: it is stored in **basis
 * points** so that `records.value` can stay an integer for all eleven keys (§4.5), and
 * `formatPercent` takes a 0–100 percentage by convention — hence the ÷100. `1235` renders as
 * `12.3%`, the absolute decoupling of the steadiest qualifying run.
 *
 * `earliest_start` is the second key stored as something other than what it prints, for the same
 * integer reason: `25620` seconds past midnight renders as `07:07`. `formatClockSec` does that and
 * `formatDuration` must never be reached for it — the identical number as a duration is `7:07:00`.
 */
export function formatRecordValue(key: RecordKey, value: number): string {
  switch (recordDefinition(key)?.unit) {
    case 'm':
      return formatDistanceM(value)
    case 's':
      return formatDuration(value)
    case 's_per_km':
      return formatPace(value, true)
    case 'kcal':
      return formatKcal(value)
    case 'spm':
      return formatCadence(value)
    case 'bpm':
      return formatBpm(value)
    case 'bp':
      return formatPercent(value / 100, 1)
    case 'clock':
      return formatClockSec(value)
    default:
      return String(value)
  }
}
