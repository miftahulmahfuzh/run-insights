import { describe, expect, it } from 'vitest'

import { MAX_IMAGES, SCREEN_KINDS, type ScreenKind } from '@/lib/extract/constants'
import { KINDS_MATCH_SLOTS, reassignKind, type KindHolder } from '@/lib/extract/reassignKind'

/**
 * **The toggle that locked itself.** Card #3 / F16.
 *
 * The picker used to keep the three screen kinds distinct by *disabling* every kind another tile
 * held. That works until the slots run out, and they run out immediately: there are exactly as
 * many kinds as slots, so a full three-screen upload claims all three, every non-selected button
 * everywhere goes dead, and a mislabelled screenshot cannot be relabelled at all.
 *
 * `reassignKind` swaps instead. These tests exist to pin the two things that makes true — the
 * invariant holds after *every* tap, and the caller is told exactly which tiles to re-upload.
 */

const tile = (id: string, kind: ScreenKind): KindHolder => ({ id, kind })

describe('the equality the design rests on', () => {
  /**
   * This is the assertion that makes subtraction unsalvageable and swapping necessary. It is also
   * what guarantees `onPick` can always seat a new tile on a free kind, which is why
   * `reassignKind` looks up a single holder with `find` rather than looping over all of them.
   *
   * If a fourth screen kind ever lands, this fails loudly instead of the picker quietly wedging.
   */
  it('has exactly as many screen kinds as image slots', () => {
    expect(SCREEN_KINDS.length).toBe(MAX_IMAGES)
    expect(KINDS_MATCH_SLOTS).toBe(true)
  })
})

