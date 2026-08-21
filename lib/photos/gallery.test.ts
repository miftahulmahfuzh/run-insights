import { describe, expect, it } from 'vitest'

import {
  decideSwipe,
  stepIndex,
  SWIPE_DOMINANCE,
  SWIPE_MIN_DISTANCE,
  type SwipeGesture,
} from './gallery'

/**
 * **The two things card #8 asked for that can actually be proven here** (F18 §7).
 *
 * No DOM is involved, and that is the point: `vitest.config.ts` runs `environment: 'node'`, so a
 * `TouchEvent` is not reachable from this suite. What IS reachable is every rule the component
 * obeys, because the component holds no rules of its own — it measures a gesture and asks
 * `decideSwipe`, then moves through `stepIndex`.
 */

/** A clean single-finger horizontal drag on an unzoomed, non-overflowing image. */
function gesture(over: Partial<SwipeGesture> = {}): SwipeGesture {
  return { dx: 0, dy: 0, touches: 1, canPanHorizontally: false, zoomScale: 1, ...over }
}

describe('stepIndex wraps in both directions', () => {
  it('wraps BACKWARD off the first photo to the last', () => {
    // The whole reason for the double modulo: `(0 - 1) % 3` is -1 in JavaScript, and a naive
    // single `%` would hand the viewer a negative index and a blank overlay. This is also the
    // exact case the card names — "swipe on the first → last".
    expect(stepIndex(0, -1, 3)).toBe(2)
  })

  it('wraps FORWARD off the last photo to the first', () => {
    expect(stepIndex(2, 1, 3)).toBe(0)
  })

  it('steps normally in the middle of the list', () => {
    expect(stepIndex(1, 1, 3)).toBe(2)
    expect(stepIndex(1, -1, 3)).toBe(0)
  })

  it('is a no-op on a single photo, in either direction', () => {
    // The common upload: `/upload` accepts one to three screenshots, so a one-photo run is not an
    // edge case. Both steps must land back on the only photo rather than on index -1 or 1.
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, -1, 1)).toBe(0)
  })

  it('returns 0 rather than NaN when there are no photos', () => {
    // `x % 0` is NaN, and a NaN index renders nothing while throwing no error — the quietest
    // possible failure. The viewer never opens on an empty list today; this keeps that from
    // being load-bearing.
    expect(stepIndex(0, 1, 0)).toBe(0)
    expect(stepIndex(0, -1, -4)).toBe(0)
  })

  it('handles a jump larger than the list', () => {
    expect(stepIndex(0, 5, 3)).toBe(2)
    expect(stepIndex(0, -5, 3)).toBe(1)
  })
})

describe('decideSwipe turns a clean horizontal drag into a page', () => {
  it('reads a finger moving LEFT as the next photo', () => {
    expect(decideSwipe(gesture({ dx: -120 }))).toBe('next')
  })

  it('reads a finger moving RIGHT as the previous photo', () => {
    expect(decideSwipe(gesture({ dx: 120 }))).toBe('prev')
  })

  it('accepts a thumb-arc swipe, which is never perfectly horizontal', () => {
    // 120 px across, 40 px of drift down: comfortably past SWIPE_DOMINANCE, and the shape of
    // every real swipe made with one hand.
    expect(decideSwipe(gesture({ dx: -120, dy: 40 }))).toBe('next')
  })
})

describe('decideSwipe protects the native pinch-zoom', () => {
  it('refuses a gesture that ever had two fingers on the glass', () => {
    // `touches` is the MAXIMUM seen during the gesture, not the count at touchend — a pinch that
    // starts with one finger down and lands with none would otherwise page the photo away
    // mid-zoom. This is rule 1, and it is the one the component's onTouchMove exists to feed.
    expect(decideSwipe(gesture({ dx: -200, touches: 2 }))).toBe('none')
  })

  it('refuses a drag while the page is zoomed, because that is a pan', () => {
    expect(decideSwipe(gesture({ dx: -200, zoomScale: 2.4 }))).toBe('none')
  })

  it('tolerates float noise in the zoom scale', () => {
    // A pinch-and-release settles on values like 1.0000000000000002, so "zoomed" cannot be `> 1`.
    // Without the epsilon, one stray pinch would disable paging for the rest of the session.
    expect(decideSwipe(gesture({ dx: -200, zoomScale: 1.000000000000001 }))).toBe('next')
  })

  it('refuses a drag when the image overflows its box horizontally', () => {
    // Same situation as a zoomed viewport, reached without scaling it: the container can scroll
    // on x, so the horizontal drag belongs to the scroll container.
    expect(decideSwipe(gesture({ dx: -200, canPanHorizontally: true }))).toBe('none')
  })
})

describe('decideSwipe separates a swipe from the overlay other two gestures', () => {
  it('refuses a tap, and anything shorter than the threshold', () => {
    expect(decideSwipe(gesture({ dx: 0 }))).toBe('none')
    expect(decideSwipe(gesture({ dx: -(SWIPE_MIN_DISTANCE - 1) }))).toBe('none')
  })

  it('accepts a drag exactly at the threshold', () => {
    expect(decideSwipe(gesture({ dx: -SWIPE_MIN_DISTANCE }))).toBe('next')
  })

  it('refuses a vertical-dominant drag, which is a scroll of a tall screenshot', () => {
    // An Apple Fitness screenshot is 739 × 1600 and the overlay scrolls it. A drag down the
    // screen that wanders 60 px sideways must scroll, not page.
    expect(decideSwipe(gesture({ dx: -60, dy: -400 }))).toBe('none')
  })

  it('puts the horizontal/vertical boundary where SWIPE_DOMINANCE says', () => {
    const dy = 100
    const justOver = -Math.ceil(dy * SWIPE_DOMINANCE + 1)
    const justUnder = -Math.floor(dy * SWIPE_DOMINANCE - 1)
    expect(decideSwipe(gesture({ dx: justOver, dy }))).toBe('next')
    expect(decideSwipe(gesture({ dx: justUnder, dy }))).toBe('none')
  })

  it('refuses a gesture whose coordinates are not numbers', () => {
    expect(decideSwipe(gesture({ dx: Number.NaN }))).toBe('none')
    expect(decideSwipe(gesture({ dx: -200, dy: Number.NaN }))).toBe('none')
  })
})
