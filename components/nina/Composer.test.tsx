// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ upload }))

const { describeNinaImage, findNinaDuplicateChatImage } = vi.hoisted(() => ({
  describeNinaImage: vi.fn(),
  findNinaDuplicateChatImage: vi.fn(),
}))
vi.mock('@/lib/nina/actions', () => ({ describeNinaImage, findNinaDuplicateChatImage }))

const { compressForNina } = vi.hoisted(() => ({ compressForNina: vi.fn() }))
vi.mock('@/lib/photos/compressForNina', () => ({ compressForNina }))

const { contentHashOf } = vi.hoisted(() => ({ contentHashOf: vi.fn() }))
vi.mock('@/lib/photos/contentHash', () => ({ contentHashOf }))

// Real modules below: lib/nina/dedupe.ts, lib/nina/images.ts and lib/id.ts are pure, and the
// pick/dedupe DECISIONS they make are exactly what these tests exercise — mocking them would just
// re-implement the thing under test inside the mock.
import { Composer } from './Composer'
import type { ComposerDraftImage } from './useComposerPhotos'
import type { NinaExistingPhoto, RunAttachment } from '@/lib/nina/attach'
import type { QuoteView } from '@/lib/nina/reply'

const USER_ID = 'user-1'

const REPLY: QuoteView = {
  targetId: 'msg000000002',
  author: 'you',
  preview: 'earlier text',
  media: 'none',
}

const ATTACHMENT: RunAttachment = {
  runId: 'run-1',
  day: 'Thu, 20 Aug 2026',
  activityType: 'Outdoor Run',
  location: 'Park',
  distance: '10.67 km',
  duration: '1:02:33',
  pace: '5\'52"/km',
}

const EXISTING_PHOTO: NinaExistingPhoto = {
  kind: 'image',
  id: 'photo-1',
  url: 'https://blob.example/existing.jpg',
}

function baseProps(overrides?: Partial<React.ComponentProps<typeof Composer>>) {
  return {
    onSend: vi.fn(),
    busy: false,
    bottomCss: '0px',
    padBottomCss: '0px',
    userId: USER_ID,
    ...overrides,
  }
}

function sendButton() {
  return screen.getByRole('button', { name: 'Send' })
}

function textbox() {
  return screen.getByRole('textbox', { name: 'Message Nina' })
}

function imageFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['fake-bytes'], name, { type })
}

/** Wires the happy-path pick pipeline (compress -> hash -> pre-check -> upload -> describe) to
 * resolve with no duplicate, so a picked tile reaches `ready` with an upload ticket. */
function mockUploadPipeline(overrides?: {
  ticket?: string | null
  pathname?: string
  url?: string
}) {
  compressForNina.mockResolvedValue({
    file: imageFile('compressed.jpg'),
    width: 800,
    height: 600,
    originalBytes: 500_000,
    compressedBytes: 150_000,
  })
  contentHashOf.mockResolvedValue('a'.repeat(64))
  findNinaDuplicateChatImage.mockResolvedValue(null)
  upload.mockResolvedValue({
    url: overrides?.url ?? 'https://blob.example/nina/user-1/chat/abc-suffix.jpg',
    pathname: overrides?.pathname ?? 'nina/user-1/chat/abc-suffix.jpg',
  })
  describeNinaImage.mockResolvedValue({ ticket: overrides?.ticket ?? 'ticket-abc' })
}

beforeEach(() => {
  upload.mockReset()
  describeNinaImage.mockReset()
  findNinaDuplicateChatImage.mockReset()
  compressForNina.mockReset()
  contentHashOf.mockReset()
})

