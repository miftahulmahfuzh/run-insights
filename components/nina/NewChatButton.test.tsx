// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createNinaChatSession } = vi.hoisted(() => ({ createNinaChatSession: vi.fn() }))
vi.mock('@/lib/nina/sessionActions', () => ({ createNinaChatSession }))

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }))

// Real useTransition: the pending disc's aria-busy + disabled pair is this component's whole
// in-flight story, and faking the transition would fake exactly the state under test.
import { NewChatButton } from './NewChatButton'

type CreateResult = { ok: boolean; sessionId: string | null; next: string | null }

function deferred() {
  let resolve!: (value: CreateResult) => void
  const promise = new Promise<CreateResult>((res) => (resolve = res))
  return { promise, resolve }
}

function disc() {
  return screen.getByRole('button', { name: 'Chat baru' })
}

describe('NewChatButton', () => {
  beforeEach(() => {
    createNinaChatSession.mockReset()
    routerReplace.mockReset()
  })

  it('is a 44px disc on the chrome skin, named for the rail', () => {
    render(<NewChatButton onNavigate={() => {}} />)
    const button = disc()
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    // `size-11` is the rail's 44px floor — the pair's own 32px exception does NOT travel here.
    expect(button.className).toContain('size-11')
    expect(button.className).toContain('backdrop-blur-md')
    expect(button.getAttribute('aria-busy')).toBe('false')
  })

  it('a successful create replaces the entry with the action’s destination', async () => {
    const user = userEvent.setup()
    createNinaChatSession.mockResolvedValue({
      ok: true,
      sessionId: 'sess-1',
      next: '/nina?s=sess-1',
    })
    const onNavigate = vi.fn()
    render(<NewChatButton onNavigate={onNavigate} />)

    await user.click(disc())
    await waitFor(() => expect(routerReplace).toHaveBeenCalledTimes(1))
    // `replace`, not `push`: the pushed `?sidebar=1` must die with the gesture, not gain a twin.
    expect(routerReplace).toHaveBeenCalledWith('/nina?s=sess-1')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('a refused create closes the sidebar instead of navigating into nothing', async () => {
    const user = userEvent.setup()
    createNinaChatSession.mockResolvedValue({ ok: false, sessionId: null, next: null })
    const onNavigate = vi.fn()
    render(<NewChatButton onNavigate={onNavigate} />)

    await user.click(disc())
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1))
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it('an ok with no destination is the same close — there is nothing to navigate to', async () => {
    const user = userEvent.setup()
    createNinaChatSession.mockResolvedValue({ ok: true, sessionId: null, next: null })
    const onNavigate = vi.fn()
    render(<NewChatButton onNavigate={onNavigate} />)

    await user.click(disc())
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1))
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it('while the action is in flight the disc announces busy and refuses a second tap', async () => {
    const user = userEvent.setup()
    const flight = deferred()
    createNinaChatSession.mockReturnValue(flight.promise)
    render(<NewChatButton onNavigate={() => {}} />)

    await user.click(disc())
    // Pending was a sentence on the row; on the disc it is this pair.
    await waitFor(() => expect(disc()).toHaveAttribute('aria-busy', 'true'))
    expect(disc()).toBeDisabled()
    expect(createNinaChatSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      flight.resolve({ ok: true, sessionId: 'sess-9', next: '/nina?s=sess-9' })
    })
    await waitFor(() => expect(disc()).toHaveAttribute('aria-busy', 'false'))
    expect(disc()).toBeEnabled()
    expect(routerReplace).toHaveBeenCalledWith('/nina?s=sess-9')
  })

  it('the button is a plus', () => {
    const { container } = render(<NewChatButton onNavigate={() => {}} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
