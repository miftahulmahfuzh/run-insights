import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { composerPadBottomCss, NINA_BAR_VISIBLE_VAR } from './chatview'
import {
  autoHideDelayMs,
  barToggleGlyph,
  CHROME_AUTOHIDE_MS,
  CHROME_CONTROL_GAP_PX,
  COMPOSER_RESTING_PX,
  controlBottomCss,
  isControlVisible,
  nextBarState,
  type NinaBarState,
} from './chrome'

/**
 * `TAB_BAR_OUTER_HEIGHT_PX`: the bar's 39 px grid plus the 1 px `border-t` the grid sits under.
 * Spelled here so the test names its own input, and 40 rather than 39 because the border is part of
 * the nav's border box — a lane that clears only the grid clears one pixel too little.
 */
const BAR_CLEARANCE = 40

describe('CHROME_AUTOHIDE_MS', () => {
  it('is exactly the five seconds the requirement asks for', () => {
    // R1's only number. Asserted rather than assumed, because a "5 s auto-hide" that is 3 s is a
    // silently wrong feature rather than a broken one.
    expect(CHROME_AUTOHIDE_MS).toBe(5000)
  })
})

describe('nextBarState', () => {
  it('flips on a toggle, both ways', () => {
    expect(nextBarState('hidden', 'toggle')).toBe('shown')
    expect(nextBarState('shown', 'toggle')).toBe('hidden')
  })

  it('hides on autohide, and is idempotent', () => {
    // The timer means "be hidden", not "flip". A fired timer arriving after he already pressed `v`
    // must not toggle the bar back on — that race is removed here rather than in the component.
    expect(nextBarState('shown', 'autohide')).toBe('hidden')
    expect(nextBarState('hidden', 'autohide')).toBe('hidden')
  })

  it('hides the moment the composer is engaged', () => {
    // The whole of D3: the bar cannot retract mid-sentence because it is never showing mid-sentence.
    expect(nextBarState('shown', 'composer-engaged')).toBe('hidden')
    expect(nextBarState('hidden', 'composer-engaged')).toBe('hidden')
  })

  it('never restores anything when the composer is released', () => {
    // A bar that pops back up on blur is the app overruling the toggle he pressed.
    expect(nextBarState('hidden', 'composer-released')).toBe('hidden')
    expect(nextBarState('shown', 'composer-released')).toBe('shown')
  })
})

describe('autoHideDelayMs', () => {
  it('runs the timer only for a shown bar with a free composer', () => {
    expect(autoHideDelayMs('shown', false)).toBe(CHROME_AUTOHIDE_MS)
  })

  it('runs no timer while the composer is engaged', () => {
    // Not because it would hide mid-sentence — `composer-engaged` already hid it — but so that a
    // stale timer cannot be pending across a focus change.
    expect(autoHideDelayMs('shown', true)).toBeNull()
  })

  it('runs no timer for an already hidden bar', () => {
    expect(autoHideDelayMs('hidden', false)).toBeNull()
    expect(autoHideDelayMs('hidden', true)).toBeNull()
  })
})

describe('isControlVisible', () => {
  it('retracts the control while the composer is engaged', () => {
    // With a keyboard up the lane is behind it, so this is a button that could not be pressed.
    expect(isControlVisible(true)).toBe(false)
    expect(isControlVisible(false)).toBe(true)
  })
})

describe('barToggleGlyph', () => {
  it('shows the up arrow when there is a bar to pull up', () => {
    expect(barToggleGlyph('hidden')).toBe('up')
  })

  it('shows the down arrow when there is a bar to push down', () => {
    expect(barToggleGlyph('shown')).toBe('down')
  })
})

