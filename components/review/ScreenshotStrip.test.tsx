// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewPhoto } from '@/lib/review/loadReview'

import { SheetSource, ScreenshotStrip } from './ScreenshotStrip'

/**
 * The evidence, always on screen. Two surfaces share this file and share the PhotoViewer
 * overlay, so both are tested against the same stub:
 *
 *  - the strip shows EVERY uploaded photo, labelled by its screen kind;
 *  - `SheetSource` is R-45's resolver made visible: the section's own kind comes first when it
 *    exists, and when it does not — the common one-screenshot upload — the fallback is every
 *    photo there is, WITH the honest caption saying so. A blank panel is the alternative, and
 *    it is strictly worse.
 */

const { photoViewerSpy } = vi.hoisted(() => ({ photoViewerSpy: vi.fn() }))

// The overlay owns zoom state and keyboard handling of its own (covered in
// components/ui/PhotoViewer.test.tsx and tests/ui.photoViewer.test.ts). Here it is a probe that
// publishes exactly what the strip handed it, so the wiring — which photos, at which index, and
// which way out — is what gets asserted.
vi.mock('@/components/ui/PhotoViewer', () => ({
  PhotoViewer: (props: {
    photos: unknown[]
    index: number
    onIndex: (i: number) => void
    onClose: () => void
  }) => {
    photoViewerSpy(props)
    return (
      <div data-testid="photo-viewer">
        <button type="button" onClick={() => props.onIndex(props.index + 1)}>
          next
        </button>
        <button type="button" onClick={props.onClose}>
          close
        </button>
      </div>
    )
  },
}))

function photo(kind: ReviewPhoto['kind'], url: string): ReviewPhoto {
  return { url: `https://blob.test/${url}`, kind, width: 739, height: 1600 }
}

const PHOTOS: ReviewPhoto[] = [
  photo('summary', 'summary.png'),
  photo('splits', 'splits.png'),
  photo('heartrate', 'hr.png'),
]

beforeEach(() => {
  photoViewerSpy.mockClear()
})

describe('ScreenshotStrip — the strip', () => {
  it('is absent entirely when there are no photos', () => {
    const { container } = render(<ScreenshotStrip photos={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows every uploaded photo, named by its screen kind', () => {
    render(<ScreenshotStrip photos={PHOTOS} />)

    const tiles = screen.getAllByRole('button')
    expect(tiles).toHaveLength(3)
    expect(screen.getByLabelText('View the Summary screenshot full screen')).toHaveAttribute(
      'aria-label',
      'View the Summary screenshot full screen',
    )
    expect(tiles[1]).toHaveTextContent('Splits')
    expect(tiles[2]).toHaveTextContent('Heart rate')
  })

  it('the image carries the blob URL and the stored dimensions', () => {
    render(<ScreenshotStrip photos={PHOTOS} />)

    const img = screen
      .getByLabelText('View the Splits screenshot full screen')
      .querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://blob.test/splits.png')
    expect(img).toHaveAttribute('width', '739')
    expect(img).toHaveAttribute('height', '1600')
  })

  it('an unknown kind falls back to the raw kind string rather than a blank caption', () => {
    render(<ScreenshotStrip photos={[photo('other', 'mystery.png')] as ReviewPhoto[]} />)

    // 'other' is legal in run_photos but F04 never writes it — the strip must survive it.
    expect(screen.getByText('other')).toBeInTheDocument()
  })

  it('tapping a tile opens the viewer on THAT photo', () => {
    render(<ScreenshotStrip photos={PHOTOS} />)

    fireEvent.click(screen.getByLabelText('View the Heart rate screenshot full screen'))

    expect(screen.getByTestId('photo-viewer')).toBeInTheDocument()
    expect(photoViewerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ photos: PHOTOS, index: 2 }),
    )
  })

  it('the viewer’s own close returns to the strip alone', async () => {
    render(<ScreenshotStrip photos={PHOTOS} />)

    fireEvent.click(screen.getByLabelText('View the Summary screenshot full screen'))
    fireEvent.click(screen.getByText('close'))

    await waitFor(() => expect(screen.queryByTestId('photo-viewer')).not.toBeInTheDocument())
  })
})

describe('SheetSource — the section resolver (R-45)', () => {
  it('is absent when the extraction shipped no photos at all', () => {
    const { container } = render(<SheetSource photos={[]} section="splits" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('an exact-kind match shows ONLY that photo, under the matching-kind caption', () => {
    render(<SheetSource photos={PHOTOS} section="splits" />)

    expect(
      screen.getByText('From your Splits screenshot'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    // alt="" makes the thumbnails presentational — query the button's img, not the role.
    expect(
      screen
        .getByRole('button', { name: 'Open this screenshot full screen' })
        .querySelector('img'),
    ).toHaveAttribute('src', 'https://blob.test/splits.png')
  })

  it('no matching kind falls back to EVERY photo, captioned honestly', () => {
    // One-screenshot upload whose kind guess was 'summary', feeding the splits sheet: the
    // strict alternative is a blank panel above the fields the reviewer needs to correct.
    render(<SheetSource photos={[PHOTOS[0]!]} section="splits" />)

    expect(
      screen.getByText('Not in the screenshots you uploaded — here is what you did upload'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('tap to zoom')).toBeInTheDocument()
  })

  it('the exact-match caption follows the section, not the first photo’s kind', () => {
    render(<SheetSource photos={PHOTOS} section="heartrate" />)

    expect(screen.getByText('From your Heart rate screenshot')).toBeInTheDocument()
  })

  it('tapping a source opens the viewer over the SOURCES, not the full upload', () => {
    render(<SheetSource photos={PHOTOS} section="splits" />)

    fireEvent.click(screen.getByRole('button', { name: 'Open this screenshot full screen' }))

    const call = photoViewerSpy.mock.lastCall![0] as { photos: ReviewPhoto[]; index: number }
    expect(call.photos).toHaveLength(1)
    expect(call.photos[0]!.kind).toBe('splits')
    expect(call.index).toBe(0)
  })
})
