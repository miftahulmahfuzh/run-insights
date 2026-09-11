// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ViewerPhoto } from './PhotoViewer'
import { PhotoViewer } from './PhotoViewer'

/**
 * The one full-screen image overlay, at DOM level. `tests/ui.photoViewer.test.ts` proves the
 * five structural claims as text scans; `lib/photos/gallery.test.ts` proves the gesture rule as
 * pure functions. This file proves the wiring between those two halves and the DOM: keys page
 * through the same `stepIndex` the swipe uses, the dot row names every photo, the actions slot
 * renders nothing when absent, and a finished touch gesture is *read* — never prevented.
 */

const PHOTOS: ViewerPhoto[] = [
  { url: 'blob:photo-a', kind: 'splits' },
  { url: 'blob:photo-b', kind: 'heartrate' },
  { url: 'blob:photo-c', kind: 'summary' },
]

function renderViewer(props: Partial<React.ComponentProps<typeof PhotoViewer>> = {}) {
  const onIndex = props.onIndex ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  const utils = render(
    <PhotoViewer photos={props.photos ?? PHOTOS} index={props.index ?? 0} onIndex={onIndex} onClose={onClose} {...props} />,
  )
  const pan = utils.container.querySelector('.overflow-auto') as HTMLElement
  return { ...utils, onIndex, onClose, pan }
}

/** A one-finger horizontal drag through the overlay's touch handlers. */
function swipe(
  pan: HTMLElement,
  dx: number,
  opts: { dy?: number; touchesDuring?: number; releaseAll?: boolean; canPan?: boolean } = {},
) {
  const { dy = 0, touchesDuring = 1, releaseAll = true, canPan = false } = opts
  if (canPan) {
    Object.defineProperty(pan, 'scrollWidth', { value: 1000, configurable: true })
    Object.defineProperty(pan, 'clientWidth', { value: 500, configurable: true })
  }
  fireEvent.touchStart(pan, { touches: [{ clientX: 200, clientY: 200 }] })
  if (touchesDuring > 1) {
    fireEvent.touchMove(pan, {
      touches: Array.from({ length: touchesDuring }, () => ({ clientX: 190, clientY: 210 })),
    })
  }
  fireEvent.touchEnd(pan, {
    touches: releaseAll ? [] : [{ clientX: 200 + dx, clientY: 200 + dy }],
    changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }],
  })
}

