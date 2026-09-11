// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ShortcutTable } from './ShortcutTable'
import {
  addShortcutAction,
  deleteShortcutAction,
  saveShortcutCellAction,
  toggleShortcutAction,
} from '@/lib/admin/shortcutActions'
import { ADMIN_SHORTCUT_PAGE, type ShortcutRow } from '@/lib/admin/shortcutModel'

/*
 * All four actions are mocked (Server Actions); the caps and `formatFired` are the real model. The
 * contracts under test are the ones the header says it borrowed from MemoryTable deliberately:
 * blur-to-save on the text cells, commit-on-change for the checkbox that renders the PROP (never
 * optimistic), the emptied-cell refusal that never reaches the network, Escape-to-revert, the
 * drafts that survive another cell's save, and the one-click delete whose only optimistic thing is
 * the removal.
 */
vi.mock('@/lib/admin/shortcutActions', () => ({
  addShortcutAction: vi.fn(),
  deleteShortcutAction: vi.fn(),
  saveShortcutCellAction: vi.fn(),
  toggleShortcutAction: vi.fn(),
}))

const addAction = vi.mocked(addShortcutAction)
const deleteAction = vi.mocked(deleteShortcutAction)
const saveCellAction = vi.mocked(saveShortcutCellAction)
const toggleAction = vi.mocked(toggleShortcutAction)

