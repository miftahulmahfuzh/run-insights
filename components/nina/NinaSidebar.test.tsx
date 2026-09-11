// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A shared mutable value the mocked `useSearchParams()` reads on every render, so a test can
// simulate what a real Next navigation does to this hook — set it, then `rerender()` — without
// pulling in the App Router itself. `NinaSidebarProvider`'s own header explains why the panel's
// open state is read from here rather than held locally: this mock is standing in for exactly
// that URL-is-the-state design.
let mockSearch = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearch,
}))

vi.mock('./NinaAvatar', () => ({ NinaAvatar: () => <div data-testid="avatar" /> }))
vi.mock('./NewChatButton', () => ({
  NewChatButton: (props: { onNavigate?: () => void }) => (
    <button onClick={props.onNavigate}>+ new chat (default)</button>
  ),
}))
vi.mock('./NinaSearchField', () => ({
  NinaSearchField: () => <input aria-label="search (default)" />,
}))
vi.mock('./SessionList', () => ({
  SessionList: (props: {
    list: { kind: string; rows?: ReadonlyArray<{ session: { id: string; title: string } }> }
  }) => (
    <ul data-testid="session-list">
      {props.list.kind === 'rows'
        ? props.list.rows?.map((row) => <li key={row.session.id}>{row.session.title}</li>)
        : null}
    </ul>
  ),
}))

import type * as React from 'react'

import { NinaSidebar, NinaSidebarProvider, NinaSidebarTrigger, useNinaSidebar } from './NinaSidebar'
import type { SidebarSession } from '@/lib/nina/sidebar'

const AVATAR = { src: '/nina/avatar-001.png', natural: { width: null, height: null }, crop: null }

const SESSIONS: SidebarSession[] = [
  {
    id: 'sess000000a1',
    title: 'Marathon plan',
    href: '/nina?s=sess000000a1',
    pinned: false,
    dayLabel: 'Today',
  },
  {
    id: 'sess000000b2',
    title: 'Injury check-in',
    href: '/nina?s=sess000000b2',
    pinned: true,
    dayLabel: '3 Sep',
  },
]

function Harness(props: { children: React.ReactNode }) {
  return <NinaSidebarProvider>{props.children}</NinaSidebarProvider>
}

beforeEach(() => {
  mockSearch = new URLSearchParams()
})

describe('useNinaSidebar / NinaSidebarTrigger', () => {
  it('is null outside a provider, and the trigger renders nothing for it', () => {
    function Probe() {
      const sidebar = useNinaSidebar()
      return <span>{sidebar === null ? 'no-provider' : 'has-provider'}</span>
    }
    render(<Probe />)
    expect(screen.getByText('no-provider')).toBeInTheDocument()

    const { container } = render(<NinaSidebarTrigger />)
    expect(container).toBeEmptyDOMElement()
  })

  it('pushes ?sidebar=1 onto the URL when clicked', async () => {
    const user = userEvent.setup()
    window.history.pushState(null, '', '/nina?s=session-1')
    const pushState = vi.spyOn(window.history, 'pushState')

    render(
      <Harness>
        <NinaSidebarTrigger />
      </Harness>,
    )
    await user.click(screen.getByRole('button', { name: 'Buka daftar chat' }))

    expect(pushState).toHaveBeenCalledTimes(1)
    const [, , url] = pushState.mock.calls[0]!
    expect(String(url)).toBe('?s=session-1&sidebar=1')
    pushState.mockRestore()
  })
})

describe('NinaSidebar', () => {
  it('is hidden from the accessibility tree when ?sidebar= is absent', () => {
    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId={null} />
      </Harness>,
    )
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true')
  })

  it('is exposed to the accessibility tree when ?sidebar=1 is present', () => {
    mockSearch = new URLSearchParams('sidebar=1')
    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId={null} />
      </Harness>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveAttribute('aria-hidden')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('lists every session by title, through the default SessionList slot', () => {
    mockSearch = new URLSearchParams('sidebar=1')
    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId="sess000000a1" />
      </Harness>,
    )
    expect(screen.getByText('Marathon plan')).toBeInTheDocument()
    expect(screen.getByText('Injury check-in')).toBeInTheDocument()
  })

  it('renders the default search field and new-chat button when no slot override is given', () => {
    mockSearch = new URLSearchParams('sidebar=1')
    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId={null} />
      </Harness>,
    )
    expect(screen.getByLabelText('search (default)')).toBeInTheDocument()
    expect(screen.getByText('+ new chat (default)')).toBeInTheDocument()
  })

  it('renders a supplied searchSlot / newChatSlot instead of the defaults', () => {
    mockSearch = new URLSearchParams('sidebar=1')
    render(
      <Harness>
        <NinaSidebar
          avatar={AVATAR}
          sessions={SESSIONS}
          activeSessionId={null}
          searchSlot={<div>custom search</div>}
          newChatSlot={<button>custom new chat</button>}
        />
      </Harness>,
    )
    expect(screen.getByText('custom search')).toBeInTheDocument()
    expect(screen.getByText('custom new chat')).toBeInTheDocument()
    expect(screen.queryByLabelText('search (default)')).not.toBeInTheDocument()
    expect(screen.queryByText('+ new chat (default)')).not.toBeInTheDocument()
  })

  it('closes by replaceState on Escape when this session never pushed the open entry', async () => {
    const user = userEvent.setup()
    const replaceState = vi.spyOn(window.history, 'replaceState')
    mockSearch = new URLSearchParams('sidebar=1')
    window.history.pushState(null, '', '/nina?sidebar=1')

    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId={null} />
      </Harness>,
    )
    await user.keyboard('{Escape}')

    expect(replaceState).toHaveBeenCalledTimes(1)
    const [, , url] = replaceState.mock.calls[0]!
    expect(String(url)).toBe('/nina')
    replaceState.mockRestore()
  })

  it("the rail's close (✕) button and ✕ header button both close the panel the same way", async () => {
    const user = userEvent.setup()
    const replaceState = vi.spyOn(window.history, 'replaceState')
    mockSearch = new URLSearchParams('sidebar=1')
    window.history.pushState(null, '', '/nina?sidebar=1')

    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId={null} />
      </Harness>,
    )
    const closeButtons = screen.getAllByRole('button', { name: 'Tutup daftar chat' })
    expect(closeButtons).toHaveLength(2)
    await user.click(closeButtons[0]!)

    expect(replaceState).toHaveBeenCalledTimes(1)
    replaceState.mockRestore()
  })

  it('the wand links to the image-jobs queue', () => {
    mockSearch = new URLSearchParams('sidebar=1')
    render(
      <Harness>
        <NinaSidebar avatar={AVATAR} sessions={SESSIONS} activeSessionId={null} />
      </Harness>,
    )
    expect(screen.getByRole('link', { name: 'Proses foto' })).toHaveAttribute('href', '/nina/jobs')
  })
})
