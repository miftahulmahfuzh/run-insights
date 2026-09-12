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
/*
 * `admin-bottom-bar-active-tab` split the nav in two: `AdminNav.tsx` is the server shell (`<nav>`,
 * eyebrow, footer) and `AdminNavLinks.tsx` is the client leaf that reads the pathname (LINKS, the
 * row, the glyphs). Row-level assertions read the LEAF; nav-level assertions read the SHELL; the
 * split itself is pinned in its own `it` below.
 */
const adminNavLinks = read('components/admin/AdminNavLinks.tsx')

/**
 * Every `className="…"` literal in a `.tsx` source, joined.
 *
 * **Reading the class literals and not the whole file is load-bearing, not tidy.** Both of these
 * files carry long docstrings that QUOTE the utilities they are explaining — `app/admin/layout.tsx`
 * says out loud that it sets no `overflow-x` clip, and `components/admin/AdminNavLinks.tsx` quotes
 * the package readme's `usePathname()` rule verbatim. A whole-file `not.toContain` would fail on the
 * explanation of the very property it is asserting, which is how a guard gets its explanation
 * deleted rather than its bug caught. (`tests/motion.reducedMotion.test.ts` strips comments first
 * for the same reason, in CSS, where stripping is easy.)
 */
function classNames(source: string): string {
  return [...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(' ')
}

const layoutClasses = classNames(adminLayout)
const navClasses = classNames(adminNav)
const rowClasses = classNames(adminNavLinks)

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
    const hrefs = [...adminNavLinks.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/image-generation',
      '/admin/memory',
      '/admin/shortcuts',
      '/admin/error-logs',
    ])
    for (const href of hrefs) {
      expect(existsSync(`${ROOT}app${href}/page.tsx`), `${href} has no page.tsx`).toBe(true)
    }
  })

  it('carries one non-empty short string per cell: the accessible names', () => {
    /*
     * `admin-bottom-bar-icons` R2 took the words off the bar, so `short` stopped being rendered
     * text and became each link's sr-only accessible name -- the string VoiceOver announces where
     * the glyph is `aria-hidden` decor. The 8-character CELL ceiling this test used to hold is
     * retired with the text it measured: it existed because the text bar's 414px / 7 = 59.1px cell
     * was a 51.1px content box, the exact width of eight characters of Poppins semibold at 11px --
     * and a glyph has no character count (the row is seven cells now, 414px / 7 = 59.1px, still
     * past the 44pt floor with 15px to spare). What the new role still needs caught: seven
     * entries, one per cell
     * (counted against the grid in `the bar and the padding that clears it`), and non-empty -- an
     * empty accessible name is worse than none, announced as "link" with nothing after it.
     *
     * `m[1]!` per `tests/tabbar.geometry.test.ts:86`, the sibling guard this file borrows its
     * shape from: a capture group that matched is a string, and `noUncheckedIndexedAccess`
     * cannot see that.
     */
    const shorts = [...adminNavLinks.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(shorts).toHaveLength(7)
    for (const short of shorts) {
      expect(short.length, `"${short}" is an empty accessible name`).toBeGreaterThan(0)
    }
  })

  it('names the collection route "Image collection" and keeps every accessible name distinct', () => {
    /*
     * R4 renamed the album page. The `short` is the phone bar's accessible name, and the one
     * collision the rename had to avoid is "Images" -- the image-generation route -- so the
     * collection took "Photos", free since the chat-photos route merged away (this set's phase 2;
     * the assertion below FAILS until that entry is gone). Two cells announcing the same name
     * would make "Photos" ambiguous to a screen reader, so distinctness is pinned here
     * rather than trusted to review. The count is derived, never hardcoded: the cell count is
     * the other test's to hold.
     */
    expect(adminNavLinks).toContain(
      "{ href: '/admin/nina', label: 'Image collection', short: 'Photos', icon: ImagesIcon },",
    )
    const shorts = [...adminNavLinks.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(new Set(shorts).size, 'two cells share an accessible name').toBe(shorts.length)
  })

  it('renders every phone cell as one aria-hidden glyph plus one sr-only name', () => {
    /*
     * R2's shape, held per cell: the glyph is decoration (`aria-hidden`), the `<span>` is the
     * name. The svgs are counted by OPEN TAG (`<svg` up to the first `>`), not by the substring
     * "svg", so a comment saying the word cannot satisfy the count. The span is matched as source
     * because its classes are a literal but its content is JSX -- `classNames()` joins only the
     * `className="..."` literals and cannot carry the `{link.short}` part.
     *
     * The span is ONE template, not seven literals: the cell lives inside `LINKS.map()`, so the
     * source spells the sr-only name once and the seven rendered names are that template times
     * the seven `short` strings -- counted, and held non-empty, in the accessible-names `it`
     * above. `toHaveLength(1)` is therefore the exact-fit form here: two spans would mean a
     * second cell template somewhere, zero means the bar lost its names.
     */
    const svgTags = [...adminNavLinks.matchAll(/<svg\b[\s\S]*?>/g)].map((m) => m[0]!)
    expect(svgTags, 'the bar no longer inlines one glyph per cell').toHaveLength(7)
    for (const tag of svgTags) {
      expect(tag, 'a glyph is not aria-hidden decor').toContain('aria-hidden="true"')
    }
    const names = [
      ...adminNavLinks.matchAll(/<span className="sr-only lg:hidden">\{link\.short\}<\/span>/g),
    ]
    expect(names, 'the cell template lost its sr-only accessible-name span').toHaveLength(1)
  })

  it('inlines seven DISTINCT glyphs', () => {
    /*
     * The photograph pair is the hard part of an icon bar: two routes a reader tells apart by
     * words alone ("Image collection" / "Image Generation"), which is why they were never
     * allowed to become two picture outlines that differ by a corner. Lucide's `images` (a
     * stack) / `wand-sparkles` (how a photo is MADE) are two different silhouettes; this holds
     * the line, because a copy-pasted glyph body would pass the count above and fail here.
     */
    const glyphs = [...adminNavLinks.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0]!)
    expect(new Set(glyphs).size, 'two cells render the same glyph').toBe(7)
  })

  it('pins itself to the bottom of the phone viewport and pads HALF the home indicator', () => {
    /*
     * `admin-bottom-bar-active-tab`: R1 padded the row by the full `--safe-bottom`; the owner
     * asked for the icons nearer the screen's bottom edge — *"reduce the current distance value
     * by half"* — so the pad is now the inset over two. The horizontal pair keeps its full inset
     * (the notch, in landscape): only the bottom was ordered closer.
     */
    expect(navClasses).toContain('fixed inset-x-0 bottom-0')
    expect(navClasses).toContain('pb-[calc(var(--safe-bottom)/2)]')
    expect(navClasses).toContain('pl-[var(--safe-left)]')
    expect(navClasses).toContain('pr-[var(--safe-right)]')
  })

  it('is still the sticky sidebar at lg', () => {
    expect(navClasses).toMatch(/lg:sticky/)
    expect(navClasses).toMatch(/lg:top-8/)
    expect(navClasses).toMatch(/lg:self-start/)
  })

  it('keeps the shell a Server Component and the pathname quarantined in one client leaf', () => {
    /*
     * "Do not add active-link highlighting to AdminNav or UserPicker. usePathname() would turn a
     * static nav into a Client Component to bold one word."
     * (`components/admin/.workflows/package_readme.md`)
     *
     * `admin-bottom-bar-active-tab` overruled the AdminNav half of that rule — the owner's own
     * sentence ordered the active tab's icon painted blue — but NOT its arithmetic: the nav did
     * not go wholly client. The boundary is pinned from BOTH sides: the shell carries no
     * directive and no router import, and the leaf carries exactly the one directive and the one
     * import that justify its existence. Both docstrings narrate the rule, so these assert on
     * the directive lines and the import graph rather than on prose — see `classNames` for the
     * same trap in the layout. The UserPicker half of the rule still binds.
     */
    expect(adminNav).not.toMatch(/^'use client'/m)
    expect(adminNav).not.toMatch(/from 'next\/navigation'/)
    expect(adminNavLinks).toMatch(/^'use client'/m)
    expect(adminNavLinks).toMatch(/import \{ usePathname \} from 'next\/navigation'/)
  })

  it('paints the active cell accent and names it with aria-current', () => {
    /*
     * `admin-bottom-bar-active-tab`: the owner's order, spelled — the active tab's icon in the
     * same blue as the *"Manage the album"* link (`text-accent`, `app/admin/page.tsx`) — the
     * collection card's link, renamed "Manage the collection" by R4. The accent sits on the
     * GLYPH's conditional — where its `lg:hidden` scopes it to the phone bar — and not on the
     * link's own class string, so the `lg` sidebar's labels cannot inherit it;
     * `aria-current` is the accessible half, `UserPicker`'s precedent. Asserted on the source
     * because both live in JSX expressions, which `classNames()` does not join.
     */
    expect(adminNavLinks).toContain("'size-6 text-accent lg:hidden'")
    expect(adminNavLinks).toContain("aria-current={active ? 'page' : undefined}")
  })
})

