// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Real `next/image` on the fallback branch (a static build asset renders as a plain img under the
// test renderer) and the REAL `ninaCropStyle` on the album branch. This component's entire job is
// choosing the right branch and passing the crop through unmolested, so the expected transform
// below is computed by the same function the admin studio previews with — re-typing it here would
// let the two implementations drift while both tests stayed green.
import { NinaAvatar } from './NinaAvatar'
import { NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { ninaCropStyle, resolveCrop } from '@/lib/nina/crop'

const BLOB_SRC = 'https://blob.example/nina-album.jpg'

describe('NinaAvatar', () => {
  it('renders the committed face through next/image when there is no album', () => {
    const { container } = render(<NinaAvatar />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('avatar-001')
    expect(img.getAttribute('alt')).toBe('')
  })

  it('renders an album photo as a plain img at its finished size, with no draggable ghost', () => {
    const { container } = render(<NinaAvatar src={BLOB_SRC} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(BLOB_SRC)
    expect(img.getAttribute('draggable')).toBe('false')
    // The album branch owns its positioning through the crop style, so it must not ALSO carry
    // the attributes `next/image fill` would have set — one writer per property.
    expect(img.getAttribute('sizes')).toBeNull()
  })

  it('takes the album branch when a crop is present even on the fallback src', () => {
    const crop = { scale: 1.2, x: 40, y: -20 }
    const { container } = render(
      <NinaAvatar src={NINA_AVATAR_FALLBACK_SRC} crop={crop} natural={null} />,
    )
    const img = container.querySelector('img') as HTMLImageElement
    // The plain-img branch, not `next/image`: draggable is the album branch's own attribute.
    expect(img.getAttribute('draggable')).toBe('false')
    expect(img.getAttribute('style')).toContain('position')
  })

  it('renders the album photo through the one shared crop mapping', () => {
    const natural = { width: 1200, height: 900 }
    const crop = { scale: 1.4, x: 120, y: -60 }
    const { container } = render(<NinaAvatar src={BLOB_SRC} natural={natural} crop={crop} />)
    const img = container.querySelector('img') as HTMLElement
    const expected = ninaCropStyle(natural, resolveCrop(crop))
    expect(img.style.width).toBe(expected.width)
    expect(img.style.height).toBe(expected.height)
    expect(img.style.left).toBe(expected.left)
    expect(img.style.top).toBe(expected.top)
    expect(img.style.objectFit).toBe('cover')
  })

  it('degrades an unknown natural size to the square cover the crop module prescribes', () => {
    const { container } = render(<NinaAvatar src={BLOB_SRC} natural={null} crop={null} />)
    const img = container.querySelector('img') as HTMLElement
    const expected = ninaCropStyle({ width: null, height: null }, resolveCrop(null))
    expect(img.style.width).toBe(expected.width)
    expect(img.style.height).toBe(expected.height)
  })

  it.each([
    ['sm', 'size-7'],
    ['md', 'size-11'],
    ['xl', 'size-32'],
  ] as const)('the %s size renders the %s box', (size, box) => {
    const { container } = render(<NinaAvatar size={size} />)
    expect(container.firstElementChild?.className).toContain(box)
  })

  it('is a clipped circle on a paper chip, and a caller’s className rides along', () => {
    const { container } = render(<NinaAvatar className="my-2" />)
    const span = container.firstElementChild as HTMLElement
    expect(span.className).toContain('rounded-pill')
    expect(span.className).toContain('overflow-hidden')
    expect(span.className).toContain('bg-paper-2')
    expect(span.className).toContain('my-2')
  })
})
