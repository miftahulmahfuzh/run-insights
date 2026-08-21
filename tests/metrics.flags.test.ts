import { describe, expect, it } from 'vitest'

import { evaluateSessionFlags, type FlagCode } from '@/lib/metrics/flags'
import { computeSessionMetrics } from '@/lib/metrics/session'
import type { SessionMetrics, SplitRow } from '@/lib/metrics/types'
import { canonicalSession } from './fixtures/canonicalRun'

/**
 * Two kinds of test here, and both are needed.
 *
 * The boundary pairs hand-build a `SessionMetrics` and toggle one field, which is only possible
 * because `evaluateSessionFlags` takes computed metrics rather than a run — no fixture, no
 * arithmetic, just the comparison under test. Every threshold is STRICT, so each flag gets a case
 * sitting exactly on the line that must NOT fire.
 *
 * The integration test then runs the real fixture end to end and asserts the resulting set is
 * exactly six codes — no more, no fewer. That is the assertion that catches a flag quietly added,
 * removed, or firing on the wrong side of its own threshold.
 */

/** All-null metrics: nothing fires. Each test switches on exactly one field. */
const QUIET: SessionMetrics = {
  runId: 'r_quiet',
  hrMaxUsed: null,
  avgHrPctMax: null,
  decouplingPct: null,
  splitDriftSecPerKm: null,
  paceSdSec: null,
  cadenceFadeSpm: null,
  fastestKm: null,
  slowestKm: null,
  zonePct: [],
  hardPct: null,
  hrRecovery1MinBpm: null,
  fullSplitCount: 10,
}

const split = (paceSec: number): SplitRow => ({
  km: 1,
  timeSec: paceSec,
  paceSec,
  hr: 160,
  cadence: 150,
  partial: false,
})

const codes = (m: Partial<SessionMetrics>, first: SplitRow | null = null): FlagCode[] =>
  evaluateSessionFlags({ ...QUIET, ...m }, first).map((f) => f.code)

describe('nothing fires on an empty metric set', () => {
  it('a run with every metric null produces no flags at all', () => {
    // Absent is not "false": no flag beats a reassuring one the app has no evidence for.
    expect(evaluateSessionFlags(QUIET, null)).toEqual([])
  })
})

describe('boundaries — every threshold is strict', () => {
  it('HIGH_DECOUPLING: 5.0 does not fire, 5.01 does', () => {
    expect(codes({ decouplingPct: 5 })).not.toContain('HIGH_DECOUPLING')
    expect(codes({ decouplingPct: 5.01 })).toContain('HIGH_DECOUPLING')
  })

  it('TOO_MUCH_HARD: 70.0 does not fire, 70.01 does', () => {
    expect(codes({ hardPct: 70 })).not.toContain('TOO_MUCH_HARD')
    expect(codes({ hardPct: 70.01 })).toContain('TOO_MUCH_HARD')
  })

  it('POSITIVE_SPLIT: 30.0 does not fire, 30.01 does', () => {
    expect(codes({ splitDriftSecPerKm: 30 })).not.toContain('POSITIVE_SPLIT')
    expect(codes({ splitDriftSecPerKm: 30.01 })).toContain('POSITIVE_SPLIT')
  })

  it('CADENCE_FADE: −8.0 does not fire, −8.01 does', () => {
    expect(codes({ cadenceFadeSpm: -8 })).not.toContain('CADENCE_FADE')
    expect(codes({ cadenceFadeSpm: -8.01 })).toContain('CADENCE_FADE')
  })

  it('VERY_HIGH_AVG_HR: 90.0 does not fire, 90.01 does', () => {
    expect(codes({ avgHrPctMax: 90 })).not.toContain('VERY_HIGH_AVG_HR')
    expect(codes({ avgHrPctMax: 90.01 })).toContain('VERY_HIGH_AVG_HR')
  })

  it('SLOW_HR_RECOVERY: 20 does not fire, 19 does', () => {
    expect(codes({ hrRecovery1MinBpm: 20 })).not.toContain('SLOW_HR_RECOVERY')
    expect(codes({ hrRecovery1MinBpm: 19 })).toContain('SLOW_HR_RECOVERY')
  })

  it('FAST_START: fastest + 2 does not fire, fastest + 1 does', () => {
    const fastestKm = { km: 3, paceSec: 396 }
    expect(codes({ fastestKm }, split(398))).not.toContain('FAST_START')
    expect(codes({ fastestKm }, split(397))).toContain('FAST_START')
    expect(codes({ fastestKm }, split(396))).toContain('FAST_START')
  })
})

