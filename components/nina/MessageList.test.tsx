// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Mocked for the same reason ChatScreen.test.tsx mocks these: each owns its own rendering,
// timers or DOM measurement and is covered on its own terms. MessageList's job under test here is
// the composition — day grouping, quote resolution, the above-slot assembly — not what a bubble,
// a photo grid or a run card draw.
vi.mock('./MessageBubble', () => ({
  MessageBubble: (props: {
    message: { id: string; body: string }
    quote: { preview: string } | null
    above?: React.ReactNode
    flash: boolean
    onReply?: (message: unknown) => void
    onJumpToQuote?: (targetId: string) => void
    onRequestActions?: (message: unknown) => void
  }) => (
    <li data-testid="bubble" data-flash={props.flash} data-quote={props.quote?.preview ?? ''}>
      <span>{props.message.body}</span>
      {props.above}
      <button onClick={() => props.onReply?.(props.message)}>{`reply:${props.message.id}`}</button>
      <button
        onClick={() => props.onJumpToQuote?.('target-x')}
      >{`jump:${props.message.id}`}</button>
      <button
        onClick={() => props.onRequestActions?.(props.message)}
      >{`actions:${props.message.id}`}</button>
    </li>
  ),
}))

vi.mock('./ChatImages', () => ({
  ChatImages: (props: {
    urls: readonly string[]
    kinds?: readonly string[]
    onOpen?: (index: number) => void
  }) => (
    <div
      data-testid="chat-images"
      data-urls={props.urls.join(',')}
      data-kinds={props.kinds?.join(',') ?? ''}
    >
      <button onClick={() => props.onOpen?.(1)}>open-image</button>
    </div>
  ),
}))

vi.mock('./RunAttachmentCard', () => ({
  RunAttachmentCard: (props: { attachment: { runId: string } }) => (
    <div data-testid="run-card">{props.attachment.runId}</div>
  ),
}))

vi.mock('./TypingIndicator', () => ({
  TypingIndicator: () => <li data-testid="typing-indicator" />,
}))

import { MessageList } from './MessageList'
import type { ChatAvatar, ChatMessage } from './types'

const AVATAR: ChatAvatar = {
  src: '/nina/avatar-001.png',
  natural: { width: null, height: null },
  crop: null,
}

function msg(overrides: Partial<ChatMessage> & { id: string; body: string }): ChatMessage {
  return {
    role: 'user',
    dayISO: '2026-09-11',
    state: 'sent',
    replyToId: null,
    ...overrides,
  }
}

function baseProps(overrides?: Partial<React.ComponentProps<typeof MessageList>>) {
  return {
    messages: [],
    typing: false,
    todayISO: '2026-09-11',
    keyboardOverlapPx: 0,
    restoreMark: null,
    flashBlinks: 4,
    avatar: AVATAR,
    ...overrides,
  }
}

