import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import { decodeToRgb } from '@/lib/extract/chart/decode'
import type { ChartEstimate } from '@/lib/extract/chart/estimate'
import {
  applyEstimate,
  estimateInputFor,
  fillFromPrinted,
  mergeWorkoutDetails,
} from '@/lib/extract/detailsMerge'
import type { DetailsPrinted } from '@/lib/schema/detailsPrinted'
import { RawExtractedSession, type ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * Phase 1's committed shipped-recipe JPEGs (560 × 1212, q80): the exact bytes its estimator was
 * measured on (research/fixtures/workout-details/README.md).
 */
const WORKOUT_DETAILS_FIXTURE_DIR = 'research/fixtures/workout-details/shipped'

const SUNDAY_PRINTED: DetailsPrinted = {
  durationSec: 3046,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}
const FRIDAY_PRINTED: DetailsPrinted = {
  durationSec: 2773,
  distanceKm: null,
  paceSlowestSecPerKm: 497,
  paceFastestSecPerKm: 365,
  avgPaceSecPerKm: 459,
  hrMinBpm: 101,
  hrMaxBpm: 186,
  avgHrBpm: 169,
  elevationGainM: 6,
}

/** A session the way a summary + heart-rate read leaves it: no splits screen, so no splits. */
function summaryOnly(over: Partial<ExtractedSession> = {}): ExtractedSession {
  return { ...(JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession), splits: [], ...over }
}

const ESTIMATE: ChartEstimate = {
  distanceKm: 6.1,
  distanceWasEstimated: true,
  slotCount: 90,
  splits: [
    { km: 1, timeSec: 494.4, paceSecPerKm: 494.4, hrBpm: 141.6, cadenceSpm: null, partial: false },
    { km: 2, timeSec: 496, paceSecPerKm: 496, hrBpm: 300, cadenceSpm: null, partial: false },
    { km: 3, timeSec: 46, paceSecPerKm: 460, hrBpm: null, cadenceSpm: null, partial: true },
  ],
}

function shippedRgb(file: string) {
  return decodeToRgb(readFileSync(path.join(WORKOUT_DETAILS_FIXTURE_DIR, file)))
}

describe('fillFromPrinted — A7, printed values fill nulls only', () => {
  it('never overwrites a value another screen transcribed', () => {
    const out = fillFromPrinted(summaryOnly({ durationSec: 3040, avgHrBpm: 160 }), SUNDAY_PRINTED)
    expect(out.durationSec).toBe(3040)
    expect(out.avgHrBpm).toBe(160)
  })

  it('fills what the other screens left null', () => {
    const out = fillFromPrinted(
      summaryOnly({ durationSec: null, elevationGainM: null, avgPaceSecPerKm: null }),
      FRIDAY_PRINTED,
    )
    expect(out.durationSec).toBe(2773)
    expect(out.elevationGainM).toBe(6)
    expect(out.avgPaceSecPerKm).toBe(459)
  })

  it('does not alias the input arrays', () => {
    const input = summaryOnly()
    const out = fillFromPrinted(input, null)
    expect(out.hrZones).not.toBe(input.hrZones)
    expect(out).toEqual(input)
  })
})

describe('estimateInputFor — when an estimate may be made', () => {
  it('never with a splits screenshot: the real table wins (A1, R1.2)', () => {
    expect(estimateInputFor(summaryOnly(), SUNDAY_PRINTED, true)).toBeNull()
  })

  it('never without the printed pace range (R2.4)', () => {
    expect(
      estimateInputFor(summaryOnly(), { ...SUNDAY_PRINTED, paceSlowestSecPerKm: null }, false),
    ).toBeNull()
    expect(estimateInputFor(summaryOnly(), null, false)).toBeNull()
  })

  it('never without any duration', () => {
    expect(
      estimateInputFor(
        summaryOnly({ durationSec: null }),
        { ...SUNDAY_PRINTED, durationSec: null },
        false,
      ),
    ).toBeNull()
  })

  it('prefers the chart axis duration and hands over a transcribed distance (A2)', () => {
    expect(
      estimateInputFor(summaryOnly({ durationSec: 3040, distanceKm: 6.04 }), SUNDAY_PRINTED, false),
    ).toEqual({
      durationSec: 3046,
      paceSlowestSecPerKm: 552,
      paceFastestSecPerKm: 407,
      hrMinBpm: 116,
      hrMaxBpm: 177,
      knownDistanceKm: 6.04,
    })
  })
})

describe('applyEstimate — what an estimate is allowed to write', () => {
  it('fills a null distance and empty splits, and records both (R2.3)', () => {
    const { session, estimate } = applyEstimate(summaryOnly({ distanceKm: null }), ESTIMATE)
    expect(session.distanceKm).toBe(6.1)
    expect(session.splits.map((s) => s.timeSec)).toEqual([494, 496, 46])
    expect(session.splits[0]!.hrBpm).toBe(142)
    expect(session.splits[1]!.hrBpm).toBeNull() // 300 bpm is outside the schema's band
    expect(session.splits.every((s) => s.cadenceSpm === null)).toBe(true)
    expect(estimate).toEqual({ distanceKm: 6.1, splits: true })
  })

  it('leaves a transcribed distance alone: splits estimated, distance not (A2)', () => {
    const { session, estimate } = applyEstimate(summaryOnly({ distanceKm: 6.04 }), {
      ...ESTIMATE,
      distanceKm: 6.04,
      distanceWasEstimated: false,
    })
    expect(session.distanceKm).toBe(6.04)
    expect(estimate).toEqual({ distanceKm: null, splits: true })
  })

  it('never replaces a split table that exists', () => {
    const withSplits = summaryOnly({
      distanceKm: null,
      splits: (JSON.parse(JSON.stringify(TRUTH)) as ExtractedSession).splits,
    })
    const { session, estimate } = applyEstimate(withSplits, ESTIMATE)
    expect(session.splits).toEqual(withSplits.splits)
    expect(estimate).toEqual({ distanceKm: 6.1, splits: false })
  })

  it('records nothing when there was no estimate', () => {
    expect(applyEstimate(summaryOnly(), null).estimate).toBeNull()
  })
})

describe('mergeWorkoutDetails — on the real fixtures, phase 1’s committed 560 px q80 JPEGs', () => {
  it('2026-11-22 (no distance, no table): ~6.1 km and six full estimated kilometres', async () => {
    const image = await shippedRgb('2026-11-22-details.jpg')
    const { session, estimate } = mergeWorkoutDetails({
      session: summaryOnly({ distanceKm: null, avgPaceSecPerKm: null, durationSec: 3046 }),
      printed: SUNDAY_PRINTED,
      image,
      hasSplitsScreen: false,
    })
    expect(session.distanceKm).toBeGreaterThanOrEqual(5.9)
    expect(session.distanceKm).toBeLessThanOrEqual(6.3)
    expect(session.splits.filter((s) => !s.partial)).toHaveLength(6)
    expect(estimate).toEqual({ distanceKm: session.distanceKm, splits: true })
    expect(RawExtractedSession.safeParse(session).success).toBe(true)
  })

  it('2026-11-20 (Summary printed 6.04 km): distance kept, splits scaled to it', async () => {
    const image = await shippedRgb('2026-11-20-details.jpg')
    const { session, estimate } = mergeWorkoutDetails({
      session: summaryOnly({ distanceKm: 6.04, durationSec: 2773 }),
      printed: FRIDAY_PRINTED,
      image,
      hasSplitsScreen: false,
    })
    expect(session.distanceKm).toBe(6.04)
    expect(estimate).toEqual({ distanceKm: null, splits: true })
    // The 0.04 km remainder is below CHK-4's > 0.05 km partial rule, so phase 1 folds it away:
    // six full rows, no partial, summing to the duration less that remainder's ~18 s.
    expect(session.splits.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6])
    expect(session.splits.some((s) => s.partial)).toBe(false)
    const total = session.splits.reduce((sum, s) => sum + s.timeSec, 0)
    expect(total).toBeGreaterThanOrEqual(2773 - 25)
    expect(total).toBeLessThan(2773)
  })

  it('a screenshot with no pace chart estimates nothing and keeps the printed fill (R2.4)', async () => {
    // Phase 1's exit criterion pins `null` for exactly this non-details image.
    const image = await shippedRgb('2026-11-20-summary.jpg')
    const { session, estimate } = mergeWorkoutDetails({
      session: summaryOnly({ distanceKm: null, elevationGainM: null }),
      printed: SUNDAY_PRINTED,
      image,
      hasSplitsScreen: false,
    })
    expect(estimate).toBeNull()
    expect(session.distanceKm).toBeNull()
    expect(session.splits).toEqual([])
    expect(session.elevationGainM).toBe(4)
  })
})
