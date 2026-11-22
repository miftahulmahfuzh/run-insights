import { describe, expect, it } from 'vitest'

import { distanceIsEstimated, splitsAreEstimated } from '@/lib/review/estimated'

const ESTIMATED = { distanceKm: 6.1, splits: true }
const NONE = { distanceKm: null, splits: false }

describe('distanceIsEstimated — A5', () => {
  it('is true while the draft still holds the estimated distance, at metre resolution', () => {
    expect(distanceIsEstimated(ESTIMATED, 6.1)).toBe(true)
    expect(distanceIsEstimated(ESTIMATED, 6.1004)).toBe(true)
  })

  it('is false the moment the runner types another distance (R3.2)', () => {
    expect(distanceIsEstimated(ESTIMATED, 6.05)).toBe(false)
    expect(distanceIsEstimated(ESTIMATED, null)).toBe(false)
  })

  it('is false when nothing was estimated, whatever the draft says', () => {
    expect(distanceIsEstimated(NONE, 6.1)).toBe(false)
  })
})

describe('splitsAreEstimated — A5', () => {
  it('is true while any estimated row remains', () => {
    expect(splitsAreEstimated(ESTIMATED, 1)).toBe(true)
  })

  it('is false once every row is gone, or when nothing was estimated', () => {
    expect(splitsAreEstimated(ESTIMATED, 0)).toBe(false)
    expect(splitsAreEstimated(NONE, 7)).toBe(false)
  })
})
