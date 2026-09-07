import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The regression guard for "`/admin` was built desktop-first and I use it from an XS Max"
 * (`admin-responsive-nina-intimacy` R1, phase 1).
 *
 * A responsive shell is invisible to every tool in this repo. It is not a type, so `tsc` cannot see
 * it; it is not a lint rule, so `eslint` cannot; and no test that renders a component can see it
 * either, because the thing that decides the outcome is a media query a browser evaluates against a
 * viewport. `tests/pwa.install.test.ts` and `tests/motion.reducedMotion.test.ts` are the precedents
 * and both say the same of their own contracts — asserted here or not asserted at all — and both
 * take this approach: read the source as text and assert properties of it.
 *
 * WHY NOT A `scripts/check-*.mjs`. The bespoke CI guards exist for BOUNDARY properties that span
 * directories — which module may reach which, where a secret may appear. This is one stylesheet,
 * one layout and one nav, so it belongs in `npm test`, which the gate already runs.
 *
 * ── WHAT IS AND IS NOT ASSERTED ─────────────────────────────────────────────────────────────
 * Class ORDER is never asserted, because `prettier-plugin-tailwindcss` owns it and a test that
 * fights the formatter is a test that gets deleted. Where two utilities must be adjacent to be
 * matchable, the shape asserted is one `components/ui/TabBar.tsx` already ships in its formatted
 * form, so the sorter produces it rather than breaking it.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')

const globals = read('app/globals.css')
const adminLayout = read('app/admin/layout.tsx')
const adminNav = read('components/admin/AdminNav.tsx')

/**
 * Every `className="…"` literal in a `.tsx` source, joined.
 *
 * **Reading the class literals and not the whole file is load-bearing, not tidy.** Both of these
 * files carry long docstrings that QUOTE the utilities they are explaining — `app/admin/layout.tsx`
 * says out loud that it sets no `overflow-x` clip, and `components/admin/AdminNav.tsx` quotes the
 * package readme's `usePathname()` rule verbatim. A whole-file `not.toContain` would fail on the
 * explanation of the very property it is asserting, which is how a guard gets its explanation
 * deleted rather than its bug caught. (`tests/motion.reducedMotion.test.ts` strips comments first
 * for the same reason, in CSS, where stripping is easy.)
 */
