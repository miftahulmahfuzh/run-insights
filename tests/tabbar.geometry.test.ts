import { describe, expect, it } from 'vitest'

import { readRepoCode } from './support/importGraph'

/**
 * **The tab bar must occupy exactly its own border box, and this file is what notices when it does
 * not.**
 *
 * MEASURED IN PRODUCTION: `/upload` was a 56 px coral circle, `absolute -top-5` against the bar's
 * `relative` grid and therefore out of flow, so 20 px of it hung above the nav's top edge and
 * painted over whatever screen was behind. The repo owner's screenshot of `/nina` shows it sitting
 * on top of a message bubble, with the bubble's text legible either side of it and hidden behind
 * it. The overhang also forced two derived defects that no type and no lint rule could see:
 *
 *   - the hide transform had to be `calc(100% + 20px)`, because `100%` is only the nav's border
 *     box — with a plain `100%`, 20 px of coral circle stayed on screen with the bar hidden;
 *   - `/nina`'s composer had to clear 78 px rather than the bar's height, which opened a band of
 *     scrolling conversation between the composer's bottom edge and the bar's top border. That
 *     band is what "user query dan bottom bar tidak menempel dengan baik" reported.
 *
 * So "nothing overhangs" is not a style preference. It is the premise the bar's transform and the
 * composer's clearance are both derived from, and re-introducing an overhang would be a silently
 * wrong bar rather than a broken one — every existing test would stay green.
 *
 * WHY THIS TEST IS STRUCTURAL. `vitest.config.ts` runs `environment: 'node'`, so no bar is ever
 * rendered in this repo's suite and no box can be measured. `tests/nina.sidebarProvider.test.ts`
 * and `lib/nina/chrome.test.ts`'s reduced-motion block established the answer: read the source as
 * text and assert properties of it. `readRepoCode` strips comments first, which is load-bearing
 * here rather than tidy — the bar's own header explains at length why `absolute` and `size-14` are
 * absent, and a guard that fires on its own explanation gets silenced instead of fixed.
 *
 * This is the home for the tab bar's geometry rules; the next one belongs here too.
 */

const BAR = 'components/ui/TabBar.tsx'

describe('the tab bar paints nothing above its own border box', () => {
  it('positions no cell out of the grid', () => {
    // The FAB was `absolute -top-5 left-1/2 … size-14 … rounded-full bg-z5`. Each of these tokens
    // is asserted separately because each is sufficient on its own: `absolute` without `-top-5` is
    // still a cell that has left the flow, and the next overhang will not be a byte-for-byte
    // revert of the last one.
    const code = readRepoCode(BAR)
    expect(code).not.toContain('absolute')
    expect(code).not.toContain('-top-')
    expect(code).not.toContain('size-14')
    // The coral FILL of a raised circle. `New` is coral in its text (`text-z5`), which costs no
    // space; a `bg-z5` back in this file means a painted shape again.
    expect(code).not.toContain('bg-z5')
  })

  it('gives the grid no positioning context, because nothing is positioned against it', () => {
    // `Tab`'s badge span keeps its own `relative` — that is what pins Nina's unread dot to her
    // glyph, and it is inside a cell. What must not come back is `relative` on the grid itself,
    // which is what the FAB's `absolute` was resolved against.
    const code = readRepoCode(BAR)
    expect(code).toContain('mx-auto grid h-[58px]')
    expect(code).not.toContain('relative mx-auto')
  })

  it('hides by translating its own height, with no arithmetic on top', () => {
    // `translate: '0 100%'`. The `calc(100% + ${TAB_BAR_FAB_OVERHANG_PX}px)` form existed only to
    // clear the FAB, so a `calc` on this property again means something is sticking out of the bar
    // again — and the symptom would be 20 px of chrome on a hidden bar, on phones with no
    // home-indicator inset only.
    const code = readRepoCode(BAR)
    expect(code).toContain("'0 100%'")
    expect(code).not.toMatch(/translate:[^\n]*calc/)
    expect(code).not.toContain('TAB_BAR_FAB_OVERHANG_PX')
  })
})

describe('`/upload` is a normal tab, in the centre cell', () => {
  it('is the third of five entries, which is what puts it at 50% of the bar', () => {
    // Positional and deliberately so: `(2 + 0.5) / 5` is exactly the middle. Appending `/upload`
    // to the end of `TABS` would move it to 90% of the bar's width and every type would still
    // check — the roadmap has called this tab "centre" since before it was one.
    const code = readRepoCode(BAR)
    const labels = [...code.matchAll(/label: '([^']+)'/g)].map((m) => m[1]!)
    expect(labels).toEqual(['Runs', 'Nina', 'New', 'Trends', 'Me'])
  })

  it('captions /upload with the word the request asked for', () => {
    const code = readRepoCode(BAR)
    expect(code).toMatch(/\{ href: '\/upload', label: 'New',/)
  })

  it('renders one cell per column', () => {
    // A `TABS` entry nothing renders is a route unreachable from the bar, which is the state
    // `/upload` was in before this change: it was in the markup, but not in `TABS`.
    const code = readRepoCode(BAR)
    expect(code).toContain('grid-cols-5')
    expect([...code.matchAll(/<Tab /g)]).toHaveLength(5)
  })

  it('paints New coral whether or not it is the active route', () => {
    // Coral is how the IA says upload is the one flow that matters, and the request was about
    // space, not emphasis — so `accent` REPLACES the active/inactive pair instead of being a third
    // branch of it. A `New` tab that greyed out on the other four screens would satisfy every
    // other assertion in this file and still have thrown away the reason the FAB existed.
    const code = readRepoCode(BAR)
    expect(code).toContain('accent: true')
    expect(code).toMatch(/accent \? 'text-z5' : active \? 'text-ink' : 'text-ink-3'/)
  })
})
