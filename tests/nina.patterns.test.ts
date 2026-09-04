import { describe, expect, it } from 'vitest'

import { BADGE_THRESHOLDS } from '@/lib/badges/catalog'
import { addDays, type DateISO } from '@/lib/date/ranges'
import { ACWR_SWEET_SPOT } from '@/lib/metrics/acwr'
import { FLAG_THRESHOLDS } from '@/lib/metrics/flags'
import {
  clockStringToSec,
  evaluatePatterns,
  isoWeekdayOf,
  isPatternCode,
  PATTERN_CODES,
  PATTERN_THRESHOLDS,
  type PatternCode,
  type PatternInput,
  type PatternRun,
} from '@/lib/nina/patterns'

/**
 * The boundary pairs hand-build a `PatternInput` and toggle one thing, which is only possible
 * because `evaluatePatterns` takes resolved rows rather than a `userId` — no database, no fixture,
 * just the comparison under test. Every threshold is STRICT, so each code gets a case sitting
 * exactly on the line that must not fire.
 *
 * `tests/metrics.flags.test.ts` is the model, deliberately, because `lib/nina/patterns.ts` is
 * `lib/metrics/flags.ts`'s longitudinal twin and a reader should be able to read one after the
 * other without changing gears.
 */

/** 2026-09-03 is a Thursday — ISO weekday 4. Pinned below so the date arithmetic is not folklore. */
const ASOF: DateISO = '2026-09-03'
const THURSDAY = 4

/** Nothing in this world has happened yet. Each test switches on exactly one field. */
const QUIET: PatternInput = {
  runs: [],
  asOf: ASOF,
  hrMaxBpm: 189,
  usualRunningDays: [],
  firstRunOn: null,
}

/** An unremarkable 10 km at 5:00/km, started at 06:00, at 74% of max HR. */
const run = (over: Partial<PatternRun> & { occurredOn: DateISO }): PatternRun => ({
  id: `r_${over.occurredOn}`,
  startedAt: '06:00:00',
  distanceM: 10_000,
  durationSec: 3000,
  avgHr: 140,
  avgPaceSec: 300,
  ...over,
})

const codes = (over: Partial<PatternInput>): string[] =>
  evaluatePatterns({ ...QUIET, ...over }).map((p) => p.code)

const fired = (over: Partial<PatternInput>, code: PatternCode) =>
  evaluatePatterns({ ...QUIET, ...over }).find((p) => p.code === code)

/** Five consecutive daily runs, the newest `n` of them started after 07:00. Newest first. */
const lateStarts = (n: number, at = '07:22:00'): PatternRun[] =>
  Array.from({ length: 5 }, (_, i) =>
    run({ occurredOn: addDays(ASOF, -i), startedAt: i < n ? at : '05:30:00' }),
  )

/** Five consecutive daily runs, the newest `n` of them at `bpm`. */
const hotRuns = (n: number, bpm: number): PatternRun[] =>
  Array.from({ length: 5 }, (_, i) =>
    run({ occurredOn: addDays(ASOF, -i), avgHr: i < n ? bpm : 120 }),
  )

/** Ten consecutive 10 km runs: the newest five at `recentSec`, the five before at `olderSec`. */
const paceSeries = (recentSec: number, olderSec: number, from: DateISO = ASOF): PatternRun[] =>
  Array.from({ length: 10 }, (_, i) =>
    run({
      occurredOn: addDays(from, -i),
      distanceM: 10_000,
      durationSec: i < 5 ? recentSec : olderSec,
    }),
  )

/**
 * Two runs whose 28-day total is always 40 km — so `chronicWeeklyAvgKm` is always exactly 10 —
 * with `acuteM` of it inside the 7-day window. The ratio is therefore `acuteM / 10000`, exactly.
 */
