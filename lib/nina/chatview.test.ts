import { describe, expect, it } from 'vitest'

import {
  composerBottomCss,
  composerPadBottomCss,
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  keyboardOverlapPx,
  KEYBOARD_MIN_PX,
  NINA_BAR_VISIBLE_VAR,
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
  // 40 is the tab bar's outer height: `TAB_BAR_HEIGHT_PX` (39) + `TAB_BAR_BORDER_PX` (1). The
  // border is the bar's top edge, so a composer clearing 39 floats a pixel above it.
  // `tests/tabbar.geometry.test.ts` is what ties this literal back to those two constants.

  it('sits flat on the bottom of the viewport while the bar is hidden', () => {
    // R1. `/nina`'s resting state: the flag is absent, `var()` substitutes 0, the WHOLE sum is
    // multiplied by it, and the offset collapses to nothing — so the bar's fill reaches the bottom
    // edge and there is no strip of conversation under it. The floor is not missing, it moved:
    // `composerPadBottomCss` carries it in this state. This is also the SSR and pre-hydration
    // answer, which is why the default is the hidden geometry and not the showing one.
    expect(composerBottomCss(0, 40)).toBe(
      'calc((40px + var(--safe-bottom)) * var(--nina-bar-visible, 0))',
    )
  })

  it('puts the inset INSIDE the gate, not beside it', () => {
    // The regression this phase fixes, stated as the shape rather than as a pixel. An inset added
    // outside the multiplication is an inset that survives the flag going to 0, which is exactly
    // the unpainted strip: `calc(40px * var(…, 0) + var(--safe-bottom))`.
    expect(composerBottomCss(0, 40)).not.toContain(') + var(--safe-bottom)')
    expect(composerBottomCss(0, 40)).toContain('(40px + var(--safe-bottom)) *')
  })

  it('names the variable the chrome writes', () => {
    // Spelled once, in `chatview.ts`, and read by `ChatChrome`. If the constant and the emission
    // ever disagree the composer stops following the bar and nothing else notices.
    expect(composerBottomCss(0, 40)).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
  })

  it('sits on the keyboard when there is one', () => {
    // Every term of the idle clearance is behind the keyboard, so none of it is added — and that
    // is true whether or not the bar is showing, and true of the inset too, which is why this
    // branch is the one thing R1 did not change.
    expect(composerBottomCss(KEYBOARD_HEIGHT, 40)).toBe('336px')
  })

  it('treats unmeasurable input as no keyboard', () => {
    expect(composerBottomCss(NaN, 40)).toBe(
      'calc((40px + var(--safe-bottom)) * var(--nina-bar-visible, 0))',
    )
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    // The inset stays in the sum: a caller who cannot say how much chrome is below still gets a
    // bar that pads correctly once the flag goes to 1.
    expect(composerBottomCss(0, NaN)).toBe(
      'calc((0px + var(--safe-bottom)) * var(--nina-bar-visible, 0))',
    )
  })
})

describe('composerPadBottomCss', () => {
  it('carries the resting floor, gated as the complement of the offset', () => {
    // Invariant 5, as arithmetic: the offset multiplies its clearance by `f`, this multiplies its
    // floor by `1 - f`, and `f` is 0 or 1. One floor in the stack, in every state, always. The
    // floor's own value is the tab captions' distance — the owner's anchor was "the same value
    // that no 1 use", the distance he had already called right: its `inset / 2 + 4.75px`, minus
    // the 8 px of `py-2` the row below carries, is `inset / 2 - 3.25px`, floored at zero so glass
    // without an inset keeps the bare 8 px it always had and the painted box still reaches the
    // viewport's bottom edge.
    expect(composerPadBottomCss(0)).toBe(
      'calc(max(0px, var(--safe-bottom) / 2 - 3.25px) * (1 - var(--nina-bar-visible, 0)))',
    )
  })

  it('is the complement of the gate `composerBottomCss` uses, by the same variable', () => {
    // The two functions must read the SAME custom property or the complement is meaningless — a
    // padding gated on a variable nobody writes is a padding that is always on.
    expect(composerPadBottomCss(0)).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
    expect(composerBottomCss(0, 59)).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
    expect(composerPadBottomCss(0)).toContain('(1 - var(')
  })

  it('adds nothing at all when the keyboard is up', () => {
    // Exit criterion 3. Engaging the composer HIDES the bar, so the flag is 0 here and a flag-only
    // rule would pad by the inset — lifting the textarea a thumb's width off the keyboard's top
    // edge. The keyboard is the floor; the home indicator is behind it.
    expect(composerPadBottomCss(KEYBOARD_HEIGHT)).toBe('0px')
  })

  it('returns a LENGTH for zero, not a bare 0', () => {
    // It goes into `style.paddingBottom`. A length-typed function returns a length.
    expect(composerPadBottomCss(KEYBOARD_HEIGHT)).toBe('0px')
    expect(composerPadBottomCss(KEYBOARD_HEIGHT)).not.toBe('0')
  })

  it('treats unmeasurable overlap as no keyboard', () => {
    // Same degradation as `composerBottomCss`: unmeasurable means "no keyboard", because the
    // resting screen is the common case and a NaN must not decide geometry.
    for (const overlap of [NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      expect(composerPadBottomCss(overlap)).toBe(
        'calc(max(0px, var(--safe-bottom) / 2 - 3.25px) * (1 - var(--nina-bar-visible, 0)))',
      )
    }
  })
})
