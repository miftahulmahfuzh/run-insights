// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// `next/navigation` is the one mock: `useChatScrollMark` reads the URL through `useSearchParams`,
// which needs a router scope this renderer does not have. The hook itself stays real — the card's
// contract is that a tap AWAY from this entry marks it, and faking the hook would pin nothing.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

// Real lib/nina/attach types, real hook, real Link markup.
import { RunAttachmentCard } from './RunAttachmentCard'
import type { RunAttachment } from '@/lib/nina/attach'

function attachment(overrides?: Partial<RunAttachment>): RunAttachment {
  return {
    runId: 'run-abc',
    day: 'Thu, 20 Aug 2026',
    activityType: 'Outdoor Run',
    location: 'Senayan',
    distance: '10.67 km',
    duration: '1:02:33',
    pace: `5'52"/km`,
    ...overrides,
  }
}

describe('RunAttachmentCard', () => {
  it('is the door to the run: a real link to /r/<runId>', () => {
    render(<RunAttachmentCard attachment={attachment()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/r/run-abc')
  })

  it('renders the kicker, the distance as the headline, and the pace line', () => {
    render(<RunAttachmentCard attachment={attachment()} />)
    expect(screen.getByText('Thu, 20 Aug 2026 · Senayan')).toBeInTheDocument()
    expect(screen.getByText('10.67 km')).toBeInTheDocument()
    expect(screen.getByText(`1:02:33 · 5'52"/km`)).toBeInTheDocument()
  })

  it('sits on the shared E1 inset, not the bubble-inverting paper fill', () => {
    render(<RunAttachmentCard attachment={attachment()} />)
    // RULING E1: `bg-ink-3/20` is the one inset surface for phases 6, 7, 8 and 13 — mid-grey in
    // both schemes, so it reads on his bubble and on hers without a branch.
    expect(screen.getByRole('link').className).toContain('bg-ink-3/20')
    expect(screen.getByRole('link').className).not.toContain('bg-paper-2')
  })

  it('carries no border and no shadow inside a bubble that already has one', () => {
    render(<RunAttachmentCard attachment={attachment()} />)
    const cls = screen.getByRole('link').className
    expect(cls).not.toContain('border')
    expect(cls).not.toContain('shadow')
  })

  it('renders a run with no location without a dangling separator', () => {
    render(<RunAttachmentCard attachment={attachment({ location: null })} />)
    expect(screen.getByText('Thu, 20 Aug 2026')).toBeInTheDocument()
  })
})