function row(overrides?: Partial<ShortcutRow>): ShortcutRow {
  return {
    id: 's1',
    trigger: 'gym',
    matchKey: 'gym',
    kind: 'literal' as ShortcutRow['kind'],
    label: 'Gym day',
    expansion: 'He is at the gym right now.',
    enabled: true,
    uses: 3,
    lastUsedAt: '2026-09-10T02:11:00Z',
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

function table(rows: ShortcutRow[], userId = 'u1') {
  render(<ShortcutTable userId={userId} rows={rows} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShortcutTable — the add row', () => {
  it('holds a disabled, checked, hidden-from-a11y checkbox: the state a new row will get', () => {
    table([])
    const box = screen.getByRole('checkbox', { hidden: true }) as HTMLInputElement
    expect(box).toBeDisabled()
    expect(box.checked).toBe(true)
  })

  it('keeps + disabled until trigger, label and expansion all have content', async () => {
    const user = userEvent.setup()
    table([])
    const add = screen.getByRole('button', { name: 'Add this shortcut' })
    expect(add).toBeDisabled()

    await user.type(screen.getByLabelText('The trigger to add'), 'gym')
    await user.type(screen.getByLabelText('What the new shortcut is for'), 'Gym day')
    expect(add).toBeDisabled() // expansion still empty
    await user.type(
      screen.getByLabelText('The context the new shortcut stands for'),
      'He is at the gym.',
    )
    expect(add).toBeEnabled()
  })

  it('adds through the action, clears the three fields, and shows the note', async () => {
    addAction.mockResolvedValue({ ok: true, note: 'Added.' })
    const user = userEvent.setup()
    table([])
    await user.type(screen.getByLabelText('The trigger to add'), 'gym')
    await user.type(screen.getByLabelText('What the new shortcut is for'), 'Gym day')
    const expansion = screen.getByLabelText('The context the new shortcut stands for')
    await user.type(expansion, 'He is at the gym.')
    await user.click(screen.getByRole('button', { name: 'Add this shortcut' }))

    await waitFor(() =>
      expect(addAction).toHaveBeenCalledWith({
        userId: 'u1',
        trigger: 'gym',
        label: 'Gym day',
        expansion: 'He is at the gym.',
      }),
    )
    await waitFor(() => {
      expect(screen.getByLabelText('The trigger to add')).toHaveValue('')
      expect(screen.getByLabelText('What the new shortcut is for')).toHaveValue('')
      expect(expansion).toHaveValue('')
    })
    expect(screen.getByText('Added.')).toBeInTheDocument()
  })

  it('keeps the fields and shows the error when the add is refused', async () => {
    addAction.mockResolvedValue({ ok: false, error: 'That trigger already exists.' })
    const user = userEvent.setup()
    table([])
    await user.type(screen.getByLabelText('The trigger to add'), 'gym')
    await user.type(screen.getByLabelText('What the new shortcut is for'), 'Gym day')
    await user.type(
      screen.getByLabelText('The context the new shortcut stands for'),
      'He is at the gym.',
    )
    await user.click(screen.getByRole('button', { name: 'Add this shortcut' }))

    await waitFor(() =>
      expect(screen.getByText('That trigger already exists.')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('The trigger to add')).toHaveValue('gym')
  })

  it('adds on Enter from a single-line cell, and on Cmd+Enter from the textarea', async () => {
    addAction.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    table([])
    const triggerBox = screen.getByLabelText('The trigger to add')
    await user.type(triggerBox, 'gym')
    await user.type(screen.getByLabelText('What the new shortcut is for'), 'Gym day')
    const expansion = screen.getByLabelText('The context the new shortcut stands for')
    await user.type(expansion, 'Gym time')

    // Plain Enter inside the textarea is a NEWLINE — up to 2000 chars will have paragraphs.
    fireEvent.keyDown(expansion, { key: 'Enter' })
    expect(addAction).not.toHaveBeenCalled()

    // The chord commits from inside it.
    fireEvent.keyDown(expansion, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(addAction).toHaveBeenCalledTimes(1))
    expect(addAction.mock.calls[0]![0]!.expansion).toBe('Gym time')
  })

  it('shows the empty-table sentence only when there are no rows', () => {
    const view = render(<ShortcutTable userId="u1" rows={[]} />)
    expect(
      screen.getByText(/No shortcuts yet\. The row above is where the first one goes/),
    ).toBeInTheDocument()

    view.rerender(<ShortcutTable userId="u1" rows={[row()]} />)
    expect(screen.queryByText(/No shortcuts yet\./)).not.toBeInTheDocument()
  })

  it('is honest about the page cap when a full page arrives', () => {
    table(
      Array.from({ length: ADMIN_SHORTCUT_PAGE }, (_, i) => row({ id: `s${i}`, trigger: `t${i}` })),
    )
    expect(
      screen.getByText(new RegExp(`Showing the newest ${ADMIN_SHORTCUT_PAGE}\\.`)),
    ).toBeInTheDocument()
  })
})

describe('ShortcutTable — existing rows', () => {
  it('renders the three editable cells and the Fired column through the model', () => {
    table([row({ uses: 0, lastUsedAt: null }), row({ id: 's2', trigger: 'run', uses: 5 })])
    // Two rows share the accessible names — index them.
    expect(screen.getAllByLabelText('Trigger')[0]).toHaveValue('gym')
    expect(screen.getAllByLabelText('Trigger')[1]).toHaveValue('run')
    expect(screen.getAllByLabelText('Label')[0]).toHaveValue('Gym day')
    expect(screen.getAllByLabelText('Expansion')[0]).toHaveValue('He is at the gym right now.')
    // formatFired: never fired; fired 5 times with a date.
    expect(screen.getByText('never')).toBeInTheDocument()
    expect(screen.getByText('5× · 2026-09-10')).toBeInTheDocument()
  })

  it('names the checkbox after the row’s own trigger and reports the toggle through the action', async () => {
    const user = userEvent.setup()
    table([row()])
    const box = screen.getByRole('checkbox', {
      name: 'Turn the gym shortcut on or off',
    }) as HTMLInputElement
    expect(box).toBeChecked()

    await user.click(box)
    await waitFor(() =>
      expect(toggleAction).toHaveBeenCalledWith({ userId: 'u1', id: 's1', enabled: false }),
    )
    // The checkbox renders the PROP, not an optimistic draft: the server's answer moves it.
    expect(box).toBeChecked()
  })

  it('saves a cell on blur and nothing on a no-op blur', async () => {
    saveCellAction.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    table([row()])
    const triggerBox = screen.getByLabelText('Trigger')
    await user.type(triggerBox, '2')
    fireEvent.blur(triggerBox)
    await waitFor(() =>
      expect(saveCellAction).toHaveBeenCalledWith({
        userId: 'u1',
        id: 's1',
        field: 'trigger',
        value: 'gym2',
      }),
    )

    saveCellAction.mockClear()
    fireEvent.blur(screen.getByLabelText('Label'))
    expect(saveCellAction).not.toHaveBeenCalled()
  })

  it('refuses an emptied cell locally — revert, sentence, and no network call', async () => {
    const user = userEvent.setup()
    table([row()])
    const labelBox = screen.getByLabelText('Label')
    await user.clear(labelBox)
    fireEvent.blur(labelBox)

    expect(
      screen.getByText(
        "A shortcut's label cannot be empty. Delete the row instead — one click, no confirmation.",
      ),
    ).toBeInTheDocument()
    expect(labelBox).toHaveValue('Gym day') // reverted
    expect(saveCellAction).not.toHaveBeenCalled()
  })

  it('reverts the draft on Escape and clears any standing result', async () => {
    saveCellAction.mockResolvedValue({ ok: false, error: 'The write failed.' })
    const user = userEvent.setup()
    table([row()])
    const triggerBox = screen.getByLabelText('Trigger')
    await user.type(triggerBox, '2')
    fireEvent.blur(triggerBox)
    await waitFor(() => expect(screen.getByText('The write failed.')).toBeInTheDocument())

    await user.type(triggerBox, '3')
    fireEvent.keyDown(triggerBox, { key: 'Escape' })
    expect(triggerBox).toHaveValue('gym')
    expect(screen.queryByText('The write failed.')).not.toBeInTheDocument()
    // Typing again after the error also clears it.
    await user.type(triggerBox, '4')
    expect(screen.queryByText('The write failed.')).not.toBeInTheDocument()
  })

  it('commits from inside the cell on Cmd/Ctrl+Enter — the blur does the saving', async () => {
    saveCellAction.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    table([row()])
    const expansion = screen.getByLabelText('Expansion')
    await user.type(expansion, '!')
    fireEvent.keyDown(expansion, { key: 'Enter', metaKey: true })
    await waitFor(() =>
      expect(saveCellAction).toHaveBeenCalledWith({
        userId: 'u1',
        id: 's1',
        field: 'expansion',
        value: 'He is at the gym right now.!',
      }),
    )
  })

  it('keeps a cell’s draft when ANOTHER cell’s write refreshes the props — value comparison, not identity', async () => {
    // revalidatePath hands every row a fresh object on every write; comparing identity would wipe
    // a draft in a cell nobody touched. The rule is adjust-during-render against the VALUE.
    saveCellAction.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const { rerender } = render(<ShortcutTable userId="u1" rows={[row()]} />)

    const triggerBox = screen.getByLabelText('Trigger')
    await user.type(triggerBox, '2') // a draft in flight, not yet blurred

    // Meanwhile the label was saved on the server and the props came back new.
    rerender(<ShortcutTable userId="u1" rows={[row({ label: 'Leg day' })]} />)
    expect(screen.getByLabelText('Trigger')).toHaveValue('gym2') // the draft survived
    expect(screen.getByLabelText('Label')).toHaveValue('Leg day') // and the fresh value landed
  })

  it('shows a successful cell save’s note under the expansion cell', async () => {
    saveCellAction.mockResolvedValue({ ok: true, note: 'Saved.' })
    const user = userEvent.setup()
    table([row()])
    const labelBox = screen.getByLabelText('Label')
    await user.type(labelBox, '!')
    fireEvent.blur(labelBox)
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument())
  })

  it('deletes on one click — the row vanishes inside the transition, no confirmation anywhere', async () => {
    const gate = deferred<{ ok: true }>()
    deleteAction.mockReturnValue(gate.promise)
    const user = userEvent.setup()
    table([row(), row({ id: 's2', trigger: 'run' })])

    await user.click(screen.getByRole('button', { name: 'Delete the gym shortcut' }))
    // Optimistic removal, mid-flight: the row is already gone from the table.
    expect(screen.queryByLabelText('Trigger')).not.toBeNull() // the other row's trigger remains
    expect(screen.queryByDisplayValue('gym')).not.toBeInTheDocument()
    expect(deleteAction).toHaveBeenCalledWith({ userId: 'u1', id: 's1' })

    await act(async () => {
      gate.resolve({ ok: true })
    })
    // With no server refetch in the test, the optimistic revert returns the row — the state a
    // real revalidatePath immediately overwrites. The action, not the DOM, is the contract here.
    await waitFor(() => expect(screen.getByDisplayValue('gym')).toBeInTheDocument())
  })

  it('brings a refused delete back with its error line', async () => {
    deleteAction.mockResolvedValue({
      ok: false,
      error: 'The write failed and nothing was changed. Try again.',
    })
    const user = userEvent.setup()
    table([row()])
    await user.click(screen.getByRole('button', { name: 'Delete the gym shortcut' }))

    await waitFor(() => expect(deleteAction).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByDisplayValue('gym')).toBeInTheDocument())
    await waitFor(() =>
      expect(
        screen.getByText('The write failed and nothing was changed. Try again.'),
      ).toBeInTheDocument(),
    )
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
