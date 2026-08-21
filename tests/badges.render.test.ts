import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BADGE_ART } from '@/lib/badges/badge-art'

import { BadgeShelf } from '@/components/profile/BadgeShelf'
import { RecordsTable } from '@/components/profile/RecordsTable'
import { BADGE_META } from '@/lib/badges/meta'
import { buildShelf } from '@/lib/badges/shelf'
import type { PeriodFacts } from '@/lib/badges/evaluate'
import type { StoredBadge } from '@/lib/badges/types'

/**
 * `/me`'s two new surfaces, rendered to static markup — the same technique and the same limits as
 * `tests/views.render.test.ts`. `createElement` rather than JSX because the runner's `include`
 * covers `tests/**\/*.test.ts` and a second config to admit `.tsx` would be the worse trade.
 *
 * What this catches that a test on `buildShelf` cannot: that the numbers and sentences **reach the
 * screen**. A correct `ShelfEntry[]` rendered by a component that prints `entry.key` where it meant
 * `entry.title` passes every assertion in `badges.shelf.test.ts`.
 *
 * What it does not catch, and what §13 still asks a human to do: whether 22 rows read well at 414 px
 * in both colour schemes. No assertion substitutes for opening it.
 */

const FACTS: PeriodFacts = {
  week: { weekKey: '2026-W34', runsThisWeek: 2, consecutiveQualifyingWeeks: 1 },
  month: { monthKey: '2026-08', monthDistanceM: 116_000 },
  lifetime: { dawnRunCount: 6 },
}

const rows: StoredBadge[] = [
  { key: 'late_start', runId: 'run_canonical', scopeKey: null, earnedOn: '2026-08-20', count: 1 },
  { key: 'tourist', runId: 'run_canonical', scopeKey: null, earnedOn: '2026-08-20', count: 3 },
]

