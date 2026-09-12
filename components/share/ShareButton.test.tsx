// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createShareLinkAction } = vi.hoisted(() => ({ createShareLinkAction: vi.fn() }))
// The mint is a Server Action with an auth boundary and a database behind it. Every behaviour under
// test here is the button's contract ABOUT that action — when it warms, that it never doubles —
// not the action itself.
vi.mock('@/app/actions/share', () => ({ createShareLinkAction }))

import { ShareButton } from './ShareButton'
import { SHARE_COPIED, SHARE_COPY_FAILED, SHARE_TITLE } from '@/lib/share/copy'

/**
 * The button's hard problem, from its own header comment, is transient activation: the mint starts
 * on `pointerdown` so that `navigator.share()` is reached while the gesture is still alive, and
 * every failure has a next rung — share → clipboard → the link on screen — with `AbortError`
 * (a closed share sheet) as the one outcome that must produce SILENCE. The tests pin the ladder:
 * each rung is reached only when the one above it failed, the tick and the live region both say
 * "Copied", and the tick expires so the row reads as a share button again.
 */

const LIVE_URL = 'https://runinsights.example/s/tok-1'
const MINTED_URL = 'https://runinsights.example/s/tok-2'

const clipboardWrite = vi.fn()

function stubNavigatorShare(impl?: (...args: unknown[]) => Promise<void>) {
  if (impl) {
    Object.defineProperty(window.navigator, 'share', { value: vi.fn(impl), configurable: true })
  } else {
    // Deleting the own property restores whatever the platform had (nothing, in happy-dom) —
    // the `typeof navigator.share === 'function'` guard then routes to the clipboard rung.
    delete (window.navigator as { share?: unknown }).share
  }
}

function shareButton() {
  return screen.getByRole('button', { name: new RegExp(`^(${SHARE_TITLE}|${SHARE_COPIED})$`) })
}

async function click() {
  fireEvent.click(shareButton())
  await act(async () => {})
  await act(async () => {})
}

beforeEach(() => {
  createShareLinkAction.mockReset()
  clipboardWrite.mockReset()
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboardWrite },
    configurable: true,
  })
  stubNavigatorShare()
})

afterEach(() => {
  delete (window.navigator as { share?: unknown }).share
  delete (window.navigator as { clipboard?: unknown }).clipboard
  vi.useRealTimers()
})

describe('ShareButton — the happy path', () => {
  it('an already-shared run reaches navigator.share with nothing to await, and never mints', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigatorShare(share)
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    await click()

    expect(share).toHaveBeenCalledWith({ title: 'A run', url: LIVE_URL })
    expect(createShareLinkAction).not.toHaveBeenCalled()
    // No title/text beside the URL — WhatsApp renders its own preview card from the link.
    expect(share.mock.calls[0][0]).not.toHaveProperty('text')
  })

  it('an unshared run warms the mint on pointerdown, and the click spends the SAME promise — one action call', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigatorShare(share)
    createShareLinkAction.mockResolvedValue({ ok: true, token: 'tok-2', url: MINTED_URL })
    render(<ShareButton runId="run-1" url={null} />)

    fireEvent.pointerDown(shareButton())
    expect(createShareLinkAction).toHaveBeenCalledTimes(1) // the warm is the ask

    fireEvent.click(shareButton())
    await act(async () => {})
    await act(async () => {})

    expect(createShareLinkAction).toHaveBeenCalledTimes(1) // …and only ever one
    expect(share).toHaveBeenCalledWith({ title: 'A run', url: MINTED_URL })
  })

  it('keyboard focus warms the mint too — tabbing to the button is also a gesture on the way', () => {
    createShareLinkAction.mockResolvedValue({ ok: true, token: 'tok-2', url: MINTED_URL })
    render(<ShareButton runId="run-1" url={null} />)

    fireEvent.focus(shareButton())

    expect(createShareLinkAction).toHaveBeenCalledTimes(1)
  })

  it('a browser without the share API goes straight to the clipboard and says Copied twice', async () => {
    // No `share` stub: happy-dom has none, exactly like a browser without the API.
    clipboardWrite.mockResolvedValue(undefined)
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    await click()

    expect(clipboardWrite).toHaveBeenCalledWith(LIVE_URL)
    expect(shareButton()).toHaveAttribute('aria-label', SHARE_COPIED)
    expect(screen.getByRole('status')).toHaveTextContent(SHARE_COPIED)
  })

  it('while in flight the button disables itself and announces busy — then comes back', async () => {
    let resolve!: () => void
    stubNavigatorShare(() => new Promise<void>((res) => (resolve = res)))
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    fireEvent.click(shareButton())
    await act(async () => {})

    expect(shareButton()).toBeDisabled()
    expect(shareButton()).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      resolve()
    })
    await act(async () => {})

    expect(shareButton()).toBeEnabled()
    expect(shareButton()).toHaveAttribute('aria-busy', 'false')
  })
})

describe('ShareButton — the AbortError is not an error', () => {
  it('dismissing the share sheet produces SILENCE: no clipboard write, no tick, no manual link', async () => {
    const abort = Object.assign(new Error('user dismissed'), { name: 'AbortError' })
    stubNavigatorShare(vi.fn().mockRejectedValue(abort))
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    await click()

    expect(clipboardWrite).not.toHaveBeenCalled()
    expect(shareButton()).toHaveAttribute('aria-label', SHARE_TITLE)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByText(SHARE_COPY_FAILED)).not.toBeInTheDocument()
  })
})

describe('ShareButton — the clipboard rung', () => {
  it('a share failure that is NOT an abort falls through to the clipboard', async () => {
    stubNavigatorShare(vi.fn().mockRejectedValue(new Error('NotAllowedError-ish')))
    clipboardWrite.mockResolvedValue(undefined)
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    await click()

    expect(clipboardWrite).toHaveBeenCalledWith(LIVE_URL)
    expect(screen.getByRole('status')).toHaveTextContent(SHARE_COPIED)
  })

  it('the Copied tick expires after two seconds so the row reads as a share button again', async () => {
    vi.useFakeTimers()
    clipboardWrite.mockResolvedValue(undefined)
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    fireEvent.click(shareButton())
    await act(async () => {})
    await act(async () => {})
    expect(shareButton()).toHaveAttribute('aria-label', SHARE_COPIED)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(shareButton()).toHaveAttribute('aria-label', SHARE_TITLE)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('ShareButton — the last rung: the link on screen', () => {
  it('a refused clipboard with a URL in hand puts the link in a read-only, selectable field', async () => {
    clipboardWrite.mockRejectedValue(new Error('insecure context'))
    render(<ShareButton runId="run-1" url={LIVE_URL} />)

    await click()

    expect(screen.getByText(SHARE_COPY_FAILED)).toBeInTheDocument()
    const field = screen.getByLabelText('Share link')
    expect(field).toHaveValue(LIVE_URL)
    // readOnly, never disabled: a disabled input cannot be selected, which would defeat the point.
    expect(field).toHaveAttribute('readonly')
    expect(field).not.toBeDisabled()
  })

  it('a mint that failed too still says something — the red sentence, never a dead end', async () => {
    createShareLinkAction.mockResolvedValue({ ok: false, error: 'failed' })
    clipboardWrite.mockRejectedValue(new Error('no clipboard'))
    render(<ShareButton runId="run-1" url={null} />)

    await click()

    expect(screen.getByText(SHARE_COPY_FAILED)).toBeInTheDocument()
    expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument()
  })
})