describe('reassignKind — the four cases', () => {
  it('is a no-op when the target id is not present', () => {
    const entries = [tile('a', 'summary'), tile('b', 'splits')]
    const result = reassignKind(entries, 'nope', 'heartrate')

    expect(result.changed).toEqual([])
    expect(result.entries).toEqual(entries)
  })

  it('is a no-op when the target already holds that kind', () => {
    const entries = [tile('a', 'summary'), tile('b', 'splits')]
    const result = reassignKind(entries, 'a', 'summary')

    expect(result.changed).toEqual([])
    expect(result.entries).toEqual(entries)
  })

  it('takes a free kind without disturbing anyone', () => {
    const entries = [tile('a', 'summary'), tile('b', 'splits')]
    const result = reassignKind(entries, 'a', 'heartrate')

    expect(result.changed).toEqual(['a'])
    expect(result.entries).toEqual([tile('a', 'heartrate'), tile('b', 'splits')])
  })

  /** The reported case: three screens, the heart-rate shot labelled Summary. One tap fixes both. */
  it('swaps with the holder, and names both ids as changed', () => {
    const entries = [tile('a', 'summary'), tile('b', 'splits'), tile('c', 'heartrate')]
    const result = reassignKind(entries, 'a', 'heartrate')

    expect(result.changed).toEqual(['a', 'c'])
    expect(result.entries).toEqual([
      tile('a', 'heartrate'),
      tile('b', 'splits'),
      tile('c', 'summary'),
    ])
  })

  it('holds the input order, not the swap order', () => {
    const entries = [tile('a', 'summary'), tile('b', 'splits'), tile('c', 'heartrate')]
    const result = reassignKind(entries, 'c', 'summary')

    expect(result.entries.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('reassignKind — it does not mutate', () => {
  it('leaves the input array and its elements untouched', () => {
    const a = tile('a', 'summary')
    const b = tile('b', 'heartrate')
    const entries = [a, b]

    reassignKind(entries, 'a', 'heartrate')

    expect(entries).toEqual([tile('a', 'summary'), tile('b', 'heartrate')])
    expect(a.kind).toBe('summary')
    expect(b.kind).toBe('heartrate')
  })

  it('returns a fresh array even for a no-op, so callers cannot alias state', () => {
    const entries = [tile('a', 'summary')]
    const result = reassignKind(entries, 'a', 'summary')

    expect(result.entries).not.toBe(entries)
    expect(result.entries).toEqual(entries)
  })

  it('carries the rest of the element through, not just id and kind', () => {
    const entries = [
      { id: 'a', kind: 'summary' as ScreenKind, bytes: 61_000 },
      { id: 'b', kind: 'splits' as ScreenKind, bytes: 58_000 },
    ]
    const result = reassignKind(entries, 'a', 'splits')

    expect(result.entries).toEqual([
      { id: 'a', kind: 'splits', bytes: 61_000 },
      { id: 'b', kind: 'summary', bytes: 58_000 },
    ])
  })
})

/**
 * ── THE EXHAUSTIVE PASS ─────────────────────────────────────────────────────────────────────
 *
 * The whole point of swapping is that the invariant survives *every* tap, not the handful a
 * case-by-case test happens to name. The space is tiny — at most three tiles drawn from three
 * kinds — so it can simply be enumerated rather than sampled: every reachable arrangement crossed
 * with every (target, next) tap a runner could make.
 *
 * "Reachable" means distinct kinds, which is what `onPick` produces and what this function
 * preserves. A duplicate arrangement is not a state the app can be in, so it is not a state worth
 * defining behaviour for.
 */
describe('reassignKind — exhaustive invariant', () => {
  const ids = ['a', 'b', 'c'] as const

  /** Every distinct-kind arrangement of 1, 2 and 3 tiles. */
  const arrangements: KindHolder[][] = []
  for (let count = 1; count <= MAX_IMAGES; count++) {
    const walk = (built: KindHolder[], used: Set<ScreenKind>) => {
      if (built.length === count) {
        arrangements.push(built)
        return
      }
      for (const kind of SCREEN_KINDS) {
        if (used.has(kind)) continue
        walk([...built, tile(ids[built.length]!, kind)], new Set([...used, kind]))
      }
    }
    walk([], new Set())
  }

  const taps = arrangements.flatMap((entries) =>
    entries.flatMap((target) => SCREEN_KINDS.map((next) => ({ entries, target, next }))),
  )

  it('enumerates every arrangement and tap', () => {
    // 3 + 6 + 6 = 15 arrangements; 1·3 + 2·3·2 + 3·3·3 taps over them.
    expect(arrangements).toHaveLength(15)
    expect(taps).toHaveLength(9 + 36 + 54)
  })

  it('always leaves the kinds distinct', () => {
    for (const { entries, target, next } of taps) {
      const kinds = reassignKind(entries, target.id, next).entries.map((e) => e.kind)
      expect(new Set(kinds).size, `${entries.length} tiles, ${target.id} → ${next}`).toBe(
        kinds.length,
      )
    }
  })

  it('always gives the target the kind it was asked for', () => {
    for (const { entries, target, next } of taps) {
      const result = reassignKind(entries, target.id, next)
      expect(result.entries.find((e) => e.id === target.id)?.kind).toBe(next)
    }
  })

  it('always keeps the same tiles, in the same order', () => {
    for (const { entries, target, next } of taps) {
      const result = reassignKind(entries, target.id, next)
      expect(result.entries.map((e) => e.id)).toEqual(entries.map((e) => e.id))
    }
  })

  /**
   * `changed` is what the picker re-uploads, so it has to be exactly right in both directions: no
   * tile whose kind moved may be missing from it, and no tile whose kind held still may appear.
   */
  it('reports changed as precisely the tiles whose kind moved', () => {
    for (const { entries, target, next } of taps) {
      const result = reassignKind(entries, target.id, next)
      const moved = entries
        .filter((e) => result.entries.find((r) => r.id === e.id)?.kind !== e.kind)
        .map((e) => e.id)

      expect([...result.changed].sort()).toEqual(moved.sort())
      expect(result.changed.length).toBeLessThanOrEqual(2)
    }
  })

  /**
   * The property the frozen control could not offer: from any arrangement, every kind is reachable
   * on every tile in a single tap. This is the card, stated as a test.
   */
  it('reaches every kind on every tile in one tap — including a full three-screen upload', () => {
    const full = arrangements.filter((a) => a.length === MAX_IMAGES)
    expect(full.length).toBeGreaterThan(0)

    for (const entries of full) {
      for (const target of entries) {
        for (const next of SCREEN_KINDS) {
          const result = reassignKind(entries, target.id, next)
          expect(result.entries.find((e) => e.id === target.id)?.kind).toBe(next)
        }
      }
    }
  })
})
