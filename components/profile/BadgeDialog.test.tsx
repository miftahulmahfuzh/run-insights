// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BADGE_ART } from '@/lib/badges/badge-art'
import { buildShelf, type ShelfEntry } from '@/lib/badges/shelf'
import type { PeriodFacts } from '@/lib/badges/evaluate'

import { BadgeDialog } from './BadgeDialog'

/**
 * The badge panel's body, driven through its props — the half of `BadgeDialog` that
 * `tests/badges.render.test.ts` has to approximate and `DetailPanel.test.tsx` cannot know
 * about: that the count really is a disclosure control that a TAP drives (the trigger fires
 * `onToggleDates` and the list appears only when the caller says so), that `aria-controls`
 * names a list actually in the document, that the pre-F13 "earlier, dates not recorded" line
 * takes its singular/plural branches, that a locked badge renders no control at all and dims
 * the band art, and that R-44's progress line lands on exactly the entries that carry one.
 *
 * No `next/navigation` mock is needed: since F27 round 2 the open flag is a PROP here (it
 * lives in the URL one level up, in `BadgeShelf`), which is what makes both halves of the
 * disclosure reachable from a plain render. `next/image` becomes a plain `img` so the band's
 * `src` is assertable; the `<dialog>` is happy-dom's own.
 */

vi.mock('next/image', () => ({
  // `className` is forwarded because the locked-badge dim lives there — `DetailPanel` hangs
  // `opacity-50 grayscale` on the Image, and a mock that dropped it would hide the treatment.
  default: ({ src, className }: { src: string; className?: string }) => (
    <img src={src} className={className} data-testid="panel-art" />
  ),
}))

function entry(over: {
  key?: ShelfEntry['key']
  title?: string
  earned?: ShelfEntry['earned']
  progress?: ShelfEntry['progress']
}): ShelfEntry {
  return {
    key: 'tourist',
    title: 'Tourist',
    condition: 'Run somewhere you have never run before.',
    gloss: 'A first visit is worth remembering.',
    earned: null,
    progress: null,
    ...over,
  }
}

const THREE_DAYS = [
  { earnedOn: '2026-08-20', runId: 'run_canonical' },
  { earnedOn: '2026-07-19', runId: null },
  { earnedOn: '2026-07-04', runId: 'run_july' },
]

const FACTS: PeriodFacts = {
  week: { weekKey: '2026-W34', runsThisWeek: 2, consecutiveQualifyingWeeks: 1 },
  month: { monthKey: '2026-08', monthDistanceM: 116_000 },
  lifetime: { dawnRunCount: 6 },
}

/** A locked entry that genuinely accumulates — the only kind that carries a progress line. */
function accumulatingLockedEntry(): ShelfEntry {
  const found = buildShelf([], FACTS).entries.find((e) => e.progress !== null)!
  return found
}

function renderDialog(entryProp: ShelfEntry | null, datesExpanded = false) {
  const onToggleDates = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <BadgeDialog
      entry={entryProp}
      datesExpanded={datesExpanded}
      onToggleDates={onToggleDates}
      onClose={onClose}
    />,
  )
  return { ...utils, onToggleDates, onClose }
}

describe('BadgeDialog — shut and open', () => {
  it('no entry: the dialog element exists, shut, with nothing to read', () => {
    renderDialog(null)

    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement
    expect(dialog.open).toBe(false)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('an entry: the dialog opens, labelled by the entry’s own heading', () => {
    renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-07-04',
          earnedOn: '2026-08-20',
          count: 3,
          earnedDays: THREE_DAYS,
        },
      }),
    )

    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    const title = screen.getByRole('heading', { name: 'Tourist' })
    expect(dialog).toHaveAttribute('aria-labelledby', title.id)
    // The row's words again, verbatim — R-42: no panel-sized rewording of the catalog.
    expect(screen.getByText('Run somewhere you have never run before.')).toBeInTheDocument()
    expect(screen.getByText('A first visit is worth remembering.')).toBeInTheDocument()
  })
})

