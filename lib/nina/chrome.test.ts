import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
 * `TAB_BAR_OUTER_HEIGHT_PX`: the bar's 58 px grid plus the 1 px `border-t` the grid sits under.
 * Spelled here so the test names its own input, and 59 rather than 58 because the border is part of
 * the nav's border box — a lane that clears only the grid clears one pixel too little.
 */
const BAR_CLEARANCE = 59

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
  it('clears a resting composer and the gap when the bar is hidden', () => {
    expect(
      controlBottomCss({
        barState: 'hidden',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
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
    // composer, which sits on that edge. R2's missing pixel was missing here too.
    expect(
      controlBottomCss({
        barState: 'shown',
        barClearancePx: BAR_CLEARANCE,
        composerHeightPx: COMPOSER_RESTING_PX,
      }),
    ).toBe(
      `calc(${BAR_CLEARANCE + COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`,
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
    ).toBe(`calc(${190 + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
  })

  it('falls back to a resting composer before the first measurement', () => {
    for (const height of [0, -20, NaN, Number.POSITIVE_INFINITY]) {
      expect(
        controlBottomCss({
          barState: 'hidden',
          barClearancePx: BAR_CLEARANCE,
          composerHeightPx: height,
        }),
      ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
    }
  })

  it('treats an unmeasurable clearance as no clearance', () => {
    for (const clearance of [NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(
        controlBottomCss({
          barState: 'shown',
          barClearancePx: clearance,
          composerHeightPx: COMPOSER_RESTING_PX,
        }),
      ).toBe(`calc(${COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
    }
  })

  it('rounds a fractional measurement rather than emitting a fractional length', () => {
    // `getBoundingClientRect().height` is a double. `calc(68.328125px + …)` is valid CSS and an
    // unreadable diff.
    expect(
      controlBottomCss({ barState: 'hidden', barClearancePx: 0, composerHeightPx: 68.328125 }),
    ).toBe(`calc(${68 + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`)
  })

  it('is total over the state union', () => {
    const states: NinaBarState[] = ['hidden', 'shown']
    for (const barState of states) {
      expect(
        controlBottomCss({ barState, barClearancePx: BAR_CLEARANCE, composerHeightPx: 68 }),
      ).toMatch(/^calc\(\d+px \+ var\(--safe-bottom\)\)$/)
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
