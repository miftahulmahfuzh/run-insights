import { describe, expect, it } from 'vitest'

import {
  foldAwards,
  previousIsoWeek,
  qualifyingWeekStreak,
  runsOnDay,
  toWindowRun,
  totalDistanceM,
  weekRunCounts,
} from '@/lib/badges/facts'
import type { BadgeAward } from '@/lib/badges/types'
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

describe('foldAwards — F13, where the count comes from', () => {
  /** One ledger row. `createdAt` only ever matters as a same-day tie-break. */
  function award(over: Partial<BadgeAward> & { key: string; dedupeKey: string }): BadgeAward {
    return {
      runId: null,
      scopeKey: null,
      earnedOn: '2026-08-20',
      createdAt: new Date('2026-08-20T00:00:00Z'),
      count: 1,
      ...over,
    }
  }

  it('THE DEFECT: run A, run B, then a re-review of A — the count stays at 2', () => {
    // F12 §4.1 walked this and got 3, because `isNews` compared the incoming earn against the one
    // run the row remembered. Re-committing A cannot write a second (user, early_bird, A) row, so
    // there is nothing here to fold but the two that exist.
    const rows: BadgeAward[] = [
      award({ key: 'early_bird', dedupeKey: 'run_a', runId: 'run_a', earnedOn: '2026-07-04' }),
      award({ key: 'early_bird', dedupeKey: 'run_b', runId: 'run_b', earnedOn: '2026-08-20' }),
      // the re-review of A: `insertBadgeAward` returned false and wrote nothing
    ]
    expect(foldAwards(rows)).toEqual([
      {
        key: 'early_bird',
        runId: 'run_b',
        scopeKey: null,
        firstEarnedOn: '2026-07-04',
        earnedOn: '2026-08-20',
        count: 2,
      },
    ])
  })

  it('takes the first and latest days from the extremes, not from row order', () => {
    const rows = [
      award({ key: 'tourist', dedupeKey: 'r2', runId: 'r2', earnedOn: '2026-08-20' }),
      award({ key: 'tourist', dedupeKey: 'r3', runId: 'r3', earnedOn: '2026-05-01' }),
      award({ key: 'tourist', dedupeKey: 'r1', runId: 'r1', earnedOn: '2026-06-15' }),
    ]
    const [fold] = foldAwards(rows)
    expect(fold!.firstEarnedOn).toBe('2026-05-01')
    expect(fold!.earnedOn).toBe('2026-08-20')
    expect(fold!.runId).toBe('r2') // the row holding the latest day, whatever order it arrived in
  })

  it('SUMS the count column rather than counting rows — pre-F13 history survives', () => {
    // A row written before the migration carries the aggregate it had then. Counting rows would
    // silently delete four earnings off the user's shelf; summing preserves what happened.
    const rows = [
      award({ key: 'self_reward', dedupeKey: '2026-W30', scopeKey: '2026-W30', count: 5 }),
      award({ key: 'self_reward', dedupeKey: '2026-W34', scopeKey: '2026-W34' }),
    ]
    expect(foldAwards(rows)[0]!.count).toBe(6)
  })

  it('breaks a same-day tie on created_at, so the fold is deterministic', () => {
    const rows = [
      award({
        key: 'two_a_days',
        dedupeKey: 'morning',
        runId: 'morning',
        createdAt: new Date('2026-08-20T01:00:00Z'),
      }),
      award({
        key: 'two_a_days',
        dedupeKey: 'evening',
        runId: 'evening',
        createdAt: new Date('2026-08-20T13:00:00Z'),
      }),
    ]
    expect(foldAwards(rows)[0]!.runId).toBe('evening')
    expect(foldAwards([...rows].reverse())[0]!.runId).toBe('evening')
  })

  it('folds one entry per key and leaves a key with no rows absent', () => {
    const rows = [
      award({ key: 'late_start', dedupeKey: 'r1', runId: 'r1' }),
      award({ key: 'century_club', dedupeKey: '2026-08', scopeKey: '2026-08' }),
      award({ key: 'late_start', dedupeKey: 'r2', runId: 'r2', earnedOn: '2026-08-27' }),
    ]
    const folded = foldAwards(rows)
    // Absence is what `buildShelf` reads as "locked", so a zero row would light up 22 tiles.
    expect(folded.map((f) => f.key)).toEqual(['late_start', 'century_club'])
    expect(foldAwards([])).toEqual([])
  })

  it('carries the LATEST award’s scope key for a period badge', () => {
    const rows = [
      award({
        key: 'self_reward',
        dedupeKey: '2026-W30',
        scopeKey: '2026-W30',
        earnedOn: '2026-07-20',
      }),
      award({
        key: 'self_reward',
        dedupeKey: '2026-W34',
        scopeKey: '2026-W34',
        earnedOn: '2026-08-20',
      }),
    ]
    expect(foldAwards(rows)[0]!.scopeKey).toBe('2026-W34')
  })

  it('keeps a session award whose run was deleted — R-22 folded, not dropped', () => {
    // `badges.run_id` is ON DELETE SET NULL, so the row outlives the run with a null runId and its
    // dedupe_key intact. The badge still happened; the fold must still report it.
    const rows = [award({ key: 'half_ish', dedupeKey: 'deleted_run', runId: null })]
    expect(foldAwards(rows)).toEqual([
      {
        key: 'half_ish',
        runId: null,
        scopeKey: null,
        firstEarnedOn: '2026-08-20',
        earnedOn: '2026-08-20',
        count: 1,
      },
    ])
  })

  it('does not impose catalog order — that belongs to buildShelf and badgesForRun', () => {
    const rows = [
      award({ key: 'boring_excellence', dedupeKey: 'r1', runId: 'r1' }), // last in the catalog
      award({ key: 'early_bird', dedupeKey: 'r2', runId: 'r2' }), // first in the catalog
    ]
    expect(foldAwards(rows).map((f) => f.key)).toEqual(['boring_excellence', 'early_bird'])
  })
})
