import { describe, expect, it } from 'vitest'

import { factsHash } from '@/lib/llm/factsHash'
import {
  aggregatePeriodFlags,
  buildSessionFacts,
  buildTrendSincePrevious,
  buildWeekFacts,
  summarisePreviousInsight,
  type FlagFact,
  type RecentRunInput,
} from '@/lib/llm/facts'
import { computeSessionMetrics, evaluateSessionFlags, type Flag, type HrMax } from '@/lib/metrics'
import { canonicalRecordRun, canonicalSession } from './fixtures/canonicalRun'

/**
 * Tasks 7, 9 and 11.
 *
 * Task 7's assertion is deliberately mechanical: **every pinned value from roadmap §4.9 must
 * appear as a substring of the serialised fact object.** That is the proof that the "every number
 * you state must appear verbatim in the JSON" rule starts from a payload which actually carries
 * those numbers — before the model is involved at all. If the builder rounded `12.3` to `12` or
 * spelled a pace `7:22`, the model could not quote §4.9's numbers even if it wanted to, and every
 * downstream check of its honesty would be checking against the wrong reference.
 */

/** The fixture's own denominator: Tanaka on a 30-year-old is 208 − 0.7 × 30 = 187. */
const ESTIMATED_HR_MAX: HrMax = { bpm: 187, source: 'estimated' }
/** birthYear for an age of 30 as of the frozen `now` below. RU-1 added the last two fields. */
const NOW = new Date('2026-08-21T00:00:00Z')
const PROFILE = { birthYear: 1996, heightCm: 169, weightKg: 55, sex: 'male' as const }

function canonicalFacts(
  overrides: {
    intent?: 'easy' | 'tempo' | null
    recentRuns?: RecentRunInput[]
    /** RULING C5: the one override that exists to prove `facts_hash` moved with the payload. */
    profile?: typeof PROFILE
  } = {},
) {
  const metrics = computeSessionMetrics(canonicalSession, ESTIMATED_HR_MAX)
  const flags = evaluateSessionFlags(
    metrics,
    canonicalSession.splits.find((s) => !s.partial) ?? null,
  )

  return buildSessionFacts({
    run: {
      occurredOn: canonicalSession.occurredOn,
      distanceM: canonicalSession.distanceM,
      durationSec: canonicalSession.durationSec,
      avgPaceSec: canonicalRecordRun.avgPaceSec,
      avgHr: canonicalSession.avgHrBpm,
      maxHr: canonicalRecordRun.maxHr,
      avgCadence: canonicalRecordRun.avgCadence,
      elevationM: canonicalRecordRun.elevationM,
      activeKcal: canonicalRecordRun.activeKcal,
      intent: overrides.intent === undefined ? null : overrides.intent,
    },
    metrics,
    flags,
    splits: canonicalSession.splits,
    profile: overrides.profile ?? PROFILE,
    recentRuns: overrides.recentRuns,
    promptVersion: 1,
    now: NOW,
  })
}

/**
 * Three earlier runs, newest first, as `getReviewedRunsBefore` returns them. The canonical
 * session is 2026-08-20, so the gaps below are 6, 13 and 191 days — the last one deliberately a
 * layoff, because F28 chose a count with NO calendar bound and the row that a bound would have
 * hidden is the one worth pinning.
 */
const RECENT: RecentRunInput[] = [
  {
    occurredOn: '2026-08-14',
    distanceM: 8020,
    durationSec: 3300,
    avgPaceSec: 411,
    avgHr: 168,
    intent: 'easy',
    zones: [
      { zone: 2, durationSec: 1200 },
      { zone: 3, durationSec: 1800 },
      { zone: 4, durationSec: 300 },
    ],
  },
  {
    occurredOn: '2026-08-07',
    distanceM: 10_050,
    durationSec: 4100,
    avgPaceSec: 408,
    avgHr: null,
    intent: null,
    zones: [],
  },
  {
    occurredOn: '2026-02-10',
    distanceM: 5000,
    durationSec: 1800,
    avgPaceSec: 360,
    avgHr: 175,
    intent: 'race',
    zones: [{ zone: 5, durationSec: 1800 }],
  },
]

