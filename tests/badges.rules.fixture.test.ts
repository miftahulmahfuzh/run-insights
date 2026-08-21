import { describe, expect, it } from 'vitest'

import { BADGE_KEYS, BADGE_THRESHOLDS as T } from '@/lib/badges/catalog'
import {
  evaluateLifetimeBadges,
  evaluateMonthBadges,
  evaluateSessionBadges,
  evaluateWeekBadges,
  type SessionBadgeContext,
  type WindowRun,
} from '@/lib/badges/rules'
import { computeSessionMetrics } from '@/lib/metrics/session'
import type { SplitRow, ZoneRow } from '@/lib/metrics/types'
import { canonicalRecordRun, canonicalRunFacts, canonicalSession } from './fixtures/canonicalRun'

/**
 * **The canonical fixture, walked badge by badge** — roadmap §4.9's requirement in full: the whole
 * earned set, then one fires-test and one does-not-fire test for every one of the 22 keys.
 *
 * Thu 20 Aug 2026, Tangerang, 10.67 km in 1:18:36, started 07:07. Treated as **this account's
 * first-ever reviewed run**, consistent with `IMPLEMENTATION_PLAN.md` §4.1's own framing ("the very
 * first run analysed recorded an observed max of 189") and required for `tourist`, `new_ceiling` and
 * `long_way_home` to be checkable at all: a first run trivially holds every record and has been
 * nowhere before, in exactly the sense that a first purchase in a loyalty app is a real first
 * purchase. §6 takes the position that this is correct rather than a case to special-case away.
 *
 * **R-26: the earned set is seven, and `warmup_who` is not in it.** F09 hand-verified all the
 * predicates and contradicted the brief that produced the plan; km 1's average HR of 154 sits in
 * this run's own zone 3 (152–163), not zone 4. Refusing to move a threshold to match a brief is the
 * behaviour the reconciliation wanted more of, and the non-firing is asserted below so that a future
 * loosening of the rule fails here rather than passing quietly.
 */

const RUN_ID = canonicalSession.runId

/** Metrics for a perturbed version of the fixture. HRmax is null — no rule reads `avgHrPctMax`. */
function metricsFor(
  splits: readonly SplitRow[],
  zones: readonly ZoneRow[] = canonicalSession.zones,
) {
  return computeSessionMetrics({ ...canonicalSession, splits, zones }, null)
}

/** This run, as its own trailing-window entry. Decoupling is F06's +12.35%. */
const SELF: WindowRun = {
  runId: RUN_ID,
  distanceM: canonicalSession.distanceM,
  avgPaceSec: canonicalRecordRun.avgPaceSec,
  decouplingPct: metricsFor(canonicalSession.splits).decouplingPct,
}

/** The fixture as a session context: first-ever run, so both records just moved to it. */
const FIXTURE: SessionBadgeContext = {
  run: {
    runId: RUN_ID,
    occurredOn: canonicalSession.occurredOn,
    startedAt: canonicalRunFacts.startedAt,
    distanceM: canonicalSession.distanceM,
    activeKcal: canonicalRecordRun.activeKcal,
  },
  splits: canonicalSession.splits,
  zones: canonicalSession.zones,
  metrics: metricsFor(canonicalSession.splits),
  locationSeenBefore: false,
  runsOnThisDay: 1,
  isNewLongestDistance: true,
  isNewHighestMaxHr: true,
  window: [SELF],
}

function ctx(overrides: Partial<SessionBadgeContext>): SessionBadgeContext {
  return { ...FIXTURE, ...overrides, run: { ...FIXTURE.run, ...overrides.run } }
}

/** A window of `n` runs at the given distances and paces, newest first, all steady. */
function window(
  runs: Array<{ distanceM: number; avgPaceSec: number; decouplingPct?: number }>,
): WindowRun[] {
  return runs.map((r, i) => ({
    runId: `run${i}`,
    distanceM: r.distanceM,
    avgPaceSec: r.avgPaceSec,
    decouplingPct: r.decouplingPct ?? 2,
  }))
}

const uniform = (paceSec: number, kmOnePaceSec = paceSec): SplitRow[] =>
  Array.from({ length: 10 }, (_, i) => ({
    km: i + 1,
    timeSec: i === 0 ? kmOnePaceSec : paceSec,
    paceSec: i === 0 ? kmOnePaceSec : paceSec,
    hr: 150,
    cadence: 160,
    partial: false,
  }))

