import { describe, expect, it } from 'vitest'

import { factsHash } from '@/lib/llm/factsHash'

/**
 * Task 3. Four properties, and the feature is wrong in a different way if any one of them fails:
 *
 *   · key order does NOT matter    → a refactor cannot silently invalidate every cached insight
 *   · array order DOES matter      → two genuinely different fact sets cannot collide
 *   · promptVersion matters        → a prompt edit busts a cache keyed on numbers that did not move
 *   · any value change matters     → a correction regenerates
 */

describe('factsHash — key order', () => {
  it('is identical for the same object written in a different order', () => {
    const a = { alpha: 1, beta: { x: 'one', y: 'two' }, gamma: [1, 2, 3] }
    const b = { gamma: [1, 2, 3], beta: { y: 'two', x: 'one' }, alpha: 1 }
    expect(factsHash(a)).toBe(factsHash(b))
  })

  it('survives a JSON round trip with the keys manually reordered', () => {
    const facts = { session: { distanceKm: 10.67, duration: '1:18:36' }, promptVersion: 1 }
    const shuffled = JSON.parse(
      JSON.stringify({ promptVersion: 1, session: { duration: '1:18:36', distanceKm: 10.67 } }),
    ) as unknown
    expect(factsHash(facts)).toBe(factsHash(shuffled))
  })

  it('sorts nested keys too, not just the top level', () => {
    expect(factsHash({ a: { z: 1, m: 2, b: 3 } })).toBe(factsHash({ a: { b: 3, m: 2, z: 1 } }))
  })
})

describe('factsHash — array order', () => {
  it('CHANGES when splits are reordered: km 1 then km 2 is not the same run as the reverse', () => {
    const ordered = { splits: [{ km: 1 }, { km: 2 }] }
    const reversed = { splits: [{ km: 2 }, { km: 1 }] }
    expect(factsHash(ordered)).not.toBe(factsHash(reversed))
  })

  it('changes when a weekly series is reordered — a trend read backwards is a different trend', () => {
    const up = { weeklyVolumeSeries: [{ volumeKm: 10 }, { volumeKm: 40 }] }
    const down = { weeklyVolumeSeries: [{ volumeKm: 40 }, { volumeKm: 10 }] }
    expect(factsHash(up)).not.toBe(factsHash(down))
  })
})

describe('factsHash — promptVersion', () => {
  it('differs for two otherwise identical fact objects', () => {
    const numbers = { session: { distanceKm: 10.67 } }
    expect(factsHash({ ...numbers, promptVersion: 1 })).not.toBe(
      factsHash({ ...numbers, promptVersion: 2 }),
    )
  })
})

describe('factsHash — value sensitivity', () => {
  it('changes for a one-second pace correction', () => {
    expect(factsHash({ avgPaceSec: 442 })).not.toBe(factsHash({ avgPaceSec: 443 }))
  })

  it('distinguishes null from absent', () => {
    // `{ intent: null }` is "asked, no answer"; `{}` is a fact object that has no intent field at
    // all. They mean different things to the prompt, so they must not share a cache entry.
    expect(factsHash({ intent: null })).not.toBe(factsHash({}))
  })

  it('distinguishes the number 1 from the string "1"', () => {
    expect(factsHash({ v: 1 })).not.toBe(factsHash({ v: '1' }))
  })

  it('returns a 64-character lowercase sha256 digest', () => {
    expect(factsHash({ any: 'thing' })).toMatch(/^[0-9a-f]{64}$/)
  })
})
