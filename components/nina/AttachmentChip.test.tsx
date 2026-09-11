// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Pure render over a display-ready shape: every string arrives already formatted by lib/format.ts
// on the server (the type comment says so), so there is nothing here to mock and no decision to
// fake — the chip joins, truncates and names its one control.
import { AttachmentChip } from './AttachmentChip'
import type { RunAttachment } from '@/lib/nina/attach'

function attachment(overrides?: Partial<RunAttachment>): RunAttachment {
  return {
    runId: 'run-1',
    day: 'Thu, 20 Aug 2026',
    activityType: 'Outdoor Run',
    location: 'Senayan',
    distance: '10.67 km',
    duration: '1:02:33',
    pace: `5'52"/km`,
    ...overrides,
  }
}

describe('AttachmentChip', () => {
  it('renders the day · location kicker and the numbers line', () => {
    render(<AttachmentChip attachment={attachment()} onClear={() => {}} />)
    expect(screen.getByText('Thu, 20 Aug 2026 · Senayan')).toBeInTheDocument()
    expect(screen.getByText(`10.67 km · 1:02:33 · 5'52"/km`)).toBeInTheDocument()
  })

  it('drops the separator when a run has no location', () => {
    render(<AttachmentChip attachment={attachment({ location: null })} onClear={() => {}} />)
    expect(screen.getByText('Thu, 20 Aug 2026')).toBeInTheDocument()
  })

  it('names the one control and reports the clear', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<AttachmentChip attachment={attachment()} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: 'Remove the attached run' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('the clear is a 44px target and the run itself is not a link', () => {
    const { container } = render(<AttachmentChip attachment={attachment()} onClear={() => {}} />)
    expect(screen.getByRole('button', { name: 'Remove the attached run' }).className).toContain(
      'size-11',
    )
    expect(container.querySelector('a')).toBeNull()
  })

  it('never renders the activity type — the card is numbers and place, not a label twice', () => {
    render(<AttachmentChip attachment={attachment()} onClear={() => {}} />)
    expect(screen.queryByText('Outdoor Run')).not.toBeInTheDocument()
  })
})
