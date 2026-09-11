// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TabBar } from './TabBar'

/**
 * The five-tab bar, at DOM level. Its GEOMETRY lives in `tests/tabbar.geometry.test.ts` (the
 * constants, the border box, the content drop) and its hide/show decision is one prop — what is
 * left for a rendered test is exactly the behavioral surface: which tab is `aria-current` for
 * which route (including the two subtree rules that are not obvious from the code), the New
 * tab's accent that replaces the active pair rather than joining it, the hidden bar being
 * `inert` and not `hidden`, and the badge node landing on Nina's tab.
 */

const { currentPathname } = vi.hoisted(() => ({
  currentPathname: { current: '/' },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname.current,
}))

function renderTabBar(props: React.ComponentProps<typeof TabBar> = {}) {
  return render(<TabBar {...props} />)
}

const TAB_HREFS = ['/', '/nina', '/upload', '/trends', '/me']

describe('TabBar', () => {
  it('renders the five tabs in order, New in the middle cell of five', () => {
    renderTabBar()

    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(TAB_HREFS)
    // The icons are aria-hidden SVGs with no text, so the link text is the caption.
    expect(links.map((a) => a.textContent)).toEqual(['Runs', 'Nina', 'New', 'Trends', 'Me'])
  })

  it('is the nav ChatChrome points at', () => {
    renderTabBar()

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toHaveAttribute('id', 'main-tab-bar')
  })

  it.each([
    ['/', 'Runs'],
    ['/r/abc', 'Runs'], // a pushed run detail is still "in" the Runs tab
    ['/nina', 'Nina'],
    ['/nina/about', 'Nina'], // F33's second screen highlights Nina too
    ['/upload', 'New'],
    ['/trends', 'Trends'],
    ['/trends/week', 'Trends'], // every tab but Runs owns its subtree
    ['/me', 'Me'],
  ])('pathname %s marks %s with aria-current="page"', (pathname, label) => {
    currentPathname.current = pathname
    renderTabBar()

    const current = screen.getByRole('link', { name: new RegExp(label) })
    expect(current).toHaveAttribute('aria-current', 'page')

    for (const link of screen.getAllByRole('link')) {
      if (link !== current) expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('the accent on New replaces the active pair on every screen — coral at rest AND when active', () => {
    currentPathname.current = '/trends'
    const { unmount } = renderTabBar()
    const atRest = screen.getAllByRole('link')[2]!
    expect(atRest).toHaveClass('text-z5')
    expect(screen.getAllByRole('link')[0]).toHaveClass('text-ink-3') // an inactive tab
    unmount()

    currentPathname.current = '/upload'
    renderTabBar()
    const active = screen.getAllByRole('link')[2]!
    expect(active).toHaveClass('text-z5')
    expect(active).not.toHaveClass('text-ink')
    // …while aria-current still marks it, so the accent is decor and never the only signal.
    expect(active).toHaveAttribute('aria-current', 'page')
  })

  it('an active non-accent tab wears the ink treatment', () => {
    currentPathname.current = '/trends'
    renderTabBar()

    expect(screen.getByRole('link', { name: 'Trends' })).toHaveClass('text-ink')
  })

  it('Nina’s unread badge renders as a node pinned inside HER tab — the server→client prop seam', () => {
    renderTabBar({ ninaBadge: <span data-testid="unread-dot" /> })

    const dot = screen.getByTestId('unread-dot')
    // The badge was handed to the bar and lands on the Nina tab's icon box, not in a corner.
    expect(dot.closest('a')).toHaveAttribute('href', '/nina')
  })

  it('no badge prop, no badge: the loading fallback renders a bare bar', () => {
    // `<TabBar />` with no props at all is the `app/(app)/loading.tsx` call.
    renderTabBar()

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  describe('hidden (the /nina state ChatChrome slides back up)', () => {
    it('is inert — out of focus and out of the accessibility tree, but still painted', () => {
      renderTabBar({ hidden: true })

      const nav = screen.getByRole('navigation', { hidden: true })
      expect(nav).toHaveAttribute('inert')
      // `inert`, not `hidden`: the bar must stay painted and animatable.
      expect(nav).not.toHaveAttribute('hidden')
    })

    it('translates itself a full border box down; visible is exactly 0', () => {
      const { rerender } = renderTabBar({ hidden: true })

      const nav = screen.getByRole('navigation', { hidden: true })
      expect(nav.getAttribute('style')).toContain('translate: 0 100%')

      rerender(<TabBar hidden={false} />)
      expect(screen.getByRole('navigation', { name: 'Main' }).getAttribute('style')).toContain(
        'translate: 0 0',
      )
    })

    it('a visible bar is not inert', () => {
      renderTabBar({ hidden: false })

      expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveAttribute('inert')
    })
  })
})
