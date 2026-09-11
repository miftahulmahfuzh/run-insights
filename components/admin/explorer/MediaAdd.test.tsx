// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Both are separate flight boundaries `MediaAdd` composes in a `for` loop — see the header's
// "SEQUENTIAL, not Promise.all" note. Mocking each lets a test control one file's outcome without
// faking the real JPEG-encode/Blob-PUT pipeline `uploadChatPhoto` runs.
const { addChatPhotoAction } = vi.hoisted(() => ({ addChatPhotoAction: vi.fn() }))
vi.mock('@/lib/admin/chatPhotoActions', () => ({ addChatPhotoAction }))

const { uploadChatPhoto } = vi.hoisted(() => ({ uploadChatPhoto: vi.fn() }))
vi.mock('./chatPhotoUpload', () => ({ uploadChatPhoto }))

import { MediaAdd } from './MediaAdd'

function file(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

async function pick(container: HTMLElement, files: File[]) {
  const input = fileInput(container)
  await userEvent.upload(input, files)
}

describe('MediaAdd', () => {
  beforeEach(() => {
    addChatPhotoAction.mockReset()
    uploadChatPhoto.mockReset()
  })

  it('uploads a picked file and clears the input value afterward', async () => {
    uploadChatPhoto.mockResolvedValue({ url: 'https://blob.example/x.jpg' })
    addChatPhotoAction.mockResolvedValue({ ok: true })
    const { container } = render(<MediaAdd userId="user1" />)

    await pick(container, [file('a.jpg')])

    expect(uploadChatPhoto).toHaveBeenCalledWith('user1', expect.objectContaining({ name: 'a.jpg' }), {
      dedupe: true,
    })
    expect(addChatPhotoAction).toHaveBeenCalledWith({ url: 'https://blob.example/x.jpg' })
    expect(fileInput(container).value).toBe('')
  })

  it('uploads multiple picked files one at a time, in order', async () => {
    const order: string[] = []
    uploadChatPhoto.mockImplementation(async (_userId: string, f: File) => {
      order.push(f.name)
      return { url: `https://blob.example/${f.name}` }
    })
    addChatPhotoAction.mockResolvedValue({ ok: true })
    const { container } = render(<MediaAdd userId="user1" />)

    await pick(container, [file('a.jpg'), file('b.jpg'), file('c.jpg')])

    expect(order).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(uploadChatPhoto).toHaveBeenCalledTimes(3)
  })

  it('records a per-file failure and keeps going, rather than aborting the batch', async () => {
    uploadChatPhoto.mockImplementation(async (_userId: string, f: File) => {
      if (f.name === 'bad.jpg') throw new Error('upload exploded')
      return { url: `https://blob.example/${f.name}` }
    })
    addChatPhotoAction.mockResolvedValue({ ok: true })
    const { container } = render(<MediaAdd userId="user1" />)

    await pick(container, [file('bad.jpg'), file('good.jpg')])

    expect(uploadChatPhoto).toHaveBeenCalledTimes(2)
    expect(screen.getByText('bad.jpg: upload exploded')).toBeInTheDocument()
    expect(screen.queryByText(/good\.jpg/)).not.toBeInTheDocument()
  })

  it('records a refusal from the action with its error text', async () => {
    uploadChatPhoto.mockResolvedValue({ url: 'https://blob.example/dup.jpg' })
    addChatPhotoAction.mockResolvedValue({ ok: false, error: 'duplicate of another row' })
    const { container } = render(<MediaAdd userId="user1" />)

    await pick(container, [file('dup.jpg')])

    expect(screen.getByText('dup.jpg: duplicate of another row')).toBeInTheDocument()
  })

  it('falls back to "refused" when the action gives no error text', async () => {
    uploadChatPhoto.mockResolvedValue({ url: 'https://blob.example/x.jpg' })
    addChatPhotoAction.mockResolvedValue({ ok: false })
    const { container } = render(<MediaAdd userId="user1" />)

    await pick(container, [file('x.jpg')])

    expect(screen.getByText('x.jpg: refused')).toBeInTheDocument()
  })

  it('clears the previous error list at the start of a new pick', async () => {
    uploadChatPhoto.mockRejectedValueOnce(new Error('first failure'))
    const { container } = render(<MediaAdd userId="user1" />)
    await pick(container, [file('a.jpg')])
    expect(screen.getByText('a.jpg: first failure')).toBeInTheDocument()

    uploadChatPhoto.mockResolvedValueOnce({ url: 'https://blob.example/b.jpg' })
    addChatPhotoAction.mockResolvedValueOnce({ ok: true })
    await pick(container, [file('b.jpg')])
    expect(screen.queryByText('a.jpg: first failure')).not.toBeInTheDocument()
  })

  it('shows the button in a loading state while a batch is in flight', async () => {
    let resolveUpload!: (value: { url: string }) => void
    uploadChatPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    const { container } = render(<MediaAdd userId="user1" />)
    const user = userEvent.setup()
    await user.upload(fileInput(container), [file('a.jpg')])

    const button = screen.getByRole('button', { name: 'Add photos' })
    expect(button).toBeDisabled()

    resolveUpload({ url: 'https://blob.example/a.jpg' })
  })
})
