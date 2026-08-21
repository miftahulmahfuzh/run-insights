import { describe, expect, it } from 'vitest'

import { computeSessionMetrics } from '@/lib/metrics/session'
import type { HrMax } from '@/lib/metrics/hrMax'
import type { SessionInput, SplitRow } from '@/lib/metrics/types'
import { canonicalSession } from './fixtures/canonicalRun'

/**
 * Every row of F06 plan §3.6's acceptance table, pinned to the canonical fixture's hand-verified
 * numbers — plus the three "wrong" values that a D14-blind implementation produces instead.
 *
 * The exact constants are the point. "cadence fade is negative" passes against −9, which is
 * exactly half the truth and looks entirely plausible on a chart.
 */

/**
 * R-3: the canonical run's own `max_hr` of 189 COUNTS toward its own %HRmax. F06's plan asked for
 * a resolver that excluded it so the fixture would score 92.5% against the Tanaka estimate of 187;
 * the reconciliation ruled the other way, and the reasoning is worth restating here because this
 * is the one constant most likely to be "corrected" back:
 *
 *   173 / 189 = 91.53%  — the ceiling this runner's watch actually recorded, in this run
 *   173 / 187 = 92.51%  — a formula estimate the same screenshot disproves
 *
 * §4.4 resolves observed-first, never formula-first. Scoring against a contradicted estimate is
 * not conservatism, it is ignoring the evidence on screen. `resolveHrMaxExcludingRun` still ships,
 * for F09's `new_ceiling` badge — "did this beat the previous best" genuinely needs the previous
 * best — but never for a run's own metrics.
 */
const OBSERVED_189: HrMax = {
  bpm: 189,
  source: 'observed',
  observedRunId: canonicalSession.runId,
  observedOn: '2026-08-20',
}

const m = computeSessionMetrics(canonicalSession, OBSERVED_189)

describe('computeSessionMetrics — the canonical fixture', () => {
  it('avg HR %max — 91.5% against the observed 189 (R-3)', () => {
    expect(m.avgHrPctMax).toBeCloseTo(91.53, 2)
    expect(m.hrMaxUsed).toEqual(OBSERVED_189)
  })

  it('avg HR %max carries the estimate through unchanged when that is what resolved', () => {
    const estimated = computeSessionMetrics(canonicalSession, { bpm: 187, source: 'estimated' })
    expect(estimated.avgHrPctMax).toBeCloseTo(92.51, 2)
    expect(estimated.hrMaxUsed?.source).toBe('estimated')
  })

  it('aerobic decoupling — +12.3%, and POSITIVE', () => {
    // glm-5.3 returned −14.1 for this exact input when asked to compute it (D2). The sign is the
    // whole story: this run's aerobic system gave way, it did not hold.
    expect(m.decouplingPct).toBeCloseTo(12.3466, 3)
    expect(m.decouplingPct!).toBeGreaterThan(0)
  })

  it('positive split drift — +40.8 s/km', () => {
    expect(m.splitDriftSecPerKm).toBeCloseTo(40.8, 6)
  })

  it('pace consistency — population sd 24.7 s', () => {
    expect(m.paceSdSec).toBeCloseTo(24.72, 2)
  })

  it('cadence fade — −18 spm', () => {
    expect(m.cadenceFadeSpm).toBe(-18)
  })

  it('fastest km — km 1 at 396 s (6ʹ36ʺ)', () => {
    expect(m.fastestKm).toEqual({ km: 1, paceSec: 396 })
  })

  it('slowest km — km 10 at 480 s (8ʹ00ʺ)', () => {
    expect(m.slowestKm).toEqual({ km: 10, paceSec: 480 })
  })

  it('zone distribution — Z4 47.1%, Z5 43.5%, hard 90.6%', () => {
    expect(m.zonePct).toHaveLength(5)
    expect(m.zonePct[3]!.pct).toBeCloseTo(47.12, 2)
    expect(m.zonePct[4]!.pct).toBeCloseTo(43.48, 2)
    expect(m.hardPct).toBeCloseTo(90.6, 1)
  })

  it('zone percentages are RAW floats, never pre-rounded', () => {
    // A rounded 47 stored here would let a hardPct of 89.6 round its way past TOO_MUCH_HARD's 70
    // in some other run. Thresholds compare raw; roundSharesTo100 is the caller's display step.
    expect(Number.isInteger(m.zonePct[3]!.pct)).toBe(false)
  })

  it('HR recovery at 1 minute — 23 bpm (R-9’s two columns)', () => {
    expect(m.hrRecovery1MinBpm).toBe(23)
  })

  it('reports how many full kilometres fed the split maths', () => {
    expect(m.fullSplitCount).toBe(10) // eleven rows, one partial
  })
})

describe('D14 — the partial kilometre is excluded, and here is what happens if it is not', () => {
  it('cadence fade is NOT −9, the value `splits.at(-1)` produces', () => {
    // km 11's cadence is 145, not 136. Indexing the raw array gives exactly half the true fade —
    // still negative, still plausible, wrong by a factor of two.
    expect(m.cadenceFadeSpm).not.toBe(-9)
    expect(m.cadenceFadeSpm).toBe(-18)
  })

  it('split drift is NOT +35.2, the value an unfiltered half-split produces', () => {
    // floor(11/2) = 5 puts km 6..11 in the second half, diluting it with the partial row.
    expect(m.splitDriftSecPerKm).not.toBeCloseTo(35.2, 1)
  })

  it('decoupling is NOT +11.87, the value the partial row dilutes it to', () => {
    expect(m.decouplingPct).not.toBeCloseTo(11.874, 2)
  })

  it('the partial row is still visible in the input — excluded from stats, not deleted', () => {
    // It belongs in the splits table on screen. D14 is an aggregation rule, not a filter at the
    // query layer, and F03's schema comment says the same thing from the other side.
    expect(canonicalSession.splits).toHaveLength(11)
    expect(canonicalSession.splits.at(-1)!.partial).toBe(true)
  })
})