describe('the bar and the padding that clears it', () => {
  /*
   * THE CASE THIS FILE EXISTS FOR. The bar's height lives in `AdminNav`'s `h-14` and the clearance
   * under `<main>` lives in the layout's `pb-[calc(5rem+var(--safe-bottom))]`; Tailwind can read
   * neither from a TypeScript constant, so the geometry is spelled twice by necessity --
   * `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a comment for the same reason. If the
   * bar grows and the padding does not, the last card of every admin page sits under it, on the one
   * device this phase was written for.
   *
   * The bar is ONE ROW again (`admin-bottom-bar-icons` R3): `grid-cols-7` at `h-14`, which is the
   * shape the 4x2 text grid replaced when seven LABELS would not fit across -- 59.1px a cell was a
   * 51.1px content box then, exactly eight characters with nothing to spare; the seven-cell row is
   * that same 59.1px a cell again (57.1px at `px-[7px]`), and a 24px glyph does not
   * measure characters. The matched shape is `TabBar`'s own formatted row with this bar's numbers
   * in it, so the class sorter produces it rather than breaking it -- verified against
   * `prettier-plugin-tailwindcss` 0.8.1 / `tailwindcss` 4.3.3, which sorted `grid-rows-*`
   * immediately after `grid-cols-*`; deleting it leaves every surviving family where it was.
   * `admin-bottom-bar-active-tab` added `px-[<n>px]` to that row and the sorter placed it after
   * `grid-cols-*` and before the `lg:` block, so the matched prefix is unchanged.
   */
  const bar = rowClasses.match(/grid h-(\d+) w-full max-w-\[470px\] grid-cols-(\d+)/)
  const clearance = layoutClasses.match(/pb-\[calc\((\d+(?:\.\d+)?)rem\+var\(--safe-bottom\)\)\]/)
  const cellCount = [...adminNavLinks.matchAll(/short: '([^']*)'/g)].length
  /*
   * The row's own horizontal padding, both sides -- `admin-bottom-bar-active-tab`'s *"kurangi saja
   * padding nya by 1px"* dial (`px-[7px]` narrows every glyph's side-air by exactly one pixel).
   * Read rather than hardcoded so the tap-target arithmetic below stays true when the owner dials
   * it again after seeing it in prod; 0 when the row goes back to unpadded.
   */
  const rowPad = Number(rowClasses.match(/px-\[(\d+(?:\.\d+)?)px\]/)?.[1] ?? 0) * 2

  it('spells both halves in the shape this case can read', () => {
    expect(
      bar,
      'AdminNav lost its `grid h-<n> w-full max-w-[470px] grid-cols-<n>` row',
    ).not.toBeNull()
    expect(clearance, 'the admin layout lost its --safe-bottom clearance on <main>').not.toBeNull()
  })

  it('is one row of exactly seven cells', () => {
    /*
     * The exact-fit assertion RETURNS from its relaxed form. It was `cols * rows === cellCount`
     * and held while six routes sat in a 3x2 grid; the seventh route made the count prime, so the
     * only uniform grid with no empty cell was one row of seven -- rejected for TEXT (59.1px a
     * cell, a 51.1px content box, exactly the eight characters the ceiling allowed), which is how
     * the bar went 4x2 with one empty cell and this guard was relaxed to "no blank row". Icons
     * un-reject the one-row layout, and the surface merge took the bar back to six routes -- so
     * every cell was spoken for again and the fit became exact. `nina-llm-fallback-error-logs` R2
     * adds the seventh, which is the layout this argument was originally costed for: 414px / 7 =
     * 59.1px a cell, a width a 24px glyph wears with 17.5px of air before the row's own
     * `px-[7px]` dial takes one pixel off each side.
     *
     * The row count is held by ABSENCE, on the class literals (see `classNames` for why not the
     * whole file, whose comments narrate the 4x2 as history): a bar that regains a second row
     * needs the layout's reserve to grow with it, and a test that read only "at least six
     * cells" would pass while the last card sat under the bar.
     */
    expect(Number(bar![2]), 'the grid does not have a cell per route').toBe(cellCount)
    expect(rowClasses, 'the bar grew a second row back').not.toMatch(/grid-rows/)
    expect(rowClasses).not.toContain('h-28')
  })

  it('reserves more room than the bar occupies', () => {
    // Tailwind spacing: --spacing is 0.25rem, so `h-14` is 14 * 4 = 56px. The +1 is the
    // `border-t`, which is part of the nav's border box and therefore part of what has to be
    // cleared. 5rem is 80px against that 57px: 23px of breathing room, the pre-4x2 pairing
    // restored with the row count. The 8rem reserve was the two-row bar's other half; it is
    // asserted absent on the CLASS LITERALS because the layout's docstring narrates it as
    // history, which a whole-file assertion would fail on.
    const barPx = Number(bar![1]) * 4 + 1
    const clearancePx = Number(clearance![1]) * 16
    expect(barPx).toBe(57)
    expect(clearancePx).toBe(80)
    expect(layoutClasses, 'the two-row reserve outlived the two-row bar').not.toContain('8rem')
    expect(clearancePx).toBeGreaterThan(barPx)
  })

  it('gives every cell a tap target past the 44pt minimum, on both axes', () => {
    // docs/design-brief.md:175 — "Minimum 44 × 44pt tap targets", and the iOS constraints win over
    // any conflicting design output (line 18). The bar is one row (no `grid-rows`, asserted
    // above), so a cell's height is the bar's height; a column is 414px -- the XS Max portrait
    // width -- minus the row's own `px` dial (see `rowPad`) over its column count: 57.1px at
    // `px-[7px]`, still past the minimum with 13px to spare.
    expect(Number(bar![1]) * 4).toBeGreaterThanOrEqual(44)
    expect((414 - rowPad) / Number(bar![2])).toBeGreaterThanOrEqual(44)
  })
})
