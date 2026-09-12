// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PeriodFacts } from '@/lib/badges/evaluate'
import { BADGE_ART } from '@/lib/badges/badge-art'
import { buildShelf, type Shelf } from '@/lib/badges/shelf'
import type { StoredBadge } from '@/lib/badges/types'

import { BadgeShelf } from './BadgeShelf'

/**
 * The shelf's interactive half — the layer `tests/badges.render.test.ts` structurally cannot
 * reach. `renderToStaticMarkup` proves which strings reach the markup; it never runs an effect,
 * so it cannot prove that a tap writes the right history entry, that the panel OPENS (showModal
 * ran, the Close button took focus), that a deep link resolves against the shelf or closes again,
 * or that the date list's `aria-controls` names a list that is actually in the document. Those
 * are `BadgeShelf`'s own wiring — the component is the client boundary that owns `usePanelParam`,
 * and this file holds its four verbs to their effects through a real `BadgeDialog`.
 *
 * The mocks are the two the repo has already settled (`usePanelParam.test.tsx`,
 * `tests/badges.render.test.ts`): `useSearchParams` reads a controlled query string, because the
 * hook's contract with Next 16 is `window.history` — what is under test is which history calls
 * the component's handlers make and what a matching URL then renders, not the router's own
 * re-render machinery. A tap here therefore has two halves, both asserted: the history call it
 * makes synchronously, and the render that follows once "the router" reports the new query (the
 * `routerCaughtUp` helper). `next/image` becomes a plain `img` so the art's `src` is assertable.
 */

const { queryString } = vi.hoisted(() => ({ queryString: { current: '' } }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(queryString.current),
}))

vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => <img src={src} data-testid="badge-art" />,
}))

const FACTS: PeriodFacts = {
  week: { weekKey: '2026-W34', runsThisWeek: 2, consecutiveQualifyingWeeks: 1 },
  month: { monthKey: '2026-08', monthDistanceM: 116_000 },
  lifetime: { dawnRunCount: 6 },
}

/* The same two stored rows `tests/badges.render.test.ts` uses — `tourist` deliberately mixes both
 * of `RunDateLink`'s branches (one day whose run survives, one whose run was deleted), which is
 * what the expanded list needs to prove in the live DOM. */
