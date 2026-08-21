import type { DateISO } from '@/lib/date/ranges'
import { roundSharesTo100 } from '@/lib/metrics/round'
import type { ChartRun, ZoneDriftWeek } from './types'
import { TREND_WEEKS } from './volumeTrend'
import { lastIsoWeeks } from './window'

export const ZONES = [1, 2, 3, 4, 5] as const

/**
 * §3.7 — "is my training becoming more polarised, or just uniformly hard?", as a stacked area of
 * zone share per week over the same 12 weeks as §3.5.
 *
 * Deliberately the same window, from the same `lastIsoWeeks` call shape, so a reader can trace one
 * week's volume bar straight down to its zone composition.
 *
 * **A week with no zone data gets `hasData: false` and five zeros, and the chart draws a gap.**
 * Five zeros rendered as an area would read as "an easy week", which is the exact misreport §9
 * forbids for a run with no heart-rate data — the same rule one scope up.
 */
export function toZoneDrift(
  runs: readonly ChartRun[],
  anchorISO: DateISO,
  weeks = TREND_WEEKS,
): ZoneDriftWeek[] {
  return lastIsoWeeks(anchorISO, weeks).map((week) => {
    const inWeek = runs.filter(
      (r) => r.occurredOn >= week.weekStartISO && r.occurredOn <= week.weekEndISO,
    )

    const secByZone = new Map<number, number>()
    for (const run of inWeek) {
      for (const z of run.zones) {
        secByZone.set(z.zone, (secByZone.get(z.zone) ?? 0) + z.durationSec)
      }
    }

    const seconds = ZONES.map((z) => secByZone.get(z) ?? 0)
    const total = seconds.reduce((a, b) => a + b, 0)
    // Largest-remainder again, for the same reason as the zone bar: a stacked area whose bands sum
    // to 99% leaves a visible sliver of background at the top of one week and not the next.
    const pcts = roundSharesTo100(seconds)

    return {
      isoWeekKey: week.isoWeekKey,
      weekStartISO: week.weekStartISO,
      hasData: total > 0,
      sharePct: {
        1: pcts[0] ?? 0,
        2: pcts[1] ?? 0,
        3: pcts[2] ?? 0,
        4: pcts[3] ?? 0,
        5: pcts[4] ?? 0,
      },
      isCurrent: week.isCurrent,
    }
  })
}
