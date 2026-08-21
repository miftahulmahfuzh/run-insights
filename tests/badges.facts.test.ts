import { describe, expect, it } from 'vitest'

import {
  previousIsoWeek,
  qualifyingWeekStreak,
  runsOnDay,
  toWindowRun,
  totalDistanceM,
  weekRunCounts,
} from '@/lib/badges/facts'
import { canonicalRecordRun, canonicalSession } from './fixtures/canonicalRun'

/**
 * The pure fact-builders — the arithmetic `gateway.ts` deliberately does not contain, so that all of
 * it is testable without a database.
 */

describe('toWindowRun', () => {
  it('carries F06’s decoupling rather than a second implementation of it', () => {
    // +12.35% on the canonical fixture. `research/control.mjs` handed glm-5.3 these exact splits and
    // the exact formula and got −14.1% — the sign backwards — which is why no badge rule is allowed
    // to compute this itself (D2).
    const entry = toWindowRun(
      {
        id: canonicalSession.runId,
        occurredOn: canonicalSession.occurredOn,
        distanceM: canonicalSession.distanceM,
        durationSec: canonicalSession.durationSec,
        avgHr: canonicalSession.avgHrBpm,
        avgPaceSec: canonicalRecordRun.avgPaceSec,
      },
      canonicalSession.splits,
    )
    expect(entry.decouplingPct).toBeCloseTo(12.35, 2)
    expect(entry.distanceM).toBe(10_670)
    expect(entry.avgPaceSec).toBe(442)
  })

  it('reports a null decoupling for a run with one full km, rather than 0', () => {
    const entry = toWindowRun(
      {
        id: 'r1',
        occurredOn: '2026-08-20',
        distanceM: 1000,
        durationSec: 400,
        avgHr: 150,
        avgPaceSec: 400,
      },
      [{ km: 1, timeSec: 400, paceSec: 400, hr: 150, cadence: 160, partial: false }],
    )
    // 0 would read as "perfectly steady" and would qualify for `boring_excellence`.
    expect(entry.decouplingPct).toBeNull()
  })
})

describe('weekRunCounts and runsOnDay', () => {
  const runs = [
    { occurredOn: '2026-08-17', distanceM: 5000 }, // 2026-W34, Monday
    { occurredOn: '2026-08-20', distanceM: 10_670 },
    { occurredOn: '2026-08-20', distanceM: 4000 },
    { occurredOn: '2026-08-24', distanceM: 8000 }, // 2026-W35
  ]

  it('buckets by ISO week', () => {
    expect(Object.fromEntries(weekRunCounts(runs))).toEqual({ '2026-W34': 3, '2026-W35': 1 })
  })

  it('counts a two-a-day', () => {
    expect(runsOnDay(runs, '2026-08-20')).toBe(2)
    expect(runsOnDay(runs, '2026-08-21')).toBe(0)
  })

  it('sums metres exactly, because they are integers (D5)', () => {
    expect(totalDistanceM(runs)).toBe(27_670)
    expect(totalDistanceM([])).toBe(0)
  })
})

describe('previousIsoWeek', () => {
  it('walks back one week', () => {
    expect(previousIsoWeek('2026-W34')).toBe('2026-W33')
  })
  it('crosses the ISO year boundary by walking the calendar, not the week number', () => {
    // 2026-W01 begins on 2025-12-29, so the week before it is 2025's LAST week — 2025-W52, since
    // 2025 is a 52-week ISO year. Decrementing the week number would have produced '2026-W00'.
    expect(previousIsoWeek('2026-W01')).toBe('2025-W52')
  })
})

describe('qualifyingWeekStreak', () => {
  const counts = new Map([
    ['2026-W34', 4],
    ['2026-W33', 5],
    ['2026-W32', 4],
    ['2026-W31', 2], // the break
    ['2026-W30', 4],
  ])

  it('counts consecutive qualifying weeks back from the anchor', () => {
    expect(qualifyingWeekStreak(counts, '2026-W34', 4, 26)).toBe(3)
  })

  it('returns 0 when the anchor week itself misses', () => {
    // Not "the last streak I had" — the streak has to end at the week being asked about, or
    // `consistency_gremlin` would fire on a week the runner did nothing in.
    expect(qualifyingWeekStreak(counts, '2026-W31', 4, 26)).toBe(0)
  })

  it('stops at the break rather than skipping it', () => {
    expect(qualifyingWeekStreak(counts, '2026-W30', 4, 26)).toBe(1)
  })

  it('never reports more than the lookback it was given', () => {
    // The guard the gateway's STREAK_LOOKBACK_WEEKS depends on: a streak longer than the fetched
    // window must not be reported as the window's length and then fire on a boundary artefact.
    const long = new Map(Array.from({ length: 8 }, (_, i) => [`2026-W${30 - i}`, 4] as const))
    expect(qualifyingWeekStreak(long, '2026-W30', 4, 3)).toBe(3)
  })

  it('treats a missing week as a break, not as a zero-run week to skip', () => {
    expect(qualifyingWeekStreak(new Map([['2026-W34', 4]]), '2026-W34', 4, 26)).toBe(1)
  })
})
