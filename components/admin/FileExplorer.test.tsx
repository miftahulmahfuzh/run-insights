// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}))

// `PhotoMoveBar` is a real, separately-owned component (its own move/remove actions) this phase
// does not re-litigate — same precedent as `SelectionPane.test.tsx` stubbing `CropStudio`.
vi.mock('@/components/admin/PhotoMoveBar', () => ({
  PhotoMoveBar: ({ selectedId }: { selectedId: string | null }) => (
    <div data-testid="photo-move-bar" data-selected={selectedId ?? ''} />
  ),
}))

vi.mock('./explorer/FolderTree', () => ({
  FolderTree: ({
    onNavigate,
    onFolderCreated,
    allFolders,
  }: {
    onNavigate: (folder: string) => void
    onFolderCreated: (folder: string) => void
    allFolders: readonly string[]
  }) => (
    <div data-testid="folder-tree" data-all-folders={allFolders.join(',')}>
      <button type="button" onClick={() => onNavigate('bali')}>
        navigate-bali
      </button>
      <button type="button" onClick={() => onFolderCreated('2026/fresh')}>
        create-folder
      </button>
    </div>
  ),
}))

vi.mock('./explorer/MediaAdd', () => ({
  MediaAdd: () => <div data-testid="media-add" />,
}))

vi.mock('./explorer/PhotoGrid', () => ({
  PhotoGrid: ({
    photos,
    onSelect,
  }: {
    photos: readonly { id: string }[]
    onSelect: (id: string) => void
  }) => (
    <>
      {/*
       * Shaped like the real grid's tiles: one button per row carrying `data-photo-id`, because
       * the pane's close flow hands focus back to the selected tile by that attribute.
       */}
      {photos.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-testid="photo-grid-tile"
          data-photo-id={entry.id}
          onClick={() => onSelect(entry.id)}
        >
          select-{entry.id}
        </button>
      ))}
    </>
  ),
}))

vi.mock('./explorer/SelectionPane', () => ({
  SelectionPane: ({
    photo,
    onClose,
    onRemoved,
  }: {
    photo: { id: string }
    onClose: () => void
    onRemoved: (note: string | null) => void
  }) => (
    <div data-testid="selection-pane" data-photo={photo.id}>
      <button type="button" onClick={onClose}>
        close-pane
      </button>
      <button type="button" onClick={() => onRemoved('kept elsewhere')}>
        remove-p1
      </button>
    </div>
  ),
}))

vi.mock('./explorer/UploadQueue', () => ({
  UploadQueue: () => <div data-testid="upload-queue" />,
}))

const { entriesFromDrop, filesFromDropList, filesFromPicker } = vi.hoisted(() => ({
  entriesFromDrop: vi.fn(),
  filesFromDropList: vi.fn(),
  filesFromPicker: vi.fn(),
}))
vi.mock('./explorer/dropWalk', () => ({ entriesFromDrop, filesFromDropList, filesFromPicker }))

const { upload } = vi.hoisted(() => ({
  upload: {
    phase: 'idle' as const,
    items: [],
    report: null,
    error: null,
    start: vi.fn(),
    startWalk: vi.fn(),
    dismiss: vi.fn(),
  },
}))
vi.mock('./explorer/useFolderUpload', () => ({ useFolderUpload: () => upload }))

import { FileExplorer } from './FileExplorer'
import type { ExplorerPageInfo, ExplorerPhoto } from './explorer/model'

function photo(overrides?: Partial<ExplorerPhoto>): ExplorerPhoto {
  return {
    id: 'p1',
    url: 'https://blob.example/p1.jpg',
    filename: 'p1.jpg',
    width: 800,
    height: 600,
    bytes: 1000,
    source: 'upload',
    isCurrent: false,
    description: null,
    crop: { scale: 1, x: 0, y: 0 },
    createdAt: '2026-09-01T00:00:00.000Z',
    folder: '',
    thumbUrl: null,
    origin: 'album',
    ...overrides,
  } as ExplorerPhoto
}

function page(overrides?: Partial<ExplorerPageInfo>): ExplorerPageInfo {
  return { folder: '', page: 1, pageSize: 60, total: 0, ...overrides }
}