describe('buildSessionFacts — the canonical run', () => {
  const facts = canonicalFacts()
  const serialised = JSON.stringify(facts)

  it('carries every §4.9 pinned value verbatim', () => {
    // decoupling +12.3%, drift +41 s/km, cadence fade −18 spm, Z4+Z5 90.6%, pace sd 24.7 s
    expect(facts.computed.aerobicDecouplingPct).toBe(12.3)
    expect(facts.computed.firstToSecondHalfDriftSecPerKm).toBe(41)
    expect(facts.computed.cadenceFadeSpm).toBe(-18)
    expect(facts.computed.percentTimeInZone4And5).toBe(90.6)
    expect(facts.computed.paceStdDevSec).toBe(24.7)

    for (const pinned of ['12.3', '41', '-18', '90.6', '24.7', '92.5']) {
      expect(serialised).toContain(pinned)
    }
  })

  it('formats every string through lib/format.ts, so the model reads what the runner reads', () => {
    expect(facts.session.duration).toBe('1:18:36')
    expect(facts.session.avgPace).toBe(`7'22"/km`)
    expect(facts.session.date).toBe('Thu, 20 Aug 2026')
    expect(facts.computed.fastestKm).toEqual({ km: 1, pace: `6'36"` })
    expect(facts.computed.slowestKm).toEqual({ km: 10, pace: `8'00"` })
  })

  it('labels the HRmax it divided by, with its source', () => {
    expect(facts.profile.hrMax).toEqual({ bpm: 187, source: 'estimated' })
    expect(facts.computed.avgHrPctOfMax).toBe(92.5)
  })

  it('derives age from birth_year and never stores it', () => {
    expect(facts.profile.age).toBe(30)
    expect(facts.profile.heightCm).toBe(169)
  })

  it('carries exactly five profile keys — the payload shape, pinned', () => {
    // RULING C5 widened BOTH the input type (`NarrativeProfile`) and the output (`ProfileFacts`),
    // so the payload now carries weight and sex and `facts_hash` moved with them. Five keys, not
    // three. This is the assertion to change if the payload's shape is ever revisited — and the
    // one that fails if somebody narrows the type back without reading the ruling.
    expect(Object.keys(facts.profile).sort()).toEqual([
      'age',
      'heightCm',
      'hrMax',
      'sex',
      'weightKg',
    ])
  })

  it('CARRIES body weight and sex — D15/R-28 repealed, RU-1 and RULING C5', () => {
    // This test asserted the opposite until v0.2.0, and the inversion is the point of the repeal:
    // "exposing user details like weight to ai analysis will 100% make the analysis much more
    // accurate". Both values are in the serialised payload, labelled self-reported by the prompt.
    expect(facts.profile.weightKg).toBe(55)
    expect(facts.profile.sex).toBe('male')
    expect(serialised).toContain('weightKg')
  })

  it('a different weight is a different facts_hash, which is why every insight regenerates', () => {
    // RULING C5's accepted consequence, pinned. `ProfileFacts` is inside the hashed object, so
    // adding the field moved every existing key. If this ever passes with the two hashes equal,
    // weight is in the type but not in the payload — the exact half-repeal C5 overruled.
    const a = canonicalFacts()
    const b = canonicalFacts({ profile: { ...PROFILE, weightKg: 61 } })
    expect(factsHash(a)).not.toBe(factsHash(b))
  })

  it('includes all eleven splits, with the partial one flagged (D14)', () => {
    expect(facts.splits).toHaveLength(11)
    expect(facts.splits.filter((s) => s.partial)).toHaveLength(1)
    expect(facts.splits.at(-1)).toMatchObject({ km: 11, partial: true })
  })

  it('carries the six flags the fixture fires, and coins none of its own', () => {
    expect(facts.flags.map((f) => f.code).sort()).toEqual([
      'CADENCE_FADE',
      'FAST_START',
      'HIGH_DECOUPLING',
      'POSITIVE_SPLIT',
      'TOO_MUCH_HARD',
      'VERY_HIGH_AVG_HR',
    ])
  })

  it('carries five zone rows summing to ~100%', () => {
    expect(facts.computed.zoneBreakdown).toHaveLength(5)
    const total = facts.computed.zoneBreakdown.reduce((sum, z) => sum + z.pct, 0)
    expect(total).toBeGreaterThan(99.5)
    expect(total).toBeLessThan(100.5)
  })
})

