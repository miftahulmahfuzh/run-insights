// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DraftSplit, ReviewDraft } from '@/lib/review/draft'
import { hydrateDraftFromExtraction } from '@/lib/review/draft'
import { TRUTH } from '../../research/schema.mjs'

import { SplitsTable } from './SplitsTable'

/**
 * **Always open, never collapsed**, and rows are summaries — never edited in place. The sheet is
 * where a row's five fields live, with the splits screenshot pinned above them (R-45). The tests
 * pin the table's promises: every row quotable by its own values (the aria-label that quotes km,
 * partial-ness, time, pace and HR — "Edit row 11" eleven times over is useless to a screen
 * reader), partial rows visibly marked, the edited chip earned per row, and the sheet wired
 * through the same patch-and-rerender contract the screen itself uses.
 */

const NOW = new Date('2026-08-21T02:00:00Z')

function baselineSplits(): DraftSplit[] {
  return hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as never, NOW).splits
}

function renderTable(
  overrides: {
    splits?: DraftSplit[]
    flagged?: boolean
    editedPaths?: ReadonlySet<string>
    errors?: Record<string, string>
  } = {},
) {
  const onChange = vi.fn()
  let splits = overrides.splits ?? baselineSplits()
  const base = {
    photos: [] as never[],
    flagged: overrides.flagged ?? false,
    editedPaths: overrides.editedPaths ?? new Set<string>(),
    errors: overrides.errors ?? {},
  }
  const view = render(<SplitsTable {...base} splits={splits} onChange={handleChange} />)
  function handleChange(next: DraftSplit[]) {
    splits = next
    onChange(next)
    view.rerender(<SplitsTable {...base} splits={splits} onChange={handleChange} />)
  }
  return { onChange }
}

function editRow(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('SplitsTable — the always-open table', () => {
  it('heads with its count and one row per split, values in the screenshot’s spellings', () => {
    renderTable()

    const heading = screen.getByRole('heading', { name: 'Splits' })
    expect(heading).toBeInTheDocument()
    // The count sits beside the heading — it is also a km value in the table below, so scope it.
    expect(within(heading.parentElement!).getByText('11')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(12) // the header row plus eleven

    const first = rows[1]!
    expect(within(first).getByText('1')).toBeInTheDocument()
    expect(within(first).getByText('6:36')).toBeInTheDocument()
    expect(within(first).getByText(`6'36"`)).toBeInTheDocument()
    expect(within(first).getAllByText('154')).toHaveLength(2) // HR and cadence agree
  })

  it('a missing HR or cadence cell reads as an em dash, not a zero', () => {
    const splits = baselineSplits()
    splits[4] = { ...splits[4]!, hrBpm: null, cadenceSpm: null }
    renderTable({ splits })

    const row = screen.getAllByRole('row')[5]!
    expect(within(row).getAllByText('—')).toHaveLength(2)
  })

  it('the partial final kilometre is marked as a row and said out loud', () => {
    renderTable()

    // The km-11 row carries the warn edge; the hint below the table confirms why it matters.
    const last = screen.getAllByRole('row')[11]!
    expect(within(last).getByText('11')).toBeInTheDocument()
    expect(
      screen.getByText(/The partial final kilometre is marked and is left out of every pace average/),
    ).toBeInTheDocument()
  })

  it('without a partial row, the hint invites the mark (D14, on the screen that owns it)', () => {
    const splits = baselineSplits().map((s) => ({ ...s, partial: false }))
    renderTable({ splits })

    expect(
      screen.getByText(/Mark a short final kilometre as partial/),
    ).toBeInTheDocument()
  })

  it('each edit button quotes the row’s own values — never eleven identical labels', () => {
    renderTable()

    const last = screen.getByRole('button', {
      name: `Edit kilometre 11, partial, 4:48, 7'09"/km, 183 bpm`,
    })
    expect(last).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `Edit kilometre 1, 6:36, 6'36"/km, 154 bpm` }),
    ).toBeInTheDocument()
  })

  it('a row edited by hand wears the edited chip in place of the word Edit', () => {
    renderTable({ editedPaths: new Set(['splits.10.timeSec']) })

    expect(
      screen.getByRole('button', { name: `Edit kilometre 11, partial, 4:48, 7'09"/km, 183 bpm` }),
    ).toHaveTextContent('edited')
    expect(
      screen.getByRole('button', { name: `Edit kilometre 1, 6:36, 6'36"/km, 154 bpm` }),
    ).toHaveTextContent('Edit')
  })

  it('a flagged block wears the check chip next to its count', () => {
    renderTable({ flagged: true })

    expect(screen.getByText('check')).toBeInTheDocument()
  })

  it('a block-level server error renders above the rows', () => {
    renderTable({ errors: { splits: 'Split 7 is slower than the run itself.' } })

    expect(screen.getByText('Split 7 is slower than the run itself.')).toBeInTheDocument()
  })
})