function classNames(source: string): string {
  return [...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(' ')
}

const layoutClasses = classNames(adminLayout)
const navClasses = classNames(adminNav)

describe('the safe-area tokens', () => {
  it('defines all four insets, so a shell can pad any edge it reaches', () => {
    // The horizontal pair is 0px in portrait and 44px in landscape on the target device, which is
    // still below `lg` and therefore still the phone layout.
    for (const edge of ['top', 'bottom', 'left', 'right']) {
      expect(globals).toContain(`--safe-${edge}: env(safe-area-inset-${edge}, 0px);`)
    }
  })
})

describe('the admin shell', () => {
  it('keeps the dynamic viewport unit, not the small or the large one', () => {
    /*
     * `dvh` grows and shrinks with Safari's retracting toolbar. `svh` would leave a strip of
     * --paper under the shell whenever the toolbar hid; `lvh` would overflow whenever it showed.
     */
    expect(layoutClasses).toContain('min-h-dvh')
    expect(layoutClasses).not.toContain('min-h-screen')
  })

  it('pads its top and both sides by the matching inset', () => {
    expect(layoutClasses).toMatch(/pt-\[calc\(1rem\+var\(--safe-top\)\)\]/)
    expect(layoutClasses).toMatch(/pl-\[calc\(1rem\+var\(--safe-left\)\)\]/)
    expect(layoutClasses).toMatch(/pr-\[calc\(1rem\+var\(--safe-right\)\)\]/)
  })

  it('keeps min-w-0 on <main>, which is what stops a wide grid blowing out the track', () => {
    expect(adminLayout).toMatch(/<main className="min-w-0">/)
  })

  it('does not clip its own overflow', () => {
    /*
     * Deliberate. A component inside <main> wider than 382px is a bug phase 2 has to be able to
     * see, and a shell that hides it is a shell that hides the evidence. Asserted against the class
     * literals, because the layout's docstring explains this property in prose — see `classNames`.
     */
    expect(layoutClasses).not.toMatch(/\boverflow(-x)?-hidden\b/)
  })

  it('changes shape at exactly one breakpoint, and it is lg', () => {
    // 1024px. An iPhone XS Max is 414px upright and 896px sideways: both below it, both the phone
    // layout. A second breakpoint here is a second thing phase 2 would have to reason about.
    const variants = new Set([...layoutClasses.matchAll(/\b(sm|md|lg|xl|2xl):/g)].map((m) => m[1]))
    expect([...variants]).toEqual(['lg'])
  })
})

describe('the admin nav', () => {
  it('points every entry at a route that exists', () => {
    const hrefs = [...adminNav.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/image-generation',
      '/admin/photos',
      '/admin/memory',
      '/admin/shortcuts',
    ])
    for (const href of hrefs) {
      expect(existsSync(`${ROOT}app${href}/page.tsx`), `${href} has no page.tsx`).toBe(true)
    }
  })

  it('carries a phone label short enough for its cell', () => {
    // Two sets each added a route independently -- image-generation and shortcuts -- so the bar
    // went five -> seven in one merge. It is a 4x2 grid below `lg`, so a cell is 414 / 4 = 103.5px.
    // The 8-character ceiling is KEPT, and the arithmetic is why -- this is the six-across table
    // from `main` re-run for the shape that actually shipped:
    //
    //   cell           414 / 4            = 103.5px
    //   content box    103.5 - px-1 (4+4) =  95.5px
    //   8 characters   Poppins semibold, text-[11px], ~6.4px/char measured on the existing
    //                  "Overview" cell    =  ~51.0px
    //   slack                             =  ~44.5px
    //
    // Seven ACROSS was the alternative and it does not fit: 59.1px a cell, 51.1px of content box,
    // exactly the width of the eight characters, which is what `main`'s six-across comment costed
    // in advance. It would have forced the ceiling to 7 and the rewording of Overview and
    // Shortcut; 4x2 keeps every label and leaves ~44px of slack instead of ~0.
    //
    // NOTE THE AXIS: `docs/design-brief.md`'s 44pt minimum is a HEIGHT rule, and `h-14` satisfied
    // it at six across -- more cells make a row narrower per cell, never shorter. Width ran out,
    // not height. `the bar and the padding that clears it` below asserts the grid really is 4x2.
    // All seven clear the ceiling: Overview 8, Album 5, Persona 7, Images 6, Photos 6, Memory 6,
    // Shortcut 8.
    // `m[1]!` per `tests/tabbar.geometry.test.ts:86`, the sibling guard this file borrows its
    // shape from: a capture group that matched is a string, and `noUncheckedIndexedAccess`
    // cannot see that.
    const shorts = [...adminNav.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(shorts).toHaveLength(7)
    for (const short of shorts) {
      expect(short.length, `"${short}" will not fit a nav cell`).toBeLessThanOrEqual(8)
    }
  })

  it('pins itself to the bottom of the phone viewport and pads the home indicator', () => {
    expect(navClasses).toContain('fixed inset-x-0 bottom-0')
    expect(navClasses).toContain('pb-[var(--safe-bottom)]')
    expect(navClasses).toContain('pl-[var(--safe-left)]')
    expect(navClasses).toContain('pr-[var(--safe-right)]')
  })

  it('is still the sticky sidebar at lg', () => {
    expect(navClasses).toMatch(/lg:sticky/)
    expect(navClasses).toMatch(/lg:top-8/)
    expect(navClasses).toMatch(/lg:self-start/)
  })

  it('stays a Server Component, per the package readme rule', () => {
    /*
     * "Do not add active-link highlighting to AdminNav or UserPicker. usePathname() would turn a
     * static nav into a Client Component to bold one word."
     * (`components/admin/.workflows/package_readme.md`)
     *
     * The file's own docstring QUOTES that sentence, so this asserts on the directive and the
     * import graph rather than on the text — see `classNames` for the same trap in the layout.
     */
    expect(adminNav).not.toMatch(/^'use client'/m)
    expect(adminNav).not.toMatch(/from 'next\/navigation'/)
  })
})

describe('the bar and the padding that clears it', () => {
  /*
   * THE CASE THIS FILE EXISTS FOR. The bar's height lives in `AdminNav`'s `h-28` and the clearance
   * under `<main>` lives in the layout's `pb-[calc(8rem+var(--safe-bottom))]`; Tailwind can read
   * neither from a TypeScript constant, so the geometry is spelled twice by necessity —
   * `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a comment for the same reason. If the
   * bar grows and the padding does not, the last card of every admin page sits under it, on the one
   * device this phase was written for.
   *
   * The ROW COUNT joined the matched shape when the bar went multi-row, and the merge that brought
   * a SEVENTH route made it `grid-cols-4 grid-rows-2` at `h-28`. Seven single-row cells would be
   * 59.1px wide at 414px, whose 51.1px content box is exactly the eight characters the ceiling
   * above allows — so width, not height, is what ran out (`h-14` cleared the 44pt HEIGHT minimum
   * at six across and would at seven). 4x2 keeps a 56px-tall cell and widens it to 103.5px. Both
   * numbers are captured, because a cell's tap target is now the height DIVIDED by the row count
   * and a guard that read `h-28` as one cell would pass a bar with four rows of 28px.
   *
   * The matched shape is `TabBar`'s own formatted row with this bar's numbers in it, so the class
   * sorter produces it rather than breaking it — verified against `prettier-plugin-tailwindcss`
   * 0.8.1 / `tailwindcss` 4.3.3, which sorts `grid-rows-*` immediately after `grid-cols-*`.
   */
  const bar = navClasses.match(
    /grid h-(\d+) w-full max-w-\[470px\] grid-cols-(\d+) grid-rows-(\d+)/,
  )
  const clearance = layoutClasses.match(/pb-\[calc\((\d+(?:\.\d+)?)rem\+var\(--safe-bottom\)\)\]/)
  const cellCount = [...adminNav.matchAll(/short: '([^']*)'/g)].length

  it('spells both halves in the shape this case can read', () => {
    expect(
      bar,
      'AdminNav lost its `grid h-<n> w-full max-w-[470px] grid-cols-<n> grid-rows-<n>` row',
    ).not.toBeNull()
    expect(clearance, 'the admin layout lost its --safe-bottom clearance on <main>').not.toBeNull()
  })

  it('fits every route, with no blank row and at most one short row', () => {
    /*
     * This assertion was `cols * rows === cellCount` — an EXACT fit — and it held while the bar
     * carried six routes in a 3x2 grid. Seven routes cannot satisfy it: 7 is prime, so the only
     * uniform grid with no empty cell is one row of seven, and that layout was rejected on
     * measurement (59.1px a cell, a 51.1px content box, exactly the width of the eight characters
     * the ceiling above allows). A 4x2 grid therefore leaves ONE empty cell, deliberately, and
     * `AdminNav`'s own comment says so.
     *
     * Relaxed, not removed. The two defects the exact-fit form actually caught are both still
     * caught, and named separately so a failure says which one happened:
     *   - a grid too small for the routes, which clips or drops a cell;
     *   - a wholly blank row, which is 56px of dead bar.
     * The trailing gap is bounded at `cols - 1` by construction, so "at most one short row" is
     * the strongest true statement left.
     */
    const cols = Number(bar![2])
    const rows = Number(bar![3])
    expect(cols * rows, 'the grid has fewer cells than there are routes').toBeGreaterThanOrEqual(
      cellCount,
    )
    expect(cols * (rows - 1), 'the last row of the grid is entirely empty').toBeLessThan(cellCount)
    expect(cols * rows - cellCount, 'more than one row-worth of empty cells').toBeLessThan(cols)
  })

  it('reserves more room than the bar occupies', () => {
    // Tailwind spacing: --spacing is 0.25rem, so `h-28` is 28 * 4 = 112px. The +1 is the
    // `border-t`, which is part of the nav's border box and therefore part of what has to be
    // cleared.
    const barPx = Number(bar![1]) * 4 + 1
    const clearancePx = Number(clearance![1]) * 16
    expect(clearancePx).toBeGreaterThan(barPx)
  })

  it('gives every cell a tap target past the 44pt minimum, on both axes', () => {
    // docs/design-brief.md:175 — "Minimum 44 × 44pt tap targets", and the iOS constraints win over
    // any conflicting design output (line 18). A row is the bar's height over its row count; a
    // column is 414px — the XS Max portrait width — over its column count.
    expect((Number(bar![1]) * 4) / Number(bar![3])).toBeGreaterThanOrEqual(44)
    expect(414 / Number(bar![2])).toBeGreaterThanOrEqual(44)
  })

  it('keeps a cell wide enough for an eight-character label at text-[11px]', () => {
    // 82.8px is the five-across width the 8-character ceiling above was calibrated against. A
    // narrower cell than that is a cell those labels no longer fit, whatever the row count says.
    expect(414 / Number(bar![2])).toBeGreaterThanOrEqual(82.8)
  })
})