describe('MessageList', () => {
  it('labels the current day "Today" and an older day by its formatted date', () => {
    render(
      <MessageList
        {...baseProps({
          todayISO: '2026-09-11',
          messages: [
            msg({ id: 'msg000000001', body: 'yesterday', dayISO: '2026-09-10' }),
            msg({ id: 'msg000000002', body: 'today', dayISO: '2026-09-11' }),
          ],
        })}
      />,
    )
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.queryByText('2026-09-10')).not.toBeInTheDocument() // sanity: not the raw ISO
  })

  it('renders one bubble per message, in order', () => {
    render(
      <MessageList
        {...baseProps({
          messages: [
            msg({ id: 'msg000000001', body: 'first' }),
            msg({ id: 'msg000000002', body: 'second' }),
          ],
        })}
      />,
    )
    const bubbles = screen.getAllByTestId('bubble')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]).toHaveTextContent('first')
    expect(bubbles[1]).toHaveTextContent('second')
  })

  it('resolves a quote for a reply whose target is on screen', () => {
    render(
      <MessageList
        {...baseProps({
          messages: [
            msg({ id: 'msg000000001', body: 'original' }),
            msg({ id: 'msg000000002', body: 'the reply', replyToId: 'msg000000001' }),
          ],
        })}
      />,
    )
    const bubbles = screen.getAllByTestId('bubble')
    expect(bubbles[1]).toHaveAttribute('data-quote', 'original')
  })

  it('resolves no quote for a reply whose target is off screen', () => {
    render(
      <MessageList
        {...baseProps({
          messages: [msg({ id: 'msg000000001', body: 'the reply', replyToId: 'msg000000099' })],
        })}
      />,
    )
    expect(screen.getByTestId('bubble')).toHaveAttribute('data-quote', '')
  })

  it('composes ChatImages into the above slot for a message carrying photos', () => {
    render(
      <MessageList
        {...baseProps({
          messages: [
            msg({
              id: 'msg000000001',
              body: 'look',
              imageUrls: ['https://blob/a.jpg', 'https://blob/b.jpg'],
              imageKinds: ['upload', 'generated'],
            }),
          ],
        })}
      />,
    )
    const images = screen.getByTestId('chat-images')
    expect(images).toHaveAttribute('data-urls', 'https://blob/a.jpg,https://blob/b.jpg')
    expect(images).toHaveAttribute('data-kinds', 'upload,generated')
  })

  it('composes RunAttachmentCard into the above slot for a message carrying a run', () => {
    const attachment = {
      runId: 'run-1',
      day: 'Thu, 20 Aug 2026',
      activityType: 'Outdoor Run',
      location: null,
      distance: '10 km',
      duration: '50:00',
      pace: '5\'00"/km',
    }
    render(
      <MessageList
        {...baseProps({
          messages: [msg({ id: 'msg000000001', body: 'ran today', attachment })],
        })}
      />,
    )
    expect(screen.getByTestId('run-card')).toHaveTextContent('run-1')
  })

  it('renders neither images nor a run card for a plain text message', () => {
    render(
      <MessageList
        {...baseProps({ messages: [msg({ id: 'msg000000001', body: 'just text' })] })}
      />,
    )
    expect(screen.queryByTestId('chat-images')).not.toBeInTheDocument()
    expect(screen.queryByTestId('run-card')).not.toBeInTheDocument()
  })

  it('wires onOpenImage to the message id and the tapped index', async () => {
    const user = userEvent.setup()
    const onOpenImage = vi.fn()
    render(
      <MessageList
        {...baseProps({
          messages: [msg({ id: 'msg000000001', body: 'look', imageUrls: ['https://blob/a.jpg'] })],
          onOpenImage,
        })}
      />,
    )
    await user.click(screen.getByText('open-image'))
    expect(onOpenImage).toHaveBeenCalledWith('msg000000001', 1)
  })

  it('flags the flashing message and no other', () => {
    render(
      <MessageList
        {...baseProps({
          messages: [
            msg({ id: 'msg000000001', body: 'a' }),
            msg({ id: 'msg000000002', body: 'b' }),
          ],
          flashId: 'msg000000002',
        })}
      />,
    )
    const bubbles = screen.getAllByTestId('bubble')
    expect(bubbles[0]).toHaveAttribute('data-flash', 'false')
    expect(bubbles[1]).toHaveAttribute('data-flash', 'true')
  })

  it('threads onReply, onJumpToQuote and onRequestActions straight through', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    const onJumpToQuote = vi.fn()
    const onRequestActions = vi.fn()
    render(
      <MessageList
        {...baseProps({
          messages: [msg({ id: 'msg000000001', body: 'a' })],
          onReply,
          onJumpToQuote,
          onRequestActions,
        })}
      />,
    )

    await user.click(screen.getByText('reply:msg000000001'))
    await user.click(screen.getByText('jump:msg000000001'))
    await user.click(screen.getByText('actions:msg000000001'))

    expect(onReply).toHaveBeenCalledTimes(1)
    expect(onJumpToQuote).toHaveBeenCalledWith('target-x')
    expect(onRequestActions).toHaveBeenCalledTimes(1)
  })

  it('shows the typing indicator only while a turn is in flight', () => {
    const { rerender } = render(<MessageList {...baseProps({ typing: false })} />)
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument()

    rerender(<MessageList {...baseProps({ typing: true })} />)
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument()
  })

  it('sets the flash iteration count as a CSS custom property from flashBlinks', () => {
    const { container } = render(<MessageList {...baseProps({ flashBlinks: 7 })} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--nina-flash-count')).toBe('7')
  })
})
