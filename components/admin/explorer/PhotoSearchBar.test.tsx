// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotoSearchBar } from './PhotoSearchBar'

/**
 * The search row's behaviours. The PHOTO path is deliberately absent: happy-dom has neither
 * `OffscreenCanvas` nor `createImageBitmap`, so a test of `searchQueryImage.ts` would be a test of
 * its own stub — that module's contract (re-encode, data URI, never a PUT) is pinned as source in
 * `tests/admin.photoSearch.test.ts`.
 *
 * `resetAllMocks` in `beforeEach` and not `clearAllMocks`: a failed test's unconsumed
 * `mockResolvedValueOnce` otherwise ghosts into the next one.
 */

const searchNinaAvatarsAction = vi.fn()

vi.mock('@/lib/admin/ninaAlbumActions', () => ({
  searchNinaAvatarsAction: (input: unknown) => searchNinaAvatarsAction(input),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('the search row', () => {
  it('refuses to search on nothing', () => {
    render(<PhotoSearchBar active={false} onResults={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('sends the trimmed words and hands the ranked hits up', async () => {
    // A whole `AdminSearchHit` — the type is `ExplorerPhotoBase` + `score` (phase 3's barrel), and
    // a literal that is handed to `onResults` as `readonly AdminSearchHit[]` must satisfy all of it.
    const hits = [
      {
        id: 'a1',
        url: 'https://blob.example/a1.jpg',
        thumbUrl: null,
        folder: '',
        filename: 'a1.jpg',
        width: 1024,
        height: 1024,
        bytes: 180_000,
        source: 'upload',
        isCurrent: false,
        description: null,
        crop: { scale: null, x: null, y: null },
        createdAt: '2026-09-01T02:30:00.000Z',
        score: 0.77,
      },
    ]
    // `searched` and `mode` are part of the action's result and are simply not read here.
    searchNinaAvatarsAction.mockResolvedValue({ ok: true, hits, searched: 12, mode: 'text' })
    const onResults = vi.fn()

    render(<PhotoSearchBar active={false} onResults={onResults} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  red dress  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1))
    expect(searchNinaAvatarsAction).toHaveBeenCalledWith({
      text: 'red dress',
      imageDataUri: undefined,
    })
    expect(onResults).toHaveBeenCalledWith({ hits, text: 'red dress', withImage: false })
    expect(await screen.findByText('1 photo matches "red dress".')).toBeInTheDocument()
  })

  it('reports a refusal on the row and hands nothing up', async () => {
    searchNinaAvatarsAction.mockResolvedValue({
      ok: false,
      error: 'No embedding yet.',
      hits: [],
      searched: 0,
      mode: 'text',
    })
    const onResults = vi.fn()

    render(<PhotoSearchBar active={false} onResults={onResults} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bali' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No embedding yet.')
    expect(onResults).not.toHaveBeenCalled()
  })

  it('clears the draft and tells the explorer to resume browsing', async () => {
    const onClear = vi.fn()
    render(<PhotoSearchBar active onResults={vi.fn()} onClear={onClear} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bali' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClear).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
  })

  it('offers the in-field Kosongkan only once there are words to clear', () => {
    render(<PhotoSearchBar active={false} onResults={vi.fn()} onClear={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Kosongkan pencarian' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bali' } })
    expect(screen.getByRole('button', { name: 'Kosongkan pencarian' })).toBeInTheDocument()
  })

  it('Kosongkan empties the words in place and leaves the landed search alone', async () => {
    const onClear = vi.fn()
    render(<PhotoSearchBar active={false} onResults={vi.fn()} onClear={onClear} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bali' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kosongkan pencarian' }))

    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
    // The keyboard stays up: the tap never leaves the field — `SessionRow`'s Kosongkan rule.
    expect(screen.getByRole('searchbox')).toHaveFocus()
    // The words are not the search: clearing them is not "resume browsing".
    expect(onClear).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Kosongkan pencarian' })).not.toBeInTheDocument()
  })
})