const acwrRuns = (acuteM: number): PatternRun[] => [
  run({ occurredOn: ASOF, distanceM: acuteM, durationSec: 3900 }),
  run({ occurredOn: addDays(ASOF, -20), distanceM: 40_000 - acuteM, durationSec: 8100 }),
]

const FIRST_RUN: DateISO = addDays(ASOF, -40)

describe('nothing fires on an empty history', () => {
  it('a runner with no reviewed runs has no habits to judge', () => {
    expect(evaluatePatterns(QUIET)).toEqual([])
  })
})

describe('the vocabulary is closed — the model never coins a code', () => {
  it('PATTERN_CODES is exactly the five members of the union', () => {
    expect([...PATTERN_CODES].sort()).toEqual(
      [
        'ACWR_SPIKE',
        'MISSED_USUAL_DAY',
        'PACE_REGRESSION',
        'REPEATED_HIGH_AVG_HR',
        'REPEATED_LATE_START',
      ].sort(),
    )
  })

  it('isPatternCode rejects a plausible invention, and a session flag code', () => {
    expect(isPatternCode('REPEATED_LATE_START')).toBe(true)
    expect(isPatternCode('OVERTRAINING_RISK')).toBe(false)
    // A per-run FlagCode is not a pattern. The two catalogs are separate and stay separate.
    expect(isPatternCode('HIGH_DECOUPLING')).toBe(false)
    expect(isPatternCode(null)).toBe(false)
    expect(isPatternCode(3)).toBe(false)
  })
})

describe('three thresholds are imported, not restated', () => {
  it('late is the same 07:00 the late_start badge uses', () => {
    expect(PATTERN_THRESHOLDS.lateStartAfterSec).toBe(
      clockStringToSec(BADGE_THRESHOLDS.lateStartAfter),
    )
    expect(PATTERN_THRESHOLDS.lateStartAfterSec).toBe(25_200)
  })

  it('hot is the same 90% VERY_HIGH_AVG_HR uses, and 1.3 is the published sweet spot', () => {
    expect(PATTERN_THRESHOLDS.highAvgHrPctMax).toBe(FLAG_THRESHOLDS.VERY_HIGH_AVG_HR)
    expect(PATTERN_THRESHOLDS.acwrRatioMax).toBe(ACWR_SWEET_SPOT.max)
  })
})

describe('the calendar helper', () => {
  it('isoWeekdayOf is Monday-first and reads the date as a Jakarta calendar day', () => {
    expect(isoWeekdayOf('2026-09-03')).toBe(THURSDAY)
    expect(isoWeekdayOf('2026-09-07')).toBe(1)
    expect(isoWeekdayOf('2026-09-06')).toBe(7)
  })
})

