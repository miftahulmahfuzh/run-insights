// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { removeChatPhotoAction, replaceChatPhotoAction } = vi.hoisted(() => ({
  removeChatPhotoAction: vi.fn(),
  replaceChatPhotoAction: vi.fn(),
}))
vi.mock('@/lib/admin/chatPhotoActions', () => ({ removeChatPhotoAction, replaceChatPhotoAction }))

const { uploadChatPhoto } = vi.hoisted(() => ({ uploadChatPhoto: vi.fn() }))
vi.mock('./chatPhotoUpload', () => ({ uploadChatPhoto }))

import { MediaControls } from './MediaControls'

function replaceButton() {
  return screen.getByRole('button', { name: 'Replace this photo' })
}

function removeButton() {
  return screen.getByRole('button', { name: 'Remove this photo' })
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

describe('MediaControls', () => {
  beforeEach(() => {
    removeChatPhotoAction.mockReset()
    replaceChatPhotoAction.mockReset()
    uploadChatPhoto.mockReset()
  })

  it('removes the photo and calls onRemoved with the action note', async () => {
    const user = userEvent.setup()
    removeChatPhotoAction.mockResolvedValue({ ok: true, note: 'kept — still referenced elsewhere' })
    const onRemoved = vi.fn()
    render(<MediaControls userId="u1" photoId="p1" onRemoved={onRemoved} />)

    await user.click(removeButton())

    expect(removeChatPhotoAction).toHaveBeenCalledWith({ id: 'p1' })
    expect(onRemoved).toHaveBeenCalledWith('kept — still referenced elsewhere')
  })

  it('calls onRemoved with null when the action carries no note', async () => {
    const user = userEvent.setup()
    removeChatPhotoAction.mockResolvedValue({ ok: true })
    const onRemoved = vi.fn()
    render(<MediaControls userId="u1" photoId="p1" onRemoved={onRemoved} />)

    await user.click(removeButton())

    expect(onRemoved).toHaveBeenCalledWith(null)
  })

  it('shows an inline error and does not call onRemoved when removal refuses', async () => {
    const user = userEvent.setup()
    removeChatPhotoAction.mockResolvedValue({ ok: false, error: 'that row is gone already' })
    const onRemoved = vi.fn()
    render(<MediaControls userId="u1" photoId="p1" onRemoved={onRemoved} />)

    await user.click(removeButton())

    expect(screen.getByText('that row is gone already')).toBeInTheDocument()
    expect(onRemoved).not.toHaveBeenCalled()
  })

  it('shows a default error sentence when a refusal carries no error text', async () => {
    const user = userEvent.setup()
    removeChatPhotoAction.mockResolvedValue({ ok: false })
    render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    await user.click(removeButton())

    expect(screen.getByText('That photo did not go away.')).toBeInTheDocument()
  })

  it('shows a caught exception as the error', async () => {
    const user = userEvent.setup()
    removeChatPhotoAction.mockRejectedValue(new Error('network dropped'))
    render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    await user.click(removeButton())

    expect(screen.getByText('network dropped')).toBeInTheDocument()
  })

  it('uploads and replaces on a file pick, then clears the input', async () => {
    uploadChatPhoto.mockResolvedValue({ url: 'https://blob.example/new.jpg' })
    replaceChatPhotoAction.mockResolvedValue({ ok: true })
    const { container } = render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    await userEvent.upload(fileInput(container), new File(['x'], 'new.jpg', { type: 'image/jpeg' }))

    expect(uploadChatPhoto).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'new.jpg' }))
    expect(replaceChatPhotoAction).toHaveBeenCalledWith({
      id: 'p1',
      url: 'https://blob.example/new.jpg',
    })
    expect(fileInput(container).value).toBe('')
  })

  it('shows the replace note on a successful replace', async () => {
    uploadChatPhoto.mockResolvedValue({ url: 'https://blob.example/new.jpg' })
    replaceChatPhotoAction.mockResolvedValue({ ok: true, note: 'old bytes kept elsewhere' })
    const { container } = render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    await userEvent.upload(fileInput(container), new File(['x'], 'new.jpg', { type: 'image/jpeg' }))

    expect(screen.getByText('old bytes kept elsewhere')).toBeInTheDocument()
  })

  it('shows an inline error when the replace action refuses', async () => {
    uploadChatPhoto.mockResolvedValue({ url: 'https://blob.example/new.jpg' })
    replaceChatPhotoAction.mockResolvedValue({ ok: false, error: 'wrong kind for this row' })
    const { container } = render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    await userEvent.upload(fileInput(container), new File(['x'], 'new.jpg', { type: 'image/jpeg' }))

    expect(screen.getByText('wrong kind for this row')).toBeInTheDocument()
  })

  it('does not upload when no file was actually picked', async () => {
    const { container } = render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)
    const input = fileInput(container)
    // Simulate the picker being cancelled: `change` fires with an empty FileList.
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))

    expect(uploadChatPhoto).not.toHaveBeenCalled()
  })

  it('disables both buttons while a replace is in flight, and re-enables after', async () => {
    let resolveUpload!: (value: { url: string }) => void
    uploadChatPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    replaceChatPhotoAction.mockResolvedValue({ ok: true })
    const { container } = render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    const user = userEvent.setup()
    await user.upload(fileInput(container), new File(['x'], 'new.jpg', { type: 'image/jpeg' }))

    expect(replaceButton()).toBeDisabled()
    expect(removeButton()).toBeDisabled()

    resolveUpload({ url: 'https://blob.example/new.jpg' })
    await screen.findByRole('button', { name: 'Replace this photo' })
    expect(replaceButton()).toBeEnabled()
    expect(removeButton()).toBeEnabled()
  })

  it('does not fire a second remove while one is in flight', async () => {
    let resolveRemove!: (value: { ok: boolean }) => void
    removeChatPhotoAction.mockReturnValue(
      new Promise((resolve) => {
        resolveRemove = resolve
      }),
    )
    const user = userEvent.setup()
    render(<MediaControls userId="u1" photoId="p1" onRemoved={vi.fn()} />)

    await user.click(removeButton())
    expect(removeButton()).toBeDisabled()
    await user.click(removeButton())
    expect(removeChatPhotoAction).toHaveBeenCalledTimes(1)

    resolveRemove({ ok: true })
  })
})
