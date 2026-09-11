// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendNinaMessage, resendNinaMessage, pollNinaReply } = vi.hoisted(() => ({
  sendNinaMessage: vi.fn(),
  resendNinaMessage: vi.fn(),
  pollNinaReply: vi.fn(),
}))
vi.mock('@/lib/nina/actions', () => ({ sendNinaMessage, resendNinaMessage, pollNinaReply }))

const { editNinaMessage, removeNinaMessage } = vi.hoisted(() => ({
  editNinaMessage: vi.fn(),
  removeNinaMessage: vi.fn(),
}))
vi.mock('@/lib/nina/messageActions', () => ({ editNinaMessage, removeNinaMessage }))

const routerRefresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}))

// The children below own their own rendering, timers and DOM measurement (scroll physics,
// keyboard overlap, ResizeObserver-driven focus reassertion) and are covered — or are coverable —
// on their own terms. ChatScreen's job is the wiring between a gesture and lib/nina/actions, so
// these stubs expose just enough surface for that wiring to be exercised and asserted on.
vi.mock('./MessageList', () => ({
  MessageList: (props: {
    messages: ReadonlyArray<{ id: string; body: string; state: string }>
    typing: boolean
    onRequestActions?: (message: { id: string; body: string; state: string }) => void
  }) => (
    <div data-testid="message-list" data-typing={props.typing}>
      {props.messages.map((m) => (
        <div key={m.id} data-testid="message" data-state={m.state}>
          <span>{m.body}</span>
          <button onClick={() => props.onRequestActions?.(m)}>{`actions:${m.id}`}</button>
        </div>
      ))}
    </div>
  ),
}))

vi.mock('./Composer', () => ({
  Composer: (props: { onSend: (draft: { body: string; images: [] }) => void; busy: boolean }) => (
    <button
      onClick={() => void props.onSend({ body: 'hello nina', images: [] })}
      disabled={props.busy}
    >
      Send
    </button>
  ),
}))

vi.mock('./MessageActionsSheet', () => ({
  MessageActionsSheet: (props: {
    target: { id: string } | null
    onClose: () => void
    onSubmitEdit: (id: string, body: string) => Promise<boolean>
    onDelete: (id: string) => Promise<boolean>
    onResend: (id: string) => Promise<string | null>
  }) => {
    if (props.target === null) return null
    const id = props.target.id
    return (
      <div data-testid="actions-sheet">
        <button onClick={() => void props.onSubmitEdit(id, 'edited body')}>Save edit</button>
        <button onClick={() => void props.onDelete(id)}>Delete</button>
        <button onClick={() => void props.onResend(id)}>Resend</button>
        <button onClick={props.onClose}>Close sheet</button>
      </div>
    )
  },
}))

vi.mock('./KeyboardOverlapPublisher', () => ({ KeyboardOverlapPublisher: () => null }))
vi.mock('@/components/ui/PhotoViewer', () => ({ PhotoViewer: () => null }))
vi.mock('./ChatPhotoActions', () => ({ ChatPhotoActions: () => null }))

// Below every vi.mock() above: harmless in source order (Vitest hoists vi.mock calls above every
// import in this file regardless of where they are written), but keeping the real imports after
// the mocks they depend on reads correctly too.
import { ChatScreen } from './ChatScreen'
import type { ChatAvatar, ChatMessage } from './types'

const AVATAR: ChatAvatar = {
  src: '/nina/avatar-001.png',
  natural: { width: null, height: null },
  crop: null,
}

const NOT_AWAITING = { awaiting: false, cursor: 0 }

/** 12 chars, matching `lib/id.ts`'s `ID_RE` — real message ids, so `isValidId` gates the same
 * way here as it does for a row the server actually wrote. */
const MSG_ID = 'msg000000001'

function baseProps(overrides?: {
  initial?: readonly ChatMessage[]
  flight?: { awaiting: boolean; cursor: number }
}) {
  return {
    initial: overrides?.initial ?? [],
    todayISO: '2026-09-11',
    userId: 'user-1',
    sessionId: 'session-1',
    pending: null,
    pendingPhoto: null,
    flight: overrides?.flight ?? NOT_AWAITING,
    avatar: AVATAR,
    flashBlinks: 4,
  }
}

function sentMessage(id: string, body: string): ChatMessage {
  return { id, role: 'user', body, dayISO: '2026-09-11', state: 'sent', replyToId: null }
}

beforeEach(() => {
  sendNinaMessage.mockReset()
  resendNinaMessage.mockReset()
  pollNinaReply.mockReset()
  editNinaMessage.mockReset()
  removeNinaMessage.mockReset()
  routerRefresh.mockReset()
  // Never resolves within a test's lifetime unless a test overrides it. The arrival loop this
  // starts is covered by lib/nina/turnflight.test.ts; here it only needs to not throw while a
  // test asserts on the synchronous send/edit/delete wiring, and its own effect cleanup (cleared
  // on unmount) means a still-pending promise leaves nothing running after the test ends.
  pollNinaReply.mockImplementation(() => new Promise(() => {}))
})

