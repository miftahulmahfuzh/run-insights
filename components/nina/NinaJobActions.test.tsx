// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteNinaImageJob } = vi.hoisted(() => ({
  deleteNinaImageJob: vi.fn(),
}))
vi.mock('@/lib/nina/jobActions', () => ({ deleteNinaImageJob }))

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// Real `ninaJobTitle`: the accessible name must be the SAME string the row renders — that one
// string shared between two renderers is the whole point of this component's naming rule.
import { NinaJobActions } from './NinaJobActions'
import { ninaJobTitle, type NinaJobListItem } from '@/lib/nina/jobview'

type Outcome = { ok: boolean; reason: string | null }

function deferred() {
  let resolve!: (value: Outcome) => void
  const promise = new Promise<Outcome>((res) => (resolve = res))
  return { promise, resolve }
}

const READY_PHOTO = {
  kind: 'ready' as const,
  href: '/nina/about?photo=chat.img-1&return=%2Fnina%2Fjobs',
}

function item(overrides?: Partial<NinaJobListItem>): NinaJobListItem {
  return {
    id: 'job-1',
    href: '/nina/jobs?jump=job-1',
    stage: 'failed',
    stageLabel: 'Gagal',
    purpose: 'selfie',
    scene: 'sore di kos',
    attempts: 1,
    createdAtMs: 1_790_000_000_000,
    errorLabel: 'model overload',
    latencyMs: null,
    open: false,
    photo: READY_PHOTO,
    ...overrides,
  }
}

/**
 * `NinaJobList.tsx` puts `id={`nina-job-${item.id}`}` on the `<li>` that wraps this component in
 * production — `readJobAnchorRows` (`useJobListScroll.ts`) queries for exactly that prefix. This
 * component's own tests render it standalone, so the wrapper is reproduced here rather than
 * mocking the DOM read: the real contract between the two files is worth exercising, on
 * `useChatScroll.test.tsx`'s own precedent of real `nina-msg-` elements over a mocked query.
 */
function renderRow(row: NinaJobListItem) {
  return render(
    <li id={`nina-job-${row.id}`}>
      <NinaJobActions item={row} />
    </li>,
  )
}

describe('NinaJobActions', () => {
  beforeEach(() => {
    deleteNinaImageJob.mockReset().mockResolvedValue({ ok: true, reason: null })
    push.mockReset()
  })

  it('the full-view link names the ROW, not just the verb', () => {
    renderRow(item())
    // Six rows of "Lihat foto ukuran penuh" is a list a screen reader cannot navigate.
    expect(
      screen.getByRole('link', { name: 'Lihat foto ukuran penuh sore di kos' }),
    ).toBeInTheDocument()
  })

  it('the name falls back with the title, because they are one string', () => {
    renderRow(item({ scene: null, purpose: 'avatar' }))
    expect(
      screen.getByRole('link', {
        name: `Lihat foto ukuran penuh ${ninaJobTitle({ scene: null, purpose: 'avatar' })}`,
      }),
    ).toBeInTheDocument()
  })

  it('the full-view link draws only where the server resolved a photo; delete draws on EVERY row', () => {
    const ready = renderRow(item())
    expect(
      ready.getByRole('link', { name: 'Lihat foto ukuran penuh sore di kos' }),
    ).toBeInTheDocument()
    expect(ready.getByRole('button', { name: 'Hapus sore di kos dari daftar' })).toBeInTheDocument()
    ready.unmount()

    // A job still drawing, or one whose photograph never landed: keep-the-list-tidy is about the
    // whole list, so the trash is not gated at all.
    const none = renderRow(item({ photo: { kind: 'none' } }))
    expect(none.queryByRole('link', { name: /Lihat foto ukuran penuh/ })).not.toBeInTheDocument()
    expect(none.getByRole('button', { name: 'Hapus sore di kos dari daftar' })).toBeInTheDocument()
  })

  it('the full-view link’s href is still the plain resolved photo href — a fallback for a new-tab tap', () => {
    // The click handler intercepts a plain click and pushes a widened href instead (see below);
    // the anchor's OWN href stays the unwidened one, so a middle-click / cmd-click — which this
    // component deliberately leaves alone — opens exactly the link the server resolved.
    renderRow(item())
    expect(
      screen.getByRole('link', { name: 'Lihat foto ukuran penuh sore di kos' }),
    ).toHaveAttribute('href', READY_PHOTO.href)
  })

  it('both controls hold the 44px floor — the safeguard in a scrolling list', () => {
    renderRow(item())
    expect(screen.getByRole('link', { name: /Lihat foto ukuran penuh/ }).className).toContain(
      'size-11',
    )
    expect(screen.getByRole('button', { name: /Hapus/ }).className).toContain('size-11')
  })

  it('a plain click widens the href with a scroll mark and pushes it, instead of following the anchor', async () => {
    const user = userEvent.setup()
    renderRow(item())
    await user.click(screen.getByRole('link', { name: 'Lihat foto ukuran penuh sore di kos' }))

    // happy-dom lays nothing out, so the row's rect.top is 0 and window.scrollY is 0 — the anchor
    // is the row itself, at offset 0, which is exactly what `pickJobListScrollAnchor` picks when
    // there is one row sitting at the viewport's top edge.
    expect(push).toHaveBeenCalledTimes(1)
    const pushed = new URL(push.mock.calls[0]![0] as string, 'https://example.test')
    expect(pushed.pathname).toBe('/nina/about')
    const returnValue = pushed.searchParams.get('return')!
    const returnUrl = new URL(returnValue, 'https://example.test')
    expect(returnUrl.pathname).toBe('/nina/jobs')
    expect(returnUrl.searchParams.get('at')).toBe('job-1~0')
  })

  it('a modified click (new-tab tap) is left alone — router.push never fires', () => {
    // `userEvent.click`'s options have no modifier-key shape for this; `fireEvent` sets the raw
    // DOM event property directly, which is exactly what the handler reads.
    renderRow(item())
    fireEvent.click(screen.getByRole('link', { name: 'Lihat foto ukuran penuh sore di kos' }), {
      ctrlKey: true,
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('delete asks to delete THIS job; success says nothing', async () => {
    const user = userEvent.setup()
    renderRow(item())
    await user.click(screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' }))

    await waitFor(() => expect(deleteNinaImageJob).toHaveBeenCalledWith({ jobId: 'job-1' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('delete refuses with the same words whichever screen asked', async () => {
    const user = userEvent.setup()
    deleteNinaImageJob.mockResolvedValue({ ok: false, reason: 'not-found' })
    renderRow(item())
    await user.click(screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Job ini sudah nggak ada.')
  })

  it('a new attempt clears the previous refusal', async () => {
    const user = userEvent.setup()
    deleteNinaImageJob.mockResolvedValueOnce({ ok: false, reason: 'not-found' })
    renderRow(item())
    await user.click(screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()

    deleteNinaImageJob.mockResolvedValueOnce({ ok: true, reason: null })
    await user.click(screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('while delete is in flight the trash goes busy and refuses a second tap', async () => {
    const user = userEvent.setup()
    const flight = deferred()
    deleteNinaImageJob.mockReturnValue(flight.promise)
    renderRow(item())
    const trash = screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' })

    await user.click(trash)
    await waitFor(() => expect(trash).toBeDisabled())
    expect(trash).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      flight.resolve({ ok: true, reason: null })
    })
    await waitFor(() => expect(trash).toBeEnabled())
    expect(deleteNinaImageJob).toHaveBeenCalledTimes(1)
  })
})
