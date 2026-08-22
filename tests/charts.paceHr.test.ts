import { describe, expect, it } from 'vitest'

import { canonicalSession } from './fixtures/canonicalRun'
import {
  fastestSlowestFullKm,
  hrDomain,
  kmAxisTicks,
  MAX_AXIS_LABELS,
  paceDomain,
  toPaceHrPoints,
} from '@/lib/charts'
import type { PaceHrPoint } from '@/lib/charts'

/**
 * §11's first named assertion: the fixture's eleven splits, mapped for the signature chart, must
 * reproduce `research/schema.mjs`'s `TRUTH.splits[10]` exactly — `partial: true`, `distanceM: 670`,
 * `paceSec: 429`. That row is the whole reason D14 exists.
 */
describe('toPaceHrPoints — the canonical fixture', () => {
  const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)

  it('maps all eleven splits, in order, with nothing invented', () => {
    expect(points).toHaveLength(11)
    expect(points.map((p) => p.km)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('gives km 11 its real distance — 10670 m minus ten full kilometres is 670', () => {
    const partial = points[10]!
    expect(partial.partial).toBe(true)
    expect(partial.distanceM).toBe(670)
    // Apple's own normalised per-km rate, NOT the raw 288 s elapsed. Plotting the rate is honest;
    // plotting the elapsed time is what would make a fade look like a closing sprint.
    expect(partial.paceSec).toBe(429)
    expect(partial.timeSec).toBe(288)
  })

  it('gives every full kilometre exactly 1000 m', () => {
    expect(points.slice(0, 10).every((p) => p.distanceM === 1000)).toBe(true)
  })

  it('splits the remainder across multiple partial rows rather than dumping it on the first', () => {
    // Cannot arise through F04/F05, which is not the same as producing a plausible wrong number.
    const twoPartials = toPaceHrPoints(
      [
        { km: 1, timeSec: 400, paceSec: 400, hr: 150, cadence: 150, partial: false },
        { km: 2, timeSec: 200, paceSec: 400, hr: 150, cadence: 150, partial: true },
        { km: 3, timeSec: 200, paceSec: 400, hr: 150, cadence: 150, partial: true },
      ],
      2000,
    )
    expect(twoPartials.map((p) => p.distanceM)).toEqual([1000, 500, 500])
  })
})

describe('axis domains are anchored to the run, never tuned', () => {
  const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)

  it('pace domain is fastest-first, because the axis is reversed', () => {
    // 396 (km 1) is the fastest full km, 480 (km 10) the slowest; the partial's 429 sits between.
    expect(paceDomain(points)).toEqual([376, 500])
  })

  it('hr domain is a fixed 10 bpm pad around the run’s own min and max', () => {
    expect(hrDomain(points)).toEqual([144, 193])
  })

  it('degrades to null rather than to a default range when there is nothing to scale', () => {
    expect(hrDomain(points.map((p) => ({ ...p, hr: null })))).toBeNull()
    expect(paceDomain([])).toBeNull()
  })
})

describe('fastest and slowest split exclude the partial row', () => {
  it('names km 1, the fixture’s real fastest full kilometre — never km 11', () => {
    const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)
    expect(fastestSlowestFullKm(points)).toEqual({ fastestKm: 1, slowestKm: 10 })
  })

  it('highlights nothing on a run with fewer than two full kilometres', () => {
    const points = toPaceHrPoints(
      [{ km: 1, timeSec: 400, paceSec: 400, hr: null, cadence: null, partial: false }],
      1000,
    )
    expect(fastestSlowestFullKm(points)).toEqual({ fastestKm: null, slowestKm: null })
  })
})

/**
 * F22 — the x-axis label ladder. Card #18: 22 tick labels inside ~226 px of plot rendered as
 * `101112131415161718192021 22*`, an unreadable smear, because `interval={0}` and `minTickGap={0}`
 * told Recharts explicitly never to skip one.
 *
 * These are the assertions that make the fix verifiable at all. `vitest.config.ts` runs
 * `environment: 'node'`, so nothing here can render an axis — which is exactly why the thinning is
 * a pure function over the points rather than a text-measurement heuristic inside Recharts.
 */
describe('kmAxisTicks — labels thin, data does not', () => {
  /** `run_splits` shape at an arbitrary length; only `km` and `partial` matter to the axis. */
  const rows = (count: number): PaceHrPoint[] =>
    Array.from({ length: count }, (_, i) => ({
      km: i + 1,
      paceSec: 400,
      timeSec: 400,
      hr: 150,
      cadence: 160,
      partial: i === count - 1,
      distanceM: i === count - 1 ? 670 : 1000,
    }))

  it('leaves an eleven-row run exactly as it was — every kilometre labelled', () => {
    // THE REGRESSION GUARD ON THE FIX ITSELF. `docs/media/07-run-chart.png` is this run, and F19
    // committed it. Thin these labels and a screenshot in the README goes stale for a run that
    // never had the bug. The cap of 11 exists to make this line true.
    expect(kmAxisTicks(rows(11))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('thins the 21.2 km run that produced the smear to eleven labels, ending 19 then 22', () => {
    // Stride 2 from km 1 gives 1,3,…,21 — and then km 22 is forced in because it carries the `*`,
    // popping km 21, which sits one unit away and would collide all over again.
    expect(kmAxisTicks(rows(22))).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 22])
  })

  it('climbs the stride ladder past the reported case rather than stopping at 2', () => {
    // A marathon's 42 rows: stride 5, nine labels. An ultra's 100: stride 10, ten labels.
    expect(kmAxisTicks(rows(42))).toEqual([1, 6, 11, 16, 21, 26, 31, 36, 42])
    expect(kmAxisTicks(rows(100))).toEqual([1, 11, 21, 31, 41, 51, 61, 71, 81, 100])
  })

  it('always ends on the final row, whatever the stride — that row carries the `*`', () => {
    // D14's third channel. The partial marker is a non-colour cue on the last tick, so a stride
    // that happened to skip the last row would silently delete it. Asserted as an invariant over
    // every length rather than as a property of the three lengths above.
    for (let n = 2; n <= 120; n += 1) {
      const points = rows(n)
      expect(kmAxisTicks(points).at(-1)).toBe(points.at(-1)!.km)
    }
  })

  it('never exceeds the label budget, at any length', () => {
    // The property, not a table: a future edit to STRIDES cannot regress one awkward length
    // unnoticed. 120 rows is past any run this app will see and past the top of the ladder.
    for (let n = 1; n <= 120; n += 1) {
      expect(kmAxisTicks(rows(n)).length).toBeLessThanOrEqual(MAX_AXIS_LABELS)
    }
  })

  it('strides by index, not by kilometre value', () => {
    // `km` runs 1..n through F04/F05 today. A function that assumed it would break quietly the day
    // it does not — so the stride counts rows, and the ticks are whatever values those rows hold.
    const sparse = rows(22).map((p, i) => ({ ...p, km: (i + 1) * 10 }))
    expect(kmAxisTicks(sparse)).toEqual([10, 30, 50, 70, 90, 110, 130, 150, 170, 190, 220])
  })

  it('degrades to an empty list rather than throwing on no splits', () => {
    expect(kmAxisTicks([])).toEqual([])
    expect(kmAxisTicks(rows(1))).toEqual([1])
  })
})