/**
 * F28 / card #36. The production failure this replaces: the narrator saw `runsPerWeek` and
 * nothing else, and spent three of its four prose fields saying "once a week". These assertions
 * are about the payload half of the fix — that the history exists, that the model can read the
 * spacing off it without doing arithmetic, and that adding it misses the cache.
 */
describe('recentRuns — the history the narrator reads (F28)', () => {
  const facts = canonicalFacts({ recentRuns: RECENT })

  it('is empty, never null, when there is no earlier reviewed run', () => {
    expect(canonicalFacts().recentRuns).toEqual([])
  })

  it('keeps the query order — newest first, so daysBefore ascends', () => {
    expect(facts.recentRuns.map((r) => r.daysBefore)).toEqual([6, 13, 191])
  })

  it('precomputes the gap rather than leaving date arithmetic to the model', () => {
    // HARD RULE #1 is "do NOT compute new numbers". A payload of bare dates would be asking the
    // model to break it in order to say anything at all about frequency.
    expect(facts.recentRuns[0]).toMatchObject({ date: 'Fri, 14 Aug 2026', daysBefore: 6 })
    expect(facts.recentRuns[2]).toMatchObject({ date: 'Tue, 10 Feb 2026', daysBefore: 191 })
  })

  it('formats through lib/format.ts, exactly as the session block does', () => {
    expect(facts.recentRuns[0]).toMatchObject({
      distanceKm: 8.02,
      duration: '55:00',
      avgPace: `6'51"/km`,
      avgHr: 168,
      intent: 'easy',
    })
  })

  it('reduces zone durations to one hard share, rounded like every other percentage', () => {
    // 300 / 3300 = 9.0909…%, and the 300 s in zone 4 is the only hard time in that run.
    expect(facts.recentRuns[0]!.percentTimeInZone4And5).toBe(9.1)
    expect(facts.recentRuns[2]!.percentTimeInZone4And5).toBe(100)
  })

  it('reports no hard share at all when a run carries no zone rows', () => {
    // null, never 0 — "no time above zone 3" and "this watch recorded no zones" must not read
    // the same, which is R-9's rule one metric over.
    expect(facts.recentRuns[1]!.percentTimeInZone4And5).toBeNull()
  })

  it('carries no splits for an earlier run — §1.1 admits one full child inclusion, and this run spends it', () => {
    for (const recent of facts.recentRuns) {
      expect(recent).not.toHaveProperty('splits')
    }
    expect(facts.splits).toHaveLength(11)
  })

  it('changes facts_hash, so every cached insight re-narrates with the history', () => {
    expect(factsHash(canonicalFacts())).not.toBe(factsHash(facts))
  })

  it('changes facts_hash when the history itself moves', () => {
    expect(factsHash(canonicalFacts({ recentRuns: RECENT.slice(0, 2) }))).not.toBe(factsHash(facts))
    // Order is meaningful here for the same reason it is for splits: reversing it would tell the
    // model the layoff was last week.
    expect(factsHash(canonicalFacts({ recentRuns: [...RECENT].reverse() }))).not.toBe(
      factsHash(facts),
    )
  })

  it('still carries weight and sex with the history attached', () => {
    expect(JSON.stringify(facts).toLowerCase()).toContain('weightkg')
  })
})