function baseProps(overrides?: Partial<Parameters<typeof FileExplorer>[0]>) {
  return {
    userId: 'user1',
    folders: [],
    photos: [],
    page: page(),
    view: 'album' as const,
    mediaCount: 0,
    shareOrigin: 'https://example.com',
    ...overrides,
  }
}

function dropZone(container: HTMLElement) {
  // The drop target is the content pane, `min-w-0` per the header. The breadcrumb `<nav>` also
  // carries a `min-w-0` class, so this is scoped to the `div` tag to avoid matching that sibling.
  return container.querySelector('div.min-w-0') as HTMLElement
}

describe('FileExplorer', () => {
  beforeEach(() => {
    routerPush.mockReset()
    routerRefresh.mockReset()
    entriesFromDrop.mockReset().mockReturnValue([])
    filesFromDropList.mockReset().mockReturnValue([])
    filesFromPicker.mockReset().mockReturnValue([])
    upload.start.mockReset()
    upload.startWalk.mockReset()
    upload.phase = 'idle'
  })

  it('renders the Album root breadcrumb', () => {
    render(<FileExplorer {...baseProps()} />)
    expect(screen.getByText('Album')).toBeInTheDocument()
  })

  it('appends a Media crumb only on the media view', () => {
    const { rerender } = render(<FileExplorer {...baseProps({ view: 'album' })} />)
    expect(screen.queryByText('Media')).not.toBeInTheDocument()

    rerender(<FileExplorer {...baseProps({ view: 'media' })} />)
    expect(screen.getByText('Media')).toBeInTheDocument()
  })

  it('shows MediaAdd on the media view and the album Add buttons on the album view, never both', () => {
    const { rerender } = render(<FileExplorer {...baseProps({ view: 'album' })} />)
    expect(screen.queryByTestId('media-add')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a folder' })).toBeInTheDocument()

    rerender(<FileExplorer {...baseProps({ view: 'media' })} />)
    expect(screen.getByTestId('media-add')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add photos' })).not.toBeInTheDocument()
  })

  it('hides PhotoMoveBar and UploadQueue on the media view', () => {
    const { rerender } = render(<FileExplorer {...baseProps({ view: 'album' })} />)
    expect(screen.getByTestId('photo-move-bar')).toBeInTheDocument()
    expect(screen.getByTestId('upload-queue')).toBeInTheDocument()

    rerender(<FileExplorer {...baseProps({ view: 'media' })} />)
    expect(screen.queryByTestId('photo-move-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('upload-queue')).not.toBeInTheDocument()
  })

  it('navigates via router.push when FolderTree calls onNavigate', async () => {
    const user = userEvent.setup()
    render(<FileExplorer {...baseProps()} />)
    await user.click(screen.getByRole('button', { name: 'navigate-bali' }))
    expect(routerPush).toHaveBeenCalledWith('/admin/nina?folder=bali')
  })

  it('merges a newly created folder into allFolders, but does not duplicate one the server already named', () => {
    render(<FileExplorer {...baseProps({ folders: [{ folder: 'bali', count: 1 }] })} />)
    expect(screen.getByTestId('folder-tree')).toHaveAttribute('data-all-folders', 'bali')
  })

  it('adds a pending folder to allFolders once FolderTree reports it created', async () => {
    const user = userEvent.setup()
    render(<FileExplorer {...baseProps({ folders: [{ folder: 'bali', count: 1 }] })} />)
    await user.click(screen.getByRole('button', { name: 'create-folder' }))
    // Plain string sort: '2' sorts before 'b'.
    expect(screen.getByTestId('folder-tree')).toHaveAttribute('data-all-folders', '2026/fresh,bali')
  })

  it('opens the SelectionPane for the selected photo id and closes it from the pane', async () => {
    const user = userEvent.setup()
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })] })} />)
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('photo-grid-tile'))
    expect(screen.getByTestId('selection-pane')).toHaveAttribute('data-photo', 'p1')

    await user.click(screen.getByRole('button', { name: 'close-pane' }))
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
  })

  it('hands focus back to the selected tile when the pane closes', async () => {
    /*
     * The pane's × is the focused element when it unmounts, so without an explicit restoration
     * the keyboard operator is dropped on <body> and the next Tab restarts the page — the same
     * focus-management duty a `<dialog>` supplies for free. The tile the selection came from is
     * where focus goes back.
     */
    const user = userEvent.setup()
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })] })} />)
    const tile = screen.getByTestId('photo-grid-tile')

    await user.click(tile)
    expect(screen.getByTestId('selection-pane')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close-pane' }))
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
    expect(tile).toHaveFocus()
  })

  it('hands focus back to the tile after a removal closes the pane', async () => {
    const user = userEvent.setup()
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })] })} />)
    const tile = screen.getByTestId('photo-grid-tile')

    await user.click(tile)
    await user.click(screen.getByRole('button', { name: 'remove-p1' }))

    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
    expect(screen.getByText('kept elsewhere')).toBeInTheDocument()
    expect(tile).toHaveFocus()
  })

  it('drops the selection and shows the note when the pane reports a removal', async () => {
    const user = userEvent.setup()
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })] })} />)
    await user.click(screen.getByTestId('photo-grid-tile'))
    await user.click(screen.getByRole('button', { name: 'remove-p1' }))

    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
    expect(screen.getByText('kept elsewhere')).toBeInTheDocument()
  })

  it('picking a folder or files calls upload.start with the walked files, then clears the input', () => {
    filesFromPicker.mockReturnValue([{ path: 'a.jpg', file: new File(['x'], 'a.jpg') }])
    const { container } = render(<FileExplorer {...baseProps()} />)
    const inputs = container.querySelectorAll('input[type="file"]')
    expect(inputs.length).toBe(2)
    const input = inputs[0] as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg')] } })

    expect(filesFromPicker).toHaveBeenCalled()
    expect(upload.start).toHaveBeenCalledWith([{ path: 'a.jpg', file: expect.any(File) }])
    expect(input.value).toBe('')
  })

  it('does not start an upload when the picker walks nothing', () => {
    filesFromPicker.mockReturnValue([])
    const { container } = render(<FileExplorer {...baseProps()} />)
    const inputs = container.querySelectorAll('input[type="file"]')
    fireEvent.change(inputs[0] as HTMLInputElement, {
      target: { files: [new File(['x'], 'a.jpg')] },
    })

    expect(upload.start).not.toHaveBeenCalled()
  })

  it('shows the drag overlay naming the destination while dragging over the album view', () => {
    const { container } = render(<FileExplorer {...baseProps({ page: page({ folder: '' }) })} />)
    fireEvent.dragEnter(dropZone(container))
    expect(screen.getByText('Drop into Album')).toBeInTheDocument()
  })

  it('does not attach drop handlers at all on the media view — dragenter is a no-op', () => {
    const { container } = render(<FileExplorer {...baseProps({ view: 'media' })} />)
    fireEvent.dragEnter(dropZone(container))
    expect(screen.queryByText(/Drop into/)).not.toBeInTheDocument()
  })

  it('keeps the drag overlay while any nested dragenter/dragleave pair remains unbalanced', () => {
    const { container } = render(<FileExplorer {...baseProps()} />)
    const zone = dropZone(container)

    fireEvent.dragEnter(zone)
    fireEvent.dragEnter(zone) // entering a child tile
    fireEvent.dragLeave(zone) // leaving that child tile back onto the parent
    expect(screen.getByText(/Drop into/)).toBeInTheDocument()

    fireEvent.dragLeave(zone) // leaving the zone itself
    expect(screen.queryByText(/Drop into/)).not.toBeInTheDocument()
  })

  it('starts a walk from drop entries when the entry API is available', () => {
    entriesFromDrop.mockReturnValue([{ name: 'fake-entry' }])
    const { container } = render(<FileExplorer {...baseProps()} />)
    fireEvent.drop(dropZone(container), { dataTransfer: { items: [], files: [] } })

    expect(upload.startWalk).toHaveBeenCalledWith([{ name: 'fake-entry' }])
    expect(upload.start).not.toHaveBeenCalled()
  })

  it('falls back to a flat file list when the drop carries no entry API', () => {
    entriesFromDrop.mockReturnValue([])
    filesFromDropList.mockReturnValue([{ path: 'flat.jpg', file: new File(['x'], 'flat.jpg') }])
    const { container } = render(<FileExplorer {...baseProps()} />)
    fireEvent.drop(dropZone(container), { dataTransfer: { items: [], files: [] } })

    expect(upload.start).toHaveBeenCalledWith([{ path: 'flat.jpg', file: expect.any(File) }])
  })
})
