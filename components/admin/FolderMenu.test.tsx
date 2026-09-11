// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FolderMenu } from './FolderMenu'
import {
  createNinaAlbumFolderAction,
  deleteNinaAlbumFolderAction,
  moveNinaAlbumFolderAction,
  renameNinaAlbumFolderAction,
} from '@/lib/admin/ninaAlbumActions'

/*
 * The last of the components the 2026-09-11 session had to stub. Four inline panels over one mode
 * union, one `run()` owning pending/error/reset, and — the design point its header spends a
 * heading on — the server owns every refusal: nothing is pre-validated here, and the "keep her
 * photo" second answer appears ONLY when a delete comes back refused, driven by the mode and not
 * by string-matching the message. The four actions are mocked; the path helpers are real.
 */
vi.mock('@/lib/admin/ninaAlbumActions', () => ({
  createNinaAlbumFolderAction: vi.fn(),
  deleteNinaAlbumFolderAction: vi.fn(),
  moveNinaAlbumFolderAction: vi.fn(),
  renameNinaAlbumFolderAction: vi.fn(),
}))

const createFolderAction = vi.mocked(createNinaAlbumFolderAction)
const renameFolderAction = vi.mocked(renameNinaAlbumFolderAction)
const moveFolderAction = vi.mocked(moveNinaAlbumFolderAction)
const deleteFolderAction = vi.mocked(deleteNinaAlbumFolderAction)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const FOLDERS = ['', 'a', 'a/child', 'a/child/grand', 'b', 'b/c']

function menu(props?: Partial<Parameters<typeof FolderMenu>[0]>) {
  const onNavigate = vi.fn()
  const onFolderCreated = vi.fn()
  render(
    <FolderMenu
      folder="a"
      folders={FOLDERS}
      photoCount={7}
      onNavigate={onNavigate}
      onFolderCreated={onFolderCreated}
      {...props}
    />,
  )
  return { onNavigate, onFolderCreated }
}

