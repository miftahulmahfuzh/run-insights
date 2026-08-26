import { describe, expect, it } from 'vitest'

import { readRepoCode } from './support/importGraph'

/**
 * **The dimming must not creep back, and the race fix must not be undone.** Card #3 / F16.
 *
 * The upload page showed three screenshots and a Summary / Splits / Heart rate toggle under each.
 * A heart-rate screenshot arrived labelled Summary — the defaults came from pick order, which was
 * then the Fitness app's order, not the order the OS photo picker hands files over in (F29 has
 * since pointed the default at the device's own order) — and it could not be corrected. `KindSelector` rendered every kind another tile held as `disabled` at 35%
 * opacity, and since there are exactly as many kinds as slots, a full three-screen upload meant
 * every non-selected button in every tile was dead.
 *
 * ── WHY THIS TEST IS A TEXT SCAN ────────────────────────────────────────────────────────────
 * This repo has no component tests by design — `vitest.config.ts` runs `environment: 'node'` and
 * its `include` matches `*.test.ts` only. The behavioural half of F16 is proved properly, as pure
 * logic, in `tests/extract.reassignKind.test.ts`.
 *
 * What is left over are two properties of the *source* rather than of any one rendered scenario,
 * which is the same case `tests/ui.sheetFocus.test.ts` makes: "can this control disable itself?"
 * and "can a superseded upload still write?" are answered by reading the module, and answering
 * them that way covers every future interaction rather than the one a DOM test would simulate.
 *
 * `readRepoCode` strips comments first, so the paragraphs above — and the ones in the modules
 * themselves, which discuss `taken` and `opacity` at length — do not trip the assertions.
 */

const SELECTOR = 'components/extract/KindSelector.tsx'
const PICKER = 'components/extract/UploadPicker.tsx'

describe('KindSelector cannot disable itself into a corner', () => {
  const code = readRepoCode(SELECTOR)

  /**
   * The whole defect in one assertion. `taken` was the set of kinds other tiles held; rendering it
   * as unavailable is what froze the control. Distinctness is kept by swapping now
   * (`lib/extract/reassignKind.ts`) and enforced server-side by `ExtractRequestSchema`, so this
   * component has no business knowing about its neighbours at all.
   */
  it('does not know what other tiles hold', () => {
    expect(code).not.toMatch(/\btaken\b/)
  })

  it('has no dimmed state — not even a softened one', () => {
    expect(code).not.toMatch(/opacity/)
  })

  /**
   * `disabled` itself is legitimate and must stay: it is the `submitting` guard, which stops a
   * runner relabelling a screen while the extraction request is already in flight. So this asserts
   * the prop survives rather than that the word is absent.
   */
  it('still honours the submitting guard', () => {
    expect(code).toMatch(/disabled\?:\s*boolean/)
    expect(code).toMatch(/disabled=\{disabled\}/)
  })

  it('keeps every kind reachable, with only selection changing the look', () => {
    expect(code).toMatch(/SCREEN_KINDS\.map/)
    expect(code).toMatch(/onClick=\{\(\) => onChange\(kind\)\}/)
  })
})

describe('UploadPicker swaps, and cannot be beaten by a stale upload', () => {
  const code = readRepoCode(PICKER)

  it('routes kind changes through the pure swap rule', () => {
    expect(code).toMatch(/reassignKind/)
    expect(code).not.toMatch(/\btakenBy\b/)
  })

  /**
   * The race: `changeKind` restarts `process` while the previous one may still be in flight, and
   * the older promise finishes by writing `state: 'ready'` with a blob carrying the stale kind.
   * The guard is the whole reason `Tile` carries `gen`, so every write from inside `process` must
   * go through the generation-checked patch — a plain `patch(` reappearing here is the fix being
   * silently undone.
   */
  it('writes in-flight upload results only through the generation guard', () => {
    expect(code).toMatch(/\bgen:\s*number\b/)
    expect(code).toMatch(/t\.id === id && t\.gen === gen/)
    expect(code).not.toMatch(/[^a-zA-Z]patch\(tile\.id,/)
  })

  it('bumps the generation on every tile whose kind moved', () => {
    expect(code).toMatch(/gen:\s*tile\.gen \+ 1/)
  })

  /**
   * StrictMode may invoke a state updater twice in dev, which would double-fire an upload. The
   * `process` calls in `changeKind` therefore sit after `setTiles(bumped)`, not inside an updater.
   */
  it('launches the re-uploads outside the state updater', () => {
    const changeKind = code.slice(code.indexOf('const changeKind'), code.indexOf('const remove'))
    expect(changeKind).toMatch(/setTiles\(bumped\)/)
    expect(changeKind).not.toMatch(/setTiles\(\(/)
  })
})
