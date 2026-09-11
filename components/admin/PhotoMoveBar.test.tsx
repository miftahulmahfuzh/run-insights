// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotoMoveBar } from './PhotoMoveBar'
import { moveNinaAvatarsAction, removeNinaAvatarsAction } from '@/lib/admin/ninaAlbumActions'

/*
 * The 2026-09-11 explorer session had to stub this component inside FileExplorer's suite; this
 * file is the real suite that stub was waiting for. The two actions are mocked (Server Actions);
 * everything else — the destination list's derivation, the one-id array at the action boundary,
 * the two-step remove with its current-photo warning — is the component's own and is pinned here.
 */
vi.mock('@/lib/admin/ninaAlbumActions', () => ({
  moveNinaAvatarsAction: vi.fn(),
  removeNinaAvatarsAction: vi.fn(),
}))

const moveAction = vi.mocked(moveNinaAvatarsAction)
const removeAction = vi.mocked(removeNinaAvatarsAction)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function bar(props?: Partial<Parameters<typeof PhotoMoveBar>[0]>) {
  const onDone = vi.fn()
  render(
    <PhotoMoveBar
      selectedId="ph_1"
      folders={['summer', 'bali']}
      folder="bali"
      currentId={null}
      onDone={onDone}
      {...props}
    />,
  )
  return { onDone }
}

