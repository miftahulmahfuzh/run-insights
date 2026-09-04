import { describe, expect, it } from 'vitest'

import {
  composerBottomCss,
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  keyboardOverlapPx,
  KEYBOARD_MIN_PX,
  STICK_TO_BOTTOM_PX,
} from './chatview'

/** iPhone XS Max, the design target (docs/design-brief.md), in CSS px. */
const IPHONE_HEIGHT = 812
/** Roughly what iOS gives a QWERTY keyboard with the predictive bar on that device. */
const KEYBOARD_HEIGHT = 336

describe('groupIntoDays', () => {
  const m = (id: string, dayISO: string) => ({ id, dayISO })

  it('returns one group per consecutive run of a day', () => {
    const groups = groupIntoDays([m('a', '2026-09-01'), m('b', '2026-09-01'), m('c', '2026-09-03')])
    expect(groups.map((g) => g.dayISO)).toEqual(['2026-09-01', '2026-09-03'])
    expect(groups[0]?.messages.map((x) => x.id)).toEqual(['a', 'b'])
    expect(groups[1]?.messages.map((x) => x.id)).toEqual(['c'])
  })

  it('does not merge two separated stretches of the same day', () => {
    // A keyed bucket would return one group here and put a divider above the wrong messages. The
    // adjacent grouping makes a mis-ordered read visible rather than plausible.
    const groups = groupIntoDays([m('a', '2026-09-01'), m('b', '2026-09-02'), m('c', '2026-09-01')])
    expect(groups).toHaveLength(3)
  })

  it('is empty for an empty conversation', () => {
    expect(groupIntoDays([])).toEqual([])
  })

  it('does not alias the input array', () => {
    // The list is React state. A group holding a reference into it would let a push here mutate
    // rendered state, which is the class of bug that only shows up on the second turn.
    const input = [m('a', '2026-09-01')]
    const groups = groupIntoDays(input)
    groups[0]?.messages.push(m('b', '2026-09-01'))
    expect(input).toHaveLength(1)
  })
})

describe('isNearBottom', () => {
  it('is true at the very bottom', () => {
    expect(isNearBottom({ scrollTop: 1200, scrollHeight: 2012, clientHeight: 812 })).toBe(true)
  })

  it('is true exactly on the threshold', () => {
    // Strict thresholds, one case at the line and one past it — the `lib/metrics/flags.ts` rule.
    expect(
      isNearBottom({
        scrollTop: 1200 - STICK_TO_BOTTOM_PX,
        scrollHeight: 2012,
        clientHeight: 812,
      }),
    ).toBe(true)
  })

  it('is false one pixel past the threshold', () => {
    expect(
      isNearBottom({
        scrollTop: 1200 - STICK_TO_BOTTOM_PX - 1,
        scrollHeight: 2012,
        clientHeight: 812,
      }),
    ).toBe(false)
  })

  it('is true for a page shorter than the viewport', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 812 })).toBe(true)
  })

  it('is true rather than false for unmeasurable geometry', () => {
    expect(isNearBottom({ scrollTop: NaN, scrollHeight: 2012, clientHeight: 812 })).toBe(true)
  })
})

describe('decideAutoScroll', () => {
  it('jumps on mount, animating nothing', () => {
    for (const readerNearBottom of [true, false]) {
      for (const reducedMotion of [true, false]) {
        expect(decideAutoScroll({ cause: 'mount', readerNearBottom, reducedMotion })).toBe('jump')
      }
    }
  })

  it('follows the runner even when he had scrolled up', () => {
    expect(
      decideAutoScroll({ cause: 'own-message', readerNearBottom: false, reducedMotion: false }),
    ).toBe('smooth')
  })

  it('never yanks a reader who is up in the history', () => {
    // The single most important rule on the screen.
    expect(
      decideAutoScroll({ cause: 'incoming', readerNearBottom: false, reducedMotion: false }),
    ).toBe('none')
  })

  it('follows an incoming bubble for a reader at the bottom', () => {
    expect(
      decideAutoScroll({ cause: 'incoming', readerNearBottom: true, reducedMotion: false }),
    ).toBe('smooth')
  })

  it('jumps rather than animates when the keyboard moves the layout', () => {
    expect(
      decideAutoScroll({ cause: 'viewport', readerNearBottom: true, reducedMotion: false }),
    ).toBe('jump')
    expect(
      decideAutoScroll({ cause: 'viewport', readerNearBottom: false, reducedMotion: false }),
    ).toBe('none')
  })

  it('replaces every smooth scroll with a jump under reduced motion', () => {
    // The destination is unchanged; only the journey. Nothing is substituted for the animation.
    expect(
      decideAutoScroll({ cause: 'own-message', readerNearBottom: true, reducedMotion: true }),
    ).toBe('jump')
    expect(
      decideAutoScroll({ cause: 'incoming', readerNearBottom: true, reducedMotion: true }),
    ).toBe('jump')
  })
})

describe('keyboardOverlapPx', () => {
  it('is zero with no keyboard', () => {
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT,
        visualOffsetTop: 0,
        scale: 1,
      }),
    ).toBe(0)
  })

  it('measures the keyboard iOS does not resize the layout viewport for', () => {
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT - KEYBOARD_HEIGHT,
        visualOffsetTop: 0,
        scale: 1,
      }),
    ).toBe(KEYBOARD_HEIGHT)
  })

  it('does not read a zoomed page as a keyboard', () => {
    // Visual viewport 400 tall, panned 200 down inside an 812 layout at 2x. The height arithmetic
    // alone yields 212 px — keyboard-sized, and entirely the pinch. `scale` is the only input that
    // separates the two, which is why it is one.
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: 400,
        visualOffsetTop: 200,
        scale: 2,
      }),
    ).toBe(0)
  })

  it('cancels a pan inside the visual viewport at scale 1', () => {
    // The offsetTop term's own job, isolated: an unzoomed page whose visual viewport has been
    // pushed down by a keyboard reports the keyboard, not the keyboard plus the pan.
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT - KEYBOARD_HEIGHT - 40,
        visualOffsetTop: 40,
        scale: 1,
      }),
    ).toBe(KEYBOARD_HEIGHT)
  })

  it('ignores a URL-bar-sized change', () => {
    const urlBar = KEYBOARD_MIN_PX - 1
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT - urlBar,
        visualOffsetTop: 0,
        scale: 1,
      }),
    ).toBe(0)
  })

  it('is zero for a negative or unmeasurable viewport', () => {
    expect(
      keyboardOverlapPx({
        innerHeight: 400,
        visualHeight: IPHONE_HEIGHT,
        visualOffsetTop: 0,
        scale: 1,
      }),
    ).toBe(0)
    expect(
      keyboardOverlapPx({ innerHeight: NaN, visualHeight: 400, visualOffsetTop: 0, scale: 1 }),
    ).toBe(0)
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: 400,
        visualOffsetTop: 0,
        scale: NaN,
      }),
    ).toBe(0)
  })
})

describe('composerBottomCss', () => {
  it('clears the tab bar, the FAB overhang and the home-indicator inset when idle', () => {
    expect(composerBottomCss(0, 78)).toBe('calc(78px + var(--safe-bottom))')
  })

  it('sits on the keyboard when there is one', () => {
    // Every term of the idle clearance is behind the keyboard, so none of it is added.
    expect(composerBottomCss(KEYBOARD_HEIGHT, 78)).toBe('336px')
  })

  it('treats unmeasurable input as no keyboard', () => {
    expect(composerBottomCss(NaN, 78)).toBe('calc(78px + var(--safe-bottom))')
  })
})
