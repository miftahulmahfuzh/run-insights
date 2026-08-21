import { addDays, daysBetween, type DateISO } from '@/lib/date/ranges'
import { bucketForDistanceM, type DistanceBucket } from '@/lib/metrics/week'
import type { ChartRun, PaceTrendPoint } from './types'
import { TREND_WEEKS } from './volumeTrend'
import { lastIsoWeeks } from './window'

/**
 * §3.6 — the pace trend, and the comparability rule made mechanical.
 *
 * IMPLEMENTATION_PLAN §6: a 5 km at 6'30" is not progress over a 15 km at 7'00". Pace at
 * different distances is not comparable, full stop. This chart enforces that with a **single-select
 * distance filter** rather than by encoding distance, pace and progress into one undifferentiated
 * scatter — with a band selected, the chart literally cannot render a 5 km next to a 15 km.
 *
 * ── CONTRACT DELTA vs the F08 plan ─────────────────────────────────────────────────────────────
 * The plan specified a NEW `distanceBand` vocabulary here (`short`/`medium`/`long`/`very-long` at
 * 7/12/18 km) and called this file "the ONLY place these thresholds are defined". It was written
 * before F06 landed. F06 shipped `bucketForDistanceM` — `5k`/`10k`/`half`/`full`/`other` — with
 * the identical justification in its own doc comment ("an 8 km run and an 11 km run are the same
 * kind of session... comparing an 8 km run against a 21 km one is not"), and F06's buckets already
 * key `WeekMetrics.avgPaceByBucket` and `MonthMetrics.paceTrendByBucket`.
 *
 * **So F08 reuses F06's buckets and ships no second vocabulary.** Two distance taxonomies whose
 * boundaries differ by 3 km would put "10K pace, week over week" in the rollup next to a scatter
 * that disagrees about which runs are 10Ks — a reader comparing the two would be reading a bug.
 * The plan's *intent* (one place decides, comparability is enforced by the filter) is honoured
 * exactly; only the enum it named is F06's rather than a new one. Recorded in the execution log at
 * the foot of `docs/plans/F08-views-charts.md`.
 */
export const BUCKET_ORDER: readonly DistanceBucket[] = ['other', '5k', '10k', 'half', 'full']

/** Chip labels and the range caption. The ranges restate `bucketForDistanceM`; the test pins them. */
export const BUCKET_LABELS: Record<DistanceBucket, { label: string; range: string }> = {
  other: { label: 'Short', range: 'under 3.5 km' },
  '5k': { label: '5K', range: '3.5 to 7 km' },
  '10k': { label: '10K', range: '7 to 15 km' },
  half: { label: 'Half', range: '15 to 30 km' },
  full: { label: 'Full', range: '30 km and up' },
}

/**
 * Every run in the window, bucketed and given an x coordinate.
 *
 * `dayIndex` is days since the window's first Monday, because the scatter's x is genuinely
 * continuous time (unlike §3.1's discrete kilometres) and a linear regression over calendar dates
 * needs a number. It is not a timestamp: a timestamp invites a timezone, and roadmap D6 already
 * spent that decision once in `jakartaDayOf`.
 */
export function toPaceTrendPoints(
  runs: readonly ChartRun[],
  anchorISO: DateISO,
  weeks = TREND_WEEKS,
): { points: PaceTrendPoint[]; startISO: DateISO; endISO: DateISO; days: number } {
  const window = lastIsoWeeks(anchorISO, weeks)
  const startISO = window[0]!.weekStartISO
  const endISO = window[window.length - 1]!.weekEndISO

  const points = runs
    .filter((r) => r.occurredOn >= startISO && r.occurredOn <= endISO)
    .map((r) => ({
      runId: r.runId,
      occurredOn: r.occurredOn,
      avgPaceSec: r.avgPaceSec,
      distanceM: r.distanceM,
      bucket: bucketForDistanceM(r.distanceM),
      dayIndex: daysBetween(startISO, r.occurredOn),
    }))
    .sort((a, b) => a.dayIndex - b.dayIndex)

  return { points, startISO, endISO, days: daysBetween(startISO, endISO) }
}

/** The day a `dayIndex` refers to. The x-axis tick formatter's other half. */
export function dayIndexToISO(startISO: DateISO, dayIndex: number): DateISO {
  return addDays(startISO, dayIndex)
}

/**
 * Tie-break order for `defaultBucket`: nearest to this runner's home base first.
 *
 * A tie has to break somewhere, and breaking it by distance from the 10K bucket — the design
 * brief's "roughly 10.5 km each time" — is a reason. Breaking it by whichever enum member happens
 * to sort first is not, which is why this order exists separately from `BUCKET_ORDER` (that one is
 * the chip row's left-to-right reading order, shortest to longest, and must stay that way).
 */
const TIE_PREFERENCE: readonly DistanceBucket[] = ['10k', '5k', 'half', 'other', 'full']

/**
 * The bucket the filter opens on: whichever has the most runs in the window, ties breaking toward
 * `10k` and then outward from it.
 *
 * A bucket that actually holds runs always beats an empty `10k` — opening on a chip with an empty
 * plot area would be a worse first impression than opening on the runner's second-favourite
 * distance. With no runs at all it returns `10k`, so the chip row still opens somewhere sensible.
 */
export function defaultBucket(points: readonly PaceTrendPoint[]): DistanceBucket {
  const counts = new Map<DistanceBucket, number>()
  for (const p of points) counts.set(p.bucket, (counts.get(p.bucket) ?? 0) + 1)

  let best: DistanceBucket = '10k'
  let bestCount = counts.get('10k') ?? 0
  for (const bucket of TIE_PREFERENCE) {
    const count = counts.get(bucket) ?? 0
    if (count > bestCount) {
      best = bucket
      bestCount = count
    }
  }
  return best
}

export interface PaceTrendLine {
  /** Seconds per km per DAY. Negative means getting faster. */
  slopeSecPerDay: number
  interceptSec: number
  from: { dayIndex: number; paceSec: number }
  to: { dayIndex: number; paceSec: number }
  /** The direct label at the line's right end: seconds per km per week, rounded. */
  perWeekSec: number
}

/**
 * Ordinary least squares over the selected bucket's points.
 *
 * **Withheld below four points, and withheld when every run is on the same day.** §9: a 2-point
 * "trend" line is not a trend, it is a ruler, and a regression over one x value has an undefined
 * slope. Both cases return null, and the component draws the scatter without a line rather than
 * drawing a line the data cannot support.
 */
export function paceTrendLine(points: readonly PaceTrendPoint[]): PaceTrendLine | null {
  if (points.length < 4) return null

  const n = points.length
  const meanX = points.reduce((s, p) => s + p.dayIndex, 0) / n
  const meanY = points.reduce((s, p) => s + p.avgPaceSec, 0) / n

  let sxy = 0
  let sxx = 0
  for (const p of points) {
    sxy += (p.dayIndex - meanX) * (p.avgPaceSec - meanY)
    sxx += (p.dayIndex - meanX) ** 2
  }
  if (sxx === 0) return null

  const slopeSecPerDay = sxy / sxx
  const interceptSec = meanY - slopeSecPerDay * meanX
  const firstX = points[0]!.dayIndex
  const lastX = points[n - 1]!.dayIndex

  return {
    slopeSecPerDay,
    interceptSec,
    from: { dayIndex: firstX, paceSec: interceptSec + slopeSecPerDay * firstX },
    to: { dayIndex: lastX, paceSec: interceptSec + slopeSecPerDay * lastX },
    perWeekSec: Math.round(slopeSecPerDay * 7),
  }
}
