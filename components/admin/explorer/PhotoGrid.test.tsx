// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PhotoGrid } from './PhotoGrid'
import type { ExplorerPageInfo, ExplorerPhoto } from './model'

function albumPhoto(overrides?: Partial<ExplorerPhoto>): ExplorerPhoto {
  return {
    id: 'p1',
    url: 'https://blob.example/original.jpg',
    filename: 'sunset.jpg',
    width: 800,
    height: 600,
    bytes: 12345,
    source: 'upload',
    isCurrent: false,
    description: null,
    searchKeywords: null,
    negativeSearchKeywords: null,
    crop: { scale: 1, x: 0, y: 0 },
    createdAt: '2026-09-01T00:00:00.000Z',
    folder: '',
    thumbUrl: null,
    origin: 'album',
    ...overrides,
  } as ExplorerPhoto
}

function page(overrides?: Partial<ExplorerPageInfo>): ExplorerPageInfo {
  return { folder: '', page: 1, pageSize: 60, total: 1, ...overrides }
}

describe('PhotoGrid', () => {
  it('renders one tile per photo, using the thumbnail when present', () => {
    const { container } = render(
      <PhotoGrid
        photos={[
          albumPhoto({ id: 'a', filename: 'a.jpg', thumbUrl: 'https://blob.example/thumb-a.jpg' }),
        ]}
        page={page({ total: 1 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={() => '#'}
      />,
    )
    // `alt=""` gives the image a presentation role, so it is found by tag rather than by role.
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.src).toBe('https://blob.example/thumb-a.jpg')
  })

  it('falls back to the original url when there is no thumbnail', () => {
    const { container } = render(
      <PhotoGrid
        photos={[albumPhoto({ thumbUrl: null, url: 'https://blob.example/original.jpg' })]}
        page={page()}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={() => '#'}
      />,
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.src).toBe('https://blob.example/original.jpg')
  })

  it('calls onSelect with the tapped photo id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <PhotoGrid
        photos={[albumPhoto({ id: 'target', filename: 'target.jpg' })]}
        page={page()}
        view="album"
        selectedId={null}
        onSelect={onSelect}
        hrefForPage={() => '#'}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'target.jpg' }))
    expect(onSelect).toHaveBeenCalledWith('target')
  })

  it('marks the selected tile aria-pressed and shows the check badge', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto({ id: 'sel', filename: 'sel.jpg' })]}
        page={page()}
        view="album"
        selectedId="sel"
        onSelect={vi.fn()}
        hrefForPage={() => '#'}
      />,
    )
    const button = screen.getByRole('button', { name: 'sel.jpg' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('labels a current photo with the "her current profile picture" suffix', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto({ filename: 'her.jpg', isCurrent: true })]}
        page={page()}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={() => '#'}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'her.jpg — her current profile picture' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Hers')).toBeInTheDocument()
  })

  it('shows the album empty state on an empty first page', () => {
    render(
      <PhotoGrid
        photos={[]}
        page={page({ page: 1, total: 0 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={() => '#'}
      />,
    )
    expect(screen.getByText('Nothing in this folder yet')).toBeInTheDocument()
  })

  it('shows the media empty-state copy when the view is media', () => {
    render(
      <PhotoGrid
        photos={[]}
        page={page({ page: 1, total: 0 })}
        view="media"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={() => '#'}
      />,
    )
    expect(screen.getByText('Nothing in Media yet')).toBeInTheDocument()
  })

  it('shows a different empty state, with a link back to page 1, past the first page', () => {
    render(
      <PhotoGrid
        photos={[]}
        page={page({ page: 3, total: 0 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    expect(screen.getByText('Nothing on this page')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Go to the first page' })
    expect(link).toHaveAttribute('href', '/explorer?page=1')
  })

  it('renders every page as its own number, with the active page marked and not a link', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 1, pageSize: 60, total: 120 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    // The count line is NOT the pagination UI that went: it answers "how many rows are there",
    // which a row of numbers cannot.
    expect(screen.getByText('1–60 of 120')).toBeInTheDocument()

    const pager = screen.getByRole('navigation', { name: 'Folder pages' })
    // Page 1 is where we already are, so it is a marked span with nowhere to navigate to.
    const current = within(pager).getByText('1')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.tagName).toBe('SPAN')
    expect(within(pager).getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '/explorer?page=2',
    )
    // No stepper survives anywhere on the surface, as a word or as a glyph.
    expect(screen.queryByText(/Newer|Older/)).not.toBeInTheDocument()
  })

  it('reaches the last of five pages in one tap, with no window and no ellipsis', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 1, pageSize: 60, total: 300 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    const pager = screen.getByRole('navigation', { name: 'Folder pages' })
    // The ask, literally — `1 2 3 4 5`, all of them — and the reason for it: page 5 is one tap
    // from page 1, where the stepper this replaced made it four.
    expect(within(pager).getAllByRole('listitem')).toHaveLength(5)
    expect(within(pager).getByRole('link', { name: '5' })).toHaveAttribute(
      'href',
      '/explorer?page=5',
    )
    expect(within(pager).queryByText('…')).not.toBeInTheDocument()
  })

  it('marks whichever page we are on, and names the Media arm as its own collection', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 2, pageSize: 60, total: 120 })}
        view="media"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    // One grid draws both arms of /admin/nina, so the pager has to say which one it walks.
    const pager = screen.getByRole('navigation', { name: 'Media pages' })
    expect(within(pager).getByText('2')).toHaveAttribute('aria-current', 'page')
    expect(within(pager).getByRole('link', { name: '1' })).toHaveAttribute(
      'href',
      '/explorer?page=1',
    )
    expect(within(pager).queryByRole('link', { name: '2' })).not.toBeInTheDocument()
  })
})
