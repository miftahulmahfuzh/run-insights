// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
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

  it('renders the Newer/Older pager range and disables the ends', () => {
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
    expect(screen.getByText('1–60 of 120')).toBeInTheDocument()
    // On page 1, Newer has no link (start of the range).
    expect(screen.queryByRole('link', { name: /Newer/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Older/ })).toHaveAttribute('href', '/explorer?page=2')
  })

  it('disables Older on the last page', () => {
    render(
      <PhotoGrid
        photos={[albumPhoto()]}
        page={page({ page: 2, pageSize: 60, total: 120 })}
        view="album"
        selectedId={null}
        onSelect={vi.fn()}
        hrefForPage={(target) => `/explorer?page=${target}`}
      />,
    )
    expect(screen.getByRole('link', { name: /Newer/ })).toHaveAttribute('href', '/explorer?page=1')
    expect(screen.queryByRole('link', { name: /Older/ })).not.toBeInTheDocument()
  })
})