const STORED: StoredBadge[] = [
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

function shelf(): Shelf {
  return buildShelf(STORED, FACTS)
}

function renderShelf() {
  return render(<BadgeShelf shelf={shelf()} />)
}

/** The half of a tap the mock cannot do alone: the router reports the new query, the hook re-reads. */
function routerCaughtUp(query: string, utils: ReturnType<typeof renderShelf>) {
  queryString.current = query
  act(() => {
    utils.rerender(<BadgeShelf shelf={shelf()} />)
  })
}

/** A row by its full accessible name — `BadgeShelf` builds it from the entry, the count and the tap. */
function rowButton(title: string, state: string) {
  return screen.getByRole('button', { name: `${title} — ${state}. Show the badge.` })
}

function openDialog() {
  return screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement
}

/* History spies are restored after every test, not inline-only: a test that aborts on an
 * assertion before its own mockRestore() would otherwise leave the spy on window.history for
 * every test after it, and the leaked call history turns their first assertion into a lie
 * about THEIR component, not about the leak. */
afterEach(() => {
  vi.restoreAllMocks()
})

/** The panel's one list — the earn dates — scoped to the dialog, never the shelf's own 22-row list. */
function dateList() {
  return within(openDialog()).getByRole('list')
}

describe('BadgeShelf — closed', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('renders the reference table and no panel body behind the shut dialog', () => {
    renderShelf()

    // The counts line, live: two stored rows against the 22-entry catalog.
    expect(screen.getByText('2 earned')).toBeInTheDocument()
    expect(screen.getByText('20 to find')).toBeInTheDocument()
    // Every row is tappable, by its full accessible name.
    rowButton('Tourist', 'earned 3 times')
    rowButton('Fashionably Late', 'earned once')
    rowButton('Half-ish', 'not yet earned')
    // The one-dialog-for-22-rows construction: a <dialog> is present, shut, and empty —
    // a screen reader reaches no badge prose from the shelf itself.
    const dialog = openDialog()
    expect(dialog.open).toBe(false)
    expect(screen.queryByRole('heading', { name: 'Tourist' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('the shelf draws the 192px marks; the 768px panel art stays shut behind the dialog', () => {
    renderShelf()

    const srcs = screen.getAllByTestId('badge-art').map((img) => img.getAttribute('src'))
    expect(srcs).toHaveLength(22)
    for (const src of srcs) expect(src).toMatch(/\.sm\.webp$/)
    expect(srcs).not.toContain(BADGE_ART.tourist.src)
  })

  it('a hand-typed URL naming a nonexistent badge resolves to nothing and opens nothing', () => {
    queryString.current = '?panel=badge.nonsense'
    renderShelf()

    expect(openDialog().open).toBe(false)
    // The shelf itself is unharmed — all 22 rows still render.
    expect(screen.getAllByRole('listitem')).toHaveLength(22)
  })

  it('a record-kind parameter is not this surface’s: no badge panel opens', () => {
    queryString.current = '?panel=record.most_kcal'
    renderShelf()

    expect(openDialog().open).toBe(false)
  })
})

describe('BadgeShelf — opening a panel', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('tapping a row pushes ?panel=badge.<key> — one entry, date list shut', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    renderShelf()

    fireEvent.click(rowButton('Tourist', 'earned 3 times'))

    expect(pushState).toHaveBeenCalledWith(null, '', '?panel=badge.tourist')
    expect(window.location.search).toBe('?panel=badge.tourist')
    pushState.mockRestore()
  })

  it('a fresh tap on a second badge does not inherit the first badge’s expanded list', () => {
    queryString.current = '?panel=badge.late_start&dates=1'
    const pushState = vi.spyOn(window.history, 'pushState')
    renderShelf()

    fireEvent.click(rowButton('Tourist', 'earned 3 times'))

    // The dates parameter is dropped, not carried: `open` always starts shut (F27 round 2).
    expect(pushState).toHaveBeenCalledWith(null, '', '?panel=badge.tourist')
    pushState.mockRestore()
  })

  it('once the router reports the query, the panel is open, labelled, and its Close button holds focus', () => {
    const utils = renderShelf()

    fireEvent.click(rowButton('Tourist', 'earned 3 times'))
    routerCaughtUp('?panel=badge.tourist', utils)

    expect(openDialog().open).toBe(true)
    expect(screen.getByRole('heading', { name: 'Tourist' })).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Earned 3 times' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // DetailPanel's explicit-focus rule, through the whole shelf: the row the runner tapped
    // is never traded for the scroll container.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })
})

describe('BadgeShelf — the expanded date list (F27)', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('a deep link with dates=1 opens the panel with every day listed, newest first, linked where the run survives', () => {
    queryString.current = '?panel=badge.tourist&dates=1'
    renderShelf()

    expect(openDialog().open).toBe(true)
    const trigger = screen.getByRole('button', { name: 'Earned 3 times' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    // It is a list — the count is the thing the runner tapped to see, and a stack of <p>s
    // would read to a screen reader as prose with no count. Scoped to the dialog: the shelf
    // behind it is a list too, and its 22 rows are not the dates.
    const days = within(dateList()).getAllByRole('listitem')
    expect(days).toHaveLength(3)
    expect(days[0]).toHaveTextContent('Thu, 20 Aug 2026')
    expect(days[1]).toHaveTextContent('Sun, 19 Jul 2026')
    expect(days[2]).toHaveTextContent('Sat, 4 Jul 2026')

    // A day whose run survives opens the run; a day whose run was deleted (R-22) is honest
    // plain text — nothing invites a thumb at a dead end.
    expect(screen.getByRole('link', { name: 'Thu, 20 Aug 2026' })).toHaveAttribute(
      'href',
      '/r/run_canonical',
    )
    expect(screen.queryByRole('link', { name: 'Sun, 19 Jul 2026' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sat, 4 Jul 2026' })).toHaveAttribute(
      'href',
      '/r/run_july',
    )
  })

  it('aria-controls names the list that is actually in the document once expanded', () => {
    queryString.current = '?panel=badge.tourist&dates=1'
    renderShelf()

    const trigger = screen.getByRole('button', { name: 'Earned 3 times' })
    const listId = trigger.getAttribute('aria-controls')
    expect(listId).toBeTruthy()
    // The association crosses the three lines between trigger and list: the attribute points
    // at the thing that appeared, not at a wrapper.
    expect(document.getElementById(listId!)!.tagName).toBe('UL')
  })

  it('a pre-F13 aggregate row: the count exceeds the days on record and the panel says so in words', () => {
    // One row folding five earnings into a single day on record — the case the file header
    // argues must never be rendered as four invented days.
    const preF13: StoredBadge[] = [
      ...STORED,
      {
        key: 'early_bird',
        runId: 'run_dawn',
        scopeKey: null,
        firstEarnedOn: '2026-06-01',
        earnedOn: '2026-08-01',
        count: 5,
        earnedDays: [{ earnedOn: '2026-08-01', runId: 'run_dawn' }],
      },
    ]
    queryString.current = '?panel=badge.early_bird&dates=1'
    const utils = render(<BadgeShelf shelf={buildShelf(preF13, FACTS)} />)

    expect(screen.getByRole('button', { name: 'Earned 5 times' })).toBeInTheDocument()
    const days = within(dateList()).getAllByRole('listitem')
    expect(days).toHaveLength(2) // the one recorded day, plus the not-recorded line
    expect(days[0]).toHaveTextContent('Sat, 1 Aug 2026')
    expect(screen.getByText('4 earlier, dates not recorded')).toBeInTheDocument()
    utils.unmount()
  })

  it('expanding replaces the URL in place — never a second history entry', () => {
    queryString.current = '?panel=badge.tourist'
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const utils = renderShelf()

    fireEvent.click(screen.getByRole('button', { name: 'Earned 3 times' }))

    expect(replaceState).toHaveBeenCalledWith(null, '', '?panel=badge.tourist&dates=1')
    expect(pushState).not.toHaveBeenCalled()

    // The router reports the replaced query; the list opens without any further tap.
    routerCaughtUp('?panel=badge.tourist&dates=1', utils)
    expect(within(dateList()).getAllByRole('listitem')).toHaveLength(3)
    replaceState.mockRestore()
    pushState.mockRestore()
  })

  it('collapsing drops dates=1 rather than writing dates=0', () => {
    queryString.current = '?panel=badge.tourist&dates=1'
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const utils = renderShelf()

    fireEvent.click(screen.getByRole('button', { name: 'Earned 3 times' }))

    expect(replaceState).toHaveBeenCalledWith(null, '', '?panel=badge.tourist')
    routerCaughtUp('?panel=badge.tourist', utils)
    expect(within(openDialog()).queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Earned 3 times' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    replaceState.mockRestore()
  })
})

describe('BadgeShelf — closing', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('a panel this mount pushed is undone with history.back — no dead entry left behind', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const utils = renderShelf()

    fireEvent.click(rowButton('Tourist', 'earned 3 times'))
    routerCaughtUp('?panel=badge.tourist', utils)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
    back.mockRestore()
    replaceState.mockRestore()
  })

  it('a deep link is not ours to pop: Close replaces in place, dropping both parameters', () => {
    queryString.current = '?panel=badge.tourist'
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const replaceState = vi.spyOn(window.history, 'replaceState')
    renderShelf()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    // back() here would walk into whatever preceded /me — the parameter is dropped in place.
    expect(replaceState).toHaveBeenCalledWith(null, '', window.location.pathname)
    expect(back).not.toHaveBeenCalled()
    back.mockRestore()
    replaceState.mockRestore()
  })
})