describe('the canonical fixture earns exactly seven badges (R-26)', () => {
  it('returns them in catalog order, and warmup_who is not among them', () => {
    expect(evaluateSessionBadges(FIXTURE)).toEqual([
      'late_start',
      'fast_start_fool',
      'redline_republic',
      'cadence_collapse',
      'tourist',
      'new_ceiling',
      'long_way_home',
    ])
  })

  it('earns nothing at week, month or lifetime scope on one run', () => {
    expect(
      evaluateWeekBadges({ weekKey: '2026-W34', runsThisWeek: 1, consecutiveQualifyingWeeks: 0 }),
    ).toEqual([])
    expect(evaluateMonthBadges({ monthKey: '2026-08', monthDistanceM: 10_670 })).toEqual([])
    expect(evaluateLifetimeBadges({ dawnRunCount: 0 })).toEqual([])
  })

  it('reproduces the roadmap’s own worked figures for the rules that fired', () => {
    const m = FIXTURE.metrics
    // The three numbers §4 quotes, straight out of F06: km 1 is 46.2 s faster than the full-km mean
    // of 442.2, the split drifted +40.8 s/km, and cadence faded 18 spm.
    const fullMean =
      canonicalSession.splits.filter((s) => !s.partial).reduce((a, s) => a + s.paceSec, 0) / 10
    expect(fullMean - 396).toBeCloseTo(46.2, 1)
    expect(m.splitDriftSecPerKm).toBeCloseTo(40.8, 1)
    expect(m.cadenceFadeSpm).toBe(-18)
    // Zone 5 is 1998 s of 4595 s zoned = 43.5%, over the 40% bar.
    expect(m.zonePct.find((z) => z.zone === 5)!.pct).toBeCloseTo(43.5, 1)
  })
})

describe('early_bird', () => {
  it('fires on a 05:15 start', () => {
    expect(
      evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, startedAt: '05:15:00' } })),
    ).toContain('early_bird')
  })
  it('does not fire on the fixture’s 07:07, nor one second past the window', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('early_bird')
    expect(
      evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, startedAt: '05:30:01' } })),
    ).not.toContain('early_bird')
  })
})

describe('late_start', () => {
  it('fires on the fixture’s 07:07', () => {
    expect(evaluateSessionBadges(FIXTURE)).toContain('late_start')
  })
  it('does not fire at 07:00 exactly — the rule is "after"', () => {
    expect(
      evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, startedAt: T.lateStartAfter } })),
    ).not.toContain('late_start')
  })
  it('does not fire when the screenshot carried no start time', () => {
    const keys = evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, startedAt: null } }))
    expect(keys).not.toContain('late_start')
    expect(keys).not.toContain('early_bird')
  })
})

describe('negative_split', () => {
  it('fires when the second half is faster', () => {
    const reversed = canonicalSession.splits
      .filter((s) => !s.partial)
      .map((s, i, all) => ({ ...s, paceSec: all[all.length - 1 - i]!.paceSec }))
    expect(
      evaluateSessionBadges(ctx({ splits: reversed, metrics: metricsFor(reversed) })),
    ).toContain('negative_split')
  })
  it('does not fire on the fixture’s +41 s/km positive split', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('negative_split')
  })
})

describe('metronome', () => {
  it('fires when every full km lands on the same pace', () => {
    const flat = uniform(440)
    expect(evaluateSessionBadges(ctx({ splits: flat, metrics: metricsFor(flat) }))).toContain(
      'metronome',
    )
  })
  it('does not fire at the fixture’s 24.7 s standard deviation', () => {
    expect(FIXTURE.metrics.paceSdSec).toBeCloseTo(24.7, 1)
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('metronome')
  })
})

describe('fast_start_fool', () => {
  it('fires on the fixture — 46 s of unearned optimism, then a positive split', () => {
    expect(evaluateSessionBadges(FIXTURE)).toContain('fast_start_fool')
  })
  it('does not fire when km 1’s lead is under 30 s, even on a positive split', () => {
    const nearlyEven = uniform(440, 435)
    const keys = evaluateSessionBadges(ctx({ splits: nearlyEven, metrics: metricsFor(nearlyEven) }))
    expect(keys).not.toContain('fast_start_fool')
  })
  it('does not fire when the fast opening was actually held — no positive split', () => {
    // Same 46 s lead as the fixture, but the run then got FASTER. That is a good run, and this
    // badge is not about a fast first kilometre; it is about one that wrote a cheque the rest could
    // not cash.
    const held: SplitRow[] = uniform(440, 394).map((s, i) =>
      i >= 5 ? { ...s, paceSec: 420, timeSec: 420 } : s,
    )
    expect(evaluateSessionBadges(ctx({ splits: held, metrics: metricsFor(held) }))).not.toContain(
      'fast_start_fool',
    )
  })
})