const trigger = () => screen.getByRole('button', { name: /Folder actions for/ })
const openMenu = async () => {
  const user = userEvent.setup()
  await user.click(trigger())
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FolderMenu', () => {
  it('names the menu after the folder — the root calls itself what it is', () => {
    menu({ folder: '' })
    expect(
      screen.getByRole('button', { name: 'Folder actions for the album root' }),
    ).toBeInTheDocument()

    menu({ folder: '2026/bali' })
    expect(screen.getByRole('button', { name: 'Folder actions for bali' })).toBeInTheDocument()
  })

  it('opens the menu on the trigger and closes it on the ×', async () => {
    menu()
    const user = await openMenu()
    expect(screen.getByText('New subfolder')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close folder actions' }))
    expect(screen.queryByText('New subfolder')).not.toBeInTheDocument()
  })

  it('offers only "New subfolder" at the album root — nothing to rename, move or delete', async () => {
    menu({ folder: '' })
    await openMenu()
    expect(screen.getByText('New subfolder')).toBeInTheDocument()
    expect(screen.queryByText('Rename')).not.toBeInTheDocument()
    expect(screen.queryByText('Move to…')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete…')).not.toBeInTheDocument()
  })

  it('offers all four actions on a real folder', async () => {
    menu()
    await openMenu()
    for (const row of ['New subfolder', 'Rename', 'Move to…', 'Delete…']) {
      expect(screen.getByText(row)).toBeInTheDocument()
    }
  })

  it('creates inside the open folder, then declares the folder and walks into it', async () => {
    createFolderAction.mockResolvedValue({ ok: true, folder: 'a/trip' })
    const { onNavigate, onFolderCreated } = menu()
    const user = await openMenu()
    await user.click(screen.getByText('New subfolder'))

    const namebox = screen.getByLabelText('New folder name')
    expect(screen.getByText('New folder inside a')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled() // empty name
    await user.type(namebox, 'trip')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(createFolderAction).toHaveBeenCalledWith({ parent: 'a', name: 'trip' }),
    )
    await waitFor(() => expect(onFolderCreated).toHaveBeenCalledWith('a/trip'))
    expect(onNavigate).toHaveBeenCalledWith('a/trip')
    // The panel closes: the trigger is back.
    await waitFor(() => expect(trigger()).toBeInTheDocument())
  })

  it('creates without navigating when the action returns no folder to walk into', async () => {
    createFolderAction.mockResolvedValue({ ok: true })
    const { onNavigate, onFolderCreated } = menu()
    const user = await openMenu()
    await user.click(screen.getByText('New subfolder'))
    await user.type(screen.getByLabelText('New folder name'), 'trip')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createFolderAction).toHaveBeenCalled())
    await waitFor(() => expect(onNavigate).not.toHaveBeenCalled())
    expect(onFolderCreated).not.toHaveBeenCalled()
  })

  it('prefills the rename field with the current name — a typo fix is a keystroke, not a retype', async () => {
    renameFolderAction.mockResolvedValue({ ok: true, folder: 'a/trip' })
    const { onNavigate } = menu({ folder: 'a/trip' })
    const user = await openMenu()
    await user.click(screen.getByText('Rename'))
    const box = screen.getByLabelText('Folder name') as HTMLInputElement
    expect(box).toHaveValue('trip')
    await user.type(box, '2')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() =>
      expect(renameFolderAction).toHaveBeenCalledWith({ folder: 'a/trip', name: 'trip2' }),
    )
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('a/trip'))
  })

  it('offers move destinations OUTSIDE the folder’s own tree and not its parent', async () => {
    moveFolderAction.mockResolvedValue({ ok: true, folder: 'b' })
    const { onNavigate } = menu({ folder: 'a/child' })
    const user = await openMenu()
    await user.click(screen.getByText('Move to…'))

    expect(screen.getByText('Move child into')).toBeInTheDocument()
    const select = screen.getByLabelText('Move child into')
    const options = [...select.querySelectorAll('option')]
    expect(options.map((o) => o.textContent)).toEqual(['The album root', 'b', 'b/c'])
    // Nothing from inside a/, and not a itself (its current parent).
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['', 'b', 'b/c'])
    expect(screen.getByText('No photo is re-uploaded — only the folder changes.')).toBeInTheDocument()

    await user.selectOptions(select, 'b')
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() =>
      expect(moveFolderAction).toHaveBeenCalledWith({ folder: 'a/child', parent: 'b' }),
    )
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('b'))
  })

  it('deletes with the rows-first warning, then navigates to the surviving parent', async () => {
    deleteFolderAction.mockResolvedValue({ ok: true, folder: '' })
    const { onNavigate } = menu({ folder: 'a/trip', photoCount: 3 })
    const user = await openMenu()
    await user.click(screen.getByText('Delete…'))

    expect(
      screen.getByText(
        /Delete trip and the 3 photos in it and under it\. The rows go first and the files behind them are deleted afterwards/,
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete the folder' }))
    await waitFor(() =>
      expect(deleteFolderAction).toHaveBeenCalledWith({ folder: 'a/trip', keepCurrent: false }),
    )
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(''))
    // "the rest, keep her photo" must NOT exist without the server's refusal.
    expect(screen.queryByText('Delete the rest, keep her photo')).not.toBeInTheDocument()
  })

  it('uses the singular for a folder holding one photo', async () => {
    menu({ photoCount: 1 })
    const user = await openMenu()
    await user.click(screen.getByText('Delete…'))
    expect(screen.getByText(/and the 1 photo in it and under it/)).toBeInTheDocument()
  })

  it('answers a refused delete with the keep-current route — and only a refused delete', async () => {
    deleteFolderAction
      .mockResolvedValueOnce({ ok: false, error: 'Her current photo is in this folder.' })
      // The keep-current success carries NO folder: the fallback must navigate to the folder
      // itself, because the folder and her photo both survive.
      .mockResolvedValueOnce({ ok: true })
    const { onNavigate } = menu({ folder: 'a/trip' })
    const user = await openMenu()
    await user.click(screen.getByText('Delete…'))

    await user.click(screen.getByRole('button', { name: 'Delete the folder' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Her current photo is in this folder.')

    // The refusal is what earns the second answer, with its own explanation.
    expect(
      screen.getByText(/Her current photo is in here\. It cannot be deleted/),
    ).toBeInTheDocument()
    expect(screen.getByText('Delete the rest, keep her photo')).toBeInTheDocument()

    await user.click(screen.getByText('Delete the rest, keep her photo'))
    await waitFor(() =>
      expect(deleteFolderAction).toHaveBeenNthCalledWith(2, { folder: 'a/trip', keepCurrent: true }),
    )
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('a/trip'))
  })

  it('does not offer keep-current when a different panel’s action is refused', async () => {
    createFolderAction.mockResolvedValue({ ok: false, error: 'That name is taken.' })
    menu()
    const user = await openMenu()
    await user.click(screen.getByText('New subfolder'))
    await user.type(screen.getByLabelText('New folder name'), 'trip')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('That name is taken.'))
    // The delete panel's second answer never leaks into a create refusal.
    expect(screen.queryByText('Delete the rest, keep her photo')).not.toBeInTheDocument()
  })

  it('falls back to a plain sentence for a failure with no message', async () => {
    deleteFolderAction.mockResolvedValue({ ok: false })
    menu()
    const user = await openMenu()
    await user.click(screen.getByText('Delete…'))
    await user.click(screen.getByRole('button', { name: 'Delete the folder' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('That did not work.'))
  })

  it('disables the panel controls while the action is in flight', async () => {
    const gate = deferred<{ ok: true; folder: string }>()
    createFolderAction.mockReturnValue(gate.promise)
    menu()
    const user = await openMenu()
    await user.click(screen.getByText('New subfolder'))
    await user.type(screen.getByLabelText('New folder name'), 'trip')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByLabelText('New folder name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await act(async () => {
      gate.resolve({ ok: true, folder: 'a/trip' })
    })
    await waitFor(() => expect(trigger()).toBeInTheDocument())
  })

  it('resets the error and the keep offer when a panel is reopened', async () => {
    deleteFolderAction.mockResolvedValue({ ok: false, error: 'refused' })
    menu()
    const user = await openMenu()
    await user.click(screen.getByText('Delete…'))
    await user.click(screen.getByRole('button', { name: 'Delete the folder' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    // Cancel goes all the way back to idle, so the menu is reopened on the way to Delete.
    await user.click(trigger())
    await user.click(screen.getByText('Delete…'))
    // Fresh panel: no stale error, no keep offer, and the field state is clean.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete the rest, keep her photo')).not.toBeInTheDocument()
  })
})