describe('degenerate runs return null, never NaN', () => {
  const base = (splits: SplitRow[]): SessionInput => ({
    runId: 'r_short',
    occurredOn: '2026-08-21',
    distanceM: 900,
    durationSec: 400,
    avgHrBpm: 150,
    splits,
    zones: [],
    recovery: null,
  })

  it('a run that is entirely one partial kilometre', () => {
    const out = computeSessionMetrics(
      base([{ km: 1, timeSec: 288, paceSec: 429, hr: 150, cadence: 160, partial: true }]),
      OBSERVED_189,
    )
    expect(out.fullSplitCount).toBe(0)
    expect(out.decouplingPct).toBeNull()
    expect(out.splitDriftSecPerKm).toBeNull()
    expect(out.paceSdSec).toBeNull()
    expect(out.cadenceFadeSpm).toBeNull()
    expect(out.fastestKm).toBeNull()
    expect(out.slowestKm).toBeNull()
  })

  it('a single full kilometre — halving it would divide by zero', () => {
    const out = computeSessionMetrics(
      base([{ km: 1, timeSec: 400, paceSec: 400, hr: 150, cadence: 160, partial: false }]),
      OBSERVED_189,
    )
    expect(out.fullSplitCount).toBe(1)
    expect(out.decouplingPct).toBeNull()
    expect(out.splitDriftSecPerKm).toBeNull()
    expect(out.paceSdSec).toBeNull()
    // Cadence fade only needs one row: first and last are the same km, so the fade is 0.
    expect(out.cadenceFadeSpm).toBe(0)
    expect(out.fastestKm).toEqual({ km: 1, paceSec: 400 })
  })

  it('a run with no zone rows reports null hardPct, not 0%', () => {
    const out = computeSessionMetrics(base([]), OBSERVED_189)
    expect(out.zonePct).toEqual([])
    // 0% hard would read as "an entirely easy run". Absent data is not an easy run.
    expect(out.hardPct).toBeNull()
  })

  it('a half with missing heart-rate readings yields null decoupling, not a half-invented one', () => {
    const splits: SplitRow[] = [
      { km: 1, timeSec: 400, paceSec: 400, hr: 150, cadence: 160, partial: false },
      { km: 2, timeSec: 410, paceSec: 410, hr: null, cadence: 158, partial: false },
    ]
    const out = computeSessionMetrics(base(splits), OBSERVED_189)
    expect(out.decouplingPct).toBeNull()
    // The pace-only statistics survive — losing HR must not cost the pacing analysis.
    expect(out.splitDriftSecPerKm).toBeCloseTo(10, 6)
    expect(out.paceSdSec).toBeCloseTo(5, 6)
  })
})

describe('§3.5 — what disappears when HRmax cannot be resolved', () => {
  const out = computeSessionMetrics(canonicalSession, null)

  it('loses avgHrPctMax and NOTHING else', () => {
    expect(out.hrMaxUsed).toBeNull()
    expect(out.avgHrPctMax).toBeNull()

    expect(out.decouplingPct).toBeCloseTo(12.3466, 3)
    expect(out.splitDriftSecPerKm).toBeCloseTo(40.8, 6)
    expect(out.paceSdSec).toBeCloseTo(24.72, 2)
    expect(out.cadenceFadeSpm).toBe(-18)
    expect(out.hardPct).toBeCloseTo(90.6, 1)
    expect(out.hrRecovery1MinBpm).toBe(23)
  })

  it('nulls the percentage rather than substituting a constant', () => {
    // "assume 190" would make a figure with zero evidence behind it look exactly like one with
    // evidence. Silence is the honest degradation — same rule as resolveHrMax's own null.
    expect(out.avgHrPctMax).not.toBe(0)
    expect(out.avgHrPctMax).toBeNull()
  })

  it('also nulls it when the run has no average heart rate at all', () => {
    const noHr = computeSessionMetrics({ ...canonicalSession, avgHrBpm: null }, OBSERVED_189)
    expect(noHr.avgHrPctMax).toBeNull()
    expect(noHr.hrMaxUsed).toEqual(OBSERVED_189)
  })

  it('nulls HR recovery when either reading is missing — never treats absence as a 0 bpm drop', () => {
    expect(
      computeSessionMetrics({ ...canonicalSession, recovery: null }, null).hrRecovery1MinBpm,
    ).toBeNull()
    expect(
      computeSessionMetrics(
        { ...canonicalSession, recovery: { endHrBpm: 185, hrAt1MinBpm: null } },
        null,
      ).hrRecovery1MinBpm,
    ).toBeNull()
  })
})

describe('purity', () => {
  it('does not mutate its input', () => {
    const snapshot = JSON.stringify(canonicalSession)
    computeSessionMetrics(canonicalSession, OBSERVED_189)
    expect(JSON.stringify(canonicalSession)).toBe(snapshot)
  })

  it('is deterministic — same input, byte-identical output', () => {
    expect(JSON.stringify(computeSessionMetrics(canonicalSession, OBSERVED_189))).toBe(
      JSON.stringify(computeSessionMetrics(canonicalSession, OBSERVED_189)),
    )
  })
})
