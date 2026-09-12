// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The framing half (CropStudio + CircleFrame) is a separately-owned, already-landed subsystem
// (F33) this phase re-hosts and does not re-litigate — see the file's own header. Stubs record
// what they were given without redoing CropStudio's pointer/pinch geometry here.
vi.mock('@/components/admin/CropStudio', () => ({
  CropStudio: ({
    crop,
    onChange,
    disabled,
  }: {
    crop: { scale: number }
    onChange: (c: { scale: number; x: number; y: number }) => void
    disabled: boolean
  }) => (
    <div data-testid="crop-studio" data-scale={crop.scale} data-disabled={String(disabled)}>
      <button type="button" onClick={() => onChange({ scale: 2, x: 5, y: 5 })}>
        drag
      </button>
    </div>
  ),
}))
vi.mock('@/components/admin/CircleFrame', () => ({
  CircleFrame: ({ sizeClass }: { sizeClass: string }) => (
    <span data-testid="circle-frame" data-size={sizeClass} />
  ),
}))
vi.mock('@/components/admin/ShareToNinaItem', () => ({
  ShareToNinaItem: ({ photoId }: { photoId: string }) => (
    <button type="button" data-testid="share-to-nina" data-photo={photoId}>
      Share
    </button>
  ),
}))

const { saver } = vi.hoisted(() => ({
  saver: { busy: false, notice: null as string | null, warm: vi.fn(), save: vi.fn() },
}))
vi.mock('@/components/ui/useSavePhoto', () => ({ useSavePhoto: () => saver }))

const {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} = vi.hoisted(() => ({
  deleteNinaAvatarAction: vi.fn(),
  describeNinaAvatarAction: vi.fn(),
  editNinaAvatarDescriptionAction: vi.fn(),
  saveNinaAvatarCropAction: vi.fn(),
  setCurrentNinaAvatarAction: vi.fn(),
}))
vi.mock('@/lib/admin/ninaAlbumActions', () => ({
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
}))

// The media dispatch arm renders `MediaPane`, whose own suite exercises it in full — mocked here
// the way `ChatScreen.test.tsx` mocks a sibling component that is already covered elsewhere.
// `isMediaRow` is reimplemented rather than re-imported from the real module: the real
// `./MediaPane` drags in `lib/admin/chatPhotoActions` -> the auth chain -> `next/server`, which
// Vitest's `node` resolution cannot load — the exact reason `MediaControls.test.tsx` mocks
// `chatPhotoActions` at its own boundary instead of importing it live.
vi.mock('./MediaPane', () => ({
  isMediaRow: (photo: { origin: string }) => photo.origin === 'media',
  MediaPane: ({ photo }: { photo: { id: string } }) => (
    <div data-testid="media-pane" data-photo={photo.id} />
  ),
}))

import { SelectionPane } from './SelectionPane'
import type { AlbumExplorerPhoto, MediaExplorerPhoto } from './model'

function albumPhoto(overrides?: Partial<AlbumExplorerPhoto>): AlbumExplorerPhoto {
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
    folder: 'bali',
    thumbUrl: null,
    origin: 'album',
    ...overrides,
  }
}

function mediaPhoto(overrides?: Partial<MediaExplorerPhoto>): MediaExplorerPhoto {
  return {
    id: 'm1',
    url: 'https://blob.example/m1.jpg',
    filename: 'm1.jpg',
    width: 800,
    height: 600,
    bytes: 1000,
    source: 'generated',
    isCurrent: false,
    description: null,
    crop: { scale: 1, x: 0, y: 0 },
    createdAt: '2026-09-01T00:00:00.000Z',
    folder: '',
    thumbUrl: null,
    origin: 'media',
    kind: 'generated',
    side: 'hers',
    prompt: null,
    messageId: 'msg1',
    sortOrder: 0,
    ...overrides,
  }
}

