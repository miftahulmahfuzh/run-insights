// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redoNinaImageJob, deleteNinaImageJob } = vi.hoisted(() => ({
  redoNinaImageJob: vi.fn(),
  deleteNinaImageJob: vi.fn(),
}))
vi.mock('@/lib/nina/jobActions', () => ({ redoNinaImageJob, deleteNinaImageJob }))

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
    canRedo: true,
    ...overrides,
  }
}

describe('NinaJobActions', () => {
  beforeEach(() => {
    redoNinaImageJob.mockReset().mockResolvedValue({ ok: true, reason: null })
    deleteNinaImageJob.mockReset().mockResolvedValue({ ok: true, reason: null })
  })

  it('the redo control names the ROW, not just the verb', () => {
    render(<NinaJobActions item={item()} />)
    // Six rows of "Coba lagi" is a list a screen reader cannot navigate.
    expect(screen.getByRole('button', { name: 'Coba lagi sore di kos' })).toBeInTheDocument()
  })

  it('the name falls back with the title, because they are one string', () => {
    render(<NinaJobActions item={item({ scene: null, purpose: 'avatar' })} />)
    expect(
      screen.getByRole('button', {
        name: `Coba lagi ${ninaJobTitle({ scene: null, purpose: 'avatar' })}`,
      }),
    ).toBeInTheDocument()
  })

  it('redo draws only where the server said a redo is possible; delete draws on EVERY row', () => {
    const failed = render(<NinaJobActions item={item()} />)
    expect(failed.getByRole('button', { name: 'Coba lagi sore di kos' })).toBeInTheDocument()
    expect(
      failed.getByRole('button', { name: 'Hapus sore di kos dari daftar' }),
    ).toBeInTheDocument()
    failed.unmount()

    // A done row: keep-the-list-tidy is about the whole list, so the trash is not gated at all.
    const done = render(<NinaJobActions item={item({ stage: 'done', canRedo: false })} />)
    expect(done.queryByRole('button', { name: /Coba lagi/ })).not.toBeInTheDocument()
    expect(done.getByRole('button', { name: 'Hapus sore di kos dari daftar' })).toBeInTheDocument()
  })

  it('both controls hold the 44px floor — the safeguard in a scrolling list', () => {
    render(<NinaJobActions item={item()} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('size-11')
    }
  })

  it('a redo asks to redo THIS job; success says nothing', async () => {
    const user = userEvent.setup()
    render(<NinaJobActions item={item()} />)
    await user.click(screen.getByRole('button', { name: 'Coba lagi sore di kos' }))

    await waitFor(() => expect(redoNinaImageJob).toHaveBeenCalledWith({ jobId: 'job-1' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('each refusal says its own sentence, announced as a status', async () => {
    const user = userEvent.setup()
    redoNinaImageJob.mockResolvedValue({ ok: false, reason: 'capped' })
    render(<NinaJobActions item={item()} />)
    await user.click(screen.getByRole('button', { name: 'Coba lagi sore di kos' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Jatah foto hari ini sudah habis. Coba lagi besok ya.',
    )
  })

  it('delete refuses with the same words whichever button asked', async () => {
    const user = userEvent.setup()
    deleteNinaImageJob.mockResolvedValue({ ok: false, reason: 'not-found' })
    render(<NinaJobActions item={item({ stage: 'done', canRedo: false })} />)
    await user.click(screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Job ini sudah nggak ada.')
  })

  it('a new attempt clears the previous refusal', async () => {
    const user = userEvent.setup()
    redoNinaImageJob.mockResolvedValueOnce({ ok: false, reason: 'capped' })
    render(<NinaJobActions item={item()} />)
    await user.click(screen.getByRole('button', { name: 'Coba lagi sore di kos' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Coba lagi sore di kos' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('while the action is in flight both controls go busy and refuse a second tap', async () => {
    const user = userEvent.setup()
    const flight = deferred()
    redoNinaImageJob.mockReturnValue(flight.promise)
    render(<NinaJobActions item={item()} />)
    const redo = screen.getByRole('button', { name: 'Coba lagi sore di kos' })
    const trash = screen.getByRole('button', { name: 'Hapus sore di kos dari daftar' })

    await user.click(redo)
    await waitFor(() => expect(redo).toBeDisabled())
    expect(redo).toHaveAttribute('aria-busy', 'true')
    // `pending` is shared: the trash cannot fire a second mutation mid-flight either.
    expect(trash).toBeDisabled()

    await act(async () => {
      flight.resolve({ ok: true, reason: null })
    })
    await waitFor(() => expect(redo).toBeEnabled())
    expect(redoNinaImageJob).toHaveBeenCalledTimes(1)
    expect(deleteNinaImageJob).not.toHaveBeenCalled()
  })
})
