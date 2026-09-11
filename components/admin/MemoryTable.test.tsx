// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryTable } from './MemoryTable'
import {
  deleteMemoryRowAction,
  editFactAction,
  insertFactAction,
  saveSlotAction,
} from '@/lib/admin/memoryActions'
import { ADMIN_FACT_CATEGORIES, type MemoryRow } from '@/lib/admin/memoryModel'

/*
 * The four actions are mocked; the categories and caps are the real model. What is under test is
 * what the header claims is different about THIS table: blur-to-save with a select that saves on
 * change, edits that are deliberately NOT optimistic (the canonical form appears when it lands),
 * and a delete that is optimistic in the shape the row actually takes — a closed-vocabulary slot
 * comes back as a BLANK row mid-transition, while everything else is gone.
 */
vi.mock('@/lib/admin/memoryActions', () => ({
  deleteMemoryRowAction: vi.fn(),
  editFactAction: vi.fn(),
  insertFactAction: vi.fn(),
  saveSlotAction: vi.fn(),
}))

const deleteAction = vi.mocked(deleteMemoryRowAction)
const editFact = vi.mocked(editFactAction)
const insertAction = vi.mocked(insertFactAction)
const saveSlot = vi.mocked(saveSlotAction)

function slot(overrides?: Partial<MemoryRow>): MemoryRow {
  return {
    rowId: 'slot:goals',
    kind: 'slot',
    target: 'goals',
    label: 'Goals',
    code: 'goals',
    hint: 'What she is aiming at this season.',
    text: 'Run a marathon.',
    editable: true,
    category: null,
    origin: 'admin',
    at: '2026-09-10T02:00:00Z',
    deletable: true,
    reappears: true,
    note: 'You set this by hand.',
    ...overrides,
  }
}

function fact(overrides?: Partial<MemoryRow>): MemoryRow {
  return {
    rowId: 'fact:1',
    kind: 'fact',
    target: 'f1',
    label: '',
    code: '',
    hint: '',
    text: 'She dislikes cilantro.',
    editable: true,
    category: 'preference',
    origin: 'distilled',
    at: '2026-09-09T10:00:00Z',
    deletable: true,
    reappears: false,
    note: 'Distilled from a message.',
    ...overrides,
  }
}

function promise(overrides?: Partial<MemoryRow>): MemoryRow {
  return {
    rowId: 'promise:1',
    kind: 'promise',
    target: 'p1',
    label: '5k under 25',
    code: '',
    hint: 'metric: 5k time · target: under 25:00 · by 2026-10-01',
    text: 'Run 5k under 25 minutes',
    editable: false,
    category: null,
    origin: null,
    at: '2026-10-01',
    deletable: true,
    reappears: false,
    note: 'She checks this against real runs.',
    ...overrides,
  }
}

function table(
  rows: MemoryRow[],
  factTotal = rows.filter((r) => r.kind === 'fact').length,
  hiddenCount = 0,
) {
  render(<MemoryTable userId="u1" rows={rows} factTotal={factTotal} hiddenCount={hiddenCount} />)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MemoryTable — structure', () => {
  it('renders the three groups with their headings and blurbs, in order', () => {
    table([slot(), promise(), fact()])
    expect(screen.getByText('Slots')).toBeInTheDocument()
    expect(screen.getByText('Pending promises')).toBeInTheDocument()
    expect(screen.getByText('Ledger')).toBeInTheDocument()
    expect(
      screen.getByText(/Eight closed keys, every one of them in her prompt/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Not editable as text — she checks the metric/)).toBeInTheDocument()
    expect(screen.getByText(/she reads the newest 60 on every turn/)).toBeInTheDocument()
  })

  it('skips an empty Slots or promises group but always renders the Ledger, which carries the add row', () => {
    table([fact()])
    expect(screen.queryByText('Slots')).not.toBeInTheDocument()
    expect(screen.queryByText('Pending promises')).not.toBeInTheDocument()
    expect(screen.getByText('Ledger')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Tell her something — it goes straight into the ledger'),
    ).toBeInTheDocument()
  })

  it('accounts for the rows the page left out', () => {
    table([fact(), fact({ rowId: 'fact:2', target: 'f2' })], 312, 12)
    expect(
      screen.getByText(
        'Showing the newest 300 of 312 ledger rows. 12 older row(s) are not listed here.',
      ),
    ).toBeInTheDocument()
  })
})

