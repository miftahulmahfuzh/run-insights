// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `SessionRow` is covered on its own terms in its own file. What THIS component decides — and the
// only thing worth pinning here — is the two shapes of `planSessionList`'s answer and the
// pass-through of the three props every row needs. A stub records that pass-through verbatim.
const { rowProps } = vi.hoisted(() => ({ rowProps: [] as Array<Record<string, unknown>> }))
vi.mock('./SessionRow', () => ({
  SessionRow: (props: Record<string, unknown>) => {
    rowProps.push(props)
    return <div data-testid="session-row" />
  },
}))

import { SessionList } from './SessionList'
import type { SidebarList, SidebarSession } from '@/lib/nina/sidebar'

function session(overrides?: Partial<SidebarSession>): SidebarSession {
  return {
    id: 'sess-1',
    title: 'Morning runs',
    href: '/nina?s=sess-1',
    pinned: false,
    dayLabel: 'Today',
    ...overrides,
  }
}

function rowsList(activeId: string | null = null): SidebarList {
  return {
    kind: 'rows',
    rows: [
      {
        session: session({ id: 'sess-1', pinned: true }),
        active: activeId === 'sess-1',
      },
      {
        session: session({ id: 'sess-2', title: 'Photo talk', href: '/nina?s=sess-2', dayLabel: null }),
        active: activeId === 'sess-2',
      },
    ],
  }
}

function renderList(list: SidebarList, activeSessionId: string | null = null) {
  const onClose = vi.fn()
  const utils = render(<SessionList list={list} activeSessionId={activeSessionId} onClose={onClose} />)
  return { ...utils, onClose }
}

describe('SessionList', () => {
  beforeEach(() => {
    rowProps.length = 0
  })

  it('the empty shape is the app’s one absence card: dashed, titled, one sentence', () => {
    renderList({ kind: 'empty' })
    expect(screen.getByText('Belum ada chat')).toBeInTheDocument()
    expect(screen.getByText('Chat baru akan muncul di sini, yang terbaru di atas.')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="session-row"]')).toBeNull()
  })

  it('the empty state carries no action slot — the create control lives above the list, once', () => {
    const { container } = renderList({ kind: 'empty' })
    // R2's control belongs in the panel's newChatSlot, reachable whether or not rows exist.
    expect(container.querySelectorAll('button').length).toBe(0)
  })

  it('one row per session, in the order it was handed — never re-sorted here', () => {
    renderList(rowsList())
    expect(screen.getAllByTestId('session-row').length).toBe(2)
  })

  it('each row gets its session, its active flag, and the shared pass-throughs verbatim', () => {
    const { onClose } = renderList(rowsList('sess-2'), 'sess-2')
    expect(rowProps.length).toBe(2)
    expect(rowProps[0]).toMatchObject({ active: false, activeSessionId: 'sess-2' })
    expect(rowProps[1]).toMatchObject({ active: true, activeSessionId: 'sess-2' })
    // The same `onClose` reference reaches every row — one close path, not one per row.
    expect(rowProps[0]?.onClose).toBe(onClose)
    expect(rowProps[1]?.onClose).toBe(onClose)
    expect((rowProps[0] as { session: SidebarSession }).session.pinned).toBe(true)
  })
})