describe('PhotoViewer', () => {
  it('names the current photo from SCREEN_KIND_LABEL, with the position when there is more than one', () => {
    renderViewer()

    expect(screen.getByText('Splits')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('an explicit label beats the kind map — an album photo is never called "avatar"', () => {
    renderViewer({ photos: [{ url: 'blob:photo-a', kind: 'avatar', label: 'Profile photo' }], index: 0 })

    expect(screen.getByText('Profile photo')).toBeInTheDocument()
    expect(screen.queryByText('avatar')).not.toBeInTheDocument()
  })

  it('a kind the map does not know degrades to the raw kind, so the name is never empty', () => {
    renderViewer({ photos: [{ url: 'blob:photo-a', kind: 'mystery' }] })

    expect(screen.getByText('mystery')).toBeInTheDocument()
  })

  it('the dialog is named "<photo> <subject>", and the subject is the caller’s noun', () => {
    const { rerender } = renderViewer()
    expect(screen.getByRole('dialog', { name: 'Splits screenshot' })).toBeInTheDocument()

    rerender(
      <PhotoViewer
        photos={[{ url: 'blob:photo-a', kind: 'avatar', label: 'Foto profil' }]}
        index={0}
        onIndex={vi.fn()}
        onClose={vi.fn()}
        subject="foto"
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Foto profil foto' })).toBeInTheDocument()
  })

  it('one photo: no counter and no dot row', () => {
    renderViewer({ photos: [PHOTOS[0]!] })

    expect(screen.queryByText(/\/ 1/)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Show the / })).toHaveLength(0)
  })

  it('✕ closes', async () => {
    const user = userEvent.setup()
    const { onClose } = renderViewer()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape closes, and the arrow keys page through the same wrapping stepIndex the swipe uses', () => {
    const { onIndex, rerender } = renderViewer({ index: 0 })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onIndex).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onIndex).toHaveBeenLastCalledWith(1)

    // The last photo wraps to the first — not clamps.
    rerender(
      <PhotoViewer photos={PHOTOS} index={2} onIndex={onIndex} onClose={vi.fn()} />,
    )
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onIndex).toHaveBeenLastCalledWith(0)

    // And the first wraps backwards to the last.
    rerender(
      <PhotoViewer photos={PHOTOS} index={0} onIndex={onIndex} onClose={vi.fn()} />,
    )
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onIndex).toHaveBeenLastCalledWith(2)
  })

  it('the dot row names and marks every photo, and a dot jumps straight to it', async () => {
    const user = userEvent.setup()
    const { onIndex, rerender } = renderViewer({ index: 1 })

    const dots = screen.getAllByRole('button', { name: /^Show the / })
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Show the Splits screenshot',
      'Show the Heart rate screenshot',
      'Show the Summary screenshot',
    ])
    expect(dots[1]).toHaveAttribute('aria-current', 'true')
    expect(dots[0]).toHaveAttribute('aria-current', 'false')

    await user.click(dots[2]!)
    expect(onIndex).toHaveBeenCalledWith(2)

    rerender(
      <PhotoViewer photos={PHOTOS} index={2} onIndex={onIndex} onClose={vi.fn()} />,
    )
    expect(screen.getAllByRole('button', { name: /^Show the / })[2]).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('the actions slot renders whatever the caller floats, and ABSENT renders nothing', () => {
    const { rerender } = renderViewer({ actions: <button type="button">Download</button> })

    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()

    rerender(
      <PhotoViewer photos={PHOTOS} index={0} onIndex={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
  })

  it('locks the body scroll while mounted and restores it on the way out', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = renderViewer()

    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('a new photo starts at the top of the pan container', () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo')
    try {
      const { rerender } = renderViewer({ index: 0 })
      scrollTo.mockClear()

      rerender(
        <PhotoViewer photos={PHOTOS} index={1} onIndex={vi.fn()} onClose={vi.fn()} />,
      )
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })
    } finally {
      scrollTo.mockRestore()
    }
  })

  describe('the swipe', () => {
    it('a committed left drag pages next; right pages prev', () => {
      const { pan, onIndex } = renderViewer({ index: 1 })

      swipe(pan, -100)
      expect(onIndex).toHaveBeenLastCalledWith(2)

      swipe(pan, 100)
      expect(onIndex).toHaveBeenLastCalledWith(0)
    })

    it('a tap-sized drag is not a page turn', () => {
      const { pan, onIndex } = renderViewer()

      swipe(pan, -20)

      expect(onIndex).not.toHaveBeenCalled()
    })

    it('a drag more vertical than horizontal is the scroll container’s, not ours', () => {
      const { pan, onIndex } = renderViewer()

      swipe(pan, -80, { dy: 120 }) // 80 < 120 × 1.2

      expect(onIndex).not.toHaveBeenCalled()
    })

    it('a gesture that ever saw two fingers is a pinch, even if it ended one-fingered', () => {
      const { pan, onIndex } = renderViewer()

      swipe(pan, -100, { touchesDuring: 2 })

      expect(onIndex).not.toHaveBeenCalled()
    })

    it('an image that can pan horizontally is being panned, not turned', () => {
      const { pan, onIndex } = renderViewer()

      swipe(pan, -100, { canPan: true })

      expect(onIndex).not.toHaveBeenCalled()
    })

    it('a pinch releasing one finger at a time is still mid-gesture at the first touchend', () => {
      const { pan, onIndex } = renderViewer()

      swipe(pan, -100, { touchesDuring: 2, releaseAll: false })

      expect(onIndex).not.toHaveBeenCalled()
    })
  })
})
