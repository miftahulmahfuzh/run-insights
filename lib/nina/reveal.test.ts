import { describe, expect, it } from 'vitest'

import {
  planReveal,
  REVEAL_CEILING_MS,
  REVEAL_FLOOR_MS,
  REVEAL_MAX_BUBBLES,
  REVEAL_MS_PER_CHAR,
  REVEAL_SCALED_FLOOR_MS,
  REVEAL_TOTAL_CEILING_MS,
} from './reveal'

/**
 * RU-5's timing, proven without a browser. `vitest.config.ts` is `environment: 'node'`, so there
 * is no component to render and no timer to advance — which is exactly why the schedule is a
 * function and not a `setTimeout` chain inside `ChatScreen`.
 */

const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0)

/** `n` code points of body, so a case can name the length it means. */
const body = (n: number) => 'a'.repeat(n)

describe('planReveal shape', () => {
  it('returns one gap per bubble', () => {
    expect(planReveal([body(10), body(10), body(10)])).toHaveLength(3)
  })

  it('returns an empty schedule for an empty turn', () => {
    // Phase 3 can legitimately come back with nothing to say (the double-invalid path), and the
    // screen renders a quiet notice instead. That must not be an exception here.
    expect(planReveal([])).toEqual([])
  })

  it('never delays the first bubble', () => {
    // The runner has already watched the indicator for 13-16 s. See the module header.
    expect(planReveal([body(400)])).toEqual([0])
    expect(planReveal([body(400), body(400)])[0]).toBe(0)
  })
})

describe('planReveal gap arithmetic', () => {
  it('grows the pause with the length of the bubble', () => {
    const short = planReveal(['x', body(60)])[1] as number
    const long = planReveal(['x', body(140)])[1] as number
    expect(long).toBeGreaterThan(short)
  })

  it('applies the floor to an empty or whitespace-only bubble', () => {
    // `body` is trimmed, so "   " is zero characters and lands on the floor rather than below it.
    expect(planReveal(['x', ''])[1]).toBe(REVEAL_FLOOR_MS)
    expect(planReveal(['x', '   \n  '])[1]).toBe(REVEAL_FLOOR_MS)
  })

  it('applies the ceiling to a bubble long enough to blow past it', () => {
    const chars = Math.ceil((REVEAL_CEILING_MS - REVEAL_FLOOR_MS) / REVEAL_MS_PER_CHAR) + 50
    expect(planReveal(['x', body(chars)])[1]).toBe(REVEAL_CEILING_MS)
  })

  it('counts code points, not UTF-16 units', () => {
    // Four astral emoji are `.length === 8` and `[...s].length === 4`. Counting units would make
    // her emoji twice as slow to "type" as her letters, which is nonsense.
    const emoji = planReveal(['x', '\u{1F602}\u{1F602}\u{1F602}\u{1F602}'])[1] as number
    const letters = planReveal(['x', 'aaaa'])[1] as number
    expect(emoji).toBe(letters)
  })
})

describe('planReveal total budget', () => {
  it('holds the total ceiling exactly at the bubble count RU-5 permits', () => {
    const worst = Array.from({ length: REVEAL_MAX_BUBBLES }, () => body(500))
    const gaps = planReveal(worst)
    expect(gaps).toHaveLength(REVEAL_MAX_BUBBLES)
    expect(sum(gaps)).toBeLessThanOrEqual(REVEAL_TOTAL_CEILING_MS)
    // And the scaled floor is not what saved it: every gap is well clear of it. This is the
    // arithmetic the module header spells out, asserted rather than trusted.
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThan(REVEAL_SCALED_FLOOR_MS)
  })

  it('leaves a schedule inside the budget untouched', () => {
    const gaps = planReveal(['x', body(20), body(20)])
    expect(sum(gaps)).toBeLessThan(REVEAL_TOTAL_CEILING_MS)
    expect(gaps[1]).toBe(gaps[2])
  })

  it('preserves the rhythm when it scales', () => {
    // A long bubble keeps a longer pause than a short one even after the whole schedule shrinks.
    const gaps = planReveal([body(200), body(200), body(30), body(200)])
    expect(sum(gaps)).toBeLessThanOrEqual(REVEAL_TOTAL_CEILING_MS)
    expect(gaps[2] as number).toBeLessThan(gaps[1] as number)
    expect(gaps[3] as number).toBeGreaterThan(gaps[2] as number)
  })

  it('prefers a visible pause over the budget above four bubbles', () => {
    // The documented inversion: a caller that ignored RU-5's clamp gets a schedule that is longer
    // than the budget rather than a flicker. Named here so nobody "fixes" it into a flicker.
    const gaps = planReveal(Array.from({ length: 40 }, () => body(500)))
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThanOrEqual(REVEAL_SCALED_FLOOR_MS)
  })
})