describe('boundaries — every threshold is strict', () => {
  it('REPEATED_LATE_START: 2 of the last 5 does not fire, 3 does', () => {
    expect(codes({ runs: lateStarts(2) })).not.toContain('REPEATED_LATE_START')
    expect(codes({ runs: lateStarts(3) })).toContain('REPEATED_LATE_START')
  })

  it('REPEATED_LATE_START: 07:00:00 exactly is not late, 07:00:01 is', () => {
    expect(codes({ runs: lateStarts(5, '07:00:00') })).not.toContain('REPEATED_LATE_START')
    expect(codes({ runs: lateStarts(5, '07:00:01') })).toContain('REPEATED_LATE_START')
  })

  it('REPEATED_HIGH_AVG_HR: 90.0% of max does not fire, 90.5% does', () => {
    expect(codes({ runs: hotRuns(3, 180), hrMaxBpm: 200 })).not.toContain('REPEATED_HIGH_AVG_HR')
    expect(codes({ runs: hotRuns(3, 181), hrMaxBpm: 200 })).toContain('REPEATED_HIGH_AVG_HR')
  })

  it('REPEATED_HIGH_AVG_HR: 2 hot runs of 5 does not fire, 3 does', () => {
    expect(codes({ runs: hotRuns(2, 181), hrMaxBpm: 200 })).not.toContain('REPEATED_HIGH_AVG_HR')
    expect(codes({ runs: hotRuns(3, 181), hrMaxBpm: 200 })).toContain('REPEATED_HIGH_AVG_HR')
  })

  it('MISSED_USUAL_DAY: one skipped usual day does not fire, two do', () => {
    // The 14-day lookback from 2026-09-02 holds exactly two Thursdays: 08-27 and 08-20.
    expect(
      codes({ runs: [run({ occurredOn: '2026-08-27' })], usualRunningDays: [THURSDAY] }),
    ).not.toContain('MISSED_USUAL_DAY')
    expect(codes({ runs: [], usualRunningDays: [THURSDAY] })).toContain('MISSED_USUAL_DAY')
  })

  it('PACE_REGRESSION: exactly 15 s/km slower does not fire, 15.1 does', () => {
    // 10 km in 3000 s is 300 s/km; in 3150 s it is 315; in 3151 s it is 315.1.
    expect(codes({ runs: paceSeries(3150, 3000) })).not.toContain('PACE_REGRESSION')
    expect(codes({ runs: paceSeries(3151, 3000) })).toContain('PACE_REGRESSION')
  })

  it('ACWR_SPIKE: a ratio of exactly 1.3 does not fire, 1.31 does', () => {
    expect(codes({ runs: acwrRuns(13_000), firstRunOn: FIRST_RUN })).not.toContain('ACWR_SPIKE')
    expect(codes({ runs: acwrRuns(13_100), firstRunOn: FIRST_RUN })).toContain('ACWR_SPIKE')
  })
})

describe('absence is not "false"', () => {
  it('a null hrMax disables REPEATED_HIGH_AVG_HR rather than estimating one', () => {
    expect(codes({ runs: hotRuns(5, 181), hrMaxBpm: null })).not.toContain('REPEATED_HIGH_AVG_HR')
  })

  it('a run with no started_at is not a late start', () => {
    const noStarts = Array.from({ length: 5 }, (_, i) =>
      run({ occurredOn: addDays(ASOF, -i), startedAt: null }),
    )
    expect(codes({ runs: noStarts })).not.toContain('REPEATED_LATE_START')
  })

  it('an empty running_days slot disables MISSED_USUAL_DAY', () => {
    expect(codes({ runs: [], usualRunningDays: [] })).not.toContain('MISSED_USUAL_DAY')
  })

  it('MISSED_USUAL_DAY never judges asOf itself — a day in progress is not a day skipped', () => {
    const bothEarlierThursdays = [
      run({ occurredOn: '2026-08-27' }),
      run({ occurredOn: '2026-08-20' }),
    ]
    expect(codes({ runs: bothEarlierThursdays, usualRunningDays: [THURSDAY] })).not.toContain(
      'MISSED_USUAL_DAY',
    )
  })

  it('PACE_REGRESSION never fires on thin history — nine runs is not a comparison', () => {
    expect(codes({ runs: paceSeries(3600, 3000).slice(0, 9) })).not.toContain('PACE_REGRESSION')
  })

  it('PACE_REGRESSION compares only inside the bucket of the run he just did', () => {
    // Ten regressed 10k-bucket runs, plus one half-bucket run on top. The newest run's bucket is
    // 'half', which holds one run, so there is nothing to compare and nothing fires.
    const withHalf = [
      run({ occurredOn: ASOF, distanceM: 21_100, durationSec: 7000 }),
      ...paceSeries(3600, 3000, addDays(ASOF, -1)),
    ]
    expect(codes({ runs: withHalf })).not.toContain('PACE_REGRESSION')
  })

  it('ACWR_SPIKE never fires without 28 days of history, however wild the week', () => {
    expect(codes({ runs: acwrRuns(20_000), firstRunOn: addDays(ASOF, -20) })).not.toContain(
      'ACWR_SPIKE',
    )
  })

  it('ACWR_SPIKE is high-side only — a taper is not a tough-love moment', () => {
    // 2 km acute against a 10 km weekly average is a ratio of 0.2: far outside the sweet spot,
    // and `isAcwrOutOfRange` would say so. This code deliberately does not.
    expect(codes({ runs: acwrRuns(2_000), firstRunOn: FIRST_RUN })).not.toContain('ACWR_SPIKE')
  })
})