function baseProps() {
  return {
    userId: 'user1',
    shareOrigin: 'https://example.com',
    onClose: vi.fn(),
    onRemoved: vi.fn(),
  }
}

describe('SelectionPane dispatcher', () => {
  it('renders MediaPane for a media-origin row', () => {
    render(<SelectionPane {...baseProps()} photo={mediaPhoto({ id: 'm42' })} />)
    expect(screen.getByTestId('media-pane')).toHaveAttribute('data-photo', 'm42')
  })

  it('renders the album pane for an album-origin row', () => {
    render(<SelectionPane {...baseProps()} photo={albumPhoto({ filename: 'jakarta.jpg' })} />)
    expect(screen.queryByTestId('media-pane')).not.toBeInTheDocument()
    expect(screen.getByText('jakarta.jpg')).toBeInTheDocument()
  })
})

describe('AlbumSelectionPane (via SelectionPane)', () => {
  beforeEach(() => {
    deleteNinaAvatarAction.mockReset().mockResolvedValue({ ok: true })
    describeNinaAvatarAction.mockReset().mockResolvedValue({ ok: true })
    editNinaAvatarDescriptionAction.mockReset().mockResolvedValue({ ok: true })
    saveNinaAvatarCropAction.mockReset().mockResolvedValue({ ok: true })
    setCurrentNinaAvatarAction.mockReset().mockResolvedValue({ ok: true })
    saver.busy = false
    saver.notice = null
  })

  it('shows the filename and folder breadcrumb', () => {
    render(
      <SelectionPane {...baseProps()} photo={albumPhoto({ filename: 'a.jpg', folder: 'bali' })} />,
    )
    expect(screen.getByText('a.jpg')).toBeInTheDocument()
    expect(screen.getByText('Album / bali')).toBeInTheDocument()
  })

  it('calls onClose from the × button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SelectionPane {...baseProps()} onClose={onClose} photo={albumPhoto()} />)
    await user.click(screen.getByRole('button', { name: 'Close the details pane' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Save framing until the crop studio reports a drag', async () => {
    const user = userEvent.setup()
    render(<SelectionPane {...baseProps()} photo={albumPhoto()} />)
    expect(screen.getByRole('button', { name: 'Framing saved' })).toBeDisabled()

    await user.click(screen.getByText('drag'))
    expect(screen.getByRole('button', { name: 'Save framing' })).toBeEnabled()
  })

  /*
   * The rail's verbs run inside `useTransition` (`run()`), whose settle React commits in two
   * passes — the results render, then the `isPending` flip. `await user.click(...)` usually
   * out-waits both, but under a loaded machine the second pass can land after the click returns,
   * and a bare `expect(action).toHaveBeenCalledWith(...)` then fails without a retry. Every
   * assertion below that depends on an action's flight is therefore waited for, not assumed.
   */
  it('saves the dragged crop values on Save framing', async () => {
    const user = userEvent.setup()
    render(<SelectionPane {...baseProps()} photo={albumPhoto({ id: 'crop-me' })} />)
    await user.click(screen.getByText('drag'))
    await user.click(screen.getByRole('button', { name: 'Save framing' }))

    await waitFor(() =>
      expect(saveNinaAvatarCropAction).toHaveBeenCalledWith({
        id: 'crop-me',
        scale: 2,
        x: 5,
        y: 5,
      }),
    )
  })

  it('shows the refusal sentence and leaves the crop dirty when the save action refuses', async () => {
    saveNinaAvatarCropAction.mockResolvedValue({ ok: false, error: 'crop rejected' })
    const user = userEvent.setup()
    render(<SelectionPane {...baseProps()} photo={albumPhoto()} />)
    await user.click(screen.getByText('drag'))
    await user.click(screen.getByRole('button', { name: 'Save framing' }))

    await waitFor(() => expect(screen.getByText('crop rejected')).toBeInTheDocument())
    // Still dirty: the Save button is still enabled.
    expect(screen.getByRole('button', { name: 'Save framing' })).toBeEnabled()
  })

  it('resets framing to identity on Reset', async () => {
    const user = userEvent.setup()
    render(
      <SelectionPane
        {...baseProps()}
        photo={albumPhoto({ id: 'reset-me', crop: { scale: 2, x: 1, y: 1 } })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Reset framing' }))
    expect(saveNinaAvatarCropAction).toHaveBeenCalledWith({ id: 'reset-me', scale: 1, x: 0, y: 0 })
  })

  it('disables Reset once the crop is already identity and undragged', () => {
    render(
      <SelectionPane {...baseProps()} photo={albumPhoto({ crop: { scale: 1, x: 0, y: 0 } })} />,
    )
    expect(screen.getByRole('button', { name: 'Reset framing' })).toBeDisabled()
  })

  it('sets the current avatar and disables the control once it already is one', async () => {
    const user = userEvent.setup()
    render(
      <SelectionPane {...baseProps()} photo={albumPhoto({ id: 'promote-me', isCurrent: false })} />,
    )
    await user.click(screen.getByRole('button', { name: 'Set as her profile picture' }))
    await waitFor(() => expect(setCurrentNinaAvatarAction).toHaveBeenCalledWith('promote-me'))
  })

  it('disables the profile-picture control when the photo is already current', () => {
    render(<SelectionPane {...baseProps()} photo={albumPhoto({ isCurrent: true })} />)
    expect(screen.getByRole('button', { name: 'Her profile picture' })).toBeDisabled()
  })

  it('removes the photo and calls onRemoved(null) on success', async () => {
    const user = userEvent.setup()
    const onRemoved = vi.fn()
    render(
      <SelectionPane {...baseProps()} onRemoved={onRemoved} photo={albumPhoto({ id: 'del-me' })} />,
    )
    await user.click(screen.getByRole('button', { name: 'Remove this photo' }))
    await waitFor(() => expect(deleteNinaAvatarAction).toHaveBeenCalledWith('del-me'))
    // `onRemoved` fires only after the action resolves inside the same transition.
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(null))
  })

  it('disables Remove when the photo is her current profile picture, so she is never left without one', () => {
    render(<SelectionPane {...baseProps()} photo={albumPhoto({ isCurrent: true })} />)
    expect(screen.getByRole('button', { name: 'Remove this photo' })).toBeDisabled()
  })

  it('renders the ShareToNinaItem with this photo id and the threaded shareOrigin, never window.location', () => {
    render(
      <SelectionPane
        {...baseProps()}
        shareOrigin="https://example.com/x"
        photo={albumPhoto({ id: 'share-me' })}
      />,
    )
    expect(screen.getByTestId('share-to-nina')).toHaveAttribute('data-photo', 'share-me')
  })

  it('wires PhotoDescription to the album save/redescribe actions', async () => {
    const user = userEvent.setup()
    render(
      <SelectionPane
        {...baseProps()}
        photo={albumPhoto({ id: 'desc-me', description: 'old text' })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Re-describe it — it overwrites' }))
    await waitFor(() => expect(describeNinaAvatarAction).toHaveBeenCalledWith('desc-me'))

    const textarea = screen.getByLabelText('What she can see in it')
    await user.type(textarea, ' more')
    await user.click(screen.getByRole('button', { name: 'Save the description' }))
    await waitFor(() =>
      expect(editNinaAvatarDescriptionAction).toHaveBeenCalledWith({
        id: 'desc-me',
        description: 'old text more',
      }),
    )
  })

  it('shows the source, pixel dimensions and thumbnail-presence facts', () => {
    render(
      <SelectionPane
        {...baseProps()}
        photo={albumPhoto({ source: 'upload', width: 640, height: 480, thumbUrl: null })}
      />,
    )
    expect(screen.getByText('upload')).toBeInTheDocument()
    expect(screen.getByText('640', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('None — the grid loads the original')).toBeInTheDocument()
  })
})
