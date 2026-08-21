import { describe, expect, it } from 'vitest'

import {
  DEFAULT_KIND_BY_INDEX,
  MAX_IMAGES,
  MAX_SOURCE_BYTES,
  SCREEN_KINDS,
  type ScreenKind,
} from '@/lib/extract/constants'
import { planPicked, type KindHolder } from '@/lib/extract/planPicked'

/**
 * **What a pick adds, decided as pure logic.** Card #6 / F17.
 *
 * `onPick` used to make these decisions from inside a `setTiles` updater and launch the upload from
 * in there too, which Strict Mode double-invoked in dev: one file picked, one tile rendered, two
 * token minted, two blobs written, one orphaned in the store for good. The fix moves the whole
 * decision here — which is also the first time it can be asserted at all, since
 * `vitest.config.ts` runs `environment: 'node'` and logic inside a `.tsx` is logic this repo cannot
 * unit-test.
 *
 * The rule is small and total, so it is proved exhaustively rather than by example, the way
 * `tests/extract.reassignKind.test.ts` proves its own. `planPicked` mints no ids and creates no
 * object URLs precisely so that every case below is deterministic with no test doubles.
 */

/**
 * A `File` big enough to be rejected without allocating 25 MB. `Blob.prototype.size` is a getter,
 * so an own property shadows it — which is exactly what a real 40 MB pick looks like to
 * `rejectionReason`, the only thing reading it.
 */
