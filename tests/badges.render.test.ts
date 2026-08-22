import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BADGE_ART } from '@/lib/badges/badge-art'

import { BadgeDialog, EarnedDayList } from '@/components/profile/BadgeDialog'
import { BadgeShelf } from '@/components/profile/BadgeShelf'
import { RecordsTable } from '@/components/profile/RecordsTable'
import { BADGE_META } from '@/lib/badges/meta'
import { buildShelf } from '@/lib/badges/shelf'
import type { PeriodFacts } from '@/lib/badges/evaluate'
import type { StoredBadge } from '@/lib/badges/types'

/**
 * F24 put the shelf's open panel in the URL, so `BadgeShelf` now reads `useSearchParams()` and
 * cannot render outside a router. The mock IS the router and nothing else — one hook, backed by a
 * string this file sets — and every assertion below it is the one that was there before.
 *
 * `vi.hoisted` because `vi.mock` is hoisted above the file's own `const`s: a factory closing over
 * an ordinary top-level binding reads it in its temporal dead zone.
 */
const router = vi.hoisted(() => ({ search: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(router.search),
}))

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
  {
    key: 'late_start',
    runId: 'run_canonical',
    scopeKey: null,
    firstEarnedOn: '2026-08-20',
    earnedOn: '2026-08-20',
    count: 1,
    earnedDays: [{ earnedOn: '2026-08-20', runId: 'run_canonical' }],
  },
  {
    /* Three earnings, and deliberately a MIX: two runs that still exist and one whose run was
     * deleted (R-22 nulls the row's `run_id` and keeps the award). So one badge's list exercises
     * both of `RunDateLink`'s branches, which is what the card says the ordinary case looks like. */
    key: 'tourist',
    runId: 'run_canonical',
    scopeKey: null,
    firstEarnedOn: '2026-07-04',
    earnedOn: '2026-08-20',
    count: 3,
    earnedDays: [
      { earnedOn: '2026-08-20', runId: 'run_canonical' },
      { earnedOn: '2026-07-19', runId: null },
      { earnedOn: '2026-07-04', runId: 'run_july' },
    ],
  },
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

  it('dates an earned badge and leaves the count to the pill', () => {
    expect(html).toContain('Thu, 20 Aug 2026')
    // F23: the row used to append "\u00b7 most recent of 3" to name which earning the date belonged
    // to. `earnedOn` is the latest by definition, so the qualifier was the row explaining its own
    // schema. The pill on the patch is now the only place the count appears.
    expect(html).not.toContain('most recent of')
    expect(html).toContain('\u00d73')
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

describe('BadgeDialog — the count is a disclosure control (F27)', () => {
  /** The panel's markup with one entry open. The effect that calls `showModal()` never runs under
   *  `renderToStaticMarkup`, but the subtree is what `open &&` renders, which is what we assert.
   *
   *  This is always the COLLAPSED half. `EarnedDates` holds `open` in `useState` and there is no
   *  jsdom here to tap it, which is exactly why the list is a separate exported component — see the
   *  `EarnedDayList` describe below, and F21's precedent for pulling unreachable JSX out. */
  function panel(key: 'late_start' | 'tourist') {
    const shelf = buildShelf(rows, FACTS)
    const entry = shelf.entries.find((e) => e.key === key)!
    return renderToStaticMarkup(createElement(BadgeDialog, { entry, onClose: () => {} }))
  }

  it('makes "Earned N times" a real disclosure control, shut by default', () => {
    const html = panel('tourist')
    // The count is still the panel's headline copy; what changed is what it is attached to.
    expect(html).toContain('Earned 3 times')
    // `aria-expanded` is the state and `aria-controls` names what opens — the card's own words:
    // "a real disclosure control, not a `<summary>` lookalike".
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls=')
    // A native <button>, which is what makes it a tab stop and Enter/Space-operable with no handler.
    expect(html).toContain('type="button"')
    expect(html).not.toContain('<summary')
    expect(html).not.toContain('<details')
  })

  it('ships no dates at all while the list is shut', () => {
    /* The load-bearing pair, unchanged in spirit from F23's version of this test: neither date
     * reaches the panel. F23 asserted it because the panel had no business printing a date; F27
     * asserts it because a collapsed disclosure that leaves its contents in the DOM is not
     * collapsed — a screen reader would read every earning of every badge behind a shut control. */
    const html = panel('tourist')
    expect(html).not.toContain('Thu, 20 Aug 2026')
    expect(html).not.toContain('Sat, 4 Jul 2026')
    expect(html).not.toContain('/r/run_canonical')
    // And none of F23's deleted summary came back. The fix for a bad summary is the thing itself.
    expect(html).not.toContain(' \u00b7 first ')
    expect(html).not.toContain('\u00b7 latest')
    expect(html).not.toContain('\u00d73')
  })

  it('gives a badge earned exactly once the same control, not a bare line', () => {
    /* F23 deleted the `Earned <date>` single-earn branch on the argument that one date in an
     * otherwise dateless panel was an inconsistency louder than the line it replaced. That argument
     * cuts the same way here: an "Earned once" that printed its date inline while every other count
     * hid its dates behind a control would be the same inconsistency from the other side. */
    const html = panel('late_start')
    expect(html).toContain('Earned once')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Earned Thu')
    expect(html).not.toContain('Thu, 20 Aug 2026')
  })

  it('leaves a locked badge with no control to expand', () => {
    const shelf = buildShelf(rows, FACTS)
    const entry = shelf.entries.find((e) => e.key === 'half_ish')!
    const html = renderToStaticMarkup(createElement(BadgeDialog, { entry, onClose: () => {} }))
    expect(html).toContain('Not yet earned')
    expect(html).not.toContain('aria-expanded')
    // One button in the panel — the footer's Close. A locked badge has nothing to disclose.
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('pads the footer to match the gap above the count line', () => {
    // The body opens `pt-4`, so 1rem is the gap above "Earned N times" and 1rem is the gap that
    // belongs below Close. F27's `-my-1 py-1` on the expander is net zero by construction, so the
    // arithmetic F23 set is untouched. This asserts the token; it does NOT prove the two gaps
    // *look* equal — that is §13's read-it-at-414px check on an iPhone XS Max.
    const html = panel('tourist')
    expect(html).toContain('pb-[calc(1rem+var(--safe-bottom))]')
    expect(html).not.toContain('pb-[calc(1.25rem+var(--safe-bottom))]')
    expect(html).toContain('-my-1 py-1')
  })
})

describe('EarnedDayList — what the expander opens (F27)', () => {
  /* Rendered directly, because nothing in this suite can tap the control that renders it. That is
   * the whole reason it is exported; see its own doc block and F21's `commitStatusLine`. */
  function list(days: { earnedOn: string; runId: string | null }[], count = days.length) {
    return renderToStaticMarkup(
      createElement(EarnedDayList, { id: 'earn-list', earnedDays: days, count }),
    )
  }

  const TOURIST = [
    { earnedOn: '2026-08-20', runId: 'run_canonical' },
    { earnedOn: '2026-07-19', runId: null },
    { earnedOn: '2026-07-04', runId: 'run_july' },
  ]

  it('lists every earning, newest first, each linked to the run that earned it', () => {
    const html = list(TOURIST)
    expect(html).toContain('href="/r/run_canonical"')
    expect(html).toContain('href="/r/run_july"')
    // Newest-down is the order the panel reads, and it comes off the fold rather than from here —
    // this asserts the component does not re-sort or reverse it on the way to the screen.
    expect(html.indexOf('Thu, 20 Aug 2026')).toBeLessThan(html.indexOf('Sat, 4 Jul 2026'))
    // A list, not prose: three days a screen reader can count.
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html).toContain('id="earn-list"')
  })

  it('renders a day with no run as text, in the middle of a list of links', () => {
    /* The mix is the ordinary case, not an edge one: `badges.run_id` is ON DELETE SET NULL (R-22),
     * so deleting one run nulls that award's runId and leaves the rest of the badge's history
     * linkable. `RunDateLink` owns the affordance — no underline on the text branch. */
    const html = list(TOURIST)
    expect(html).toContain('Sun, 19 Jul 2026')
    expect(html.match(/<a/g)).toHaveLength(2)
    expect(html).not.toContain('href="/r/null"')
  })

  it('links nothing at all for a period badge — every day is text', () => {
    // `century_club` is month-scoped: no single run earned it, so no day has a run to open.
    const html = list([
      { earnedOn: '2026-08-31', runId: null },
      { earnedOn: '2026-07-31', runId: null },
    ])
    expect(html).not.toContain('<a')
    expect(html).not.toContain('underline')
    expect(html).toContain('Mon, 31 Aug 2026')
    expect(html).toContain('Fri, 31 Jul 2026')
  })

  it('expands a badge earned once to its single date', () => {
    // The card's own acceptance line. The date F23 took out of the panel comes back here.
    const html = list([{ earnedOn: '2026-08-20', runId: 'run_canonical' }])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).toContain('Thu, 20 Aug 2026')
    expect(html).toContain('href="/r/run_canonical"')
  })

  it('says how many earnings have no date rather than inventing them', () => {
    /* A pre-F13 row carries the aggregate it had then (`lib/db/schema.ts`), so `count` can exceed
     * the days on record. Four earnings, two days. The one thing this must not do is print the same
     * day twice to make the numbers agree. */
    const html = list(
      [
        { earnedOn: '2026-08-31', runId: null },
        { earnedOn: '2026-05-31', runId: null },
      ],
      4,
    )
    expect(html).toContain('2 earlier, dates not recorded')
    // Three rows: the two real days, and one line that is not a date.
    expect(html.match(/<li/g)).toHaveLength(3)
    // Not a link, and not a repeated day.
    expect(html.match(/Mon, 31 Aug 2026/g)).toHaveLength(1)
    expect(html).not.toContain('<a')
  })

  it('conjugates the shortfall line at one', () => {
    const html = list([{ earnedOn: '2026-08-31', runId: null }], 2)
    expect(html).toContain('1 earlier, date not recorded')
    expect(html).not.toContain('1 earlier, dates not recorded')
  })

  it('adds no shortfall line when the count and the days agree', () => {
    // Which is every row this application has written since F13 — the ordinary case.
    const html = list(TOURIST)
    expect(html).not.toContain('not recorded')
    expect(html.match(/<li/g)).toHaveLength(3)
  })
})

describe('the open panel is a URL and not component state (F24)', () => {
  /** The shelf as `/me?panel=…` would render it, server-side, on a cold load of that exact URL. */
  function shelfAt(search: string) {
    router.search = search
    try {
      return renderToStaticMarkup(createElement(BadgeShelf, { shelf: buildShelf(rows, FACTS) }))
    } finally {
      router.search = ''
    }
  }

  it('opens the badge the parameter names', () => {
    const html = shelfAt('panel=badge.tourist')
    // The panel's own copy, and the 768px art that belongs to the panel alone.
    expect(html).toContain('Earned 3 times')
    expect(html).toContain(BADGE_ART.tourist.src)
    // A cold load of the URL renders the panel open, which is what makes the back gesture and the
    // return from /r/<id> restore it rather than merely re-mount the page.
    expect(html).toContain('Close')
  })

  it('opens nothing for a key the catalog has never heard of', () => {
    // A hand-typed URL is the one input that can name a badge that does not exist. The shelf
    // resolves the key against the shelf it was handed, and a miss is a shut panel — not a crash,
    // and not an empty dialog.
    const html = shelfAt('panel=badge.nonsense')
    expect(html).toContain('<dialog')
    expect(html).not.toContain('Earned once')
    expect(html).not.toContain('Not yet earned')
    expect(html).not.toContain('Close')
  })

  it('ignores another surface’s selection — one parameter, one panel', () => {
    // #25's record panel shares the parameter. The kind is what keeps the two from both opening,
    // which is the whole reason there is one parameter rather than one per surface.
    const html = shelfAt('panel=record.longest_distance')
    expect(html).not.toContain('Close')
    expect(html).not.toContain(BADGE_ART.tourist.src)
  })

  it('leaves the shelf itself untouched while a panel is open', () => {
    const html = shelfAt('panel=badge.tourist')
    /* 22 rows, plus the panel's two: Close, and F27's expander over the count. The number went
       23 → 24 with this card and every one of the extra buttons is INSIDE the panel — the shelf
       itself gained no control and lost none, which is what this assertion is actually about
       (`BadgeShelf`'s doc block: no completion counter, no filter, no sort). */
    expect(html.match(/<button/g)).toHaveLength(24)
    expect(html).toContain('2 earned')
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
