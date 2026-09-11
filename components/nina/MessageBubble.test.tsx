// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Real decision functions throughout (lib/nina/reply.ts, lib/nina/edit.ts): they are already unit
// tested on their own terms, and mocking them here would only prove that MessageBubble calls a
// function named `decideReplySwipe` — not that a real rightward drag on a real bubble reaches it.
import { MessageBubble } from './MessageBubble'
import type { QuoteView } from '@/lib/nina/reply'
import type { ChatMessage } from './types'

/** 12 chars, matching `lib/id.ts`'s `ID_RE` — `canActOnMessage` refuses anything shorter. */
const MSG_ID = 'msg000000001'

function message(overrides?: Partial<ChatMessage>): ChatMessage {
  return {
    id: MSG_ID,
    role: 'user',
    body: 'hello there',
    dayISO: '2026-09-11',
    state: 'sent',
    replyToId: null,
    ...overrides,
  }
}

const QUOTE: QuoteView = {
  targetId: 'msg000000002',
  author: 'nina',
  preview: 'earlier text',
  media: 'none',
}

function bubbleBody(container: HTMLElement) {
  return container.querySelector('[data-nina-bubble-body]') as HTMLElement
}

function li(container: HTMLElement) {
  return container.querySelector('li') as HTMLElement
}