describe('the intent write-back invalidates the cache (Task 11)', () => {
  it('changes facts_hash when the runner answers "tempo"', () => {
    const unanswered = factsHash(canonicalFacts({ intent: null }))
    const answered = factsHash(canonicalFacts({ intent: 'tempo' }))

    expect(unanswered).not.toBe(answered)
  })

  it('is stable when nothing is answered — two builds of the same run are one cache entry', () => {
    expect(factsHash(canonicalFacts())).toBe(factsHash(canonicalFacts()))
  })
})

describe('buildTrendSincePrevious (Task 9)', () => {
  const flag = (code: string): FlagFact => ({ code, severity: 'warn', value: 1 })

  it('partitions into new, resolved and persisting', () => {
    const trend = buildTrendSincePrevious(
      [flag('TOO_MUCH_HARD'), flag('CADENCE_FADE')],
      [flag('CADENCE_FADE'), flag('SLOW_HR_RECOVERY')],
      40,
      32,
      430,
      445,
    )

    expect(trend.flagsNew).toEqual(['TOO_MUCH_HARD'])
    expect(trend.flagsResolved).toEqual(['SLOW_HR_RECOVERY'])
    expect(trend.flagsPersisting).toEqual(['CADENCE_FADE'])
    expect(trend.volumeDeltaPct).toBe(25)
    expect(trend.paceDeltaSecPerKmAtMatchedDistance).toBe(-15)
  })

  it('sorts the lists, so run order cannot change the hash', () => {
    const one = buildTrendSincePrevious(
      [flag('B'), flag('A'), flag('C')],
      [flag('A')],
      10,
      10,
      null,
      null,
    )
    const other = buildTrendSincePrevious(
      [flag('C'), flag('A'), flag('B')],
      [flag('A')],
      10,
      10,
      null,
      null,
    )
    expect(one.flagsNew).toEqual(['B', 'C'])
    expect(factsHash(one)).toBe(factsHash(other))
  })

  it('reports no volume delta against a zero or absent previous period', () => {
    expect(buildTrendSincePrevious([], [], 40, 0, null, null).volumeDeltaPct).toBeNull()
    expect(buildTrendSincePrevious([], [], 40, null, null, null).volumeDeltaPct).toBeNull()
  })

  it('reports no pace delta unless BOTH sides have a matched-distance pace', () => {
    expect(
      buildTrendSincePrevious([], [], 40, 30, 430, null).paceDeltaSecPerKmAtMatchedDistance,
    ).toBeNull()
    expect(
      buildTrendSincePrevious([], [], 40, 30, null, 430).paceDeltaSecPerKmAtMatchedDistance,
    ).toBeNull()
  })
})

describe('buildWeekFacts', () => {
  const base = {
    isoWeek: '2026-W34',
    profile: PROFILE,
    hrMax: ESTIMATED_HR_MAX,
    runCount: 4,
    volumeM: 42_300,
    longestRunM: 15_000,
    z1z2SharePct: 12.34,
    acuteChronicRatio: 1.4212,
    comparablePaceSecPerKm: 430,
    comparableBucket: '10k' as const,
    previousWeek: { volumeM: 36_000, runCount: 3, comparablePaceSecPerKm: 445 },
    previousInsight: null,
    previousFlags: [],
    flags: [] as FlagFact[],
    promptVersion: 1,
    now: NOW,
  }

  it('converts metres to kilometres and rounds percentages to one decimal', () => {
    const facts = buildWeekFacts(base)
    expect(facts.week.volumeKm).toBe(42.3)
    expect(facts.week.longestRunKm).toBe(15)
    expect(facts.week.zone1And2Pct).toBe(12.3)
    expect(facts.week.acuteChronicRatio).toBe(1.4)
    expect(facts.week.avgPaceAtComparableDistance).toBe(`7'10"/km`)
    expect(facts.previousWeek).toEqual({ volumeKm: 36, runCount: 3 })
  })

  it('omits the trend entirely when there is no previous insight to not repeat', () => {
    expect(buildWeekFacts(base).trendSincePrevious).toBeNull()
  })

  it('builds the trend once a previous insight exists', () => {
    const facts = buildWeekFacts({
      ...base,
      previousInsight: {
        scopeKey: '2026-W33',
        headline: 'Last week',
        doNext: ['Cap easy runs at zone 2'],
        createdAt: '2026-08-17T00:00:00.000Z',
      },
      flags: [{ code: 'TOO_MUCH_HARD', severity: 'warn', value: 91 }],
      previousFlags: [{ code: 'TOO_MUCH_HARD', severity: 'warn', value: 88 }],
    })

    expect(facts.trendSincePrevious?.flagsPersisting).toEqual(['TOO_MUCH_HARD'])
    expect(facts.trendSincePrevious?.volumeDeltaPct).toBe(17.5)
    expect(facts.trendSincePrevious?.paceDeltaSecPerKmAtMatchedDistance).toBe(-15)
  })

  it('carries weight and sex into the WEEK payload too — one builder, three scopes', () => {
    const facts = buildWeekFacts(base)
    expect(facts.profile.weightKg).toBe(55)
    expect(facts.profile.sex).toBe('male')
  })
})

