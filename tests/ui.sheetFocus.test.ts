import { describe, expect, it } from 'vitest'

import { readRepoCode } from './support/importGraph'

/**
 * **The sheet must not steal focus from the field the reviewer is typing in.**
 *
 * Reported from a phone: editing a heart-rate zone, every single digit dismissed the keyboard.
 * The chain was four links long and none of them were in `ZoneBar`:
 *
 *   1. `ZoneBar` passes `onClose={() => setEditing(null)}` — an inline arrow, so a NEW function
 *      identity on every render. `SplitsTable` does the same.
 *   2. `Sheet`'s open-effect listed `onClose` in its dependency array.
 *   3. A keystroke pushes a value up to `ReviewClient`'s `draft` state, which re-renders `ZoneBar`,
 *      which mints a new `onClose`, which makes the deps compare unequal.
 *   4. So React tore the effect down and re-ran it — and the effect's other job is
 *      `panelRef.current?.focus()`. Focus left the input, and iOS dropped the keyboard.
 *
 * The dependency was spurious: `onClose` is only ever *read inside* the keydown listener, never
 * needed to decide whether to re-run. So it belongs in a ref, and the effect keys on `open` alone.
 *
 * ── WHY THIS TEST IS A TEXT SCAN ────────────────────────────────────────────────────────────
 * This repo has no component tests by design — `vitest.config.ts` runs `environment: 'node'` and
 * its `include` matches `*.test.ts` only. Rendering `Sheet` to assert "focus stayed put" would mean
 * adding jsdom and a testing library to catch one dependency array.
 *
 * A text scan proves more here anyway, for the same reason `tests/share.bundle.test.ts` gives: the
 * question is *"can this effect re-run on a re-render?"*, which is a property of the dependency
 * list itself, not of one rendered scenario. A DOM test would prove it for the interaction it
 * happened to simulate. This proves it for every consumer of `Sheet`, including the ones a future
 * feature adds — and it fails for the right reason, naming the dependency rather than reporting a
 * lost keyboard three components away from the cause.
 */

/**
 * Comments stripped, and that is load-bearing. The doc comment on the fix quotes
 * `panelRef.current?.focus()` in prose while explaining why the dependency was removed, so a scan
 * of the raw file finds the explanation before the code and asserts against the wrong effect — the
 * failure mode `readRepoCode` was written for.
 */
const SOURCE = readRepoCode('components/ui/Sheet.tsx')

/**
 * The dependency list of the effect that moves focus into the panel.
 *
 * Anchored on the focus call rather than on the first `React.useEffect` in the file, because there
 * is now legitimately more than one: the ref holding the latest `onClose` is synced by its own
 * effect, and that one *should* depend on `onClose`. Anchoring on the first effect measured the
 * wrong one and failed the fix it was written to verify.
 */
function focusEffectDeps(): string {
  const start = SOURCE.indexOf('panelRef.current?.focus()')
  expect(start, 'Sheet.tsx should still focus the panel on open').toBeGreaterThan(-1)
  const deps = SOURCE.slice(start).match(/\n\s*\},\s*\[([^\]]*)\]\)/)
  expect(deps, 'the focus effect should still have a dependency array').not.toBeNull()
  return deps![1]!
}

describe('Sheet does not re-run its focus effect on every render', () => {
  it('never lists onClose as a dependency of the effect that focuses the panel', () => {
    /*
     * THE assertion in this file. `onClose` is an inline arrow at both call sites, so listing it
     * here means "re-run on every render of the parent" — and re-running means stealing focus off
     * a live text input on every keystroke. If this fails, the fix is to read `onClose` through a
     * ref, never to memoise it at the call sites: that would leave the trap armed for the next
     * consumer, who has no reason to know it exists.
     */
    expect(focusEffectDeps()).not.toContain('onClose')
  })

  it('still keys on open, so the sheet focuses when it opens and restores when it closes', () => {
    expect(focusEffectDeps()).toContain('open')
  })

  it('reads the latest onClose through a ref, so Escape still calls the current callback', () => {
    // Dropping the dependency is only safe if the listener does not close over a stale `onClose`.
    expect(SOURCE).toMatch(/onCloseRef/)
  })

  it('focuses the panel in exactly one place, so there is one path to audit', () => {
    expect(SOURCE.match(/panelRef\.current\?\.focus\(\)/g) ?? []).toHaveLength(1)
  })
})