describe('MessageBubble', () => {
  it('renders the message body', () => {
    render(<MessageBubble message={message({ body: 'a real message' })} />)
    expect(screen.getByText('a real message')).toBeInTheDocument()
  })

  it('aligns a user message to the end and a Nina message to the start', () => {
    const { container: mine } = render(<MessageBubble message={message({ role: 'user' })} />)
    expect(li(mine).className).toContain('justify-end')

    const { container: hers } = render(<MessageBubble message={message({ role: 'nina' })} />)
    expect(li(hers).className).toContain('justify-start')
  })

  it('renders the quote stub only when a quote is resolved', () => {
    const { rerender } = render(<MessageBubble message={message()} quote={null} />)
    expect(screen.queryByText('earlier text')).not.toBeInTheDocument()

    rerender(<MessageBubble message={message()} quote={QUOTE} />)
    expect(screen.getByText('earlier text')).toBeInTheDocument()
  })

  it('renders the above slot between the quote and the body', () => {
    render(
      <MessageBubble
        message={message()}
        quote={QUOTE}
        above={<div data-testid="above-slot">pinned run</div>}
      />,
    )
    expect(screen.getByTestId('above-slot')).toBeInTheDocument()
  })

  it('dims a sending bubble and rings a failed one', () => {
    const { container: sending } = render(<MessageBubble message={message({ state: 'sending' })} />)
    expect(bubbleBody(sending).className).toContain('opacity-60')

    const { container: failed } = render(<MessageBubble message={message({ state: 'failed' })} />)
    expect(bubbleBody(failed).className).toContain('ring-1')
    expect(bubbleBody(failed).className).toContain('ring-red')
  })

  it('applies the flash animation only when flash is true', () => {
    const { container: quiet } = render(<MessageBubble message={message()} flash={false} />)
    expect(bubbleBody(quiet).className).not.toContain('animation')

    const { container: flashing } = render(<MessageBubble message={message()} flash={true} />)
    expect(bubbleBody(flashing).className).toContain('nina-flash-blink')
  })

  it('sets the flash ring color variable only on a flashing bubble that is mine', () => {
    const { container: hers } = render(
      <MessageBubble message={message({ role: 'nina' })} flash={true} />,
    )
    expect(bubbleBody(hers).className).not.toContain('--nina-flash-ring-color')

    const { container: mine } = render(
      <MessageBubble message={message({ role: 'user' })} flash={true} />,
    )
    expect(bubbleBody(mine).className).toContain('--nina-flash-ring-color')
  })

  it('renders the reply and actions sr-only buttons only when their handlers are given', () => {
    render(<MessageBubble message={message()} />)
    expect(screen.queryByText('Reply to this message')).not.toBeInTheDocument()
    expect(screen.queryByText('Edit or delete this message')).not.toBeInTheDocument()

    render(<MessageBubble message={message()} onReply={vi.fn()} onRequestActions={vi.fn()} />)
    expect(screen.getByText('Reply to this message')).toBeInTheDocument()
    expect(screen.getByText('Edit or delete this message')).toBeInTheDocument()
  })

  it('the reply sr-only button calls onReply with the message', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    const msg = message()
    render(<MessageBubble message={msg} onReply={onReply} />)

    await user.click(screen.getByText('Reply to this message'))
    expect(onReply).toHaveBeenCalledWith(msg)
  })

  it('the actions sr-only button calls onRequestActions with the message', async () => {
    const user = userEvent.setup()
    const onRequestActions = vi.fn()
    const msg = message()
    render(<MessageBubble message={msg} onRequestActions={onRequestActions} />)

    await user.click(screen.getByText('Edit or delete this message'))
    expect(onRequestActions).toHaveBeenCalledWith(msg)
  })

  it('a rightward touch swipe on the bubble arms a reply, and does not open actions', () => {
    const onReply = vi.fn()
    const onRequestActions = vi.fn()
    const msg = message()
    const { container } = render(
      <MessageBubble message={msg} onReply={onReply} onRequestActions={onRequestActions} />,
    )
    const target = li(container)

    fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 200 }] })
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: 170, clientY: 200 }] })

    expect(onReply).toHaveBeenCalledWith(msg)
    expect(onRequestActions).not.toHaveBeenCalled()
  })

  it('a leftward touch swipe on the bubble opens actions, and does not arm a reply', () => {
    const onReply = vi.fn()
    const onRequestActions = vi.fn()
    const msg = message()
    const { container } = render(
      <MessageBubble message={msg} onReply={onReply} onRequestActions={onRequestActions} />,
    )
    const target = li(container)

    fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 200 }] })
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: 130, clientY: 200 }] })

    expect(onRequestActions).toHaveBeenCalledWith(msg)
    expect(onReply).not.toHaveBeenCalled()
  })

  it('a touch tap on the confirmed bubble body opens actions', () => {
    const onRequestActions = vi.fn()
    const msg = message({ state: 'sent' })
    const { container } = render(
      <MessageBubble message={msg} onRequestActions={onRequestActions} />,
    )
    const body = bubbleBody(container)

    // Dispatched ON the bubble body (a descendant of the `<li>` the handlers are bound to), so
    // `event.target` is the body div and `closestMatches` finds `BUBBLE_BODY_SELECTOR` on it —
    // exactly what a real finger press on the prose reports.
    fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 200 }] })
    fireEvent.touchEnd(body, { changedTouches: [{ clientX: 102, clientY: 199 }] })

    expect(onRequestActions).toHaveBeenCalledWith(msg)
  })

  it('a touch tap on an unconfirmed (sending) bubble does not open actions', () => {
    const onRequestActions = vi.fn()
    const msg = message({ state: 'sending' })
    const { container } = render(
      <MessageBubble message={msg} onRequestActions={onRequestActions} />,
    )
    const body = bubbleBody(container)

    fireEvent.touchStart(body, { touches: [{ clientX: 100, clientY: 200 }] })
    fireEvent.touchEnd(body, { changedTouches: [{ clientX: 102, clientY: 199 }] })

    expect(onRequestActions).not.toHaveBeenCalled()
  })

  it('a mouse tap on the bubble body opens actions', () => {
    const onRequestActions = vi.fn()
    const msg = message()
    const { container } = render(
      <MessageBubble message={msg} onRequestActions={onRequestActions} />,
    )
    const body = bubbleBody(container)

    fireEvent.pointerDown(body, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 50,
      clientY: 60,
    })
    fireEvent.pointerUp(body, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 51,
      clientY: 61,
    })

    expect(onRequestActions).toHaveBeenCalledWith(msg)
  })

  it('ignores a non-mouse pointer tap on the bubble body', () => {
    const onRequestActions = vi.fn()
    const { container } = render(
      <MessageBubble message={message()} onRequestActions={onRequestActions} />,
    )
    const body = bubbleBody(container)

    fireEvent.pointerDown(body, {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 50,
      clientY: 60,
    })
    fireEvent.pointerUp(body, {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 51,
      clientY: 61,
    })

    expect(onRequestActions).not.toHaveBeenCalled()
  })

  it('drops a stale press once the pointer leaves before releasing', () => {
    const onRequestActions = vi.fn()
    const { container } = render(
      <MessageBubble message={message()} onRequestActions={onRequestActions} />,
    )
    const body = bubbleBody(container)

    fireEvent.pointerDown(body, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 50,
      clientY: 60,
    })
    fireEvent.pointerLeave(body, { pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(body, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 51,
      clientY: 61,
    })

    expect(onRequestActions).not.toHaveBeenCalled()
  })
})
