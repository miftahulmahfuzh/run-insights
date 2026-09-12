// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecordRowView } from './RecordsTable'

import { RecordsTable } from './RecordsTable'

/**
 * The records table's interactive half — the layer `tests/badges.render.test.ts` cannot reach,
 * for the same reasons its sibling `BadgeShelf.test.tsx` exists: that a tap on a row writes
 * `?panel=record.<key>` (and only that), that a URL naming a record opens THAT record's panel
 * through the real `RecordDialog` and `DetailPanel` (showModal ran, Close took focus), that the
 * same parameter with a badge kind or a nonsense key opens nothing, and that an empty season is
 * the EmptySlot and not a table with no rows — there is no `<dialog>` in that tree at all, because
 * the empty branch returns before the one-dialog-for-every-row is even mounted.
 *
 * The mocks are the settled repo pair: `useSearchParams` reads a controlled query string (the
 * component's contract is `window.history`, and the history calls themselves are asserted), and
 * `next/image` becomes a plain `img` so the band art's `src` is assertable.
 */

const { queryString } = vi.hoisted(() => ({ queryString: { current: '' } }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(queryString.current),
}))

vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => <img src={src} data-testid="panel-art" />,
}))

/* Two rows chosen so both body branches and two different formatters are exercised:
 * `longest_distance` carries a displaced value ("Beat …"), `earliest_start` carries none and is
 * stored as seconds-past-midnight — the one key whose value is not what it prints. */
const ROWS: RecordRowView[] = [
  {
    key: 'longest_distance',
    runId: 'run_a',
    value: 10670,
    achievedOn: '2026-08-20',
    previousValue: 10100,
  },
  {
    key: 'earliest_start',
    runId: 'run_b',
    value: 25620,
    achievedOn: '2026-07-04',
    previousValue: null,
  },
]

function renderTable(rows: readonly RecordRowView[] = ROWS) {
  return render(<RecordsTable rows={rows} />)
}

/** The router catch-up the mock cannot do alone: report the new query, let the hook re-read. */
function routerCaughtUp(query: string, utils: ReturnType<typeof renderTable>) {
  queryString.current = query
  act(() => {
    utils.rerender(<RecordsTable rows={ROWS} />)
  })
}

function openDialog() {
  return screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement
}

/* History spies are restored after every test: a test that aborts on an assertion before its own
 * mockRestore() would otherwise leave the spy — and its call history — on window.history for
 * every test after it, and their first assertions would lie about their component, not the leak. */
afterEach(() => {
  vi.restoreAllMocks()
})

describe('RecordsTable — the rows', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('one line per held key: the label names the whole row, the value rides beside it', () => {
    renderTable()

    // `aria-label` REPLACES the content for a screen reader, so both halves are in it.
    const distance = screen.getByRole('button', {
      name: 'Longest distance — 10.67 km. Show the record.',
    })
    expect(distance).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Earliest start — 07:07. Show the record.' }),
    ).toBeInTheDocument()

    // R-23: both spellings route through lib/format — the row and the panel cannot disagree.
    expect(screen.getByText('10.67 km')).toBeInTheDocument()
    expect(screen.getByText('07:07')).toBeInTheDocument()
  })

  it('no rows: the EmptySlot, and no table machinery, no dialog, no buttons', () => {
    renderTable([])

    expect(
      screen.getByText('No records yet. The first reviewed run sets most of them at once.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('dialog')).toBeNull()
  })
})

describe('RecordsTable — opening a record panel', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('tapping a row pushes ?panel=record.<key> — the same one parameter as the badges, discriminated by kind', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    renderTable()

    fireEvent.click(
      screen.getByRole('button', { name: 'Longest distance — 10.67 km. Show the record.' }),
    )

    expect(pushState).toHaveBeenCalledWith(null, '', '?panel=record.longest_distance')
    expect(window.location.search).toBe('?panel=record.longest_distance')
    pushState.mockRestore()
  })

  it('the router reports the query and the record’s panel opens: the four lines, the date link, the focused Close', () => {
    const utils = renderTable()

    fireEvent.click(
      screen.getByRole('button', { name: 'Longest distance — 10.67 km. Show the record.' }),
    )
    routerCaughtUp('?panel=record.longest_distance', utils)

    expect(openDialog().open).toBe(true)
    expect(screen.getByText('Personal record')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Longest distance' })).toBeInTheDocument()
    // The displaced value, as the sentence the row gave up its second line to become.
    expect(screen.getByText('Beat 10.10 km to get here.')).toBeInTheDocument()
    // (1b): the navigation that used to be the whole row is now this date.
    expect(screen.getByRole('link', { name: 'Thu, 20 Aug 2026' })).toHaveAttribute(
      'href',
      '/r/run_a',
    )
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('the previousValue=null branch prints its own line — the panel’s shape never depends on the data', () => {
    const utils = renderTable()

    fireEvent.click(
      screen.getByRole('button', { name: 'Earliest start — 07:07. Show the record.' }),
    )
    routerCaughtUp('?panel=record.earliest_start', utils)

    expect(screen.getByRole('heading', { name: 'Earliest start' })).toBeInTheDocument()
    expect(screen.getByText('No earlier value recorded.')).toBeInTheDocument()
    expect(screen.queryByText('Beat 10.10 km to get here.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sat, 4 Jul 2026' })).toHaveAttribute(
      'href',
      '/r/run_b',
    )
  })

  it('a badge-kind parameter is not this surface’s: no record panel opens', () => {
    queryString.current = '?panel=badge.tourist'
    renderTable()

    expect(openDialog().open).toBe(false)
    // The rows are unharmed — only the panel resolution missed.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('a hand-typed key no record holds resolves to nothing and opens nothing', () => {
    queryString.current = '?panel=record.nonsense'
    renderTable()

    expect(openDialog().open).toBe(false)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('RecordsTable — closing', () => {
  beforeEach(() => {
    queryString.current = ''
    window.history.replaceState(null, '', '/')
  })

  it('a panel this mount pushed is undone with history.back — no dead entry left behind', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const utils = renderTable()

    fireEvent.click(
      screen.getByRole('button', { name: 'Longest distance — 10.67 km. Show the record.' }),
    )
    routerCaughtUp('?panel=record.longest_distance', utils)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(back).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
    back.mockRestore()
    replaceState.mockRestore()
  })
})