describe('redline_republic', () => {
  it('fires on the fixture’s 43.5% in zone 5', () => {
    expect(evaluateSessionBadges(FIXTURE)).toContain('redline_republic')
  })
  it('does not fire just under 40%', () => {
    const zones: ZoneRow[] = [
      { zone: 1, durationSec: 0, minBpm: null, maxBpm: 140 },
      { zone: 2, durationSec: 0, minBpm: 141, maxBpm: 151 },
      { zone: 3, durationSec: 0, minBpm: 152, maxBpm: 163 },
      { zone: 4, durationSec: 601, minBpm: 164, maxBpm: 174 },
      { zone: 5, durationSec: 399, minBpm: 175, maxBpm: null },
    ]
    expect(
      evaluateSessionBadges(ctx({ zones, metrics: metricsFor(canonicalSession.splits, zones) })),
    ).not.toContain('redline_republic')
  })
})

describe('sandbagger', () => {
  it('fires when the whole run stayed in zones 1 and 2', () => {
    const easy: ZoneRow[] = [
      { zone: 1, durationSec: 1200, minBpm: null, maxBpm: 140 },
      { zone: 2, durationSec: 900, minBpm: 141, maxBpm: 151 },
      { zone: 3, durationSec: 0, minBpm: 152, maxBpm: 163 },
      { zone: 4, durationSec: 0, minBpm: 164, maxBpm: 174 },
      { zone: 5, durationSec: 0, minBpm: 175, maxBpm: null },
    ]
    expect(
      evaluateSessionBadges(
        ctx({ zones: easy, metrics: metricsFor(canonicalSession.splits, easy) }),
      ),
    ).toContain('sandbagger')
  })
  it('does not fire on the fixture, where zones 3–5 hold 4466 of 4595 s', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('sandbagger')
  })
  it('does not fire on a run with no zone table at all — absent is not easy', () => {
    // Five zeros is not "no data"; it is a claim the run was effortless. An empty table must earn
    // nothing, which is the same rule F08 applies to the zone bar.
    expect(
      evaluateSessionBadges(ctx({ zones: [], metrics: metricsFor(canonicalSession.splits, []) })),
    ).not.toContain('sandbagger')
  })
})

describe('cadence_collapse', () => {
  it('fires on the fixture’s −18 spm', () => {
    expect(evaluateSessionBadges(FIXTURE)).toContain('cadence_collapse')
  })
  it('does not fire when cadence held', () => {
    const steady = uniform(440)
    expect(
      evaluateSessionBadges(ctx({ splits: steady, metrics: metricsFor(steady) })),
    ).not.toContain('cadence_collapse')
  })
  it('measures the fade to the last FULL km, so D14’s partial row cannot halve it', () => {
    // km 11 is 0.67 km at 145 spm. Reading `splits.at(-1)` instead of the last full km turns −18
    // into −9: exactly half, still negative, still plausible. That is the failure this asserts.
    expect(FIXTURE.metrics.cadenceFadeSpm).toBe(-18)
  })
})

describe('warmup_who (R-26)', () => {
  it('fires when km 1’s average HR reaches this run’s own zone 4 floor of 164', () => {
    const hot = canonicalSession.splits.map((s) => (s.km === 1 ? { ...s, hr: 165 } : s))
    expect(evaluateSessionBadges(ctx({ splits: hot, metrics: metricsFor(hot) }))).toContain(
      'warmup_who',
    )
  })
  it('does not fire on the fixture: km 1 averaged 154, which is this run’s zone 3', () => {
    // The predicate reads the run's OWN run_zones bounds (164–174 for zone 4), not a fixed bpm and
    // not a %HRmax band. 154/189 is 81%, which a textbook "zone 4 = 80–90%" would have caught — and
    // firing a badge that disagrees with the zone chart on the same screen is the worse failure.
    expect(canonicalSession.splits[0]!.hr).toBe(154)
    expect(canonicalSession.zones.find((z) => z.zone === 4)!.minBpm).toBe(164)
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('warmup_who')
  })
})

