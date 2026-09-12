// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setPhotoSharingAction } = vi.hoisted(() => ({ setPhotoSharingAction: vi.fn() }))
// The toggle persists through a Server Action; the viewer is a full-screen dialog whose own
// behaviour belongs to components/ui/PhotoViewer's tests. Here both are patched so the pinned
// contract is this list's: optimistic flip with a real rollback, two targets per row, and a
// viewer fed EVERY row (excluded ones included) so swiping reaches what the list shows.
vi.mock('@/app/actions/share', () => ({ setPhotoSharingAction }))
vi.mock('@/components/ui/PhotoViewer', () => ({
  PhotoViewer: (props: { photos: unknown[]; index: number }) => (
    <div data-testid="viewer" data-count={props.photos.length} data-index={props.index} />
  ),
}))

import { PhotoInclusionList } from './PhotoInclusionList'
import {
  PHOTO_EXCLUDED,
  PHOTO_INCLUDED,
  PHOTO_TOGGLE_FAILED,
  PHOTOS_NOTE,
  PHOTOS_TITLE,
} from '@/lib/share/copy'
import { SHARE_PHOTO_WARNING } from '@/lib/share/config'

const PHOTOS = [
  { id: 'p1', blobUrl: 'blob:1', kind: 'summary', excludedFromShare: false },
  { id: 'p2', blobUrl: 'blob:2', kind: 'splits', excludedFromShare: true },
  { id: 'p3', blobUrl: 'blob:3', kind: 'future-kind', excludedFromShare: false },
]

function checkboxFor(label: string) {
  return screen.getByLabelText(`Include ${label} in the shared page`) as HTMLInputElement
}

beforeEach(() => {
  setPhotoSharingAction.mockReset()
  setPhotoSharingAction.mockResolvedValue({ ok: true })
})

describe('PhotoInclusionList', () => {
  it('heads the list with the one warning and the one note, above the rows, not per row', () => {
    render(<PhotoInclusionList runId="run-1" photos={PHOTOS} />)

    expect(screen.getByText(PHOTOS_TITLE)).toBeInTheDocument()
    expect(screen.getAllByText(SHARE_PHOTO_WARNING)).toHaveLength(1)
    expect(screen.getByText(PHOTOS_NOTE)).toBeInTheDocument()
  })

  it('labels rows by kind, falling back to position for a kind it does not know', () => {
    render(<PhotoInclusionList runId="run-1" photos={PHOTOS} />)

    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Splits')).toBeInTheDocument()
    // A filename-free label: an unknown kind is "Screenshot 3", not a pathname.
    expect(screen.getByText('Screenshot 3')).toBeInTheDocument()
  })

  it('renders the server’s exclusion state as the row’s word and its dimmed thumbnail', () => {
    const { container } = render(<PhotoInclusionList runId="run-1" photos={PHOTOS} />)

    expect(checkboxFor('Summary').checked).toBe(true)
    // The word shares a line with the zoom hint, so match the row's status span, not a bare word.
    expect(screen.getAllByText(new RegExp(`^${PHOTO_INCLUDED} · `))).toHaveLength(2)
    expect(checkboxFor('Splits').checked).toBe(false)
    expect(screen.getAllByText(new RegExp(`^${PHOTO_EXCLUDED} · `))).toHaveLength(1)
    const dimmed = container.querySelector('img[src="blob:2"]')
    expect(dimmed).toHaveClass('opacity-40')
    const live = container.querySelector('img[src="blob:1"]')
    expect(live).not.toHaveClass('opacity-40')
  })

  it('the toggle is optimistic: the row answers before the server does, and the action gets all three ids', async () => {
    let resolve!: (value: { ok: true }) => void
    setPhotoSharingAction.mockImplementation(() => new Promise<{ ok: true }>((res) => (resolve = res)))
    render(<PhotoInclusionList runId="run-1" photos={PHOTOS} />)

    fireEvent.click(checkboxFor('Summary'))
    await act(async () => {})

    // Flipped optimistically, before the write resolved — p2 was already excluded, so now two.
    expect(checkboxFor('Summary').checked).toBe(false)
    expect(screen.getAllByText(new RegExp(`^${PHOTO_EXCLUDED} · `))).toHaveLength(2)
    expect(setPhotoSharingAction).toHaveBeenCalledWith('p1', false, 'run-1')

    await act(async () => {
      resolve({ ok: true })
    })
    await act(async () => {})
    // Stays flipped once the write lands.
    expect(checkboxFor('Summary').checked).toBe(false)
  })

  it('a failed write rolls the checkbox back AND says so — a lying privacy control is worse than a slow one', async () => {
    let resolve!: (value: { ok: false; error: string }) => void
    setPhotoSharingAction.mockImplementation(
      () => new Promise<{ ok: false; error: string }>((res) => (resolve = res)),
    )
    render(<PhotoInclusionList runId="run-1" photos={PHOTOS} />)

    fireEvent.click(checkboxFor('Summary'))
    await act(async () => {})
    expect(checkboxFor('Summary').checked).toBe(false) // the optimistic lie, mid-flight

    await act(async () => {
      resolve({ ok: false, error: 'db down' })
    })
    await act(async () => {})

    expect(checkboxFor('Summary').checked).toBe(true)
    expect(screen.getByText(PHOTO_TOGGLE_FAILED)).toBeInTheDocument()
    expect(screen.getAllByText(new RegExp(`^${PHOTO_INCLUDED} · `))).toHaveLength(2)
  })

  it('tapping the row’s left target opens the viewer with EVERY row in it, excluded ones included', async () => {
    render(<PhotoInclusionList runId="run-1" photos={PHOTOS} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Summary full screen' }))
    await act(async () => {})

    const viewer = screen.getByTestId('viewer')
    expect(viewer).toHaveAttribute('data-count', '3')
    expect(viewer).toHaveAttribute('data-index', '0')
  })

  it('no photos, no card — the component renders nothing rather than an empty shell', () => {
    const { container } = render(<PhotoInclusionList runId="run-1" photos={[]} />)

    expect(container.textContent).toBe('')
    expect(container.querySelector('ul')).toBeNull()
  })
})
