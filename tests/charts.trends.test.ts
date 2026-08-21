import { describe, expect, it } from 'vitest'

import type { ChartRun } from '@/lib/charts'
import {
  BUCKET_ORDER,
  dayIndexToISO,
  defaultBucket,
  lastIsoWeeks,
  paceTrendLine,
  toPaceTrendPoints,
  toVolumeTrend,
  toZoneDrift,
  weeksWithRuns,
} from '@/lib/charts'
import { canonicalSession } from './fixtures/canonicalRun'

const ANCHOR = '2026-08-21' // a Friday, inside 2026-W34 (17–23 Aug)

function run(occurredOn: string, distanceM: number, avgPaceSec = 442): ChartRun {
  return {
    runId: `run_${occurredOn}_${distanceM}`,
    occurredOn,
    distanceM,
    durationSec: Math.round((distanceM / 1000) * avgPaceSec),
    avgPaceSec,
    zones: [],
  }
}

describe('lastIsoWeeks — the rolling window shared by §3.5 and §3.7', () => {
  const weeks = lastIsoWeeks(ANCHOR, 12)

  it('ends at the anchor’s own week and runs oldest first', () => {
    expect(weeks).toHaveLength(12)
    expect(weeks[11]).toMatchObject({
      isoWeekKey: '2026-W34',
      weekStartISO: '2026-08-17',
      weekEndISO: '2026-08-23',
      isCurrent: true,
    })
    expect(weeks[0]!.weekStartISO).toBe('2026-06-01')
  })

  it('marks exactly one week current', () => {
    expect(weeks.filter((w) => w.isCurrent)).toHaveLength(1)
  })
})

describe('toVolumeTrend — bars always, the 4-week mean only once it is real', () => {
  const runs = Array.from({ length: 12 }, (_, i) =>
    // one 10 km run in each of the twelve weeks, oldest first
    run(dayIndexToISO('2026-06-01', i * 7), 10_000),
  )
  const points = toVolumeTrend(runs, ANCHOR)

  it('buckets every run into its own ISO week', () => {
    expect(points).toHaveLength(12)
    expect(points.every((p) => p.distanceM === 10_000 && p.runCount === 1)).toBe(true)
    expect(weeksWithRuns(points)).toBe(12)
  })

  it('withholds the rolling mean for the window’s first three weeks — a gap, not a guess', () => {
    expect(points.slice(0, 3).map((p) => p.rollingMeanM)).toEqual([null, null, null])
    expect(points[3]!.rollingMeanM).toBe(10_000)
  })

  it('averages over exactly four weeks, including empty ones', () => {
    // Weeks 1-4 present, weeks 5-12 empty: the mean at week 5 must fall to 3/4 of the volume, not
    // to the average of "the weeks that had runs".
    const sparse = toVolumeTrend(runs.slice(0, 4), ANCHOR)
    expect(sparse[3]!.rollingMeanM).toBe(10_000)
    expect(sparse[4]!.rollingMeanM).toBe(7_500)
    expect(sparse[7]!.rollingMeanM).toBe(0)
  })

  it('flags the current week, and only it', () => {
    expect(points.filter((p) => p.isCurrent).map((p) => p.isoWeekKey)).toEqual(['2026-W34'])
  })
})

describe('toZoneDrift — shares per week, and a gap where there is no heart-rate data', () => {
  const withZones: ChartRun = { ...run('2026-08-20', 10_670), zones: canonicalSession.zones }
  const drift = toZoneDrift([withZones, run('2026-07-15', 8_000)], ANCHOR)

  it('reproduces the fixture’s own zone shares in the week that holds it', () => {
    const week34 = drift.find((w) => w.isoWeekKey === '2026-W34')!
    expect(week34.hasData).toBe(true)
    expect(week34.sharePct).toEqual({ 1: 2, 2: 1, 3: 7, 4: 47, 5: 43 })
  })

  it('sums every populated week to exactly 100', () => {
    for (const week of drift.filter((w) => w.hasData)) {
      const total = Object.values(week.sharePct).reduce((a, b) => a + b, 0)
      expect(total).toBe(100)
    }
  })

  it('marks a week whose runs carried no zones as having no data — never five zeros as "easy"', () => {
    const july = drift.find((w) => w.weekStartISO === '2026-07-13')!
    expect(july.hasData).toBe(false)
    expect(july.sharePct).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })
})

describe('toPaceTrendPoints — F06’s buckets, not a second distance vocabulary', () => {
  const runs = [
    run('2026-08-20', 10_670, 442), // 10k
    run('2026-08-18', 5_200, 380), // 5k
    run('2026-08-15', 21_400, 500), // half
    run('2026-08-10', 11_000, 430), // 10k
    run('2026-05-01', 10_000, 400), // outside the 12-week window
  ]
  const { points, startISO, days } = toPaceTrendPoints(runs, ANCHOR)

  it('drops runs outside the window and dates the rest from the window’s first Monday', () => {
    expect(points).toHaveLength(4)
    expect(startISO).toBe('2026-06-01')
    expect(days).toBe(83)
    expect(points[0]!.occurredOn).toBe('2026-08-10')
    expect(dayIndexToISO(startISO, points[0]!.dayIndex)).toBe('2026-08-10')
  })

  it('tags each run with F06’s bucket', () => {
    expect(points.map((p) => p.bucket)).toEqual(['10k', 'half', '5k', '10k'])
    expect(BUCKET_ORDER).toContain('10k')
  })

  it('opens on the fullest bucket, and breaks ties outward from the 10K home base', () => {
    expect(defaultBucket(points)).toBe('10k')
    // One 5k and one half, no 10k: a genuine tie, resolved by nearness to 10K rather than by enum
    // order — and a bucket that HAS runs always beats an empty 10k.
    expect(defaultBucket(points.filter((p) => p.bucket !== '10k'))).toBe('5k')
    expect(defaultBucket([])).toBe('10k')
  })
})

describe('paceTrendLine — withheld until it can mean something', () => {
  it('is null below four points: a two-point trend line is a ruler', () => {
    const { points } = toPaceTrendPoints(
      [
        run('2026-08-20', 10_000, 440),
        run('2026-08-13', 10_000, 450),
        run('2026-08-06', 10_000, 460),
      ],
      ANCHOR,
    )
    expect(paceTrendLine(points)).toBeNull()
  })

  it('is null when every run is on the same day — an undefined slope, not a flat one', () => {
    const same = Array.from({ length: 4 }, (_, i) => ({
      runId: `r${i}`,
      occurredOn: '2026-08-20',
      avgPaceSec: 440 + i,
      distanceM: 10_000,
      bucket: '10k' as const,
      dayIndex: 80,
    }))
    expect(paceTrendLine(same)).toBeNull()
  })

  it('reads a steady improvement as a negative slope, labelled per week', () => {
    // 7 s/km faster every week for four weeks -> -1 s/km/day -> -7 s/km/wk.
    const { points } = toPaceTrendPoints(
      [
        run('2026-07-27', 10_000, 460),
        run('2026-08-03', 10_000, 453),
        run('2026-08-10', 10_000, 446),
        run('2026-08-17', 10_000, 439),
      ],
      ANCHOR,
    )
    const line = paceTrendLine(points)!
    expect(line.slopeSecPerDay).toBeCloseTo(-1, 6)
    expect(line.perWeekSec).toBe(-7)
    expect(line.from.paceSec).toBeCloseTo(460, 6)
    expect(line.to.paceSec).toBeCloseTo(439, 6)
  })
})
