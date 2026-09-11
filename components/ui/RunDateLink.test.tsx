// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RunDateLink } from './RunDateLink'

/**
 * A day inside a detail panel: a link to its run, or plain text. `runId` null is the ordinary
 * case for a whole class of dates (every period badge; any badge whose run was deleted), so the
 * text branch must not LOOK tappable — no underline, nothing inviting a thumb at a dead end.
 */

describe('RunDateLink', () => {
  it('with a run: an underlined link to /r/<id>, formatted by lib/format', () => {
    render(<RunDateLink day="2026-08-20" runId="run-123" />)

    const link = screen.getByRole('link', { name: 'Thu, 20 Aug 2026' })
    expect(link).toHaveAttribute('href', '/r/run-123')
    // The affordance is owned HERE, not by the caller: underline and its offset are fixed.
    expect(link).toHaveClass('underline', 'underline-offset-2')
  })

  it('with no run: the same day as plain text that does not look tappable', () => {
    render(<RunDateLink day="2026-08-20" runId={null} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const text = screen.getByText('Thu, 20 Aug 2026')
    expect(text.tagName).toBe('SPAN')
    expect(text).not.toHaveClass('underline')
  })

  it('the caller owns type (size, weight, colour), not the affordance', () => {
    render(<RunDateLink day="2026-08-20" runId="run-123" className="text-[11px] font-medium" />)

    expect(screen.getByRole('link', { name: 'Thu, 20 Aug 2026' })).toHaveClass(
      'text-[11px]',
      'font-medium',
      'underline',
    )
  })

  it('className reaches the text branch too, so the two branches can be sized identically', () => {
    render(<RunDateLink day="2026-08-20" runId={null} className="text-[11px]" />)

    expect(screen.getByText('Thu, 20 Aug 2026')).toHaveClass('text-[11px]')
  })

  it('both branches render the same words for the same day — only the affordance differs', () => {
    const { container: withRun } = render(<RunDateLink day="2026-08-20" runId="run-123" />)
    const { container: withoutRun } = render(<RunDateLink day="2026-08-20" runId={null} />)

    expect(withRun.textContent).toBe(withoutRun.textContent)
  })
})
