import type { DateISO } from '@/lib/date/ranges'
import type { ZoneRow } from '@/lib/metrics/types'

/**
 * The shapes every chart in F08 is fed. Three rules govern this file, and they are the same three
 * that govern `lib/metrics/types.ts` one layer down:
 *
 *  1. **Nothing here is formatted.** Every field is a number, a null or an ISO string.
 *     `lib/format.ts` is the only place a number becomes text (R-23) — including inside a chart
 *     axis's `tickFormatter`.
 *
 *  2. **Nothing here computes a metric.** F06 owns decoupling, drift, cadence fade, zone shares
 *     and ACWR; `lib/charts/*` only re-shapes stored rows and F06 output into the arrays Recharts
 *     wants. If a function in this directory ever needs a formula, it belongs in `lib/metrics`.
 *
 *  3. **No I/O.** Every function takes rows and returns rows, so every one of them is testable
 *     against the canonical fixture with no database and no clock. "Today" arrives as a parameter
 *     for exactly that reason (and because a render straddling Jakarta midnight must not produce
 *     two different answers for one page).
 */

/**
 * The minimum a rollup or trend chart reads off one reviewed run.
 *
 * `zones` is here rather than fetched per chart because three separate visualisations
 * (`/r/[id]`'s zone bar, `/trends`'s month-aggregate bar, and the 12-week zone drift) all read it,
 * and a second query per chart is how two charts on one screen start disagreeing.
 */
export interface ChartRun {
  runId: string
  occurredOn: DateISO
  distanceM: number
  durationSec: number
  /** `runs.avg_pace_sec` — derived once at write time (D5), never recomputed here. */
  avgPaceSec: number
  zones: readonly ZoneRow[]
}

/** §3.1. One `run_splits` row, plus the metres it actually covered. */
export interface PaceHrPoint {
  km: number
  /** Apple's own already-normalised per-km rate — 429 for the fixture's 0.67 km km 11. */
  paceSec: number
  /** The raw elapsed time for the row. Deliberately NOT rendered as a table column — see §3.3. */
  timeSec: number
  hr: number | null
  cadence: number | null
  partial: boolean
  /** 1000 for a full km; the fixture's km 11 is 670. */
  distanceM: number
}

/** §3.2. One zone's slice of a run, or of a month. */
export interface ZoneShare {
  zone: 1 | 2 | 3 | 4 | 5
  durationSec: number
  /**
   * The DISPLAY share, 0–100, largest-remainder rounded so the five sum to exactly 100.
   *
   * **Never threshold on this.** `roundSharesTo100` can promote 69.6% to 70% and trip a flag on a
   * run that never crossed the line — F06's `hardPct` compares the raw float and is the only
   * number a flag may read. This one is for labels.
   */
  pct: number
  minBpm: number | null
  maxBpm: number | null
}

/** §3.4. One ISO week's contribution to a calendar month, clipped to the month's own days. */
export interface MonthWeekBucket {
  isoWeekKey: string
  /** The first day of this bucket that is IN the selected month. */
  clippedStartISO: DateISO
  /** The last day of this bucket that is IN the selected month. */
  clippedEndISO: DateISO
  distanceM: number
  runCount: number
  /** The ISO week extends outside the selected month, so this bar is structurally short. */
  isPartial: boolean
  /** Today falls inside this bucket AND the selected month is the current one. */
  isCurrent: boolean
}

/** §3.5. One week of the rolling 12-week window. */
export interface VolumeTrendPoint {
  isoWeekKey: string
  /** Monday, UNCLIPPED — this window has no month boundary to respect. */
  weekStartISO: DateISO
  distanceM: number
  runCount: number
  /** null for the window's first three weeks: a 1-week "4-week mean" is not one. */
  rollingMeanM: number | null
  isCurrent: boolean
}

/** §3.6. One run, plotted. `bucket` is F06's, not a second distance vocabulary — see paceTrend.ts. */
export interface PaceTrendPoint {
  runId: string
  occurredOn: DateISO
  avgPaceSec: number
  distanceM: number
  bucket: import('@/lib/metrics/week').DistanceBucket
  /** Days since the window's first day. The scatter's x is continuous time, not a category. */
  dayIndex: number
}

/** §3.7. One week's zone composition, as shares summing to 100. */
export interface ZoneDriftWeek {
  isoWeekKey: string
  weekStartISO: DateISO
  /** False when no run that week carried zone data — plotted as a gap, never as five zeros. */
  hasData: boolean
  sharePct: Record<1 | 2 | 3 | 4 | 5, number>
  isCurrent: boolean
}
