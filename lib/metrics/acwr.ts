import { addDays, daysBetween, type DateISO } from '@/lib/date/ranges'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  Acute:chronic workload ratio — defined precisely, because the obvious reading is broken.
 *
 *  IMPLEMENTATION_PLAN §4 says "7-day ÷ 28-day volume; flag outside 0.8–1.3". Taken literally,
 *  `Σ7 / Σ28` **can never land in that band**: at any steady training volume, seven days is
 *  exactly a quarter of twenty-eight, so the naive ratio is identically **0.25 forever** — the
 *  same number whether the runner is tapering or doubling their week. A threshold check written
 *  against it would never fire in the "too high" direction, no matter how reckless the week.
 *
 *  Gabbett's coupled ACWR expresses BOTH sides as a weekly-equivalent load: the chronic side is
 *  the 28-day total divided by four. At constant weekly volume V the acute side is V and the
 *  chronic side is 4V/4 = V, so the ratio is 1.0 — which is the only form compatible with a
 *  "1.0 = holding steady, 0.8–1.3 = sweet spot" band. `tests/metrics.acwr.test.ts` proves exactly
 *  this: four identical weeks give 1.0, not 0.25.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Windows in days, inclusive of `asOf`. */
const ACUTE_DAYS = 7
const CHRONIC_DAYS = 28
const CHRONIC_WEEKS = CHRONIC_DAYS / ACUTE_DAYS

/** The published sweet spot. Outside it in either direction is worth saying out loud. */
export const ACWR_SWEET_SPOT = { min: 0.8, max: 1.3 } as const

/**
 * The code string F08 renders and F07 may narrate. Not a session `FlagCode`: ACWR is a property
 * of the runner right now, not of any one run, so it does not belong in a per-run flag array.
 */
export const ACWR_OUT_OF_RANGE = 'ACWR_OUT_OF_RANGE'

export interface DailyLoadPoint {
  occurredOn: DateISO
  distanceM: number
}

export interface Acwr {
  /** As-of day, Asia/Jakarta. Echoed back so a cached value cannot be misread as "today". */
  asOf: DateISO
  /** Σ distance over [asOf−6d, asOf], in km. */
  acuteKm: number
  /** Σ distance over [asOf−27d, asOf], in km, divided by four. */
  chronicWeeklyAvgKm: number
  /** `acuteKm / chronicWeeklyAvgKm`. null when history is insufficient or the chronic side is 0. */
  ratio: number | null
  /** True when the runner's first-ever run is less than 28 days before `asOf`. */
  insufficientHistory: boolean
}

/**
 * **Not month-scoped, on purpose.** This answers "what is this runner's injury-risk profile right
 * now", a single rolling value as of today. Opening March's rollup does not recompute ACWR "as of
 * March" — it shows the same current number every other month's page shows. Making it a
 * per-`monthKey` fact (the way `volumeDelta` is) would silently invite reading a training-risk
 * indicator historically, which it is not built to support.
 *
 * **The insufficient-history guard is not conservatism, it is correctness.** A runner three weeks
 * in has a 28-day denominator containing a week of nothing. Computing anyway yields ratios like
 * 3.2 and calls a normal second week a red alert. `null` plus a labelled reason is the honest
 * output, and matches how `resolveHrMax` degrades rather than defaulting (§4.4).
 *
 * `runs` may contain days outside both windows — the caller can hand over a whole month and this
 * filters. `firstRunOn` is the user's first-ever reviewed run, which the caller knows and this
 * function cannot see from a windowed slice.
 */
export function computeAcwr(
  runs: readonly DailyLoadPoint[],
  asOf: DateISO,
  firstRunOn: DateISO | null,
): Acwr {
  const acuteStart = addDays(asOf, -(ACUTE_DAYS - 1))
  const chronicStart = addDays(asOf, -(CHRONIC_DAYS - 1))

  const sumM = (from: DateISO) =>
    runs
      .filter((r) => r.occurredOn >= from && r.occurredOn <= asOf)
      .reduce((a, r) => a + r.distanceM, 0)

  const acuteKm = sumM(acuteStart) / 1000
  const chronicWeeklyAvgKm = sumM(chronicStart) / 1000 / CHRONIC_WEEKS

  const insufficientHistory = firstRunOn == null || daysBetween(firstRunOn, asOf) < CHRONIC_DAYS
  const ratio = insufficientHistory || chronicWeeklyAvgKm <= 0 ? null : acuteKm / chronicWeeklyAvgKm

  return { asOf, acuteKm, chronicWeeklyAvgKm, ratio, insufficientHistory }
}

/** Raw ratio in, raw thresholds out — never a value that has been through `roundSharesTo100`. */
export function isAcwrOutOfRange(a: Acwr): boolean {
  if (a.insufficientHistory || a.ratio == null) return false
  return a.ratio < ACWR_SWEET_SPOT.min || a.ratio > ACWR_SWEET_SPOT.max
}
