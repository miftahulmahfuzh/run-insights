// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setNinaChatSessionPinned, renameNinaChatSession, removeNinaChatSession } = vi.hoisted(
  () => ({
    setNinaChatSessionPinned: vi.fn(),
    renameNinaChatSession: vi.fn(),
    removeNinaChatSession: vi.fn(),
  }),
)
vi.mock('@/lib/nina/sessionActions', () => ({
  setNinaChatSessionPinned,
  renameNinaChatSession,
  removeNinaChatSession,
}))

const { routerReplace, routerRefresh } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}))

// Real planSessionRemoval (the server's `next` → navigate-or-refresh mapping is the contract under
// test), real Button/Field (the mis-tap guards live in there), real pure collaborators throughout.
import { SessionRow } from './SessionRow'
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'
import type { SidebarSession } from '@/lib/nina/sidebar'

type Outcome = { ok: boolean; next: string | null }

function deferred() {
  let resolve!: (value: Outcome) => void
  const promise = new Promise<Outcome>((res) => (resolve = res))
  return { promise, resolve }
}

function session(overrides?: Partial<SidebarSession>): SidebarSession {
  return {
    id: 'sess-1',
    title: 'Morning runs',
    href: '/nina?s=sess-1',
    pinned: false,
    dayLabel: 'Today',
    ...overrides,
  }
}

function renderRow(overrides?: {
  session?: Partial<SidebarSession>
  active?: boolean
  activeSessionId?: string | null
}) {
  const onClose = vi.fn()
  const utils = render(
    <SessionRow
      session={session(overrides?.session)}
      active={overrides?.active ?? false}
      activeSessionId={overrides?.activeSessionId ?? null}
      onClose={onClose}
    />,
  )
  return { ...utils, onClose }
}

function disclosure() {
  return screen.getByRole('button', { name: 'Aksi untuk Morning runs' })
}

function openMenu() {
  // Returns nothing; the caller asserts on the menu buttons it exposes.
  return disclosure()
}