describe('aggregatePeriodFlags', () => {
  const f = (code: string, value: number): Flag => ({
    code: code as Flag['code'],
    severity: 'warn',
    value,
  })

  it('dedupes to the WORST value, by magnitude, so a negative fade is not beaten by zero', () => {
    const out = aggregatePeriodFlags([
      [f('CADENCE_FADE', -9), f('TOO_MUCH_HARD', 72)],
      [f('CADENCE_FADE', -18)],
      [f('TOO_MUCH_HARD', 90.6)],
    ])

    expect(out).toEqual([
      { code: 'CADENCE_FADE', severity: 'warn', value: -18 },
      { code: 'TOO_MUCH_HARD', severity: 'warn', value: 90.6 },
    ])
  })

  it('is sorted by code, so two identical weeks hash identically', () => {
    const a = aggregatePeriodFlags([[f('TOO_MUCH_HARD', 90)], [f('CADENCE_FADE', -18)]])
    const b = aggregatePeriodFlags([[f('CADENCE_FADE', -18)], [f('TOO_MUCH_HARD', 90)]])
    expect(factsHash(a)).toBe(factsHash(b))
  })

  it('merges in period-scoped codes F06 owns', () => {
    const out = aggregatePeriodFlags(
      [[f('TOO_MUCH_HARD', 90)]],
      [{ code: 'ACWR_OUT_OF_RANGE', severity: 'warn', value: 1.44 }],
    )
    expect(out.map((x) => x.code)).toEqual(['ACWR_OUT_OF_RANGE', 'TOO_MUCH_HARD'])
  })

  it('returns nothing for a period with no runs', () => {
    expect(aggregatePeriodFlags([])).toEqual([])
  })
})

describe('summarisePreviousInsight', () => {
  const createdAt = new Date('2026-08-17T02:00:00.000Z')

  it('reduces a stored payload to headline, doNext and a timestamp', () => {
    expect(
      summarisePreviousInsight({
        scopeKey: '2026-W33',
        createdAt,
        payload: {
          headline: 'Three hard runs in a row',
          whatHappened: 'ignored',
          doNext: ['Take an easy day', ''],
        },
      }),
    ).toEqual({
      scopeKey: '2026-W33',
      headline: 'Three hard runs in a row',
      doNext: ['Take an easy day'],
      createdAt: '2026-08-17T02:00:00.000Z',
    })
  })

  it('degrades to null rather than throwing on a row it does not recognise', () => {
    expect(summarisePreviousInsight(null)).toBeNull()
    expect(summarisePreviousInsight({ scopeKey: 'w', createdAt, payload: null })).toBeNull()
    expect(summarisePreviousInsight({ scopeKey: 'w', createdAt, payload: 'nonsense' })).toBeNull()
    expect(summarisePreviousInsight({ scopeKey: 'w', createdAt, payload: {} })).toBeNull()
  })
})