describe('SplitsTable — the empty state and adding rows', () => {
  it('the §8 blank draft says why there are no rows, and offers to add them', () => {
    renderTable({ splits: [] })

    expect(
      screen.getByText(/No splits — either the splits screenshot was not uploaded/),
    ).toBeInTheDocument()
  })

  it('adding from empty starts at kilometre 1', () => {
    renderTable({ splits: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Add a row' }))

    expect(screen.getByRole('button', { name: 'Add a row' })).toBeInTheDocument()
    // The sheet opened on the appended row.
    expect(screen.getByRole('dialog', { name: 'Km 1' })).toBeInTheDocument()
  })

  it('adding after the last row continues the numbering and opens the new row’s sheet', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Add a row' }))

    expect(screen.getByRole('dialog', { name: 'Km 12' })).toBeInTheDocument()
  })
})

describe('SplitsTable — the row sheet', () => {
  it('opens on a row’s summary with the partial kilometre named in the subtitle', () => {
    renderTable()

    editRow(/Edit kilometre 11/)

    expect(screen.getByRole('dialog', { name: 'Km 11' })).toBeInTheDocument()
    // Once as the sheet subtitle, once as the toggle's label — two honest uses of the words.
    expect(screen.getAllByText('Partial kilometre')).toHaveLength(2)
  })

  it('the sheet’s fields are seeded from the row', () => {
    renderTable()
    editRow(/Edit kilometre 11/)

    expect(screen.getByLabelText('Kilometre number')).toHaveValue('11')
    expect(screen.getByLabelText('Split time')).toHaveValue('4:48')
    expect(screen.getByLabelText('Split pace')).toHaveValue('7:09')
    expect(screen.getByLabelText('Split heart rate in beats per minute')).toHaveValue('183')
    expect(screen.getByLabelText('Split cadence in steps per minute')).toHaveValue('145')
  })

  it('editing the time lifts seconds into the row — the historically misread field', () => {
    renderTable()
    editRow(/Edit kilometre 11/)

    // The observed error: 6'36" (396 s) read as 436 s. The mask lays digits right-to-left, so
    // 6'36" is typed 6-3-6 — '396' would lay out as 3:96 and be held, invalid, by design.
    fireEvent.change(screen.getByLabelText('Split time'), { target: { value: '636' } })

    const row = screen.getAllByRole('row')[11]!
    expect(within(row).getByText('6:36')).toBeInTheDocument()
  })

  it('the partial toggle flips without touching the numbers', () => {
    const splits = baselineSplits().map((s) => ({ ...s, partial: false }))
    renderTable({ splits })
    editRow(/Edit kilometre 11/)

    fireEvent.click(screen.getByRole('checkbox'))

    // The toggle rewrites the pace only in the real flow (ReviewClient's own wiring);
    // here the row's flag flips and nothing else moves.
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('a path-scoped server error renders under its own sheet field', () => {
    renderTable({ errors: { 'splits.10.timeSec': 'That time is longer than the run.' } })
    editRow(/Edit kilometre 11/)

    expect(screen.getByText('That time is longer than the run.')).toBeInTheDocument()
  })

  it('Done closes the sheet and the table stays intact', () => {
    renderTable()
    editRow(/Edit kilometre 2/)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(12)
  })

  it('Delete row removes exactly that row and closes the sheet', () => {
    renderTable()
    editRow(/Edit kilometre 2/)

    fireEvent.click(screen.getByRole('button', { name: 'Delete row' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(11)
    expect(within(rows[2]!).getByText('3')).toBeInTheDocument() // km 2 is gone, 3 now sits second
  })

  it('Escape closes the sheet — the row was a detour, not a destination', () => {
    renderTable()
    editRow(/Edit kilometre 2/)

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Km 2' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