describe('BadgeDialog — the count is a disclosure control (F27)', () => {
  const EARNED = {
    firstEarnedOn: '2026-07-04',
    earnedOn: '2026-08-20',
    count: 3,
    earnedDays: THREE_DAYS,
  }

  it('the count is a real button, shut by default, and a tap asks the caller to expand', () => {
    const { onToggleDates } = renderDialog(entry({ earned: EARNED }))

    const trigger = screen.getByRole('button', { name: 'Earned 3 times' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')

    // Nothing is disclosed yet — and a tap is the caller's decision, not DOM state.
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(onToggleDates).toHaveBeenCalledTimes(1)
  })

  it('expanded: every day listed newest first, linked where the run survives, plain where it does not', () => {
    renderDialog(entry({ earned: EARNED }), true)

    const trigger = screen.getByRole('button', { name: 'Earned 3 times' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const days = screen.getAllByRole('listitem')
    expect(days).toHaveLength(3)
    expect(days[0]).toHaveTextContent('Thu, 20 Aug 2026')
    expect(days[1]).toHaveTextContent('Sun, 19 Jul 2026')
    expect(days[2]).toHaveTextContent('Sat, 4 Jul 2026')

    expect(screen.getByRole('link', { name: 'Thu, 20 Aug 2026' })).toHaveAttribute(
      'href',
      '/r/run_canonical',
    )
    // R-22: the run was deleted, the award survived — the day says so instead of inviting a tap.
    expect(screen.queryByRole('link', { name: 'Sun, 19 Jul 2026' })).not.toBeInTheDocument()
    expect(screen.getByText('Sun, 19 Jul 2026').tagName).toBe('SPAN')
    expect(screen.getByRole('link', { name: 'Sat, 4 Jul 2026' })).toHaveAttribute(
      'href',
      '/r/run_july',
    )
  })

  it('aria-controls names the list that is actually in the document once expanded', () => {
    renderDialog(entry({ earned: EARNED }), true)

    const listId = screen
      .getByRole('button', { name: 'Earned 3 times' })
      .getAttribute('aria-controls')
    // The association crosses the three lines between trigger and list — the attribute must
    // point at the thing that appeared, not at a wrapper around it.
    expect(document.getElementById(listId!)!.tagName).toBe('UL')
  })

  it('a pre-F13 aggregate: the count exceeds the days on record, and the gap is said in words', () => {
    renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-06-01',
          earnedOn: '2026-08-01',
          count: 5,
          earnedDays: [{ earnedOn: '2026-08-01', runId: 'run_dawn' }],
        },
      }),
      true,
    )

    expect(screen.getByRole('button', { name: 'Earned 5 times' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('4 earlier, dates not recorded')).toBeInTheDocument()
    // No date was invented to make the two numbers agree.
    expect(screen.queryByText('Wed, 2 Aug 2026')).not.toBeInTheDocument()
  })

  it('the not-recorded line takes its singular branch', () => {
    renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-06-01',
          earnedOn: '2026-08-01',
          count: 2,
          earnedDays: [{ earnedOn: '2026-08-01', runId: 'run_dawn' }],
        },
      }),
      true,
    )

    // The count is not repeated before the noun — the line reads "1 earlier, date not recorded".
    expect(screen.getByText('1 earlier, date not recorded')).toBeInTheDocument()
  })

  it('"Earned once" is the same control, not a bare line', () => {
    renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-08-20',
          earnedOn: '2026-08-20',
          count: 1,
          earnedDays: [{ earnedOn: '2026-08-20', runId: 'run_canonical' }],
        },
      }),
    )

    const trigger = screen.getByRole('button', { name: 'Earned once' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('BadgeDialog — a locked badge', () => {
  it('states the rule in the present tense, with no control and no list even when the flag says expand', () => {
    // `datesExpanded` is meaningless without an earn list; the `earned &&` guard is what keeps
    // a stale URL flag from conjuring one.
    renderDialog(entry({ key: 'half_ish', title: 'Half-ish' }), true)

    expect(screen.getByText('Not yet earned')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Earned/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('the band art hangs dimmed for a badge never earned', () => {
    renderDialog(entry({ key: 'half_ish', title: 'Half-ish' }))

    const img = screen.getByTestId('panel-art')
    // The band hangs the entry's OWN art — the key the panel was opened for, tourist's or not.
    expect(img).toHaveAttribute('src', BADGE_ART.half_ish.src)
    expect(img).toHaveClass('opacity-50', 'grayscale')
  })

  it('R-44’s progress line rides only the entries that carry a real number', () => {
    const locked = accumulatingLockedEntry()
    const { unmount } = renderDialog(locked)
    expect(screen.getByText(locked.progress!.sentence)).toBeInTheDocument()
    unmount()

    // An earned badge needs no invitation: `readProgress` runs for locked badges only.
    renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-07-04',
          earnedOn: '2026-08-20',
          count: 3,
          earnedDays: THREE_DAYS,
        },
      }),
    )
    expect(screen.queryByText(locked.progress!.sentence)).not.toBeInTheDocument()
  })
})

describe('BadgeDialog — the earned panel never dims', () => {
  it('the band art is the badge’s 768px derivative at full strength', () => {
    renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-07-04',
          earnedOn: '2026-08-20',
          count: 3,
          earnedDays: THREE_DAYS,
        },
      }),
    )

    const img = screen.getByTestId('panel-art')
    expect(img).toHaveAttribute('src', BADGE_ART.tourist.src)
    expect(img).not.toHaveClass('opacity-50')
    expect(img).not.toHaveClass('grayscale')
  })

  it('Close reports to the caller', () => {
    const { onClose } = renderDialog(
      entry({
        earned: {
          firstEarnedOn: '2026-07-04',
          earnedOn: '2026-08-20',
          count: 3,
          earnedDays: THREE_DAYS,
        },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
