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
 * `ExplorerPhotoBase` + `score` + `origin` + the two keyword columns (phase 2 widened it), and all
 * of them are REQUIRED, so a partial literal does not typecheck. The unread ones are set to
 * plausible values and asserted nowhere — `description` in particular is carried and never
 * rendered, which is `model.ts:49`'s rule and worth one fixture proving the grid ignores it. The
 * two keyword fields are the same story: the search action carries them so a result opened in the
 * pane needs no second round trip, and this grid never reads either one.
 */
const HIT: AdminSearchHit = {
  id: 'a1',
  origin: 'album',
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
  searchKeywords: 'trail, sunrise',
  negativeSearchKeywords: null,
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

/*
 * media-album-unified-search R1, 2026-09-17: the ranked set is merged across both tables now, so a
 * hit can be a `nina_message_images` row. `folder` is `''` on that arm by construction (a message
 * image is filed nowhere) and `isCurrent` is `false` by the query layer's contract — a media row is
 * never itself her face, and a pointer album row is never itself ranked.
 */
const MEDIA_HIT: AdminSearchHit = {
  ...HIT,
  id: 'm1',
  origin: 'media',
  url: 'https://blob.example/nina/selfie-m1.jpg',
  thumbUrl: null,
  folder: '',
  filename: '2026-09-01 m1',
  source: 'generated',
  isCurrent: false,
  score: 0.72,
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

describe('R1 — a merged set holds both collections, and says which is which', () => {
  it('names a media hit by its collection, never by a folder it is not in', () => {
    render(<SearchResultsGrid hits={[MEDIA_HIT]} />)
    // `in Album` would name the album root, where this photograph is not.
    expect(screen.getByRole('button', { name: '2026-09-01 m1 in Media' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /in Album/ })).toBeNull()
  })

  it('draws both origins in one sheet, in the order the ranker gave them', () => {
    render(<SearchResultsGrid hits={[HIT, MEDIA_HIT]} />)
    const tiles = screen.getAllByRole('listitem')
    expect(tiles).toHaveLength(2)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['DSC_0031.jpg in 2026/bali', '2026-09-01 m1 in Media'])
  })

  it('sends a media hit to the Media collection, not to a dead ?avatar= deep link', () => {
    render(<SearchResultsGrid hits={[HIT, MEDIA_HIT]} />)
    fireEvent.click(screen.getByRole('button', { name: '2026-09-01 m1 in Media' }))

    const link = screen.getByRole('link', { name: 'Open Media, where this photo lives' })
    expect(link).toHaveAttribute('href', '/admin/nina?view=media')
    // The album's own name must not be borrowed for a destination that does not open a pane.
    expect(screen.queryByRole('link', { name: "Open this photo's description" })).toBeNull()

    // And the album branch is unchanged, in the same mounted set: paging back proves it.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(
      screen.getByRole('link', { name: "Open this photo's description" }),
    ).toHaveAttribute('href', '/admin/nina?avatar=a1')
  })
})