function file(name: string, { type = 'image/jpeg', size = 1024 } = {}): File {
  const f = new File([new Uint8Array(1)], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const holders = (...kinds: ScreenKind[]): KindHolder[] => kinds.map((kind) => ({ kind }))

describe('planPicked — room arithmetic', () => {
  it('accepts everything when the page is empty', () => {
    const picked = [file('a.jpg'), file('b.jpg'), file('c.jpg')]
    const plan = planPicked([], picked)
    expect(plan.accepted.map((a) => a.file)).toEqual(picked)
    expect(plan.error).toBeNull()
  })

  it.each([
    [0, 3],
    [1, 2],
    [2, 1],
  ])('with %i tiles already, three picks yield %i', (existing, room) => {
    const plan = planPicked(holders(...SCREEN_KINDS.slice(0, existing)), [
      file('a.jpg'),
      file('b.jpg'),
      file('c.jpg'),
    ])
    expect(plan.accepted).toHaveLength(room)
  })

  it('refuses outright when three tiles are already up, and says so', () => {
    const plan = planPicked(holders(...SCREEN_KINDS), [file('d.jpg')])
    expect(plan.accepted).toEqual([])
    expect(plan.error).toBe('Three screenshots is the most one run can have.')
  })

  it('names the remaining room when more files were picked than fit', () => {
    const plan = planPicked(holders('summary', 'splits'), [
      file('a.jpg'),
      file('b.jpg'),
      file('c.jpg'),
    ])
    expect(plan.accepted).toHaveLength(1)
    expect(plan.error).toBe('Only the first 1 of those were added — three is the maximum.')
  })

  it('is silent when the pick fills the page exactly', () => {
    const plan = planPicked(holders('summary'), [file('a.jpg'), file('b.jpg')])
    expect(plan.accepted).toHaveLength(2)
    expect(plan.error).toBeNull()
  })

  it('says nothing about an empty pick', () => {
    expect(planPicked([], [])).toEqual({ accepted: [], error: null })
  })
})

describe('planPicked — kind defaults', () => {
  /** 1st Summary, 2nd Splits, 3rd Heart rate: the order the screens appear in the Fitness app. */
  it('follows pick order on an empty page', () => {
    const plan = planPicked([], [file('a.jpg'), file('b.jpg'), file('c.jpg')])
    expect(plan.accepted.map((a) => a.kind)).toEqual([...DEFAULT_KIND_BY_INDEX])
  })

  it('continues the order from however many tiles are already up', () => {
    const plan = planPicked(holders('summary'), [file('b.jpg'), file('c.jpg')])
    expect(plan.accepted.map((a) => a.kind)).toEqual(['splits', 'heartrate'])
  })

  /**
   * The skip is the interesting half: a runner who changed tile 1 to Splits and then picked a
   * second screenshot must not get a second Splits, because two tiles claiming one screen makes
   * the provenance guard believe a screen is covered when the real screen is missing — and
   * `ExtractRequestSchema` refuses such a request server-side anyway.
   */
  it('skips a kind an existing tile already claims', () => {
    const plan = planPicked(holders('splits'), [file('b.jpg')])
    expect(plan.accepted.map((a) => a.kind)).toEqual(['summary'])
  })

  it('skips a kind an earlier pick in the same batch just claimed', () => {
    // One tile up, so the batch starts at index 1: 'splits' is free and taken as-is, then index 2
    // wants 'heartrate' — held by the existing tile — and falls through to the only kind left.
    const plan = planPicked(holders('heartrate'), [file('a.jpg'), file('b.jpg')])
    expect(plan.accepted.map((a) => a.kind)).toEqual(['splits', 'summary'])
  })

  /**
   * Exhaustive: every arrangement of 0–2 existing kinds crossed with every batch size that fits.
   * The invariant is the one the whole upload page rests on — the kinds are distinct, always.
   */
  it('never hands out a duplicate kind, for any arrangement', () => {
    const arrangements: ScreenKind[][] = [[]]
    for (const a of SCREEN_KINDS) {
      arrangements.push([a])
      for (const b of SCREEN_KINDS) if (b !== a) arrangements.push([a, b])
    }

    for (const existing of arrangements) {
      for (let count = 1; count <= MAX_IMAGES; count++) {
        const picked = Array.from({ length: count }, (_, i) => file(`p${i}.jpg`))
        const plan = planPicked(holders(...existing), picked)
        const kinds = [...existing, ...plan.accepted.map((a) => a.kind)]
        expect(new Set(kinds).size, `existing=${existing.join()} picked=${count}`).toBe(
          kinds.length,
        )
        expect(plan.accepted.length).toBe(Math.min(count, MAX_IMAGES - existing.length))
      }
    }
  })

  /**
   * The equality every "find a free kind" search here depends on, asserted directly the way F16
   * asserts it. If a fourth screen kind ever lands, this fails loudly instead of a pick quietly
   * reusing a kind another tile holds.
   */
  it('has exactly as many kinds as slots', () => {
    expect(MAX_IMAGES).toBe(SCREEN_KINDS.length)
  })
})

describe('planPicked — rejections', () => {
  it('accepts around a bad file rather than abandoning the batch', () => {
    const good = file('good.jpg')
    const plan = planPicked([], [good, file('huge.jpg', { size: 40e6 })])
    expect(plan.accepted.map((a) => a.file)).toEqual([good])
    expect(40e6).toBeGreaterThan(MAX_SOURCE_BYTES) // or the case proves nothing
    expect(plan.error).toBe('“huge.jpg” is too large (40 MB).')
  })

  it.each([
    [file('notes.pdf', { type: 'application/pdf' }), '“notes.pdf” is not an image.'],
    [file('empty.jpg', { size: 0 }), '“empty.jpg” is empty.'],
  ])('rejects %o and quotes the reason', (bad, message) => {
    const plan = planPicked([], [bad])
    expect(plan.accepted).toEqual([])
    expect(plan.error).toBe(message)
  })

  /** An extension the browser gave no MIME type for is still a screenshot. */
  it('takes a HEIC with no type on its name alone', () => {
    const plan = planPicked([], [file('IMG_0001.HEIC', { type: '' })])
    expect(plan.accepted).toHaveLength(1)
  })

  it('shows the last message when a pick trips two rules', () => {
    const plan = planPicked(holders('summary', 'splits'), [
      file('empty.jpg', { size: 0 }),
      file('b.jpg'),
      file('c.jpg'),
    ])
    // Over-cap fires first, then the empty file overwrites it: there is one `formError` line, and
    // the specific complaint is more useful than the count.
    expect(plan.error).toBe('“empty.jpg” is empty.')
    expect(plan.accepted).toEqual([])
  })
})

describe('planPicked — purity', () => {
  it('mutates neither argument', () => {
    const existing = holders('summary')
    const picked = [file('a.jpg'), file('b.jpg')]
    const existingCopy = [...existing]
    const pickedCopy = [...picked]

    planPicked(existing, picked)

    expect(existing).toEqual(existingCopy)
    expect(picked).toEqual(pickedCopy)
    expect(existing[0]).toEqual({ kind: 'summary' })
  })

  it('returns the same answer twice — nothing is minted, so a replay is free', () => {
    const existing = holders('splits')
    const picked = [file('a.jpg'), file('b.jpg')]
    expect(planPicked(existing, picked)).toEqual(planPicked(existing, picked))
  })

  it('hands back the very File objects it was given', () => {
    const picked = [file('a.jpg'), file('b.jpg')]
    const plan = planPicked([], picked)
    expect(plan.accepted[0]?.file).toBe(picked[0])
    expect(plan.accepted[1]?.file).toBe(picked[1])
  })
})
