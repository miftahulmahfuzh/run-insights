import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import {
  formatBpm,
  formatCadence,
  formatClock,
  formatDay,
  formatDistanceKm,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
  MISSING,
} from '@/lib/format'

/**
 * Roadmap §4.2, asserted rather than described. Seeded by F04 because the extraction hand-off
 * screen is the first thing in the app that renders a measurement; F08 owns the module and extends
 * it, and R-23 makes this the only place any of these decisions live.
 *
 * Every expected value below is read off the canonical fixture, so this doubles as a check that
 * the app renders THAT run the way the roadmap says it should.
 */

describe('distance — a period, always, and two decimals, always', () => {
  it('renders the fixture’s 10.67 km with a period, not Apple’s comma', () => {
    // Apple shows `10,67KM`. The extractor's job is parsing that comma; the UI's job is being
    // internally consistent in English (D10). Both decisions live in lib/format.ts.
    expect(formatDistanceKm(TRUTH.distanceKm)).toBe('10.67 km')
    expect(formatDistanceM(10_670)).toBe('10.67 km')
  })

  it('keeps two decimals even when they are zeros', () => {
    // `10 km` and `10.00 km` in the same column would break the tabular alignment the splits
    // table lives or dies on.
    expect(formatDistanceM(10_000)).toBe('10.00 km')
    expect(formatDistanceM(5_500)).toBe('5.50 km')
  })
})

describe('duration — h:mm:ss or m:ss, never 0:41:23', () => {
  it('renders the fixture’s 1:18:36', () => {
    expect(formatDuration(TRUTH.durationSec)).toBe('1:18:36')
  })

  it('drops the hours field when there are no hours', () => {
    expect(formatDuration(2_483)).toBe('41:23')
    expect(formatDuration(TRUTH.splits[0]!.timeSec)).toBe('6:36')
  })

  it('renders the zone durations the fixture shows as 1:44 and 0:25', () => {
    expect(formatDuration(104)).toBe('1:44')
    expect(formatDuration(25)).toBe('0:25')
  })
})

describe('pace — 7’22"', () => {
  it('renders the fixture’s 442 s/km', () => {
    expect(formatPace(TRUTH.avgPaceSecPerKm)).toBe('7\'22"')
    expect(formatPace(TRUTH.avgPaceSecPerKm, true)).toBe('7\'22"/km')
  })

  it('zero-pads the seconds', () => {
    // `7'2"` would misalign the column and read as seven-point-two.
    expect(formatPace(422)).toBe('7\'02"')
  })

  it('renders the fixture’s fastest and slowest kilometres', () => {
    expect(formatPace(396)).toBe('6\'36"') // km 1
    expect(formatPace(480)).toBe('8\'00"') // km 10
  })
})

describe('the remaining units', () => {
  it('matches §4.2 exactly for the fixture’s values', () => {
    expect(formatBpm(TRUTH.avgHrBpm)).toBe('173 bpm')
    expect(formatCadence(TRUTH.avgCadenceSpm)).toBe('144 spm')
    expect(formatKcal(TRUTH.activeKcal)).toBe('646 kcal')
    expect(formatElevation(TRUTH.elevationGainM)).toBe('15 m')
  })
})

describe('missing values', () => {
  it('renders an em dash rather than NaN, null or 0', () => {
    // A `0 bpm` for an absent heart rate is a lie; `NaN spm` is a bug on screen. Both are
    // reachable from a legitimately partial extraction, so every formatter degrades here.
    for (const format of [
      formatDistanceM,
      formatDistanceKm,
      formatDuration,
      formatPace,
      formatBpm,
      formatCadence,
      formatKcal,
      formatElevation,
    ]) {
      expect(format(null)).toBe(MISSING)
      expect(format(undefined)).toBe(MISSING)
      expect(format(Number.NaN)).toBe(MISSING)
    }
  })

  it('renders a real zero as a zero', () => {
    // 0 kcal and 0 m elevation are legitimate readings; only null means "not visible".
    expect(formatKcal(0)).toBe('0 kcal')
    expect(formatElevation(0)).toBe('0 m')
  })
})

describe('formatDay (F05 — the run date)', () => {
  it('renders the canonical fixture’s day', () => {
    expect(formatDay('2026-08-20')).toBe('Thu, 20 Aug 2026')
  })

  it('does NOT shift the day into the viewer’s timezone', () => {
    // `occurred_on` is a calendar day, already resolved to Asia/Jakarta at write time (D6).
    // Parsing it back through a local zone would subtract a day for anyone west of Jakarta.
    const previous = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(formatDay('2026-08-20')).toContain('20 Aug')
    } finally {
      process.env.TZ = previous
    }
  })

  it('degrades rather than rendering Invalid Date', () => {
    expect(formatDay(null)).toBe(MISSING)
    expect(formatDay('20 Aug')).toBe(MISSING)
  })
})

describe('formatClock', () => {
  it('narrows the time column back to what the screenshot printed', () => {
    expect(formatClock('07:07:00')).toBe('07:07')
    expect(formatClock(null)).toBe(MISSING)
  })
})
