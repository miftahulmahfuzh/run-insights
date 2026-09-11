// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Pure render, deliberately NOT AttachmentChip with a union prop (the header's own ruling): one
// img and one named clear button. Nothing here is I/O.
import { PhotoAttachmentChip } from './PhotoAttachmentChip'
import type { NinaExistingPhoto } from '@/lib/nina/attach'

function photo(overrides?: Partial<NinaExistingPhoto>): NinaExistingPhoto {
  return {
    kind: 'image',
    id: 'img-1',
    url: 'https://blob.example/photo.jpg',
    ...overrides,
  }
}

describe('PhotoAttachmentChip', () => {
  it('renders the pinned photo as a plain img with no accessible name of its own', () => {
    const { container } = render(<PhotoAttachmentChip photo={photo()} onClear={() => {}} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://blob.example/photo.jpg')
    // `alt=""` is invariant 5: the only description that exists is glm-4.6v's private prose.
    expect(img.getAttribute('alt')).toBe('')
    expect(img.className).toContain('size-14')
  })

  it('the photo is not a tap target — only the clear is', () => {
    const { container } = render(<PhotoAttachmentChip photo={photo()} onClear={() => {}} />)
    expect(container.querySelector('a')).toBeNull()
    // Exactly one interactive element in the whole chip.
    expect(container.querySelectorAll('button').length).toBe(1)
  })

  it('names the clear control and reports the clear', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<PhotoAttachmentChip photo={photo()} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: 'Remove the attached photo' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('the clear target holds the 44px floor', () => {
    render(<PhotoAttachmentChip photo={photo()} onClear={() => {}} />)
    expect(screen.getByRole('button', { name: 'Remove the attached photo' }).className).toContain(
      'size-11',
    )
  })
})
