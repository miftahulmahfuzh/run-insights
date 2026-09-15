// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SearchResultsGrid } from './SearchResultsGrid'

import type { AdminSearchHit } from '@/lib/admin/ninaAlbumActions'

/**
 * The ranked sheet's behaviours — the ones no source assertion can reach.
 *
 * **What is NOT asserted here: the pixel fit.** happy-dom has zero layout
 * (`components/admin/ErrorLogList.test.tsx`'s header says so at length); the sheet's geometry is
 * held by the class SHAPE, pinned in `tests/admin.photoSearch.test.ts`. What IS asserted is the
 * thing R1's addendum actually asked for: a click opens the full-screen view, over the RESULTS.
 */

/*
 * EVERY field of `AdminSearchHit`, not only the seven this grid reads: the type is
 * `ExplorerPhotoBase` + `score` (phase 3's barrel), so a partial literal does not typecheck. The
 * unread ones are set to plausible values and asserted nowhere — `description` in particular is
 * carried and never rendered, which is `model.ts:49`'s rule and worth one fixture proving the grid
 * ignores it.
 */
const HIT: AdminSearchHit = {
  id: 'a1',
  url: 'https://blob.example/nina/avatar-a1.jpg',
  thumbUrl: 'https://blob.example/nina/avatar-a1-thumb.jpg',
  folder: '2026/bali',
  filename: 'DSC_0031.jpg',
  width: 1536,
  height: 2048,
  bytes: 412_003,
  source: 'upload',
  isCurrent: false,
  description: 'She is on a trail at sunrise.',
  crop: { scale: null, x: null, y: null },
  createdAt: '2026-09-01T02:30:00.000Z',
  score: 0.81,
}

const SECOND: AdminSearchHit = {
  ...HIT,
  id: 'a2',
  url: 'https://blob.example/nina/avatar-a2.jpg',
  thumbUrl: null,
  folder: '',
  filename: 'DSC_0044.jpg',
  isCurrent: true,
  score: 0.64,
}

describe('the sheet', () => {
  it('renders one tile per hit, in the order it was given', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    const tiles = screen.getAllByRole('listitem')
    expect(tiles).toHaveLength(2)
    expect(screen.getAllByRole('button')[0]?.getAttribute('aria-label')).toContain('DSC_0031.jpg')
  })

  it('names a tile by its file AND the folder the search found it in', () => {
    render(<SearchResultsGrid hits={[HIT]} />)
    expect(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' })).toBeInTheDocument()
  })

  it('names the root folder Album, and says which photo is her face', () => {
    render(<SearchResultsGrid hits={[SECOND]} />)
    expect(
      screen.getByRole('button', {
        name: 'DSC_0044.jpg in Album — her current profile picture',
      }),
    ).toBeInTheDocument()
  })

  it('draws the derived thumbnail, falling back to the original when there is none', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    const images = document.querySelectorAll('ul img')
    expect(images[0]?.getAttribute('src')).toBe(HIT.thumbUrl)
    expect(images[1]?.getAttribute('src')).toBe(SECOND.url)
  })

  it('says so when nothing matched, instead of drawing an empty sheet', () => {
    render(<SearchResultsGrid hits={[]} />)
    expect(screen.getByText('Nothing matched')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('a click opens the full-screen view over the RESULT SET (R1 addendum)', () => {
  it('opens the overlay on the tile that was clicked', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('DSC_0031.jpg foto')
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('pages between results, and only between results', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('DSC_0044.jpg foto')

    // `stepIndex` wraps, so a second step returns to the first RESULT rather than leaving the set.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('DSC_0031.jpg foto')
  })

  it('closes on Escape and leaves the sheet standing', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows the open result its id and score, so an admin can cite what they are looking at', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))
    expect(screen.getByText('#a1 · 0.810')).toBeInTheDocument()

    // The meta follows the paging, like every other header element.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText('#a2 · 0.640')).toBeInTheDocument()
    expect(screen.queryByText('#a1 · 0.810')).toBeNull()
  })

  it('names the id in the tile tooltip as well', () => {
    render(<SearchResultsGrid hits={[HIT]} />)
    const tile = screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' })
    expect(tile.getAttribute('title')).toBe('DSC_0031.jpg · 2026/bali · #a1')
  })
})

describe('R1 — the open result links to its own description panel', () => {
  it('offers the link only while the overlay is open, pointing at /admin/nina?avatar=<id>', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    expect(screen.queryByRole('link', { name: "Open this photo's description" })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    expect(screen.getByRole('link', { name: "Open this photo's description" })).toHaveAttribute(
      'href',
      '/admin/nina?avatar=a1',
    )
  })

  it('follows the paging — the link always names the photo on screen', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('link', { name: "Open this photo's description" })).toHaveAttribute(
      'href',
      '/admin/nina?avatar=a2',
    )
  })

  it('carries no folder and no page: the server resolves both from the id', () => {
    render(<SearchResultsGrid hits={[HIT]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    const href =
      screen.getByRole('link', { name: "Open this photo's description" }).getAttribute('href') ?? ''
    expect(href).not.toContain('folder=')
    expect(href).not.toContain('page=')
  })
})
