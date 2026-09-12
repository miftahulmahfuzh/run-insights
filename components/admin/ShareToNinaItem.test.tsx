// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ShareToNinaItem } from './ShareToNinaItem'
import { ensureNinaAvatarDescriptionAction } from '@/lib/admin/ninaAlbumActions'

/*
 * The describe action is mocked (a Server Action); the URL builder is REAL, so the share link is
 * pinned through the one formatter that owns the grammar rather than a hand-typed string. The
 * component's four-sentence spec — new tab, not this tab; describe fired not awaited; arms the
 * composer, sends nothing — is what every test below names.
 */
vi.mock('@/lib/admin/ninaAlbumActions', () => ({
  ensureNinaAvatarDescriptionAction: vi.fn(),
}))

const ensureDescribe = vi.mocked(ensureNinaAvatarDescriptionAction)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function item(props?: Partial<Parameters<typeof ShareToNinaItem>[0]>) {
  return render(
    <ShareToNinaItem photoId="ph_123" described shareOrigin="https://runins.site" {...props} />,
  )
}

const openSpy = () => vi.spyOn(window, 'open').mockReturnValue(null)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ShareToNinaItem', () => {
  it('is one button named "Share link to Nina", holding the send glyph', () => {
    const open = openSpy()
    item()
    const button = screen.getByRole('button', { name: 'Share link to Nina' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('title', 'Share link to Nina')
    expect(button.querySelector('svg')).toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()
  })

  it('borrows the squared secondary icon-button look — `w-11 px-0`, closed to the host', () => {
    openSpy()
    item()
    const button = screen.getByRole('button', { name: 'Share link to Nina' })
    expect(button).toHaveClass('w-11', 'px-0')
  })

  it('opens the chat in a NEW tab with noopener — the whole security posture in three arguments', async () => {
    const user = userEvent.setup()
    const open = openSpy()
    item()
    await user.click(screen.getByRole('button', { name: 'Share link to Nina' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(
      'https://runins.site/nina?photo=avatar%3Aph_123',
      '_blank',
      'noopener',
    )
  })

  it('builds the pointer through the shared formatter — a kind and an id, nothing else', async () => {
    // The URL is pinned through the real `ninaPhotoShareUrl`, so a change in the admin->nina
    // grammar fails HERE (the writer) as loudly as it would on the parsing side.
    const user = userEvent.setup()
    const open = openSpy()
    item({ photoId: 'abc123' })
    await user.click(screen.getByRole('button', { name: 'Share link to Nina' }))
    expect(open.mock.calls[0]![0]!).toBe('https://runins.site/nina?photo=avatar%3Aabc123')
  })

  it('never reads window.location — the origin arrives as a prop from the server', async () => {
    // A component that fell back to window.location would work in dev and break on every
    // preview deployment. Passing a nonsense origin proves the prop is the only source.
    const user = userEvent.setup()
    const open = openSpy()
    item({ shareOrigin: 'https://origin-from-server.example' })
    await user.click(screen.getByRole('button', { name: 'Share link to Nina' }))
    expect(
      String(open.mock.calls[0]![0]!).startsWith('https://origin-from-server.example/nina'),
    ).toBe(true)
  })

  it('does not fire the describe for a photo that already has one', async () => {
    const user = userEvent.setup()
    const open = openSpy()
    item({ described: true })
    await user.click(screen.getByRole('button', { name: 'Share link to Nina' }))
    expect(ensureDescribe).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('fires the describe for an undescribed photo, and does NOT await it before opening the tab', async () => {
    // The transient-activation contract: the tab opens inside the click even though the ~8-11 s
    // vendor call is still on the wire. A pending promise proves the open is not gated on it.
    const user = userEvent.setup()
    const open = openSpy()
    const gate = deferred<{ ok: true }>()
    ensureDescribe.mockReturnValue(gate.promise)
    item({ described: false })
    await user.click(screen.getByRole('button', { name: 'Share link to Nina' }))
    expect(ensureDescribe).toHaveBeenCalledWith('ph_123')
    expect(open).toHaveBeenCalledTimes(1)

    await act(async () => {
      gate.resolve({ ok: true })
    })
  })

  it('shows busy state while the describe transition runs, then the send glyph again', async () => {
    const user = userEvent.setup()
    openSpy()
    const gate = deferred<{ ok: true }>()
    ensureDescribe.mockReturnValue(gate.promise)
    item({ described: false })
    const button = screen.getByRole('button', { name: 'Share link to Nina' })

    await user.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    // LoadingDots is three pulsing spans, NOT an svg — the send glyph is genuinely gone while
    // the describe runs, which is the visible difference this state exists for.
    expect(button.querySelector('svg')).toBeNull()

    await act(async () => {
      gate.resolve({ ok: true })
    })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('stays idle — never aria-busy — when there is nothing to describe', async () => {
    const user = userEvent.setup()
    openSpy()
    item({ described: true })
    const button = screen.getByRole('button', { name: 'Share link to Nina' })
    await user.click(button)
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('logs a failed describe and moves on — the tab is already open, a toast would be noise', async () => {
    const user = userEvent.setup()
    const open = openSpy()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    ensureDescribe.mockResolvedValue({ ok: false, error: 'vendor down' })
    item({ described: false })
    await user.click(screen.getByRole('button', { name: 'Share link to Nina' }))

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(open).toHaveBeenCalledTimes(1)
    // The failure never surfaces as UI: the button simply returns to rest.
    await act(async () => {})
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Share link to Nina' })).not.toHaveAttribute(
        'aria-busy',
      ),
    )
  })
})