describe('SessionRow', () => {
  beforeEach(() => {
    setNinaChatSessionPinned.mockReset().mockResolvedValue({ ok: true, next: null })
    renameNinaChatSession.mockReset().mockResolvedValue({ ok: true, next: null })
    removeNinaChatSession.mockReset().mockResolvedValue({ ok: true, next: null })
    routerReplace.mockReset()
    routerRefresh.mockReset()
  })

  it('an inactive row is a link to its chat, titled and day-stamped', () => {
    renderRow()
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/nina?s=sess-1')
    expect(link.textContent).toContain('Morning runs')
    expect(link.textContent).toContain('Today')
  })

  it('a session with nothing said yet carries no day', () => {
    renderRow({ session: { dayLabel: null } })
    expect(screen.getByRole('link').textContent).not.toContain('Today')
  })

  it('the active row is a button that says Open and closes the panel — it never navigates', async () => {
    const user = userEvent.setup()
    const { onClose } = renderRow({ active: true, activeSessionId: 'sess-1' })
    const current = screen.getByRole('button', { current: 'page' })
    expect(current.textContent).toContain('Open')
    expect(screen.queryByRole('link')).toBeNull()

    await user.click(current)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the pin STATE rides the title; a dayless unpinned row draws no state glyph', () => {
    const { container: pinned } = renderRow({ session: { pinned: true } })
    expect(pinned.querySelector('a')?.querySelector('svg')).not.toBeNull()

    const { container: unpinned } = renderRow({ session: { pinned: false, dayLabel: null } })
    expect(unpinned.querySelector('a')?.querySelector('svg')).toBeNull()
  })

  it('the disclosure opens the menu and toggles closed', async () => {
    const user = userEvent.setup()
    renderRow()
    expect(disclosure().getAttribute('aria-expanded')).toBe('false')

    await user.click(disclosure())
    expect(disclosure().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Pin ke atas' })).toBeInTheDocument()

    await user.click(disclosure())
    expect(disclosure().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Pin ke atas' })).not.toBeInTheDocument()
  })

  it('the pin action’s name tracks the row’s state, verbatim from the words it replaced', async () => {
    const user = userEvent.setup()
    const unpinned = renderRow({ session: { pinned: false } })
    await user.click(disclosure())
    expect(screen.getByRole('button', { name: 'Pin ke atas' })).toBeInTheDocument()
    unpinned.unmount()

    const pinned = renderRow({ session: { pinned: true } })
    await user.click(disclosure())
    expect(screen.getByRole('button', { name: 'Lepas pin' })).toBeInTheDocument()
    pinned.unmount()
  })

  it('pinning asks the server to flip THIS row, then refreshes — no local re-sort', async () => {
    const user = userEvent.setup()
    renderRow({ session: { pinned: false } })
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Pin ke atas' }))

    await waitFor(() =>
      expect(setNinaChatSessionPinned).toHaveBeenCalledWith({ sessionId: 'sess-1', pinned: true }),
    )
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(disclosure().getAttribute('aria-expanded')).toBe('false'))
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it('a refused action leaves the menu open with the row’s own sentence in it', async () => {
    const user = userEvent.setup()
    setNinaChatSessionPinned.mockResolvedValue({ ok: false, next: null })
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Pin ke atas' }))

    expect(await screen.findByText('Tidak bisa. Coba nama lain.')).toBeInTheDocument()
    expect(disclosure().getAttribute('aria-expanded')).toBe('true')
  })

  it('rename opens prefilled with the current title, at the shared cap', async () => {
    const user = userEvent.setup()
    renderRow({ session: { title: 'Morning runs' } })
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Ganti nama' }))

    const input = screen.getByLabelText('Nama chat') as HTMLInputElement
    expect(input.value).toBe('Morning runs')
    expect(input.getAttribute('maxlength')).toBe(String(NINA_SESSION_TITLE_MAX_CHARS))
  })

  it('the rename ✕ empties the field and the keyboard never folds', async () => {
    const user = userEvent.setup()
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Ganti nama' }))
    const input = screen.getByLabelText('Nama chat') as HTMLInputElement
    expect(screen.getByRole('button', { name: 'Kosongkan nama' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kosongkan nama' }))
    expect(input.value).toBe('')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Kosongkan nama' })).not.toBeInTheDocument()
  })

  it('saving calls the rename action with the draft, then refreshes and closes', async () => {
    const user = userEvent.setup()
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Ganti nama' }))

    const input = screen.getByLabelText('Nama chat') as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(renameNinaChatSession).toHaveBeenCalledWith({ sessionId: 'sess-1', title: 'Renamed' }),
    )
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByLabelText('Nama chat')).not.toBeInTheDocument())
  })

  it('a refused rename renders the sentence where a form error reads, and stays open', async () => {
    const user = userEvent.setup()
    renameNinaChatSession.mockResolvedValue({ ok: false, next: null })
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Ganti nama' }))
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText('Tidak bisa. Coba nama lain.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nama chat')).toBeInTheDocument()
  })

  it('Batal goes back to the menu, not to idle — the disclosure still reads open', async () => {
    const user = userEvent.setup()
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Ganti nama' }))
    await user.click(screen.getByRole('button', { name: 'Batal' }))

    expect(screen.queryByLabelText('Nama chat')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin ke atas' })).toBeInTheDocument()
    expect(disclosure().getAttribute('aria-expanded')).toBe('true')
  })

  it('removal reports which session the URL is showing, not the row’s own opinion', async () => {
    const user = userEvent.setup()
    renderRow({ activeSessionId: 'sess-9' })
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Hapus' }))

    await waitFor(() =>
      expect(removeNinaChatSession).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        activeSessionId: 'sess-9',
      }),
    )
  })

  it('a removal with a destination replaces this entry with the bare /nina', async () => {
    const user = userEvent.setup()
    removeNinaChatSession.mockResolvedValue({ ok: true, next: '/nina' })
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Hapus' }))

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/nina'))
    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it('a removal that lands nowhere refreshes instead — same panel, fresh list', async () => {
    const user = userEvent.setup()
    removeNinaChatSession.mockResolvedValue({ ok: true, next: null })
    renderRow()
    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Hapus' }))

    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1))
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it('while a mutation is in flight its button is disabled — the one guard a one-tap delete gets', async () => {
    const user = userEvent.setup()
    const flight = deferred()
    removeNinaChatSession.mockReturnValue(flight.promise)
    renderRow()
    await user.click(disclosure())
    const hapus = screen.getByRole('button', { name: 'Hapus' })
    await user.click(hapus)

    await waitFor(() => expect(hapus).toBeDisabled())
    expect(removeNinaChatSession).toHaveBeenCalledTimes(1)
    // A second tap inside the round trip fires nothing.
    await user.click(hapus)
    expect(removeNinaChatSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      flight.resolve({ ok: true, next: null })
    })
    // Success closes the menu — the fresh DOM is the proof the transition ended; the `hapus`
    // node above is detached by that same re-render, so it can no longer report enabled.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Hapus' })).not.toBeInTheDocument(),
    )
    expect(removeNinaChatSession).toHaveBeenCalledTimes(1)
  })
})