beforeEach(() => {
  // The module-level action mocks carry call history across tests without this.
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PhotoMoveBar', () => {
  it('renders nothing when no photo is selected — the selection is phase 5’s, not its own', () => {
    const { container } = render(
      <PhotoMoveBar selectedId={null} folders={['a']} folder="a" currentId={null} onDone={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('announces the selection count', () => {
    bar()
    expect(screen.getByText('1 photo selected')).toBeInTheDocument()
  })

  it('offers the album root and every folder except the one the grid is showing, sorted', () => {
    bar({ folders: ['zulu', 'alpha', 'bali'], folder: 'bali' })
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['The album root', 'alpha', 'zulu'])
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['', 'alpha', 'zulu'])
  })

  it('opens on the album root, not on whichever folder happens to sort first', () => {
    bar()
    expect(screen.getByLabelText('Move the selected photos into')).toHaveValue('')
  })

  it('hands the action a ONE-ELEMENT array — the plural boundary, not a bare id', async () => {
    // The actions take `ids` and bound it with ADMIN_FOLDER_OP_MAX_IDS so the day the grid grows
    // multi-select nothing on the server moves. The client's half of that contract is the array.
    const user = userEvent.setup()
    moveAction.mockResolvedValue({ ok: true })
    bar()
    await user.selectOptions(screen.getByLabelText('Move the selected photos into'), 'summer')
    await user.click(screen.getByRole('button', { name: 'Move into the chosen folder' }))
    await waitFor(() =>
      expect(moveAction).toHaveBeenCalledWith({ ids: ['ph_1'], folder: 'summer' }),
    )
    expect(moveAction).toHaveBeenCalledTimes(1)
  })

  it('clears the selection and shows the action’s note on success', async () => {
    const user = userEvent.setup()
    moveAction.mockResolvedValue({ ok: true, note: 'Moved 1 photo.' })
    const { onDone } = bar()
    await user.click(screen.getByRole('button', { name: 'Move into the chosen folder' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Moved 1 photo.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a refused move as an alert, keeps the selection, and does not call onDone', async () => {
    const user = userEvent.setup()
    moveAction.mockResolvedValue({ ok: false, error: 'The folder is gone.' })
    const { onDone } = bar()
    await user.click(screen.getByRole('button', { name: 'Move into the chosen folder' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('The folder is gone.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('has a default sentence for a failure that carries no message', async () => {
    const user = userEvent.setup()
    moveAction.mockResolvedValue({ ok: false })
    bar()
    await user.click(screen.getByRole('button', { name: 'Move into the chosen folder' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('That did not work.'))
  })

  it('disables moving while the action is in flight — and the destination list with it', async () => {
    const user = userEvent.setup()
    const gate = deferred<{ ok: true }>()
    moveAction.mockReturnValue(gate.promise)
    bar()
    await user.click(screen.getByRole('button', { name: 'Move into the chosen folder' }))
    expect(screen.getByLabelText('Move the selected photos into')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move into the chosen folder' })).toBeDisabled()

    await act(async () => {
      gate.resolve({ ok: true })
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Move the selected photos into')).not.toBeDisabled(),
    )
  })

  it('disables the move button when there is nowhere to move to — showing the root with no subfolders', () => {
    // The album root ('') is always in the destination set, so the list only empties when the
    // grid's own folder is the root and no other folder exists.
    bar({ folders: [], folder: '' })
    expect(screen.getByRole('button', { name: 'Move into the chosen folder' })).toBeDisabled()
    // The select itself only honours `pending` — with zero options it is empty, not disabled.
    expect(screen.getByLabelText('Move the selected photos into')).not.toBeDisabled()
  })

  it('clears the selection immediately on the × button, without calling an action', async () => {
    const user = userEvent.setup()
    const { onDone } = bar()
    await user.click(screen.getByRole('button', { name: 'Clear the selection' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(moveAction).not.toHaveBeenCalled()
    expect(removeAction).not.toHaveBeenCalled()
  })

  it('removes only after the two-step confirm, with the rows-first-files-afterwards warning', async () => {
    const user = userEvent.setup()
    removeAction.mockResolvedValue({ ok: true, count: 1 })
    const { onDone } = bar()

    // The destructive copy is the confirmation — no native confirm() anywhere.
    await user.click(screen.getByRole('button', { name: 'Remove the selected photos' }))
    expect(
      screen.getByText(/Remove 1 photo from the album and delete the files behind them/),
    ).toBeInTheDocument()
    expect(moveAction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove 1' }))
    await waitFor(() =>
      expect(removeAction).toHaveBeenCalledWith({ ids: ['ph_1'], keepCurrent: false }),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    // The confirm block closes once the remove lands.
    await waitFor(() =>
      expect(screen.queryByText(/delete the files behind them/)).not.toBeInTheDocument(),
    )
  })

  it('cancels the confirm without doing anything', async () => {
    const user = userEvent.setup()
    const { onDone } = bar()
    await user.click(screen.getByRole('button', { name: 'Remove the selected photos' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/delete the files behind them/)).not.toBeInTheDocument()
    expect(removeAction).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('warns and offers keep-current when her current photo is inside the selection', async () => {
    const user = userEvent.setup()
    removeAction
      .mockResolvedValueOnce({ ok: true, count: 0, note: 'Kept her photo.' })
      .mockResolvedValueOnce({ ok: true, count: 0 })
    bar({ currentId: 'ph_1' })

    await user.click(screen.getByRole('button', { name: 'Remove the selected photos' }))
    expect(
      screen.getByText(/Her current photo is in this selection and cannot be removed/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove the rest, keep her photo' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove 1' }))
    await waitFor(() =>
      expect(removeAction).toHaveBeenNthCalledWith(1, { ids: ['ph_1'], keepCurrent: false }),
    )
    await waitFor(() => expect(screen.getByText('Kept her photo.')).toBeInTheDocument())

    // The second route passes keepCurrent: true — the server's refusal-and-fixes made clickable.
    await user.click(screen.getByRole('button', { name: 'Remove the selected photos' }))
    await user.click(screen.getByRole('button', { name: 'Remove the rest, keep her photo' }))
    await waitFor(() =>
      expect(removeAction).toHaveBeenNthCalledWith(2, { ids: ['ph_1'], keepCurrent: true }),
    )
  })

  it('does not show the keep-current route when the current photo is not selected', () => {
    bar({ currentId: 'ph_other' })
    expect(screen.queryByText(/Her current photo is in this selection/)).not.toBeInTheDocument()
  })

  it('survives a refused remove: the confirm stays open and the alert explains', async () => {
    const user = userEvent.setup()
    removeAction.mockResolvedValue({ ok: false, error: 'Her current photo is in the selection.' })
    bar({ currentId: 'ph_1' })
    await user.click(screen.getByRole('button', { name: 'Remove the selected photos' }))
    await user.click(screen.getByRole('button', { name: 'Remove 1' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Her current photo is in the selection.',
      ),
    )
    expect(screen.getByText(/delete the files behind them/)).toBeInTheDocument()
  })
})
