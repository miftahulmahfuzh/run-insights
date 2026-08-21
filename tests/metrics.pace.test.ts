import { describe, expect, it } from 'vitest'

import { avgPaceSecPerKm } from '@/lib/metrics/pace'
import { canonicalSession } from './fixtures/canonicalRun'

describe('avgPaceSecPerKm', () => {
  it('reproduces the canonical run’s stored avg_pace_sec', () => {
    // 4716 / 10.670 = 441.9868… -> 442, which is exactly what the screenshot reads (7'22"/KM) and
    // what F05 writes to runs.avg_pace_sec at commit. One division, one answer, everywhere.
    expect(avgPaceSecPerKm(canonicalSession.distanceM, canonicalSession.durationSec)).toBe(442)
  })

  it('divides by TRUE distance, so the partial kilometre is included', () => {
    // The splits array's ten full kms total 10 km in 4422 s -> 442.2 -> 442 as well, but only by
    // coincidence. The contract is that this reads the run's real distance, not the splits table.
    expect(avgPaceSecPerKm(10000, 4422)).toBe(442)
    expect(avgPaceSecPerKm(10670, 4422)).toBe(414)
  })

  it('returns whole seconds', () => {
    expect(avgPaceSecPerKm(5000, 1800)).toBe(360)
    expect(Number.isInteger(avgPaceSecPerKm(18670, 7756))).toBe(true)
  })

  it('degrades to 0 rather than Infinity on a zero-distance row', () => {
    expect(avgPaceSecPerKm(0, 1800)).toBe(0)
  })
})
