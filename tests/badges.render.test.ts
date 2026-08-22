import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BADGE_ART } from '@/lib/badges/badge-art'

import { BadgeDialog, EarnedDayList } from '@/components/profile/BadgeDialog'
import { BadgeShelf } from '@/components/profile/BadgeShelf'
import { RecordDialog } from '@/components/profile/RecordDialog'
import { RecordsTable, type RecordRowView } from '@/components/profile/RecordsTable'
import { BADGE_META } from '@/lib/badges/meta'
import { buildShelf } from '@/lib/badges/shelf'
import type { PeriodFacts } from '@/lib/badges/evaluate'
import type { StoredBadge } from '@/lib/badges/types'
import { RECORD_ART, RECORD_ART_HEIGHT, RECORD_ART_WIDTH } from '@/lib/records/record-art'

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
   *  Round 2 made the disclosure a PROP rather than `useState` — it lives in the URL now — so both
   *  halves are reachable from here and the second argument picks one. `EarnedDayList` stays
   *  exported all the same: its own describe below drives the cases that have nothing to do with
   *  the panel around them, and a tap still cannot be simulated without jsdom. */
  function panel(key: 'late_start' | 'tourist', datesExpanded = false) {
    const shelf = buildShelf(rows, FACTS)
    const entry = shelf.entries.find((e) => e.key === key)!
    return renderToStaticMarkup(
      createElement(BadgeDialog, {
        entry,
        datesExpanded,
        onToggleDates: () => {},
        onClose: () => {},
      }),
    )
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
    const html = renderToStaticMarkup(
      createElement(BadgeDialog, {
        entry,
        /* Expanded in the URL and locked on the shelf: the flag has nothing to open, and a locked
           badge must not sprout a list because someone typed `&dates=1`. */
        datesExpanded: true,
        onToggleDates: () => {},
        onClose: () => {},
      }),
    )
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
    /* A session badge whose run was deleted (R-22): `scopeKey` stays null, so this is a DAY with no
       run and not a period. Round 2's `periodLabel` has to keep those apart. */
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

  it('links nothing when no day has a run, and still prints every day', () => {
    /* Two awards that lost their runs — deleted, swept, or written before round 3. Not "a period
     * badge": since round 3 a period award names the run that crossed its threshold, so a null here
     * is history rather than a rule. See the round-3 describe below. */
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

describe('a period badge links the run that completed its count (F27 round 3)', () => {
  /*
   * THE REPORT, AS AN ASSERTION — and the second time this case has been rewritten, which is worth
   * saying out loud because the two rounds disagree.
   *
   * Round 2 read "self_reward's date does not open a run" as a labelling problem and printed
   * `Week of 17 Aug 2026`, so the dead date at least looked like the period it was. Round 3 fixed
   * the cause instead: a count threshold is crossed BY a run, `evaluate.ts` now records that run on
   * period earns too, and the date is the fourth run of the week and opens it.
   *
   * So there is nothing here about weeks or months any more. Every row is a day; it links when its
   * run is known. What remains below is the regression net around that: the two reasons a day can
   * still have no run, and the fact that neither of them is a period badge writing a fresh award.
   */
  function list(days: { earnedOn: string; runId: string | null }[]) {
    return renderToStaticMarkup(
      createElement(EarnedDayList, { id: 'l', earnedDays: days, count: days.length }),
    )
  }

  it('links a week badge’s day exactly like a session badge’s', () => {
    /* `self_reward` earned by the fourth run of W34, which happened on 22 August. The row is that
     * run's date and it opens that run — the user's own worked example. */
    const html = list([{ earnedOn: '2026-08-22', runId: 'run_fourth_of_week' }])
    expect(html).toContain('href="/r/run_fourth_of_week"')
    expect(html).toContain('Sat, 22 Aug 2026')
    // Round 2's label is gone, and nothing prints a period any more.
    expect(html).not.toContain('Week of')
    expect(html).toContain('underline')
  })

  it('lists two weeks as two clickable run dates', () => {
    // The rest of the worked example: 4 runs to 22 Aug, then 25/27/29/30 the next week. Two awards,
    // two scope keys, two completing runs — and the panel is two links, newest first.
    const html = list([
      { earnedOn: '2026-08-30', runId: 'run_fourth_of_w35' },
      { earnedOn: '2026-08-22', runId: 'run_fourth_of_w34' },
    ])
    expect(html.match(/<a/g)).toHaveLength(2)
    expect(html.indexOf('Sun, 30 Aug 2026')).toBeLessThan(html.indexOf('Sat, 22 Aug 2026'))
  })

  it('still renders a deleted run’s day as plain text', () => {
    // R-22 nulls the column and keeps the award. The day happened; the run is gone.
    const html = list([{ earnedOn: '2026-08-20', runId: null }])
    expect(html).toContain('Thu, 20 Aug 2026')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('underline')
  })

  it('renders a sweep-awarded or pre-round-3 row as plain text, and not as a period', () => {
    /* The two paths that still write a null on a period award: the nightly sweep, which fires when
     * an aggregate drifted with no commit, and every period row written before round 3. Both are a
     * day with no run rather than a period — round 2's label would have made the sweep's cron
     * anchor day read as a week it never was. */
    const html = list([{ earnedOn: '2026-08-31', runId: null }])
    expect(html).toContain('Mon, 31 Aug 2026')
    expect(html).not.toContain('August 2026')
    expect(html).not.toContain('Week of')
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

  it('opens the date list from the URL, which is what the back-swipe restores (round 2)', () => {
    /*
     * THE SECOND REPORT, AS AN ASSERTION. Round 1 held the disclosure in `useState`, so tapping a
     * date, reading the run and swiping back came home to a collapsed list. It is a query parameter
     * now, so the entry the runner leaves for `/r/<id>` carries it and going back restores it.
     *
     * This renders `/me?panel=badge.tourist&dates=1` cold, server-side — which is exactly the state
     * a back-navigation produces.
     */
    const html = shelfAt('panel=badge.tourist&dates=1')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('href="/r/run_canonical"')
    expect(html).toContain('href="/r/run_july"')
    // The same URL without the flag is the collapsed panel — the default a fresh tap produces.
    const shut = shelfAt('panel=badge.tourist')
    expect(shut).toContain('aria-expanded="false"')
    expect(shut).not.toContain('href="/r/run_july"')
  })

  it('expands nothing when `dates` names no panel, or is not the one true value', () => {
    // A URL is user-typed input. `dates=1` alone opens no panel at all, and any other spelling of
    // "true" fails closed — the panel opens the way a tap would leave it.
    expect(shelfAt('dates=1')).not.toContain('aria-expanded')
    expect(shelfAt('panel=badge.tourist&dates=true')).toContain('aria-expanded="false"')
    expect(shelfAt('panel=badge.tourist&dates=0')).toContain('aria-expanded="false"')
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

/**
 * F26's fixture: three of the ten keys, chosen to cover every branch the row and the panel have.
 *
 * `longest_distance` is a `max` key with **no** predecessor — the first-ever holder, which is the
 * branch that prints no "Beat …" sentence. `fastest_pace_10k` is a `min` key WITH one, and its label
 * is the one that must never lose its qualifier. `best_paced_run` is the basis-point key, the only
 * one needing arithmetic on the way out (§4.5).
 */
const RECORD_ROWS: RecordRowView[] = [
  {
    key: 'longest_distance',
    runId: 'run_canonical',
    value: 10_670,
    achievedOn: '2026-08-20',
    previousValue: null,
  },
  {
    key: 'fastest_pace_10k',
    runId: 'run_july',
    value: 442,
    achievedOn: '2026-07-04',
    previousValue: 455,
  },
  {
    key: 'best_paced_run',
    runId: 'run_canonical',
    value: 1235,
    achievedOn: '2026-08-20',
    previousValue: null,
  },
]

describe('RecordsTable — one line per record (F26)', () => {
  const html = renderToStaticMarkup(createElement(RecordsTable, { rows: RECORD_ROWS }))

  it('prints the label and the value, and nothing else', () => {
    // Every unit through lib/format.ts (R-23): a period decimal separator, `7'22"/km`, and basis
    // points rendered as the percentage they encode.
    expect(html).toContain('10.67 km')
    expect(html).toContain('7&#x27;22&quot;/km')
    expect(html).toContain('12.3%')
    // The label carries the qualifier, so a caller cannot render "your 10k PB".
    expect(html).toContain('Fastest pace, 10 km+')
  })

  it('drops the second line entirely — the date and the "was" both', () => {
    /* The card's own words: "we need to remove the `<date> · was 10.67 km` text that takes the
       second row". Neither fact is deleted from the app, both moved into the panel, and this is the
       assertion that says the ROW gave them up. */
    expect(html).not.toContain('Thu, 20 Aug 2026')
    expect(html).not.toContain('was 7&#x27;35&quot;/km')
    expect(html).not.toContain(' · was ')
    expect(html).not.toContain('·')
  })

  it('is a button per row and no link at all', () => {
    /* The row used to BE the navigation to `/r/<runId>`. It cannot be both a link and a control that
       opens a panel, so the link moved onto the panel's date — which is what makes the whole row one
       tap target with one accessible name, as the card requires. Three rows, three buttons: the
       panel is one dialog driven by the selection, so a shut table ships no fourth. */
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href="/r/run_canonical"')
  })

  it('names the row and the value in the label, because a label replaces the content', () => {
    /* The opposite call from `BadgeShelf`, whose label adds only what its visual row encodes rather
       than states. A record row states everything it has, so both halves are repeated or the
       accessible name loses them. */
    expect(html).toContain('aria-label="Longest distance — 10.67 km. Show the record."')
    expect(html).toContain(
      'aria-label="Fastest pace, 10 km+ — 7&#x27;22&quot;/km. Show the record."',
    )
  })

  it('holds no <p> inside the row, because a <button> takes phrasing content only', () => {
    // The same constraint `BadgeShelf` obeys with `<span className="block">`s. A one-line row needs
    // no block child at all, so it does not even carry the shelf's wrapper <div>.
    expect(html).not.toContain('<p')
  })

  it('renders no panel content while the table is shut', () => {
    // The <dialog> is in the markup; its subtree is not — DetailPanel's `open &&`.
    expect(html).toContain('<dialog')
    expect(html).not.toContain('Personal record<')
    expect(html).not.toContain('Close')
    // The 768px art belongs to the panel alone, and the 192px derivative is drawn by nothing at all
    // (F26 §3: no patch on the row).
    expect(html).not.toContain(RECORD_ART.longest_distance.src)
    expect(html).not.toContain(RECORD_ART.longest_distance.small)
  })

  it('says so plainly when there is nothing yet, rather than printing zeros', () => {
    const empty = renderToStaticMarkup(createElement(RecordsTable, { rows: [] }))
    expect(empty).toContain('No records yet')
    expect(empty).not.toContain('0.00 km')
    // No rows, no panel, no dialog element either.
    expect(empty).not.toContain('<dialog')
  })
})

describe('RecordDialog — what the row gave up (F26)', () => {
  /** The panel's markup for one row, rendered directly. */
  function panel(key: 'longest_distance' | 'fastest_pace_10k') {
    const row = RECORD_ROWS.find((r) => r.key === key)!
    return renderToStaticMarkup(createElement(RecordDialog, { row, onClose: () => {} }))
  }

  it('names the record, its value and its date — the row’s two lines, uncompressed', () => {
    const html = panel('fastest_pace_10k')
    expect(html).toContain('Personal record')
    expect(html).toContain('Fastest pace, 10 km+')
    expect(html).toContain('7&#x27;22&quot;/km')
    expect(html).toContain('Sat, 4 Jul 2026')
  })

  it('links the date to the run that holds the record — the record half of (1b)', () => {
    /* `records.run_id` is NOT NULL / ON DELETE CASCADE, so a record is always held by a run that
       still exists and `RunDateLink`'s text branch is unreachable from this panel. That asymmetry
       with badges (ON DELETE SET NULL, R-22) is why the underline is unconditional here. */
    const html = panel('fastest_pace_10k')
    expect(html).toContain('href="/r/run_july"')
    expect(html).toContain('underline')
    expect(html).not.toContain('href="/r/null"')
  })

  it('turns `previousValue` into the sentence F06 kept it for', () => {
    /* `RecordsTable` has said since F06 that this field exists "specifically so a shelf can say
       'beat 7'30" to get here'". The compressed `· was 7'35"/km` the card deleted was that fact with
       no room to be a sentence; this is the room. */
    const html = panel('fastest_pace_10k')
    expect(html).toContain('Beat 7&#x27;35&quot;/km to get here.')
    expect(html).not.toContain('· was')
  })

  it('keeps the slot and says so when there is no earlier value — round 2', () => {
    /* Round 1 printed nothing here, on F26 §7's narrow reading. Reversed by the reporter: nine
       panels with the line and one without read as a broken tenth, not as an unbeaten one, and
       "I thought it was a bug" is the whole argument for a uniform slot. */
    const html = panel('longest_distance')
    expect(html).toContain('10.67 km')
    expect(html).toContain('No earlier value recorded.')
    expect(html).not.toContain('Beat')
  })

  it('never claims the record was the first one, because null does not mean first', () => {
    /* `recomputeRecords` writes `previousValue` only on a pass where the key changed hands, and
       `records.run_id` is ON DELETE CASCADE — so deleting the holding run drops the row and its
       history, and the next recompute writes null for a key that demonstrably had a predecessor.
       "First" would be false in exactly that case; "recorded" is true in both, and is the device
       `EarnedDayList` already uses for "the app has no record of this". */
    const html = panel('longest_distance')
    expect(html).not.toContain('first')
    expect(html).not.toContain('First')
    // Not "nothing to beat" either: the runner can see their other runs on the same screen, so a
    // line about the run SET would be contradicted by the shelf above it. This is about the record.
    expect(html).not.toContain('to beat')
  })

  it('puts both branches in the same slot, one quieter than the other', () => {
    /* Uniform position and size, one colour step apart: the slot does not move, and the line that
       carries less says less loudly. The same step `EarnedDayList` puts between a real day and its
       own not-recorded line. */
    const withPrev = panel('fastest_pace_10k')
    const without = panel('longest_distance')
    expect(withPrev).toContain('mt-3 text-[13px] font-medium text-ink-2')
    expect(without).toContain('mt-3 text-[13px] font-medium text-ink-3')
  })

  it('hangs the records deck’s own art at the records deck’s own size', () => {
    /* NOT the badge deck's constants. The two decks are generated from different master sizes, which
       is exactly why `PanelArt` carries its own intrinsic pixels — see `DetailPanel`. */
    const art = RECORD_ART.longest_distance
    const html = panel('longest_distance')
    expect(html).toContain(art.src)
    // Content-hashed, which is what licenses the `immutable` header in next.config.ts.
    expect(art.src).toMatch(/^\/records\/[a-z0-9_]+\.[0-9a-f]{8}\.webp$/)
    expect(html).toContain(`background-color:${art.twill}`)
    expect(html).toContain(`width="${RECORD_ART_WIDTH}"`)
    expect(html).toContain(`height="${RECORD_ART_HEIGHT}"`)
    /* A record is always held by a real run, so `PanelArt.dimmed` never applies. `grayscale` is the
       whole assertion: the treatment is `opacity-50 grayscale` and `opacity-50` alone is not
       diagnostic — `Button`'s own `disabled:opacity-50` puts that string in every panel's footer. */
    expect(html).not.toContain('grayscale')
  })

  it('has one control, and it is Close — nothing here discloses', () => {
    /* F27 made even "Earned once" an expander, for consistency with the counts that have a list
       behind them. A record has one holder and one date: no list, and no sibling to be consistent
       with. So the first line is text, not a button. */
    const html = panel('longest_distance')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('Close')
    expect(html).not.toContain('aria-expanded')
  })

  it('renders nothing when no row is selected', () => {
    const html = renderToStaticMarkup(createElement(RecordDialog, { row: null, onClose: () => {} }))
    expect(html).toContain('<dialog')
    expect(html).not.toContain('Personal record')
    expect(html).not.toContain('Close')
  })
})

describe('the record panel is a URL too (F26 + F24)', () => {
  /** The table as `/me?panel=…` would render it, server-side, on a cold load of that exact URL. */
  function tableAt(search: string) {
    router.search = search
    try {
      return renderToStaticMarkup(createElement(RecordsTable, { rows: RECORD_ROWS }))
    } finally {
      router.search = ''
    }
  }

  it('opens the record the parameter names', () => {
    const html = tableAt('panel=record.fastest_pace_10k')
    expect(html).toContain('Personal record')
    expect(html).toContain('Beat 7&#x27;35&quot;/km to get here.')
    expect(html).toContain(RECORD_ART.fastest_pace_10k.src)
    // A cold load renders the panel open, which is what makes the back gesture and the return from
    // /r/<id> restore it rather than merely re-mount the page.
    expect(html).toContain('Close')
  })

  it('opens nothing for a key no record holds', () => {
    /* Two ways to miss, one behaviour: a hand-typed key the catalog never had, and a real key this
       runner has not qualified for — `records` only contains keys something qualified for, so a
       shared URL can name a record the recipient does not hold. Both resolve to null and shut the
       panel rather than crashing it, which is why the table holds the KEY and not the row. */
    for (const search of ['panel=record.nonsense', 'panel=record.most_elevation']) {
      const html = tableAt(search)
      expect(html).toContain('<dialog')
      expect(html).not.toContain('Close')
    }
  })

  it('ignores the badge shelf’s selection — one parameter, one panel', () => {
    // The two surfaces share `?panel=`, and the `kind` is what keeps them from both opening. Neither
    // surface has to know the other exists; see lib/panel/param.ts.
    const html = tableAt('panel=badge.tourist')
    expect(html).not.toContain('Close')
    expect(html).not.toContain(RECORD_ART.longest_distance.src)
  })

  it('leaves the rows themselves untouched while the panel is open', () => {
    // Three row buttons plus the panel's Close, and the extra one is INSIDE the panel: the table
    // gained no control of its own.
    const html = tableAt('panel=record.longest_distance')
    expect(html.match(/<button/g)).toHaveLength(4)
    expect(html).toContain('Longest distance')
  })
})