describe('every fired pattern carries the raw reading Nina quotes', () => {
  it('REPEATED_LATE_START reports the MOST RECENT offending start, not a mean', () => {
    const p = fired({ runs: lateStarts(3) }, 'REPEATED_LATE_START')!
    // 07:22:00 as seconds past midnight — the exact value phase 2's fixture formats via `clock`.
    expect(p.value).toBe(26_520)
    expect(p.unit).toBe('clock')
    expect(p.severity).toBe('warn')
    expect(p.occurrences).toBe(3)
    expect(p.windowRuns).toBe(5)
  })

  it('REPEATED_HIGH_AVG_HR reports an unrounded percentage of max', () => {
    const p = fired({ runs: hotRuns(3, 181), hrMaxBpm: 200 }, 'REPEATED_HIGH_AVG_HR')!
    expect(p.value).toBeCloseTo(90.5, 10)
    expect(p.unit).toBe('percent')
    expect(p.severity).toBe('warn')
  })

  it('MISSED_USUAL_DAY reports days since the nearest miss, and counts usual-day slots', () => {
    const p = fired({ runs: [], usualRunningDays: [THURSDAY] }, 'MISSED_USUAL_DAY')!
    expect(p.value).toBe(7) // 2026-08-27 is seven days before asOf
    expect(p.unit).toBe('days')
    expect(p.severity).toBe('info')
    expect(p.occurrences).toBe(2)
    expect(p.windowRuns).toBe(2) // two Thursdays in the lookback, NOT two runs
  })

  it('PACE_REGRESSION reports the signed s/km delta, positive meaning slower now', () => {
    const p = fired({ runs: paceSeries(3151, 3000) }, 'PACE_REGRESSION')!
    expect(p.value).toBeCloseTo(15.1, 10)
    expect(p.unit).toBe('paceDelta')
    expect(p.severity).toBe('info')
  })

  it('ACWR_SPIKE reports the ratio as a percentage of his own weekly average', () => {
    const p = fired({ runs: acwrRuns(13_100), firstRunOn: FIRST_RUN }, 'ACWR_SPIKE')!
    expect(p.value).toBeCloseTo(131, 6)
    expect(p.unit).toBe('percent')
    expect(p.severity).toBe('warn')
    expect(p.occurrences).toBe(1) // runs inside the 7-day acute window
    expect(p.windowRuns).toBe(2) // runs inside the 28-day chronic window
  })

  it('every value is a raw number — this module formats nothing', () => {
    const all = evaluatePatterns({
      ...QUIET,
      runs: lateStarts(5),
      hrMaxBpm: 200,
      usualRunningDays: [THURSDAY],
    })
    expect(all.length).toBeGreaterThan(0)
    for (const p of all) expect(typeof p.value).toBe('number')
  })
})

describe('evaluatePatterns returns in PATTERN_CODES order', () => {
  it('a runner tripping several codes gets them in catalog order', () => {
    const runs = [
      ...lateStarts(3, '08:00:00').map((r) => ({ ...r, avgHr: 190 })),
      ...paceSeries(3600, 3000, addDays(ASOF, -5)),
    ]
    const got = evaluatePatterns({
      ...QUIET,
      runs,
      hrMaxBpm: 200,
      usualRunningDays: [THURSDAY],
      firstRunOn: FIRST_RUN,
    }).map((p) => p.code)
    const order = PATTERN_CODES.filter((c) => got.includes(c))
    expect(got).toEqual([...order])
  })
})
