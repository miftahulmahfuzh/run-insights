// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppShell, ScreenHeader } from './AppShell'

/**
 * The frame every tabbed screen sits in. The file's own comments carry the two structural
 * claims a rendered test can actually hold it to:
 *
 *  1. **One prop (`screen`) selects the chrome AND the bottom gap**, because the two are not
 *     allowed to disagree — so each screen asserts both halves of its own selection.
 *  2. **On `/nina`, `NinaBarProvider` wraps `NinaSidebarProvider`, which encloses the shell
 *     directly** — the provider has to sit above BOTH `{children}` (the panel) and `ChatChrome`
 *     (the trigger), because two controls that must not disagree hold one state. That nesting
 *     is the exact seam a past bug fell through, and it is asserted as DOM containment here.
 *
 * The Nina modules are stubbed because they are separately-owned components with their own
 * tests (`NinaSidebar.test.tsx`, `tests/nina.sidebarProvider.test.ts`); what AppShell owns is
 * the composition, so the stubs keep their render-prop seams (ChatChrome's `ninaBadge`) and
 * give every seam a marker. `TabBar` is real — which is what lets the badge assertion follow
 * the server-constructed node all the way into the Nina tab.
 */

const { currentPathname } = vi.hoisted(() => ({
  currentPathname: { current: '/' },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname.current,
}))

vi.mock('@/components/nina/NinaUnreadBadge', () => ({
  NinaUnreadBadgeSlot: () => <span data-testid="unread-badge" />,
}))

vi.mock('@/components/nina/ChatChrome', () => ({
  ChatChrome: ({ ninaBadge }: { ninaBadge: React.ReactNode }) => (
    <div data-testid="chat-chrome">{ninaBadge}</div>
  ),
}))

vi.mock('@/components/nina/NinaBarProvider', () => ({
  NinaBarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-provider">{children}</div>
  ),
}))

vi.mock('@/components/nina/NinaSidebar', () => ({
  NinaSidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-provider">{children}</div>
  ),
}))

function renderAppShell(props: Omit<React.ComponentProps<typeof AppShell>, 'children'> = {}) {
  return render(
    <AppShell {...props}>
      <p data-testid="page-content">Runs this week</p>
    </AppShell>,
  )
}

describe('AppShell', () => {
  it('the default screen is "tabs": the tab bar, and no chat chrome', () => {
    renderAppShell()

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByTestId('chat-chrome')).not.toBeInTheDocument()
  })

  it("the tabs frame: a 470px column with 20px gutters and the tabs bottom gap", () => {
    const { container } = renderAppShell()

    const main = container.querySelector('main')!
    expect(main).toHaveClass('mx-auto', 'max-w-[470px]', 'p-5')
    expect(main).toHaveClass('pb-[calc(6rem+var(--safe-bottom))]')
  })

  it('the badge node AppShell constructs lands inside the Nina tab — F33 phase 10’s seam, end to end', () => {
    renderAppShell()

    const badge = screen.getByTestId('unread-badge')
    expect(badge.closest('a')).toHaveAttribute('href', '/nina')
  })

  it("the chat screen: no bar at all, ChatChrome instead, and the chat bottom gap", () => {
    const { container } = renderAppShell({ screen: 'chat' })

    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-chrome')).toBeInTheDocument()
    const main = container.querySelector('main')!
    expect(main).toHaveClass('pb-[calc(7rem+var(--safe-bottom))]')
  })

  it('the chat screen hands the badge to ChatChrome, which pulls the bar up on request', () => {
    renderAppShell({ screen: 'chat' })

    const chrome = screen.getByTestId('chat-chrome')
    expect(chrome).toContainElement(screen.getByTestId('unread-badge'))
  })

  it('on the chat screen ONE bar provider wraps ONE sidebar provider wraps the shell — both controls hold one state', () => {
    const { container } = renderAppShell({ screen: 'chat' })

    const bar = screen.getByTestId('bar-provider')
    const sidebar = screen.getByTestId('sidebar-provider')
    expect(bar).toContainElement(sidebar)
    // The provider encloses the shell DIRECTLY: main and the chat chrome are both inside it.
    expect(sidebar).toContainElement(container.querySelector('main')!)
    expect(sidebar).toContainElement(screen.getByTestId('chat-chrome'))
  })

  it('no other screen gets the providers — this file stays a Server Component', () => {
    renderAppShell()

    expect(screen.queryByTestId('bar-provider')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-provider')).not.toBeInTheDocument()
  })

  it('renders the page’s children inside main, and forwards a caller className to it', () => {
    const { container } = renderAppShell({ className: 'px-0' })

    const main = container.querySelector('main')!
    expect(main).toContainElement(screen.getByTestId('page-content'))
    expect(main).toHaveClass('px-0')
  })
})

describe('ScreenHeader', () => {
  it('the title is the page’s h1', () => {
    render(<ScreenHeader title="Trends" />)

    const h1 = screen.getByRole('heading', { level: 1, name: 'Trends' })
    expect(h1).toBeInTheDocument()
  })

  it('renders at most one plain-text action on the right', () => {
    const { rerender } = render(<ScreenHeader title="Trends" action={<a href="/trends">TRENDS →</a>} />)

    expect(screen.getByRole('link', { name: 'TRENDS →' })).toBeInTheDocument()

    rerender(<ScreenHeader title="Trends" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