describe('groundhog_day', () => {
  it('fires when three consecutive runs land within 100 m of each other', () => {
    const keys = evaluateSessionBadges(
      ctx({
        window: window([
          { distanceM: 10_670, avgPaceSec: 442 },
          { distanceM: 10_600, avgPaceSec: 450 },
          { distanceM: 10_650, avgPaceSec: 460 },
        ]),
      }),
    )
    expect(keys).toContain('groundhog_day')
  })
  it('does not fire when the third run is 300 m away', () => {
    expect(
      evaluateSessionBadges(
        ctx({
          window: window([
            { distanceM: 10_670, avgPaceSec: 442 },
            { distanceM: 10_600, avgPaceSec: 450 },
            { distanceM: 10_300, avgPaceSec: 460 },
          ]),
        }),
      ),
    ).not.toContain('groundhog_day')
  })
  it('does not re-fire on a fourth identical loop — the edge, not the state', () => {
    // Five near-identical runs should earn this once, on the run that completes the pattern. The
    // fourth entry in the window exists purely so the rule can see that the pattern was already
    // complete one run ago.
    expect(
      evaluateSessionBadges(
        ctx({
          window: window([
            { distanceM: 10_670, avgPaceSec: 442 },
            { distanceM: 10_600, avgPaceSec: 450 },
            { distanceM: 10_650, avgPaceSec: 460 },
            { distanceM: 10_640, avgPaceSec: 455 },
          ]),
        }),
      ),
    ).not.toContain('groundhog_day')
  })
  it('does not fire before three runs exist', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('groundhog_day')
  })
})

describe('tourist', () => {
  it('fires on a location never logged before', () => {
    expect(evaluateSessionBadges(FIXTURE)).toContain('tourist')
  })
  it('does not fire on a familiar location', () => {
    expect(evaluateSessionBadges(ctx({ locationSeenBefore: true }))).not.toContain('tourist')
  })
  it('does not fire when the run has no location at all — blank is missing, not new', () => {
    expect(evaluateSessionBadges(ctx({ locationSeenBefore: null }))).not.toContain('tourist')
  })
})

describe('century_club and double_century', () => {
  it('fire at exactly 100 km and 200 km', () => {
    expect(evaluateMonthBadges({ monthKey: '2026-08', monthDistanceM: T.centuryM })).toEqual([
      'century_club',
    ])
    expect(evaluateMonthBadges({ monthKey: '2026-08', monthDistanceM: T.doubleCenturyM })).toEqual([
      'century_club',
      'double_century',
    ])
  })
  it('do not fire one metre short', () => {
    expect(evaluateMonthBadges({ monthKey: '2026-08', monthDistanceM: T.centuryM - 1 })).toEqual([])
    expect(
      evaluateMonthBadges({ monthKey: '2026-08', monthDistanceM: T.doubleCenturyM - 1 }),
    ).toEqual(['century_club'])
  })
})

describe('half_ish', () => {
  it('fires at 21.1 km', () => {
    expect(
      evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, distanceM: T.halfIshM } })),
    ).toContain('half_ish')
  })
  it('does not fire on the fixture’s 10.67 km', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('half_ish')
  })
})

describe('sweat_equity', () => {
  it('fires at 1000 active kcal', () => {
    expect(
      evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, activeKcal: T.sweatEquityKcal } })),
    ).toContain('sweat_equity')
  })
  it('does not fire on the fixture’s 646, nor when the field is missing', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('sweat_equity')
    expect(evaluateSessionBadges(ctx({ run: { ...FIXTURE.run, activeKcal: null } }))).not.toContain(
      'sweat_equity',
    )
  })
})

describe('new_ceiling and long_way_home read records, they do not re-derive them', () => {
  it('fire when the record moved to this run', () => {
    const keys = evaluateSessionBadges(FIXTURE)
    expect(keys).toContain('new_ceiling')
    expect(keys).toContain('long_way_home')
  })
  it('do not fire when the record stayed where it was', () => {
    const keys = evaluateSessionBadges(
      ctx({ isNewHighestMaxHr: false, isNewLongestDistance: false }),
    )
    expect(keys).not.toContain('new_ceiling')
    expect(keys).not.toContain('long_way_home')
  })
})

describe('self_reward', () => {
  it('fires at four runs in one ISO week', () => {
    expect(
      evaluateWeekBadges({ weekKey: '2026-W34', runsThisWeek: 4, consecutiveQualifyingWeeks: 1 }),
    ).toEqual(['self_reward'])
  })
  it('does not fire at three', () => {
    expect(
      evaluateWeekBadges({ weekKey: '2026-W34', runsThisWeek: 3, consecutiveQualifyingWeeks: 0 }),
    ).toEqual([])
  })
})

describe('consistency_gremlin', () => {
  it('fires at four consecutive qualifying weeks, and again at eight', () => {
    for (const weeks of [4, 8, 12]) {
      expect(
        evaluateWeekBadges({
          weekKey: '2026-W34',
          runsThisWeek: 4,
          consecutiveQualifyingWeeks: weeks,
        }),
      ).toContain('consistency_gremlin')
    }
  })
  it('does not fire at five, six or seven — it marks the fourth, not every one after it', () => {
    for (const weeks of [1, 2, 3, 5, 6, 7]) {
      expect(
        evaluateWeekBadges({
          weekKey: '2026-W34',
          runsThisWeek: 4,
          consecutiveQualifyingWeeks: weeks,
        }),
      ).not.toContain('consistency_gremlin')
    }
  })
})

