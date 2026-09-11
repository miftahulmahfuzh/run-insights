// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserId, countUnreadNinaMessages } = vi.hoisted(() => ({
  getUserId: vi.fn(),
  countUnreadNinaMessages: vi.fn(),
}))
// Both collaborators cross a real boundary — cookies, then Postgres. The badge is a pure function
// of their two answers, and that function (including both of its null renders) is exactly what
// these tests pin; the queries module would also drag the DB client into the test for nothing.
vi.mock('@/lib/auth/requireUserId', () => ({ getUserId }))
vi.mock('@/lib/nina/queries', () => ({ countUnreadNinaMessages }))

import { NinaUnreadBadge, NinaUnreadBadgeSlot } from './NinaUnreadBadge'

describe('NinaUnreadBadge', () => {
  beforeEach(() => {
    getUserId.mockReset()
    countUnreadNinaMessages.mockReset()
    getUserId.mockResolvedValue('user-1')
    countUnreadNinaMessages.mockResolvedValue(0)
  })

  it('renders nothing for a signed-out shell (a loading fallback must not be soft-404ed)', async () => {
    getUserId.mockResolvedValue(null)
    const { container } = render(await NinaUnreadBadge())
    expect(container.textContent).toBe('')
    expect(countUnreadNinaMessages).not.toHaveBeenCalled()
  })

  it('renders nothing when everything of hers is read', async () => {
    countUnreadNinaMessages.mockResolvedValue(0)
    const { container } = render(await NinaUnreadBadge())
    expect(container.textContent).toBe('')
  })

  it('renders the dot when she has unread messages, announced with the count', async () => {
    countUnreadNinaMessages.mockResolvedValue(2)
    render(await NinaUnreadBadge())
    const dot = screen.getByRole('status')
    expect(dot).toHaveAttribute('aria-label', '2 unread messages from Nina')
    // A count is deliberately NOT painted on a 10px tab label — the screen reader carries it.
    expect(dot.textContent).toBe('')
  })

  it('singularises the announcement for exactly one unread message', async () => {
    countUnreadNinaMessages.mockResolvedValue(1)
    render(await NinaUnreadBadge())
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      '1 unread message from Nina',
    )
  })

  it('floats over the tab icon without nudging the label, and reads as a dot', async () => {
    countUnreadNinaMessages.mockResolvedValue(3)
    const { container } = render(await NinaUnreadBadge())
    const dot = container.querySelector('span') as HTMLElement
    expect(dot.className).toContain('absolute')
    expect(dot.className).toContain('-top-1')
    expect(dot.className).toContain('-right-1')
    expect(dot.className).toContain('rounded-full')
    expect(dot.className).toContain('ring-2')
  })

  it('the slot’s Suspense falls back to nothing — a skeleton dot would be a lie', () => {
    // Never resolves: the pending state, held open deliberately.
    countUnreadNinaMessages.mockReturnValue(new Promise(() => {}))
    const { container } = render(<NinaUnreadBadgeSlot />)
    // While the badge's await is unresolved the slot paints NOTHING, not a skeleton dot — the
    // honest states are "no dot yet" and "dot". The answered half of the contract (the dot
    // itself) is pinned by the direct renders above, because the test renderer, unlike Next's
    // own runtime, does not resolve an async client component through React.
    expect(container.textContent).toBe('')
  })
})
