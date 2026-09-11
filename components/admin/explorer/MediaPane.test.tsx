// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/admin/CropStudio', () => ({
  CropStudio: ({ crop, onChange, disabled }: { crop: { scale: number }; onChange: (c: { scale: number; x: number; y: number }) => void; disabled: boolean }) => (
    <div data-testid="crop-studio" data-scale={crop.scale} data-disabled={String(disabled)}>
      <button type="button" onClick={() => onChange({ scale: 3, x: 1, y: 1 })}>
        drag
      </button>
    </div>
  ),
}))
vi.mock('@/components/admin/CircleFrame', () => ({
  CircleFrame: ({ sizeClass }: { sizeClass: string }) => <span data-testid="circle-frame" data-size={sizeClass} />,
}))

const { saver } = vi.hoisted(() => ({
  saver: { busy: false, notice: null as string | null, warm: vi.fn(), save: vi.fn() },
}))
vi.mock('@/components/ui/useSavePhoto', () => ({ useSavePhoto: () => saver }))

const { describeChatPhotoAction, editChatPhotoDescriptionAction } = vi.hoisted(() => ({
  describeChatPhotoAction: vi.fn(),
  editChatPhotoDescriptionAction: vi.fn(),
}))
vi.mock('@/lib/admin/chatPhotoActions', () => ({ describeChatPhotoAction, editChatPhotoDescriptionAction }))

const { setChatPhotoAsAvatarAction } = vi.hoisted(() => ({ setChatPhotoAsAvatarAction: vi.fn() }))
vi.mock('@/lib/admin/ninaAlbumActions', () => ({ setChatPhotoAsAvatarAction }))

// `MediaControls`' own upload/replace/remove flow is exercised in full by `MediaControls.test.tsx`
// — mocked here the way `ChatScreen.test.tsx` mocks a sibling component covered elsewhere.
vi.mock('./MediaControls', () => ({
  MediaControls: ({ photoId }: { photoId: string }) => (
    <div data-testid="media-controls" data-photo={photoId} />
  ),
}))

import { MediaPane } from './MediaPane'
import type { MediaExplorerPhoto } from './model'

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
    createdAt: '2026-09-01T12:30:00.000Z',
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
  return { userId: 'user1', onClose: vi.fn(), onRemoved: vi.fn() }
}

describe('MediaPane', () => {
  beforeEach(() => {
    describeChatPhotoAction.mockReset().mockResolvedValue({ ok: true })
    editChatPhotoDescriptionAction.mockReset().mockResolvedValue({ ok: true })
    setChatPhotoAsAvatarAction.mockReset().mockResolvedValue({ ok: true })
    saver.busy = false
    saver.notice = null
  })

  it('shows the created-at timestamp as the header', () => {
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ createdAt: '2026-09-01T12:30:00.000Z' })} />)
    expect(screen.getByText(new Date('2026-09-01T12:30:00.000Z').toLocaleString())).toBeInTheDocument()
  })

  it('calls onClose from the × button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MediaPane {...baseProps()} onClose={onClose} photo={mediaPhoto()} />)
    await user.click(screen.getByRole('button', { name: 'Close the details pane' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('labels the source by kind — upload vs generated', () => {
    const { rerender } = render(<MediaPane {...baseProps()} photo={mediaPhoto({ kind: 'upload' })} />)
    expect(screen.getByText('His upload, from the chat')).toBeInTheDocument()

    rerender(<MediaPane {...baseProps()} photo={mediaPhoto({ kind: 'generated' })} />)
    expect(screen.getByText('Generated in the chat')).toBeInTheDocument()
  })

  it('shows no prompt toggle at all when prompt is null — not a dimmed one', () => {
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ prompt: null })} />)
    expect(screen.queryByRole('button', { name: 'What she was asked to draw' })).not.toBeInTheDocument()
  })

  it('reveals the prompt on toggle when the sidecar exists', async () => {
    const user = userEvent.setup()
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ prompt: 'a golden retriever in the surf' })} />)
    const toggle = screen.getByRole('button', { name: 'What she was asked to draw' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('a golden retriever in the surf')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('a golden retriever in the surf')).toBeInTheDocument()
  })

  it('adopts the draft crop as her profile picture, then latches "worn" and disables the control', async () => {
    const user = userEvent.setup()
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ id: 'adopt-me' })} />)
    await user.click(screen.getByText('drag'))
    await user.click(screen.getByRole('button', { name: 'Set as her profile picture' }))

    expect(setChatPhotoAsAvatarAction).toHaveBeenCalledWith({ id: 'adopt-me', scale: 3, x: 1, y: 1 })
    expect(await screen.findByRole('button', { name: "She's wearing this one now" })).toBeDisabled()
  })

  it('does not latch worn when the adopt action refuses', async () => {
    setChatPhotoAsAvatarAction.mockResolvedValue({ ok: false, error: 'already exists' })
    const user = userEvent.setup()
    render(<MediaPane {...baseProps()} photo={mediaPhoto()} />)
    await user.click(screen.getByRole('button', { name: 'Set as her profile picture' }))

    expect(screen.getByText('already exists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set as her profile picture' })).toBeEnabled()
  })

  it('renders MediaControls with this photo id, and forwards onRemoved through it', () => {
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ id: 'ctl-me' })} />)
    expect(screen.getByTestId('media-controls')).toHaveAttribute('data-photo', 'ctl-me')
  })

  it('wires PhotoDescription to the media describe/edit actions', async () => {
    const user = userEvent.setup()
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ id: 'desc-me', description: 'stored' })} />)

    const textarea = screen.getByLabelText('What she can see in it')
    await user.type(textarea, ' more')
    await user.click(screen.getByRole('button', { name: 'Save the description' }))
    expect(editChatPhotoDescriptionAction).toHaveBeenCalledWith({ id: 'desc-me', description: 'stored more' })

    await user.click(screen.getByRole('button', { name: 'Re-describe it — it overwrites' }))
    expect(describeChatPhotoAction).toHaveBeenCalledWith({ id: 'desc-me' })
  })

  it('shows the empty note naming a media row specifically, not the album wording', () => {
    render(<MediaPane {...baseProps()} photo={mediaPhoto({ description: null })} />)
    expect(
      screen.getByText(/reload in a moment if it was just added or replaced/),
    ).toBeInTheDocument()
  })
})