describe('dawn_patrol', () => {
  it('fires at ten lifetime sub-06:00 starts', () => {
    expect(evaluateLifetimeBadges({ dawnRunCount: T.dawnRunCount })).toEqual(['dawn_patrol'])
  })
  it('does not fire at nine', () => {
    expect(evaluateLifetimeBadges({ dawnRunCount: T.dawnRunCount - 1 })).toEqual([])
  })
})

describe('two_a_days', () => {
  it('fires when a second reviewed run shares the day', () => {
    expect(evaluateSessionBadges(ctx({ runsOnThisDay: 2 }))).toContain('two_a_days')
  })
  it('does not fire on the fixture’s single run that day', () => {
    expect(evaluateSessionBadges(FIXTURE)).not.toContain('two_a_days')
  })
})

describe('boring_excellence', () => {
  const tight = [
    { distanceM: 10_000, avgPaceSec: 440, decouplingPct: 2.1 },
    { distanceM: 12_000, avgPaceSec: 445, decouplingPct: -3.4 },
    { distanceM: 8_000, avgPaceSec: 437, decouplingPct: 4.9 },
  ]

  it('fires on three runs within 10 s/km, all under 5% decoupling', () => {
    // Distance is deliberately all over the place: this badge is about pacing discipline, not
    // about running the same loop — that is `groundhog_day`'s job.
    expect(evaluateSessionBadges(ctx({ window: window(tight) }))).toContain('boring_excellence')
  })
  it('does not fire when one run drifted past 5%', () => {
    expect(
      evaluateSessionBadges(
        ctx({ window: window([...tight.slice(0, 2), { ...tight[2]!, decouplingPct: 6.2 }]) }),
      ),
    ).not.toContain('boring_excellence')
  })
  it('does not fire when the paces spread wider than 10 s/km', () => {
    expect(
      evaluateSessionBadges(
        ctx({ window: window([...tight.slice(0, 2), { ...tight[2]!, avgPaceSec: 425 }]) }),
      ),
    ).not.toContain('boring_excellence')
  })
  it('treats an uncomputable decoupling as disqualifying, not as zero', () => {
    // "We don't know" is not evidence of steadiness. A run with too few full-km splits to compute
    // Pa:Hr cannot be counted as a steady one.
    const unknown = window(tight).map((r, i) => (i === 1 ? { ...r, decouplingPct: null } : r))
    expect(evaluateSessionBadges(ctx({ window: unknown }))).not.toContain('boring_excellence')
  })
  it('does not re-fire while the streak merely continues', () => {
    const fourth = window([...tight, { distanceM: 9_000, avgPaceSec: 441, decouplingPct: 1.2 }])
    expect(evaluateSessionBadges(ctx({ window: fourth }))).not.toContain('boring_excellence')
  })
})

describe('§4.9’s coverage requirement, mechanically', () => {
  it('has a fires-test and a does-not-fire test for all 22 keys', () => {
    // The list this asserts against is the catalog itself, so adding a 23rd badge without adding
    // its pair of tests fails here rather than shipping untested.
    const tested = new Set([...Object.keys(FIRES), ...Object.keys(DOES_NOT_FIRE)])
    expect([...tested].sort()).toEqual([...BADGE_KEYS].sort())
    for (const key of BADGE_KEYS) {
      expect(FIRES[key], `${key} has no fires-case`).toBe(true)
      expect(DOES_NOT_FIRE[key], `${key} has no does-not-fire case`).toBe(true)
    }
  })
})

/* The bookkeeping the test above reads. Every describe block in this file registers its key here;
 * it is a manual index on purpose — a heuristic that scanned the describe titles would pass on a
 * block that named a badge and then asserted nothing about it. */
const FIRES: Record<string, boolean> = {
  early_bird: true,
  late_start: true,
  self_reward: true,
  negative_split: true,
  metronome: true,
  fast_start_fool: true,
  redline_republic: true,
  sandbagger: true,
  cadence_collapse: true,
  warmup_who: true,
  groundhog_day: true,
  tourist: true,
  century_club: true,
  double_century: true,
  half_ish: true,
  sweat_equity: true,
  new_ceiling: true,
  consistency_gremlin: true,
  dawn_patrol: true,
  long_way_home: true,
  two_a_days: true,
  boring_excellence: true,
}
const DOES_NOT_FIRE: Record<string, boolean> = { ...FIRES }