describe('a null metric never fires its flag', () => {
  it('VERY_HIGH_AVG_HR is absent, not false, when HRmax could not be resolved', () => {
    const withHr = computeSessionMetrics(canonicalSession, { bpm: 189, source: 'observed' })
    const withoutHr = computeSessionMetrics(canonicalSession, null)
    const firstFull = canonicalSession.splits[0]!

    expect(evaluateSessionFlags(withHr, firstFull).map((f) => f.code)).toContain('VERY_HIGH_AVG_HR')
    expect(evaluateSessionFlags(withoutHr, firstFull).map((f) => f.code)).not.toContain(
      'VERY_HIGH_AVG_HR',
    )
  })

  it('FAST_START needs both a first full split and a fastest km', () => {
    expect(codes({ fastestKm: { km: 1, paceSec: 396 } }, null)).not.toContain('FAST_START')
    expect(codes({ fastestKm: null }, split(300))).not.toContain('FAST_START')
  })
})

describe('FAST_START reads the first FULL split, never splits[0] of the raw array', () => {
  it('a partial leading row cannot be mistaken for kilometre one', () => {
    // Not a shape the extractor produces under D14, but the reference implementation's
    // `s.splits[0]` is correct on this fixture only by luck, and comparing the wrong row is free
    // to prevent and expensive to debug.
    const partialFirst: SplitRow = { ...split(300), partial: true }
    const m = computeSessionMetrics(
      {
        ...canonicalSession,
        splits: [partialFirst, ...canonicalSession.splits],
      },
      null,
    )
    const firstFull = canonicalSession.splits.find((s) => !s.partial)!

    // The 300 s partial row would trivially trip FAST_START if it were consulted.
    expect(evaluateSessionFlags(m, partialFirst).map((f) => f.code)).toContain('FAST_START')
    // Passed the first FULL km (396 s, which IS the fastest), it still fires — for the right reason.
    expect(m.fastestKm).toEqual({ km: 1, paceSec: 396 })
    expect(evaluateSessionFlags(m, firstFull).map((f) => f.code)).toContain('FAST_START')
  })
})

describe('the canonical fixture fires exactly six flags', () => {
  const metrics = computeSessionMetrics(canonicalSession, { bpm: 189, source: 'observed' })
  const fired = evaluateSessionFlags(metrics, canonicalSession.splits[0]!)

  it('no more, no fewer — the set ROADMAP §4.9 pins', () => {
    expect([...fired.map((f) => f.code)].sort()).toEqual(
      [
        'CADENCE_FADE',
        'FAST_START',
        'HIGH_DECOUPLING',
        'POSITIVE_SPLIT',
        'TOO_MUCH_HARD',
        'VERY_HIGH_AVG_HR',
      ].sort(),
    )
  })

  it('SLOW_HR_RECOVERY is explicitly ABSENT — 23 bpm falls on the good side of 20', () => {
    expect(metrics.hrRecovery1MinBpm).toBe(23)
    expect(fired.map((f) => f.code)).not.toContain('SLOW_HR_RECOVERY')
  })

  it('carries the raw tripping value, unrounded, for F07 to quote', () => {
    const byCode = new Map(fired.map((f) => [f.code, f]))
    expect(byCode.get('HIGH_DECOUPLING')!.value).toBeCloseTo(12.3466, 3)
    expect(byCode.get('TOO_MUCH_HARD')!.value).toBeCloseTo(90.6, 1)
    expect(byCode.get('CADENCE_FADE')!.value).toBe(-18)
    expect(byCode.get('FAST_START')!.value).toBe(396)
  })

  it('marks the three physiological ones as warnings and the two pacing ones as info', () => {
    const severity = new Map(fired.map((f) => [f.code, f.severity]))
    expect(severity.get('HIGH_DECOUPLING')).toBe('warn')
    expect(severity.get('TOO_MUCH_HARD')).toBe('warn')
    expect(severity.get('CADENCE_FADE')).toBe('warn')
    expect(severity.get('VERY_HIGH_AVG_HR')).toBe('warn')
    expect(severity.get('POSITIVE_SPLIT')).toBe('info')
    expect(severity.get('FAST_START')).toBe('info')
  })
})
