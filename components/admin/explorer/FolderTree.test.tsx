// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// `FolderMenu` is a real, separately-owned component (create/rename/move/delete) — this file's
// job is the TREE (rows, counts, active state, expand/collapse), not FolderMenu's own verbs. A
// stub that records its props is what `ChatScreen.test.tsx` does for the same reason.
vi.mock('@/components/admin/FolderMenu', () => ({
  FolderMenu: ({ folder, photoCount }: { folder: string; photoCount: number }) => (
    <span data-testid="folder-menu" data-folder={folder} data-count={photoCount} />
  ),
}))

import { FolderTree } from './FolderTree'
import type { ExplorerFolder } from './model'

function row(label: string) {
  return screen.getByText(label).closest('div') as HTMLElement
}

describe('FolderTree', () => {
  it('renders the root row labelled Album with its total count', () => {
    render(
      <FolderTree
        folders={[]}
        current=""
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={[]}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: 'Album' })).toHaveAttribute('href', '/explorer?folder=')
  })

  it('nests a folder tree from flat folder counts, with each level totalled', () => {
    const folders: ExplorerFolder[] = [
      { folder: '2026', count: 2 },
      { folder: '2026/bali', count: 5 },
    ]
    render(
      <FolderTree
        folders={folders}
        current=""
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={folders.map((f) => f.folder)}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    // `2026` sums its own 2 plus its child's 5.
    const parentRow = screen.getByRole('link', { name: '2026' }).closest('div') as HTMLElement
    expect(within(parentRow).getByText('7')).toBeInTheDocument()
  })

  it('marks the current album folder as the active row, not the root or Media', () => {
    const folders: ExplorerFolder[] = [{ folder: 'bali', count: 3 }]
    render(
      <FolderTree
        folders={folders}
        current="bali"
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={['bali']}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: 'bali' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Album' })).not.toHaveAttribute('aria-current')
  })

  it('marks Media active — and the album root inactive — when the view is media, despite sharing path ""', () => {
    render(
      <FolderTree
        folders={[]}
        current=""
        view="media"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={9}
        allFolders={[]}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: /Media/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Album' })).not.toHaveAttribute('aria-current')
  })

  it('renders the Media row with its count, as the last sibling', () => {
    render(
      <FolderTree
        folders={[{ folder: 'x', count: 1 }]}
        current=""
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={42}
        allFolders={['x']}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    const link = screen.getByRole('link', { name: /Media/ })
    expect(link).toHaveAttribute('href', '/explorer?view=media')
    const mediaRow = link.closest('div') as HTMLElement
    expect(within(mediaRow).getByText('42')).toBeInTheDocument()
  })

  it('renders no FolderMenu (no verbs) on the Media row', () => {
    render(
      <FolderTree
        folders={[]}
        current=""
        view="media"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={[]}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    const mediaRow = screen.getByRole('link', { name: /Media/ }).closest('div') as HTMLElement
    expect(within(mediaRow).queryByTestId('folder-menu')).not.toBeInTheDocument()
  })

  it('renders a FolderMenu on the root row and on every folder row, carrying the right folder path', () => {
    const folders: ExplorerFolder[] = [{ folder: 'bali', count: 3 }]
    render(
      <FolderTree
        folders={folders}
        current=""
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={['bali']}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    const menus = screen.getAllByTestId('folder-menu')
    expect(menus.map((m) => m.getAttribute('data-folder'))).toEqual(['', 'bali'])
  })

  it('renders no chevron for a leaf folder, and a chevron for one with children', () => {
    const folders: ExplorerFolder[] = [
      { folder: 'leaf', count: 1 },
      { folder: 'parent', count: 1 },
      { folder: 'parent/child', count: 1 },
    ]
    render(
      <FolderTree
        folders={folders}
        current=""
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={folders.map((f) => f.folder)}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Expand leaf' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /parent/ })).toBeInTheDocument()
  })

  it('expands a folder on the path to `current` by default, with no click required', () => {
    const folders: ExplorerFolder[] = [
      { folder: 'parent', count: 1 },
      { folder: 'parent/child', count: 1 },
    ]
    render(
      <FolderTree
        folders={folders}
        current="parent/child"
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={folders.map((f) => f.folder)}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: 'child' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse parent' })).toBeInTheDocument()
  })

  it('toggles a folder open and closed on chevron click, overriding the on-path default', async () => {
    const user = userEvent.setup()
    const folders: ExplorerFolder[] = [
      { folder: 'parent', count: 1 },
      { folder: 'parent/child', count: 1 },
    ]
    render(
      <FolderTree
        folders={folders}
        current=""
        view="album"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={0}
        allFolders={folders.map((f) => f.folder)}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.queryByRole('link', { name: 'child' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand parent' }))
    expect(screen.getByRole('link', { name: 'child' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse parent' }))
    expect(screen.queryByRole('link', { name: 'child' })).not.toBeInTheDocument()
  })

  it('renders no expansion at all on the media view — nothing is "on the path" there', () => {
    const folders: ExplorerFolder[] = [
      { folder: 'parent', count: 1 },
      { folder: 'parent/child', count: 1 },
    ]
    render(
      <FolderTree
        folders={folders}
        current="parent/child"
        view="media"
        hrefFor={(f) => `/explorer?folder=${f}`}
        mediaHref="/explorer?view=media"
        mediaCount={5}
        allFolders={folders.map((f) => f.folder)}
        onNavigate={vi.fn()}
        onFolderCreated={vi.fn()}
      />,
    )
    expect(screen.queryByRole('link', { name: 'child' })).not.toBeInTheDocument()
  })
})
