// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AdminNav } from './AdminNav'

/*
 * `AdminNavLinks` is stubbed at its import boundary — same precedent as `FileExplorer.test.tsx`
 * mocking its already-covered children. The leaf has its own suite (AdminNavLinks.test.tsx,
 * covering the usePathname active-cell rule on its own terms); this shell's own contract is the
 * three pieces of server-rendered chrome around it and the responsive positioning that R1 and
 * `admin-bottom-bar-active-tab` pinned.
 */
vi.mock('@/components/admin/AdminNavLinks', () => ({
  AdminNavLinks: () => <ul data-testid="admin-nav-links-stub" />,
}))

describe('AdminNav', () => {
  it('renders a nav labelled "Admin"', () => {
    render(<AdminNav />)
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
  })

  it('renders the client leaf inside the shell — the only subtree that needs the pathname', () => {
    render(<AdminNav />)
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(nav.querySelector('[data-testid="admin-nav-links-stub"]')).toBeInTheDocument()
  })

  it('carries the desktop-only eyebrow, hidden below lg', () => {
    render(<AdminNav />)
    const eyebrow = screen.getByText('Run Insights admin')
    expect(eyebrow).toHaveClass('hidden', 'lg:block')
  })

  it('carries the desktop-only footer paragraph, hidden below lg', () => {
    render(<AdminNav />)
    // The &rsquo; entity renders as a real right single quote.
    const footer = screen.getByText(/The workshop behind the runner.s five tabs/)
    expect(footer).toHaveClass('hidden', 'lg:block')
    expect(screen.getByText(/what it looks like with room to spare/)).toBeInTheDocument()
  })

  it('is a fixed bottom bar below lg — the repealed desktop-only assumption, R1', () => {
    const { container } = render(<AdminNav />)
    const nav = container.querySelector('nav')
    expect(nav).toHaveClass('fixed', 'inset-x-0', 'bottom-0', 'z-30')
  })

  it('is the in-flow sticky sidebar at lg — and unsets both bottom anchors so sticky behaves', () => {
    // The file's own comment names the trap: a sticky element with both top and bottom set is
    // constrained at both ends and behaves nothing like `lg:top-8` alone.
    const { container } = render(<AdminNav />)
    const nav = container.querySelector('nav')
    expect(nav).toHaveClass('lg:sticky', 'lg:top-8', 'lg:inset-x-auto', 'lg:bottom-auto')
    expect(nav).toHaveClass('lg:border-0', 'lg:bg-transparent', 'lg:p-0')
  })

  it('pads the row by HALF the home-indicator inset — the owner’s halving order', () => {
    // admin-bottom-bar-active-tab: "reduce the current distance value by half". The full inset
    // was the R1 mistake; this assertion is what stops a well-meaning edit restoring it.
    const { container } = render(<AdminNav />)
    const nav = container.querySelector('nav')
    expect(nav).toHaveClass('pb-[calc(var(--safe-bottom)/2)]')
    expect(nav).toHaveClass('pl-[var(--safe-left)]', 'pr-[var(--safe-right)]')
  })
})