describe('ChatScreen', () => {
  it('renders the empty state with no messages and no turn in flight', () => {
    render(<ChatScreen {...baseProps()} />)
    expect(screen.getByText('Nina has not started yet')).toBeInTheDocument()
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument()
  })

  it('renders the message list instead of the empty state once there is history', () => {
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)
    expect(screen.queryByText('Nina has not started yet')).not.toBeInTheDocument()
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('appends an optimistic sending bubble immediately and confirms it on success', async () => {
    const user = userEvent.setup()
    let resolveSend!: (value: {
      ok: boolean
      userMessageId: string
      sessionId: string
      cursor: number
      turnId: string
    }) => void
    sendNinaMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    )

    render(<ChatScreen {...baseProps()} />)
    await user.click(screen.getByText('Send'))

    const bubble = await screen.findByTestId('message')
    expect(bubble).toHaveAttribute('data-state', 'sending')
    expect(screen.getByText('hello nina')).toBeInTheDocument()

    resolveSend({
      ok: true,
      userMessageId: 'server-id-1',
      sessionId: 'session-1',
      cursor: 42,
      turnId: 'turn-1',
    })

    await waitFor(() => expect(screen.getByTestId('message')).toHaveAttribute('data-state', 'sent'))
    expect(sendNinaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'hello nina', sessionId: 'session-1' }),
    )
  })

  it('marks the bubble failed and shows a notice when the send is refused', async () => {
    const user = userEvent.setup()
    sendNinaMessage.mockResolvedValue({
      ok: false,
      userMessageId: null,
      sessionId: null,
      cursor: null,
      turnId: null,
    })

    render(<ChatScreen {...baseProps()} />)
    await user.click(screen.getByText('Send'))

    await waitFor(() =>
      expect(screen.getByTestId('message')).toHaveAttribute('data-state', 'failed'),
    )
    expect(
      screen.getByText('That didn’t send. Check your connection and try it again.'),
    ).toBeInTheDocument()
  })

  it('marks the bubble failed when the send action throws', async () => {
    const user = userEvent.setup()
    sendNinaMessage.mockRejectedValue(new Error('network drop'))

    render(<ChatScreen {...baseProps()} />)
    await user.click(screen.getByText('Send'))

    await waitFor(() =>
      expect(screen.getByTestId('message')).toHaveAttribute('data-state', 'failed'),
    )
  })

  it('opens the actions sheet for a confirmed message', async () => {
    const user = userEvent.setup()
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    expect(screen.getByTestId('actions-sheet')).toBeInTheDocument()
  })

  it('refuses to open the sheet for an unconfirmed row and shows the wait notice instead', async () => {
    const user = userEvent.setup()
    const sending: ChatMessage = {
      ...sentMessage(MSG_ID, 'hi'),
      state: 'sending',
    }
    render(<ChatScreen {...baseProps({ initial: [sending] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    expect(screen.queryByTestId('actions-sheet')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Give that one a moment to send — there is nothing to edit until Nina has it.',
      ),
    ).toBeInTheDocument()
  })

  it('deletes a confirmed message from the list on success', async () => {
    const user = userEvent.setup()
    removeNinaMessage.mockResolvedValue({ ok: true, deletedId: MSG_ID })
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    await user.click(screen.getByText('Delete'))

    await waitFor(() => expect(screen.queryByTestId('message')).not.toBeInTheDocument())
    expect(removeNinaMessage).toHaveBeenCalledWith({ messageId: MSG_ID })
  })

  it('shows a delete-failed notice and keeps the row when the delete is refused', async () => {
    const user = userEvent.setup()
    removeNinaMessage.mockResolvedValue({ ok: false, deletedId: null })
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    await user.click(screen.getByText('Delete'))

    await waitFor(() =>
      expect(
        screen.getByText(
          'That message could not be deleted. It is still here, and still in her context.',
        ),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('applies an edited body on success', async () => {
    const user = userEvent.setup()
    editNinaMessage.mockResolvedValue({ ok: true, body: 'edited body' })
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    await user.click(screen.getByText('Save edit'))

    await waitFor(() => expect(screen.getByText('edited body')).toBeInTheDocument())
    expect(editNinaMessage).toHaveBeenCalledWith({ messageId: MSG_ID, body: 'edited body' })
  })

  it('shows an edit-failed notice and leaves the body untouched on refusal', async () => {
    const user = userEvent.setup()
    editNinaMessage.mockResolvedValue({ ok: false, body: null })
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    await user.click(screen.getByText('Save edit'))

    await waitFor(() =>
      expect(
        screen.getByText('That edit didn’t save. The message is unchanged — try it again.'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('starts the typing indicator on a claimed resend', async () => {
    const user = userEvent.setup()
    resendNinaMessage.mockResolvedValue({ ok: true, reason: null, cursor: 99 })
    render(<ChatScreen {...baseProps({ initial: [sentMessage(MSG_ID, 'hi')] })} />)

    await user.click(screen.getByText(`actions:${MSG_ID}`))
    await user.click(screen.getByText('Resend'))

    await waitFor(() =>
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-typing', 'true'),
    )
    expect(resendNinaMessage).toHaveBeenCalledWith({ messageId: MSG_ID })
  })

  it('strips ?attach=, ?photo= and ?jump= off the URL on mount without touching ?s=', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    // useLayoutEffect reads window.location, not the mocked useSearchParams() — see the
    // component's own header on why — so the URL to strip has to be set here directly.
    window.history.pushState(null, '', '/nina?s=session-1&attach=run-1&photo=avatar:1&jump=m1')

    render(<ChatScreen {...baseProps()} />)

    expect(replaceState).toHaveBeenCalledTimes(1)
    const [, , url] = replaceState.mock.calls[0]!
    expect(String(url)).toBe('?s=session-1')
    replaceState.mockRestore()
  })
})