describe('controlBottomCss', () => {
  /** The gated form: the inset cancels itself in whichever state does not need it. */
  const GATED = `var(--safe-bottom) * var(${NINA_BAR_VISIBLE_VAR}, 0)`

  it('clears a measured resting composer and the gap when the bar is hidden', () => {
    // 60 + 8. The inset term is present but multiplied by 0 in this state, because the composer's
    // own `padding-bottom` is carrying it and the measurement therefore already contains it.
    expect(
      controlBottomCss({
        barState: 'hidden',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + ${GATED})`)
  })

  it('ignores the clearance entirely while the bar is hidden', () => {
    // The clearance is an argument, not a state. A hidden bar occupies nothing, whatever it says.
    const hidden = controlBottomCss({
      barState: 'hidden',
      barClearancePx: BAR_CLEARANCE,
      composerHeightPx: COMPOSER_RESTING_PX,
    })
    const noBarAtAll = controlBottomCss({
      barState: 'hidden',
      barClearancePx: 0,
      composerHeightPx: COMPOSER_RESTING_PX,
    })
    expect(hidden).toBe(noBarAtAll)
  })

  it("rises by the bar's outer height when the bar is shown", () => {
    // Outer, not the grid: the `border-t` is the bar's top edge, and the lane sits above the
    // composer, which sits on that edge. 59 + 60 + 8 = 127, and the inset is added on top by the
    // gate — because in THIS state the composer's padding is 0 and the inset rides in its offset.
    expect(
      controlBottomCss({
        barState: 'shown',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(`calc(${BAR_CLEARANCE + COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + ${GATED})`)
  })

  it('gates the inset on the same variable the composer does', () => {
    // R1's invariant, from this side: the composer's `padding-bottom` adds the inset when the flag
    // is 0 and this adds it when the flag is 1. Two complementary gates on ONE variable is what
    // makes the inset appear exactly once. A literal `var(--safe-bottom)` added beside the length
    // is what counting it twice looks like.
    const measured = controlBottomCss({
      barState: 'hidden',
      barClearancePx: BAR_CLEARANCE,
      composerHeightPx: COMPOSER_RESTING_PX,
    })
    expect(measured).toContain(`var(${NINA_BAR_VISIBLE_VAR}, 0)`)
    expect(measured).not.toBe(
      `calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`,
    )
  })

  it('rides up with a composer that has grown', () => {
    // A reply strip, a run chip, a photo chip and a tile row all make the composer taller. The lane
    // is measured off it rather than assumed, which is the only version that cannot end up behind
    // the composer's `z-40` background.
    expect(
      controlBottomCss({
        barState: 'hidden',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: 190,
      }),
    ).toBe(`calc(${190 + CHROME_CONTROL_GAP_PX}px + ${GATED})`)
  })

  it('falls back to a resting composer before the first measurement, WITH the floor ungated', () => {
    // The one branch that must not gate. `COMPOSER_RESTING_PX` is the content box and carries no
    // floor, so the fallback supplies it — and supplies it AS `composerPadBottomCss(0)`, the same
    // string the element itself carries at rest, so this branch tracks the floor's formula rather
    // than a second spelling of it (the floor has already changed once: 34 px of inset became the
    // 30% floor). The gated inset rides beside it for the showing state. Without the floor the
    // server's HTML and the first paint put the two controls behind the composer's glass by
    // exactly its height.
    for (const height of [0, -20, NaN, Number.POSITIVE_INFINITY]) {
      expect(
        controlBottomCss({
          barState: 'hidden',
          barClearancePx: BAR_CLEARANCE,
          composerHeightPx: height,
        }),
      ).toBe(
        `calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + ${composerPadBottomCss(0)} + var(--safe-bottom) * var(${NINA_BAR_VISIBLE_VAR}, 0))`,
      )
    }
  })

  it('emits a different shape measured than unmeasured, and that is the point', () => {
    // Guards the two branches against being "simplified" back into one. They are the same length
    // and a different inset term, which is the whole of the fallback argument.
    const unmeasured = controlBottomCss({
      barState: 'hidden',
      barClearancePx: 0,
      composerHeightPx: 0,
    })
    const measured = controlBottomCss({
      barState: 'hidden',
      barClearancePx: 0,
      composerHeightPx: COMPOSER_RESTING_PX,
    })
    expect(unmeasured).not.toBe(measured)
    expect(unmeasured).toContain(`${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px`)
    expect(measured).toContain(`${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px`)
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    for (const clearance of [NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(
        controlBottomCss({
          barState: 'shown',
          barClearancePx: clearance,
          composerHeightPx: COMPOSER_RESTING_PX,
        }),
      ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + ${GATED})`)
    }
  })

  it('rounds a fractional measurement rather than emitting a fractional length', () => {
    // `getBoundingClientRect().height` is a double. `calc(60.328125px + …)` is valid CSS and an
    // unreadable diff.
    expect(
      controlBottomCss({ barState: 'hidden', barClearancePx: 0, composerHeightPx: 60.328125 }),
    ).toBe(`calc(${60 + CHROME_CONTROL_GAP_PX}px + ${GATED})`)
  })

  it('is total over the state union', () => {
    const states: NinaBarState[] = ['hidden', 'shown']
    for (const barState of states) {
      expect(
        controlBottomCss({ barState, barClearancePx: BAR_CLEARANCE, composerHeightPx: 60 }),
      ).toMatch(/^calc\(\d+px \+ var\(--safe-bottom\) \* var\(--nina-bar-visible, 0\)\)$/)
    }
  })
})

/**
 * Invariant 8, for the one property no type and no lint rule can see.
 *
 * `tests/motion.reducedMotion.test.ts` guards `@keyframes` and their escapes; this reveal is a
 * `transition-*`, so that suite is silent about it by design. `tests/pwa.install.test.ts` is the
 * precedent for the technique and says the same of an install contract — asserted here or not
 * asserted at all — and takes the same approach: read the source as text and assert properties of
 * it.
 *
 * Here rather than in `tests/` because the rule and its enforcement belong together, and this
 * module is where the rule lives.
 */
describe('the reveal is a transition with a reduced-motion escape', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../components/ui/TabBar.tsx', import.meta.url)),
    'utf8',
  )

  it('animates the translate longhand, which is what Tailwind v4 compiles to', () => {
    expect(source).toContain('transition-[translate]')
  })

  it('holds still under prefers-reduced-motion', () => {
    expect(source).toContain('motion-reduce:transition-none')
  })

  it('adds no keyframe', () => {
    // A second keyframe would be the first in the codebase. `app/globals.css` owns the only one.
    expect(source).not.toContain('@keyframes')
    expect(source).not.toContain('[animation:')
  })
})