describe('BadgeShelf', () => {
  const html = renderToStaticMarkup(createElement(BadgeShelf, { shelf: buildShelf(rows, FACTS) }))

  it('states the count both ways, with no total to complete', () => {
    expect(html).toContain('2 earned')
    expect(html).toContain('20 to find')
    // No "2 of 22", no bar, no percentage: §10.2's whole argument is that this is a reference table
    // and not a checklist.
    expect(html).not.toContain('2 of 22')
    expect(html).not.toContain('%')
  })

  it('renders every one of the 22 titles, earned or not', () => {
    expect(html).toContain('Fashionably Late')
    expect(html).toContain('Warm-Up? Never Met Her')
    expect(html).toContain('Boring Excellence')
    expect(html).toContain('Two-a-Days')
  })

  it('prints a locked badge’s condition and gloss in full', () => {
    expect(html).toContain(BADGE_META.half_ish.condition.replace(/'/g, '&#x27;'))
    expect(html).toContain('The legs paid the bill.')
  })

  it('dates an earned badge and only mentions the count once it means something', () => {
    expect(html).toContain('Thu, 20 Aug 2026')
    // `tourist` was earned three times, `late_start` once. The row names which earning the date
    // belongs to; the pill on the patch carries the number itself.
    expect(html).toContain('most recent of 3')
    expect(html).toContain('\u00d73')
    expect(html).not.toContain('most recent of 1')
    expect(html).not.toContain('\u00d71')
  })

  it('makes every row a button that names its own state (F12)', () => {
    // Twenty-two rows, twenty-two buttons, and no twenty-third: the panel is ONE dialog driven by
    // the selection, so a shut shelf ships no extra control.
    expect(html.match(/<button/g)).toHaveLength(22)
    expect(html).toContain('aria-label="Tourist \u2014 earned 3 times. Show the badge."')
    expect(html).toContain('aria-label="Fashionably Late \u2014 earned once. Show the badge."')
    expect(html).toContain('aria-label="Half-ish \u2014 not yet earned. Show the badge."')
  })

  it('renders no panel content while the shelf is shut', () => {
    // The <dialog> is in the markup; its subtree is not. A shut panel whose prose stays in the
    // document is prose a screen reader reaches in the reading order of everything else on /me.
    expect(html).toContain('<dialog')
    expect(html).not.toContain('Earned once')
    expect(html).not.toContain('Not yet earned')
    // The 768px art belongs to the panel alone. The shelf draws the 192px derivative.
    expect(html).not.toContain(BADGE_ART.tourist.src)
    expect(html).toContain(BADGE_ART.tourist.small)
  })

  it('carries R-44’s progress line on the accumulating badges, and nowhere else', () => {
    expect(html).toContain('116 km this month')
    expect(html).toContain('2 of 4 this week')
    expect(html).toContain('6 of 10 so far')
    // The sentence R-44 explicitly forbids would have to mention a share of a run.
    expect(html).not.toContain('of the way to')
  })

  it('draws the locked patches dashed and desaturated, and the earned ones solid (R-36/R-43)', () => {
    expect(html).toContain('border-dashed')
    expect(html).toContain('grayscale')
    expect(html).toContain('border-solid')
  })

  it('draws F10’s art on each badge’s own sampled twill, never a shared placeholder', () => {
    // This assertion used to read `toContain('bg-[#1d2436]')` — the navy placeholder F09 shipped
    // while F10's art did not exist. R-36 recorded that navy as the *intended* treatment rather
    // than a stand-in, and it turned out to be the navy F10's style block asked the model for, so
    // the repaint is a substitution and not a reversal. What replaced it is stronger to assert.
    for (const key of ['early_bird', 'boring_excellence'] as const) {
      const art = BADGE_ART[key]
      expect(html).toContain(art.small)
      // Content-hashed, which is what licenses the `immutable` header in next.config.ts.
      expect(art.small).toMatch(/^\/badges\/[a-z0-9_]+\.[0-9a-f]{8}\.sm\.webp$/)
      // Per badge, not one constant: every master's cloth is separately generated, and the box
      // behind the art has to be that master's own twill or its clipped corners show a seam.
      expect(html).toContain(`background-color:${art.twill}`)
    }
    // The placeholder is gone rather than merely covered.
    expect(html).not.toContain('bg-[#1d2436]')
  })
})

describe('RecordsTable', () => {
  it('renders the fixture’s records with their labels, values and dates', () => {
    const html = renderToStaticMarkup(
      createElement(RecordsTable, {
        rows: [
          {
            key: 'longest_distance',
            runId: 'run_canonical',
            value: 10_670,
            achievedOn: '2026-08-20',
            previousValue: null,
          },
          {
            key: 'fastest_pace_10k',
            runId: 'run_canonical',
            value: 442,
            achievedOn: '2026-08-20',
            previousValue: 455,
          },
          {
            key: 'best_paced_run',
            runId: 'run_canonical',
            value: 1235,
            achievedOn: '2026-08-20',
            previousValue: null,
          },
        ],
      }),
    )

    // Every unit through lib/format.ts (R-23): a period decimal separator, `7'22"/km`, and basis
    // points rendered as the percentage they encode.
    expect(html).toContain('10.67 km')
    expect(html).toContain('7&#x27;22&quot;/km')
    expect(html).toContain('12.3%')
    expect(html).toContain('Thu, 20 Aug 2026')
    // `previousValue` is the interesting half of the row where it exists.
    expect(html).toContain('was 7&#x27;35&quot;/km')
    // The label carries the qualifier, so a caller cannot render "your 10k PB".
    expect(html).toContain('Fastest pace, 10 km+')
    expect(html).toContain('/r/run_canonical')
  })

  it('says so plainly when there is nothing yet, rather than printing zeros', () => {
    const html = renderToStaticMarkup(createElement(RecordsTable, { rows: [] }))
    expect(html).toContain('No records yet')
    expect(html).not.toContain('0.00 km')
  })
})