describe('MemoryTable — slot rows', () => {
  it('shows the key as title and code, the value in a textarea, and the hint under it', () => {
    table([slot()])
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('goals')).toBeInTheDocument()
    const box = screen.getByLabelText('Goals value')
    expect(box).toHaveValue('Run a marathon.')
    expect(screen.getByText('What she is aiming at this season.')).toBeInTheDocument()
  })

  it('saves the slot on blur and shows the action’s note', async () => {
    saveSlot.mockResolvedValue({
      ok: true,
      note: 'Saved. Tuesdays and Thursdays became "Selasa, Kamis".',
    })
    const user = userEvent.setup()
    table([slot()])
    const box = screen.getByLabelText('Goals value')
    await user.type(box, '!')
    fireEvent.blur(box)
    await waitFor(() =>
      expect(saveSlot).toHaveBeenCalledWith({
        userId: 'u1',
        key: 'goals',
        value: 'Run a marathon.!',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByText('Saved. Tuesdays and Thursdays became "Selasa, Kamis".'),
      ).toBeInTheDocument(),
    )
  })

  it('refuses an emptied slot locally — revert, sentence, and nothing sent', async () => {
    const user = userEvent.setup()
    table([slot()])
    const box = screen.getByLabelText('Goals value')
    await user.clear(box)
    fireEvent.blur(box)

    expect(
      screen.getByText(
        'A slot cannot be empty. Delete the row instead — the key comes back blank.',
      ),
    ).toBeInTheDocument()
    expect(box).toHaveValue('Run a marathon.')
    expect(saveSlot).not.toHaveBeenCalled()
  })

  it('deletes optimistically into the BLANK row, not into absence — the closed vocabulary rule', async () => {
    const gate = deferred<{ ok: true }>()
    deleteAction.mockReturnValue(gate.promise)
    const user = userEvent.setup()
    table([slot()])

    await user.click(screen.getByRole('button', { name: 'Delete Goals' }))
    expect(deleteAction).toHaveBeenCalledWith({ userId: 'u1', kind: 'slot', target: 'goals' })

    // Mid-transition: the key is still here, emptied, undeletable, and explaining itself.
    const box = screen.getByLabelText('Goals value') as HTMLTextAreaElement
    expect(box).toHaveValue('')
    expect(box.placeholder).toBe('not set')
    expect(screen.queryByRole('button', { name: 'Delete Goals' })).not.toBeInTheDocument()
    expect(
      screen.getByText('not set — type here and it is written as an admin slot'),
    ).toBeInTheDocument()

    await act(async () => {
      gate.resolve({ ok: true })
    })
    // With no server refetch in the test the optimistic frame is discarded back to the props —
    // the moment a real revalidatePath overwrite makes the delete look right.
    await waitFor(() => expect(screen.getByLabelText('Goals value')).toHaveValue('Run a marathon.'))
  })

  it('renders an orphaned key as a read-only, undeletable blank', () => {
    table([
      slot({
        editable: false,
        deletable: false,
        text: '',
        origin: null,
        note: 'Nothing written yet.',
      }),
    ])
    expect(screen.getByText('not set')).toBeInTheDocument() // the read-only <p>
    expect(screen.queryByLabelText('Goals value')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })
})

describe('MemoryTable — promise rows', () => {
  it('shows a promise as read-only text with its terms, and a delete that says there is no confirmation', () => {
    table([promise()])
    expect(screen.getByText('Run 5k under 25 minutes')).toBeInTheDocument()
    expect(
      screen.getByText('metric: 5k time · target: under 25:00 · by 2026-10-01'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('5k under 25 value')).not.toBeInTheDocument()
    const del = screen.getByRole('button', { name: 'Delete 5k under 25' })
    expect(del).toHaveAttribute('title', 'Delete this row. No confirmation.')
  })

  it('badges a promise as "promise" when it has no origin, and slots as "not set" without one', () => {
    table([promise(), slot({ origin: null })])
    expect(screen.getByText('promise')).toBeInTheDocument()
    expect(screen.getByText('not set')).toBeInTheDocument()
  })

  it('badges admin rows in accent and everything else neutrally', () => {
    table([slot({ origin: 'admin' }), fact()])
    // The add row's "Written as admin" sentence also contains the word — take the badge span.
    const adminBadge = screen.getAllByText('admin').find((el) => el.tagName === 'SPAN')!
    expect(adminBadge).toHaveClass('text-accent')
    const distilledBadge = screen.getByText('distilled')
    expect(distilledBadge).toHaveClass('text-ink-2')
    expect(distilledBadge).not.toHaveClass('text-accent')
  })

  it('renders When as the first ten characters, or a dash when there is none', () => {
    table([
      slot(),
      slot({
        rowId: 'slot:pace',
        target: 'pace',
        label: 'Pace',
        code: 'pace',
        at: null,
        hint: '',
        note: '',
      }),
    ])
    expect(screen.getByText('2026-09-10')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('MemoryTable — ledger rows', () => {
  it('edits a fact through a category select and a text cell, saving the category on CHANGE', async () => {
    editFact.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    table([fact()])
    const select = screen.getByLabelText('Category')
    const options = [...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))
    expect(options).toEqual([...ADMIN_FACT_CATEGORIES])
    expect(select).toHaveValue('preference')

    await user.selectOptions(select, 'life')
    await waitFor(() =>
      expect(editFact).toHaveBeenCalledWith({
        userId: 'u1',
        id: 'f1',
        category: 'life',
        text: 'She dislikes cilantro.',
      }),
    )
  })

  it('saves edited text on blur and relabels a distilled row through the action alone', async () => {
    editFact.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    table([fact()])
    const box = screen.getByLabelText('Ledger row text')
    await user.type(box, ' for sure')
    fireEvent.blur(box)
    await waitFor(() =>
      expect(editFact).toHaveBeenCalledWith({
        userId: 'u1',
        id: 'f1',
        category: 'preference',
        text: 'She dislikes cilantro. for sure',
      }),
    )
  })

  it('refuses an emptied ledger row locally', async () => {
    const user = userEvent.setup()
    table([fact()])
    const box = screen.getByLabelText('Ledger row text')
    await user.clear(box)
    fireEvent.blur(box)
    expect(screen.getByText('A ledger row cannot be empty. Delete it instead.')).toBeInTheDocument()
    expect(editFact).not.toHaveBeenCalled()
  })

  it('reverts on Escape and commits on Cmd+Enter without leaving the cell', async () => {
    editFact.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    table([fact()])
    const box = screen.getByLabelText('Ledger row text')

    await user.type(box, '!')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(box).toHaveValue('She dislikes cilantro.')

    await user.type(box, '!')
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    await waitFor(() =>
      expect(editFact).toHaveBeenCalledWith({
        userId: 'u1',
        id: 'f1',
        category: 'preference',
        text: 'She dislikes cilantro.!',
      }),
    )
  })

  it('deletes a ledger row out of existence mid-transition — gone, not blanked', async () => {
    const gate = deferred<{ ok: true }>()
    deleteAction.mockReturnValue(gate.promise)
    const user = userEvent.setup()
    table([fact(), fact({ rowId: 'fact:2', target: 'f2', text: 'Second row.' })])

    await user.click(screen.getAllByRole('button', { name: 'Delete this ledger row' })[0]!)
    expect(screen.queryByLabelText('Ledger row text')).not.toBeNull() // the survivor remains
    await act(async () => {
      gate.resolve({ ok: true })
    })
    expect(deleteAction).toHaveBeenCalledWith({ userId: 'u1', kind: 'fact', target: 'f1' })
    // The transition is over: the optimistic frame is discarded against the (static) props and
    // both rows return — the state a real revalidatePath response overwrites within the same
    // breath, since the row list arrives WITH the action's return value.
    await waitFor(() => expect(screen.getAllByLabelText('Ledger row text')).toHaveLength(2))
  })
})

describe('MemoryTable — the add row', () => {
  it('adds on Enter or the + button, clears the text, and KEEPS the category', async () => {
    insertAction
      .mockResolvedValueOnce({ ok: true, note: 'Written.' })
      .mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    table([fact()])
    const input = screen.getByLabelText('Tell her something — it goes straight into the ledger')
    const select = screen.getByLabelText('Category for the new row')

    await user.selectOptions(select, 'training')
    await user.type(input, 'Morning runs are at six.')
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(insertAction).toHaveBeenNthCalledWith(1, {
        userId: 'u1',
        category: 'training',
        text: 'Morning runs are at six.',
      }),
    )
    await waitFor(() => expect(input).toHaveValue(''))
    expect(screen.getByText('Written.')).toBeInTheDocument()
    expect(select).toHaveValue('training') // survives, so three rows are three Enters

    await user.type(input, 'Second row.')
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(insertAction).toHaveBeenNthCalledWith(2, {
        userId: 'u1',
        category: 'training',
        text: 'Second row.',
      }),
    )
  })

  it('keeps the typed row and shows the error when the insert is refused', async () => {
    insertAction.mockResolvedValue({ ok: false, error: 'The write failed. Try again.' })
    const user = userEvent.setup()
    table([fact()])
    const input = screen.getByLabelText('Tell her something — it goes straight into the ledger')
    await user.type(input, 'Something new.')
    await user.click(screen.getByRole('button', { name: 'Add this row to the ledger' }))

    await waitFor(() =>
      expect(screen.getByText('The write failed. Try again.')).toBeInTheDocument(),
    )
    expect(input).toHaveValue('Something new.')
  })

  it('disables the + until the text has content', () => {
    table([fact()])
    expect(screen.getByRole('button', { name: 'Add this row to the ledger' })).toBeDisabled()
  })
})
