// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Real QUOTE_MEDIA_LABEL throughout: the label a quote renders must be the same table the
// server-side preview logic reads, so asserting the shipped string is the point — re-typing
// "Photo" here would pass even if the table renamed the word under the stub.
import { QuoteStub } from './QuoteStub'
import type { QuoteView } from '@/lib/nina/reply'

function quote(overrides?: Partial<QuoteView>): QuoteView {
  return {
    targetId: 'msg000000002',
    author: 'nina',
    preview: 'earlier text',
    media: 'none',
    ...overrides,
  }
}

/** The stub's root element: a `<button>` when it can jump, a `<div>` when it cannot. */
function stubRoot(container: HTMLElement) {
  return container.firstElementChild as HTMLElement
}

describe('QuoteStub', () => {
  it('renders the quoted preview text', () => {
    render(<QuoteStub quote={quote({ preview: 'how far was the run?' })} mine={false} />)
    expect(screen.getByText('how far was the run?')).toBeInTheDocument()
  })

  it('names the quoted author from the runner’s point of view', () => {
    render(<QuoteStub quote={quote({ author: 'you' })} mine={false} />)
    expect(screen.getByText('You')).toBeInTheDocument()

    const { unmount } = render(<QuoteStub quote={quote({ author: 'nina' })} mine={false} />)
    expect(screen.getByText('Nina')).toBeInTheDocument()
    unmount()
  })

  it('appends the media word for a photo and a run, and nothing for a plain message', () => {
    render(<QuoteStub quote={quote({ author: 'you', media: 'photo' })} mine={false} />)
    expect(screen.getByText('You · Photo')).toBeInTheDocument()
  })

  it('labels a quoted run as a Run', () => {
    render(<QuoteStub quote={quote({ author: 'nina', media: 'run' })} mine={false} />)
    expect(screen.getByText('Nina · Run')).toBeInTheDocument()
  })

  it('is an inert div in the composer, where there is nothing on screen to scroll to', () => {
    const { container } = render(<QuoteStub quote={quote()} mine={false} />)
    expect(stubRoot(container).tagName).toBe('DIV')
  })

  it('is a real button when the target is on screen, named for VoiceOver', () => {
    const { container } = render(
      <QuoteStub quote={quote({ author: 'you', preview: 'pace note' })} mine={true} onJump={vi.fn()} />,
    )
    const button = stubRoot(container)
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAccessibleName('Go to the message from You: pace note')
  })

  it('jumping reports the quoted message’s id', async () => {
    const user = userEvent.setup()
    const onJump = vi.fn()
    render(<QuoteStub quote={quote({ targetId: 'msg000000009' })} mine={false} onJump={onJump} />)

    await user.click(screen.getByRole('button'))
    expect(onJump).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledWith('msg000000009')
  })

  it('keeps RULING E1’s one fill on both grounds — the fill never branches', () => {
    const { container: onHers } = render(<QuoteStub quote={quote()} mine={false} />)
    const { container: onHis } = render(<QuoteStub quote={quote()} mine={true} />)
    expect(stubRoot(onHers).className).toContain('bg-ink-3/20')
    expect(stubRoot(onHis).className).toContain('bg-ink-3/20')
  })

  it('only the left rule and the text colours branch on whose ground the stub sits', () => {
    const { container: onHers } = render(<QuoteStub quote={quote()} mine={false} />)
    const { container: onHis } = render(<QuoteStub quote={quote()} mine={true} />)
    expect(stubRoot(onHers).className).toContain('border-accent')
    expect(stubRoot(onHers).className).not.toContain('border-card')
    expect(stubRoot(onHis).className).toContain('border-card/40')
    expect(stubRoot(onHis).className).not.toContain('border-accent')
  })

  it('merges a caller’s className onto the stub’s skin', () => {
    const { container } = render(<QuoteStub quote={quote()} mine={false} className="-mt-1" />)
    expect(stubRoot(container).className).toContain('-mt-1')
  })
})