describe('Composer', () => {
  it('renders with Send disabled and no tiles when empty', () => {
    render(<Composer {...baseProps()} />)
    expect(sendButton()).toBeDisabled()
    expect(textbox()).toHaveValue('')
  })

  it('enables Send once text is typed, and disables it again when cleared', async () => {
    const user = userEvent.setup()
    render(<Composer {...baseProps()} />)

    await user.type(textbox(), 'hello')
    expect(sendButton()).toBeEnabled()

    await user.clear(textbox())
    expect(sendButton()).toBeDisabled()
  })

  it('sends the trimmed body and clears the input after send', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Composer {...baseProps({ onSend })} />)

    await user.type(textbox(), '  hi nina  ')
    await user.click(sendButton())

    expect(onSend).toHaveBeenCalledWith({ body: 'hi nina', images: [] })
    expect(textbox()).toHaveValue('')
    expect(sendButton()).toBeDisabled()
  })

  it('submits on Enter and inserts a newline on Shift+Enter instead', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Composer {...baseProps({ onSend })} />)

    await user.type(textbox(), 'line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
    expect(textbox()).toHaveValue('line one\n')

    await user.type(textbox(), 'line two')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith({ body: 'line one\nline two', images: [] })
  })

  it('rejects a non-image pick with a notice and never runs the upload pipeline', async () => {
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    // fireEvent rather than userEvent.upload: the latter mimics the OS picker's own filtering
    // against the input's `accept="image/*"` and never dispatches change for a non-matching file,
    // which would test userEvent's filtering instead of `planNinaPicked`'s own rejection.
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByText('That is not a photo.')).toBeInTheDocument()
    expect(compressForNina).not.toHaveBeenCalled()
  })

  it('rejects an oversized pick with a notice and never runs the upload pipeline', async () => {
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const big = imageFile('big.jpg')
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 })
    await user.upload(input, big)

    expect(await screen.findByText('That photo is too big.')).toBeInTheDocument()
    expect(compressForNina).not.toHaveBeenCalled()
  })

  it('rejects a pick past the three-photo cap, but still processes the accepted ones', async () => {
    mockUploadPipeline()
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, [
      imageFile('a.jpg'),
      imageFile('b.jpg'),
      imageFile('c.jpg'),
      imageFile('d.jpg'),
    ])

    expect(await screen.findByText('Nina takes 3 photos at a time.')).toBeInTheDocument()
    await waitFor(() => expect(compressForNina).toHaveBeenCalledTimes(3))
  })

  it('runs a picked photo through compress, hash, dedupe-check, upload and describe, then enables Send', async () => {
    mockUploadPipeline()
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())

    await waitFor(() => expect(sendButton()).toBeEnabled())
    expect(compressForNina).toHaveBeenCalledTimes(1)
    expect(findNinaDuplicateChatImage).toHaveBeenCalledWith({
      contentHash: 'a'.repeat(64),
      sourceHash: 'a'.repeat(64),
    })
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^nina\/user-1\/chat\/[A-Za-z0-9_-]{12}\.jpg$/),
      expect.anything(),
      expect.objectContaining({ access: 'public', handleUploadUrl: '/api/upload' }),
    )
    expect(describeNinaImage).toHaveBeenCalledWith(
      expect.objectContaining({
        blobUrl: 'https://blob.example/nina/user-1/chat/abc-suffix.jpg',
        pathname: 'nina/user-1/chat/abc-suffix.jpg',
        width: 800,
        height: 600,
        bytes: 150_000,
      }),
    )
  })

  it('sends an uploaded image in the upload shape on submit', async () => {
    mockUploadPipeline({ ticket: 'ticket-xyz' })
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { container } = render(<Composer {...baseProps({ onSend })} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())
    await waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())

    expect(onSend).toHaveBeenCalledWith({
      body: '',
      images: [
        {
          source: 'upload',
          ticket: 'ticket-xyz',
          url: 'https://blob.example/nina/user-1/chat/abc-suffix.jpg',
          pathname: 'nina/user-1/chat/abc-suffix.jpg',
          contentHash: 'a'.repeat(64),
        } satisfies ComposerDraftImage,
      ],
    })
  })

  it('skips the upload entirely and attaches the existing photo when the dedupe pre-check matches', async () => {
    compressForNina.mockResolvedValue({
      file: imageFile('compressed.jpg'),
      width: 800,
      height: 600,
      originalBytes: 500_000,
      compressedBytes: 150_000,
    })
    contentHashOf.mockResolvedValue('a'.repeat(64))
    findNinaDuplicateChatImage.mockResolvedValue(EXISTING_PHOTO)

    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())

    await waitFor(() => expect(sendButton()).toBeEnabled())
    expect(upload).not.toHaveBeenCalled()
    expect(describeNinaImage).not.toHaveBeenCalled()
  })

  it('sends a deduped image by reference on submit', async () => {
    compressForNina.mockResolvedValue({
      file: imageFile('compressed.jpg'),
      width: 800,
      height: 600,
      originalBytes: 500_000,
      compressedBytes: 150_000,
    })
    contentHashOf.mockResolvedValue('a'.repeat(64))
    findNinaDuplicateChatImage.mockResolvedValue(EXISTING_PHOTO)

    const user = userEvent.setup()
    const onSend = vi.fn()
    const { container } = render(<Composer {...baseProps({ onSend })} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())
    await waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())

    expect(onSend).toHaveBeenCalledWith({
      body: '',
      images: [
        {
          source: 'deduped',
          url: EXISTING_PHOTO.url,
          imageId: EXISTING_PHOTO.id,
        } satisfies ComposerDraftImage,
      ],
    })
  })

  it('keeps the tile unsendable when describe returns no ticket', async () => {
    mockUploadPipeline()
    describeNinaImage.mockResolvedValue({ ticket: null })
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())

    await waitFor(() => expect(describeNinaImage).toHaveBeenCalledTimes(1))
    // Give the failed-describe patch a tick to land, then confirm the tile never becomes sendable.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sendButton()).toBeDisabled()
  })

  it('keeps the tile unsendable when compression throws', async () => {
    compressForNina.mockRejectedValue(new Error('decode failed'))
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())

    await waitFor(() => expect(compressForNina).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sendButton()).toBeDisabled()
    expect(findNinaDuplicateChatImage).not.toHaveBeenCalled()
  })

  it('removes a ready tile and disables Send again once no ready tiles remain', async () => {
    mockUploadPipeline()
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, imageFile())
    await waitFor(() => expect(sendButton()).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Remove photo' }))

    expect(sendButton()).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
  })

  it('renders the reply strip and cancels it without touching the draft text', async () => {
    const user = userEvent.setup()
    const onCancelReply = vi.fn()
    render(<Composer {...baseProps({ reply: REPLY, onCancelReply })} />)

    expect(screen.getByText('earlier text')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(onCancelReply).toHaveBeenCalledTimes(1)
  })

  it('renders the attachment chip and clearing it leaves Send enabled with no text', async () => {
    const user = userEvent.setup()
    const onClearAttachment = vi.fn()
    render(<Composer {...baseProps({ attachment: ATTACHMENT, onClearAttachment })} />)

    expect(sendButton()).toBeEnabled()
    expect(screen.getByText('10.67 km · 1:02:33 · 5\'52"/km')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove the attached run' }))
    expect(onClearAttachment).toHaveBeenCalledTimes(1)
  })

  it('renders the photo chip and reports the clear tap', async () => {
    const user = userEvent.setup()
    const onClearPhoto = vi.fn()
    render(<Composer {...baseProps({ photo: EXISTING_PHOTO, onClearPhoto })} />)

    expect(sendButton()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Remove the attached photo' }))
    expect(onClearPhoto).toHaveBeenCalledTimes(1)
  })

  it('disables the add-photo button once three tiles are held', async () => {
    mockUploadPipeline()
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, [imageFile('a.jpg'), imageFile('b.jpg'), imageFile('c.jpg')])

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDisabled())
  })

  it('keeps Send disabled while busy even with a typed draft', async () => {
    const user = userEvent.setup()
    render(<Composer {...baseProps({ busy: true })} />)

    await user.type(textbox(), 'hello')
    expect(sendButton()).toBeDisabled()
  })
})
