// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptySlot, EmptyState } from './EmptyState'

/**
 * The one shape absence takes in this app. The component's own comment is the brief: dashed,
 * because it is the outline of a card that has nothing in it yet — never an error card. The
 * EmptySlot half is §9's rule: "no data" renders a sentence, never five 0% segments.
 */

describe('EmptyState', () => {
  it('renders the dashed outline with a title', () => {
    render(<EmptyState title="No runs yet" />)

    const title = screen.getByText('No runs yet')
    expect(title).toBeInTheDocument()
    // The dashed vocabulary: a different kind of thing, never "something went wrong".
    expect(title.closest('div')).toHaveClass('border-dashed', 'text-center')
  })

  it('renders the description sentence under the title', () => {
    render(<EmptyState title="No runs yet" description="Upload your first screenshot." />)

    expect(screen.getByText('Upload your first screenshot.')).toBeInTheDocument()
  })

  it('omits the description entirely when none is given', () => {
    const { container } = render(<EmptyState title="No runs yet" />)

    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('renders at most one action, and it is a live control', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    render(
      <EmptyState
        title="No runs yet"
        action={
          <button type="button" onClick={onUpload}>
            Upload a run
          </button>
        }
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Upload a run' }))

    expect(onUpload).toHaveBeenCalledTimes(1)
    // The action sits in its own block below the copy.
    const action = screen.getByRole('button', { name: 'Upload a run' })
    expect(action.parentElement).toHaveClass('mt-6')
  })
})

describe('EmptySlot', () => {
  it('renders its sentence as a one-line dashed slot', () => {
    render(<EmptySlot>No heart-rate data for this run.</EmptySlot>)

    const slot = screen.getByText('No heart-rate data for this run.')
    expect(slot.tagName).toBe('P')
    expect(slot).toHaveClass('border-dashed', 'text-center')
  })

  it('renders any children it is handed', () => {
    render(
      <EmptySlot>
        No runs in <strong>this band</strong> yet.
      </EmptySlot>,
    )

    expect(screen.getByText('this band')).toBeInTheDocument()
  })
})
